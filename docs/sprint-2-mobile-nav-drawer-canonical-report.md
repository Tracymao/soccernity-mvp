# Sprint 2 — Mobile nav drawer promoted to canonical report

**Branch:** `sprint-2/mobile-nav-drawer-canonical` (from `origin/main`)
**Agent:** figma-design-system
**Date:** 2026-09-02
**Figma file:** `Soccernity-MVP` (`weZWWqggy9j13eX8bhFgs6`), page `Soccernity` (`0:1`)

Redirects **Decision Log #160**'s mobile-nav answer. PR #144 built a
`Bottom Navigation — Mobile` icon-row (`5863:9505`) as its conservative
choice for #160 — that work is **kept, not deleted**, but **retagged**:
it's the right pattern for a future native iOS/Android app, not the
current mobile *web* build. The mobile-web answer is the **slide-in
navigation drawer** already partially designed in one Community screen,
now promoted to a real reusable component. `apps/web` was **NOT
touched** — Figma only, same as PR #144.

---

## 1. Retagged (artwork untouched) — PR #144's icon-row

| Node | Old name | New name |
|---|---|---|
| `5863:9505` (COMPONENT) | `Bottom Navigation — Mobile` | `Bottom Navigation — Mobile App Nav (Reserved — Native iOS/Android)` |
| `5864:9505` (FRAME) | `Example — header 4 — mobile … + Bottom Navigation` | `Reserved (Native App) — header 4 — mobile + Bottom Navigation icon-row` |
| `5864:9592` (FRAME) | `Example — header 7 — mobile … + Bottom Navigation` | `Reserved (Native App) — header 7 — mobile + Bottom Navigation icon-row` |
| `5867:9662` (label) | — | copy rewritten to "RESERVED FOR A FUTURE NATIVE iOS/ANDROID APP …" |
| `5864:9670` (caption) | — | copy rewritten to point at the drawer as the current answer |

The component's `description` now states it is reserved for a future
native app. **No icon artwork or layout was changed** — the 6-icon set,
spacing, bindings, and top divider are exactly as PR #144 shipped them.

---

## 2. Navigation Drawer promoted to a real, reusable COMPONENT

**Before:** the drawer existed as a single one-off FRAME (`5703:8320`)
nested inside one Community screen (`Community — Home Feed (Navigation
Drawer Open) — Mobile`, `5703:8250`), alongside a sibling `Scrim` rect.
Nothing else instanced or linked to it.

**After:** a new standalone **`Navigation Drawer — Mobile` COMPONENT
(`5870:10689`)** — 390 × 844, `clipsContent`, holding:

- **`Scrim`** (`5870:10690`) — full-bleed, `ON_CLICK → CLOSE` (tap to
  dismiss). See §5 for the fill treatment.
- **`Panel`** (`5870:10692`) — the 268px white drawer, cloned verbatim
  from `5703:8320` so every existing node, style, and variable binding
  carries over: logo, identity block (`Signed in as` — avatar initials +
  name + handle), the nav list, a divider, `Log out`.

The one-off screen `5703:8250` now renders a single
**`Navigation Drawer — Mobile` instance** (`5874:10690`,
absolute-positioned at 0,0) in place of its old inline scrim + drawer —
the pattern is no longer scoped to that one frame. Future mobile screens
instance this component the same way every mobile screen already
instances `header 4 — mobile`.

---

## 3. "Clubs" added to the drawer's nav list

A new **`Nav — Clubs`** item (`5870:10735`) was cloned from `Nav — Sports
Hub` (an inactive item) so it matches the exact marker-dot + text-row
structure of the other items: a 6px `Marker` ellipse bound to
`color/icon/inactive`, "Clubs" text (Montserrat Medium 14) bound to
`color/text/primary`, 228 × 44 row, `cornerRadius: 8`, padding 12.

**Position:** after `Nav — Leaderboard`, before `Nav — Messages`. The
existing list order groups by IA:

```
Home
Community · Sports Hub · Bants · Leaderboard   ← content pillars
Messages · Notifications                       ← inbox
Profile · Settings                             ← account
—
Log out
```

Clubs is a content pillar, so it goes at the **end of the content-pillar
group** — the same "append to the content group" choice PR #144 made for
the desktop nav (Decision Log #159). Flagged as a minor open question in
Decision Log #162.

Final order: Home · Community · Sports Hub · Bants · Leaderboard ·
**Clubs** · Messages · Notifications · Profile · Settings — Log out.

---

## 4. The trigger — built explicitly, not assumed

**The most likely open affordance — the Avatar in `header 4 — mobile`'s
`Actions` cluster (`5387:7675`) — was already wired**, but to the
**mobile account dropdown** (`ON_CLICK → OPEN_OVERLAY → 5685:9300`,
`Dropdown menu/mobile - no notification`), established by PR #114/#115
(Decision Log #99–#103).

**Decision:** the avatar now **opens the navigation drawer instead.**
`5387:7675`'s reaction is retargeted to `ON_CLICK → OPEN_OVERLAY →
5870:10689` (the new drawer component). This is set on the node inside
the `header 4 — mobile` COMPONENT, so all ~46 instances inherit it.

Rationale: on mobile there is *no* content-nav anywhere else, so an
avatar that opens only a small account menu (Profile / Notification /
Settings / Log out) while primary nav is unreachable is broken. The
drawer is a **strict superset** of that account menu (it contains the
same identity block + Profile / Notifications / Settings / Log out, plus
Home / Community / Sports Hub / Bants / Leaderboard / Clubs / Messages).

**This supersedes Decision Log #100 / #101** (avatar → account dropdown)
**for mobile only** — the desktop avatar (`2838:3579` → `2841:5361`) is
**unchanged**, confirmed. The two mobile account-dropdown variants
(`5685:9300` / `5685:9312`) are now **redundant** — recommended for
retirement in a follow-up, **not deleted here**. See Decision Log #162.

### Plugin-API limitations (documented, not silently skipped)

- The **slide-in-from-left transition** on the overlay could not be set —
  `setReactionsAsync` rejects a `DirectionalTransition` (`SLIDE_IN` /
  `LEFT`) in this plugin environment (same class of limitation PR #115
  hit with `overlayBackgroundInteraction` being readonly). The reaction
  is wired as a plain `OPEN_OVERLAY` (`transition: null`); **the
  slide-in-from-left transition must be set once, by hand, in the Figma
  UI** on that interaction. One-checkbox job.
- `overlayPositionType` / `overlayBackground` are readonly via the
  plugin too — the drawer component is a full-screen 390 × 844 overlay
  with its own built-in scrim, so it composes correctly at the default
  `CENTER` position anyway; set it to `TOP_LEFT` in the UI for tidiness.

---

## 5. Standing rules — verification

- **Palette:** `brand/navy` / `brand/green` / `brand/green-tint` 12% /
  `color/background/surface` / `color/text/primary` / `color/text/secondary`
  / `color/icon/inactive` only. **No `brand/green-tint-28`. No new
  colours.**
- **Light mode only.**
- **0 unbound / 0 off-palette / 0 `green-tint-28` paints** across the
  entire `Navigation Drawer — Mobile` component subtree — audited
  node-by-node.
- **Scrim fill:** a variable-bound `brand/navy` paint at paint-level
  `opacity: 0.3` (the original one-off scrim's treatment) **renders solid
  on instances** — this file's documented gotcha ("a variable-bound
  paint takes its alpha from the variable, not the paint's own
  opacity"). Fixed by stacking **two `color/icon/inactive` fills**
  (navy @ 15% each → ~28% effective), which carries its own alpha and so
  renders identically on the component master and every instance.
  Verified: the feed content is visibly dimmed-but-legible behind the
  scrim, matching the original design intent. **There is no dedicated
  `overlay/scrim` token** — flagged in Decision Log #163.
- **Reuse:** the drawer panel, every nav item, the identity block, and
  the scrim are all cloned from existing nodes — nothing redrawn.

---

## 6. Flagged, not resolved

- **Decision Log #162** — Clubs list position (minor); the mobile
  account dropdown (`5685:9300` / `5685:9312`) now redundant, recommend
  retiring; propagating a live drawer instance to every other mobile
  screen is a separate broader effort.
- **Decision Log #163** — no `overlay/scrim` token; and the drawer's nav
  list diverges from the desktop 6-icon set — the drawer has **no
  "News"** item and says **"Bants"** where the desktop icon is
  **"banter"** and the app route is `/news`. Reconcile drawer ↔ desktop
  nav labels/items.
- **Nav-item routing** is unwired throughout the drawer (Home, Community,
  … have no reactions) — consistent with how the one-off frame shipped;
  a Phase-2 (`figma-to-code`) concern, not added here.

---

## 7. `apps/web` was NOT touched

Confirmed — this PR changes only Figma (via the plugin API), this report,
`CLAUDE.md`, and the Build Plan Decision Log.

---

## 8. Deliverables checklist

- [x] `Bottom Navigation — Mobile` + its two reference frames retagged
      for future native-app use, artwork untouched
- [x] Navigation Drawer promoted to a real reusable component
      (`Navigation Drawer — Mobile`, `5870:10689`), with "Clubs" added
- [x] Real prototype trigger: `header 4 — mobile` avatar `ON_CLICK →
      OPEN_OVERLAY → 5870:10689` (supersedes the avatar → account-dropdown
      wiring on mobile; slide-in transition to be set manually — see §4)
- [x] This report
- [x] CLAUDE.md updated in the same PR (new dated bullet)
- [x] Build Plan Decision Log — forward-pointer on #160's Status +
      new rows #162–#163
- [x] Branch from `origin/main` → commit → push → open PR against
      `main`, **do not merge**
