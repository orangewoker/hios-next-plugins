import {Vector3} from 'three';
import {createStage,disposeStage,type SceneDocument} from './scene';
import {applyCamera,type CameraAnchor} from './motion';
import {mannequinJoints} from './mannequin';
import {prepareSceneAnimation, type DirectorPlan} from './sceneAnimation';
/** 16-joint mannequin reference; intentionally not labelled OpenPose/face/hand data. */
export async function renderSkeleton(scene:SceneDocument,anchor:CameraAnchor,aspect:number,signal:AbortSignal,plan?:DirectorPlan,time=0){
 const runtime=await createStage(document.createElement('canvas'),scene,undefined,aspect);
 let player:ReturnType<typeof prepareSceneAnimation>|undefined;
 try{signal.throwIfAborted();if(plan){player=prepareSceneAnimation(runtime,plan);player.setTime(time);}applyCamera(runtime.camera,anchor);runtime.scene.updateMatrixWorld(true);runtime.camera.updateMatrixWorld(true);
 const canvas=document.createElement('canvas');canvas.width=runtime.renderer.domElement.width;canvas.height=runtime.renderer.domElement.height;const ctx=canvas.getContext('2d')!;ctx.fillStyle='#000';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.lineWidth=Math.max(3,canvas.width/250);ctx.lineCap='round';
 for(const object of scene.objectList.filter(o=>o.objType==='mannequin')){const root=runtime.scene.getObjectByName(`mannequin:${object.threeJsonId}`);if(!root)continue;const points=new Map<string,{x:number;y:number}>();for(const name of mannequinJoints){const node=root.getObjectByName(name);if(!node)continue;let visible=true;for(let p=node;p;p=p.parent!){if(!p.visible)visible=false;}if(!visible)continue;const v=node.getWorldPosition(new Vector3()).project(runtime.camera);if(v.z < -1 || v.z>1)continue;points.set(name,{x:(v.x+1)*canvas.width/2,y:(1-v.y)*canvas.height/2});}
 for(const [i,name] of mannequinJoints.entries()){const p=points.get(name),node=root.getObjectByName(name),q=points.get(node?.parent?.name||'');if(!p)continue;ctx.strokeStyle=ctx.fillStyle=`hsl(${i*360/mannequinJoints.length} 100% 55%)`;if(q){ctx.beginPath();ctx.moveTo(q.x,q.y);ctx.lineTo(p.x,p.y);ctx.stroke()}ctx.beginPath();ctx.arc(p.x,p.y,ctx.lineWidth,0,Math.PI*2);ctx.fill();}}
 const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('骨架图导出失败')),'image/png'));signal.throwIfAborted();return new File([blob],'16关节骨架参考.png',{type:'image/png'});
 }finally{player?.dispose();disposeStage(runtime)}
}
