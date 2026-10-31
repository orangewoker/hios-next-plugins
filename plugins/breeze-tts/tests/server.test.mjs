import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { createWorkshop } from '../service/server.mjs';
import { createMockEngine } from '../scripts/mock-engine.mjs';
import { wavHeader } from '../service/audio.mjs';
import http from 'node:http';
const delay = n => new Promise(r => setTimeout(r, n));
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'breeze-service-test-')), mock = await createMockEngine();
  const service = await createWorkshop({ dataDir: dir, port: 0, engineUrl: mock.url });
  t.after(async () => { await service.close(); await mock.close(); assert.equal(dirname(resolve(dir)), resolve(tmpdir())); await rm(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${service.server.address().port}`;
  const headers = { Authorization: `Bearer ${service.config.accessKey}`, 'Content-Type': 'application/json' };
  const request = (path, options = {}) => fetch(base + path, { ...options, headers: { ...headers, ...options.headers }, body: options.body ? JSON.stringify(options.body) : undefined });
  return { ...service, base, request, mock, dir };
}
async function waitReady(f, id) {
  for (let i = 0; i < 80; i++) { const r = await f.request(`/api/jobs/${id}`), j = await r.json(); if (['ready', 'failed', 'cancelled'].includes(j.status)) return j; await delay(30); } throw new Error('fixture timeout');
}
test('standalone static UI, loopback bootstrap and API key checks', async t => {
  const f = await fixture(t); const page = await fetch(f.base); assert.equal(page.status, 200); assert.match(await page.text(), /Breeze TTS/);
  assert.equal((await fetch(f.base + '/api/health')).status, 401);
  const bootstrap = await (await fetch(f.base + '/api/bootstrap')).json(); assert.equal(bootstrap.local, true); assert.equal(bootstrap.accessKey, f.config.accessKey);
  assert.equal((await f.request('/api/health', { headers: { Origin: 'https://evil.test' } })).status, 403);
  assert.equal((await fetch(f.base + '/api/bootstrap', { headers: { Origin: 'null' } })).status, 200);
  const denied = await (await fetch(f.base + '/api/bootstrap', { headers: { Origin: 'null' } })).json(); assert.equal(denied.adminToken, undefined);
  const h = await (await f.request('/api/health')).json(); assert.equal(h.engineReady, true); assert.equal(h.engineState, 'ready'); assert.equal(h.protocol, 'breeze-workshop/v1');
  assert.equal((await f.request('/api/admin/status')).status, 403);
  const s = await f.request('/api/admin/status', { headers: { 'X-Breeze-Admin': f.adminToken } }); assert.equal(s.status, 200);
  assert.equal((await fetch(f.base + '/service/service.json')).status, 404);
  const hostStatus = await new Promise((ok, fail) => { const req = http.get(f.base + '/api/health', { headers: { Host: 'evil.test' } }, res => { res.resume(); ok(res.statusCode); }); req.on('error', fail); });
  assert.equal(hostStatus, 403);
});
test('health reports live engine lifecycle without exposing management data', async t => {
  const f = await fixture(t); f.engine.external = false;
  let ready = false; f.engine.health = async () => ready;
  for (const state of ['stopped', 'loading', 'stopping', 'error', 'ready']) {
    f.engine.state = state;
    const h = await (await f.request('/api/health')).json();
    assert.equal(h.engineReady, false); assert.equal(h.engineState, state === 'ready' ? 'unavailable' : state);
    for (const secret of ['accessKey', 'adminToken', 'logs', 'dataDir', 'engineError']) assert.equal(h[secret], undefined);
  }
  let release; const starting = new Promise(r => { release = r; });
  f.engine.state = 'stopped'; f.engine.start = () => starting;
  try {
    const r = await f.request('/api/admin/engine/start', { method: 'POST', headers: { 'X-Breeze-Admin': f.adminToken }, body: {} }); assert.equal(r.status, 202);
    assert.equal((await (await f.request('/api/health')).json()).engineState, 'loading', 'preparing model files is not stopped');
    ready = true; const h = await (await f.request('/api/health')).json(); assert.equal(h.engineReady, true); assert.equal(h.engineState, 'ready');
  } finally { release(); }
});

test('job synthesizes real WAV container, idempotent submission, four-port metadata and persistence', async t => {
  const f = await fixture(t), body = { text: '你好，工坊。', idempotencyKey: 'test-idempotency-0001' };
  const submitted = await f.request('/api/jobs', { method: 'POST', body }); assert.equal(submitted.status, 202); const first = await submitted.json();
  const duplicate = await (await f.request('/api/jobs', { method: 'POST', body })).json(); assert.equal(duplicate.id, first.id);
  const conflict = await f.request('/api/jobs', { method: 'POST', body: { ...body, text: '同一标识不同内容' } }); assert.equal(conflict.status, 409);
  const busy = await f.request('/api/jobs', { method: 'POST', body: { text: 'other', idempotencyKey: 'test-idempotency-0002' } }); assert.equal(busy.status, 409);
  const j = await waitReady(f, first.id); assert.equal(j.status, 'ready'); assert.equal(j.info.duration, 0.4); assert.equal(j.settings.reference, undefined);
  const audio = await f.request(`/api/jobs/${j.id}/audio`); assert.equal(audio.headers.get('content-type'), 'audio/wav'); const b = Buffer.from(await audio.arrayBuffer());
  assert.equal(b.toString('ascii', 0, 4), 'RIFF'); assert.equal(b.readUInt32LE(40), b.length - 44); assert.equal(b.readUInt32LE(4), b.length - 8);
  const stored = JSON.parse(await readFile(join(f.dir, 'jobs', `${j.id}.json`), 'utf8')); assert.equal(stored.status, 'ready');
  assert.equal((await f.request('/api/jobs', { method: 'POST', body: { text: 'wrong', cfg_scale: 0 } })).status, 400);
});

test('slow job body cannot bypass the voice reservation', async t => {
  const f = await fixture(t);
  let release, reserved;
  const entered = new Promise(r => { reserved = r; });
  f.engine.saveVoice = async () => { reserved(); await new Promise(r => { release = r; }); return { id: 'reserved' }; };
  const body = JSON.stringify({ text: 'body arrives in two pieces' });
  let finishBody;
  const pending = new Promise((ok, fail) => {
    const req = http.request(f.base + '/api/jobs', { method: 'POST', headers: { Authorization: `Bearer ${f.config.accessKey}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, res => { res.resume(); ok(res.statusCode); });
    req.on('error', fail); req.write(body.slice(0, 8)); finishBody = () => req.end(body.slice(8));
  });
  await delay(30);
  const voice = f.request('/api/voices', { method: 'POST', body: { name: 'reserved', ref_text: 'x', reference: 'fixture' } });
  await entered; finishBody();
  try { assert.equal(await pending, 409); assert.equal(f.jobs.active, null); }
  finally { release(); await voice; }
});

test('LAN clients use the key but never receive management bootstrap credentials', async t => {
  const f = await fixture(t);
  const lanHost = Object.values((await import('node:os')).networkInterfaces()).flat().find(x => x && x.family === 'IPv4' && !x.internal)?.address;
  if (!lanHost) { t.skip('no LAN interface'); return; }
  const remoteHeaders = { Host: `${lanHost}:${f.server.address().port}`, Origin: `http://${lanHost}:${f.server.address().port}` };
  const request = path => new Promise((ok, fail) => {
    const req = http.get(f.base + path, { headers: { ...remoteHeaders, Authorization: `Bearer ${f.config.accessKey}` } }, res => { let text = ''; res.on('data', c => { text += c; }); res.on('end', () => ok({ status: res.statusCode, body: JSON.parse(text) })); }); req.on('error', fail);
  });
  assert.deepEqual((await request('/api/bootstrap')).body, { local: false });
  assert.equal((await request('/api/health')).status, 200);
  assert.equal((await request('/api/admin/status')).status, 403);
});
test('cancellation aborts upstream and never publishes partial output', async t => {
  const f = await fixture(t), j = await (await f.request('/api/jobs', { method: 'POST', body: { text: '[slow] cancellation test' } })).json();
  await delay(120); await f.request(`/api/jobs/${j.id}`, { method: 'DELETE' }); const end = await waitReady(f, j.id); assert.equal(end.status, 'cancelled');
  assert.equal((await f.request(`/api/jobs/${j.id}/audio`)).status, 409); await delay(50); assert.ok(f.mock.cancellations > 0);
});
test('saved voices round trip and reference data is not embedded in job history', async t => {
  const f = await fixture(t), reference = 'data:audio/wav;base64,' + Buffer.concat([wavHeader(4800), Buffer.alloc(4800)]).toString('base64');
  const response = await f.request('/api/voices', { method: 'POST', body: { name: 'my_voice', ref_text: '参考转录', description: '测试音色', reference } }); assert.equal(response.status, 201);
  const voices = await (await f.request('/api/voices')).json(); assert.equal(voices[0].id, 'my_voice'); assert.equal(voices[0].description, '测试音色');
  assert.equal((await f.request('/api/voices', { method: 'POST', body: { name: '../escape', reference, ref_text: 'x' } })).status, 400);
  const j = await (await f.request('/api/jobs', { method: 'POST', body: { text: 'hello', mode: 'clone', reference, ref_text: 'reference' } })).json(); const end = await waitReady(f, j.id); assert.equal(end.status, 'ready');
  const history = JSON.stringify(await (await f.request('/api/jobs')).json()); assert.ok(!history.includes('base64'));
});
test('server restart preserves access key/results and interrupts stale jobs', async t => {
  const f = await fixture(t); const id = '11111111-1111-4111-8111-111111111111'; await f.close();
  await writeFile(join(f.dir, 'jobs', `${id}.json`), JSON.stringify({ id, text: 'stale', createdAt: Date.now(), status: 'generating', info: {} }));
  const restarted = await createWorkshop({ dataDir: f.dir, port: 0, engineUrl: f.mock.url }); t.after(() => restarted.close());
  assert.equal(restarted.config.accessKey, f.config.accessKey); assert.equal(restarted.jobs.get(id).status, 'interrupted');
});
