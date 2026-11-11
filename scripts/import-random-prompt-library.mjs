// Explicit one-time source import; the plugin never reads the user's Desktop at runtime.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const source = process.argv[2];
if (!source) throw Error('Usage: node scripts/import-random-prompt-library.mjs <七类标签库目录>');
const categories = [
  ['character', '人物定位描述'], ['top', '上衣'], ['bottom', '下衣'],
  ['shoes', '鞋子'], ['hair', '发型'], ['pose', '姿势'], ['camera', '镜头'],
].map(([id, title]) => {
  const file = `Krea2_标签库_${title}_300条.md`;
  const bytes = readFileSync(join(source, file));
  const text = bytes.toString('utf8');
  const entries = [...text.matchAll(/【(\d+)】[^\r\n]*\r?\n模块类型：[^\r\n]*\r?\n模块内容：([^\r\n]+)/g)]
    .map(([, number, content]) => ({ id: number.padStart(3, '0'), text: content.trim() }));
  if (entries.length !== 300 || new Set(entries.map(e => e.id)).size !== 300 || entries.some(e => !e.text)) {
    throw Error(`${file}: expected 300 nonempty entries with unique IDs, got ${entries.length}`);
  }
  return { id, title, source: file, sha256: createHash('sha256').update(bytes).digest('hex'), entries };
});
const target = fileURLToPath(new URL('../plugins/random-prompt-composer/data/', import.meta.url));
mkdirSync(target, { recursive: true });
writeFileSync(resolve(target, 'library.mjs'), `// Imported verbatim from the user's seven-category Krea2 tag library.\nexport default ${JSON.stringify({ schemaVersion: 1, categories }, null, 2)};\n`);
console.log(categories.map(c => `${c.title}: ${c.entries.length}`).join('\n'));
