import { normalizeWorkflow, importWorkflow, defaults, checkQuote, money, safeMediaUrl, isMedia, workflowId } from '../shared/core.js';
import { PRESETS } from '../shared/presets.js';
import { ChenyuClient, readFile, downloadOutput } from '../shared/client.js';
import * as store from '../shared/storage.js';
import { submitRun, pollRun, resumeSubmission } from '../shared/runner.js';
const PROTOCOL = 'hios-plugin-app/v1', ID = 'chenyu-cloud';
const $ = id => document.getElementById(id);
const post = (type, payload = {}) => parent.postMessage({ protocol: PROTOCOL, pluginId: ID, appId: ID, type, payload }, '*');
let config = store.loadConfig(), selected = config.workflows[0]?.id, values = {}, active, initialized = false, toastTimer;
const runs = new Map();
const cleanError = error => String(error?.message || error).replaceAll(store.loadKey() || '\u0000', '[已隐藏]');
function el(tag, text, className) { const node = document.createElement(tag); if (text != null) node.textContent = text; if (className) node.className = className; return node; }
function button(label, action, className = 'soft-button') {
  const node = el('button', label, className); node.type = 'button';
  node.onclick = async () => { node.disabled = true; try { await action(); } catch (error) { toast(cleanError(error)); } finally { node.disabled = false; } }; return node;
}
function message(id, text, error = false) { $(id).textContent = text; $(id).classList.toggle('error', error); }
function toast(text) { $('toast').textContent = text; $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 4000); }
function page(name) {
  document.querySelectorAll('.page').forEach(n => n.classList.toggle('active', n.id === `page-${name}`));
  document.querySelectorAll('[data-page]').forEach(n => n.classList.toggle('active', n.dataset.page === name));
  if (name === 'tasks') renderTasks();
}
function workflow() { return config.workflows.find(w => w.id === selected) || config.workflows[0]; }
function status() {
  $('workflowCount').textContent = config.workflows.length;
  $('connectionText').textContent = store.loadKey() ? 'Key 已配置' : '尚未配置 Key';
  $('connectionDot').classList.toggle('online', Boolean(store.loadKey()));
}
function saveWorkflows(workflows) {
  config = store.saveConfig({ workflows }); renderCatalog();
  post('application-workflow-catalog-changed', { workflowCount: workflows.length });
}
function renderCatalog() {
  if (!config.workflows.some(w => w.id === selected)) selected = config.workflows[0]?.id;
  $('workflowSelect').replaceChildren(...config.workflows.map(w => { const o = el('option', w.name); o.value = w.id; o.selected = w.id === selected; return o; }));
  $('workflowList').replaceChildren(...config.workflows.map(w => {
    const card = el('section', null, 'panel workflow-card'); card.append(el('h3', w.name), el('p', w.description), el('code', `${w.id}\n${w.revisionId}`), el('p', `${w.fields.length} 个参数 · 参考 ¥${w.quoteAmount ?? '未配置'} · ${w.externalCost === false ? '无外部模型费用' : '费用风险未确认'}`));
    const actions = el('div', null, 'actions');
    actions.append(button('编辑配置', () => { $('importText').value = JSON.stringify(w, null, 2); $('importQuote').value = w.quoteAmount ?? ''; $('importNoExternal').checked = w.externalCost === false; $('importText').focus(); }),
      button('运行', () => { if (active) throw new Error('请先停止当前等待'); selected = w.id; renderForm(); $('workflowSelect').value = selected; page('run'); }),
      button('移除', () => { if (!confirm(`从本地配置移除“${w.name}”？任务记录不会删除。`)) return; saveWorkflows(config.workflows.filter(x => x.id !== w.id)); renderForm(); }, 'text-button danger'));
    card.append(actions); return card;
  })); status();
}
function renderForm() {
  const w = workflow(); values = w ? defaults(w) : {};
  $('dynamicForm').replaceChildren();
  $('workflowInfo').textContent = w ? `${w.description}\n锁定版本 ${w.revisionId}\n参考报价 ¥${w.quoteAmount ?? '未配置'} · 最终以结算为准` : '请先导入工作流';
  $('runButton').disabled = !w || Boolean(active);
  if (!w) return;
  for (const field of w.fields) {
    const label = el('label', null, `field${isMedia(field) || ['string', 'text', 'object', 'array'].includes(field.type) && !field.options?.length ? ' wide' : ''}`);
    label.append(el('span', `${field.label}${field.required ? ' *' : '（可选）'}`));
    let input;
    if (field.options?.length) {
      input = el('select'); input.append(...field.options.map(o => { const n = el('option', o.label); n.value = String(o.value); return n; }));
      input.value = String(values[field.name]); input.onchange = () => { values[field.name] = field.options.find(o => String(o.value) === input.value)?.value; };
    } else if (field.type === 'boolean') {
      input = el('select'); input.append(el('option', '否'), el('option', '是')); input.options[0].value = 'false'; input.options[1].value = 'true'; input.value = String(values[field.name] === true); input.onchange = () => { values[field.name] = input.value === 'true'; };
    } else {
      input = el(['string', 'text', 'object', 'array'].includes(field.type) ? 'textarea' : 'input');
      if (input.tagName === 'INPUT') input.type = ['number', 'integer'].includes(field.type) ? 'number' : 'text';
      if (['number', 'integer'].includes(field.type)) { input.step = field.type === 'integer' ? '1' : 'any'; if (field.min != null) input.min = field.min; if (field.max != null) input.max = field.max; }
      input.value = typeof values[field.name] === 'object' ? JSON.stringify(values[field.name]) : String(values[field.name] ?? '');
      input.oninput = () => { values[field.name] = input.value; };
    }
    input.setAttribute('aria-label', field.label); input.name = field.name; label.append(input);
    if (isMedia(field)) {
      input.placeholder = 'HTTPS / data URL / asset://';
      const picker = el('input'); picker.type = 'file'; picker.accept = field.type === 'file' ? '*/*' : `${field.type.replace(/\[\]$/, '')}/*`; picker.multiple = field.multiple === true;
      const preview = el('div', null, 'media-preview');
      picker.onchange = async () => {
        try {
          const files = [...picker.files]; if (!files.length) return;
          const sources = await Promise.all(files.map(readFile)); values[field.name] = field.multiple ? sources : sources[0];
          input.value = ''; input.placeholder = files.map(f => f.name).join('、'); preview.replaceChildren(el('span', `${files.map(f => f.name).join('、')} · ${(files.reduce((n, f) => n + f.size, 0) / 1024 / 1024).toFixed(2)} MB`));
          if (field.type === 'image') { const image = el('img'); image.src = sources[0]; image.alt = '输入预览'; preview.prepend(image); }
        } catch (error) { toast(cleanError(error)); }
      };
      label.append(picker, preview);
    }
    $('dynamicForm').append(label);
  }
}
function progress(data) {
  $('runProgress').classList.remove('hidden'); $('runStage').textContent = data.message || data.status || '';
  $('progressText').textContent = `${Math.round(data.progress || 0)}%`; $('progressBar').value = data.progress || 0;
  if (data.taskId) $('activeTaskId').textContent = data.taskId;
  $('runStatus').textContent = data.status || '运行中';
}
async function download(output) {
  if (output.kind === 'text') return;
  const blob = await downloadOutput(output), url = URL.createObjectURL(blob), anchor = el('a');
  anchor.href = url; anchor.download = output.name || '晨羽结果'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function results(outputs) {
  $('resultEmpty').classList.toggle('hidden', outputs.length > 0);
  $('resultList').replaceChildren(...outputs.map(output => {
    const card = el('article', null, 'result-card'), source = safeMediaUrl(output.url);
    if (output.kind === 'text') card.append(el('pre', output.text));
    else if (source && ['image', 'video', 'audio'].includes(output.kind)) {
      const media = el(output.kind === 'image' ? 'img' : output.kind); media.src = source;
      if (output.kind !== 'image') media.controls = true; else { media.alt = output.name || '晨羽生成结果'; media.loading = 'lazy'; }
      card.append(media);
    }
    const footer = el('footer'); footer.append(el('span', output.name || output.kind));
    footer.append(button('加入画布', () => post('output', { output: { ...output, source: source || output.text } })));
    if (source) footer.append(button('下载', () => download(output)));
    card.append(footer); return card;
  }));
}
async function execute(existing) {
  if (active) return;
  const controller = new AbortController(); active = controller;
  $('runButton').disabled = true; $('stopButton').disabled = false; $('workflowSelect').disabled = true;
  $('activeTaskId').textContent = ''; message('runMessage', ''); results([]);
  try {
    const client = new ChenyuClient(store.loadKey());
    let task = existing;
    if (task && !task.runOrderId) task = await resumeSubmission(task, client, store, controller.signal);
    if (!task) task = await submitRun({ client, workflow: workflow(), values: { ...values }, config, store, signal: controller.signal, onProgress: progress });
    const result = await pollRun({ client, task, config, store, signal: controller.signal, onProgress: progress });
    results(result.outputs); $('runStatus').textContent = '已完成';
    const record = store.loadTasks().find(t => t.runOrderId === task.runOrderId);
    message('runMessage', record?.settlementStatus === 'settled' ? `已结算 ¥${record.finalAmount}` : '执行完成，结算状态可在任务记录继续查询。');
  } catch (error) {
    const text = controller.signal.aborted ? '已停止本地等待；云端任务可能仍在运行，可从任务记录恢复。' : cleanError(error);
    message('runMessage', text, true); $('runStatus').textContent = controller.signal.aborted ? '停止等待' : '未完成';
  } finally { active = null; $('runButton').disabled = !workflow(); $('stopButton').disabled = true; $('workflowSelect').disabled = false; renderTasks(); }
}
function renderTasks() {
  $('taskList').replaceChildren(...store.loadTasks().map(task => {
    const card = el('article', null, 'panel task-card'); card.append(el('h3', task.workflowName), el('p', `${task.status} · ${task.settlementStatus || '待结算'} · 预估 ¥${task.quoteAmount ?? task.workflow?.quoteAmount ?? '未知'} · 最终 ¥${task.finalAmount ?? '待确认'}`), el('code', task.runOrderId || `幂等键 ${task.idempotencyKey}`));
    if (task.message) card.append(el('p', task.message));
    const actions = el('div', null, 'actions');
    actions.append(button(task.runOrderId ? '查询 / 继续等待' : '用原幂等键恢复提交', () => { if (active) throw new Error('已有任务正在等待'); page('run'); return execute(task); }));
    if (task.outputs?.length) actions.append(button('查看结果', () => {
      page('run'); results(task.outputs);
      $('runStatus').textContent = task.success ? '已完成' : task.status;
      $('activeTaskId').textContent = task.runOrderId || '';
      message('runMessage', task.settlementStatus === 'settled' ? `参考报价 ¥${task.quoteAmount} · 最终结算 ¥${task.finalAmount}` : '结果已生成，费用尚未结算。');
    }));
    card.append(actions); return card;
  }));
  if (!$('taskList').children.length) $('taskList').append(el('p', '暂无任务记录。'));
}
function renderSettings() {
  $('apiKey').value = store.loadKey(); $('rememberKey').checked = config.rememberKey;
  $('quoteLimit').value = config.quoteLimit; $('pollInterval').value = config.pollIntervalMs / 1000; $('maxWait').value = config.maxWaitMinutes;
}
async function bridgeRequest(payload) {
  const requestId = String(payload.requestId || ''), method = payload.method;
  if (!requestId) return;
  const reply = (ok, result, error) => post('application-workflow-response', { requestId, ok, ...(ok ? { result } : { error: { message: cleanError(error) } }) });
  if (method === 'cancel-workflow') { runs.get(String(payload.targetRequestId || ''))?.abort(); reply(true, { cancelled: true }); return; }
  if (runs.has(requestId)) return;
  try {
    config = store.loadConfig();
    if (method === 'list-workflows') {
      reply(true, config.workflows.map(w => { let runnable = Boolean(store.loadKey()); try { checkQuote(w, config.quoteLimit); } catch { runnable = false; } return { workflowId: w.id, workflowName: w.name, description: `${w.description} · 参考 ¥${w.quoteAmount ?? '未知'}`, fields: w.fields, capabilities: w.capabilities, coverUrl: w.coverUrl, runnable }; })); return;
    }
    if (method !== 'run-workflow') throw new Error('不支持的应用工作流方法');
    const w = config.workflows.find(w => w.id === payload.workflowId);
    if (!w) throw new Error('工作流不存在，请在晨羽智云应用配置');
    const controller = new AbortController(); runs.set(requestId, controller);
    try {
      const client = new ChenyuClient(store.loadKey());
      const onProgress = data => post('application-workflow-event', { requestId, event: 'progress', data });
      const task = await submitRun({ client, workflow: w, values: payload.values || {}, config, store, signal: controller.signal, onProgress });
      reply(true, await pollRun({ client, task, config, store, signal: controller.signal, onProgress }));
    } finally { runs.delete(requestId); }
  } catch (error) { reply(false, null, error?.name === 'AbortError' ? new Error('已停止本地等待，云端任务可在晨羽智云任务记录继续查询') : error); }
}
document.querySelectorAll('[data-page]').forEach(n => { n.onclick = () => page(n.dataset.page); });
$('dynamicForm').onsubmit = event => event.preventDefault();
$('workflowSelect').onchange = () => { selected = $('workflowSelect').value; renderForm(); };
$('runButton').onclick = () => void execute(); $('stopButton').onclick = () => active?.abort();
$('saveSettings').onclick = () => {
  try {
    const quoteLimit = money($('quoteLimit').value); if (quoteLimit === null) throw new Error('请填写单次参考报价门槛');
    const poll = Number($('pollInterval').value), wait = Number($('maxWait').value);
    if (!Number.isFinite(poll) || poll < 1 || poll > 15 || !Number.isFinite(wait) || wait < 1 || wait > 180) throw new Error('轮询间隔需为 1–15 秒，等待时间需为 1–180 分钟');
    store.saveKey($('apiKey').value, $('rememberKey').checked);
    config = store.saveConfig({ quoteLimit, pollIntervalMs: poll * 1000, maxWaitMinutes: wait, rememberKey: $('rememberKey').checked });
    status(); post('application-workflow-catalog-changed'); message('settingsMessage', '已保存');
  } catch (error) { message('settingsMessage', cleanError(error), true); }
};
$('clearKey').onclick = () => { store.saveKey('', false); config = store.saveConfig({ rememberKey: false }); renderSettings(); status(); post('application-workflow-catalog-changed'); message('settingsMessage', 'Key 已清除'); };
$('toggleKey').onclick = () => { const show = $('apiKey').type === 'password'; $('apiKey').type = show ? 'text' : 'password'; $('toggleKey').textContent = show ? '隐藏' : '显示'; };
$('addPresets').onclick = () => { const presets = PRESETS.map(normalizeWorkflow); saveWorkflows([...config.workflows, ...presets.filter(w => !config.workflows.some(x => x.id === w.id))]); renderForm(); message('workflowMessage', '已补充内置预设，未覆盖自定义配置'); };
$('importButton').onclick = () => {
  try {
    const text = $('importText').value.trim(); let w;
    if (/^(https:\/\/www\.chenyu\.cn\/|wf_)/.test(text)) {
      const preset = PRESETS.find(w => w.workflow_id === workflowId(text)); if (!preset) throw new Error('此链接暂无参数预设，请到官方页面复制 API 文档后粘贴导入'); w = normalizeWorkflow(preset);
    } else w = importWorkflow(text);
    if ($('importQuote').value !== '') w.quoteAmount = money($('importQuote').value);
    if ($('importNoExternal').checked) w.externalCost = false;
    saveWorkflows([w, ...config.workflows.filter(x => x.id !== w.id)]); selected = w.id; renderCatalog(); renderForm();
    message('workflowMessage', `已导入“${w.name}” · ${w.fields.length} 个参数${w.externalCost !== false || w.quoteAmount === null ? '，需补全报价及外部费用确认后才能运行' : ''}`);
  } catch (error) { message('workflowMessage', cleanError(error), true); }
};
$('importFile').onchange = async () => { const file = $('importFile').files[0]; if (!file) return; if (file.size > 2 * 1024 * 1024) { toast('配置文件不能超过 2 MB'); return; } $('importText').value = await file.text(); };
$('refreshTasks').onclick = renderTasks;
window.addEventListener('message', event => {
  const msg = event.data; if (event.source !== parent || msg?.protocol !== PROTOCOL || msg.pluginId && msg.pluginId !== ID || msg.appId && msg.appId !== ID) return;
  if (msg.type === 'init') {
    if (msg.payload?.theme?.mode) document.documentElement.dataset.theme = msg.payload.theme.mode;
    if (!initialized) { initialized = true; store.connectHostStorage(msg.payload?.state, storage => post('state', { state: { storage } })); config = store.loadConfig(); renderCatalog(); renderForm(); renderSettings(); renderTasks(); }
  } else if (msg.type === 'application-workflow-request') void bridgeRequest(msg.payload || {});
});
store.watch(() => { config = store.loadConfig(); renderCatalog(); renderTasks(); });
renderCatalog(); renderForm(); renderSettings(); renderTasks(); post('ready');
