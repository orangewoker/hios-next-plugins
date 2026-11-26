import { createInterface } from 'node:readline';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  callSketchup,
  installBridgeForVersion,
  launchSketchup,
  listVersions,
  selectVersion,
  syncToHomepageDsh,
} from './sketchup-client.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = join(HERE, 'server.mjs');

const schema = (properties, required = []) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});

const versionProp = {
  type: 'string',
  description: '目标 SketchUp 年份版本，例如 "2026" 或 "2027"；省略时使用默认版本或唯一运行中的实例。',
};
const pidProp = {
  type: 'integer',
  description: '可选：指定运行中 SketchUp 实例的 PID。',
};
const displayModeProp = {
  type: 'string',
  enum: ['material', 'white', 'wire'],
  description: '显示样式：material（材质）/ white（纯白模）/ wire（线框）。',
};

const agentTools = [
  {
    name: 'sketchup_list_versions',
    description: '扫描电脑上已安装的 SketchUp 版本、Ruby 桥接状态、默认版本与运行中实例。',
    inputSchema: schema({}),
    readOnly: true,
  },
  {
    name: 'sketchup_select_version',
    description: '选择并记住默认 SketchUp 版本（如 "2026" 或 "2027"），并自动安装或升级 Ruby 桥接。',
    inputSchema: schema({ version: { type: 'string' }, installBridge: { type: 'boolean' } }, ['version']),
  },
  {
    name: 'sketchup_launch',
    description: '启动指定版本的 SketchUp（若未装桥接自动安装），并等待桥接连接就绪；同版本已运行则直接复用。',
    inputSchema: schema({ version: versionProp, filePath: { type: 'string' }, waitSeconds: { type: 'integer' } }),
  },
  {
    name: 'sketchup_inspect',
    description: '读取当前 SketchUp 模型的单位、包围盒（毫米）、群组/组件层级、标签、场景、材质、显示样式与选区。修改前务必先调用。',
    inputSchema: schema({ version: versionProp, pid: pidProp, selectionOnly: { type: 'boolean' }, maxDepth: { type: 'integer' } }),
    readOnly: true,
  },
  {
    name: 'sketchup_run_ruby',
    description: '在目标 SketchUp 主线程执行 Ruby 建模或修改脚本。默认包裹在单一可 Ctrl+Z 撤销的 start_operation 事务中。',
    inputSchema: schema({
      code: { type: 'string', description: 'Ruby 脚本，尺寸必须使用 .mm / .cm / .m 方法。' },
      operationName: { type: 'string', description: '撤销历史中的操作名称。' },
      undoable: { type: 'boolean' },
      version: versionProp,
      pid: pidProp,
    }, ['code']),
  },
  {
    name: 'sketchup_capture_view',
    description: '截取当前 SketchUp 视口图像并返回供视觉验收，支持材质/纯白模/线框、阴影开关、预设视角或指定场景名，自动保存到工作区供画布输出。',
    inputSchema: schema({
      version: versionProp,
      pid: pidProp,
      cameraPreset: { type: 'string', enum: ['current', 'iso', 'front', 'back', 'left', 'right', 'top'] },
      sceneName: { type: 'string', description: '可选：按 SketchUp 中已有场景名称切换相机并截图。' },
      displayMode: displayModeProp,
      shadows: { type: 'boolean', description: '是否开启阴影。' },
      zoomExtents: { type: 'boolean' },
      restoreCamera: { type: 'boolean' },
      restoreStyle: { type: 'boolean' },
      width: { type: 'integer' },
      height: { type: 'integer' },
    }),
    readOnly: true,
  },
  {
    name: 'sketchup_select_entity',
    description: '按 entityID 或名称在 SketchUp 中高亮选中对应群组/组件，方便用户定位核对。',
    inputSchema: schema({
      entityIds: { type: 'array', items: { type: 'integer' } },
      name: { type: 'string' },
      version: versionProp,
      pid: pidProp,
    }),
  },
  {
    name: 'sketchup_model_file',
    description: '打开 .skp、保存当前模型（或另存为工作区 .skp），或导出 .dae / .obj / .stl / .fbx。',
    inputSchema: schema({
      action: { type: 'string', enum: ['open', 'save', 'export'] },
      path: { type: 'string' },
      format: { type: 'string', enum: ['skp', 'dae', 'obj', 'stl', 'fbx'] },
      version: versionProp,
      pid: pidProp,
    }, ['action']),
  },
  {
    name: 'sketchup_undo',
    description: '撤销 SketchUp 中的上一步操作（Ctrl+Z）。',
    inputSchema: schema({ version: versionProp, pid: pidProp }),
  },
];

const uiOnlyTools = [
  { name: 'ui_list_versions', description: 'UI 获取 SketchUp 版本与连接状态', inputSchema: schema({}), _meta: { 'hios/uiOnly': true } },
  { name: 'ui_select_version', description: 'UI 切换默认 SketchUp 版本', inputSchema: schema({ version: { type: 'string' }, installBridge: { type: 'boolean' } }, ['version']), _meta: { 'hios/uiOnly': true } },
  { name: 'ui_install_bridge', description: 'UI 安装或升级 Ruby 桥接', inputSchema: schema({ version: versionProp }), _meta: { 'hios/uiOnly': true } },
  { name: 'ui_launch', description: 'UI 启动指定版本 SketchUp', inputSchema: schema({ version: versionProp, waitSeconds: { type: 'integer' } }), _meta: { 'hios/uiOnly': true } },
  { name: 'ui_inspect', description: 'UI 检查当前模型与历史记录', inputSchema: schema({ version: versionProp, pid: pidProp }), _meta: { 'hios/uiOnly': true } },
  {
    name: 'ui_capture_view',
    description: 'UI 抓取带样式的视口截图并写入工作区',
    inputSchema: schema({
      version: versionProp,
      pid: pidProp,
      cameraPreset: { type: 'string', enum: ['current', 'iso', 'front', 'back', 'left', 'right', 'top'] },
      sceneName: { type: 'string' },
      displayMode: displayModeProp,
      shadows: { type: 'boolean' },
      zoomExtents: { type: 'boolean' },
      width: { type: 'integer' },
      height: { type: 'integer' },
    }),
    _meta: { 'hios/uiOnly': true },
  },
  { name: 'ui_export_model', description: 'UI 保存或导出当前模型到工作区', inputSchema: schema({ format: { type: 'string', enum: ['skp', 'dae', 'obj', 'stl', 'fbx'] }, version: versionProp, pid: pidProp }), _meta: { 'hios/uiOnly': true } },
  { name: 'ui_undo', description: 'UI 执行撤销', inputSchema: schema({ version: versionProp, pid: pidProp }), _meta: { 'hios/uiOnly': true } },
  { name: 'ui_history', description: 'UI 读取当前节点工作区历史截图与操作记录', inputSchema: schema({}), _meta: { 'hios/uiOnly': true } },
  { name: 'ui_sync_dsh', description: 'UI 将当前插件 MCP 同步到首页 DSH 配置', inputSchema: schema({}), _meta: { 'hios/uiOnly': true } },
  { name: 'ui_cancel', description: 'UI 停止任务钩子', inputSchema: schema({}), _meta: { 'hios/uiOnly': true, 'hios/cancelOnStop': true } },
];

export const TOOLS = [...agentTools, ...uiOnlyTools].map(({ readOnly, ...tool }) => ({
  ...tool,
  annotations: { readOnlyHint: Boolean(readOnly), destructiveHint: false, openWorldHint: false },
}));

function readWorkspaceMeta(ctx) {
  if (!ctx?.root) return { captures: [], operations: [], latestModel: null };
  const file = join(ctx.root, 'sketchup-studio.json');
  try {
    if (!existsSync(file)) return { captures: [], operations: [], latestModel: null };
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    return {
      captures: Array.isArray(parsed.captures) ? parsed.captures : [],
      operations: Array.isArray(parsed.operations) ? parsed.operations : [],
      latestModel: parsed.latestModel || null,
    };
  } catch {
    return { captures: [], operations: [], latestModel: null };
  }
}

function writeWorkspaceMeta(ctx, meta) {
  if (!ctx?.root) return;
  mkdirSync(ctx.root, { recursive: true });
  writeFileSync(join(ctx.root, 'sketchup-studio.json'), JSON.stringify(meta, null, 2), 'utf8');
}

function assetUrl(ctx, relPath) {
  const base = String(ctx?.baseUrl || '').replace(/\/$/, '');
  return base ? `${base}/${relPath.replace(/^\/+/, '')}` : relPath;
}

async function doCapture(args, ctx, returnImageBlock) {
  let outPath = args.outputPath;
  let relPath = '';
  if (ctx?.root) {
    mkdirSync(join(ctx.root, 'captures'), { recursive: true });
    relPath = `captures/preview-${Date.now()}.png`;
    outPath = join(ctx.root, relPath);
  }
  const res = await callSketchup('POST', '/capture_view', {
    cameraPreset: args.cameraPreset || 'current',
    sceneName: args.sceneName || '',
    displayMode: args.displayMode || 'material',
    shadows: args.shadows,
    zoomExtents: Boolean(args.zoomExtents),
    restoreCamera: args.restoreCamera !== false,
    restoreStyle: args.restoreStyle !== false,
    width: args.width || 1280,
    height: args.height || 960,
    outputPath: outPath,
  }, { version: args.version, pid: args.pid, timeoutMs: 60000 });

  if (!res.ok) {
    return { isError: true, content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
  }
  const { base64, ...meta } = res;
  const entry = {
    id: `cap-${Date.now()}`,
    createdAt: Date.now(),
    path: relPath || meta.path,
    url: relPath ? assetUrl(ctx, relPath) : '',
    width: meta.width,
    height: meta.height,
    cameraPreset: meta.cameraPreset,
    sceneName: meta.sceneName || '',
    displayMode: meta.displayMode || 'material',
    shadows: Boolean(meta.shadows),
  };
  if (ctx?.root) {
    const state = readWorkspaceMeta(ctx);
    state.captures = [entry, ...state.captures].slice(0, 30);
    writeWorkspaceMeta(ctx, state);
  }
  const payload = { ...meta, ...entry };
  const content = [{ type: 'text', text: JSON.stringify(payload, null, 2) }];
  if (returnImageBlock && typeof base64 === 'string' && base64.length > 0) {
    content.push({ type: 'image', data: base64, mimeType: 'image/png' });
  }
  return { content };
}

async function doExportOrSave(args, ctx) {
  const format = String(args.format || 'skp').toLowerCase();
  let targetPath = args.path;
  let relPath = '';
  const action = args.action || (format === 'skp' ? 'save' : 'export');
  if (!targetPath && ctx?.root && (action === 'save' || action === 'export')) {
    mkdirSync(join(ctx.root, 'exports'), { recursive: true });
    relPath = `exports/model-${Date.now()}.${format}`;
    targetPath = join(ctx.root, relPath);
  }
  const res = await callSketchup('POST', '/model_file', { action, path: targetPath }, { version: args.version, pid: args.pid, timeoutMs: 60000 });
  if (!res.ok) return { isError: true, content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
  const artifact = relPath ? { path: relPath, url: assetUrl(ctx, relPath), format, name: `sketchup-model.${format}`, createdAt: Date.now() } : null;
  if (artifact && ctx?.root) {
    const state = readWorkspaceMeta(ctx);
    state.latestModel = artifact;
    writeWorkspaceMeta(ctx, state);
  }
  return { content: [{ type: 'text', text: JSON.stringify({ ...res, ...(artifact ? { file: artifact } : {}) }, null, 2) }] };
}

async function executeTool(name, rawArgs = {}) {
  const { _context: ctx, ...args } = rawArgs || {};
  switch (name) {
    case 'sketchup_list_versions':
    case 'ui_list_versions':
      return { content: [{ type: 'text', text: JSON.stringify(await listVersions(), null, 2) }] };
    case 'sketchup_select_version':
    case 'ui_select_version':
      return { content: [{ type: 'text', text: JSON.stringify(selectVersion(args.version, args.installBridge !== false), null, 2) }] };
    case 'ui_install_bridge':
      return { content: [{ type: 'text', text: JSON.stringify({ installed: installBridgeForVersion(args.version) }, null, 2) }] };
    case 'sketchup_launch':
    case 'ui_launch':
      return { content: [{ type: 'text', text: JSON.stringify(await launchSketchup(args), null, 2) }] };
    case 'sketchup_inspect':
    case 'ui_inspect': {
      const info = await callSketchup('POST', '/inspect', {
        selectionOnly: Boolean(args.selectionOnly),
        maxDepth: args.maxDepth ?? 2,
      }, args);
      return { isError: !info.ok, content: [{ type: 'text', text: JSON.stringify(info, null, 2) }] };
    }
    case 'sketchup_run_ruby': {
      const res = await callSketchup('POST', '/run_ruby', {
        code: args.code,
        operationName: args.operationName,
        undoable: args.undoable !== false,
      }, { ...args, timeoutMs: 110000 });
      if (res.ok && ctx?.root) {
        const state = readWorkspaceMeta(ctx);
        state.operations = [{
          createdAt: Date.now(),
          operationName: res.operationName,
          entityCount: res.entityCount,
          boundsMm: res.boundsMm || null,
        }, ...state.operations].slice(0, 40);
        writeWorkspaceMeta(ctx, state);
      }
      return { isError: !res.ok, content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
    }
    case 'sketchup_capture_view':
      return doCapture(args, ctx, true);
    case 'ui_capture_view':
      return doCapture(args, ctx, false);
    case 'sketchup_select_entity': {
      const res = await callSketchup('POST', '/select_entity', {
        entityIds: args.entityIds || [],
        name: args.name || '',
      }, args);
      return { isError: !res.ok, content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
    }
    case 'sketchup_model_file':
      return doExportOrSave(args, ctx);
    case 'ui_export_model':
      return doExportOrSave({ ...args, action: (args.format || 'skp') === 'skp' ? 'save' : 'export' }, ctx);
    case 'sketchup_undo':
    case 'ui_undo': {
      const res = await callSketchup('POST', '/undo', {}, args);
      return { isError: !res.ok, content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
    }
    case 'ui_history':
      return { content: [{ type: 'text', text: JSON.stringify(readWorkspaceMeta(ctx), null, 2) }] };
    case 'ui_sync_dsh':
      return { content: [{ type: 'text', text: JSON.stringify(syncToHomepageDsh(SERVER_PATH), null, 2) }] };
    case 'ui_cancel':
      return { content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] };
    default:
      throw new Error(`未知 SketchUp 插件工具：${name}`);
  }
}

const send = value => process.stdout.write(JSON.stringify(value) + '\n');
const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on('line', async line => {
  if (!line || !line.trim()) return;
  let req;
  try { req = JSON.parse(line); } catch { return; }
  if (req.id === undefined) return;
  try {
    let result;
    if (req.method === 'initialize') {
      result = {
        protocolVersion: req.params?.protocolVersion || '2025-03-26',
        capabilities: { tools: {} },
        serverInfo: { name: 'sketchup-studio', version: '0.1.0' },
      };
    } else if (req.method === 'ping') {
      result = {};
    } else if (req.method === 'tools/list') {
      result = { tools: TOOLS };
    } else if (req.method === 'tools/call') {
      const toolName = req.params?.name;
      if (!TOOLS.some(t => t.name === toolName)) {
        result = { isError: true, content: [{ type: 'text', text: `未知工具：${toolName}` }] };
      } else {
        try {
          result = await executeTool(toolName, req.params?.arguments || {});
        } catch (err) {
          result = { isError: true, content: [{ type: 'text', text: String(err?.message || err) }] };
        }
      }
    } else {
      send({ jsonrpc: '2.0', id: req.id, error: { code: -32601, message: `Method not found: ${req.method}` } });
      return;
    }
    send({ jsonrpc: '2.0', id: req.id, result });
  } catch (err) {
    send({ jsonrpc: '2.0', id: req.id, error: { code: -32603, message: String(err?.message || err) } });
  }
});

process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
