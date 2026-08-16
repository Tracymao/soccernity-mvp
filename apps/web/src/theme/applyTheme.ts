// Bridges @soccernity/shared's design tokens (Sprint D output, mirrored
// from the Figma "Soccernity Theme" variable collection) into CSS custom
// properties the rest of apps/web reads from.
//
// Do not hardcode colour values in components -- add a mapping entry here
// once, then reference `var(--sn-*)` everywhere else. That's what keeps a
// future token change (e.g. a contrast fix in packages/shared) applying
// across the app without a second pass through every screen.
//
// Only "light" is wired up as the active theme for this PR -- dark mode
// *tokens* exist (see packages/shared/src/tokens/index.ts) but there is no
// UI yet to choose/persist a mode. That's follow-up work, not part of the
// Sprint 1 app-shell foundation.
import { colors } from "@soccernity/shared";

export type ThemeMode = keyof typeof colors;

type Palette = (typeof colors)[ThemeMode];

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

export function applyTheme(mode: ThemeMode = "light"): void {
  const palette = colors[mode];
  const root = document.documentElement;

  (Object.keys(palette) as Array<keyof Palette>).forEach((key) => {
    root.style.setProperty(CSS_VAR_MAP[key], palette[key]);
  });

  root.dataset.theme = mode;
}
