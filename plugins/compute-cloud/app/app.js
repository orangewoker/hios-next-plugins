import {
  DEFAULT_WORKFLOW_ID,
  MAX_MEDIA_BYTES,
  defaultsForWorkflow,
  fileNameForResult,
  isMediaField,
  mimeForKind,
  normalizeBaseUrl,
  normalizeStatus,
  taskLabel,
  validateAndBuildBody,
} from '../shared/core.js';
import { createTask, downloadResult, fetchWorkflowMetadata, queryTask, readFileAsDataUrl, sourceAsApiValue } from '../shared/client.js';
import { clearFinishedTasks, clearToken, loadConfig, loadTasks, loadToken, removeTask, saveConfig, saveTask, saveToken, watchStorage } from '../shared/storage.js';

const APP_PROTOCOL = 'hios-plugin-app/v1';
const $ = (id) => document.getElementById(id);
let config = loadConfig();
let workflows = config.workflows;
let formValues = {};
let formMediaSizes = {};
let selectedWorkflowId = config.defaultWorkflowId;
let activeRun = null;
const applicationWorkflowRuns = new Map();
let elapsedTimer = 0;
let toastTimer = 0;

function post(type, payload = {}) {
  parent.postMessage({ protocol: APP_PROTOCOL, pluginId: 'compute-cloud', appId: 'compute-cloud', type, payload }, '*');
}

function applyTheme(theme) {
  if (!theme?.tokens) return;
  const root = document.documentElement;
  const map = { background: '--bg', surface: '--surface', muted: '--muted', control: '--control', text: '--text', textSecondary: '--text-2', border: '--border', accent: '--accent' };
  Object.entries(map).forEach(([token, variable]) => theme.tokens[token] && root.style.setProperty(variable, theme.tokens[token]));
  root.dataset.theme = theme.mode || 'light';
}

function toast(message) {
  const target = $('toast');
  target.textContent = String(message || '');
  target.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => target.classList.remove('show'), 2600);
}

function setMessage(target, message, error = false) {
  target.textContent = String(message || '');
  target.classList.toggle('error', error);
}

function currentWorkflow() {
  return workflows.find((item) => item.id === selectedWorkflowId) || workflows[0] || null;
}

function refreshConnectionStatus() {
  const token = loadToken();
  $('connectionDot').classList.toggle('online', Boolean(token && workflows.length));
  $('connectionText').textContent = token ? `${workflows.length} 个工作流` : '尚未配置 Token';
  $('workflowCount').textContent = String(workflows.length);
}

function showPage(name) {
  document.querySelectorAll('.page').forEach((page) => page.classList.toggle('active', page.id === `page-${name}`));
  document.querySelectorAll('.nav-button').forEach((button) => button.classList.toggle('active', button.dataset.page === name));
  if (name === 'tasks') renderTasks();
}

function saveWorkflowCollection(next, defaultWorkflowId = config.defaultWorkflowId) {
  workflows = next;
  config = saveConfig({ ...config, workflows, defaultWorkflowId: defaultWorkflowId || workflows[0]?.id || '' });
  if (!workflows.some((item) => item.id === selectedWorkflowId)) selectedWorkflowId = config.defaultWorkflowId || workflows[0]?.id || '';
  renderWorkflowOptions();
  renderWorkflowList();
  refreshConnectionStatus();
  post('application-workflow-catalog-changed', { workflowCount: workflows.length });
}

async function syncWorkflow(id, quiet = false) {
  const workflowId = String(id || '').trim();
  if (!workflowId) throw new Error('请输入工作流 ID');
  if (!quiet) setMessage($('workflowMessage'), '正在读取工作流参数…');
  const workflow = await fetchWorkflowMetadata(config.baseUrl, workflowId);
  const next = [workflow, ...workflows.filter((item) => item.id !== workflow.id)];
  selectedWorkflowId = workflow.id;
  saveWorkflowCollection(next, config.defaultWorkflowId && next.some((item) => item.id === config.defaultWorkflowId) ? config.defaultWorkflowId : workflow.id);
  renderRunForm(true);
  if (!quiet) setMessage($('workflowMessage'), `已同步“${workflow.name}”，共 ${workflow.fields.length} 个参数`);
  return workflow;
}

function renderWorkflowOptions() {
  const picker = $('runWorkflowPicker');
  const trigger = $('runWorkflowTrigger');
  const label = trigger.querySelector('span');
  const menu = $('runWorkflowMenu');
  menu.replaceChildren();
  picker.classList.remove('is-open');
  trigger.setAttribute('aria-expanded', 'false');
  if (!workflows.length) {
    label.textContent = '请先添加工作流';
    trigger.disabled = true;
    menu.classList.add('hidden');
  } else {
    trigger.disabled = false;
    const current = currentWorkflow();
    label.textContent = current?.name || '选择工作流';
    workflows.forEach((workflow) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(workflow.id === current?.id));
      option.className = workflow.id === current?.id ? 'active' : '';
      option.textContent = workflow.name;
      option.onclick = () => {
        selectedWorkflowId = workflow.id;
        renderWorkflowOptions();
        renderRunForm(true);
      };
      menu.append(option);
    });
  }
}

function renderWorkflowList() {
  const list = $('workflowList');
  list.replaceChildren();
  if (!workflows.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-list';
    empty.textContent = '还没有工作流。点击“添加默认 H3”即可开始。';
    list.append(empty);
    return;
  }
  workflows.forEach((workflow) => {
    const card = document.createElement('article');
    card.className = 'workflow-card';
    const cover = document.createElement('div');
    cover.className = 'workflow-cover';
    if (workflow.coverUrl) { const image = document.createElement('img'); image.src = workflow.coverUrl; image.alt = ''; cover.append(image); } else cover.textContent = '⌘';
    const main = document.createElement('div');
    main.className = 'workflow-main';
    const title = document.createElement('strong');
    title.textContent = workflow.name;
    if (workflow.id === config.defaultWorkflowId) { const badge = document.createElement('span'); badge.className = 'default-badge'; badge.textContent = '默认'; title.append(badge); }
    const id = document.createElement('small'); id.textContent = workflow.id;
    const description = document.createElement('p'); description.textContent = workflow.description || `${workflow.fields.length} 个参数`;
    main.append(title, id, description);
    const actions = document.createElement('div');
    actions.className = 'workflow-actions';
    const use = actionButton('运行', () => { selectedWorkflowId = workflow.id; renderWorkflowOptions(); renderRunForm(true); showPage('run'); });
    const refresh = actionButton('刷新', () => void syncWorkflow(workflow.id).catch((error) => setMessage($('workflowMessage'), error.message, true)));
    const defaultButton = actionButton('设为默认', () => { config = saveConfig({ ...config, defaultWorkflowId: workflow.id }); renderWorkflowList(); toast('默认工作流已更新'); });
    const remove = actionButton('删除', () => { saveWorkflowCollection(workflows.filter((item) => item.id !== workflow.id), config.defaultWorkflowId === workflow.id ? '' : config.defaultWorkflowId); toast('工作流已删除'); }, 'danger');
    actions.append(use, refresh, defaultButton, remove);
    card.append(cover, main, actions);
    list.append(card);
  });
}

function actionButton(label, onClick, className = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.className = className;
  button.onclick = onClick;
  return button;
}

function fieldElement(field) {
  const label = document.createElement('label');
  label.className = `field ${field.type === 'prompt' || field.type === 'string' && field.max > 300 || isMediaField(field) ? 'wide' : ''}`;
  const caption = document.createElement('span');
  caption.textContent = field.label;
  if (field.required) { const mark = document.createElement('b'); mark.className = 'required-mark'; mark.textContent = ' *'; caption.append(mark); }
  label.append(caption);
  const value = formValues[field.name] ?? '';
  if (isMediaField(field)) {
    const row = document.createElement('div');
    row.className = 'media-input';
    const input = document.createElement('input');
    input.type = 'text'; input.placeholder = '输入 URL，或选择本地文件'; input.value = typeof value === 'string' && !value.startsWith('data:') ? value : '';
    input.oninput = () => { formValues[field.name] = input.value; formMediaSizes[field.name] = 0; updateMediaPreview(preview, formValues[field.name], field.type); };
    const picker = document.createElement('input');
    picker.type = 'file'; picker.hidden = true; picker.accept = field.acceptTypes?.join(',') || (field.type === 'file' ? '*/*' : `${field.type}/*`);
    const choose = actionButton('选择', () => picker.click());
    choose.className = 'soft-button';
    picker.onchange = async () => {
      const file = picker.files?.[0];
      picker.value = '';
      if (!file) return;
      const existing = Object.entries(formMediaSizes).reduce((sum, [name, size]) => sum + (name === field.name ? 0 : Number(size || 0)), 0);
      if (existing + file.size > MAX_MEDIA_BYTES) { toast('所有本地媒体文件总和不能超过 50MB'); return; }
      choose.disabled = true; choose.textContent = '读取中';
      try { formValues[field.name] = await readFileAsDataUrl(file); formMediaSizes[field.name] = file.size; input.value = file.name; updateMediaPreview(preview, formValues[field.name], field.type, file.name); }
      catch (error) { toast(error.message); }
      finally { choose.disabled = false; choose.textContent = '选择'; }
    };
    const preview = document.createElement('div'); preview.className = 'media-preview';
    updateMediaPreview(preview, value, field.type);
    row.append(input, choose, picker, preview);
    label.append(row);
    return label;
  }
  let input;
  if (field.type === 'prompt' || (field.type === 'string' && Number(field.max || 0) > 300) || ['array', 'mixed_array', 'object'].includes(field.type)) {
    input = document.createElement('textarea');
  } else if (field.type === 'enum') {
    input = document.createElement('select');
    if (!field.required) { const empty = document.createElement('option'); empty.value = ''; empty.textContent = '使用默认值'; input.append(empty); }
    field.options.forEach((item) => { const option = document.createElement('option'); option.value = String(item.value); option.textContent = item.label; input.append(option); });
  } else if (field.type === 'boolean' || field.type === 'bool') {
    input = document.createElement('select');
    [['', '使用默认值'], ['true', '是'], ['false', '否']].forEach(([optionValue, text]) => { const option = document.createElement('option'); option.value = optionValue; option.textContent = text; input.append(option); });
  } else {
    input = document.createElement('input');
    if (['integer', 'int', 'number', 'float'].includes(field.type)) { input.type = 'number'; if (field.min != null) input.min = String(field.min); if (field.max != null) input.max = String(field.max); input.step = field.type === 'float' ? 'any' : '1'; }
    else input.type = 'text';
  }
  input.value = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value ?? '');
  input.oninput = () => { formValues[field.name] = input.value; };
  input.onchange = input.oninput;
  label.append(input);
  return label;
}

function updateMediaPreview(target, value, type, fileName = '') {
  target.replaceChildren();
  const source = String(value || '');
  if (!source) return;
  if (type === 'image') { const image = document.createElement('img'); image.src = source; image.alt = ''; target.append(image); }
  else if (type === 'video') { const video = document.createElement('video'); video.src = source; video.muted = true; target.append(video); }
  const text = document.createElement('span'); text.textContent = fileName || (source.startsWith('data:') ? '本地文件已载入' : source); target.append(text);
}

function renderRunForm(reset = false) {
  const workflow = currentWorkflow();
  const form = $('dynamicForm');
  form.replaceChildren();
  if (!workflow) {
    $('runWorkflowInfo').className = 'workflow-info empty';
    $('runWorkflowInfo').textContent = '请先添加工作流';
    $('runButton').disabled = true;
    return;
  }
  selectedWorkflowId = workflow.id;
  if (reset) { formValues = defaultsForWorkflow(workflow); formMediaSizes = {}; }
  $('runButton').disabled = false;
  $('runWorkflowInfo').className = 'workflow-info';
  $('runWorkflowInfo').replaceChildren();
  const title = document.createElement('strong'); title.textContent = workflow.name;
  const text = document.createElement('span'); text.textContent = `${workflow.id} · ${workflow.fields.length} 个参数${workflow.description ? ` · ${workflow.description}` : ''}`;
  $('runWorkflowInfo').append(title, text);
  workflow.fields.forEach((field) => form.append(fieldElement(field)));
}

function setRunState(status, taskId = '', stage = '') {
  const normalized = normalizeStatus(status);
  const pill = $('runStatus');
  pill.textContent = taskLabel(normalized || status);
  pill.className = `status-pill ${['SUCCESS', 'SUCCEEDED', 'COMPLETED', 'COMPLETE'].includes(normalized) ? 'success' : ['FAILED', 'FAILURE', 'ERROR', 'CANCELLED', 'CANCELED'].includes(normalized) ? 'failed' : normalized ? 'running' : ''}`;
  $('runProgress').classList.toggle('hidden', !normalized || ['SUCCESS', 'SUCCEEDED', 'COMPLETED', 'COMPLETE', 'FAILED', 'FAILURE', 'ERROR', 'CANCELLED', 'CANCELED'].includes(normalized));
  $('runStage').textContent = stage || taskLabel(normalized);
  $('activeTaskId').textContent = taskId || '';
}

function renderResults(workflow, results) {
  const list = $('resultList');
  list.replaceChildren();
  $('resultEmpty').classList.toggle('hidden', Boolean(results?.length));
  (results || []).forEach((result, index) => {
    const card = document.createElement('article'); card.className = 'result-card';
    let media;
    if (result.kind === 'image') { media = document.createElement('img'); media.src = result.url; media.alt = `生成结果 ${index + 1}`; }
    else if (result.kind === 'video') { media = document.createElement('video'); media.src = result.url; media.controls = true; media.preload = 'metadata'; }
    else if (result.kind === 'audio') { media = document.createElement('audio'); media.src = result.url; media.controls = true; }
    else { media = document.createElement('a'); media.href = result.url; media.target = '_blank'; media.rel = 'noreferrer'; media.textContent = '打开输出文件'; }
    const footer = document.createElement('footer');
    const label = document.createElement('span'); label.textContent = `${result.kind.toUpperCase()} · ${result.fileType || 'output'}`;
    const button = actionButton('下载', async () => { button.disabled = true; try { await downloadResult(result.url, fileNameForResult(workflow, result, index)); toast('已开始下载'); } catch (error) { window.open(result.url, '_blank', 'noopener'); toast(`直接下载失败，已打开原始地址：${error.message}`); } finally { button.disabled = false; } });
    button.className = 'soft-button';
    footer.append(label, button); card.append(media, footer); list.append(card);
  });
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
  });
}

function applicationWorkflowResponse(requestId, ok, result, error) {
  post('application-workflow-response', { requestId, ok, ...(ok ? { result } : { error: { message: String(error?.message || error || '应用工作流执行失败') } }) });
}

function applicationWorkflowProgress(requestId, data) {
  post('application-workflow-event', { requestId, event: 'progress', data });
}

async function configuredApplicationWorkflows() {
  config = loadConfig();
  workflows = config.workflows;
  if (!workflows.length) {
    const workflow = await fetchWorkflowMetadata(config.baseUrl, DEFAULT_WORKFLOW_ID);
    workflows = [workflow];
    config = saveConfig({ ...config, workflows, defaultWorkflowId: workflow.id });
  }
  return workflows.map((workflow) => ({
    workflowId: workflow.id,
    workflowName: workflow.name,
    description: workflow.description,
    coverUrl: workflow.coverUrl,
    fields: workflow.fields,
    capabilities: workflow.outputKinds,
    runnable: true,
  }));
}

function localMediaBytes(workflow, body) {
  return workflow.fields.filter(isMediaField).reduce((total, field) => {
    const value = String(body[field.name] || '');
    if (!value.startsWith('data:')) return total;
    const comma = value.indexOf(',');
    if (comma < 0) return total;
    const payload = value.slice(comma + 1);
    return total + (/;base64/i.test(value.slice(0, comma)) ? Math.floor(payload.length * 3 / 4) : new TextEncoder().encode(decodeURIComponent(payload)).byteLength);
  }, 0);
}

async function applicationWorkflowBody(workflow, values) {
  const body = validateAndBuildBody(workflow, values);
  for (const field of workflow.fields.filter(isMediaField)) if (body[field.name]) body[field.name] = await sourceAsApiValue(body[field.name]);
  if (localMediaBytes(workflow, body) > MAX_MEDIA_BYTES) throw new Error('所有本地媒体文件总和不能超过 50MB');
  return body;
}

async function runApplicationWorkflowRequest(requestId, payload) {
  config = loadConfig();
  workflows = config.workflows;
  const workflowId = String(payload.workflowId || '');
  const workflow = workflows.find((item) => item.id === workflowId);
  if (!workflow) throw new Error('所选工作流不存在，请先在算力云应用中完成配置');
  const token = loadToken();
  if (!token) throw new Error('请先在算力云应用中配置 AutoDL ComfyUI Token');
  const controller = new AbortController();
  applicationWorkflowRuns.set(requestId, controller);
  const startedAt = Date.now();
  try {
    applicationWorkflowProgress(requestId, { status: 'PREPARING', progress: 2, message: '正在准备工作流参数' });
    const body = await applicationWorkflowBody(workflow, payload.values && typeof payload.values === 'object' ? payload.values : {});
    applicationWorkflowProgress(requestId, { status: 'QUEUED', progress: 5, message: '正在提交算力云任务' });
    const submitted = await createTask(config.baseUrl, workflow.id, body, token, controller.signal);
    let task = { ...submitted, workflowId: workflow.id, workflowName: workflow.name, baseUrl: config.baseUrl, parameterNames: Object.keys(body), terminal: false, success: false, results: [] };
    saveTask(task);
    applicationWorkflowProgress(requestId, { taskId: task.taskId, status: task.status, progress: 8, message: task.message || '任务已提交' });
    const deadline = startedAt + config.maxWaitMinutes * 60_000;
    while (!controller.signal.aborted && Date.now() < deadline) {
      await delay(config.pollIntervalMs, controller.signal);
      const snapshot = await queryTask(task.baseUrl, task.taskId, token, controller.signal);
      task = { ...task, ...snapshot, workflowId: workflow.id, workflowName: workflow.name, baseUrl: task.baseUrl };
      saveTask(task);
      const elapsed = Math.max(0, Date.now() - startedAt);
      const progress = snapshot.terminal ? 100 : Math.min(94, 10 + Math.round(elapsed / Math.max(1, config.maxWaitMinutes * 60_000) * 84));
      applicationWorkflowProgress(requestId, { taskId: task.taskId, status: snapshot.status, progress, message: snapshot.message || '算力云正在生成' });
      if (!snapshot.terminal) continue;
      if (!snapshot.success) throw new Error(snapshot.message || '算力云工作流执行失败');
      return {
        taskId: task.taskId,
        workflowId: workflow.id,
        workflowName: workflow.name,
        outputs: snapshot.results.map((result, index) => ({
          kind: ['image', 'video', 'audio'].includes(result.kind) ? result.kind : 'file',
          url: result.url,
          mime: mimeForKind(result.kind, result.fileType),
          name: fileNameForResult(workflow, result, index),
          metadata: { taskId: task.taskId, workflowId: workflow.id, workflowName: workflow.name },
        })),
      };
    }
    if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    throw new Error(`等待超过 ${config.maxWaitMinutes} 分钟，可稍后在算力云任务记录中继续查询`);
  } finally {
    applicationWorkflowRuns.delete(requestId);
  }
}

async function handleApplicationWorkflowRequest(payload) {
  const requestId = String(payload?.requestId || '');
  if (!requestId) return;
  const method = String(payload.method || '');
  if (method === 'cancel-workflow') {
    applicationWorkflowRuns.get(String(payload.targetRequestId || ''))?.abort();
    applicationWorkflowResponse(requestId, true, { cancelled: true });
    return;
  }
  try {
    if (method === 'list-workflows') applicationWorkflowResponse(requestId, true, await configuredApplicationWorkflows());
    else if (method === 'run-workflow') applicationWorkflowResponse(requestId, true, await runApplicationWorkflowRequest(requestId, payload));
    else throw new Error(`算力云不支持应用工作流方法：${method || '空方法'}`);
  } catch (error) {
    applicationWorkflowResponse(requestId, false, null, error?.name === 'AbortError' ? new Error('已停止本地等待，云端任务可能仍在运行') : error);
  }
}

async function pollTask(task, workflow, controller, startedAt = Date.now()) {
  const deadline = startedAt + config.maxWaitMinutes * 60_000;
  while (!controller.signal.aborted && Date.now() < deadline) {
    await delay(config.pollIntervalMs, controller.signal);
    const taskBaseUrl = task.baseUrl || config.baseUrl;
    const snapshot = await queryTask(taskBaseUrl, task.taskId, loadToken(), controller.signal);
    const current = { ...task, ...snapshot, workflowId: workflow.id, workflowName: workflow.name, baseUrl: taskBaseUrl };
    saveTask(current);
    setRunState(snapshot.status, task.taskId);
    if (snapshot.terminal) {
      if (snapshot.success) {
        renderResults(workflow, snapshot.results);
        post('output', { output: { kind: snapshot.results[0]?.kind || 'file', source: snapshot.results[0]?.url || '', results: snapshot.results, taskId: task.taskId, workflowId: workflow.id } });
        toast(`“${workflow.name}”生成完成`);
      } else toast(snapshot.message || '任务生成失败');
      return current;
    }
  }
  if (!controller.signal.aborted) throw new Error(`等待超过 ${config.maxWaitMinutes} 分钟，可稍后在任务记录中继续查询`);
  return task;
}

async function runSelectedWorkflow() {
  if (activeRun) return;
  const workflow = currentWorkflow();
  if (!workflow) { toast('请先添加工作流'); return; }
  const token = loadToken();
  if (!token) { showPage('settings'); toast('请先配置 AutoDL ComfyUI Token'); return; }
  let body;
  try { body = validateAndBuildBody(workflow, formValues); }
  catch (error) { toast(error.message); return; }
  const controller = new AbortController();
  const startedAt = Date.now();
  activeRun = { controller, startedAt };
  $('runButton').disabled = true; $('stopButton').disabled = false;
  renderResults(workflow, []); setRunState('QUEUED', '', '正在提交任务');
  elapsedTimer = setInterval(() => { $('runElapsed').textContent = `${Math.max(0, Math.round((Date.now() - startedAt) / 1000))} 秒`; }, 1000);
  try {
    const submitted = await createTask(config.baseUrl, workflow.id, body, token, controller.signal);
    const task = { ...submitted, workflowId: workflow.id, workflowName: workflow.name, baseUrl: config.baseUrl, parameterNames: Object.keys(body), terminal: false, success: false, results: [] };
    saveTask(task); setRunState(task.status, task.taskId);
    await pollTask(task, workflow, controller, startedAt);
  } catch (error) {
    if (error.name !== 'AbortError') { setRunState('FAILED', $('activeTaskId').textContent, error.message); toast(error.message); }
  } finally {
    clearInterval(elapsedTimer); elapsedTimer = 0; activeRun = null; $('runButton').disabled = false; $('stopButton').disabled = true; renderTasks();
  }
}

async function resumeTask(task) {
  if (activeRun) { toast('当前已有任务正在查询'); return; }
  const workflow = workflows.find((item) => item.id === task.workflowId);
  if (!workflow) { toast('对应工作流已被删除'); return; }
  selectedWorkflowId = workflow.id; renderWorkflowOptions(); renderRunForm(true); showPage('run');
  const controller = new AbortController(); const startedAt = Date.now(); activeRun = { controller, startedAt };
  $('runButton').disabled = true; $('stopButton').disabled = false; setRunState(task.status || 'RUNNING', task.taskId);
  elapsedTimer = setInterval(() => { $('runElapsed').textContent = `${Math.round((Date.now() - startedAt) / 1000)} 秒`; }, 1000);
  try { const result = await pollTask(task, workflow, controller, startedAt); if (result.results?.length) renderResults(workflow, result.results); }
  catch (error) { if (error.name !== 'AbortError') toast(error.message); }
  finally { clearInterval(elapsedTimer); activeRun = null; $('runButton').disabled = false; $('stopButton').disabled = true; renderTasks(); }
}

function taskTone(task) {
  const status = normalizeStatus(task.status);
  return ['SUCCESS', 'SUCCEEDED', 'COMPLETED', 'COMPLETE'].includes(status) ? 'success' : ['FAILED', 'FAILURE', 'ERROR', 'CANCELLED', 'CANCELED'].includes(status) ? 'failed' : 'running';
}

function renderTasks() {
  const list = $('taskList'); list.replaceChildren();
  const tasks = loadTasks();
  if (!tasks.length) { const empty = document.createElement('div'); empty.className = 'empty-list'; empty.textContent = '还没有任务记录。'; list.append(empty); return; }
  tasks.forEach((task) => {
    const card = document.createElement('article'); card.className = 'task-card';
    const dot = document.createElement('i'); dot.className = `task-dot ${taskTone(task)}`;
    const meta = document.createElement('div'); meta.className = 'task-meta';
    const title = document.createElement('strong'); title.textContent = `${task.workflowName || task.workflowId || '工作流'} · ${taskLabel(task.status)}`;
    const detail = document.createElement('small'); detail.textContent = `${task.taskId} · ${new Date(task.updatedAt || Date.now()).toLocaleString('zh-CN')}`;
    meta.append(title, detail);
    const actions = document.createElement('div'); actions.className = 'workflow-actions';
    if (task.results?.length) actions.append(actionButton('查看', () => { const workflow = workflows.find((item) => item.id === task.workflowId) || { id: task.workflowId, name: task.workflowName }; renderResults(workflow, task.results); setRunState(task.status, task.taskId); showPage('run'); }));
    if (!task.terminal) actions.append(actionButton('继续查询', () => void resumeTask(task)));
    actions.append(actionButton('删除', () => { removeTask(task.taskId); renderTasks(); }, 'danger'));
    card.append(dot, meta, actions); list.append(card);
  });
}

function loadSettingsForm() {
  config = loadConfig(); workflows = config.workflows;
  $('baseUrl').value = config.baseUrl;
  $('token').value = loadToken();
  $('rememberToken').checked = config.rememberToken;
  $('pollInterval').value = String(config.pollIntervalMs / 1000);
  $('maxWait').value = String(config.maxWaitMinutes);
}

function saveSettingsForm() {
  try {
    const baseUrl = normalizeBaseUrl($('baseUrl').value);
    config = saveConfig({ ...config, baseUrl, rememberToken: $('rememberToken').checked, pollIntervalMs: Number($('pollInterval').value || 2.5) * 1000, maxWaitMinutes: Number($('maxWait').value || 45) });
    saveToken($('token').value, config.rememberToken);
    setMessage($('settingsMessage'), '设置已保存，画布节点会自动同步。'); refreshConnectionStatus();
  } catch (error) { setMessage($('settingsMessage'), error.message, true); }
}

async function initialize() {
  loadSettingsForm(); renderWorkflowOptions(); renderWorkflowList(); refreshConnectionStatus(); renderTasks();
  if (!workflows.length) {
    try { await syncWorkflow(DEFAULT_WORKFLOW_ID, true); }
    catch { renderRunForm(true); }
  } else renderRunForm(true);
}

document.querySelectorAll('.nav-button').forEach((button) => button.onclick = () => showPage(button.dataset.page));
$('runWorkflowTrigger').onclick = (event) => {
  event.stopPropagation();
  if ($('runWorkflowTrigger').disabled) return;
  const open = !$('runWorkflowPicker').classList.contains('is-open');
  $('runWorkflowPicker').classList.toggle('is-open', open);
  $('runWorkflowMenu').classList.toggle('hidden', !open);
  $('runWorkflowTrigger').setAttribute('aria-expanded', String(open));
};
document.addEventListener('click', (event) => {
  if ($('runWorkflowPicker').contains(event.target)) return;
  $('runWorkflowPicker').classList.remove('is-open');
  $('runWorkflowMenu').classList.add('hidden');
  $('runWorkflowTrigger').setAttribute('aria-expanded', 'false');
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  $('runWorkflowPicker').classList.remove('is-open');
  $('runWorkflowMenu').classList.add('hidden');
  $('runWorkflowTrigger').setAttribute('aria-expanded', 'false');
});
$('runButton').onclick = () => void runSelectedWorkflow();
$('stopButton').onclick = () => { activeRun?.controller.abort(); setRunState('CANCELLED', $('activeTaskId').textContent, '已停止本地等待'); toast('已停止本地轮询，云端任务可能仍在运行'); };
$('refreshSelected').onclick = () => { const workflow = currentWorkflow(); if (workflow) void syncWorkflow(workflow.id).catch((error) => toast(error.message)); };
$('addWorkflow').onclick = () => void syncWorkflow($('workflowIdInput').value).then(() => { $('workflowIdInput').value = ''; }).catch((error) => setMessage($('workflowMessage'), error.message, true));
$('addDefaultWorkflow').onclick = () => void syncWorkflow(DEFAULT_WORKFLOW_ID).catch((error) => setMessage($('workflowMessage'), error.message, true));
$('saveSettings').onclick = saveSettingsForm;
$('checkConnection').onclick = async () => {
  saveSettingsForm(); const id = currentWorkflow()?.id || DEFAULT_WORKFLOW_ID; $('checkConnection').disabled = true;
  try { const workflow = await fetchWorkflowMetadata(config.baseUrl, id); setMessage($('settingsMessage'), `连接正常：${workflow.name}`); }
  catch (error) { setMessage($('settingsMessage'), `连接失败：${error.message}`, true); }
  finally { $('checkConnection').disabled = false; }
};
$('toggleToken').onclick = () => { const visible = $('token').type === 'text'; $('token').type = visible ? 'password' : 'text'; $('toggleToken').textContent = visible ? '显示' : '隐藏'; };
$('clearToken').onclick = () => { clearToken(); $('token').value = ''; refreshConnectionStatus(); setMessage($('settingsMessage'), 'Token 已清除。'); };
$('clearFinished').onclick = () => { clearFinishedTasks(); renderTasks(); toast('已清理完成和失败的任务'); };
watchStorage(() => { config = loadConfig(); workflows = config.workflows; refreshConnectionStatus(); });
window.addEventListener('message', (event) => { const message = event.data; if (!message || message.protocol !== APP_PROTOCOL) return; if (message.type === 'init') applyTheme(message.payload?.theme); else if (message.type === 'application-workflow-request') void handleApplicationWorkflowRequest(message.payload || {}); });

post('ready', { version: '0.2.1' });
void initialize();
