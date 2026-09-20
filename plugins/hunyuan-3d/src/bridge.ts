export type HostTheme = { mode?: 'light' | 'dark'; tokens?: Record<string, string> };
export type NetworkResult = { status: number; ok: boolean; url?: string; headers: Record<string, string>; body: string; encoding?: 'utf8' | 'base64' };

const protocol = 'hios-plugin-app/v1';
const pending = new Map<string, { resolve: (value: NetworkResult) => void; reject: (reason: Error) => void; timer: number }>();
let initHandler: ((payload: Record<string, unknown>) => void) | undefined;

export function post(type: string, payload: Record<string, unknown> = {}) {
  parent.postMessage({ protocol, pluginId: 'hunyuan-3d', appId: 'hunyuan-3d', type, payload }, '*');
}

export function ready(handler: (payload: Record<string, unknown>) => void) {
  initHandler = handler;
  post('ready');
}

export function saveHostState(state: Record<string, unknown>) {
  post('state', { state });
}

export function networkRequest(input: { url: string; method?: string; headers?: Record<string, string>; body?: string; proxy?: string; responseType?: 'text' | 'base64'; timeoutMs?: number }) {
  return new Promise<NetworkResult>((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const timer = window.setTimeout(() => {
      pending.delete(requestId);
      reject(new Error('网络请求超时'));
    }, input.timeoutMs || 120_000);
    pending.set(requestId, { resolve, reject, timer });
    post('network-request', { requestId, ...input });
  });
}

window.addEventListener('message', (event) => {
  const message = event.data;
  if (!message || message.protocol !== protocol) return;
  if (message.type === 'init') initHandler?.(message.payload || {});
  if (message.type === 'network-result') {
    const payload = message.payload || {};
    const request = pending.get(String(payload.requestId || ''));
    if (!request) return;
    pending.delete(String(payload.requestId));
    window.clearTimeout(request.timer);
    if (payload.error) request.reject(new Error(String(payload.error)));
    else request.resolve(payload.result as NetworkResult);
  }
});

export function applyTheme(theme?: HostTheme) {
  if (!theme?.tokens) return;
  const root = document.documentElement;
  const mapping: Record<string, string> = {
    background: '--host-bg', surface: '--host-surface', muted: '--host-muted', control: '--host-control',
    text: '--host-text', textSecondary: '--host-text-2', border: '--host-border', accent: '--host-accent',
  };
  Object.entries(mapping).forEach(([key, variable]) => {
    const value = theme.tokens?.[key];
    if (value) root.style.setProperty(variable, value);
  });
  root.dataset.theme = theme.mode || 'dark';
}
