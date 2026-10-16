// The same real WASM editor runs in both hosts. Only the outer protocol differs.
const NODE = 'hios-plugin-node/v1', APP = 'hios-plugin-app/v1';
const isNode = document.body.dataset.surface === 'node';
const protocol = isNode ? NODE : APP;
const $ = id => document.getElementById(id);
// eframe removes its loading element after startup; retain the references for error recovery.
const loading = $('photocraft_loading'), loadingMessage = $('loadingMessage'), loadingDetail = $('loadingDetail'), webgl = $('webgl');
const MAX_BYTES = 64 * 1024 * 1024;
let nodeId = '', pluginId = 'photocraft', origin = '*', state = {}, initialized = false;
let bindings, runtimeReady = false, doc = null, lastDocKey = '', savedDocKey = '';
let starting, initTask = Promise.resolve(), saving = null, saveTimer = 0, currentTheme = '';
const requests = new Map(), hostRequests = new Map(), seenInputs = new Set();
const status = (message, error = false) => { $('status').textContent = message; $('status').classList.toggle('error', error); };
const post = (type, payload = {}) => parent.postMessage({ protocol, pluginId, nodeId, type, payload }, origin);
const remember = () => post('state', { state });
function fail(error) { status(error?.message || String(error), true); }
function fileMime(format) { return ({ png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', psd: 'image/vnd.adobe.photoshop', pcraft: 'application/octet-stream' })[format] || 'application/octet-stream'; }
function download(bytes, name, mime) {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
function request(op, name = '', bytes = new Uint8Array()) {
  if (!runtimeReady) return Promise.reject(new Error('PhotoCraft 尚未就绪'));
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timer = setTimeout(() => { requests.delete(id); reject(new Error('PhotoCraft 处理超时')); }, 90000);
    requests.set(id, { resolve, reject, timer });
    try { bindings.hios_request(id, op, name, bytes); }
    catch (e) { clearTimeout(timer); requests.delete(id); reject(e); }
  });
}
function poll() {
  if (!bindings?.hios_status) return;
  try {
    for (const [json, bytes] of bindings.hios_take_replies()) {
      const meta = JSON.parse(json), pending = requests.get(meta.requestId);
      if (!pending) continue;
      clearTimeout(pending.timer); requests.delete(meta.requestId);
      if (meta.error) pending.reject(new Error(meta.error)); else pending.resolve({ ...meta.result, bytes });
    }
    const raw = bindings.hios_status();
    if (!raw) return;
    const snapshot = JSON.parse(raw);
    if (!snapshot.ready) return;
    runtimeReady = true;
    doc = snapshot.document;
    loading.hidden = true;
    $('export').disabled = !doc; $('save').disabled = !doc;
    const key = doc ? `${doc.id}:${doc.revision}` : '';
    if (!initialized || key === lastDocKey) return;
    lastDocKey = key;
    clearTimeout(saveTimer);
    if (doc) {
      $('document').textContent = `${doc.name} · ${doc.width} × ${doc.height}${doc.layers ? ` · ${doc.layers} 图层` : ''}`;
      status('有未保存的编辑…');
      saveTimer = setTimeout(() => { void saveDocument().catch(fail); }, 1800);
    } else {
      $('document').textContent = '无文档';
      status('就绪 · 打开图片或新建文档');
      if (state.document) { delete state.document; remember(); }
    }
  } catch (e) { fail(e); }
}
const ticker = setInterval(poll, 100);
async function start() {
  if (starting) return starting;
  starting = (async () => {
    status('正在加载 PhotoCraft WebAssembly…');
    try {
      bindings = await import('./web/photocraft-web.js');
      await bindings.default({ module_or_path: new URL('./web/photocraft-web_bg.wasm', import.meta.url) });
      if (!bindings.hios_request) throw new Error('运行时缺少 HIOS 适配器，请重新安装完整的 PhotoCraft 插件');
      const deadline = Date.now() + 90000;
      while (!runtimeReady) {
        if (Date.now() > deadline) throw new Error('编辑器启动超时，请切换 WebGL 模式重试');
        const message = loading.textContent || '';
        if (message.includes('failed to start')) throw new Error(message);
        await new Promise(r => setTimeout(r, 100));
      }
      status('就绪');
    } catch (e) {
      loading.hidden = false;
      loading.replaceChildren(loadingMessage, loadingDetail, webgl);
      if (!loading.isConnected) document.querySelector('.stage').append(loading);
      loadingMessage.textContent = 'PhotoCraft 加载失败';
      loadingDetail.textContent = `${e.message || e}。检查插件 web/ 目录是否包含构建文件，或切换 WebGL 模式。`;
      fail(e); throw e;
    }
  })();
  return starting;
}
async function readSource(source) {
  let url = typeof source === 'string' ? source : source?.source || source?.url || source?.dataUrl || source?.assetUrl;
  if (!url || !/^(?:https?:|hios-asset:|data:|blob:)/i.test(url)) throw new Error('输入文件地址无效');
  // Windows/Linux Tauri custom schemes are exposed as *.localhost, including saved state URLs.
  if (location.hostname === 'hios-plugin.localhost') url = url.replace(/^hios-asset:\/\//i, 'http://hios-asset.localhost/');
  const response = await fetch(url);
  if (!response.ok) throw new Error(`读取文件失败：HTTP ${response.status}`);
  if (Number(response.headers.get('content-length')) > MAX_BYTES) throw new Error('输入文件超过 64 MB');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_BYTES) throw new Error('输入文件为空或超过 64 MB');
  const mime = response.headers.get('content-type')?.split(';')[0];
  const ext = ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/vnd.adobe.photoshop': 'psd' })[mime] || 'png';
  const name = source?.name || `画布输入.${ext}`;
  return { bytes, name };
}
async function syncInputs(payload) {
  const values = payload.inputs?.input;
  const inputs = [...(payload.file?.url ? [payload.file] : []), ...(Array.isArray(values) ? values : values ? [values] : [])];
  for (const input of inputs) {
    // Never put an incoming data URL (potentially megabytes) into the small JSON state.
    const source = typeof input === 'string' ? input : input?.source || input?.url || input?.dataUrl || input?.assetUrl || '';
    const canonical = source.replace(/^https?:\/\/hios-asset\.localhost\//i, 'hios-asset://');
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical + '\n' + (input?.name || '')));
    const key = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
    if (seenInputs.has(key)) continue;
    const file = await readSource(input);
    await saveDocument();
    await importFile(file);
    seenInputs.add(key);
  }
}
function importFile(file) {
  // Layered projects retain their editable document structure; raster images in
  // a canvas node are placed into the current project, never opened as new tabs.
  const op = isNode && !/\.(?:psd|psb|pcraft|ora|kra|krz|pdn)$/i.test(file.name) ? 'import-layer' : 'open';
  return request(op, file.name, file.bytes);
}
async function theme(value) {
  const mode = value?.mode === 'light' ? 'light' : 'dark';
  document.body.dataset.theme = mode;
  if (!runtimeReady || mode === currentTheme) return;
  await request('theme', mode); currentTheme = mode;
}
async function initialize(payload) {
  if (!initialized) {
    state = payload.state && typeof payload.state === 'object' ? { ...payload.state } : {};
    state.documentKey ||= crypto.randomUUID(); remember();
    await start();
    await request('locale', payload.locale || document.documentElement.lang || 'zh-CN');
    const font = await fetch(new URL('./fonts/NotoSansSC-Regular.ttf', import.meta.url));
    if (!font.ok) throw new Error('中文字体资源缺失，请检查插件 fonts/ 目录');
    await request('font', '', new Uint8Array(await font.arrayBuffer()));
    if (state.document?.url) {
      status('正在恢复编辑文档…');
      try {
        const file = await readSource(state.document);
        await request('open', state.document.name || '恢复文档.pcraft', file.bytes);
        for (const key of state.inputSources || []) seenInputs.add(key);
      } catch (e) {
        // Keep the saved reference so a temporary read failure never silently discards edits.
        throw new Error(`恢复文档失败：${e.message}。可重新加载重试，或打开本机备份。`);
      }
    }
    initialized = true;
  }
  await theme(payload.theme);
  await syncInputs(payload);
  post('loaded', { ready: true });
}
async function storeFile(file, key = state.documentKey) {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const timer = setTimeout(() => { hostRequests.delete(requestId); reject(new Error('宿主文件保存超时')); }, 30000);
    hostRequests.set(requestId, { resolve, reject, timer });
    post('file-store', { requestId, key, name: file.name, mime: fileMime(file.format), bytes: file.bytes });
  });
}
async function saveDocument() {
  if (saving) { await saving; return saveDocument(); }
  if (!doc || !initialized) return;
  const key = `${doc.id}:${doc.revision}`;
  if (key === savedDocKey) return;
  saving = (async () => {
    status('正在保存可编辑文档…');
    const file = await request('snapshot');
    const inputSources = [...seenInputs];
    const stored = await storeFile(file);
    state.document = { ...stored, name: file.name }; state.inputSources = inputSources; remember();
    savedDocKey = `${file.documentId}:${file.revision}`;
    await request('saved', savedDocKey);
    status('可编辑文档已保存到 HIOS');
  })();
  try { await saving; } finally { saving = null; }
}
async function output(format = 'png', addToCanvas = false) {
  await initTask;
  await saveDocument();
  status('正在导出…');
  const file = await request('export', format), mime = fileMime(format);
  if (isNode) {
    // Immutable asset URLs avoid base64 expansion and the host's JSON message size limit.
    const saved = await storeFile(file, `${state.documentKey}-${format}`);
    if (format === 'psd' || format === 'pcraft') {
      post('output', { kind: 'file', portId: 'file', source: saved.url, name: file.name, mime });
    } else {
      post('output', { kind: 'image', portId: 'image', source: saved.url, width: file.width, height: file.height, name: file.name, mime, metadata: { addToCanvas } });
    }
  } else download(file.bytes, file.name, mime);
  status(isNode ? '已输出到画布' : '已导出到本机');
  if (file.warnings?.length) status(`导出完成：${file.warnings.join('；')}`);
}
addEventListener('message', event => {
  if (event.source !== parent || event.data?.protocol !== protocol) return;
  const message = event.data, payload = message.payload || {};
  if (message.pluginId && message.pluginId !== pluginId) return;
  if (message.type === 'init') {
    if (event.origin && event.origin !== 'null') origin = event.origin;
    nodeId = message.nodeId || payload.nodeId || nodeId;
    initTask = initTask.catch(() => {}).then(() => initialize(payload));
    void initTask.catch(fail);
  } else if (message.type === 'run') {
    // Run always uses the latest connected input; export the document pixels, not a UI capture.
    initTask = initTask.then(() => syncInputs(payload));
    void output('png', true).catch(e => { fail(e); post('error', { message: e.message || String(e) }); });
  } else if (message.type === 'theme') { void theme(payload.theme).catch(fail); }
  else if (message.type === 'file-store-result') {
    const pending = hostRequests.get(payload.requestId); if (!pending) return;
    hostRequests.delete(payload.requestId); clearTimeout(pending.timer);
    if (payload.error) pending.reject(new Error(payload.error)); else pending.resolve(payload.result);
  }
});
$('export').onclick = () => void output($('format').value, true).catch(fail);
$('save').onclick = () => void saveDocument().catch(fail);
$('open').onclick = () => $('fileInput').click();
$('fileInput').onchange = async event => {
  try {
    await initTask;
    for (const file of event.target.files || []) {
      if (file.size > MAX_BYTES) throw new Error('输入文件超过 64 MB');
      await saveDocument();
      await importFile({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
    }
  } catch (e) { fail(e); } finally { event.target.value = ''; }
};
$('expand').onclick = async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
  catch { status('宿主不支持全屏，可拖动节点边缘放大编辑器'); }
};
$('reload').onclick = async () => {
  try { await saveDocument(); location.reload(); } catch (e) { fail(new Error(`保存未完成，未重新加载：${e.message}`)); }
};
$('webgl').onclick = () => { const url = new URL(location.href); url.searchParams.set('webgl', '1'); location.href = url.href; };
addEventListener('pagehide', () => {
  clearInterval(ticker); clearTimeout(saveTimer);
  for (const pending of [...requests.values(), ...hostRequests.values()]) clearTimeout(pending.timer);
});
post('ready', { version: '0.2.0' });
