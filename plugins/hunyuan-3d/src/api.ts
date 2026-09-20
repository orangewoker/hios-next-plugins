import { networkRequest } from './bridge';
import type { ApiConfig, GenerateParams, JobStatus, ResultFile } from './types';

type Json = Record<string, any>;

function trimSlash(value: string) { return value.trim().replace(/\/+$/, ''); }
function rawBase64(value: string) { return value.replace(/^data:[^;]+;base64,/i, ''); }
function isUrl(value: string) { return /^https?:\/\//i.test(value); }
function utf8(value: string) { return new TextEncoder().encode(value); }
function hex(bytes: ArrayBuffer) { return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join(''); }

async function sha256(value: string) { return hex(await crypto.subtle.digest('SHA-256', utf8(value))); }
async function hmac(key: ArrayBuffer | Uint8Array, value: string) {
  const keyData = key instanceof Uint8Array ? new Uint8Array(key).buffer : key;
  const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', cryptoKey, utf8(value));
}

function jsonError(payload: Json, status: number) {
  const response = payload?.Response || payload;
  const error = response?.Error || payload?.error;
  return String(error?.Message || error?.message || response?.ErrorMessage || payload?.message || `HTTP ${status}`);
}

async function requestJson(config: ApiConfig, url: string, headers: Record<string, string>, body: string) {
  const response = await networkRequest({ url, method: 'POST', headers, body, proxy: config.proxy, timeoutMs: 180_000 });
  let payload: Json;
  try { payload = response.body ? JSON.parse(response.body) : {}; } catch { throw new Error(`接口返回了非 JSON 内容（HTTP ${response.status}）`); }
  if (!response.ok || payload?.Response?.Error || payload?.error) throw new Error(jsonError(payload, response.status));
  return payload;
}

function nativeInput(params: GenerateParams) {
  const body: Json = params.engine === 'pro' ? { Model: params.model } : {};
  if (params.inputMode === 'text') body.Prompt = params.prompt.trim();
  else if (params.inputMode === 'image' && params.image) {
    if (isUrl(params.image)) body.ImageUrl = params.image;
    else body.ImageBase64 = rawBase64(params.image);
    if (params.prompt.trim()) body.Prompt = params.prompt.trim();
  } else if (params.inputMode === 'multiview') {
    const front = params.multiViewImages.find((item) => item.viewType === 'front') || params.multiViewImages[0];
    const additionalViews = params.multiViewImages.filter((item) => item !== front);
    if (isUrl(front.data)) body.ImageUrl = front.data;
    else body.ImageBase64 = rawBase64(front.data);
    body.MultiViewImages = additionalViews.map((item) => isUrl(item.data)
      ? { ViewType: item.viewType, ViewImageUrl: item.data }
      : { ViewType: item.viewType, ViewImageBase64: rawBase64(item.data) });
    if (params.prompt.trim()) body.Prompt = params.prompt.trim();
  }
  if (params.engine === 'pro') {
    body.EnablePBR = params.enablePBR;
    body.GenerateType = params.generateType;
    if (params.generateType !== 'LowPoly') body.FaceCount = params.faceCount;
    if (params.generateType === 'LowPoly') body.PolygonType = params.polygonType;
    if (['STL', 'USDZ', 'FBX'].includes(params.resultFormat)) body.ResultFormat = params.resultFormat;
  } else {
    body.EnablePBR = params.enablePBR;
    if (params.generateType === 'Geometry') body.EnableGeometry = true;
    if (params.resultFormat) body.ResultFormat = params.resultFormat;
  }
  return body;
}

function compatibleInput(params: GenerateParams) {
  const body = nativeInput(params);
  if (body.ImageUrl && typeof body.ImageUrl === 'string') body.ImageUrl = { Url: body.ImageUrl };
  if (body.ImageBase64) {
    const image = params.inputMode === 'image' ? params.image : params.multiViewImages.find((item) => item.viewType === 'front')?.data;
    body.ImageUrl = { Url: image?.startsWith('data:') ? image : `data:image/jpeg;base64,${body.ImageBase64}` };
    delete body.ImageBase64;
  }
  return body;
}

async function signedHeaders(config: ApiConfig, action: string, body: string) {
  const endpoint = new URL(config.baseUrl || 'https://ai3d.tencentcloudapi.com');
  const host = endpoint.host;
  const service = 'ai3d';
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const contentType = 'application/json; charset=utf-8';
  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\nx-tc-action:${action.toLowerCase()}\n`;
  const signedHeaderNames = 'content-type;host;x-tc-action';
  const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaderNames}\n${await sha256(body)}`;
  const scope = `${date}/${service}/tc3_request`;
  const stringToSign = `TC3-HMAC-SHA256\n${timestamp}\n${scope}\n${await sha256(canonicalRequest)}`;
  const secretDate = await hmac(utf8(`TC3${config.secretKey}`), date);
  const secretService = await hmac(secretDate, service);
  const secretSigning = await hmac(secretService, 'tc3_request');
  const signature = hex(await hmac(secretSigning, stringToSign));
  return {
    Authorization: `TC3-HMAC-SHA256 Credential=${config.secretId}/${scope}, SignedHeaders=${signedHeaderNames}, Signature=${signature}`,
    'Content-Type': contentType,
    Host: host,
    'X-TC-Action': action,
    'X-TC-Version': config.version || '2025-05-13',
    'X-TC-Timestamp': String(timestamp),
    'X-TC-Region': config.region || 'ap-guangzhou',
  };
}

async function nativeCall(config: ApiConfig, action: string, value: Json) {
  const body = JSON.stringify(value);
  return requestJson(config, `${trimSlash(config.baseUrl || 'https://ai3d.tencentcloudapi.com')}/`, await signedHeaders(config, action, body), body);
}

async function compatibleCall(config: ApiConfig, path: string, value: Json) {
  const body = JSON.stringify(value);
  return requestJson(config, `${trimSlash(config.baseUrl || 'https://api.ai3d.cloud.tencent.com')}${path}`, { Authorization: config.apiKey.trim(), 'Content-Type': 'application/json' }, body);
}

export function validateConfiguration(config: ApiConfig) {
  if (!/^https?:\/\//i.test(config.baseUrl.trim())) throw new Error('请输入有效的 Base URL');
  if (config.provider === 'openai' && !config.apiKey.trim()) throw new Error('请输入 API Key');
  if (config.provider === 'tencent' && (!config.secretId.trim() || !config.secretKey.trim())) throw new Error('请输入 SecretId 和 SecretKey');
}

export function validateParams(params: GenerateParams) {
  if (params.inputMode === 'text' && !params.prompt.trim()) throw new Error('请输入提示词');
  if (params.inputMode === 'image' && !params.image) throw new Error('请选择或输入参考图');
  if (params.inputMode === 'multiview' && !params.multiViewImages.length) throw new Error('请至少添加一张多视图');
  if (params.inputMode === 'multiview' && !params.multiViewImages.some((item) => item.viewType === 'front')) throw new Error('请先添加正面主图');
  if (params.inputMode === 'multiview' && params.model === '3.0' && params.multiViewImages.some((item) => !['front', 'left', 'right', 'back'].includes(item.viewType))) throw new Error('3.0 模型仅支持正面、左、右、后视图；请切换到 3.1');
  if (params.engine === 'rapid' && params.inputMode === 'multiview') throw new Error('极速版暂不支持多视图输入');
  if (params.model === '3.1' && ['LowPoly', 'Sketch'].includes(params.generateType)) throw new Error('3.1 模型不支持 LowPoly 或 Sketch');
}

export async function submitJob(config: ApiConfig, params: GenerateParams) {
  validateConfiguration(config); validateParams(params);
  if (config.provider === 'openai' && params.engine === 'rapid') throw new Error('OpenAI 兼容接口仅支持专业版，请切换服务模式或使用腾讯云 API 3.0');
  const payload = config.provider === 'openai'
    ? await compatibleCall(config, '/v1/ai3d/submit', compatibleInput(params))
    : await nativeCall(config, params.engine === 'rapid' ? 'SubmitHunyuanTo3DRapidJob' : 'SubmitHunyuanTo3DProJob', nativeInput(params));
  const response = payload.Response || payload;
  const jobId = String(response.JobId || response.job_id || response.id || '');
  if (!jobId) throw new Error('接口未返回 JobId');
  return jobId;
}

function normalizeFiles(response: Json): ResultFile[] {
  const files = response.ResultFile3Ds || response.result_file_3ds || response.Files || response.files || [];
  return (Array.isArray(files) ? files : []).map((file) => ({
    type: String(file.Type || file.type || '').toUpperCase(),
    url: String(file.Url || file.url || ''),
    previewImageUrl: String(file.PreviewImageUrl || file.preview_image_url || ''),
  })).filter((file) => file.url);
}

export async function queryJob(config: ApiConfig, jobId: string, engine: 'pro' | 'rapid' = 'pro') {
  validateConfiguration(config);
  const payload = config.provider === 'openai'
    ? await compatibleCall(config, '/v1/ai3d/query', { JobId: jobId })
    : await nativeCall(config, engine === 'rapid' ? 'QueryHunyuanTo3DRapidJob' : 'QueryHunyuanTo3DProJob', { JobId: jobId });
  const response = payload.Response || payload;
  return {
    status: String(response.Status || response.status || 'WAIT').toUpperCase() as JobStatus,
    files: normalizeFiles(response),
    errorCode: String(response.ErrorCode || response.error_code || ''),
    errorMessage: String(response.ErrorMessage || response.error_message || ''),
    creditConsumed: Number(response.ResultCreditConsumed || response.result_credit_consumed || 0) || undefined,
    creditDetails: String(response.ResultCreditDetails || response.result_credit_details || ''),
  };
}

export async function probeConnection(config: ApiConfig) {
  validateConfiguration(config);
  try { await queryJob(config, '0', 'pro'); return '连接成功'; }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/AuthFailure|Unauthorized|Invalid.*Key|credential|signature/i.test(message)) throw error;
    return '连接成功（服务已响应）';
  }
}

export async function downloadBinary(config: ApiConfig, url: string) {
  const response = await networkRequest({ url, proxy: config.proxy, responseType: 'base64', timeoutMs: 300_000 });
  if (!response.ok) throw new Error(`下载失败（HTTP ${response.status}）`);
  const binary = atob(response.body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: response.headers['content-type'] || 'application/octet-stream' });
}
