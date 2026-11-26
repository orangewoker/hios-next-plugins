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
const imageFormatProp = {
  type: 'string',
  enum: ['png', 'jpg'],
  description: '输出图片格式：png 或 jpg（透明背景仅 png 支持）。',
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
      imageFormat: imageFormatProp,
      transparent: { type: 'boolean', description: '是否输出透明背景（仅 PNG 支持）。' },
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
  { name: 'ui_ping', description: 'UI 轻量检测 SketchUp 版本与模型/视角 revision（供实时同步）', inputSchema: schema({ version: versionProp, pid: pidProp }), _meta: { 'hios/uiOnly': true } },
  {
    name: 'ui_camera',
    description: 'UI 实时旋转/平移/缩放 SketchUp 视角并返回快速预览帧',
    inputSchema: schema({
      version: versionProp,
      pid: pidProp,
      action: { type: 'string', enum: ['orbit', 'pan', 'zoom', 'preset'] },
      dx: { type: 'number' },
      dy: { type: 'number' },
      delta: { type: 'number' },
      preset: { type: 'string' },
      displayMode: displayModeProp,
      shadows: { type: 'boolean' },
      fastPreview: { type: 'boolean' },
      width: { type: 'integer' },
      height: { type: 'integer' },
    }, ['action']),
    _meta: { 'hios/uiOnly': true },
  },
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
      imageFormat: imageFormatProp,
      transparent: { type: 'boolean' },
      zoomExtents: { type: 'boolean' },
      restoreCamera: { type: 'boolean' },
      width: { type: 'integer' },
      height: { type: 'integer' },
    }),
    _meta: { 'hios/uiOnly': true },
  },
  { name: 'ui_export_model', description: 'UI 保存或导出当前模型到工作区', inputSchema: schema({ format: { type: 'string', enum: ['skp', 'dae', 'obj', 'stl', 'fbx'] }, modelTitle: { type: 'string' }, version: versionProp, pid: pidProp }), _meta: { 'hios/uiOnly': true } },
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

function rubyLiteral(str) {
  return JSON.stringify(String(str ?? ''));
}

async function captureViaRubyFallback(args, outPath, { imageFormat, transparent }) {
  const width = Math.max(320, Math.min(4096, Number(args.width) || 1280));
  const height = Math.max(240, Math.min(4096, Number(args.height) || 960));
  const preset = String(args.cameraPreset || 'current').toLowerCase();
  const sceneName = String(args.sceneName || '').trim();
  const displayMode = String(args.displayMode || 'material').toLowerCase();
  const hasShadows = typeof args.shadows === 'boolean';
  const shadowsVal = Boolean(args.shadows);
  const zoomExtents = Boolean(args.zoomExtents);
  const restoreCamera = args.restoreCamera !== false;
  const restoreStyle = args.restoreStyle !== false;

  const code = `
require 'base64'
require 'fileutils'
m = Sketchup.active_model
v = m.active_view
ro = m.rendering_options
c = v.camera
saved_cam = c.perspective? ? Sketchup::Camera.new(c.eye.clone, c.target.clone, c.up.clone, true, c.fov) : (cc = Sketchup::Camera.new(c.eye.clone, c.target.clone, c.up.clone, false); cc.height = c.height; cc)
s_rm, s_em, s_dg, s_du, s_df, s_sh = ro['RenderMode'], ro['EdgeDisplayMode'], ro['DrawGround'], ro['DrawUnderground'], ro['DisplayFog'], m.shadow_info['DisplayShadows']
changed_cam = false
changed_style = false
begin
  sname = ${rubyLiteral(sceneName)}
  if !sname.empty?
    pg = m.pages.find { |p| p.name.to_s.encode('UTF-8', invalid: :replace, undef: :replace) == sname }
    if pg && pg.camera
      pc = pg.camera
      v.camera = pc.perspective? ? Sketchup::Camera.new(pc.eye.clone, pc.target.clone, pc.up.clone, true, pc.fov) : (cc = Sketchup::Camera.new(pc.eye.clone, pc.target.clone, pc.up.clone, false); cc.height = pc.height; cc)
      changed_cam = true
    end
  end
  pr = ${rubyLiteral(preset)}
  if pr != 'current'
    bb = m.bounds
    ctr = bb.empty? ? Geom::Point3d.new(0,0,0) : bb.center
    rad = bb.empty? ? 100.0 : [bb.diagonal * 0.9, 40.0].max
    eye, up = case pr
      when 'iso' then [ctr.offset(Geom::Vector3d.new(1,-1,0.8).normalize, rad * 1.45), Geom::Vector3d.new(0,0,1)]
      when 'front' then [ctr.offset(Geom::Vector3d.new(0,-1,0), rad * 1.4), Geom::Vector3d.new(0,0,1)]
      when 'back' then [ctr.offset(Geom::Vector3d.new(0,1,0), rad * 1.4), Geom::Vector3d.new(0,0,1)]
      when 'left' then [ctr.offset(Geom::Vector3d.new(-1,0,0), rad * 1.4), Geom::Vector3d.new(0,0,1)]
      when 'right' then [ctr.offset(Geom::Vector3d.new(1,0,0), rad * 1.4), Geom::Vector3d.new(0,0,1)]
      when 'top' then [ctr.offset(Geom::Vector3d.new(0,0,1), rad * 1.5), Geom::Vector3d.new(0,1,0)]
      else [nil, nil]
    end
    if eye
      v.camera = Sketchup::Camera.new(eye, ctr, up, true)
      changed_cam = true
    end
  end
  if ${zoomExtents ? 'true' : 'false'} && !m.bounds.empty?
    v.zoom_extents
    changed_cam = true
  end
  dm = ${rubyLiteral(displayMode)}
  if dm == 'material' then ro['RenderMode'] = 3; ro['EdgeDisplayMode'] = 1; changed_style = true
  elsif dm == 'white' then ro['RenderMode'] = 5; ro['EdgeDisplayMode'] = 1; changed_style = true
  elsif dm == 'wire' then ro['RenderMode'] = 0; ro['EdgeDisplayMode'] = 1; changed_style = true
  end
  if ${transparent ? 'true' : 'false'}
    ro['DrawGround'] = false rescue nil
    ro['DrawUnderground'] = false rescue nil
    ro['DisplayFog'] = false rescue nil
    changed_style = true
  end
  if ${hasShadows ? 'true' : 'false'}
    m.shadow_info['DisplayShadows'] = ${shadowsVal ? 'true' : 'false'}
    changed_style = true
  end
  v.invalidate
  v.refresh if v.respond_to?(:refresh)
  out_p = ${rubyLiteral(outPath)}
  FileUtils.mkdir_p(File.dirname(out_p))
  opts = { filename: out_p, width: ${width}, height: ${height}, antialias: true }
  if ${rubyLiteral(imageFormat)} == 'png'
    opts[:transparent] = ${transparent ? 'true' : 'false'}
  else
    opts[:compression] = 0.92
  end
  ok = v.write_image(opts)
  raise 'view.write_image failed' unless ok && File.exist?(out_p)
  'OK'
ensure
  if changed_style && ${restoreStyle ? 'true' : 'false'}
    ro['RenderMode'] = s_rm rescue nil
    ro['EdgeDisplayMode'] = s_em rescue nil
    ro['DrawGround'] = s_dg rescue nil
    ro['DrawUnderground'] = s_du rescue nil
    ro['DisplayFog'] = s_df rescue nil
    m.shadow_info['DisplayShadows'] = s_sh rescue nil
  end
  if changed_cam && ${restoreCamera ? 'true' : 'false'}
    v.camera = saved_cam rescue nil
  end
  v.invalidate if (changed_style && ${restoreStyle ? 'true' : 'false'}) || (changed_cam && ${restoreCamera ? 'true' : 'false'})
end
`;
  const run = await callSketchup('POST', '/run_ruby', { code, undoable: false, operationName: 'HIOS Capture' }, { version: args.version, pid: args.pid, timeoutMs: 60000 });
  if (!run.ok || !existsSync(outPath)) {
    return { ok: false, error: run.error || 'Fallback Ruby capture failed' };
  }
  const bytes = readFileSync(outPath);
  return {
    ok: true,
    path: outPath,
    width,
    height,
    cameraPreset: preset,
    sceneName,
    displayMode,
    shadows: shadowsVal,
    imageFormat,
    mimeType: imageFormat === 'jpg' ? 'image/jpeg' : 'image/png',
    transparent,
    byteSize: bytes.length,
    base64: bytes.toString('base64'),
  };
}

async function cameraControlViaRubyFallback(args, ctx) {
  const action = String(args.action || '').toLowerCase();
  const dx = Number(args.dx) || 0;
  const dy = Number(args.dy) || 0;
  const delta = Number(args.delta) || 0;
  const displayMode = String(args.displayMode || '').toLowerCase();
  const hasShadows = typeof args.shadows === 'boolean';
  const shadowsVal = Boolean(args.shadows);
  const w = Math.max(320, Math.min(1280, Number(args.width) || 720));
  const h = Math.max(240, Math.min(960, Number(args.height) || 540));
  const tmpFile = ctx?.root ? join(ctx.root, 'captures', '_live-fallback.jpg') : '';
  if (tmpFile) mkdirSync(join(ctx.root, 'captures'), { recursive: true });

  const code = `
require 'fileutils'
m = Sketchup.active_model
v = m.active_view
cam = v.camera
act = ${rubyLiteral(action)}
if act == 'orbit'
  vec = cam.eye - cam.target
  dist = vec.length; dist = 100.0 if dist < 1.0
  horiz = Math.hypot(vec.x, vec.y)
  az = Math.atan2(vec.y, vec.x) - (${dx}) * 0.0085
  el = [[Math.atan2(vec.z, horiz) + (${dy}) * 0.0085, -1.48].max, 1.48].min
  ce = Math.cos(el)
  ne = Geom::Point3d.new(cam.target.x + dist * ce * Math.cos(az), cam.target.y + dist * ce * Math.sin(az), cam.target.z + dist * Math.sin(el))
  nc = Sketchup::Camera.new(ne, cam.target.clone, Geom::Vector3d.new(0,0,1), cam.perspective?)
  nc.fov = cam.fov if cam.perspective?
  nc.height = cam.height unless cam.perspective?
  v.camera = nc
elsif act == 'pan'
  dist = cam.eye.distance(cam.target); dist = 100.0 if dist < 1.0
  sc = cam.perspective? ? dist * 0.0017 : cam.height * 0.0022
  rx, ry = cam.xaxis, cam.yaxis
  off = Geom::Vector3d.new((-rx.x * (${dx}) + ry.x * (${dy})) * sc, (-rx.y * (${dx}) + ry.y * (${dy})) * sc, (-rx.z * (${dx}) + ry.z * (${dy})) * sc)
  nc = Sketchup::Camera.new(cam.eye.offset(off), cam.target.offset(off), cam.up.clone, cam.perspective?)
  nc.fov = cam.fov if cam.perspective?
  nc.height = cam.height unless cam.perspective?
  v.camera = nc
elsif act == 'zoom'
  fac = Math.exp([[((${delta}) * 0.0014), -0.45].max, 0.45].min)
  if cam.perspective?
    vec = cam.eye - cam.target
    dist = vec.length; dist = 100.0 if dist < 1.0
    nd = [[dist * fac, 2.0].max, 500000.0].min
    v.camera = Sketchup::Camera.new(cam.target.offset(vec.normalize, nd), cam.target.clone, cam.up.clone, true, cam.fov)
  else
    nc = Sketchup::Camera.new(cam.eye.clone, cam.target.clone, cam.up.clone, false)
    nc.height = [[cam.height * fac, 2.0].max, 500000.0].min
    v.camera = nc
  end
end
v.invalidate
v.refresh if v.respond_to?(:refresh)
tmp = ${rubyLiteral(tmpFile)}
if !tmp.empty?
  ro = m.rendering_options
  s_rm, s_em, s_sh = ro['RenderMode'], ro['EdgeDisplayMode'], m.shadow_info['DisplayShadows']
  cs = false
  begin
    dm = ${rubyLiteral(displayMode)}
    if dm == 'material' then ro['RenderMode'] = 3; ro['EdgeDisplayMode'] = 1; cs = true
    elsif dm == 'white' then ro['RenderMode'] = 5; ro['EdgeDisplayMode'] = 1; cs = true
    elsif dm == 'wire' then ro['RenderMode'] = 0; ro['EdgeDisplayMode'] = 1; cs = true
    end
    if ${hasShadows ? 'true' : 'false'}
      m.shadow_info['DisplayShadows'] = ${shadowsVal ? 'true' : 'false'}
      cs = true
    end
    FileUtils.mkdir_p(File.dirname(tmp))
    v.write_image({ filename: tmp, width: ${w}, height: ${h}, antialias: false, compression: 0.72 })
  ensure
    if cs
      ro['RenderMode'] = s_rm rescue nil
      ro['EdgeDisplayMode'] = s_em rescue nil
      m.shadow_info['DisplayShadows'] = s_sh rescue nil
      v.invalidate
    end
  end
end
'OK'
`;
  const run = await callSketchup('POST', '/run_ruby', { code, undoable: false, operationName: 'HIOS Camera' }, { version: args.version, pid: args.pid, timeoutMs: 15000 });
  if (!run.ok) return { ok: false, error: run.error || 'Camera control failed' };
  let previewDataUrl = null;
  if (tmpFile && existsSync(tmpFile)) {
    previewDataUrl = `data:image/jpeg;base64,${readFileSync(tmpFile).toString('base64')}`;
  }
  return { ok: true, action, previewDataUrl };
}

async function doCapture(args, ctx, returnImageBlock) {
  const imageFormat = String(args.imageFormat || 'png').toLowerCase() === 'jpg' ? 'jpg' : 'png';
  const transparent = Boolean(args.transparent) && imageFormat === 'png';
  const width = Math.max(320, Math.min(4096, Number(args.width) || 1280));
  const height = Math.max(240, Math.min(4096, Number(args.height) || 960));
  const ext = imageFormat === 'jpg' ? 'jpg' : 'png';
  let outPath = args.outputPath;
  let relPath = '';
  if (ctx?.root) {
    mkdirSync(join(ctx.root, 'captures'), { recursive: true });
    relPath = `captures/preview-${Date.now()}.${ext}`;
    outPath = join(ctx.root, relPath);
  }

  let res = await callSketchup('POST', '/capture_view', {
    cameraPreset: args.cameraPreset || 'current',
    sceneName: args.sceneName || '',
    displayMode: args.displayMode || 'material',
    shadows: args.shadows,
    imageFormat,
    transparent,
    zoomExtents: Boolean(args.zoomExtents),
    restoreCamera: args.restoreCamera !== false,
    restoreStyle: args.restoreStyle !== false,
    width,
    height,
    outputPath: outPath,
  }, { version: args.version, pid: args.pid, timeoutMs: 60000 });

  // Older v1.1.0 bridge ignores transparent/jpg and caps dimensions at 2560x1920.
  // Transparently fall back to /run_ruby so users don't even have to restart SketchUp!
  const needsV12Fallback = res.ok && outPath && (
    (transparent && res.transparent !== true) ||
    (imageFormat === 'jpg' && res.imageFormat !== 'jpg') ||
    ((width > 2560 || height > 1920) && (res.width !== width || res.height !== height))
  );
  if (needsV12Fallback) {
    res = await captureViaRubyFallback({ ...args, width, height }, outPath, { imageFormat, transparent });
  }

  if (!res.ok) {
    return { isError: true, content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
  }
  const { base64, ...meta } = res;
  const resolvedFormat = meta.imageFormat || imageFormat;
  const resolvedMime = meta.mimeType || (resolvedFormat === 'jpg' ? 'image/jpeg' : 'image/png');
  const resolvedTransparent = meta.transparent !== undefined ? Boolean(meta.transparent) : transparent;
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
    imageFormat: resolvedFormat,
    mimeType: resolvedMime,
    transparent: resolvedTransparent,
  };
  if (ctx?.root) {
    const state = readWorkspaceMeta(ctx);
    state.captures = [entry, ...state.captures].slice(0, 30);
    writeWorkspaceMeta(ctx, state);
  }
  const payload = { ...meta, ...entry };
  const content = [{ type: 'text', text: JSON.stringify(payload, null, 2) }];
  if (returnImageBlock && typeof base64 === 'string' && base64.length > 0) {
    content.push({ type: 'image', data: base64, mimeType: resolvedMime });
  }
  return { content };
}

function sanitizeModelBaseName(title) {
  const cleaned = String(title || '')
    .trim()
    .replace(/\.(?:skp|dae|obj|stl|fbx)$/i, '')
    .replace(/[<>:"/\\|?*\x00-\x1f]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'sketchup-model';
}

async function doExportOrSave(args, ctx) {
  const format = String(args.format || 'skp').toLowerCase();
  let targetPath = args.path;
  let relPath = '';
  const action = args.action || (format === 'skp' ? 'save' : 'export');
  const displayName = `${sanitizeModelBaseName(args.modelTitle)}.${format}`;
  if (!targetPath && ctx?.root && (action === 'save' || action === 'save_copy' || action === 'export')) {
    mkdirSync(join(ctx.root, 'exports'), { recursive: true });
    relPath = `exports/model-${Date.now()}.${format}`;
    targetPath = join(ctx.root, relPath);
  }
  let res = await callSketchup('POST', '/model_file', { action, path: targetPath }, { version: args.version, pid: args.pid, timeoutMs: 60000 });
  // Older v1.1.0/v1.2.0 bridge doesn't recognize save_copy yet; run save_copy via /run_ruby so we never hijack the user's open .skp path.
  if (!res.ok && action === 'save_copy' && targetPath && /Unsupported model_file action/i.test(String(res.error || ''))) {
    const code = `
require 'fileutils'
m = Sketchup.active_model
raise 'No active model' unless m
t = ${rubyLiteral(targetPath)}
FileUtils.mkdir_p(File.dirname(t))
ok = m.respond_to?(:save_copy) ? m.save_copy(t) : m.save(t)
raise 'save_copy failed' unless ok && File.exist?(t)
'OK'
`;
    const run = await callSketchup('POST', '/run_ruby', { code, undoable: false, operationName: 'HIOS Save Copy' }, { version: args.version, pid: args.pid, timeoutMs: 60000 });
    res = run.ok && existsSync(targetPath)
      ? { ok: true, action: 'save_copy', path: targetPath }
      : { ok: false, error: run.error || 'save_copy failed' };
  }
  if (!res.ok) return { isError: true, content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
  const artifact = relPath ? { path: relPath, url: assetUrl(ctx, relPath), format, name: displayName, createdAt: Date.now() } : null;
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
    case 'ui_ping': {
      const info = await callSketchup('GET', '/ping', undefined, { ...args, timeoutMs: 4000 });
      return { isError: !info.ok, content: [{ type: 'text', text: JSON.stringify(info, null, 2) }] };
    }
    case 'ui_camera': {
      let info;
      try {
        info = await callSketchup('POST', '/camera_control', {
          action: args.action,
          dx: args.dx,
          dy: args.dy,
          delta: args.delta,
          preset: args.preset,
          displayMode: args.displayMode,
          shadows: args.shadows,
          fastPreview: args.fastPreview !== false,
          width: args.width || 720,
          height: args.height || 540,
        }, { ...args, timeoutMs: 15000 });
      } catch (err) {
        if (/Unknown route|404/i.test(String(err?.message || ''))) {
          info = await cameraControlViaRubyFallback(args, ctx);
        } else {
          throw err;
        }
      }
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
      return doExportOrSave({ ...args, action: (args.format || 'skp') === 'skp' ? 'save_copy' : 'export' }, ctx);
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
        serverInfo: { name: 'sketchup-studio', version: '0.1.4' },
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
