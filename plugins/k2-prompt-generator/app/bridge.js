(function () {
  const protocol = 'hios-plugin-app/v1';
  const post = (type, payload) => parent.postMessage({ protocol, type, payload: payload || {} }, '*');

  function values() {
    const result = {};
    (window.allFieldIds || []).forEach((id) => {
      const element = document.getElementById(id);
      if (element && typeof element.value === 'string') result[id] = element.value;
    });
    return result;
  }

  function serializeState() {
    return {
      version: 1,
      mode: window.MODE || 'SFW',
      intlMode: !!window.intlMode,
      restrictLock: !!window.restrictLock,
      autoTrim: document.getElementById('autoTrim')?.checked !== false,
      values: values(),
      lockedFields: { ...(window.lockedFields || {}) },
    };
  }

  function emitState() { post('state', { state: serializeState() }); }

  function emitOutput() {
    const prompt = document.getElementById('promptBox')?.textContent || '';
    if (!prompt || prompt.indexOf('请在左侧选择选项') === 0) return;
    post('output', {
      output: {
        kind: 'text',
        value: prompt,
        text: prompt,
        name: 'K2 人像提示词',
        metadata: { mode: window.MODE || 'SFW' },
      },
    });
    emitState();
  }

  function applyState(input) {
    const state = input && typeof input === 'object' ? input : {};
    if (typeof state.restrictLock === 'boolean') {
      window.restrictLock = state.restrictLock;
      const lock = document.getElementById('restrictLock');
      if (lock) lock.checked = state.restrictLock;
    }
    if (typeof state.intlMode === 'boolean') {
      window.intlMode = state.intlMode;
      const intl = document.getElementById('intlMode');
      if (intl) intl.checked = state.intlMode;
    }
    if (state.mode === 'NSFW' || state.mode === 'SFW') window.MODE = state.mode;
    if (typeof state.autoTrim === 'boolean') {
      const trim = document.getElementById('autoTrim');
      if (trim) trim.checked = state.autoTrim;
    }
    if (typeof window.updateModeUI === 'function') window.updateModeUI(true);

    const inputValues = state.values && typeof state.values === 'object' ? state.values : {};
    Object.entries(inputValues).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element && typeof value === 'string') element.value = value;
    });
    if (typeof window.populateClothItems === 'function') window.populateClothItems(window.v('clothCat'));
    if (typeof window.populatePoseItems === 'function') window.populatePoseItems(window.v('poseCat'));
    Object.entries(inputValues).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element && typeof value === 'string' && Array.from(element.options || []).some((option) => option.value === value)) element.value = value;
    });
    window.lockedFields = state.lockedFields && typeof state.lockedFields === 'object' ? { ...state.lockedFields } : {};
    Object.entries(window.lockedFields).forEach(([id, locked]) => {
      const button = document.getElementById(`lock_${id}`);
      if (!button) return;
      button.classList.toggle('on', !!locked);
      button.textContent = locked ? '🔒' : '🔓';
    });
    if (typeof window.applyAgeBody === 'function') window.applyAgeBody();
    if (typeof window.autoIdentity === 'function' && !inputValues.identity) window.autoIdentity();
    if (typeof window.generate === 'function') window.generate();
  }

  document.addEventListener('change', () => setTimeout(emitState, 0), true);
  ['genBtn', 'randAll', 'clearBtn'].forEach((id) => {
    document.getElementById(id)?.addEventListener('click', () => setTimeout(emitOutput, 0));
  });
  window.addEventListener('message', (event) => {
    if (!event.data || event.data.protocol !== protocol) return;
    const payload = event.data.payload && typeof event.data.payload === 'object' ? event.data.payload : {};
    if (event.data.type === 'init') applyState(payload.state);
  });

  post('ready');
})();
