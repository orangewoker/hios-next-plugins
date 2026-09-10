import {
  DEFAULT_WORKFLOW_ID,
  MAX_MEDIA_BYTES,
  defaultsForWorkflow,
  fileNameForResult,
  isMediaField,
  mergeConnectedInputs,
  mimeForKind,
  normalizeStatus,
  resultUrl,
  submitUrl,
  submittedTask,
  taskLabel,
  taskSnapshot,
  validateAndBuildBody,
  workflowMetadataUrl,
  normalizeWorkflow,
} from '../shared/core.js';
import { sourceAsApiValue } from '../shared/client.js';
import { loadConfig, loadToken, saveConfig, saveTask, watchStorage } from '../shared/storage.js';

const PROTOCOL = 'hios-plugin-node/v1';
// The host network bridge intentionally caps request bodies at 2 MB. AutoDL
// accepts data URLs, so larger local-reference submissions must use the
// plugin iframe's permission-gated direct fetch path instead of being
// truncated by the bridge.
const HOST_BODY_LIMIT = 1_750_000;
const $ = (id) => document.getElementById(id);
const pendingNetwork = new Map();
let nodeId = '';
let pluginId = 'compute-cloud';
let config = loadConfig();
let workflows = config.workflows;
let selectedWorkflowId = config.defaultWorkflowId || DEFAULT_WORKFLOW_ID;
let state = { values: {}, activeTask: null };
let inputs = {};
let polling = null;
let elapsedTimer = 0;
let initialized = false;

function post(type, payload = {}) {
  parent.postMessage({ protocol: PROTOCOL, nodeId, pluginId, type, payload }, '*');
}

function applyTheme(theme) {
  if (!theme?.tokens) return;
  const map = { background: '--bg', surface: '--surface', muted: '--muted', control: '--control', text: '--text', textSecondary: '--text-2', border: '--border', accent: '--accent' };
  Object.entries(map).forEach(([name, variable]) => theme.tokens[name] && document.documentElement.style.setProperty(variable, theme.tokens[name]));
}

function persist(patch = {}) {
  state = { ...state, ...patch };
  post('state', { state });
}

function workflow() {
  return workflows.find((item) => item.id === selectedWorkflowId) || workflows[0] || null;
}

function hostRequest(url, options = {}) {
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pendingNetwork.delete(requestId); reject(new Error('算力云接口请求超时')); }, Number(options.timeoutMs || 60_000));
    pendingNetwork.set(requestId, { resolve, reject, timer });
    post('network-request', { requestId, url, method: options.method || 'GET', headers: options.headers || {}, body: options.body });
  });
}

async function hostJson(url, options = {}) {
  if (typeof options.body === 'string' && options.body.length > HOST_BODY_LIMIT) return directJson(url, options);
  const result = await hostRequest(url, options);
  const text = String(result?.body || '');
  let payload;
  try { payload = text ? JSON.parse(text) : {}; } catch { throw new Error(`接口返回了非 JSON 内容（HTTP ${result?.status || 0}）`); }
  if (!result?.ok) throw new Error(String(payload?.error?.message || payload?.msg || payload?.message || `HTTP ${result?.status || 0}`));
  return payload;
}

async function directJson(url, options = {}) {
  let response;
  try {
    response = await fetch(url, { method: options.method || 'GET', headers: options.headers || {}, body: options.body, cache: 'no-store' });
  } catch (error) {
    throw new Error(`大素材直连上传失败：${error.message}`);
  }
  const text = await response.text();
  let payload;
  try { payload = text ? JSON.parse(text) : {}; } catch { throw new Error(`接口返回了非 JSON 内容（HTTP ${response.status}）`); }
  if (!response.ok) throw new Error(String(payload?.error?.message || payload?.msg || payload?.message || `HTTP ${response.status}`));
  return payload;
}

async function ensureDefaultWorkflow() {
  if (workflows.length) return workflow();
  const metadata = normalizeWorkflow(await hostJson(workflowMetadataUrl(config.baseUrl, DEFAULT_WORKFLOW_ID)));
  workflows = [metadata]; selectedWorkflowId = metadata.id;
  config = saveConfig({ ...config, workflows, defaultWorkflowId: metadata.id });
  return metadata;
}

function inputCounts() {
  const count = (value) => Array.isArray(value) ? value.length : value ? 1 : 0;
  return { images: count(inputs.images), videos: count(inputs.videos), audios: count(inputs.audios), files: count(inputs.files) };
}

function renderWorkflowSelect() {
  const select = $('workflowSelect'); select.replaceChildren();
  if (!workflows.length) { const option = document.createElement('option'); option.textContent = '正在加载默认工作流…'; option.value = ''; select.append(option); select.disabled = true; return; }
  select.disabled = false;
  workflows.forEach((item) => { const option = document.createElement('option'); option.value = item.id; option.textContent = item.name; option.selected = item.id === selectedWorkflowId; select.append(option); });
}

function render() {
  renderWorkflowSelect();
  const current = workflow();
  $('subtitle').textContent = current ? current.name : 'AutoDL · ComfyUI API';
  $('workflowDescription').textContent = current ? `${current.id} · ${current.description || `${current.fields.length} 个参数`}` : '请先在算力云应用中添加工作流';
  const counts = inputCounts();
  $('inputSummary').textContent = `连线输入：${counts.images} 图 · ${counts.videos} 视频 · ${counts.audios} 音频 · ${counts.files} 文件`;
  renderFields(current);
  renderTask();
}

function renderFields(current) {
  const host = $('fields'); host.replaceChildren();
  if (!current) return;
  const values = { ...defaultsForWorkflow(current), ...(state.values || {}) };
  current.fields.forEach((field) => {
    const label = document.createElement('label');
    label.className = isMediaField(field) ? 'media-field' : field.type === 'prompt' || field.type === 'string' && field.max > 300 ? 'wide' : '';
    const caption = document.createElement('span'); caption.textContent = field.label;
    if (field.required) { const mark = document.createElement('b'); mark.className = 'required'; mark.textContent = ' *'; caption.append(mark); }
    label.append(caption);
    const value = values[field.name] ?? '';
    if (isMediaField(field)) {
      const row = document.createElement('div'); row.className = 'media-row';
      const input = document.createElement('input'); input.type = 'text'; input.placeholder = '连接画布素材、输入 URL 或选择文件'; input.value = String(value || '');
      input.onchange = () => updateValue(field.name, input.value);
      const choose = document.createElement('button'); choose.type = 'button'; choose.textContent = '选择'; choose.onclick = () => chooseMedia(field);
      const hint = document.createElement('div'); hint.className = 'media-value'; hint.textContent = connectedHint(current, field) || (value ? '已设置节点内素材' : '');
      row.append(input, choose); label.append(row, hint); host.append(label); return;
    }
    let input;
    if (field.type === 'prompt' || (field.type === 'string' && Number(field.max || 0) > 300) || ['array', 'mixed_array', 'object'].includes(field.type)) input = document.createElement('textarea');
    else if (field.type === 'enum') { input = document.createElement('select'); if (!field.required) addOption(input, '', '使用默认值'); field.options.forEach((option) => addOption(input, option.value, option.label)); }
    else if (field.type === 'boolean' || field.type === 'bool') { input = document.createElement('select'); addOption(input, '', '使用默认值'); addOption(input, 'true', '是'); addOption(input, 'false', '否'); }
    else { input = document.createElement('input'); input.type = ['integer', 'int', 'number', 'float'].includes(field.type) ? 'number' : 'text'; if (field.min != null) input.min = String(field.min); if (field.max != null) input.max = String(field.max); }
    const connectedPrompt = field.name === 'prompt' && inputs.prompt;
    input.value = connectedPrompt ? String(Array.isArray(inputs.prompt) ? inputs.prompt[0] : inputs.prompt) : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value ?? '');
    input.disabled = Boolean(connectedPrompt);
    input.onchange = () => updateValue(field.name, input.value);
    input.oninput = input.onchange;
    label.append(input); host.append(label);
  });
}

function addOption(select, value, label) { const option = document.createElement('option'); option.value = String(value ?? ''); option.textContent = label; select.append(option); }

function connectedHint(current, field) {
  const counts = inputCounts();
  const fields = current.fields.filter((item) => item.type === field.type || (field.type === 'image' && item.type === 'media'));
  const index = fields.findIndex((item) => item.name === field.name);
  if (field.type === 'image' && index >= 0 && index < counts.images) return `使用画布连接的第 ${index + 1} 张图片`;
  if (field.type === 'video' && index >= 0 && index < counts.videos) return `使用画布连接的第 ${index + 1} 个视频`;
  if (field.type === 'audio' && index >= 0 && index < counts.audios) return `使用画布连接的第 ${index + 1} 个音频`;
  if (field.type === 'file' && index >= 0 && index < counts.files) return `使用画布连接的第 ${index + 1} 个文件`;
  return '';
}

function updateValue(name, value) {
  persist({ values: { ...(state.values || {}), [name]: value } });
}

function chooseMedia(field) {
  const requestId = crypto.randomUUID();
  state.pendingFile = { requestId, fieldName: field.name };
  post('request-file', { requestId, portId: field.name, accept: field.acceptTypes?.join(',') || (field.type === 'file' ? '*/*' : `${field.type}/*`), multiple: false });
}

function taskTone(status) {
  const value = normalizeStatus(status);
  return ['SUCCESS', 'SUCCEEDED', 'COMPLETED', 'COMPLETE'].includes(value) ? 'success' : ['FAILED', 'FAILURE', 'ERROR', 'CANCELLED', 'CANCELED'].includes(value) ? 'failed' : value ? 'running' : '';
}

function renderTask() {
  const task = state.activeTask;
  $('statusDot').className = taskTone(task?.status);
  $('statusText').textContent = task ? taskLabel(task.status) : '准备就绪';
  $('taskId').textContent = task?.taskId || '';
  $('elapsed').textContent = task?.duration != null ? `${task.duration} 秒` : '';
  $('activity').classList.toggle('hidden', !polling);
  $('resume').disabled = !task?.taskId || Boolean(task.terminal) || Boolean(polling);
  $('stop').disabled = !polling;
  const error = String(task?.message || ''); $('error').textContent = error; $('error').classList.toggle('hidden', !error || task?.success);
  if (task?.results?.length) renderPreview(task.results[0]);
  else { const preview = $('preview'); preview.className = 'preview'; preview.textContent = task ? '任务完成后将在这里预览结果' : '生成结果将在这里预览'; }
}

function renderPreview(result) {
  const host = $('preview'); host.replaceChildren(); host.className = 'preview';
  let media;
  if (result.kind === 'image') { media = document.createElement('img'); media.src = result.url; media.alt = '生成结果'; }
  else if (result.kind === 'video') { media = document.createElement('video'); media.src = result.url; media.controls = true; media.preload = 'metadata'; }
  else if (result.kind === 'audio') { media = document.createElement('audio'); media.src = result.url; media.controls = true; }
  else { media = document.createElement('a'); media.href = result.url; media.target = '_blank'; media.rel = 'noreferrer'; media.textContent = '打开生成文件'; }
  host.append(media);
}

function tokenHeaders() {
  const token = loadToken();
  if (!token) throw new Error('请先在算力云应用中配置 AutoDL ComfyUI Token');
  return { Authorization: token, 'Content-Type': 'application/json' };
}

async function normalizeMediaBody(current, values) {
  const body = validateAndBuildBody(current, values);
  for (const field of current.fields.filter(isMediaField)) if (body[field.name]) body[field.name] = await sourceAsApiValue(body[field.name]);
  const localMediaBytes = current.fields.filter(isMediaField).reduce((total, field) => {
    const value = String(body[field.name] || '');
    if (!value.startsWith('data:')) return total;
    const comma = value.indexOf(',');
    if (comma < 0) return total;
    const payload = value.slice(comma + 1);
    return total + (/;base64/i.test(value.slice(0, comma)) ? Math.floor(payload.length * 3 / 4) : new TextEncoder().encode(decodeURIComponent(payload)).byteLength);
  }, 0);
  if (localMediaBytes > MAX_MEDIA_BYTES) throw new Error('所有本地媒体文件总和不能超过 50MB');
  return body;
}

async function run(nextInputs = inputs) {
  if (polling) return;
  inputs = nextInputs || inputs;
  try {
    const current = workflow() || await ensureDefaultWorkflow();
    render();
    const merged = mergeConnectedInputs(current, state.values, inputs);
    persist({ activeTask: { status: 'QUEUED', message: '正在准备素材…', taskId: '', terminal: false, success: false, failed: false, results: [] } });
    renderTask();
    const body = await normalizeMediaBody(current, merged);
    const payload = await hostJson(submitUrl(config.baseUrl, current.id), { method: 'POST', headers: tokenHeaders(), body: JSON.stringify(body), timeoutMs: 120_000 });
    const submitted = submittedTask(payload);
    const task = { ...submitted, workflowId: current.id, workflowName: current.name, baseUrl: config.baseUrl, terminal: false, success: false, results: [] };
    persist({ activeTask: task }); saveTask(task);
    post('output', { kind: 'json', portId: 'task', value: { taskId: task.taskId, workflowId: current.id, status: task.status, createdAt: task.createdAt }, name: `${current.name}任务` });
    startPolling(task);
  } catch (error) {
    setStatus({ status: 'FAILED', message: error.message, terminal: true, failed: true });
    post('error', { message: error.message });
  }
}

function setStatus(patch) {
  persist({ activeTask: { ...(state.activeTask || {}), ...patch } });
  renderTask();
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => { const timer = setTimeout(resolve, ms); signal.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); }, { once: true }); });
}

async function startPolling(task = state.activeTask) {
  if (!task?.taskId || polling) return;
  const controller = new AbortController(); polling = controller; const started = Date.now();
  clearInterval(elapsedTimer); elapsedTimer = setInterval(() => { $('elapsed').textContent = `${Math.round((Date.now() - started) / 1000)} 秒`; }, 1000); renderTask();
  try {
    const deadline = Date.now() + config.maxWaitMinutes * 60_000;
    while (!controller.signal.aborted && Date.now() < deadline) {
      await delay(config.pollIntervalMs, controller.signal);
      const payload = await hostJson(resultUrl(task.baseUrl || config.baseUrl, task.taskId), { headers: tokenHeaders(), timeoutMs: 60_000 });
      const snapshot = taskSnapshot(payload);
      const next = { ...task, ...snapshot, workflowId: task.workflowId, workflowName: task.workflowName, baseUrl: task.baseUrl || config.baseUrl };
      persist({ activeTask: next }); saveTask(next); renderTask();
      if (snapshot.terminal) {
        if (snapshot.success) { post('loaded', { taskId: task.taskId }); emitResults(next); }
        else post('error', { message: snapshot.message || '算力云任务失败' });
        return;
      }
    }
    if (!controller.signal.aborted) setStatus({ message: `等待超过 ${config.maxWaitMinutes} 分钟，可稍后继续查询` });
  } catch (error) {
    if (error.name !== 'AbortError') setStatus({ message: error.message });
  } finally {
    clearInterval(elapsedTimer); elapsedTimer = 0; polling = null; renderTask();
  }
}

function emitResults(task) {
  const current = workflows.find((item) => item.id === task.workflowId) || { id: task.workflowId, name: task.workflowName };
  task.results.forEach((result, index) => {
    const kind = ['image', 'video', 'audio'].includes(result.kind) ? result.kind : 'file';
    post('output', {
      kind,
      portId: kind,
      source: result.url,
      url: result.url,
      name: fileNameForResult(current, result, index),
      mime: mimeForKind(kind, result.fileType),
      metadata: { taskId: task.taskId, workflowId: task.workflowId, workflowName: task.workflowName, addToCanvas: kind === 'image' },
    });
  });
}

$('workflowSelect').onchange = () => { selectedWorkflowId = $('workflowSelect').value; persist({ workflowId: selectedWorkflowId, values: defaultsForWorkflow(workflow()) }); render(); };
$('openApp').onclick = () => post('open-app', { appId: 'compute-cloud' });
$('resume').onclick = () => void startPolling();
$('stop').onclick = () => { polling?.abort(); setStatus({ message: '已停止本地轮询；云端任务可能仍在运行' }); };

window.addEventListener('message', (event) => {
  const message = event.data;
  if (!message || message.protocol !== PROTOCOL) return;
  if (message.type === 'init') {
    const payload = message.payload || {};
    nodeId = String(message.nodeId || payload.nodeId || nodeId);
    pluginId = String(message.pluginId || payload.pluginId || pluginId);
    applyTheme(payload.theme);
    inputs = payload.inputs || {};
    const incomingState = payload.state && typeof payload.state === 'object' ? payload.state : {};
    state = { values: {}, activeTask: null, ...state, ...incomingState, pendingFile: null };
    config = loadConfig(); workflows = config.workflows;
    selectedWorkflowId = String(state.workflowId || selectedWorkflowId || config.defaultWorkflowId || DEFAULT_WORKFLOW_ID);
    const firstInit = !initialized;
    initialized = true;
    render();
    post('loaded', { ready: true });
    if (!workflows.length) void ensureDefaultWorkflow().then(() => { render(); persist({ workflowId: selectedWorkflowId }); }).catch((error) => setStatus({ status: 'FAILED', message: error.message }));
    else if (firstInit && state.activeTask?.taskId && !state.activeTask.terminal) void startPolling(state.activeTask);
    return;
  }
  if (message.type === 'run') {
    void run(message.payload?.inputs || inputs);
    return;
  }
  if (message.type === 'network-result') {
    const payload = message.payload || {}; const pending = pendingNetwork.get(payload.requestId); if (!pending) return;
    pendingNetwork.delete(payload.requestId); clearTimeout(pending.timer); payload.error ? pending.reject(new Error(payload.error)) : pending.resolve(payload.result); return;
  }
  if (message.type === 'file-result') {
    const payload = message.payload || {}; const request = state.pendingFile;
    if (!request || payload.requestId !== request.requestId) return;
    const file = Array.isArray(payload.files) ? payload.files[0] : null;
    state.pendingFile = null;
    if (file?.url) { updateValue(request.fieldName, file.url); render(); }
    return;
  }
});

watchStorage(() => { config = loadConfig(); workflows = config.workflows; if (!workflows.some((item) => item.id === selectedWorkflowId)) selectedWorkflowId = config.defaultWorkflowId || workflows[0]?.id || DEFAULT_WORKFLOW_ID; render(); });
post('ready', { version: '0.1.0' });
