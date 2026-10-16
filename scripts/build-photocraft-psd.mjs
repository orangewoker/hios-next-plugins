import { build } from 'esbuild';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
const output='plugins/photocraft/vendor';
mkdirSync(output,{recursive:true});
const result=await build({entryPoints:['node_modules/ag-psd/dist-es/index.js'],bundle:true,format:'esm',platform:'browser',minify:true,outfile:join(output,'ag-psd.js'),metafile:true});
const dirs=new Set();
for(const path of Object.keys(result.metafile.inputs)) {
  let dir=dirname(path);
  while(dir!==dirname(dir)) { if(existsSync(join(dir,'package.json'))){dirs.add(dir);break;}dir=dirname(dir); }
}
let licenses='';
for(const dir of dirs) {
  const pkg=JSON.parse(readFileSync(join(dir,'package.json'),'utf8'));
  for(const name of ['LICENSE','LICENSE.txt','LICENSE.md']) if(existsSync(join(dir,name))) {
    licenses+=`\n## ${pkg.name} ${pkg.version}\n`+readFileSync(join(dir,name),'utf8');break;
  }
}
writeFileSync(join(output,'THIRD-PARTY-LICENSES.txt'),licenses);
