// Design tokens shared across apps/web, apps/mobile, apps/admin.
//
// Owned by the figma-design-system agent (.claude/agents/figma-design-system.md).
// Do not hand-edit a colour value here without updating the corresponding
// Figma Variable first -- this file should always be a mechanical export of
// what Figma defines, not a second source of truth.
//
// Sprint D output. Mirrors Figma Variable collection "Soccernity Theme"
// (VariableCollectionId:5096:2, modes Light 5096:0 / Dark 5096:1) in the
// "Soccernity-MVP" file (key weZWWqggy9j13eX8bhFgs6), documented in the
// "Brand Guide -- Dark Mode Tokens (Sprint D)" frame (node 5100:2).
//
// Both brand hex values (#7BB929, #282E65) are unchanged from light to dark.
// Every other value here is either a lightness-only derivation of one of
// those two colours, or an alpha-only adjustment, per CLAUDE.md's brand
// colour rule -- see docs/sprint-d-design-tokens-report.md for full
// reasoning and contrast ratios.

export const colors = {
  light: {
    brandGreen: "#7BB929",
    brandNavy: "#282E65",
    backgroundPage: "#FFFFFF",
    backgroundSurface: "#FFFFFF",
    textPrimary: "#282E65",
    textSecondary: "rgba(40, 46, 101, 0.70)",
    textOnGreen: "#282E65",
    greenTint12: "rgba(123, 185, 41, 0.12)",
    greenTint28: "rgba(123, 185, 41, 0.28)",
    iconInactive: "rgba(40, 46, 101, 0.15)",
    overlayScrim: "rgba(40, 46, 101, 0.2775)",
    shadowAmbient: "rgba(40, 46, 101, 0.08)",
    shadowElevated: "rgba(40, 46, 101, 0.14)",
    shadowKey: "rgba(40, 46, 101, 0.12)",
    // semantic/alert (Figma VariableID:5670:8226, Decision Log #99): the one
    // founder-authorised exception to the two-colour palette. #FA0606 in both
    // modes. Error-callout accent only (bar / border / icon), never text or a
    // button fill (Decision Log #408 item 4, B-166).
    semanticAlert: "#FA0606",
  },
  dark: {
    brandGreen: "#7BB929",
    brandNavy: "#282E65",
    backgroundPage: "#0D0F21",
    backgroundSurface: "#161937",
    textPrimary: "#FFFFFF",
    textSecondary: "rgba(255, 255, 255, 0.60)",
    textOnGreen: "#282E65",
    greenTint12: "rgba(123, 185, 41, 0.20)",
    greenTint28: "rgba(123, 185, 41, 0.35)",
    iconInactive: "rgba(255, 255, 255, 0.15)",
    overlayScrim: "rgba(13, 15, 33, 0.65)",
    shadowAmbient: "rgba(13, 15, 33, 0.30)",
    shadowElevated: "rgba(13, 15, 33, 0.45)",
    shadowKey: "rgba(13, 15, 33, 0.55)",
    semanticAlert: "#FA0606",
  },
};

// ---------------------------------------------------------------------------
// Design foundations: radius, type, elevation, motion.
//
// Defaults approved by the founder on 2026-11-25 (veto-able). Mechanical
// mirror of the "Design foundations" Figma definitions: if a value changes,
// change Figma first, then this file and foundations.css together.
// foundations.test.ts (apps/web) fails if this file and foundations.css
// disagree. No existing stylesheet is migrated to these yet.
// ---------------------------------------------------------------------------

/** Corner radii in px. `legacy` values exist in old CSS and are not for new use. */
export const radius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  full: 999,
  /** 2 is for accent bars only; 10 is replaced by md (controls) or lg (containers). */
  legacy: [2, 10],
} as const;

/** Type scale: font size and line height in px. Minimum size for new work is 12. */
export const typeScale = {
  caption: { size: 12, line: 16 },
  bodySm: { size: 13, line: 20 },
  body: { size: 14, line: 22 },
  /** Admin sidebar nav labels. */
  nav: { size: 15, line: 20 },
  bodyLg: { size: 16, line: 24 },
  lead: { size: 18, line: 28 },
  titleSm: { size: 20, line: 28 },
  title: { size: 24, line: 32 },
  headline: { size: 32, line: 40 },
  display: { size: 44, line: 52 },
  /** Home hero only. */
  hero: { size: 62, line: 68 },
} as const;

/** Font stacks. Montserrat: hero, display, headline, title, titleSm on public web pages. Inter: everything else, all admin screens. */
export const fontFamily = {
  ui: '"Inter", -apple-system, "Segoe UI", Roboto, sans-serif',
  display: '"Montserrat", "Inter", -apple-system, "Segoe UI", Roboto, sans-serif',
} as const;

/** Elevation. Shadow colours only through the existing shadow colour tokens (--sn-shadow-*). */
export const elevation = {
  level0: "none",
  level1: "0 1px 3px var(--sn-shadow-ambient)",
  level2: "0 4px 16px var(--sn-shadow-elevated)",
  level3:
    "0 2px 6px var(--sn-shadow-ambient), 0 8px 24px var(--sn-shadow-elevated), 0 24px 56px var(--sn-shadow-key)",
} as const;

/**
 * Motion. Animate transform and opacity only (hover colour changes allowed).
 * Exits use the next shorter duration. Stagger at most `staggerMax` items.
 */
export const motion = {
  duration: { fast: 120, base: 200, slow: 320 }, // ms
  ease: {
    out: "cubic-bezier(0.22, 1, 0.36, 1)",
    in: "cubic-bezier(0.64, 0, 0.78, 0)",
    standard: "cubic-bezier(0.4, 0, 0.2, 1)",
    linear: "linear",
  },
  distance: { sm: 4, md: 8, lg: 16 }, // px
  staggerStep: 40, // ms
  staggerMax: 6,
} as const;

export type RadiusStep = Exclude<keyof typeof radius, "legacy">;
export type TypeStep = keyof typeof typeScale;
export type ElevationLevel = keyof typeof elevation;
export type MotionDuration = keyof typeof motion.duration;
