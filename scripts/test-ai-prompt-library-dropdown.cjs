// Run with Electron: electron scripts/test-ai-prompt-library-dropdown.cjs
// Exercises the real plugin in a transformed, sandboxed canvas-node iframe.
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const root = path.resolve(__dirname, '..');
const plugin = path.join(root, 'plugins/ai-prompt-library');
const output = process.env.HIOS_PLUGIN_TEST_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(), 'hios-prompt-dropdown-'));
fs.mkdirSync(output, { recursive:true });
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'hios-prompt-dropdown-profile-')));
const categories = Array.from({ length:20 }, (_, i) => ({ id:i + 1, name:`分类 ${i + 1}`, asset_count:i }));
const server = http.createServer((req, res) => {
  if (req.url === '/api/v1/health') { res.setHeader('Content-Type','application/json'); res.end('{"status":"ok"}'); return; }
  if (req.url.startsWith('/api/v1/categories')) { res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(categories)); return; }
  if (req.url === '/plugin') { res.setHeader('Content-Type','text/html;charset=utf-8'); res.end(fs.readFileSync(path.join(plugin,'runtime/index.html'))); return; }
  if (/^\/shared\/hios-(?:ui\.(?:css|js)|adapter\.css)$/.test(req.url)) {
    res.setHeader('Content-Type',req.url.endsWith('.css') ? 'text/css' : 'application/javascript');
    res.end(fs.readFileSync(path.join(plugin,req.url.slice(1)))); return;
  }
  res.setHeader('Content-Type','text/html;charset=utf-8');
  res.end(`<!doctype html><meta charset="utf-8"><style>
    body{margin:0;padding:24px;overflow:hidden;background:#171717}
    #node{width:520px;height:646px;transform-origin:top left;border:1px solid #607080;border-radius:12px;overflow:hidden}
    header{height:36px;box-sizing:border-box;padding:7px;color:white} iframe{width:100%;height:calc(100% - 36px);display:block;border:0}
    </style><section id="node"><header>随机提示词库</header><iframe src="/plugin" sandbox="allow-scripts allow-same-origin allow-forms"></iframe></section>
    <script>window.messages=[];window.addEventListener('message',e=>messages.push(e.data));</script>`);
});
const delay = ms => new Promise(resolve => setTimeout(resolve,ms));
async function until(check, label) {
  for (let i=0;i<120;i++) { if (await check()) return; await delay(30); }
  throw Error(`Timed out: ${label}`);
}

(async () => {
  await app.whenReady();
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const win = new BrowserWindow({ show:false,width:1300,height:1100,webPreferences:{backgroundThrottling:false,offscreen:true} });
  win.webContents.on('console-message',event => { if (event.level === 'error') console.error('renderer:',event.message); });
  const js = async code => { try { return await win.webContents.executeJavaScript(code); } catch (error) { console.error('Failed script:',code); throw error; } };
  const frame = code => js(`(()=>{const w=frames[0],d=w.document;${code}})()`);
  const key = key => frame(`d.querySelector('#saveCategoryTrigger').dispatchEvent(new w.KeyboardEvent('keydown',{key:${JSON.stringify(key)},bubbles:true,cancelable:true}));`);
  const open = () => frame(`d.querySelector('#saveCategoryTrigger').click()`);
  const visible = () => frame(`return !d.querySelector('#saveCategoryMenu').hidden`);
  const init = theme => js(`frames[0].postMessage({protocol:'hios-plugin-node/v1',pluginId:'ai-prompt-library',nodeId:'fixture',type:'init',payload:{theme:${JSON.stringify(theme)},state:{}}},'*')`);
  const metrics = () => frame(`
    const a=d.querySelector('#saveCategoryTrigger'),m=d.querySelector('#saveCategoryMenu'),s=w.getComputedStyle;
    const rect=e=>{const r=e.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
    return {anchor:rect(a),menu:rect(m),viewport:{width:d.documentElement.clientWidth,height:d.documentElement.clientHeight},placement:m.dataset.placement,
      background:s(m).backgroundColor,surface:s(d.querySelector('.panel')).backgroundColor,text:s(m).color,trigger:s(a).backgroundColor,control:s(d.querySelector('#serverUrl')).backgroundColor,
      expanded:a.getAttribute('aria-expanded'),controls:a.getAttribute('aria-controls'),active:a.getAttribute('aria-activedescendant')};`);
  const aligned = info => {
    const { anchor:a,menu:m,viewport:v,placement } = info;
    assert.ok(Math.abs(m.left-a.left)<1, `left ${m.left} vs ${a.left}`);
    assert.ok(Math.abs(m.width-a.width)<1, `width ${m.width} vs ${a.width}`);
    assert.ok(m.left>=5 && m.right<=v.width-5 && m.top>=5 && m.bottom<=v.height-5, 'menu stays inside its iframe');
    assert.ok(placement==='bottom' ? Math.abs(m.top-a.bottom-4)<1 : Math.abs(a.top-m.bottom-4)<1, `menu remains anchored (${placement})`);
  };
  const mouseClick = async (x,y) => {
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});
    await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});
  };
  try {
    await win.loadURL(origin);
    win.webContents.debugger.attach('1.3');
    await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});
    await until(() => js('messages.some(m=>m.type==="ready")'),'ready');
    // Hidden test windows may lose OS focus when the runner resizes them.
    // Suppress that artificial blur during pointer/geometry tests, then test
    // the real blur handler explicitly below.
    await frame(`w.__suppressTestBlur=true;w.__pointerTrace=[];for(const t of ['pointerdown','click','scroll'])d.addEventListener(t,e=>w.__pointerTrace.push([t,e.target?.id||e.target?.className||e.target?.nodeName]),true);w.addEventListener('blur',e=>{w.__pointerTrace.push(['blur']);if(w.__suppressTestBlur)e.stopImmediatePropagation()},true);`);
    assert.equal(await frame(`return d.querySelector('#saveCategoryTrigger').disabled`),true);
    await frame(`d.querySelector('#serverUrl').value=${JSON.stringify(origin)};d.querySelector('#apiKey').value='fixture-key';d.querySelector('#connect').click();`);
    await until(() => frame(`return d.querySelector('#status').textContent==='已连接' && !d.querySelector('#saveCategoryTrigger').disabled`),'connect');
    assert.equal(await frame(`return d.querySelectorAll('#saveCategory option').length`),21);

    const themes = [
      {mode:'light',tokens:{background:'#f1f2f4',surface:'#f7f8fa',control:'#edeef1',muted:'#edeef1',text:'#25272c',textSecondary:'#60646d',border:'#d3d5da',accent:'#007aff',accentSoft:'rgba(0,122,255,.15)'}},
      {mode:'dark',tokens:{background:'#232529',surface:'#2b2d31',control:'#323439',muted:'#282a2e',text:'#f0f0f2',textSecondary:'#b9bbc1',border:'#46494f',accent:'#3291ff',accentSoft:'rgba(50,145,255,.2)'}},
      {mode:'dark',tokens:{background:'#102b24',surface:'#173b30',control:'#235044',muted:'#143127',text:'#e9fff0',textSecondary:'#b2d8bd',border:'#39715a',accent:'#75d69a',accentSoft:'rgba(117,214,154,.2)'}}
    ];
    for (let themeIndex=0;themeIndex<themes.length;themeIndex++) {
      await init(themes[themeIndex]); await delay(50);
      for (const [scaleIndex,scale] of [.5,.75,1,1.45,2].entries()) {
        await js(`{const n=document.querySelector('#node');n.style.height='646px';n.style.transform='scale(${scale})';}`);
        win.setContentSize(Math.ceil(520*scale+100),Math.ceil(646*scale+100));
        await frame(`d.querySelector('.scroll').scrollTop=0;`);
        await delay(80);
        // Dispatch actual pointer events in the host viewport, not synthetic
        // iframe clicks, to catch transformed hit-testing and anchoring bugs.
        const coords = await js(`(()=>{const f=document.querySelector('iframe').getBoundingClientRect(),a=frames[0].document.querySelector('#saveCategoryTrigger').getBoundingClientRect();return {x:f.left+(a.left+a.width/2)*${scale},y:f.top+(a.top+a.height/2)*${scale}}})()`);
        await mouseClick(coords.x,coords.y);
        await until(visible,`menu open ${themeIndex}/${scale}`);
        const info = await metrics(); aligned(info);
        assert.equal(info.expanded,'true'); assert.equal(info.controls,'saveCategoryMenu');
        assert.equal(info.background,info.surface,'menu uses the current theme surface');
        assert.equal(info.trigger,info.control,'trigger uses the current theme control color');
        assert.ok(info.active,'active option is announced');
        assert.equal(await frame(`return d.querySelectorAll('#saveCategoryMenu [role="option"]').length`),21);
        if (scale===1 && themeIndex<2) fs.writeFileSync(path.join(output,`${themes[themeIndex].mode}-menu.png`),(await win.webContents.capturePage()).toPNG());
        // Choose among the first four visible entries so the pointer target is
        // onscreen, while changing the value on every iteration.
        const desired = 1 + ((themeIndex * 5 + scaleIndex) % 3);
        const option = await frame(`const r=d.querySelectorAll('#saveCategoryMenu [role="option"]')[${desired}].getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};`);
        const iframe = await js(`(()=>{const r=document.querySelector('iframe').getBoundingClientRect();return {x:r.left,y:r.top}})()`);
        await mouseClick(iframe.x+option.x*scale,iframe.y+option.y*scale);
        await until(async()=>!(await visible()),'menu closed after selecting');
        const actual = await frame(`return d.querySelector('#saveCategory').value`);
        if (actual !== String(desired)) console.error('Selection diagnostics:',{themeIndex,scale,desired,actual,option,iframe},await frame(`return w.__pointerTrace.slice(-20)`));
        assert.equal(actual,String(desired),`physical selection theme ${themeIndex} scale ${scale}`);
        assert.equal(await frame(`return d.querySelector('#saveCategoryCaption').textContent`),`分类 ${desired}`);
      }
    }

    // A node resize and a live theme update must not detach or dismiss the menu.
    await js(`{const n=document.querySelector('#node');n.style.transform='none';n.style.width='520px';n.style.height='646px';}`);
    win.setContentSize(700,800); await frame(`d.querySelector('.scroll').scrollTop=0;`); await delay(80);
    await open(); await until(visible,'menu before resize');
    await js(`document.querySelector('#node').style.width='440px'`); await delay(100);
    assert.equal(await visible(),true,'resizing keeps the menu open'); aligned(await metrics());
    await init(themes[0]); await delay(60);
    assert.equal(await visible(),true,'theme hydration keeps the menu open');
    const recolored = await metrics(); assert.equal(recolored.background,recolored.surface); aligned(recolored);
    await key('Escape');

    // A short node must open upward, keeping all visible content in the iframe.
    await js(`{const n=document.querySelector('#node');n.style.transform='none';n.style.height='410px';}`);
    win.setContentSize(700,600);
    await frame(`d.querySelector('.scroll').scrollTop=0;d.querySelector('#saveCategoryTrigger').scrollIntoView({block:'end'});`);
    await delay(100); await open(); await until(visible,'small node menu');
    const small = await metrics(); aligned(small); assert.equal(small.placement,'top','open upwards near bottom edge');
    await key('End'); await delay(50);
    assert.ok(await frame(`return d.querySelector('#saveCategoryMenu').scrollTop > 0`),'keyboard navigation scrolls the menu');
    assert.equal(await visible(),true,'scrolling inside the menu must not close it');
    await key('Enter'); assert.equal(await frame(`return d.querySelector('#saveCategory').value`),'20');
    assert.equal(await frame(`return d.querySelector('#saveCategoryCaption').textContent`),'分类 20');
    assert.equal(await js(`messages.filter(m=>m.type==='state').at(-1).payload.state.saveCategoryId`),20);
    await open(); await key('Home'); await key('Enter');
    assert.equal(await frame(`return d.querySelector('#saveCategory').value`),'','placeholder clears the saved category');
    await open(); await key('Escape'); assert.equal(await visible(),false,'Escape closes the menu');
    await open(); await frame(`d.body.dispatchEvent(new w.PointerEvent('pointerdown',{bubbles:true}));`);
    assert.equal(await visible(),false,'outside pointer closes the menu');
    await open(); await frame(`const s=d.querySelector('.scroll'),before=s.scrollTop;s.scrollTop=before>0?Math.max(0,before-25):before+25;s.dispatchEvent(new w.Event('scroll'));`);
    assert.equal(await visible(),false,'scrolling the node closes the menu');
    await open(); await frame(`w.__suppressTestBlur=false;w.dispatchEvent(new w.Event('blur'));`);
    assert.equal(await visible(),false,'window blur closes the menu');

    console.log(`PASS: 3 themes, 5 canvas zoom levels with real pointer selection, edge placement, keyboard, scrolling and state. Screenshots: ${output}`);
    server.close(); app.exit(0);
  } catch (error) { server.close(); throw error; }
})().catch(error => { console.error(error); app.exit(1); });
