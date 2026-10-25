import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const plugins = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'plugins');
const sdk = path.join(root, 'sdk/plugin-ui');
const adapters = JSON.parse(fs.readFileSync(path.join(sdk, 'adapters.json'), 'utf8'));
for (const [id, config] of Object.entries(adapters)) {
  const dir = path.join(plugins, id), manifest = path.join(dir, 'plugin.json');
  if (!fs.existsSync(manifest)) continue;
  const data = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  const entries = new Set([data.rendererEntry, ...(data.nodes || []).map(n => n.rendererEntry), ...(data.contributes?.apps || []).map(a => a.entry)].filter(x => x?.endsWith('.html')));
  if (!entries.size) continue;
  fs.mkdirSync(path.join(dir, 'shared'), { recursive: true });
  for (const name of ['hios-ui.css', 'hios-ui.js']) fs.copyFileSync(path.join(sdk, name), path.join(dir, 'shared', name));
  const selectors = config.controls || '.hios-control';
  const css = `/* Opt-in adapter: ${id}. Never targets canvas, SVG, media or positioning handles. */\n:root body :is(${selectors}) { border-radius:var(--hios-radius-control); box-shadow:var(--hios-shadow-button); }\n${config.css || ''}\n`;
  fs.writeFileSync(path.join(dir, 'shared/hios-adapter.css'), css);
  for (const entry of entries) {
    const file = path.join(dir, entry);
    let html = fs.readFileSync(file, 'utf8').replace(/<!-- hios-ui:start -->[\s\S]*?<!-- hios-ui:end -->\s*/g, '');
    const base = /<base\s+href=["']\.\.\//i.test(html) ? 'shared/' : path.relative(path.dirname(file), path.join(dir, 'shared')).replaceAll('\\', '/') + '/';
    const include = `<!-- hios-ui:start --><link rel="stylesheet" href="${base}hios-ui.css"><link rel="stylesheet" href="${base}hios-adapter.css"><script src="${base}hios-ui.js" data-plugin-id="${id}"></script><!-- hios-ui:end -->\n`;
    html = html.replace(/<\/head>/i, `${include}</head>`);
    fs.writeFileSync(file, html);
  }
  console.log(`${id}: ${entries.size} UI entries`);
}
