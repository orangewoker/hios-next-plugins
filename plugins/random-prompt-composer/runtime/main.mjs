import { categories, SYSTEM_PROMPT, normalizeState, randomize, compose } from './core.mjs';
import { createTagMenu } from './tag-menu.mjs';

const pluginId = 'random-prompt-composer';
const protocols = ['hios-plugin-node/v1', 'hios-plugin-app/v1'];
const $ = id => document.getElementById(id);
let protocol = protocols[0], nodeId = '', appId = '', hostOrigin;
let state = normalizeState(), upstream = '', initialized = false;
const post = (type, payload = {}) => parent.postMessage({ protocol, pluginId, nodeId, appId, type, payload }, '*');
const status = text => { $('status').textContent = text; };
const persist = () => { if (initialized) post('state', { state }); };
const tagMenu = createTagMenu((id, value) => {
  $(id).value = value; $(id).dispatchEvent(new Event('change'));
});
$('tagSettings').addEventListener('toggle', () => tagMenu.close());

for (const c of categories) {
  const row = document.createElement('div'); row.className = 'category';
  const label = document.createElement('label'); label.htmlFor = `${c.id}-trigger`; label.textContent = c.title;
  const select = document.createElement('input'); select.type = 'hidden'; select.id = c.id;
  const trigger = document.createElement('button'); trigger.type = 'button'; trigger.id = `${c.id}-trigger`; trigger.className = 'hios-control tag-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox'); trigger.setAttribute('aria-controls', 'tag-options'); trigger.setAttribute('aria-expanded', 'false');
  trigger.addEventListener('click', () => tagMenu.open(c, trigger, state.selected[c.id]));
  const lockLabel = document.createElement('label'); lockLabel.className = 'check';
  const lock = document.createElement('input'); lock.type = 'checkbox'; lock.id = `lock-${c.id}`; lock.setAttribute('aria-label', `锁定${c.title}`);
  lockLabel.append(lock, '锁定'); row.append(label, trigger, lockLabel, select); $('categories').append(row);
  select.addEventListener('change', () => { state.selected[c.id] = select.value; state.locked[c.id] = true; render(); persist(); status(`${c.title}已选定并锁定`); });
  lock.addEventListener('change', () => { state.locked[c.id] = lock.checked; persist(); });
}
$('system').value = SYSTEM_PROMPT;

function render() {
  for (const c of categories) {
    $(c.id).value = state.selected[c.id]; $(`lock-${c.id}`).checked = state.locked[c.id];
    const entry = c.entries.find(entry => entry.id === state.selected[c.id]);
    $(c.id).title = entry ? `${entry.id} · ${entry.text}` : '';
    $(`${c.id}-trigger`).textContent = $(c.id).title;
    $(`${c.id}-trigger`).title = $(c.id).title;
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
    const text = id === 'system' ? SYSTEM_PROMPT : $(id).value;
    try { await navigator.clipboard.writeText(text); }
    catch {
      const field = document.createElement('textarea'); field.value = text; field.style.cssText = 'position:fixed;opacity:0;pointer-events:none'; document.body.append(field);
      try { field.focus(); field.select(); if (!document.execCommand('copy')) throw Error('复制失败，请使用系统提示词文本文件'); }
      finally { field.remove(); }
    }
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
    const nextState = normalizeState(payload.state);
    const nextUpstream = payload.inputs?.brief ?? '';
    const changed = JSON.stringify(nextState) !== JSON.stringify(state) || JSON.stringify(nextUpstream) !== JSON.stringify(upstream);
    state = nextState; upstream = nextUpstream;
    initialized = true;
    if (first && !payload.state?.selected) draw(); else if (first || changed) render();
    $('run').hidden = protocol === protocols[1] || payload.hostRunControl === 'canvas-button';
    $('systemDetails').hidden = protocol !== protocols[1];
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
