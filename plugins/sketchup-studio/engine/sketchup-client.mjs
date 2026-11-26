import { execFileSync, spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as wait } from 'node:timers/promises';

const HERE = dirname(fileURLToPath(import.meta.url));
export const BRIDGE_VERSION = '1.1.0';
const BRIDGE_DIR = existsSync(join(HERE, 'bridge')) ? join(HERE, 'bridge') : join(HERE, '..', 'bridge');
const BRIDGE_SOURCE_LOADER = join(BRIDGE_DIR, 'hios_sketchup_bridge.rb');
const BRIDGE_SOURCE_MAIN = join(BRIDGE_DIR, 'hios_sketchup_bridge', 'main.rb');

export function bridgeStateRoot() {
  const base = process.env.HIOS_SKETCHUP_STATE_DIR || process.env.LOCALAPPDATA || process.env.APPDATA || join(HERE, '.state');
  return process.env.HIOS_SKETCHUP_STATE_DIR ? resolve(base) : join(base, 'hios-sketchup-bridge');
}

export function instancesDir() {
  return join(bridgeStateRoot(), 'instances');
}

function configPath() {
  return join(bridgeStateRoot(), 'config.json');
}

export function readConfig() {
  try {
    if (!existsSync(configPath())) return {};
    const parsed = JSON.parse(readFileSync(configPath(), 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function writeConfig(next) {
  const dir = bridgeStateRoot();
  mkdirSync(dir, { recursive: true });
  writeFileSync(configPath(), JSON.stringify(next, null, 2), 'utf8');
}

function parseYear(text) {
  const match = String(text || '').match(/\b(20\d{2})\b/);
  return match ? match[1] : '';
}

function findExeInDir(baseDir) {
  if (!baseDir || !existsSync(baseDir)) return '';
  for (const candidate of [join(baseDir, 'SketchUp', 'SketchUp.exe'), join(baseDir, 'SketchUp.exe')]) {
    if (existsSync(candidate)) return candidate;
  }
  return '';
}

function pluginsDirForYear(year) {
  const appData = process.env.APPDATA || '';
  if (!appData || !year) return '';
  return join(appData, 'SketchUp', `SketchUp ${year}`, 'SketchUp', 'Plugins');
}

function inspectInstalledBridge(pluginsDir) {
  if (!pluginsDir) return { installed: false, upToDate: false, version: '' };
  const loader = join(pluginsDir, 'hios_sketchup_bridge.rb');
  const main = join(pluginsDir, 'hios_sketchup_bridge', 'main.rb');
  if (!existsSync(loader) || !existsSync(main)) return { installed: false, upToDate: false, version: '' };
  try {
    const content = readFileSync(main, 'utf8');
    const ver = content.match(/BRIDGE_VERSION\s*=\s*'([^']+)'/)?.[1] || '';
    return { installed: true, upToDate: ver === BRIDGE_VERSION, version: ver };
  } catch {
    return { installed: true, upToDate: false, version: '' };
  }
}

function scanRegistryLocations() {
  if (process.platform !== 'win32') return [];
  try {
    const script = [
      "$paths = @('HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*')",
      "Get-ItemProperty $paths -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -match '^SketchUp\\s+20\\d{2}' -and $_.InstallLocation } | Select-Object DisplayName, DisplayVersion, InstallLocation | ConvertTo-Json -Compress",
    ].join('; ');
    const out = execFileSync('pwsh', ['-NoProfile', '-Command', script], { encoding: 'utf8', timeout: 5000, windowsHide: true }).trim();
    if (!out) return [];
    const parsed = JSON.parse(out);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

export function discoverInstalledVersions() {
  const byYear = new Map();
  const addCandidate = (year, installDir, displayVersion = '') => {
    const normalizedYear = parseYear(year);
    if (!normalizedYear) return;
    const exePath = findExeInDir(installDir);
    if (!exePath) return;
    const pluginsDir = pluginsDirForYear(normalizedYear);
    const bridge = inspectInstalledBridge(pluginsDir);
    const existing = byYear.get(normalizedYear);
    if (!existing || (!existing.displayVersion && displayVersion)) {
      byYear.set(normalizedYear, {
        year: normalizedYear,
        name: `SketchUp ${normalizedYear}`,
        displayVersion: displayVersion || existing?.displayVersion || '',
        installDir: resolve(installDir),
        exePath: resolve(exePath),
        pluginsDir,
        bridgeInstalled: bridge.installed,
        bridgeUpToDate: bridge.upToDate,
        bridgeVersion: bridge.version,
      });
    }
  };

  for (const row of scanRegistryLocations()) {
    addCandidate(row.DisplayName, row.InstallLocation, String(row.DisplayVersion || ''));
  }

  for (const root of [
    join(process.env.ProgramFiles || 'C:\\Program Files', 'SketchUp'),
    join(process.env.ProgramFiles || 'C:\\Program Files', 'Trimble'),
    'D:\\Program Files\\SketchUp',
    'D:\\SketchUp',
  ]) {
    if (!existsSync(root)) continue;
    try {
      for (const entry of readdirSync(root, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const year = parseYear(entry.name);
        if (year) addCandidate(year, join(root, entry.name));
      }
    } catch { /* ignore unreadable roots */ }
  }

  return [...byYear.values()].sort((a, b) => Number(b.year) - Number(a.year));
}

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err && err.code === 'EPERM';
  }
}

async function httpRequest(instance, method, path, body, timeoutMs = 15000) {
  const url = `http://127.0.0.1:${instance.port}${path}`;
  const init = {
    method,
    headers: {
      Authorization: `Bearer ${instance.token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    signal: AbortSignal.timeout(timeoutMs),
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(url, init);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`SketchUp 桥接返回无效响应 (${res.status}): ${text.slice(0, 300)}`); }
  if (!res.ok) throw new Error(json?.error || `SketchUp 桥接请求失败 (${res.status})`);
  return json;
}

export async function discoverRunningInstances({ pruneStale = true } = {}) {
  const dir = instancesDir();
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter(f => f.endsWith('.json'));
  const live = [];
  for (const file of files) {
    const full = join(dir, file);
    let record;
    try {
      record = JSON.parse(readFileSync(full, 'utf8'));
    } catch {
      if (pruneStale) try { unlinkSync(full); } catch {}
      continue;
    }
    if (!record || !record.port || !record.token) continue;
    if (record.pid && !isPidAlive(Number(record.pid))) {
      if (pruneStale) try { unlinkSync(full); } catch {}
      continue;
    }
    try {
      const ping = await httpRequest(record, 'GET', '/ping', undefined, 1800);
      if (ping?.ok) {
        live.push({
          ...record,
          bridgeVersion: String(ping.bridgeVersion || record.bridgeVersion || ''),
          year: String(ping.year || record.year || ''),
          version: String(ping.version || record.version || ''),
          modelTitle: ping.modelTitle || '',
          modelPath: ping.modelPath || '',
          modified: Boolean(ping.modified),
          units: ping.units || '',
          entityCount: ping.entityCount ?? 0,
          selectionCount: ping.selectionCount ?? 0,
          displayMode: ping.displayMode || 'material',
          shadows: Boolean(ping.shadows),
          scenes: Array.isArray(ping.scenes) ? ping.scenes : [],
        });
      }
    } catch {
      if (pruneStale && record.pid && !isPidAlive(Number(record.pid))) {
        try { unlinkSync(full); } catch {}
      }
    }
  }
  return live.sort((a, b) => Number(b.year || 0) - Number(a.year || 0) || Number(b.pid || 0) - Number(a.pid || 0));
}

export function installBridgeForVersion(year) {
  const installed = discoverInstalledVersions();
  const normalized = year ? parseYear(year) : '';
  const targets = normalized ? installed.filter(v => v.year === normalized) : installed;

  if (!targets.length) {
    throw new Error(normalized ? `未在本机检测到 SketchUp ${normalized}` : '未在本机检测到任何已安装的 SketchUp 版本');
  }

  const results = [];
  for (const target of targets) {
    const pluginRoot = target.pluginsDir;
    const subDir = join(pluginRoot, 'hios_sketchup_bridge');
    mkdirSync(subDir, { recursive: true });
    copyFileSync(BRIDGE_SOURCE_LOADER, join(pluginRoot, 'hios_sketchup_bridge.rb'));
    copyFileSync(BRIDGE_SOURCE_MAIN, join(subDir, 'main.rb'));
    results.push({
      year: target.year,
      pluginsDir: pluginRoot,
      bridgeVersion: BRIDGE_VERSION,
      installed: true,
    });
  }
  return results;
}

export async function listVersions() {
  const installed = discoverInstalledVersions();
  const running = await discoverRunningInstances();
  const config = readConfig();
  return {
    defaultVersion: config.defaultVersion || (installed[0]?.year || ''),
    configuredVersion: config.defaultVersion || '',
    bridgeTargetVersion: BRIDGE_VERSION,
    installed,
    running: running.map(({ token: _omit, ...pub }) => pub),
  };
}

export function selectVersion(version, installBridge = true) {
  const normalized = parseYear(version);
  if (!normalized) throw new Error(`无效的 SketchUp 版本号：${version}（示例："2026" 或 "2027"）`);
  const installed = discoverInstalledVersions();
  const target = installed.find(v => v.year === normalized);
  if (!target) {
    const names = installed.map(v => v.year).join('、') || '无';
    throw new Error(`未找到 SketchUp ${normalized}。本机已安装版本：${names}`);
  }
  let bridgeResult = null;
  if (installBridge) bridgeResult = installBridgeForVersion(normalized)[0];
  const next = { ...readConfig(), defaultVersion: normalized };
  writeConfig(next);
  return {
    defaultVersion: normalized,
    exePath: target.exePath,
    pluginsDir: target.pluginsDir,
    bridgeInstalled: true,
    bridgeVersion: bridgeResult?.bridgeVersion || BRIDGE_VERSION,
  };
}

export async function resolveTargetInstance({ version, pid } = {}) {
  const running = await discoverRunningInstances();
  if (!running.length) {
    throw new Error('当前没有运行中且已连接桥接的 SketchUp 实例。请先点击「启动 SketchUp」或重启已打开的 SketchUp 以加载桥接。');
  }
  if (pid !== undefined && pid !== null && String(pid).trim() !== '') {
    const byPid = running.find(r => Number(r.pid) === Number(pid));
    if (!byPid) throw new Error(`未找到 PID=${pid} 的已连接 SketchUp 实例。当前运行中：${running.map(r => `SketchUp ${r.year} (PID ${r.pid})`).join('、')}`);
    return byPid;
  }
  const requestedYear = version ? parseYear(version) : '';
  if (requestedYear) {
    const byYear = running.find(r => r.year === requestedYear);
    if (!byYear) throw new Error(`SketchUp ${requestedYear} 当前未运行或未加载桥接。当前运行中：${running.map(r => `SketchUp ${r.year} (PID ${r.pid})`).join('、')}`);
    return byYear;
  }
  const defaultYear = readConfig().defaultVersion;
  if (defaultYear) {
    const byDefault = running.find(r => r.year === defaultYear);
    if (byDefault) return byDefault;
  }
  if (running.length === 1) return running[0];
  throw new Error(`检测到多个运行中的 SketchUp 实例（${running.map(r => `SketchUp ${r.year} [PID ${r.pid}]`).join('、')}），请指定目标版本。`);
}

export async function launchSketchup({ version, filePath, waitSeconds = 45 } = {}) {
  const installed = discoverInstalledVersions();
  if (!installed.length) throw new Error('未在本机检测到已安装的 SketchUp');
  const config = readConfig();
  const targetYear = parseYear(version) || config.defaultVersion || (installed.length === 1 ? installed[0].year : installed[0].year);
  const target = installed.find(v => v.year === targetYear);
  if (!target) {
    throw new Error(`未找到 SketchUp ${targetYear}。已安装版本：${installed.map(v => v.year).join('、')}`);
  }

  if (!target.bridgeInstalled || !target.bridgeUpToDate) {
    installBridgeForVersion(targetYear);
  }

  const running = await discoverRunningInstances();
  const existing = running.find(r => r.year === targetYear);
  if (existing) {
    if (filePath) {
      await httpRequest(existing, 'POST', '/model_file', { action: 'open', path: filePath }, 30000);
    }
    const ping = await httpRequest(existing, 'GET', '/ping', undefined, 5000);
    return { reused: true, connected: true, ...ping };
  }

  const args = filePath ? [filePath] : [];
  const child = spawn(target.exePath, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });
  child.unref();

  const deadline = Date.now() + Math.max(5, Math.min(Number(waitSeconds) || 45, 120)) * 1000;
  while (Date.now() < deadline) {
    await wait(900);
    const live = await discoverRunningInstances({ pruneStale: false });
    const matched = live.find(r => r.year === targetYear);
    if (matched) {
      const { token: _omit, ...pub } = matched;
      return { reused: false, connected: true, launchedPid: child.pid, ...pub };
    }
  }
  return {
    reused: false,
    connected: false,
    launchedPid: child.pid,
    year: targetYear,
    note: `已启动 SketchUp ${targetYear}，但在 ${waitSeconds} 秒内尚未检测到桥接就绪（可能停留在欢迎页或插件确认框）。进入建模界面后点「刷新连接」即可。`,
  };
}

export async function callSketchup(method, endpoint, body, { version, pid, timeoutMs = 90000 } = {}) {
  const target = await resolveTargetInstance({ version, pid });
  return httpRequest(target, method, endpoint, body, timeoutMs);
}

function yamlSingleQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

export function syncToHomepageDsh(serverPath) {
  const results = [];
  const roots = new Set();
  const pointer = join(process.env.APPDATA || '', 'com.hios.next', 'hios-data-location.json');
  if (existsSync(pointer)) {
    try {
      const p = JSON.parse(readFileSync(pointer, 'utf8'))?.path;
      if (p && existsSync(join(p, 'deepseek-harness'))) roots.add(resolve(p));
    } catch {}
  }
  // Walk up from plugin install dir (<HIOS_DATA_ROOT>/plugins/sketchup-studio/engine)
  const maybeDataRoot = resolve(HERE, '..', '..', '..');
  if (existsSync(join(maybeDataRoot, 'deepseek-harness'))) roots.add(maybeDataRoot);

  const nodeExe = process.execPath;
  const block = [
    '- insert:',
    '    - id: sketchup-mcp',
    "      name: '@deepseek-ai/dsh-mcp-client'",
    '      config:',
    '        serverName: sketchup',
    '        transport: stdio',
    `        command: ${yamlSingleQuote(nodeExe)}`,
    '        args:',
    `          - ${yamlSingleQuote(serverPath)}`,
    '        toolCallTimeoutMs: 120000',
    '        failOnStartupError: false',
  ].join('\n');

  for (const root of roots) {
    const patchPath = join(root, 'deepseek-harness', 'home', 'profiles', 'web', 'cordis.patch.yml');
    if (!existsSync(patchPath)) continue;
    const original = readFileSync(patchPath, 'utf8');
    const eol = original.includes('\r\n') ? '\r\n' : '\n';
    let next;
    if (/^\s*-\s*id:\s*sketchup-mcp\s*$/m.test(original)) {
      next = original
        .replace(/(id:\s*sketchup-mcp[\s\S]*?command:\s*)([^\r\n]+)/, `$1${yamlSingleQuote(nodeExe)}`)
        .replace(/(id:\s*sketchup-mcp[\s\S]*?args:\s*\r?\n\s*-\s*)([^\r\n]+)/, `$1${yamlSingleQuote(serverPath)}`);
    } else {
      const trimmed = original.trim();
      const formatted = block.replace(/\n/g, eol);
      next = (!trimmed || trimmed === '[]') ? `${formatted}${eol}` : `${original.replace(/\s*$/, '')}${eol}${formatted}${eol}`;
    }
    if (next !== original) {
      copyFileSync(patchPath, `${patchPath}.sketchup-backup-${Date.now()}`);
      const tmp = `${patchPath}.tmp-${process.pid}`;
      writeFileSync(tmp, next, 'utf8');
      renameSync(tmp, patchPath);
      results.push({ path: patchPath, changed: true });
    } else {
      results.push({ path: patchPath, changed: false });
    }
  }
  return { ok: true, synced: results };
}
