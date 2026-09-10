import { normalizeWorkflow, resultUrl, submitUrl, submittedTask, taskSnapshot, workflowMetadataUrl } from './core.js';

async function requestJson(url, options = {}) {
  const response = await fetch(url, { cache: 'no-store', ...options });
  const text = await response.text();
  let payload;
  try { payload = text ? JSON.parse(text) : {}; } catch { throw new Error(`接口返回了非 JSON 内容（HTTP ${response.status}）`); }
  if (!response.ok) {
    const message = payload?.error?.message || payload?.msg || payload?.message || `HTTP ${response.status}`;
    throw new Error(String(message));
  }
  return payload;
}

function authHeaders(token) {
  const value = String(token || '').trim();
  if (!value) throw new Error('请先配置 AutoDL ComfyUI Token');
  return { Authorization: value, 'Content-Type': 'application/json' };
}

export async function fetchWorkflowMetadata(baseUrl, workflowId, signal) {
  return normalizeWorkflow(await requestJson(workflowMetadataUrl(baseUrl, workflowId), { signal }));
}

export async function createTask(baseUrl, workflowId, body, token, signal) {
  const payload = await requestJson(submitUrl(baseUrl, workflowId), {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(body),
    signal,
  });
  return submittedTask(payload);
}

export async function queryTask(baseUrl, taskId, token, signal) {
  return taskSnapshot(await requestJson(resultUrl(baseUrl, taskId), { headers: authHeaders(token), signal }));
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('读取文件失败'));
    reader.readAsDataURL(file);
  });
}

export async function sourceAsApiValue(source) {
  const value = String(source || '').trim();
  if (!value) return '';
  if (/^data:/i.test(value) || /^https?:\/\//i.test(value)) return value;
  if (/^(?:hios-asset:|blob:|file:)/i.test(value)) {
    const response = await fetch(value);
    if (!response.ok) throw new Error(`无法读取画布素材（HTTP ${response.status}）`);
    return readFileAsDataUrl(await response.blob());
  }
  return value;
}

export async function downloadResult(url, fileName) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`下载失败（HTTP ${response.status}）`);
  const objectUrl = URL.createObjectURL(await response.blob());
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
}
