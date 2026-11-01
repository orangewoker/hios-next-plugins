import {Muxer,ArrayBufferTarget} from 'mp4-muxer';
import {createStage,disposeStage,type SceneDocument,type LightingSettings,type SceneSettings} from './scene';
import {prepareMotion,sampleMotion} from './motion';
import {prepareSceneAnimation,type DirectorPlan} from './sceneAnimation';
/** Fixed timestamps decouple animation speed from rendering/encoding throughput. */
export async function renderOfflineVideo(scene:SceneDocument,plan:DirectorPlan,aspect:number,signal:AbortSignal,progress:(n:number)=>void,lighting?:LightingSettings,settings?:SceneSettings):Promise<File|null>{
 if(typeof VideoEncoder==='undefined'||typeof VideoFrame==='undefined')return null;
 const runtime=await createStage(document.createElement('canvas'),scene,undefined,aspect,lighting,settings);let encoder:VideoEncoder|undefined;let player:ReturnType<typeof prepareSceneAnimation>|undefined;
 try{const canvas=runtime.renderer.domElement;const config:VideoEncoderConfig={codec:'avc1.420028',width:canvas.width,height:canvas.height,bitrate:6_000_000,framerate:30,avc:{format:'avc'}};let support;try{support=await VideoEncoder.isConfigSupported(config)}catch{return null}if(!support.supported)return null;
 const target=new ArrayBufferTarget();const muxer=new Muxer({target,video:{codec:'avc',width:canvas.width,height:canvas.height,frameRate:30},fastStart:'in-memory'});let failure:Error|undefined;let bytes=0;
 encoder=new VideoEncoder({output:(chunk,meta)=>{try{bytes+=chunk.byteLength;if(bytes>64*1024*1024)throw Error('视频超过64 MB，请缩短时长');muxer.addVideoChunk(chunk,meta)}catch(e){failure=e as Error}},error:e=>{failure=e}});encoder.configure(config);player=prepareSceneAnimation(runtime,plan);const frames=prepareMotion(plan.cameraFrames);const count=Math.ceil(plan.duration*30);
 for(let n=0;n<count;n++){signal.throwIfAborted();if(failure)throw failure;player.setTime(n/30);sampleMotion(runtime.camera,frames,n/30);runtime.renderer.render(runtime.scene,runtime.camera);const timestamp=Math.round(n*1e6/30);const frame=new VideoFrame(canvas,{timestamp,duration:Math.round((n+1)*1e6/30)-timestamp});try{encoder.encode(frame,{keyFrame:n%60===0})}finally{frame.close()}if(encoder.encodeQueueSize>4)await encoder.flush();if(n%8===0){progress(Math.floor(n/count*99));await new Promise(r=>setTimeout(r,0));}}
 await encoder.flush();signal.throwIfAborted();if(failure)throw failure;muxer.finalize();progress(100);return new File([target.buffer],`${plan.name}.mp4`,{type:'video/mp4'});
 }finally{if(encoder&&encoder.state!=='closed')encoder.close();player?.dispose();disposeStage(runtime)}
}
