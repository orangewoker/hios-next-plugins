import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pluginsRoot = join(root, 'plugins');
const portableBrowserPlugins = new Set(['xiaohongshu-assets', 'pinterest-assets', 'web-browser']);

for (const entry of readdirSync(pluginsRoot, { withFileTypes: true }).filter((item) => item.isDirectory())) {
  const pluginRoot = join(pluginsRoot, entry.name);
  const manifestPath = join(pluginRoot, 'plugin.json');
  assert.ok(existsSync(manifestPath), `${entry.name}: missing plugin.json`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.id, basename(pluginRoot), `${entry.name}: manifest id must match directory`);
  assert.match(String(manifest.version || ''), /^\d+\.\d+\.\d+$/, `${entry.name}: invalid SemVer`);
  assert.ok([1, 2].includes(Number(manifest.schemaVersion || 1)), `${entry.name}: unsupported schemaVersion`);

  const rendererEntries = [
    ...(Array.isArray(manifest.nodes) ? manifest.nodes.map((node) => node.rendererEntry) : []),
    ...(Array.isArray(manifest.contributes?.apps) ? manifest.contributes.apps.map((app) => app.entry) : []),
  ].filter(Boolean);
  for (const relative of new Set(rendererEntries)) {
    const file = resolve(pluginRoot, relative);
    assert.ok(file.startsWith(pluginRoot + '\\') || file.startsWith(pluginRoot + '/'), `${entry.name}: renderer escapes plugin root`);
    assert.ok(existsSync(file), `${entry.name}: missing renderer ${relative}`);
    if (!file.toLowerCase().endsWith('.html')) continue;
    const html = readFileSync(file, 'utf8');
    for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)) new Function(match[1]);
    if (portableBrowserPlugins.has(entry.name)) {
      assert.match(html, /network-request/, `${entry.name}: missing portable network protocol`);
      assert.doesNotMatch(html, /browser-open|browser-command|<webview/i, `${entry.name}: still depends on Electron webview`);
    }
  }
  console.log(`OK ${entry.name} ${manifest.version}`);
}
