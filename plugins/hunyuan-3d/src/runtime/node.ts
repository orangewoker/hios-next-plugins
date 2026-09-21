import { queryJob, submitJob } from '../api';
import { applyTheme, configureNodeBridge, post, type HostTheme } from '../bridge';
import { loadConfig } from '../storage';
import { DEFAULT_PARAMS, type ApiConfig, type GenerateParams, type ResultFile } from '../types';
import './node.css';

type NodeInput = { text?: unknown; image?: unknown; multiview?: unknown };
type NodeState = Record<string, unknown>;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const field = (id: string) => $<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(id);
const values = ['provider', 'model', 'baseUrl', 'prompt', 'generateType', 'resultFormat', 'enablePBR'];
const secretFields = ['apiKey', 'secretId', 'secretKey'];
let nodeId = '';
let inputs: NodeInput = {};
let state: NodeState = {};
let running = false;
let latestJob = '';
const assetPending = new Map<string, { resolve: (value: string) => void; reject: (reason: Error) => void }>();

function status(message: string) { $('status').textContent = message; $('job').textContent = message; }
function asString(value: unknown) { return typeof value === 'string' ? value.trim() : ''; }
function saveState() {
  state = Object.fromEntries(values.map((key) => [key, key === 'enablePBR' ? (field(key) as HTMLInputElement).checked : field(key).value]));
  post('state', { state });
}
function updateProvider() {
  const native = field('provider').value === 'tencent';
  $('apiKeyRow').hidden = native;
  $('secretIdRow').hidden = !native;
  $('secretKeyRow').hidden = !native;
}
function showInputs() {
  const count = Array.isArray(inputs.multiview) ? inputs.multiview.length : 0;
  $('inputSummary').textContent = count ? `已连接 ${count} 张多视图图片（正面、左侧、右侧、背面）` : asString(inputs.image) ? '已连接单张参考图' : asString(inputs.text) ? '已连接文字提示词' : '可在下方输入提示词，或连接上游节点';
}
function applyState() {
  const config = loadConfig();
  field('provider').value = asString(state.provider) || config.provider;
  field('model').value = asString(state.model) || DEFAULT_PARAMS.model;
  field('baseUrl').value = asString(state.baseUrl) || config.baseUrl;
  field('prompt').value = asString(state.prompt);
  field('generateType').value = asString(state.generateType) || DEFAULT_PARAMS.generateType;
  field('resultFormat').value = asString(state.resultFormat);
  (field('enablePBR') as HTMLInputElement).checked = typeof state.enablePBR === 'boolean' ? state.enablePBR : true;
  secretFields.forEach((key) => { field(key).value ||= key === 'apiKey' ? config.apiKey : key === 'secretId' ? config.secretId : config.secretKey; });
  updateProvider(); showInputs();
}
function configFromForm(): ApiConfig {
  const saved = loadConfig();
  return { ...saved, provider: field('provider').value as ApiConfig['provider'], baseUrl: field('baseUrl').value.trim(), apiKey: field('apiKey').value.trim(), secretId: field('secretId').value.trim(), secretKey: field('secretKey').value.trim() };
}
function requestAsset(source: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    assetPending.set(requestId, { resolve, reject });
    post('asset-read', { requestId, source });
    window.setTimeout(() => { if (assetPending.delete(requestId)) reject(new Error('读取画布图片超时')); }, 30000);
  });
}
async function normalizedImage(source: string) {
  if (/^hios-asset:/i.test(source)) source = await requestAsset(source);
  if (/^https?:\/\//i.test(source)) return source;
  const match = /^data:(image\/(?:png|jpe?g|webp));base64,([a-z0-9+/=]+)$/i.exec(source);
  if (!match) throw new Error('图片输入必须是 HTTP(S) 链接或 JPG、PNG、WEBP 画布图片');
  if (match[2].length > 8 * 1024 * 1024) throw new Error('单张图片不能超过 6 MB');
  return source;
}
async function paramsFromInputs(): Promise<GenerateParams> {
  const prompt = asString(inputs.text) || field('prompt').value.trim();
  const multi = Array.isArray(inputs.multiview) ? inputs.multiview.map(asString).filter(Boolean) : [];
  const image = asString(inputs.image);
  const params: GenerateParams = { ...DEFAULT_PARAMS, model: field('model').value as GenerateParams['model'], prompt, generateType: field('generateType').value as GenerateParams['generateType'], resultFormat: field('resultFormat').value as GenerateParams['resultFormat'], enablePBR: (field('enablePBR') as HTMLInputElement).checked, multiViewImages: [], inputMode: multi.length ? 'multiview' : image ? 'image' : 'text' };
  if (multi.length > 4) throw new Error('多视图最多连接 4 张图片');
  if (multi.length) params.multiViewImages = await Promise.all(multi.map(async (source, index) => ({ viewType: ['front', 'left', 'right', 'back'][index], data: await normalizedImage(source), name: `视图 ${index + 1}` })));
  else if (image) params.image = await normalizedImage(image);
  return params;
}
function modelFile(files: ResultFile[]) { return files.find((file) => file.type === 'GLB') || files.find((file) => /\.(?:glb|obj|fbx|stl|usdz)(?:\?|$)/i.test(file.url)) || files[0]; }
function fileName(file: ResultFile) { return `混元3D-${latestJob}.${(file.type || 'glb').toLowerCase()}`; }
function renderResult(file: ResultFile, preview: string) {
  const result = $('result'); result.replaceChildren();
  const link = document.createElement('a'); link.href = file.url; link.target = '_blank'; link.rel = 'noopener'; link.textContent = `下载 ${file.type || '模型文件'}`; result.append(link);
  if (preview) { const image = document.createElement('img'); image.src = preview; image.alt = '模型预览'; result.append(image); }
}
async function run() {
  if (running) return;
  running = true; ($<HTMLButtonElement>('runBtn')).disabled = true;
  try {
    const config = configFromForm();
    const params = await paramsFromInputs();
    status('正在提交生成任务…');
    latestJob = await submitJob(config, params);
    status(`任务 ${latestJob} 已提交，正在生成…`);
    const started = Date.now();
    let failures = 0;
    while (Date.now() - started < 18 * 60 * 1000) {
      await new Promise((resolve) => window.setTimeout(resolve, Math.max(2, config.pollSeconds) * 1000));
      let response;
      try { response = await queryJob(config, latestJob, params.engine); failures = 0; }
      catch (error) { if (++failures >= 5) throw error; status(`查询暂时失败，正在重试（${failures}/5）`); continue; }
      if (response.status === 'FAIL') throw new Error(response.errorMessage || response.errorCode || '3D 生成失败');
      if (response.status !== 'DONE') { status(`任务 ${latestJob} · ${response.status === 'RUN' ? '生成中' : '排队中'}`); continue; }
      const file = modelFile(response.files);
      if (!file?.url) throw new Error('任务完成，但接口未返回模型文件');
      const preview = response.files.find((item) => item.previewImageUrl)?.previewImageUrl || '';
      const output = { jobId: latestJob, status: response.status, provider: config.provider, model: params.model, inputMode: params.inputMode, files: response.files, creditConsumed: response.creditConsumed, creditDetails: response.creditDetails };
      post('output', { output: { kind: 'file', portId: 'file', source: file.url, url: file.url, name: fileName(file), mime: file.type === 'GLB' ? 'model/gltf-binary' : 'application/octet-stream', metadata: { jobId: latestJob, format: file.type } } });
      if (preview) post('output', { output: { kind: 'image', portId: 'preview', source: preview, url: preview, name: `混元3D-${latestJob}-预览.png`, metadata: { jobId: latestJob } } });
      post('output', { output: { kind: 'json', portId: 'result', value: output } });
      post('run-complete', {});
      renderResult(file, preview);
      status(`生成完成 · ${latestJob}`);
      return;
    }
    throw new Error('任务仍在生成，画布节点等待超时；可在混元3D应用中查询任务 ID：' + latestJob);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    status(message); post('error', { message });
  } finally { running = false; ($<HTMLButtonElement>('runBtn')).disabled = false; }
}

values.forEach((key) => field(key).addEventListener('change', () => {
  if (key === 'provider') {
    const current = field('baseUrl').value.trim();
    if (!current || ['https://api.ai3d.cloud.tencent.com', 'https://ai3d.tencentcloudapi.com'].includes(current)) field('baseUrl').value = field('provider').value === 'tencent' ? 'https://ai3d.tencentcloudapi.com' : 'https://api.ai3d.cloud.tencent.com';
    updateProvider();
  }
  saveState();
}));
$('openApp').addEventListener('click', () => post('open-app', { appId: 'hunyuan-3d' }));
$('runBtn').addEventListener('click', () => void run());
window.addEventListener('message', (event: MessageEvent) => {
  const message = event.data;
  if (!message || message.protocol !== 'hios-plugin-node/v1' || (nodeId && message.nodeId !== nodeId)) return;
  const payload = message.payload || {};
  if (message.type === 'init') {
    nodeId = String(payload.nodeId || message.nodeId || ''); configureNodeBridge(nodeId);
    inputs = payload.inputs || {}; state = payload.state || {};
    applyTheme(payload.theme as HostTheme); applyState(); post('loaded');
  } else if (message.type === 'run') { inputs = payload.inputs || inputs; showInputs(); void run(); }
  else if (message.type === 'asset-result') {
    const pending = assetPending.get(String(payload.requestId || ''));
    if (pending) { assetPending.delete(String(payload.requestId)); if (payload.error) pending.reject(new Error(String(payload.error))); else pending.resolve(String(payload.dataUrl || '')); }
  }
});
configureNodeBridge('');
post('ready');
