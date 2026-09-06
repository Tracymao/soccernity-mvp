// Bridges @soccernity/shared's design tokens (Sprint D output, mirrored
// from the Figma "Soccernity Theme" variable collection) into CSS custom
// properties apps/admin components read via `var(--sn-*)`.
//
// This is a deliberate copy of apps/web/src/theme/applyTheme.ts's mapping,
// not a shared import: apps/web and apps/admin are separate Vite builds
// with separate bundles, and the CSS-var bridge is a per-app concern (the
// token *values* are shared via @soccernity/shared/colors; the DOM
// application is not). Keeping this local avoids coupling the two apps'
// bootstrap code.
//
// Only "light" is wired up. Dark-mode token values exist in
// @soccernity/shared but there is no mode-switch UI in the Admin Console
// and none is planned for this pillar — the console is an internal
// desktop ops tool. `--sn-text-on-navy` is defined statically as #FFFFFF
// in global.css (it is white in both Figma modes; a future dark-mode
// admin would move it here).
import { colors } from "@soccernity/shared";

export type AdminThemeMode = keyof typeof colors;

type Palette = (typeof colors)[AdminThemeMode];

const CSS_VAR_MAP: Record<keyof Palette, string> = {
  brandGreen: "--sn-brand-green",
  brandNavy: "--sn-brand-navy",
  backgroundPage: "--sn-background-page",
  backgroundSurface: "--sn-background-surface",
  textPrimary: "--sn-text-primary",
  textSecondary: "--sn-text-secondary",
  textOnGreen: "--sn-text-on-green",
  greenTint12: "--sn-green-tint-12",
  greenTint28: "--sn-green-tint-28",
  iconInactive: "--sn-icon-inactive",
};

export function applyAdminTheme(mode: AdminThemeMode = "light"): void {
  const palette = colors[mode];
  const root = document.documentElement;

  (Object.keys(palette) as Array<keyof Palette>).forEach((key) => {
    root.style.setProperty(CSS_VAR_MAP[key], palette[key]);
  });

  root.dataset.theme = mode;
}
