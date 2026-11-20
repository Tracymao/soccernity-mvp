# Grassroots — desktop icon-navbar glyph, code mirror

**Branch:** `sprint-5/grassroots-navbar-glyph-code`
**Agent:** figma-to-code
**Date:** 2026-09-08
**Scope:** `apps/web` only. No `services/api`. **No Figma changes** — the
design is done and verified (Decision Log #272 / `sprint-5-grassroots-desktop-navbar-glyph-report.md`).
**Closes:** Decision Log #272's recorded figma-to-code follow-up.
**Decision Log:** #273 added; forward-pointer appended to #272.

---

## 1. What shipped

`apps/web/src/layout/navigation.ts` mirrors the shared Figma
`Web app Navbar` COMPONENT_SET (`2824:4309`) 1:1. Decision Log #272
appended a 7th icon — **Grassroots**, a corner-flag glyph — to that
component's `Frame 5858` icon row on both live desktop variants
(`header 4` / `header 7`), ordered last after Clubs. This PR is the code
mirror of that one change:

1. **`apps/web/src/assets/icons/nav-grassroots.svg`** — new.
2. **`navigation.ts`** — one import, one `primaryNavItems` entry, comment
   updates.
3. **`Header.test.tsx`** — three assertions updated in place.

Nothing else. `Header.tsx` already renders `tinted` items with the
green-tint tile wrap and does not depend on the list length, so no
component code changed.

---

## 2. The SVG

Exported from Figma node `6412:18190` ("corner-flag (Grassroots)") with
`download_assets` (read-only). The raw export:

```
M8.5 21V3M4 21H14M8.5 3.5L20 6.75L8.5 10V3.5Z
stroke #282E65 · stroke-width 1.5 · linecap/linejoin round · fill none
```

Committed as a **bare 24×24 glyph, no green-tint rectangle baked in**,
matching the `tinted: true` icons' convention exactly:

| icon | viewBox | tile baked in? | stroke |
|---|---|---|---|
| `nav-clubs.svg` (`tinted: true`) | `0 0 24 24` | no | `#282E65` |
| `nav-sports-hub.svg` (`tinted: true`) | `0 0 31 31` | no | `#282E65` |
| `nav-bants.svg` (not tinted) | `0 0 40.4 32` | **yes** (`#7BB929` @ 0.12) | `#282E65` |
| **`nav-grassroots.svg`** (`tinted: true`) | `0 0 24 24` | **no** | `#282E65` |

`#282E65` is `brand/navy` — confirmed against both `nav-clubs.svg` and
`nav-sports-hub.svg`, not guessed. Structure (`<g id="corner-flag
(Grassroots)">` → `<path id="Vector" …>`) copies `nav-clubs.svg`.

The green-tint tile is applied at render time by `Header.tsx`'s
`sn-header__nav-icon--tinted` CSS wrap — the exact mechanism the
`tinted?: boolean` flag exists for.

---

## 3. navigation.ts

```ts
import navGrassroots from "../assets/icons/nav-grassroots.svg";
// …
export const primaryNavItems: NavItem[] = [
  { label: "Sports Hub", to: "/sports-hub", icon: navSportsHub, tinted: true },
  { label: "Blog", to: "/blog", icon: navBlog },
  { label: "Community", to: "/community", icon: navCommunity },
  { label: "Leaderboard", to: "/leaderboard", icon: navLeaderboard },
  { label: "Bants", to: "/banter", icon: navBants },
  { label: "Clubs", to: "/clubs", icon: navClubs, tinted: true },
  { label: "Grassroots", to: "/grassroots", icon: navGrassroots, tinted: true },
];
```

Position 7, last, after Clubs — the canonical order Decision Log #272
landed on both header variants and the mobile drawer (#265/#266).
`tinted: true` because the exported SVG is a bare stroke glyph.

Comment updates: the file header's icon-order line gained "Grassroots"
and a `DECISION LOG #272` note; the drawer's stale comment about the
desktop glyph being "a separate figma-design-system task ... NOT added
to primaryNavItems" was rewritten to point at #272/#273.

**`/grassroots` route already exists** (Decision Log #270), so the new
`NavLink` resolves.

---

## 4. Header.test.tsx

| test | change |
|---|---|
| `"is the canonical Figma icon order: …"` | 6 → 7 labels (append `"Grassroots"`); title updated |
| `"does NOT add Grassroots to the desktop icon nav (Decision Log #266)"` | **inverted** → `"adds Grassroots as the last desktop icon-nav item, tinted, -> /grassroots (Decision Log #272)"` — asserts `primaryNavItems` last entry is `{ label: "Grassroots", to: "/grassroots", tinted: true }` |
| `"renders the six icon nav links and a Login button, no avatar"` | title → `"seven"` (body already loops `primaryNavItems`, no logic change) |
| drawer-order test comment | "no desktop icon-navbar entry yet" → "The desktop icon-navbar now carries it too (Decision Log #272)" |

No test-count change — all three are edits to existing assertions.

---

## 5. Not touched

- **Mobile Navigation Drawer** (`drawerNavItems`) — its Grassroots entry
  was added by Decision Log #270; unchanged here.
- **The Figma file** — design is complete (#272).
- **`Header.tsx`** and its CSS — the tinted-wrap render path already
  handles a 7th tinted item.

---

## 6. Verification

| check | result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm run lint` | clean |
| `npm run build` | clean (pre-existing >500 kB chunk warning only) |
| `npx vitest run` | **32 files / 215 tests, 0 failures** |
| dev-server smoke (`/`, `/grassroots`, `/community`, `/clubs`) | all HTTP 200 |

No real browser / Playwright check available in this environment — same
verification ceiling as every prior `apps/web` PR.

---

## 7. Node reference

| what | id |
|---|---|
| corner-flag glyph frame (exported) | `6412:18190` |
| its `Vector` child | `6412:18193` |
| `header 4` variant | `2838:3502` |
| `header 7` variant | `2841:4104` |
