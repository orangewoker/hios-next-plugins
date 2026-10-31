import { createReadStream } from 'node:fs';
import { mkdir, open, stat, rename, rm, readFile, writeFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { MODEL, RUNTIME, SUPPORTED_RUNTIME } from './catalog.mjs';
import { atomicJson, readJson, httpError } from './storage.mjs';

export async function sha256(path, signal) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path, { signal })) hash.update(chunk);
  return hash.digest('hex');
}
export async function verified(path, spec) {
  try {
    const s = await stat(path), seal = await readJson(`${path}.verified.json`, null);
    return s.isFile() && s.size === spec.bytes && seal?.sha256 === spec.sha256 && seal?.mtimeMs === s.mtimeMs;
  } catch { return false; }
}
export async function sealFile(path, spec, signal) {
  const s = await stat(path);
  if (s.size !== spec.bytes || await sha256(path, signal) !== spec.sha256) throw Object.assign(new Error('文件大小或 SHA-256 不匹配，请重新下载'), { code: 'EINTEGRITY' });
  await atomicJson(`${path}.verified.json`, { sha256: spec.sha256, mtimeMs: s.mtimeMs, bytes: s.size });
}

// Only the fixed catalog is used in production. fetchImpl/spec injection is for fixture tests.
export async function downloadFile(spec, path, { signal, onProgress = () => {}, fetchImpl = fetch } = {}) {
  await mkdir(dirname(path), { recursive: true });
  const part = `${path}.part`;
  let offset = await stat(part).then(s => s.size).catch(() => 0);
  if (offset > spec.bytes) { await rm(part); offset = 0; }
  if (offset !== spec.bytes) {
    const response = await fetchImpl(spec.url, { headers: offset ? { Range: `bytes=${offset}-` } : {}, signal });
    if (response.status === 206) {
      const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('content-range') || '');
      if (!range || Number(range[1]) !== offset || Number(range[3]) !== spec.bytes || Number(range[2]) >= spec.bytes) { await response.body?.cancel(); throw new Error('下载源返回无效的续传范围'); }
    } else if (response.status === 200) offset = 0;
    else { await response.body?.cancel(); throw new Error(`下载失败：HTTP ${response.status}`); }
    if (!response.body) throw new Error('下载源没有返回文件');
    const expected = Number(response.headers.get('content-length'));
    if (expected && expected !== spec.bytes - offset) { await response.body.cancel(); throw new Error('下载源文件长度不符合固定版本'); }
    const file = await open(part, offset ? 'a' : 'w');
    try {
      onProgress({ stage: 'downloading', received: offset, total: spec.bytes });
      for await (const bytes of response.body) {
        signal?.throwIfAborted();
        if (offset + bytes.byteLength > spec.bytes) throw new Error('下载数据超过预期大小');
        let written = 0;
        while (written < bytes.length) written += (await file.write(bytes, written, bytes.length - written)).bytesWritten;
        offset += bytes.length; onProgress({ stage: 'downloading', received: offset, total: spec.bytes });
      }
    } finally { await file.close(); }
  }
  signal?.throwIfAborted();
  if (offset !== spec.bytes) throw new Error('下载中断，已保留分片，可继续下载');
  onProgress({ stage: 'verifying', received: offset, total: spec.bytes });
  if (await sha256(part, signal) !== spec.sha256) {
    await rm(part, { force: true }); throw new Error('SHA-256 校验失败，已移除错误分片，请重试');
  }
  signal?.throwIfAborted();
  await rename(part, path);
  const s = await stat(path);
  await atomicJson(`${path}.verified.json`, { sha256: spec.sha256, bytes: s.size, mtimeMs: s.mtimeMs });
  return path;
}

export async function ensureDownload(spec, path, { repair = false, ...options } = {}) {
  if (repair) {
    try { await sealFile(path, spec, options.signal); }
    catch (error) {
      options.signal?.throwIfAborted();
      if (!['ENOENT', 'EINTEGRITY'].includes(error.code)) throw error;
      await rm(`${path}.verified.json`, { force: true });
    }
  }
  if (!await verified(path, spec)) await downloadFile(spec, path, options);
  return path;
}

export class Downloads {
  constructor(dataDir) {
    this.dataDir = dataDir; this.operations = new Map(); this.running = new Map();
    this.specs = { model: MODEL, runtime: RUNTIME };
    this.paths = { model: join(dataDir, 'models', MODEL.file), runtime: join(dataDir, 'downloads', RUNTIME.file) };
  }
  async status() {
    const result = {};
    for (const id of ['runtime', 'model']) {
      const ready = await verified(this.paths[id], this.specs[id]);
      const partial = await stat(`${this.paths[id]}.part`).then(s => s.size).catch(() => 0);
      result[id] = { id, bytes: this.specs[id].bytes, version: id === 'model' ? MODEL.revision : RUNTIME.version, ready,
        received: partial, stage: ready ? 'ready' : partial ? 'paused' : 'missing', ...this.operations.get(id) };
    }
    result.runtime.installed = await this.executable().then(Boolean);
    return result;
  }
  start(id, repair = false) {
    if (!this.specs[id]) throw httpError('未知下载项目');
    if (id === 'runtime' && !SUPPORTED_RUNTIME) throw httpError('自动运行库目前仅支持 Windows x64');
    if (this.running.has(id)) throw httpError('此下载/校验已经运行', 409);
    const controller = new AbortController();
    this.operations.set(id, { stage: repair ? 'verifying' : 'preparing', error: '' });
    const task = (async () => {
      await ensureDownload(this.specs[id], this.paths[id], { repair, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(6 * 60 * 60 * 1000)]), onProgress: x => this.operations.set(id, x) });
      controller.signal.throwIfAborted();
      if (id === 'runtime') { this.operations.set(id, { stage: 'extracting' }); await this.installRuntime(controller.signal); }
      this.operations.set(id, { stage: 'ready', received: this.specs[id].bytes, error: '' });
    })().catch(error => this.operations.set(id, { stage: controller.signal.aborted ? 'paused' : 'error', error: controller.signal.aborted ? '' : error.message }))
      .finally(() => this.running.delete(id));
    this.running.set(id, { controller, task });
  }
  pause(id) { this.running.get(id)?.controller.abort(); }
  async executable() {
    const receipt = await readJson(join(this.dataDir, 'runtimes', 'installed.json'), null);
    if (!receipt || receipt.version !== RUNTIME.version) return null;
    const root = resolve(this.dataDir, 'runtimes', RUNTIME.version), path = resolve(root, receipt.entry);
    if (!path.startsWith(root + sep)) return null;
    return await stat(path).then(s => s.isFile() ? path : null).catch(() => null);
  }
  async installRuntime(signal) {
    if (await this.executable()) return;
    const { unzipSync } = await import('../vendor/fflate.mjs');
    const entries = unzipSync(new Uint8Array(await readFile(this.paths.runtime)));
    const root = resolve(this.dataDir, 'runtimes'), stage = join(root, `stage-${randomUUID()}`);
    await mkdir(stage, { recursive: true });
    try {
      let entry = '', total = 0;
      for (const [name, bytes] of Object.entries(entries)) {
        signal?.throwIfAborted();
        const normalized = name.replaceAll('\\', '/');
        if (normalized.startsWith('/') || /[\x00-\x1f:]/.test(normalized) || normalized.split('/').includes('..')) throw new Error('运行库包含非法路径');
        const path = resolve(stage, normalized);
        if (!path.startsWith(stage + sep)) throw new Error('运行库路径越界');
        total += bytes.length;
        if (total > 512 * 1024 * 1024) throw new Error('运行库解压大小超限');
        if (normalized.endsWith('/')) continue;
        await mkdir(dirname(path), { recursive: true }); await writeFile(path, bytes);
        if (/(^|\/)breeze-server\.exe$/i.test(normalized)) entry = normalized;
      }
      if (!entry) throw new Error('发行包缺少 breeze-server.exe');
      const dest = join(root, RUNTIME.version);
      // This is exclusively a fixed managed runtime directory, never a user-provided path.
      await rm(dest, { recursive: true, force: true }); await rename(stage, dest);
      await atomicJson(join(root, 'installed.json'), { version: RUNTIME.version, entry });
    } finally { await rm(stage, { recursive: true, force: true }); }
  }
  async close() { for (const { controller } of this.running.values()) controller.abort(); await Promise.all([...this.running.values()].map(x => x.task)); }
}
