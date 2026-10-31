import { PLUGIN_ID, newId } from './core.js';
export class HiosBridge {
  constructor(kind) {
    this.kind = kind; this.embedded = window.parent !== window; this.protocol = kind === 'node' ? 'hios-plugin-node/v1' : 'hios-plugin-app/v1';
    this.nodeId = ''; this.origin = '*'; this.pending = new Map(); this.listeners = new Set(); this.init = null;
    this.handle = event => {
      const m = event.data;
      if (event.source !== parent || !m || m.protocol !== this.protocol || (m.pluginId && m.pluginId !== PLUGIN_ID)) return;
      if (this.origin !== '*' && event.origin !== this.origin) return;
      if (m.type === 'init') { this.origin = event.origin === 'null' ? '*' : event.origin; this.nodeId = m.nodeId || ''; this.init = m.payload || {}; }
      if (['network-result', 'breeze-result'].includes(m.type)) { const p = this.pending.get(m.payload?.requestId); if (p) { this.pending.delete(m.payload.requestId); clearTimeout(p.timer); m.payload.error ? p.reject(new Error(m.payload.error)) : p.resolve(m.payload.result); } }
      this.listeners.forEach(fn => fn(m.type, m.payload || {}, m));
    };
    window.addEventListener('message', this.handle);
  }
  post(type, payload = {}) {
    if (this.embedded) parent.postMessage({ protocol: this.protocol, pluginId: PLUGIN_ID, appId: 'studio', ...(this.nodeId ? { nodeId: this.nodeId } : {}), type, payload }, this.origin);
  }
  ready() { this.post('ready'); }
  get managed() { return Boolean(this.init?.features?.breezeWorkshop); }
  workshop(payload) {
    const requestId = newId();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(requestId); reject(new Error('语音工坊宿主响应超时')); }, 150000);
      this.pending.set(requestId, { resolve, reject, timer }); this.post('breeze-request', { ...payload, requestId });
    });
  }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  network(payload) {
    const requestId = newId();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(requestId); reject(new Error('宿主网络桥超时；请检查服务地址或在独立工坊中使用')); }, 30000);
      this.pending.set(requestId, { resolve, reject, timer }); this.post('network-request', { ...payload, requestId });
    });
  }
}
