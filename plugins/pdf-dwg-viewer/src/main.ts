import { GlobalWorkerOptions, RenderingCancelledException, getDocument, type OnProgressParameters, type PDFDocumentLoadingTask, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist';
import { CadViewer, computeCadDocumentBounds, type CadBounds, type CadDocument, type CadViewerLoadResult, type ViewState } from '@flyfish-dev/cad-viewer';
import '@flyfish-dev/cad-viewer/style.css';
import './styles.css';

type FileDescriptor = { url: string; name: string; mime?: string; size?: number };
type PluginState = {
  page?: number;
  pdfZoom?: number;
  rotation?: number;
  cadBackground?: 'dark' | 'light';
  cadView?: ViewState;
  cadViewFile?: string;
  [key: string]: unknown;
};
type HostInitMessage = {
  protocol: 'hios-plugin-node/v1';
  type: 'init';
  nodeId?: string;
  payload?: {
    nodeId?: string;
    pluginId?: string;
    file?: FileDescriptor;
    state?: PluginState;
  };
};
type HostFileResultMessage = {
  protocol: 'hios-plugin-node/v1';
  type: 'file-result';
  nodeId?: string;
  payload?: {
    requestId?: string;
    files?: FileDescriptor[];
    canceled?: boolean;
    error?: string;
  };
};
type HostMessage = HostInitMessage | HostFileResultMessage;

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const formatBadge = byId<HTMLSpanElement>('formatBadge');
const fileName = byId<HTMLSpanElement>('fileName');
const pdfControls = byId<HTMLDivElement>('pdfControls');
const cadControls = byId<HTMLDivElement>('cadControls');
const previousPage = byId<HTMLButtonElement>('previousPage');
const nextPage = byId<HTMLButtonElement>('nextPage');
const pageNumber = byId<HTMLInputElement>('pageNumber');
const pageCount = byId<HTMLSpanElement>('pageCount');
const rotatePage = byId<HTMLButtonElement>('rotatePage');
const zoomOut = byId<HTMLButtonElement>('zoomOut');
const zoomIn = byId<HTMLButtonElement>('zoomIn');
const fitView = byId<HTMLButtonElement>('fitView');
const toggleBackground = byId<HTMLButtonElement>('toggleBackground');
const openFile = byId<HTMLButtonElement>('openFile');
const emptyOpenFile = byId<HTMLButtonElement>('emptyOpenFile');
const retryOpen = byId<HTMLButtonElement>('retryOpen');
const exportImage = byId<HTMLButtonElement>('exportImage');
const emptyState = byId<HTMLDivElement>('emptyState');
const errorState = byId<HTMLDivElement>('errorState');
const errorMessage = byId<HTMLSpanElement>('errorMessage');
const pdfStage = byId<HTMLDivElement>('pdfStage');
const cadStage = byId<HTMLDivElement>('cadStage');
const pdfCanvas = byId<HTMLCanvasElement>('pdfCanvas');
const loadingOverlay = byId<HTMLDivElement>('loadingOverlay');
const loadingTitle = byId<HTMLElement>('loadingTitle');
const loadingDetail = byId<HTMLElement>('loadingDetail');
const loadingProgress = byId<HTMLProgressElement>('loadingProgress');
const statusText = byId<HTMLSpanElement>('statusText');
const viewInfo = byId<HTMLSpanElement>('viewInfo');

GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.mjs', document.baseURI).href;

let nodeId = '';
let pluginId = '';
let activeFile: FileDescriptor | undefined;
let activeKind: 'pdf' | 'dwg' | 'dxf' | '' = '';
let state: PluginState = { page: 1, pdfZoom: 1, rotation: 0, cadBackground: 'dark' };
let pdfDocument: PDFDocumentProxy | undefined;
let pdfLoadingTask: PDFDocumentLoadingTask | undefined;
let pdfRenderTask: RenderTask | undefined;
let pdfRenderRevision = 0;
let cadViewer: CadViewer | undefined;
let cadFitScale = 1;
let openingRevision = 0;
let suppressCadState = false;
let lastOpenFailed = false;
let pendingFileRequestId = '';
let initialized = false;
let readyAttempts = 0;
let readyTimer: number | undefined;

function post(type: string, payload: Record<string, unknown> = {}) {
  window.parent.postMessage({ protocol: 'hios-plugin-node/v1', ...(nodeId ? { nodeId } : {}), ...(pluginId ? { pluginId } : {}), type, payload }, '*');
}

function sendState(patch: PluginState) {
  state = { ...state, ...patch };
  post('state', { state });
}

function fileKind(file: FileDescriptor) {
  const extension = file.name.toLowerCase().match(/\.([^.]+)$/)?.[1] || '';
  if (extension === 'pdf' || file.mime === 'application/pdf') return 'pdf';
  if (extension === 'dwg' || /dwg|acad/i.test(file.mime || '')) return 'dwg';
  if (extension === 'dxf' || /dxf/i.test(file.mime || '')) return 'dxf';
  return '';
}

function setLoading(open: boolean, title = '正在打开文件', detail = '准备渲染器…', progress = 0) {
  loadingOverlay.hidden = !open;
  loadingTitle.textContent = title;
  loadingDetail.textContent = detail;
  loadingProgress.value = Math.max(0, Math.min(100, progress));
}

function showError(error: unknown) {
  setLoading(false);
  emptyState.hidden = true;
  pdfStage.hidden = true;
  cadStage.hidden = true;
  pdfControls.hidden = true;
  cadControls.hidden = true;
  exportImage.disabled = true;
  errorMessage.textContent = error instanceof Error ? error.message : String(error);
  errorState.hidden = false;
  statusText.textContent = '打开失败';
  post('error', { message: errorMessage.textContent });
}

function isRenderingCancellation(error: unknown) {
  return error instanceof RenderingCancelledException
    || (error instanceof Error && error.name === 'RenderingCancelledException');
}

function cancelPdfRender() {
  pdfRenderRevision += 1;
  const task = pdfRenderTask;
  task?.cancel();
}

async function sourceBytes(file: FileDescriptor) {
  const response = await fetch(file.url);
  if (!response.ok) throw new Error(`读取文件失败（HTTP ${response.status}）`);
  return response.arrayBuffer();
}

async function renderPdf(pageValue = Number(state.page || 1)) {
  const document = pdfDocument;
  if (!document) return false;
  const revision = ++pdfRenderRevision;
  const previousTask = pdfRenderTask;
  previousTask?.cancel();
  let task: RenderTask | undefined;
  try {
    if (previousTask) {
      try { await previousTask.promise; }
      catch (error) {
        if (!isRenderingCancellation(error) && revision === pdfRenderRevision && document === pdfDocument) throw error;
      }
    }
    if (revision !== pdfRenderRevision || document !== pdfDocument) return false;
    if (pdfRenderTask === previousTask) pdfRenderTask = undefined;
    const page = Math.max(1, Math.min(document.numPages, Math.round(pageValue)));
    const zoom = Math.max(.25, Math.min(4, Number(state.pdfZoom || 1)));
    const rotation = ((Math.round(Number(state.rotation || 0)) % 360) + 360) % 360;
    const pdfPage = await document.getPage(page);
    if (revision !== pdfRenderRevision || document !== pdfDocument) return false;
    const baseViewport = pdfPage.getViewport({ scale: 1, rotation });
    const fit = Math.max(.12, (Math.max(220, pdfStage.clientWidth) - 38) / Math.max(1, baseViewport.width));
    const cssScale = fit * zoom;
    const pixelRatio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const viewport = pdfPage.getViewport({ scale: cssScale * pixelRatio, rotation });
    pdfCanvas.width = Math.max(1, Math.round(viewport.width));
    pdfCanvas.height = Math.max(1, Math.round(viewport.height));
    pdfCanvas.style.width = `${Math.max(1, viewport.width / pixelRatio)}px`;
    pdfCanvas.style.height = `${Math.max(1, viewport.height / pixelRatio)}px`;
    const context = pdfCanvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('浏览器无法创建 PDF Canvas');
    task = pdfPage.render({ canvasContext: context, viewport });
    pdfRenderTask = task;
    await task.promise;
    if (revision !== pdfRenderRevision || document !== pdfDocument) return false;
    state = { ...state, page, pdfZoom: zoom, rotation };
    pageNumber.value = String(page);
    pageNumber.max = String(document.numPages);
    pageCount.textContent = `/ ${document.numPages}`;
    previousPage.disabled = page <= 1;
    nextPage.disabled = page >= document.numPages;
    exportImage.disabled = false;
    statusText.textContent = `PDF · 第 ${page} / ${document.numPages} 页`;
    viewInfo.textContent = `${Math.round(zoom * 100)}% · ${rotation}°`;
    return true;
  } catch (error) {
    if (isRenderingCancellation(error) || revision !== pdfRenderRevision || document !== pdfDocument) return false;
    throw error;
  } finally {
    if (task && pdfRenderTask === task) pdfRenderTask = undefined;
  }
}

function requestPdfRender(pageValue = Number(state.page || 1)) {
  void renderPdf(pageValue).catch((error) => {
    if (!isRenderingCancellation(error) && activeKind === 'pdf') showError(error);
  });
}

async function openPdf(file: FileDescriptor, revision: number) {
  setLoading(true, '正在打开 PDF', '读取文件…', 8);
  const bytes = await sourceBytes(file);
  if (revision !== openingRevision) return;
  const loadingTask = getDocument({ data: new Uint8Array(bytes) });
  pdfLoadingTask = loadingTask;
  loadingTask.onProgress = ({ loaded, total }: OnProgressParameters) => {
    if (revision === openingRevision && pdfLoadingTask === loadingTask) {
      setLoading(true, '正在打开 PDF', '解析页面和字体…', total ? 12 + loaded / total * 68 : 42);
    }
  };
  const loadedDocument = await loadingTask.promise;
  if (revision !== openingRevision || pdfLoadingTask !== loadingTask) return;
  pdfDocument = loadedDocument;
  pdfStage.hidden = false;
  pdfControls.hidden = false;
  setLoading(true, '正在打开 PDF', '渲染当前页面…', 88);
  await renderPdf(Number(state.page || 1));
  if (revision === openingRevision) setLoading(false);
}

function cadBackground() {
  return state.cadBackground === 'light'
    ? { background: '#f4f5f7', foreground: '#17191d' }
    : { background: '#0d1014', foreground: '#eef2f7' };
}

function finiteBounds(bounds: CadBounds) {
  return [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].every(Number.isFinite)
    && bounds.minX <= bounds.maxX
    && bounds.minY <= bounds.maxY;
}

function sortedQuantile(values: number[], quantile: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * quantile))];
}

function robustCadBounds(document: CadDocument) {
  const sampleStep = Math.max(1, Math.ceil(document.entities.length / 4_000));
  const entityBounds = document.entities
    .filter((_entity, index) => index % sampleStep === 0)
    .map((entity) => computeCadDocumentBounds({ ...document, pages: [], entities: [entity] }))
    .filter(finiteBounds);
  if (entityBounds.length < 8) return undefined;
  const centers = entityBounds.map((bounds) => ({ bounds, x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 }));
  const medianX = sortedQuantile(centers.map(({ x }) => x), .5);
  const medianY = sortedQuantile(centers.map(({ y }) => y), .5);
  const deviationsX = centers.map(({ x }) => Math.abs(x - medianX));
  const deviationsY = centers.map(({ y }) => Math.abs(y - medianY));
  const thresholdX = Math.max(1e-6, sortedQuantile(deviationsX, .5) * 12, sortedQuantile(deviationsX, .9) * 3);
  const thresholdY = Math.max(1e-6, sortedQuantile(deviationsY, .5) * 12, sortedQuantile(deviationsY, .9) * 3);
  const selected = centers.filter(({ x, y }) => Math.abs(x - medianX) <= thresholdX && Math.abs(y - medianY) <= thresholdY);
  if (selected.length < Math.max(3, Math.floor(entityBounds.length * .5))) return undefined;
  const merged = selected.reduce<CadBounds>((bounds, item) => ({
    minX: Math.min(bounds.minX, item.bounds.minX),
    minY: Math.min(bounds.minY, item.bounds.minY),
    maxX: Math.max(bounds.maxX, item.bounds.maxX),
    maxY: Math.max(bounds.maxY, item.bounds.maxY),
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  return finiteBounds(merged) ? merged : undefined;
}

function cadFitView(viewer: CadViewer): ViewState | undefined {
  const document = viewer.getDocument();
  if (!document) return undefined;
  const bounds = robustCadBounds(document) || computeCadDocumentBounds(document);
  if (!finiteBounds(bounds)) return undefined;
  const width = Math.max(1e-9, bounds.maxX - bounds.minX);
  const height = Math.max(1e-9, bounds.maxY - bounds.minY);
  const scale = Math.min(Math.max(1, viewer.canvas.clientWidth) / width, Math.max(1, viewer.canvas.clientHeight) / height) * .92;
  if (!Number.isFinite(scale) || scale <= 0) return undefined;
  return { centerX: (bounds.minX + bounds.maxX) / 2, centerY: (bounds.minY + bounds.maxY) / 2, scale };
}

function fitCadToContent(viewer = cadViewer) {
  if (!viewer) return;
  const fit = cadFitView(viewer);
  if (fit) {
    cadFitScale = fit.scale;
    viewer.renderer.setViewState(fit);
  } else {
    viewer.fit('extents');
    cadFitScale = viewer.renderer.getViewState().scale;
  }
}

function cadFileKey(file: FileDescriptor) {
  return `${file.url}\n${file.name}`;
}

async function openCad(file: FileDescriptor, revision: number) {
  setLoading(true, `正在打开 ${activeKind.toUpperCase()}`, '启动 CAD 解析器…', 5);
  const bytes = await sourceBytes(file);
  if (revision !== openingRevision) return;
  cadStage.hidden = false;
  cadControls.hidden = false;
  const colors = cadBackground();
  const restored = state.cadViewFile === cadFileKey(file) ? state.cadView : undefined;
  suppressCadState = true;
  cadViewer = new CadViewer({
    container: cadStage,
    renderer: 'canvas2d',
    wasmPath: new URL('wasm/', document.baseURI).href,
    workerUrl: new URL('wasm/dwg-worker.js', document.baseURI),
    dwfWasmUrl: new URL('wasm/dwfv-render.wasm', document.baseURI).href,
    useWorker: true,
    workerTimeoutMs: 120_000,
    autoFit: true,
    canvasOptions: { ...colors, fitMode: 'auto', contrastMode: 'adaptive', minColorContrast: 2.45, showUnsupportedMarkers: false },
    onLoadProgress(progress) {
      const percent = Number(progress.percent || 0);
      setLoading(true, `正在打开 ${activeKind.toUpperCase()}`, progress.message || progress.phase || '解析图元…', Math.max(8, Math.min(92, percent)));
    },
    onViewChange(event) {
      const zoomPercent = Math.abs(cadFitScale) < 1e-12 ? 100 : event.view.scale / cadFitScale * 100;
      viewInfo.textContent = `${Math.round(zoomPercent)}% · 本地 CAD`;
      if (!suppressCadState) sendState({ cadView: event.view, cadViewFile: activeFile ? cadFileKey(activeFile) : '' });
    },
  });
  let result: CadViewerLoadResult;
  try {
    result = await cadViewer.loadBuffer(bytes, file.name);
    if (revision !== openingRevision) return;
    const fit = cadFitView(cadViewer);
    if (fit) cadFitScale = fit.scale;
    if (restored && [restored.centerX, restored.centerY, restored.scale].every(Number.isFinite)) cadViewer.renderer.setViewState(restored);
    else if (fit) cadViewer.renderer.setViewState(fit);
    else fitCadToContent(cadViewer);
  } finally {
    suppressCadState = false;
  }
  if (revision !== openingRevision) return;
  const currentView = cadViewer.renderer.getViewState();
  sendState({ cadView: currentView, cadViewFile: cadFileKey(file) });
  exportImage.disabled = false;
  statusText.textContent = `${activeKind.toUpperCase()} · ${result.summary.entityCount.toLocaleString()} 个图元 · ${result.summary.layerCount.toLocaleString()} 个图层`;
  setLoading(false);
}

async function openDescriptor(file: FileDescriptor) {
  const kind = fileKind(file);
  if (!kind) return showError('只支持 PDF、DWG 与 DXF 文件');
  const revision = ++openingRevision;
  activeFile = file;
  activeKind = kind;
  lastOpenFailed = false;
  cancelPdfRender();
  void pdfLoadingTask?.destroy();
  pdfLoadingTask = undefined;
  pdfDocument = undefined;
  cadViewer?.destroy();
  cadViewer = undefined;
  emptyState.hidden = true;
  errorState.hidden = true;
  pdfStage.hidden = true;
  cadStage.hidden = true;
  pdfControls.hidden = true;
  cadControls.hidden = true;
  exportImage.disabled = true;
  fileName.textContent = file.name;
  fileName.title = file.name;
  formatBadge.textContent = kind.toUpperCase();
  formatBadge.className = `format-badge ${kind}`;
  try {
    if (kind === 'pdf') await openPdf(file, revision);
    else await openCad(file, revision);
    if (revision !== openingRevision) return;
    lastOpenFailed = false;
    post('loaded', { file: { name: file.name, mime: file.mime, size: file.size }, kind });
  } catch (error) {
    if (revision === openingRevision) {
      lastOpenFailed = true;
      showError(error);
    }
  }
}

function requestFile() {
  pendingFileRequestId = crypto.randomUUID();
  post('request-file', { requestId: pendingFileRequestId, accept: '.pdf,.dwg,.dxf,application/pdf,application/vnd.dwg,application/dxf' });
}

function exportCurrentView() {
  const canvas = activeKind === 'pdf' ? pdfCanvas : cadViewer?.canvas;
  if (!canvas || !activeFile) return;
  try {
    if (activeKind !== 'pdf') cadViewer?.renderer.render();
    const dataUrl = canvas.toDataURL('image/png');
    const suffix = activeKind === 'pdf' ? `-page-${state.page || 1}` : '-view';
    const stem = activeFile.name.replace(/\.[^.]+$/, '') || 'document';
    post('output', { kind: 'image', portId: 'image', source: dataUrl, dataUrl, mime: 'image/png', name: `${stem}${suffix}.png`, width: canvas.width, height: canvas.height });
    statusText.textContent = '当前视图已更新到 image 输出端口';
  } catch (error) { showError(error); }
}

previousPage.addEventListener('click', () => { sendState({ page: Math.max(1, Number(state.page || 1) - 1) }); requestPdfRender(Number(state.page)); });
nextPage.addEventListener('click', () => { sendState({ page: Math.min(pdfDocument?.numPages || 1, Number(state.page || 1) + 1) }); requestPdfRender(Number(state.page)); });
pageNumber.addEventListener('change', () => { sendState({ page: Number(pageNumber.value) }); requestPdfRender(Number(pageNumber.value)); });
rotatePage.addEventListener('click', () => { sendState({ rotation: (Number(state.rotation || 0) + 90) % 360 }); requestPdfRender(Number(state.page || 1)); });
zoomOut.addEventListener('click', () => cadViewer?.zoomOut());
zoomIn.addEventListener('click', () => cadViewer?.zoomIn());
fitView.addEventListener('click', () => fitCadToContent());
toggleBackground.addEventListener('click', () => {
  const next = state.cadBackground === 'light' ? 'dark' : 'light';
  sendState({ cadBackground: next });
  cadViewer?.setCanvasOptions(cadBackground());
});
openFile.addEventListener('click', requestFile);
emptyOpenFile.addEventListener('click', requestFile);
retryOpen.addEventListener('click', requestFile);
exportImage.addEventListener('click', exportCurrentView);

pdfStage.addEventListener('wheel', (event) => {
  if (!event.ctrlKey && !event.metaKey) return;
  event.preventDefault();
  const next = Math.max(.25, Math.min(4, Number(state.pdfZoom || 1) * (event.deltaY < 0 ? 1.1 : .9)));
  sendState({ pdfZoom: Number(next.toFixed(3)) });
  requestPdfRender(Number(state.page || 1));
}, { passive: false });

window.addEventListener('message', (event: MessageEvent<HostMessage>) => {
  const message = event.data;
  if (event.source !== window.parent || !message || message.protocol !== 'hios-plugin-node/v1') return;
  if (message.type === 'file-result') {
    const payload = message.payload || {};
    if (!pendingFileRequestId || (payload.requestId && payload.requestId !== pendingFileRequestId)) return;
    pendingFileRequestId = '';
    if (payload.error) return showError(payload.error);
    const selected = Array.isArray(payload.files) ? payload.files.find((file) => Boolean(file?.url && file?.name)) : undefined;
    if (selected) void openDescriptor(selected);
    return;
  }
  const payload = message.payload || {};
  nodeId = String(payload.nodeId || message.nodeId || '');
  pluginId = String(payload.pluginId || '');
  initialized = true;
  if (readyTimer !== undefined) window.clearInterval(readyTimer);
  readyTimer = undefined;
  state = { page: 1, pdfZoom: 1, rotation: 0, cadBackground: 'dark', ...(payload.state || {}) };
  if (payload.file?.url) {
    const sameFile = activeFile?.url === payload.file.url && activeFile.name === payload.file.name;
    if (!sameFile || lastOpenFailed) void openDescriptor(payload.file);
  }
  else {
    activeFile = undefined;
    activeKind = '';
    emptyState.hidden = false;
    errorState.hidden = true;
    setLoading(false);
  }
});

window.addEventListener('beforeunload', () => {
  if (readyTimer !== undefined) window.clearInterval(readyTimer);
  cancelPdfRender();
  void pdfLoadingTask?.destroy();
  cadViewer?.destroy();
});

function announceReady() {
  if (initialized || readyAttempts >= 12) {
    if (readyTimer !== undefined) window.clearInterval(readyTimer);
    readyTimer = undefined;
    return;
  }
  readyAttempts += 1;
  post('ready', { attempt: readyAttempts });
}

announceReady();
readyTimer = window.setInterval(announceReady, 750);
