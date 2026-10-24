export interface SystemContext { appearance?: 'dark' | 'light'; interfaceLocale?: string; locale?: string; direction?: 'ltr' | 'rtl'; displayScale?: number }
const PLUGIN = 'barcode-studio';
let protocol = '', nodeId = '', appId = '', origin = '*';
const pending = new Map<string, { resolve: (value: any) => void; reject: (reason: Error) => void; timer: number }>();
function post(type: string, payload: unknown = {}) {
  if (protocol) parent.postMessage({ protocol, pluginId: PLUGIN, nodeId, appId, type, payload }, origin);
}
export function postState(state: unknown) { post('state', { state }); }
export async function saveFile(blob: Blob, name: string): Promise<void> {
  if (protocol) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const requestId = crypto.randomUUID();
    await new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => { pending.delete(requestId); reject(new Error('宿主文件保存超时')); }, 30000);
      pending.set(requestId, { resolve, reject, timer });
      post('file-store', { requestId, key: crypto.randomUUID(), name, mime: blob.type.split(';')[0], bytes });
    });
    return;
  }
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export async function publishImage(output: { blob: Blob; name: string; width: number; height: number }, addToCanvas: boolean) {
  if (!protocol) { await saveFile(output.blob, output.name); return; }
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('图片读取失败')); reader.readAsDataURL(output.blob);
  });
  post('output', { output: { kind: 'image', portId: 'image', source, name: output.name, width: output.width, height: output.height, mime: 'image/png', metadata: { addToCanvas } } });
}
export function connectHost(onContext: (value: SystemContext) => void, hydrate: (payload: any) => void, run: () => Promise<void>): () => void {
  function receive(event: MessageEvent) {
    if (parent === window || event.source !== parent) return;
    const m = event.data;
    if (!m || !['hios-plugin-node/v1', 'hios-plugin-app/v1'].includes(m.protocol) || (m.pluginId && m.pluginId !== PLUGIN)) return;
    if (protocol && (m.protocol !== protocol || (origin !== '*' && event.origin !== origin))) return;
    if (!protocol && m.type !== 'init') return;
    if (nodeId && m.nodeId && m.nodeId !== nodeId) return;
    if (appId && m.appId && m.appId !== appId) return;
    protocol = m.protocol; origin = event.origin === 'null' ? '*' : event.origin;
    nodeId = m.nodeId || m.payload?.nodeId || nodeId; appId = m.appId || m.payload?.appId || appId;
    const payload = m.payload || {};
    if (m.type === 'file-store-result') {
      const request = pending.get(payload.requestId); if (!request) return;
      clearTimeout(request.timer); pending.delete(payload.requestId);
      if (payload.error) request.reject(new Error(payload.error));
      else if (!payload.result?.url) request.reject(new Error('宿主未返回保存地址'));
      else request.resolve(payload.result);
      return;
    }
    if (payload.theme) onContext({ appearance: payload.theme.mode === 'dark' ? 'dark' : 'light' });
    if (m.type === 'init' || m.type === 'run') {
      try { hydrate(payload); post('loaded', { ready: true }); }
      catch (e) { post('error', { message: String(e) }); return; }
    }
    if (m.type === 'run') void run().catch(e => post('error', { message: e instanceof Error ? e.message : String(e) }));
  }
  window.addEventListener('message', receive);
  if (parent !== window) for (const value of ['hios-plugin-node/v1', 'hios-plugin-app/v1']) parent.postMessage({ protocol: value, pluginId: PLUGIN, type: 'ready' }, '*');
  return () => {
    window.removeEventListener('message', receive);
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('插件已关闭')); }
    pending.clear(); protocol = ''; origin = '*'; nodeId = ''; appId = '';
  };
}
