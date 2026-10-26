export const protocol = location.pathname.endsWith('/app.html') ? 'hios-plugin-app/v1' : 'hios-plugin-node/v1';
const pending = new Map<string, { resolve: (value: any) => void; reject: (reason: Error) => void; timer: ReturnType<typeof setTimeout> }>();
let identity: Record<string, string> = { pluginId: 'director3d' };
let origin = '*';
export function post(type: string, payload: Record<string, unknown> = {}) {
  parent.postMessage({ protocol, ...identity, type, payload }, origin);
}
export function request(type: string, payload: Record<string, unknown>, timeout = 190_000): Promise<any> {
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('宿主响应超时，请确认 HIOS 已更新')); }, timeout);
    pending.set(requestId, { resolve, reject, timer }); post(type, { ...payload, requestId });
  });
}
export function connect(receive: (type: string, payload: any) => void) {
  const listener = (event: MessageEvent) => {
    const m = event.data;
    if (event.source !== parent || !m || m.protocol !== protocol || (m.pluginId && m.pluginId !== 'director3d')) return;
    if (origin !== '*' && event.origin !== origin) return;
    if (m.type === 'init') {
      origin = event.origin === 'null' ? '*' : event.origin;
      identity = { pluginId: 'director3d', ...(m.nodeId ? { nodeId: m.nodeId } : {}), ...(m.appId ? { appId: m.appId } : {}) };
    }
    const p = m.payload || {};
    const deferred = pending.get(p.requestId);
    if (deferred && /-result$/.test(m.type)) {
      clearTimeout(deferred.timer); pending.delete(p.requestId);
      p.error ? deferred.reject(new Error(p.error)) : deferred.resolve(p.result ?? p);
    } else receive(m.type, p);
  };
  window.addEventListener('message', listener); post('ready');
  return () => { window.removeEventListener('message', listener); for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error('导演台已关闭')); } pending.clear(); };
}
export function assetUrl(url: string) {
  return location.protocol === 'http:' && location.hostname === 'hios-plugin.localhost' ? url.replace(/^hios-asset:\/\//, 'http://hios-asset.localhost/') : url;
}
export async function storeFile(file: Blob, name: string, key = crypto.randomUUID(), purpose?: 'draft') {
  if (file.size > 64 * 1024 * 1024) throw new Error('文件超过宿主 64 MB 上限');
  return request('file-store', { key, purpose, name, mime: file.type || 'application/octet-stream', bytes: new Uint8Array(await file.arrayBuffer()) });
}
