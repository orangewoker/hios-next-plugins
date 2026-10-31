import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { downloadFile, verified, ensureDownload } from '../service/downloads.mjs';
async function temp(t) { const d = await mkdtemp(join(tmpdir(), 'breeze-download-test-')); t.after(async () => { assert.equal(dirname(resolve(d)), resolve(tmpdir())); await rm(d, { recursive: true, force: true }); }); return d; }
const bytes = Buffer.from('test-pinned-gguf-fixture'), spec = { url: 'https://fixture.invalid/model', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
test('streaming download validates and seals immutable content', async t => {
  const p = join(await temp(t), 'model.gguf'), progress = [];
  await downloadFile(spec, p, { fetchImpl: async () => new Response(bytes), onProgress: p => progress.push(p) });
  assert.deepEqual(await readFile(p), bytes); assert.equal(await verified(p, spec), true); assert.ok(progress.some(p => p.stage === 'verifying'));
  await writeFile(p, 'corrupt'); assert.equal(await verified(p, spec), false);
});
test('resume checks Content-Range and can restart when source ignores Range', async t => {
  const p = join(await temp(t), 'model'); await writeFile(`${p}.part`, bytes.subarray(0, 5));
  await downloadFile(spec, p, { fetchImpl: async (url, options) => { assert.equal(options.headers.Range, 'bytes=5-'); return new Response(bytes.subarray(5), { status: 206, headers: { 'Content-Range': `bytes 5-${bytes.length - 1}/${bytes.length}` } }); } });
  assert.deepEqual(await readFile(p), bytes);
  const p2 = `${p}2`; await writeFile(`${p2}.part`, 'old'); await downloadFile(spec, p2, { fetchImpl: async () => new Response(bytes) }); assert.deepEqual(await readFile(p2), bytes);
});
test('rejects wrong hashes, incorrect ranges and truncated downloads without publishing', async t => {
  const p = join(await temp(t), 'model');
  await assert.rejects(downloadFile({ ...spec, sha256: '0'.repeat(64) }, p, { fetchImpl: async () => new Response(bytes) }), /SHA/); assert.equal(await stat(p).catch(() => null), null);
  await writeFile(`${p}.part`, bytes.subarray(0, 5));
  await assert.rejects(downloadFile(spec, p, { fetchImpl: async () => new Response(bytes.subarray(5), { status: 206, headers: { 'Content-Range': `bytes 4-${bytes.length - 1}/${bytes.length}` } }) }), /续传/);
  await rm(`${p}.part`); await assert.rejects(downloadFile(spec, p, { fetchImpl: async () => new Response(bytes.subarray(0, 4)) }), /中断/); assert.equal((await stat(`${p}.part`)).size, 4);
});
test('aborted complete part never publishes a ready artifact', async t => {
  const p = join(await temp(t), 'model'); await writeFile(`${p}.part`, bytes); const c = new AbortController(); c.abort();
  await assert.rejects(downloadFile(spec, p, { signal: c.signal })); assert.equal(await stat(p).catch(() => null), null);
});

test('repair rehashes valid files and redownloads missing or corrupt artifacts', async t => {
  const p = join(await temp(t), 'model'); let downloads = 0;
  const options = { repair: true, fetchImpl: async () => { downloads++; return new Response(bytes); } };
  await ensureDownload(spec, p, options); assert.equal(downloads, 1);
  await ensureDownload(spec, p, options); assert.equal(downloads, 1);
  await writeFile(p, Buffer.alloc(bytes.length)); await ensureDownload(spec, p, options);
  assert.equal(downloads, 2); assert.deepEqual(await readFile(p), bytes); assert.equal(await verified(p, spec), true);
});
