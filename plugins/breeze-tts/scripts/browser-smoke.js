// For playwright-cli run-code --filename; requires the explicitly started mock workshop at :17860.
async (page) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:17860/app/index.html');
  await page.locator('#status.online').waitFor();
  const result = await page.evaluate(async () => {
    const assert = (condition, label) => { if (!condition) throw new Error(label); };
    const credentials = await (await fetch('/api/bootstrap')).json();
    const headers = { Authorization: `Bearer ${credentials.accessKey}` };
    const status = await (await fetch('/api/admin/status', { headers: { ...headers, 'X-Breeze-Admin': credentials.adminToken } })).json();
    assert(status.engine.state === 'external', 'Use the TEST mock engine, not a production model');
    const theme = { mode: 'dark', tokens: { background: '#152320', surface: '#20332e', control: '#263b35', text: '#edf6f1', textSecondary: '#b6c9bf', border: '#3b5148', accent: '#66c6a7' } };
    const mount = async (kind, payload) => {
      const frame = document.createElement('iframe'), messages = [], waiters = [];
      frame.style.cssText = 'width:500px;height:700px;border:0';
      const protocol = `hios-plugin-${kind}/v1`;
      const post = (type, payload) => frame.contentWindow.postMessage({ protocol, pluginId: 'breeze-tts', appId: 'studio', nodeId: 'smoke-node', type, payload }, location.origin);
      let readyResolve; const ready = new Promise(r => { readyResolve = r; });
      const listener = event => {
        if (event.source !== frame.contentWindow || event.data?.protocol !== protocol) return;
        const message = event.data; messages.push(message);
        if (message.type === 'ready') { post('init', { ...payload, theme }); readyResolve(); }
        for (const entry of [...waiters]) if (entry.test(message)) { clearTimeout(entry.timer); waiters.splice(waiters.indexOf(entry), 1); entry.resolve(message); }
      };
      window.addEventListener('message', listener); frame.src = `/${kind}/index.html`; document.body.appendChild(frame);
      await Promise.race([ready, new Promise((_, fail) => setTimeout(() => fail(new Error(`${kind} ready timeout`)), 6000))]);
      return { frame, post, messages, next: test => new Promise((resolve, reject) => { const entry = { test, resolve, timer: setTimeout(() => reject(new Error(`${kind} reply timeout`)), 10000) }; waiters.push(entry); }), dispose: () => { window.removeEventListener('message', listener); frame.remove(); } };
    };
    const node = await mount('node', { features: { outputBatch: true }, hostRunControl: true, state: { text: 'local text' } });
    try {
      const runId = crypto.randomUUID(), reply = node.next(m => ['output-batch', 'error'].includes(m.type) && m.payload.runId === runId);
      node.post('run', { runId, inputs: { text: [{ value: '来自画布连线的正文' }], settings: { value: { seed: 17 } } } });
      const message = await reply; assert(message.type === 'output-batch', JSON.stringify(message.payload));
      assert(message.payload.outputs.length === 4, 'four outputs');
      assert(message.payload.outputs[1].value === '来自画布连线的正文', 'connected text wins');
      assert(message.payload.outputs[2].value.seed === 17, 'connected settings win');
      assert(message.payload.outputs[0].source.startsWith('data:audio/wav;base64,'), 'client audio asset');
      assert(node.frame.contentDocument.documentElement.dataset.theme === 'dark', 'node dark theme');
      assert(node.frame.contentDocument.querySelector('#run').hidden, 'host run control');
      assert(!JSON.stringify(node.messages.filter(m => m.type === 'state')).includes(credentials.accessKey), 'no key in node state');
      const cancelId = crypto.randomUUID(), cancelled = node.next(m => m.type === 'error' && m.payload.runId === cancelId);
      node.post('run', { runId: cancelId, inputs: { text: '[slow] cancelled canvas run' } });
      for (let i = 0; i < 100; i++) { const jobs = await (await fetch('/api/jobs', { headers })).json(); if (jobs.some(j => j.idempotencyKey === cancelId)) break; await new Promise(r => setTimeout(r, 25)); }
      node.post('cancel', { runId: cancelId }); await cancelled;
      assert(!node.messages.some(m => m.type === 'output-batch' && m.payload.runId === cancelId), 'cancelled output must not publish');
      for (let i = 0; i < 100; i++) { const h = await (await fetch('/api/health', { headers })).json(); if (!h.busy) break; await new Promise(r => setTimeout(r, 25)); }
      window.__breezeSmokeReference = message.payload.outputs[0].source;
    } finally { node.dispose(); }
    const app = await mount('app', { applicationWorkflowBridge: true });
    try {
      const listId = crypto.randomUUID(), listed = app.next(m => m.type === 'application-workflow-response' && m.payload.requestId === listId);
      app.post('application-workflow-request', { requestId: listId, method: 'list-workflows' });
      const catalog = await listed; assert(catalog.payload.result[0].id === 'tts', 'workflow catalog');
      const runId = crypto.randomUUID(), done = app.next(m => m.type === 'application-workflow-response' && m.payload.requestId === runId);
      app.post('application-workflow-request', { requestId: runId, method: 'run-workflow', workflowId: 'tts', values: { text: '隐藏工作流参考音频输入测试', mode: 'clone', reference_audio: [{ source: window.__breezeSmokeReference }], ref_text: '参考转录' } });
      const generated = await done; assert(generated.payload.ok, JSON.stringify(generated.payload.error));
      assert(generated.payload.result.outputs[0].dataUrl.startsWith('data:audio/wav;base64,'), 'workflow audio');
      assert(!app.messages.some(m => m.type === 'output'), 'hidden workflow has no interactive output');
      const cancelId = crypto.randomUUID(), cancelled = app.next(m => m.type === 'application-workflow-response' && m.payload.requestId === cancelId);
      app.post('application-workflow-request', { requestId: cancelId, method: 'run-workflow', workflowId: 'tts', values: { text: '[slow] cancelled hidden workflow' } });
      app.post('application-workflow-request', { requestId: crypto.randomUUID(), method: 'cancel-workflow', targetRequestId: cancelId });
      assert((await cancelled).payload.ok === false, 'workflow cancellation');
    } finally { app.dispose(); delete window.__breezeSmokeReference; }
    return { node: 'four ports / connected inputs / runId / cancellation / dark theme / no key in state', workflow: 'list / clone with wrapped reference / cancel', lanUrl: status.urls.find(url => url.startsWith('http://192.168.')) || status.urls[0], accessKey: credentials.accessKey };
  });
  if (errors.length) throw new Error(errors.join('\n'));
  const context = await page.context().browser().newContext({ viewport: { width: 390, height: 844 } });
  try {
    const remote = await context.newPage(); remote.on('pageerror', e => errors.push(e.message));
    await remote.goto(`${result.lanUrl}/app/index.html`);
    await remote.locator('[data-page="connection"]').click();
    await remote.locator('#access-key').fill(result.accessKey);
    await remote.locator('#save-connection').click(); await remote.locator('#status.online').waitFor();
    await remote.locator('[data-page="models"]').click();
    if (!await remote.locator('#management-unavailable').isVisible() || await remote.locator('#management').isVisible()) throw new Error('Remote client has model management');
    await remote.locator('[data-page="create"]').click();
    await remote.locator('#text').fill('局域网 HTTP 客户端测试，无本地模型。'); await remote.locator('#generate').click();
    await remote.locator('#download').waitFor();
    const info = await remote.evaluate(() => ({ secureContext: isSecureContext, uuid: typeof crypto.randomUUID, overflow: document.documentElement.scrollWidth > innerWidth, mode: JSON.parse(localStorage.getItem('hios.breeze.connection.v1')).mode }));
    if (info.overflow || info.mode !== 'remote') throw new Error(JSON.stringify(info));
    await remote.screenshot({ path: 'output/playwright/breeze-studio-lan-mobile.png', fullPage: true });
    if (errors.length) throw new Error(errors.join('\n'));
    return { node: result.node, workflow: result.workflow, remote: info, pageErrors: errors };
  } finally { await context.close(); }
}
