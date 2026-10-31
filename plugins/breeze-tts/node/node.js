import { DEFAULT_FORM, PARAMS, buildRequest, applyInputs, inputValue, jobOutputs, newId, MAX_HOST_AUDIO_BYTES } from '../shared/core.js';
import { enhanceSelects, enhanceFileInputs, syncSelects } from '../shared/controls.js';
import { HiosBridge } from '../shared/bridge.js';
import { WorkshopClient, loadConnection, saveConnection, fileDataUrl, referenceData } from '../shared/client.js';
import { StatusMonitor } from '../shared/status.js';
import { EngineControl, engineButton } from '../shared/engine-control.js';
const $ = id => document.getElementById(id), bridge = new HiosBridge('node');
let config = loadConnection(), client = new WorkshopClient(config, bridge), active = null, features = {}, inputs = {}, state = {}, url = '', runNumber = 0;
let lastStatus = null, wasReady = false, closing = false, connectionReady = false, engineMessage = false, timer, syncTask = null;
const engineControl = new EngineControl();
function renderEngineButton() {
  const view = engineButton(lastStatus, client, { pending: engineControl.pending, generating: Boolean(active) }), button = $('toggle-engine');
  button.hidden = !view.visible; button.disabled = view.disabled; button.textContent = view.label; button.title = view.title;
  button.classList.toggle('hios-primary', view.action === 'start');
  button.setAttribute('aria-label', view.action === 'start' ? '启动模型' : '停止模型');
}
function connectionFailed() { lastStatus = null; wasReady = false; $('connection-label').textContent = '连接失败'; renderEngineButton(); }
const statusMonitor = new StatusMonitor(() => client, (status) => {
  lastStatus = status; $('connection-label').textContent = status.badge;
  if (status.ready && !wasReady) void voices().catch(() => {});
  if (engineMessage && !active && ['ready', 'stopped', 'error'].includes(status.state)) message(status.ready ? '模型已就绪' : status.state === 'stopped' ? '模型已停止' : '模型启动失败，请在应用的「模型与服务」查看日志', status.state === 'error');
  wasReady = status.ready; renderEngineButton();
}, connectionFailed);
async function syncConnection() {
  if (syncTask) return syncTask;
  syncTask = (async () => {
    const next = new WorkshopClient(loadConnection(), bridge); await next.bootstrap(); if (closing) return;
    const keys = ['mode', 'localUrl', 'remoteUrl', 'port', 'sharing', 'accessKey'];
    if (!connectionReady || next.adminToken !== client.adminToken || keys.some(k => next.config[k] !== client.config[k])) {
      statusMonitor.invalidate(); client = next; lastStatus = null; wasReady = false;
      config = { ...client.config }; fillConnection(); connectionReady = true;
    }
    renderEngineButton();
  })();
  try { await syncTask; } finally { syncTask = null; }
}
async function refreshStatus() { await statusMonitor.refresh(); }
$('toggle-engine').onclick = async () => {
  try {
    if (engineControl.pending) return;
    await syncConnection(); await refreshStatus();
    const task = engineControl.toggle(client, lastStatus, Boolean(active)); renderEngineButton();
    const action = await task; statusMonitor.invalidate(); await refreshStatus();
    engineMessage = true; message(action === 'start' ? (lastStatus?.ready ? '模型已就绪' : '模型正在启动 / 预热，可在这里点击停止') : '模型已停止');
  } catch (e) { message(e.message, true); }
  finally { renderEngineButton(); }
};
for (const key of Object.keys(PARAMS).filter(k => !['seed', 'cfg_scale'].includes(k))) {
  const label = document.createElement('label'); label.className = 'field'; const span = document.createElement('span'); span.textContent = ({ temperature: '采样温度', top_k: 'Top K', top_p: 'Top P', repetition_penalty: '重复惩罚', split_chars: '分句预算', max_new_tokens: '每段帧数上限' })[key];
  const input = document.createElement('input'); input.id = key; input.className = 'hios-control'; input.type = 'number'; input.value = DEFAULT_FORM[key]; input.min = PARAMS[key][0]; input.max = PARAMS[key][1]; input.step = PARAMS[key][2] ? '1' : '0.05'; label.append(span, input); $('advanced').append(label);
}
function message(s, error = false) { $('status').textContent = s; $('status').classList.toggle('error', error); }
function updateMode() { $('reference-fields').hidden = $('mode').value === 'design'; $('instruction-field').hidden = $('mode').value === 'clone'; $('reference-upload').hidden = Boolean($('voice_id').value); syncSelects(); }
function form() { return { ...state, ...Object.fromEntries(['text', 'mode', 'voice_id', 'ref_text', 'instruction', ...Object.keys(PARAMS)].map(k => [k, $(k).value])) }; }
function persist() { state = { ...form() }; bridge.post('state', { state }); }
function restore(s) { state = { ...DEFAULT_FORM, ...s }; for (const k of ['text', 'mode', 'ref_text', 'instruction', ...Object.keys(PARAMS)]) $(k).value = state[k]; if (state.voice_id && ![...$('voice_id').options].some(o => o.value === state.voice_id)) $('voice_id').add(new Option(state.voice_id, state.voice_id)); $('voice_id').value = state.voice_id || ''; updateMode(); }
for (const key of ['text', 'mode', 'voice_id', 'ref_text', 'instruction', ...Object.keys(PARAMS)]) $(key).addEventListener('change', () => { updateMode(); persist(); });
function fillConnection() { $('connection-mode').value = config.mode; $('service-url').value = config.mode === 'remote' ? config.remoteUrl : config.localUrl; $('access-key').value = config.accessKey; $('node-connection-fields').hidden = bridge.managed; $('open-settings').hidden = !bridge.managed; syncSelects(); }
$('connection-mode').onchange = () => { $('service-url').value = $('connection-mode').value === 'remote' ? config.remoteUrl : config.localUrl; };
async function voices() {
  const data = await client.request('/api/voices'), current = $('voice_id').value || state.voice_id;
  $('voice_id').replaceChildren(new Option('使用参考音频', '')); for (const v of data) $('voice_id').add(new Option(v.id, v.id)); if (data.some(v => v.id === current)) $('voice_id').value = current; updateMode();
}
async function connect() { await refreshStatus(); }
$('connect').onclick = async () => { try { if (active) throw new Error('请先结束当前任务'); config = { ...config, mode: $('connection-mode').value, [$('connection-mode').value === 'remote' ? 'remoteUrl' : 'localUrl']: $('service-url').value.trim(), accessKey: $('access-key').value.trim() }; await saveConnection(config, bridge); client = new WorkshopClient(config, bridge); await client.bootstrap(); config = { ...client.config }; fillConnection(); await connect(); message('连接已保存'); } catch (e) { message(e.message, true); } };
$('open-settings').onclick = () => bridge.post('open-app', { appId: 'studio', payload: { page: 'connection' } });
$('refresh-voices').onclick = () => voices().catch(e => message(e.message, true));
async function run(payload = {}) {
  engineMessage = false; active?.abort(); const serial = ++runNumber, controller = new AbortController(); active = controller;
  $('run').disabled = true; $('cancel').hidden = false; renderEngineButton(); const runId = payload.runId || newId();
  try {
    // Reload shared connection so changes made in the application take effect without remounting.
    await syncConnection();
    const values = applyInputs(form(), payload.inputs || inputs);
    const ref = inputValue((payload.inputs || inputs).reference_audio) || $('reference').files[0];
    if (values.mode !== 'design' && !values.voice_id) values.reference = await referenceData(ref);
    const request = buildRequest(values);
    const job = await client.synthesize({ ...request, idempotencyKey: runId }, { signal: controller.signal, onProgress: j => { if (serial === runNumber) message(j.status === 'generating' ? '正在生成语音…' : '正在连接引擎…'); } });
    const audio = await client.artifact(job, controller.signal); controller.signal.throwIfAborted();
    if (serial !== runNumber) { if (audio.blob) URL.revokeObjectURL(audio.playUrl); return; }
    if (bridge.embedded && !audio.source && audio.size > MAX_HOST_AUDIO_BYTES) { URL.revokeObjectURL(audio.playUrl); throw new Error('音频超过旧版宿主导入上限，请更新 HIOS'); }
    if (url) URL.revokeObjectURL(url); url = audio.playUrl; $('player').src = url; $('player').hidden = false; $('download').href = url; $('download').download = `breeze-${job.id}.wav`; $('download').hidden = false;
    const source = audio.source || (bridge.embedded ? await fileDataUrl(audio.blob) : url);
    controller.signal.throwIfAborted(); if (serial !== runNumber) return;
    state = { ...form(), jobId: job.id }; bridge.post('state', { state });
    const outputs = jobOutputs(job, source);
    if (features.outputBatch) bridge.post('output-batch', { runId, outputs }); else bridge.post('output', outputs[0]);
    message(`已生成 ${job.info.duration.toFixed(1)} 秒音频`);
  } catch (e) { if (serial === runNumber) { message(e.name === 'AbortError' ? '已取消' : e.message, true); bridge.post('error', { runId, message: e.name === 'AbortError' ? '已取消生成' : e.message }); } }
  finally { if (serial === runNumber) { active = null; $('run').disabled = false; $('cancel').hidden = true; renderEngineButton(); void refreshStatus().catch(() => {}); } }
}
$('run').onclick = () => run(); $('cancel').onclick = () => active?.abort();
bridge.on((type, payload) => {
  if (type === 'init') {
    const first = !bridge.initConnectionStarted; bridge.initConnectionStarted = true;
    if (first) void initConnection();
    features = payload.features || {}; inputs = payload.inputs || {}; if (!active) restore(payload.state);
    $('run').hidden = Boolean(payload.hostRunControl); $('input-hint').textContent = inputs.text !== undefined ? '已连接文本输入' : '连线输入优先';
  }
  if (type === 'run') void run(payload);
  if (type === 'cancel') active?.abort();
});
async function initConnection() {
  try { await syncConnection(); if (!bridge.managed && client.adminToken) await saveConnection(config); await connect(); }
  catch (e) { fillConnection(); connectionFailed(); message(e.message, true); }
  clearTimeout(timer);
  const poll = async () => {
    try { if (!active && !engineControl.pending) await syncConnection(); await refreshStatus(); } catch { connectionFailed(); /* Keep generation messages intact. */ }
    if (!closing) timer = setTimeout(poll, 1800);
  };
  if (!closing) timer = setTimeout(poll, 1800);
}
restore({}); enhanceSelects(); enhanceFileInputs(); fillConnection(); renderEngineButton(); bridge.ready();
if (!bridge.embedded) await initConnection();
window.addEventListener('storage', e => { if (e.key === 'hios.breeze.connection.v1' && !active) { config = loadConnection(); client = new WorkshopClient(config, bridge); fillConnection(); void connect().catch(e => message(e.message, true)); } });
window.addEventListener('beforeunload', () => { closing = true; statusMonitor.dispose(); clearTimeout(timer); active?.abort(); if (url) URL.revokeObjectURL(url); });
