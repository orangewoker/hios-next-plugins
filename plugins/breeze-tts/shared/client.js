import { DEFAULT_CONNECTION, connectionUrl, newId } from './core.js';
const STORAGE = 'hios.breeze.connection.v1';
export function loadConnection() {
  try {
    const stored = localStorage.getItem(STORAGE);
    if (stored) return { ...DEFAULT_CONNECTION, ...JSON.parse(stored) };
    if (window.parent === window && /^https?:$/.test(location.protocol)) {
      const local = ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);
      return { ...DEFAULT_CONNECTION, mode: local ? 'local' : 'remote', [local ? 'localUrl' : 'remoteUrl']: location.origin };
    }
  } catch {}
  return { ...DEFAULT_CONNECTION };
}
export async function saveConnection(config, bridge) {
  if (bridge?.managed) { const saved = await bridge.workshop({ action: 'save-config', config }); localStorage.removeItem(STORAGE); return saved; }
  connectionUrl(config); localStorage.setItem(STORAGE, JSON.stringify(config)); return config;
}
export function mediaUrl(source) { return location.hostname === 'hios-plugin.localhost' ? source.replace(/^hios-asset:\/\//, 'http://hios-asset.localhost/') : source; }
export function fileDataUrl(blob) {
  return new Promise((ok, fail) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => fail(r.error); r.readAsDataURL(blob); });
}
export async function referenceData(source) {
  if (!source) return undefined;
  if (source instanceof Blob) {
    if (source.size > 16 * 1024 * 1024) throw new Error('参考 WAV 不能超过 16 MiB');
    return fileDataUrl(new Blob([source], { type: 'audio/wav' }));
  }
  if (typeof source !== 'string') throw new Error('参考音频端口没有返回可读取的音频地址');
  if (source.startsWith('data:')) return source;
  const url = mediaUrl(source);
  const r = await fetch(url); if (!r.ok) throw new Error('无法读取参考音频'); return referenceData(await r.blob());
}
export class WorkshopClient {
  constructor(config, bridge) { this.config = { ...config }; this.bridge = bridge; this.adminToken = ''; }
  async bootstrap() {
    if (this.bridge?.managed) {
      this.config = { ...DEFAULT_CONNECTION, ...await this.bridge.workshop({ action: 'config' }) };
      this.config.localUrl = `http://127.0.0.1:${this.config.port || 17860}`;
      this.adminToken = this.config.mode === 'local' ? 'managed' : '';
      localStorage.removeItem(STORAGE); return this.config.mode === 'local';
    }
    if (this.bridge?.embedded || this.config.mode === 'remote') return false;
    const base = connectionUrl(this.config);
    if (base !== location.origin) return false;
    const r = await fetch(`${base}/api/bootstrap`, { cache: 'no-store' }), data = await r.json();
    if (data.local) { this.config.accessKey = data.accessKey; this.adminToken = data.adminToken; return true; }
    return false;
  }
  async request(path, { method = 'GET', body, binary = false, signal } = {}) {
    signal?.throwIfAborted();
    if (this.bridge?.managed) {
      if (binary) throw new Error('托管模式请使用音频素材导入');
      const result = await this.bridge.workshop({ action: 'request', path, method, body });
      signal?.throwIfAborted(); return result;
    }
    const url = `${connectionUrl(this.config)}${path}`;
    const headers = { Authorization: `Bearer ${this.config.accessKey || ''}`, 'X-Breeze-Client': 'breeze-tts' };
    if (this.adminToken) headers['X-Breeze-Admin'] = this.adminToken;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const encoded = body === undefined ? undefined : JSON.stringify(body);
    let response;
    try { response = await fetch(url, { method, headers, body: encoded, cache: 'no-store', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(35000)]) : AbortSignal.timeout(35000) }); }
    catch (e) {
      if (signal?.aborted || !this.bridge?.embedded) throw e;
      const result = await this.bridge.network({ url, method, headers, body: encoded, responseType: binary ? 'base64' : 'text' });
      if (!result.ok) { let m; try { m = JSON.parse(result.body)?.error; } catch {} throw new Error(m || `HTTP ${result.status}`); }
      if (binary) {
        const bytes = Uint8Array.from(atob(result.body), c => c.charCodeAt(0));
        return new Blob([bytes], { type: 'audio/wav' });
      }
      return JSON.parse(result.body);
    }
    if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || `HTTP ${response.status}`); }
    if (binary) return response.blob(); return response.json();
  }
  health() { return this.request('/api/health'); }
  async synthesize(input, { signal, onProgress = () => {} } = {}) {
    signal?.throwIfAborted();
    const key = input.idempotencyKey || newId();
    // Finish the short submission handshake even when cancelled, so its job ID is not lost.
    let job = await this.request('/api/jobs', { method: 'POST', body: { ...input, idempotencyKey: key } });
    const cancel = () => { void this.request(`/api/jobs/${job.id}`, { method: 'DELETE' }).catch(() => {}); };
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
    try {
      for (;;) {
        if (signal?.aborted) throw new DOMException('已取消', 'AbortError');
        onProgress(job);
        if (job.status === 'ready') return job;
        if (['failed', 'cancelled', 'interrupted'].includes(job.status)) throw new Error(job.error || '生成中断');
        await new Promise(resolve => setTimeout(resolve, 700));
        job = await this.request(`/api/jobs/${job.id}`, { signal });
      }
    } finally { signal?.removeEventListener('abort', cancel); }
  }
  audio(job, signal) { return this.request(`/api/jobs/${job.id}/audio`, { binary: true, signal }); }
  async artifact(job, signal) {
    signal?.throwIfAborted();
    if (this.bridge?.managed) {
      const result = await this.bridge.workshop({ action: 'import-audio', jobId: job.id });
      signal?.throwIfAborted(); return { ...result, source: result.url, playUrl: mediaUrl(result.url) };
    }
    const blob = await this.audio(job, signal); signal?.throwIfAborted();
    return { blob, size: blob.size, playUrl: URL.createObjectURL(blob) };
  }
}
