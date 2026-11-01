import * as THREE from 'three';
import {AnalyticIKSolver} from './vendor/xzg-pose/analytic-ik.js';
import {mannequinJoints} from './mannequin';
import type {SceneDocument} from './scene';
const solver=new AnalyticIKSolver(THREE);
export const limbChains:Record<string,readonly [string,string,string]>={
  leftWrist:['leftShoulder','leftElbow','leftWrist'],rightWrist:['rightShoulder','rightElbow','rightWrist'],
  leftAnkle:['leftHip','leftKnee','leftAnkle'],rightAnkle:['rightHip','rightKnee','rightAnkle'],
};
export function limbPole(root:THREE.Object3D,endName:string){
  const names=limbChains[endName];if(!names)return null;
  const a=root.getObjectByName(names[0]),b=root.getObjectByName(names[1]),c=root.getObjectByName(names[2]);if(!a||!b||!c)return null;
  root.updateWorldMatrix(true,true);const start=a.getWorldPosition(new THREE.Vector3()),mid=b.getWorldPosition(new THREE.Vector3()),end=c.getWorldPosition(new THREE.Vector3());
  const axis=end.clone().sub(start).normalize();const bend=mid.clone().sub(start);bend.addScaledVector(axis,-bend.dot(axis));
  if(bend.lengthSq()<1e-5){bend.set(0,0,endName.endsWith('Ankle')?1:-1).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()));bend.addScaledVector(axis,-bend.dot(axis));if(bend.lengthSq()<1e-5)bend.set(1,0,0).cross(axis)}
  return start.add(bend.normalize().multiplyScalar(2));
}
export function solveLimb(root:THREE.Object3D,endName:string,target:THREE.Vector3,pole:THREE.Vector3|null){
  const names=limbChains[endName];if(!names||!target.toArray().every(Number.isFinite))return false;
  const a=root.getObjectByName(names[0]),b=root.getObjectByName(names[1]),c=root.getObjectByName(names[2]);if(!a||!b||!c)return false;
  root.updateWorldMatrix(true,true);const start=a.getWorldPosition(new THREE.Vector3()),mid=b.getWorldPosition(new THREE.Vector3()),end=c.getWorldPosition(new THREE.Vector3());
  const upper=start.distanceTo(mid),lower=mid.distanceTo(end);if(upper<1e-6||lower<1e-6)return false;
  const direction=target.clone().sub(start);let distance=direction.length();if(distance<1e-6)direction.copy(end).sub(start);if(direction.lengthSq()<1e-10)direction.set(0,-1,0);
  distance=THREE.MathUtils.clamp(distance,Math.abs(upper-lower)+1e-5,upper+lower-1e-5);
  return solver.solve2Bone(a,b,c,start.add(direction.normalize().multiplyScalar(distance)),pole,THREE);
}
export function readMannequinPose(root:THREE.Object3D):NonNullable<SceneDocument['objectList'][number]['pose']>{
  const pose:NonNullable<SceneDocument['objectList'][number]['pose']>={};
  for(const name of mannequinJoints){const j=root.getObjectByName(name);if(j)pose[name]={x:j.rotation.x,y:j.rotation.y,z:j.rotation.z}}
  return pose;
}
export class PoseHistory {
  private entries:string[]=[];private cursor=-1;
  get canUndo(){return this.cursor>0} get canRedo(){return this.cursor<this.entries.length-1}
  push(value:unknown){const entry=JSON.stringify(value);if(this.entries[this.cursor]===entry)return;this.entries.splice(this.cursor+1);this.entries.push(entry);if(this.entries.length>80)this.entries.shift();this.cursor=this.entries.length-1}
  undo(){return this.canUndo?JSON.parse(this.entries[--this.cursor]!):null}
  redo(){return this.canRedo?JSON.parse(this.entries[++this.cursor]!):null}
}
