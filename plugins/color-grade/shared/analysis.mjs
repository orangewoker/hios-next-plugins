// Models never receive a network URL: all weights/runtime files are bundled with this plugin.
import {errorText,modelDirectory} from './errors.mjs';
let segmenterPromise,depthWorker,depthJobs=new Map(),depthId=0;
async function segmenter(){
  if(!segmenterPromise)segmenterPromise=(async()=>{
    const {FilesetResolver,ImageSegmenter}=await import('../assets/vendor/vision/vision_bundle.mjs');
    const files=await FilesetResolver.forVisionTasks(modelDirectory(import.meta.url));
    return ImageSegmenter.createFromOptions(files,{baseOptions:{modelAssetPath:new URL('../assets/models/skin/selfie_multiclass_256x256.tflite',import.meta.url).href,delegate:'CPU'},runningMode:'IMAGE',outputConfidenceMasks:true,outputCategoryMask:false});
  })().catch(e=>{segmenterPromise=null;throw new Error(errorText(e,'皮肤模型初始化失败'));});
  return segmenterPromise;
}
export async function analyzeSkin(image){
  const model=await segmenter();const result=model.segment(image);
  try{
    const masks=result.confidenceMasks;if(!masks||masks.length<6)throw new Error('皮肤模型未返回完整分类');
    const body=masks[2].getAsFloat32Array(),face=masks[3].getAsFloat32Array(),background=masks[0].getAsFloat32Array();
    const skin=new Uint8ClampedArray(body.length),subject=new Uint8ClampedArray(body.length);
    for(let i=0;i<skin.length;i++){skin[i]=Math.min(1,body[i]+face[i])*255;subject[i]=(1-background[i])*255;}
    return {skin,subject,width:masks[0].width,height:masks[0].height};
  }finally{result.close();}
}
export function analyzeDepth(image){
  if(!depthWorker){depthWorker=new Worker(new URL('./depth-worker.mjs',import.meta.url),{type:'module'});depthWorker.onmessage=({data})=>{const job=depthJobs.get(data.id);if(!job)return;depthJobs.delete(data.id);clearTimeout(job.timer);data.error?job.reject(new Error(data.error)):job.resolve(data);};depthWorker.onerror=()=>{for(const job of depthJobs.values()){clearTimeout(job.timer);job.reject(new Error('深度推理线程失败'));}depthJobs.clear();depthWorker.terminate();depthWorker=null;};}
  const id=++depthId,pixels=image.data.slice();
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{depthJobs.delete(id);reject(new Error('深度分析超过 90 秒，请重试'));depthWorker?.terminate();depthWorker=null;},90000);depthJobs.set(id,{resolve,reject,timer});depthWorker.postMessage({id,pixels,width:image.width,height:image.height},[pixels.buffer]);});
}
async function db(){return new Promise((resolve,reject)=>{const r=indexedDB.open('hios-color-grade-analysis-v2',1);r.onupgradeneeded=()=>r.result.createObjectStore('images',{keyPath:'key'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export async function imageKey(data){const hash=await crypto.subtle.digest('SHA-256',data.data);return `${data.width}x${data.height}-`+[...new Uint8Array(hash)].map(v=>v.toString(16).padStart(2,'0')).join('');}
export async function readAnalysis(key){try{const d=await db();return await new Promise(resolve=>{const r=d.transaction('images').objectStore('images').get(key);r.onsuccess=()=>{d.close();resolve(r.result||null);};r.onerror=()=>{d.close();resolve(null);};});}catch{return null;}}
export async function saveAnalysis(key,data){try{const d=await db();await new Promise((resolve,reject)=>{const tx=d.transaction('images','readwrite'),store=tx.objectStore('images');store.put({key,...data,time:Date.now()});const all=store.getAll();all.onsuccess=()=>{for(const item of all.result.sort((a,b)=>b.time-a.time).slice(8))store.delete(item.key);};tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});d.close();}catch{/* Cache is optional; analysis remains available in memory. */}}
export function sampleDepth(data,x,y){if(!data)return .5;const values=[];const cx=Math.round(x*(data.width-1)),cy=Math.round(y*(data.height-1));for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const xx=Math.max(0,Math.min(data.width-1,cx+dx)),yy=Math.max(0,Math.min(data.height-1,cy+dy));values.push(data.map[yy*data.width+xx]/255);}values.sort((a,b)=>a-b);return values[12];}
