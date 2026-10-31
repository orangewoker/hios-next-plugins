import http from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { resolve, join, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { homedir, networkInterfaces } from 'node:os';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { parseArgs } from 'node:util';
import { Downloads } from './downloads.mjs';
import { BreezeEngine } from './engine.mjs';
import { Jobs } from './jobs.mjs';
import { atomicJson, readJson, httpError } from './storage.mjs';
import { MODEL, RUNTIME, SUPPORTED_RUNTIME } from './catalog.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const isLoopback = ip => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip);
const equal = (a, b) => { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && timingSafeEqual(x, y); };
async function jsonBody(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw httpError('请求必须使用 application/json', 415);
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > 25 * 1024 * 1024) throw httpError('请求体超过 25 MiB', 413); chunks.push(c); }
  try { const v = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error(); return v; }
  catch { throw httpError('JSON 请求体无效'); }
}
function json(res, value, status = 200) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); }

export async function createWorkshop({ dataDir, host = '127.0.0.1', port = 17860, engineUrl = '', allowedHost = '' } = {}) {
  dataDir = resolve(dataDir || process.env.BREEZE_DATA_DIR || join(process.env.LOCALAPPDATA || homedir(), 'HIOS', 'breeze-tts'));
  await mkdir(dataDir, { recursive: true });
  const configPath = join(dataDir, 'service.json');
  let config = await readJson(configPath, null);
  if (!config) { config = { accessKey: randomBytes(24).toString('base64url'), licenseAcceptedAt: null }; await atomicJson(configPath, config); }
  const adminToken = randomBytes(32).toString('base64url');
  const downloads = new Downloads(dataDir), engine = new BreezeEngine(downloads, engineUrl), jobs = new Jobs(dataDir, engine); await jobs.init();
  let voiceBusy = false, startTask = null, closing = false, engineStopping = false;
  const addresses = Object.values(networkInterfaces()).flat().filter(x => x && !x.internal && x.family === 'IPv4').map(x => x.address);
  const allowedHosts = new Set(['127.0.0.1', 'localhost', '[::1]', ...addresses, ...(allowedHost ? [allowedHost.toLowerCase()] : [])]);
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
    try {
      const url = new URL(req.url, 'http://localhost'), path = url.pathname;
      let authority; try { authority = new URL(`http://${req.headers.host}`).hostname.toLowerCase(); } catch { throw httpError('Host 无效', 403); }
      if (!allowedHosts.has(authority)) throw httpError('Host 未获允许；反向代理请保留本机 Host 或指定 --allowed-host', 403);
      const origin = req.headers.origin;
      const sameOrigin = !origin || origin === `http://${req.headers.host}`;
      const hiosOrigin = origin === 'null' || /^hios-plugin:\/\/breeze-tts$/.test(origin || '') || /^https?:\/\/hios-plugin\.localhost$/.test(origin || '');
      if (origin && !sameOrigin && !hiosOrigin) throw httpError('不允许此网页来源', 403);
      if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
      if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Breeze-Admin, X-Breeze-Client'); res.writeHead(204); res.end(); return; }
      if (path === '/api/bootstrap' && req.method === 'GET') {
        // Only the local same-origin standalone panel can bootstrap management credentials.
        const local = isLoopback(req.socket.remoteAddress) && ['127.0.0.1', 'localhost', '[::1]'].includes(authority) && sameOrigin;
        json(res, local ? { local: true, accessKey: config.accessKey, adminToken } : { local: false }); return;
      }
      if (path.startsWith('/api/')) {
        if (closing) throw httpError('服务正在关闭', 503);
        if (!equal(req.headers.authorization, `Bearer ${config.accessKey}`)) throw httpError('连接密钥无效，请从服务端面板复制连接密钥', 401);
        if (path.startsWith('/api/admin/')) {
          if (!isLoopback(req.socket.remoteAddress) || !equal(req.headers['x-breeze-admin'], adminToken)) throw httpError('此操作只能在服务端本机管理面板完成', 403);
          if (path === '/api/admin/status' && req.method === 'GET') {
            json(res, { downloads: await downloads.status(), engine: { state: engine.state, error: engine.error, logs: engine.logs }, dataDir, supported: SUPPORTED_RUNTIME, licenseAccepted: Boolean(config.licenseAcceptedAt), sharing: host === '0.0.0.0', urls: addresses.map(ip => `http://${ip}:${server.address().port}`), model: MODEL, runtime: RUNTIME }); return;
          }
          const body = await jsonBody(req);
          if (path === '/api/admin/license' && req.method === 'POST') {
            if (body.accept !== true) throw httpError('请先确认模型许可');
            config.licenseAcceptedAt = Date.now(); await atomicJson(configPath, config); json(res, { ok: true }); return;
          }
          if (path === '/api/admin/download' && req.method === 'POST') {
            if (!config.licenseAcceptedAt) throw httpError('请先阅读并确认模型许可');
            if (engine.child || engine.starting || startTask || engineStopping) throw httpError('请先停止模型，再安装或修复文件', 409);
            downloads.start(body.id, body.repair === true); json(res, { ok: true }, 202); return;
          }
          if (path === '/api/admin/pause' && req.method === 'POST') { downloads.pause(body.id); json(res, { ok: true }); return; }
          if (path === '/api/admin/engine/start' && req.method === 'POST') {
            if (startTask || engine.starting || engineStopping) throw httpError('引擎正在加载或停止', 409);
            if (downloads.running.size) throw httpError('请等待下载/校验结束', 409);
            startTask = engine.start({ cpu: body.cpu === true }).catch(e => { engine.error = e.message; engine.state = 'error'; }).finally(() => { startTask = null; });
            json(res, { ok: true }, 202); return;
          }
          if (path === '/api/admin/engine/stop' && req.method === 'POST') {
            if (voiceBusy || engineStopping) throw httpError('正在保存音色或停止引擎，请稍后重试', 409);
            engineStopping = true;
            try { await jobs.close(); await engine.stop(); json(res, { ok: true }); }
            finally { engineStopping = false; } return;
          }
          throw httpError('管理接口不存在', 404);
        }
        if (path === '/api/health' && req.method === 'GET') {
          const engineReady = await engine.health() && !engineStopping;
          const engineState = engineReady ? 'ready' : engineStopping ? 'stopping' : startTask ? 'loading' : (engine.state === 'ready' || engine.external) ? 'unavailable' : engine.state;
          json(res, { service: 'breeze-tts', protocol: 'breeze-workshop/v1', version: '0.2.1', engineReady, engineState, model: 'Breeze-TTS-2-Q8_0', busy: Boolean(jobs.active || voiceBusy), sharing: host === '0.0.0.0' }); return;
        }
        if (path === '/api/voices' && req.method === 'GET') { json(res, await engine.voices()); return; }
        if (path === '/api/voices' && req.method === 'POST') {
          if (jobs.active || voiceBusy || engineStopping || startTask) throw httpError('引擎正在使用，请稍后保存音色', 409);
          voiceBusy = true;
          try { const input = await jsonBody(req); const voice = await engine.saveVoice(input); await atomicJson(join(dataDir, 'voices', `${input.name}.source.json`), { reference: input.reference, ref_text: input.ref_text, description: input.description }); json(res, voice, 201); }
          finally { voiceBusy = false; } return;
        }
        if (path === '/api/jobs' && req.method === 'GET') { json(res, jobs.list()); return; }
        if (path === '/api/jobs' && req.method === 'POST') {
          const input = await jsonBody(req);
          // Recheck after the asynchronous body read: a voice request may have reserved the engine meanwhile.
          if (voiceBusy || engineStopping || startTask) throw httpError('引擎正在管理操作，请稍后生成', 409);
          json(res, jobs.create(input), 202); return;
        }
        const match = /^\/api\/jobs\/([0-9a-f-]{36})(\/audio)?$/.exec(path);
        if (match) {
          const id = match[1];
          if (!match[2] && req.method === 'GET') { json(res, jobs.get(id)); return; }
          if (!match[2] && req.method === 'DELETE') { json(res, jobs.cancel(id)); return; }
          if (match[2] && req.method === 'GET') {
            const file = jobs.audioPath(id), s = await stat(file);
            res.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': s.size, 'Content-Disposition': `attachment; filename="breeze-${id}.wav"` });
            await pipeline(createReadStream(file), res); return;
          }
        }
        throw httpError('接口不存在', 404);
      }
      if (req.method !== 'GET') throw httpError('方法不允许', 405);
      if (path === '/') { res.writeHead(302, { Location: '/app/index.html' }); res.end(); return; }
      const name = decodeURIComponent(path === '/' ? '/app/index.html' : path), file = resolve(ROOT, `.${name}`);
      const relative = file.slice(ROOT.length + 1).replaceAll('\\', '/');
      if (!file.startsWith(ROOT + sep) || !/^(app|node|shared|assets)\//.test(relative) || !['.html', '.css', '.js', '.svg'].includes(extname(file))) throw httpError('文件不存在', 404);
      const bytes = await readFile(file);
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob: data:; connect-src 'self' http: https:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'");
      res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' })[extname(file)] }); res.end(bytes);
    } catch (e) {
      if (res.headersSent) res.destroy(e); else json(res, { error: e.message || '服务内部错误' }, e.status || (e.code === 'ENOENT' ? 404 : 400));
    }
  });
  server.requestTimeout = 120000;
  await new Promise((ok, fail) => { server.once('error', fail); server.listen(port, host, () => { server.off('error', fail); ok(); }); });
  return { server, engine, jobs, downloads, dataDir, config, adminToken,
    async close() { if (closing) return; closing = true; await jobs.close(); await downloads.close(); await engine.stop(); await startTask; server.closeAllConnections(); await new Promise(r => server.close(r)); }
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const { values } = parseArgs({ options: { 'data-dir': { type: 'string' }, managed: { type: 'boolean', default: false }, port: { type: 'string', default: '17860' }, lan: { type: 'boolean', default: false }, 'allowed-host': { type: 'string' }, 'engine-url': { type: 'string' } } });
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('端口需为 1–65535');
  if (values['engine-url'] && !/^http:\/\/127\.0\.0\.1:\d+$/.test(values['engine-url'])) throw new Error('--engine-url 仅供本机外部引擎/测试');
  const app = await createWorkshop({ dataDir: values['data-dir'], port, host: values.lan ? '0.0.0.0' : '127.0.0.1', engineUrl: values['engine-url'], allowedHost: values['allowed-host'] });
  if (values.managed) {
    if (!process.send) { await app.close(); throw new Error('托管模式需要 HIOS IPC'); }
    process.send({ type: 'breeze-workshop-ready', port: app.server.address().port, accessKey: app.config.accessKey, adminToken: app.adminToken });
    let stopping;
    const shutdown = () => { stopping ||= app.close().then(() => process.exit(0)); };
    process.on('message', m => { if (m?.type === 'breeze-workshop-stop') shutdown(); });
    process.once('disconnect', shutdown);
  }
  console.log(`Breeze TTS 语音工坊\n本机面板：http://127.0.0.1:${port}\n局域网：${values.lan ? '已开启' : '未开启（添加 --lan 开启）'}\n数据目录：${app.dataDir}\n按 Ctrl+C 停止。`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { app.close().then(() => process.exit(0)); });
}
