# Sprint 2 — Club Pages conversion report

**Branch:** `sprint-2/club-pages-conversion` (from `origin/main`)
**Agent:** figma-to-code
**Date:** 2026-09-02

Converts the designs merged in **PR #142** (`sprint-2/club-pages-design`) into
real, working React code — closing the **remaining (code) half of Decision Log
#155** and **Decision Log #158** (missing `leaveClub()` client). Same conversion
step PR #135 did for Home/Community: real pages, real endpoints, no dummy data
beyond what the design itself declared deliberately out of scope.

`services/api` was **not touched** — every endpoint this wires to already exists
and is tested (`GET /clubs`, `GET /clubs/:id`, `POST`/`DELETE /clubs/:id/join`).

---

## 1. What was built

### `apps/web/src/api/clubs.ts` — two new client functions

- **`getClubById(accessToken, clubId): Promise<ClubSummary>`** — `GET /clubs/:id`.
  Mirrors `listClubs`'s error-handling shape exactly. A 404 surfaces as a
  `ClubsApiError` with `status: 404` — **not** a distinct error type; the caller
  (`ClubFanPage`) decides how to render "club not found" by inspecting `.status`.
- **`leaveClub(accessToken, clubId): Promise<JoinClubResult>`** — `DELETE
  /clubs/:id/join`. Mirrors `joinClub` exactly (method-only difference, same
  error handling, same `JoinClubResult` return — its `joined: boolean` already
  serves both directions). **Closes Decision Log #158.**

### `apps/web/src/pages/clubs/ClubJoinButton.tsx` (new, shared)

The Join / Leave control used by both new pages. Starts from the club's real
per-caller `joined` field (Decision Log #154); after a click it hands the
endpoint's own returned `{ joined, memberCount }` back to the parent via
`onToggled` — the same "act, then trust the real response" shape `PostCard.tsx`
uses for like/save. Inline `role="alert"` error on failure; `aria-pressed`
reflects joined state.

### `apps/web/src/pages/ClubsPage.tsx` (new) — "Clubs — Browse"

Route **`/clubs`**. Figma `5841:9240` / `5841:9306`.

- `GET /clubs` on mount, cursor-paginated **"Load more"** (same pattern as
  `ClubPickerStep.tsx`'s `handleLoadMore`).
- **Client-side name filter** over the pages already loaded — `GET /clubs` has
  no text-search param, so the field is labelled *"Filter loaded clubs by
  name"* and the empty result reads *"No clubs match that filter."* Nothing
  implies a full-catalogue search.
- Each club's **Join / Leave** button drives `joinClub` / `leaveClub` from that
  club's own `joined` value, toggling the row (and its member count) in local
  list state from the endpoint's real response.
- Each card is a `<Link to={/clubs/:id}>`; the Join/Leave button sits outside
  the link so it doesn't navigate.
- **No-session** visit → *"Log in to browse clubs"* prompt, API never called
  (mirrors `ProfilePage` / `CommunityPage`).

### `apps/web/src/pages/ClubFanPage.tsx` (new) — "Club — Fan Page"

Route **`/clubs/:id`**. Figma `5841:9365` / `5841:9431`.

- Reads `:id` via `useParams`, calls `getClubById`.
- Real fields only: badge/logo, name, `league • country` (→ "Independent"),
  member count, one **Join / Leave** button, a **"← Clubs"** back link, and the
  muted scope note **reproduced verbatim**: *"Member posts and a full member
  list aren't part of club pages yet."*
- A **404 renders an honest "Club not found" state** with a link back to
  `/clubs` — never a crash or blank page. A non-404 failure renders a generic
  "couldn't load this club" alert (distinguished by `err.status === 404`).
- **No feed, no composer, no member list** — Decision Log #157, still open.

### `apps/web/src/app/router.tsx`

```
{ path: "clubs", element: <ClubsPage /> },
{ path: "clubs/:id", element: <ClubFanPage /> },
```

### `apps/web/src/pages/clubs/ClubsPage.css` (new)

Light-mode, references the app-wide `--sn-*` custom properties
(`src/theme/applyTheme.ts`) — no hardcoded hex, same convention as
`CommunityPage.css` / `ProfilePage.css`. The design's own "Top Bar — Soccernity"
is **not** reproduced (AppShell already renders the shared site Header, same as
every other routed page). Narrow-screen media query stacks the browse card and
makes the buttons full-width, matching the mobile frames.

---

## 2. What this does NOT do — confirmed by Decision Log

- **Decision Log #156 (navigation entry point) — still open, not worked around.**
  The shared Navbar component has no Clubs slot; adding one is shared-component
  work that would touch every screen in the design file, outside this task's
  scope. **No Navbar link was added.** These pages are real and reachable by
  direct URL and via the Club Picker → Fan Page `<Link>` path, but full in-app
  discoverability depends on #156 being resolved separately. Noted plainly in
  `ClubsPage.tsx`'s header comment and in the router comment.
- **Decision Log #157 (club-scoped posts/feed endpoint) — does not exist.** No
  feed, composer, or member list was added to the Fan Page. `GET /posts/feed`
  is scoped to the caller's own posts + follows and never reads
  `Post.clubPageId`.

---

## 3. Tests

Two new files, matching this codebase's `LoadState` pattern and testing style
(`ClubPickerStep.test.tsx` / `CommunityPage.test.tsx` — plain DOM assertions,
`vi.mock` of `src/api/clubs.ts`, session seeded into `sessionStorage`).

**`ClubsPage.test.tsx` (8 tests):** no-session guard; loaded page with correct
Join/Leave states from real `joined` values (+ "Independent" / singular-member
edge cases); join → button flips to Leave + fresh member count; leave → flips to
Join; client-side filter narrows the list with no second `GET /clubs`;
filter-excludes-everything empty state; cursor "Load more" pagination; load
error without crashing.

**`ClubFanPage.test.tsx` (7 tests):** no-session guard; real club data from
`getClubById`; **scope-note copy verbatim**; Join → Leave toggle + member count;
`joined: true` renders Leave on first paint; **404 → "Club not found" + back
link, no Join/Leave button**; non-404 → generic error, not "not found".

### `npx vitest run` output (full `apps/web` suite)

```
 RUN  v1.6.1 D:/Projects/soccernity-mvp/apps/web

 ✓ src/pages/VerifyEmailPage.test.tsx  (4 tests) 450ms
 ✓ src/pages/HomePage.test.tsx  (3 tests) 673ms
 ✓ src/pages/ClubFanPage.test.tsx  (7 tests) 768ms
 ✓ src/pages/GuardianConsentPage.test.tsx  (7 tests) 693ms
 ✓ src/pages/ClubsPage.test.tsx  (8 tests) 846ms
 ✓ src/pages/GuardianConsentConfirmPage.test.tsx  (6 tests) 966ms
 ✓ src/pages/signup/ClubPickerStep.test.tsx  (8 tests) 981ms
 ✓ src/pages/signup/AgeGateStep.test.tsx  (7 tests) 963ms
 ✓ src/pages/CommunityPage.test.tsx  (6 tests) 1181ms
 ✓ src/pages/ProfilePage.test.tsx  (6 tests) 1175ms
 ✓ src/pages/profile/EditProfileModal.test.tsx  (4 tests) 5987ms

 Test Files  11 passed (11)
      Tests  66 passed (66)
```

Up from 9 files / 51 tests → **11 files / 66 tests, 0 failures** (2 new files,
15 new tests; no existing test changed).

### Other verification

- `npx tsc --noEmit` — clean.
- `npm run lint` — clean.
- `npm run build` — clean (`163 modules transformed`, `built in 2.19s`).
- Dev-server smoke test — `/`, `/clubs`, `/clubs/some-id`, `/community` all
  HTTP 200. No real browser / Playwright check available in this environment —
  same ceiling as every prior `apps/web` PR.

---

## 4. Deliverables checklist

- [x] `api/clubs.ts` `getClubById` + `leaveClub`; `ClubsPage.tsx`;
      `ClubFanPage.tsx`; `ClubJoinButton.tsx`; `ClubsPage.css`; `router.tsx`
- [x] Real, passing tests with `vitest run` output pasted above
- [x] CLAUDE.md updated in the same PR (new dated bullet)
- [x] Build Plan Decision Log — forward-pointers appended to #155 (fully closed,
      design + code) and #158 (`leaveClub()` shipped); **#156 and #157 left
      open** as instructed
- [x] Branch from `origin/main` → commit → push → open PR against `main`, **do
      not merge**
