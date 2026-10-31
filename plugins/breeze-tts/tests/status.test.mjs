import test from 'node:test';
import assert from 'node:assert/strict';
import { serviceStatus, StatusMonitor } from '../shared/status.js';
const health = (engineReady, engineState) => ({ protocol: 'breeze-workshop/v1', engineReady, engineState });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

test('one status maps loading, ready, stopped, failure and remote state with legacy fallback', () => {
  for (const [ready, state, label] of [[false, 'loading', '模型加载 / 预热中'], [true, 'ready', '模型已就绪'], [false, 'stopping', '模型停止中'], [false, 'stopped', '模型未启动'], [false, 'error', '模型启动失败'], [false, 'unavailable', '模型暂不可用']]) {
    const result = serviceStatus(health(ready, state)); assert.equal(result.badge, `本机 · ${label}`); assert.ok(result.message.endsWith(label));
  }
  assert.equal(serviceStatus(health(true), 'remote').badge, '远程 · 模型已就绪');
  assert.equal(serviceStatus(health(false)).state, 'stopped');
  assert.throws(() => serviceStatus({ engineReady: true }), /不是 Breeze/);
});

test('status follows external start/stop on every page, and recovers from connection failure', async () => {
  const updates = [], errors = []; let current = health(false, 'stopped');
  const client = { config: { mode: 'remote' }, health: async () => { if (current instanceof Error) throw current; return current; } };
  const monitor = new StatusMonitor(() => client, status => updates.push(status.badge), error => errors.push(error.message));
  await monitor.refresh(); current = health(false, 'loading'); await monitor.refresh(); current = health(true, 'ready'); await monitor.refresh();
  current = Error('offline'); await assert.rejects(monitor.refresh(), /offline/);
  current = health(false, 'stopped'); await monitor.refresh(); current = health(true); await monitor.refresh();
  assert.deepEqual(updates, ['远程 · 模型未启动', '远程 · 模型加载 / 预热中', '远程 · 模型已就绪', '远程 · 模型未启动', '远程 · 模型已就绪']); assert.deepEqual(errors, ['offline']);
});

test('slow refresh is single-flight instead of stacking requests', async () => {
  const wait = deferred(); let calls = 0; const client = { config: {}, health: () => { calls++; return wait.promise; } };
  const monitor = new StatusMonitor(() => client, () => {}, assert.fail);
  const a = monitor.refresh(), b = monitor.refresh(); await Promise.resolve(); assert.equal(a, b); assert.equal(calls, 1);
  wait.resolve(health(true)); await a;
});

test('switching saved connections ignores an older response and does not use draft mode', async () => {
  const old = deferred(), updates = [], errors = [];
  let client = { config: { mode: 'local' }, health: () => old.promise };
  const monitor = new StatusMonitor(() => client, status => updates.push(status.badge), e => errors.push(e));
  const a = monitor.refresh(); await Promise.resolve();
  client = { config: { mode: 'remote' }, health: async () => health(true) }; await monitor.refresh();
  old.resolve(health(false)); await a; assert.deepEqual(updates, ['远程 · 模型已就绪']); assert.deepEqual(errors, []);
});

test('starting/stopping invalidates a late pre-action health response; dispose ignores late failures', async () => {
  const old = deferred(), updates = [], errors = []; let result = old.promise;
  const client = { config: {}, health: () => result }, monitor = new StatusMonitor(() => client, s => updates.push(s.state), e => errors.push(e));
  const a = monitor.refresh(); await Promise.resolve(); monitor.invalidate(); result = Promise.resolve(health(true)); await monitor.refresh();
  old.resolve(health(false)); await a; assert.deepEqual(updates, ['ready']);
  const late = deferred(); result = late.promise; const b = monitor.refresh(); await Promise.resolve(); monitor.dispose(); late.reject(Error('gone')); await assert.rejects(b, /gone/);
  assert.deepEqual(errors, []); assert.equal(await monitor.refresh(), null);
});

test('synchronous health failures do not poison future refreshes', async () => {
  let failing = true; const client = { config: {}, health: () => { if (failing) throw Error('sync'); return health(true); } };
  const monitor = new StatusMonitor(() => client, () => {}, () => {});
  await assert.rejects(monitor.refresh(), /sync/); failing = false; assert.equal((await monitor.refresh()).engineReady, true);
});
