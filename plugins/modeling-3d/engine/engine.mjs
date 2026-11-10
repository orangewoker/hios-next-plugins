import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, copyFile, readdir, stat, realpath } from 'node:fs/promises';
import { join, dirname, isAbsolute, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const library = dirname(fileURLToPath(import.meta.url));
const uuid = /^[a-f0-9-]{36}$/i;
export class ModelingEngine {
  jobs = new Map();
  submitting = false;
  async config(root) { try { return JSON.parse(await readFile(join(root, 'config.json'), 'utf8')); } catch { return {}; } }
  async request(name, args = {}) {
    const submit = ['modeling_build', 'modeling_export'].includes(name);
    if (submit && this.submitting) throw Error('已有任务正在提交');
    if (submit) this.submitting = true;
    try { return await this.dispatch(name, args); }
    finally { if (submit) this.submitting = false; }
  }
  async dispatch(name, args = {}) {
    const { root, baseUrl } = args._context || {};
    if (!root || !isAbsolute(root) || !baseUrl?.startsWith('hios-asset://local/')) throw Error('Missing host workspace context');
    await mkdir(root, { recursive: true });
    if (name === 'modeling_settings') {
      if (args.executable !== undefined) {
        const exe = String(args.executable);
        if (!isAbsolute(exe) || !/blender(?:\.exe)?$/i.test(exe) || !(await stat(exe)).isFile()) throw Error('请选择有效的 Blender 程序');
        await writeFile(join(root, 'config.json'), JSON.stringify({ executable: await realpath(exe) }));
      }
      return { ...await this.config(root), phase: 'Blender 程序化建模；本地 AI 生成暂未启用' };
    }
    if (name === 'modeling_history') {
      const dir = join(root, 'versions'); await mkdir(dir, { recursive: true });
      const versions = [];
      for (const id of await readdir(dir)) {
        if (!uuid.test(id)) continue;
        try {
          const v = JSON.parse(await readFile(join(dir, id, 'job.json'), 'utf8'));
          if (v.status === 'running' && !this.jobs.has(`${root}:${id}`)) { v.status = 'interrupted'; v.error = '引擎已重启；未自动重放建模'; }
          versions.push(v);
        } catch { /* not a completed job record */ }
      }
      return { versions: versions.sort((a, b) => b.createdAt - a.createdAt).slice(0, 100) };
    }
    if (name === 'modeling_job') {
      if (!uuid.test(args.jobId)) throw Error('Invalid jobId');
      const live = this.jobs.get(`${root}:${args.jobId}`);
      const saved = live?.record || JSON.parse(await readFile(join(root, 'versions', args.jobId, 'job.json'), 'utf8'));
      if (live?.settling) return { ...saved, status: 'running' };
      if (!live && saved.status === 'running') return { ...saved, status: 'interrupted', error: '引擎已重启' };
      return saved;
    }
    if (name === 'modeling_cancel') {
      for (const [key, job] of this.jobs) if (key.startsWith(root + ':') && job.record.status === 'running') {
        job.record.status = 'cancelled'; job.process.kill();
      }
      return { cancelled: true };
    }
    if (name === 'modeling_open') {
      const source = await this.source(root, args.sourceVersion);
      const { executable } = await this.config(root); if (!executable) throw Error('请先配置 Blender');
      const child = spawn(executable, [source], { detached: true, stdio: 'ignore', windowsHide: false });
      await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); }); child.unref(); return { opened: true };
    }
    if (!['modeling_build', 'modeling_export'].includes(name)) throw Error('Unknown modeling tool');
    if (this.jobs.size) throw Error('已有 Blender 任务正在运行，请等待或停止');
    const { executable } = await this.config(root); if (!executable) throw Error('请先在节点中配置 Blender 路径');
    const exporting = name === 'modeling_export';
    if (exporting && !['fbx', 'usdz'].includes(args.format)) throw Error('Unsupported export format');
    if (!exporting && (typeof args.script !== 'string' || !args.script.trim() || args.script.length > 200_000)) throw Error('建模脚本为空或过长');
    const source = args.sourceVersion ? await this.source(root, args.sourceVersion) : null;
    if (exporting && !source) throw Error('导出需要成功的源版本');
    const id = randomUUID(), dir = join(root, 'versions', id);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'request.json'), JSON.stringify({ library, export: exporting ? args.format : undefined }));
    if (!exporting) await writeFile(join(dir, 'build.py'), args.script);
    await copyFile(join(library, 'runner.py'), join(dir, 'runner.py'));
    const record = { id, jobId: id, kind: exporting ? 'export' : 'model', status: 'running', prompt: String(args.prompt || '').slice(0, 4000), createdAt: Date.now(), sourceVersion: args.sourceVersion, format: args.format };
    await writeFile(join(dir, 'job.json'), JSON.stringify(record));
    const child = spawn(executable, ['--background', '--factory-startup', ...(source ? [source] : []), '--python-exit-code', '1', '--python', join(dir, 'runner.py')], { windowsHide: true, cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
    const job = { process: child, record }; this.jobs.set(`${root}:${id}`, job);
    let log = '', finished = false;
    const collect = chunk => { log = (log + chunk.toString()).slice(-256_000); };
    child.stdout.on('data', collect); child.stderr.on('data', collect);
    const deadline = setTimeout(() => { record.status = 'failed'; record.error = 'Blender 超过 10 分钟上限'; child.kill(); }, 10 * 60_000); deadline.unref();
    const finish = async (code, error) => {
      if (finished) return; finished = true; clearTimeout(deadline);
      job.settling = true;
      try {
        if (record.status === 'running') {
          if (code !== 0 || error) throw Error(error?.message || log.slice(-3500) || `Blender exit ${code}`);
          const names = exporting ? [`model.${args.format}`] : ['model.blend', 'model.glb', 'preview.png', 'stats.json'];
          for (const file of names) if (!(await stat(join(dir, file))).size) throw Error(`缺少产物 ${file}`);
          record.files = Object.fromEntries(names.map(file => [file, { path: `versions/${id}/${file}`, url: `${baseUrl}versions/${id}/${file}` }]));
          if (!exporting) record.stats = JSON.parse(await readFile(join(dir, 'stats.json'), 'utf8'));
          record.status = 'succeeded';
        }
      } catch (e) { record.status = 'failed'; record.error = String(e.message || e); }
      finally {
        record.finishedAt = Date.now();
        await writeFile(join(dir, 'blender.log'), log).catch(() => {});
        await writeFile(join(dir, 'job.json'), JSON.stringify(record, null, 2)).catch(() => {});
        this.jobs.delete(`${root}:${id}`);
      }
    };
    child.once('error', error => void finish(-1, error)); child.once('close', code => void finish(code));
    return { jobId: id, status: 'running' };
  }
  async source(root, id) {
    if (!uuid.test(String(id))) throw Error('源版本无效');
    const v = JSON.parse(await readFile(join(root, 'versions', id, 'job.json'), 'utf8'));
    if (v.status !== 'succeeded' || v.kind !== 'model') throw Error('源版本不是成功的模型');
    const base = await realpath(root), file = await realpath(join(root, 'versions', id, 'model.blend'));
    const rel = relative(base, file); if (rel.startsWith('..') || isAbsolute(rel)) throw Error('源文件超出工作区');
    return file;
  }
  dispose() { for (const job of this.jobs.values()) if (job.record.status === 'running') { job.record.status = 'cancelled'; job.process.kill(); } }
}
