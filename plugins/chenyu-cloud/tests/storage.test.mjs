import test from 'node:test';
import assert from 'node:assert/strict';
function memory() { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), clear: () => m.clear() }; }
globalThis.localStorage = memory(); globalThis.sessionStorage = memory();
const { loadConfig, saveConfig, loadTasks, saveTask, saveKey, loadKey, connectHostStorage } = await import('../shared/storage.js');
test('credentials stay out of host state, even when remembered locally', () => {
  let state; connectHostStorage({}, value => { state = value; });
  saveKey('fixture-do-not-export', true); saveConfig({ quoteLimit: '0.20' });
  assert.equal(loadKey(), 'fixture-do-not-export'); assert.ok(!JSON.stringify(state).includes('fixture-do-not-export'));
  saveKey('', false); assert.equal(loadKey(), '');
});
test('host restoration merges task updates without overwriting newer pending/running records', () => {
  saveTask({ idempotencyKey: 'newer', status: 'running', terminal: false });
  connectHostStorage({ storage: { tasks: [{ idempotencyKey: 'newer', status: 'queued', updatedAt: 1 }, { idempotencyKey: 'other', status: 'failed', terminal: true, updatedAt: 1 }] } }, () => {});
  assert.equal(loadTasks().find(t => t.idempotencyKey === 'newer').status, 'running');
  assert.equal(loadTasks().find(t => t.idempotencyKey === 'other').status, 'failed');
});
test('history pruning never loses unresolved orders', () => {
  for (let i = 0; i < 90; i++) saveTask({ idempotencyKey: `done-${i}`, terminal: true });
  assert.equal(loadTasks().filter(t => t.terminal).length, 80);
  assert.ok(loadTasks().some(t => t.idempotencyKey === 'newer')); assert.ok(loadConfig().workflows.length >= 2);
});
