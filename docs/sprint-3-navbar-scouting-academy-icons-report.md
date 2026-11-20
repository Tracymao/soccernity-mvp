# Navbar Scouting + Academy icons — session report

`sprint-3/navbar-scouting-academy-icons` (figma-design-system, 2026-09-13). Figma
design only — no app/backend code. Decision Log #284.

## Task

Standing nav policy from this session: the 7-icon `Web app Navbar` COMPONENT_SET
is closed to new features by default — Community Groups went to the account
dropdown/drawer instead (Decision Log #282), not the navbar. Scouting and
Academy are the two explicitly reserved exceptions to that policy. This task
builds the two icons now, linked to a future Coming Soon destination, so the
reservation has a real artifact rather than sitting undocumented.

## What was verified before any edit

Per the task's own instruction not to assume the DL #272 Grassroots precedent
transfers, everything was re-confirmed live:

- `Frame 5858` (the icon row) is genuine `HORIZONTAL` auto-layout — `HUG`×`HUG`,
  `itemSpacing: 30` — on **both** live variants: `header 4` (`2838:3502`,
  icon row `2838:3517`) and `header 7` (`2841:4104`, icon row `2841:4115`).
  Confirmed via `layoutMode`/`primaryAxisSizingMode`/`itemSpacing` directly,
  not inferred from resolved coordinates.
- The two variants are protected from overflow by **two different
  mechanisms**, checked separately rather than assumed identical:
  - `header 4`'s root uses `primaryAxisAlignItems: SPACE_BETWEEN` against a
    **fixed** 1440px width. The right-side avatar cluster (`Frame 5880`) is
    `layoutPositioning: AUTO` but stays pinned to the right edge as the icon
    row's own gap shrinks.
  - `header 7`'s Login button (`Frame 5805`) is `layoutPositioning: ABSOLUTE`
    — fully decoupled from the icon row's auto-layout flow, fixed at
    `x: 1330.4` regardless of how much the row grows.
- Existing tinted-icon precedent (`clubs` `5861:9240`, `grassroots`
  `6412:18188`): each is a `GROUP` of a 31×31 `RECTANGLE` tile
  (`cornerRadius: 3`, fill bound to `VariableID:5096:5` = `brand/green-tint`
  @ 12%) plus a 24×24 `FRAME` (offset `x+3, y+3.5`, `clipsContent: true`)
  holding a single stroke-only `VECTOR` bound to `VariableID:5096:4` =
  `brand/navy`, `strokeWeight: 1.5`, `strokeCap`/`strokeJoin: ROUND`.

## What was built

Two new tinted-style icons, same construction technique as Clubs/Grassroots,
**not** the five baked-in-artwork icons (Sports Hub/Blog/Community/
Leaderboard/Bants):

- **Scouting** — binoculars (two connected barrels + focus-wheel ticks).
- **Academy** — a graduation cap (mortarboard diamond + band + tassel).

Built via `figma.createNodeFromSvg` (the same method used for the Apple
sign-in mark, Decision Log #159) from a small hand-written stroke-only SVG
(`viewBox="0 0 24 24"`), then every descendant vector/ellipse was re-bound —
strokes to `brand/navy`, fills cleared — rather than left as the SVG's
literal hex colour, per the standing `createVector`/`createNodeFromSvg`
unbound-stroke gotcha this file's notes already document.

Appended **last**, after `grassroots`, on both `Frame 5858` instances. Final
order on both variants: Sports Hub · Blog · Community · Leaderboard · Bants ·
Clubs · Grassroots · **Scouting** · **Academy**.

## Verification

- **Growth**: icon row 444.41px → 566.41px on both variants (two tiles ×
  (31 + 30 spacing) = 122px, exactly as predicted before building).
- **Clearance, re-measured after growth**: `header 4` → avatar cluster
  309.3px → 187.3px; `header 7` → Login button ~290px → 168.0px. Both
  confirmed clean via full-navbar screenshots — no overlap, no clipping.
- **Propagation**: checked all 8 live `header 7` instances and a diverse
  7-frame sample of the 95 live `header 4` instances (Settings, Create Post,
  Leaderboard, Contest, Grassroots, Sports Page, Homepage, Blog, Article
  Detail, the 3 Legal pages) — all show both new icons in the correct order
  with an identical 566.41px row width. One instance (inside the
  already-archived, hidden `ARCHIVED — Blog Page Desktop (superseded by
  ...)` frame) did not pick up the change — confirmed this is pre-existing,
  out-of-scope archived content (hidden, superseded, unrelated to this
  edit), not a propagation gap.
- **Hygiene**: zero stray top-level nodes left on the page after
  construction (`figma.group(..., page)` then `appendChild` into the icon
  row fully reparents, confirmed by re-scanning page-level children).
- Both icons are palette-only (`brand/green-tint` tile, `brand/navy`
  glyph) — no new colour, no `brand/green-tint-28`, Light mode only (this
  component has no dark-mode content to touch).

## Explicitly not done in this PR

- No Coming Soon destination screen was designed — that's
  `figma-screen-builder`'s separate, parallel task. Both icons currently
  have no prototype `NAVIGATE` wiring, matching how newly-added nav icons in
  this file are typically left until their destination frame exists.
- The mobile Navigation Drawer and both account dropdown components were
  **not** touched — Scouting/Academy are navbar-only, unlike Community
  Groups (Decision Log #282).
- No Discover- or Careers-pillar schema, endpoint, or application code was
  touched or implied — non-negotiable #4 and Decision Log #3 (Phase 2, not
  MVP-blocking) stand unchanged.

## Standing policy, confirmed in writing

The 9-icon `Web app Navbar` COMPONENT_SET is now fully populated and closed
to further additions by default. Scouting and Academy were its last two
reserved slots. Any future pillar or account-adjacent feature defaults to
the account dropdown/drawer (the Community Groups precedent, Decision Log
#282), not the navbar.
