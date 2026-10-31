import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
const root = fileURLToPath(new URL('..', import.meta.url));
const sdk = resolve(root, '../../sdk/plugin-ui');
await mkdir(join(root, 'shared'), { recursive: true });
for (const f of ['hios-ui.css', 'hios-ui.js']) await copyFile(join(sdk, f), join(root, 'shared', f));
await writeFile(join(root, 'shared', 'hios-adapter.css'), '/* Opt-in adapter: breeze-tts. Media and waveform geometry are not targeted. */\n:root body :is(.hios-control) { border-radius:var(--hios-radius-control); box-shadow:var(--hios-shadow-button); }\n');
for (const entry of ['app/index.html', 'node/index.html']) {
  const { readFile } = await import('node:fs/promises');
  let html = (await readFile(join(root, entry), 'utf8')).replace(/<!-- hios-ui:start -->[\s\S]*?<!-- hios-ui:end -->\s*/g, '');
  html = html.replace('</head>', '<!-- hios-ui:start --><link rel="stylesheet" href="../shared/hios-ui.css"><link rel="stylesheet" href="../shared/hios-adapter.css"><script src="../shared/hios-ui.js" data-plugin-id="breeze-tts"></script><!-- hios-ui:end -->\n</head>');
  await writeFile(join(root, entry), html);
}
