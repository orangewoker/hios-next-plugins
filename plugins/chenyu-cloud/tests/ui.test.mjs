import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderGlass } from '../../../sdk/plugin-ui/glass.mjs';

test('Chenyu ships matching UI SDK files, bounded theme adapter and version catalog', () => {
  const plugin = new URL('../', import.meta.url);
  const sdk = new URL('../../../sdk/plugin-ui/', import.meta.url);
  const adapters = JSON.parse(readFileSync(new URL('adapters.json', sdk), 'utf8'));
  for (const name of ['hios-ui.js', 'hios-ui.css', 'hios-glass.js']) {
    assert.equal(readFileSync(new URL(`shared/${name}`, plugin), 'utf8'), readFileSync(new URL(name, sdk), 'utf8'));
  }
  assert.equal(readFileSync(new URL('shared/hios-glass.css', plugin), 'utf8'), renderGlass(adapters['chenyu-cloud']));
  const html = readFileSync(new URL('app/index.html', plugin), 'utf8');
  assert.equal((html.match(/<!-- hios-ui:start -->/g) || []).length, 1);
  const manifest = JSON.parse(readFileSync(new URL('plugin.json', plugin), 'utf8'));
  const versions = JSON.parse(readFileSync(new URL('versions.json', plugin), 'utf8'));
  assert.equal(versions.pluginId, manifest.id);
  assert.ok(versions.versions.some(v => v.version === manifest.version && v.ref === `${manifest.id}-v${manifest.version}`));
});
