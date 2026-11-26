import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { discoverDefaultTemplate, createSessionFileFromTemplate } from '../engine/sketchup-client.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(HERE, '..');
const SERVER_ENTRY = join(PLUGIN_ROOT, 'engine', 'server.mjs');

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function startMcp(env = {}) {
  const child = spawn(process.execPath, [SERVER_ENTRY], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
  });
  let buf = '';
  const pending = new Map();
  child.stdout.on('data', chunk => {
    buf += chunk.toString('utf8');
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      const waiter = pending.get(msg.id);
      if (waiter) {
        pending.delete(msg.id);
        waiter(msg);
      }
    }
  });
  let seq = 1;
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = seq++;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`MCP timeout: ${method}`)); }, 15000);
    pending.set(id, msg => { clearTimeout(timer); resolve(msg); });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  return { child, call, close: () => child.kill() };
}

async function startMockBridge(stateDir, { year = '2027', pid = process.pid, token = 'test-token-123' } = {}) {
  const received = [];
  const server = http.createServer((req, res) => {
    if (req.headers.authorization !== `Bearer ${token}`) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Unauthorized' }));
      return;
    }
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      const parsed = body ? JSON.parse(body) : {};
      received.push({ method: req.method, url: req.url, body: parsed });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      if (req.url === '/ping') {
        res.end(JSON.stringify({
          ok: true,
          bridgeVersion: '1.2.0',
          year,
          version: `${year}.0.1`,
          pid,
          revision: '1:5:false:material:false',
          modelTitle: '测试模型.skp',
          units: 'mm',
          entityCount: 5,
          displayMode: 'material',
          shadows: false,
          scenes: ['客厅透视', '厨房立面'],
        }));
      } else if (req.url === '/camera_control') {
        res.end(JSON.stringify({
          ok: true,
          action: parsed.action,
          revision: '2:5:false:material:false',
          previewDataUrl: `data:image/jpeg;base64,${TINY_PNG.toString('base64')}`,
        }));
      } else if (req.url === '/inspect') {
        res.end(JSON.stringify({
          ok: true,
          title: '测试模型.skp',
          units: 'mm',
          entityCount: 5,
          boundsMm: { min: [0, 0, 0], max: [2000, 900, 900], size: [2000, 900, 900] },
          scenes: ['客厅透视', '厨房立面'],
          displayMode: 'material',
          shadows: false,
        }));
      } else if (req.url === '/run_ruby') {
        res.end(JSON.stringify({
          ok: true,
          operationName: parsed.operationName || 'HIOS建模',
          entityCount: 7,
          boundsMm: { min: [0, 0, 0], max: [2000, 900, 900], size: [2000, 900, 900] },
          result: 'ok',
        }));
      } else if (req.url === '/capture_view') {
        const fmt = parsed.imageFormat === 'jpg' ? 'jpg' : 'png';
        const trans = Boolean(parsed.transparent) && fmt === 'png';
        if (parsed.outputPath) writeFileSync(parsed.outputPath, TINY_PNG);
        res.end(JSON.stringify({
          ok: true,
          path: parsed.outputPath,
          width: parsed.width || 1280,
          height: parsed.height || 960,
          cameraPreset: parsed.cameraPreset || 'current',
          sceneName: parsed.sceneName || '',
          displayMode: parsed.displayMode || 'material',
          shadows: Boolean(parsed.shadows),
          imageFormat: fmt,
          mimeType: fmt === 'jpg' ? 'image/jpeg' : 'image/png',
          transparent: trans,
          base64: TINY_PNG.toString('base64'),
        }));
      } else if (req.url === '/select_entity') {
        res.end(JSON.stringify({ ok: true, selectedCount: 1, selectedIds: [101] }));
      } else if (req.url === '/model_file') {
        if (parsed.path) writeFileSync(parsed.path, Buffer.from('FAKE_SKP_DATA'));
        res.end(JSON.stringify({ ok: true, action: parsed.action, path: parsed.path }));
      } else if (req.url === '/undo') {
        res.end(JSON.stringify({ ok: true, action: 'undo' }));
      } else {
        res.end(JSON.stringify({ ok: false, error: 'unknown' }));
      }
    });
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const instDir = join(stateDir, 'instances');
  mkdirSync(instDir, { recursive: true });
  writeFileSync(join(instDir, `su-${year}-${pid}.json`), JSON.stringify({
    pid,
    year,
    version: `${year}.0.1`,
    port,
    token,
    bridgeVersion: '1.1.0',
  }));
  return { server, port, received, close: () => new Promise(r => server.close(r)) };
}

test('manifest, skill parity and canvas-only node structure', () => {
  const manifest = JSON.parse(readFileSync(join(PLUGIN_ROOT, 'plugin.json'), 'utf8'));
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.id, 'sketchup-studio');
  assert.equal(manifest.name, 'SketchUp 建模');
  assert.equal(manifest.contributes.apps, undefined, 'must be canvas node only without app entry');
  assert.equal(manifest.nodes.length, 1);
  assert.equal(manifest.nodes[0].id, 'sketchup-studio.model');

  const skillDecl = manifest.contributes.skills[0];
  assert.equal(skillDecl.id, 'sketchup-studio');
  assert.equal(skillDecl.path, 'skills/sketchup-studio/SKILL.md');
  const skillText = readFileSync(join(PLUGIN_ROOT, skillDecl.path), 'utf8');
  assert.match(skillText, /^---\r?\n[\s\S]*?name:\s*sketchup-studio\b/);

  const html = readFileSync(join(PLUGIN_ROOT, 'runtime', 'index.html'), 'utf8');
  assert.match(html, /id="viewer"[^>]*class="nodrag"[^>]*role="application"/, 'viewport must opt out of host fitForm and node drag for orbit/pan');
  assert.match(html, /id="live-sync"/);
  assert.match(html, /id="capture-format"/);
  assert.match(html, /value="png-transparent"/);
  assert.match(html, /value="jpg"/);
  assert.match(html, /data-mode="material"/);
  assert.match(html, /data-mode="white"/);
  assert.match(html, /data-mode="wire"/);
  assert.match(html, /id="toggle-shadows"/);
});

test('MCP engine handles style+shadows capture, workspace persistence, ruby ops and export', async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'hios-su-test-'));
  const stateDir = join(tempRoot, 'state');
  const workspace = join(tempRoot, 'workspace');
  mkdirSync(workspace, { recursive: true });
  const ctx = { root: workspace, baseUrl: 'hios-asset://local/test-ws/' };

  const mock = await startMockBridge(stateDir, { year: '2027' });
  const mcp = startMcp({ HIOS_SKETCHUP_STATE_DIR: stateDir });

  try {
    const init = await mcp.call('initialize', { protocolVersion: '2025-03-26' });
    assert.equal(init.result.serverInfo.name, 'sketchup-studio');

    const listed = await mcp.call('tools/list');
    const names = listed.result.tools.map(t => t.name);
    assert.ok(names.includes('sketchup_capture_view'));
    assert.ok(names.includes('ui_capture_view'));
    assert.ok(names.includes('ui_sync_dsh'));
    const uiTool = listed.result.tools.find(t => t.name === 'ui_capture_view');
    assert.equal(uiTool._meta['hios/uiOnly'], true);

    // 1. Capture white clay mode with shadows enabled and sceneName
    const capRes = await mcp.call('tools/call', {
      name: 'sketchup_capture_view',
      arguments: {
        version: '2027',
        displayMode: 'white',
        shadows: true,
        sceneName: '客厅透视',
        _context: ctx,
      },
    });
    assert.equal(capRes.result.isError, undefined);
    assert.equal(capRes.result.content.length, 2, 'agent capture must include text metadata and image block');
    assert.equal(capRes.result.content[1].type, 'image');
    const capMeta = JSON.parse(capRes.result.content[0].text);
    assert.equal(capMeta.displayMode, 'white');
    assert.equal(capMeta.shadows, true);
    assert.equal(capMeta.sceneName, '客厅透视');
    assert.match(capMeta.url, /^hios-asset:\/\/local\/test-ws\/captures\/preview-\d+\.png$/);
    assert.ok(existsSync(join(workspace, capMeta.path)));

    // 2. UI capture supports transparent PNG and JPG output formats
    const uiCap = await mcp.call('tools/call', {
      name: 'ui_capture_view',
      arguments: {
        version: '2027',
        displayMode: 'wire',
        shadows: false,
        imageFormat: 'png',
        transparent: true,
        cameraPreset: 'iso',
        _context: ctx,
      },
    });
    assert.equal(uiCap.result.content.length, 1);
    const uiMeta = JSON.parse(uiCap.result.content[0].text);
    assert.equal(uiMeta.displayMode, 'wire');
    assert.equal(uiMeta.shadows, false);
    assert.equal(uiMeta.imageFormat, 'png');
    assert.equal(uiMeta.transparent, true);
    assert.equal(uiMeta.mimeType, 'image/png');

    const jpgCap = await mcp.call('tools/call', {
      name: 'ui_capture_view',
      arguments: { version: '2027', displayMode: 'material', imageFormat: 'jpg', transparent: true, _context: ctx },
    });
    const jpgMeta = JSON.parse(jpgCap.result.content[0].text);
    assert.equal(jpgMeta.imageFormat, 'jpg');
    assert.equal(jpgMeta.transparent, false, 'JPG cannot be transparent');
    assert.equal(jpgMeta.mimeType, 'image/jpeg');
    assert.match(jpgMeta.path, /\.jpg$/);

    // 3. Run ruby records operation history
    const rubyRes = await mcp.call('tools/call', {
      name: 'sketchup_run_ruby',
      arguments: { version: '2027', code: '1 + 1', operationName: '创建框架', _context: ctx },
    });
    assert.equal(rubyRes.result.isError, false);

    // 4. Export model saves to workspace
    const expRes = await mcp.call('tools/call', {
      name: 'ui_export_model',
      arguments: { version: '2027', format: 'skp', _context: ctx },
    });
    const expMeta = JSON.parse(expRes.result.content[0].text);
    assert.ok(expMeta.file?.path);
    assert.ok(existsSync(join(workspace, expMeta.file.path)));

    // 5. History aggregates captures, ops and latestModel
    const histRes = await mcp.call('tools/call', { name: 'ui_history', arguments: { _context: ctx } });
    const hist = JSON.parse(histRes.result.content[0].text);
    assert.equal(hist.captures.length, 3);
    assert.equal(hist.operations.length, 1);
    assert.equal(hist.operations[0].operationName, '创建框架');
    assert.equal(hist.latestModel.format, 'skp');

    // 6. Undo, select entity, live-sync ping and camera orbit/pan/zoom route cleanly
    const undoRes = await mcp.call('tools/call', { name: 'ui_undo', arguments: { version: '2027' } });
    assert.equal(undoRes.result.isError, false);
    const selRes = await mcp.call('tools/call', { name: 'sketchup_select_entity', arguments: { version: '2027', name: '桌面' } });
    assert.equal(selRes.result.isError, false);
    const pingRes = await mcp.call('tools/call', { name: 'ui_ping', arguments: { version: '2027' } });
    const pingMeta = JSON.parse(pingRes.result.content[0].text);
    assert.equal(pingMeta.revision, '1:5:false:material:false');
    const camRes = await mcp.call('tools/call', {
      name: 'ui_camera',
      arguments: { version: '2027', action: 'orbit', dx: 24, dy: -10, displayMode: 'white', shadows: true, fastPreview: true },
    });
    const camMeta = JSON.parse(camRes.result.content[0].text);
    assert.equal(camMeta.ok, true);
    assert.equal(camMeta.action, 'orbit');
    assert.match(camMeta.previewDataUrl, /^data:image\/jpeg;base64,/);

    const captureReq = mock.received.find(r => r.url === '/capture_view' && r.body.displayMode === 'white');
    assert.ok(captureReq);
    assert.equal(captureReq.body.shadows, true);
    assert.equal(captureReq.body.sceneName, '客厅透视');
  } finally {
    mcp.close();
    await mock.close();
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('discoverDefaultTemplate reads PrivatePreferences DefaultTemplate and creates isolated session copy', () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'hios-su-tpl-'));
  const fakeLocal = join(tempRoot, 'local');
  const fakeRoaming = join(tempRoot, 'roaming');
  const fakeState = join(tempRoot, 'state');
  const prefDir = join(fakeLocal, 'SketchUp', 'SketchUp 2027', 'SketchUp');
  const tplDir = join(fakeRoaming, 'SketchUp', 'SketchUp 2027', 'SketchUp', 'Templates');
  mkdirSync(prefDir, { recursive: true });
  mkdirSync(tplDir, { recursive: true });
  const favTpl = join(tplDir, '2027-b2.skp');
  writeFileSync(favTpl, Buffer.from('TEMPLATE_2027_B2'));
  writeFileSync(join(prefDir, 'PrivatePreferences.json'), JSON.stringify({
    'This Computer Only': {
      Preferences: { DefaultTemplate27: favTpl.replace(/\\/g, '/') },
    },
  }));

  const prevLocal = process.env.LOCALAPPDATA;
  const prevApp = process.env.APPDATA;
  const prevState = process.env.HIOS_SKETCHUP_STATE_DIR;
  try {
    process.env.LOCALAPPDATA = fakeLocal;
    process.env.APPDATA = fakeRoaming;
    process.env.HIOS_SKETCHUP_STATE_DIR = fakeState;
    const found = discoverDefaultTemplate('2027');
    assert.equal(found.toLowerCase(), favTpl.toLowerCase());
    const sessionFile = createSessionFileFromTemplate(found, '2027');
    assert.notEqual(sessionFile.toLowerCase(), favTpl.toLowerCase(), 'must not mutate original template');
    assert.ok(existsSync(sessionFile));
    assert.equal(readFileSync(sessionFile, 'utf8'), 'TEMPLATE_2027_B2');
  } finally {
    process.env.LOCALAPPDATA = prevLocal;
    process.env.APPDATA = prevApp;
    if (prevState === undefined) delete process.env.HIOS_SKETCHUP_STATE_DIR;
    else process.env.HIOS_SKETCHUP_STATE_DIR = prevState;
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
