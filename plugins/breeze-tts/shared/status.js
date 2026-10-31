// One live status for the connected service, never for an unsaved settings draft.
export function serviceStatus(health, mode = 'local') {
  if (health?.protocol !== 'breeze-workshop/v1') throw new Error('此地址不是 Breeze 工坊服务，请填写工坊端口，不是原生引擎端口');
  const state = health.engineReady ? 'ready' : (health.engineState || 'stopped');
  const label = ({ ready: '模型已就绪', loading: '模型加载 / 预热中', stopping: '模型停止中', stopped: '模型未启动', error: '模型启动失败', unavailable: '模型暂不可用' })[state] || '模型暂不可用';
  const location = mode === 'remote' ? '远程' : '本机';
  return { state, ready: Boolean(health.engineReady), badge: `${location} · ${label}`, message: `当前连接 · ${location} · 服务在线 · ${label}` };
}

export class StatusMonitor {
  constructor(getClient, onStatus, onError) {
    this.getClient = getClient; this.onStatus = onStatus; this.onError = onError;
    this.epoch = 0; this.pending = null; this.disposed = false;
  }
  invalidate() { this.epoch++; this.pending = null; }
  dispose() { this.disposed = true; this.invalidate(); }
  refresh() {
    if (this.disposed) return Promise.resolve(null);
    const client = this.getClient(), epoch = this.epoch;
    if (this.pending?.client === client) return this.pending.promise;
    const current = () => !this.disposed && epoch === this.epoch && client === this.getClient();
    const entry = { client, promise: null };
    entry.promise = (async () => {
      try {
        const health = await Promise.resolve().then(() => client.health());
        if (!current()) return null;
        const status = serviceStatus(health, client.config.mode);
        this.onStatus(status, health); return health;
      } catch (error) { if (current()) this.onError(error); throw error; }
      finally { if (this.pending === entry) this.pending = null; }
    })();
    this.pending = entry; return entry.promise;
  }
}
