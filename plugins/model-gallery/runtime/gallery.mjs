import { KINDS, LABELS, ANGLES, INDEX, defaults, normalizeCatalog, filterCatalog, groupPoses, groupKey, outputKinds, canonicalUrl, renderUrl } from './gallery-core.mjs';

const P = 'hios-plugin-node/v1', $ = id => document.getElementById(id);
const pending = new Map(), libraries = new Map(), loadingLibraries = new Map();
let nodeId = '', pluginId = 'model-gallery', hostOrigin = '*', initialized = false, expanded = false, features = {};
let state = {}, draft = {}, kind = 'portrait', preview = null, previewAbort, previewUrl = '', previewSerial = 0, busy = false, runSerial = 0;
let shown = 60, results = [], grants = [], toastTimer, searchTimer;
const filters = Object.fromEntries(KINDS.map(k => [k, defaults(k)]));
const scrolls = Object.fromEntries(KINDS.map(k => [k, 0]));
const pageSizes = Object.fromEntries(KINDS.map(k => [k, 60]));
const stored = (key, fallback) => { try { return JSON.parse(localStorage.getItem(`model-gallery.${key}`)) ?? fallback; } catch { return fallback; } };
const save = (key, value) => { try { localStorage.setItem(`model-gallery.${key}`, JSON.stringify(value)); } catch { notify('本地偏好保存失败，当前选择仍可使用'); } };
const favorites = Object.fromEntries(KINDS.map(k => [k, new Set(stored(`favorites.${k}`, []))]));
const recent = Object.fromEntries(KINDS.map(k => [k, stored(`recent.${k}`, [])]));
const clone = value => JSON.parse(JSON.stringify(value));
function normalized(value) { return { schema: 1, selections: {}, libraries: {}, enabled: { portrait: true, costume: true, pose: true }, addToCanvas: false, ...clone(value || {}) }; }
function post(type, payload = {}) { parent.postMessage({ protocol: P, nodeId, pluginId, type, payload }, hostOrigin); }
function notify(message) { clearTimeout(toastTimer); $('status').textContent = message; toastTimer = setTimeout(() => { $('status').textContent = ''; }, 7000); }
function request(type, payload = {}) {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID(), timer = setTimeout(() => { pending.delete(requestId); reject(Error('宿主请求超时，请重试')); }, 90000);
    pending.set(requestId, { resolve, reject, timer }); post(type, { ...payload, requestId });
  });
}
function element(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
function button(text, fn, className = 'hios-control') { const node = element('button', className, text); node.type = 'button'; node.onclick = fn; return node; }
function image(source, alt) { const img = element('img'); img.src = renderUrl(source); img.alt = alt; img.loading = 'lazy'; img.decoding = 'async'; img.onerror = () => { img.alt = '图片不可用'; }; return img; }
function commit(value) { state = normalized(value); post('state', { state }); renderCompact(); }
function open(k = 'portrait') {
  if (!features.expandedView) { notify('请更新 HIOS：需要插件大窗口和批量输出支持'); return; }
  post('view-open', { initialKind: k });
}

function renderCompact() {
  $('slots').replaceChildren();
  for (const k of KINDS) {
    const item = state.selections[k], slot = element('section', 'slot');
    const pick = button('', () => open(k), 'slot-image'); pick.setAttribute('aria-label', `选择${LABELS[k]}`);
    if (item?.thumbUrl) pick.append(image(item.thumbUrl, item.title));
    else { const empty = element('span', 'placeholder'); empty.append(element('b', '', '+'), element('span', '', `选择${LABELS[k]}`)); pick.append(empty); }
    const row = element('div', 'slot-title'), label = element('label'), check = element('input'); check.type = 'checkbox'; check.checked = state.enabled[k] !== false; check.disabled = !item;
    check.onchange = () => commit({ ...state, enabled: { ...state.enabled, [k]: check.checked } });
    label.append(check, document.createTextNode(LABELS[k])); row.append(label);
    if (item) row.append(button('清空', () => { const next = clone(state); delete next.selections[k]; commit(next); }, 'text-button'));
    slot.append(pick, row, element('div', 'slot-caption', item ? `${item.id}${item.angle ? ' · ' + item.angle : ''}` : '尚未选择')); $('slots').append(slot);
  }
  $('output-count').textContent = `本次输出 ${outputKinds(state).length} 张独立图片`;
  $('add-canvas').checked = Boolean(state.addToCanvas);
}

async function readCatalog(k, directory) {
  for (const prefix of ['', 'library/']) {
    const base = renderUrl(directory.url) + prefix;
    const response = await fetch(base + 'data/' + INDEX[k]);
    if (!response.ok) continue;
    const rows = normalizeCatalog(k, await response.json());
    return { id: directory.id, name: directory.name, base, rows, byId: new Map(rows.map(row => [row.id, row])), groups: k === 'pose' ? groupPoses(rows) : new Map() };
  }
  throw Error(`目录中未找到 data/${INDEX[k]}，请选择正确的${LABELS[k]}仓库或 library 目录`);
}
async function ensureLibrary(k, selectionState = expanded ? draft : state) {
  let id = selectionState.libraries[k];
  if (!id) {
    const result = await request('resource-directory', { action: 'list' });
    id = result.directories?.find(g => g.id === `managed:${k}`)?.id;
    if (id) selectionState.libraries[k] = id;
  }
  if (!id) throw Error(`请先关联${LABELS[k]}图库`);
  if (libraries.get(k)?.id === id) return libraries.get(k);
  const key = `${k}:${id}`;
  if (!loadingLibraries.has(key)) loadingLibraries.set(key, (async () => {
    const result = await request('resource-directory', { action: 'restore', id });
    const lib = await readCatalog(k, result.directory); libraries.set(k, lib); return lib;
  })().finally(() => loadingLibraries.delete(key)));
  return loadingLibraries.get(key);
}
async function switchKind(next) {
  scrolls[kind] = $('scroll').scrollTop; pageSizes[kind] = shown; kind = next; preview = null; shown = pageSizes[kind];
  clearPreview(); renderTabs(); $('search').value = filters[kind].q; renderFilters(); renderDraft();
  $('grid').replaceChildren(); $('empty').hidden = true; $('more').hidden = true; $('loading').textContent = '正在读取索引…';
  const current = kind;
  try { await ensureLibrary(current); if (kind === current) { renderFilters(); renderGrid(); $('scroll').scrollTop = scrolls[current]; } }
  catch (error) { if (kind === current) { $('count').textContent = ''; $('empty').hidden = false; $('empty').replaceChildren(element('strong', '', error.message), button('关联本地图库', showSettings)); } }
  finally { if (kind === current) $('loading').textContent = ''; }
}
function renderTabs() {
  $('tabs').replaceChildren(...KINDS.map(k => { const tab = button(LABELS[k], () => switchKind(k), 'tab'); tab.setAttribute('role', 'tab'); tab.setAttribute('aria-selected', String(k === kind)); return tab; }));
}
function selectFilter(label, key, values) {
  const field = element('label', 'filter-field'), select = element('select');
  select.setAttribute('aria-label', label);
  for (const [value, title] of values) { const option = element('option', '', title); option.value = value; select.append(option); }
  select.value = filters[kind][key]; select.onchange = () => { filters[kind][key] = select.value; shown = 60; renderGrid(); };
  field.append(element('span', '', label), select); return field;
}
function checkFilter(label, key) {
  const field = element('label', 'check-filter'), input = element('input'); input.type = 'checkbox'; input.checked = filters[kind][key];
  input.onchange = () => { filters[kind][key] = input.checked; shown = 60; renderGrid(); };
  field.append(input, document.createTextNode(label)); return field;
}
function renderFilters() {
  const lib = libraries.get(kind), rows = lib?.rows || [], area = $('filters'); area.replaceChildren();
  const unique = key => [...new Set(rows.map(row => row[key]).filter(Boolean))].map(value => [value, value]);
  if (kind === 'portrait') {
    area.append(selectFilter('参考类型', 'section', [['face','正脸参考'],['styling','造型参考'],['all','全部人像']]),
      selectFilter('发型长度', 'hair', [['','全部发型'], ...Object.entries(globalThis.PortraitCore.hairLabels)]),
      selectFilter('发型风格', 'style', [['','全部风格'], ...new Map(rows.filter(row => row.style).map(row => [row.style, row.style_zh || row.style])).entries()]));
  } else {
    if (kind === 'pose') area.append(selectFilter('体系', 'system', [['','全部体系'], ...unique('system')]));
    area.append(selectFilter('分类', 'category', [['','全部分类'], ...unique('category')]));
    if (kind === 'pose') area.append(selectFilter('视角', 'angle', [['','全部视角'], ...ANGLES.map(a => [a,a])]), selectFilter('浏览方式', 'view', [['group','按姿势分组'],['single','逐张浏览']]), checkFilter('只看单人姿势', 'singleOnly'));
  }
  area.append(checkFilter('我的收藏', 'favorites'), checkFilter('最近使用', 'recent'));
  $('library-info').textContent = lib ? `${lib.name} · ${lib.rows.length.toLocaleString()} 张${kind === 'pose' ? ` / ${lib.groups.size} 组` : ''}\n本地离线图库` : '尚未关联本地图库';
}
function renderGrid(preserve = false) {
  const lib = libraries.get(kind); if (!lib) return;
  const top = preserve ? $('scroll').scrollTop : 0;
  results = filterCatalog(kind, lib.rows, filters[kind], favorites[kind], recent[kind]);
  $('count').textContent = `${results.length.toLocaleString()} ${kind === 'pose' && filters[kind].view === 'group' ? '组姿势' : '张参考'} · 已显示 ${Math.min(shown, results.length)}`;
  $('grid').replaceChildren(...results.slice(0, shown).map(item => {
    const card = button('', () => showPreview(item), 'card'); card.dataset.id = item.id; card.setAttribute('aria-label', `预览 ${item.title} ${item.angle}`);
    card.classList.toggle('active', preview?.id === item.id); card.classList.toggle('chosen', draft.selections[kind]?.id === item.id || (kind === 'pose' && item.angles?.some(a => a.id === draft.selections.pose?.id)));
    card.append(image(lib.base + item.thumb, item.title));
    const meta = element('span', 'card-body'); meta.append(element('strong', '', item.title), element('small', '', kind === 'pose' ? `${item.number} · ${item.angle} · ${item.angles?.length || 1} 视角` : item.id)); card.append(meta);
    card.ondblclick = () => { showPreview(item); void usePreview(); }; return card;
  }));
  $('empty').hidden = results.length > 0;
  if (!results.length) $('empty').replaceChildren(element('strong', '', '没有找到匹配素材'), element('span', '', '换个关键词，或减少筛选条件。'), button('清除筛选', resetFilters));
  $('more').hidden = shown >= results.length; $('scroll').scrollTop = top;
}
function clearPreview() {
  previewAbort?.abort(); previewSerial++; if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = '';
  $('preview-stage').replaceChildren(element('span', '', '点击图片，查看细节')); $('preview-meta').replaceChildren(); $('angles').replaceChildren(); $('favorite').disabled = true; $('use').disabled = true;
}
async function showPreview(item) {
  clearPreview(); preview = item; const serial = previewSerial, k = kind, lib = libraries.get(k);
  $('use').disabled = false; $('favorite').disabled = false; $('favorite').textContent = favorites[k].has(item.id) ? '★ 已收藏' : '☆ 收藏';
  $('preview-meta').append(element('strong', '', item.title), element('small', '', `${item.id}${item.angle ? ' · ' + item.angle : ''}`));
  const dimensions = element('small', '', '正在读取预览…'); $('preview-meta').append(dimensions);
  const tags = element('div', 'tags'); for (const tag of item.tags) tags.append(button(tag, () => { filters[kind].q = tag; $('search').value = tag; shown = 60; renderGrid(); }, '')); $('preview-meta').append(tags);
  if (k === 'portrait' && item.section === 'styling') $('preview-meta').append(element('small', '', '造型参考是独立素材，不与正脸图配对。'));
  if (k === 'pose') {
    const group = lib.groups.get(groupKey(item)) || [];
    for (const angle of ANGLES) { const row = group.find(p => p.angle === angle), b = button(angle, () => row && showPreview(row), row?.id === item.id ? 'active' : ''); b.disabled = !row; $('angles').append(b); }
  }
  document.querySelectorAll('.card').forEach(card => card.classList.toggle('active', card.dataset.id === item.id));
  $('preview-stage').replaceChildren(image(lib.base + item.thumb, item.title));
  previewAbort = new AbortController();
  try {
    const response = await fetch(lib.base + item.preview, { signal: previewAbort.signal }); if (!response.ok) throw Error('预览图缺失');
    const blob = await response.blob(); if (serial !== previewSerial || k !== kind) return;
    previewUrl = URL.createObjectURL(blob); const img = image(previewUrl, item.title); img.loading = 'eager';
    img.onload = () => { if (serial === previewSerial) dimensions.textContent = `${img.naturalWidth} × ${img.naturalHeight}${k === 'costume' ? ' · 预览图（输出使用 PNG 原图）' : ' · PNG 原图'}`; };
    $('preview-stage').replaceChildren(img);
  } catch (error) { if (serial === previewSerial && error.name !== 'AbortError') dimensions.textContent = '大图无法读取，请检查图库完整性；仍可查看缩略图。'; }
}
async function storeImage(k, row, lib, thumb = false) {
  const path = thumb ? row.thumb : row.full, response = await fetch(lib.base + path);
  if (!response.ok) throw Error(`${LABELS[k]}${thumb ? '缩略图' : '原图'}缺失：${path}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 64 * 1024 * 1024) throw Error('图片为空或超过 64 MiB');
  if (!thumb && ![137,80,78,71,13,10,26,10].every((byte, i) => bytes[i] === byte)) throw Error('原图不是有效的 PNG 文件');
  const mime = path.endsWith('.webp') ? 'image/webp' : /\.jpe?g$/.test(path) ? 'image/jpeg' : 'image/png';
  const bitmap = await createImageBitmap(new Blob([bytes], { type: mime })); const width = bitmap.width, height = bitmap.height; bitmap.close();
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${lib.id}:${k}:${path}`)))].map(b => b.toString(16).padStart(2,'0')).join('');
  const result = await request('file-store', { key: hash, name: `${LABELS[k]}-${row.id}${thumb ? '-thumb' : ''}.${path.split('.').pop()}`, mime, bytes, ...(thumb ? { purpose: 'draft' } : {}) });
  return { source: canonicalUrl(result.url), width, height, mime };
}
async function usePreview() {
  if (!preview || busy) return;
  const item = preview, k = kind, lib = libraries.get(k); busy = true; $('use').disabled = true; $('apply').disabled = true;
  try {
    const thumb = await storeImage(k, item, lib, true);
    if (draft.libraries[k] !== lib.id) return;
    draft.selections[k] = { id: item.id, title: item.title, angle: item.angle, thumbUrl: thumb.source, libraryId: lib.id };
    draft.enabled[k] = true; renderDraft(); if (kind === k) renderGrid(true); notify(`已选用${LABELS[k]}，点击「应用选择」写回节点`);
  } catch (error) { notify(error.message); }
  finally { busy = false; $('use').disabled = !preview; $('apply').disabled = false; }
}
function renderDraft() {
  $('draft-slots').replaceChildren(...KINDS.map(k => {
    const item = draft.selections[k], row = element('div', 'draft-slot'), pick = button('', () => switchKind(k), ''); pick.setAttribute('aria-label', `切换到${LABELS[k]}库`);
    if (item?.thumbUrl) pick.append(image(item.thumbUrl, item.title)); else pick.textContent = '+';
    const text = element('div'); text.append(element('strong', '', LABELS[k]), element('small', '', item ? item.id : '尚未选择'));
    if (item) text.append(button('清空', () => { delete draft.selections[k]; renderDraft(); renderGrid(true); }, 'text-button'));
    row.append(pick, text); return row;
  }));
}
async function showSettings() {
  try { const result = await request('resource-directory', { action: 'list' }); grants = result.directories || []; } catch (error) { notify(error.message); }
  renderSettings(); if (!$('settings').open) $('settings').showModal();
}
function renderSettings() {
  $('library-settings').replaceChildren(...KINDS.map(k => {
    const section = element('section', 'library-setting'); section.append(element('strong', '', `${LABELS[k]}图库`));
    const choose = button('关联目录…', async () => {
      choose.disabled = true;
      try { const result = await request('resource-directory', { action: 'choose' }); if (result.directory) await bindLibrary(k, result.directory); }
      catch (error) { notify(error.message); }
      finally { choose.disabled = false; }
    }); section.append(choose);
    const select = element('select'); select.setAttribute('aria-label', `${LABELS[k]}已授权目录`); const placeholder = element('option', '', '选择已关联的目录…'); placeholder.value = ''; select.append(placeholder);
    for (const grant of grants) { const option = element('option', '', grant.name); option.value = grant.id; select.append(option); }
    select.value = draft.libraries[k] || ''; select.onchange = async () => {
      if (!select.value) return;
      select.disabled = true;
      try { const result = await request('resource-directory', { action: 'restore', id: select.value }); await bindLibrary(k, result.directory); } catch (error) { notify(error.message); } finally { select.disabled = false; }
    }; section.append(select);
    const lib = libraries.get(k); section.append(element('small', '', lib && lib.id === draft.libraries[k] ? `${lib.name} · 已读取 ${lib.rows.length} 张索引` : draft.libraries[k] ? '已关联，等待读取或目录已移动' : '尚未关联'));
    return section;
  }));
}
async function bindLibrary(k, directory) {
  const lib = await readCatalog(k, directory); libraries.set(k, lib);
  if (draft.libraries[k] !== lib.id) delete draft.selections[k];
  draft.libraries[k] = lib.id;
  if (!grants.some(g => g.id === directory.id)) grants.push(directory);
  renderSettings(); renderDraft(); if (kind === k) await switchKind(k);
  notify(`${LABELS[k]}图库已关联，读取 ${lib.rows.length} 张索引`);
}
async function run(payload) {
  const serial = ++runSerial, snapshot = normalized(payload.state || state), kinds = outputKinds(snapshot);
  if (!features.outputBatch || !payload.runId) { post('error', { message: '请更新 HIOS，以使用多端口批量图片输出' }); return; }
  if (!kinds.length) { post('error', { message: '请至少选择并勾选一张参考图' }); return; }
  notify(`正在准备 ${kinds.length} 张原图…`);
  try {
    const outputs = [];
    for (const k of kinds) {
      const lib = await ensureLibrary(k, snapshot), selected = snapshot.selections[k];
      if (serial !== runSerial) return;
      if (selected.libraryId !== lib.id) throw Error(`${LABELS[k]}已更换图库，请重新选择图片`);
      const row = lib.byId.get(selected.id); if (!row) throw Error(`${LABELS[k]} ID 已不在当前索引中：${selected.id}`);
      const result = await storeImage(k, row, lib);
      if (serial !== runSerial) return;
      outputs.push({ kind: 'image', portId: k, ...result, name: `${LABELS[k]}-${row.id}.png`, metadata: { role: k, originalId: row.id, angle: row.angle, libraryId: lib.id, addToCanvas: Boolean(snapshot.addToCanvas) } });
    }
    post('output-batch', { runId: payload.runId, outputs }); notify(`已提交 ${outputs.length} 张原图，等待宿主保存`);
  } catch (error) { if (serial === runSerial) { post('error', { runId: payload.runId, message: error.message }); notify(error.message); } }
}
function resetFilters() { filters[kind] = defaults(kind); $('search').value = ''; shown = 60; renderFilters(); renderGrid(); }
$('open').onclick = () => open();
$('add-canvas').onchange = event => commit({ ...state, addToCanvas: event.target.checked });
$('settings-toggle').onclick = showSettings;
$('settings-close').onclick = () => $('settings').close();
$('source-info').onclick = () => $('notices').showModal();
$('notices-close').onclick = () => $('notices').close();
$('reset').onclick = resetFilters;
$('search').oninput = event => { const k = kind, q = event.target.value; clearTimeout(searchTimer); searchTimer = setTimeout(() => { filters[k].q = q; if (k === kind) { shown = 60; renderGrid(); } }, 120); };
$('more').onclick = () => { shown += 60; renderGrid(true); };
$('favorite').onclick = () => { if (!preview) return; const set = favorites[kind]; if (set.has(preview.id)) set.delete(preview.id); else set.add(preview.id); save(`favorites.${kind}`, [...set]); $('favorite').textContent = set.has(preview.id) ? '★ 已收藏' : '☆ 收藏'; renderGrid(true); };
$('use').onclick = usePreview;
$('cancel').onclick = () => post('view-close');
$('apply').onclick = () => {
  if (busy) return;
  for (const k of KINDS) if (draft.selections[k]) { recent[k] = [draft.selections[k].id, ...recent[k].filter(id => id !== draft.selections[k].id)].slice(0, 60); save(`recent.${k}`, recent[k]); }
  save('libraries', draft.libraries); commit(draft); post('view-close');
};
addEventListener('keydown', event => { if (event.key === 'Escape' && expanded && !$('settings').open && !$('notices').open) { event.preventDefault(); post('view-close'); } });
addEventListener('message', event => {
  if (event.source !== parent || !event.data || event.data.protocol !== P || (hostOrigin !== '*' && event.origin !== hostOrigin)) return;
  const message = event.data, payload = message.payload || {};
  if (initialized && (message.nodeId !== nodeId || message.pluginId !== pluginId)) return;
  if (message.type === 'init') {
    nodeId = message.nodeId; pluginId = message.pluginId; hostOrigin = event.origin === 'null' ? '*' : event.origin;
    features = payload.features || {}; state = normalized(payload.state);
    if (!initialized) {
      initialized = true; expanded = Boolean(payload.view?.expanded); draft = clone(state);
      if (!Object.keys(draft.libraries).length) draft.libraries = stored('libraries', {});
      $('compact').hidden = expanded; $('workbench').hidden = !expanded;
      if (expanded) { kind = KINDS.includes(payload.view.initialKind) ? payload.view.initialKind : 'portrait'; renderDraft(); void switchKind(kind); }
    }
    renderCompact(); post('loaded');
  } else if (message.type === 'run') void run(payload);
  else if (payload.requestId && pending.has(payload.requestId)) {
    const task = pending.get(payload.requestId); pending.delete(payload.requestId); clearTimeout(task.timer);
    if (payload.error) task.reject(Error(payload.error)); else task.resolve(payload.result);
  }
});
post('ready');
