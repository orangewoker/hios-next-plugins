import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const adapters=JSON.parse(fs.readFileSync(path.join(root,'sdk/plugin-ui/adapters.json')));
let count=0;
for(const id of fs.readdirSync(path.join(root,'plugins'))){
 const dir=path.join(root,'plugins',id),manifest=path.join(dir,'plugin.json');if(!fs.existsSync(manifest))continue;
 const m=JSON.parse(fs.readFileSync(manifest));
 const entries=new Set([m.rendererEntry,...(m.nodes||[]).map(n=>n.rendererEntry),...(m.contributes?.apps||[]).map(a=>a.entry)].filter(e=>e?.endsWith('.html')));
 if(!entries.size)continue;
 assert.ok(adapters[id],`${id}: register an explicit UI adapter before release`);
 for(const name of ['hios-ui.js','hios-ui.css'])assert.equal(fs.readFileSync(path.join(dir,'shared',name),'utf8'),fs.readFileSync(path.join(root,'sdk/plugin-ui',name),'utf8'),`${id}: stale UI kit`);
 for(const entry of entries){const html=fs.readFileSync(path.join(dir,entry),'utf8');assert.equal((html.match(/<!-- hios-ui:start -->/g)||[]).length,1,`${id}/${entry}: missing or duplicate UI integration`);count++;}
}
console.log(`PASS ${count} HTML entry points, SDK parity and future-plugin registration`);
