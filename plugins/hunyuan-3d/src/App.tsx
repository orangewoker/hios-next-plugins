import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Check, ChevronDown, CircleAlert, Clock3, Download, Eye, FileBox, Grid3X3, ImagePlus, LoaderCircle, Maximize2, Play, RefreshCw, RotateCcw, Settings, SlidersHorizontal, Sparkles, Trash2, Upload, WandSparkles, X } from 'lucide-react';
import { downloadBinary, probeConnection, queryJob, submitJob } from './api';
import { applyTheme, ready, saveHostState, type HostTheme } from './bridge';
import { cacheFile, readCachedFile, removeCachedJob } from './cache';
import { ModelViewer, type ViewerOptions } from './ModelViewer';
import { preparePreview } from './preview';
import { loadConfig, loadJobs, saveConfig, saveJobs } from './storage';
import { DEFAULT_PARAMS, type ApiConfig, type GenerateParams, type JobRecord, type ResultFile } from './types';
import './styles.css';

const previewTypes = new Set(['GLB', 'GLTF', 'OBJ', 'FBX', 'STL']);
const terminal = new Set(['DONE', 'FAIL']);

function cloneParams(): GenerateParams { return { ...DEFAULT_PARAMS, multiViewImages: [] }; }
function timeLabel(value: number) { return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(value); }
function formatNumber(value: number) { return new Intl.NumberFormat('zh-CN').format(value); }
function statusLabel(status: JobRecord['status']) { return ({ WAIT: '等待中', RUN: '生成中', DONE: '已完成', FAIL: '失败' })[status]; }
function fileExtension(file: ResultFile) {
  const fromType = file.type.toLowerCase();
  try { return new URL(file.url).pathname.split('.').pop()?.toLowerCase() || fromType; } catch { return fromType; }
}

async function fileToDataUrl(file: File) {
  if (file.size > 6 * 1024 * 1024) throw new Error('单张图片不能超过 6 MB');
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) throw new Error('仅支持 JPG、PNG 和 WEBP 图片');
  return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || '')); reader.onerror = () => reject(reader.error || new Error('读取图片失败')); reader.readAsDataURL(file); });
}

export default function App() {
  const [config, setConfig] = useState<ApiConfig>(() => loadConfig());
  const configRef = useRef(config); configRef.current = config;
  const [params, setParams] = useState<GenerateParams>(() => cloneParams());
  const [jobs, setJobs] = useState<JobRecord[]>(() => loadJobs());
  const jobsRef = useRef(jobs); jobsRef.current = jobs;
  const [selectedJobId, setSelectedJobId] = useState(jobs[0]?.id || '');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [connectionState, setConnectionState] = useState<'idle' | 'testing' | 'ready' | 'error'>('idle');
  const [viewer, setViewer] = useState<ViewerOptions>({ wireframe: false, grid: true, axes: false, whiteModel: false, metalness: .15, roughness: .48, background: '#0d1118' });
  const [viewerSource, setViewerSource] = useState('');
  const [viewerType, setViewerType] = useState('');
  const [viewerResources, setViewerResources] = useState<Record<string, string> | undefined>(undefined);
  const [viewerMaterialText, setViewerMaterialText] = useState<string | undefined>(undefined);
  const [viewerStats, setViewerStats] = useState({ triangles: 0, objects: 0 });
  const [loadingModel, setLoadingModel] = useState(false);
  const previewRelease = useRef<(() => void) | null>(null);
  const cachePending = useRef(new Set<string>());
  const pollers = useRef(new Map<string, number>());

  const selectedJob = jobs.find((job) => job.id === selectedJobId) || null;
  const activeCount = jobs.filter((job) => !terminal.has(job.status)).length;

  const updateJobs = useCallback((mutate: (current: JobRecord[]) => JobRecord[]) => {
    const next = mutate(jobsRef.current);
    jobsRef.current = next;
    setJobs(next);
    saveJobs(next);
  }, []);

  const message = useCallback((text: string, error = false) => {
    setNotice({ text, error }); window.setTimeout(() => setNotice((current) => current?.text === text ? null : current), 3600);
  }, []);

  const cacheCompletedJob = useCallback(async (localId: string, files: ResultFile[]) => {
    if (cachePending.current.has(localId)) return;
    cachePending.current.add(localId);
    try {
      for (let index = 0; index < files.length; index++) {
        if (files[index].cached) continue;
        const existing = await readCachedFile(localId, index);
        if (existing) {
          updateJobs((current) => current.map((item) => item.id === localId ? { ...item, files: item.files.map((file, fileIndex) => fileIndex === index ? { ...file, cached: true, size: existing.size } : file) } : item));
          continue;
        }
        try {
          const blob = await downloadBinary(configRef.current, files[index].url);
          await cacheFile(localId, index, blob);
          updateJobs((current) => current.map((item) => item.id === localId ? { ...item, files: item.files.map((file, fileIndex) => fileIndex === index ? { ...file, cached: true, size: blob.size } : file) } : item));
        } catch { /* Keep the expiring remote link available for manual retry. */ }
      }
    } finally { cachePending.current.delete(localId); }
  }, [updateJobs]);

  const poll = useCallback(async (localId: string) => {
    const job = jobsRef.current.find((item) => item.id === localId);
    if (!job || terminal.has(job.status)) return;
    try {
      const result = await queryJob(configRef.current, job.jobId, job.params.engine);
      updateJobs((current) => current.map((item) => item.id === localId ? { ...item, ...result, updatedAt: Date.now() } : item));
      if (result.status === 'DONE') void cacheCompletedJob(localId, result.files);
      if (!terminal.has(result.status)) {
        const timer = window.setTimeout(() => void poll(localId), Math.max(2, configRef.current.pollSeconds) * 1000);
        pollers.current.set(localId, timer);
      } else pollers.current.delete(localId);
    } catch (error) {
      updateJobs((current) => current.map((item) => item.id === localId ? { ...item, updatedAt: Date.now(), errorMessage: error instanceof Error ? error.message : String(error) } : item));
      const timer = window.setTimeout(() => void poll(localId), Math.max(5, configRef.current.pollSeconds * 2) * 1000);
      pollers.current.set(localId, timer);
    }
  }, [cacheCompletedJob, updateJobs]);

  useEffect(() => {
    ready((payload) => {
      applyTheme(payload.theme as HostTheme | undefined);
      const saved = payload.state as Record<string, unknown> | undefined;
      if (typeof saved?.historyOpen === 'boolean') setHistoryOpen(saved.historyOpen);
      if (typeof saved?.advancedOpen === 'boolean') setAdvancedOpen(saved.advancedOpen);
    });
    jobsRef.current.filter((job) => !terminal.has(job.status)).forEach((job) => void poll(job.id));
    return () => { pollers.current.forEach((timer) => clearTimeout(timer)); previewRelease.current?.(); };
  }, [poll]);

  useEffect(() => { saveHostState({ historyOpen, advancedOpen, selectedJobId }); }, [advancedOpen, historyOpen, selectedJobId]);

  const submit = async () => {
    setBusy(true);
    try {
      saveConfig(config);
      const jobId = await submitJob(config, params);
      const record: JobRecord = { id: crypto.randomUUID(), jobId, provider: config.provider, status: 'WAIT', createdAt: Date.now(), updatedAt: Date.now(), params: structuredClone(params), files: [] };
      updateJobs((current) => [record, ...current]); setSelectedJobId(record.id); setViewerSource(''); setViewerType(''); setViewerStats({ triangles: 0, objects: 0 }); message(`任务已提交：${jobId}`); void poll(record.id);
    } catch (error) { message(error instanceof Error ? error.message : String(error), true); }
    finally { setBusy(false); }
  };

  const testConnection = async () => {
    setConnectionState('testing');
    try { saveConfig(config); const result = await probeConnection(config); setConnectionState('ready'); message(result); }
    catch (error) { setConnectionState('error'); message(error instanceof Error ? error.message : String(error), true); }
  };

  const getResultBlob = async (job: JobRecord, file: ResultFile) => {
    const index = job.files.findIndex((candidate) => candidate.url === file.url);
    return (index >= 0 ? await readCachedFile(job.id, index) : null) || downloadBinary(configRef.current, file.url);
  };

  const openModel = async (job: JobRecord, file: ResultFile) => {
    if (!previewTypes.has(file.type.toUpperCase()) && fileExtension(file) !== 'zip') { message('该格式暂不支持直接预览，请下载后使用'); return; }
    setLoadingModel(true);
    try {
      const blob = await getResultBlob(job, file);
      const prepared = await preparePreview(blob, file.url, file.type);
      previewRelease.current?.(); previewRelease.current = prepared.release;
      setViewerSource(prepared.url); setViewerType(prepared.type); setViewerResources(prepared.resources); setViewerMaterialText(prepared.materialText);
      message(`已载入 ${prepared.type} 模型`);
    } catch (error) { message(error instanceof Error ? error.message : String(error), true); }
    finally { setLoadingModel(false); }
  };

  useEffect(() => {
    if (selectedJob?.status !== 'DONE' || viewerSource) return;
    const candidate = selectedJob.files.find((file) => file.type.toUpperCase() === 'GLB')
      || selectedJob.files.find((file) => previewTypes.has(file.type.toUpperCase()) || fileExtension(file) === 'zip');
    if (candidate) void openModel(selectedJob, candidate);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedJob?.id, selectedJob?.status]);

  const download = async (job: JobRecord, file: ResultFile) => {
    try {
      const blob = await getResultBlob(job, file); const source = URL.createObjectURL(blob);
      const anchor = document.createElement('a'); anchor.href = source; anchor.download = `hunyuan-${job.jobId}.${fileExtension(file) || file.type.toLowerCase() || 'bin'}`; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(source), 30_000);
    } catch (error) { message(error instanceof Error ? error.message : String(error), true); }
  };

  const pickImage = async (file: File | undefined, multiview = false, viewType = 'left') => {
    if (!file) return;
    try {
      const data = await fileToDataUrl(file);
      if (multiview) setParams((current) => ({ ...current, multiViewImages: [...current.multiViewImages.filter((item) => item.viewType !== viewType), { viewType, data, name: file.name }] }));
      else setParams((current) => ({ ...current, image: data, imageName: file.name }));
    } catch (error) { message(error instanceof Error ? error.message : String(error), true); }
  };

  const outputOptions = params.engine === 'rapid' ? ['', 'OBJ', 'GLB', 'STL', 'USDZ', 'FBX', 'MP4'] : ['', 'STL', 'USDZ', 'FBX'];

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark"><Box size={19}/></span><div><strong>混元3D</strong><small>AI MODEL STUDIO</small></div></div>
      <div className="topbar-center"><span className={`connection ${connectionState}`}><i />{config.provider === 'openai' ? 'OpenAI 兼容接口' : '腾讯云 API 3.0'}</span>{activeCount > 0 && <span className="running-pill"><LoaderCircle size={13}/>{activeCount} 个任务运行中</span>}</div>
      <div className="topbar-actions"><button className="icon-button" title="显示历史" onClick={() => setHistoryOpen((value) => !value)}><Clock3 size={17}/></button><button className="settings-button" onClick={() => setSettingsOpen(true)}><Settings size={16}/><span>API 设置</span></button></div>
    </header>

    <main className={`workspace ${historyOpen ? '' : 'history-hidden'}`}>
      <aside className="generation-panel panel-scroll">
        <section className="panel-heading"><div><span className="eyebrow"><Sparkles size={13}/>新建任务</span><h2>生成 3D 模型</h2></div></section>

        <div className="segmented three">{([['text', '文字'], ['image', '单图'], ['multiview', '多视图']] as const).map(([value, label]) => <button key={value} className={params.inputMode === value ? 'active' : ''} onClick={() => setParams((current) => ({ ...current, inputMode: value }))}>{label}</button>)}</div>

        {params.inputMode !== 'text' && <div className="input-card">
          {params.inputMode === 'image' ? <label className={`upload-zone ${params.image ? 'has-image' : ''}`}>
            {params.image ? <><img src={params.image}/><span>{params.imageName || '参考图'}<b>点击替换</b></span></> : <><ImagePlus size={25}/><strong>上传参考图</strong><small>JPG / PNG / WEBP · 最大 6 MB</small></>}
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void pickImage(event.target.files?.[0])}/>
          </label> : <div className="multiview-grid">{(params.model === '3.0' ? ['front', 'left', 'right', 'back'] : ['front', 'left', 'right', 'back', 'top', 'bottom', 'left_front', 'right_front']).map((viewType) => {
            const current = params.multiViewImages.find((item) => item.viewType === viewType);
            return <label className={`view-slot ${current ? 'filled' : ''}`} key={viewType}>{current ? <img src={current.data}/> : <Upload size={16}/>}<span>{({front:'正面',left:'左',right:'右',back:'后',top:'上',bottom:'下',left_front:'左前',right_front:'右前'} as Record<string,string>)[viewType]}</span><input type="file" accept="image/jpeg,image/png" onChange={(event) => void pickImage(event.target.files?.[0], true, viewType)}/></label>;
          })}</div>}
        </div>}

        <label className="field prompt-field"><span>{params.inputMode === 'text' ? '提示词' : '补充描述'}<em>{params.prompt.length}/1024</em></span><textarea value={params.prompt} maxLength={1024} placeholder={params.inputMode === 'text' ? '例如：一只穿着宇航服的柯基，卡通风格，完整全身…' : '可选：补充形状、材质或风格要求'} onChange={(event) => setParams((current) => ({ ...current, prompt: event.target.value }))}/></label>

        <div className="field-row"><label className="field"><span>服务模式</span><select value={params.engine} onChange={(event) => setParams((current) => ({ ...current, engine: event.target.value as GenerateParams['engine'] }))}><option value="pro">专业版</option><option value="rapid">极速版</option></select></label><label className="field"><span>模型版本</span><select value={params.model} onChange={(event) => setParams((current) => ({ ...current, model: event.target.value as GenerateParams['model'], multiViewImages: event.target.value === '3.0' ? current.multiViewImages.filter((item) => ['front','left','right','back'].includes(item.viewType)) : current.multiViewImages, generateType: event.target.value === '3.1' && ['LowPoly','Sketch'].includes(current.generateType) ? 'Normal' : current.generateType }))}><option value="3.0">Hunyuan 3.0</option><option value="3.1">Hunyuan 3.1</option></select></label></div>

        <button className="section-toggle" onClick={() => setAdvancedOpen((value) => !value)}><span><SlidersHorizontal size={15}/>生成参数</span><ChevronDown size={15} className={advancedOpen ? 'rotated' : ''}/></button>
        {advancedOpen && <div className="advanced-fields">
          {params.engine === 'pro' && <><label className="field"><span>生成类型</span><div className="segmented two-lines">{(['Normal','LowPoly','Geometry','Sketch'] as const).map((value) => <button key={value} disabled={params.model === '3.1' && ['LowPoly','Sketch'].includes(value)} className={params.generateType === value ? 'active' : ''} onClick={() => setParams((current) => ({ ...current, generateType: value }))}>{value}</button>)}</div></label>
          {params.generateType !== 'LowPoly' && <label className="field range-field"><span>模型面数 <em>{formatNumber(params.faceCount)}</em></span><input type="range" min="3000" max="1500000" step="1000" value={params.faceCount} onChange={(event) => setParams((current) => ({ ...current, faceCount: Number(event.target.value) }))}/><div><small>3,000</small><small>1,500,000</small></div></label>}
          {params.generateType === 'LowPoly' && <label className="field"><span>拓扑类型</span><div className="segmented"><button className={params.polygonType === 'triangle' ? 'active' : ''} onClick={() => setParams((current) => ({ ...current, polygonType: 'triangle' }))}>三角面</button><button className={params.polygonType === 'quadrilateral' ? 'active' : ''} onClick={() => setParams((current) => ({ ...current, polygonType: 'quadrilateral' }))}>四边面</button></div></label>}</>}
          <div className="field-row"><label className="field toggle-field"><span>PBR 材质</span><button className={`switch ${params.enablePBR ? 'on' : ''}`} onClick={() => setParams((current) => ({ ...current, enablePBR: !current.enablePBR }))}><i/></button></label><label className="field"><span>附加格式</span><select value={params.resultFormat} onChange={(event) => setParams((current) => ({ ...current, resultFormat: event.target.value as GenerateParams['resultFormat'] }))}>{outputOptions.map((value) => <option key={value} value={value}>{value || (params.engine === 'pro' ? '默认 OBJ + GLB' : '使用默认格式')}</option>)}</select></label></div>
        </div>}

        <button className="generate-button" disabled={busy} onClick={() => void submit()}>{busy ? <LoaderCircle className="spin" size={18}/> : <WandSparkles size={18}/>}<span>{busy ? '正在提交…' : '开始生成'}</span></button>
      </aside>

      <section className="viewer-panel">
        <div className="viewer-toolbar"><div className="viewer-modes"><button className={!viewer.whiteModel && !viewer.wireframe ? 'active' : ''} onClick={() => setViewer((value) => ({ ...value, whiteModel: false, wireframe: false }))}>材质</button><button className={viewer.whiteModel ? 'active' : ''} onClick={() => setViewer((value) => ({ ...value, whiteModel: !value.whiteModel, wireframe: false }))}>白模</button><button className={viewer.wireframe ? 'active' : ''} onClick={() => setViewer((value) => ({ ...value, wireframe: !value.wireframe }))}>线框</button></div><div className="viewer-actions"><button className={viewer.grid ? 'active' : ''} title="网格" onClick={() => setViewer((value) => ({ ...value, grid: !value.grid }))}><Grid3X3 size={16}/></button><button title="重置预览" onClick={() => { setViewerSource(''); setViewerType(''); }}><RotateCcw size={16}/></button><button title="全屏" onClick={() => document.documentElement.requestFullscreen?.()}><Maximize2 size={16}/></button></div></div>
        <ModelViewer source={viewerSource} type={viewerType} resources={viewerResources} materialText={viewerMaterialText} options={viewer} onStats={setViewerStats}/>
        {loadingModel && <div className="model-loading"><LoaderCircle className="spin"/><span>正在下载模型…</span></div>}
        <div className="viewer-footer"><span>{viewerSource ? `${viewerType} 模型` : '无模型'}</span>{viewerStats.triangles > 0 && <><i/><span>{formatNumber(viewerStats.triangles)} 三角面</span><i/><span>{viewerStats.objects} 个网格</span></>}</div>
        <div className="display-card"><strong>显示设置</strong><label><span>背景</span><input type="color" value={viewer.background} onChange={(event) => setViewer((value) => ({ ...value, background: event.target.value }))}/></label><label><span>金属度 <em>{viewer.metalness.toFixed(2)}</em></span><input type="range" min="0" max="1" step="0.01" value={viewer.metalness} onChange={(event) => setViewer((value) => ({ ...value, metalness: Number(event.target.value) }))}/></label><label><span>粗糙度 <em>{viewer.roughness.toFixed(2)}</em></span><input type="range" min="0" max="1" step="0.01" value={viewer.roughness} onChange={(event) => setViewer((value) => ({ ...value, roughness: Number(event.target.value) }))}/></label></div>
      </section>

      {historyOpen && <aside className="history-panel panel-scroll"><div className="history-heading"><div><span className="eyebrow"><Clock3 size={13}/>任务中心</span><h2>历史记录 <b>{jobs.length}</b></h2></div><button className="icon-button" onClick={() => setHistoryOpen(false)}><X size={16}/></button></div>
        {!jobs.length ? <div className="empty-history"><FileBox size={31}/><strong>暂无生成记录</strong><p>提交的任务会显示在这里</p></div> : <div className="job-list">{jobs.map((job) => <article key={job.id} className={`job-card ${selectedJobId === job.id ? 'selected' : ''}`} onClick={() => { setSelectedJobId(job.id); setViewerSource(''); setViewerType(''); }}>
          <div className="job-cover">{job.files[0]?.previewImageUrl ? <img src={job.files[0].previewImageUrl}/> : job.params.image ? <img src={job.params.image}/> : <Box size={22}/>}<span className={`job-status ${job.status.toLowerCase()}`}>{job.status === 'RUN' && <LoaderCircle className="spin" size={11}/>} {statusLabel(job.status)}</span></div>
          <div className="job-main"><strong>{job.params.prompt || job.params.imageName || '图片生成任务'}</strong><small>{timeLabel(job.createdAt)} · {job.params.model} · {job.params.engine === 'pro' ? '专业版' : '极速版'}</small>{job.errorMessage && <p className="job-error">{job.errorMessage}</p>}
            {job.status === 'DONE' && <div className="job-files">{job.files.map((file, index) => <div key={`${file.url}-${index}`}><span>{file.type || fileExtension(file).toUpperCase()}{file.cached ? ' · 本地' : ''}</span>{(previewTypes.has(file.type.toUpperCase()) || fileExtension(file) === 'zip') && <button title="预览" onClick={(event) => { event.stopPropagation(); void openModel(job, file); }}><Eye size={14}/></button>}<button title="下载" onClick={(event) => { event.stopPropagation(); void download(job, file); }}><Download size={14}/></button></div>)}</div>}
          </div>
          <button className="job-delete" title="删除记录" onClick={(event) => { event.stopPropagation(); void removeCachedJob(job.id, job.files.length); updateJobs((current) => current.filter((item) => item.id !== job.id)); if (selectedJobId === job.id) setSelectedJobId(''); }}><Trash2 size={13}/></button>
        </article>)}</div>}
      </aside>}
    </main>

    {settingsOpen && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setSettingsOpen(false)}><section className="settings-modal"><header><div><span className="eyebrow"><Settings size={13}/>API 连接</span><h2>配置混元3D 服务</h2></div><button className="icon-button" onClick={() => setSettingsOpen(false)}><X size={18}/></button></header>
      <div className="provider-tabs"><button className={config.provider === 'openai' ? 'active' : ''} onClick={() => setConfig((value) => ({ ...value, provider: 'openai', baseUrl: value.provider === 'tencent' ? 'https://api.ai3d.cloud.tencent.com' : value.baseUrl }))}>OpenAI 兼容</button><button className={config.provider === 'tencent' ? 'active' : ''} onClick={() => setConfig((value) => ({ ...value, provider: 'tencent', baseUrl: value.provider === 'openai' ? 'https://ai3d.tencentcloudapi.com' : value.baseUrl }))}>腾讯云 API 3.0</button></div>
      <div className="settings-form"><label className="field wide"><span>Base URL / Endpoint</span><input value={config.baseUrl} onChange={(event) => setConfig((value) => ({ ...value, baseUrl: event.target.value }))}/></label>
        {config.provider === 'openai' ? <label className="field wide"><span>API Key</span><input type="password" value={config.apiKey} placeholder="sk-..." onChange={(event) => setConfig((value) => ({ ...value, apiKey: event.target.value }))}/></label> : <><label className="field"><span>SecretId</span><input type="password" value={config.secretId} onChange={(event) => setConfig((value) => ({ ...value, secretId: event.target.value }))}/></label><label className="field"><span>SecretKey</span><input type="password" value={config.secretKey} onChange={(event) => setConfig((value) => ({ ...value, secretKey: event.target.value }))}/></label><label className="field"><span>Region</span><input value={config.region} onChange={(event) => setConfig((value) => ({ ...value, region: event.target.value }))}/></label><label className="field"><span>API Version</span><input value={config.version} onChange={(event) => setConfig((value) => ({ ...value, version: event.target.value }))}/></label></>}
        <label className="field"><span>代理（可选）</span><input value={config.proxy} placeholder="http://127.0.0.1:7890" onChange={(event) => setConfig((value) => ({ ...value, proxy: event.target.value }))}/></label><label className="field"><span>轮询间隔</span><div className="input-suffix"><input type="number" min="2" max="30" value={config.pollSeconds} onChange={(event) => setConfig((value) => ({ ...value, pollSeconds: Math.max(2, Number(event.target.value) || 4) }))}/><i>秒</i></div></label>
        <label className="remember-row wide"><input type="checkbox" checked={config.rememberSecret} onChange={(event) => setConfig((value) => ({ ...value, rememberSecret: event.target.checked }))}/><span>在本机记住密钥</span></label>
      </div>
      <footer><span className={`connection-result ${connectionState}`}>{connectionState === 'testing' ? <><LoaderCircle className="spin" size={14}/>正在测试</> : connectionState === 'ready' ? <><Check size={14}/>服务可用</> : connectionState === 'error' ? <><CircleAlert size={14}/>连接失败</> : '密钥默认只保存在当前会话'}</span><div><button className="soft-button" disabled={connectionState === 'testing'} onClick={() => void testConnection()}><RefreshCw size={15}/>测试连接</button><button className="primary-button" onClick={() => { saveConfig(config); setSettingsOpen(false); message('配置已保存'); }}><Check size={15}/>保存</button></div></footer>
    </section></div>}

    {notice && <div className={`toast ${notice.error ? 'error' : ''}`}>{notice.error ? <CircleAlert size={17}/> : <Check size={17}/>}<span>{notice.text}</span></div>}
  </div>;
}
