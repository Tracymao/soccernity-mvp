# Sprint 4 — Sports Hub `apps/web` wiring

**Agent:** `figma-to-code`
**Date:** 2026-09-16
**Scope:** `apps/web` only. `services/api` was NOT touched.
**Depends on (both merged before this branch was cut):**
`sprint-4/sports-hub-highlightly-data-redesign` (PR #253, Decision Log
#311–#322) and `sprint-4/sports-hub-highlightly-backend` (PR #254,
Decision Log #323–#329).

---

## 1. What this closes

Before this branch, `apps/web`'s Sports Hub was still the Sprint-1-era
dummy-data stub (`SportsHubPage.tsx`, `sports-hub/sportsHubData.ts`) —
a hardcoded league list and five fake "Liverpool 1–3 Chelsea" rows, with
**no match-centre drill-down page at all**. The redesigned Figma screens
(10 desktop + 10 mobile + Match Momentum + Live Commentary) and the real
`SportsService` backend (8 Section 4.6 endpoints + the 2 genuine
additions, `momentum`/`events`) both existed but had zero `apps/web`
consumer.

This PR wires all of it: `SportsHubPage.tsx` now reads real live scores
and fixtures, and a brand-new `MatchCentrePage.tsx` (route
`/sports-hub/matches/:matchId`) is the real match-centre drill-down —
Match (Summary / Statistics / Lineups / Momentum / Commentary) plus the
three Level-1 siblings (H2H / Standings / Video).

## 2. New / changed files

- **`apps/web/src/api/sports.ts`** (new) — the full client, all 8
  `SportsService` endpoints, mirroring `sports.service.ts`'s `Public*`
  response shapes exactly. Genuinely public — no Authorization header,
  same convention `api/blog.ts` established for `BlogModule` (neither
  module has a guard).
- **`apps/web/src/pages/sports-hub/format.ts`** (new) — shared
  kickoff-time/phase-label formatting, pulled out once both
  `SportsHubPage.tsx` and `MatchCentrePage.tsx` needed it (the
  `GrassrootsTeamPage.tsx` `DAY_FMT`/`TIME_FMT` precedent).
- **`apps/web/src/pages/sports-hub/MatchCentrePage.tsx` + `.css` + `.test.tsx`**
  (new) — the match-centre drill-down. See §3.
- **`apps/web/src/pages/SportsHubPage.tsx`** (rewritten) — real data.
  See §4.
- **`apps/web/src/pages/sports-hub/sportsHubData.ts`** (trimmed) — only
  `RECENT_STORIES` (still illustrative — no news/story endpoint exists,
  see its own header comment) survives; `LEAGUES`/`MATCHES` are gone,
  replaced by real data.
- **`apps/web/src/pages/sports-hub/SportsHubPage.css`** — extended for
  real loading/error/empty states, team crests, a `Load more` button,
  and the full `MatchPhase` set of status-pill variants (`--live`,
  `--ft`, `--scheduled`, `--off`; the unused `--ht` variant — a leftover
  from the old three-value dummy `MatchStatus` enum — was dropped).
- **`apps/web/src/app/router.tsx`** — one new route,
  `sports-hub/matches/:matchId` → `MatchCentrePage`, a direct `AppShell`
  child (no site footer, no login gate — see §5).

## 3. `MatchCentrePage.tsx` — architecture

Two-level tab system, matching the Figma redesign's own IA (Decision Log
#318) exactly:

- **Level 1** (`?tab=`): `match` (default) | `h2h` | `standings` | `video`
- **Level 2**, sub-tabs of `match` only (`?sub=`): `summary` (default) |
  `stats` | `lineups` | `momentum` | `commentary`

Every tab's data is fetched **lazily**, on first activation, and cached
for the life of the component instance (`useLazyTab`, a small generic
hook) — the same "don't pay for a resource the visitor never looks at"
discipline `ProfilePage.tsx`'s lazy-loaded Followers/Following lists
already established (Section 5.5). Verified directly: landing on the
default Summary tab fires exactly `getMatchById` + `getMatchEvents`
(shared with Commentary) — `getMatchStatistics`/`getMatchLineups`/
`getMatchMomentum`/`getHeadToHead`/`getHighlights` are not called until
their own tab is opened (asserted in `MatchCentrePage.test.tsx`).
Switching to Commentary after visiting Summary reuses the already-fetched
events — confirmed `getMatchEvents` is called exactly once across both
tabs.

**Standings is the one tab that can't use the generic `useLazyTab` hook**
— it needs the *loaded match's own* `league.id`/`league.season`, not
just the route's `matchId`, so it has its own small `loadStandings`
effect. A match with no `league.id` (a real, possible Highlightly gap)
renders an honest error message and never calls `getStandings` at all —
tested directly.

Every tab has a retry affordance on a fetch failure (`RetryButton`,
calling the hook's own `load`/`loadStandings` function again) rather than
silently stranding the visitor.

## 4. Two real, confirmed Highlightly data gaps — not papered over

Per `services/api/src/modules/sports/README.md`'s own disclosure, this
PR does **not** fabricate data the vendor doesn't provide:

1. **Statistics is team-level only.** The Figma redesign's player
   box-score table is **not** reproduced — there is no per-match
   per-player endpoint from Highlightly (confirmed by the backend
   ticket). `StatisticsTab` renders the team-level comparison only, with
   an honest disclosure line: "Team totals only — per-player statistics
   aren't available from this data source."
2. **Standings carries no `form` field.** The Figma Standing screen's
   5-chip FORM column is **not** reproduced. `StandingsTab` renders the
   real table (position/team/P/W/D/L/GF/GA/GD/Pts) with an honest
   disclosure line: "Recent-form data isn't available from this data
   source yet."

Both gaps were re-confirmed live during this ticket's own manual
verification (§7) — the real `GET /sports/matches/:id/stats` and
`GET /sports/standings` responses genuinely carry no such fields.

## 5. `SportsHubPage.tsx` — real data

- **"Live" reads `GET /sports/live-scores`; "Today" reads
  `GET /sports/fixtures?date=<today>`.** Both are real clickable pills
  (were static `<span>`s before), defaulting to "Live" (matching the old
  UI's own default-active pill).
- **No dedicated "list leagues" endpoint exists** — the league sidebar
  is derived from whatever leagues have appeared across every load this
  page has made so far (`knownLeagues`, accumulated, not reset on a
  league-filtered reload) so picking a league doesn't collapse the
  sidebar down to one entry. Selecting a league **re-queries the server**
  (`?league=`), the same server-side-filter pattern `GrassrootsPage.tsx`'s
  city search already established — this codebase has no
  client-side-only filtering precedent for a resource this size. The
  search box above the league list stays a plain client-side substring
  filter over that accumulated list (matching the original UI).
- **Every match row links to `/sports-hub/matches/:id`** (was a static,
  non-interactive row before).
- **"Load more" via the real cursor** (was absent before — the old dummy
  list had no pagination since it was five hardcoded rows).
- **The old "Livescores are illustrative — Soccernity has not yet
  selected a sports-data vendor" disclosure is removed** — Decision Log
  #6 is resolved (Highlightly) and the data is real.
- **"Most Recent Stories" stays illustrative sample content** — no
  news/story endpoint exists in Section 4.6 (flagged, not built; reusing
  the now-real `BlogModule` for this rail is a disclosed idea for a
  future ticket, not done here — out of this ticket's scope).

## 6. No login gate, no site footer — both deliberate, both re-confirmed

- **No login gate anywhere in this PR.** Every `SportsService` route is
  genuinely public (`services/api/src/modules/sports/README.md`'s own
  "Guard — none, deliberately" section) — matches `SportsHubPage.tsx`'s
  pre-existing precedent.
- **`MatchCentrePage` has no site footer** — a direct `AppShell` child,
  not nested under `FooterLayout`, the same category as
  `ClubFanPage`/`GrassrootsTeamPage`/`ContestPage` (a drill-down/detail
  page, not one of `FooterLayout`'s five named routes).

## 7. Verification

- **Real, re-measured before/after test counts** — stashed every change
  and re-ran the full suite against pristine `origin/main` to get a
  genuine baseline, not an assumed one: **43 suites / 315 tests, 0
  failures → 44 suites / 337 tests, 0 failures** (+1 suite —
  `MatchCentrePage.test.tsx`, 17 tests; `SportsHubPage.test.tsx`
  rewritten 5 → 10 tests, +5 net).
- `npx tsc --noEmit`, `npm run lint`, `npm run build` all clean.
- **A genuine end-to-end manual trace against the real, locally running
  stack** — not simulated, not mocked:
  1. Confirmed Postgres/Redis were already running (`docker ps`), then
     started `services/api`'s real dev server (`npm run start:dev`) with
     the root `.env`'s real `DATABASE_URL`/`DIRECT_URL`/`REDIS_URL`.
     `GET /health` → `{"status":"ok","database":"connected"}`.
  2. **Confirmed graceful degradation with no real Highlightly
     credentials configured** (none exist in this environment — the same
     disclosed "wired but inactive" state the backend ticket's own
     README states): `GET /sports/live-scores` and
     `GET /sports/fixtures?date=` both return a clean empty page, never
     an error, matching `SportsService`'s own documented degrade-to-cache
     behavior.
  3. **Seeded one real `MatchData` row + one real `Standing` row directly
     via Prisma** (`services/api`'s own generated client, run as a
     throwaway script, deleted afterward — the same "seed directly, no
     live vendor account exists yet" precedent
     `sprint-4/public-blog-articles-feed`'s own report used) — a
     Manchester United vs Manchester City fixture with real team-level
     stats, lineups, a substitutions timeline, match events (a goal, a
     yellow card, a substitution), one historical H2H meeting, one
     highlight clip, and a two-team standings table.
  4. **Curl'd all 8 real endpoints directly against the seeded data** —
     `live-scores`, `matches/:id`, `.../stats`, `.../lineups`, `.../h2h`,
     `.../momentum`, `.../events`, `standings`, `highlights/:id` — every
     one returned exactly the shape `api/sports.ts`'s TypeScript types
     expect, confirmed by eye against the raw JSON.
  5. **A genuine JS-execution smoke test**: a temporary Vitest spec
     (deleted before commit, never reaching `main` — the same
     "temporary spec, deleted before commit" precedent this project's
     history uses for every prior frontend PR's own verification)
     rendered the **real, unmocked** `SportsHubPage` and `MatchCentrePage`
     components against the real running backend (real `fetch`, no
     `vi.mock`) and confirmed: the seeded match appears in the live-scores
     list with a working link; the match-centre page's Summary tab shows
     the real goal (Rashford); Statistics shows the real 48%/52%
     possession split; Lineups shows the real starting keeper (Onana) and
     coach (Ruben Amorim); H2H shows the real historical meeting with a
     working link to its own match-centre page; Standings shows the
     disclosure line and loads without calling `getStandings` a second
     time. **This is the "full match-centre drill-down (details → stats
     → lineups → H2H → standings) works end to end" proof Sprint 4's own
     done-when criterion asks for** — confirmed explicitly, not assumed
     from component-level mocked tests alone.
  6. Started the real Vite dev server and `curl`'d `/`, `/sports-hub`,
     `/sports-hub/matches/verify-match-1`, `/community` — all real HTTP
     200s, clean SPA shell.
  7. **Cleanup**: the temporary verification spec was deleted before this
     commit; the seeded `MatchData`/`Standing` rows were deleted via a
     second throwaway script, re-confirmed via `GET /sports/live-scores`
     returning an empty page again; both dev servers were stopped
     (`taskkill` on their listening PIDs). Postgres/Redis containers were
     already running before this session started and were left running,
     not touched.
- **No real browser/Playwright check was available in this
  environment** — the real-backend Vitest render (step 5 above) plus the
  live dev-server HTTP check (step 6) is the actual verification ceiling
  here, the same disclosed limit every prior `apps/web` PR in this
  project states.

## 8. Not built (per this ticket's own explicit scope)

- **Top scorers, match-specific notification/alert preferences, and any
  SportMonks-exclusive data** (xG, Pressure Index, shot maps, Expected
  Lineups) — none of it was built, matching the ticket's own "Don't"
  list. No UI space was left inviting them.
- **`services/api` was not touched at all.** The two real Highlightly
  data gaps (§4) and the `league`/`season` un-derivable-standings case
  are all handled client-side with an honest disclosure, not by
  patching the backend from this ticket.
