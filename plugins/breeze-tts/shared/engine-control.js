export function engineButton(status, client, { pending = false, generating = false } = {}) {
  const visible = client.config.mode !== 'remote' && Boolean(client.adminToken);
  const stopping = status?.state === 'stopping';
  const stop = ['ready', 'loading', 'unavailable'].includes(status?.state);
  return { visible, action: stop ? 'stop' : 'start', label: pending ? '处理中…' : stopping ? '停止中…' : stop ? '停止' : '启动',
    disabled: !status || pending || generating || stopping,
    title: generating ? '请先结束当前生成任务' : stop ? '停止本机共享模型' : '启动本机模型（不触发语音生成）' };
}

export class EngineControl {
  constructor() { this.pending = false; }
  async toggle(client, status, generating = false) {
    const button = engineButton(status, client, { pending: this.pending, generating });
    if (!button.visible) throw new Error('请在服务端电脑管理模型，远程客户端不能启停模型');
    if (button.disabled) throw new Error(generating ? '请先结束当前生成任务' : '正在连接或处理模型，请稍后再试');
    this.pending = true;
    try {
      if (button.action === 'start') {
        const info = await client.request('/api/admin/status');
        if (!info.downloads.runtime.ready || !info.downloads.model.ready) throw new Error('请先在语音工坊的「模型与服务」下载并校验运行库和模型');
      }
      await client.request(`/api/admin/engine/${button.action}`, { method: 'POST', body: button.action === 'start' ? { cpu: false } : {} });
      return button.action;
    } finally { this.pending = false; }
  }
}
