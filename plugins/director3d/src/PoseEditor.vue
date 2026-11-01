<template>
  <section class="pose-workspace" aria-label="3D 姿态编辑">
    <header><strong>手动摆姿势</strong><span>{{ selection }}</span><el-button :disabled="busy" @click="$emit('close')">取消</el-button><el-button type="primary" :disabled="busy || !ready" @click="$emit('apply',draft)">完成并应用</el-button></header>
    <nav>
      <el-select v-model="id" placeholder="选择人偶" @change="selectPerson"><el-option v-for="p in people" :key="p.threeJsonId" :label="p.name || p.threeJsonId" :value="p.threeJsonId" /></el-select>
      <el-button :type="mode==='translate'?'primary':'default'" @click="setMode('translate')">移动人偶</el-button>
      <el-button :type="mode==='rotate'?'primary':'default'" @click="setMode('rotate')">旋转人偶</el-button>
      <el-button :type="mode==='joint'?'primary':'default'" @click="setMode('joint')">旋转关节</el-button>
      <el-button :type="mode==='ik'?'primary':'default'" @click="setMode('ik')">拖动手脚 · IK</el-button>
      <el-button :disabled="!canUndo" @click="travel('undo')">撤销</el-button><el-button :disabled="!canRedo" @click="travel('redo')">重做</el-button>
      <el-button @click="focusPerson">聚焦人偶</el-button>
      <el-button @click="resetPose">自然站姿</el-button>
      <el-button v-for="view in ['正面','背面','左侧','右侧','顶部']" :key="view" @click="setView(view)">{{ view }}</el-button>
    </nav>
    <div ref="viewport" class="viewport"><canvas ref="canvas"/><div class="hint">{{ error || (mode==='ik'?'拖动手腕或脚踝绿色圆点，手臂 / 腿自动跟随；超出长度时保持骨长。':'点选关节后拖动旋转环；移动人偶时拖动坐标轴。')+' 空白拖动环绕 · 右键平移 · 滚轮缩放' }}</div></div>
    <footer><label>背景 <input type="color" v-model="draft.scene.sceneConfig.scene.background" @input="updateEnvironment"></label><el-switch v-model="draft.sceneSettings.skyVisible" active-text="天空" @change="updateEnvironment"/><el-switch v-model="draft.sceneSettings.gridVisible" active-text="网格" @change="updateEnvironment"/><span>关节按自身坐标旋转，下游肢体同步跟随；完成后可导出静帧 / 骨架参考。</span></footer>
  </section>
</template>
<script setup lang="ts">
import {computed,ref,onMounted,onBeforeUnmount} from 'vue';
import {ElSelect,ElOption,ElButton,ElSwitch} from 'element-plus';
import {Color,Mesh,MeshBasicMaterial,SphereGeometry,Raycaster,Vector2,Vector3,Box3,Plane,type Object3D} from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {TransformControls} from 'three/examples/jsm/controls/TransformControls.js';
import type {SceneRuntime} from 'threejson/core';
import type {DirectorDocument} from './document';
import {limbChains,limbPole,solveLimb,readMannequinPose,PoseHistory} from './poseInteraction';
import {mannequinJoints} from './mannequin';
import {createStage,disposeStage,applySceneSettings} from './scene';
const props=defineProps<{document:DirectorDocument;busy:boolean}>();defineEmits<{close:[];apply:[value:DirectorDocument]}>();
const draft=ref<DirectorDocument>(JSON.parse(JSON.stringify(props.document)));
const people=computed(()=>draft.value.scene.objectList.filter(p=>p.objType==='mannequin'));
const id=ref(people.value[0]?.threeJsonId||'');
const mode=ref<'translate'|'rotate'|'joint'|'ik'>('ik');
const selection=ref('点击关节开始调整');const ready=ref(false);const error=ref('');
const canvas=ref<HTMLCanvasElement>();const viewport=ref<HTMLDivElement>();
let runtime:SceneRuntime|undefined,orbit:OrbitControls|undefined,gizmo:TransformControls|undefined,observer:ResizeObserver|undefined;
let dead=false;let selected:Object3D|undefined;let markers:Mesh[]=[];
const geometry=new SphereGeometry(0.035,12,8);const material=new MeshBasicMaterial({color:0x51e5bd,depthTest:false,transparent:true,opacity:0.85});
const labels:Record<string,string>={hips:'骨盆',spine:'躯干',neck:'颈部',head:'头部',leftShoulder:'左肩',leftElbow:'左肘',leftWrist:'左腕',rightShoulder:'右肩',rightElbow:'右肘',rightWrist:'右腕',leftHip:'左髋',leftKnee:'左膝',leftAnkle:'左踝',rightHip:'右髋',rightKnee:'右膝',rightAnkle:'右踝'};
function root(){return runtime?.scene.getObjectByName(`mannequin:${id.value}`)}
function render(){runtime?.invalidate()}
const history=new PoseHistory();const canUndo=ref(false),canRedo=ref(false);
function remember(){history.push(draft.value.scene.objectList);canUndo.value=history.canUndo;canRedo.value=history.canRedo}
function travel(direction:'undo'|'redo'){
  const objects=history[direction]();if(!objects||!runtime)return;draft.value.scene.objectList=objects;attach();
  for(const p of people.value){const o=runtime.scene.getObjectByName('mannequin:'+p.threeJsonId);if(!o)continue;o.position.set(p.position.x,p.position.y,p.position.z);o.rotation.set(p.rotation?.rotationX||0,p.rotation?.rotationY||0,p.rotation?.rotationZ||0);for(const name of mannequinJoints){const v=p.pose?.[name];o.getObjectByName(name)?.rotation.set(v?.x||0,v?.y||0,v?.z||0)}}
  canUndo.value=history.canUndo;canRedo.value=history.canRedo;render();
}
function setView(view:string){if(!runtime||!orbit)return;const directions:Record<string,number[]>={'正面':[0,0,1],'背面':[0,0,-1],'左侧':[1,0,0],'右侧':[-1,0,0],'顶部':[0,1,0.0001]};const d=directions[view]!;const distance=runtime.camera.position.distanceTo(orbit.target);runtime.camera.position.copy(orbit.target).add(new Vector3(d[0],d[1],d[2]).normalize().multiplyScalar(distance));orbit.update();render()}

function attach(target?:Object3D){
  selected=target;gizmo?.detach();
  if(target&&mode.value!=='ik'){gizmo?.setMode(mode.value==='translate'?'translate':'rotate');gizmo?.setSpace(mode.value==='joint'?'local':'world');gizmo?.attach(target)}
  selection.value=target?(labels[target.name] || '整个人偶'):'点击关节点或身体部位';render();
}
function setMode(value:typeof mode.value){mode.value=value;for(const m of markers)m.visible=value==='joint'||(value==='ik'&&!!limbChains[m.parent?.name||'']);attach(value==='joint'||value==='ik'?undefined:root())}
function selectPerson(){setMode(mode.value)}
function focusPerson(){const person=root();if(!person||!runtime||!orbit)return;const box=new Box3().setFromObject(person);const center=box.getCenter(new Vector3());const size=Math.max(1,box.getSize(new Vector3()).length());orbit.target.copy(center);runtime.camera.position.copy(center).add(new Vector3(0.8,0.35,1).normalize().multiplyScalar(size*1.5));orbit.update();render()}
function syncTransform(){
  const person=people.value.find(p=>p.threeJsonId===id.value);const object=root();if(!person||!object||!selected)return;
  if(selected===object){person.position={x:object.position.x,y:object.position.y,z:object.position.z};person.rotation={rotationX:object.rotation.x,rotationY:object.rotation.y,rotationZ:object.rotation.z}}
  else if(mannequinJoints.includes(selected.name as typeof mannequinJoints[number])){const pose=person.pose??={};pose[selected.name as typeof mannequinJoints[number]]={x:selected.rotation.x,y:selected.rotation.y,z:selected.rotation.z}}
  render();
}
function resetPose(){const person=people.value.find(p=>p.threeJsonId===id.value);if(!person)return;person.pose={};for(const name of mannequinJoints)root()?.getObjectByName(name)?.rotation.set(0,0,0);remember();render()}
function updateEnvironment(){if(!runtime)return;runtime.scene.background=new Color(draft.value.scene.sceneConfig.scene.background);applySceneSettings(runtime,draft.value.sceneSettings)}
const ray=new Raycaster();let down:Vector2|undefined;let wasTransform=false;
let ikDrag:{pointer:number;end:string;object:Object3D;plane:Plane;offset:Vector3;pole:Vector3|null}|undefined;
function startIK(event:PointerEvent){
  if(mode.value!=='ik'||event.button!==0||!runtime||!canvas.value)return;
  const r=canvas.value.getBoundingClientRect();ray.setFromCamera(new Vector2((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1),runtime.camera);runtime.scene.updateMatrixWorld(true);
  const hit=ray.intersectObjects(markers.filter(m=>{for(let p:Object3D|null=m;p;p=p.parent)if(!p.visible)return false;return true}),false)[0];if(!hit)return;
  const joint=hit.object.parent!;let object=joint;while(object.parent&&!object.name.startsWith('mannequin:'))object=object.parent;
  if(!limbChains[joint.name])return;id.value=String(object.userData.threeJsonId);attach(joint);
  const point=joint.getWorldPosition(new Vector3());const plane=new Plane().setFromNormalAndCoplanarPoint(runtime.camera.getWorldDirection(new Vector3()),point);const intersection=ray.ray.intersectPlane(plane,new Vector3());if(!intersection)return;
  ikDrag={pointer:event.pointerId,end:joint.name,object,plane,offset:point.clone().sub(intersection),pole:limbPole(object,joint.name)};
  if(orbit)orbit.enabled=false;if(gizmo)gizmo.enabled=false;canvas.value.setPointerCapture(event.pointerId);event.preventDefault();event.stopImmediatePropagation();
}
function moveIK(event:PointerEvent){if(!ikDrag||!canvas.value||!runtime||event.pointerId!==ikDrag.pointer)return;const r=canvas.value.getBoundingClientRect();ray.setFromCamera(new Vector2((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1),runtime.camera);const point=ray.ray.intersectPlane(ikDrag.plane,new Vector3());if(!point)return;
  if(solveLimb(ikDrag.object,ikDrag.end,point.add(ikDrag.offset),ikDrag.pole)){const p=people.value.find(p=>p.threeJsonId===id.value);if(p)p.pose=readMannequinPose(ikDrag.object);render()}event.stopImmediatePropagation();
}
function endIK(event:PointerEvent){if(!ikDrag||event.pointerId!==ikDrag.pointer)return;ikDrag=undefined;if(canvas.value?.hasPointerCapture(event.pointerId))canvas.value.releasePointerCapture(event.pointerId);if(orbit)orbit.enabled=true;if(gizmo)gizmo.enabled=true;remember();event.stopImmediatePropagation()}
function pointerDown(event:PointerEvent){down=new Vector2(event.clientX,event.clientY);wasTransform=!!gizmo?.axis}
function pick(event:PointerEvent){
  if(mode.value==='ik'||event.button!==0||!runtime||!canvas.value||!down||down.distanceTo(new Vector2(event.clientX,event.clientY))>4||wasTransform||gizmo?.dragging)return;
  const rect=canvas.value.getBoundingClientRect();ray.setFromCamera(new Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),runtime.camera);
  runtime.scene.updateMatrixWorld(true);
  const roots=people.value.map(p=>runtime!.scene.getObjectByName(`mannequin:${p.threeJsonId}`)).filter((p):p is Object3D=>!!p);
  const visible=(o:Object3D)=>{for(let p:Object3D|null=o;p;p=p.parent)if(!p.visible)return false;return true};
  const dot=mode.value==='joint'?ray.intersectObjects(markers,false).find(h=>visible(h.object)):undefined;
  const hit=dot||ray.intersectObjects(roots,true).find(h=>visible(h.object)&&!h.object.userData.poseMarker);
  if(!hit){attach();return}
  let joint=hit.object.userData.poseMarker?hit.object.parent!:hit.object;
  while(joint.parent&&!mannequinJoints.includes(joint.name as typeof mannequinJoints[number])&&!joint.name.startsWith('mannequin:'))joint=joint.parent;
  let owner=joint;while(owner.parent&&!owner.name.startsWith('mannequin:'))owner=owner.parent;
  id.value=String(owner.userData.threeJsonId);attach(mode.value==='joint'?joint:owner);
}
function historyKey(event:KeyboardEvent){
  if(!(event.ctrlKey||event.metaKey)||ikDrag||gizmo?.dragging||(event.target instanceof Element&&event.target.closest('input,textarea,select,[contenteditable=true]')))return;
  const key=event.key.toLowerCase();if(key==='z'||key==='y'){event.preventDefault();travel(key==='y'||event.shiftKey?'redo':'undo')}
}
onMounted(async()=>{
  window.addEventListener('keydown',historyKey);
  try{
    const stage=await createStage(canvas.value!,draft.value.scene,undefined,16/9,draft.value.lighting,draft.value.sceneSettings);
    if(dead){disposeStage(stage);return}runtime=stage;
    orbit=new OrbitControls(stage.camera,canvas.value);orbit.target.copy(new Vector3(draft.value.scene.sceneConfig.controls.target.x,draft.value.scene.sceneConfig.controls.target.y,draft.value.scene.sceneConfig.controls.target.z));orbit.addEventListener('change',render);
    gizmo=new TransformControls(stage.camera,canvas.value);gizmo.setSize(0.85);stage.scene.add(gizmo.getHelper());
    gizmo.addEventListener('dragging-changed',event=>{if(orbit)orbit.enabled=!event.value;if(!event.value)remember()});gizmo.addEventListener('objectChange',syncTransform);gizmo.addEventListener('change',render);
    for(const person of people.value){const object=stage.scene.getObjectByName(`mannequin:${person.threeJsonId}`);for(const name of mannequinJoints){const joint=object?.getObjectByName(name);if(!joint)continue;const marker=new Mesh(geometry,material);marker.userData.poseMarker=true;marker.renderOrder=1000;joint.add(marker);markers.push(marker)}}
    canvas.value!.addEventListener('pointerdown',startIK,true);canvas.value!.addEventListener('pointermove',moveIK,true);canvas.value!.addEventListener('pointerup',endIK,true);canvas.value!.addEventListener('pointercancel',endIK,true);
    canvas.value!.addEventListener('pointerdown',pointerDown);canvas.value!.addEventListener('pointerup',pick);
    observer=new ResizeObserver(()=>{if(!runtime||!viewport.value)return;const {width,height}=viewport.value.getBoundingClientRect();if(!width||!height)return;runtime.renderer.setSize(Math.min(1920,width*devicePixelRatio),Math.min(1920,width*devicePixelRatio)*height/width,false);runtime.camera.aspect=width/height;runtime.camera.updateProjectionMatrix();render()});observer.observe(viewport.value!);
    stage.start();ready.value=true;focusPerson();setMode('ik');remember();
  }catch(e){error.value=`3D 编辑器加载失败：${e instanceof Error?e.message:String(e)}`}
});
onBeforeUnmount(()=>{dead=true;window.removeEventListener('keydown',historyKey);observer?.disconnect();canvas.value?.removeEventListener('pointerdown',startIK,true);canvas.value?.removeEventListener('pointermove',moveIK,true);canvas.value?.removeEventListener('pointerup',endIK,true);canvas.value?.removeEventListener('pointercancel',endIK,true);canvas.value?.removeEventListener('pointerdown',pointerDown);canvas.value?.removeEventListener('pointerup',pick);gizmo?.detach();if(gizmo)runtime?.scene.remove(gizmo.getHelper());gizmo?.dispose();orbit?.dispose();for(const m of markers)m.removeFromParent();geometry.dispose();material.dispose();if(runtime)disposeStage(runtime)});
</script>
<style scoped>
.pose-workspace{position:fixed;inset:0;z-index:2100;background:var(--el-bg-color);display:flex;flex-direction:column;color:var(--el-text-color-primary)}
header,nav,footer{display:flex;align-items:center;gap:10px;padding:10px 14px;flex-wrap:wrap}header span{flex:1}nav .el-select{width:150px}.viewport{position:relative;flex:1;min-height:180px;overflow:hidden}.viewport canvas{display:block;width:100%;height:100%;touch-action:none}.hint{position:absolute;bottom:12px;left:12px;right:12px;pointer-events:none;color:white;background:#0009;padding:8px;border-radius:6px;font-size:12px}footer{font-size:12px}footer label{display:flex;align-items:center;gap:6px}
</style>


