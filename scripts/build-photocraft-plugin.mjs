import { cp, mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pin = 'b1794c6e0608ccfc887213dcf58398977c5cb75e';
const source = resolve(process.env.PHOTOCRAFT_ROOT || join(project, 'tmp', 'photocraft-source-v016'));
const target = join(project, 'plugins', 'photocraft', 'web');
const run = (command, args, cwd) => new Promise((res, rej) => {
  const env = { ...process.env }; delete env.NO_COLOR;
  const child = spawn(command, args, { cwd, stdio: 'inherit', env, windowsHide: true });
  child.on('error', rej); child.on('exit', code => code === 0 ? res() : rej(new Error(`${command} 退出码 ${code}`)));
});
if (!existsSync(join(source, 'Cargo.toml'))) {
  await mkdir(dirname(source), { recursive: true });
  await run('git', ['clone', 'https://github.com/storytold/photocraft.git', source], project);
  await run('git', ['checkout', '--detach', pin], source);
}
const actualHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8', windowsHide: true }).trim();
if (actualHead !== pin) throw new Error(`PhotoCraft 源码版本不匹配：需要 ${pin}，当前 ${actualHead}`);
const web = join(source, 'apps', 'photocraft-web');
const dist = join(project, 'tmp', 'photocraft-dist');
const originals = new Map();
async function patch(path, replacements) {
  const original = await readFile(path, 'utf8'); originals.set(path, original);
  let next = original;
  for (const [from, to] of replacements) {
    if (!next.includes(from)) throw new Error(`上游结构已变化：${path} 中未找到 ${from.slice(0, 60)}`);
    next = next.replace(from, to);
  }
  await writeFile(path, next);
}
const adapter = join(web, 'src', 'hios.rs');
if (existsSync(adapter)) throw new Error(`已有适配器文件，拒绝覆盖：${adapter}`);
originals.set(join(source, 'Cargo.lock'), await readFile(join(source, 'Cargo.lock')));
try {
  await cp(join(project, 'scripts', 'photocraft', 'hios.rs'), adapter);
  await patch(join(web, 'src', 'main.rs'), [['mod web;', 'mod web;\n#[cfg(target_arch = "wasm32")]\nmod hios;']]);
  await patch(join(web, 'src', 'web.rs'), [
    ['let inbox: Inbox = Arc::default();', 'crate::hios::attach(&cc.egui_ctx);\n                    let inbox: Inbox = Arc::default();'],
    ['let dropped = ctx.input_mut', 'crate::hios::pump(&mut self.app, ctx);\n        let dropped = ctx.input_mut'],
  ]);
  await patch(join(web, 'Cargo.toml'), [['[dependencies]', '[dependencies]\nserde_json = { workspace = true }\nphotocraft-compose = { workspace = true }\nphotocraft-raster = { workspace = true }\nphotocraft-color = { workspace = true }\nphotocraft-geom = { workspace = true }\nphotocraft-algo = { workspace = true }']]);
  // rustc still uses the upstream size-optimized profile, without Binaryen's slow convergence pass.
  await patch(join(web, 'index.html'), [['data-wasm-opt="z" data-wasm-opt-params="--converge"', 'data-wasm-opt="0"']]);
  await run('trunk', ['build', '--release', '--filehash', 'false', '--dist', dist], web);
  if (!existsSync(join(dist, 'photocraft-web_bg.wasm'))) throw new Error('WASM 构建产物缺失');
  const staged = target + '.staged'; const backup = target + '.previous';
  await rm(staged, { recursive: true, force: true });
  await cp(dist, staged, { recursive: true });
  const sha256 = createHash('sha256').update(await readFile(join(staged, 'photocraft-web_bg.wasm'))).digest('hex');
  await writeFile(join(staged, 'build.json'), JSON.stringify({ upstream: actualHead, adapter: 3, sha256, builtAt: new Date().toISOString() }, null, 2));
  await rm(backup, { recursive: true, force: true });
  if (existsSync(target)) await rename(target, backup);
  try { await rename(staged, target); } catch (e) { if (existsSync(backup)) await rename(backup, target); throw e; }
  await rm(backup, { recursive: true, force: true });
  for (const name of ['LICENSE-MIT', 'LICENSE-APACHE', 'NOTICE', 'ATTRIBUTION.md']) await cp(join(source, name), join(project, 'plugins', 'photocraft', name));
  const licenses = [
    'assets/fonts/OFL-Inter.txt', 'assets/fonts/OFL-JetBrainsMono.txt',
    'assets/icons/LICENSE-lucide.txt', 'assets/icons/LICENSE-noun-magnetic-lasso.txt', 'assets/icons/LICENSE-symmetry-axes.txt',
    'crates/algo/data/LICENSE-libfacedetection.txt', 'crates/ui-egui/src/i18n/LICENSE-translations.txt',
    'assets/dict/LICENSE-SCOWL.txt', 'crates/ui-egui/src/LICENSE-solarized.txt',
  ];
  for (const name of licenses) {
    const output = join(project, 'plugins', 'photocraft', 'THIRD_PARTY', name);
    await mkdir(dirname(output), { recursive: true }); await cp(join(source, name), output);
  }
  console.log(`PhotoCraft Web 已构建：${target}`);
} finally {
  for (const [path, content] of originals) await writeFile(path, content);
  await rm(adapter, { force: true });
}
