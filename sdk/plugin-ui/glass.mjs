import fs from 'node:fs';

/** Compile explicit plugin selectors, without a global button/input reset. */
export function renderGlass(config) {
  // color-grade already owns the accepted material and editor-specific geometry.
  if (config.glass?.local) return '/* Existing editor glass.css remains authoritative. */\n';
  if (!config.glass) throw new Error('Missing explicit glass adapter');
  const groups = {...config.glass};
  const controls = `:is(${config.controls || '.hios-control'})`;
  groups.buttons = [controls + ':is(button,summary)', groups.buttons].filter(Boolean).join(',');
  groups.fields = [controls + ':is(input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]),textarea,select)', groups.fields].filter(Boolean).join(',');
  groups.interactive = ['buttons','fields','ranges','switches'].map(k=>groups[k]).filter(Boolean).join(',');
  // Menu options must not inherit generic button state/geometry (specificity differs per plugin).
  if(groups.options) groups.buttons = `:is(${groups.buttons}):not(:where(${groups.options}))`;
  const template=fs.readFileSync(new URL('./glass.css',import.meta.url),'utf8');
  return template.replace(/:--([a-z]+)/g,(_,key)=>groups[key] ? `:root body :is(${groups[key]})` : ':root body :not(*)');
}
