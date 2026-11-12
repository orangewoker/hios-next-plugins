// DOM-only themed picker: native OS select menus cannot follow HIOS theme tokens.
export function createTagMenu(onChoose) {
  const menu = document.createElement('div'); menu.className = 'tag-menu'; menu.hidden = true;
  const search = document.createElement('input'); search.className = 'hios-control tag-search'; search.placeholder = '搜索编号或标签'; search.setAttribute('aria-label', '搜索标签');
  const list = document.createElement('div'); list.className = 'tag-options'; list.id = 'tag-options'; list.setAttribute('role', 'listbox');
  const empty = document.createElement('div'); empty.className = 'tag-empty'; empty.textContent = '没有匹配的标签';
  menu.append(search, list); document.body.append(menu);
  let category, trigger, selected, active = 0, filtered = [];
  function close(focus = false) {
    menu.hidden = true; trigger?.setAttribute('aria-expanded', 'false');
    if (focus) trigger?.focus();
    trigger = null; category = null; filtered = []; list.replaceChildren();
  }
  function highlight() {
    for (const [i, option] of [...list.children].entries()) option.classList.toggle('active', i === active);
    list.children[active]?.scrollIntoView({ block: 'nearest' });
  }
  function choose(entry) { onChoose(category.id, entry.id); close(true); }
  function populate() {
    const query = search.value.trim().toLocaleLowerCase();
    filtered = category.entries.filter(e => `${e.id} ${e.text}`.toLocaleLowerCase().includes(query));
    list.replaceChildren();
    active = Math.max(0, filtered.findIndex(e => e.id === selected));
    const fragment = document.createDocumentFragment();
    for (const entry of filtered) {
      const option = document.createElement('button'); option.type = 'button'; option.className = 'tag-option'; option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(entry.id === selected)); option.textContent = `${entry.id} · ${entry.text}`;
      option.addEventListener('click', () => choose(entry)); fragment.append(option);
    }
    list.append(fragment);
    if (!filtered.length) list.append(empty);
    highlight();
  }
  function position() {
    const r = trigger.getBoundingClientRect(), gap = 8;
    const below = innerHeight - r.bottom - gap, above = r.top - gap;
    const up = below < 200 && above > below;
    menu.style.width = `${Math.min(Math.max(r.width, 260), innerWidth - 16)}px`;
    menu.style.left = `${Math.max(8, Math.min(r.left, innerWidth - parseFloat(menu.style.width) - 8))}px`;
    menu.style.maxHeight = `${Math.max(70, Math.min(340, up ? above : below))}px`;
    menu.style.top = up ? 'auto' : `${r.bottom + 4}px`;
    menu.style.bottom = up ? `${innerHeight - r.top + 4}px` : 'auto';
  }
  search.addEventListener('input', populate);
  menu.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) && filtered.length) {
      event.preventDefault();
      active = event.key === 'Home' ? 0 : event.key === 'End' ? filtered.length - 1 : (active + (event.key === 'ArrowDown' ? 1 : -1) + filtered.length) % filtered.length;
      highlight();
    }
    if (event.key === 'Enter' && filtered[active]) { event.preventDefault(); choose(filtered[active]); }
    if (event.key === 'Tab') close();
  });
  document.addEventListener('pointerdown', event => { if (!menu.hidden && !menu.contains(event.target) && !trigger?.contains(event.target)) close(); });
  window.addEventListener('resize', () => close());
  window.addEventListener('scroll', event => { if (!menu.hidden && !menu.contains(event.target)) close(); }, true);
  return {
    close,
    open(c, button, value) {
      if (trigger === button && !menu.hidden) { close(true); return; }
      close(); category = c; trigger = button; selected = value;
      button.setAttribute('aria-expanded', 'true'); list.setAttribute('aria-label', c.title);
      search.value = ''; menu.hidden = false; position(); populate(); search.focus({ preventScroll: true });
    },
  };
}
