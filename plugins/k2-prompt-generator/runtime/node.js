(function () {
  const protocol = 'hios-plugin-node/v1';
  const sharedKey = 'hios.k2-prompt-generator.shared.v2';
  let nodeId = new URLSearchParams(location.search).get('nodeId') || '';
  let pluginId = 'k2-prompt-generator';
  let snapshot = null;
  const $ = (id) => document.getElementById(id);
  const post = (type, payload) => parent.postMessage({ protocol, nodeId, pluginId, type, payload: payload || {} }, '*');

  function readSnapshot() {
    try {
      const value = JSON.parse(localStorage.getItem(sharedKey) || 'null');
      if (!value || typeof value !== 'object' || typeof value.state !== 'object') return null;
      return value;
    } catch (_) {
      return null;
    }
  }

  function formatTime(timestamp) {
    if (!timestamp) return '未知时间';
    try { return new Date(timestamp).toLocaleString('zh-CN', { hour12: false }); }
    catch (_) { return '未知时间'; }
  }

  function render() {
    const prompt = typeof snapshot?.prompt === 'string' ? snapshot.prompt.trim() : '';
    const mode = snapshot?.state?.mode || 'SFW';
    const values = snapshot?.state?.values && typeof snapshot.state.values === 'object' ? snapshot.state.values : {};
    const used = Object.values(values).filter((value) => value && value !== '不使用').length;

    if (!snapshot) {
      $('status').textContent = '尚未从应用同步';
      $('mode').textContent = '未同步';
      $('mode').classList.remove('ready');
      $('summary').textContent = '请先打开应用，选择参数并生成提示词。';
      $('preview').textContent = '等待应用生成提示词…';
      $('copyBtn').disabled = true;
      return;
    }

    $('mode').textContent = mode;
    $('mode').classList.add('ready');
    $('summary').textContent = `${used} 项参数 · ${formatTime(snapshot.updatedAt)} · ${snapshot.chars || prompt.length} 字`;
    $('preview').textContent = prompt || '应用设置已同步，但尚未生成有效提示词。';
    $('copyBtn').disabled = !prompt;
    $('status').textContent = prompt ? '已同步应用输出' : '请在应用中选择参数';
  }

  function syncFromApp() {
    snapshot = readSnapshot();
    render();
    return snapshot;
  }

  function runAndOutput() {
    syncFromApp();
    const prompt = typeof snapshot?.prompt === 'string' ? snapshot.prompt.trim() : '';
    if (!prompt) {
      const message = '没有可输出的提示词，请先在 K2 应用中选择参数并生成。';
      $('status').textContent = message;
      post('error', { message });
      return;
    }
    post('output', {
      output: {
        kind: 'text',
        portId: 'prompt',
        value: prompt,
        text: prompt,
        name: 'K2 人像提示词',
        metadata: { mode: snapshot.state.mode || 'SFW', updatedAt: snapshot.updatedAt || Date.now() },
      },
    });
    $('status').textContent = '已运行并输出到下一节点';
  }

  $('openApp').addEventListener('click', () => post('open-app', { appId: 'k2-prompt-generator', payload: {} }));
  $('syncBtn').addEventListener('click', syncFromApp);
  $('runBtn').addEventListener('click', runAndOutput);
  $('copyBtn').addEventListener('click', async () => {
    const prompt = typeof snapshot?.prompt === 'string' ? snapshot.prompt.trim() : '';
    if (!prompt) return;
    try { await navigator.clipboard.writeText(prompt); }
    catch (_) {
      const textarea = document.createElement('textarea');
      textarea.value = prompt;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
  });

  window.addEventListener('storage', (event) => {
    if (event.key === sharedKey) syncFromApp();
  });
  window.addEventListener('focus', syncFromApp);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) syncFromApp(); });
  window.setInterval(syncFromApp, 1500);

  window.addEventListener('message', (event) => {
    if (!event.data || event.data.protocol !== protocol) return;
    const payload = event.data.payload && typeof event.data.payload === 'object' ? event.data.payload : {};
    if (event.data.type === 'init') {
      nodeId = String(payload.nodeId || event.data.nodeId || nodeId);
      pluginId = String(payload.pluginId || event.data.pluginId || pluginId);
      syncFromApp();
      post('loaded');
    }
    if (event.data.type === 'run') runAndOutput();
  });

  syncFromApp();
  post('ready');
})();
