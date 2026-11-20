// CSS custom properties for the Verify Email screens (VerifyEmailPage,
// VerifyEmailPromptPage), sourced from packages/shared's design tokens --
// never hardcoded hex, per CLAUDE.md.
//
// LIGHT theme (build register B-127, Decision Log #406 item 2): the Figma
// frames ("Verify Email -- 1 Verifying" 5143:6635 ... and the prompt family
// 6750:29378) are light, and the whole app runs light-only. These screens used
// to be built from `colors.dark`.
//
// Same technique as guardian-consent/consentThemeVars.ts, kept as its own file
// because each distinct route/flow gets its own scoped theme-vars file.
import type { CSSProperties } from "react";
import { colors } from "@soccernity/shared";

export const verifyThemeVars = {
  "--verify-bg": colors.light.backgroundPage,
  "--verify-surface": colors.light.backgroundSurface,
  "--verify-text-primary": colors.light.textPrimary,
  "--verify-text-secondary": colors.light.textSecondary,
  "--verify-brand-green": colors.light.brandGreen,
  "--verify-brand-navy": colors.light.brandNavy,
  "--verify-text-on-green": colors.light.textOnGreen,
  "--verify-green-tint": colors.light.greenTint12,
  "--verify-green-tint-28": colors.light.greenTint28,
  "--verify-icon-inactive": colors.light.iconInactive,
} as unknown as CSSProperties;
