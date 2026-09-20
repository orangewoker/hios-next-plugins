import { DEFAULT_CONFIG, type ApiConfig, type JobRecord } from './types';

const CONFIG_KEY = 'hunyuan-3d.config.v1';
const SESSION_SECRET_KEY = 'hunyuan-3d.secrets.v1';
const JOBS_KEY = 'hunyuan-3d.jobs.v1';

function parse<T>(value: string | null, fallback: T): T {
  try { return value ? JSON.parse(value) as T : fallback; } catch { return fallback; }
}

export function loadConfig(): ApiConfig {
  const stored = parse<Partial<ApiConfig>>(localStorage.getItem(CONFIG_KEY), {});
  const persistedSecrets = stored.rememberSecret ? stored : {};
  const sessionSecrets = parse<Partial<ApiConfig>>(sessionStorage.getItem(SESSION_SECRET_KEY), {});
  return { ...DEFAULT_CONFIG, ...stored, apiKey: sessionSecrets.apiKey || persistedSecrets.apiKey || '', secretId: sessionSecrets.secretId || persistedSecrets.secretId || '', secretKey: sessionSecrets.secretKey || persistedSecrets.secretKey || '' };
}

export function saveConfig(config: ApiConfig) {
  const safe = { ...config, apiKey: config.rememberSecret ? config.apiKey : '', secretId: config.rememberSecret ? config.secretId : '', secretKey: config.rememberSecret ? config.secretKey : '' };
  localStorage.setItem(CONFIG_KEY, JSON.stringify(safe));
  sessionStorage.setItem(SESSION_SECRET_KEY, JSON.stringify({ apiKey: config.apiKey, secretId: config.secretId, secretKey: config.secretKey }));
}

export function loadJobs(): JobRecord[] {
  return parse<JobRecord[]>(localStorage.getItem(JOBS_KEY), []).map((job) => ({ ...job, files: job.files || [] })).slice(0, 80);
}

export function saveJobs(jobs: JobRecord[]) {
  const light = jobs.slice(0, 80).map((job) => ({ ...job, params: { ...job.params, image: undefined, multiViewImages: (job.params.multiViewImages || []).map((item) => ({ ...item, data: '' })) } }));
  localStorage.setItem(JOBS_KEY, JSON.stringify(light));
}
