export type ProviderMode = 'openai' | 'tencent';
export type InputMode = 'text' | 'image' | 'multiview';
export type JobStatus = 'WAIT' | 'RUN' | 'DONE' | 'FAIL';

export type ApiConfig = {
  provider: ProviderMode;
  baseUrl: string;
  apiKey: string;
  secretId: string;
  secretKey: string;
  region: string;
  version: string;
  proxy: string;
  rememberSecret: boolean;
  pollSeconds: number;
};

export type GenerateParams = {
  inputMode: InputMode;
  prompt: string;
  image?: string;
  imageName?: string;
  multiViewImages: Array<{ viewType: string; data: string; name: string }>;
  model: '3.0' | '3.1';
  engine: 'pro' | 'rapid';
  generateType: 'Normal' | 'LowPoly' | 'Geometry' | 'Sketch';
  enablePBR: boolean;
  faceCount: number;
  polygonType: 'triangle' | 'quadrilateral';
  resultFormat: '' | 'OBJ' | 'GLB' | 'STL' | 'USDZ' | 'FBX' | 'MP4';
};

export type ResultFile = { type: string; url: string; previewImageUrl?: string; cachedDataUrl?: string; size?: number };

export type JobRecord = {
  id: string;
  jobId: string;
  provider: ProviderMode;
  status: JobStatus;
  createdAt: number;
  updatedAt: number;
  params: GenerateParams;
  files: ResultFile[];
  errorCode?: string;
  errorMessage?: string;
  creditConsumed?: number;
  creditDetails?: string;
};

export const DEFAULT_CONFIG: ApiConfig = {
  provider: 'openai',
  baseUrl: 'https://api.ai3d.cloud.tencent.com',
  apiKey: '', secretId: '', secretKey: '', region: 'ap-guangzhou', version: '2025-05-13', proxy: '',
  rememberSecret: false, pollSeconds: 4,
};

export const DEFAULT_PARAMS: GenerateParams = {
  inputMode: 'text', prompt: '', multiViewImages: [], model: '3.0', engine: 'pro', generateType: 'Normal',
  enablePBR: true, faceCount: 500000, polygonType: 'triangle', resultFormat: '',
};
