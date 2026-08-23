// CSS custom properties for the two guardian-consent screens (F5,
// GuardianConsentPage.tsx / GuardianConsentConfirmPage.tsx), sourced from
// packages/shared's design tokens -- never hardcoded hex, per CLAUDE.md.
//
// Both Figma frames (5108:6629 "Web Consent Confirmation", 5108:6630
// "Restricted Pending State", 5108:6631 "Activation Confirmation") are
// drawn against the dark-token palette (bg #0D0F21, surface #161937, etc)
// -- confirmed via get_variable_defs, and every one of those hex values is
// an exact match for packages/shared/src/tokens/index.ts's own `dark`
// palette (not an off-brand substitution the way Login/ForgotPassword's
// frames needed -- see Auth.css's header comment for that unrelated,
// separate issue). So this is a clean reuse of the real Sprint D dark
// tokens, not an invented one.
//
// Same technique authThemeVars.ts already established for the signup entry
// flow (scope the token values as component-local CSS variables, since
// src/theme/applyTheme.ts only drives ONE app-wide mode and main.tsx calls
// applyTheme("light") with no toggle UI yet) -- deliberately a *separate*
// file rather than reusing authThemeVars.ts directly, since that file's own
// header comment scopes it to "the signup entry flow" specifically and
// these are a different route/flow entirely, even though the underlying
// token values are identical.
import type { CSSProperties } from "react";
import { colors } from "@soccernity/shared";

export const darkConsentThemeVars = {
  "--consent-bg": colors.dark.backgroundPage,
  "--consent-surface": colors.dark.backgroundSurface,
  "--consent-text-primary": colors.dark.textPrimary,
  "--consent-text-secondary": colors.dark.textSecondary,
  "--consent-brand-green": colors.dark.brandGreen,
  "--consent-brand-navy": colors.dark.brandNavy,
  "--consent-text-on-green": colors.dark.textOnGreen,
  "--consent-green-tint": colors.dark.greenTint12,
  "--consent-green-tint-28": colors.dark.greenTint28,
  "--consent-icon-inactive": colors.dark.iconInactive,
} as unknown as CSSProperties;
