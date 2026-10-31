import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { join, dirname } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { verified } from './downloads.mjs';
import { MODEL } from './catalog.mjs';
import { httpError } from './storage.mjs';

async function freePort() {
  const server = createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}
export class BreezeEngine {
  constructor(downloads, externalUrl = '') {
    this.downloads = downloads; this.external = Boolean(externalUrl); this.url = externalUrl;
    this.state = externalUrl ? 'external' : 'stopped'; this.error = ''; this.logs = []; this.child = null; this.starting = false; this.epoch = 0;
  }
  log(text) { this.logs.push(String(text).slice(-2000)); if (this.logs.length > 80) this.logs.shift(); }
  async health() {
    if (!this.url) return false;
    try { const r = await fetch(`${this.url}/health`, { signal: AbortSignal.timeout(1500) }); return r.ok && (await r.json()).status === 'ok'; } catch { return false; }
  }
  async start({ cpu = false } = {}) {
    if (this.starting) throw httpError('模型正在加载', 409);
    const epoch = ++this.epoch;
    const healthy = await this.health();
    if (epoch !== this.epoch) return;
    if (healthy) { this.state = 'ready'; return; }
    if (this.external) throw httpError('测试/外部引擎没有就绪', 503);
    if (this.child) throw httpError('引擎已启动，请等待或先停止', 409);
    const exe = await this.downloads.executable();
    if (epoch !== this.epoch) return;
    if (!exe || !await verified(this.downloads.paths.model, MODEL)) throw httpError('请先下载并校验运行库与 Q8_0 模型');
    if (epoch !== this.epoch) return;
    this.starting = true; this.state = 'loading'; this.error = '';
    try {
      const voices = join(this.downloads.dataDir, 'voices'); await mkdir(voices, { recursive: true });
      this.url = `http://127.0.0.1:${await freePort()}`;
      if (epoch !== this.epoch) return;
      const child = spawn(exe, [this.downloads.paths.model, '--host', '127.0.0.1', '--port', new URL(this.url).port, '--ws-port', '-1', '--voices-dir', voices, '--split-chars', '300', ...(cpu ? ['--cpu'] : [])], { cwd: dirname(exe), windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
      this.child = child;
      const record = chunk => this.log(chunk.toString('utf8'));
      child.stdout.on('data', record); child.stderr.on('data', record);
      child.on('error', e => { this.error = e.message; this.state = 'error'; });
      child.on('exit', (code, signal) => { if (this.child === child) { this.child = null; if (this.state !== 'stopping') { this.state = 'error'; this.error ||= `引擎退出 (${signal || code})`; } else this.state = 'stopped'; } });
      for (let i = 0; i < 240; i++) {
        if (epoch !== this.epoch) return;
        if (this.state === 'stopping' || this.child !== child || this.error) throw new Error(this.error || '引擎启动已中止');
        const ready = await this.health();
        if (epoch !== this.epoch) return;
        if (ready) { this.state = 'ready'; return; }
        await new Promise(r => setTimeout(r, 500));
      }
      throw new Error('模型加载超时，请检查显存与运行库日志');
    } catch (e) { if (epoch !== this.epoch) return; await this.stop(); this.state = 'error'; this.error = e.message; throw e; }
    finally { this.starting = false; }
  }
  async stop() {
    this.epoch++;
    if (this.external) return;
    const child = this.child; this.state = 'stopping';
    if (child) {
      child.kill();
      await Promise.race([once(child, 'exit').catch(() => {}), new Promise(r => setTimeout(r, 3000))]);
      if (this.child === child) { child.kill('SIGKILL'); this.child = null; }
    }
    this.state = 'stopped'; this.url = '';
  }
  async request(path, options = {}) {
    if (!this.url || !await this.health()) throw httpError('语音引擎尚未就绪，请在服务端启动模型', 503);
    const r = await fetch(`${this.url}${path}`, { ...options, signal: options.signal || AbortSignal.timeout(30000) });
    if (!r.ok) { const s = (await r.text()).slice(0, 500); throw httpError(`推理引擎 HTTP ${r.status}: ${s}`, r.status === 409 ? 409 : 502); }
    return r;
  }
  async voices() { return (await this.request('/v1/voices')).json(); }
  async saveVoice(input) {
    const { decodeReference } = await import('./audio.mjs');
    const ref = decodeReference(input.reference);
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(input.name || '')) throw httpError('音色 ID 仅支持字母、数字、横线和下划线，最多 64 字符');
    if (!String(input.ref_text || '').trim() || input.ref_text.length > 8000) throw httpError('请填写准确的参考转录（最多 8000 字符）');
    const data = new FormData(); data.set('name', input.name); data.set('ref_text', input.ref_text); data.set('description', String(input.description || '').slice(0, 4000));
    data.set('ref_audio', new Blob([ref], { type: 'audio/wav' }), 'reference.wav');
    const r = await this.request('/v1/voices', { method: 'POST', body: data, signal: AbortSignal.timeout(120000) });
    return r.json();
  }
}
