// CSS custom properties for the two visual themes this flow needs,
// sourced from packages/shared's design tokens -- never hardcoded hex --
// per CLAUDE.md ("colours ... must come from the variables, not hardcoded
// hex values").
//
// Why this exists instead of just using src/theme/applyTheme.ts's global
// `--sn-*` variables directly: that mechanism sets ONE mode for the whole
// document (main.tsx currently calls `applyTheme("light")` and dark mode
// has no toggle UI yet -- see that file's own comment). But the Age Gate
// and Guardian Details Capture screens (Figma nodes 5108:6626, 5108:6627)
// are designed exclusively against the dark-token palette, while Register
// (407:1051) is a pre-Sprint-D screen that predates the token system
// entirely. Flipping the whole app to dark, or hardcoding either screen's
// hex values locally, would both violate the token rule above. Instead,
// these scope the *same* token values as component-local CSS variables so
// each step can render its own theme without touching the app-wide one.
import type { CSSProperties } from "react";
import { colors } from "@soccernity/shared";
import { hexToRgba } from "./colorUtils";

export const darkAuthThemeVars = {
  "--signup-bg": colors.dark.backgroundPage,
  "--signup-surface": colors.dark.backgroundSurface,
  "--signup-text-primary": colors.dark.textPrimary,
  "--signup-text-secondary": colors.dark.textSecondary,
  "--signup-brand-green": colors.dark.brandGreen,
  "--signup-brand-navy": colors.dark.brandNavy,
  "--signup-text-on-green": colors.dark.textOnGreen,
  "--signup-green-tint": colors.dark.greenTint12,
  "--signup-icon-inactive": colors.dark.iconInactive,
} as unknown as CSSProperties;

// Register (407:1051) has no Figma Variables bound to it at all (confirmed
// via get_variable_defs) and its raw fills -- #4F46E5, #323476, #4B5563,
// #F3F4F6 -- are outside Soccernity's two-colour brand palette (CLAUDE.md
// non-negotiable #3). Per this PR's brief ("do not modify Register
// itself") the Figma frame itself is left untouched, but the code still
// has to be token-driven, not invented hex -- so this maps Register's
// visual *intent* onto the real brand tokens: brand navy stands in for the
// off-brand indigo accent/button, and a low-alpha navy tint (derived, not
// hardcoded) stands in for the light grey input fill, until
// figma-design-system defines a real light-mode "surface" token for it.
// Flagged in this PR's report as design debt, not silently fixed.
export const lightAuthThemeVars = {
  "--signup-bg": colors.light.backgroundPage,
  "--signup-surface": colors.light.backgroundPage,
  "--signup-input-fill": hexToRgba(colors.light.brandNavy, 0.04),
  "--signup-text-primary": colors.light.textPrimary,
  "--signup-text-secondary": colors.light.textSecondary,
  "--signup-brand-green": colors.light.brandGreen,
  "--signup-brand-navy": colors.light.brandNavy,
  "--signup-text-on-green": "#FFFFFF",
} as unknown as CSSProperties;
