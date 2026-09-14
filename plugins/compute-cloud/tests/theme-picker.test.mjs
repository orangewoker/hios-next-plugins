import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../app/style.css', import.meta.url), 'utf8');
const app = readFileSync(new URL('../app/app.js', import.meta.url), 'utf8');

test('workflow picker follows the plugin theme instead of the native select theme', () => {
  assert.match(html, /id="runWorkflowTrigger"/);
  assert.match(html, /id="runWorkflowMenu" role="listbox"/);
  assert.doesNotMatch(html, /<select id="runWorkflow"/);
  assert.match(css, /:root\[data-theme="dark"\] \{ color-scheme: dark; \}/);
  assert.match(css, /\.workflow-select-menu\s*\{[^}]*background:\s*var\(--surface\);/s);
  assert.match(app, /option\.setAttribute\('role', 'option'\)/);
});
