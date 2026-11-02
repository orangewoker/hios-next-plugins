// Pure, deterministic sRGB engine. Never modifies the source buffer.
export const SCHEMA = 2;
export const FIELDS = {
  basic: [['exposure','曝光',-2,2,.05],['temperature','色温',-100,100,1],['tint','色调',-100,100,1],['contrast','对比度',-100,100,1],['highlights','高光',-100,100,1],['shadows','阴影',-100,100,1]],
  skin: [['yellow','去黄',0,100,1],['red','去红',0,100,1],['light','提亮',0,100,1],['cool','冷白',0,100,1],['blood','保留血色',0,100,1]],
  color: [['saturation','饱和度',-100,100,1],['vibrance','自然饱和度',-100,100,1],['reds','红色饱和度',-100,100,1],['oranges','橙色饱和度',-100,100,1],['yellows','黄色饱和度',-100,100,1],['greens','绿色饱和度',-100,100,1],['blues','蓝色饱和度',-100,100,1]]
};
export function defaults() {
  return {version:SCHEMA, intensity:100, preset:'original', modified:false,
    basic:{enabled:true,exposure:0,temperature:0,tint:0,contrast:0,highlights:0,shadows:0},
    skin:{enabled:false,mode:'ai',yellow:0,red:0,light:0,cool:0,blood:70},
    color:{enabled:true,saturation:0,vibrance:0,reds:0,oranges:0,yellows:0,greens:0,blues:0},
    depth:{enabled:false,aperture:2.8,strength:50,range:12,foreground:true,protect:true,focus:[.5,.4]},
    strokes:[],analysisSource:'',adaptive:false,
    open:{basic:true,skin:false,color:false,depth:false},customPresets:[],source:''};
}
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const num=(v,fallback,a,b)=>Number.isFinite(v)?clamp(v,a,b):fallback;
export function normalize(raw={}) {
  const d=defaults();
  if (!raw || typeof raw!=='object') return d;
  d.intensity=num(raw.intensity,100,0,100);
  d.preset=typeof raw.preset==='string'?raw.preset.slice(0,80):'original';
  d.modified=raw.modified===true;
  d.source=typeof raw.source==='string'?raw.source:'';
  d.analysisSource=typeof raw.analysisSource==='string'?raw.analysisSource.slice(0,100):'';
  d.adaptive=raw.adaptive===true;
  d.skin.mode=raw.skin?.mode==='range'?'range':'ai';
  const z=raw.depth||{};
  for(const k of ['enabled','foreground','protect'])if(typeof z[k]==='boolean')d.depth[k]=z[k];
  d.depth.aperture=num(z.aperture,2.8,1.4,16);d.depth.strength=num(z.strength,50,0,100);d.depth.range=num(z.range,12,0,50);
  if(Array.isArray(z.focus)&&z.focus.length===2)d.depth.focus=z.focus.map(v=>num(v,.5,0,1));
  if(Array.isArray(raw.strokes))d.strokes=raw.strokes.slice(-40).map(s=>({mode:s.mode==='subtract'?'subtract':'add',radius:num(s.radius,.025,.002,.2),points:Array.isArray(s.points)?s.points.slice(0,64).filter(p=>Array.isArray(p)&&p.length===2).map(p=>p.map(v=>Math.round(num(v,0,0,1)*10000)/10000)):[]}));
  for(const [group,fields] of Object.entries(FIELDS)) {
    const v=raw[group]||{};
    if(typeof v.enabled==='boolean')d[group].enabled=v.enabled;
    for(const [key,,min,max] of fields)d[group][key]=num(v[key],d[group][key],min,max);
  }
  for(const key of Object.keys(d.open))if(typeof raw.open?.[key]==='boolean')d.open[key]=raw.open[key];
  // Small, bounded presets only; no arbitrary nested content or image data in the catalog.
  if(Array.isArray(raw.customPresets))d.customPresets=raw.customPresets.slice(0,40).filter(p=>p&&typeof p.name==='string'&&p.settings).map(p=>({id:String(p.id||'custom').slice(0,80),name:p.name.slice(0,40),settings:settings(p.settings)}));
  return d;
}
export function settings(raw) {
  const s=normalize({...raw,customPresets:[]});
  return {basic:s.basic,skin:s.skin,color:s.color,intensity:s.intensity,adaptive:s.adaptive};
}
export const PRESETS = [
  {id:'original',name:'原图 / 重置调色',category:'基础',settings:{}},
  {id:'warm-clean',name:'保暖净肤',category:'人像',settings:{skin:{enabled:true,yellow:32,red:10,light:12,cool:10,blood:80},color:{saturation:-5,blues:-10}}},
  {id:'cool-skin',name:'清透冷白',category:'人像',settings:{skin:{enabled:true,yellow:42,red:14,light:22,cool:25,blood:80},color:{saturation:-4}}},
  {id:'natural-skin',name:'自然肤色',category:'人像',settings:{skin:{enabled:true,yellow:18,red:12,light:5,blood:85}}},
  {id:'de-warm',name:'去暖黄',category:'纠偏',settings:{basic:{temperature:-22},color:{yellows:-8}}},
  {id:'de-red',name:'去红偏',category:'纠偏',settings:{basic:{temperature:-6,tint:-12},color:{reds:-16,oranges:-6}}},
  {id:'de-gray',name:'去灰提层次',category:'纠偏',settings:{basic:{contrast:16,shadows:-8},color:{vibrance:12}}},
  {id:'de-vivid',name:'过艳收敛',category:'纠偏',settings:{color:{saturation:-18,vibrance:-12}}},
  {id:'neutral',name:'自然中性',category:'风景建筑',settings:{basic:{temperature:-9,contrast:5},color:{saturation:-6}}},
  {id:'green',name:'植被自然',category:'风景建筑',settings:{color:{greens:-18,yellows:-10,vibrance:-5}}}
];
export function applyPreset(state,preset) {
  const s=normalize(state),p=settings(preset.settings);
  return {...s,...p,preset:preset.id,modified:false};
}
export function sourceFrom(v) {
  if(Array.isArray(v))return sourceFrom(v[0]);
  if(typeof v==='string')return v.trim();
  if(v&&typeof v==='object')return sourceFrom(v.source||v.dataUrl||v.url||v.value||'');
  return '';
}
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
export function hue(r,g,b) {
  const hi=Math.max(r,g,b),lo=Math.min(r,g,b),d=hi-lo;
  if(d<1e-7)return 0;
  return (((hi===r?(g-b)/d:hi===g?(b-r)/d+2:(r-g)/d+4)*60)%360+360)%360;
}
// Color-range estimate, NOT semantic skin segmentation. UI explicitly names this limitation.
export function skinWeight(r,g,b) {
  const hi=Math.max(r,g,b),lo=Math.min(r,g,b),sat=(hi-lo)/(hi||1),h=hue(r,g,b);
  return smooth(0,10,h)*(1-smooth(42,58,h))*smooth(.05,.16,sat)*(1-smooth(.65,.9,sat))*smooth(.08,.25,hi)*(1-smooth(.92,1,lo));
}
function linear(v){return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}
function srgb(v){return v<=.0031308?12.92*v:1.055*v**(1/2.4)-.055;}
// Conservative neutral-candidate statistics. Warm sunsets are not assumed to be mistakes.
export function analyzeColor(input){
  let count=0,r=0,g=0,b=0,saturation=0,total=0;const levels=[];
  for(let i=0;i<input.length;i+=64){if(input[i+3]<240)continue;const rgb=[input[i]/255,input[i+1]/255,input[i+2]/255],hi=Math.max(...rgb),lo=Math.min(...rgb),y=rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722,s=(hi-lo)/(hi||1);total++;saturation+=s;levels.push(y);if(y>.18&&y<.88&&s<.17){count++;r+=rgb[0];g+=rgb[1];b+=rgb[2];}}
  levels.sort((a,b)=>a-b);return {neutral:count>Math.max(20,total*.015),temperature:count?clamp((b-r)/count*500,-30,30):0,tint:count?clamp((g-(r+b)/2)/count*500,-20,20):0,saturation:total?saturation/total:0,spread:levels.length?levels[Math.floor(levels.length*.95)]-levels[Math.floor(levels.length*.05)]:1};
}
export function adaptiveState(raw,stats){const s=normalize(raw);if(!s.adaptive||!stats)return s;
  if(s.basic.enabled&&stats.neutral){s.basic.temperature=clamp(s.basic.temperature+stats.temperature,-100,100);s.basic.tint=clamp(s.basic.tint+stats.tint,-100,100);}
  if(s.basic.enabled&&stats.spread<.55)s.basic.contrast=clamp(s.basic.contrast+Math.min(12,(.55-stats.spread)*40),-100,100);
  if(s.color.enabled&&stats.saturation>.5)s.color.saturation=clamp(s.color.saturation-Math.min(15,(stats.saturation-.5)*50),-100,100);
  return s;
}
export function transform(input,raw,{mask=false,skinMap=null}={}) {
  const s=normalize(raw),out=new Uint8ClampedArray(input.length),b=s.basic,k=s.skin,c=s.color,amount=s.intensity/100;
  const exposure=2**b.exposure;
  const lut=Array.from({length:256},(_,i)=>srgb(linear(i/255)*exposure));
  for(let i=0;i<input.length;i+=4){
    const r0=input[i]/255,g0=input[i+1]/255,b0=input[i+2]/255,w=skinMap?skinMap[i/4]/255:skinWeight(r0,g0,b0);
    let r=r0,g=g0,bl=b0;
    if(mask){out[i]=255*w+r0*255*(1-w);out[i+1]=g0*255*(1-w);out[i+2]=180*w+b0*255*(1-w);out[i+3]=input[i+3];continue;}
    if(b.enabled){
      r=lut[input[i]];g=lut[input[i+1]];bl=lut[input[i+2]];
      r*=1+b.temperature*.0015+b.tint*.0005;g*=1-b.tint*.001;bl*=1-b.temperature*.0015+b.tint*.0005;
      const y=clamp(.2126*r+.7152*g+.0722*bl),delta=b.shadows*.002*(1-y)**3+b.highlights*.002*y**3;
      const contrast=1+b.contrast*.006;
      r=(r+delta-.5)*contrast+.5;g=(g+delta-.5)*contrast+.5;bl=(bl+delta-.5)*contrast+.5;
    }
    if(k.enabled&&w>0){
      const blood=1-k.blood/100*(1-smooth(8,24,hue(r0,g0,b0)));
      const strength=w*blood,light=k.light*.0015;
      r+=strength*(light*(1-clamp(r))-k.red*.001-k.cool*.0005);
      g+=strength*light*(1-clamp(g));
      bl+=strength*(light*(1-clamp(bl))+k.yellow*.0012+k.cool*.0007);
    }
    if(c.enabled){
      const y=.2126*r+.7152*g+.0722*bl,hi=Math.max(r,g,bl),lo=Math.min(r,g,bl),sat=clamp((hi-lo)/(hi||1)),h=hue(r,g,bl);
      let selective=0;
      for(const [center,value] of [[0,c.reds],[30,c.oranges],[60,c.yellows],[120,c.greens],[240,c.blues]]){
        const d=Math.min(Math.abs(h-center),360-Math.abs(h-center));selective+=value*(1-smooth(0,40,d));
      }
      const factor=Math.max(0,1+c.saturation/100+c.vibrance/100*(1-sat)+selective/100);
      r=y+(r-y)*factor;g=y+(g-y)*factor;bl=y+(bl-y)*factor;
    }
    out[i]=(r0+(clamp(r)-r0)*amount)*255;out[i+1]=(g0+(clamp(g)-g0)*amount)*255;out[i+2]=(b0+(clamp(bl)-b0)*amount)*255;out[i+3]=input[i+3];
  }
  return out;
}
