import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkshopClient } from '../shared/client.js';
import { newId } from '../shared/core.js';

test('LAN HTTP UUID fallback is valid without crypto.randomUUID', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { getRandomValues: a => a.fill(19) } });
  try { assert.match(newId(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/); }
  finally { Object.defineProperty(globalThis, 'crypto', descriptor); }
});

test('cancellation during submission still cancels the accepted server job', async () => {
  const client = new WorkshopClient({}), controller = new AbortController(), calls = [];
  client.request = async (path, options) => {
    calls.push([path, options.method]);
    if (path === '/api/jobs') { controller.abort(); return { id: 'accepted-before-cancel', status: 'starting' }; }
    return {};
  };
  await assert.rejects(client.synthesize({ text: 'test' }, { signal: controller.signal }), { name: 'AbortError' });
  assert.deepEqual(calls, [['/api/jobs', 'POST'], ['/api/jobs/accepted-before-cancel', 'DELETE']]);
});

test('already cancelled requests never submit work', async () => {
  const client = new WorkshopClient({}), controller = new AbortController(); controller.abort();
  client.request = () => assert.fail('unexpected network request');
  await assert.rejects(client.synthesize({}, { signal: controller.signal }), { name: 'AbortError' });
});
