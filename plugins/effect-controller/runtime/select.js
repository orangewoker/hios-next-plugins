// Keep native selects as the form/state API, but never open an OS popup inside
// a transformed canvas iframe. Both anchor and menu use this viewport's CSS px.
const records = new WeakMap();
let active = null, frame = 0, sequence = 0;
const menu = document.createElement('div');
menu.id = 'effect-select-menu';
menu.className = 'effect-select-menu';
menu.setAttribute('role', 'listbox');
menu.hidden = true;
document.body.append(menu);

export function closeSelect(restore = false) {
  if (!active) return;
  const trigger = active.trigger;
  trigger.setAttribute('aria-expanded', 'false');
  trigger.removeAttribute('aria-activedescendant');
  active = null;
  menu.hidden = true;
  menu.replaceChildren();
  cancelAnimationFrame(frame);
  if (restore && trigger.isConnected) trigger.focus({preventScroll:true});
}
const close = closeSelect;

function place() {
  if (!active) return;
  const {select,trigger} = active;
  if (!select.isConnected || select.disabled || select.hidden || !trigger.getClientRects().length) return close();
  const r = trigger.getBoundingClientRect();
  const app = document.getElementById('app').getBoundingClientRect();
  if (r.bottom <= app.top || r.top >= app.bottom) return close();
  const width = document.documentElement.clientWidth, height = document.documentElement.clientHeight;
  const below = Math.max(0,height-r.bottom-10), above = Math.max(0,r.top-10);
  const up = below < Math.min(160,menu.scrollHeight) && above > below;
  const maxHeight = Math.min(280,up?above:below);
  const menuWidth = Math.min(Math.max(r.width,160),width-12);
  menu.style.width = `${menuWidth}px`;
  menu.style.maxHeight = `${maxHeight}px`;
  menu.style.left = `${Math.max(6,Math.min(r.left,width-menuWidth-6))}px`;
  menu.style.top = `${up?r.top-menu.getBoundingClientRect().height-4:r.bottom+4}px`;
  menu.dataset.placement = up?'top':'bottom';
  frame = requestAnimationFrame(place);
}

function highlight(index, scroll = true) {
  if (!active || !active.items.length) return;
  active.index = Math.max(0,Math.min(index,active.items.length-1));
  for (const [i,item] of active.items.entries()) item.classList.toggle('is-active',i===active.index);
  const item = active.items[active.index];
  active.trigger.setAttribute('aria-activedescendant',item.id);
  if (scroll) item.scrollIntoView({block:'nearest'});
}

function choose(index) {
  if (!active) return;
  const {select,options} = active;
  const value = options[index]?.value;
  if (value === undefined) return;
  close(true);
  select.value = value;
  select.dispatchEvent(new Event('change',{bubbles:true}));
  syncSelects();
}

function open(record) {
  if (record.select.disabled || record.select.hidden) return;
  if (active?.select === record.select) return close(true);
  close();
  const options = [...record.select.options].filter(o=>!o.disabled && !o.hidden);
  active = {...record,options,items:[],index:0,typed:'',typedAt:0};
  menu.setAttribute('aria-label',record.trigger.getAttribute('aria-label'));
  for (const [i,option] of options.entries()) {
    const item = document.createElement('div');
    item.id = `effect-option-${++sequence}`;
    item.className = 'effect-select-option';
    item.setAttribute('role','option');
    item.setAttribute('aria-selected',String(option.value===record.select.value));
    item.textContent = option.label;
    item.dataset.value = option.value;
    item.addEventListener('pointerdown',e=>e.preventDefault());
    item.addEventListener('pointermove',()=>highlight(i,false));
    item.addEventListener('click',e=>{e.stopPropagation();choose(i);});
    menu.append(item);active.items.push(item);
  }
  if (!options.length) return close();
  record.trigger.setAttribute('aria-expanded','true');
  menu.hidden = false;
  place();
  highlight(Math.max(0,options.findIndex(o=>o.value===record.select.value)));
}

function keyboard(e,record) {
  if (e.key === 'Escape') { if(active){e.preventDefault();close(true);} return; }
  if (e.key === 'Tab') {close();return;}
  if (['ArrowDown','ArrowUp','Home','End','Enter',' '].includes(e.key)) {
    e.preventDefault();
    if (active?.select !== record.select) {open(record);return;}
    if (e.key==='Enter' || e.key===' ') return choose(active.index);
    highlight(e.key==='Home'?0:e.key==='End'?active.items.length-1:active.index+(e.key==='ArrowUp'?-1:1));
  } else if(active && e.key.length===1 && !e.ctrlKey && !e.metaKey){
    e.preventDefault();const now=Date.now();
    active.typed=(now-active.typedAt>700?'':active.typed)+e.key.toLocaleLowerCase();active.typedAt=now;
    const index=active.options.findIndex(o=>o.label.toLocaleLowerCase().startsWith(active.typed));
    if(index>=0)highlight(index);
  }
}

export function syncSelects() {
  for(const select of document.querySelectorAll('#app select')){
    let record=records.get(select);
    if(!record){
      const wrapper=document.createElement('div');wrapper.className='effect-select';
      const trigger=document.createElement('button');trigger.type='button';
      trigger.className='hios-control effect-select-trigger';trigger.setAttribute('role','combobox');
      trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-controls',menu.id);trigger.setAttribute('aria-expanded','false');
      const caption=document.createElement('span');caption.className='effect-select-caption';trigger.append(caption);
      select.before(wrapper);wrapper.append(select,trigger);
      select.classList.add('effect-select-source');select.tabIndex=-1;select.setAttribute('aria-hidden','true');
      record={select,wrapper,trigger,caption};records.set(select,record);
      trigger.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();open(record);});
      trigger.addEventListener('keydown',e=>keyboard(e,record));
      select.addEventListener('change',()=>queueMicrotask(syncSelects));
    }
    const {wrapper,trigger,caption}=record;
    if(wrapper.hidden!==select.hidden)wrapper.hidden=select.hidden;
    if(trigger.disabled!==select.disabled)trigger.disabled=select.disabled;
    const label=select.getAttribute('aria-label') || [...(select.closest('label')?.childNodes||[])].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent.trim()).join(' ') || select.id;
    trigger.setAttribute('aria-label',label);
    const text=select.selectedOptions[0]?.label || '请选择';
    if(caption.textContent!==text)caption.textContent=text;
  }
  if(active && (!active.select.isConnected || active.select.disabled || active.select.hidden))close();
}

document.addEventListener('pointerdown',e=>{if(active && !menu.contains(e.target) && !active.trigger.contains(e.target))close();},true);
window.addEventListener('blur',()=>close());
document.addEventListener('scroll',e=>{if(active && e.target!==menu && !menu.contains(e.target))close();},true);
new MutationObserver(syncSelects).observe(document.getElementById('app'),{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','disabled','selected']});
