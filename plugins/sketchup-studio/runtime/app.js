const PROTOCOL = 'hios-plugin-node/v1';
const PLUGIN_ID = 'sketchup-studio';
const MAX_REFERENCES = 4;
const MAX_IMAGE_DIM = 1600;
const MAX_IMAGE_BYTES = 1.8 * 1024 * 1024;

const $ = id => document.getElementById(id);

const els = {
  badge: $('su-badge'),
  expand: $('expand'),
  toolsToggle: $('tools-toggle'),
  tools: $('tools'),
  toolsClose: $('tools-close'),
  empty: $('empty'),
  previewImg: $('preview-img'),
  previewMeta: $('preview-meta'),
  toggleShadows: $('toggle-shadows'),
  captureNow: $('capture-now'),
  pushPreview: $('push-preview'),
  suVersion: $('su-version'),
  suLaunch: $('su-launch'),
  suBridge: $('su-bridge'),
  suRefresh: $('su-refresh'),
  suScene: $('su-scene'),
  stats: $('stats'),
  undo: $('undo'),
  format: $('format'),
  exportBtn: $('export'),
  syncDsh: $('sync-dsh'),
  historyList: $('history-list'),
  log: $('log'),
  referenceZone: $('reference-zone'),
  referenceCount: $('reference-count'),
  addReference: $('add-reference'),
  referenceFiles: $('reference-files'),
  references: $('references'),
  prompt: $('prompt'),
  model: $('model'),
  refreshModels: $('refresh-models'),
  inlineStatus: $('su-inline-status'),
  buildBtn: $('build-btn'),
  stopBtn: $('stop'),
  status: $('status'),
};

const displayButtons = [...document.querySelectorAll('.display-actions [data-mode]')];
const camButtons = [...document.querySelectorAll('.view-actions [data-cam]')];

let nodeId = '';
let expanded = false;
let inputs = {};
let versionsInfo = { installed: [], running: [], defaultVersion: '' };
let busy = false;
let stopRequested = false;
let activeRunId = '';

let state = {
  sessionId: '',
  version: '',
  displayMode: 'material',
  shadows: false,
  cameraPreset: 'current',
  sceneName: '',
  prompt: '',
  modelKey: '',
  references: [],
  latestCapture: null,
  latestModel: null,
};

const pendingRequests = new Map();

function makeUuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function resolveImgSrc(url) {
  if (!url) return '';
  if (location.hostname === 'hios-plugin.localhost') {
    return String(url).replace(/^hios-asset:\/\//i, 'http://hios-asset.localhost/');
  }
  return String(url);
}

function canonicalAssetUrl(url) {
  return String(url || '').replace(/^https?:\/\/hios-asset\.localhost\//i, 'hios-asset://');
}

function post(type, payload = {}) {
  parent.postMessage({ protocol: PROTOCOL, pluginId: PLUGIN_ID, nodeId, type, payload }, '*');
}

function saveState(patch = {}) {
  state = { ...state, ...patch };
  if (nodeId) {
    post('state', { state });
  }
}

function setStatus(text, isError = false) {
  els.status.textContent = text;
  els.status.style.color = isError ? 'var(--hios-negative, #e05260)' : '';
}

function setLog(text) {
  els.log.textContent = text || '等待任务…';
  els.log.scrollTop = els.log.scrollHeight;
}

function requestHost(type, payload, timeoutMs = 130000) {
  const requestId = makeUuid();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error(`宿主请求超时 (${type})`));
    }, timeoutMs);
    pendingRequests.set(requestId, {
      resolve: value => { clearTimeout(timer); resolve(value); },
      reject: err => { clearTimeout(timer); reject(err); },
    });
    post(type, { ...payload, requestId });
  });
}

function aiRequest(payload, timeoutMs = 130000) {
  if (!state.sessionId) state.sessionId = makeUuid();
  return requestHost('ai-request', { ...payload, sessionId: state.sessionId }, timeoutMs);
}

async function callEngine(toolName, args = {}, timeoutMs = 120000) {
  const res = await aiRequest({
    action: 'extension-tool',
    toolId: `mcp:${PLUGIN_ID}.engine:${toolName}`,
    args,
  }, timeoutMs);
  const text = (res?.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
  if (!text) return res;
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

function modeLabel(mode) {
  return mode === 'white' ? '纯白模' : mode === 'wire' ? '线框' : '材质';
}

function camLabel(cam, sceneName) {
  if (sceneName) return `场景:${sceneName}`;
  const map = { current: '当前视角', iso: '轴测', front: '正视', back: '背视', left: '左视', right: '右视', top: '顶视' };
  return map[cam] || cam;
}

function syncStyleButtons() {
  for (const btn of displayButtons) {
    btn.setAttribute('aria-pressed', String(btn.dataset.mode === state.displayMode));
  }
  els.toggleShadows.setAttribute('aria-pressed', String(Boolean(state.shadows)));
  for (const btn of camButtons) {
    btn.setAttribute('aria-pressed', String(!state.sceneName && btn.dataset.cam === state.cameraPreset));
  }
  els.suScene.value = state.sceneName || '';
}

function renderPreview(capture) {
  if (!capture?.url) {
    els.previewImg.hidden = true;
    els.previewMeta.hidden = true;
    els.empty.hidden = false;
    return;
  }
  const src = resolveImgSrc(capture.url);
  els.previewImg.src = src + (src.includes('?') ? '&' : '?') + 't=' + (capture.createdAt || Date.now());
  els.previewImg.hidden = false;
  els.empty.hidden = true;
  const parts = [
    modeLabel(capture.displayMode || state.displayMode),
    capture.shadows ? '阴影开' : '无阴影',
    camLabel(capture.cameraPreset || state.cameraPreset, capture.sceneName || ''),
  ];
  if (capture.width && capture.height) parts.push(`${capture.width}×${capture.height}`);
  els.previewMeta.textContent = parts.join(' · ');
  els.previewMeta.hidden = false;
}

function getWiredReferences() {
  const raw = inputs?.reference;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list
    .map((item, idx) => {
      if (typeof item === 'string' && item.trim()) return { source: canonicalAssetUrl(item.trim()), name: `画布图 ${idx + 1}`, wired: true };
      if (item && typeof item === 'object' && typeof (item.source || item.url || item.dataUrl) === 'string') {
        return { source: canonicalAssetUrl(item.source || item.url || item.dataUrl), name: item.name || `画布图 ${idx + 1}`, wired: true };
      }
      return null;
    })
    .filter(Boolean);
}

function allReferences() {
  const wired = getWiredReferences();
  const local = Array.isArray(state.references) ? state.references : [];
  return [...wired, ...local].slice(0, MAX_REFERENCES);
}

function renderReferences() {
  const list = allReferences();
  els.referenceCount.textContent = `${list.length} / ${MAX_REFERENCES}`;
  els.references.innerHTML = '';
  for (const ref of list) {
    const card = document.createElement('div');
    card.className = 'reference-card';
    const img = document.createElement('img');
    img.src = resolveImgSrc(ref.source);
    img.alt = ref.name || '参考图';
    const label = document.createElement('span');
    label.textContent = ref.name || '参考图';
    card.append(img, label);
    if (!ref.wired) {
      const rm = document.createElement('button');
      rm.textContent = '×';
      rm.title = '移除参考图';
      rm.addEventListener('click', () => {
        const next = (state.references || []).filter(item => item.source !== ref.source);
        saveState({ references: next });
        renderReferences();
      });
      card.append(rm);
    }
    els.references.append(card);
  }
}

async function compressImageFile(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_DIM / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  let quality = 0.88;
  let blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality));
  while (blob && blob.size > MAX_IMAGE_BYTES && quality > 0.45) {
    quality -= 0.12;
    blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality));
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const stored = await requestHost('file-store', {
    key: `su-ref-${makeUuid()}`,
    purpose: 'draft',
    name: `${(file.name || 'reference').replace(/\.[^.]+$/, '')}.jpg`,
    mime: 'image/jpeg',
    bytes,
  });
  return {
    source: canonicalAssetUrl(stored?.url || stored?.source || ''),
    name: file.name || '参考图.jpg',
  };
}

async function handleFiles(fileList) {
  const files = [...(fileList || [])].filter(f => /^image\/(png|jpeg|webp)$/i.test(f.type));
  if (!files.length) return;
  const remaining = MAX_REFERENCES - allReferences().length;
  if (remaining <= 0) {
    setStatus(`最多添加 ${MAX_REFERENCES} 张参考图`, true);
    return;
  }
  setStatus('正在处理并压缩参考图…');
  const added = [];
  for (const file of files.slice(0, remaining)) {
    try {
      const ref = await compressImageFile(file);
      if (ref.source) added.push(ref);
    } catch (err) {
      setStatus(`参考图上传失败：${err.message}`, true);
    }
  }
  if (added.length) {
    saveState({ references: [...(state.references || []), ...added] });
    renderReferences();
    setStatus(`已添加 ${added.length} 张参考图`);
  }
}

function activeRunningInstance() {
  const running = versionsInfo.running || [];
  if (!running.length) return null;
  if (state.version) {
    const matched = running.find(r => String(r.year) === String(state.version));
    if (matched) return matched;
  }
  return running[0];
}

function updateConnectionUi() {
  const installed = versionsInfo.installed || [];
  const running = versionsInfo.running || [];
  const selectedYear = state.version || versionsInfo.defaultVersion || installed[0]?.year || '';

  els.suVersion.innerHTML = '';
  if (!installed.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '未检测到本机 SketchUp';
    els.suVersion.append(opt);
  } else {
    for (const item of installed) {
      const isRun = running.some(r => String(r.year) === String(item.year));
      const bridgeTag = !item.bridgeInstalled ? '未装桥接' : item.bridgeUpToDate ? `桥接 v${item.bridgeVersion}` : `桥接待升级 v${item.bridgeVersion || '旧'}`;
      const opt = document.createElement('option');
      opt.value = item.year;
      opt.textContent = `SketchUp ${item.year}${isRun ? '（已连接）' : ''} · ${bridgeTag}`;
      els.suVersion.append(opt);
    }
    if (selectedYear && installed.some(i => i.year === selectedYear)) {
      els.suVersion.value = selectedYear;
    }
  }

  const live = activeRunningInstance();
  if (live) {
    const title = live.modelTitle || '未命名模型';
    els.badge.textContent = `✓ SU ${live.year} · ${title}`;
    els.badge.dataset.ready = 'true';
    els.inlineStatus.textContent = `✓ SU ${live.year}`;
    els.inlineStatus.dataset.ready = 'true';
    updateScenesSelect(live.scenes || []);
  } else {
    els.badge.textContent = selectedYear ? `SU ${selectedYear} 未连接` : 'SketchUp 未连接';
    els.badge.dataset.ready = 'false';
    els.inlineStatus.textContent = selectedYear ? `SU ${selectedYear} 未启动` : 'SU 未连接';
    els.inlineStatus.dataset.ready = 'false';
  }
}

function updateScenesSelect(scenes) {
  const prev = state.sceneName || '';
  els.suScene.innerHTML = '<option value="">使用上方预设 / 当前视角</option>';
  for (const name of scenes || []) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = `场景：${name}`;
    els.suScene.append(opt);
  }
  if (prev && (scenes || []).includes(prev)) {
    els.suScene.value = prev;
  } else if (prev) {
    saveState({ sceneName: '' });
  }
}

async function refreshVersions(alsoInspect = true) {
  try {
    versionsInfo = await callEngine('ui_list_versions', {});
    if (!state.version && versionsInfo.defaultVersion) {
      saveState({ version: versionsInfo.defaultVersion });
    }
    updateConnectionUi();
    if (alsoInspect && activeRunningInstance()) {
      await refreshInspect();
    }
  } catch (err) {
    els.badge.textContent = '引擎未就绪';
    els.badge.dataset.ready = 'false';
    setStatus(`检测 SketchUp 失败：${err.message}`, true);
  }
}

async function refreshInspect() {
  const live = activeRunningInstance();
  if (!live) {
    els.stats.textContent = '当前没有运行中的 SketchUp 实例。点击「启动 SU」即可自动连接。';
    return null;
  }
  try {
    const info = await callEngine('ui_inspect', { version: live.year });
    if (info?.ok) {
      const b = info.boundsMm;
      const box = b ? `${b.size[0]}×${b.size[1]}×${b.size[2]} mm` : '空模型';
      els.stats.textContent = `SketchUp ${live.year} · ${info.title || '未命名'} · 单位 ${info.units} · ${info.entityCount} 个顶层对象 · 包围盒 ${box}`;
      if (Array.isArray(info.scenes)) updateScenesSelect(info.scenes);
      return info;
    }
  } catch (err) {
    els.stats.textContent = `读取模型状态失败：${err.message}`;
  }
  return null;
}

async function refreshHistory(updateLatestPreview = false) {
  try {
    const hist = await callEngine('ui_history', {});
    const captures = Array.isArray(hist?.captures) ? hist.captures : [];
    const ops = Array.isArray(hist?.operations) ? hist.operations : [];

    if (updateLatestPreview && captures[0]?.url && captures[0].id !== state.latestCapture?.id) {
      saveState({ latestCapture: captures[0] });
      renderPreview(captures[0]);
    }
    if (hist?.latestModel && !state.latestModel) {
      saveState({ latestModel: hist.latestModel });
    }

    if (!captures.length && !ops.length) {
      els.historyList.innerHTML = '<small>暂无记录</small>';
      return hist;
    }
    els.historyList.innerHTML = '';
    for (const cap of captures.slice(0, 6)) {
      const row = document.createElement('div');
      row.className = 'history-item';
      const label = document.createElement('span');
      label.textContent = `${modeLabel(cap.displayMode)}${cap.shadows ? '+阴影' : ''} · ${camLabel(cap.cameraPreset, cap.sceneName)}`;
      const btn = document.createElement('button');
      btn.textContent = '预览';
      btn.addEventListener('click', () => {
        saveState({ latestCapture: cap });
        renderPreview(cap);
      });
      row.append(label, btn);
      els.historyList.append(row);
    }
    for (const op of ops.slice(0, 5)) {
      const row = document.createElement('div');
      row.className = 'history-item';
      const label = document.createElement('span');
      label.textContent = `⚙ ${op.operationName || 'Ruby 操作'}（${op.entityCount ?? 0} 对象）`;
      row.append(label);
      els.historyList.append(row);
    }
    return hist;
  } catch {
    return null;
  }
}

async function loadDshModels() {
  try {
    const catalog = await aiRequest({ action: 'extension-catalog' }, 30000);
    const groups = Array.isArray(catalog?.groups) ? catalog.groups : [];
    els.model.innerHTML = '<option value="">DSH 默认模型</option>';
    for (const g of groups) {
      const og = document.createElement('optgroup');
      og.label = g.name || g.id;
      for (const m of g.models || []) {
        const opt = document.createElement('option');
        opt.value = `${g.id}::${m.id}`;
        opt.textContent = m.name || m.id;
        og.append(opt);
      }
      if (og.children.length) els.model.append(og);
    }
    if (state.modelKey) {
      els.model.value = state.modelKey;
    } else if (catalog?.default?.provider && catalog?.default?.model) {
      const defKey = `${catalog.default.provider}::${catalog.default.model}`;
      if ([...els.model.options].some(o => o.value === defKey)) {
        els.model.value = defKey;
      }
    }
  } catch (err) {
    setStatus(`读取 DSH 模型列表失败：${err.message}`, true);
  }
}

function selectedNativeModel() {
  const raw = els.model.value || state.modelKey || '';
  if (!raw.includes('::')) return undefined;
  const idx = raw.indexOf('::');
  const provider = raw.slice(0, idx);
  const model = raw.slice(idx + 2);
  return provider && model ? { provider, model } : undefined;
}

async function ensureSketchupReady() {
  await refreshVersions(false);
  let live = activeRunningInstance();
  if (live) return live;
  const targetVersion = state.version || versionsInfo.defaultVersion || versionsInfo.installed?.[0]?.year;
  if (!targetVersion) throw new Error('未在本机检测到 SketchUp 安装');
  setStatus(`正在启动 SketchUp ${targetVersion} 并等待桥接连接…`);
  const launched = await callEngine('ui_launch', { version: targetVersion, waitSeconds: 45 }, 60000);
  await refreshVersions(true);
  live = activeRunningInstance();
  if (!live) {
    throw new Error(launched?.note || `SketchUp ${targetVersion} 尚未连接桥接，请进入建模界面后点刷新重试`);
  }
  return live;
}

async function captureStyledView({ silent = false, autoLaunch = false } = {}) {
  const live = autoLaunch ? await ensureSketchupReady() : activeRunningInstance();
  if (!live) {
    if (!silent) setStatus('SketchUp 尚未连接，请先在「工具」中启动 SketchUp。', true);
    return null;
  }
  if (!silent) {
    setStatus(`正在抓取 ${modeLabel(state.displayMode)}${state.shadows ? ' + 阴影' : ''} 视口图…`);
  }
  const cap = await callEngine('ui_capture_view', {
    version: live.year,
    displayMode: state.displayMode,
    shadows: Boolean(state.shadows),
    cameraPreset: state.cameraPreset || 'current',
    sceneName: state.sceneName || '',
    zoomExtents: state.cameraPreset !== 'current' && !state.sceneName,
    width: 1280,
    height: 960,
  }, 60000);
  if (cap?.url) {
    saveState({ latestCapture: cap });
    renderPreview(cap);
    void refreshHistory(false);
    if (!silent) {
      setStatus(`已抓取 ${modeLabel(cap.displayMode)}${cap.shadows ? ' · 阴影开' : ''} 视口图，可点击「↗ 输出底图」传给下游节点。`);
    }
    return cap;
  }
  throw new Error(cap?.error || '视口抓图未返回有效文件');
}

function buildOutputPayload(capture, modelFile) {
  const outputs = [];
  if (capture?.url) {
    outputs.push({
      kind: 'image',
      portId: 'preview',
      source: canonicalAssetUrl(capture.url),
      name: `sketchup-${capture.displayMode || 'material'}${capture.shadows ? '-shadows' : ''}.png`,
      mime: 'image/png',
      width: capture.width,
      height: capture.height,
    });
  }
  if (modelFile?.url) {
    outputs.push({
      kind: 'file',
      portId: 'model',
      source: canonicalAssetUrl(modelFile.url),
      name: modelFile.name || `sketchup-model.${modelFile.format || 'skp'}`,
      mime: 'application/octet-stream',
    });
  }
  return outputs;
}

function publishOutputs(capture, modelFile, runId = '') {
  const outputs = buildOutputPayload(capture, modelFile);
  if (!outputs.length) return false;
  if (runId) {
    post('output-batch', { runId, outputs });
  } else {
    for (const item of outputs) {
      post('output', item);
    }
  }
  return true;
}

function setBusy(next) {
  busy = next;
  els.buildBtn.disabled = next;
  els.stopBtn.disabled = !next;
  els.captureNow.disabled = next;
  els.pushPreview.disabled = next;
}

async function runModelingTask({ runId = '', effectivePrompt = '' } = {}) {
  if (busy) return;
  stopRequested = false;
  activeRunId = runId;
  setBusy(true);

  try {
    const promptText = String(effectivePrompt ?? els.prompt.value ?? '').trim();
    const refs = allReferences().map(r => ({ source: r.source, name: r.name }));

    // Fast path: empty prompt on canvas run -> capture styled base image & output immediately!
    if (!promptText && !refs.length) {
      const cap = await captureStyledView({ autoLaunch: true });
      if (!cap) throw new Error('未能获取 SketchUp 视口底图');
      publishOutputs(cap, state.latestModel, runId);
      setStatus(`已输出 ${modeLabel(cap.displayMode)}${cap.shadows ? ' + 阴影' : ''} 底图至下游节点。`);
      return;
    }

    const live = await ensureSketchupReady();
    const fullPrompt = [
      `目标 SketchUp 版本：SketchUp ${live.year}（PID ${live.pid}）。`,
      `当前用户偏好的底图样式：displayMode="${state.displayMode}"（${modeLabel(state.displayMode)}），shadows=${Boolean(state.shadows)}${state.sceneName ? `，sceneName="${state.sceneName}"` : `，cameraPreset="${state.cameraPreset}"`}。最终验收截图请按此样式输出。`,
      `用户需求：\n${promptText || '请根据参考图片在 SketchUp 中建模并验收。'}`,
    ].join('\n');

    setStatus(`DSH 正在驱动 SketchUp ${live.year} 建模…`);
    setLog('正在启动 DSH 会话…');

    await aiRequest({
      action: 'extension-start',
      prompt: fullPrompt,
      nativeModel: selectedNativeModel(),
      ...(refs.length ? { images: refs } : {}),
    }, 60000);

    let pollCount = 0;
    let finalText = '';
    while (!stopRequested) {
      await new Promise(r => setTimeout(r, 1200));
      if (stopRequested) break;
      const poll = await aiRequest({ action: 'extension-poll' }, 30000);
      const processText = poll?.runtime?.processText || '';
      const latestText = poll?.text || '';
      const combined = [processText, latestText].filter(Boolean).join('\n\n');
      if (combined) setLog(combined);

      pollCount += 1;
      if (pollCount % 3 === 0) {
        void refreshHistory(true);
      }

      if (poll?.done) {
        if (poll.error) throw new Error(poll.error);
        finalText = latestText;
        break;
      }
    }

    if (stopRequested) {
      setStatus('已停止当前 SketchUp 建模任务。');
      if (runId) post('error', { message: '用户已取消 SketchUp 建模任务' });
      return;
    }

    // Refresh model state & capture styled final preview matching user's toolbar settings
    await refreshInspect();
    const finalCap = await captureStyledView({ silent: true, autoLaunch: false });
    let savedModel = state.latestModel;
    try {
      const exp = await callEngine('ui_export_model', { version: live.year, format: 'skp' }, 60000);
      if (exp?.file?.url) {
        savedModel = exp.file;
        saveState({ latestModel: savedModel });
      }
    } catch {
      // Non-fatal if model is empty or save skipped
    }

    publishOutputs(finalCap || state.latestCapture, savedModel, runId);
    const summaryLine = (finalText || '').split(/\r?\n/).find(l => l.trim()) || 'SketchUp 建模完成，已输出底图与模型。';
    setStatus(summaryLine.slice(0, 140));
  } catch (err) {
    const msg = err?.message || String(err);
    setStatus(`建模失败：${msg}`, true);
    setLog(`${els.log.textContent}\n\n[错误] ${msg}`);
    if (runId) post('error', { message: msg });
  } finally {
    activeRunId = '';
    setBusy(false);
  }
}

async function stopCurrentTask() {
  stopRequested = true;
  setStatus('正在停止 DSH 任务…');
  try {
    await aiRequest({ action: 'extension-stop' }, 15000);
  } catch { /* ignore */ }
  setBusy(false);
}

// Event Listeners
els.expand.addEventListener('click', () => {
  post(expanded ? 'view-close' : 'view-open', {});
});

els.toolsToggle.addEventListener('click', () => {
  const open = els.tools.hidden;
  els.tools.hidden = !open;
  els.toolsToggle.setAttribute('aria-expanded', String(open));
  if (open) {
    void refreshVersions(true);
    void refreshHistory(false);
  }
});
els.toolsClose.addEventListener('click', () => {
  els.tools.hidden = true;
  els.toolsToggle.setAttribute('aria-expanded', 'false');
});

for (const btn of displayButtons) {
  btn.addEventListener('click', async () => {
    saveState({ displayMode: btn.dataset.mode });
    syncStyleButtons();
    if (activeRunningInstance() && !busy) {
      try { await captureStyledView(); } catch (err) { setStatus(`切换样式抓图失败：${err.message}`, true); }
    }
  });
}

els.toggleShadows.addEventListener('click', async () => {
  saveState({ shadows: !state.shadows });
  syncStyleButtons();
  if (activeRunningInstance() && !busy) {
    try { await captureStyledView(); } catch (err) { setStatus(`切换阴影抓图失败：${err.message}`, true); }
  }
});

for (const btn of camButtons) {
  btn.addEventListener('click', async () => {
    saveState({ cameraPreset: btn.dataset.cam, sceneName: '' });
    syncStyleButtons();
    if (activeRunningInstance() && !busy) {
      try { await captureStyledView(); } catch (err) { setStatus(`切换视角抓图失败：${err.message}`, true); }
    }
  });
}

els.suScene.addEventListener('change', async () => {
  saveState({ sceneName: els.suScene.value || '' });
  syncStyleButtons();
  if (activeRunningInstance() && !busy) {
    try { await captureStyledView(); } catch (err) { setStatus(`切换场景抓图失败：${err.message}`, true); }
  }
});

els.captureNow.addEventListener('click', async () => {
  if (busy) return;
  try {
    await captureStyledView({ autoLaunch: false });
  } catch (err) {
    setStatus(`抓图失败：${err.message}`, true);
  }
});

els.pushPreview.addEventListener('click', async () => {
  if (busy) return;
  try {
    const cap = activeRunningInstance() ? await captureStyledView({ silent: true }) : state.latestCapture;
    if (!cap?.url) {
      setStatus('还没有可输出的视口图，请先启动 SketchUp 并抓图。', true);
      return;
    }
    publishOutputs(cap, state.latestModel, '');
    setStatus(`已将 ${modeLabel(cap.displayMode)}${cap.shadows ? ' + 阴影' : ''} 底图推送至下游节点！`);
  } catch (err) {
    setStatus(`输出底图失败：${err.message}`, true);
  }
});

els.suVersion.addEventListener('change', async () => {
  const year = els.suVersion.value;
  if (!year) return;
  saveState({ version: year });
  try {
    const res = await callEngine('ui_select_version', { version: year, installBridge: true });
    setStatus(`已切换目标版本为 SketchUp ${res.defaultVersion}（桥接 v${res.bridgeVersion}）。`);
    await refreshVersions(true);
  } catch (err) {
    setStatus(`切换版本失败：${err.message}`, true);
  }
});

els.suLaunch.addEventListener('click', async () => {
  try {
    const live = await ensureSketchupReady();
    setStatus(`已连接 SketchUp ${live.year}（PID ${live.pid}）。`);
    await captureStyledView({ silent: true });
  } catch (err) {
    setStatus(err.message, true);
  }
});

els.suBridge.addEventListener('click', async () => {
  try {
    const year = els.suVersion.value || state.version || '';
    const res = await callEngine('ui_install_bridge', { version: year });
    const years = (res?.installed || []).map(i => `SketchUp ${i.year} (v${i.bridgeVersion})`).join('、');
    setStatus(`已安装/升级桥接：${years}。若 SketchUp 正在运行，请重启一次使其生效。`);
    await refreshVersions(false);
  } catch (err) {
    setStatus(`安装桥接失败：${err.message}`, true);
  }
});

els.suRefresh.addEventListener('click', () => void refreshVersions(true));

els.undo.addEventListener('click', async () => {
  const live = activeRunningInstance();
  if (!live) { setStatus('SketchUp 未连接', true); return; }
  try {
    await callEngine('ui_undo', { version: live.year });
    await refreshInspect();
    await captureStyledView({ silent: true });
    setStatus('已在 SketchUp 中撤销上一步操作。');
  } catch (err) {
    setStatus(`撤销失败：${err.message}`, true);
  }
});

els.exportBtn.addEventListener('click', async () => {
  const live = activeRunningInstance();
  if (!live) { setStatus('SketchUp 未连接', true); return; }
  const format = els.format.value || 'skp';
  setStatus(`正在导出 ${format.toUpperCase()} 模型…`);
  try {
    const res = await callEngine('ui_export_model', { version: live.year, format }, 90000);
    if (res?.file?.path) {
      saveState({ latestModel: res.file });
      post('output', {
        kind: 'file',
        portId: 'model',
        source: canonicalAssetUrl(res.file.url),
        name: res.file.name,
        mime: 'application/octet-stream',
      });
      await aiRequest({ action: 'extension-file', operation: 'save', path: res.file.path }, 60000);
      setStatus(`已导出 ${format.toUpperCase()} 并同步至模型输出端口。`);
    } else {
      setStatus(`模型导出完成。`);
    }
  } catch (err) {
    setStatus(`导出失败：${err.message}`, true);
  }
});

els.syncDsh.addEventListener('click', async () => {
  try {
    const res = await callEngine('ui_sync_dsh', {});
    const count = res?.synced?.length || 0;
    setStatus(count ? '已将 SketchUp MCP 同步至首页 DSH，重启或新开 DSH 会话后即可使用。' : '未检测到本地 DSH 配置文件。');
  } catch (err) {
    setStatus(`同步首页 DSH 失败：${err.message}`, true);
  }
});

els.prompt.addEventListener('input', () => {
  saveState({ prompt: els.prompt.value });
});

els.model.addEventListener('change', () => {
  saveState({ modelKey: els.model.value });
});

els.refreshModels.addEventListener('click', () => void loadDshModels());

els.buildBtn.addEventListener('click', () => {
  const wiredPrompt = typeof inputs?.prompt === 'string' ? inputs.prompt : '';
  void runModelingTask({ runId: '', effectivePrompt: els.prompt.value.trim() || wiredPrompt });
});

els.stopBtn.addEventListener('click', () => void stopCurrentTask());

els.addReference.addEventListener('click', () => els.referenceFiles.click());
els.referenceFiles.addEventListener('change', () => {
  void handleFiles(els.referenceFiles.files);
  els.referenceFiles.value = '';
});
els.referenceZone.addEventListener('dragover', e => {
  e.preventDefault();
  els.referenceZone.classList.add('dragging');
});
els.referenceZone.addEventListener('dragleave', () => els.referenceZone.classList.remove('dragging'));
els.referenceZone.addEventListener('drop', e => {
  e.preventDefault();
  els.referenceZone.classList.remove('dragging');
  void handleFiles(e.dataTransfer?.files);
});

// Host Message Bridge
window.addEventListener('message', event => {
  const msg = event.data;
  if (!msg || msg.protocol !== PROTOCOL) return;
  const { type, payload = {} } = msg;

  if (type === 'ai-result' || type === 'file-store-result') {
    const pending = pendingRequests.get(payload.requestId);
    if (!pending) return;
    pendingRequests.delete(payload.requestId);
    if (payload.error) pending.reject(new Error(payload.error));
    else pending.resolve(payload.result);
    return;
  }

  if (type === 'init') {
    const firstInit = !nodeId;
    nodeId = payload.nodeId || nodeId;
    expanded = Boolean(payload.view?.expanded);
    els.expand.textContent = expanded ? '✕ 还原' : '⛶ 放大';
    inputs = payload.inputs || {};

    if (payload.state && typeof payload.state === 'object') {
      state = { ...state, ...payload.state };
    }
    if (!state.sessionId) {
      saveState({ sessionId: makeUuid() });
    }
    if (els.prompt.value !== (state.prompt || '')) {
      els.prompt.value = state.prompt || '';
    }
    syncStyleButtons();
    renderReferences();
    renderPreview(state.latestCapture);

    if (firstInit) {
      post('loaded', {});
      void refreshVersions(true);
      void loadDshModels();
      void refreshHistory(false);
    }
    return;
  }

  if (type === 'run') {
    inputs = payload.inputs || inputs;
    renderReferences();
    const wiredPrompt = typeof inputs?.prompt === 'string' ? inputs.prompt : '';
    const effective = (els.prompt.value || state.prompt || '').trim() || wiredPrompt.trim();
    void runModelingTask({ runId: payload.runId || '', effectivePrompt: effective });
    return;
  }

  if (type === 'cancel') {
    if (!activeRunId || !payload.runId || payload.runId === activeRunId) {
      void stopCurrentTask();
    }
  }
});

post('ready', {});
