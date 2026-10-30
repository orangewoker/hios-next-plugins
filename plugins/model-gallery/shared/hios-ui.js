/* HIOS plugin UI v1. Additive, passive theme consumer; no bridge messages. */
(() => {
  const pluginId = document.currentScript?.dataset.pluginId;
  let origin, identity;
  const colors = {background:'background',surface:'surface',muted:'muted',control:'control',text:'text',textSecondary:'text-secondary',textMuted:'text-muted',border:'border',accent:'accent',accentContrast:'accent-contrast',accentSoft:'accent-soft',positive:'positive',negative:'negative'};
  const dimensions = {radiusControl:'radius-control',radiusPanel:'radius-panel',controlHeight:'control-height',gap:'gap',padding:'padding'};
  window.addEventListener('message', event => {
    const msg = event.data;
    if (event.source !== parent || !msg || !['hios-plugin-node/v1','hios-plugin-app/v1'].includes(msg.protocol)) return;
    if (msg.pluginId && pluginId && msg.pluginId !== pluginId) return;
    const key = `${msg.protocol}:${msg.nodeId || msg.appId || ''}`;
    if (origin !== undefined && (event.origin !== origin || identity !== key)) return;
    if (!['init','theme'].includes(msg.type)) return;
    const theme = msg.payload?.theme;
    if (!theme || !['dark','light'].includes(theme.mode)) return;
    if (origin === undefined) { if (msg.type !== 'init') return; origin = event.origin; identity = key; }
    const el = document.documentElement;
    el.dataset.theme = theme.mode;
    el.style.colorScheme = theme.mode;
    for (const [name, variable] of Object.entries(colors)) {
      const value = theme.tokens?.[name];
      if (typeof value === 'string' && !/var\(|url\(/i.test(value) && CSS.supports('color', value)) el.style.setProperty(`--hios-${variable}`, value);
      else el.style.removeProperty(`--hios-${variable}`);
    }
    for (const [name, variable] of Object.entries(dimensions)) {
      const value = theme.design?.version === 1 ? theme.design[name] : undefined;
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 64) el.style.setProperty(`--hios-${variable}`, `${value}px`);
      else el.style.removeProperty(`--hios-${variable}`);
    }
  });
})();
