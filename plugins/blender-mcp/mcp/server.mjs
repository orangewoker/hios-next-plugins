import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { dirname, relative, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const blender = process.env.HIOS_BLENDER_EXECUTABLE || 'D:\\sf\\blender-5.1.1\\blender.exe';
const workspace = resolve(process.env.HIOS_BLENDER_WORKSPACE || resolve(process.cwd(), 'blender-workspace'));

function inside(root, target) {
  const value = relative(resolve(root), resolve(target));
  return !value || (!value.startsWith('..') && !value.startsWith('\\') && !value.startsWith('/'));
}
function safePath(value, fallback) {
  const target = resolve(value || fallback);
  if (!inside(workspace, target)) throw new Error('路径必须位于 Blender MCP 工作区内');
  return target;
}
function pythonPath(value) { return String(value).replaceAll('\\', '\\\\'); }
async function run(args, timeout = 180000) {
  if (!existsSync(blender)) throw new Error('找不到 Blender：' + blender);
  try { return await execFileAsync(blender, args, { windowsHide: true, timeout, maxBuffer: 8 * 1024 * 1024 }); }
  catch (error) { throw new Error(String(error?.stderr || error?.stdout || error?.message || error).slice(-6000)); }
}

const server = new McpServer({ name: 'hios-blender-mcp', version: '0.1.0' });

server.registerTool('status', {
  description: 'Check the configured Blender executable and workspace.', inputSchema: {},
}, async () => ({ content: [{ type: 'text', text: JSON.stringify({ ok: existsSync(blender), blender, workspace }, null, 2) }], isError: !existsSync(blender) }));

server.registerTool('execute_script', {
  description: 'Execute complete Blender Python, validate non-empty geometry, save a real .blend, and optionally render a preview.',
  inputSchema: { script: z.string().min(20), outputDirectory: z.string().optional(), fileName: z.string().optional(), renderPreview: z.boolean().default(true) },
}, async ({ script, outputDirectory, fileName, renderPreview }) => {
  const dir = safePath(outputDirectory, resolve(workspace, 'tasks', Date.now().toString()));
  mkdirSync(dir, { recursive: true });
  const safeName = (fileName || 'model.blend').replace(/[^a-zA-Z0-9._\u4e00-\u9fa5-]/g, '_');
  const blendPath = safePath(resolve(dir, safeName), resolve(dir, 'model.blend'));
  const previewPath = resolve(dir, 'preview.png');
  const scriptPath = resolve(dir, 'build_model.py');
  const logPath = resolve(dir, 'blender.log');
  const validation = [
    '', 'import bpy, math',
    "renderables=[o for o in bpy.context.scene.objects if o.type in {'MESH','CURVE','SURFACE','META','FONT'}]",
    "vertices=sum(len(o.data.vertices) for o in renderables if o.type=='MESH' and hasattr(o.data,'vertices'))",
    "if not renderables or vertices < 3: raise RuntimeError('HIOS_VALIDATE: scene has no valid renderable geometry')",
    "bpy.context.scene.unit_settings.system='METRIC'",
    ...(renderPreview ? [
      "if not bpy.context.scene.camera:",
      "    bpy.ops.object.camera_add(location=(4,-4,3), rotation=(math.radians(67),0,math.radians(43)))",
      "    bpy.context.scene.camera=bpy.context.object",
      "bpy.context.scene.render.engine='BLENDER_EEVEE'",
      "bpy.context.scene.render.resolution_x=768; bpy.context.scene.render.resolution_y=768; bpy.context.scene.render.resolution_percentage=100",
      "bpy.context.scene.render.filepath=r'''" + pythonPath(previewPath) + "'''",
      "bpy.ops.render.render(write_still=True)",
    ] : []),
    "bpy.ops.wm.save_as_mainfile(filepath=r'''" + pythonPath(blendPath) + "''')",
    "print('HIOS_RESULT objects=%d vertices=%d' % (len(renderables), vertices))",
  ].join('\n');
  writeFileSync(scriptPath, script + '\n' + validation, 'utf8');
  const result = await run(['--background', '--python', scriptPath]);
  writeFileSync(logPath, (result.stdout || '') + '\n' + (result.stderr || ''), 'utf8');
  if (!existsSync(blendPath)) throw new Error('Blender 执行结束但没有生成 .blend');
  return { content: [{ type: 'text', text: JSON.stringify({ success: true, blendPath, previewPath: existsSync(previewPath) ? previewPath : '', scriptPath, logPath }, null, 2) }] };
});

server.registerTool('inspect_scene', {
  description: 'Inspect objects, materials, dimensions, and positions in an existing .blend.', inputSchema: { blendPath: z.string() },
}, async ({ blendPath }) => {
  const source = resolve(blendPath); if (!existsSync(source)) throw new Error('模型不存在');
  const dir = safePath(resolve(workspace, 'inspect', Date.now().toString()), resolve(workspace, 'inspect'));
  mkdirSync(dir, { recursive: true }); const path = resolve(dir, 'inspect.py');
  const code = "import bpy,json\nitems=[]\nfor o in bpy.context.scene.objects:\n items.append({'name':o.name,'type':o.type,'dimensions':[round(v,6) for v in o.dimensions],'location':[round(v,6) for v in o.location]})\nprint('HIOS_INSPECT:'+json.dumps({'objects':items,'materials':[m.name for m in bpy.data.materials]}))\n";
  writeFileSync(path, code, 'utf8'); const result = await run([source, '--background', '--python', path], 120000);
  const line = (result.stdout || '').split(/\r?\n/).find((value) => value.startsWith('HIOS_INSPECT:'));
  return { content: [{ type: 'text', text: line?.slice(13) || JSON.stringify({ stdout: (result.stdout || '').slice(-4000) }) }] };
});

server.registerTool('render_preview', {
  description: 'Render a preview PNG from an existing .blend file.', inputSchema: { blendPath: z.string(), outputPath: z.string().optional() },
}, async ({ blendPath, outputPath }) => {
  const source = resolve(blendPath); if (!existsSync(source)) throw new Error('模型不存在');
  const target = safePath(outputPath, resolve(workspace, 'renders', Date.now() + '.png')); mkdirSync(dirname(target), { recursive: true });
  const path = resolve(dirname(target), 'render_preview.py');
  const code = ["import bpy,math", "if not bpy.context.scene.camera:", "    bpy.ops.object.camera_add(location=(4,-4,3),rotation=(math.radians(67),0,math.radians(43))); bpy.context.scene.camera=bpy.context.object", "bpy.context.scene.render.engine='BLENDER_EEVEE'", "bpy.context.scene.render.resolution_x=768; bpy.context.scene.render.resolution_y=768; bpy.context.scene.render.resolution_percentage=100", "bpy.context.scene.render.filepath=r'''" + pythonPath(target) + "'''", "bpy.ops.render.render(write_still=True)"].join('\n');
  writeFileSync(path, code, 'utf8'); await run([source, '--background', '--python', path]);
  return { content: [{ type: 'text', text: JSON.stringify({ success: existsSync(target), previewPath: target }) }] };
});

await server.connect(new StdioServerTransport());
