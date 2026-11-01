<template>
  <el-dialog :model-value="true" title="姿态参考 · 人偶与环境" width="600px" @close="$emit('close')">
    <p>修改后点击“应用”，在主视图取景并导出静帧或骨架参考。不会修改已有动画方案。</p>
    <el-select v-model="id" placeholder="选择人偶"><el-option v-for="p in people" :key="p.threeJsonId" :label="p.name || p.threeJsonId" :value="p.threeJsonId" /></el-select>
    <template v-if="person">
      <h4>位置（场景单位）</h4><label v-for="axis in axes" :key="axis">{{ axis }} <el-input-number v-model="person.position[axis]" :step="0.1" :min="-1000" :max="1000" /></label>
      <h4>关节姿态（角度）</h4><el-select v-model="joint"><el-option v-for="(label,key) in labels" :key="key" :label="label" :value="key" /></el-select>
      <div><label v-for="axis in axes" :key="axis">{{ axis }} <el-input-number :model-value="angle(axis)" :min="-180" :max="180" :step="5" @update:model-value="setAngle(axis,$event)" /></label></div>
      <p><el-button @click="person.pose={}">自然站姿</el-button><el-button @click="preset('arms')">平举双臂</el-button><el-button @click="preset('sit')">坐姿</el-button><el-button @click="mirror">左右镜像</el-button></p>
      <label>整体朝向 <el-input-number :model-value="Math.round((person.rotation?.rotationY || 0)*180/Math.PI)" :min="-180" :max="180" @update:model-value="turn" /></label>
    </template>
    <h4>环境</h4><label>纯色背景 <input type="color" v-model="draft.scene.sceneConfig.scene.background"></label>
    <el-switch v-model="draft.sceneSettings.skyVisible" active-text="天空"/><el-switch v-model="draft.sceneSettings.gridVisible" active-text="网格"/>
    <p>纯色背景需关闭天空；骨架参考图自动使用黑底，不改变场景。</p>
    <template #footer><el-button @click="$emit('close')">取消</el-button><el-button type="primary" :disabled="busy" @click="$emit('apply',draft)">应用</el-button></template>
  </el-dialog>
</template>
<script setup lang="ts">
import {computed,ref} from 'vue';
import {ElDialog,ElSelect,ElOption,ElButton,ElInputNumber,ElSwitch} from 'element-plus';
import type {DirectorDocument} from './document';
import type {mannequinJoints} from './mannequin';
const props=defineProps<{document:DirectorDocument;busy:boolean}>();defineEmits<{close:[];apply:[value:DirectorDocument]}>();
const draft=ref<DirectorDocument>(JSON.parse(JSON.stringify(props.document)));
const people=computed(()=>draft.value.scene.objectList.filter(p=>p.objType==='mannequin'));
const id=ref(people.value[0]?.threeJsonId||'');const person=computed(()=>people.value.find(p=>p.threeJsonId===id.value));
const axes=['x','y','z'] as const;type Axis=typeof axes[number];type Joint=typeof mannequinJoints[number];const joint=ref<Joint>('hips');
const labels:Record<Joint,string>={hips:'骨盆',spine:'躯干',neck:'颈部',head:'头部',leftShoulder:'左肩',leftElbow:'左肘',leftWrist:'左腕',rightShoulder:'右肩',rightElbow:'右肘',rightWrist:'右腕',leftHip:'左髋',leftKnee:'左膝',leftAnkle:'左踝',rightHip:'右髋',rightKnee:'右膝',rightAnkle:'右踝'};
function angle(axis:Axis){return Math.round((person.value?.pose?.[joint.value]?.[axis]||0)*180/Math.PI)}
function setAngle(axis:Axis,value:number|undefined){if(!person.value||value===undefined)return;const p=person.value.pose??={};const v=p[joint.value]??={x:0,y:0,z:0};v[axis]=value*Math.PI/180}
function turn(value:number|undefined){if(!person.value||value===undefined)return;const r=person.value.rotation??={rotationX:0,rotationY:0,rotationZ:0};r.rotationY=value*Math.PI/180}
function preset(type:string){if(!person.value)return;person.value.pose=type==='arms'?{leftShoulder:{x:0,y:0,z:Math.PI/2},rightShoulder:{x:0,y:0,z:-Math.PI/2}}:{leftHip:{x:-Math.PI/2,y:0,z:0},rightHip:{x:-Math.PI/2,y:0,z:0},leftKnee:{x:Math.PI/2,y:0,z:0},rightKnee:{x:Math.PI/2,y:0,z:0}}}
function mirror(){if(!person.value)return;const pose:NonNullable<typeof person.value.pose>={};for(const [name,v] of Object.entries(person.value.pose||{})){if(!v)continue;const target=name.startsWith('left')?name.replace('left','right'):name.startsWith('right')?name.replace('right','left'):name;pose[target as Joint]={x:v.x,y:-v.y,z:-v.z}}person.value.pose=pose}
</script>
<style scoped>label{display:inline-flex;gap:6px;align-items:center;margin:8px}p{color:var(--el-text-color-secondary);font-size:12px}.el-switch{margin:10px}</style>
