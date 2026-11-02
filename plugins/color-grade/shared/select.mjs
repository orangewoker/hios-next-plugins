// In-document theme menus: do not depend on native OS select popup colors.
export function themedSelect(select){
  select.hidden=true;const button=document.createElement('button');button.type='button';button.className='theme-select';button.setAttribute('aria-haspopup','listbox');button.setAttribute('aria-expanded','false');button.setAttribute('aria-label',select.getAttribute('aria-label')||'选择');select.after(button);
  let menu=null,observer=null;
  const sync=()=>{button.textContent=select.selectedOptions[0]?.textContent||'请选择';button.disabled=select.disabled;};
  const close=()=>{menu?.remove();menu=null;button.setAttribute('aria-expanded','false');};
  const position=()=>{if(!menu)return;const rect=button.getBoundingClientRect();menu.style.width='100px';const scale=menu.getBoundingClientRect().width/100||1;const height=Math.min(280,Math.max(100,Math.max(innerHeight-rect.bottom,rect.top)-12));menu.style.width=`${rect.width/scale}px`;menu.style.maxHeight=`${height/scale}px`;menu.style.left=`${Math.max(4,rect.left)/scale}px`;menu.style.top=`${(innerHeight-rect.bottom>=Math.min(height,180)?rect.bottom+4:Math.max(4,rect.top-menu.scrollHeight*scale-4))/scale}px`;};
  const open=()=>{close();menu=document.createElement('div');menu.className='theme-select-menu';menu.setAttribute('role','listbox');menu.setAttribute('aria-label',button.getAttribute('aria-label'));menu.dataset.noNodeDrag='';
    let lastGroup='';for(const option of select.options){const group=option.parentElement.tagName==='OPTGROUP'?option.parentElement.label:'';if(group&&group!==lastGroup){const title=document.createElement('div');title.className='theme-select-group';title.textContent=group;menu.append(title);lastGroup=group;}
      const item=document.createElement('button');item.type='button';item.textContent=option.textContent;item.setAttribute('role','option');item.setAttribute('aria-selected',String(option.selected));item.disabled=option.disabled;item.onclick=()=>{select.value=option.value;select.dispatchEvent(new Event('input',{bubbles:true}));select.dispatchEvent(new Event('change',{bubbles:true}));sync();close();button.focus();};menu.append(item);
    }
    document.body.append(menu);button.setAttribute('aria-expanded','true');position();(menu.querySelector('[aria-selected=true]')||menu.querySelector('button'))?.focus({preventScroll:true});
    menu.onkeydown=e=>{const items=[...menu.querySelectorAll('button:not(:disabled)')];const i=items.indexOf(document.activeElement);if(e.key==='Escape'){e.preventDefault();close();button.focus();}else if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();items[e.key==='Home'?0:e.key==='End'?items.length-1:(i+(e.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();}else if(e.key==='Tab')close();};
  };
  button.onclick=()=>menu?close():open();button.onkeydown=e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();open();}};
  select.addEventListener('change',sync);observer=new MutationObserver(sync);observer.observe(select,{childList:true,subtree:true,attributes:true});
  document.addEventListener('pointerdown',e=>{if(menu&&!menu.contains(e.target)&&e.target!==button)close();});document.addEventListener('scroll',e=>{if(menu&&!menu.contains(e.target))close();},true);window.addEventListener('resize',close);
  sync();return {sync,close};
}
