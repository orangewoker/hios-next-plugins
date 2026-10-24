<template>
  <div class="studio" :dir="direction">
    <aside class="rail">
      <header class="brand">
        <div class="brandText">
          <h1>{{ text("条形码生成器") }}</h1>
          <p>{{ text("矢量 / 高清条码一键导出") }}</p>
        </div>
      </header>
      <div class="railScroll">
        <section class="block">
          <div class="blockHead">{{ text("码制") }}</div>
          <div class="typeGrid">
            <button
              v-for="item in formats"
              :key="item.value"
              type="button"
              class="typeChip"
              :class="{ active: format === item.value }"
              :aria-pressed="format === item.value"
              @click="
                selectFormat(item.value);
                animatePreview();
              "
            >
              <span class="typeName">{{ item.label }}</span
              ><span class="typeHint">{{ text(item.hint) }}</span
              ><span v-if="format === item.value" class="typeCheck" />
            </button>
          </div>
        </section>
        <section class="block">
          <div class="blockHead">
            <label for="barcodeContent">{{ text("内容") }}</label
            ><span class="count"
              >{{ content.length }} {{ english ? "characters" : "字符" }}</span
            >
          </div>
          <textarea
            id="barcodeContent"
            maxlength="4096"
            v-model="content"
            class="content"
            spellcheck="false"
            :placeholder="
              english ? 'Enter content to encode…' : '输入要编码的内容…'
            "
            @input="animatePreview"
          />
        </section>
        <section class="block">
          <div class="blockHead">{{ text("外观参数") }}</div>
          <div class="sliders">
            <label class="ctrl"
              ><span class="ctrlTop"
                ><span>{{ text("模块宽度") }}</span
                ><b>{{ moduleWidth }}px</b></span
              ><input
                v-model.number="moduleWidth"
                type="range"
                min="1"
                max="20"
                step="1"
                @input="animatePreview"
            /></label>
            <label class="ctrl"
              ><span class="ctrlTop"
                ><span>{{ text("条码高度") }}</span
                ><b>{{ barHeight }}px</b></span
              ><input
                v-model.number="barHeight"
                type="range"
                min="60"
                max="420"
                step="2"
                @input="animatePreview"
            /></label>
            <label class="ctrl"
              ><span class="ctrlTop"
                ><span>{{ text("静区") }}</span
                ><b>{{ quietZone }} {{ english ? "modules" : "模块" }}</b></span
              ><input
                v-model.number="quietZone"
                type="range"
                min="4"
                max="40"
                step="1"
                @input="animatePreview"
            /></label>
            <label class="ctrl"
              ><span class="ctrlTop"
                ><span>{{ text("文字字号") }}</span
                ><b :class="{ muted: !showText }">{{
                  showText ? fontSize + "px" : text("关闭")
                }}</b></span
              ><input
                v-model.number="fontSize"
                type="range"
                min="10"
                max="48"
                step="1"
                :disabled="!showText"
                @input="animatePreview"
            /></label>
          </div>
        </section>
        <section class="block">
          <div class="blockHead">{{ text("选项") }}</div>
          <div class="toggles">
            <label class="switch"
              ><input v-model="showText" type="checkbox" /><span class="track"
                ><span class="knob" /></span
              ><span class="switchLabel">{{
                text("显示下方文字")
              }}</span></label
            >
            <label class="switch"
              ><input v-model="showBackground" type="checkbox" /><span
                class="track"
                ><span class="knob" /></span
              ><span class="switchLabel">{{ text("显示背景") }}</span></label
            >
          </div>
          <div class="colors">
            <div class="colorRow">
              <span class="crLabel">{{ text("前景") }}</span
              ><span class="crControls"
                ><input
                  v-model="foreground"
                  class="crDot"
                  type="color"
                  :aria-label="text('前景')" /><input
                  v-model="foreground"
                  class="crHex"
                  type="text"
                  maxlength="7"
                  spellcheck="false"
                  :aria-label="text('前景') + ' HEX'"
              /></span>
            </div>
            <div class="colorRow">
              <span class="crLabel">{{ text("背景") }}</span
              ><span class="crControls"
                ><input
                  v-model="background"
                  class="crDot"
                  type="color"
                  :aria-label="text('背景')" /><input
                  v-model="background"
                  class="crHex"
                  type="text"
                  maxlength="7"
                  spellcheck="false"
                  :aria-label="text('背景') + ' HEX'"
              /></span>
            </div>
          </div>
        </section>
      </div>
    </aside>
    <main class="stage">
      <div class="stageBar">
        <div class="stageTitle">
          <strong>{{ text("实时预览") }}</strong
          ><span v-if="result.data" class="code">{{ result.data.human }}</span>
        </div>
        <div class="exports">
          <button class="exp" :disabled="!!result.error || exporting" @click="publish(true)">输出到画布</button>
          <span class="exportsLabel">{{ text("导出") }}</span
          ><button
            v-for="kind in exportKinds"
            :key="kind"
            type="button"
            class="exp"
            :disabled="!!result.error || exporting"
            @click="download(kind)"
          >
            <span v-html="exportIcons[kind]" />{{ kind }}
          </button>
        </div>
      </div>
      <p v-if="status" role="status" class="hostStatus">{{ status }}</p>
      <div class="canvas">
        <div v-if="result.error || exportError" class="stageError" role="alert">
          <p>{{ result.error || exportError }}</p>
        </div>
        <div v-else :key="format" ref="previewElement" class="labelCard">
          <span class="cardTag">{{ result.data?.label }}</span>
          <div class="barcodeOnCard" v-html="svg" />
          <p class="cardCap">{{ result.data?.human }}</p>
        </div>
      </div>
      <dl class="chips">
        <div v-for="metric in metrics" :key="metric.label" class="chip">
          <dt>{{ text(metric.label) }}</dt>
          <dd>{{ metric.value }}</dd>
        </div>
      </dl>
      <details class="source">
        <summary>
          <span class="sourceCaret" aria-hidden="true" /><span>{{
            text("SVG 源码")
          }}</span>
        </summary>
        <pre>{{ svg }}</pre>
      </details>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import useBarcode from "./useBarcode";
import { connectHost, publishImage, postState, type SystemContext } from "./host";
import { translations, exportIcons } from "./presentation";

const barcode = useBarcode();
const {
  format,
  content,
  moduleWidth,
  barHeight,
  quietZone,
  showText,
  showBackground,
  fontSize,
  foreground,
  background,
  previewElement,
  formats,
  selectFormat,
  result,
  svg,
  metrics,
  exportSvg,
  exportPdf,
  exportPng,
  animatePreview,
} = barcode;
const locale = ref("zh-CN");
const direction = ref<"ltr" | "rtl">("ltr");
const english = computed(() => !locale.value.toLowerCase().startsWith("zh"));
const exportKinds = ["SVG", "PDF", "PNG"] as const;
const exporting = ref(false);
const exportError = ref("");
const status = ref("");
let hydrating = false;
const fields = { format, content, moduleWidth, barHeight, quietZone, showText, showBackground, fontSize, foreground, background };
watch(() => Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.value])), state => { if (!hydrating) postState(state); }, { flush: "sync" });
function hydrate(payload: any) {
  hydrating = true;
  try {
    const state = payload.state || {};
    for (const [key, field] of Object.entries(fields)) {
      const value = state[key];
      if (typeof value !== typeof field.value) continue;
      if (key === "format" && !formats.some(f => f.value === value)) continue;
      if (typeof value === "number" && !Number.isFinite(value)) continue;
      (field as any).value = value;
    }
    moduleWidth.value = Math.max(1, Math.min(20, moduleWidth.value));
    barHeight.value = Math.max(60, Math.min(420, barHeight.value));
    quietZone.value = Math.max(4, Math.min(40, quietZone.value));
    fontSize.value = Math.max(10, Math.min(48, fontSize.value));
    const input = payload.inputs?.text;
    const value = typeof input === "string" ? input : input?.text ?? input?.value ?? input?.content;
    if (typeof value === "string") content.value = value.slice(0, 4096);
    content.value = content.value.slice(0, 4096);
  } finally { hydrating = false; }
}
async function publish(addToCanvas = false) {
  if (exporting.value) throw new Error("正在导出，请稍后再试");
  exporting.value = true; exportError.value = ""; status.value = "";
  try {
    if (result.value.error) throw new Error(result.value.error);
    const output = await exportPng(false);
    if (!output) throw new Error("没有可输出的条码");
    await publishImage(output, addToCanvas);
    status.value = "已输出条码图片";
  } catch (error) {
    exportError.value = error instanceof Error ? error.message : String(error);
    if (!addToCanvas) throw error;
  } finally { exporting.value = false; }
}
let disconnect: (() => void) | undefined;
function text(value: string) {
  return english.value ? translations[value] || value : value;
}
function applyContext(context: SystemContext) {
  locale.value = context.interfaceLocale || context.locale || "zh-CN";
  direction.value = context.direction === "rtl" ? "rtl" : "ltr";
  const root = document.documentElement;
  root.dataset.theme = context.appearance === "dark" ? "dark" : "light";
  root.lang = locale.value;
  root.dir = direction.value;
  root.style.setProperty(
    "--dx-display-scale",
    String(context.displayScale || 1),
  );
}
async function download(kind: (typeof exportKinds)[number]) {
  exportError.value = "";
  exporting.value = true;
  try {
    await { SVG: exportSvg, PDF: exportPdf, PNG: exportPng }[kind]();
    status.value = "文件已保存（HIOS 中可在素材库查看）";
  } catch (error) {
    exportError.value = error instanceof Error ? error.message : String(error);
  } finally {
    exporting.value = false;
  }
}
onMounted(() => {
  applyContext({});
  disconnect = connectHost(applyContext, hydrate, () => publish(false));
});
onUnmounted(() => disconnect?.());
</script>
