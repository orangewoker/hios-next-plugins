import {transform} from './engine.mjs';
self.onmessage=({data})=>{
  try {const pixels=transform(data.pixels,data.state,{mask:data.mask,skinMap:data.skinMap});self.postMessage({id:data.id,pixels},[pixels.buffer]);}
  catch(error){self.postMessage({id:data.id,error:error.message});}
};
