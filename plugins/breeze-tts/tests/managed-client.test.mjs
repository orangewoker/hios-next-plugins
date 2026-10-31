import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkshopClient, saveConnection, mediaUrl } from '../shared/client.js';
function globals(t) {
  const original = Object.fromEntries(['localStorage', 'location'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  const storage = new Map([['hios.breeze.connection.v1', 'legacy-secret']]);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) } });
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { hostname: 'hios-plugin.localhost' } });
  t.after(() => { for (const [key, descriptor] of Object.entries(original)) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]; }); return storage;
}
test('managed bootstrap shares host config and purges legacy browser credentials', async t => {
  const storage = globals(t), calls = [];
  const bridge = { managed: true, workshop: async input => { calls.push(input); return { mode: 'remote', remoteUrl: 'http://192.168.0.8:17860', accessKey: 'encrypted-at-rest', port: 17870 }; } };
  const c = new WorkshopClient({}, bridge); await c.bootstrap(); assert.equal(c.adminToken, ''); assert.equal(c.config.localUrl, 'http://127.0.0.1:17870'); assert.equal(c.config.mode, 'remote'); assert.equal(storage.has('hios.breeze.connection.v1'), false); assert.equal(calls[0].action, 'config');
});
test('managed save uses host storage instead of localStorage', async t => {
  const storage = globals(t), config = { mode: 'remote', remoteUrl: 'http://host:17860', accessKey: 'private-key' };
  const result = await saveConnection(config, { managed: true, workshop: async input => { assert.equal(input.action, 'save-config'); assert.deepEqual(input.config, config); return { ...config, managed: true }; } });
  assert.equal(result.managed, true); assert.equal(storage.size, 0);
});
test('managed JSON and audio use host RPC, canonical outputs and WebView2 player URLs', async t => {
  globals(t); const calls = [];
  const c = new WorkshopClient({}, { managed: true, workshop: async input => { calls.push(input); return input.action === 'import-audio' ? { url: 'hios-asset://accounts/a/data/audio.wav', size: 80_000_000 } : { engineReady: true }; } });
  assert.equal((await c.health()).engineReady, true); const audio = await c.artifact({ id: 'job' });
  assert.equal(audio.source, 'hios-asset://accounts/a/data/audio.wav'); assert.equal(audio.playUrl, 'http://hios-asset.localhost/accounts/a/data/audio.wav'); assert.equal(audio.blob, undefined); assert.equal(calls[1].action, 'import-audio');
  await assert.rejects(c.audio({ id: 'job' }), /素材导入/);
  location.hostname = ''; assert.equal(mediaUrl(audio.source), audio.source);
});
test('managed abort does not publish a late audio artifact', async t => {
  globals(t); const controller = new AbortController();
  const c = new WorkshopClient({}, { managed: true, workshop: async () => { controller.abort(); return { url: 'hios-asset://late.wav' }; } });
  await assert.rejects(c.artifact({ id: 'job' }, controller.signal), { name: 'AbortError' });
});
