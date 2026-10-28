import { categories, getControls, getPresets } from "../shared/catalog.js";
import { createDefaultState, normalizeState, applyPreset, compilePrompt } from "../shared/compiler.js";
const $ = (id) => document.getElementById(id);
const protocol = "hios-plugin-node/v1", pluginId = "effect-controller";
let nodeId = new URLSearchParams(location.search).get("nodeId") || "", origin, bound = false, restored = false;
let state = createDefaultState(), drafts = {}, customPresets = [], pending = null, visibleControls = {}, dirty = {}, favorites = [], recent = [], lastReceived = "";
const awaitingEcho = new Set();
const clone = (value) => JSON.parse(JSON.stringify(value));
const uid = () => globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
const key = (mode, category) => `${mode}:${category}`;
const post = (type, payload = {}) => {
  if (parent !== window && (bound || type === "ready")) parent.postMessage({ protocol, nodeId, pluginId, type, payload }, bound && origin && origin !== "null" ? origin : "*");
};
const option = (select, value, label) => {
  const item = document.createElement("option");
  item.value = value;
  item.textContent = label;
  select.append(item);
};
const button = (label, action, id) => {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "hios-control";
  b.textContent = label;
  b.dataset.action = action;
  if (id) b.dataset.id = id;
  return b;
};
const currentCategory = () => categories.find((c) => c.id === state.categoryId) || categories[0];
function result() {
  return compilePrompt(state);
}
function output() {
  const r = result();
  post("output", { output: { kind: "text", portId: "prompt", value: r.text, text: r.text, name: "效果控制提示词" } });
}
function snapshot() {
  return { version: 1, current: state, drafts, customPresets, visibleControls, dirty, favorites, recent };
}
function save() {
  drafts[key(state.mode, state.categoryId)] = clone(state);
  const data = clone(snapshot());
  const encoded = JSON.stringify(data);
  if (new TextEncoder().encode(encoded).length > 24e4) {
    $("presetStatus").textContent = "保存失败：节点数据过大，请删除部分预设或缩短补充内容";
    post("error", { message: "节点数据过大，请删除部分预设或缩短补充内容" });
    return;
  }
  // Multiple local edits can precede the host's first echo. Never restore an
  // intermediate echo and steal focus from a live input/IME composition.
  awaitingEcho.add(encoded);
  if (awaitingEcho.size > 64) awaitingEcho.delete(awaitingEcho.values().next().value);
  post("state", { state: data });
  output();
}
function visible() {
  const k = key(state.mode, state.categoryId);
  if (!Array.isArray(visibleControls[k])) visibleControls[k] = getControls(state.categoryId).filter((c) => state.controls[c.id]?.enabled).map((c) => c.id);
  return visibleControls[k];
}
function markDirty() {
  dirty[key(state.mode, state.categoryId)] = true;
}
function remember() {
  const v = { categoryId: state.categoryId, typeId: state.typeId };
  recent = [v, ...recent.filter((x) => x.categoryId !== v.categoryId || x.typeId !== v.typeId)].slice(0, 8);
}
function refreshPreview() {
  const r = result();
  $("preview").value = r.text;
  $("count").textContent = `已启用 ${r.enabledCount} 项`;
  $("conflicts").hidden = !r.conflicts?.length;
  $("conflicts").textContent = (r.conflicts || []).map((x) => x.message).join("；");
}
function render() {
  $("modes").replaceChildren();
  for (const [id, label] of [["render", "模型出图"], ["enhance", "效果提升"]]) {
    const b = button(label, "mode", id);
    b.setAttribute("aria-pressed", String(state.mode === id));
    if (state.mode === id) b.classList.add("hios-primary");
    $("modes").append(b);
  }
  $("category").replaceChildren();
  categories.forEach((c) => option($("category"), c.id, c.label));
  $("category").value = state.categoryId;
  $("type").replaceChildren();
  currentCategory().types.forEach((t) => option($("type"), t.id, t.label));
  $("type").value = state.typeId;
  $("preset").replaceChildren();
  option($("preset"), "", "选择效果预设");
  getPresets(state.mode, state.categoryId, state.typeId).forEach((p) => option($("preset"), p.id, p.label));
  $("preset").value = state.presetId || "";
  $("supplement").value = state.supplement || "";
  $("customSceneLabel").hidden = state.categoryId !== "custom";
  $("customScene").value = state.customScene || "";
  for (const [id, items] of [["favorites", favorites], ["recent", recent]]) {
    const el = $(id);
    el.replaceChildren();
    const title = document.createElement("p");
    title.textContent = id === "favorites" ? "收藏" : "最近使用";
    el.append(title);
    items.forEach((x) => {
      const c = categories.find((c2) => c2.id === x.categoryId), t = c?.types.find((t2) => t2.id === x.typeId);
      if (c && t) {
        const b = button(`${c.label} / ${t.label}`, "shortcut");
        b.dataset.category = c.id;
        b.dataset.type = t.id;
        el.append(b);
      }
    });
  }
  $("favorite").textContent = favorites.some((x) => x.categoryId === state.categoryId && x.typeId === state.typeId) ? "取消收藏" : "收藏当前场景";
  $("controls").replaceChildren();
  $("available").replaceChildren();
  for (const c of getControls(state.categoryId)) {
    const value = state.controls[c.id];
    if (!value) continue;
    if (!visible().includes(c.id)) {
      const row2 = document.createElement("div");
      row2.className = "available";
      const name = document.createElement("span");
      name.textContent = `${c.section} · ${c.label}`;
      row2.append(name, button("添加", "add", c.id));
      $("available").append(row2);
      continue;
    }
    const row = document.createElement("div");
    row.className = "control-row";
    const top = document.createElement("div");
    top.className = "control-top";
    const label = document.createElement("label");
    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = value.enabled;
    check.dataset.action = "toggle";
    check.dataset.id = c.id;
    const caption = document.createElement("span");
    caption.textContent = c.label;
    label.append(check, caption);
    top.append(label);
    const select = document.createElement("select");
    select.className = "hios-control";
    select.dataset.action = "value";
    select.dataset.id = c.id;
    select.setAttribute("aria-label", c.label);
    c.options.forEach((o) => option(select, o.id, o.label));
    select.value = value.value;
    select.disabled = !value.enabled;
    const remove = button("×", "remove", c.id);
    remove.setAttribute("aria-label", `移除${c.label}`);
    top.append(select, remove);
    row.append(top);
    if (value.value === "custom") {
      const input = document.createElement("input");
      input.className = "hios-control";
      input.placeholder = "输入自定义内容";
      input.maxLength = 500;
      input.value = value.custom || "";
      input.disabled = !value.enabled;
      input.setAttribute("aria-label", `${c.label}自定义内容`);
      input.dataset.action = "custom";
      input.dataset.id = c.id;
      row.append(input);
    }
    $("controls").append(row);
  }
  $("customPreset").replaceChildren();
  option($("customPreset"), "", "选择已保存预设");
  customPresets.forEach((p) => option($("customPreset"), p.id, `${p.name} · ${categories.find((c) => c.id === p.state.categoryId)?.label || ""}`));
  refreshPreview();
}
function changeContext(mode, category) {
  drafts[key(state.mode, state.categoryId)] = clone(state);
  state = normalizeState(drafts[key(mode, category)] || createDefaultState(mode, category));
  remember();
  pending = null;
  $("confirm").hidden = true;
  render();
  save();
}
function askApply(action) {
  if (!dirty[key(state.mode, state.categoryId)]) {
    action();
    return;
  }
  pending = action;
  $("confirm").hidden = false;
}
function presetApplied() {
  visibleControls[key(state.mode, state.categoryId)] = getControls(state.categoryId).filter((c) => state.controls[c.id]?.enabled).map((c) => c.id);
  dirty[key(state.mode, state.categoryId)] = false;
}
function safePreset(p) {
  if (!p || typeof p !== "object" || !["render", "enhance"].includes(p.state?.mode) || !categories.some((c) => c.id === p.state?.categoryId) || typeof p.name !== "string" || !p.name.trim() || p.name.length > 50 || !p.state || typeof p.state !== "object") return null;
  const s = normalizeState(p.state);
  return { id: typeof p.id === "string" && p.id.length <= 100 ? p.id : uid(), name: p.name.trim(), state: s };
}
function status(message) {
  $("presetStatus").textContent = message;
}
$("modes").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-action=mode]");
  if (b && b.dataset.id !== state.mode) changeContext(b.dataset.id, state.categoryId);
});
$("category").addEventListener("change", (e) => changeContext(state.mode, e.target.value));
$("type").addEventListener("change", (e) => {
  state.typeId = e.target.value;
  state.presetId = "";
  remember();
  save();
  render();
});
$("search").addEventListener("input", (e) => {
  const q = e.target.value.trim().toLowerCase();
  const sel = $("searchResults");
  sel.replaceChildren();
  if (!q) {
    sel.hidden = true;
    return;
  }
  option(sel, "", "选择搜索结果");
  categories.forEach((c) => c.types.filter((t) => `${c.label} ${t.label}`.toLowerCase().includes(q)).forEach((t) => option(sel, `${c.id}|${t.id}`, `${c.label} / ${t.label}`)));
  sel.hidden = sel.options.length === 1;
});
$("searchResults").addEventListener("change", (e) => {
  if (!e.target.value) return;
  const [cat, type] = e.target.value.split("|");
  changeContext(state.mode, cat);
  state.typeId = type;
  state.presetId = "";
  remember();
  $("search").value = "";
  e.target.hidden = true;
  render();
  save();
});
$("preset").addEventListener("change", (e) => {
  const id = e.target.value;
  if (!id) return;
  askApply(() => {
    state = applyPreset(state, id);
    presetApplied();
    render();
    save();
  });
  e.target.value = state.presetId || "";
});
$("confirmApply").onclick = () => {
  const action = pending;
  pending = null;
  $("confirm").hidden = true;
  if (action) action();
};
$("cancelApply").onclick = () => {
  pending = null;
  $("confirm").hidden = true;
};
$("app").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-action]");
  if (!b || b.dataset.action === "mode") return;
  const v = state.controls[b.dataset.id];
  if (!v) return;
  if (b.dataset.action === "add") {
    v.enabled = true;
    if (!visible().includes(b.dataset.id)) visible().push(b.dataset.id);
  }
  if (b.dataset.action === "remove") {
    v.enabled = false;
    visibleControls[key(state.mode, state.categoryId)] = visible().filter((id) => id !== b.dataset.id);
  }
  state.presetId = "";
  markDirty();
  render();
  save();
});
$("controls").addEventListener("change", (e) => {
  const el = e.target, v = state.controls[el.dataset.id];
  if (!v) return;
  if (el.dataset.action === "value") v.value = el.value;
  if (el.dataset.action === "toggle") v.enabled = el.checked;
  state.presetId = "";
  markDirty();
  render();
  save();
});
$("controls").addEventListener("input", (e) => {
  if (e.target.dataset.action !== "custom") return;
  state.controls[e.target.dataset.id].custom = e.target.value;
  state.presetId = "";
  markDirty();
  refreshPreview();
  save();
});
$("customScene").addEventListener("input", (e) => {
  state.customScene = e.target.value;
  markDirty();
  refreshPreview();
  save();
});
$("supplement").addEventListener("input", (e) => {
  state.supplement = e.target.value;
  markDirty();
  refreshPreview();
  save();
});
$("favorite").onclick = () => {
  const found = favorites.some((x) => x.categoryId === state.categoryId && x.typeId === state.typeId);
  favorites = favorites.filter((x) => x.categoryId !== state.categoryId || x.typeId !== state.typeId);
  if (!found && favorites.length < 20) favorites.push({ categoryId: state.categoryId, typeId: state.typeId });
  render();
  save();
};
for (const id of ["favorites", "recent"]) $(id).addEventListener("click", (e) => {
  const b = e.target.closest("[data-action=shortcut]");
  if (!b) return;
  changeContext(state.mode, b.dataset.category);
  state.typeId = b.dataset.type;
  state.presetId = "";
  remember();
  render();
  save();
});
$("savePreset").onclick = () => {
  const name = $("presetName").value.trim();
  if (!name) {
    status("请输入预设名称");
    return;
  }
  if (customPresets.length >= 20) {
    status("最多保存 20 个预设");
    return;
  }
  const item = { id: uid(), name, state: clone(state) };
  if (new TextEncoder().encode(JSON.stringify({ ...snapshot(), customPresets: [...customPresets, item] })).length > 22e4) {
    status("节点数据过大，请删除部分预设");
    return;
  }
  customPresets.push(item);
  $("presetName").value = "";
  render();
  save();
  status("已保存");
};
$("applyCustom").onclick = () => {
  const p = customPresets.find((x) => x.id === $("customPreset").value);
  if (!p) return;
  askApply(() => {
    drafts[key(state.mode, state.categoryId)] = clone(state);
    state = normalizeState(clone(p.state));
    presetApplied();
    render();
    save();
  });
};
$("deleteCustom").onclick = () => {
  const id = $("customPreset").value;
  if (!id) return;
  customPresets = customPresets.filter((x) => x.id !== id);
  render();
  save();
  status("已删除");
};
$("exportCustom").onclick = () => {
  const blob = new Blob([JSON.stringify({ version: 1, presets: customPresets }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "effect-controller-presets.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1e3);
};
$("importCustom").onclick = () => $("file").click();
$("file").onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    if (file.size > 1024 * 1024) throw Error("文件不能超过 1 MB");
    const data = JSON.parse(await file.text());
    if (data.version !== 1 || !Array.isArray(data.presets) || data.presets.length > 20) throw Error("预设格式不正确");
    const imported = data.presets.map((p) => {
      const x = safePreset(p);
      if (x) x.id = uid();
      return x;
    });
    if (imported.some((x) => !x) || customPresets.length + imported.length > 20) throw Error("预设无效或超过 20 个");
    if (new TextEncoder().encode(JSON.stringify({ ...snapshot(), customPresets: [...customPresets, ...imported] })).length > 22e4) throw Error("导入后节点数据过大");
    customPresets.push(...imported);
    render();
    save();
    status(`已导入 ${imported.length} 个预设`);
  } catch (err) {
    status(`导入失败：${err.message}`);
  }
};
$("copy").onclick = async () => {
  try {
    await navigator.clipboard.writeText($("preview").value);
    $("status").textContent = "已复制";
  } catch {
    $("preview").select();
    const ok = document.execCommand("copy");
    $("status").textContent = ok ? "已复制" : "复制失败，请手动复制预览文本";
  }
};
window.addEventListener("message", (event) => {
  const m = event.data;
  if (event.source !== parent || !m || m.protocol !== protocol || m.pluginId && m.pluginId !== pluginId) return;
  if (!bound) {
    if (m.type !== "init" || !m.nodeId || nodeId && m.nodeId !== nodeId) return;
    nodeId = m.nodeId;
    origin = event.origin;
    bound = true;
  } else if (m.nodeId !== nodeId || event.origin !== origin) return;
  if (m.type === "init") {
    const saved = m.payload?.state, fingerprint = JSON.stringify(saved || {});
    if (restored && awaitingEcho.has(fingerprint)) {
      lastReceived = fingerprint;
      awaitingEcho.delete(fingerprint);
      return;
    }
    if (restored && (fingerprint === lastReceived || fingerprint === JSON.stringify(snapshot()))) {
      lastReceived = fingerprint;
      return;
    }
    if (new TextEncoder().encode(fingerprint).length > 24e4) {
      post("error", { message: "节点状态过大，无法恢复" });
      return;
    }
    restored = true;
    lastReceived = fingerprint;
    awaitingEcho.clear();
    if (saved && typeof saved === "object") {
      try {
        state = normalizeState(saved.current || saved);
        drafts = {};
        if (saved.drafts && typeof saved.drafts === "object") for (const [k, v] of Object.entries(saved.drafts).slice(0, 100)) drafts[k] = normalizeState(v);
        customPresets = Array.isArray(saved.customPresets) ? saved.customPresets.slice(0, 20).map(safePreset).filter(Boolean) : [];
        visibleControls = {};
        if (saved.visibleControls && typeof saved.visibleControls === "object") {
          for (const [k, v] of Object.entries(saved.visibleControls).slice(0, 100)) if (Array.isArray(v)) visibleControls[k] = v.filter((x) => typeof x === "string").slice(0, 100);
        }
        dirty = saved.dirty && typeof saved.dirty === "object" ? Object.fromEntries(Object.entries(saved.dirty).slice(0, 100).filter(([k, v]) => v === true)) : {};
        const valid = (x) => x && categories.some((c) => c.id === x.categoryId && c.types.some((t) => t.id === x.typeId));
        favorites = Array.isArray(saved.favorites) ? saved.favorites.filter(valid).slice(0, 20) : [];
        recent = Array.isArray(saved.recent) ? saved.recent.filter(valid).slice(0, 8) : [];
      } catch {
        state = createDefaultState();
      }
    }
    pending = null;
    $("confirm").hidden = true;
    render();
    post("loaded");
    output();
  } else if (m.type === "run") {
    try {
      output();
    } catch (error) {
      post("error", { message: String(error.message || error) });
    }
  }
});
render();
post("ready");
