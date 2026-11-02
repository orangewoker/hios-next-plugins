export function errorText(error,fallback='未知错误'){
  if(typeof error==='string'&&error.trim())return error;
  if(typeof error?.message==='string'&&error.message.trim())return error.message;
  if(error?.type)return `资源加载失败（${error.type}）${error.target?.src?`：${error.target.src}`:''}`;
  try{const json=JSON.stringify(error);if(json&&json!=='{}'&&json!=='null')return json;}catch{}
  return fallback;
}
export function modelDirectory(base){return new URL('../assets/vendor/vision/wasm',base).href.replace(/\/+$/,'');}
