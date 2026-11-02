export const portraitGLSL=`
uniform vec2 portraitSize;
uniform sampler2D faceRegions;
uniform int warpCount;
uniform vec4 warpA[64];
uniform vec2 warpB[64];
uniform vec4 faceA[4];
uniform vec4 faceB[4];
uniform vec3 lipColors[4];
uniform vec3 skinColors[4];
uniform float portraitOn;
vec2 warped(vec2 p){vec2 d=vec2(0);float aspect=portraitSize.y/portraitSize.x;for(int i=0;i<64;i++){if(i>=warpCount)break;vec4 a=warpA[i];vec2 b=warpB[i];vec2 delta=p-a.xy;float distance=length(delta*vec2(1,aspect));float k=pow(max(0.,1.-distance/max(b.x,.00001)),2.);d+=a.zw*k+delta*b.y*k;}return clamp(p-d,vec2(0),vec2(1));}
vec3 colorize(vec3 c,vec3 target,float a){float y=dot(c,vec3(.2126,.7152,.0722));vec3 t=target*(y/max(.08,dot(target,vec3(.2126,.7152,.0722))));return mix(c,clamp(t,0.,1.),a);}
vec4 portraitAt(vec2 p){vec4 raw=texture(src,p);if(portraitOn<.5)return raw;vec4 regions=texture(faceRegions,p);int id=clamp(int(floor(regions.a*4.+.5))-1,0,3);if(regions.a<.12)return raw;vec4 a=faceA[id],b=faceB[id];float skinWeight=regions.r*texture(maps,p).r;vec3 c=raw.rgb;
if(skinWeight>.001&&(a.x>0.||a.z>0.)){vec3 sum=c;float total=1.;float radius=min(portraitSize.x,portraitSize.y)*.005;for(int i=0;i<12;i++){float angle=float(i)*2.399963;vec2 o=vec2(cos(angle),sin(angle))*radius*(i<6?.45:1.)/portraitSize;vec2 q=clamp(p+o,vec2(0),vec2(1));vec3 n=texture(src,q).rgb;float w=exp(-dot(n-c,n-c)/.012)*texture(faceRegions,q).r*texture(maps,q).r;sum+=n*w;total+=w;}vec3 soft=sum/total;c=mix(c,soft,a.x*(1.-a.y*.85)*skinWeight);float y=dot(c,vec3(.2126,.7152,.0722)),sy=dot(soft,vec3(.2126,.7152,.0722));c=mix(c,soft+(y-sy),a.z*skinWeight*.65);}
c+=a.w*skinWeight*(1.-c)*.18;c=colorize(c,skinColors[id],b.y*skinWeight*.65);c=colorize(c,lipColors[id],b.x*regions.g*.8);
float y=dot(c,vec3(.2126,.7152,.0722));float tooth=regions.b*smoothstep(.35,.7,y)*(1.-smoothstep(.18,.5,max(c.r,max(c.g,c.b))-min(c.r,min(c.g,c.b))));c=mix(c,mix(c,vec3(y),.7)+(1.-c)*.15,b.z*tooth);return vec4(clamp(c,0.,1.),raw.a);}
`;
export function portraitUniforms(renderer,program,state,controls){const gl=renderer.gl,p=state.portrait;renderer.uniform(program,'portraitSize',renderer.canvas.width,renderer.canvas.height);renderer.uniform(program,'portraitOn',+(!!p?.enabled));gl.uniform1i(gl.getUniformLocation(program,'faceRegions'),3);gl.uniform1i(gl.getUniformLocation(program,'warpCount'),controls.length);const a=new Float32Array(256),b=new Float32Array(128);controls.forEach((v,i)=>{a.set(v.slice(0,4),i*4);b.set(v.slice(4),i*2);});gl.uniform4fv(gl.getUniformLocation(program,'warpA[0]'),a);gl.uniform2fv(gl.getUniformLocation(program,'warpB[0]'),b);const fa=[],fb=[],lc=[],sc=[];const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);for(const f of p?.faces||[]){fa.push(f.skinEnabled?f.smooth/100:0,f.texture/100,f.skinEnabled?f.even/100:0,f.skinEnabled?f.light/100:0);fb.push(f.colorEnabled?f.lip/100:0,f.colorEnabled?f.tint/100:0,f.colorEnabled?f.teeth/100:0,0);lc.push(...rgb(f.lipColor));sc.push(...rgb(f.skinColor));}if(fa.length){gl.uniform4fv(gl.getUniformLocation(program,'faceA[0]'),fa);gl.uniform4fv(gl.getUniformLocation(program,'faceB[0]'),fb);gl.uniform3fv(gl.getUniformLocation(program,'lipColors[0]'),lc);gl.uniform3fv(gl.getUniformLocation(program,'skinColors[0]'),sc);}}
