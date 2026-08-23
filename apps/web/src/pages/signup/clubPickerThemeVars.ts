// CSS custom properties for the Club Picker step of signup (rendered from
// RegisterStep's success view -- see ClubPickerStep.tsx's own header
// comment), sourced from packages/shared's design tokens -- never
// hardcoded hex, per CLAUDE.md.
//
// Figma frames confirmed dark-token (get_variable_defs match against
// packages/shared/src/tokens/index.ts's own `dark` palette exactly):
// "Club Picker -- 1 Loaded List" (5146:6635), "-- 2 Club Joined"
// (5146:6648), "-- 3 Join Failed (Inline Error)" (5146:6661), "-- 4 No
// Clubs Match Filter" (5146:6674), "-- 5 Load More Loading" (5146:6687).
//
// Same technique guardian-consent/consentThemeVars.ts and
// verify-email/verifyEmailThemeVars.ts already established -- deliberately
// its own file rather than reusing either of those (or the pre-existing
// signup/authThemeVars.ts, whose --signup-* variables are LIGHT-themed and
// no longer what this component uses -- see ClubPickerStep.css's own
// header comment for the full shell/theme retrofit this replaces). Every
// distinct route/flow gets its own scoped theme-vars file even when the
// underlying token values (colors.dark) are identical to another flow's.
import type { CSSProperties } from "react";
import { colors } from "@soccernity/shared";

export const darkClubPickerThemeVars = {
  "--picker-bg": colors.dark.backgroundPage,
  "--picker-surface": colors.dark.backgroundSurface,
  "--picker-text-primary": colors.dark.textPrimary,
  "--picker-text-secondary": colors.dark.textSecondary,
  "--picker-brand-green": colors.dark.brandGreen,
  "--picker-text-on-green": colors.dark.textOnGreen,
  "--picker-green-tint-28": colors.dark.greenTint28,
  "--picker-icon-inactive": colors.dark.iconInactive,
} as unknown as CSSProperties;
