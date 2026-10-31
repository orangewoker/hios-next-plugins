import test from 'node:test';
import assert from 'node:assert/strict';
import { engineButton, EngineControl } from '../shared/engine-control.js';
const client = (request = async () => ({})) => ({ config: { mode: 'local' }, adminToken: 'fixture-admin', request });

test('local node button toggles start/stop and permits cancelling warmup', () => {
  const c = client();
  for (const state of ['stopped', 'error']) { const view = engineButton({ state }, c); assert.equal(view.label, '启动'); assert.equal(view.action, 'start'); assert.equal(view.disabled, false); }
  for (const state of ['ready', 'loading', 'unavailable']) { const view = engineButton({ state }, c); assert.equal(view.label, '停止'); assert.equal(view.action, 'stop'); assert.equal(view.disabled, false); }
  assert.equal(engineButton({ state: 'stopping' }, c).disabled, true);
  assert.equal(engineButton(null, c).disabled, true);
  assert.equal(engineButton({ state: 'ready' }, c, { generating: true }).disabled, true);
});

test('remote and legacy clients without local management credentials never get an active control', async () => {
  const control = new EngineControl(), c = client(() => assert.fail('must not call remote management'));
  c.config.mode = 'remote'; assert.equal(engineButton({ state: 'ready' }, c).visible, false);
  await assert.rejects(control.toggle(c, { state: 'ready' }), /远程客户端不能/);
  c.config.mode = 'local'; c.adminToken = ''; assert.equal(engineButton({ state: 'stopped' }, c).visible, false);
  await assert.rejects(control.toggle(c, { state: 'stopped' }), /服务端电脑/);
});

test('start checks downloaded files, then uses only the engine management API, never synthesis', async () => {
  const calls = [], c = client(async (path, options) => { calls.push([path, options]); return { downloads: { runtime: { ready: true }, model: { ready: true } } }; });
  const control = new EngineControl(); assert.equal(await control.toggle(c, { state: 'stopped' }), 'start');
  assert.deepEqual(calls, [['/api/admin/status', undefined], ['/api/admin/engine/start', { method: 'POST', body: { cpu: false } }]]); assert.equal(control.pending, false);
});

test('stop and warmup cancel use stop API, without rechecking or downloading model files', async () => {
  const calls = [], c = client(async (path, options) => calls.push([path, options]));
  const control = new EngineControl(); await control.toggle(c, { state: 'loading' });
  assert.deepEqual(calls, [['/api/admin/engine/stop', { method: 'POST', body: {} }]]);
});

test('missing files, active generation, and disconnected state do not start an engine', async () => {
  const calls = [], c = client(async path => { calls.push(path); return { downloads: { runtime: { ready: true }, model: { ready: false } } }; });
  const control = new EngineControl(); await assert.rejects(control.toggle(c, { state: 'stopped' }), /下载并校验/); assert.equal(control.pending, false);
  await assert.rejects(control.toggle(c, { state: 'ready' }, true), /结束当前生成/); await assert.rejects(control.toggle(c, null), /正在连接/);
  assert.deepEqual(calls, ['/api/admin/status']);
});

test('rapid repeated clicks never submit duplicate starts and failures release the lock', async () => {
  let finish; const wait = new Promise(r => { finish = r; }); let calls = 0;
  const c = client(async () => { calls++; await wait; throw Error('fixture denied'); }), control = new EngineControl();
  const first = control.toggle(c, { state: 'stopped' }); assert.equal(control.pending, true);
  await assert.rejects(control.toggle(c, { state: 'stopped' }), /处理模型/); assert.equal(calls, 1);
  finish(); await assert.rejects(first, /fixture denied/); assert.equal(control.pending, false);
});
