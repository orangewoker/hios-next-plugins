import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {renderGlass} from '../sdk/plugin-ui/glass.mjs';
const adapters=JSON.parse(fs.readFileSync('sdk/plugin-ui/adapters.json'));
test('every plugin opts into bounded material; no global artwork/geometry reset',()=>{
  for(const [id,config] of Object.entries(adapters)) {
    assert.ok(config.glass,id);
    const css=renderGlass(config);
    assert.ok(!css.includes(':--'),id);
    assert.ok(!/\b(?:canvas|svg|img|video)\s*\{/.test(css),id);
    if(config.glass.local)continue;
    for(const feature of ['prefers-reduced-motion','forced-colors','--hios-accent-contrast','--range-fill'])assert.ok(css.includes(feature),id+' '+feature);
    assert.ok(!/backdrop-filter\s*:\s*blur/.test(css),id+': no composited glass');
  }
  assert.ok(!adapters['image-compare'].glass.ranges,'comparison divider is not a settings slider');
  assert.ok(!adapters['watermark-master'].glass.buttons.includes('anchors'),'placement geometry remains original');
  assert.ok(!adapters['dx-cut'].glass.buttons.includes('.timeline '),'timeline positions stay original');
});
function fixture(){
  const listeners={},ranges=[],timers=new Map();let observer,id=0,events=0;
  const document={currentScript:{dataset:{ranges:'input[type=range]'}},visibilityState:'visible',readyState:'complete',documentElement:{},querySelectorAll:()=>ranges,addEventListener:(name,fn)=>listeners[name]=fn};
  const context={document,MutationObserver:class{constructor(fn){observer=fn;}observe(){}},setTimeout:fn=>{timers.set(++id,fn);return id;},clearTimeout:id=>timers.delete(id)};
  vm.runInNewContext(fs.readFileSync('sdk/plugin-ui/hios-glass.js','utf8'),context);
  const add=(min,max,value)=>{const el={min,max,value,isConnected:true,matches:()=>true,querySelectorAll:()=>[],style:{setProperty(k,v){this[k]=v;}},dispatchEvent(){events++;}};ranges.push(el);observer([{type:'childList',addedNodes:[el]}]);return el;};
  const tick=()=>{const pending=[...timers.values()];timers.clear();pending.forEach(fn=>fn());};
  return {document,listeners,ranges,timers,add,tick,observer:()=>observer,events:()=>events};
}
test('dynamic sliders: min/max, input, property-only reset, removal, hidden pause; no synthetic events',()=>{
  const f=fixture(),r=f.add('-100','100','-22');assert.equal(r.style['--range-fill'],'39%');
  r.value='100';f.listeners.input({target:r});assert.equal(r.style['--range-fill'],'100%');
  r.value='0';f.tick();assert.equal(r.style['--range-fill'],'50%');
  r.min='0';r.max='0';f.observer()([{type:'attributes',target:r}]);assert.equal(r.style['--range-fill'],'0%');
  r.min='1.4';r.max='16';r.value='2.8';f.tick();assert.ok(Math.abs(parseFloat(r.style['--range-fill'])-9.589041)<.001);
  f.document.visibilityState='hidden';f.listeners.visibilitychange();assert.equal(f.timers.size,0);
  f.document.visibilityState='visible';f.listeners.visibilitychange();assert.equal(f.timers.size,1);
  r.isConnected=false;f.tick();assert.equal(f.timers.size,0);assert.equal(f.events(),0);
});
test('mutations never starve scheduled property synchronization or write native value',()=>{
  const f=fixture(),r=f.add('0','100','20');r.value='60';
  for(let i=0;i<20;i++)f.observer()([{type:'childList',addedNodes:[]}]);
  assert.equal(f.timers.size,1);f.tick();assert.equal(r.style['--range-fill'],'60%');assert.equal(r.value,'60');
  assert.ok(!/postMessage|fetch\(|dispatchEvent|defineProperty|requestAnimationFrame/.test(fs.readFileSync('sdk/plugin-ui/hios-glass.js','utf8')));
});
