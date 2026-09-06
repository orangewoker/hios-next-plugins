(function () {
  const protocol = 'hios-plugin-node/v1';
  let nodeId = new URLSearchParams(location.search).get('nodeId') || '';
  let pluginId = 'k2-prompt-generator';
  const post = (type, payload) => parent.postMessage({ protocol, nodeId, pluginId, type, payload: payload || {} }, '*');
  const $ = (id) => document.getElementById(id);

  const compactFields = {
    'c-lens': 'lens', 'c-viewpoint': 'viewpoint', 'c-shotSize': 'shotSize',
    'c-mainLight': 'mainLight', 'c-colorTone': 'colorTone', 'c-temperament': 'temperament',
    'c-age': 'age', 'c-identity': 'identity', 'c-clothCat': 'clothCat', 'c-clothItem': 'clothItem',
    'c-poseCat': 'poseCat', 'c-pose': 'pose', 'c-scene': 'scene', 'c-comp': 'comp',
  };

  function optionList(list) {
    let items = (window.OPT?.[list] || []).filter((item) => item.v !== '不使用');
    if (list === 'age' && window.restrictLock) items = items.filter((item) => Number(String(item.v).match(/\d+/)?.[0] || 0) >= 18);
    if (list === 'identity' && window.restrictLock) items = items.filter((item) => !window.IDENTITY_MINOR?.[item.v]);
    return [{ v: '不使用' }].concat(items);
  }
  function fillCompact(id, list, current) {
    const select = $(id); if (!select) return;
    const items = optionList(list);
    select.innerHTML = '';
    items.forEach((item) => { const option = document.createElement('option'); option.value = item.v; option.textContent = item.v; select.appendChild(option); });
    if (items.some((item) => item.v === current)) select.value = current;
  }
  function fullValues() {
    const result = {};
    (window.allFieldIds || []).forEach((id) => { const element = $(id); if (element) result[id] = element.value; });
    return result;
  }
  function serializeState() {
    return { version: 1, mode: window.MODE || 'SFW', intlMode: !!window.intlMode, restrictLock: !!window.restrictLock,
      autoTrim: $('autoTrim')?.checked !== false, values: fullValues(), lockedFields: { ...(window.lockedFields || {}) } };
  }
  function reportData() {
    const prompt = $('promptBox')?.textContent || '';
    return { prompt, mode: window.MODE || 'SFW', chars: prompt ? (window.countChars ? window.countChars(prompt) : prompt.length) : 0, selfcheck: $('selfcheck')?.textContent || '' };
  }
  function syncCompactFromFull() {
    Object.entries(compactFields).forEach(([compactId, fullId]) => {
      const full = $(fullId); const compact = $(compactId); if (full && compact) compact.value = full.value;
    });
    $('modeSfw').classList.toggle('active', window.MODE !== 'NSFW');
    $('modeNsfw').classList.toggle('active', window.MODE === 'NSFW');
    $('modeNsfw').hidden = !window.intlMode;
    $('intlBtn').classList.toggle('active', !!window.intlMode);
  }
  function refreshCompact() {
    fillCompact('c-lens', 'lens', window.v('lens')); fillCompact('c-viewpoint', 'viewpoint', window.v('viewpoint'));
    fillCompact('c-shotSize', 'shotSize', window.v('shotSize')); fillCompact('c-mainLight', 'mainLight', window.v('mainLight'));
    fillCompact('c-colorTone', 'colorTone', window.v('colorTone')); fillCompact('c-temperament', 'temperament', window.v('temperament'));
    fillCompact('c-age', 'age', window.v('age')); fillCompact('c-identity', 'identity', window.v('identity'));
    fillCompact('c-clothCat', 'clothCat', window.v('clothCat'));
    fillCompact('c-clothItem', 'clothItem', window.v('clothItem'));
    fillCompact('c-poseCat', 'poseCat', window.v('poseCat')); fillCompact('c-pose', 'pose', window.v('pose'));
    fillCompact('c-scene', 'scene', window.v('scene')); fillCompact('c-comp', 'comp', window.v('comp'));
    syncCompactFromFull();
  }
  function emitState() { post('state', { state: serializeState() }); }
  function emitOutput() {
    const result = reportData();
    if (!result.prompt || result.prompt.indexOf('请在左侧选择选项') === 0) return;
    post('output', { output: { kind: 'text', portId: 'prompt', value: result.prompt, text: result.prompt, name: 'K2 人像提示词' } });
    $('preview').textContent = result.prompt; $('report').textContent = `${result.mode} · ${result.chars} 字 · ${result.selfcheck.replace(/\s+/g, ' ').slice(0, 180)}`;
    $('status').textContent = '已生成，可连接下游节点';
  }
  function generate() { window.generate(); refreshCompact(); emitOutput(); emitState(); }
  function applyState(input) {
    const state = input && typeof input === 'object' ? input : {};
    if (typeof state.restrictLock === 'boolean') { window.restrictLock = state.restrictLock; $('restrictLock').checked = state.restrictLock; }
    if (typeof state.intlMode === 'boolean') { window.intlMode = state.intlMode; $('intlMode').checked = state.intlMode; }
    if (state.mode === 'SFW' || state.mode === 'NSFW') window.MODE = state.mode;
    if (typeof state.autoTrim === 'boolean') $('autoTrim').checked = state.autoTrim;
    window.updateModeUI(true);
    const values = state.values && typeof state.values === 'object' ? state.values : {};
    Object.entries(values).forEach(([id, value]) => { const element = $(id); if (element && typeof value === 'string') element.value = value; });
    window.populateClothItems(window.v('clothCat')); window.populatePoseItems(window.v('poseCat'));
    Object.entries(values).forEach(([id, value]) => { const element = $(id); if (element && typeof value === 'string' && Array.from(element.options || []).some((option) => option.value === value)) element.value = value; });
    window.lockedFields = state.lockedFields && typeof state.lockedFields === 'object' ? { ...state.lockedFields } : {};
    window.applyAgeBody(); if (!values.identity) window.autoIdentity(); window.generate(); refreshCompact();
  }

  Object.entries(compactFields).forEach(([compactId, fullId]) => $(compactId).addEventListener('change', () => {
    const full = $(fullId); if (!full) return;
    full.value = $(compactId).value;
    if (fullId === 'clothCat') window.populateClothItems(full.value);
    if (fullId === 'poseCat') window.populatePoseItems(full.value);
    window.onFieldChange(fullId); refreshCompact(); emitState();
  }));
  $('modeSfw').onclick = () => { window.MODE = 'SFW'; window.updateModeUI(); refreshCompact(); emitState(); };
  $('modeNsfw').onclick = () => { if (!window.intlMode) return; window.MODE = 'NSFW'; window.updateModeUI(); refreshCompact(); emitState(); };
  $('intlBtn').onclick = () => { window.intlMode = !window.intlMode; $('intlMode').checked = window.intlMode; if (!window.intlMode) window.MODE = 'SFW'; window.updateModeUI(); refreshCompact(); emitState(); };
  $('randomBtn').onclick = () => { window.randomizeAll(); refreshCompact(); emitOutput(); emitState(); };
  $('generateBtn').onclick = generate;
  $('copyBtn').onclick = () => {
    const text = $('preview').textContent || '';
    if (navigator.clipboard?.writeText) { navigator.clipboard.writeText(text); return; }
    const textarea = document.createElement('textarea'); textarea.value = text; document.body.appendChild(textarea); textarea.select();
    try { document.execCommand('copy'); } catch (_) { /* clipboard permission is optional in sandboxed nodes */ }
    textarea.remove();
  };
  $('openApp').onclick = () => post('open-app', { appId: 'k2-prompt-generator', payload: { state: serializeState() } });

  window.addEventListener('message', (event) => {
    if (!event.data || event.data.protocol !== protocol) return;
    const payload = event.data.payload && typeof event.data.payload === 'object' ? event.data.payload : {};
    if (event.data.type === 'init') {
      nodeId = String(payload.nodeId || event.data.nodeId || nodeId);
      pluginId = String(payload.pluginId || event.data.pluginId || pluginId);
      applyState(payload.state); $('status').textContent = '已初始化'; post('loaded');
    }
    if (event.data.type === 'run') { applyState(payload.state); window.randomizeAll(); refreshCompact(); emitOutput(); emitState(); }
  });
  refreshCompact();
  $('preview').textContent = $('promptBox').textContent || '选择参数后点击生成';
  post('ready');
})();
