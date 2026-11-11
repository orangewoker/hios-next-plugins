const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const { readFileSync, mkdirSync, writeFileSync } = require('node:fs');
const { join, resolve, extname, sep } = require('node:path');
const http = require('node:http');
const root = resolve(__dirname, '../plugins/random-prompt-composer');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let server, win;
app.whenReady().then(async () => {
  const host = `<!doctype html><html><body style="margin:0;background:#f5f5f5"><iframe id="plugin" sandbox="allow-scripts allow-same-origin" style="width:560px;height:1050px;border:0"></iframe><script>
  window.messages=[];window.saved={};window.mode='node';window.inputs={};
  window.send=(type,payload={})=>plugin.contentWindow.postMessage({protocol:'hios-plugin-'+mode+'/v1',pluginId:'random-prompt-composer',nodeId:mode==='node'?'test-node':'',appId:mode==='app'?'random-prompt-composer':'',type,payload},'*');
  window.init=()=>send('init',{state:saved,inputs,hostRunControl:'canvas-button',theme:{mode:'light',tokens:{},design:{version:1}}});
  addEventListener('message',e=>{if(e.source!==plugin.contentWindow||e.data.protocol!=='hios-plugin-'+mode+'/v1')return;messages.push(e.data);if(e.data.type==='ready')init();if(e.data.type==='state'){saved=e.data.payload.state;init();}});
  plugin.src='/runtime/index.html';
  </script></body></html>`;
  server = http.createServer((req, res) => {
    if (req.url === '/') { res.setHeader('content-type', 'text/html'); res.end(host); return; }
    const file = resolve(root, '.' + new URL(req.url, 'http://local').pathname);
    if (!file.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
    try { res.setHeader('content-type', ({ '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' })[extname(file)] || 'application/octet-stream'); res.end(readFileSync(file)); }
    catch { res.writeHead(404); res.end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  win = new BrowserWindow({ show: false, width: 600, height: 1150, webPreferences: { offscreen: true, backgroundThrottling: false } });
  const errors = [];
  win.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message); });
  const js = code => win.webContents.executeJavaScript(code);
  const child = code => win.webContents.mainFrame.frames[0].executeJavaScript(code);
  const wait = async check => { for (let i = 0; i < 100; i++) { try { if (await check()) return; } catch {} await sleep(40); } throw Error('UI timeout'); };
  try {
    await win.loadURL(`http://127.0.0.1:${server.address().port}/`);
    await wait(() => js(`messages.some(m=>m.type==='loaded')`));
    assert.equal(await child(`document.querySelectorAll('#categories option').length`), 2100);
    assert.equal(await child(`document.querySelector('#run').hidden`), true);
    assert.equal(await child(`document.querySelector('#tagSettings').open`), false);
    assert.equal(await child(`document.querySelector('#systemDetails').hidden`), true);
    assert.equal(await child(`document.querySelectorAll('#copySystem').length`), 1);
    await child(`document.querySelector('#seed').value='2718';document.querySelector('#seed').dispatchEvent(new Event('change'));document.querySelector('#random').click();`);
    await wait(() => js(`saved.seed===2718`));
    await child(`document.querySelector('#top').value='099';document.querySelector('#top').dispatchEvent(new Event('change'));`);
    await wait(() => js(`saved.locked.top && saved.selected.top==='099'`));
    await js(`inputs={brief:['雨夜街头','冷暖对比']}; init();`);
    await wait(() => child(`document.querySelector('#positive').value.includes('雨夜街头')`));
    await js(`send('run',{runId:'first',inputs});`);
    await wait(() => js(`messages.some(m=>m.type==='output')`));
    const output = await js(`messages.filter(m=>m.type==='output').at(-1).payload`);
    assert.equal(output.runId, 'first'); assert.equal(output.output.portId, 'positive'); assert.equal(output.output.kind, 'text');
    assert.ok(output.output.value.includes('雨夜街头')); assert.ok(!output.output.value.includes('你是一名'));
    const current = await js(`JSON.stringify(saved)`);
    await js(`messages=[];plugin.src='/runtime/index.html?reload=1';`);
    await wait(() => js(`messages.some(m=>m.type==='loaded')`));
    assert.equal(await js(`JSON.stringify(saved)`), current);
    assert.equal(await child(`document.querySelector('#top').value`), '099');
    await js(`send('run',{runId:'second',inputs});`);
    await wait(() => js(`messages.some(m=>m.type==='output')`));
    assert.equal(await js(`messages.filter(m=>m.type==='output').at(-1).payload.output.value`), output.output.value);
    await child(`document.querySelector('#seed').value='0';document.querySelector('#seed').dispatchEvent(new Event('change'));`);
    await wait(() => js(`saved.seed===0`));
    await js(`messages=[];send('run',{runId:'fresh',inputs});`);
    await wait(() => js(`messages.some(m=>m.type==='output')`));
    assert.equal(await js(`saved.selected.top`), '099');
    assert.ok(await js(`saved.lastSeed>0`));
    await child(`document.querySelector('#randomOnRun').click();`);
    await wait(() => js(`saved.randomOnRun===false`));
    const preview = await child(`document.querySelector('#positive').value`);
    await js(`messages=[];send('run',{runId:'reuse',inputs});`);
    await wait(() => js(`messages.some(m=>m.type==='output')`));
    assert.equal(await js(`messages.find(m=>m.type==='output').payload.output.value`), preview);
    // Reject non-parent synthetic messages even when protocol and plugin ID look valid.
    await child(`dispatchEvent(new MessageEvent('message',{data:{protocol:'hios-plugin-node/v1',pluginId:'random-prompt-composer',nodeId:'test-node',type:'init',payload:{state:{}}}}));`);
    assert.equal(await child(`document.querySelector('#positive').value`), preview);
    await child(`document.querySelector('#tagSettings').open=true;`);
    await sleep(100);
    await child(`document.querySelector('#top-trigger').click();`);
    assert.equal(await child(`document.querySelector('.tag-menu').hidden`), false);
    assert.equal(await child(`document.querySelectorAll('.tag-option').length`), 300);
    await child(`document.querySelector('.tag-search').value='100';document.querySelector('.tag-search').dispatchEvent(new Event('input'));`);
    assert.equal(await child(`document.querySelectorAll('.tag-option').length`), 1);
    await child(`document.querySelector('.tag-search').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));`);
    await wait(() => js(`saved.selected.top==='100' && saved.locked.top`));
    assert.equal(await child(`document.querySelector('.tag-menu').hidden`), true);
    await child(`document.querySelector('#top-trigger').click();document.querySelector('.tag-search').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));`);
    assert.equal(await child(`document.querySelector('.tag-menu').hidden`), true);
    // Clipboard works without exposing a system-prompt textarea in the node UI.
    await child(`document.execCommand=()=>{window.copied=document.activeElement.value;return true};Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw Error('fallback')}}});document.querySelector('#copySystem').click();`);
    await wait(() => child(`window.copied?.includes('只输出一段中文正文')`));
    await child(`document.querySelector('#tagSettings').open=false;`);
    await win.setContentSize(370, 1000);
    await js(`plugin.style.width='350px'`);
    assert.equal(await child(`document.documentElement.scrollWidth<=innerWidth`), true);
    await win.setContentSize(600, 1150); await js(`plugin.style.width='560px'`);
    const out = resolve(__dirname, '../output/random-prompt-composer'); mkdirSync(out, { recursive: true });
    await sleep(200);
    writeFileSync(join(out, 'preview.png'), (await win.webContents.capturePage()).toPNG());
    await js(`mode='app';messages=[];plugin.src='/runtime/index.html?app=1';`);
    await wait(() => js(`messages.some(m=>m.type==='loaded')`));
    assert.equal(await child(`document.querySelector('#run').hidden`), true);
    assert.equal(await child(`document.querySelector('#tagSettings').open`), false);
    assert.equal(await child(`document.querySelector('#systemDetails').hidden`), false);
    assert.ok(await child(`document.querySelector('#system').value.includes('只输出一段中文正文')`));
    await js(`send('theme',{theme:{mode:'dark',tokens:{surface:'#303030',text:'#eeeeee',control:'#222222',border:'#424242',accent:'#3399ff'},design:{version:1}}});`);
    await child(`document.querySelector('#tagSettings').open=true;`); await sleep(100);
    await child(`document.querySelector('#top-trigger').click();`);
    assert.equal(await child(`getComputedStyle(document.querySelector('.tag-menu')).backgroundColor`), 'rgb(48, 48, 48)');
    assert.equal(await child(`getComputedStyle(document.querySelector('.tag-option')).color`), 'rgb(238, 238, 238)');
    assert.equal(await child(`(()=>{const r=document.querySelector('.tag-menu').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()`), true);
    await sleep(200);
    writeFileSync(join(out, 'dark-dropdown.png'), (await win.webContents.capturePage()).toPNG());
    assert.deepEqual(errors, []);
    console.log('PASS sandbox init, seeds, lock, run/output, reload, themed searchable menu, keyboard, clipboard fallback, default collapse, node/app presentation and narrow layout');
    console.log('Screenshot:', join(out, 'preview.png'));
  } finally { win.destroy(); await new Promise(r => server.close(r)); }
}).then(() => app.quit(), error => { console.error(error); if (win && !win.isDestroyed()) win.destroy(); if (server) server.close(); app.exit(1); });
