export const DEFAULT_BASE_URL = 'https://autodl.art';
export const DEFAULT_WORKFLOW_ID = 'minimax_h3_lightx2v_v5';
export const MAX_MEDIA_BYTES = 50 * 1024 * 1024;

const MEDIA_TYPES = new Set(['image', 'video', 'audio', 'media', 'file']);
const SUCCESS_STATES = new Set(['SUCCESS', 'SUCCEEDED', 'COMPLETED', 'COMPLETE']);
const FAILURE_STATES = new Set(['FAILED', 'FAILURE', 'ERROR', 'CANCELLED', 'CANCELED']);

export function normalizeBaseUrl(value = DEFAULT_BASE_URL) {
  const raw = String(value || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
  const url = new URL(raw);
  if (!/^https?:$/.test(url.protocol)) throw new Error('服务地址只支持 HTTP(S)');
  return url.href.replace(/\/$/, '');
}

export function normalizeWorkflowId(value) {
  const id = String(value || '').trim();
  if (!/^[A-Za-z0-9._-]{2,160}$/.test(id)) throw new Error('工作流 ID 格式无效');
  return id;
}

export function workflowMetadataUrl(baseUrl, workflowId) {
  return `${normalizeBaseUrl(baseUrl)}/api/v1/comfyui/workflows/${encodeURIComponent(normalizeWorkflowId(workflowId))}`;
}

export function submitUrl(baseUrl, workflowId) {
  return `${normalizeBaseUrl(baseUrl)}/api/v1/comfyui/comfyui_workflow/${encodeURIComponent(normalizeWorkflowId(workflowId))}`;
}

export function resultUrl(baseUrl, taskId) {
  const id = String(taskId || '').trim();
  if (!id) throw new Error('任务 ID 不能为空');
  return `${normalizeBaseUrl(baseUrl)}/api/v1/comfyui/comfyui_workflow/result/${encodeURIComponent(id)}`;
}

export function unwrapEnvelope(payload, action = '请求') {
  if (!payload || typeof payload !== 'object') throw new Error(`${action}返回了无效数据`);
  if (payload.error) throw new Error(String(payload.error.message || payload.error || `${action}失败`));
  const code = String(payload.code || '').trim();
  if (code && !/^(?:success|ok)$/i.test(code)) throw new Error(String(payload.msg || payload.message || `${action}失败（${code}）`));
  return payload.data && typeof payload.data === 'object' ? payload.data : payload;
}

function parsedExample(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(String(value)); } catch { return null; }
}

function normalizedOption(option) {
  if (option && typeof option === 'object') {
    const label = String(option.label ?? option.value ?? '');
    return { label, value: option.value ?? label };
  }
  return { label: String(option ?? ''), value: option };
}

export function normalizeWorkflow(payload) {
  const data = unwrapEnvelope(payload, '读取工作流');
  const id = normalizeWorkflowId(data.uuid || data.id);
  const rules = data.input_rules && typeof data.input_rules === 'object' ? data.input_rules : {};
  const fields = Object.entries(rules).map(([name, raw], index) => {
    const rule = raw && typeof raw === 'object' ? raw : {};
    const type = String(rule.type || 'string').toLowerCase();
    const options = Array.isArray(rule.options) ? rule.options.map(normalizedOption).filter((item) => item.label) : [];
    const defaultValue = typeof rule.default === 'string' && rule.default.startsWith('default_local_path:') ? '' : rule.default;
    return {
      name,
      label: friendlyFieldLabel(name, type),
      type,
      required: Boolean(rule.required),
      defaultValue: defaultValue ?? '',
      min: finiteOrUndefined(rule.min ?? rule.min_length),
      max: finiteOrUndefined(rule.max ?? rule.max_length),
      acceptTypes: Array.isArray(rule.accept_types) ? rule.accept_types.map(String) : [],
      options,
      order: index,
    };
  });
  const outputExample = parsedExample(data.output_example);
  return {
    id,
    name: String(data.name || id),
    description: String(data.description || ''),
    content: String(data.content || ''),
    coverUrl: String(data.cover_image_url || ''),
    fields,
    outputKinds: inferOutputKinds(outputExample),
    updatedAt: Date.now(),
  };
}

function finiteOrUndefined(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export function friendlyFieldLabel(name, type = '') {
  const exact = {
    prompt: '提示词', seed: '随机种子', duration: '视频时长', resolution: '输出分辨率',
    width: '宽度', height: '高度', steps: '采样步数', cfg: '提示词引导', negative_prompt: '负面提示词',
  };
  if (exact[name]) return exact[name];
  const ref = name.match(/^ref_(image|video|audio)_(\d+)$/i);
  if (ref) return `参考${ref[1].toLowerCase() === 'image' ? '图' : ref[1].toLowerCase() === 'video' ? '视频' : '音频'} ${Number(ref[2]) + 1}`;
  if (MEDIA_TYPES.has(type)) return type === 'image' ? '参考图片' : type === 'video' ? '参考视频' : type === 'audio' ? '参考音频' : type === 'file' ? '输入文件' : '参考媒体';
  return name.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function inferOutputKinds(outputExample) {
  const data = outputExample && typeof outputExample === 'object' ? (outputExample.data || outputExample) : {};
  const results = Array.isArray(data.results) ? data.results : [];
  const kinds = [...new Set(results.map(resultKind).filter(Boolean))];
  return kinds.length ? kinds : ['image', 'video', 'audio', 'file'];
}

export function isMediaField(field) {
  return Boolean(field && MEDIA_TYPES.has(String(field.type || '').toLowerCase()));
}

export function defaultsForWorkflow(workflow) {
  return Object.fromEntries((workflow?.fields || []).map((field) => [field.name, field.defaultValue ?? '']));
}

export function orderMediaFields(fields, kind) {
  return (fields || [])
    .filter((field) => field.type === kind || (kind === 'image' && field.type === 'media'))
    .sort((left, right) => {
      const leftIndex = Number((left.name.match(/(\d+)$/) || [])[1]);
      const rightIndex = Number((right.name.match(/(\d+)$/) || [])[1]);
      if (Number.isFinite(leftIndex) && Number.isFinite(rightIndex)) return leftIndex - rightIndex;
      return Number(left.order || 0) - Number(right.order || 0);
    });
}

export function mergeConnectedInputs(workflow, values, connected = {}) {
  const next = { ...defaultsForWorkflow(workflow), ...(values || {}) };
  const prompt = scalarInput(connected.prompt);
  if (prompt) next.prompt = prompt;
  for (const [kind, port] of [['image', 'images'], ['video', 'videos'], ['audio', 'audios'], ['file', 'files']]) {
    const sources = arrayInput(connected[port]);
    const fields = orderMediaFields(workflow?.fields, kind);
    sources.slice(0, fields.length).forEach((source, index) => { next[fields[index].name] = source; });
  }
  return next;
}

function scalarInput(value) {
  if (Array.isArray(value)) return value.map(scalarInput).find(Boolean) || '';
  if (value && typeof value === 'object') return String(value.text || value.value || value.source || value.url || value.dataUrl || '');
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

export function arrayInput(value) {
  if (value == null || value === '') return [];
  const source = Array.isArray(value) ? value : [value];
  return source.map((item) => {
    if (typeof item === 'string') return item;
    if (item && typeof item === 'object') return String(item.source || item.url || item.dataUrl || item.assetUrl || item.mediaUrl || '');
    return '';
  }).filter(Boolean);
}

export function validateAndBuildBody(workflow, values) {
  if (!workflow?.fields?.length) throw new Error('工作流没有可用参数定义');
  const body = {};
  for (const field of workflow.fields) {
    let value = values?.[field.name];
    if (typeof value === 'string') value = value.trim();
    if (value === '' || value == null) {
      if (field.required) throw new Error(`${field.label}为必填项`);
      continue;
    }
    if (['integer', 'int', 'number', 'float'].includes(field.type)) {
      const number = Number(value);
      if (!Number.isFinite(number)) throw new Error(`${field.label}必须是数字`);
      if (field.type === 'integer' || field.type === 'int') value = Math.round(number); else value = number;
      if (field.min != null && value < field.min) throw new Error(`${field.label}不能小于 ${field.min}`);
      if (field.max != null && value > field.max) throw new Error(`${field.label}不能大于 ${field.max}`);
    } else if (field.type === 'boolean' || field.type === 'bool') {
      value = value === true || value === 'true';
    } else if (field.type === 'array' || field.type === 'mixed_array' || field.type === 'object') {
      if (typeof value === 'string') {
        try { value = JSON.parse(value); } catch { throw new Error(`${field.label}必须是有效 JSON`); }
      }
    }
    body[field.name] = value;
  }
  return body;
}

export function normalizeStatus(value) {
  return String(value || '').trim().toUpperCase();
}

export function taskSnapshot(payload) {
  const data = unwrapEnvelope(payload, '查询任务');
  const status = normalizeStatus(data.status);
  return {
    taskId: String(data.task_id || data.taskId || data.id || ''),
    status: status || 'UNKNOWN',
    duration: finiteOrUndefined(data.duration),
    createdAt: String(data.created_at || ''),
    startedAt: String(data.started_at || ''),
    message: String(data.message || data.error || ''),
    results: normalizeResults(data.results || data.outputs || []),
    terminal: SUCCESS_STATES.has(status) || FAILURE_STATES.has(status),
    success: SUCCESS_STATES.has(status),
    failed: FAILURE_STATES.has(status),
  };
}

export function submittedTask(payload) {
  const data = unwrapEnvelope(payload, '提交任务');
  const taskId = String(data.task_id || data.taskId || data.id || '');
  if (!taskId) throw new Error('提交成功但没有返回 task_id');
  return {
    taskId,
    status: normalizeStatus(data.status) || 'QUEUED',
    workflowName: String(data.workflow || ''),
    message: String(data.message || ''),
    createdAt: String(data.created_at || ''),
  };
}

export function normalizeResults(raw) {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw] : [];
  return list.map((item) => {
    if (typeof item === 'string') return { url: item, kind: resultKind({ url: item }), fileType: '' };
    const url = String(item?.url || item?.file_url || item?.fileUrl || item?.src || '');
    return { ...item, url, kind: resultKind(item), fileType: String(item?.file_type || item?.fileType || '') };
  }).filter((item) => item.url);
}

export function resultKind(item = {}) {
  const type = String(item.type || item.kind || item.output_type || item.file_type || item.fileType || '').toLowerCase();
  const url = String(item.url || item.file_url || item.fileUrl || '').toLowerCase().split(/[?#]/)[0];
  if (/image|png|jpe?g|webp|gif|bmp/.test(type) || /\.(?:png|jpe?g|webp|gif|bmp)$/.test(url)) return 'image';
  if (/video|mp4|webm|mov|m4v/.test(type) || /\.(?:mp4|webm|mov|m4v)$/.test(url)) return 'video';
  if (/audio|mp3|wav|m4a|aac|flac|ogg/.test(type) || /\.(?:mp3|wav|m4a|aac|flac|ogg)$/.test(url)) return 'audio';
  return 'file';
}

export function taskLabel(status) {
  const labels = { QUEUED: '排队中', RUNNING: '生成中', PROCESSING: '生成中', SUCCESS: '已完成', SUCCEEDED: '已完成', COMPLETED: '已完成', COMPLETE: '已完成', FAILED: '失败', FAILURE: '失败', ERROR: '失败', CANCELLED: '已停止', CANCELED: '已停止', UNKNOWN: '状态未知' };
  return labels[normalizeStatus(status)] || String(status || '状态未知');
}

export function mimeForKind(kind, fileType = '') {
  const ext = String(fileType || '').toLowerCase();
  if (kind === 'image') return ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png';
  if (kind === 'video') return ext === 'webm' ? 'video/webm' : ext === 'mov' ? 'video/quicktime' : 'video/mp4';
  if (kind === 'audio') return ext === 'wav' ? 'audio/wav' : ext === 'm4a' ? 'audio/mp4' : 'audio/mpeg';
  return 'application/octet-stream';
}

export function fileNameForResult(workflow, result, index = 0) {
  const extension = String(result.fileType || '').replace(/^\./, '') || (result.kind === 'image' ? 'png' : result.kind === 'video' ? 'mp4' : result.kind === 'audio' ? 'mp3' : 'bin');
  const base = String(workflow?.name || workflow?.id || '算力云结果').replace(/[\\/:*?"<>|]+/g, '-');
  return `${base}-${index + 1}.${extension}`;
}
