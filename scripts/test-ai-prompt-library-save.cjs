// Run with Electron: electron scripts/test-ai-prompt-library-save.cjs
// Exercises the real sandboxed renderer against an isolated multipart API.
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { createHash } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'plugins/ai-prompt-library/runtime/index.html'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'plugins/ai-prompt-library/plugin.json'), 'utf8'));
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a4QAAAAASUVORK5CYII=', 'base64');
const dataUrl = `data:image/png;base64,${png.toString('base64')}`;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const requests = [];
let nextId = 100;
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'hios-prompt-save-profile-')));

const server = http.createServer((req, res) => {
  const respond = (status, data) => { res.writeHead(status, { 'Content-Type':'application/json' }); res.end(JSON.stringify(data)); };
  if (req.url === '/plugin') { res.writeHead(200, { 'Content-Type':'text/html;charset=utf-8' }); res.end(html); return; }
  if (!req.url.startsWith('/api/v1/')) {
    res.writeHead(200, { 'Content-Type':'text/html;charset=utf-8' });
    res.end(`<!doctype html><iframe src="/plugin" sandbox="allow-scripts allow-same-origin allow-forms" style="width:520px;height:610px;border:0"></iframe><script>
      window.messages=[];
      addEventListener('message', event => {
        const m=event.data; window.messages.push(m);
        if(m?.type==='asset-read') event.source.postMessage({protocol:m.protocol,pluginId:m.pluginId,type:'asset-result',payload:{requestId:m.payload.requestId,dataUrl:${JSON.stringify(dataUrl)}}},'*');
        if(m?.type==='network-request') event.source.postMessage({protocol:m.protocol,pluginId:m.pluginId,type:'network-result',payload:{requestId:m.payload.requestId,result:{ok:true,status:200,encoding:'base64',body:${JSON.stringify(png.toString('base64'))}}}},'*');
      });
    </script>`);
    return;
  }
  if (req.headers['x-api-key'] !== 'fixture-key') { respond(401, { detail:'密钥无效' }); return; }
  if (req.url === '/api/v1/health') { respond(200, { status:'ok' }); return; }
  if (req.url.startsWith('/api/v1/categories')) { respond(200, [{ id:1,name:'建筑设计',asset_count:2 },{ id:2,name:'人物摄影',asset_count:3 }]); return; }
  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', async () => {
    try {
      const body = Buffer.concat(chunks);
      if (req.url === '/api/v1/random') {
        requests.push({ url:req.url, body:JSON.parse(body.toString()) });
        respond(200, { items:[{ asset_id:42,category_id:1,category_name:'建筑设计',prompt:'随机抽取的内容',thumbnail_url:'' }] });
        return;
      }
      if (req.url !== '/api/v1/assets/upload') { respond(404, {}); return; }
      const contentType = String(req.headers['content-type'] || '');
      const form = await new Request('http://fixture.test/', { method:'POST', headers:{ 'content-type':contentType }, body, duplex:'half' }).formData();
      const file = form.get('files');
      const entry = { url:req.url, contentType, category:form.get('category_id'), mode:form.get('mode'), prompt:form.get('prompt_text'), force:form.get('force'), file:file && { name:file.name, type:file.type, hash:sha256(Buffer.from(await file.arrayBuffer())) } };
      requests.push(entry);
      if (entry.prompt === '服务拒绝') { respond(403, { detail:'没有分类写入权限' }); return; }
      if (entry.prompt === '错误结果') { respond(200, { items:[],duplicates:[],errors:[{ message:'图片无法读取' }] }); return; }
      if (entry.prompt === '重复图片' && entry.force !== 'true') { respond(200, { items:[],duplicates:[{ asset_id:55,index:0 }],errors:[] }); return; }
      respond(200, { items:[{ id:nextId++,category_id:Number(entry.category) }],duplicates:[],errors:[] });
    } catch (error) { respond(500, { detail:String(error) }); }
  });
});
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, label) {
  for (let i=0;i<160;i++) { if (await check()) return; await delay(40); }
  throw new Error(`Timed out: ${label}`);
}

(async () => {
  assert.deepEqual(manifest.nodes[0].inputs.map(({ id,type,required }) => ({ id,type,required:!!required })), [
    { id:'image',type:'image',required:false }, { id:'prompt_input',type:'text',required:false },
  ]);
  for (const port of manifest.nodes[0].inputs) assert.match(port.id, /^[a-z0-9][a-z0-9._-]{0,63}$/, 'HIOS normalizes port IDs to lowercase');
  await app.whenReady();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const win = new BrowserWindow({ show:false, width:700, height:800, webPreferences:{ backgroundThrottling:false } });
  const js = code => win.webContents.executeJavaScript(code);
  const frame = code => js(`(()=>{const w=frames[0],d=w.document;${code}})()`);
  await win.loadURL(origin);
  await until(() => js('messages.some(m=>m.type==="ready")'), 'ready');
  const init = async inputs => { await js(`frames[0].postMessage({protocol:'hios-plugin-node/v1',pluginId:'ai-prompt-library',nodeId:'fixture',type:'init',payload:{state:{},inputs:${JSON.stringify(inputs)}}},'*')`); await delay(80); };
  const select = async id => frame(`const el=d.querySelector('#saveCategory');el.value=${JSON.stringify(id)};el.dispatchEvent(new w.Event('change',{bubbles:true}));`);
  const save = async () => frame(`d.querySelector('#saveAsset').click()`);
  const count = () => requests.filter(item => item.url === '/api/v1/assets/upload').length;
  const waitCount = async n => { await until(() => count() === n, `upload ${n}`); await until(() => frame(`return !d.querySelector('#saveAsset').disabled`), 'save settled'); };
  const last = () => requests.filter(item => item.url === '/api/v1/assets/upload').at(-1);

  await init({});
  await js(`frames[0].postMessage({protocol:'hios-plugin-node/v1',pluginId:'ai-prompt-library',nodeId:'fixture',type:'init',payload:{state:{saveCategoryId:2,lastSavedAssetId:99},inputs:{}}},'*')`); await delay(80);
  await frame(`d.querySelector('#serverUrl').value=${JSON.stringify(origin)};d.querySelector('#serverUrl').dispatchEvent(new w.Event('input'));d.querySelector('#apiKey').value='fixture-key';d.querySelector('#apiKey').dispatchEvent(new w.Event('input'));`);
  const invalidated = await js(`messages.filter(m=>m.type==='state').at(-1).payload.state`);
  assert.equal(invalidated.saveCategoryId, null, 'changing server before the first connection clears the restored category');
  assert.equal(invalidated.lastSavedAssetId, null, 'the saved ID belongs to the previous connection');
  await frame(`d.querySelector('#connect').click();`);
  await until(() => frame(`return d.querySelector('#status').textContent==='已连接'`), 'connect');
  assert.equal(await frame(`return d.querySelectorAll('#saveCategory option').length`), 3);

  await save(); await delay(100);
  assert.equal(count(), 0, 'category must be chosen');
  await select('1'); await init({ prompt_input:'  \n  ' }); await save(); await delay(100);
  assert.equal(count(), 0, 'blank inputs must not be saved');
  assert.match(await frame(`return d.querySelector('#saveNote').textContent`), /至少连接/);

  const prompt = '首行提示词\n  第二行 🐈  ';
  await init({ prompt_input:prompt }); await save(); await waitCount(1);
  assert.match(last().contentType, /^multipart\/form-data;\s*boundary=/i);
  assert.equal(last().mode, 'manual'); assert.equal(last().category, '1');
  assert.equal(last().prompt, prompt); assert.equal(last().file, null);
  assert.match(await frame(`return d.querySelector('#saveNote').textContent`), /100/);

  await init({ image:dataUrl }); await save(); await waitCount(2);
  assert.equal(last().mode, 'image_only'); assert.equal(last().prompt, null);
  assert.deepEqual(last().file, { name:'image.png',type:'image/png',hash:sha256(png) });

  await select('2'); await init({ image:{ source:dataUrl },prompt_input:{ text:'同时保存图片和文本' } }); await save(); await waitCount(3);
  assert.equal(last().mode, 'manual'); assert.equal(last().category, '2');
  assert.equal(last().prompt, '同时保存图片和文本'); assert.equal(last().file.hash, sha256(png));
  let state = await js(`messages.filter(m=>m.type==='state').at(-1).payload.state`);
  assert.equal(state.saveCategoryId, 2); assert.equal(state.lastSavedAssetId, 102);
  assert.ok(!JSON.stringify(state).includes('fixture-key'));
  assert.ok(!JSON.stringify(state).includes(dataUrl));
  assert.ok(!JSON.stringify(state).includes('同时保存图片和文本'));

  await frame(`w.localStorage.setItem('hios.ai-prompt-library.server-url','https://other.invalid');w.localStorage.setItem('hios.ai-prompt-library.api-key','other-key');w.localStorage.setItem('hios.ai-prompt-library.connection-scope','changed-in-another-node');`);
  await save(); await delay(100);
  assert.equal(count(), 3, 'a category from a different connection must not be saved');
  assert.match(await frame(`return d.querySelector('#saveNote').textContent`), /重新选择保存分类/);
  await select('2');
  assert.equal(await frame(`return w.localStorage.getItem('hios.ai-prompt-library.server-url')`), origin, 'category scope belongs to the current node connection');

  await init({ image:dataUrl,prompt_input:'重复图片' }); await save(); await waitCount(4);
  assert.equal(last().force, null); assert.equal(await frame(`return d.querySelector('#forceSave').hidden`), false);
  assert.match(await frame(`return d.querySelector('#saveNote').textContent`), /55/);
  await init({ image:dataUrl,prompt_input:'已变更' });
  assert.equal(await frame(`return d.querySelector('#forceSave').hidden`), true, 'changed inputs invalidate duplicate confirmation');
  await init({ image:dataUrl,prompt_input:'重复图片' }); await save(); await waitCount(5);
  await frame(`d.querySelector('#forceSave').click()`); await waitCount(6);
  assert.equal(last().force, 'true'); assert.equal(last().prompt, '重复图片'); assert.equal(last().file.hash, sha256(png));
  assert.equal(await frame(`return d.querySelector('#forceSave').hidden`), true);

  await init({ prompt_input:'服务拒绝' }); await save(); await waitCount(7);
  assert.match(await frame(`return d.querySelector('#saveNote').textContent`), /没有分类写入权限/);
  await init({ prompt_input:'错误结果' }); await save(); await waitCount(8);
  assert.match(await frame(`return d.querySelector('#saveNote').textContent`), /图片无法读取/);
  await init({ image:'data:image/gif;base64,R0lGODlh' }); await save(); await delay(150);
  assert.equal(count(), 8, 'unsupported image must not be uploaded');
  assert.match(await frame(`return d.querySelector('#saveNote').textContent`), /JPG、PNG 和 WEBP/);

  // Simulate local custom-scheme and remote CORS failures; neither fallback
  // sends the API key to the image host.
  await frame(`const real=w.fetch.bind(w);w.fetch=(url,options)=>String(url).startsWith('hios-asset:')||String(url).includes('remote.invalid')?Promise.reject(Error('blocked')):real(url,options);`);
  await init({ image:'hios-asset://local/example.png' }); await save(); await waitCount(9);
  assert.equal(last().file.hash, sha256(png));
  assert.ok(await js(`messages.some(m=>m.type==='asset-read')`));
  await init({ image:'https://remote.invalid/example.png' }); await save(); await waitCount(10);
  assert.equal(last().file.hash, sha256(png));
  const network = await js(`messages.filter(m=>m.type==='network-request').at(-1).payload`);
  assert.equal(network.url, 'https://remote.invalid/example.png'); assert.equal(network.responseType, 'base64'); assert.equal(network.headers, undefined);

  const beforeRun = count();
  await js(`frames[0].postMessage({protocol:'hios-plugin-node/v1',pluginId:'ai-prompt-library',nodeId:'fixture',type:'run',payload:{state:{autoOutput:false,count:1,seed:0,selectedCategoryIds:[1]},inputs:{image:${JSON.stringify(dataUrl)},prompt_input:'运行不应保存'}}},'*')`);
  await until(() => js(`messages.some(m=>m.type==='output'&&m.payload.output.value==='随机抽取的内容')`), 'workflow output');
  assert.equal(count(), beforeRun, 'workflow run must not save inputs');
  await frame(`d.querySelector('#serverUrl').value='http://different.invalid';d.querySelector('#serverUrl').dispatchEvent(new w.Event('input',{bubbles:true}));`);
  assert.equal(await frame(`return d.querySelector('#saveCategory').value`), '', 'changing server clears save category');
  await save(); await delay(100); assert.equal(count(), beforeRun, 'changing server requires reconnection');

  console.log('PASS: prompt-only, image-only, combined, category validation, multipart, duplicates/force, errors, local/remote image fallbacks, state privacy, workflow compatibility.');
  win.destroy(); server.close(); app.exit(0);
})().catch(error => { console.error(error); server.close(); app.exit(1); });
