// Small helper so a colour the codebase needs but the shared token file
// (packages/shared/src/tokens/index.ts) doesn't define yet -- e.g. a
// light-mode input fill -- is still *derived* from one of the two brand
// colours per CLAUDE.md's brand-colour rule, instead of a hand-picked hex
// value invented in this file. See authThemeVars.ts for where this is used
// and why.
export function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  const r = parseInt(normalized.substring(0, 2), 16);
  const g = parseInt(normalized.substring(2, 4), 16);
  const b = parseInt(normalized.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
