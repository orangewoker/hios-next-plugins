import { DEFAULT_BASE_URL, DEFAULT_WORKFLOW_ID } from './core.js';

const CONFIG_KEY = 'compute-cloud.config.v1';
const TOKEN_KEY = 'compute-cloud.token.v1';
const TASK_KEY = 'compute-cloud.tasks.v1';
const CHANNEL_NAME = 'compute-cloud-config';

function parse(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

export function loadConfig() {
  const stored = parse(localStorage.getItem(CONFIG_KEY), {});
  return {
    baseUrl: String(stored.baseUrl || DEFAULT_BASE_URL),
    workflows: Array.isArray(stored.workflows) ? stored.workflows : [],
    defaultWorkflowId: String(stored.defaultWorkflowId || stored.workflows?.[0]?.id || DEFAULT_WORKFLOW_ID),
    rememberToken: Boolean(stored.rememberToken),
    pollIntervalMs: Math.max(1000, Math.min(15000, Number(stored.pollIntervalMs || 2500))),
    maxWaitMinutes: Math.max(1, Math.min(180, Number(stored.maxWaitMinutes || 45))),
  };
}

export function saveConfig(config) {
  const next = { ...loadConfig(), ...(config || {}) };
  localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
  try { new BroadcastChannel(CHANNEL_NAME).postMessage({ type: 'config', config: next }); } catch { /* Optional. */ }
  return next;
}

export function loadToken() {
  return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || '';
}

export function saveToken(token, remember = false) {
  const value = String(token || '').trim();
  if (value) sessionStorage.setItem(TOKEN_KEY, value); else sessionStorage.removeItem(TOKEN_KEY);
  if (remember && value) localStorage.setItem(TOKEN_KEY, value); else localStorage.removeItem(TOKEN_KEY);
  try { new BroadcastChannel(CHANNEL_NAME).postMessage({ type: 'token-changed' }); } catch { /* Optional. */ }
}

export function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
}

export function loadTasks() {
  const value = parse(localStorage.getItem(TASK_KEY), []);
  return Array.isArray(value) ? value : [];
}

export function saveTask(task) {
  const current = loadTasks();
  const id = String(task.taskId || '');
  const next = [{ ...task, updatedAt: Date.now() }, ...current.filter((item) => String(item.taskId || '') !== id)].slice(0, 80);
  localStorage.setItem(TASK_KEY, JSON.stringify(next));
  try { new BroadcastChannel(CHANNEL_NAME).postMessage({ type: 'tasks' }); } catch { /* Optional. */ }
  return next;
}

export function removeTask(taskId) {
  const next = loadTasks().filter((item) => String(item.taskId || '') !== String(taskId || ''));
  localStorage.setItem(TASK_KEY, JSON.stringify(next));
  return next;
}

export function clearFinishedTasks() {
  const next = loadTasks().filter((item) => !item.terminal);
  localStorage.setItem(TASK_KEY, JSON.stringify(next));
  return next;
}

export function watchStorage(callback) {
  const storageHandler = (event) => {
    if ([CONFIG_KEY, TOKEN_KEY, TASK_KEY].includes(event.key)) callback(event.key);
  };
  window.addEventListener('storage', storageHandler);
  let channel;
  try { channel = new BroadcastChannel(CHANNEL_NAME); channel.onmessage = () => callback('broadcast'); } catch { /* Optional. */ }
  return () => { window.removeEventListener('storage', storageHandler); channel?.close(); };
}
