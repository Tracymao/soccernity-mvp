# Sprint D — Light/Dark Design Tokens + Housekeeping

Build Plan Section 6, Sprint D. Work done in Figma file "Soccernity-MVP"
(key `weZWWqggy9j13eX8bhFgs6`), page "Soccernity" (`0:1`), by the
`figma-design-system` agent. This document is the git-side record of that
Figma-only session; the source of truth remains the Figma Variables
themselves and the "Brand Guide — Dark Mode Tokens (Sprint D)" frame
(node `5100:2`).

## 1. Brand colours — verified in-file

Read directly from the Brand Guide swatch fills (not just their text labels):

- Navy swatch `2285:1203` ("Rectangle 212") = **`#282E65`**
- Green swatch `2285:1204` ("Rectangle 213") = **`#7BB929`**
- Green 12%-tint swatch `2285:1213` = `#7BB929` @ 12%

All three match their adjacent text labels. No third colour exists in the
Brand Guide.

## 2. Figma Variables created

Collection **"Soccernity Theme"** (`VariableCollectionId:5096:2`), modes
**Light** (`5096:0`) / **Dark** (`5096:1`).

| Variable | Light | Dark | Reasoning |
|---|---|---|---|
| `brand/green` | `#7BB929` | `#7BB929` | unchanged — passes contrast, see §3 |
| `brand/navy` | `#282E65` | `#282E65` | unchanged — used as a background/chip colour, not foreground-on-shifting-bg |
| `color/background/page` | `#FFFFFF` | `#0D0F21` | Navy = HSL(234.1°, 43.3%, 27.6%). Same hue+saturation, lightness reduced to 9% |
| `color/background/surface` | `#FFFFFF` | `#161937` | same hue+saturation, lightness 15% — one step lighter than page background |
| `color/text/primary` | `#282E65` | `#FFFFFF` | navy-on-navy-dark-bg = 1.5:1 (fails); flipped to white = 18.95:1 |
| `color/text/secondary` | `#282E65 @70%` | `#FFFFFF @60%` | pre-existing AA failure found in light mode (navy@50%-on-white = 2.88:1); raised to 70% → ≈5.0:1. Dark value chosen to match. |
| `color/text/on-green` | `#282E65` | `#282E65` | white-on-green = 2.38:1 (fails); navy-on-green = 5.28:1 (passes) |
| `brand/green-tint` (12%) | `#7BB929 @12%` | `#7BB929 @20%` | decorative badge fill, raised for visibility on dark bg (non-text, disclosed) |
| `brand/green-tint-28` | `#7BB929 @28%` | `#7BB929 @35%` | same reasoning, second recurring tint level (Header) |
| `color/icon/inactive` | `#282E65 @15%` | `#FFFFFF @15%` | inactive nav-icon tint, mirrors the text/primary flip |

Toggle verified programmatically: read back `valuesByMode` for all 10
variables and a spot-checked bound node (`1078:3764`, Navigation
background) — its `boundVariables.color` resolves to distinct Light/Dark
values, confirming a real variable-driven toggle rather than duplicated
frames.

## 3. Contrast findings

- **Green on new dark background**: `#7BB929` on `#0D0F21` = **7.95:1
  (AAA)** — no adjustment needed.
- **CTA text-on-green**: checked against actual green fills in
  Header/Navigation. White-on-green = 2.38:1 (fails); navy-on-green =
  5.28:1 (passes). `text/on-green` set to navy.
- **Fixed**: secondary/metadata text (navy@50% on white — "1.2k Replies",
  "Created By:") was 2.88:1, failing AA. Fixed via an alpha-only change to
  70% (≈5.0:1).
- **Found and fixed (follow-up commit)**: green was used as functional
  *text* (not the logo wordmark, which is exempt under WCAG's brand-name
  carve-out) on white backgrounds in the Sports Hub Match Details family
  — the "H2H" / "Standings" / "Video" tab labels, the "Match Summary"
  heading, and inline score numbers ("1 - 1", "1 - 0") across nodes
  `632:943`, `640:3737`, `667:151`, `667:1511`, `667:1952`. On
  investigation the fill wasn't literally hardcoded — it was bound to
  `brand/green` (`VariableID:5096:3`, `#7BB929` in both modes), which is
  functionally identical to hardcoding since it never varies and would
  not have adapted in dark mode either. All 25 affected TEXT nodes were
  rebound to the existing `color/text/primary` variable
  (`VariableID:5096:8`) instead — no new colour or token introduced.
  Verified by reading back `boundVariables.fills[0].color.id` on all 25
  nodes (all resolve to `5096:8`). Resulting contrast: navy `#282E65` on
  white = **12.58:1**, against a 4.5:1 AA threshold (all affected text is
  14.37–16px, below the large-text exemption) — passes AA and AAA. The
  correctly-green "Match" pill (white-on-green, a different token) and
  the inactive "Statistics"/"Lineups" sub-tab labels were confirmed
  untouched.

## 4. Components/screens touched

- **Navigation** (`1078:3761`, `1106:20`), **Header** (`2824:4309`),
  **Drop Down Components** (`1870:2753`, `2067:3006`, `2067:3176`),
  **language selector** (`2365:2033`): fill bindings applied across a
  consolidated pass.
- **Community** (Banter homepage family — `2256:6802` full-depth;
  `2459:5234`, `2459:7671`, `2459:10083`, `2459:12447` chrome-depth),
  **Sports Hub** (`205:2` full-depth flagship; `1009:673`, `632:943`,
  `640:3737`, `667:151`, `667:1511`, `667:1952`, `756:11`, `756:6433`,
  `760:11533` chrome-depth), **Admin Console** (`110:5` full-depth
  flagship Dashboard; `123:56`, `124:313`, `128:488`, `1658:2303`,
  `1658:2592`, `1658:2456`, `917:218`, `2072:5584`, `2155:1062`,
  `2094:994`, `361:553`, `916:2362`, `917:24`, `396:442`, `138:93`,
  `2349:1203`, `2355:4359`, `2363:2244`, `2363:3446` chrome-depth) — 35
  frames retouched. "Chrome-depth" passes bind top-level
  backgrounds/text/icons but don't recurse into every nested node of
  these large screens; a fully exhaustive per-node pass is a possible
  follow-up.
- Real club-crest colours found inside the Community home page template
  (e.g. `#034694`, `#ED1C24`, `#00A398`) were deliberately left untouched
  — not brand tokens. The underlying crest-licensing question is a
  separate legal/business flag, not a design-token issue.

## 5. Build Plan Section 10 housekeeping

- ✅ **All 22 duplicate "Settings"/"Settingd" frames renamed** with
  distinguishing, content-derived names — e.g. `2905:4798` → "Settings —
  Overview", `1620:13390` → "Settings — Manage Account (Delete/Deactivate
  Menu)" (this also fixes the "Settingd" typo).
- ✅ **All nine generic component sets renamed by function**:
  `1306:7149` → "Community Home Page Template", `1308:11643` →
  "Community Home Page (Instance)", `2074:5914` → "Video Thumbnail Hover
  State", `2130:3389` → "Promo/Contest Carousel Banner", `2230:4328` →
  "Bottom Nav Icon", `2358:8184` → "Task Card (Leaderboard/Schedule)",
  `2459:4841` → "Filter Tabs (All / My Bants)", `2819:4091` →
  "Notification Bell Icon", `2927:10195` → "Toggle Switch".
- ⬜ **Icon library standardization — not done.** Not one of the three
  items explicitly requested for this sprint, but listed in the agent's
  own mandate. An inventory across Nav/Header/Dropdown plus three sample
  screens found 15+ mixed iconify libraries in active use (akar-icons,
  fluent, ion, ic, ci, bx, ri, bi, icon-park-outline, heroicons,
  material-symbols, mdi, fontisto, uil, carbon, clarity,
  simple-line-icons, eva). A full swap to one library requires
  icon-by-icon equivalence judgment across the whole file and was not
  attempted this session to avoid silently breaking icon meaning.

## 6. Figma-side documentation

A new frame **"Brand Guide — Dark Mode Tokens (Sprint D)"** (`5100:2`) was
added directly below the existing Brand Guide swatches, with 10
variable-bound live swatches and the derivation/contrast-check/open-items
writeup mirrored in this document.

## 7. Open items for follow-up (not resolved this session)

1. **Decision needed**: neutral grey (`#D9D9D9`) has no dark-mode
   equivalent — out of this session's mandated scope (only
   background/surface/green were specified).
2. Icon library standardization (§5).
3. Optional: fully exhaustive (non-chrome-depth) retouch of the Sports
   Hub / Admin Console sibling frames.
4. Match Details real club-crest licensing — legal/business flag, not a
   design-token issue (§4).

~~The green-text-on-white AA failure in Sports Hub tab labels/scores~~ —
resolved in a follow-up commit on this branch; see §3.
