import { mkdir, readdir, open, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { buildRequest } from '../shared/core.js';
import { atomicJson, readJson, httpError } from './storage.mjs';
import { wavHeader, decodeReference } from './audio.mjs';
import { MODEL } from './catalog.mjs';

export class Jobs {
  constructor(dataDir, engine) { this.dir = join(dataDir, 'jobs'); this.engine = engine; this.active = null; this.records = new Map(); }
  async init() {
    await mkdir(this.dir, { recursive: true });
    for (const name of await readdir(this.dir)) {
      if (!/^[0-9a-f-]{36}\.json$/.test(name)) continue;
      const job = await readJson(join(this.dir, name), null);
      if (!job?.id) continue;
      if (['generating', 'starting'].includes(job.status)) { job.status = 'interrupted'; job.error = '服务重启，生成已中断；不会自动重复提交'; await this.save(job); await rm(join(this.dir, `${job.id}.wav.part`), { force: true }); }
      this.records.set(job.id, job);
    }
  }
  async save(job) { await atomicJson(join(this.dir, `${job.id}.json`), job); }
  get(id) { const job = this.records.get(id); if (!job) throw httpError('任务不存在', 404); return job; }
  list() { return [...this.records.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, 100); }
  create(raw) {
    const request = buildRequest(raw);
    if (request.reference) decodeReference(request.reference);
    const key = String(raw.idempotencyKey || randomUUID());
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(key)) throw httpError('幂等标识无效');
    const existing = [...this.records.values()].find(x => x.idempotencyKey === key);
    const fingerprint = createHash('sha256').update(JSON.stringify(request)).digest('hex');
    if (existing) { if (existing.fingerprint !== fingerprint) throw httpError('同一幂等标识不能提交不同输入', 409); return existing; }
    if (this.active) throw httpError('服务正在生成，请等待当前任务结束（不另建排队任务）', 409);
    const { reference, ...settings } = request;
    const job = { id: randomUUID(), idempotencyKey: key, fingerprint, status: 'starting', text: request.text, createdAt: Date.now(), bytes: 0, settings, info: {} };
    this.records.set(job.id, job);
    const controller = new AbortController();
    const active = { id: job.id, controller, task: null }; this.active = active;
    active.task = this.execute(job, request, controller).finally(() => { if (this.active === active) this.active = null; });
    return job;
  }
  async execute(job, input, controller) {
    let file; const part = join(this.dir, `${job.id}.wav.part`);
    try {
      await this.save(job);
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(20 * 60 * 1000)]);
      const form = new FormData();
      for (const [k, v] of Object.entries(input)) if (!['mode', 'reference'].includes(k) && v !== '') form.set(k, String(v));
      if (input.reference) form.set('ref_audio', new Blob([decodeReference(input.reference)], { type: 'audio/wav' }), 'reference.wav');
      const r = await this.engine.request('/v1/audio/speech', { method: 'POST', body: form, signal });
      if (!/audio\/(?:pcm|L16)/i.test(r.headers.get('content-type') || '')) { await r.body?.cancel(); throw new Error('原生引擎未返回 PCM 音频'); }
      const rate = Number(r.headers.get('x-sample-rate') || 24000);
      wavHeader(2, rate); // Validate rate before writing.
      file = await open(part, 'w'); await file.write(Buffer.alloc(44)); job.status = 'generating'; await this.save(job);
      for await (const chunk of r.body) {
        signal.throwIfAborted();
        if (job.bytes + chunk.length > 512 * 1024 * 1024) throw new Error('生成超过 512 MiB 上限');
        let n = 0; while (n < chunk.length) n += (await file.write(chunk, n, chunk.length - n)).bytesWritten;
        job.bytes += chunk.length;
      }
      signal.throwIfAborted();
      await file.write(wavHeader(job.bytes, rate), 0, 44, 0); await file.close(); file = null;
      const { rename } = await import('node:fs/promises'); await rename(part, join(this.dir, `${job.id}.wav`));
      job.info = { sampleRate: rate, channels: 1, duration: job.bytes / rate / 2, seed: input.seed, mode: input.mode, voice: input.voice_id, modelDigest: MODEL.sha256, runtimeVersion: '0.1.6' };
      job.status = 'ready'; job.finishedAt = Date.now(); await this.save(job);
    } catch (error) {
      await file?.close().catch(() => {}); await rm(part, { force: true }).catch(() => {});
      job.status = controller.signal.aborted ? 'cancelled' : 'failed'; job.error = controller.signal.aborted ? '已取消生成' : error.message;
      await this.save(job).catch(() => {});
    }
  }
  cancel(id) { const job = this.get(id); if (this.active?.id === id) this.active.controller.abort(); return job; }
  audioPath(id) { const j = this.get(id); if (j.status !== 'ready') throw httpError('音频尚未生成完成', 409); return join(this.dir, `${j.id}.wav`); }
  async close() { this.active?.controller.abort(); await this.active?.task; }
}
