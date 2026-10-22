<template>
  <div v-if="!loaded" class="boot"><h2>3D 导演台</h2><p>{{ status }}</p><button @click="post('ready')">重试连接</button></div>
  <SceneEditor v-else v-model:anchors="doc.anchors" v-model:prompt="doc.prompt" v-model:model="doc.model"
    v-model:lighting="lighting" v-model:sceneSettings="doc.sceneSettings" :scene="doc.scene" :result="selected"
    :plans="doc.plans" :selectedPlanId="doc.selectedPlanId" :tasks="tasks" :models="models" :modelsLoading="modelsLoading"
    :addingMannequin="busy" :exportingVideo="exportingVideo" :exportingImage="exportingImage" :exportProgress="exportProgress"
    @selectPlan="doc.selectedPlanId = $event" @loadModels="loadModels" @generate="generate" @addMannequin="addMannequin"
    @exportImage="exportImage" @exportVideo="exportVideo" @editInstruction="doc.prompt = $event" @close="post('close')">
    <template #toolbar>
      <div class="hios-toolbar">
        <button :disabled="busy" @click="makeCameraPlan">关键帧生成运镜</button>
        <button :disabled="busy" @click="openJson">场景 JSON</button>
        <button :disabled="busy" @click="fileInput?.click()">导入工程</button>
        <button :disabled="busy" @click="exportProject">导出工程</button>
        <button v-if="busy" @click="cancel">取消任务</button>
        <small role="status" :title="status">{{ status }}</small>
      </div>
    </template>
    <template #input>
      <textarea v-model="doc.prompt" class="prompt-input" maxlength="12000" :disabled="busy" placeholder="描述场景、人物动作与镜头，例如：人偶向镜头挥手，相机缓慢推进…" />
      <small class="reference-summary">{{ references.length ? `已连接 ${references.length} 项参考（最多使用 4 张图片）` : '连接画布文字 / 图片节点作为参考；也可手动布景与运镜。' }}</small>
    </template>
  </SceneEditor>
  <input ref="fileInput" hidden type="file" accept=".director3d,.json" @change="importLocal" />
  <ElDialog v-model="jsonOpen" title="编辑完整工程 JSON" width="85%" append-to-body>
    <p>支持基础几何体与 16 关节人偶；确认时校验结构与真实渲染，失败不会覆盖工程。</p>
    <textarea v-model="jsonText" class="json-editor" spellcheck="false" />
    <template #footer><ElButton @click="jsonOpen = false">取消</ElButton><ElButton type="primary" :disabled="busy" @click="applyJson">校验并应用</ElButton></template>
  </ElDialog>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { ElDialog, ElButton, ElMessage } from 'element-plus';
import SceneEditor from './sceneEditor.vue';
import { initialDocument, documentSchema, type DirectorDocument } from './document';
import { createMannequinObject, createStage, disposeStage, getSceneLighting } from './scene';
import { directorPlanSchema, prepareSceneAnimation, type DirectorGeneration } from './sceneAnimation';
import { prepareMotion, sampleMotion, type CameraAnchor } from './motion';
import { renderImage, renderVideo } from './renderMedia';
import { createDirectorDraft } from './agentTools';
import { directorPrompt } from './agentPrompt';
import type { NodeAiModel } from './hostTypes';
import { connect, post, request, storeFile, assetUrl } from './bridge';

const doc = ref<DirectorDocument>(initialDocument());
const lighting = computed({ get: () => doc.value.lighting || getSceneLighting(doc.value.scene), set: value => { doc.value.lighting = value; } });
const selected = computed(() => doc.value.plans.find(p => p.id === doc.value.selectedPlanId));
const loaded = ref(false), status = ref('正在连接 HIOS…'), busy = ref(false), modelsLoading = ref(false);
const models = ref<NodeAiModel[]>([]), tasks = ref<DirectorGeneration[]>([]), references = ref<unknown[]>([]);
const exportingVideo = ref(false), exportingImage = ref(''), exportProgress = ref(0);
const jsonOpen = ref(false), jsonText = ref(''), fileInput = ref<HTMLInputElement>();
let initialized = false, disposed = false, restoring = false, timer: ReturnType<typeof setTimeout> | undefined;
let queue: Promise<unknown> = Promise.resolve(), controller: AbortController | undefined, decisionId = '';
const plain = <T,>(value: T): T => value === undefined ? value : JSON.parse(JSON.stringify(value));
const errorText = (e: unknown) => e instanceof Error ? e.message : String(e);
function fail(e: unknown) { status.value = errorText(e); ElMessage.error(status.value); }
function theme(p: any) { document.documentElement.classList.toggle('dark', p?.theme?.mode !== 'light'); }

async function readDocument(url: string) {
  const response = await fetch(assetUrl(url));
  if (!response.ok) throw new Error('无法读取工程素材');
  const text = await response.text();
  if (text.length > 4_000_000) throw new Error('工程文件超过 4 MB');
  return documentSchema.parse(JSON.parse(text));
}
const disconnect = connect((type, p) => {
  if (type === 'theme') theme(p);
  if (type === 'init') {
    theme(p); references.value = Object.values(p.inputs || {}).flat();
    if (initialized || restoring) return;
    restoring = true;
    void (async () => {
      try {
        if (p.state?.documentUrl) doc.value = await readDocument(p.state.documentUrl);
        else if (p.file?.url) doc.value = await readDocument(p.file.url);
        initialized = true; loaded.value = true; status.value = '已就绪';
        void loadModels();
      } catch (e) { status.value = `工程恢复失败，未覆盖原文件：${errorText(e)}`; }
      finally { restoring = false; }
    })();
  }
  if (type === 'run') {
    if (!loaded.value || busy.value) { post('error', { message: '导演台尚未就绪或正在执行任务' }); return; }
    void exportVideo(16 / 9);
  }
});
function persist(snapshot: DirectorDocument, signal?: AbortSignal) {
  const copy = documentSchema.parse(plain(snapshot));
  const work = queue.catch(() => {}).then(async () => {
    signal?.throwIfAborted();
    if (disposed) throw new Error('导演台已关闭');
    const result = await storeFile(new Blob([JSON.stringify(copy)], { type: 'application/x-hios-director3d' }), '场景.director3d');
    if (disposed) throw new Error('导演台已关闭');
    signal?.throwIfAborted();
    post('state', { state: { version: 1, documentUrl: result.url } });
    status.value = '已保存';
    return result;
  });
  queue = work; return work;
}
watch(doc, () => {
  if (!initialized || disposed) return;
  clearTimeout(timer); status.value = '待保存…';
  timer = setTimeout(() => { void persist(doc.value).catch(fail); }, 800);
}, { deep: true });

async function loadModels() {
  if (modelsLoading.value) return;
  modelsLoading.value = true;
  try {
    const catalog = await request('ai-request', { action: 'catalog' }, 15000);
    if (catalog.toolDecisionProtocol !== 'local-tools/v1') throw new Error('AI 生成需要支持 local-tools/v1 的新版 HIOS；手动取景和导出不受影响');
    models.value = catalog.choices.filter((c: any) => c.modes.includes('tools')).map((c: any) => ({ providerId: c.routeId, providerLabel: c.routeName, modelId: c.model, label: c.model, protocol: 'openai-completions' }));
    if (!doc.value.model && models.value[0]) doc.value.model = JSON.stringify([models.value[0].providerId, models.value[0].modelId]);
    if (!models.value.length) status.value = '请在 HIOS AI 路由中启用文字模型';
  } catch (e) { status.value = errorText(e); } finally { modelsLoading.value = false; }
}
async function validatePreview(next: DirectorDocument, signal: AbortSignal) {
  signal.throwIfAborted();
  const runtime = await createStage(document.createElement('canvas'), next.scene, undefined, 16 / 9, next.lighting, next.sceneSettings);
  let player: ReturnType<typeof prepareSceneAnimation> | undefined;
  try {
    signal.throwIfAborted();
    const plan = next.plans.find(p => p.id === next.selectedPlanId);
    if (plan) { player = prepareSceneAnimation(runtime, plan); player.setTime(0); sampleMotion(runtime.camera, prepareMotion(plan.cameraFrames), 0); }
    runtime.renderer.render(runtime.scene, runtime.camera);
  } finally { player?.dispose(); disposeStage(runtime); }
}
async function commit(next: DirectorDocument, signal: AbortSignal) {
  next = documentSchema.parse(next); await validatePreview(next, signal); signal.throwIfAborted();
  clearTimeout(timer); await persist(next, signal); doc.value = next;
}
function cancel() {
  controller?.abort(new Error('用户取消任务'));
  if (decisionId) void request('ai-request', { action: 'cancel-decision', clientId: decisionId }, 10000).catch(() => {});
}
async function generate() {
  if (busy.value || !doc.value.prompt.trim() || !doc.value.model) return;
  busy.value = true; controller = new AbortController();
  const signal = controller.signal, timeout = setTimeout(cancel, 600_000);
  const id = crypto.randomUUID(), instruction = doc.value.prompt;
  tasks.value.push({ id, instruction });
  const baseline = JSON.stringify(doc.value.scene);
  try {
    const [routeId, model] = JSON.parse(doc.value.model);
    const current = selected.value;
    const basePlan = current ? { name: current.name, duration: current.duration, tracks: plain(current.tracks), cameraFrames: plain(current.cameraFrames) } : undefined;
    const draft = createDirectorDraft(plain(doc.value.scene), basePlan, plain(doc.value.plans));
    const context = { instruction, references: plain(doc.value.anchors).map((a, i) => ({ order: i + 1, camera: a.camera, controls: a.controls })), selectedPlanId: doc.value.selectedPlanId,
      inputText: references.value.filter(v => typeof v === 'string' && !/^\w+:\/\//.test(v as string)).join('\n').slice(0, 16000) };
    const images = references.value.filter(v => typeof v === 'string' && /^hios-asset:\/\//.test(v as string)).slice(0, 4);
    const history: unknown[] = [];
    let finished = false;
    for (let round = 0; round < 40; round++) {
      signal.throwIfAborted(); status.value = `AI 编辑第 ${round + 1} 轮…`; decisionId = crypto.randomUUID();
      const result = await request('ai-request', { action: 'tool-decision', clientId: decisionId, routeId, model, images,
        systemPrompt: directorPrompt + '\n工具历史在用户消息中。继续已有草稿，不要重复已成功操作。编辑完成且 valid=true 后不再调用工具，直接简短回复。',
        prompt: JSON.stringify({ ...context, document: draft.summary(), history }), tools: draft.tools.map(({ execute: _execute, ...tool }) => tool) });
      decisionId = ''; signal.throwIfAborted();
      const calls = result.toolCalls || [];
      if (!calls.length) { finished = true; break; }
      for (const call of calls) {
        signal.throwIfAborted();
        const tool = draft.tools.find(t => t.name === call.name);
        let output;
        try { if (!tool) throw new Error('未知工具'); output = await tool.execute(call.arguments, signal); }
        catch (e) { output = { error: errorText(e) }; }
        history.push({ call, output });
      }
    }
    if (!finished) throw new Error('已达到 40 轮上限，草稿未提交');
    if (!draft.edited) throw new Error('模型未修改场景，请换用支持工具调用的文字模型');
    if (JSON.stringify(doc.value.scene) !== baseline) throw new Error('基础场景发生变化，草稿未提交');
    const result = draft.read(), next = plain(doc.value);
    next.scene = result.scene;
    for (const p of next.plans) p.tracks = p.tracks.filter(t => next.scene.objectList.some(o => o.threeJsonId === t.objectId && (!t.joint || o.objType === 'mannequin')));
    next.plans.push({ ...result.plan, id, instruction }); next.selectedPlanId = id;
    await commit(next, signal); tasks.value = tasks.value.filter(t => t.id !== id);
  } catch (e) { const task = tasks.value.find(t => t.id === id); if (task) task.error = errorText(e); fail(e); }
  finally { clearTimeout(timeout); busy.value = false; decisionId = ''; }
}
async function edit(work: () => Promise<void>) {
  if (busy.value) return; busy.value = true; controller = new AbortController();
  try { await work(); } catch (e) { fail(e); } finally { busy.value = false; }
}
function addMannequin() { void edit(async () => {
  const next = plain(doc.value), object = createMannequinObject(crypto.randomUUID());
  object.position.x = next.scene.objectList.length * 1.5; next.scene.objectList.push(object);
  await commit(next, controller!.signal);
}); }
function makeCameraPlan() { void edit(async () => {
  const next = plain(doc.value), anchors = next.anchors;
  if (!anchors.length) throw new Error('请先添加至少一个关键帧');
  const id = crypto.randomUUID();
  const plan = directorPlanSchema.parse({ name: `手动运镜 ${next.plans.length + 1}`, duration: Math.max(3, (anchors.length - 1) * 3), tracks: [],
    cameraFrames: anchors.map((a, i) => ({ time: i * 3, view: { camera: a.camera, controls: a.controls }, easing: 'smooth' })) });
  next.plans.push({ ...plan, id, instruction: '按关键帧顺序生成，相邻镜头间隔 3 秒' }); next.selectedPlanId = id;
  await commit(next, controller!.signal);
}); }
async function output(file: File, kind: 'image' | 'video' | 'file', addToCanvas: boolean) {
  const result = await storeFile(file, file.name);
  post('output', { output: { kind, portId: kind, source: result.url, name: file.name, mime: file.type, metadata: { addToCanvas } } });
  status.value = `已导出：${file.name}`;
}
async function exportImage(anchor: CameraAnchor, aspect: number, time: number, addToCanvas = true) {
  await edit(async () => {
    exportingImage.value = anchor.id;
    try { const file = await renderImage(plain(doc.value.scene), plain(anchor), aspect, time, controller!.signal, plain(selected.value), plain(lighting.value), plain(doc.value.sceneSettings)); await output(file, 'image', addToCanvas); }
    catch (e) { post('error', { message: errorText(e) }); throw e; }
    finally { exportingImage.value = ''; }
  });
}
async function exportVideo(aspect: number) {
  await edit(async () => {
    if (!selected.value) throw new Error('请先生成或选择方案');
    exportingVideo.value = true; exportProgress.value = 0;
    try { const file = await renderVideo(plain(doc.value.scene), plain(selected.value), aspect, controller!.signal, p => { exportProgress.value = p; }, plain(lighting.value), plain(doc.value.sceneSettings)); await output(file, 'video', true); }
    catch (e) { post('error', { message: errorText(e) }); throw e; }
    finally { exportingVideo.value = false; }
  });
}
function exportProject() { void edit(async () => { await output(new File([JSON.stringify(doc.value, null, 2)], '场景.director3d', { type: 'application/x-hios-director3d' }), 'file', false); }); }
function openJson() { jsonText.value = JSON.stringify(doc.value, null, 2); jsonOpen.value = true; }
function applyJson() { void edit(async () => { if (jsonText.value.length > 4_000_000) throw new Error('工程文件过大'); await commit(documentSchema.parse(JSON.parse(jsonText.value)), controller!.signal); jsonOpen.value = false; }); }
function importLocal(event: Event) {
  const input = event.target as HTMLInputElement, file = input.files?.[0]; input.value = '';
  if (file) void edit(async () => { if (file.size > 4_000_000) throw new Error('工程文件超过 4 MB'); await commit(documentSchema.parse(JSON.parse(await file.text())), controller!.signal); });
}
onBeforeUnmount(() => { disposed = true; clearTimeout(timer); cancel(); disconnect(); });
</script>
