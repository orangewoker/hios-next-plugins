// Run with Electron. Two isolated loopback services and two sandboxed nodes
// exercise migration, shared configuration, per-node state and async races.
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const root = path.resolve(__dirname, '..');
const plugin = path.join(root, 'plugins/ai-prompt-library');
const manifest = JSON.parse(fs.readFileSync(path.join(plugin, 'plugin.json'), 'utf8'));
const html = fs.readFileSync(path.join(plugin, 'runtime/index.html'));
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a4QAAAAASUVORK5CYII=';
const requests = [];
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'hios-prompt-services-')));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, label) {
  for (let i = 0; i < 200; i++) { if (await check()) return; await delay(30); }
  throw new Error(`Timed out: ${label}`);
}
function makeServer(name) {
  return http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    const respond = (status, data) => { res.writeHead(status, { 'Content-Type':'application/json' }); res.end(JSON.stringify(data)); };
    if (req.url.startsWith('/api/v1/')) {
      const key = req.headers['x-api-key'];
      const allowed = name === 'A' ? ['fixture-a', 'fixture-a-rotated'] : ['fixture-b', 'fixture-b-2', 'fixture-b-3', 'fixture-b-4'];
      if (!allowed.includes(key)) { respond(401, { detail:'fixture authentication failed' }); return; }
      if (req.url === '/api/v1/health') { requests.push({ name, path:req.url, key }); respond(200, { status:'ok' }); return; }
      if (req.url.startsWith('/api/v1/categories')) { requests.push({ name, path:req.url, key }); respond(200, [{ id:1, name:`分类 ${name}`, asset_count:1 }]); return; }
      const chunks = [];
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', async () => {
        const body = Buffer.concat(chunks);
        if (req.url === '/api/v1/random') {
          const data = JSON.parse(body.toString()); requests.push({ name, path:req.url, key, data });
          const send = () => respond(200, { items:[{ asset_id:10, category_id:1, category_name:`分类 ${name}`, prompt:`结果 ${name}`, thumbnail_url:'' }] });
          if (data.seed === 999) setTimeout(send, 800); else send();
          return;
        }
        if (req.url === '/api/v1/assets/upload') {
          const form = await new Request('http://fixture.test/', { method:'POST', headers:{'content-type':req.headers['content-type']}, body, duplex:'half' }).formData();
          const data = { category:form.get('category_id'), prompt:form.get('prompt_text'), force:form.get('force') };
          requests.push({ name, path:req.url, key, data });
          if (data.prompt === 'duplicate') respond(200, { items:[], duplicates:[{ asset_id:55 }], errors:[] });
          else respond(200, { items:[{ id:77, category_id:Number(data.category) }], duplicates:[], errors:[] });
          return;
        }
        respond(404, {});
      });
      return;
    }
    if (req.url.startsWith('/plugin')) { res.writeHead(200, {'Content-Type':'text/html;charset=utf-8'}); res.end(html); return; }
    if (/^\/shared\/hios-(?:ui\.(?:css|js)|adapter\.css)$/.test(req.url)) {
      res.writeHead(200, {'Content-Type':req.url.endsWith('.css') ? 'text/css' : 'application/javascript'});
      res.end(fs.readFileSync(path.join(plugin, req.url.slice(1)))); return;
    }
    res.writeHead(200, {'Content-Type':'text/html;charset=utf-8'});
    res.end(`<!doctype html><meta charset="utf-8"><style>
      body{margin:0;padding:12px;background:#171717;display:flex;gap:12px}
      .node{width:${manifest.nodes[0].defaultSize.width}px;height:${manifest.nodes[0].defaultSize.height}px;transform-origin:top left;border:1px solid #607080;overflow:hidden}
      header{height:36px;box-sizing:border-box;padding:7px;color:white} iframe{display:block;width:calc(100% - 24px);margin-inline:12px;height:calc(100% - 36px);border:0}
      </style><script>window.messages=[];window.states={};addEventListener('message',event=>{
        const index=[...document.querySelectorAll('iframe')].findIndex(f=>f.contentWindow===event.source);
        messages.push({index,...event.data});if(event.data?.type==='state')states[index]=event.data.payload.state;
      });</script>`);
  });
}
const a = makeServer('A'), b = makeServer('B');
(async () => {
  await app.whenReady();
  await Promise.all([new Promise(resolve => a.listen(0, '127.0.0.1', resolve)), new Promise(resolve => b.listen(0, '127.0.0.1', resolve))]);
  const originA = `http://127.0.0.1:${a.address().port}`, originB = `http://127.0.0.1:${b.address().port}`;
  const win = new BrowserWindow({show:false, width:1600, height:1200, webPreferences:{backgroundThrottling:false,offscreen:true}});
  const js = code => win.webContents.executeJavaScript(code);
  const frame = (i, code) => js(`(()=>{const w=frames[${i}],d=w.document;${code}})()`);
  const init = (i, state={}, inputs={}) => js(`frames[${i}].postMessage({protocol:'hios-plugin-node/v1',pluginId:'ai-prompt-library',nodeId:'node-${i}',type:'init',payload:{state:${JSON.stringify(state)},inputs:${JSON.stringify(inputs)}}},'*')`);
  const value = (i, selector, text) => frame(i, `const e=d.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(text)};e.dispatchEvent(new w.Event('input',{bubbles:true}));e.dispatchEvent(new w.Event('change',{bubbles:true}));`);
  const click = (i, selector) => frame(i, `d.querySelector(${JSON.stringify(selector)}).click()`);
  const connect = async i => { await click(i, '#connect'); await until(() => frame(i, `return d.querySelector('#status').textContent==='已连接' && !d.querySelector('#connect').disabled`), `connect ${i}`); };
  const selectService = (i, id) => frame(i, `const e=d.querySelector('#serviceSelect');e.value=${JSON.stringify(id)};e.dispatchEvent(new w.Event('change',{bubbles:true}));`);
  const selectCategory = i => frame(i, `if(!d.querySelector('#savePanel').classList.contains('open'))d.querySelector('#saveToggle').click();d.querySelector('#saveCategoryTrigger').scrollIntoView({block:'nearest'});d.querySelector('#saveCategoryTrigger').click();d.querySelectorAll('#saveCategoryMenu [role=option]')[1].click();`);
  const uploads = () => requests.filter(r => r.path === '/api/v1/assets/upload');
  const outputs = i => js(`messages.filter(m=>m.index===${i} && m.type==='output').map(m=>m.payload.output.value)`);
  try {
    await win.loadURL(originA + '/host');
    await js(`localStorage.setItem('hios.ai-prompt-library.server-url',${JSON.stringify(originA)});localStorage.setItem('hios.ai-prompt-library.api-key','fixture-a');localStorage.setItem('hios.ai-prompt-library.connection-scope','legacy-scope-fixture');
      for(let i=0;i<2;i++){const n=document.createElement('section');n.className='node';n.innerHTML='<header>随机提示词库</header><iframe sandbox="allow-scripts allow-same-origin allow-forms" src="/plugin"></iframe>';document.body.append(n);}`);
    await until(() => js(`messages.filter(m=>m.type==='ready').length===2`), 'two nodes ready');
    const legacy = {selectedCategoryIds:[1],saveCategoryId:1,lastSavedAssetId:12,saveScope:'legacy-scope-fixture',lastItems:[{asset_id:5,category_id:1,category_name:'旧分类',prompt:'旧提示词',thumbnail_url:''}]};
    await init(0, legacy, {prompt_input:'保存 A'}); await init(1, {}, {prompt_input:'保存 B'}); await delay(100);
    const catalog = await js(`JSON.parse(localStorage.getItem('hios.ai-prompt-library.services-v1'))`);
    assert.equal(catalog.services.length,1); assert.equal(catalog.services[0].url,originA); assert.equal(catalog.services[0].key,'fixture-a');
    assert.equal(catalog.services[0].scope,'legacy-scope-fixture');
    assert.equal(await js(`localStorage.getItem('hios.ai-prompt-library.api-key')`), null, 'legacy key is removed only after migration');
    const idA = catalog.services[0].id;
    assert.equal(await frame(0, `return d.querySelector('#saveToggle').getAttribute('aria-expanded')`), 'false');
    assert.equal(await frame(0, `return d.querySelector('#drawToggle').getAttribute('aria-expanded')`), 'true');
    assert.equal(await frame(0, `return d.querySelector('#settingsToggle').getAttribute('aria-expanded')`), 'true');
    assert.equal(await frame(0, `return d.querySelector('#saveToggle').getAttribute('aria-controls')`), 'saveBody');
    assert.equal(await frame(0, `return d.querySelector('#drawToggle').getAttribute('aria-controls')`), 'drawBody');
    assert.equal(await frame(0, `return d.querySelector('#drawToggle').contains(d.querySelector('#reloadCategories'))`), false);
    await click(0, '#saveToggle'); await until(() => js(`!!states[0]`), 'legacy state persisted');
    let s0 = await js('states[0]');
    assert.equal(s0.serviceId,idA); assert.equal(s0.connectionScope,'legacy-scope-fixture');
    assert.equal(s0.saveCategoryId,1); assert.equal(s0.lastSavedAssetId,12); assert.equal(s0.lastItems[0].prompt,'旧提示词');
    await click(0, '#saveToggle');
    const layout = await frame(0, `const s=d.querySelector('.scroll');return {scrollHeight:s.scrollHeight,clientHeight:s.clientHeight,width:s.clientWidth,scrollWidth:s.scrollWidth};`);
    assert.ok(layout.scrollHeight<=layout.clientHeight+1, `default node fits the initial expanded settings: ${JSON.stringify(layout)}`);
    assert.ok(layout.scrollWidth<=layout.width+1, 'no horizontal overflow');
    if (process.env.HIOS_PLUGIN_TEST_OUTPUT) { await delay(120); fs.mkdirSync(process.env.HIOS_PLUGIN_TEST_OUTPUT,{recursive:true}); fs.writeFileSync(path.join(process.env.HIOS_PLUGIN_TEST_OUTPUT,'services-default.png'),(await win.webContents.capturePage()).toPNG()); }
    await connect(0); await selectCategory(0); await click(0, '.category'); await click(0, '#random');
    await until(async () => (await outputs(0)).includes('结果 A'), 'A random');

    await click(1, '#addService');
    await value(1, '#serviceName', '服务 B'); await value(1, '#serverUrl', originB); await value(1, '#apiKey', 'fixture-b');
    await connect(1); await selectCategory(1); await click(1, '.category');
    await click(0, '#saveAsset'); await click(1, '#saveAsset');
    await until(() => uploads().length===2, 'both uploads');
    assert.deepEqual(uploads().map(x=>[x.name,x.key,x.data.category,x.data.prompt]).sort(), [['A','fixture-a','1','保存 A'],['B','fixture-b','1','保存 B']]);
    await click(1, '#random'); await until(async () => (await outputs(1)).includes('结果 B'), 'B random');
    const services = await js(`JSON.parse(localStorage.getItem('hios.ai-prompt-library.services-v1')).services`);
    const idB = services.find(p=>p.name==='服务 B').id;
    assert.notEqual(idA,idB); assert.equal(await frame(0, `return d.querySelector('#serviceCaption').textContent`),'原有服务');

    // The service picker uses the same in-iframe geometry and theme tokens as
    // the category menu, including when the canvas node is transformed.
    const themes=[
      {mode:'light',tokens:{surface:'#f7f8fa',control:'#edeef1',text:'#25272c',border:'#d3d5da'}},
      {mode:'dark',tokens:{surface:'#2b2d31',control:'#323439',text:'#f0f0f2',border:'#46494f'}},
      {mode:'dark',tokens:{surface:'#173b30',control:'#235044',text:'#e9fff0',border:'#39715a'}}
    ];
    await frame(1, `if(!d.querySelector('#settingsPanel').classList.contains('open'))d.querySelector('#settingsToggle').click();`);
    for (const theme of themes) for (const scale of [.5,.75,1,1.45,2]) {
      await init(1,{}, {prompt_input:'保存 B'}); await js(`frames[1].postMessage({protocol:'hios-plugin-node/v1',pluginId:'ai-prompt-library',nodeId:'node-1',type:'init',payload:{state:{},theme:${JSON.stringify(theme)}}},'*')`);
      await js(`document.querySelectorAll('.node')[1].style.transform='scale(${scale})'`);
      await frame(1, `d.querySelector('.scroll').scrollTop=0;`); await delay(40); await click(1,'#serviceTrigger');
      const m=await frame(1, `const a=d.querySelector('#serviceTrigger').getBoundingClientRect(),m=d.querySelector('#serviceMenu'),r=m.getBoundingClientRect(),css=w.getComputedStyle;return {a:{left:a.left,width:a.width,bottom:a.bottom,top:a.top},m:{left:r.left,width:r.width,top:r.top,bottom:r.bottom},hidden:m.hidden,placement:m.dataset.placement,bg:css(m).backgroundColor,surface:css(d.querySelector('.panel')).backgroundColor,expanded:d.querySelector('#serviceTrigger').getAttribute('aria-expanded')};`);
      assert.equal(m.hidden,false); assert.equal(m.expanded,'true'); assert.equal(m.bg,m.surface);
      assert.ok(Math.abs(m.a.left-m.m.left)<1 && Math.abs(m.a.width-m.m.width)<1, 'service menu stays aligned');
      assert.ok(m.placement==='bottom' ? Math.abs(m.m.top-m.a.bottom-4)<1 : Math.abs(m.a.top-m.m.bottom-4)<1);
      await frame(1, `d.querySelector('#serviceTrigger').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));`);
    }
    await js(`document.querySelectorAll('.node')[1].style.transform='none'`);
    await click(1,'#serviceTrigger');
    for (const key of ['Home','ArrowDown','Enter']) await frame(1, `d.querySelector('#serviceTrigger').dispatchEvent(new w.KeyboardEvent('keydown',{key:${JSON.stringify(key)},bubbles:true,cancelable:true}));`);
    assert.equal(await frame(1, `return d.querySelector('#serviceSelect').value`),idA,'keyboard can select a different service');
    assert.equal(await frame(1, `return d.querySelectorAll('.category').length`),0,'switch clears same-numbered categories');
    assert.equal(await frame(1, `return d.querySelector('#saveCategory').value`),'');
    assert.equal(await frame(1, `return d.querySelector('#output').disabled`),true,'switch clears old results');
    await connect(1); assert.match(await frame(1, `return d.querySelector('#categories').textContent`),/分类 A/);
    await selectService(1,idB); await connect(1); await selectCategory(1);
    await click(1,'#drawToggle'); // save stays expanded, draw is now folded
    await until(() => js(`states[0]?.serviceId && states[1]?.serviceId`),'states');
    const savedStates=await js(`JSON.parse(JSON.stringify(states))`);
    assert.equal(savedStates[0].serviceId,idA); assert.equal(savedStates[1].serviceId,idB);
    assert.equal(savedStates[1].saveOpen,true); assert.equal(savedStates[1].drawOpen,false);
    const serialized=JSON.stringify(savedStates);
    for (const secret of [originA,originB,'fixture-a','fixture-b']) assert.ok(!serialized.includes(secret),'state excludes URLs and keys');
    await js(`document.querySelectorAll('iframe').forEach((f,i)=>f.src='/plugin?reload='+i);`);
    await until(() => js(`messages.filter(m=>m.type==='ready').length===4`),'reloaded');
    await init(0,savedStates[0],{prompt_input:'保存 A'}); await init(1,savedStates[1],{prompt_input:'保存 B'}); await delay(100);
    assert.equal(await frame(0, `return d.querySelector('#serviceCaption').textContent`),'原有服务');
    assert.equal(await frame(1, `return d.querySelector('#serviceCaption').textContent`),'服务 B');
    assert.equal(await frame(1, `return d.querySelector('#saveToggle').getAttribute('aria-expanded')`),'true');
    assert.equal(await frame(1, `return d.querySelector('#drawToggle').getAttribute('aria-expanded')`),'false');
    await connect(0); await selectService(1,idA); await connect(1);
    await value(1,'#apiKey','fixture-a-rotated');
    await until(() => frame(0, `return d.querySelector('#apiKey').value==='fixture-a-rotated' && d.querySelectorAll('.category').length===0`),'other node sees changed credentials');
    assert.equal(await frame(0, `return d.querySelector('#output').disabled`),true);
    const beforeUnsafe=uploads().length; await click(0,'#saveAsset'); await delay(100); assert.equal(uploads().length,beforeUnsafe);
    await connect(0); await selectCategory(0);
    await value(1,'#serviceName','更新后的 A');
    await until(() => frame(0, `return d.querySelector('#serviceCaption').textContent==='更新后的 A'`),'renamed service');
    assert.equal(await frame(0, `return d.querySelectorAll('.category').length`),1,'renaming does not invalidate connection');
    await click(1,'#deleteService'); await click(1,'#confirmDelete');
    await until(() => frame(0, `return d.querySelector('#serviceCaption').textContent.includes('已删除')`),'deleted service observed');
    assert.equal(await frame(0, `return d.querySelector('#output').disabled`),true);
    assert.equal(await frame(1, `return d.querySelector('#serviceSelect').value`),'','deletion does not silently select a different service');
    assert.equal((await js(`JSON.parse(localStorage.getItem('hios.ai-prompt-library.services-v1')).services`)).some(p=>p.id===idA),false);

    await selectService(0,idB); await selectService(1,idB); await connect(0); await connect(1); await selectCategory(0);
    await init(0,{}, {prompt_input:'duplicate'}); await click(0,'#saveAsset');
    await until(() => frame(0, `return !d.querySelector('#forceSave').hidden`),'duplicate confirmation');
    await value(1,'#apiKey','fixture-b-2');
    await until(() => frame(0, `return d.querySelector('#forceSave').hidden && d.querySelector('#apiKey').value==='fixture-b-2'`),'duplicate invalidated across nodes');
    await connect(0); await selectCategory(0);
    await init(0,{}, {image:`data:image/png;base64,${png}`,prompt_input:'race image'});
    await frame(0, `const real=w.fetch.bind(w);w.fetch=(url,options)=>String(url).startsWith('data:image/')?new Promise(resolve=>{w.__imagePending=true;w.__releaseImage=()=>real(url,options).then(resolve);}):real(url,options);`);
    const beforeImageRace=uploads().length; await click(0,'#saveAsset'); await until(() => frame(0, `return !!w.__imagePending`),'image read pending');
    await value(1,'#apiKey','fixture-b-3'); await until(() => frame(0, `return d.querySelector('#apiKey').value==='fixture-b-3'`),'image race config change');
    await frame(0, `w.__releaseImage();`); await until(() => frame(0, `return !d.querySelector('#saveAsset').disabled`),'image race settled');
    assert.equal(uploads().length,beforeImageRace,'no upload after a connection changes during image read');
    await connect(0); await value(0,'#seed','999');
    const outputsBefore=await outputs(0); await click(0,'#random');
    await until(() => requests.some(r=>r.name==='B' && r.path==='/api/v1/random' && r.data.seed===999),'delayed random started');
    await value(1,'#apiKey','fixture-b-4'); await delay(1100);
    assert.deepEqual(await outputs(0),outputsBefore,'late response from a changed service must not output');
    assert.equal(await frame(0, `return d.querySelector('#output').disabled`),true,'late response must not restore stale candidates');
    console.log('PASS: legacy migration, independent multi-service nodes, same-ID isolation, reload/folds/layout, themes/zoom, edits/deletion and async races.');
    win.destroy(); a.close(); b.close(); app.exit(0);
  } catch (error) { win.destroy(); a.close(); b.close(); throw error; }
})().catch(error => { console.error(error); app.exit(1); });
