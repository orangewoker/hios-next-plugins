// Scoped to this plugin iframe, installed before WASM creates its device/context.
export function configureGraphics(settings = {}, report = () => {}) {
  const power = ['high-performance', 'low-power'].includes(settings.powerPreference) ? settings.powerPreference : undefined;
  const url = new URL(location.href);
  if (settings.photoBackend === 'webgl') url.searchParams.set('webgl', '1');
  history.replaceState(null, '', url);
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(kind, options) {
    const gl = kind === 'webgl' || kind === 'webgl2' || kind === 'experimental-webgl';
    const context = original.call(this, kind, gl && power ? { ...options, powerPreference: power } : options);
    if (gl && context) {
      const info = context.getExtension('WEBGL_debug_renderer_info');
      const renderer = info ? context.getParameter(info.UNMASKED_RENDERER_WEBGL) : context.getParameter(context.RENDERER);
      report(`${kind} · ${renderer || '设备信息未公开'}`);
    }
    return context;
  };
  const gpu = navigator.gpu;
  if (gpu) {
    const request = gpu.requestAdapter.bind(gpu);
    try {
      gpu.requestAdapter = async options => {
        const adapter = await request(power ? { ...options, powerPreference: power } : options);
        if (adapter) {
          const info = adapter.info;
          report(`WebGPU 适配器 · ${info?.description || info?.device || info?.vendor || '设备信息未公开'}（设备创建状态由编辑器确认）`);
        }
        return adapter;
      };
    } catch { report('浏览器不允许覆盖 GPU 偏好，使用系统选择'); }
  }
}
