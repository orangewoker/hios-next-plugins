/* Native-themed, accessible select popovers. Original controls remain the form state source. */
const controls = new Map();
const fileControls = new WeakSet();
let opened = null;
export function enhanceFileInputs(root = document) {
  root.querySelectorAll('input[type=file]').forEach(input => {
    if (fileControls.has(input)) return;
    const title = input.closest('label')?.querySelector('span')?.textContent?.trim() || '文件';
    const wrap = document.createElement('div'); wrap.className = 'file-picker hios-control';
    const button = document.createElement('button'); button.type = 'button'; button.className = 'file-trigger'; button.textContent = '选择文件';
    button.setAttribute('aria-label', `${title}：选择文件`);
    const name = document.createElement('span'); name.className = 'file-name'; name.setAttribute('aria-live', 'polite');
    input.before(wrap); wrap.append(input, button, name); input.hidden = true; input.tabIndex = -1; input.setAttribute('aria-hidden', 'true');
    const sync = () => { name.textContent = [...(input.files || [])].map(file => file.name).join('、') || '未选择文件'; name.title = name.textContent; button.disabled = input.disabled; };
    button.onclick = event => { event.preventDefault(); input.click(); };
    input.addEventListener('change', sync);
    new MutationObserver(sync).observe(input, { attributes: true, attributeFilter: ['disabled'] });
    fileControls.add(input); sync();
  });
}
export function syncSelects() { for (const [select, view] of controls) view.sync(); }
export function enhanceSelects(root = document) {
  root.querySelectorAll('select').forEach(select => {
    if (controls.has(select)) return;
    const wrap = document.createElement('div'); wrap.className = 'breeze-select';
    select.before(wrap); wrap.append(select); select.hidden = true; select.tabIndex = -1; select.setAttribute('aria-hidden', 'true');
    const button = document.createElement('button'); button.type = 'button'; button.className = 'hios-control select-trigger';
    button.setAttribute('role', 'combobox'); button.setAttribute('aria-haspopup', 'listbox'); button.setAttribute('aria-expanded', 'false');
    const menu = document.createElement('div'); menu.className = 'select-menu'; menu.id = `list-${select.id}`; menu.role = 'listbox'; menu.hidden = true;
    button.setAttribute('aria-controls', menu.id); menu.setAttribute('aria-label', select.closest('label')?.querySelector('span')?.textContent || '选择');
    wrap.append(button); document.body.append(menu);
    let cursor = 0, prefix = '', prefixTime = 0;
    const options = () => [...select.options];
    let positionFrame = 0;
    const position = () => {
      cancelAnimationFrame(positionFrame);
      if (menu.hidden) return;
      if (!button.isConnected || button.disabled || !button.getClientRects().length) { close(); return; }
      const zoom=Number.parseFloat(getComputedStyle(document.documentElement).zoom)||1;
      const raw=button.getBoundingClientRect(), r={left:raw.left/zoom,top:raw.top/zoom,bottom:raw.bottom/zoom,width:raw.width/zoom};
      const width=innerWidth/zoom, height=innerHeight/zoom;
      const below=Math.max(0,height-r.bottom-12), above=Math.max(0,r.top-12);
      const up=below<Math.min(menu.scrollHeight,240)&&above>below;
      menu.style.width=`${Math.min(Math.max(r.width,160),width-16)}px`;
      menu.style.maxHeight=`${Math.min(240,up?above:below)}px`;
      menu.style.left=`${Math.max(8,Math.min(r.left,width-menu.offsetWidth-8))}px`;
      menu.style.top=`${up?r.top-menu.offsetHeight-4:r.bottom+4}px`;
      positionFrame=requestAnimationFrame(position);
    };
    const paint = () => {
      [...menu.children].forEach((el, i) => { el.classList.toggle('highlighted', i === cursor); el.setAttribute('aria-selected', String(options()[i]?.selected || false)); });
      button.setAttribute('aria-activedescendant', menu.children[cursor]?.id || '');
      menu.children[cursor]?.scrollIntoView({ block: 'nearest' });
    };
    const close = (focus = false) => { cancelAnimationFrame(positionFrame); menu.hidden = true; button.setAttribute('aria-expanded', 'false'); button.removeAttribute('aria-activedescendant'); if (opened?.button === button) opened = null; if (focus) button.focus(); };
    const choose = i => { if (options()[i]?.disabled) return; select.selectedIndex = i; select.dispatchEvent(new Event('input', { bubbles: true })); select.dispatchEvent(new Event('change', { bubbles: true })); sync(); close(true); };
    const sync = () => {
      button.textContent = select.selectedOptions[0]?.textContent || '请选择'; button.disabled = select.disabled;
      button.setAttribute('aria-label', `${menu.getAttribute('aria-label')}：${button.textContent}`);
      menu.replaceChildren(...options().map((option, i) => { const el = document.createElement('div'); el.role = 'option'; el.id = `${menu.id}-${i}`; el.textContent = option.textContent; el.setAttribute('aria-disabled', String(option.disabled)); el.onpointermove = () => { cursor = i; paint(); }; el.onpointerdown = e => e.preventDefault(); el.onclick = () => choose(i); return el; }));
      if (!menu.hidden) { position(); paint(); }
    };
    const open = () => { if (select.disabled) return; opened?.close(); sync(); cursor = Math.max(0, select.selectedIndex); menu.hidden = false; button.setAttribute('aria-expanded', 'true'); opened = { button, menu, close }; position(); paint(); };
    const move = delta => { const items = options(); for (let n = 0; n < items.length; n++) { cursor = (cursor + delta + items.length) % items.length; if (!items[cursor].disabled) break; } paint(); };
    button.onclick = () => menu.hidden ? open() : close();
    button.onkeydown = e => {
      if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' ', 'Escape', 'Tab'].includes(e.key)) {
        if (e.key === 'Tab') { close(); return; } e.preventDefault();
        if (e.key === 'Escape') { close(true); return; }
        if (menu.hidden) { open(); return; }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') move(e.key === 'ArrowDown' ? 1 : -1);
        else if (e.key === 'Home' || e.key === 'End') { cursor = e.key === 'Home' ? -1 : 0; move(e.key === 'Home' ? 1 : -1); }
        else choose(cursor);
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (menu.hidden) open(); prefix = Date.now() - prefixTime < 650 ? prefix + e.key : e.key; prefixTime = Date.now();
        const index = options().findIndex(o => !o.disabled && o.textContent.toLowerCase().startsWith(prefix.toLowerCase())); if (index >= 0) { cursor = index; paint(); }
      }
    };
    select.addEventListener('change', sync); select.addEventListener('input', sync);
    new MutationObserver(sync).observe(select, { childList: true, subtree: true, attributes: true, characterData: true });
    controls.set(select, { sync }); sync();
  });
}
document.addEventListener('pointerdown', e => { if (opened && !opened.menu.contains(e.target) && !opened.button.contains(e.target)) opened.close(); });
window.addEventListener('resize', () => opened?.close());
window.addEventListener('scroll', e => { if (opened && !opened.menu.contains(e.target)) opened.close(); }, true);
