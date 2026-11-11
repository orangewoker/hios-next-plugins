import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { categories, SYSTEM_PROMPT, normalizeState, randomize, compose, inputText } from '../plugins/random-prompt-composer/runtime/core.mjs';

test('seven categories have 300 uniquely numbered nonempty verbatim entries', () => {
  assert.equal(categories.length, 7);
  for (const c of categories) {
    assert.equal(c.entries.length, 300);
    assert.equal(new Set(c.entries.map(e => e.id)).size, 300);
    assert.ok(c.entries.every(e => e.text.trim()));
    const file = process.env.KREA2_TAG_SOURCE && join(process.env.KREA2_TAG_SOURCE, c.source);
    if (file && existsSync(file)) assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'), c.sha256);
  }
});
test('fixed seed reproduces selections and each category remains in bounds', () => {
  for (const seed of [1, 12, 123456, 4294967295]) {
    const a = randomize({ seed }); const b = randomize({ seed });
    assert.deepEqual(a, b);
    for (const c of categories) assert.ok(c.entries.some(e => e.id === a.selected[c.id]));
  }
});
test('zero seed consumes fresh entropy, previous actual seed reproduces selection', () => {
  const a = randomize({}, () => 123); const b = randomize({}, () => 456);
  assert.notDeepEqual(a.selected, b.selected);
  assert.deepEqual(a.selected, randomize({ seed: a.lastSeed }).selected);
});
test('locks survive randomization without shifting the other category draws', () => {
  const base = randomize({ seed: 99 });
  const locked = randomize({ seed: 99, selected: { top: '299' }, locked: { top: true } });
  assert.equal(locked.selected.top, '299');
  for (const c of categories.filter(c => c.id !== 'top')) assert.equal(locked.selected[c.id], base.selected[c.id]);
});
test('state roundtrip preserves all choices, locks, seed and brief', () => {
  const state = randomize({ seed: 314, locked: { camera: true }, selected: { camera: '088' }, brief: '雨夜街头', randomOnRun: false });
  assert.deepEqual(normalizeState(JSON.parse(JSON.stringify(state))), state);
  assert.deepEqual(normalizeState(null), normalizeState());
  const bad = normalizeState({ seed: -1, lastSeed: -1, selected: { top: '__proto__' }, locked: { top: 'true' } });
  assert.equal(bad.seed, 0); assert.equal(bad.lastSeed, 0); assert.equal(bad.selected.top, '001'); assert.equal(bad.locked.top, false);
});
test('positive output preserves all seven texts and adds both brief sources, not system prompt', () => {
  const state = randomize({ seed: 128, brief: '白色上衣' });
  const prompt = compose(state, ['雨夜街头', { kind: 'text', value: '冷暖对比' }]);
  for (const c of categories) assert.ok(prompt.includes(c.entries.find(e => e.id === state.selected[c.id]).text));
  for (const text of ['白色上衣', '雨夜街头', '冷暖对比']) assert.ok(prompt.includes(text));
  assert.ok(!prompt.includes('你是一名')); assert.ok(!prompt.includes('种子'));
  assert.equal(inputText({ kind: 'text', value: ' hello ' }), 'hello'); assert.equal(inputText(null), '');
});
test('system prompt document matches runtime exactly; manifest declares only positive text', () => {
  assert.equal(readFileSync(new URL('../plugins/random-prompt-composer/LLM深化系统提示词.txt', import.meta.url), 'utf8').trim(), SYSTEM_PROMPT);
  const manifest = JSON.parse(readFileSync(new URL('../plugins/random-prompt-composer/plugin.json', import.meta.url)));
  assert.deepEqual(manifest.nodes[0].outputs, [{ id: 'positive', title: '正向提示词', type: 'text' }]);
  assert.deepEqual(manifest.permissions, ['canvas']);
});
