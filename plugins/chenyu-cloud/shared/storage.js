import { PRESETS } from './presets.js';
import { normalizeWorkflow } from './core.js';
const CONFIG = 'chenyu-cloud.config.v1', TASKS = 'chenyu-cloud.tasks.v1', KEY = 'chenyu-cloud.key.v1';
let persist;
function parse(storage, key, fallback) { try { return JSON.parse(storage.getItem(key)) ?? fallback; } catch { return fallback; } }
export function loadConfig() {
  const raw = parse(localStorage, CONFIG, {});
  return { workflows: Array.isArray(raw.workflows) ? raw.workflows : PRESETS.map(normalizeWorkflow),
    quoteLimit: raw.quoteLimit || '0.20', pollIntervalMs: Math.max(1000, Math.min(15000, Number(raw.pollIntervalMs) || 3000)),
    maxWaitMinutes: Math.max(1, Math.min(180, Number(raw.maxWaitMinutes) || 45)), rememberKey: raw.rememberKey === true,
    updatedAt: Number(raw.updatedAt) || 0 };
}
export function loadTasks() { const tasks = parse(localStorage, TASKS, []); return Array.isArray(tasks) ? tasks : []; }
function publish() {
  // Never include credentials or original local-media bytes in host state/project files.
  persist?.({ config: loadConfig(), tasks: loadTasks() });
  try { const channel = new BroadcastChannel('chenyu-cloud.changed'); channel.postMessage('changed'); channel.close(); } catch { /* optional */ }
}
export function saveConfig(config) {
  const next = { ...loadConfig(), ...config, updatedAt: Date.now() };
  localStorage.setItem(CONFIG, JSON.stringify(next)); publish(); return next;
}
export function saveTask(task) {
  const previous = loadTasks();
  const existing = previous.find(t => t.idempotencyKey === task.idempotencyKey);
  const next = { ...existing, ...task, updatedAt: Date.now() };
  const tasks = [next, ...previous.filter(t => t.idempotencyKey !== task.idempotencyKey)];
  // Never evict unresolved submissions or cloud runs, even if history is full.
  let finished = 0;
  localStorage.setItem(TASKS, JSON.stringify(tasks.filter(t => !t.terminal || ++finished <= 80)));
  publish(); return next;
}
export function loadKey() { return sessionStorage.getItem(KEY) || localStorage.getItem(KEY) || ''; }
export function saveKey(value, remember) {
  const key = String(value || '').trim().replace(/^Bearer\s+/i, '');
  if (key) sessionStorage.setItem(KEY, key); else sessionStorage.removeItem(KEY);
  if (key && remember) localStorage.setItem(KEY, key); else localStorage.removeItem(KEY);
  // No state/broadcast message carries the key itself.
}
export function connectHostStorage(state, callback) {
  const saved = state?.storage;
  const local = loadConfig();
  if (saved?.config && Number(saved.config.updatedAt) > local.updatedAt) localStorage.setItem(CONFIG, JSON.stringify(saved.config));
  if (Array.isArray(saved?.tasks)) {
    const merged = new Map(saved.tasks.map(t => [t.idempotencyKey, t]));
    for (const task of loadTasks()) if (!merged.has(task.idempotencyKey) || task.updatedAt >= merged.get(task.idempotencyKey).updatedAt) merged.set(task.idempotencyKey, task);
    localStorage.setItem(TASKS, JSON.stringify([...merged.values()].sort((a, b) => b.updatedAt - a.updatedAt)));
  }
  persist = callback; publish();
}
export function watch(callback) {
  window.addEventListener('storage', callback);
  let channel;
  try { channel = new BroadcastChannel('chenyu-cloud.changed'); channel.onmessage = callback; } catch { /* optional */ }
  return () => { window.removeEventListener('storage', callback); channel?.close(); };
}
