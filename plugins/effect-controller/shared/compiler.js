import { categories, controls, getControls, getPresets } from "./catalog.js";
const sections = ["\u4FDD\u6301\u8981\u6C42", "\u98CE\u683C", "\u5149\u7167\u4E0E\u73AF\u5883", "\u6750\u8D28\u8868\u73B0", "\u8272\u5F69\u4E0E\u6C1B\u56F4", "\u573A\u666F\u7EC6\u8282", "\u753B\u9762\u70B9\u7F00", "\u8868\u73B0\u8D28\u91CF", "\u9650\u5236\u8981\u6C42"];
const structuralDetails = {
  residential: "\u4FDD\u6301\u5899\u4F53\u3001\u95E8\u7A97\u3001\u7A7A\u95F4\u6BD4\u4F8B\u53CA\u4E3B\u8981\u5BB6\u5177\u5E03\u5C40",
  dining: "\u4FDD\u6301\u5899\u4F53\u3001\u95E8\u7A97\u3001\u5427\u53F0\u548C\u684C\u6905\u5E03\u5C40",
  retail: "\u4FDD\u6301\u5899\u4F53\u3001\u95E8\u7A97\u3001\u8D27\u67B6\u3001\u5C55\u793A\u53F0\u4E0E\u9648\u5217\u5E03\u5C40",
  service: "\u4FDD\u6301\u7A7A\u95F4\u5E03\u5C40\u3001\u955C\u9762\u53CA\u4E3B\u8981\u8BBE\u5907\u4F4D\u7F6E",
  hotel: "\u4FDD\u6301\u7A7A\u95F4\u7ED3\u6784\u3001\u95E8\u7A97\u3001\u5BB6\u5177\u53CA\u670D\u52A1\u8BBE\u65BD\u4F4D\u7F6E",
  office: "\u4FDD\u6301\u7A7A\u95F4\u7ED3\u6784\u3001\u529E\u516C\u5BB6\u5177\u548C\u8BBE\u65BD\u5E03\u5C40",
  mall: "\u4FDD\u6301\u7A7A\u95F4\u7ED3\u6784\u3001\u901A\u9053\u3001\u6276\u68AF\u4E0E\u516C\u5171\u8BBE\u65BD\u4F4D\u7F6E",
  culture: "\u4FDD\u6301\u7A7A\u95F4\u7ED3\u6784\u3001\u5C55\u9648\u4E0E\u516C\u5171\u8BBE\u65BD\u5E03\u5C40",
  medical: "\u4FDD\u6301\u7A7A\u95F4\u7ED3\u6784\u3001\u533B\u7597\u8BBE\u5907\u53CA\u670D\u52A1\u8BBE\u65BD\u4F4D\u7F6E",
  civic: "\u4FDD\u6301\u901A\u9053\u3001\u670D\u52A1\u7A97\u53E3\u3001\u5BFC\u89C6\u53CA\u516C\u5171\u8BBE\u65BD\u4F4D\u7F6E",
  leisure: "\u4FDD\u6301\u7A7A\u95F4\u7ED3\u6784\u548C\u5A31\u4E50\u8BBE\u65BD\u5E03\u5C40",
  exhibition: "\u4FDD\u6301\u5C55\u53F0\u3001\u5C55\u54C1\u53CA\u5C55\u793A\u7ED3\u6784\u7684\u4F4D\u7F6E",
  storefront: "\u4FDD\u6301\u95E8\u5934\u8F6E\u5ED3\u3001\u62DB\u724C\u4F4D\u7F6E\u3001\u5165\u53E3\u53CA\u6A71\u7A97\u5206\u683C",
  architecture: "\u4FDD\u6301\u5EFA\u7B51\u4F53\u91CF\u3001\u5C42\u6570\u3001\u7ACB\u9762\u5206\u683C\u548C\u95E8\u7A97\u4F4D\u7F6E",
  landscape: "\u4FDD\u6301\u5730\u5F62\u3001\u9053\u8DEF\u8D70\u5411\u3001\u94FA\u88C5\u5206\u533A\u3001\u6C34\u4F53\u8FB9\u754C\u53CA\u6784\u7B51\u7269\u4F4D\u7F6E",
  planning: "\u4FDD\u6301\u9E1F\u77B0\u89C6\u89D2\u3001\u5EFA\u7B51\u5206\u5E03\u3001\u9053\u8DEF\u7F51\u7EDC\u548C\u7528\u5730\u8FB9\u754C",
  product: "\u4FDD\u6301\u4EA7\u54C1\u8F6E\u5ED3\u3001\u6BD4\u4F8B\u3001\u6784\u4EF6\u4E0E\u7EC6\u8282",
  custom: "\u4FDD\u6301\u4E3B\u8981\u4E3B\u4F53\u3001\u5E03\u5C40\u548C\u7A7A\u95F4\u6BD4\u4F8B"
};
const clean = (value) => typeof value === "string" ? value.trim().slice(0, 5e3) : "";
const record = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const validMode = (mode) => mode === "enhance" ? "enhance" : "render";
const validCategory = (id) => categories.find((c) => c.id === id) || categories[0];
const ending = (text) => /[。！？.!?]$/.test(text) ? text : `${text}\u3002`;
function createDefaultState(mode = "render", categoryId = "residential") {
  const category = validCategory(categoryId), actualMode = validMode(mode);
  const base = { version: 1, mode: actualMode, categoryId: category.id, typeId: category.types[0].id, presetId: "", controls: {}, supplement: "", customScene: "" };
  for (const c of getControls(category.id)) base.controls[c.id] = { enabled: false, value: c.defaultValue, custom: "" };
  return applyPreset(base, getPresets(actualMode, category.id)[0].id);
}
function normalizeState(input) {
  const raw = record(input), category = validCategory(raw.categoryId), mode = validMode(raw.mode);
  const defaults = createDefaultState(mode, category.id), entries = record(raw.controls);
  const hasControls = raw.controls && typeof raw.controls === "object" && !Array.isArray(raw.controls);
  const normalizedControls = {};
  for (const c of getControls(category.id)) {
    const entry = record(entries[c.id]);
    const candidate = clean(entry.value);
    normalizedControls[c.id] = {
      enabled: typeof entry.enabled === "boolean" ? entry.enabled : hasControls ? false : defaults.controls[c.id].enabled,
      value: c.options.some((o) => o.id === candidate) ? candidate : hasControls ? c.defaultValue : defaults.controls[c.id].value,
      custom: clean(entry.custom)
    };
  }
  return {
    version: 1,
    mode,
    categoryId: category.id,
    typeId: category.types.some((t) => t.id === raw.typeId) ? raw.typeId : category.types[0].id,
    presetId: clean(raw.presetId),
    controls: normalizedControls,
    supplement: clean(raw.supplement),
    customScene: clean(raw.customScene).slice(0, 200)
  };
}
function applyPreset(state, presetId) {
  const raw = record(state), category = validCategory(raw.categoryId), mode = validMode(raw.mode);
  const preset = getPresets(mode, category.id, raw.typeId).find((p) => p.id === presetId);
  if (!preset) return { ...raw, controls: { ...record(raw.controls) } };
  const previous = record(raw.controls), next = {};
  for (const c of getControls(category.id)) {
    const entry = record(previous[c.id]), value = preset.values[c.id];
    next[c.id] = { enabled: typeof value === "string", value: value || (c.options.some((o) => o.id === entry.value) ? entry.value : c.defaultValue), custom: clean(entry.custom) };
  }
  return { version: 1, mode, categoryId: category.id, typeId: category.types.some((t) => t.id === raw.typeId) ? raw.typeId : category.types[0].id, presetId: preset.id, controls: next, supplement: clean(raw.supplement), customScene: clean(raw.customScene).slice(0, 200) };
}
function compilePrompt(input) {
  const state = normalizeState(input), category = validCategory(state.categoryId);
  const type = category.types.find((t) => t.id === state.typeId) || category.types[0];
  const scene = type.label === "\u81EA\u5B9A\u4E49\u573A\u666F" ? state.customScene || category.label : type.label;
  const groups = new Map(sections.map((s) => [s, []]));
  const active = /* @__PURE__ */ new Map();
  let enabledCount = 0;
  for (const c of getControls(category.id)) {
    const entry = state.controls[c.id];
    if (!entry.enabled) continue;
    const option = c.options.find((o) => o.id === entry.value);
    const text = entry.value === "custom" ? entry.custom : option?.text;
    if (!text) continue;
    enabledCount++;
    active.set(c.id, entry.value);
    groups.get(c.section)?.push(ending(clean(text)));
    if (c.id === "structure" && entry.value === "strict") groups.get("\u4FDD\u6301\u8981\u6C42").push(ending(structuralDetails[category.id]));
  }
  const conflicts = [];
  if (["keep", "quality"].includes(active.get("materialsKeep")) && active.has("materialTarget")) conflicts.push({ id: "material-replacement", message: "\u4FDD\u6301\u539F\u6709\u6750\u8D28\u7C7B\u522B\u548C\u989C\u8272\u4E0E\u6307\u5B9A\u5BF9\u8C61\u66FF\u6362\u6750\u8D28\u53EF\u80FD\u51B2\u7A81\uFF0C\u8BF7\u8C03\u6574\u5176\u4E2D\u4E00\u9879\uFF0C\u6216\u5728\u8865\u5145\u8981\u6C42\u4E2D\u8BF4\u660E\u4F8B\u5916\u3002", controlIds: ["materialsKeep", "materialTarget"] });
  if (["night", "blue"].includes(active.get("time")) && ["side", "angled", "diffuse", "skylight", "backlit"].includes(active.get("daylight"))) conflicts.push({ id: "night-daylight", message: "\u591C\u665A\u6216\u84DD\u8C03\u65F6\u523B\u4E0E\u81EA\u7136\u65E5\u5149\u53EF\u80FD\u51B2\u7A81\uFF0C\u8BF7\u8C03\u6574\u65F6\u95F4\u6216\u81EA\u7136\u5149\u3002", controlIds: ["time", "daylight"] });
  if (active.get("restriction") === "nochange") {
    for (const [id, additions] of [["people", ["few", "blur"]], ["plants", ["few", "garden"]], ["decoration", ["few"]], ["furniture", ["add"]]]) {
      if (additions.includes(active.get(id))) conflicts.push({ id: `nochange-${id}`, message: "\u201C\u4E0D\u65B0\u589E\u6216\u5220\u9664\u8BBE\u8BA1\u7269\u4F53\u201D\u4E0E\u6DFB\u52A0\u4EBA\u7269\u3001\u690D\u7269\u6216\u8F6F\u88C5\u7684\u8981\u6C42\u53EF\u80FD\u51B2\u7A81\uFF0C\u8BF7\u8C03\u6574\u9650\u5236\u6216\u70B9\u7F00\u9009\u9879\u3002", controlIds: ["restriction", id] });
    }
  }
  const task = state.mode === "enhance" ? `\u5728\u539F\u6709${scene}\u6548\u679C\u56FE\u57FA\u7840\u4E0A\u4F18\u5316\u8868\u73B0\u8D28\u91CF\uFF0C\u907F\u514D\u91CD\u65B0\u8BBE\u8BA1\u3002` : `\u5C06\u8F93\u5165\u7684${scene}\u6A21\u578B\u622A\u56FE\u8F6C\u5316\u4E3A\u81EA\u7136\u771F\u5B9E\u7684\u6548\u679C\u56FE\u3002`;
  const parts = [`\u3010\u4EFB\u52A1\u76EE\u6807\u3011
${task}`];
  for (const section of sections) {
    const lines = [...new Set(groups.get(section))];
    if (lines.length) parts.push(`\u3010${section}\u3011
${lines.join("\n")}`);
  }
  if (state.supplement) parts.push(`\u3010\u8865\u5145\u8981\u6C42\u3011
${state.supplement}`);
  const negativeText = active.has("restriction") ? state.controls.restriction.value === "custom" ? state.controls.restriction.custom : controls.find((c) => c.id === "restriction").options.find((o) => o.id === state.controls.restriction.value)?.text || "" : "";
  return { text: parts.join("\n\n"), negativeText, enabledCount, conflicts };
}
export {
  applyPreset,
  compilePrompt,
  createDefaultState,
  normalizeState
};
