// Explicit test fixture: outputs a sine wave, never a speech/model fallback.
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
export async function createMockEngine(port = 0) {
  const voices = new Map(); let active = false, cancellations = 0;
  const server = http.createServer(async (req, res) => {
    if (req.url === '/health') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ status: 'ok', sample_rate: 24000, ws_port: 0 })); return; }
    if (req.url === '/v1/voices' && req.method === 'GET') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify([...voices.values()])); return; }
    let body = ''; for await (const c of req) body += c.toString('latin1');
    const field = name => { const m = new RegExp(`name="${name}"\\r\\n\\r\\n([^]*?)\\r\\n--`).exec(body); return m ? Buffer.from(m[1], 'latin1').toString('utf8') : ''; };
    if (req.url === '/v1/voices' && req.method === 'POST') { const v = { id: field('name'), saved: true, ref_text: field('ref_text'), description: field('description'), seconds: 5 }; voices.set(v.id, v); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(v)); return; }
    if (req.url !== '/v1/audio/speech') { res.writeHead(404); res.end(); return; }
    if (active) { res.writeHead(409); res.end('{"error":"busy"}'); return; }
    active = true; res.writeHead(200, { 'Content-Type': 'audio/pcm', 'X-Sample-Rate': '24000' });
    let n = 0; const count = field('text').includes('[slow]') ? 600 : 8;
    const timer = setInterval(() => {
      const bytes = Buffer.alloc(2400);
      for (let i = 0; i < 1200; i++) bytes.writeInt16LE(Math.round(Math.sin((n * 1200 + i) * Math.PI * 2 * 440 / 24000) * 6000), i * 2);
      res.write(bytes); n++; if (n >= count) { clearInterval(timer); active = false; res.end(); }
    }, 20);
    res.on('close', () => { if (n < count) cancellations++; clearInterval(timer); active = false; });
  });
  await new Promise(r => server.listen(port, '127.0.0.1', r));
  return { server, get cancellations() { return cancellations; }, url: `http://127.0.0.1:${server.address().port}`, async close() { server.closeAllConnections(); await new Promise(r => server.close(r)); } };
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const mock = await createMockEngine(Number(process.env.BREEZE_MOCK_PORT || 17861));
  console.log(`TEST ONLY — sine wave mock, not speech: ${mock.url}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => mock.close().then(() => process.exit(0)));
}
