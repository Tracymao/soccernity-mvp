# Sprint 5 — Grassroots Record-Keeping in `apps/web`, PR 1 of 2: read-only surfaces

**Agent:** `figma-to-code` · **Date:** 2026-09-08 · **Branch:** `sprint-5/grassroots-conversion-read`
(off `main`) · **Scope:** `apps/web` only — no `services/api` code, no Figma writes. Not merged.

Build Plan **Sprint 5 / Section 4.5** (Grassroots Records Service). Grassroots was fully designed
(20 record-keeping frames + a Browse Teams pair, Decision Log #253 / #261 / #265 / #266) and fully
backed (`GrassrootsModule`, Decision Log #254 / #255 / #256 / #259 / #260) but had **zero presence
in `apps/web`** — no route, no API client, and the Navigation Drawer entry (#266) was a flagged,
deliberately-undone follow-up. This PR is the read-only half; **PR 2
(`sprint-5/grassroots-conversion-organiser`, Decision Log #271) is the authenticated organiser
flows** (register team / schedule fixture / manage fixture / log result).

**Decision Log #270** added to Build Plan Section 9; a forward-pointer appended to **#266**'s Status
(the code-mirror follow-up is now done).

---

## 1. What shipped

| File | Purpose |
|---|---|
| `src/api/grassroots.ts` | **New.** The full Grassroots client — **all 8** Section 4.5 endpoints, so PR 2 doesn't re-touch this file. Mirrors `api/clubs.ts` / `api/feed.ts` conventions: shared `authedFetch`, `GrassrootsApiError` with `.status`, `VITE_API_BASE_URL`, Bearer auth, cursor pagination. Plus two display helpers: `leagueTypeLabel()` and `opponentLabel()`. |
| `src/pages/GrassrootsPage.tsx` | **New.** Route `/grassroots` — Browse Teams (Figma `6402:18078` / `6404:18180`). |
| `src/pages/GrassrootsTeamPage.tsx` | **New.** Route `/grassroots/:teamId` — Public Team Page (Figma `6373:17444` / `6374:17501` + mobile pairs). |
| `src/pages/grassroots/GrassrootsPage.css` | **New.** Shared by both pages, `--sn-*` tokens only, light theme — same shape as `clubs/ClubsPage.css`. |
| `src/app/router.tsx` | +2 routes, direct `AppShell` children (no site footer), next to the `clubs` routes. |
| `src/layout/navigation.ts` | `{ label: "Grassroots", to: "/grassroots" }` added to `drawerNavItems` after `Clubs` (`available` default true). **Not** added to `primaryNavItems` — #266. |
| `src/pages/GrassrootsPage.test.tsx` | **New**, 6 tests. |
| `src/pages/GrassrootsTeamPage.test.tsx` | **New**, 11 tests. |
| `src/layout/Header.test.tsx` | drawer-order test updated to include `Grassroots` after `Clubs`; +2 tests (drawer item points at `/grassroots` and is available; Grassroots is NOT in the desktop icon nav). |

---

## 2. The API client — `src/api/grassroots.ts`

All 8 endpoints, typed against `services/api`'s `grassroots.service.ts` (`TEAM_SELECT` /
`FIXTURE_SELECT` / `TeamPage` / `FixturePage`):

| Function | Endpoint | Notes |
|---|---|---|
| `createTeam` | `POST /teams` | 403 = restricted-pending minor. |
| `listTeams` | `GET /teams?city=` | optional `city` (server-side equality, not fuzzy), `cursor`. |
| `getTeamById` | `GET /teams/:id` | a 404 surfaces as `GrassrootsApiError` with `status: 404` — the caller inspects `.status`, same as `ClubFanPage`. |
| `getTeamFixtures` | `GET /teams/:id/fixtures` | `cursor`; 404 if the team is missing. |
| `createFixture` | `POST /fixtures` | `teamBId` XOR `opponentName` (or neither). 403 (minor OR not the teamA organiser), 400 (both), 404. |
| `getFixtureById` | `GET /fixtures/:id` | 404. |
| `logResult` | `POST /fixtures/:id/result` | **"first write is final" → 409** (expected, not a generic failure). |
| `updateFixtureStatus` | `PATCH /fixtures/:id/status` | `'live'` \| `'full_time'`; every other transition is a **409 naming the current + requested status**. |

The **write** functions (`createTeam`, `createFixture`, `logResult`, `updateFixtureStatus`) surface
the server's own error message verbatim (the `errorMessageFrom` helper `feed.ts` uses) — because for
PR 2 the exact text is what tells a 403-"you may only manage…" apart from a 409-"already been
recorded". The **read** functions use a generic message. This PR only calls the reads; the writes
are shipped whole so PR 2 adds no lines to this file.

### `opponentLabel(fixture, viewingTeamId)` — Decision Log #260 / #261, owned client-side

`GET /*/fixtures` returns the raw `opponentName: string | null`; the API **never** renders an
"Opponent TBC" string. The fallback chain, from the viewing team's perspective:

1. viewing team is the away side (`fixture.teamBId === viewingTeamId`) → the opponent is `teamA.name`
2. else a registered `teamB` → `teamB.name`
3. else a free-text `opponentName` → that string (e.g. "Riverside FC")
4. else → the literal `"Opponent TBC"`

---

## 3. `GrassrootsPage` — `/grassroots` (Browse Teams)

Structurally `ClubsPage`, with four deliberate divergences (all from Figma `6402:18078` and its
`[SCHEMA]` annotations):

- **Search is a CITY filter that re-queries the server**, not a client-side name filter. `GET
  /teams?city=` is a server-side exact-match equality filter; Section 4.5 defines no team-name text
  search. The input is **debounced 300ms** — a keystroke is not a request — and `Load more` carries
  the active `city` forward.
- **No Join / Leave.** `GrassrootsTeam` has no membership concept. The whole card is a `<Link to="/grassroots/:teamId">`.
- **Both empty states designed** (a gap `ClubsPage` still has): "No teams in `{activeCity}` yet"
  (a city filter returned nothing) vs "No teams registered yet" (the unfiltered list is empty) —
  driven by whether a `city` was actually applied to the fetch that came back empty.
- **Monogram, not a crest** (no badge field), with a `VERIFIED TEAM` (green pill) / `COMMUNITY TEAM ·
  UNVERIFIED` (outlined pill) badge from `team.verified`.

No-session → "Log in to browse grassroots teams", the API is never called — `ClubsPage` / `ProfilePage`
precedent. Every Grassroots GET is `JwtAuthGuard`-only (Decision Log #269).

---

## 4. `GrassrootsTeamPage` — `/grassroots/:teamId` (Public Team Page)

From Figma `6373:17444` (verified) / `6374:17501` (unverified + empty). Loads `getTeamById` then
`getTeamFixtures` (the fixtures load is independent — a failure shows a soft in-section message,
never breaks the header, same as `ClubFanPage`).

- **Identity:** monogram, name, `{city}  •  {leagueType} team`, verified / unverified badge.
- **`GET /teams/:id/fixtures` split client-side** into **Upcoming** (`result == null`, sorted
  soonest-first) and **Results** (`result != null`, sorted most-recent-first). A section renders only
  if non-empty; if the team has zero fixtures, the "No fixtures yet" empty-state card shows instead.
- **Fixture row:** date column (`SAT 12 SEP` / `15:00` via `Intl.DateTimeFormat` en-GB), opponent
  (a 32px monogram for a registered opponent, or an outlined `?` no-crest tile for a free-text / TBC
  opponent — `opponentIsRegistered()`), `v  {opponentLabel()}`, venue, a status pill
  (`SCHEDULED` / `LIVE` / `FULL TIME`).
- **Result row:** date column (`SAT 05 SEP` / `Won` \| `Drew` \| `Lost`), opponent, a `{ours} – {theirs}`
  score, a `FULL TIME` pill. **Won/Drew/Lost and the score are derived from this team's side of the
  fixture** — `scoreFromPerspective()` picks `scoreA`/`scoreB` by whether `:teamId` is `teamAId`, so
  the team's own score always renders first regardless of home/away. There is no stored outcome,
  points or standings model (Decision Log #253).

**Deliberately not here** (nothing invented beyond `GrassrootsTeam`'s four fields): no squad / player
list, no league table, no season, no follow / join, no club-style feed. **No organiser CTA** — the
token payload is `{ sub, role }` only, so the client can't tell whether the viewer owns the team, and
Section 4.5 encodes no permission model (Decision Log #253 §6.7). PR 2 reaches the schedule/manage
flows from the register/schedule confirmations, not from a conditional button here.

- No-session → "Log in to view this team".
- A 404 team → an honest "Team not found" state with a link back to `/grassroots` (`ClubFanPage`
  precedent); a non-404 failure → a generic error.

---

## 5. Judgment calls (flagged, not silent)

1. **Route list.** `/grassroots` and `/grassroots/:teamId` mirror `/clubs` and `/clubs/:id` exactly.
   The three organiser routes PR 2 will add: `/grassroots/register` (`POST /teams`),
   `/grassroots/:teamId/fixtures/new` (`POST /fixtures`, team-scoped), and
   `/grassroots/fixtures/:fixtureId` (one status-driven route for frames 6/7/8 — Start match / log
   result / result confirmed, matching the backend's single status machine). Flat paths, static
   segments outrank `:teamId` in React Router v8's specificity ranking, so no collision.
2. **Full client in PR 1.** All 8 endpoints ship here even though PR 1 only calls 4 of them —
   `api/clubs.ts` set the precedent (functions ahead of consumers), and it means PR 2 adds nothing
   to this file.
3. **CSS is a separate `grassroots-*` file, not shared with `clubs-*`.** Same page shapes, but
   Grassroots diverges on cards (no button), badges, and the fixture/result rows — a shared
   stylesheet would need conditional classes on both sides.
4. **`semantic/alert` is not a web token.** The Figma design uses `semantic/alert` for a ~6px LIVE
   dot (Decision Log #149); `packages/shared` exports no such token to `apps/web`. The `LIVE` pill
   uses `--sn-brand-green` + a small `--sn-brand-navy` dot — the same navy-for-status treatment the
   rest of the app uses. Noted, not blocking; if the web token set gains `semantic/alert` later,
   this one dot is the only place to revisit.
5. **A `full_time` fixture with no `Result` row** (reachable only via PR 2's "End match") lands in
   Upcoming with a `FULL TIME` pill rather than Results — bucketing is driven by `result != null`.
   Rare, honest, flagged.

---

## 6. Verification

- `npx tsc --noEmit` — clean.
- `npm run lint` — clean.
- `npm run build` — clean production bundle.
- `npx vitest run` — **29 files / 195 tests, 0 failures** (up from 27 / 176: `GrassrootsPage.test.tsx`
  +6, `GrassrootsTeamPage.test.tsx` +11, `Header.test.tsx` +2; no existing test's assertions changed
  except the drawer-order list, which gained `"Grassroots"`).
- Dev-server smoke test (`npm run dev`): `/`, `/grassroots`, `/grassroots/:id`, `/community`,
  `/clubs` all HTTP 200, clean dev-server log.
- **No real browser / Playwright check** — none is available in this environment, the same
  verification ceiling as every prior `apps/web` figma-to-code PR.

---

## 7. Handover

- **PR 2 — `sprint-5/grassroots-conversion-organiser`** (branches off this branch): register team,
  schedule fixture (incl. the Opponent-TBD state), manage fixture / log result across the
  `scheduled → live → full_time` status machine. It surfaces: the "first write is final" 409 as an
  expected/explained outcome; the illegal-transition 409 verbatim (not a silently-disabled button);
  both 403 kinds (`GuardianConsentGuard` → link to `/guardian-consent`; `ForbiddenException` → the
  server message). No new lines in `api/grassroots.ts`.
- **Still open, unchanged:** #266's desktop icon-navbar Grassroots glyph (a `figma-design-system`
  shared-component task); #267 (drawer expandable groups — resolved as "keep flat" by #268);
  Decision Log #257 (the calendar component — resolved by PR #217, relevant to PR 2's schedule form);
  the org-CTA-on-the-team-page question (Decision Log #253 §6.7).
