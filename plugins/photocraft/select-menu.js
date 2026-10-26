// Render menus inside the iframe: native OS select popups ignore transformed
// canvas-node coordinates on some WebView runtimes.
export function installSelectMenus() {
  let close = () => {};
  for (const select of document.querySelectorAll('select')) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'select-trigger';
    button.dataset.select = select.id;
    button.setAttribute('aria-haspopup', 'listbox');
    button.setAttribute('aria-label', select.getAttribute('aria-label') || select.title || select.id);
    select.after(button); select.hidden = true;
    const sync = () => {
      button.textContent = select.selectedOptions[0]?.textContent || '暂无可用选项';
      button.disabled = select.disabled || !select.options.length;
    };
    new MutationObserver(sync).observe(select, { subtree: true, childList: true, attributes: true, characterData: true });
    select.addEventListener('change', sync); sync();
    button.onclick = () => {
      if (button.getAttribute('aria-expanded') === 'true') { close(); return; }
      close(); sync();
      const menu = document.createElement('div');
      menu.className = 'select-menu'; menu.setAttribute('role', 'listbox');
      menu.setAttribute('aria-label', button.getAttribute('aria-label'));
      button.setAttribute('aria-expanded', 'true');
      document.body.append(menu);
      const items = [];
      for (const option of select.options) {
        const item = document.createElement('button');
        item.type = 'button'; item.textContent = option.textContent;
        item.setAttribute('role', 'option'); item.setAttribute('aria-selected', String(option.selected));
        item.disabled = option.disabled;
        item.onclick = () => {
          select.value = option.value; select.dispatchEvent(new Event('change', { bubbles: true }));
          sync(); close(); button.focus();
        };
        menu.append(item); if (!item.disabled) items.push(item);
      }
      const r = button.getBoundingClientRect();
      menu.style.width = `${Math.min(Math.max(r.width, 150), innerWidth - 16)}px`;
      const above = r.top > innerHeight - r.bottom;
      menu.style.maxHeight = `${Math.max(32, Math.min(280, (above ? r.top : innerHeight - r.bottom) - 8))}px`;
      menu.style.left = `${Math.max(8, Math.min(r.left, innerWidth - menu.offsetWidth - 8))}px`;
      menu.style.top = `${above ? Math.max(4, r.top - menu.offsetHeight - 4) : r.bottom + 4}px`;
      const dismiss = e => { if (!menu.contains(e.target) && !button.contains(e.target)) close(); };
      const key = e => {
        if (e.key === 'Escape') { e.preventDefault(); close(); button.focus(); }
        else if (e.key === 'Tab') close();
        else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key) && items.length) {
          e.preventDefault(); const index = items.indexOf(document.activeElement);
          items[e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (index + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
        }
      };
      close = () => {
        menu.remove(); button.setAttribute('aria-expanded', 'false');
        document.removeEventListener('pointerdown', dismiss, true);
        document.removeEventListener('keydown', key, true);
        window.removeEventListener('resize', close); window.removeEventListener('blur', close);
        close = () => {};
      };
      document.addEventListener('pointerdown', dismiss, true); document.addEventListener('keydown', key, true);
      window.addEventListener('resize', close); window.addEventListener('blur', close);
      (items.find(i => i.getAttribute('aria-selected') === 'true') || items[0])?.focus({ preventScroll: true });
    };
  }
  // Footer popovers do not cover the editor after an action or an outside click.
  const popovers = [...document.querySelectorAll('.ai-more')];
  for (const details of popovers) details.addEventListener('toggle', () => {
    if (details.open) for (const other of popovers) if (other !== details) other.open = false;
  });
  document.addEventListener('pointerdown', event => {
    if (event.target.closest('.select-menu')) return;
    for (const details of popovers) if (!details.contains(event.target)) details.open = false;
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    const details = popovers.find(item => item.open);
    if (details) { event.preventDefault(); details.open = false; details.querySelector('summary').focus(); }
  });
  document.addEventListener('click', event => {
    if (event.target.closest('#open,#save,#export,#expand,#reload')) {
      const tools = document.getElementById('documentTools');
      if (tools) tools.open = false;
    }
  });
  for (const span of document.querySelectorAll('.ai-status-line>span')) {
    const syncTitle = () => { span.title = span.textContent; };
    new MutationObserver(syncTitle).observe(span, { childList: true, characterData: true, subtree: true });
    syncTitle();
  }
}
