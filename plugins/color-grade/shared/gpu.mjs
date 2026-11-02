import {matchGLSL,matchUniforms} from './match.mjs';
import {portraitGLSL,portraitUniforms} from './portrait-gpu.mjs';
import {warpControls} from './portrait-state.mjs';
// Two-pass WebGL2 renderer shared by preview and export. Source/masks upload only on change.
const vertex=`#version 300 es
in vec2 p;out vec2 uv;void main(){uv=vec2((p.x+1.)*.5,(1.-p.y)*.5);gl_Position=vec4(p,0,1);}`;
const common=`precision highp float;in vec2 uv;out vec4 frag;uniform sampler2D src;uniform sampler2D maps;
${portraitGLSL}
float hue(vec3 c){float hi=max(c.r,max(c.g,c.b)),lo=min(c.r,min(c.g,c.b)),d=hi-lo;if(d<.0000001)return 0.;float h=hi==c.r?(c.g-c.b)/d:hi==c.g?(c.b-c.r)/d+2.:(c.r-c.g)/d+4.;return mod(h*60.+360.,360.);}
float rangeSkin(vec3 c){float hi=max(c.r,max(c.g,c.b)),lo=min(c.r,min(c.g,c.b)),s=(hi-lo)/max(hi,.000001),h=hue(c);return smoothstep(0.,10.,h)*(1.-smoothstep(42.,58.,h))*smoothstep(.05,.16,s)*(1.-smoothstep(.65,.9,s))*smoothstep(.08,.25,hi)*(1.-smoothstep(.92,1.,lo));}
vec3 lin(vec3 v){return mix(v/12.92,pow((v+.055)/1.055,vec3(2.4)),step(vec3(.04045),v));}
vec3 srgb(vec3 v){return mix(v*12.92,1.055*pow(max(v,vec3(0)),vec3(1./2.4))-.055,step(vec3(.0031308),v));}
float hw(float h,float center){float d=abs(h-center);return 1.-smoothstep(0.,40.,min(d,360.-d));}`;
const grade=`#version 300 es
${common}
${matchGLSL}
uniform vec4 basic;uniform vec4 tone;uniform vec4 skin;uniform vec4 color;uniform vec4 selective;uniform float blue;uniform float blood;uniform float amount;uniform int skinMode;
void main(){vec2 q=warped(uv);vec4 original=texture(src,uv);vec3 c=portraitAt(q).rgb;float w=skinMode==1?texture(maps,q).r:skinMode==2?0.:rangeSkin(c);
if(tone.z>0.){c=srgb(lin(c)*exp2(basic.x));c*=vec3(1.+basic.y*.0015+basic.z*.0005,1.-basic.z*.001,1.-basic.y*.0015+basic.z*.0005);float y=clamp(dot(c,vec3(.2126,.7152,.0722)),0.,1.);float delta=tone.y*.002*pow(1.-y,3.)+tone.x*.002*pow(y,3.);c=(c+delta-.5)*(1.+basic.w*.006)+.5;}
if(tone.w>0.){float a=w*(1.-blood*.01*(1.-smoothstep(8.,24.,hue(original.rgb))));float l=skin.z*.0015;c+=a*(l*(1.-clamp(c,0.,1.))+vec3(-skin.y*.001-skin.w*.0005,0,skin.x*.0012+skin.w*.0007));}
if(color.z>0.){float y=dot(c,vec3(.2126,.7152,.0722)),hi=max(c.r,max(c.g,c.b)),lo=min(c.r,min(c.g,c.b)),s=clamp((hi-lo)/max(hi,.000001),0.,1.),h=hue(c);float sel=selective.x*hw(h,0.)+selective.y*hw(h,30.)+selective.z*hw(h,60.)+selective.w*hw(h,120.)+blue*hw(h,240.);c=y+(c-y)*max(0.,1.+color.x*.01+color.y*.01*(1.-s)+sel*.01);}
c=matched(c,texture(maps,q).r);frag=vec4(mix(original.rgb,clamp(c,0.,1.),amount),texture(src,q).a);}`;
const compose=`#version 300 es
${common}
uniform sampler2D graded;uniform vec2 size;uniform vec4 depth;uniform vec4 view;uniform vec4 options;uniform float skinMode;
// Graded framebuffer is vertically inverted relative to an uploaded image.
vec4 gradeAt(vec2 p){return texture(graded,vec2(p.x,1.-p.y));}
void main(){vec4 original=texture(src,uv),base=gradeAt(uv);vec4 m=texture(maps,warped(uv));
if(view.x>0.){frag=original;return;}
if(view.y>0.){float w=skinMode==1.?m.r:skinMode==2.?0.:rangeSkin(original.rgb);frag=vec4(mix(original.rgb,vec3(1.,0.,.7),w*.65),original.a);return;}
if(options.w>0.){frag=vec4(vec3(m.b),1);return;}
if(depth.w>0.){float diff=m.b-depth.x;float coc=max(0.,abs(diff)-depth.y)*depth.z;if(options.x<.5&&diff>0.)coc=0.;if(options.y>.5&&m.g>.5&&abs(diff)<depth.y+.06)coc=0.;
 if(coc>.25){vec4 total=vec4(lin(base.rgb)*base.a,base.a);float weights=1.;for(int i=0;i<48;i++){float fi=float(i)+.5,angle=fi*2.39996323;vec2 offset=vec2(cos(angle),sin(angle))*sqrt(fi/48.)*coc/size;vec2 p=clamp(uv+offset,vec2(0),vec2(1));vec4 neighbor=texture(maps,warped(p));float reject=1.-smoothstep(.02,.12,neighbor.b-m.b);if(options.y>.5)reject*=1.-smoothstep(.12,.5,abs(neighbor.g-m.g));vec4 sampleColor=gradeAt(p);total+=vec4(lin(sampleColor.rgb)*sampleColor.a,sampleColor.a)*reject;weights+=reject;}
 base=vec4(srgb(total.rgb/max(total.a,.000001)),total.a/weights);}}
if(view.z>0.&&uv.x<view.w)base=original;frag=base;}`;
export class GpuRenderer {
  constructor(canvas){this.canvas=canvas;const gl=this.gl=canvas.getContext('webgl2',{alpha:true,premultipliedAlpha:false,preserveDrawingBuffer:true,antialias:false});if(!gl)throw new Error('当前设备不支持 WebGL2');
    this.programs=[grade,compose].map(fragment=>{const program=gl.createProgram();for(const [type,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader));gl.attachShader(program,shader);gl.deleteShader(shader);}gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));return program;});
    const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);this.buffer=buffer;
    this.textures=[0,1,2,3].map(()=>{const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t;});this.fbo=gl.createFramebuffer();this.mapSource=null;this.faces=[];this.draftWarps=[];
    this.setPortrait([],new ImageData(new Uint8ClampedArray(4),1,1));this.setMaps(new ImageData(new Uint8ClampedArray([0,0,128,255]),1,1));
  }
  setSource(image){const gl=this.gl,w=image.width||image.naturalWidth,h=image.height||image.naturalHeight;if(Math.max(w,h)>gl.getParameter(gl.MAX_TEXTURE_SIZE))throw new Error('图片尺寸超过显卡纹理上限，请先缩小图片');this.canvas.width=w;this.canvas.height=h;gl.viewport(0,0,w,h);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.textures[0]);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,this.textures[2]);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);gl.bindFramebuffer(gl.FRAMEBUFFER,this.fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,this.textures[2],0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('显卡帧缓冲创建失败');gl.bindFramebuffer(gl.FRAMEBUFFER,null);}
  setMaps(image){if(this.mapSource===image)return;this.mapSource=image;const gl=this.gl;gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.textures[1]);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);}
  setPortrait(faces,regions,draft=[]){this.faces=faces;this.draftWarps=draft;if(regions&&regions!==this.regionSource){this.regionSource=regions;const gl=this.gl;gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,this.textures[3]);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,regions);}}
  use(index){const gl=this.gl,p=this.programs[index];gl.useProgram(p);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);const loc=gl.getAttribLocation(p,'p');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);for(const [name,n] of [['src',0],['maps',1],['graded',2]])gl.uniform1i(gl.getUniformLocation(p,name),n);return p;}
  uniform(p,name,...v){const gl=this.gl;gl[`uniform${v.length}f`](gl.getUniformLocation(p,name),...v);}
  render(s,{original=false,mask=false,split=false,divider=.5,depthView=false,focus=.5,hasSkin=false,hasDepth=false}={}){
    const controls=warpControls(s.portrait||{enabled:false},this.faces,this.canvas.width,this.canvas.height,this.draftWarps).map(v=>v.map((x,i)=>i===2||i===3||i===5?x*s.intensity/100:x));const gl=this.gl;if(gl.isContextLost())throw new Error('显卡上下文已丢失，请重新打开节点');const b=s.basic,k=s.skin,c=s.color,z=s.depth,skinMode=k.mode==='range'?0:hasSkin?1:2;
    gl.bindFramebuffer(gl.FRAMEBUFFER,this.fbo);let p=this.use(0);portraitUniforms(this,p,s,controls);matchUniforms(this,p,s.match);this.uniform(p,'basic',b.exposure,b.temperature,b.tint,b.contrast);this.uniform(p,'tone',b.highlights,b.shadows,+b.enabled,+k.enabled);this.uniform(p,'skin',k.yellow,k.red,k.light,k.cool);this.uniform(p,'blood',k.blood);this.uniform(p,'color',c.saturation,c.vibrance,+c.enabled,0);this.uniform(p,'selective',c.reds,c.oranges,c.yellows,c.greens);this.uniform(p,'blue',c.blues);this.uniform(p,'amount',s.intensity/100);gl.uniform1i(gl.getUniformLocation(p,'skinMode'),skinMode);gl.drawArrays(gl.TRIANGLES,0,6);
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);p=this.use(1);portraitUniforms(this,p,s,controls);this.uniform(p,'size',this.canvas.width,this.canvas.height);this.uniform(p,'view',+original,+mask,+split,divider);this.uniform(p,'options',+z.foreground,+z.protect,0,+(depthView&&hasDepth));this.uniform(p,'skinMode',skinMode);
    this.uniform(p,'depth',focus,z.range/100,Math.min(this.canvas.width,this.canvas.height)*.075*(1.4/z.aperture)*z.strength/50,+(z.enabled&&hasDepth));gl.drawArrays(gl.TRIANGLES,0,6);
  }
  destroy(){const gl=this.gl;for(const p of this.programs)gl.deleteProgram(p);for(const t of this.textures)gl.deleteTexture(t);gl.deleteBuffer(this.buffer);gl.deleteFramebuffer(this.fbo);gl.getExtension('WEBGL_lose_context')?.loseContext();}
}
