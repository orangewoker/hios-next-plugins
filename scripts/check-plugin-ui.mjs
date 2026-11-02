import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {renderGlass} from '../sdk/plugin-ui/glass.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const adapters=JSON.parse(fs.readFileSync(path.join(root,'sdk/plugin-ui/adapters.json')));
let count=0;
const plugins=process.argv[2]?path.resolve(process.argv[2]):path.join(root,'plugins');
for(const id of fs.readdirSync(plugins)){
 if(id.startsWith('.'))continue;
 const dir=path.join(plugins,id),manifest=path.join(dir,'plugin.json');if(!fs.existsSync(manifest))continue;
 const m=JSON.parse(fs.readFileSync(manifest));
 const entries=new Set([m.rendererEntry,...(m.nodes||[]).map(n=>n.rendererEntry),...(m.contributes?.apps||[]).map(a=>a.entry)].filter(e=>e?.endsWith('.html')));
 if(!entries.size)continue;
 assert.ok(adapters[id],`${id}: register an explicit UI adapter before release`);
 for(const name of ['hios-ui.js','hios-ui.css','hios-glass.js'])assert.equal(fs.readFileSync(path.join(dir,'shared',name),'utf8'),fs.readFileSync(path.join(root,'sdk/plugin-ui',name),'utf8'),`${id}: stale UI kit`);
 assert.equal(fs.readFileSync(path.join(dir,'shared/hios-glass.css'),'utf8'),renderGlass(adapters[id]),`${id}: stale glass material`);
 for(const entry of entries){const html=fs.readFileSync(path.join(dir,entry),'utf8');assert.equal((html.match(/<!-- hios-ui:start -->/g)||[]).length,1,`${id}/${entry}: missing or duplicate UI integration`);for(const name of ['hios-ui.js','hios-ui.css','hios-adapter.css','hios-glass.js','hios-glass.css'])assert.equal(html.split(name).length-1,1,`${id}/${entry}: duplicate or missing ${name}`);if(adapters[id].glass.local){assert.ok(html.indexOf('/glass.css')>html.indexOf('hios-ui:end'),`${id}: local material must follow SDK`);assert.ok(fs.existsSync(path.join(dir,'shared/glass.css')),`${id}: missing local material`);}count++;}
}
console.log(`PASS ${count} HTML entry points, SDK parity and future-plugin registration`);
