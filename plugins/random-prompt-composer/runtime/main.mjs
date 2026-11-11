import { categories, SYSTEM_PROMPT, normalizeState, randomize, compose } from './core.mjs';

const pluginId = 'random-prompt-composer';
const protocols = ['hios-plugin-node/v1', 'hios-plugin-app/v1'];
const $ = id => document.getElementById(id);
let protocol = protocols[0], nodeId = '', appId = '', hostOrigin;
let state = normalizeState(), upstream = '', initialized = false;
const post = (type, payload = {}) => parent.postMessage({ protocol, pluginId, nodeId, appId, type, payload }, '*');
const status = text => { $('status').textContent = text; };
const persist = () => { if (initialized) post('state', { state }); };

for (const c of categories) {
  const row = document.createElement('div'); row.className = 'category';
  const label = document.createElement('label'); label.htmlFor = c.id; label.textContent = c.title;
  const select = document.createElement('select'); select.id = c.id; select.className = 'hios-control';
  for (const entry of c.entries) {
    const option = document.createElement('option'); option.value = entry.id; option.textContent = `${entry.id} · ${entry.text}`; select.append(option);
  }
  const lockLabel = document.createElement('label'); lockLabel.className = 'check';
  const lock = document.createElement('input'); lock.type = 'checkbox'; lock.id = `lock-${c.id}`; lock.setAttribute('aria-label', `锁定${c.title}`);
  lockLabel.append(lock, '锁定'); row.append(label, select, lockLabel); $('categories').append(row);
  select.addEventListener('change', () => { state.selected[c.id] = select.value; state.locked[c.id] = true; render(); persist(); status(`${c.title}已选定并锁定`); });
  lock.addEventListener('change', () => { state.locked[c.id] = lock.checked; persist(); });
}
$('system').value = SYSTEM_PROMPT;

function render() {
  for (const c of categories) {
    $(c.id).value = state.selected[c.id]; $(`lock-${c.id}`).checked = state.locked[c.id];
    $(c.id).title = $(c.id).selectedOptions[0]?.textContent || '';
  }
  $('seed').value = state.seed; $('brief').value = state.brief; $('randomOnRun').checked = state.randomOnRun;
  $('positive').value = compose(state, upstream);
  $('seedInfo').textContent = `0 = 每次随机；固定非零种子可复现。${state.lastSeed ? `上次抽取种子：${state.lastSeed}` : ''}`;
}
function draw() { state = randomize(state); render(); persist(); }
function run(payload = {}, redraw = state.randomOnRun) {
  try {
    if (redraw) draw();
    else { render(); persist(); }
    // Only the positive text is published: the system prompt must never leak into ordinary LLM input.
    post('output', { runId: payload.runId, output: { kind: 'text', portId: 'positive', value: compose(state, upstream), name: '随机组合正向提示词' } });
    status('已输出正向提示词，可运行下游 LLM 进行深化');
  } catch (error) { post('error', { runId: payload.runId, message: error.message }); status(error.message); }
}
$('random').addEventListener('click', () => { draw(); status('已随机未锁定项；点击运行输出到下游'); });
$('run').addEventListener('click', () => {
  // Export exactly the visible preview, without drawing a second time.
  run({}, false);
});
$('seed').addEventListener('change', () => { state = normalizeState({ ...state, seed: $('seed').value }); render(); persist(); });
$('brief').addEventListener('input', () => { state.brief = $('brief').value; $('positive').value = compose(state, upstream); persist(); });
$('randomOnRun').addEventListener('change', () => { state.randomOnRun = $('randomOnRun').checked; persist(); });
async function copy(id) {
  try {
    try { await navigator.clipboard.writeText($(id).value); }
    catch { $(id).focus(); $(id).select(); if (!document.execCommand('copy')) throw Error('请选中文本后按 Ctrl+C 复制'); }
    status(id === 'system' ? '系统提示词已复制，请粘贴到 LLM 系统提示词栏' : '正向提示词已复制');
  } catch (error) { status(error.message); }
}
$('copy').addEventListener('click', () => copy('positive'));
$('copySystem').addEventListener('click', () => copy('system'));

window.addEventListener('message', event => {
  const message = event.data;
  if (event.source !== parent || !message || !protocols.includes(message.protocol) || message.pluginId !== pluginId) return;
  if (initialized && (event.origin !== hostOrigin || message.protocol !== protocol || (nodeId && message.nodeId !== nodeId) || (appId && message.appId !== appId))) return;
  const payload = message.payload || {};
  if (message.type === 'init') {
    protocol = message.protocol; nodeId = message.nodeId || payload.nodeId || ''; appId = message.appId || payload.appId || ''; hostOrigin = event.origin;
    const first = !initialized;
    state = normalizeState(payload.state);
    upstream = payload.inputs?.brief ?? '';
    initialized = true;
    if (first && !payload.state?.selected) draw(); else render();
    $('run').hidden = protocol === protocols[1] || payload.hostRunControl === 'canvas-button';
    status('已就绪 · 手动选择自动锁定；节点之间的设置相互独立'); post('loaded');
  } else if (message.type === 'run' && initialized) {
    if (payload.inputs) upstream = payload.inputs.brief ?? '';
    run(payload);
  }
});

render();
// One shared entry works in both the canvas and the app; each host accepts only its protocol.
for (const p of protocols) parent.postMessage({ protocol: p, pluginId, type: 'ready' }, '*');
if (parent === window) { state = randomize(state); render(); status('独立预览模式 · 安装到 HIOS 后可保存设置与连线'); }
