// CSS custom properties for the guardian-consent screens (GuardianConsentPage,
// GuardianConsentConfirmPage, CardVerificationPanel), sourced from
// packages/shared's design tokens -- never hardcoded hex, per CLAUDE.md.
//
// LIGHT theme (build register B-127, Decision Log #406 item 2): the Figma
// frames (5108:6629, 5108:6631, 5491:8241, 5501:8453 ...) were retrofitted to
// the light-mode tokens, and the whole app runs light-only. These screens used
// to be built from `colors.dark` (an earlier Sprint D state of the frames).
//
// Same technique authThemeVars.ts established (scope the token values as
// component-local CSS variables), kept as its own file because each distinct
// route/flow gets its own scoped theme-vars file even when the values match.
import type { CSSProperties } from "react";
import { colors } from "@soccernity/shared";

export const consentThemeVars = {
  "--consent-bg": colors.light.backgroundPage,
  "--consent-surface": colors.light.backgroundSurface,
  "--consent-text-primary": colors.light.textPrimary,
  "--consent-text-secondary": colors.light.textSecondary,
  "--consent-brand-green": colors.light.brandGreen,
  "--consent-brand-navy": colors.light.brandNavy,
  "--consent-text-on-green": colors.light.textOnGreen,
  "--consent-green-tint": colors.light.greenTint12,
  "--consent-green-tint-28": colors.light.greenTint28,
  "--consent-icon-inactive": colors.light.iconInactive,
} as unknown as CSSProperties;
