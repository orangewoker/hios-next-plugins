const TOKEN_PROPERTIES: Record<string, string> = {
  background: '--hios-background', surface: '--hios-surface', muted: '--hios-muted',
  control: '--hios-control', text: '--hios-text', textSecondary: '--hios-text-secondary',
  textMuted: '--hios-text-muted', border: '--hios-border', accent: '--hios-accent',
  accentSoft: '--hios-accent-soft',
};
// Theme packets are complete snapshots. Remove absent tokens so a light/dark
// change or an older host cannot leave stale colors from the previous theme.
export function applyThemeTokens(
  style: Pick<CSSStyleDeclaration, 'setProperty' | 'removeProperty'>,
  tokens: Record<string, unknown> = {},
  isColor: (value: string) => boolean = value => CSS.supports('color', value),
) {
  for (const [key, property] of Object.entries(TOKEN_PROPERTIES)) {
    const value = tokens?.[key];
    if (typeof value === 'string' && value.trim() && isColor(value.trim())) style.setProperty(property, value.trim());
    else style.removeProperty(property);
  }
}
