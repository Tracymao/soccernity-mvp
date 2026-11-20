# Grassroots — desktop icon-navbar glyph

**Branch:** `sprint-5/grassroots-desktop-navbar-glyph`
**Agent:** figma-design-system
**Date:** 2026-09-08
**Scope:** Figma design only. No `apps/web` / `services/api` code.
**Closes:** Decision Log #266 follow-up (1) — the desktop icon-navbar entry.
**Decision Log:** #272 added; forward-pointer appended to #266.

---

## 1. What shipped

A 7th nav icon — **Grassroots**, a corner-flag glyph — added to the shared
navbar component's two live desktop variants:

| variant | node | file |
|---|---|---|
| `Property 1=header 4` (logged-in) | `2838:3502` | `Web app Navbar - Desktop and Mobile` COMPONENT_SET `2824:4309` |
| `Property 1=header 7` (logged-out) | `2841:4104` | same set |

**Icon order (both variants):** Sports Hub · Blog · Community · Leaderboard ·
Bants · Clubs · **Grassroots** → `/grassroots`.

Grassroots sits **last, immediately after Clubs**, matching the mobile
Navigation Drawer's own placement (DL #265/#266 inserted `Nav — Grassroots`
right after `Nav — Clubs`) and keeping the two team/club-entity pillars
adjacent.

**Not touched:** `Property 1=header 4 — mobile` (`5386:6576`),
`Property 1=header 7 — mobile` (`5386:6575`), and the mobile
`Navigation Drawer — Mobile` component (`5870:10689`) — the drawer entry
was already done (DL #266/#270).

---

## 2. Correction to the task brief's premise

The brief stated *"this frame is NOT auto-layout, so this is real
re-positioning, not an append."* That is not what is in the file. Verified
via `use_figma`:

| node | layout |
|---|---|
| `header 4` root `2838:3502` | HORIZONTAL auto-layout, `SPACE_BETWEEN`, padding 20/20, FIXED 1440×90 |
| `header 7` root `2841:4104` | HORIZONTAL auto-layout, `MIN`, `itemSpacing` 32, padding 20/20 |
| `Frame 5881` (h4 logo+search+iconrow wrapper) `2841:4420` | HORIZONTAL auto-layout, HUG, `itemSpacing` 32 |
| **`Frame 5858` (icon row), both variants** (`2838:3517` / `2841:4115`) | **HORIZONTAL auto-layout, HUG both axes, `itemSpacing` 30, children flow (`layoutPositioning: AUTO`)** |
| `header 4` avatar cluster `Frame 5880` (`2841:4335`) | flow child of the root — its x is *computed* by `SPACE_BETWEEN`, not authored |
| `header 7` `Login` button `Frame 5805` (`2631:3972`) | `layoutPositioning: ABSOLUTE` — pinned, out of the flow |

Consequences:

- The existing six icons' x-offsets (0 / 66.17 / 133.01 / 203.02 / 282.01 /
  352.41) are **auto-layout output**, not authored positions.
- Adding a 7th icon is a clean **`appendChild` to `Frame 5858`** — Figma
  re-flows everything. No `resize()`, no manual x math, no wrapper widening,
  and the `frame.resize()`-on-GROUPs drift gotcha never comes into play.
- `Frame 5858` grew **383.41 → 444.41 px** in both variants (+31 tile +30
  gap).

### Collision check (post-edit, measured from `absoluteBoundingBox`)

| variant | icon-cluster right edge | next element | clearance |
|---|---|---|---|
| header 4 | ~x 9879 (`Frame 5881` right) | avatar cluster `Frame 5880` at x ~10189 | **~310 px** |
| header 7 | ~x 9879 (`Frame 5858` right) | `Login` button at x ~10169 | **~290 px** |

Search pill unaffected in both (growth is rightward only; the pill ends at
abs x ≈ 564, the icon row starts at ≈ 596).

---

## 3. The glyph

**Style: tinted** — a bare navy stroke glyph inside a 31×31, `cornerRadius` 3,
`brand/green-tint` @ 12% rounded square.

Built by **cloning the `clubs` group** (`5861:9240` in h4, `5861:9245` in h7),
renaming it `grassroots`, and replacing the inner glyph frame's shield vectors
with one new corner-flag vector. Cloning inherits, verbatim:

- the tile `Rectangle 346` — `cornerRadius` 3, fill bound to `brand/green-tint`
  (`VariableID:5096:5`) @ 12%
- the 24×24 `clipsContent` glyph frame (renamed `corner-flag (Grassroots)`)
- the `brand/navy` (`VariableID:5096:4`) stroke binding pattern @ 1.5px

Why tinted and not baked-in: this is the pattern the two most recent icons use
(Sports Hub, and Clubs — the separated bare-glyph-in-a-tile approach DL #159
established), it is the case `apps/web/src/layout/navigation.ts`'s existing
`tinted?: boolean` flag exists to handle, and it exports as a clean bare SVG
for the figma-to-code follow-up. Blog / Community / Leaderboard / Bants are
legacy fused artwork — not a pattern to extend.

**Shape: a corner flag** — pole + triangular pennant + short ground line.
The single most recognisable "grassroots / park football" mark, and distinct
from every visible neighbour (ball / article stack / people group / ID-card
stack / chat bubbles / checkered shield). Vector path (24-box):

```
M8 21 L8 3   M3.5 21 L13.5 21   M8 3.5 L19.5 6.75 L8 10 Z
```

`strokeWeight` 1.5, `strokeCap`/`strokeJoin` ROUND, `strokeAlign` CENTER,
`fills: []`. Drawn via `figma.createVector()` with strokes **explicitly
re-bound to `brand/navy` after creation** (per the standing `createVector`
unbound-black-stroke gotcha). Visible geometry 16×18, centred at x 4 / y 3 in
the 24×24 frame — the same footprint as the Clubs shield vector.

Considered alternative: a **pitch outline** (rounded rect + halfway line +
centre circle). Ruled out — a rounded rect inside the rounded tile reads
muddy at ~24 px, and it says "venue/stadium" more than "grassroots".

---

## 4. Per-instance override audit + propagation

**178 live instances** of the set on page `0:1`: `header 4` ×95, `header 7`
×8 (103 desktop, in scope), `header 4 — mobile` ×66, `header 7 — mobile` ×9
(untouched).

**Structural scan of all 103 desktop instances' `Frame 5858`:**

- **0 swapped or detached icon rows.** Every one is a plain `FRAME` tracked
  to the main component (`rowType: FRAME`, `rowIsInstanceChild: false`).
- 5 instances returned "no `Frame 5858`" — all inside **hidden/archived**
  frames (`ARCHIVED — Blog Page Desktop`, 3 archived Settings frames). Not
  relevant.
- Every live instance's icon row currently lists exactly the 6 visible
  children (`livesocre`/`Group 833`, `blog`/`Group 830`, `community`,
  `leaderboad`, `Bants`, `clubs`) — **the legacy hidden `home` slot is on
  the main component but on zero instances.** `home` predates the current
  component lineage; requesting its deterministic instance-child id
  (`I<inst>;2838:3518`) returns `null` everywhere. This is a pre-existing
  curiosity, not a blocker, and does not affect `clubs` or the new
  `grassroots` — both propagate normally.
- Overrides on 129/178 instances are almost all harmless `name` renames
  ("Navbar — header 4"), plus `height|name|width` on archived frames and
  `fills` overrides on 3 Contest frames (per-instance nav-icon recolours).

**Propagation precedent:** `clubs` was appended to this exact `Frame 5858` by
PR #144 (DL #159) and is present on all 103 desktop instances — proof that
append-to-`Frame 5858` propagates cleanly.

**Post-edit verification** — the `grassroots` child + row width 444.41
confirmed on 6 representative instances:

| instance | context | result |
|---|---|---|
| `5171:6634` Leaderboard Page Desktop | plain h4 | ✅ icon present, visible |
| `2841:6149` Contest voting page | h4 **with `fills` overrides** | ✅ (screenshot-verified — renders navy-on-green-tint correctly) |
| `6171:14798` Create Post — Desktop — Active Contest | recent h4 (PR #174) | ✅ |
| `I6345:16036;6324:15402` Settings Shell | **nested** h4 instance | ✅ |
| `5204:6729` Home Page Premium Light | h7 | ✅ |
| `6114:14640` Privacy Policy Desktop — Logged Out | h7 | ✅ |

---

## 5. Paint audit

Two new solid paints per variant, both variable-bound:

| node | paint | bound variable |
|---|---|---|
| `grassroots/Rectangle 346` | fill, `{r 0.482, g 0.725, b 0.161}` @ opacity 0.12 | `brand/green-tint` (`VariableID:5096:5`) |
| `grassroots/corner-flag (Grassroots)/Vector` | stroke, `{r 0.157, g 0.180, b 0.396}` @ 1.5 px | `brand/navy` (`VariableID:5096:4`) |

**0 unbound, 0 off-palette, 0 `brand/green-tint-28`, 0 new colours, Light
mode only, 0 overlaps introduced.**

---

## 6. figma-to-code follow-up (recorded, not built)

`apps/web/src/layout/navigation.ts`'s `primaryNavItems` mirrors this
component 1:1 (see that file's header comment). The follow-up PR should:

1. Export the new glyph SVG to `apps/web/src/assets/icons/nav-grassroots.svg`.
2. Add, at position 7 (after Clubs):

   ```ts
   { label: "Grassroots", to: "/grassroots", icon: navGrassroots, tinted: true },
   ```

The `/grassroots` route already exists (DL #270). The canonical order and
`tinted` style landed here are what that PR converts verbatim.

---

## 7. Node reference

| what | id |
|---|---|
| COMPONENT_SET | `2824:4309` |
| header 4 variant | `2838:3502` |
| header 7 variant | `2841:4104` |
| header 4 icon row `Frame 5858` | `2838:3517` |
| header 7 icon row `Frame 5858` | `2841:4115` |
| new `grassroots` group — header 4 | `6412:18188` |
| new corner-flag vector — header 4 | `6412:18193` |
| new `grassroots` group — header 7 | `6414:18552` |
| new corner-flag vector — header 7 | `6414:18557` |
