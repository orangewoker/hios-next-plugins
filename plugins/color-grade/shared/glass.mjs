// Presentation-only. No plugin state or host messages are produced here.
export function syncRangeStyles(root=document){for(const el of root.querySelectorAll('input[type=range]')){const min=Number(el.min||0),max=Number(el.max||100),value=Number(el.value);const progress=max>min?Math.max(0,Math.min(100,(value-min)/(max-min)*100)):0;el.style.setProperty('--range-fill',`${progress}%`);}}
document.addEventListener('input',e=>{if(e.target.matches?.('input[type=range]'))syncRangeStyles(e.target.parentElement);},true);
document.addEventListener('change',e=>{if(e.target.matches?.('input[type=range]'))syncRangeStyles(e.target.parentElement);},true);
