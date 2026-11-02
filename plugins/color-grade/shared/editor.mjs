import {colorStatsLab} from './match.mjs';
import {mountPortrait} from './portrait-ui.mjs';
import {detectPortraits,portraitRegions} from './portrait-analysis.mjs';
import {portraitDefaults,strokeWarps,restoreWarps} from './portrait-state.mjs';
import {errorText} from './errors.mjs';
import {themedSelect} from './select.mjs';
import {defaults,normalize,FIELDS,PRESETS,applyPreset,settings,sourceFrom,analyzeColor,adaptiveState} from './engine.mjs';
import {GpuRenderer} from './gpu.mjs';
import {ImageView} from './view.mjs';
import {analyzeSkin,analyzeDepth,imageKey,readAnalysis,saveAnalysis,sampleDepth} from './analysis.mjs';
const $=id=>document.getElementById(id),app=document.body.dataset.mode==='app',protocol=`hios-plugin-${app?'app':'node'}/v1`,pluginId='color-grade';
const LIBRARY='hios.color-grade.presets.v1';
let state=defaults(),identity='',origin=null,initialized=false,expanded=false,source='',image=null,loadTask=null,loadRevision=0;
let history=[],future=[],gesture=null,version=0,previewTimer,saveTimer,previewBusy=false,previewAgain=false,outputBusy=false;
let originalPixels=null,resultPixels=null,showOriginal=false,split=false,mask=false,lastEcho='',sharedStorage=true;
const echoes=new Set();
const selectControls=[];
let draftStroke=null,mapsDirty=false,faces=[],faceRegions=null,faceTask=null,faceError='',faceReady=false,portraitUI=null,referencePixels=null,matchTask=null,matchRevision=0;
const isWarp=mode=>['push','inflate','contract','restore'].includes(mode);
let gpu=null,tool='none',depthView=false,skinData=null,depthData=null,analysisKey='',skinTask=null,depthTask=null,skinError='',depthError='',mapImage=null,strokeSignature='',previewCanvas=null,colorStats=null;
try{gpu=new GpuRenderer($('preview'));}catch(error){console.warn('GPU unavailable, using CPU',error);const replacement=$('preview').cloneNode();$('preview').replaceWith(replacement);}
const view=new ImageView($('preview'),{onSplit:x=>{$('split').value=Math.round(x*100);draw();},onFocus:p=>mutate(()=>{state.depth.focus=p;setTool('none');}),onPick:p=>portraitUI?.pick(p),onStrokePreview:stroke=>{draftStroke=stroke;mapsDirty=true;schedule();},onStroke:stroke=>mutate(()=>{if(isWarp(stroke.mode)){state.portrait.warps=stroke.mode==='restore'?restoreWarps(state.portrait.warps,stroke,originalPixels.width/originalPixels.height):[...state.portrait.warps,...strokeWarps(stroke,state.portrait)].slice(-32);}else{state.strokes.push(stroke);state.strokes=normalize(state).strokes;updateMaps();}}),onSample:p=>{if(!originalPixels)return;const x=Math.min(originalPixels.width-1,Math.round(p[0]*originalPixels.width)),y=Math.min(originalPixels.height-1,Math.round(p[1]*originalPixels.height)),i=(y*originalPixels.width+x)*4,d=originalPixels.data;mutate(()=>{state.basic.enabled=true;state.basic.temperature=Math.max(-100,Math.min(100,(d[i+2]-d[i])*.9));state.basic.tint=Math.max(-100,Math.min(100,(d[i+1]-(d[i]+d[i+2])/2)*.9));state.modified=true;tool='none';});}});
const pending=new Map(),previewWorker=new Worker(new URL('./worker.mjs',import.meta.url),{type:'module'}),outputWorker=new Worker(new URL('./worker.mjs',import.meta.url),{type:'module'});
function post(type,payload={}){parent.postMessage({protocol,pluginId,...(app?{appId:identity}:{nodeId:identity}),type,payload},origin&&origin!=='null'?origin:'*');}
function status(text,error=false){$('status').textContent=text;$('status').dataset.error=String(error);}
function fail(error){status(error.message||String(error),true);}
function request(type,payload){const requestId=crypto.randomUUID();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(requestId);reject(new Error('宿主响应超时，请重试'));},30000);pending.set(requestId,{resolve,reject,timer});post(type,{...payload,requestId});});}
function emit(){clearTimeout(saveTimer);saveTimer=null;lastEcho=JSON.stringify(state);echoes.add(lastEcho);if(echoes.size>80)echoes.delete(echoes.values().next().value);post('state',{state:JSON.parse(lastEcho)});}
function snapshot(){return JSON.stringify(state);}
function push(before){if(before!==snapshot()){history.push(before);if(history.length>40)history.shift();future=[];}syncHistory();}
function syncHistory(){$('undo').disabled=!history.length||outputBusy;$('redo').disabled=!future.length||outputBusy;}
function dirty(){version++;status(image?'已修改 · 输出待更新':'等待图片');clearTimeout(saveTimer);saveTimer=setTimeout(emit,350);schedule();}
function mutate(fn){const before=snapshot();fn();push(before);dirty();sync();}
function shared(){try{const raw=JSON.parse(localStorage.getItem(LIBRARY)||'[]');return normalize({customPresets:raw}).customPresets;}catch{sharedStorage=false;return [];}}
function mergePresets(){const map=new Map([...shared(),...state.customPresets].map(p=>[p.id,p]));state.customPresets=[...map.values()].slice(-40);}
function saveLibrary(){try{localStorage.setItem(LIBRARY,JSON.stringify(state.customPresets));}catch{sharedStorage=false;}$('storageHint').textContent=sharedStorage?'同源插件实例共享预设；导出 JSON 可备份或迁移。':'当前环境不支持跨节点存储。预设随本节点保存，可用 JSON 迁移。';}
function catalog(){return [...PRESETS,...state.customPresets.map(p=>({...p,category:'我的预设'}))];}
function updatePresets(){const select=$('preset');select.replaceChildren();let group;for(const p of catalog()){if(group?.label!==p.category){group=document.createElement('optgroup');group.label=p.category;select.append(group);}const option=document.createElement('option');option.value=p.id;option.textContent=p.name;group.append(option);}select.value=state.preset;if(!select.value)select.value='original';for(const control of selectControls)control.sync();}
for(const [group,fields] of Object.entries(FIELDS)){
  const details=document.createElement('details');details.id=`module-${group}`;
  const title={basic:'基础调色',skin:'肤色调整',color:'色彩调整'}[group];
  details.innerHTML=`<summary><strong>${title}</strong><small id="summary-${group}"></small><input id="enable-${group}" type="checkbox" aria-label="启用${title}"></summary><div class="fields" id="fields-${group}"><div class="row"><span></span><button id="reset-${group}">重置本模块</button></div></div>`;
  $('modules').append(details);
  const checkbox=$(`enable-${group}`);checkbox.onclick=e=>e.stopPropagation();checkbox.onchange=()=>mutate(()=>{state[group].enabled=checkbox.checked;state.modified=true;});
  details.ontoggle=()=>{if(state.open[group]!==details.open){state.open[group]=details.open;emit();}};
  $(`reset-${group}`).onclick=()=>mutate(()=>{state[group]=defaults()[group];state.modified=true;});
  if(group==='skin'){
    const note=document.createElement('p');note.id='skinStatus';note.className='note';note.textContent='本地 AI 分离脸部和身体皮肤，保护头发、衣服与背景。';$(`fields-${group}`).append(note);
    const mode=document.createElement('select');mode.id='skinMode';mode.setAttribute('aria-label','肤色选区模式');mode.innerHTML='<option value="ai">AI 皮肤选区</option><option value="range">颜色范围（无需模型）</option>';mode.onchange=()=>mutate(()=>{state.skin.mode=mode.value;});$(`fields-${group}`).append(mode);
    const btn=document.createElement('button');btn.id='mask';btn.textContent='查看影响范围';btn.onclick=()=>{mask=!mask;btn.setAttribute('aria-pressed',String(mask));schedule();};$(`fields-${group}`).append(btn);
    const tools=document.createElement('div');tools.className='brush-tools';tools.innerHTML='<button id="brushAdd">补选</button><button id="brushSubtract">擦除</button><button id="brushClear">清除修正</button><label>笔刷<input id="brushSize" type="range" min="1" max="12" value="3" aria-label="笔刷大小"></label><button id="skinRetry">重新识别</button>';$(`fields-${group}`).append(tools);
    $('brushAdd').onclick=()=>setTool(tool==='add'?'none':'add');$('brushSubtract').onclick=()=>setTool(tool==='subtract'?'none':'subtract');$('brushClear').onclick=()=>mutate(()=>{state.strokes=[];updateMaps();});$('brushSize').oninput=()=>{view.radius=Number($('brushSize').value)/100;view.refreshBrush();};$('skinRetry').onclick=()=>{skinError='';skinData=null;updateMaps();void ensureAnalysis();};
  }
  for(const [key,label,min,max,step] of fields){
    const row=document.createElement('label');row.className='slider';row.innerHTML=`<span>${label}</span><input id="${group}-${key}" type="range" min="${min}" max="${max}" step="${step}" aria-label="${label}"><output id="value-${group}-${key}"></output>`;$(`fields-${group}`).append(row);
    bindSlider($(`${group}-${key}`),()=>state[group][key],v=>{state[group][key]=v;state.modified=true;});
  }
}
const matchPanel=document.createElement('details');matchPanel.id='match';matchPanel.innerHTML='<summary><strong>参考图追色</strong><input id="enable-match" type="checkbox" aria-label="启用参考图追色"></summary><div class="fields"><button id="matchOpen">选择参考图</button><input id="matchFile" type="file" accept="image/png,image/jpeg,image/webp" hidden><p id="matchStatus" class="note">匹配整体或皮肤的 Lab 色彩分布；不改变内容。</p><label><input id="matchSkin" type="checkbox">仅匹配皮肤</label><label class="slider">匹配强度<input id="matchStrength" type="range" min="0" max="100" aria-label="匹配强度"><output id="matchStrengthValue"></output></label><button id="matchReset">清除追色</button></div>';$('depth').before(matchPanel);
$('enable-match').onclick=e=>e.stopPropagation();$('enable-match').onchange=e=>mutate(()=>{state.match.enabled=e.target.checked;});
$('matchOpen').onclick=()=>{$('matchFile').value='';$('matchFile').click();};
$('matchFile').onchange=async()=>{const file=$('matchFile').files[0];if(!file)return;try{if(file.size>64*1024*1024||!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('请选择 64 MB 内的 PNG、JPEG 或 WebP');const bitmap=await createImageBitmap(file),c=document.createElement('canvas'),ratio=Math.min(1,640/Math.max(bitmap.width,bitmap.height));c.width=Math.round(bitmap.width*ratio);c.height=Math.round(bitmap.height*ratio);const ctx=c.getContext('2d');ctx.drawImage(bitmap,0,0,c.width,c.height);bitmap.close();referencePixels=ctx.getImageData(0,0,c.width,c.height);state.match.name=file.name;await computeMatch();}catch(e){$('matchStatus').textContent=errorText(e);}};
$('matchSkin').onchange=async()=>{if(!referencePixels){$('matchSkin').checked=state.match.skinOnly;$('matchStatus').textContent='更改匹配范围前请重新选择参考图';return;}state.match.skinOnly=$('matchSkin').checked;await computeMatch();};
$('matchReset').onclick=()=>mutate(()=>{matchRevision++;state.match=defaults().match;referencePixels=null;$('matchStatus').textContent='已清除参考图匹配';});
bindSlider($('matchStrength'),()=>state.match.strength,v=>{state.match.strength=v;});
async function computeMatch(){if(!originalPixels){$('matchStatus').textContent='请先打开原图';return;}const previousMatch=structuredClone(state.match),revision=++matchRevision,sourceRevision=loadRevision,ref=referencePixels,skinOnly=state.match.skinOnly;state.match.enabled=false;state.match.reference=null;schedule();$('matchStatus').textContent='正在分析参考图颜色…';const task=(async()=>{try{let targetMask=null,referenceMask=null;if(skinOnly){const a=await analyzeSkin(previewCanvas),c=document.createElement('canvas');c.width=ref.width;c.height=ref.height;c.getContext('2d').putImageData(ref,0,0);const b=await analyzeSkin(c);const resize=(data,w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');ctx.drawImage(channelCanvas(data.skin,data.width,data.height),0,0,w,h);const rgba=ctx.getImageData(0,0,w,h).data;return Uint8ClampedArray.from({length:w*h},(_,i)=>rgba[i*4]);};targetMask=resize(a,originalPixels.width,originalPixels.height);referenceMask=resize(b,ref.width,ref.height);}const target=colorStatsLab(originalPixels,targetMask),reference=colorStatsLab(ref,referenceMask);if(revision!==matchRevision||sourceRevision!==loadRevision)return;const before=JSON.stringify({...state,match:previousMatch});state.match.target=target;state.match.reference=reference;state.match.enabled=true;push(before);dirty();sync();$('matchStatus').textContent='已匹配：'+state.match.name+' · 统计值随节点保存';}catch(e){if(revision===matchRevision){state.match=previousMatch;sync();schedule();$('matchStatus').textContent=errorText(e);fail(e);}}})();matchTask=task;await task;if(matchTask===task)matchTask=null;}
portraitUI=mountPortrait({getState:()=>state,mutate,bindSlider,setTool,getTool:()=>tool,retry:()=>{faceError='';faceReady=false;void ensureFaces();},overlay:view.overlay});
function bindSlider(el,get,set){el.oninput=()=>{if(gesture===null)gesture=snapshot();set(Number(el.value));dirty();syncValues();};el.onchange=()=>{if(gesture!==null){push(gesture);gesture=null;}emit();};el.ondblclick=()=>{const parts=el.id.split('-');if(parts.length===2&&defaults()[parts[0]])mutate(()=>{state[parts[0]][parts[1]]=defaults()[parts[0]][parts[1]];state.modified=true;});};}
bindSlider($('intensity'),()=>state.intensity,v=>{state.intensity=v;});
function syncValues(){$('enable-match').checked=state.match.enabled;$('matchSkin').checked=state.match.skinOnly;$('matchStrength').value=state.match.strength;$('matchStrengthValue').value=state.match.strength;portraitUI?.sync();if(isWarp(tool)){view.radius=state.portrait.brush/100;view.refreshBrush();}
  $('intensity').value=state.intensity;$('intensityValue').value=state.intensity;
  $('presetHint').textContent=state.modified?'预设已修改 · 双击滑块重置参数':'基于原图处理，不叠加滤镜';
  $('skinMode').value=state.skin.mode;
  $('adaptive').checked=state.adaptive;
  for(const control of selectControls)control.sync();
  $('enable-depth').checked=state.depth.enabled;
  for(const k of ['aperture','strength','range']){$(`depth-${k}`).value=state.depth[k];$(`value-depth-${k}`).value=k==='aperture'?`f/${state.depth[k]}`:state.depth[k];}
  $('depth-foreground').checked=state.depth.foreground;$('depth-protect').checked=state.depth.protect;
  for(const [group,fields] of Object.entries(FIELDS)){
    const enabled=state[group].enabled;$(`enable-${group}`).checked=enabled;$(`fields-${group}`).classList.toggle('disabled',!enabled);
    let changes=0;for(const [key] of fields){$(`${group}-${key}`).value=state[group][key];$(`${group}-${key}`).disabled=!enabled;$(`value-${group}-${key}`).value=state[group][key];if(state[group][key]!==defaults()[group][key])changes++;}
    $(`summary-${group}`).textContent=enabled?(changes?`${changes} 项调整`:'默认'):'已关闭';
  }
}
function sync(){syncValues();syncHistory();updatePresets();for(const group of Object.keys(FIELDS))$(`module-${group}`).open=state.open[group];$('depth').open=state.open.depth;void ensureAnalysis();void ensureFaces();}
function setTool(value){tool=value;if(isWarp(value)||value==='face'){mask=false;depthView=false;view.radius=state.portrait.brush/100;}else view.radius=Number($('brushSize').value)/100;portraitUI?.sync();if(value==='add'||value==='subtract'){mask=true;depthView=false;if(state.skin.mode!=='ai'){state.skin.mode='ai';state.skin.enabled=true;syncValues();emit();void ensureAnalysis();}}$('toolHint').textContent=isWarp(value)?'在图像上操作液化 · Esc 取消当前笔画':value==='face'?'点击人脸选择 · Esc 退出':value==='focus'?'点击图片设置对焦平面 · Esc 退出':value==='sample'?'点击应为中性的灰/白区域 · Esc 退出':value==='add'?'在图片上涂抹补选皮肤 · Esc 退出':value==='subtract'?'在图片上涂抹排除区域 · Esc 退出':'';draw();}
function channelCanvas(data,width,height,channel=0){const c=document.createElement('canvas');c.width=width;c.height=height;const rgba=new Uint8ClampedArray(width*height*4);for(let i=0;i<data.length;i++){rgba[i*4+channel]=data[i];rgba[i*4+3]=255;}c.getContext('2d').putImageData(new ImageData(rgba,width,height),0,0);return c;}
function updateMaps(){
  if(!originalPixels)return;const w=originalPixels.width,h=originalPixels.height,c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');
  let skin=new Uint8ClampedArray(w*h*4),subject=null,depth=null;
  if(skinData){ctx.drawImage(channelCanvas(skinData.skin,skinData.width,skinData.height),0,0,w,h);skin=ctx.getImageData(0,0,w,h).data;ctx.clearRect(0,0,w,h);ctx.drawImage(channelCanvas(skinData.subject,skinData.width,skinData.height),0,0,w,h);subject=ctx.getImageData(0,0,w,h).data;}
  ctx.clearRect(0,0,w,h);ctx.putImageData(new ImageData(skin,w,h),0,0);
  for(const stroke of [...state.strokes,...(draftStroke&&!isWarp(draftStroke.mode)?[draftStroke]:[])]){if(!stroke.points.length)continue;ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=stroke.radius*2*Math.min(w,h);ctx.strokeStyle=ctx.fillStyle=stroke.mode==='add'?'#ff0000':'#000000';ctx.beginPath();stroke.points.forEach(([x,y],i)=>i?ctx.lineTo(x*w,y*h):ctx.moveTo(x*w,y*h));ctx.stroke();const [x,y]=stroke.points[0];ctx.beginPath();ctx.arc(x*w,y*h,ctx.lineWidth/2,0,Math.PI*2);ctx.fill();}
  skin=ctx.getImageData(0,0,w,h).data;
  if(depthData){ctx.clearRect(0,0,w,h);ctx.drawImage(channelCanvas(depthData.map,depthData.width,depthData.height),0,0,w,h);depth=ctx.getImageData(0,0,w,h).data;}
  for(let i=0;i<skin.length;i+=4){skin[i+1]=subject?subject[i]:0;skin[i+2]=depth?depth[i]:128;skin[i+3]=255;}
  mapsDirty=false;mapImage=new ImageData(skin,w,h);gpu?.setMaps(mapImage);strokeSignature=JSON.stringify(state.strokes);
}

async function ensureFaces(required=false){
 if(!state.portrait.enabled||!previewCanvas||!originalPixels||!image)return;
 if(!gpu){faceError='人像精修需要 WebGL2 硬件加速';$('portraitStatus').textContent=faceError;return;}
 if(!faceReady&&!faceTask&&!faceError){const revision=loadRevision;$('portraitStatus').textContent='正在本地识别人脸与五官…';faceTask=detectPortraits(previewCanvas).then(list=>{if(revision!==loadRevision)return;faces=list;faceReady=true;faceRegions=portraitRegions(faces,originalPixels.width,originalPixels.height);portraitUI.setFaces(faces);$('portraitStatus').textContent=faces.length?`已识别 ${faces.length} 张人脸 · 从左到右编号，参数分别保存`:'未检测到人脸，可使用手动液化或更换清晰正面照片';schedule();}).catch(e=>{if(revision===loadRevision){faceError=errorText(e,'人脸识别失败');$('portraitStatus').textContent=faceError+'；点击重新识别人脸重试';}}).finally(()=>{if(revision===loadRevision)faceTask=null;});}
 if(required&&faceTask)await faceTask;
}

async function ensureAnalysis(required=false){
  if(!image||!analysisKey)return;const revision=loadRevision,key=analysisKey,canvas=previewCanvas;
  const needSkin=state.portrait.enabled||(state.match.enabled&&state.match.skinOnly)||(state.skin.enabled&&state.skin.mode==='ai')||(state.depth.enabled&&state.depth.protect);
  if(needSkin&&!skinData&&!skinTask&&!skinError){$('skinStatus').textContent='正在本地识别皮肤与人物…';skinTask=analyzeSkin(canvas).then(data=>{if(revision!==loadRevision)return;skinData=data;const area=data.skin.reduce((sum,v)=>sum+v,0)/255/data.skin.length;$('skinStatus').textContent=area<.002?'未检测到可靠皮肤，可切换颜色范围或手动补选。':'AI 皮肤选区已就绪 · 可查看范围或涂抹修正';updateMaps();draw();void saveAnalysis(key,{skin:skinData,depth:depthData});}).catch(e=>{if(revision===loadRevision){skinError=errorText(e,'皮肤识别失败');$('skinStatus').textContent=`识别失败：${skinError}；可重试或切换颜色范围。`;}}).finally(()=>{if(revision===loadRevision)skinTask=null;});}
  if(state.depth.enabled&&!depthData&&!depthTask&&!depthError){$('depthStatus').textContent='正在本地估计深度，首次加载需要稍候…';const c=document.createElement('canvas'),scale=Math.min(1,640/Math.max(canvas.width,canvas.height));c.width=Math.round(canvas.width*scale);c.height=Math.round(canvas.height*scale);const ctx=c.getContext('2d');ctx.drawImage(canvas,0,0,c.width,c.height);depthTask=analyzeDepth(ctx.getImageData(0,0,c.width,c.height)).then(data=>{if(revision!==loadRevision)return;depthData=data;$('depthStatus').textContent='深度已就绪 · 点击图片对焦，调整光圈实时预览';updateMaps();draw();void saveAnalysis(key,{skin:skinData,depth:depthData});}).catch(e=>{if(revision===loadRevision){depthError=errorText(e,'深度分析失败');$('depthStatus').textContent=`深度分析失败：${depthError}`;}}).finally(()=>{if(revision===loadRevision)depthTask=null;});}
  if(skinData)$('skinStatus').textContent='AI 皮肤选区已就绪 · 可查看范围或涂抹修正';if(depthData)$('depthStatus').textContent='深度已就绪 · 点击图片对焦，调整光圈实时预览';
  if(required)await Promise.all([skinTask,depthTask].filter(Boolean));
}
$('adaptive').onchange=()=>mutate(()=>{state.adaptive=$('adaptive').checked;state.modified=true;});
$('enable-depth').onclick=e=>e.stopPropagation();$('enable-depth').onchange=()=>mutate(()=>{state.depth.enabled=$('enable-depth').checked;});
for(const key of ['aperture','strength','range'])bindSlider($(`depth-${key}`),()=>state.depth[key],v=>{state.depth[key]=v;});
for(const key of ['foreground','protect'])$(`depth-${key}`).onchange=()=>mutate(()=>{state.depth[key]=$(`depth-${key}`).checked;});
$('focusPick').onclick=()=>setTool(tool==='focus'?'none':'focus');$('whitePick').onclick=()=>setTool(tool==='sample'?'none':'sample');
$('depthView').onclick=()=>{depthView=!depthView;mask=false;draw();};$('depthRetry').onclick=()=>{depthError='';depthData=null;void ensureAnalysis();};
$('resetDepth').onclick=()=>mutate(()=>{state.depth=defaults().depth;tool='none';depthView=false;});
$('zoomFit').onclick=()=>{view.zoom=1;view.layout();};$('zoomIn').onclick=()=>{view.zoom=Math.min(4,view.zoom*1.25);view.layout();};$('zoomOut').onclick=()=>{view.zoom=Math.max(.5,view.zoom/1.25);view.layout();};
$('depth').ontoggle=()=>{state.open.depth=$('depth').open;emit();};
$('preset').onchange=()=>{const p=catalog().find(p=>p.id===$('preset').value);if(p)mutate(()=>{state=applyPreset(state,p);if(state.skin.enabled)state.open.skin=true;});};
$('undo').onclick=()=>{if(!history.length)return;future.push(snapshot());state=normalize(JSON.parse(history.pop()));gesture=null;dirty();sync();};
$('redo').onclick=()=>{if(!future.length)return;history.push(snapshot());state=normalize(JSON.parse(future.pop()));gesture=null;dirty();sync();};
function releaseOriginal(){showOriginal=false;$('original').setAttribute('aria-pressed','false');draw();}
$('original').onpointerdown=e=>{if(!image)return;e.currentTarget.setPointerCapture(e.pointerId);showOriginal=true;e.currentTarget.setAttribute('aria-pressed','true');draw();};
for(const event of ['pointerup','pointercancel','lostpointercapture'])$('original').addEventListener(event,releaseOriginal);
$('original').onkeydown=e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();showOriginal=true;draw();}};$('original').onkeyup=releaseOriginal;
window.addEventListener('blur',releaseOriginal);
$('compare').onclick=()=>{split=!split;$('compare').setAttribute('aria-pressed',String(split));$('splitLabel').hidden=!split;draw();};$('split').oninput=draw;
function draw(){if(!originalPixels)return;gpu?.setPortrait(faces,faceRegions,draftStroke&&isWarp(draftStroke.mode)?strokeWarps(draftStroke,state.portrait):[]);
  if(mapsDirty||strokeSignature!==JSON.stringify(state.strokes))updateMaps();
  view.update({split:split&&!showOriginal&&!mask&&!depthView,divider:Number($('split').value)/100,focus:state.depth.focus,focusVisible:state.depth.enabled&&Boolean(depthData),tool});
  if(gpu){try{const previewState=draftStroke?.mode==='restore'?{...state,portrait:{...state.portrait,warps:restoreWarps(state.portrait.warps,draftStroke,originalPixels.width/originalPixels.height)}}:state;gpu.render(adaptiveState(previewState,colorStats),{original:showOriginal,mask,split,divider:Number($('split').value)/100,depthView,focus:sampleDepth(depthData,...state.depth.focus),hasSkin:!!skinData,hasDepth:!!depthData});}catch(e){fail(e);}return;}
  const canvas=$('preview'),ctx=canvas.getContext('2d');if(canvas.width!==originalPixels.width||canvas.height!==originalPixels.height){canvas.width=originalPixels.width;canvas.height=originalPixels.height;}ctx.putImageData(showOriginal?originalPixels:(resultPixels||originalPixels),0,0);if(split&&!showOriginal){const x=Math.round(canvas.width*Number($('split').value)/100);ctx.putImageData(originalPixels,0,0,0,0,x,canvas.height);}}
let jobId=0;
const jobs=new Map();
for(const worker of [previewWorker,outputWorker]){
  worker.onmessage=({data})=>{const job=jobs.get(data.id);if(!job)return;jobs.delete(data.id);data.error?job.reject(new Error(data.error)):job.resolve(data.pixels);};
  worker.onerror=()=>{for(const [id,job] of jobs)if(job.worker===worker){jobs.delete(id);job.reject(new Error('图像处理线程失败，请重新打开插件'));}};
}
function process(worker,pixels,current,viewMask=false){const id=++jobId,copy=pixels.slice();let skinMap=null;if(current.skin.mode==='ai'){const w=worker===previewWorker?originalPixels.width:image.naturalWidth,h=worker===previewWorker?originalPixels.height:image.naturalHeight;skinMap=new Uint8ClampedArray(w*h);if(mapImage){const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');const base=document.createElement('canvas');base.width=mapImage.width;base.height=mapImage.height;base.getContext('2d').putImageData(mapImage,0,0);ctx.drawImage(base,0,0,w,h);const data=ctx.getImageData(0,0,w,h).data;for(let i=0;i<skinMap.length;i++)skinMap[i]=data[i*4];}}return new Promise((resolve,reject)=>{jobs.set(id,{resolve,reject,worker});worker.postMessage({id,pixels:copy,state:current,mask:viewMask,skinMap},[copy.buffer,...(skinMap?[skinMap.buffer]:[])]);});}
function schedule(){if(previewTimer)return;previewTimer=requestAnimationFrame(()=>{previewTimer=null;void renderPreview();});}
async function renderPreview(){if(!originalPixels)return;if(mapsDirty)updateMaps();if(gpu){draw();return;}if(previewBusy){previewAgain=true;return;}previewBusy=true;const revision=version,base=originalPixels;try{const pixels=await process(previewWorker,base.data,adaptiveState(state,colorStats),mask);if(base===originalPixels){resultPixels=new ImageData(pixels,base.width,base.height);draw();}if(revision!==version)previewAgain=true;}catch(e){fail(e);}finally{previewBusy=false;if(previewAgain){previewAgain=false;schedule();}}}
async function load(next){
  if(next===source&&loadTask)return loadTask;if(next===source&&image)return;
  matchRevision++;faces=[];faceRegions=new ImageData(new Uint8ClampedArray(4),1,1);faceTask=null;faceReady=false;faceError='';portraitUI?.setFaces([]);view.cancelStroke();view.pointer=null;view.brush.hidden=true;const revision=++loadRevision;source=next;image=null;previewCanvas=null;originalPixels=null;resultPixels=null;history=[];future=[];gesture=null;skinData=null;depthData=null;skinTask=null;depthTask=null;analysisKey='';skinError='';depthError='';syncHistory();version++;$('empty').hidden=false;view.handle.hidden=true;view.focus.hidden=true;$('dimensions').textContent='—';
  if(!next){status('等待图片');return;}
  status('正在读取原图…');
  loadTask=(async()=>{
    let readable=next;
    if(!app&&/^hios-asset:/i.test(next))try{const result=await request('asset-read',{source:next});readable=result.dataUrl;}catch{/* Tauri asset URLs may also be directly readable. */}
    const pic=new Image();pic.crossOrigin='anonymous';
    await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{pic.src='';reject(new Error('图片读取超时'));},30000);pic.onload=()=>{clearTimeout(timeout);resolve();};pic.onerror=()=>{clearTimeout(timeout);reject(new Error('图片读取失败，请重新连接或选择 PNG/JPEG/WebP'));};pic.src=readable;});
    if(revision!==loadRevision)return;
    image=pic;const scale=Math.min(1,(gpu?1280:640)/Math.max(pic.naturalWidth,pic.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(pic.naturalWidth*scale));canvas.height=Math.max(1,Math.round(pic.naturalHeight*scale));const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(pic,0,0,canvas.width,canvas.height);originalPixels=ctx.getImageData(0,0,canvas.width,canvas.height);colorStats=analyzeColor(originalPixels.data);previewCanvas=canvas;gpu?.setSource(originalPixels);view.setImage(canvas.width,canvas.height);updateMaps();
    $('empty').hidden=true;$('dimensions').textContent=`${pic.naturalWidth} × ${pic.naturalHeight}`;status('预览就绪 · 输出待更新');draw();schedule();post('loaded',{ready:true});
    const key=await imageKey(originalPixels);if(revision!==loadRevision)return;analysisKey=key;if(state.analysisSource&&state.analysisSource!==key){state.strokes=[];state.portrait=portraitDefaults();state.match=defaults().match;referencePixels=null;portraitUI?.sync();state.depth.focus=[.5,.4];updateMaps();}state.analysisSource=key;emit();const cached=await readAnalysis(key);if(revision!==loadRevision)return;if(cached){skinData=cached.skin||null;depthData=cached.depth||null;updateMaps();draw();}void ensureAnalysis();void ensureFaces();
  })();
  try{await loadTask;}catch(e){if(revision===loadRevision){source='';image=null;fail(e);}throw e;}finally{if(revision===loadRevision)loadTask=null;}
}
async function hydrate(payload,fromRun=false){
  expanded=payload.view?.expanded===true;document.body.classList.toggle('wide',app||expanded);$('expand').hidden=app;$('expand').textContent=expanded?'返回画布':'放大编辑';$('export').hidden=!app;$('runHint').hidden=app;$('runHint').textContent=expanded?'返回画布后运行输出':'预览自动更新 · 点击节点运行按钮输出';
  $('replaceImage').hidden=!app&&Boolean(sourceFrom(payload.inputs?.image));
  const incoming=JSON.stringify(payload.state||{});
  if(!initialized){state=normalize(payload.state);mergePresets();initialized=true;sync();}
  else if(!fromRun&&!saveTimer&&gesture===null&&!echoes.has(incoming)&&payload.state&&JSON.stringify(normalize(payload.state))!==snapshot()) {state=normalize(payload.state);sync();version++;schedule();}
  const next=app?(sourceFrom(payload.file)||state.source):(sourceFrom(payload.inputs?.image)||sourceFrom(payload.file)||state.source);
  await load(next);
}
async function output(runId){
  if(matchTask)await matchTask;if(outputBusy)throw new Error('正在输出，请稍后重试');
  if(loadTask)await loadTask;if(!image)throw new Error('请先连接或打开一张图片');
  const pic=image,current=adaptiveState(state,colorStats),revision=version,currentSource=source;outputBusy=true;$('editor').inert=true;syncHistory();status('正在生成全尺寸图片…');
  try{
    // Limit peak memory instead of silently downscaling the final output.
    if(pic.naturalWidth*pic.naturalHeight>24000000)throw new Error('本版支持最多 2400 万像素，请先缩小原图');
    await ensureFaces(true);await ensureAnalysis(true);if(current.match.enabled&&!gpu)throw new Error('参考图追色需要 WebGL2');if(current.match.enabled&&!current.match.reference)throw new Error('请先选择有效参考图');if(current.portrait.enabled&&!gpu)throw new Error('人像精修需要 WebGL2，请启用硬件加速');if(current.portrait.enabled&&faceError)throw new Error(faceError);if(current.match.enabled&&current.match.skinOnly&&!skinData)throw new Error(skinError||'皮肤匹配尚未完成');if(current.portrait.enabled&&!skinData)throw new Error(skinError||'人像皮肤识别尚未完成');if(current.skin.enabled&&current.skin.mode==='ai'&&!skinData)throw new Error(skinError||'皮肤识别尚未完成');if(current.depth.enabled&&!depthData)throw new Error(depthError||'深度分析尚未完成');
    const canvas=document.createElement('canvas');let renderer;
    let blob;
    try{if(gpu){renderer=new GpuRenderer(canvas);renderer.setSource(pic);renderer.setMaps(mapImage);renderer.setPortrait(faces,faceRegions);renderer.render(current,{hasSkin:!!skinData,hasDepth:!!depthData,focus:sampleDepth(depthData,...current.depth.focus)});}
    else{if(current.depth.enabled)throw new Error('景深需要 WebGL2，请启用硬件加速');canvas.width=pic.naturalWidth;canvas.height=pic.naturalHeight;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(pic,0,0);const raw=ctx.getImageData(0,0,canvas.width,canvas.height);const pixels=await process(outputWorker,raw.data,current);ctx.putImageData(new ImageData(pixels,canvas.width,canvas.height),0,0);}
    blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));}finally{renderer?.destroy();}if(!blob)throw new Error('PNG 编码失败');
    if(blob.size>64*1024*1024)throw new Error('输出超过 64 MB，请缩小原图');
    if(revision!==version||currentSource!==source)throw new Error('输入或参数已变更，请重新运行');
    let result;
    if(parent!==window){const stored=await request('file-store',{key:crypto.randomUUID(),name:'调色结果.png',mime:'image/png',bytes:new Uint8Array(await blob.arrayBuffer())});result=stored.result?.url;if(!result)throw new Error('宿主未返回图片地址');}
    else{result=await dataUrl(blob);download(blob,'调色结果.png');}
    if(revision!==version||currentSource!==source)throw new Error('输入或参数已变更，请重新运行');
    // The image port alone does not materialize a visible canvas image node.
    // Use the host's standard publication flag; app output keeps its own flow.
    post('output',{runId,output:{kind:'image',portId:'image',source:result,width:canvas.width,height:canvas.height,mime:'image/png',name:'调色结果.png',metadata:{engineVersion:1,preset:current.preset,addToCanvas:!app}}});status(app?'图片已提交宿主':'图片已提交画布 · 结果在节点右侧');
  }finally{outputBusy=false;$('editor').inert=false;syncHistory();}
}
window.addEventListener('message',async event=>{
  const m=event.data;if(event.source!==parent||!m||m.protocol!==protocol||m.pluginId&&m.pluginId!==pluginId)return;
  const id=String(app?m.appId||'':m.nodeId||'');if(origin!==null&&(event.origin!==origin||id!==identity))return;
  if(origin===null){if(m.type!=='init')return;origin=event.origin;identity=id;}
  const p=m.payload||{};
  if(m.type.endsWith('-result')){const task=pending.get(p.requestId);if(task){pending.delete(p.requestId);clearTimeout(task.timer);p.error?task.reject(new Error(p.error)):task.resolve(p);}return;}
  try{if(m.type==='init')await hydrate(p);if(m.type==='run'){await hydrate(p,true);emit();await output(p.runId);}}
  catch(e){fail(e);post('error',{message:errorText(e),runId:p.runId});}
});
$('expand').onclick=()=>{emit();post(expanded?'view-close':'view-open');};
$('export').onclick=()=>output().catch(fail);
const dataUrl=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('文件读取失败'));reader.readAsDataURL(blob);});
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
$('openImage').onclick=()=>{$('imageFile').value='';$('imageFile').click();};
$('replaceImage').onclick=()=>$('openImage').click();
$('imageFile').onchange=async()=>{const file=$('imageFile').files[0];if(!file)return;try{if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>64*1024*1024)throw new Error('请选择 64 MB 内的 PNG、JPEG 或 WebP');let url;if(parent!==window){const stored=await request('file-store',{key:crypto.randomUUID(),name:file.name,mime:file.type,bytes:new Uint8Array(await file.arrayBuffer()),purpose:'draft'});url=stored.result?.url;if(!url)throw new Error('无法保存原图');}else url=await dataUrl(file);state.source=url;emit();await load(url);}catch(e){fail(e);}};
$('savePreset').onclick=()=>{$('presetName').value='';$('presetDialog').returnValue='';$('presetDialog').showModal();};
$('presetDialog').addEventListener('close',()=>{if($('presetDialog').returnValue!=='save')return;const name=$('presetName').value.trim();if(!name)return;mutate(()=>{const p={id:`user-${crypto.randomUUID()}`,name,settings:settings(state)};state.customPresets.push(p);state.customPresets=state.customPresets.slice(-40);state.preset=p.id;state.modified=false;});saveLibrary();});
function library(){const list=$('customList');list.replaceChildren();if(!state.customPresets.length)list.textContent='还没有自定义预设。';for(const p of state.customPresets){const row=document.createElement('div');row.className='row';const name=document.createElement('span');name.textContent=p.name;const del=document.createElement('button');del.textContent='删除';del.onclick=()=>{state.customPresets=state.customPresets.filter(x=>x.id!==p.id);if(state.preset===p.id){state.preset='original';state.modified=true;}saveLibrary();emit();updatePresets();library();};row.append(name,del);list.append(row);}}
$('presetLibrary').onclick=()=>{mergePresets();library();saveLibrary();$('library').showModal();};$('closeLibrary').onclick=()=>$('library').close();
$('exportPresets').onclick=()=>download(new Blob([JSON.stringify({version:1,presets:state.customPresets},null,2)],{type:'application/json'}),'HIOS-调色预设.json');
$('importPresets').onclick=()=>{$('presetFile').value='';$('presetFile').click();};
$('presetFile').onchange=async()=>{const file=$('presetFile').files[0];if(!file)return;try{if(file.size>200000)throw new Error('预设文件过大');const raw=JSON.parse(await file.text());if(raw.version!==1||!Array.isArray(raw.presets))throw new Error('不是有效的调色预设文件');const list=normalize({customPresets:raw.presets}).customPresets;state.customPresets=[...state.customPresets,...list.map(p=>({...p,id:`user-${crypto.randomUUID()}`}))].slice(-40);saveLibrary();emit();updatePresets();library();}catch(e){fail(e);}};
window.addEventListener('keydown',e=>{if(e.key==='Escape'){mask=false;depthView=false;setTool('none');releaseOriginal();$('mask').setAttribute('aria-pressed','false');schedule();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!['INPUT','TEXTAREA'].includes(e.target.tagName)){e.preventDefault();$(e.shiftKey?'redo':'undo').click();}});
window.addEventListener('beforeunload',()=>{if(initialized)emit();previewWorker.terminate();outputWorker.terminate();});
if(parent===window){initialized=true;mergePresets();document.body.classList.toggle('wide',app);$('expand').hidden=true;$('export').hidden=false;$('runHint').hidden=true;}
if(app)$('empty').querySelector('p').textContent='打开 PNG、JPEG 或 WebP，原图不会被覆盖';
for(const select of [$('preset'),$('skinMode')])selectControls.push(themedSelect(select));
document.querySelector('header strong').textContent='调色 · v0.3.0';
sync();post('ready',{version:'0.2.2'});


