import { createInterface } from 'node:readline';
import { ModelingEngine } from './engine.mjs';

const engine = new ModelingEngine();
const schema = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const string = { type: 'string' };
export const tools = [
  { name: 'modeling_build', description: '提交后台 Blender Python 建模任务，立即返回 jobId。用 modeling_job 查询，禁止重复提交。', inputSchema: schema({ script: string, prompt: string, sourceVersion: string }, ['script', 'prompt']) },
  { name: 'modeling_job', description: '查询后台建模任务的状态、错误、真实文件与几何统计。', inputSchema: schema({ jobId: string }, ['jobId']) },
  { name: 'modeling_history', description: '读取本节点模型版本和任务记录。', inputSchema: schema({}) },
  { name: 'modeling_settings', inputSchema: schema({ executable: string }), _meta: { 'hios/uiOnly': true } },
  { name: 'modeling_cancel', inputSchema: schema({}), _meta: { 'hios/uiOnly': true, 'hios/cancelOnStop': true } },
  { name: 'modeling_open', inputSchema: schema({ sourceVersion: string }, ['sourceVersion']), _meta: { 'hios/uiOnly': true } },
  { name: 'modeling_export', inputSchema: schema({ sourceVersion: string, format: { type: 'string', enum: ['fbx', 'usdz'] } }, ['sourceVersion', 'format']), _meta: { 'hios/uiOnly': true } },
].map(t => ({ description: t.name, ...t, annotations: { readOnlyHint: ['modeling_job', 'modeling_history'].includes(t.name), destructiveHint: false, openWorldHint: false } }));
const send = value => process.stdout.write(JSON.stringify(value) + '\n');
const lines = createInterface({ input: process.stdin });
lines.on('line', async line => {
  let req;
  try {
    req = JSON.parse(line); if (req.id === undefined) return;
    let result;
    if (req.method === 'initialize') result = { protocolVersion: req.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'modeling-3d', version: '0.3.6' } };
    else if (req.method === 'ping') result = {};
    else if (req.method === 'tools/list') result = { tools };
    else if (req.method === 'tools/call') {
      if (!tools.some(t => t.name === req.params.name)) throw Error('未知工具');
      try { result = { content: [{ type: 'text', text: JSON.stringify(await engine.request(req.params.name, req.params.arguments)) }] }; }
      catch (e) { result = { isError: true, content: [{ type: 'text', text: String(e.message || e) }] }; }
    } else { send({ jsonrpc: '2.0', id: req.id, error: { code: -32601, message: 'Method not found' } }); return; }
    send({ jsonrpc: '2.0', id: req.id, result });
  } catch (e) { send({ jsonrpc: '2.0', id: req?.id ?? null, error: { code: -32603, message: String(e.message || e) } }); }
});
lines.on('close', () => { engine.dispose(); });
process.on('SIGTERM', () => { engine.dispose(); process.exit(0); });
