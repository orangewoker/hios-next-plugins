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
      version: 3,
      generatorState: window.serializeState(),
      mode: window.detectMode(),
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
      ...(lastCommandId ? { commandId: lastCommandId } : {}),
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

  // Generator event handlers own generation; persistence must not fill blank fields.
  function syncState(emitAsOutput) {
    try {
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
      if (typeof window.unlockAndRandomizeAll === 'function') window.unlockAndRandomizeAll(); else window.randomizeAll();
      setTimeout(() => syncState(true), 0);
    }
  }

  function readPendingCommand() {
    try { return JSON.parse(localStorage.getItem(commandKey) || 'null'); } catch (_) { return null; }
  }

  function applyState(input) {
    const state = input && typeof input === 'object' ? input : {};
    const trim = document.getElementById('autoTrim');
    if (trim && typeof state.autoTrim === 'boolean') trim.checked = state.autoTrim;
    const saved = state.generatorState || (state.vals ? state : null);
    if (saved) window.applyState(saved);
    else if (state.values) window.applyState({ vals: state.values, locked: state.lockedFields || {}, modes: {} });
    syncState(false);
  }

  let changeTimer = 0;
  document.addEventListener('change', () => {
    clearTimeout(changeTimer);
    changeTimer = setTimeout(() => syncState(false), 0);
  }, true);

  ['genOut', 'randAll'].forEach((id) => {
    document.getElementById(id)?.addEventListener('click', () => setTimeout(() => syncState(true), 0));
  });
  document.addEventListener('click', (event) => {
    const button = event.target?.closest?.('button');
    if (button && !['genOut', 'randAll'].includes(button.id)) setTimeout(() => syncState(false), 0);
  }, true);

  document.addEventListener('input', () => { clearTimeout(changeTimer); changeTimer = setTimeout(() => syncState(false), 250); });

  window.addEventListener('message', (event) => {
    if (!event.data || event.data.protocol !== protocol) return;
    const payload = event.data.payload && typeof event.data.payload === 'object' ? event.data.payload : {};
    if (event.data.type === 'init') {
      const hostState = payload.state && typeof payload.state === 'object' && Object.keys(payload.state).length ? payload.state : null;
      applyState(hostState || readSharedState() || {});
      handleCommand(payload.command);
      handleCommand(readPendingCommand());
    }
    if (event.data.type === 'command') handleCommand(payload.command);
  });

  window.addEventListener('storage', (event) => {
    if (event.key !== commandKey || !event.newValue) return;
    try { handleCommand(JSON.parse(event.newValue)); } catch (_) { /* ignore malformed command */ }
  });

  post('ready');
})();

