import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export function checkPhotoCraftRuntime() {
  try {
    const root = new URL('../plugins/photocraft/', import.meta.url);
    const bytes = readFileSync(new URL('web/photocraft-web_bg.wasm', root));
    const metadata = JSON.parse(readFileSync(new URL('web/build.json', root), 'utf8'));
    if (metadata.upstream !== '2a952f164c0b4cf936b1c6497db10dd095341c00' || metadata.adapter !== 3
      || metadata.sha256 !== createHash('sha256').update(bytes).digest('hex')) throw Error('构建版本或 WASM SHA-256 不匹配');
    const module = new WebAssembly.Module(bytes);
    const exports = new Set(WebAssembly.Module.exports(module).map(item => item.name));
    for (const name of ['hios_request', 'hios_status', 'hios_take_replies']) {
      if (!exports.has(name)) throw Error(`缺少 ${name}`);
    }
    for (const name of ['web/photocraft-web.js', 'fonts/manifest.txt', 'fonts/NotoSansSC-Regular.ttf', 'fonts/OFL-NotoSansSC.txt', 'LICENSE-MIT', 'LICENSE-APACHE', 'NOTICE', 'ATTRIBUTION.md', 'THIRD_PARTY/assets/fonts/OFL-Inter.txt']) readFileSync(new URL(name, root));
  } catch (error) {
    throw new Error(`PhotoCraft 运行资源不完整，请先执行 node scripts/build-photocraft-plugin.mjs：${error.message}`);
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  checkPhotoCraftRuntime(); console.log('PhotoCraft WASM 适配器及运行资源检查通过');
}
