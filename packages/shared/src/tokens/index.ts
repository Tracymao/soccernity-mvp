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
  },
};
