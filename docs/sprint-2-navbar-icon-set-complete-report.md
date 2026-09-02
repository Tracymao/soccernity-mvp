# Sprint 2 — Navbar icon set complete (Phase 1) report

**Branch:** `sprint-2/navbar-icon-set-complete` (from `origin/main`)
**Agent:** figma-design-system
**Date:** 2026-09-02
**Figma file:** `Soccernity-MVP` (`weZWWqggy9j13eX8bhFgs6`), page `Soccernity` (`0:1`)

**Phase 1 of a founder-directed correction.** The shipped app
(`apps/web/src/layout/Header.tsx` + `navigation.ts`) uses a **text-label
navbar built without instruction**, deviating from this file's own
icon-based navbar canon (`header 4` / `header 7`). This phase makes the
Figma icon navbars **complete and correct** — logged-out and logged-in,
desktop and mobile — before any code changes. **`apps/web` was NOT
touched.** Phase 2 (a separate `figma-to-code` follow-up) replaces the
text-label nav in code and fixes runtime auth-state switching.

---

## 1. What was built

### 1a. Desktop — "Clubs" icon added to `header 4` and `header 7`

Both desktop navbar variants carry the identical content-nav row (`Frame
5858` — `2838:3517` on `header 4`, `2841:4115` on `header 7`): a
`HORIZONTAL` auto-layout, `gap: 30`, of five bespoke hand-drawn icon
GROUPs (`livescore`/Sports Hub, `blog`/News, `community`, `leaderboad`,
`banter`) plus one hidden `home`. A **sixth icon, `clubs`, was appended**
to both rows (kept in sync — same content nav regardless of auth state,
matching the existing 5-icon precedent exactly).

- **Route target:** `/clubs`.
- **Glyph:** a **shield / club-crest** outline — see Decision Log #159
  for why this glyph and not another.
- **Style:** matches the other five exactly — navy (`brand/navy`,
  `VariableID:5096:4`) line-art, `strokeWeight: 1.5`, round caps, on a
  31×31 `cornerRadius: 3` **`brand/green-tint` 12%** (`VariableID:5096:5`)
  rounded square. Drawn as a GROUP named `clubs`, same as its siblings.
- **Coverage:** `header 4` has **48** live instances, `header 7` has
  **9** — all now show the Clubs icon automatically.

### 1b. Mobile — new `Bottom Navigation — Mobile` component

`header 4 — mobile` (`5386:6576`) and `header 7 — mobile` (`5386:6575`)
were **confirmed to have no content-nav icon row at all** — only logo +
search + auth cluster, in a 64px bar. There is no room for a 6-icon nav
inline.

Built a **new standalone component `Bottom Navigation — Mobile`
(`5863:9505`)**: 428 × 64, `color/background/surface` ground
(`VariableID:5096:7`), a 1px `color/icon/inactive` top divider
(`VariableID:5097:2`), `HORIZONTAL` `SPACE_BETWEEN` auto-layout, holding
**the same six glyphs as the desktop set** — `livescore`, `blog`,
`community`, `leaderboard`, `banter` cloned verbatim from `header 4`'s own
nav row, plus the new `clubs`. Icon-only, same green-tint-square
treatment as desktop (no labels — see Decision Log #160). It is a
**sibling** component, not a variant of `Web app Navbar` (`2824:4309`) —
a bottom bar is structurally not one of that set's four top-bar variants,
and a `COMPONENT_SET` cannot hold a non-variant component.

See Decision Log **#160** for why a bottom bar and not the existing
one-off text-label Navigation Drawer.

Two **reference example frames** were composed to show the pairing:
`Example — header 4 — mobile (logged-in) + Bottom Navigation`
(`5864:9505`) and `Example — header 7 — mobile (logged-out) + …`
(`5864:9592`) — a 428-wide phone canvas with the top navbar instance,
placeholder page content, and the bottom nav instance.

### 1c. Auth-cluster correctness — confirmed on all four variants

**The brief's premise here was stale.** It described `Component 20`
(`2838:3579`) on `header 4` as "a bare, unstyled ellipse placeholder, not
a real avatar/dropdown." In fact it is a real **instance of the `Avatar`
`COMPONENT_SET`** (`5685:9241`, variant `Has Unread=false` /
`2819:4090`), with a photo `IMAGE` fill — established by PR #113–#115
(Decision Log #99–#103, "the avatar IS the notification indicator;
clicking opens the account dropdown"). `Avatar (Has Unread=false)` has
**109 live instances** across the file.

All four variants already carry the correct auth cluster — **nothing
needed fixing**:

| Variant | Right-side cluster | Correct? |
|---|---|---|
| `header 4` (desktop, logged-in) | messages glyph (`Group 835`) + `Avatar` instance | ✅ |
| `header 7` (desktop, logged-out) | navy `Login` button (`Frame 5805`) | ✅ |
| `header 4 — mobile` (logged-in) | search + messages glyph + `Avatar` instance | ✅ |
| `header 7 — mobile` (logged-out) | search + `Login` button | ✅ |

The runtime logic that *switches* `header 4` ↔ `header 7` by session
state is a **code task (Phase 2)**, not a design gap.

---

## 2. Judgment calls (flagged as Decision Log candidates)

### #159 — "Clubs" nav-icon glyph

No "Clubs" icon existed anywhere to reuse. The five existing nav icons
are **bespoke hand-drawn navy line-art** on a green-tint square (their
frame names — `ion:football-outline`, `akar-icons:search` — hint at
Iconify origins, but they've been redrawn as flattened vector groups, not
kept as an icon-component library). Chose a **shield / club-crest**
outline drawn in that identical style. Conservative and reversible: the
*visual treatment* matches exactly; only the glyph is new. **Open:**
whether a shield is the right symbol for "Clubs" (vs. a scarf, a
group-of-people — too close to Community, or a stadium), and whether the
whole nav-icon set should eventually move to a real shared
icon-component library instead of staying bespoke groups.

### #160 — Mobile primary-nav placement

The file's **only** existing mobile primary-nav pattern is a one-off
left slide-out **Navigation Drawer** (`5703:8320`, inside
`Community — Home Feed (Navigation Drawer Open) — Mobile` `5703:8250`) —
a **text-label** list (Home / Community / Sports Hub / Bants /
Leaderboard / Messages / Notifications / Profile / Settings / Log out),
**not a component**, and with **no Clubs entry**. No bottom tab bar
exists anywhere in the file.

Chose to build a new **`Bottom Navigation — Mobile` component** rather
than (a) extend the one-off drawer — which is itself the kind of
text-label nav this whole correction is undoing — or (b) cram six icons
into the 64px top bar (no room). A bottom bar is the standard mobile
primary-nav pattern, lets mobile genuinely mirror the desktop icon set,
and keeps the top bar uncluttered. **Open:** bottom bar vs. a redesigned
*icon* drawer as the long-term pattern; whether the bottom bar should
gain text labels; and reconciling the existing drawer (`5703:8320`) with
this (update it to match, or retire it).

### #161 — Phase 1 of the founder-directed text-label-nav correction

`apps/web`'s `Header.tsx` / `navigation.ts` is a text-label nav built
without instruction, off-canon from `header 4` / `header 7`. **Phase 1
(this PR):** complete the Figma icon navbars (desktop Clubs icon + real
mobile content-nav) and confirm the auth-cluster design. **Phase 2
(separate `figma-to-code` follow-up):** replace `apps/web`'s
`Header.tsx` / `navigation.ts` with the icon navbar, wire
`Bottom Navigation — Mobile` on mobile, add `/clubs` to the nav, and
implement runtime `header 4` ↔ `header 7` auth-state switching. **No
`apps/web` file was touched in Phase 1.**

---

## 3. Standing rules — verification

- **Palette:** `brand/navy` (`5096:4`), `brand/green` (`5096:3`),
  `brand/green-tint` 12% (`5096:5`), `color/background/surface`
  (`5096:7`), `color/icon/inactive` (`5097:2`) only. **No
  `brand/green-tint-28`. No new colours.**
- **Light mode only.**
- **0 unbound / 0 off-palette paints** on every node authored here —
  audited node-by-node across the two `clubs` GROUPs, the
  `Bottom Navigation — Mobile` component and its children, and the two
  example frames. The Clubs shield's `createNodeFromSvg` output was
  explicitly re-bound (all strokes → `brand/navy`, all fills cleared)
  during construction, per this file's known
  `createNodeFromSvg`-leaves-unbound-black-strokes gotcha. The only
  paints the audit flagged are **pre-existing component internals**
  surfaced through demo instances (the `Avatar` component's photo `IMAGE`
  fill; the existing `header 7 — mobile` Login text's colour, bound to a
  variable from another collection — `VariableID:5182:6654`) — neither is
  a node this task authored, and the Login-text observation is noted for
  whoever next touches that pre-existing component, not fixed here.
- **Reuse:** the five mobile-nav glyphs are exact clones of `header 4`'s
  own nav-row icons; the `Avatar` cluster was confirmed already-correct,
  not rebuilt.

### `Old — Mobile App Nav Icons` (`2230:4328`) — dead-check

**2 live instances, both on the `dump` scratch page** (`Property 1=home`
variant, inside `iPhone 11 Pro / X - 3` and `- 5`). **Zero on page
`0:1`.** Treated as fully dead for real content; its 7-icon set
(home/fixture/leaderboard/settings/news/message/notification) was **not**
reused — mobile nav was built to match the *current* desktop 6-icon set.

---

## 4. `apps/web` was NOT touched

Confirmed — this PR changes only Figma (via the plugin API), this report,
`CLAUDE.md`, and the Build Plan Decision Log. Code conversion — replacing
`Header.tsx` / `navigation.ts` with the icon navbar, wiring the bottom
nav, adding `/clubs` to nav, and fixing runtime auth-state switching — is
**Phase 2**, a separate `figma-to-code` follow-up.

---

## 5. Deliverables checklist

- [x] `header 4` + `header 7` desktop navbars updated with a Clubs icon,
      kept in sync
- [x] `header 4 — mobile` + `header 7 — mobile` given a real content-nav
      via the new `Bottom Navigation — Mobile` component (6-icon set)
- [x] Auth-cluster correctness confirmed on all four variants (stale
      brief premise corrected; nothing needed fixing)
- [x] This report
- [x] CLAUDE.md updated in the same PR (new dated bullet)
- [x] Build Plan Decision Log updated in the same PR — rows #159–#161
- [x] Branch from `origin/main` → commit → push → open PR against
      `main`, **do not merge**
