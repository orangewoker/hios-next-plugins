import test from 'node:test';
import assert from 'node:assert/strict';
import { ChenyuClient } from '../shared/client.js';
import { normalizeWorkflow } from '../shared/core.js';
import { PRESETS } from '../shared/presets.js';
import { submitRun, pollRun, resumeSubmission, delay } from '../shared/runner.js';
const config = { quoteLimit: '0.20', pollIntervalMs: 1, maxWaitMinutes: 1 };
const workflow = normalizeWorkflow(PRESETS[0]);
const values = { node_1_image: 'asset://test', node_3_resolution: 1024 };
const response = data => new Response(JSON.stringify({ code: 0, data }), { status: 200, headers: { 'Content-Type': 'application/json' } });
function memoryStore() { const tasks = new Map(); return { loadTasks: () => [...tasks.values()], saveTask: t => { tasks.set(t.idempotencyKey, structuredClone(t)); return t; } }; }
test('client sends Bearer auth only to fixed official API, never follows redirects', async () => {
  let request;
  const client = new ChenyuClient('fixture-key', { fetch: async (url, opts) => { request = { url, ...opts }; return response({ run_order_id: 'order' }); } });
  await client.submit({ workflow_id: 'wf_test' }); assert.equal(request.url, 'https://www.chenyu.cn/api/open/v2/workflow/run/submit');
  assert.equal(request.headers.Authorization, 'Bearer fixture-key'); assert.equal(request.redirect, 'error'); assert.equal(request.credentials, 'omit');
});
test('asset upload uses multipart without forcing Content-Type and reuses repeated local inputs', async () => {
  let uploads = 0;
  const client = new ChenyuClient('fixture-key', { fetch: async (url, opts) => {
    if (String(url).startsWith('data:')) return fetch(url);
    uploads++; assert.ok(opts.body instanceof FormData); assert.equal(opts.headers['Content-Type'], undefined);
    assert.equal(opts.body.get('purpose'), 'temp_input'); assert.equal(opts.body.get('media_type'), 'image'); return response({ asset_uri: 'asset://uploaded' });
  } });
  const w = { fields: [{ name: 'a', type: 'image' }, { name: 'b', type: 'image' }] };
  const result = await client.prepareInputs(w, { a: 'data:image/png;base64,AA==', b: { uri: 'data:image/png;base64,AA==', role: 'reference_image' } });
  assert.equal(uploads, 1); assert.deepEqual(result, { a: 'asset://uploaded', b: { uri: 'asset://uploaded', role: 'reference_image' } });
});
test('rejects cloud-inaccessible local paths and insecure remote media', async () => {
  const client = new ChenyuClient('fixture-key');
  for (const uri of ['C:/input.png', 'file:///C:/input.png', 'http://example.com/a.png']) await assert.rejects(client.prepareInputs(workflow, { node_1_image: uri }), /需要/);
});
test('client redacts credential values from upstream error text', async () => {
  const client = new ChenyuClient('fixture-secret', { fetch: async () => new Response(JSON.stringify({ code: 1, msg: 'invalid fixture-secret' })) });
  await assert.rejects(client.info('order'), error => !error.message.includes('fixture-secret') && error.message.includes('已隐藏'));
});
test('paid submit is preceded by durable pending record, ambiguous failures never auto-retry', async () => {
  let calls = 0; const store = memoryStore();
  const client = { prepareInputs: async (_, values) => values, submit: async () => { calls++; assert.equal(store.loadTasks()[0].status, 'submitting'); throw new Error('connection lost'); } };
  await assert.rejects(submitRun({ client, workflow, values, config, store }), /connection/);
  assert.equal(store.loadTasks()[0].status, 'submission_unknown'); assert.ok(store.loadTasks()[0].body.idempotency_key);
  await assert.rejects(submitRun({ client, workflow, values, config, store }), /相同参数/); assert.equal(calls, 1);
});
test('user-triggered recovery replays exact request/key rather than creating another order', async () => {
  const store = memoryStore(), body = { idempotency_key: 'original', inputs: values };
  const task = { idempotencyKey: 'original', body, runOrderId: '' };
  const result = await resumeSubmission(task, { submit: async request => { assert.deepEqual(request, body); return { run_order_id: 'same-order', idempotent_replay: true }; } }, store);
  assert.equal(result.runOrderId, 'same-order'); assert.equal(result.idempotencyKey, 'original');
});
test('over-limit and external-cost workflows do not upload or submit', async () => {
  const client = { prepareInputs: () => assert.fail('no upload'), submit: () => assert.fail('no submit') };
  for (const w of [{ ...workflow, quoteAmount: '0.21' }, { ...workflow, externalCost: true }]) await assert.rejects(submitRun({ client, workflow: w, values, config, store: memoryStore() }));
});
test('polling uses run_order_id, returns all outputs, and tolerates execution endpoint failure', async () => {
  const store = memoryStore(), task = { idempotencyKey: 'poll', runOrderId: 'order-id', workflowId: workflow.id, workflowName: workflow.name, workflow };
  const client = { info: async id => { assert.equal(id, 'order-id'); return { run_order_id: id, run_status: 'succeeded', content_audit_status: 'approved', outputs: { result_5_images_1: ['https://media.chenyu.cn/a', 'https://media.chenyu.cn/b'] }, settlement_status: 'settled', final_amount: '0.01' }; }, execution: async () => { throw new Error('temporarily unavailable'); } };
  const result = await pollRun({ client, task, config, store }); assert.equal(result.outputs.length, 2); assert.equal(result.taskId, 'order-id'); assert.equal(store.loadTasks()[0].terminal, true);
});
test('audit pending is polled again instead of prematurely returning success', async () => {
  let calls = 0;
  const task = { idempotencyKey: 'audit', runOrderId: 'order-id', workflow };
  const client = { info: async () => (++calls === 1 ? { run_status: 'succeeded', content_audit_status: 'pending' } : { run_status: 'succeeded', content_audit_status: 'approved', outputs: { result_5_images_1: ['https://media.chenyu.cn/a'] } }), execution: async () => ({ progress_percent: 100 }) };
  await pollRun({ client, task, config, store: memoryStore(), wait: async () => {} }); assert.equal(calls, 2);
});
test('query errors are bounded and never resubmit a paid task', async () => {
  let queries = 0;
  const client = { info: async () => { queries++; throw new Error('offline'); }, submit: () => assert.fail('no paid retry') };
  await assert.rejects(pollRun({ client, task: { runOrderId: 'order' }, config, store: memoryStore(), wait: async () => {} }), /连续查询失败/); assert.equal(queries, 5);
});
test('stopping wait does not call any server cancellation endpoint or lose saved task', async () => {
  const c = new AbortController(); c.abort();
  await assert.rejects(delay(10, c.signal), { name: 'AbortError' });
  await assert.rejects(pollRun({ client: { info: () => assert.fail('already aborted') }, task: {}, config, store: memoryStore(), signal: c.signal }), { name: 'AbortError' });
});
