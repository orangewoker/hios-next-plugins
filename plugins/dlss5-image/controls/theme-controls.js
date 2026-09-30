(function (root) {
  'use strict';

  function syncRange(input) {
    const min = Number(input.min || 0);
    const max = Number(input.max || 100);
    const value = Number(input.value);
    const percent = max > min ? Math.max(0, Math.min(100, (value - min) / (max - min) * 100)) : 0;
    input.style.setProperty('--range-fill', `${percent}%`);
  }

  function attachSelect(select) {
    const container = document.createElement('span');
    container.className = 'theme-select';
    select.parentNode.insertBefore(container, select);
    container.append(select);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'theme-select-button';
    button.setAttribute('aria-haspopup', 'listbox');
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-label', select.closest('label')?.textContent?.trim().split('\n')[0]?.trim() || select.id);
    const value = document.createElement('span');
    const chevron = document.createElement('span');
    chevron.className = 'theme-select-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    button.append(value, chevron);
    const list = document.createElement('div');
    list.className = 'theme-select-list';
    list.setAttribute('role', 'listbox');
    list.hidden = true;
    button.setAttribute('aria-controls', `${select.id}-options`);
    list.id = `${select.id}-options`;
    container.append(button, list);

    const options = [...select.options].map((nativeOption, index) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'theme-select-option';
      option.setAttribute('role', 'option');
      option.textContent = nativeOption.textContent;
      option.dataset.index = String(index);
      list.append(option);
      return option;
    });
    function sync() {
      value.textContent = select.selectedOptions[0]?.textContent || '';
      options.forEach((option, index) => option.setAttribute('aria-selected', String(index === select.selectedIndex)));
    }
    function close(focusButton = false) {
      list.hidden = true;
      button.setAttribute('aria-expanded', 'false');
      if (focusButton) button.focus();
    }
    function open() {
      document.querySelectorAll('.theme-select-list:not([hidden])').forEach((other) => {
        if (other !== list) {
          other.hidden = true;
          other.previousElementSibling?.setAttribute('aria-expanded', 'false');
        }
      });
      list.hidden = false;
      button.setAttribute('aria-expanded', 'true');
      options[select.selectedIndex]?.focus();
    }
    function choose(index) {
      if (index < 0 || index >= options.length) return;
      if (select.selectedIndex !== index) {
        select.selectedIndex = index;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
      sync();
      close(true);
    }
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      list.hidden ? open() : close();
    });
    button.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open();
      }
    });
    list.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const option = event.target.closest('.theme-select-option');
      if (option) choose(Number(option.dataset.index));
    });
    list.addEventListener('keydown', (event) => {
      const current = Number(document.activeElement?.dataset.index ?? select.selectedIndex);
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        options[(current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length]?.focus();
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        options[event.key === 'Home' ? 0 : options.length - 1]?.focus();
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        choose(current);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        close(true);
      } else if (event.key === 'Tab') close();
    });
    document.addEventListener('pointerdown', (event) => { if (!container.contains(event.target)) close(); });
    select.addEventListener('change', sync);
    sync();
    return sync;
  }

  function init() {
    const selectSyncs = [...document.querySelectorAll('select')].map(attachSelect);
    const ranges = [...document.querySelectorAll('input[type="range"]')];
    ranges.forEach((input) => {
      input.addEventListener('input', () => syncRange(input));
      syncRange(input);
    });
    return {
      sync() { selectSyncs.forEach((sync) => sync()); ranges.forEach(syncRange); },
    };
  }

  root.DlssThemeControls = Object.freeze({ init, syncRange });
})(globalThis);
