// DOM-rendered options inherit the live host theme; no native OS select popup.
let serial = 0, active;
const bindings = new Set();
new MutationObserver(() => { for (const binding of bindings) if (!binding.root.isConnected) { binding.dispose(); bindings.delete(binding); } }).observe(document.body, { childList: true, subtree: true });
export function themedSelect(select) {
  const root = document.createElement('div'); root.className = 'mg-select';
  const trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'mg-select-trigger';
  trigger.setAttribute('role', 'combobox'); trigger.setAttribute('aria-haspopup', 'listbox'); trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-label', select.getAttribute('aria-label') || '选择');
  const menu = document.createElement('div'); menu.className = 'mg-select-menu'; menu.id = `mg-select-${++serial}`; menu.popover = 'auto';
  menu.setAttribute('role', 'listbox'); menu.setAttribute('aria-label', trigger.getAttribute('aria-label'));
  trigger.setAttribute('aria-controls', menu.id);
  select.hidden = true; select.tabIndex = -1; select.setAttribute('aria-hidden', 'true');
  root.append(select, trigger, menu);
  let open = false;
  const update = () => { trigger.textContent = select.selectedOptions[0]?.textContent || '请选择'; trigger.disabled = select.disabled; };
  const close = (focus = false) => { if (!open) return; open = false; if (menu.matches(':popover-open')) menu.hidePopover(); trigger.setAttribute('aria-expanded', 'false'); if (active === close) active = undefined; if (focus && trigger.isConnected) trigger.focus(); };
  const show = () => {
    if (trigger.disabled) return;
    active?.(); active = close;
    menu.replaceChildren(...Array.from(select.options, option => {
      const item = document.createElement('button'); item.type = 'button'; item.className = 'mg-select-option';
      item.setAttribute('role', 'option'); item.setAttribute('aria-selected', String(option.selected)); item.textContent = option.textContent; item.disabled = option.disabled;
      item.onclick = () => { select.value = option.value; update(); close(true); select.dispatchEvent(new Event('change', { bubbles: true })); };
      return item;
    }));
    const box = trigger.getBoundingClientRect(), below = innerHeight - box.bottom - 8, above = box.top - 8;
    const height = Math.min(300, Math.max(below, above));
    Object.assign(menu.style, { margin: '0', width: `${Math.min(Math.max(box.width, 180), innerWidth - 16)}px`, maxHeight: `${Math.max(60, height)}px`, left: `${Math.max(8, Math.min(box.left, innerWidth - Math.max(box.width, 180) - 8))}px`, top: below >= Math.min(300, above) ? `${box.bottom + 5}px` : 'auto', bottom: below >= Math.min(300, above) ? 'auto' : `${innerHeight - box.top + 5}px` });
    menu.showPopover(); open = true; trigger.setAttribute('aria-expanded', 'true');
    const selected = menu.querySelector('[aria-selected="true"]') || menu.querySelector('button:not(:disabled)'); selected?.focus({ preventScroll: true }); selected?.scrollIntoView({ block: 'nearest' });
  };
  trigger.onclick = () => open ? close(true) : show();
  trigger.onkeydown = event => { if (['ArrowDown','ArrowUp','Home','End'].includes(event.key)) { event.preventDefault(); show(); if (event.key === 'End') menu.lastElementChild?.focus(); if (event.key === 'Home') menu.firstElementChild?.focus(); } };
  menu.addEventListener('keydown', event => {
    const options = Array.from(menu.querySelectorAll('button:not(:disabled)')), index = options.indexOf(document.activeElement);
    let next;
    if (event.key === 'ArrowDown') next = (index + 1) % options.length;
    if (event.key === 'ArrowUp') next = (index - 1 + options.length) % options.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = options.length - 1;
    if (next !== undefined) { event.preventDefault(); options[next]?.focus(); }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
    if (event.key === 'Tab') { close(true); }
  });
  menu.addEventListener('toggle', event => { if (event.newState === 'closed') { open = false; trigger.setAttribute('aria-expanded', 'false'); if (active === close) active = undefined; } });
  const observer = new MutationObserver(update); observer.observe(select, { attributes: true, childList: true, subtree: true }); select.addEventListener('change', update);
  const onResize = () => close(); window.addEventListener('resize', onResize);
  const onScroll = event => { if (!menu.contains(event.target)) close(); }; document.addEventListener('scroll', onScroll, true);
  bindings.add({ root, dispose: () => { close(); observer.disconnect(); window.removeEventListener('resize', onResize); document.removeEventListener('scroll', onScroll, true); } });
  update(); return root;
}
