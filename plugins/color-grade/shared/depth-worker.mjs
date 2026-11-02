import {pipeline,env,RawImage} from '../assets/vendor/transformers/transformers.web.min.js';
env.allowRemoteModels=false;env.allowLocalModels=true;env.localModelPath=new URL('../assets/models/',import.meta.url).href;env.useBrowserCache=false;
env.backends.onnx.wasm.wasmPaths={mjs:new URL('../assets/vendor/transformers/ort-wasm-simd-threaded.jsep.mjs',import.meta.url).href,wasm:new URL('../assets/vendor/transformers/ort-wasm-simd-threaded.jsep.wasm',import.meta.url).href};
env.backends.onnx.wasm.numThreads=1;env.backends.onnx.wasm.proxy=false;
let estimator;
self.onmessage=async({data})=>{try{
  estimator??=await pipeline('depth-estimation','depth',{dtype:'q8',device:'wasm'});
  const result=await estimator(new RawImage(data.pixels,data.width,data.height,4));
  const map=new Uint8ClampedArray(result.depth.data);
  self.postMessage({id:data.id,map,width:result.depth.width,height:result.depth.height},[map.buffer]);
}catch(error){estimator=null;self.postMessage({id:data.id,error:error.message||String(error)});}};
