// All positions are image-normalized, independent of canvas zoom / iframe supersampling.
export class ImageView {
  constructor(canvas,{onSplit,onFocus,onStroke,onStrokePreview=()=>{},onSample}){
    this.canvas=canvas;this.stage=canvas.parentElement;this.onSplit=onSplit;this.onFocus=onFocus;this.onStroke=onStroke;this.onSample=onSample;this.zoom=1;this.tool='none';this.radius=.03;this.pan=[0,0];
    this.overlay=document.createElement('div');this.overlay.className='image-overlay';this.stage.append(this.overlay);
    this.handle=document.createElement('button');this.handle.className='compare-handle';this.handle.setAttribute('aria-label','拖动原图对比分界');this.handle.setAttribute('role','slider');this.handle.setAttribute('aria-valuemin','0');this.handle.setAttribute('aria-valuemax','100');this.handle.innerHTML='<span>↔</span>';this.handle.hidden=true;
    this.focus=document.createElement('div');this.focus.className='focus-marker';this.focus.hidden=true;this.overlay.append(this.handle,this.focus);
    this.brush=document.createElement('div');this.brush.className='brush-cursor';this.brush.hidden=true;this.overlay.append(this.brush);this.onStrokePreview=onStrokePreview;
    this.handle.onpointerdown=e=>{e.preventDefault();e.stopPropagation();this.handle.setPointerCapture(e.pointerId);this.dragging=true;};
    this.handle.onpointermove=e=>{if(!this.dragging)return;this.onSplit(this.point(e)[0]);};
    const stop=()=>{this.dragging=false;};this.handle.onpointerup=stop;this.handle.onpointercancel=stop;this.handle.onlostpointercapture=stop;
    this.handle.onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();this.onSplit(e.key==='Home'?0:e.key==='End'?1:this.divider+(e.key==='ArrowLeft'?-.01:.01));}};
    canvas.onpointerdown=e=>{if(!this.width)return;if(this.tool==='none'&&this.zoom<=1)return;e.preventDefault();canvas.setPointerCapture(e.pointerId);this.moveBrush(e);if(this.tool==='none'){this.panStart=[e.clientX,e.clientY,...this.pan];return;}const point=this.point(e);if(this.tool==='focus'){onFocus(point);return;}if(this.tool==='sample'){onSample(point);return;}this.stroke={mode:this.tool,radius:this.radius,points:[point]};onStrokePreview(this.stroke);};
    canvas.onpointermove=e=>{this.moveBrush(e);if(this.panStart){const ratio=this.stage.clientWidth/this.stage.getBoundingClientRect().width;this.pan=[this.panStart[2]+(e.clientX-this.panStart[0])*ratio,this.panStart[3]+(e.clientY-this.panStart[1])*ratio];this.layout();}if(this.stroke){const p=this.point(e),last=this.stroke.points.at(-1);if(Math.hypot(p[0]-last[0],p[1]-last[1])>.002){if(this.stroke.points.length>=64)this.stroke.points=this.stroke.points.filter((_,i)=>i%2===0||i===63);this.stroke.points.push(p);onStrokePreview(this.stroke);}}};
    canvas.onpointerup=()=>{this.panStart=null;if(this.stroke){const stroke=this.stroke;this.stroke=null;onStrokePreview(null);onStroke(stroke);}};
    canvas.onpointercancel=()=>this.cancelStroke();canvas.onlostpointercapture=()=>this.cancelStroke();
    canvas.onpointerleave=()=>{this.pointer=null;this.brush.hidden=true;};
    this.observer=new ResizeObserver(()=>this.layout());this.observer.observe(this.stage);
  }
  cancelStroke(){this.stroke=null;this.panStart=null;this.onStrokePreview(null);}
  moveBrush(e){this.pointer=this.point(e);this.refreshBrush();}
  refreshBrush(){const active=this.tool==='add'||this.tool==='subtract';this.brush.hidden=!active||!this.pointer;if(this.brush.hidden)return;const size=2*this.radius*Math.min(this.overlay.clientWidth,this.overlay.clientHeight);Object.assign(this.brush.style,{width:`${size}px`,height:`${size}px`,left:`${this.pointer[0]*100}%`,top:`${this.pointer[1]*100}%`});this.brush.textContent=this.tool==='add'?'+':'−';this.brush.dataset.mode=this.tool;}
  point(e){const r=this.canvas.getBoundingClientRect();return [Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))];}
  setImage(width,height){this.width=width;this.height=height;this.zoom=1;this.pan=[0,0];this.layout();}
  layout(){if(!this.width)return;const w=this.stage.clientWidth,h=this.stage.clientHeight;const fit=Math.min((w-24)/this.width,(h-24)/this.height),iw=this.width*fit*this.zoom,ih=this.height*fit*this.zoom;
    this.pan=this.pan.map((v,i)=>Math.max(-Math.max(0,([iw,ih][i]-[w,h][i])/2),Math.min(Math.max(0,([iw,ih][i]-[w,h][i])/2),v)));
    for(const el of [this.canvas,this.overlay])Object.assign(el.style,{inset:'auto',width:`${iw}px`,height:`${ih}px`,left:`${(w-iw)/2+this.pan[0]}px`,top:`${(h-ih)/2+this.pan[1]}px`});
    this.refreshBrush();
  }
  update({split,divider,focus,focusVisible,tool}){this.divider=divider;if(tool!==this.tool&&this.stroke)this.cancelStroke();this.tool=tool;this.refreshBrush();this.handle.hidden=!split||tool!=='none';this.handle.style.left=`${divider*100}%`;this.handle.setAttribute('aria-valuenow',String(Math.round(divider*100)));this.focus.hidden=!focusVisible;this.focus.style.left=`${focus[0]*100}%`;this.focus.style.top=`${focus[1]*100}%`;this.canvas.style.cursor=tool==='none'?'default':(tool==='add'||tool==='subtract'?'none':'crosshair');}
}
