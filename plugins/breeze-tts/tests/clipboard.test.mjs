import test from 'node:test';
import assert from 'node:assert/strict';
import { copyText } from '../shared/clipboard.js';

function documentFixture(success = true) {
  const events = [];
  const field = { style: {}, focus: () => events.push('focus'), select: () => events.push('select'), remove: () => events.push('remove') };
  return { field, events, document: {
    activeElement: { focus: () => events.push('restore-focus') },
    createElement: () => field, body: { append: () => events.push('append') },
    execCommand: command => { assert.equal(command, 'copy'); events.push('copy'); return success; },
  } };
}
test('standalone secure clipboard succeeds without touching DOM', async () => {
  const values = [];
  await copyText('fixture-key', { clipboard: { writeText: async text => values.push(text) }, document: null });
  assert.deepEqual(values, ['fixture-key']);
});
test('blocked clipboard policy or insecure LAN falls back and removes secret field', async () => {
  for (const clipboard of [null, { writeText: async () => { throw Error('Permissions policy'); } }]) {
    const f = documentFixture(); await copyText('fixture-key', { clipboard, document: f.document });
    assert.equal(f.field.value, 'fixture-key');
    assert.deepEqual(f.events, ['append', 'focus', 'select', 'copy', 'remove', 'restore-focus']);
  }
});
test('failed copy is reported in Chinese, never as success, and always cleans up', async () => {
  const f = documentFixture(false);
  await assert.rejects(copyText('fixture-key', { clipboard: null, document: f.document }), /手动复制/);
  assert.deepEqual(f.events.slice(-2), ['remove', 'restore-focus']);
  await assert.rejects(copyText('', { clipboard: null, document: f.document }), /密钥为空/);
});
