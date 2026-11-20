# Sprint 2 — Navbar Phase 2: icon nav + auth-state switching

**Branch:** `sprint-2/navbar-phase-2-icon-nav-and-auth-state` (from `origin/main`)
**Agent:** figma-to-code
**Scope:** `apps/web` only. No `services/api` changes.
**Date:** 2026-09-03

Phase 2 of the founder-directed navbar correction (Decision Log #161).
Phase 1 (PRs #144–#146, figma-design-system) made the Figma icon navbars
complete; this PR replaces `apps/web`'s unrequested text-label nav with
them, fixes the auth-state switching that never actually worked, wires the
canonical mobile drawer, adds Clubs to the working nav, and resolves
Decision Log #165.

---

## 1. Figma sources

| Node | Name | Used for |
|---|---|---|
| `2838:3502` | Header COMPONENT_SET / `header 4` | logged-in desktop navbar (icon nav + messages + avatar) |
| `2841:4104` | Header COMPONENT_SET / `header 7` | logged-out desktop navbar (icon nav + Login) |
| `2841:5363` | `Dropdown menu/notification on` | desktop account dropdown |
| `5870:10689` | `Navigation Drawer — Mobile` | canonical mobile-web primary nav (Decision Log #162) |

All read via `get_design_context` against file `weZWWqggy9j13eX8bhFgs6`.

---

## 2. Icon assets

Exported from Figma (`header 4` subtree) and committed to
`apps/web/src/assets/icons/`, matching the existing `soccernity-logo-mark.svg`
/ `search.svg` convention:

- `nav-sports-hub.svg` (`ion:football-outline`)
- `nav-blog.svg`
- `nav-community.svg`
- `nav-leaderboard.svg`
- `nav-bants.svg`
- `nav-clubs.svg` (`ph:shield-checkered` — Decision Log #159)
- `messages.svg` (`header 4` messages glyph)

`preserveAspectRatio="none"` / `overflow="visible"` / inline `style` were
stripped from each (mechanical — makes them behave as normal scalable
icons; no path data touched). The Blog / Community / Leaderboard / Bants
SVGs bake the green-tint tile into the artwork; Sports Hub and Clubs
export as a bare stroke glyph and get the tile from CSS
(`.sn-header__nav-icon--tinted`), exactly as the Figma frame does it.

---

## 3. Code changes

### `src/layout/navigation.ts` (rewritten)
- `primaryNavItems` — 6 icon items in canonical order: **Sports Hub**
  (`/sports-hub`) → **Blog** (`/news`) → **Community** (`/community`) →
  **Leaderboard** (`/leaderboard`) → **Bants** (`/banter`) → **Clubs**
  (`/clubs`). `NavItem` extended with `icon: string` (imported SVG URL)
  and `tinted?: boolean`.
- `drawerNavItems` — 11 items in the Figma drawer's canonical order
  (Home, Community, Sports Hub, Blog, Bants, Leaderboard, Clubs,
  Messages, Notifications, Profile, Settings). `available?: boolean` —
  `false` for routes that don't exist yet.
- `accountMenuItems` — Profile / Notification / Settings for the desktop
  dropdown (Log out rendered separately as an action).

### `src/layout/Header.tsx` (rewritten)
- Session read via `getStoredAccessToken()` (src/lib/session.ts) — **no
  `AuthContext` was built**; re-derived on every navigation via
  `useLocation().key` so login and logout redirects both flip the header.
- No session → icon nav + `Login` button (`header 7`).
- Session → icon nav + messages icon + avatar button (`header 4`).
- Avatar (`aria-haspopup="menu"`) toggles a single `menuOpen` state;
  renders `<AccountDropdown>` when `menuOpen && !isMobile`,
  `<NavDrawer>` when `menuOpen && isMobile`.
- `handleLogout()` → `clearStoredSession()` + `setMenuOpen(false)` +
  `navigate("/")`.

### `src/layout/useIsMobile.ts` (new)
Reads `window.innerWidth` (≤ 820px) with a `resize` listener. Chosen over
`window.matchMedia` because jsdom (the test env) doesn't implement
`matchMedia` and `innerWidth` is writable there — keeps the
desktop-vs-mobile overlay switch directly testable. 820px matches
`CommunityPage.css`'s existing single-column breakpoint.

### `src/layout/AccountDropdown.tsx` + `.css` (new)
Desktop dropdown from `2841:5363`. Profile → `/profile` (real link).
Notification / Settings → no route yet → rendered as `aria-disabled`
`<span role="menuitem">`, not links to the 404 page (Decision Log #166).
Notification row shows **no unread count** — no data source
(Decision Log #167). Log out → `role="menuitem"` button calling
`onLogout`.

### `src/layout/NavDrawer.tsx` + `.css` (new)
Left slide-in panel + scrim from `5870:10689`. Scrim tap **or Escape**
closes it (matches the Figma component's own `ON_CLICK → CLOSE`). 11 nav
rows: available ones are `NavLink`s (active-state highlight), Messages /
Notifications / Settings are disabled spans (Decision Log #166). Identity
block renders a generic **"Signed in"** row + plain avatar circle — no
name / `@handle` / photo available client-side (Decision Log #168).
Divider, then a Log out action button.

### `src/layout/Header.css` (updated)
Icon-nav styling (inactive `opacity: 0.55`, active/hover `1`), tinted
tile, account cluster, avatar button, messages button (disabled). Header
height 84 → 90px (`header 4` spec, Decision Log #164). All colours via
`--sn-*` custom properties.

---

## 4. Decision Log #165 — RESOLVED: "Blog" is canonical

The Figma vocabulary is unanimously "Blog" (icon layer name, "Blog Page
Desktop", the Blog section banner, the drawer's "Nav — Blog"); the only
holdout was the now-archived text-label header's "NEWS" text. This
project's original section list also named the pillar "Blog".

**Resolution:** `"Blog"` is the display label everywhere in this task's
code — `navigation.ts` label, drawer rendered text, icon `aria-label`.
The `/news` route path and `NewsPage.tsx` filename are **internal
identifiers, deliberately unchanged** — renaming them (plus section
headings) is a larger, separate change than this task's scope. Flagged as
a possible follow-up, not done here.

---

## 5. New judgment calls (Build Plan Decision Log #166–#168)

| # | Gap | Meanwhile |
|---|---|---|
| 166 | `/messages`, `/notifications`, `/settings` have no route in `router.tsx` | Those nav items + the header messages icon render non-navigating & visibly disabled (`aria-disabled`, "Not available yet"), not links to the 404 page — per the brief. Flip `navigation.ts`'s `available` flag when the routes land. |
| 167 | Notification unread-count badge (`2841:5363` shows "2") has no data source — no notifications API client exists | Notification row renders with no number, not a fake one. Needs a real unread-count endpoint. |
| 168 | Drawer/dropdown identity block (name, `@handle`, avatar photo) has no client-side source — token is `{ sub, role }` only, no `AuthContext` | Generic "Signed in" row + plain avatar circle. Needs an `AuthContext` or a header-level `GET /users/:id` fetch (as `ProfilePage.tsx` does). |

---

## 6. Verification

```
$ npx tsc --noEmit
(clean, no output)

$ npm run lint
(clean, no output)

$ npm run build
✓ 175 modules transformed.
dist/assets/nav-bants-DRFGmrAN.svg     6.00 kB
dist/assets/index-BNyUo9MR.css        51.18 kB
dist/assets/index-LT37LkAZ.js        408.39 kB
✓ built in 2.73s
```

### `npx vitest run` — full `apps/web` suite

```
 ✓ src/pages/VerifyEmailPage.test.tsx  (4 tests)
 ✓ src/pages/ClubFanPage.test.tsx  (7 tests)
 ✓ src/pages/ClubsPage.test.tsx  (8 tests)
 ✓ src/pages/GuardianConsentPage.test.tsx  (7 tests)
 ✓ src/pages/signup/AgeGateStep.test.tsx  (7 tests)
 ✓ src/pages/GuardianConsentConfirmPage.test.tsx  (6 tests)
 ✓ src/pages/signup/ClubPickerStep.test.tsx  (8 tests)
 ✓ src/pages/ProfilePage.test.tsx  (6 tests)
 ✓ src/pages/CommunityPage.test.tsx  (6 tests)
 ✓ src/layout/Header.test.tsx  (13 tests)
 ✓ src/pages/HomePage.test.tsx  (3 tests)
 ✓ src/pages/profile/EditProfileModal.test.tsx  (4 tests)

 Test Files  12 passed (12)
      Tests  79 passed (79)
```

Up from 11 files / 66 tests. `Header.test.tsx` is new (Header /
`navigation.ts` were genuinely untested before this): +13 tests, no
existing test changed. Coverage:

- No-session render: 6 icon nav links + Login button, no avatar.
- Session render (desktop 1200px): avatar + no Login; dropdown opens
  with Profile / Notification / Settings / Log out; drawer does **not**
  open.
- Session render (mobile 500px): avatar opens the **drawer** not the
  dropdown; 11 rows in the exact Figma order incl. Blog and Clubs;
  scrim-click closes it.
- Clubs link → `/clubs`.
- "Blog" label rendered, "News" label never rendered (config + DOM).
- Log out (from both the dropdown and the drawer): clears the session
  and navigates to `/`; header flips back to the Login button.
- Notification row shows no fabricated count.

### Dev-server smoke test

```
$ npm run dev
/         -> 200
/community -> 200
/clubs    -> 200
/news     -> 200
/login    -> 200
(no errors in the dev-server log)
```

HTTP 200 for SPA routes = the dev server served `index.html`; no
server-side crash. No real browser or Playwright/Puppeteer check was
available in this environment — same verification ceiling as every prior
`apps/web` PR.

---

## 7. Deliverables checklist

- [x] Icon assets exported from Figma, committed.
- [x] `navigation.ts` rewritten to canonical order + Clubs.
- [x] `Header.tsx` real auth-state switching, no `AuthContext` built.
- [x] Mobile Navigation Drawer — working overlay, scrim/Escape close,
      real links, Log out clears session + redirects.
- [x] Desktop account dropdown — real open/close, real links, Log out.
- [x] Tests — `Header.test.tsx`, 13 cases, full suite passes.
- [x] CLAUDE.md — new dated bullet.
- [x] Build Plan Decision Log — #161 & #165 forward-pointers, #166–#168
      added.
- [x] Branch from `origin/main`, commit, push, open PR. **Not merged.**
