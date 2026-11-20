// CSS custom properties for the signup entry flow (Age Gate, Guardian Details,
// Register, and Create Profile, which reuses the same shell), sourced from
// packages/shared's design tokens -- never hardcoded hex, per CLAUDE.md.
//
// LIGHT theme throughout (build register B-127, Decision Log #406 item 2): the
// Age Gate / Guardian Details frames (5108:6626, 5108:6627) are a light left
// panel with a navy safeguarding panel on the right, and the app runs
// light-only. Those two steps used to be built from `colors.dark` (an earlier
// state of the frames), via a separate `darkAuthThemeVars`.
//
// Why component-local variables instead of the global `--sn-*` ones from
// src/theme/applyTheme.ts: this flow predates that mechanism and scopes its own
// set, which also keeps the Register step's older Figma frame (407:1051, raw
// indigo fills outside the two-colour palette, CLAUDE.md non-negotiable #3)
// mapped onto brand navy rather than invented hex. The grey input fill that
// frame used is gone: fields are white with the token border, as drawn on the
// Age Gate frame (QA D-14).
import type { CSSProperties } from "react";
import { colors } from "@soccernity/shared";

export const lightAuthThemeVars = {
  "--signup-bg": colors.light.backgroundPage,
  "--signup-surface": colors.light.backgroundSurface,
  "--signup-text-primary": colors.light.textPrimary,
  "--signup-text-secondary": colors.light.textSecondary,
  "--signup-brand-green": colors.light.brandGreen,
  "--signup-brand-navy": colors.light.brandNavy,
  "--signup-text-on-green": colors.light.textOnGreen,
  "--signup-green-tint": colors.light.greenTint12,
  "--signup-icon-inactive": colors.light.iconInactive,
} as unknown as CSSProperties;
