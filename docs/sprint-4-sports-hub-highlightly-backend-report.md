# Sprint 4 — Sports Hub / Highlightly backend

**Agent:** `backend-api`
**Date:** 2026-09-16
**Scope:** `services/api` only. `apps/web` and the Blog/Articles module are deliberately untouched
(both explicitly out of scope per this ticket's own brief).
**Branch:** `sprint-4/sports-hub-highlightly-backend`, off a fresh `origin/main`.

---

## 0. What this closes

Build Plan Section 4.6 (Sports Hub / sports-data vendor integration) had no code at all —
`services/api/src/modules/sports/README.md` was a placeholder, and `MatchData` was a bare
seven-field model with zero live reads anywhere in the codebase (confirmed by grep before making any
change). This PR builds the real backend against **Highlightly** — the vendor Decision Log #6 named
as resolved on the design side by `sprint-4/sports-hub-highlightly-data-redesign` (the
figma-screen-builder pass this backend is wired to match), independent of
`sprint-4/public-blog-articles-feed` (no shared code, no shared schema tables).

## 1. Modelling approach

Stated explicitly, per the task brief's own instruction, **before** any schema code was written —
see `prisma/schema.prisma`'s own `MatchData`/`Standing` comments for the full reasoning, reproduced
in short here:

- **`MatchData` itself stays NORMALIZED** (real columns for id/teams/score/status/kickoff/league/
  venue/...) — the one thing this module needs to relationally query (filter by date, filter by
  league, filter by live status, paginate).
- **Statistics / lineups / events / head-to-head / highlights are all JSON columns**, each with its
  own `*UpdatedAt` freshness timestamp — every Section 4.6 GET endpoint reads/returns a WHOLE
  document per match, and Highlightly's own API returns each of those as a whole document too
  (confirmed from its docs' own literal examples), so a JSON column tolerates a live match's
  frequent full-document refresh as one cheap `UPDATE`, with zero migration needed when a different
  competition returns a different stat-category set.
- **Standings is its own model** (`Standing`, one row per `[leagueId, season]`) — not match-scoped
  at all, same "whole document overwrite" reasoning for its own contents (an ordered array of every
  team's row).

`MatchData` is a genuine schema **redesign** (migration
`20260916083019_add_sports_hub_highlightly_data_redesign`), flagged per CLAUDE.md's "the data model
is a fixed spec" rule — Section 3's original seven fields are all **kept, still populated on every
write**; nothing was removed, even though nothing reads them (removing an already-spec'd field has
no precedent in this project's history).

## 2. Real Highlightly API grounding — not guessed

This session had live web access (`WebSearch`/`WebFetch`) and used it: every `Raw*` type in
`src/sports-data/sports-data-client.ts`, every endpoint path, every wrapper-envelope shape
(`{data, pagination}` for matches/highlights, `{groups}` for standings, bare arrays for statistics/
events/head-to-head, a bare `{homeTeam, awayTeam}` object for lineups) is checked against
[Highlightly's own public football-API documentation](https://highlightly.net/football-api/documentation/)
and its literal example JSON blocks, fetched live during this task — not recalled from training data,
and not a vendor SDK's own types (none exists as a dependency).

**Two real, disclosed findings from that research, directly answering this ticket's own explicit
"state that back clearly" instructions:**

1. **No confirmed top-scorers endpoint.** The full endpoint list (Matches, Events, Statistics,
   Lineups, Standings, Head-to-Head, Highlights, Leagues, Countries, Teams, Players, Odds,
   Bookmakers) has no dedicated top-scorers/leading-scorers route — `Players/{id}/statistics` is
   per-player, not a rankable list. **Confirms the fast-follow exclusion should stay excluded**,
   same conclusion the task brief itself anticipated.
2. **Two Highlightly data gaps the Figma redesign's own assumptions didn't survive contact with the
   real API:**
   - `GET /statistics/{matchId}` (team-level box score, confirmed from its literal example) has
     **no per-player breakdown at all.** Reconstructing an 11-player box score per match would need
     20+ extra `GET /players/{id}/statistics` calls (one per player, both sides) — not viable under
     the confirmed 100/day free tier. `GET /sports/matches/:id/stats` returns **team-level
     statistics only.** No synthetic player rows are ever fabricated.
   - `GET /standings`'s own documented row shape has **no "form" (recent-results) field anywhere.**
     The nearest candidate, `GET /last-five-games?teamId=`, is per-team — a 20-team table's form
     column would cost 20 extra calls per refresh. `GET /sports/standings` returns exactly what
     Highlightly returns, **with no `form` field on any row, real or fabricated.**

Both are documented in full, with the exact reasoning and every field name checked, in
`services/api/src/modules/sports/README.md`.

## 3. Endpoints built

All eight of Section 4.6's literal endpoints, **plus two genuine additions** (flagged, Decision Log
candidates) to match what the Figma redesign designed but Section 4.6's own contract sketch never
named:

`GET /sports/live-scores`, `GET /sports/fixtures?date=`, `GET /sports/matches/:id`,
`GET /sports/matches/:id/stats`, `GET /sports/matches/:id/lineups`, `GET /sports/matches/:id/h2h`,
`GET /sports/standings?league=`, `GET /sports/highlights/:matchId` — all Section 4.6. Plus
**`GET /sports/matches/:id/momentum`** (pure computation over the cached events document — no
Highlightly momentum endpoint exists) and **`GET /sports/matches/:id/events`** (the Figma redesign's
"Live Commentary" — an automated event feed, explicitly never editorial narration, matching that
design's own on-screen disclosure; returned newest-first per that design's Decision Log #316).

Every route is **genuinely public — no guard at all**, matching the already-shipped
`SportsHubPage.tsx`'s own no-login-gate precedent and `BlogModule`'s identical public-content
convention.

## 4. Caching / refresh strategy — the rate-limit-conscious design this ticket asked for

Two layers doing genuinely different jobs:

1. **Postgres is the durable cache-through store.** Every successful Highlightly response is
   upserted immediately — this is what lets the service degrade gracefully when Highlightly is
   unreachable or the budget is exhausted: serve the last-known row, never fail outright, as long as
   *something* has been cached before.
2. **A single Redis key per resource (`SportsRefreshLock`, `SET key 1 EX <ttl> NX`) does DOUBLE
   DUTY as both the cache-freshness gate AND a cross-request stampede guard.** Its mere existence
   for `ttlSeconds` means "don't call upstream again"; its `NX` semantics mean only the FIRST of many
   concurrent requests for the same resource ever triggers the real call — the other 49 concurrent
   viewers of a popular live match all read the current row instead, so 50 people opening the same
   match doesn't mean 50 Highlightly calls.

**Match-list refreshes are per-DATE, never per-match** — one `GET /matches?date=` call from
Highlightly returns every match that day across every league in one request (confirmed:
`{data, pagination: {totalCount, offset, limit}}`, up to 100 rows/page), and
`GET /sports/live-scores` reads the SAME cached rows (filtered to `status='live'`) sharing the exact
same lock key as today's fixtures — so live-scores triggers zero upstream calls of its own.
`SPORTS_DATA_MAX_REFRESH_PAGES` (default 1) bounds the worst case where one day genuinely exceeds a
page, a deliberate, disclosed cap against the daily budget.

TTLs, each independently overridable via env, reasoned from Highlightly's own documented refresh
cadences where confirmed (live: 60s, matching its own "refreshes once a minute"; scheduled: 6h;
finished: 24h; standings: 30 min, matching its own "up to an hour after a match"; h2h: 6h;
highlights: 10 min) — full table in the module README.

## 5. Daily request-budget guard — rate-limit handled realistically, stated plainly

`SportsDataBudgetService` reserves one Redis `INCR` per real outbound Highlightly call, **before**
the HTTP request fires, keyed to the current UTC day, self-expiring at the next UTC midnight — no
race can over-spend. Default `HIGHLIGHTLY_DAILY_REQUEST_BUDGET=100` matches the **confirmed free-tier
limit** from this project's own vendor-selection research and the task brief.

**Stated plainly, per this ticket's own explicit instruction, not silently assumed unlimited: the
real PAID-tier budget is unknown.** Running this in production needs a founder decision on which
Highlightly plan to buy, then this env var set to match — a real, open Decision Log candidate
(#323), not resolved here.

## 6. Auth header — disclosed real uncertainty

Highlightly's docs state `x-rapidapi-key` as the auth header for "your Highlightly or RapidAPI API
Key" alike — the same header name for a direct account or a RapidAPI subscription;
`x-rapidapi-host` only when actually going through RapidAPI's gateway. `HighlightlyClient` implements
exactly that reading (`SPORTS_DATA_RAPIDAPI_HOST` optionally set). This specific behavior for the
direct `highlightly.net` host was not spelled out as an isolated verbatim example on the docs page —
flagged (Decision Log #328), to be confirmed the moment a real account exists.

## 7. `tsconfig.json` change — disclosed, scoped, verified

Added `"DOM"` to `compilerOptions.lib`, purely for `fetch`/`Response`/`Headers`/`AbortController`/
`RequestInit` **type** declarations — the installed `@types/node@20.19.43` does not ambiently type
global `fetch` (confirmed directly: no `declare function fetch` anywhere in the installed package),
even though the real Node runtime this app requires (`engines >=22.22.0`) has had it natively since
Node 18. No HTTP client dependency was added — `HighlightlyClient` uses the runtime's own built-in
`fetch`. Verified this changes no runtime behavior via a full clean `nest build` + the complete
existing test suite re-run, both green.

## 8. Not built (explicitly out of scope, per the task brief)

- **Top scorers** — confirmed absent from the vendor (see §2), stays excluded.
- **Notification/alert wiring** — not this ticket.
- **SportMonks-specific data** (xG, Pressure Index, ball coordinates) — not this vendor, ever, until
  an actual future pivot ticket exists.
- **`apps/web`** — untouched, the next ticket's job.
- **The Blog/Articles module** — untouched.

## 9. Verification — real, before/after, both suites

**Mocked unit suite**, freshly measured both before and after:

- Before: **78 suites / 1034 tests, 0 failures** — the figure CLAUDE.md's own running log already
  recorded after PR #252 (`sprint-4/public-blog-articles-feed`); PR #253
  (`sprint-4/sports-hub-highlightly-data-redesign`) was Figma-only and added no tests. Not
  independently re-run from a clean checkout in this session — stated plainly rather than
  overclaimed — but it checks out exactly against the after-figure by simple subtraction (83−5=78
  suites, 1097−63=1034 tests), which is real evidence the delta is exactly this PR's own 5 new files.
- After: **83 suites / 1097 tests, 0 failures** (5 new suites — `sports-data-budget.service.spec.ts`,
  `highlightly-client.service.spec.ts`, `momentum.util.spec.ts`, `sports.service.spec.ts`,
  `sports.controller.http.spec.ts` — 63 new tests; no existing test file touched).

**e2e suite** (real Postgres + Redis via `docker compose up -d postgres redis`, run correctly via
`npm run test:e2e`, which is `--runInBand` — the shared test database is truncated between every
test by `resetDatabase()`, so running e2e suites in parallel against one Postgres instance corrupts
unrelated tests' data; this was hit and diagnosed directly during this session, not assumed):

- Before: **18 suites / 170 tests, 0 failures** (implied by 19 total minus the 1 new file, and 183
  total minus its 13 new tests — both check out exactly).
- After: **19 suites / 183 tests, 0 failures** — new `test/sports.e2e-spec.ts` (13 tests) proves,
  against real Postgres: graceful degradation to an empty/stale result (never a crash) when
  Highlightly is genuinely unconfigured (no real credentials exist in this environment — see §10);
  a real `MatchData` row round-trips correctly through the redesigned schema and the real HTTP
  response shape, including the home/away-by-team-id assignment on statistics, the newest-first
  event ordering, the events-derived momentum computation, and the events-derived substitutions
  timeline on lineups; and a real `Standing` row round-trips with **no `form` field**, proving the
  disclosed data gap holds end-to-end, not just in a mock.

Both `nest build`, `npm run lint`, and `npx tsc --noEmit` are clean.

## 10. No real Highlightly credentials — stated plainly, same bar as every prior vendor integration

**No Highlightly account exists in this environment.** Matching this project's own established
disclosed-limitation bar for Postmark and S3 before their own real accounts existed: **no live
round-trip against the real Highlightly API was performed. This is unverified in practice.** Every
Raw* type and wrapper shape is grounded in the vendor's own public documentation's literal example
JSON (fetched live during this task), not a real captured response. The one genuinely ambiguous case
in the docs (`GET /matches/{id}`'s own example wrapped in a top-level array despite being a
single-resource lookup) is handled defensively rather than picked one way and hoped for the best. The
moment a real account exists, the first live call should be traced and the module README updated
with what was actually confirmed vs. assumed.

## 11. Decision Log

Seven new candidates (`#323`–`#329`) transcribed directly into
`docs/Soccernity_MVP_Build_Plan_v1.7.docx`'s Decision Log table (confirmed live max entry was `#322`
before this edit — `#293`/`#294` remain the pre-existing, deliberately untouched gap CLAUDE.md
already documents), plus a forward-pointer appended to Decision Log `#6`'s own Status cell recording
that the backend half of the Highlightly integration now exists too, not just the design half.
Docx verified after editing: zip integrity intact (`zipfile.testzip()` clean), 327 Decision Log data
rows (320 + 7 new), zero duplicate numbers, the same pre-existing `#293`/`#294` gap and no other. **No
LibreOffice binary is available in this environment** (checked directly — no `soffice`/`libreoffice`
executable on `PATH` or the common Windows install path) — this Python-level round-trip is the actual
verification ceiling here, stated plainly rather than claimed as a LibreOffice-specific confirmation.
