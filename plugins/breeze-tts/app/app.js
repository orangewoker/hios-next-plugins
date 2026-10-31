import { DEFAULT_FORM, PARAMS, buildRequest, formatBytes, inputValue, MAX_HOST_AUDIO_BYTES } from '../shared/core.js';
import { WorkshopClient, loadConnection, saveConnection, fileDataUrl, referenceData } from '../shared/client.js';
import { enhanceSelects, enhanceFileInputs, syncSelects } from '../shared/controls.js';
import { copyText } from '../shared/clipboard.js';
import { HiosBridge } from '../shared/bridge.js';
import { StatusMonitor } from '../shared/status.js';

const $ = id => document.getElementById(id), bridge = new HiosBridge('app');
let config = loadConnection(), client = new WorkshopClient(config, bridge), mode = 'design', active = null, playerUrl = '', currentPage = 'create', timer, initialized = false, hiddenWorkflow = false, restoredVoiceId = '';
const workflowRuns = new Map();
let closing = false, wasReady = false, pollEpoch = 0;
function connectionFailed(error) {
  wasReady = false; $('status').classList.remove('online'); $('status').querySelector('span').textContent = '连接失败 · 点此设置';
  $('connection-message').textContent = `当前连接失败 · ${error.message}`;
}
const statusMonitor = new StatusMonitor(() => client, (status) => {
  $('status').classList.add('online'); $('status').querySelector('span').textContent = status.badge;
  $('connection-message').textContent = status.message;
  if (status.ready && !wasReady) void refreshVoices().catch(() => {});
  wasReady = status.ready;
}, connectionFailed);
const labels = { temperature: '采样温度', top_k: 'Top K', top_p: 'Top P', repetition_penalty: '重复惩罚', split_chars: '分句预算', max_new_tokens: '每段帧数上限' };
const stageNames = { preparing: '准备中', downloading: '下载中', verifying: '校验中', extracting: '解压中', ready: '已就绪', paused: '已暂停', missing: '未下载', error: '失败', starting: '正在连接引擎', generating: '正在生成', failed: '失败', cancelled: '已取消', interrupted: '已中断', stopped: '未启动', loading: '模型加载中', external: '外部引擎' };
for (const [key, label] of Object.entries(labels)) {
  const el = document.createElement('label'); el.className = 'field'; const span = document.createElement('span'); span.textContent = label;
  const input = document.createElement('input'); input.id = key; input.className = 'hios-control'; input.type = 'number'; input.min = PARAMS[key][0]; input.max = PARAMS[key][1]; input.step = PARAMS[key][2] ? '1' : '0.05'; input.value = DEFAULT_FORM[key]; el.append(span, input); $('advanced').append(el);
}
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => $('toast').hidden = true, 5000); }
const act = fn => async () => { try { await fn(); } catch (e) { toast(e.message); } };
function page(name) {
  currentPage = name;
  if (name !== 'connection') { $('manual-copy-key').value = ''; $('manual-copy-field').hidden = true; }
  document.querySelectorAll('.page').forEach(x => x.hidden = x.id !== `page-${name}`);
  document.querySelectorAll('.nav').forEach(x => x.classList.toggle('active', x.dataset.page === name));
  $('page-title').textContent = ({ create: '语音创作', voices: '音色库', models: '模型与服务', connection: '设置' })[name];
  if (name === 'voices') void refreshVoices().catch(() => {});
  if (name === 'models' && client.adminToken) void refreshManagement().catch(e => toast(e.message));
  if (initialized && !hiddenWorkflow) void refreshStatus().catch(() => {});
}
document.querySelectorAll('.nav').forEach(x => x.onclick = () => page(x.dataset.page));
$('status').onclick = () => page('connection');
function setMode(value) {
  mode = value; document.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('active', x.dataset.mode === mode));
  $('reference-fields').hidden = mode === 'design'; $('instruction-field').hidden = mode === 'clone'; $('instruction-label').textContent = mode === 'design' ? '描述你想要的声音' : '这次如何表达？';
}
document.querySelectorAll('[data-mode]').forEach(x => x.onclick = () => { setMode(x.dataset.mode); persistForm(); });
document.querySelectorAll('[data-insert]').forEach(x => x.onclick = () => { const t = $('text'); t.setRangeText(x.dataset.insert, t.selectionStart, t.selectionEnd, 'end'); t.focus(); updateCount(); persistForm(); });
function updateCount() { $('char-count').textContent = `${$('text').value.length} / 20000`; }
$('text').oninput = updateCount;
$('cfg_scale').oninput = () => $('cfg-label').textContent = Number($('cfg_scale').value).toFixed(1);
$('random-seed').onclick = () => { $('seed').value = crypto.getRandomValues(new Uint32Array(1))[0] % 2147483647; persistForm(); };
$('voice').onchange = () => { $('upload-fields').hidden = Boolean($('voice').value); syncSelects(); persistForm(); };
function formState() { return { ...DEFAULT_FORM, mode, text: $('text').value, voice_id: $('voice').value, ref_text: $('ref-text').value, instruction: $('instruction').value, ...Object.fromEntries(Object.keys(PARAMS).map(k => [k, Number($(k).value)])) }; }
function persistForm() { if (!hiddenWorkflow) bridge.post('state', { state: formState() }); }
for (const id of ['text', 'ref-text', 'instruction', ...Object.keys(PARAMS)]) $(id).addEventListener('change', persistForm);
function restoreForm(state) { if (!state || active) return; for (const k of ['text', 'instruction', ...Object.keys(PARAMS)]) if (state[k] !== undefined) $(k).value = state[k]; restoredVoiceId = state.voice_id || ''; $('ref-text').value = state.ref_text || ''; setMode(state.mode || 'design'); updateCount(); $('cfg_scale').dispatchEvent(new Event('input')); }

function connectionForm() { const mode = document.querySelector('[name=connection-mode]:checked').value; return { ...config, mode, [mode === 'remote' ? 'remoteUrl' : 'localUrl']: $('service-url').value.trim(), accessKey: $('access-key').value.trim(), port: Number($('service-port').value), sharing: $('sharing').checked }; }
function fillConnection() {
  document.querySelector(`[name=connection-mode][value="${config.mode === 'remote' ? 'remote' : 'local'}"]`).checked = true;
  $('address-label').textContent = config.mode === 'remote' ? '远程服务地址' : '本机服务地址'; $('service-url').value = config.mode === 'remote' ? config.remoteUrl : config.localUrl; $('access-key').value = config.accessKey;
  const localManaged = bridge.managed && config.mode === 'local';
  $('address-field').hidden = localManaged; $('key-field').hidden = localManaged;
  $('managed-local').hidden = !localManaged; $('standalone-sharing').hidden = bridge.managed; $('share-info').hidden = config.mode === 'remote' || !client.adminToken;
  $('service-port').value = config.port || 17860; $('sharing').checked = Boolean(config.sharing);
}
document.querySelectorAll('[name=connection-mode]').forEach(el => el.onchange = () => {
  const previousMode = config.mode; config[previousMode === 'remote' ? 'remoteUrl' : 'localUrl'] = $('service-url').value;
  config.mode = el.value; fillConnection();
});
for (const id of ['service-url', 'access-key', 'service-port', 'sharing']) $(id).addEventListener('input', () => { $('connection-test-message').textContent = ''; });
document.querySelectorAll('[name=connection-mode]').forEach(el => el.addEventListener('change', () => { $('connection-test-message').textContent = ''; }));
async function refreshStatus() { return statusMonitor.refresh(); }
async function connect() {
  const h = await refreshStatus();
  $('management').hidden = !client.adminToken; $('management-unavailable').hidden = Boolean(client.adminToken); $('share-info').hidden = !client.adminToken;
  await refreshHistory(); if (client.adminToken) await refreshManagement();
  return h;
}
$('test-connection').onclick = act(async () => {
  const button = $('test-connection'), draft = connectionForm(), probe = new WorkshopClient(draft, bridge);
  button.disabled = true; $('connection-test-message').textContent = '正在测试填写的连接…';
  try {
    const h = bridge.managed ? await bridge.workshop({ action: 'test-connection', config: draft }) : await probe.health();
    if (h.protocol !== 'breeze-workshop/v1') throw new Error('不是工坊服务');
    // Test feedback is not a second, frozen model-status label.
    $('connection-test-message').textContent = '填写的连接测试通过。修改连接后请保存；当前实际连接状态见上方。';
    await refreshStatus().catch(() => {});
  } catch (e) { $('connection-test-message').textContent = `填写的连接测试失败 · ${e.message}`; throw e; }
  finally { button.disabled = false; }
});
$('save-connection').onclick = act(async () => {
  if (active) throw new Error('请先结束当前生成，再切换连接');
  const next = connectionForm(); statusMonitor.invalidate(); config = { ...next, ...await saveConnection(next, bridge) }; client = new WorkshopClient(config, bridge); wasReady = false; await client.bootstrap(); config = { ...client.config }; if (!bridge.managed) await saveConnection(config); fillConnection();
  $('management').hidden = !client.adminToken; $('management-unavailable').hidden = Boolean(client.adminToken);
  try { await connect(); $('connection-test-message').textContent = '已保存，应用与画布节点将复用此连接。'; } catch (e) { connectionFailed(e); throw e; }
});
$('copy-key').onclick = act(async () => {
  const button = $('copy-key'); button.disabled = true; $('manual-copy-key').value = ''; $('manual-copy-field').hidden = true;
  try {
    if (bridge.managed) {
      const result = await bridge.workshop({ action: 'copy-connection-key' });
      if (!result?.copied) throw new Error('复制未完成');
    } else await copyText(client.config.accessKey);
    toast('连接密钥已复制');
  } catch {
    const key = bridge.managed ? (await bridge.workshop({ action: 'connection-info' })).accessKey : client.config.accessKey;
    if (!key) throw new Error('连接密钥为空，请先连接本机服务');
    $('manual-copy-key').value = key; $('manual-copy-field').hidden = false;
    $('manual-copy-key').focus(); $('manual-copy-key').select();
    toast('已选中连接密钥，请按 Ctrl+C（Mac 按 Cmd+C）复制');
  } finally { button.disabled = false; }
});

async function setResult(job, signal) {
  const audio = await client.artifact(job, signal); signal?.throwIfAborted();
  if (playerUrl) URL.revokeObjectURL(playerUrl); playerUrl = audio.playUrl;
  $('player').src = playerUrl; $('player').hidden = false; $('result-empty').hidden = true; $('download').href = playerUrl; $('download').download = `breeze-${job.id}.wav`; $('download').hidden = false;
  $('generation-state').textContent = `已完成 · ${job.info.duration.toFixed(1)} 秒 · ${job.info.sampleRate / 1000} kHz`;
  if (bridge.embedded) {
    if (audio.source) bridge.post('output', { output: { kind: 'audio', source: audio.source, mime: 'audio/wav', name: `breeze-${job.id}.wav` } });
    else if (audio.size <= MAX_HOST_AUDIO_BYTES) { const source = await fileDataUrl(audio.blob); signal?.throwIfAborted(); bridge.post('output', { output: { kind: 'audio', source, mime: 'audio/wav', name: `breeze-${job.id}.wav` } }); }
    else toast('音频超过旧版宿主导入上限，请下载 WAV 或更新 HIOS。');
  }
}
$('generate').onclick = act(async () => {
  if (active) return; const input = formState(); if (mode !== 'design' && !$('voice').value) input.reference = await referenceData($('reference').files[0]);
  const request = buildRequest(input), controller = new AbortController(); active = controller; $('generate').disabled = true; $('cancel').hidden = false;
  try { const job = await client.synthesize(request, { signal: controller.signal, onProgress: j => $('generation-state').textContent = `${stageNames[j.status] || j.status} · 已生成 ${formatBytes(j.bytes)}` }); await setResult(job, controller.signal); await refreshHistory(); }
  catch (e) { $('generation-state').textContent = e.name === 'AbortError' ? '已取消生成' : e.message; throw e; }
  finally { active = null; $('generate').disabled = false; $('cancel').hidden = true; void refreshStatus().catch(() => {}); }
});
$('cancel').onclick = () => active?.abort();
async function refreshHistory() {
  const jobs = await client.request('/api/jobs'); $('history').replaceChildren();
  if (!jobs.length) { const el = document.createElement('div'); el.className = 'empty'; el.textContent = '暂无生成记录。'; $('history').append(el); }
  for (const j of jobs.slice(0, 12)) {
    const el = document.createElement('div'); el.className = 'history-item'; const text = document.createElement('div'), strong = document.createElement('strong'), sub = document.createElement('p');
    strong.textContent = j.text.slice(0, 60); sub.textContent = `${new Date(j.createdAt).toLocaleString()} · ${stageNames[j.status] || j.status}${j.info?.duration ? ` · ${j.info.duration.toFixed(1)} 秒` : ''}${j.error ? ` · ${j.error}` : ''}`; text.append(strong, sub); el.append(text);
    if (j.status === 'ready') { const b = document.createElement('button'); b.className = 'hios-control'; b.textContent = '试听 / 下载'; b.onclick = act(() => setResult(j)); el.append(b); } $('history').append(el);
  }
}
$('refresh-history').onclick = act(refreshHistory);
async function refreshVoices() {
  const voices = await client.request('/api/voices'), selected = restoredVoiceId || $('voice').value; restoredVoiceId = ''; $('voice').replaceChildren(new Option('上传参考音频', '')); $('voice-list').replaceChildren();
  for (const voice of voices) { $('voice').add(new Option(`${voice.id}${voice.description ? ` · ${voice.description}` : ''}`, voice.id)); const el = document.createElement('div'); el.className = 'voice-item'; const text = document.createElement('div'), title = document.createElement('strong'), sub = document.createElement('p'), button = document.createElement('button'); title.textContent = voice.id; sub.textContent = voice.description || voice.ref_text; text.append(title, sub); button.className = 'hios-control'; button.textContent = '使用'; button.onclick = () => { setMode('clone'); $('voice').value = voice.id; $('upload-fields').hidden = true; syncSelects(); persistForm(); page('create'); }; el.append(text, button); $('voice-list').append(el); }
  if (!voices.length) $('voice-list').textContent = '暂无音色，上传参考 WAV 可保存音色。';
  if (voices.some(v => v.id === selected)) $('voice').value = selected;
  $('upload-fields').hidden = Boolean($('voice').value); syncSelects();
}
$('refresh-voices').onclick = act(refreshVoices);
$('save-voice').onclick = act(async () => {
  const button = $('save-voice'); button.disabled = true;
  try { const reference = await referenceData($('voice-reference').files[0]); if (!reference) throw new Error('请先选择参考 WAV'); await client.request('/api/voices', { method: 'POST', body: { name: $('voice-name').value, description: $('voice-description').value, ref_text: $('voice-transcript').value, reference } }); await refreshVoices(); toast('音色已保存到服务端'); }
  finally { button.disabled = false; }
});
for (const [id, title] of [['runtime', 'Windows 推理运行库'], ['model', 'Breeze TTS 2 · Q8_0']]) {
  const section = document.createElement('section'); section.className = 'hios-panel download-card';
  section.innerHTML = `<h2>${title}</h2><p id="${id}-state" class="hint"></p><progress id="${id}-progress" value="0" max="1"></progress><div class="actions"><button id="${id}-get" class="hios-control hios-primary">下载 / 继续</button><button id="${id}-pause" class="hios-control">暂停</button><button id="${id}-verify" class="hios-control">校验修复</button></div><p id="${id}-error" class="error-text"></p>`;
  $('download-cards').append(section);
  $(`${id}-get`).onclick = act(async () => { await acceptLicense(); await client.request('/api/admin/download', { method: 'POST', body: { id } }); await refreshManagement(); });
  $(`${id}-verify`).onclick = act(async () => { await acceptLicense(); await client.request('/api/admin/download', { method: 'POST', body: { id, repair: true } }); await refreshManagement(); });
  $(`${id}-pause`).onclick = act(async () => { await client.request('/api/admin/pause', { method: 'POST', body: { id } }); await refreshManagement(); });
}
async function acceptLicense() { if (!$('license').checked) throw new Error('请先阅读并确认模型使用许可'); await client.request('/api/admin/license', { method: 'POST', body: { accept: true } }); }
async function refreshManagement() {
  if (!client.adminToken) return;
  const target = client, s = await target.request('/api/admin/status'); if (target !== client || closing) return; $('license').checked ||= s.licenseAccepted;
  for (const id of ['runtime', 'model']) { const d = s.downloads[id]; $(`${id}-state`).textContent = `${stageNames[d.stage] || d.stage} · ${formatBytes(d.received)} / ${formatBytes(d.bytes)}`; $(`${id}-progress`).value = d.ready ? 1 : (d.received || 0) / d.bytes; $(`${id}-error`).textContent = d.error || ''; $(`${id}-get`).disabled = ['preparing', 'downloading', 'verifying', 'extracting'].includes(d.stage); $(`${id}-verify`).disabled = $(`${id}-get`).disabled; }
  $('engine-state').textContent = stageNames[s.engine.state] || s.engine.state; $('engine-error').textContent = s.engine.error || ''; $('data-dir').textContent = s.dataDir; $('logs').textContent = s.engine.logs.join('\n');
  $('start-engine').disabled = ['loading', 'ready'].includes(s.engine.state); $('stop-engine').disabled = s.engine.state === 'stopped';
  $('lan-addresses').value = s.urls.join('\n') || '未找到局域网网卡'; $('share-state').textContent = s.sharing ? '局域网已开放。请允许防火墙中的 TCP 服务端口。' : (bridge.managed ? '仅本机访问。可在设置中开启局域网共享并保存。' : '仅本机访问。需要共享时停止当前服务，再运行 start-lan.cmd。');
}
$('start-engine').onclick = act(async () => { await client.request('/api/admin/engine/start', { method: 'POST', body: { cpu: $('cpu').checked } }); statusMonitor.invalidate(); $('engine-state').textContent = '正在加载模型…'; await refreshStatus(); await refreshManagement(); });
$('stop-engine').onclick = act(async () => { await client.request('/api/admin/engine/stop', { method: 'POST', body: {} }); statusMonitor.invalidate(); await refreshStatus(); await refreshManagement(); });

const workflow = { id: 'tts', name: 'Breeze 语音合成', capabilities: ['audio', 'text'], runnable: true, fields: [
  { name: 'text', label: '朗读文本', type: 'textarea', required: true },
  { name: 'mode', label: '合成模式', type: 'string', defaultValue: 'design', options: [{ label: '音色设计', value: 'design' }, { label: '声音克隆', value: 'clone' }, { label: '风格引导', value: 'direction' }] },
  { name: 'instruction', label: '表达指令', type: 'textarea', defaultValue: DEFAULT_FORM.instruction },
  { name: 'voice_id', label: '服务端音色 ID', type: 'string' },
  { name: 'reference_audio', label: '参考 WAV', type: 'audio' }, { name: 'ref_text', label: '参考转录', type: 'string' },
  { name: 'seed', label: '随机种子', type: 'integer', defaultValue: 42, min: -1, max: 2147483647 }, { name: 'cfg_scale', label: '指令强度', type: 'number', defaultValue: 1, min: 1, max: 5 },
  ...Object.entries(labels).map(([name, label]) => ({ name, label, type: PARAMS[name][2] ? 'integer' : 'number', defaultValue: DEFAULT_FORM[name], min: PARAMS[name][0], max: PARAMS[name][1] }))
] };
bridge.on(async (type, payload) => {
  if (type === 'init' && payload.page) page(payload.page);
  if (type === 'init' && !initialized) { initialized = true; hiddenWorkflow = Boolean(payload.applicationWorkflowBridge); if (!hiddenWorkflow) { restoreForm(payload.state); void initConnection(); } }
  if (type !== 'application-workflow-request') return;
  const { requestId, method } = payload;
  if (method === 'cancel-workflow') { workflowRuns.get(payload.targetRequestId)?.abort(); return; }
  const reply = (result, error) => bridge.post('application-workflow-response', { requestId, ok: !error, ...(error ? { error: { message: error.message } } : { result }) });
  if (method === 'list-workflows') { reply([workflow]); return; }
  if (method !== 'run-workflow' || (payload.workflowId && payload.workflowId !== 'tts')) { reply(null, new Error('未知语音工作流')); return; }
  const controller = new AbortController(); workflowRuns.set(requestId, controller);
  try {
    const values = { ...DEFAULT_FORM, ...payload.values }; if (values.reference_audio) values.reference = await referenceData(inputValue(values.reference_audio));
    const c = new WorkshopClient(loadConnection(), bridge); await c.bootstrap();
    const job = await c.synthesize({ ...buildRequest(values), idempotencyKey: requestId }, { signal: controller.signal, onProgress: j => bridge.post('application-workflow-event', { requestId, event: 'progress', data: { taskId: j.id, status: j.status, message: stageNames[j.status] || j.status } }) });
    const audio = await c.artifact(job, controller.signal);
    if (!audio.source && audio.size > MAX_HOST_AUDIO_BYTES) { URL.revokeObjectURL(audio.playUrl); throw new Error('音频超过旧版宿主导入上限，请更新 HIOS'); }
    const output = audio.source ? { url: audio.source } : { dataUrl: await fileDataUrl(audio.blob) };
    if (audio.blob) URL.revokeObjectURL(audio.playUrl); controller.signal.throwIfAborted();
    reply({ taskId: job.id, workflowId: 'tts', workflowName: workflow.name, outputs: [{ kind: 'audio', ...output, mime: 'audio/wav', name: `breeze-${job.id}.wav` }, { kind: 'text', text: job.text }] });
  } catch (e) { reply(null, e); } finally { workflowRuns.delete(requestId); }
});
async function initConnection() {
  try { await client.bootstrap(); config = { ...client.config }; if (client.adminToken && !bridge.managed) await saveConnection(config); fillConnection(); await connect(); }
  catch (e) { fillConnection(); connectionFailed(e); }
  const epoch = ++pollEpoch; clearTimeout(timer);
  const poll = async () => {
    try { await refreshStatus(); if (['models', 'connection'].includes(currentPage) && client.adminToken) await refreshManagement(); } catch { /* Live status already reports connection errors. */ }
    if (!closing && epoch === pollEpoch) timer = setTimeout(poll, 1800);
  };
  if (!closing) timer = setTimeout(poll, 1800);
}
enhanceSelects(); enhanceFileInputs(); fillConnection(); bridge.ready(); if (!bridge.embedded) { initialized = true; void initConnection(); }
window.addEventListener('beforeunload', () => { closing = true; statusMonitor.dispose(); active?.abort(); for (const c of workflowRuns.values()) c.abort(); clearTimeout(timer); if (playerUrl) URL.revokeObjectURL(playerUrl); });
