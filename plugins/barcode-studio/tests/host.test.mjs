import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from '../source/node_modules/typescript/lib/typescript.js';
const code=ts.transpileModule(readFileSync(new URL('../source/src/host.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function fixture(){
 const messages=[],listeners=new Map(),parent={postMessage:m=>messages.push(m)};
 const window={parent,addEventListener:(k,f)=>listeners.set(k,f),removeEventListener:k=>listeners.delete(k),setTimeout,clearTimeout};
 const exports={};vm.runInNewContext(code,{exports,window,parent,setTimeout,clearTimeout,crypto:globalThis.crypto,Uint8Array,URL,console});
 const receive=(type,payload={},extra={})=>listeners.get('message')?.({source:parent,origin:'https://hios.test',data:{protocol:'hios-plugin-node/v1',pluginId:'barcode-studio',nodeId:'n1',type,payload},...extra});
 return {api:exports,messages,receive,parent};
}
test('handshake, spoof rejection, protocol and node locking, hydration and run',async()=>{
 const f=fixture();let hydrated=0,runs=0;
 const disconnect=f.api.connectHost(()=>{},()=>hydrated++,async()=>{runs++});
 assert.equal(f.messages.length,2);
 f.receive('init',{}, {source:{}});assert.equal(hydrated,0);
 f.receive('init');assert.equal(hydrated,1);
 f.receive('init',{}, {origin:'https://evil.test'});assert.equal(hydrated,1);
 f.receive('init',{}, {data:{protocol:'hios-plugin-node/v1',type:'init',nodeId:'other'}});assert.equal(hydrated,1);
 f.receive('run');await Promise.resolve();assert.equal(runs,1);
 f.api.postState({content:'test'});assert.equal(f.messages.at(-1).payload.state.content,'test');disconnect();
});
test('file store waits for matching ACK, rejects failure, and normalizes SVG MIME',async()=>{
 const f=fixture();const disconnect=f.api.connectHost(()=>{},()=>{},async()=>{});f.receive('init');
 const saving=f.api.saveFile(new Blob(['<svg/>'],{type:'image/svg+xml;charset=utf-8'}),'test.svg');
 await new Promise(r=>setImmediate(r));const request=f.messages.at(-1);
 assert.equal(request.type,'file-store');assert.equal(request.payload.mime,'image/svg+xml');assert.ok(request.payload.bytes.length);
 f.receive('file-store-result',{requestId:request.payload.requestId,result:{url:'hios-asset://test'}});await saving;
 const failing=f.api.saveFile(new Blob(['x']),'test.pdf');await new Promise(r=>setImmediate(r));
 f.receive('file-store-result',{requestId:f.messages.at(-1).payload.requestId,error:'disk full'});
 await assert.rejects(failing,/disk full/);disconnect();
});
test('run errors reach host',async()=>{
 const f=fixture();const disconnect=f.api.connectHost(()=>{},()=>{},async()=>{throw Error('invalid barcode')});f.receive('init');f.receive('run');await new Promise(r=>setImmediate(r));assert.equal(f.messages.at(-1).type,'error');assert.match(f.messages.at(-1).payload.message,/invalid barcode/);disconnect();
});
test('node/app theme snapshots preserve host colors and live updates',()=>{
 for(const protocol of ['hios-plugin-node/v1','hios-plugin-app/v1']){
  const f=fixture(),contexts=[];
  const disconnect=f.api.connectHost(c=>contexts.push(c),()=>{},async()=>{});
  const tokens={background:'#262626',control:'#222222',accent:'#168bfa'};
  const packet=type=>({data:{protocol,pluginId:'barcode-studio',type,payload:{theme:{mode:'dark',tokens}}}});
  f.receive('init',{},packet('init'));assert.equal(contexts[0].appearance,'dark');assert.deepEqual(contexts[0].themeTokens,tokens);
  f.receive('theme',{},packet('theme'));assert.equal(contexts.length,2);disconnect();
 }
});
test('theme mapping clears missing/invalid colors and ignores unknown properties',()=>{
 const themeCode=ts.transpileModule(readFileSync(new URL('../source/src/theme.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};vm.runInNewContext(themeCode,{exports});const values=new Map();const style={setProperty:(k,v)=>values.set(k,v),removeProperty:k=>values.delete(k)};
 const valid=v=>/^#[0-9a-f]{6}$/i.test(v);
 exports.applyThemeTokens(style,{background:'#262626',accent:'#168bfa',control:'url(x)',unknown:'#ffffff'},valid);
 assert.equal(values.get('--hios-background'),'#262626');assert.equal(values.size,2);
 exports.applyThemeTokens(style,{background:'#ffffff'},valid);assert.equal(values.size,1);assert.equal(values.get('--hios-background'),'#ffffff');
 exports.applyThemeTokens(style,undefined,valid);assert.equal(values.size,0);
});
