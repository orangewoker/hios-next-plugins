// Preserve the native value/change contract while owning the popup's theme.
// The menu lives in the iframe's top layer, never in the host or an OS popup.
const controls = new WeakMap();
let active, sequence = 0;

function enabledOptions(select) {
  return [...select.options].map((option, index) => ({ option, index }))
    .filter(({ option }) => !option.disabled && !option.parentElement?.disabled);
}

export function enhanceSelect(select) {
  if (controls.has(select)) { controls.get(select).sync(); return controls.get(select); }
  const trigger = document.createElement('button'), text = document.createElement('span'), arrow = document.createElement('i');
  const menu = document.createElement('div'), id = `chenyu-select-${++sequence}`;
  trigger.type = 'button'; trigger.id = `${id}-trigger`; trigger.className = 'workflow-select-trigger';
  trigger.setAttribute('role', 'combobox'); trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-controls', id); trigger.setAttribute('aria-expanded', 'false');
  arrow.textContent = '⌄'; arrow.setAttribute('aria-hidden', 'true'); trigger.append(text, arrow);
  menu.id = id; menu.className = 'workflow-select-menu'; menu.setAttribute('role', 'listbox');
  menu.setAttribute('popover', 'manual');
  const label = select.closest('label'), caption = label?.querySelector(':scope > span');
  if (caption) {
    caption.id ||= `${id}-label`; trigger.setAttribute('aria-labelledby', caption.id);
    menu.setAttribute('aria-labelledby', caption.id);
  } else trigger.setAttribute('aria-label', select.getAttribute('aria-label') || '请选择');
  if (label) label.htmlFor = trigger.id;
  select.hidden = true; select.tabIndex = -1; select.setAttribute('aria-hidden', 'true'); select.after(trigger);
  let focused = -1, search = '', lastKeyAt = 0, rows = [];

  const position = () => {
    if (active !== control) return;
    const r = trigger.getBoundingClientRect(), margin = 8, gap = 6;
    const below = innerHeight - r.bottom - margin - gap, above = r.top - margin - gap;
    const height = Math.min(260, Math.max(below, above)), down = below >= Math.min(menu.scrollHeight, 260) || below >= above;
    const width = Math.min(Math.max(r.width, 180), innerWidth - margin * 2);
    menu.style.width = `${width}px`;
    menu.style.maxHeight = `${Math.max(40, height)}px`;
    menu.style.left = `${Math.max(margin, Math.min(r.left, innerWidth - width - margin))}px`;
    menu.style.top = `${Math.max(margin, down ? r.bottom + gap : r.top - gap - Math.min(menu.scrollHeight, height))}px`;
  };
  const highlight = () => {
    rows.forEach((row, index) => row.classList.toggle('is-focused', index === focused));
    if (rows[focused]) {
      trigger.setAttribute('aria-activedescendant', rows[focused].id);
      rows[focused].scrollIntoView({ block: 'nearest' });
    } else trigger.removeAttribute('aria-activedescendant');
  };
  const close = (restoreFocus = false) => {
    if (active !== control) return;
    active = undefined;
    if (menu.matches(':popover-open')) menu.hidePopover();
    menu.remove(); trigger.setAttribute('aria-expanded', 'false'); trigger.removeAttribute('aria-activedescendant');
    if (restoreFocus && trigger.isConnected && !trigger.disabled) trigger.focus({ preventScroll: true });
  };
  const sync = () => {
    text.textContent = select.selectedOptions[0]?.textContent || '请选择';
    trigger.disabled = select.disabled || !select.options.length;
    if (trigger.disabled || !select.isConnected) close();
  };
  const choose = index => {
    const option = select.options[index];
    if (!option || option.disabled || option.parentElement?.disabled || select.disabled) return;
    const changed = select.selectedIndex !== index;
    select.selectedIndex = index; close(true); sync();
    if (changed) {
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };
  const open = () => {
    sync(); if (trigger.disabled) return;
    active?.close(); active = control; search = '';
    focused = select.selectedIndex;
    if (!enabledOptions(select).some(item => item.index === focused)) focused = enabledOptions(select)[0]?.index ?? -1;
    rows = [...select.options].map((option, index) => {
      const row = document.createElement('button'); row.type = 'button'; row.tabIndex = -1;
      row.id = `${id}-${index}`; row.textContent = option.textContent; row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(index === select.selectedIndex));
      row.disabled = option.disabled || Boolean(option.parentElement?.disabled);
      row.classList.toggle('active', index === select.selectedIndex);
      row.onpointerdown = event => { if (event.pointerType !== 'touch') event.preventDefault(); };
      row.onpointermove = event => { if (event.pointerType !== 'touch' && !row.disabled && focused !== index) { focused = index; highlight(); } };
      row.onclick = () => choose(index); return row;
    });
    menu.replaceChildren(...rows); document.body.append(menu);
    menu.showPopover(); trigger.setAttribute('aria-expanded', 'true'); position(); highlight();
  };
  const move = direction => {
    const enabled = enabledOptions(select), index = enabled.findIndex(item => item.index === focused);
    focused = enabled[Math.max(0, Math.min(enabled.length - 1, index + direction))]?.index ?? -1; highlight();
  };
  trigger.onclick = () => { if (active === control) close(); else open(); };
  trigger.onkeydown = event => {
    if (event.key === 'Tab') { close(); return; }
    if (event.key === 'Escape') { if (active === control) { event.preventDefault(); event.stopPropagation(); close(true); } return; }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      if (active !== control) open();
      else if (event.key === 'Enter' || event.key === ' ') { choose(focused); return; }
      else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') move(event.key === 'ArrowDown' ? 1 : -1);
      if (event.key === 'Home' || event.key === 'End') {
        const enabled = enabledOptions(select); focused = enabled[event.key === 'Home' ? 0 : enabled.length - 1]?.index ?? -1; highlight();
      }
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault(); if (active !== control) open();
      const now = Date.now(); search = (now - lastKeyAt > 600 ? '' : search) + event.key.toLocaleLowerCase(); lastKeyAt = now;
      const match = enabledOptions(select).find(({ option }) => option.textContent.trim().toLocaleLowerCase().startsWith(search));
      if (match) { focused = match.index; highlight(); }
    }
  };
  select.addEventListener('change', sync);
  const control = { sync, close, position, trigger, menu };
  controls.set(select, control); sync(); return control;
}

export function syncSelect(select) { controls.get(select)?.sync(); }
export function closeSelects() { active?.close(); }
document.addEventListener('pointerdown', event => {
  if (active && !active.trigger.contains(event.target) && !active.menu.contains(event.target)) active.close();
}, true);
document.addEventListener('focusin', event => {
  if (active && event.target !== active.trigger && !active.menu.contains(event.target)) active.close();
});
document.addEventListener('scroll', event => {
  if (active && !active.menu.contains(event.target)) active.close();
}, true);
window.addEventListener('resize', () => active?.close());
window.addEventListener('blur', closeSelects);
