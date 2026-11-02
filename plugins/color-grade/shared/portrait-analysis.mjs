import {modelDirectory,errorText} from './errors.mjs';
import {CONTOURS,faceBounds} from './portrait-state.mjs';
let modelTask;
export async function detectPortraits(image){
 if(!modelTask)modelTask=(async()=>{const {FilesetResolver,FaceLandmarker}=await import('../assets/vendor/vision/vision_bundle.mjs');const files=await FilesetResolver.forVisionTasks(modelDirectory(import.meta.url));return FaceLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:new URL('../assets/models/face/face_landmarker.task',import.meta.url).href,delegate:'CPU'},runningMode:'IMAGE',numFaces:4,minFaceDetectionConfidence:.45,minFacePresenceConfidence:.45,outputFaceBlendshapes:false,outputFacialTransformationMatrixes:false});})().catch(e=>{modelTask=null;throw Error(errorText(e,'人脸模型加载失败'));});
 const model=await modelTask;const faces=(model.detect(image).faceLandmarks||[]).filter(f=>f.length>=468);
 // Overlapping tiles recover small faces in wide/multi-person photos; deduplicate in original coordinates.
 if(faces.length<4){const w=image.width,h=image.height,c=document.createElement('canvas');c.width=Math.round(w*.65);c.height=Math.round(h*.65);const ctx=c.getContext('2d');for(const [x,y] of [[0,0],[.35,0],[0,.35],[.35,.35]]){ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(image,x*w,y*h,c.width,c.height,0,0,c.width,c.height);const found=model.detect(c).faceLandmarks||[];for(const f of found){if(f.length<468)continue;const mapped=f.map(p=>({...p,x:x+p.x*c.width/w,y:y+p.y*c.height/h})),b=faceBounds(mapped);if(b.x<0||b.y<0||b.x+b.w>1||b.y+b.h>1)continue;const duplicate=faces.some(face=>{const a=faceBounds(face);return Math.abs(a.x+a.w/2-b.x-b.w/2)<Math.max(a.w,b.w)*.5&&Math.abs(a.y+a.h/2-b.y-b.h/2)<Math.max(a.h,b.h)*.5;});if(!duplicate&&faces.length<4)faces.push(mapped);}}}
 return faces.sort((a,b)=>faceBounds(a).x-faceBounds(b).x);
}
export function portraitRegions(faces,w,h){const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');
 const path=(f,ids)=>{ctx.beginPath();ids.forEach((id,i)=>{const p=f[id];i?ctx.lineTo(p.x*w,p.y*h):ctx.moveTo(p.x*w,p.y*h);});ctx.closePath();};
 faces.slice(0,4).forEach((f,i)=>{const a=(i+1)/4;ctx.fillStyle=`rgba(255,0,0,${a})`;path(f,CONTOURS.face);ctx.fill();
 // Keep alpha as face index; each feature replaces the region, not the underlying image.
 const fill=(ids,color)=>{path(f,ids);ctx.save();ctx.clip();ctx.clearRect(0,0,w,h);ctx.fillStyle=`rgba(${color},${a})`;ctx.fillRect(0,0,w,h);ctx.restore();};
 fill(CONTOURS.left,'0,0,0');fill(CONTOURS.right,'0,0,0');fill(CONTOURS.lip,'0,255,0');fill(CONTOURS.inner,'0,0,255');
 // Eyebrows must not be smoothed.
 for(const ids of [[70,63,105,66,107,55,65,52,53,46],[336,296,334,293,300,276,283,282,295,285]])fill(ids,'0,0,0');
 });return ctx.getImageData(0,0,w,h);}
