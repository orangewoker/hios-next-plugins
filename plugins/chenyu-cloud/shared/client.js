import { apiUrl, unwrap, MAX_MEDIA_BYTES, isMedia, safeMediaUrl } from './core.js';

export class ChenyuClient {
  constructor(key, { fetch: fetcher = globalThis.fetch, timeoutMs = 60000 } = {}) {
    this.key = String(key || '').trim().replace(/^Bearer\s+/i, '');
    if (!this.key) throw new Error('请先在晨羽智云应用中配置 API Key');
    // WebView2's native fetch requires its Window receiver, including data/blob reads.
    // Never call an unbound Window function as a ChenyuClient instance method.
    this.fetcher = (...args) => Reflect.apply(fetcher, globalThis, args);
    this.timeoutMs = timeoutMs;
  }
  async request(path, { signal, body, form } = {}) {
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
    let response;
    try {
      response = await this.fetcher(apiUrl(path), { method: body || form ? 'POST' : 'GET',
        headers: { Authorization: `Bearer ${this.key}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: form || (body ? JSON.stringify(body) : undefined), signal: requestSignal, cache: 'no-store', credentials: 'omit', redirect: 'error' });
    } catch (error) {
      signal?.throwIfAborted();
      throw new Error(timeout.aborted ? '晨羽请求超时' : '晨羽网络请求失败，请检查网络连接');
    }
    let payload;
    try { payload = await response.json(); } catch { throw new Error(`接口未返回 JSON（HTTP ${response.status}）`); }
    if (!response.ok) throw new Error(`晨羽 HTTP ${response.status}：${String(payload.msg || payload.message || '请求失败').replaceAll(this.key, '[已隐藏]')}`);
    try { return unwrap(payload); } catch (error) { throw new Error(String(error.message).replaceAll(this.key, '[已隐藏]')); }
  }
  submit(body, signal) { return this.request('workflow/run/submit', { body, signal }); }
  info(id, signal) { return this.request(`workflow/run/info?run_order_id=${encodeURIComponent(id)}`, { signal }); }
  execution(id, signal) { return this.request(`workflow/run/execution?run_order_id=${encodeURIComponent(id)}`, { signal }); }
  asset(id, signal) { return this.request(`assets/${encodeURIComponent(id)}`, { signal }); }
  async upload(blob, kind = 'image', signal, name = 'input') {
    if (blob.size > MAX_MEDIA_BYTES) throw new Error('单个素材不能超过 100 MB');
    const form = new FormData();
    form.append('file', blob, name);
    form.append('media_type', kind === 'media' ? 'image' : kind);
    form.append('purpose', 'temp_input');
    const asset = await this.request('assets', { form, signal });
    const uri = asset.asset_uri || asset.uri;
    if (!/^asset:\/\/[\w-]+$/.test(uri || '')) throw new Error('上传成功但没有有效 asset_uri');
    return { ...asset, asset_uri: uri };
  }
  async prepareInputs(workflow, inputs, signal) {
    const cache = new Map();
    const source = async (value, field) => {
      if (Array.isArray(value)) return Promise.all(value.map(v => source(v, field)));
      if (value && typeof value === 'object') {
        if (!value.uri) throw new Error(`${field.label}媒体对象缺少 uri`);
        return { uri: await source(value.uri, field), ...(value.role ? { role: String(value.role) } : {}) };
      }
      const uri = String(value || '').trim();
      if (/^asset:\/\/[\w-]+$/.test(uri)) return uri;
      if (/^https:\/\//i.test(uri) && !/^https?:\/\/hios-asset\.localhost\//i.test(uri)) return uri;
      // The application-workflow host normally expands HIOS references to data URLs.
      const local = /^data:|^blob:|^hios-asset:\/\/|^https?:\/\/hios-asset\.localhost\//i.test(uri);
      if (!local) throw new Error(`${field.label}需要 HTTPS URL、data URL 或 asset:// 地址`);
      if (!cache.has(uri)) cache.set(uri, (async () => {
        const response = await this.fetcher(uri, { signal });
        if (!response.ok) throw new Error(`${field.label}本地素材读取失败`);
        const blob = await response.blob();
        const extension = blob.type.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'bin';
        return (await this.upload(blob, field.type.replace(/\[\]$/, ''), signal, `${field.name}.${extension}`)).asset_uri;
      })());
      return cache.get(uri);
    };
    const entries = [];
    for (const field of workflow.fields.filter(isMedia)) {
      signal?.throwIfAborted();
      if (inputs[field.name] != null) entries.push([field.name, await source(inputs[field.name], field)]);
    }
    return { ...inputs, ...Object.fromEntries(entries) };
  }
}

export function readFile(file) {
  if (file.size > MAX_MEDIA_BYTES) return Promise.reject(new Error('单个素材不能超过 100 MB'));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('读取素材失败'));
    reader.readAsDataURL(file);
  });
}
export async function downloadOutput(output, fetcher = globalThis.fetch) {
  const url = safeMediaUrl(output.url);
  if (!url) throw new Error('无效的输出地址');
  const response = await fetcher(url, { credentials: 'omit' });
  if (!response.ok) throw new Error(`下载失败（HTTP ${response.status}）`);
  return response.blob();
}
