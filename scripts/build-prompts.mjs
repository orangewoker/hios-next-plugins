import {readFileSync, writeFileSync} from 'node:fs';
import {resolve, dirname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)), '../prompts');
const records=JSON.parse(readFileSync(resolve(root,'catalog.json'),'utf8').replace(/^\uFEFF/,''));
const ids=new Set();
const prompts=records.map(record=>{
  if(!record.id || ids.has(record.id) || !record.title || !['system','positive','both'].includes(record.kind) || !Array.isArray(record.tags) || record.tags.some(t=>typeof t!=='string')) throw Error('Invalid prompt metadata');
  ids.add(record.id);
  const path=resolve(root,record.file);
  if(!path.startsWith(root+sep) || !path.endsWith('.md')) throw Error('Invalid prompt path');
  const prompt=readFileSync(path,'utf8').replace(/^\uFEFF/,'').replace(/\r\n/g,'\n').trim();
  if(!prompt) throw Error('Empty prompt');
  const {file,...metadata}=record;
  return {...metadata,prompt};
});
writeFileSync(resolve(root,'index.json'),JSON.stringify({version:1,prompts},null,2)+'\n');
console.log(`Built ${prompts.length} prompts`);
