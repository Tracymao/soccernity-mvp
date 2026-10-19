// CSS custom properties for the Club Picker step of signup (see
// ClubPickerStep.tsx), sourced from packages/shared's design tokens -- never
// hardcoded hex, per CLAUDE.md.
//
// LIGHT theme (build register B-127, Decision Log #406 item 2): the Club
// Picker frames (5146:6635 ...) are light, and the whole app runs light-only.
// This step used to be built from `colors.dark`.
//
// Same technique as guardian-consent/consentThemeVars.ts, kept as its own file
// because each distinct route/flow gets its own scoped theme-vars file.
import type { CSSProperties } from "react";
import { colors } from "@soccernity/shared";

export const clubPickerThemeVars = {
  "--picker-bg": colors.light.backgroundPage,
  "--picker-surface": colors.light.backgroundSurface,
  "--picker-text-primary": colors.light.textPrimary,
  "--picker-text-secondary": colors.light.textSecondary,
  "--picker-brand-green": colors.light.brandGreen,
  "--picker-brand-navy": colors.light.brandNavy,
  "--picker-text-on-green": colors.light.textOnGreen,
  "--picker-green-tint": colors.light.greenTint12,
  "--picker-green-tint-28": colors.light.greenTint28,
  "--picker-icon-inactive": colors.light.iconInactive,
} as unknown as CSSProperties;
