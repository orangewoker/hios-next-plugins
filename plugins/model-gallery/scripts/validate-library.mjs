import { readFileSync, statSync, realpathSync, existsSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { INDEX, normalizeCatalog, groupPoses } from '../runtime/gallery-core.mjs';

const [kind, directory] = process.argv.slice(2);
if (!Object.hasOwn(INDEX, kind) || !directory) throw Error('用法：node validate-library.mjs portrait|costume|pose <仓库或 library 目录>');
let root = realpathSync(directory);
if (!existsSync(resolve(root, 'data', INDEX[kind]))) root = realpathSync(resolve(root, 'library'));
const rows = normalizeCatalog(kind, JSON.parse(readFileSync(resolve(root, 'data', INDEX[kind]), 'utf8')));
const missing = [], invalid = []; let bytes = 0;
const paths = new Set(rows.flatMap(row => [row.full, row.thumb, row.preview]));
for (const path of paths) {
  try {
    const file = realpathSync(resolve(root, path)), rel = relative(root, file);
    if (rel.startsWith('..') || isAbsolute(rel)) throw Error('路径越界');
    const stat = statSync(file);
    if (!stat.isFile() || stat.size === 0 || stat.size > 64 * 1024 * 1024) throw Error('文件为空或超限');
    bytes += stat.size;
  } catch (error) { if (error.code === 'ENOENT') missing.push(path); else invalid.push({path,error:error.message}); }
}
console.log(JSON.stringify({ kind, records: rows.length, ...(kind === 'pose' ? { groups: groupPoses(rows).size } : {}), files: paths.size, bytes, missing, invalid }, null, 2));
if (missing.length || invalid.length) process.exitCode = 1;
