export const PLUGIN_ID = 'breeze-tts';
// Current HIOS node bridge caps the encoded source at 64 MiB, not the original WAV.
export const MAX_HOST_AUDIO_BYTES = Math.floor((64 * 1024 * 1024 - 64) * 3 / 4);
// randomUUID is absent on plain HTTP LAN origins; getRandomValues remains available there.
export function newId() {
  if (globalThis.crypto.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(n => n.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export const DEFAULT_CONNECTION = Object.freeze({ mode: 'local', localUrl: 'http://127.0.0.1:17860', remoteUrl: '', accessKey: '' });
export const DEFAULT_FORM = Object.freeze({ text: '', mode: 'design', voice_id: '', ref_text: '', instruction: '温柔、自然、清晰的中文旁白。', seed: 42, cfg_scale: 1, temperature: 0.9, top_k: 50, top_p: 1, repetition_penalty: 1.1, split_chars: 300, max_new_tokens: 750 });
export const PARAMS = Object.freeze({ seed: [-1, 2147483647, true], cfg_scale: [1, 5], temperature: [0, 2], top_k: [0, 1000, true], top_p: [0, 1], repetition_penalty: [0, 2], split_chars: [80, 1000, true], max_new_tokens: [1, 1500, true] });
export function normalizeUrl(value) {
  let u; try { u = new URL(String(value || '').trim()); } catch { throw new Error('请输入完整服务地址，例如 http://192.168.1.20:17860'); }
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.search || u.hash) throw new Error('服务地址仅支持 HTTP(S)，不能包含账户、查询参数或片段');
  return u.href.replace(/\/+$/, '');
}
export function connectionUrl(config) { return normalizeUrl(config.mode === 'remote' ? config.remoteUrl : config.localUrl); }
export function buildRequest(raw) {
  const x = { ...DEFAULT_FORM, ...raw }, out = {};
  out.text = String(x.text || '').trim();
  if (!out.text || out.text.length > 20000) throw new Error('正文需为 1–20000 个字符');
  if (!['design', 'clone', 'direction'].includes(x.mode)) throw new Error('未知合成模式');
  out.mode = x.mode; out.instruction = x.mode === 'clone' ? '' : String(x.instruction || '').trim();
  if (out.instruction.length > 4000) throw new Error('表达指令过长');
  if (x.mode === 'design' && !out.instruction) throw new Error('音色设计需要填写音色描述');
  if (x.mode === 'direction' && !out.instruction) throw new Error('风格引导需要填写表达指令');
  out.voice_id = x.mode === 'design' ? '' : String(x.voice_id || '');
  if (out.voice_id && !/^[a-zA-Z0-9_-]{1,128}$/.test(out.voice_id)) throw new Error('音色 ID 无效');
  out.ref_text = x.mode === 'design' ? '' : String(x.ref_text || '').trim();
  if (out.ref_text.length > 8000) throw new Error('参考转录过长');
  if (x.mode !== 'design' && !out.voice_id) {
    if (!x.reference || !out.ref_text) throw new Error('请选择已保存音色，或上传参考 WAV 并填写准确转录');
    out.reference = x.reference;
  }
  for (const [key, [min, max, integer]] of Object.entries(PARAMS)) {
    if (x[key] === '' || x[key] == null) throw new Error(`${key} 不能为空`);
    const n = Number(x[key]);
    if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) throw new Error(`${key} 必须在 ${min}–${max} 范围内${integer ? '且为整数' : ''}`);
    out[key] = n;
  }
  return out;
}
export function inputValue(raw) {
  if (Array.isArray(raw)) return inputValue(raw[0]);
  if (raw && typeof raw === 'object') return raw.value ?? raw.text ?? raw.source ?? raw.dataUrl ?? raw.url ?? raw.audioUrl ?? raw.audios?.[0] ?? raw.urls?.[0] ?? raw;
  return raw;
}
export function applyInputs(form, inputs = {}) {
  const next = { ...form };
  const settings = inputValue(inputs.settings);
  if (settings && typeof settings === 'object' && !Array.isArray(settings)) {
    for (const key of ['mode', 'voice_id', ...Object.keys(PARAMS)]) if (settings[key] !== undefined) next[key] = settings[key];
  }
  for (const key of ['text', 'ref_text', 'instruction']) {
    const v = inputValue(inputs[key === 'ref_text' ? 'reference_text' : key]);
    if (v !== undefined && v !== null) next[key] = String(v);
  }
  return next;
}
export function jobOutputs(job, source) {
  return [
    { kind: 'audio', portId: 'audio', source, mime: 'audio/wav', name: `breeze-${job.id}.wav` },
    { kind: 'text', portId: 'transcript', value: job.text },
    { kind: 'json', portId: 'info', value: { engine: 'breeze-cpp', model: 'Breeze-TTS-2-Q8_0', ...job.info } },
    { kind: 'number', portId: 'duration', value: job.info.duration }
  ];
}
export function formatBytes(n) { return n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : `${(Number(n || 0) / 1e6).toFixed(1)} MB`; }
