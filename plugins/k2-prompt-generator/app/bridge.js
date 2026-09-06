(function () {
  const protocol = 'hios-plugin-app/v1';
  const sharedKey = 'hios.k2-prompt-generator.shared.v2';
  const commandKey = 'hios.k2-prompt-generator.command.v1';
  const placeholder = '请在左侧选择选项';
  let lastCommandId = '';
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
      version: 2,
      mode: window.MODE || 'SFW',
      intlMode: !!window.intlMode,
      restrictLock: !!window.restrictLock,
      autoTrim: document.getElementById('autoTrim')?.checked !== false,
      values: values(),
      lockedFields: { ...(window.lockedFields || {}) },
    };
  }

  function currentPrompt() {
    const prompt = (document.getElementById('promptBox')?.textContent || '').trim();
    return !prompt || prompt.indexOf(placeholder) === 0 ? '' : prompt;
  }

  function saveSharedSnapshot() {
    const prompt = currentPrompt();
    const snapshot = {
      version: 2,
      source: 'app',
      updatedAt: Date.now(),
      state: serializeState(),
      prompt,
      selfcheck: (document.getElementById('selfcheck')?.textContent || '').trim(),
      chars: prompt ? (window.countChars ? window.countChars(prompt) : prompt.length) : 0,
    };
    try { localStorage.setItem(sharedKey, JSON.stringify(snapshot)); } catch (_) { /* host state still works */ }
    return snapshot;
  }

  function readSharedState() {
    try {
      const snapshot = JSON.parse(localStorage.getItem(sharedKey) || 'null');
      return snapshot && typeof snapshot.state === 'object' ? snapshot.state : null;
    } catch (_) {
      return null;
    }
  }

  function emitState() {
    const snapshot = saveSharedSnapshot();
    post('state', { state: snapshot.state });
  }

  function emitOutput() {
    const snapshot = saveSharedSnapshot();
    if (!snapshot.prompt) {
      post('state', { state: snapshot.state });
      return;
    }
    post('output', {
      output: {
        kind: 'text',
        value: snapshot.prompt,
        text: snapshot.prompt,
        name: 'K2 人像提示词',
        metadata: { mode: snapshot.state.mode, updatedAt: snapshot.updatedAt },
      },
    });
    post('state', { state: snapshot.state });
  }

  function generateAndSync(emitAsOutput) {
    try {
      if (typeof window.generate === 'function') window.generate();
      if (emitAsOutput) emitOutput();
      else emitState();
    } catch (error) {
      post('error', { message: String(error?.message || error) });
    }
  }

  function handleCommand(command) {
    if (!command || typeof command !== 'object' || !command.id || command.id === lastCommandId) return;
    lastCommandId = String(command.id);
    if (command.action === 'randomize' && typeof window.randomizeAll === 'function') {
      window.randomizeAll();
      setTimeout(() => generateAndSync(true), 0);
    }
  }

  function readPendingCommand() {
    try { return JSON.parse(localStorage.getItem(commandKey) || 'null'); } catch (_) { return null; }
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
    generateAndSync(false);
  }

  let changeTimer = 0;
  document.addEventListener('change', () => {
    clearTimeout(changeTimer);
    changeTimer = setTimeout(() => generateAndSync(false), 0);
  }, true);

  ['genBtn', 'randAll'].forEach((id) => {
    document.getElementById(id)?.addEventListener('click', () => setTimeout(() => generateAndSync(true), 0));
  });
  document.getElementById('clearBtn')?.addEventListener('click', () => setTimeout(() => generateAndSync(false), 0));
  ['mSFW', 'mNSFW'].forEach((id) => {
    document.getElementById(id)?.addEventListener('click', () => setTimeout(() => generateAndSync(false), 0));
  });
  document.addEventListener('click', (event) => {
    if (event.target?.id?.startsWith('lock_')) setTimeout(() => generateAndSync(false), 0);
  }, true);

  window.addEventListener('message', (event) => {
    if (!event.data || event.data.protocol !== protocol) return;
    const payload = event.data.payload && typeof event.data.payload === 'object' ? event.data.payload : {};
    if (event.data.type === 'init') {
      const hostState = payload.state && typeof payload.state === 'object' && Object.keys(payload.state).length ? payload.state : null;
      applyState(hostState || readSharedState() || {});
      handleCommand(payload.command);
      handleCommand(readPendingCommand());
    }
  });

  window.addEventListener('storage', (event) => {
    if (event.key !== commandKey || !event.newValue) return;
    try { handleCommand(JSON.parse(event.newValue)); } catch (_) { /* ignore malformed command */ }
  });

  post('ready');
})();
