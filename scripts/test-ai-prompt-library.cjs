// Run with an Electron executable: electron scripts/test-ai-prompt-library.cjs
// Optional HIOS_PLUGIN_TEST_OUTPUT / HIOS_PLUGIN_TEST_BASELINE select screenshot
// output and a previous HTML fixture. Only an isolated loopback API is used.
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'plugins/ai-prompt-library/runtime/index.html'));
const baseline = process.env.HIOS_PLUGIN_TEST_BASELINE && fs.readFileSync(process.env.HIOS_PLUGIN_TEST_BASELINE);
const output = process.env.HIOS_PLUGIN_TEST_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(), 'hios-prompt-test-'));
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'hios-prompt-profile-')));
const requests = [];
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url.startsWith('/api/v1/')) {
    requests.push({ url: req.url, key: req.headers['x-api-key'] });
    if (req.headers['x-api-key'] !== 'fixture-key') { res.statusCode = 401; res.end('{}'); return; }
    if (req.url === '/api/v1/health') res.end(JSON.stringify({ status: 'ok' }));
    else if (req.url.startsWith('/api/v1/categories')) res.end(JSON.stringify([{ id: 1, name: '建筑设计', count: 3 }, { id: 2, name: '人物摄影', count: 4 }]));
    else if (req.url === '/api/v1/random') {
      let body = ''; req.on('data', chunk => body += chunk);
      req.on('end', () => {
        requests.at(-1).body = JSON.parse(body);
        res.end(JSON.stringify({ items: [{ asset_id: 42, category_id: 1, category_name: '建筑设计', prompt: '清晰的建筑摄影，柔和的自然光。', thumbnail_url: '' }] }));
      });
    } else { res.statusCode = 404; res.end('{}'); }
    return;
  }
  res.setHeader('Content-Type', 'text/html;charset=utf-8');
  if (req.url === '/plugin') { res.end(source); return; }
  if (req.url === '/before' && baseline) { res.end(baseline); return; }
  res.end(`<!doctype html><meta charset="utf-8"><style>
    body{margin:0;padding:24px;overflow:hidden;background:#e4e5e7;font:14px 'Microsoft YaHei UI',sans-serif}
    #node{width:520px;height:646px;transform-origin:top left;border:1px solid #b9bbbf;border-radius:12px;overflow:hidden;background:#f1f2f4}
    header{height:36px;box-sizing:border-box;padding:7px 12px;font-weight:600;border-bottom:1px solid #b9bbbf}
    iframe{width:100%;height:calc(100% - 36px);display:block;border:0}
    </style><section id="node"><header>随机提示词库</header><iframe src="/plugin" sandbox="allow-scripts allow-same-origin allow-forms"></iframe></section>
    <script>window.messages=[];window.addEventListener('message',e=>messages.push(e.data));</script>`);
});
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, label) {
  for (let n = 0; n < 100; n++) { if (await check()) return; await delay(50); }
  throw Error('Timed out: ' + label);
}
(async () => {
  await app.whenReady();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const win = new BrowserWindow({ show: false, width: 1300, height: 1100, webPreferences: { backgroundThrottling: false } });
  const js = code => win.webContents.executeJavaScript(code);
  const frame = code => js(`(()=>{const w=frames[0],d=w.document;${code}})()`);
  await win.loadURL(origin);
  await until(() => js('messages.some(m=>m.type==="ready")'), 'ready');
  assert.equal(await js('messages.find(m=>m.type==="ready").payload.version'), '0.1.2');
  win.webContents.debugger.attach('1.3');
  await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
  const init = (theme, state = {}) => js(`frames[0].postMessage({protocol:'hios-plugin-node/v1',pluginId:'ai-prompt-library',nodeId:'fixture',type:'init',payload:{theme:${JSON.stringify(theme)},state:${JSON.stringify(state)}}},'*')`);
  const report = [];
  let lightTheme;
  for (const mode of ['light', 'dark']) {
    // Neutral HIOS surfaces are supplied by the existing theme protocol.
    const tokens = mode === 'dark'
      ? { background: '#232529', surface: '#2b2d31', control: '#323439', muted: '#282a2e', text: '#f0f0f2', textSecondary: '#b9bbc1', textMuted: '#81858d', border: '#46494f' }
      : { background: '#f1f2f4', surface: '#f7f8fa', control: '#edeef1', muted: '#edeef1', text: '#25272c', textSecondary: '#60646d', textMuted: '#92969e', border: '#d3d5da' };
    if (mode === 'light') lightTheme = { mode, tokens };
    await init({ mode, tokens });
    await until(() => frame(`return d.documentElement.dataset.theme===${JSON.stringify(mode)}`), 'theme');
    for (const width of [360, 440, 520, 800]) {
      await js(`document.querySelector('#node').style.width='${width}px'`);
      await delay(100);
      const metrics = await frame(`
        const css=w.getComputedStyle.bind(w),scroll=d.querySelector('.scroll');
        const fields=[...d.querySelectorAll('input:not([type=checkbox])')];
        const paint=e=>{const s=css(e);return [s.borderColor,s.boxShadow,s.outlineStyle];};
        const focus=fields.map(e=>{e.blur();const before=paint(e);e.focus();const after=paint(e);e.blur();return {before,after};});
        const text=[...d.querySelectorAll('.brand strong,.brand small,.status,.panel-head strong,.panel-head small,label,.btn,.note,.empty,.result-head strong,.result-head span')];
        return {width:scroll.clientWidth,scrollWidth:scroll.scrollWidth,text:text.map(e=>({text:e.textContent,size:parseFloat(css(e).fontSize)})),inputSize:css(d.querySelector('#serverUrl')).fontSize,placeholderOpacity:css(d.querySelector('#serverUrl'),'::placeholder').opacity,revealWhiteSpace:css(d.querySelector('#revealKey')).whiteSpace,focus,background:css(d.body).backgroundColor};`);
      assert.ok(metrics.scrollWidth <= metrics.width + 1, `${mode}/${width}: horizontal overflow`);
      assert.ok(metrics.text.every(item => item.size >= 12), `${mode}/${width}: tiny text`);
      assert.equal(metrics.inputSize, '14px');
      assert.equal(metrics.placeholderOpacity, '1');
      assert.equal(metrics.revealWhiteSpace, 'nowrap');
      metrics.focus.forEach(item => assert.deepEqual(item.after, item.before, 'focus paint'));
      assert.ok(await frame(`const s=d.querySelector('.scroll').getBoundingClientRect(),f=d.querySelector('.footer-actions').getBoundingClientRect();return s.bottom<=f.top+1;`), 'footer must not cover scrollable content');
      report.push({ mode, width, ...metrics });
    }
    for (const scale of [0.75, 1, 1.45, 2]) {
      await js(`{const n=document.querySelector('#node');n.style.width='520px';n.style.transform='scale(${scale})';}`);
      win.setContentSize(Math.ceil(520 * scale + 70), Math.ceil(646 * scale + 70));
      await frame(`d.activeElement?.blur();d.querySelector('.scroll').scrollTop=0;`);
      await delay(180);
      fs.writeFileSync(path.join(output, `${mode}-after-${scale}.png`), (await win.webContents.capturePage()).toPNG());
    }
  }
  await js(`document.querySelector('#node').style.transform='none'`);
  await frame(`d.querySelector('#serverUrl').value=${JSON.stringify(origin)};d.querySelector('#apiKey').value='fixture-key';d.querySelector('#connect').click();`);
  await until(() => frame(`return d.querySelector('#status').textContent==='已连接'`), 'connect');
  assert.equal(await frame(`return d.querySelectorAll('.category').length`), 2);
  await frame(`d.querySelector('.category').click();d.querySelector('#random').click();`);
  await until(() => js('messages.some(m=>m.type==="output")'), 'automatic output');
  assert.equal(await js('messages.find(m=>m.type==="output").payload.output.value'), '清晰的建筑摄影，柔和的自然光。');
  assert.deepEqual(requests.find(req => req.url === '/api/v1/random').body.category_ids, [1]);
  await frame(`d.querySelector('#revealKey').click();`);
  assert.equal(await frame(`return d.querySelector('#apiKey').type`), 'text');
  await frame(`d.querySelector('#revealKey').click();`);
  assert.equal(await frame(`return d.querySelector('#apiKey').type`), 'password');
  await frame(`d.querySelector('#autoOutput').checked=false;d.querySelector('#autoOutput').dispatchEvent(new w.Event('change'));`);
  await js('window.messages=[]');
  await js(`frames[0].postMessage({protocol:'hios-plugin-node/v1',pluginId:'ai-prompt-library',nodeId:'fixture',type:'run',payload:{state:{autoOutput:false,count:2,seed:17,selectedCategoryIds:[2]}}},'*')`);
  await until(() => js('messages.some(m=>m.type==="output")'), 'downstream run output');
  const state = await js('messages.filter(m=>m.type==="state").at(-1).payload.state');
  assert.equal(state.count, 2); assert.equal(state.seed, 17); assert.equal(state.autoOutput, false);
  assert.ok(!JSON.stringify(state).includes('fixture-key'), 'credentials never enter canvas state');
  const apiReq = requests.filter(req => req.url === '/api/v1/random').at(-1);
  assert.deepEqual(apiReq.body, { category_ids: [2], count: 2, seed: 17 });
  if (baseline) {
    await frame(`w.localStorage.clear()`);
    await js(`document.querySelector('iframe').src='/before'`);
    await until(() => frame(`return w.location.pathname==='/before' && d.querySelector('#connect')!==null`), 'baseline');
    await init(lightTheme);
    await until(() => frame(`return d.documentElement.style.getPropertyValue('--bg')==='#f1f2f4'`), 'baseline theme');
    for (const scale of [1, 1.45]) {
      await js(`document.querySelector('#node').style.transform='scale(${scale})'`);
      win.setContentSize(Math.ceil(520 * scale + 70), Math.ceil(646 * scale + 70));
      await delay(180);
      fs.writeFileSync(path.join(output, `light-before-${scale}.png`), (await win.webContents.capturePage()).toPNG());
    }
  }
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ report, requests, state }, null, 2));
  console.log(`PASS: 8 light/dark layouts, 8 zoom captures, focus paint, theme tokens, API/category/random/output/run/state. Screenshots: ${output}`);
  win.destroy(); server.close(); app.exit(0);
})().catch(error => { console.error(error); server.close(); app.exit(1); });
