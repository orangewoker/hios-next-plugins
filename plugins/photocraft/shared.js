import { configureGraphics } from './graphics.js';
// The same real WASM editor runs in both hosts. Only the outer protocol differs.
import { installSelectMenus } from './select-menu.js';
installSelectMenus();
// eframe runs a frame synchronously in pointerdown, before the browser's
// default focus action. Focus first so the initial click after toolbar/iframe
// interaction is not processed as an unfocused frame (notably Home).
document.getElementById('photocraft_canvas').addEventListener('pointerdown', event => {
  if (event.button === 0) event.currentTarget.focus({ preventScroll: true });
}, { capture: true });
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
let aiProtocol = '', aiInitialized = false, aiChoices = [], aiCapture = null, aiTimer = 0, aiPreviewUrl = '', aiBusy = false;
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
async function start(graphics) {
  if (starting) return starting;
  starting = (async () => {
    configureGraphics(graphics, text => { const label = document.getElementById('graphicsStatus'); if (label) label.textContent = text; });
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
  const response = await fetch(url, { cache: 'no-store' });
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
  // Convert CSS colors for egui; never filter the image canvas.
  const painter = document.createElement('canvas').getContext('2d');
  const tokens = {};
  for (const [key, color] of Object.entries(value?.tokens || {})) {
    if (typeof color !== 'string' || !CSS.supports('color', color)) continue;
    painter.clearRect(0, 0, 1, 1); painter.fillStyle = color; painter.fillRect(0, 0, 1, 1);
    tokens[key] = Array.from(painter.getImageData(0, 0, 1, 1).data);
  }
  const palette = JSON.stringify({mode, tokens});
  if (!runtimeReady || palette === currentTheme) return;
  await request('theme', palette); currentTheme = palette;
}
async function initialize(payload) {
  if (!initialized) {
    state = payload.state && typeof payload.state === 'object' ? { ...payload.state } : {};
    state.documentKey ||= crypto.randomUUID(); remember();
    await start(payload.graphics);
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
  if (!aiInitialized) { aiInitialized = true; void initializeAI(); }
  post('loaded', { ready: true });
}
async function storeFile(file, key = state.documentKey, purpose) {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const timer = setTimeout(() => { hostRequests.delete(requestId); reject(new Error('宿主文件保存超时')); }, 30000);
    hostRequests.set(requestId, { resolve, reject, timer });
    post('file-store', { requestId, key, purpose, name: file.name, mime: fileMime(file.format), bytes: file.bytes });
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
    const stored = await storeFile(file, state.documentKey, 'draft');
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
  else if ((message.type === 'file-store-result' || message.type === 'ai-result')) {
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
addEventListener('fullscreenchange', () => {
  const expanded = !!document.fullscreenElement, button = $('expand');
  button.title = expanded ? '退出全屏' : '全屏编辑';
  button.setAttribute('aria-label', button.title);
  button.setAttribute('aria-pressed', String(expanded));
  button.textContent = expanded ? '⊡' : '⛶';
});
$('reload').onclick = async () => {
  try { await saveDocument(); location.reload(); } catch (e) { fail(new Error(`保存未完成，未重新加载：${e.message}`)); }
};
$('webgl').onclick = () => { const url = new URL(location.href); url.searchParams.set('webgl', '1'); location.href = url.href; };
addEventListener('pagehide', () => {
  clearInterval(ticker); clearTimeout(saveTimer); clearTimeout(aiTimer);
  for (const pending of [...requests.values(), ...hostRequests.values()]) clearTimeout(pending.timer);
});
post('ready', { version: '0.3.0' });

// All model access is mediated by HIOS. No route credentials enter this plugin.
function aiHost(payload) {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const timer = setTimeout(() => { hostRequests.delete(requestId); reject(new Error('AI 宿主未响应，请更新 HIOS 到支持插件 AI 的版本')); }, 30000);
    hostRequests.set(requestId, {resolve,reject,timer}); post('ai-request', {requestId,...payload});
  });
}
// Shared by optional editor panels; one reply consumer prevents lost WASM replies.
export { request as editorRequest };
const aiMessage = (text, error = false) => { $('aiStatus').textContent = text; $('aiStatus').classList.toggle('error',error); };
function aiOptions(id, items, selected) {
  const select = $(id); select.replaceChildren();
  for (const [value,text] of items) { const option=document.createElement('option'); option.value=value; option.textContent=text; select.append(option); }
  if (items.some(([v]) => v === selected)) select.value=selected;
}
function aiMode() { return $('aiMode').value === 'psd' ? 'psd' : $('aiMode').value === 'generate' ? 'generate' : 'edit'; }
function aiModels() {
  aiOptions('aiModel',aiChoices.filter(c=>c.routeId===$('aiRoute').value && c.modes.includes(aiMode())).map(c=>[c.model,c.model]), state.aiSettings?.model);
}
function aiRoutes() {
  const choices=aiChoices.filter(c=>c.modes.includes(aiMode()));
  const routes=[...new Map(choices.map(c=>[c.routeId,[c.routeId,c.routeName]])).values()];
  aiOptions('aiRoute',routes,state.aiSettings?.routeId); aiModels();
  $('aiLayerOptions').hidden=aiMode()!=='psd';
  $('aiPrompt').hidden=aiMode()==='psd';
  $('aiHint').textContent=aiMode()==='psd' ? '分层可能超过 5 分钟，最多等待 30 分钟。本地组装 PSD；请在更多中选择图片编辑模型。每层可能产生一次图片调用，文字为像素层。' : '结果作为新图层加入；按捕获范围定位，并保留原选区蒙版。';
  $('aiStart').textContent=aiMode()==='psd' ? '分层' : '生成';
  if (!routes.length) aiMessage('未配置对应模型，请在 HIOS 设置 → AI 路由中启用图片生成/编辑或 GPT 对话模型。');
  else aiMessage('AI 路由已就绪');
}
async function aiCatalog() {
  try { const catalog=await aiHost({action:'catalog'}); aiProtocol=catalog.psdProtocol; aiChoices=catalog.choices || []; aiRoutes(); }
  catch(e) { aiMessage(e.message,true); }
}
function aiSettings() {
  state.aiSettings={mode:$('aiMode').value,scope:$('aiScope').value,routeId:$('aiRoute').value,model:$('aiModel').value,layers:Number($('aiLayers').value)||3,prompt:$('aiPrompt').value}; remember();
}
async function captureAI() {
  await initTask; await saveDocument();
  if (!doc && aiMode()==='generate') { aiCapture=null; return null; }
  const captured=await request('ai-context',JSON.stringify({token:crypto.randomUUID(),scope:$('aiScope').value}));
  const {bytes,...context}=captured;
  try {
    const stored=await storeFile({bytes,name:'AI范围.png',format:'png'},crypto.randomUUID());
    let mask;
    if (context.hasMask) {
      const value=await request('ai-mask',JSON.stringify({token:context.token}));
      mask=await storeFile({bytes:value.bytes,name:'AI选区.png',format:'png'},crypto.randomUUID());
    }
    if (aiCapture) void request('ai-release',JSON.stringify({token:aiCapture.token})).catch(()=>{});
    aiCapture={...context,image:stored.url,mask:mask?.url};
    if (aiPreviewUrl) URL.revokeObjectURL(aiPreviewUrl);
    aiPreviewUrl=URL.createObjectURL(new Blob([bytes],{type:'image/png'}));
    $('aiPreview').src=aiPreviewUrl; $('aiPreview').hidden=false;
    $('aiBounds').textContent=`${context.bounds[2]} × ${context.bounds[3]} · ${context.scope === 'selection' ? '选区' : context.scope === 'layer' ? '图层' : '画布'}`;
    return aiCapture;
  } catch(e) { void request('ai-release',JSON.stringify({token:context.token})).catch(()=>{}); throw e; }
}
function aiRunning(running) {
  $('aiStart').disabled=running; $('aiCancel').disabled=!running; $('aiCancel').hidden=!running; $('aiProgress').hidden=!running;
  $('aiStart').textContent=aiMode()==='psd' ? (running?'分层中…':'分层') : (running?'生成中…':'生成');
  for (const id of ['aiCapture','aiMode','aiScope','aiRoute','aiModel','aiLayers','aiPrompt']) $(id).disabled=running;
}
async function applyAI(asNewDocument = false) {
  const job=state.aiJob; if (!job?.output) return;
  let file=await readSource(job.output);
  if (job.output.name?.endsWith('.layers.json')) {
    aiMessage('正在本地组装 PSD…');
    const {composeLayers}=await import('./compose-layers.js');
    const bytes=await composeLayers(file.bytes,job.capture,readSource);
    const name=job.output.name.replace('.layers.json','.psd');
    const stored=await storeFile({bytes,name,format:'psd'},crypto.randomUUID());
    job.output={url:stored.url,name}; remember();
    file={bytes};
  }
  if (asNewDocument || !job.capture) await request('open',job.output.name,file.bytes);
  else {
    const c=job.capture; const mask=c.mask ? (await readSource({url:c.mask})).bytes : new Uint8Array();
    await request('ai-restore',JSON.stringify(c),mask);
    const result=await request(job.kind==='psd' ? 'ai-import-psd' : 'ai-apply-image',JSON.stringify({token:c.token}),file.bytes);
    if (result.warnings?.length) aiMessage(`已导入。PSD 兼容提示：${result.warnings.join('；')}`);
  }
  // Persist the edited document BEFORE recording completion; don't lose layers on reload.
  poll(); await saveDocument(); job.applied=true; remember();
  if (job.capture) void request('ai-release',JSON.stringify({token:job.capture.token})).catch(()=>{});
  $('aiApply').disabled=true; aiMessage(job.kind==='psd' ? 'PSD 已解析为独立图层，原图层保留。可在图层面板检查或撤销。' : 'AI 结果已加入新图层，原图层保留。');
}
async function watchAI() {
  clearTimeout(aiTimer);
  const job=state.aiJob; if (!job?.id) return;
  try {
    const result=await aiHost({action:'status',jobId:job.id});
    if (state.aiJob?.id !== job.id || job.cancelled) return;
    aiMessage(`${result.stage} · 已等待 ${Math.floor(result.elapsedSeconds/60)}分${result.elapsedSeconds%60}秒${result.error ? ` · ${result.error}` : ''}`,result.status==='error');
    if (result.status==='running') { aiRunning(true); aiTimer=setTimeout(()=>void watchAI(),4000); return; }
    aiRunning(false); job.status=result.status;
    if (result.status==='success') {
      if (!job.output?.name?.endsWith('.psd')) job.output=result.output;
      remember(); $('aiResultActions').hidden=false; $('aiApply').disabled=!!job.applied;
      if (!job.applied) {
        try { await applyAI(); } catch(e) { aiMessage(`结果已保留，自动导入未完成：${e.message}。可切回原文档重试，或作为新文档打开。`,true); }
      }
    } else remember();
  } catch(e) {
    if (/任务不存在|不属于|未启用|agent 权限/.test(e.message)) {
      aiRunning(false); aiMessage(`无法恢复该任务：${e.message}。没有重新提交。已保存结果仍可下载或打开。`,true); return;
    }
    aiMessage(`查询中断：${e.message}。稍后继续查询，不会重新提交。`,true);
    aiTimer=setTimeout(()=>void watchAI(),10000);
  }
}
async function startAI() {
  if (aiBusy) return; aiBusy=true; aiRunning(true);
  let submittedId='';
  try {
    aiSettings();
    if (!$('aiRoute').value || !$('aiModel').value) throw new Error('请先配置并选择对应 AI 路由和模型');
    if(aiMode()==='psd' && aiProtocol!=='editable-file/v1') throw new Error('请先更新 HIOS 至支持 PSD 任务接口的版本');
    const capture=await captureAI(), kind=aiMode()==='psd' ? 'psd' : 'image';
    const id=crypto.randomUUID();
    submittedId=id;
    state.aiJob={id,kind,capture,status:'submitting'}; remember(); $('aiResultActions').hidden=true;
    aiMessage('正在提交…');
    await aiHost({action:'start',clientId:id,kind,mode:aiMode(),routeId:$('aiRoute').value,model:$('aiModel').value,prompt:aiMode()==='psd'?'':$('aiPrompt').value,layers:Number($('aiLayers').value),image:capture?.image,size:'1024x1024'});
    void watchAI();
  } catch(e) { aiRunning(false); aiMessage(e.message,true); if (submittedId) aiTimer=setTimeout(()=>void watchAI(),1000); }
  finally { aiBusy=false; }
}
async function initializeAI() {
  const s=state.aiSettings;
  if (s) { $('aiMode').value=s.mode||'psd'; $('aiScope').value=s.scope||'canvas'; $('aiLayers').value=s.layers||3; $('aiPrompt').value=s.prompt||''; }
  await aiCatalog();
  if (state.aiJob?.id) {
    if (state.aiJob.output) { $('aiResultActions').hidden=false; $('aiApply').disabled=!!state.aiJob.applied; }
    void watchAI();
  }
}
$('aiRefresh').onclick=()=>void aiCatalog();
$('aiRoute').onchange=()=>{aiModels();aiSettings();};
$('aiModel').onchange=aiSettings;
$('aiMode').onchange=()=>{ if ($('aiMode').value==='edit') $('aiScope').value='selection'; else $('aiScope').value='canvas'; aiRoutes(); aiSettings(); };
$('aiScope').onchange=aiSettings;
$('aiCapture').onclick=()=>void captureAI().catch(e=>aiMessage(e.message,true));
$('aiStart').onclick=()=>void startAI();
$('aiCancel').onclick=async()=>{
  const job=state.aiJob; if (!job) return;
  try { const result=await aiHost({action:'cancel',jobId:job.id}); job.cancelled=true; job.status='cancelled'; remember(); clearTimeout(aiTimer); aiRunning(false); aiMessage(result.stage); }
  catch(e) {aiMessage(e.message,true);}
};
$('aiApply').onclick=()=>void applyAI().catch(e=>aiMessage(e.message,true));
$('aiOpenResult').onclick=()=>void applyAI(true).catch(e=>aiMessage(e.message,true));
$('aiDownload').onclick=async()=>{try {const f=await readSource(state.aiJob.output);download(f.bytes,state.aiJob.output.name,fileMime(state.aiJob.kind==='psd'?'psd':'png'));}catch(e){aiMessage(e.message,true);}};
