// CSS custom properties for the Verify Email screens (F7,
// VerifyEmailPage.tsx), sourced from packages/shared's design tokens --
// never hardcoded hex, per CLAUDE.md.
//
// Figma frames confirmed dark-token (get_variable_defs match against
// packages/shared/src/tokens/index.ts's own `dark` palette exactly, the
// same clean-reuse situation consentThemeVars.ts already documented for
// its own flow): "Verify Email -- 1 Verifying" (5143:6635), "-- 2
// Verified" (5143:6648), "-- 3 Link Invalid Or Expired" (5143:6661),
// "-- 4 Missing Token" (5143:6674).
//
// Same technique guardian-consent/consentThemeVars.ts already established
// (scope the token values as component-local CSS variables, since
// src/theme/applyTheme.ts only drives ONE app-wide mode) -- deliberately a
// *separate* file rather than reusing consentThemeVars.ts directly, since
// that file's own header comment scopes it to the guardian-consent flow
// specifically, even though the underlying token values (colors.dark) are
// identical. Every distinct route/flow gets its own scoped theme-vars file.
import type { CSSProperties } from "react";
import { colors } from "@soccernity/shared";

export const darkVerifyThemeVars = {
  "--verify-bg": colors.dark.backgroundPage,
  "--verify-surface": colors.dark.backgroundSurface,
  "--verify-text-primary": colors.dark.textPrimary,
  "--verify-text-secondary": colors.dark.textSecondary,
  "--verify-brand-green": colors.dark.brandGreen,
  "--verify-brand-navy": colors.dark.brandNavy,
  "--verify-text-on-green": colors.dark.textOnGreen,
  "--verify-green-tint": colors.dark.greenTint12,
  "--verify-green-tint-28": colors.dark.greenTint28,
  "--verify-icon-inactive": colors.dark.iconInactive,
} as unknown as CSSProperties;
