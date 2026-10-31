import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { zipSync } from '../vendor/fflate.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await readFile(join(root, 'plugin.json'), 'utf8'));
const entries = {};
async function add(relative) {
  const path = join(root, relative);
  const children = await readdir(path, { withFileTypes: true });
  for (const child of children.sort((a, b) => a.name.localeCompare(b.name))) {
    const name = `${relative}/${child.name}`;
    if (child.isSymbolicLink()) throw new Error(`Package must not contain symlinks: ${name}`);
    if (child.isDirectory()) await add(name);
    else if (child.isFile()) entries[name] = new Uint8Array(await readFile(join(root, name)));
  }
}
// Explicit allowlist: never package a model, service.json, access key or local job data.
for (const directory of ['app', 'node', 'assets', 'shared', 'service', 'vendor', 'scripts', 'tests']) await add(directory);
for (const name of ['plugin.json', 'package.json', 'README.md', 'HOST_INTEGRATION.md', 'TEST_REPORT.md', 'start-local.cmd', 'start-lan.cmd']) entries[name] = new Uint8Array(await readFile(join(root, name)));
const target = process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(new URL(`../../../output/breeze-tts-${manifest.version}-plugin-preview.zip`, import.meta.url));
await mkdir(dirname(target), { recursive: true });
const archive = zipSync(entries, { level: 6 }); await writeFile(target, archive);
const sha256 = createHash('sha256').update(archive).digest('hex');
await writeFile(`${target}.sha256`, `${sha256}  ${target.split(/[\\/]/).pop()}\n`);
console.log(JSON.stringify({ path: target, version: manifest.version, files: Object.keys(entries).length, bytes: archive.length, sha256 }, null, 2));
