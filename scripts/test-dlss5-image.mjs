import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const file = resolve('plugins/dlss5-image/effects/light-material.js');
const sandbox = { Uint8ClampedArray, setTimeout };
vm.runInNewContext(readFileSync(file, 'utf8'), sandbox, { filename: file });
const effect = sandbox.DlssLightMaterial;
assert.ok(effect);
assert.equal(effect.settings({ shadows: 200 }).shadows, 100);
assert.equal(effect.settings({ lighting: -8 }).lighting, 0);
assert.equal(effect.settings({ texture: 'bad' }).texture, 38);

const width = 4;
const original = new Uint8ClampedArray([
  8, 8, 8, 255, 42, 38, 34, 255, 190, 178, 160, 255, 248, 246, 240, 128,
]);
const fine = new Uint8ClampedArray([
  8, 8, 8, 255, 35, 35, 35, 255, 176, 170, 156, 255, 230, 228, 225, 128,
]);
const broad = new Uint8ClampedArray([
  10, 10, 10, 255, 80, 80, 80, 255, 160, 160, 160, 255, 184, 184, 184, 128,
]);
const untouched = new Uint8ClampedArray(original.length);
effect.processRows(untouched, original, fine, broad, width, 0, 1, effect.settings({ shadows: 0, lighting: 0, texture: 0, reflections: 0 }));
assert.deepEqual([...untouched], [...original], 'zero controls must preserve every pixel');

const processed = new Uint8ClampedArray(original.length);
effect.processRows(processed, original, fine, broad, width, 0, 1, effect.settings(null));
assert.equal(processed[3], 255);
assert.equal(processed[15], 128, 'alpha must be preserved');
assert.notDeepEqual([...processed], [...original], 'default controls must have a visible effect');
for (let i = 0; i < original.length; i += 4) {
  for (let channel = 0; channel < 3; channel++) {
    assert.ok(Math.abs(processed[i + channel] - original[i + channel]) <= 35, 'effect must remain conservative');
  }
}
console.log('OK dlss5-image light-material pixel tests');
