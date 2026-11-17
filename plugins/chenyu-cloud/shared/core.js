export const BASE_URL = 'https://www.chenyu.cn';
export const MAX_MEDIA_BYTES = 100 * 1024 * 1024;
const KINDS = new Set(['image', 'video', 'audio', 'file', 'text']);
const FAILURE = new Set(['failed', 'error', 'cancelled', 'canceled', 'timeout', 'rejected']);
export function apiUrl(path) { return `${BASE_URL}/api/open/v2/${path}`; }
export function workflowId(value) {
  const raw = String(value || '').trim();
  const id = /^https:\/\/www\.chenyu\.cn\//.test(raw) ? new URL(raw).searchParams.get('id') : raw;
  if (!/^wf_[a-zA-Z0-9_-]{4,100}$/.test(id || '')) throw new Error('工作流 ID 或晨羽链接无效');
  return id;
}
export function unwrap(payload, action = '请求') {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error(`${action}返回无效数据`);
  if (payload.code !== undefined && String(payload.code) !== '0') throw new Error(String(payload.msg || payload.message || `${action}失败`));
  return payload.data ?? payload.result ?? payload;
}
function typeOf(value) {
  const type = String(value || 'string').trim().toLowerCase();
  const array = type.endsWith('[]'), scalar = type.replace(/\[\]$/, '');
  const normalized = ({ int: 'integer', float: 'number', double: 'number', bool: 'boolean', image_input: 'image', video_input: 'video', audio_input: 'audio', file_input: 'file', prompt: 'text', mediauri: 'image', mediaobject: 'image' })[scalar] || scalar;
  return normalized + (array ? '[]' : '');
}
export function normalizeWorkflow(payload) {
  const data = unwrap(payload, '读取工作流');
  const id = workflowId(data.workflow_id || data.workflowId || data.id);
  const revisionId = String(data.revision_id || data.revisionId || '').trim();
  if (!/^wfr_[a-zA-Z0-9_-]{4,100}$/.test(revisionId)) throw new Error('需要有效版本 ID（wfr_…），避免工作流更新改变参数或价格');
  const manifest = data.editable_parameter_manifest || data.fields;
  if (!Array.isArray(manifest) || !manifest.length) throw new Error('未找到输入参数定义，请导入官方 API 文档或参数 JSON');
  const fields = manifest.map((raw, order) => {
    const name = String(raw.name || '');
    if (!/^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,159}$/.test(name) || ['__proto__', 'constructor', 'prototype'].includes(name)) throw new Error('输入字段名称无效');
    const type = typeOf(raw.value_type || raw.type);
    const options = (raw.options || []).map(o => typeof o === 'object' && o !== null ? { label: String(o.label ?? o.value), value: o.value ?? o.label } : { label: String(o), value: o });
    return { name, label: String(raw.display_name || raw.label || name), type, required: raw.required === true,
      defaultValue: isMedia({ type }) ? (raw.multiple || raw.is_multiple || /\[\]$/.test(type) ? [] : '') : (raw.default_value ?? raw.defaultValue ?? raw.default ?? ''),
      options, order, ...(raw.min != null ? { min: Number(raw.min) } : {}), ...(raw.max != null ? { max: Number(raw.max) } : {}),
      ...(raw.multiple || raw.is_multiple || /\[\]$/.test(type) ? { multiple: true } : {}) };
  });
  if (new Set(fields.map(f => f.name)).size !== fields.length) throw new Error('输入字段重复');
  const outputs = data.candidate_output_manifest || data.outputManifest || [];
  const capabilities = [...new Set(outputs.map(o => String(o.type || '').toLowerCase()).filter(k => KINDS.has(k)))];
  return { id, revisionId, name: String(data.title || data.workflowName || data.name || id), description: String(data.description || ''),
    fields, outputManifest: outputs, capabilities: capabilities.length ? capabilities : (data.capabilities || ['image', 'video', 'audio', 'file']),
    quoteAmount: money(data.quote_amount ?? data.quoteAmount), externalCost: data.may_incur_external_model_cost ?? data.externalCost ?? null,
    coverUrl: String(data.covers?.[0] || data.coverUrl || ''), updatedAt: Date.now() };
}
export function money(value) {
  if (value == null || value === '') return null;
  const text = String(value);
  if (!/^\d+(?:\.\d{1,8})?$/.test(text)) throw new Error('费用必须为非负金额，最多 8 位小数');
  return text;
}
export function moneyUnits(value) {
  const text = money(value);
  if (text === null) throw new Error('缺少报价');
  const [whole, part = ''] = text.split('.');
  return BigInt(whole) * 100000000n + BigInt(part.padEnd(8, '0'));
}
export function isMedia(field) { return /^(image|video|audio|file|media)(\[\])?$/.test(field.type); }
export function defaults(workflow) { return Object.fromEntries(workflow.fields.map(f => [f.name, f.defaultValue ?? ''])); }
export function validateInputs(workflow, values) {
  const result = [];
  for (const field of workflow.fields) {
    let value = values[field.name] ?? field.defaultValue;
    if (typeof value === 'string') value = value.trim();
    if (value === '' || value == null || (Array.isArray(value) && !value.length)) {
      if (field.required) throw new Error(`${field.label}为必填项`);
      continue;
    }
    if (field.options?.length) {
      const found = field.options.find(o => String(o.value) === String(value));
      if (!found) throw new Error(`${field.label}不在可选值中`);
      value = found.value;
    }
    if (['integer', 'number'].includes(field.type)) {
      value = Number(value);
      if (!Number.isFinite(value) || (field.type === 'integer' && !Number.isInteger(value))) throw new Error(`${field.label}必须是${field.type === 'integer' ? '整数' : '数字'}`);
      if (field.min != null && value < field.min || field.max != null && value > field.max) throw new Error(`${field.label}超出允许范围`);
    } else if (field.type === 'boolean') {
      if (![true, false, 'true', 'false'].includes(value)) throw new Error(`${field.label}必须是布尔值`);
      value = value === true || value === 'true';
    } else if (['object', 'array'].includes(field.type)) {
      if (typeof value === 'string') { try { value = JSON.parse(value); } catch { throw new Error(`${field.label}不是有效 JSON`); } }
      if (!value || typeof value !== 'object' || (field.type === 'array' && !Array.isArray(value))) throw new Error(`${field.label}类型错误`);
    }
    result.push([field.name, value]);
  }
  return Object.fromEntries(result);
}
export function buildSubmission(workflow, values, idempotencyKey) {
  if (!idempotencyKey || String(idempotencyKey).length > 160) throw new Error('需要有效幂等键');
  if (workflow.externalCost !== false) throw new Error('未确认此工作流不涉及外部模型费用，已阻止提交');
  return { workflow_id: workflow.id, revision_id: workflow.revisionId, idempotency_key: idempotencyKey,
    accept_external_cost_risk: false, inputs: validateInputs(workflow, values) };
}
export function checkQuote(workflow, limit) {
  if (workflow.externalCost !== false) throw new Error('工作流可能涉及外部模型费用，暂不支持自动提交');
  if (moneyUnits(workflow.quoteAmount) > moneyUnits(limit)) throw new Error('工作流参考报价超过单次报价限制');
}
export function safeMediaUrl(value) {
  const url = String(value || '').trim();
  if (/^https:\/\//i.test(url) || /^data:(image|video|audio|application|text)\//i.test(url)) return url;
  return '';
}
export function normalizeOutputs(raw, manifest = []) {
  const groups = Array.isArray(raw) ? [['result', raw]] : Object.entries(raw || {});
  return groups.flatMap(([key, group]) => (Array.isArray(group) ? group : [group]).flatMap((item, index) => {
    if (item == null) return [];
    const desc = manifest.find(m => m.name === key && Number(m.file_index || 0) === index) || manifest.find(m => m.name === key) || {};
    const kind = String(item?.kind || item?.type || desc.type || (/images?/.test(key) ? 'image' : /videos?/.test(key) ? 'video' : /audios?/.test(key) ? 'audio' : 'file')).toLowerCase();
    const name = String(item?.name || desc.display_name || desc.label || `${key}-${index + 1}`);
    if (kind === 'text') return [{ kind, text: typeof item === 'string' ? item : String(item.text ?? ''), name }];
    const url = safeMediaUrl(typeof item === 'string' ? item : item.signed_url || item.content_url || item.url || item.uri);
    if (!url) return [];
    return [{ kind: KINDS.has(kind) ? kind : 'file', url, name, ...(item?.mime ? { mime: item.mime } : {}), metadata: { outputKey: key, fileIndex: index } }];
  }));
}
export function snapshot(info, execution = {}, workflow = {}) {
  const status = String(info.run_status || execution.status || 'unknown').toLowerCase();
  const audit = String(info.content_audit_status || execution.content_audit_status || '').toLowerCase();
  const failed = FAILURE.has(status) || ['rejected', 'blocked'].includes(audit);
  const outputs = normalizeOutputs(info.outputs || execution.outputs, info.candidate_output_manifest || workflow.outputManifest);
  const complete = ['succeeded', 'success', 'completed'].includes(status);
  const oom = failed && /OutOfMemoryError|CUDA out of memory|Got an OOM/i.test((execution.logs || []).map(log => log.message || '').join(''));
  return { runOrderId: String(info.run_order_id || ''), taskId: String(info.task_id || execution.task_id || ''), status, audit,
    progress: Math.max(0, Math.min(100, Number(execution.progress_percent || execution.progress_snapshot?.progress_percent || 0))),
    outputs, terminal: failed || complete && outputs.length > 0 && (!audit || audit === 'approved'), success: !failed && complete && outputs.length > 0 && (!audit || audit === 'approved'),
    message: oom ? '云端显存不足，请降低输出尺寸或调整工作流；未自动重试' : String(info.error_message || execution.error?.message || (typeof execution.error === 'string' ? execution.error : '') || (complete && !outputs.length ? '执行完成，等待审核及输出' : '')),
    errorCode: String(info.error_code || execution.error?.code || ''),
    quoteAmount: info.quote_amount ?? null, finalAmount: info.final_amount ?? null, settlementStatus: String(info.settlement_status || ''),
    freezeStatus: String(info.freeze_status || ''), platformFinalAmount: info.platform_final_amount ?? null, creatorFinalAmount: info.creator_final_amount ?? null };
}
export function importWorkflow(text) {
  const source = String(text || '').trim();
  try { return normalizeWorkflow(JSON.parse(source)); } catch (error) { if (/^[{[]/.test(source)) throw error; }
  const fences = [...source.matchAll(/```(?:json|bash|shell)?\s*\n([\s\S]*?)```/g)].map(m => m[1]);
  let request, quote;
  for (const block of fences) {
    const start = block.indexOf('{'), end = block.lastIndexOf('}');
    if (start < 0 || end < 0) continue;
    try {
      const obj = JSON.parse(block.slice(start, end + 1));
      if (obj.workflow_id && obj.inputs && !obj.code && !obj.data) request ||= obj;
      if (obj.data?.quote_amount != null) quote ??= obj.data.quote_amount;
    } catch { /* A document code block is data only; never execute it. */ }
  }
  const id = request?.workflow_id || source.match(/工作流\s*ID[:：]\s*(wf_[\w-]+)/i)?.[1];
  const revision = request?.revision_id || source.match(/版本\s*ID[:：]\s*(wfr_[\w-]+)/i)?.[1];
  const fields = [...source.matchAll(/^\s*-\s*inputs\.([\w.-]+)\s*\(([^,，]+)[,，]\s*(必填|可选)\)[:：]\s*(.*)$/gm)].map(m => {
    const type = /MediaURI|MediaObject/.test(m[2]) ? (/video|视频/i.test(m[1] + m[4]) ? 'video' : /audio|音频/i.test(m[1] + m[4]) ? 'audio' : /file|文件/i.test(m[1] + m[4]) ? 'file' : 'image') : typeOf(m[2]);
    return { name: m[1], label: m[4].split(/[。；;]/)[0], type, required: m[3] === '必填', defaultValue: request?.inputs?.[m[1]] ?? '' };
  });
  if (!fields.length) throw new Error('未识别到 inputs 参数，请使用“复制文档”内容或参数 JSON');
  return normalizeWorkflow({ workflow_id: id, revision_id: revision, title: source.match(/^#\s+(.+)$/m)?.[1] || id,
    fields, quote_amount: quote, may_incur_external_model_cost: null });
}
