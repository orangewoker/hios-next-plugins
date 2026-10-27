// Run before committing a plugin release: node .../generate-plugin-update-manifest.mjs <plugin-directory>
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { realpathSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve, sep } from 'node:path';

const directory=realpathSync(resolve(process.argv[2] || ''));
const root=realpathSync(execFileSync('git',['-C',directory,'rev-parse','--show-toplevel'],{encoding:'utf8'}).trim());
const prefix=relative(root,directory).split(sep).join('/');
if (!prefix || prefix.startsWith('../') || prefix==='..') throw new Error('插件必须是 Git 仓库内的子目录');
const git=(args,options={})=>execFileSync('git',['-C',root,...args],{maxBuffer:130*1024*1024,...options});
// Hash the staged Git blob, not the working tree: Git may normalize CRLF to LF.
// Require all release changes to be staged so the manifest matches the commit.
const unstaged=git(['diff','--name-only','-z','--',prefix],{encoding:'utf8'}).split('\0').filter(path=>path && path!==`${prefix}/plugin-update.json`);
const untracked=git(['ls-files','--others','--exclude-standard','-z','--',prefix],{encoding:'utf8'}).split('\0').filter(path=>path && path!==`${prefix}/plugin-update.json`);
if(unstaged.length || untracked.length)throw new Error(`请先暂存插件所有改动，再生成清单：${[...unstaged,...untracked].slice(0,5).join(', ')}`);
const blob=path=>git(['show',`:${prefix}/${path}`]);
const plugin=JSON.parse(blob('plugin.json').toString('utf8'));
if (!/^[a-z0-9][a-z0-9._-]*$/.test(plugin.id) || plugin.id!==basename(directory) || typeof plugin.version!=='string' || !plugin.version) throw new Error('插件 ID 或版本无效');
const raw=git(['ls-files','--stage','-z','--',prefix],{encoding:'utf8'});
const indexed=raw.split('\0').filter(Boolean).map(entry=>{const match=entry.match(/^(\d{6}) ([a-f0-9]{40}) (\d)\t([\s\S]+)$/);if(!match||match[3]!=='0')throw new Error('插件包含未解决的 Git 冲突');if(!['100644','100755'].includes(match[1]))throw new Error(`不支持符号链接或子模块：${match[4]}`);return match[4].slice(prefix.length+1);});
const entries=[...new Set(indexed)].filter(path=>path!=='plugin-update.json').sort();
if(entries.length>10000)throw new Error('插件文件超过 10000 个');
const seen=new Set();let total=0;
const files=entries.map(path=>{
  const key=path.toLowerCase();
  if (!path || path.length>320 || path.includes('\\') || /[\x00-\x1f\x7f:?#*<>|\"]/.test(path) || path.split('/').some(part=>!part||part==='.'||part==='..'||/[. ]$/.test(part)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)) || ['plugin-update.json','.hios-incremental-installed.json'].includes(key) || seen.has(key)) throw new Error(`无效或冲突路径：${path}`);
  seen.add(key);
  const bytes=blob(path);
  if(bytes.subarray(0,80).toString('utf8').startsWith('version https://git-lfs.github.com/spec/v1\n'))throw new Error(`暂不支持 Git LFS 文件：${path}`);
  if(bytes.length>128*1024*1024)throw new Error(`文件超过增量更新上限：${path}`);
  total+=bytes.length;if(total>1024*1024*1024)throw new Error('插件文件总量超过增量更新上限');
  return {path,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
});
if (!files.some(item=>item.path==='plugin.json')) throw new Error('清单缺少 plugin.json');
writeFileSync(join(directory,'plugin-update.json'),JSON.stringify({schemaVersion:1,pluginId:plugin.id,version:plugin.version,files},null,2)+'\n');
console.log(`已生成 ${plugin.id} ${plugin.version} 增量清单：${files.length} 个文件`);
