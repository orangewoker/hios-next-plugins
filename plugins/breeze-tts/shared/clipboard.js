// Standalone/LAN pages may not have the secure-context Clipboard API.
export async function copyText(text, { clipboard = globalThis.navigator?.clipboard, document = globalThis.document } = {}) {
  if (!text) throw new Error('连接密钥为空，请先连接服务');
  try {
    if (!clipboard?.writeText) throw new Error('clipboard unavailable');
    await clipboard.writeText(text); return;
  } catch { /* Fall back to the user-initiated copy command, including HTTP LAN. */ }
  const focused = document.activeElement, field = document.createElement('textarea');
  const selection = document.getSelection?.();
  const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, i) => selection.getRangeAt(i).cloneRange()) : [];
  field.value = text; field.readOnly = true; field.tabIndex = -1;
  field.style.cssText = 'position:fixed;left:-10000px;top:0;opacity:0;';
  document.body.append(field);
  try { field.focus({ preventScroll: true }); field.select(); if (!document.execCommand('copy')) throw new Error('copy failed'); }
  catch { throw new Error('系统剪贴板暂不可用，请手动复制连接密钥'); }
  finally {
    field.remove(); focused?.focus?.({ preventScroll: true });
    if (selection) { selection.removeAllRanges(); for (const range of ranges) selection.addRange(range); }
  }
}
