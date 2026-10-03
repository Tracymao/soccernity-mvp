# sports module

**Build target: Sprint 4 — Section 4.6 of the MVP Build Plan.**
Built by `sprint-4/sports-hub-highlightly-backend`, independent of `sprint-4/public-blog-articles-feed`
(no shared code, no shared schema tables) and of `sprint-4/sports-hub-highlightly-data-redesign`
(the Figma design pass this backend is wired against — no `apps/web` code is touched by this PR;
that's the next ticket's job, per this PR's own brief).

Vendor: **Highlightly** (Decision Log #6, resolved on the design side by the figma-screen-builder
"Highlightly data redesign" pass; this PR is the backend half). Public docs:
https://highlightly.net/football-api/documentation/ — fetched live during this task and checked
against the page's own literal example JSON for every endpoint this module calls. No Highlightly
SDK dependency exists (or is needed) — `src/sports-data/highlightly-client.service.ts` is a plain,
typed wrapper around the runtime's own built-in `fetch`.

## Modelling approach — HYBRID, stated explicitly per this PR's own task brief

- **The match/fixture itself is NORMALIZED** as real `MatchData` columns (id, teams, score, status,
  kickoff, league, venue, ...) — this is the one thing this module needs to relationally QUERY:
  filter by date, filter by league, filter by live status, order by kickoff time, paginate. None of
  that is practical against an opaque JSON blob without a GIN index (real added complexity for a
  table this small) or reading every row into the app to filter in memory.
- **Match statistics / lineups / events / head-to-head / highlights are all JSON columns**, one per
  sub-resource, each with its own `*UpdatedAt` freshness timestamp. Nothing in this module (or
  Section 4.6's own endpoint contract) ever queries into a SINGLE FIELD of a stat row, a single
  player's lineup slot, or a single event — every Section 4.6 GET endpoint reads and returns the
  WHOLE document for one match at once, and Highlightly's own API returns each of those as a whole
  document too (confirmed from its docs' own examples — `GET /statistics/{matchId}`,
  `/lineups/{matchId}`, `/events/{id}` each return one complete array/object per call, not
  incremental diffs). During a live match, refreshing normalized child rows would mean diffing and
  upserting ~18 stat rows + 22 lineup slots + a growing events list on every poll; overwriting one
  JSON column is a single `UPDATE`, cheap regardless of how much the document's internal shape
  varies match-to-match (different competitions return different stat categories — a JSON column
  tolerates that with zero migration; a normalized `StatRow` table would need a stat-type catalog).
- **Standings is its own model** (`Standing`, one row per `[leagueId, season]`), not a JSON column
  on `MatchData` — it isn't match-scoped at all. `GET /sports/standings?league=&season=` reads one
  whole table (an ordered array of every team's row) per league+season, the same "whole document
  overwrite" reasoning as above.

`MatchData` is a genuine schema **redesign**, not just an extension (migration
`20260916083019_add_sports_hub_highlightly_data_redesign`) — flagged per CLAUDE.md's "the data
model is a fixed spec" rule. Section 3's original seven fields
(`externalRef`/`competition`/`teams`/`score`/`status`/`kickoffTime`) are all **kept untouched, still
populated on every write** — `MatchData` had zero live reads before this PR (confirmed by grep), so
nothing breaks, but removing an already-spec'd field has no precedent anywhere in this project's
history and wasn't the safer call here either.

## Two real, confirmed Highlightly data gaps — found during this build, not silently built around

> **Correction (`sprint-4/sports-vendor-capability-registry`, 2026-09-26): gap #1 below is WRONG as
> originally written.** Highlightly serves a per-player box score for one match in one call. **Confirmed
> live on 2026-10-03 (Decision Log #324):** `GET /box-score/{matchId}`, one request per match, returning all
> players. This module still serves team-level stats only (`GET /sports/matches/:id/stats`); the box-score
> call is not built here, pending a costing decision against the free-tier budget (Decision Log #323). The
> original text is kept below for the historical record. Full evidence: `highlightly-vs-sportmonks.md`,
> Finding 1 and Finding 5. Gap #2 (standings form) was re-checked and stands.

Per this PR's own task brief's instruction to "state that back clearly" rather than quietly
assuming or padding out missing vendor data:

1. **~~No batched per-match player box scores.~~ (superseded — see the correction above)** `GET /statistics/{matchId}` (confirmed against
   Highlightly's own documented example response) is **team-level only** —
   `[{team, statistics: [{value, displayName}]}]`, nothing per-player. Per-player numbers
   (minutes/goals/assists/shots/passes/tackles/fouls) exist only via `GET /players/{id}/statistics`,
   called **one player at a time**. Reconstructing an 11-player box score for one match would need
   20+ extra Highlightly calls (every starter + substitute on both sides) — not viable under the
   confirmed 100-requests/day free tier, and not obviously viable under any realistic paid tier
   either without knowing the real budget (see below). The Figma redesign this backend is wired
   against (`sprint-4/sports-hub-highlightly-data-redesign`) assumed player box scores were
   available; they are not, from this vendor, without an unsustainable per-player API-call fan-out.
   `GET /sports/matches/:id/stats` returns **team-level statistics only**. No synthetic/fabricated
   player rows are ever generated.
2. **No standings "form" field.** `GET /standings`'s own documented example standing row —
   `{position, points, team, total: {wins, draws, games, loses, scoredGoals, receivedGoals}, home,
   away}` — has no `form` (recent-results) field anywhere. The Figma Standing screen (and its
   redesign pass) shows a 5-chip FORM column. There is no cheap way to derive this either: the
   nearest candidate, `GET /last-five-games?teamId=`, is again per-team, meaning a full 20-team
   league table's form column would cost 20 extra calls per refresh. `GET /sports/standings` returns
   exactly what Highlightly returns — **no `form` field on any row, real or fabricated.** The
   frontend's own already-shipped FORM column (currently dummy data, per CLAUDE.md's Sports Hub
   conversion notes) stays unwired to this endpoint's own data until a genuinely cheap per-team form
   data source exists — a real Decision Log candidate (see below), not resolved here.

**Top scorers, checked and confirmed absent** — per the task brief's own explicit instruction to
report this back rather than silently building against it: Highlightly's public API documentation
lists Matches, Events, Statistics, Lineups, Standings, Head-to-Head, Highlights, Leagues, Countries,
Teams (+ team statistics, last-five-games), Players (+ player detail, player statistics), Odds, and
Bookmakers. **There is no dedicated top-scorers/leading-scorers endpoint.** `Players/{id}/statistics`
is per-player, not a rankable list. This confirms the fast-follow exclusion should stay excluded —
building it would mean querying every player in a league individually, the same fan-out problem as
the box-score gap above.

## Vendor capability registry (added by `sprint-4/sports-vendor-capability-registry`)

`sports-data-provider.constants.ts` holds `SPORTS_DATA_PROVIDER_CAPABILITIES` — per provider
(`highlightly` | `sportmonks`), a `supported | unsupported | unconfirmed` status for every field in the
vendor comparison — plus `providerSupports()`. The active provider comes from `SPORTS_DATA_PROVIDER`
(default `highlightly`; an unknown value fails at boot). `SportsService` omits any response field the
active provider doesn't support: today that is standings `form`, which is only emitted when the provider
supports it **and** the row has data. Flipping the provider changes what the capability check reports
only — `HighlightlyClient` is still the sole `SportsDataClient` implementation, and the service warns at
boot if you select another. The evidence behind every status, the tier/price facts, and the list of
fields hidden today are in `highlightly-vs-sportmonks.md`.

## Section 4.6 endpoint mapping

| Route | Section 4.6? | Notes |
|---|---|---|
| `GET /sports/live-scores` | Yes | Reads `MatchData` where `status='live'`. **Triggers no upstream call of its own** — see "Caching / refresh strategy" below. |
| `GET /sports/fixtures?date=` | Yes | `date` required (`YYYY-MM-DD`); `league` is an additional, optional filter (flagged, same category as Blog's `categoryId`/`categorySlug`). |
| `GET /sports/matches/:id` | Yes | The one endpoint that can bootstrap a match Postgres has never seen (see below). |
| `GET /sports/matches/:id/stats` | Yes | Team-level only — see data-gap #1 above. |
| `GET /sports/matches/:id/lineups` | Yes | Also derives a `substitutions` timeline from the already-cached `events` column (real data — Highlightly's `Substitution` event type carries `player`/`substituted`), never a fresh fetch of its own. |
| `GET /sports/matches/:id/h2h` | Yes | Aggregate (wins/draws/goals) computed server-side from the raw meeting list, oriented to the CURRENT match's home/away sides regardless of which side was home in each historical meeting. |
| `GET /sports/standings?league=` | Yes | `season` is an additional, optional param (Highlightly's own endpoint requires it) — see `resolveSeason`'s own comment for the default-to-latest-cached-season fallback. No `form` field — see data-gap #2. |
| `GET /sports/highlights/:matchId` | Yes | Not paginated — a single match's clip count is naturally small, unlike a day's fixtures. |
| `GET /sports/matches/:id/momentum` | **No — Decision Log candidate** | Not in Section 4.6's literal list. Built to match the Figma redesign's Match Momentum section. Pure computation over the cached `events` document — see `momentum.util.ts`'s own header comment for the full "honest approximation, not a licensed statistic" disclosure (no possession/shot-location time series exists to derive a richer signal from). |
| `GET /sports/matches/:id/events` | **No — Decision Log candidate** | Not in Section 4.6's literal list. Backs the Figma redesign's "Live Commentary" — an automated event feed, explicitly not editorial narration (matching that design's own on-screen disclosure). Newest-first (Decision Log #316 in the Figma redesign report). |

Both `momentum` and `events` are flagged the same way this project has flagged every other
spec-gap addition (`POST /reports`, `GET /admin/articles`, `PATCH /fixtures/:id/status`, etc.) —
built anyway, because without them the endpoints the Figma redesign actually needs simply don't
exist.

## Caching / refresh strategy

**Two layers, doing genuinely different jobs — not one cache with two names:**

1. **Postgres (`MatchData`/`Standing`) is the durable cache-through store.** Every successful
   Highlightly response is upserted immediately. This is what lets the service degrade gracefully —
   if Highlightly is unreachable, or the daily budget is exhausted, a request for a match this
   service has already seen is served the last-known row rather than failing outright.
2. **Redis (`SportsRefreshLock`) gates WHETHER a request is allowed to call Highlightly at all** —
   one key per resource (`sports:refresh:matches:<date>[:<leagueId>]`,
   `sports:refresh:match:<id>:stats`, `sports:refresh:standings:<leagueId>:<season>`, ...), written
   via `SET key 1 EX <ttlSeconds> NX`. This ONE mechanism does double duty:
   - **Cache-freshness gate**: the key's mere existence for `ttlSeconds` means "a refresh already
     happened (or is in flight) recently enough — read whatever's already in Postgres, don't call
     upstream again."
   - **Cross-request stampede guard**: because the write is `NX` (only-if-not-exists), only the
     FIRST of many concurrent requests for the same resource within the TTL window ever gets `true`
     back. If 50 different users are viewing the same live match at once and its cached row just
     went stale, only ONE of those 50 requests calls Highlightly — the other 49 read the current
     (about-to-be-refreshed) row instead. Without this, a popular live match could burn through the
     entire daily budget in seconds from concurrent traffic alone.

**Match-list refreshes are per-DATE (and optionally per-league), never per-match.** A single
`GET /matches?date=` call from Highlightly can return every match for a whole day across every
league in one request (confirmed from the docs — `{data: [...], pagination: {totalCount, offset,
limit}}`, up to 100 rows per page) — so `GET /sports/fixtures?date=` and `GET /sports/live-scores`
(which reads the SAME cached rows, filtered to `status='live'`, and shares the exact same lock key
for "today") together cost **at most one real Highlightly call per stale refresh window**, no matter
how many individual matches or users are involved. `SPORTS_DATA_MAX_REFRESH_PAGES` (default 1)
bounds the worst case where a single day genuinely has more matches than one page can hold — a
deliberate, disclosed cap against the daily budget, not an oversight.

**TTL defaults, each independently overridable via env** (`sports.constants.ts` /
`.env.example`), reasoned from Highlightly's own documented refresh cadences where confirmed:

| Resource | Default TTL | Reasoning |
|---|---|---|
| Live match data (any resource, phase=live) | 60s | Matches Highlightly's own documented "refreshes once a minute" cadence for live matches. |
| Scheduled match data | 6h | A not-yet-started fixture's lineups/details rarely change faster than that. |
| Finished match data | 24h | Effectively immutable, but not treated as literally infinite — rare post-match corrections (a VAR review overturning a card after the fact) are still possible. |
| Standings | 30 min | Matches Highlightly's own documented "standings refresh up to an hour after a match." |
| Head-to-head | 6h | A meeting history only grows once per fixture between two teams. |
| Highlights | 10 min | New clips can appear during/shortly after a live match; tempered well below "once a minute" against the daily budget. |

## Daily request-budget handling (rate-limit realism)

Highlightly's **free tier is a confirmed 100 requests/day** (per this project's own vendor-selection
research, matching the task brief). `SportsDataBudgetService`
(`src/sports-data/sports-data-budget.service.ts`) enforces this via a single Redis `INCR` per real
outbound Highlightly call — keyed by the current UTC calendar day, self-expiring at the next UTC
midnight (no separate cleanup job needed) — called **before** the HTTP request itself fires, so a
race never over-spends. Once the budget's exhausted for the day, `HighlightlyClient` throws
`SportsDataBudgetExhaustedError`; `SportsService` catches this the same way it catches any other
upstream failure — serve the stale cached row if one exists, otherwise a 5xx.

**Stated plainly, per this PR's own explicit instruction, not silently assumed unlimited: the real
PAID-tier request budget is not known.** `HIGHLIGHTLY_DAILY_REQUEST_BUDGET` defaults to 100 (the
confirmed free tier) and is a bare env override — running this in production against a genuinely
higher (or lower) paid-plan quota needs a founder decision on which Highlightly plan to buy, then
that override set to match. This is a real, open Decision Log candidate (see below), not resolved by
this PR.

## Auth header — confirmed live (2026-10-03, Decision Log #328)

`HighlightlyClient` sends `x-rapidapi-key` on every call, and `x-rapidapi-host` only when
`SPORTS_DATA_RAPIDAPI_HOST` is set. Checked against the real account, through the real client:

- `x-rapidapi-key` alone to `soccer.highlightly.net`: **200**, with real match data.
- No key at all: **403** `Missing mandatory HTTP Headers`.
- `x-rapidapi-host` sent to the direct host as well: **200**. Harmless, but the code still sends it only
  when explicitly configured.

So the header behavior the client implements is correct for the direct host. Still unverified: the
RapidAPI gateway path (no RapidAPI-routed key was tested).

## Route ordering

`SportsMatchesController` (`live-scores`, `fixtures`, `matches/:id[...]`, `highlights/:matchId`) and
`SportsStandingsController` (`standings`) — split the same way `grassroots`'s teams/fixtures
controllers are, grouping by what the resource is fundamentally about (match-centric vs.
league-centric), not by URL prefix alone. No route-ordering hazard anywhere: every static segment
(`live-scores`, `fixtures`, `standings`, `highlights/:matchId`) is a different top-level path from
`matches/:id`, unlike the literal `'mine'`/`'search'`-next-to-`':id'` hazard this codebase has
flagged elsewhere (e.g. `banter.controller.ts`).

## Guard — none, deliberately

Every route in this module is `JwtAuthGuard`-free — genuinely public, matching this codebase's
already-shipped `SportsHubPage.tsx` (no login gate, confirmed in CLAUDE.md's own conversion notes)
and the identical no-guard-at-all precedent `BlogModule`'s `ArticlesController` already established
for public content (Build Plan Section 4's own "no auth required" framing applies the same way
here — nothing in Section 4.6 names an auth requirement, and live scores are exactly the kind of
content a logged-out visitor should see).

## Decision Log candidates (none resolved here — flagged for Build Plan Section 9)

1. **The real Highlightly paid-tier request budget is unknown.** `HIGHLIGHTLY_DAILY_REQUEST_BUDGET`
   defaults to the confirmed free-tier 100/day; production needs a founder decision on which plan to
   buy, then this override set to match.
2. **~~No batched player box-score data exists from this vendor~~ — CORRECTED and CONFIRMED live (2026-10-03,
   Decision Log #324).** `GET /box-score/{matchId}` returns every player for one match, one call. Only that
   path returns box-score data; the other candidates tested were `/players/{matchId}` (200, empty array),
   `/players/{id}/box-scores` and `/football/match-box-score/{matchId}` (both 404). `GET
   /sports/matches/:id/stats` is still team-level only because the box-score call is not built yet. Building
   it is a separate decision, to be costed against the free-tier budget (#323) first.
3. **No standings "form" field exists from this vendor** (data gap #2 above) — the Figma Standing
   screen's FORM column has no real data source today.
4. **No confirmed top-scorers endpoint exists from this vendor** — the fast-follow exclusion stays
   excluded; building it would face the same per-player fan-out problem as #2 above.
5. **`momentum` and `events` are genuine additions beyond Section 4.6's literal eight-endpoint
   list**, built to match what the Figma redesign designed. Section 4.6's own contract sketch should
   be updated to include them — this README doesn't do that edit itself, matching how prior similar
   findings in this project (e.g. Decision Log #23 on `GET /auth/me`) were left for whoever next
   edits Section 4 in the live Build Plan document.
6. **Resolved (Decision Log #328, 2026-10-03):** the direct host's auth-header behavior is confirmed
   live — see "Auth header — confirmed live" above.
7. **`league` on `GET /sports/fixtures`/`GET /sports/live-scores`, and `season` on `GET
   /sports/standings`, are additional params beyond Section 4.6's literal query-string list** —
   flagged the same way Blog's `categoryId`/`categorySlug` filters were.
8. **Highlightly's live box score contains populated xG fields (and a `matchRating` per player).** Observed
   2026-10-03 on one finished match (`highlightly-vs-sportmonks.md` Finding 5). Resolved in the registry by
   `sprint-4/box-score-rating-xg`: `expectedGoals` and `playerRatings` are now `supported` for Highlightly,
   and `GET /sports/matches/:id/box-score` serves them. Still open: field coverage across more leagues and
   matches, since the sample is one match, and whether the xG is Highlightly's own model or a third-party feed.

## Verification

- Mocked unit suite: see the PR's own commit/report for the exact before/after count — every new
  file (`sports-data-budget.service.spec.ts`, `highlightly-client.service.spec.ts`,
  `momentum.util.spec.ts`, `sports.service.spec.ts`, `sports.controller.http.spec.ts`) is new; no
  existing test file was touched.
- `nest build`, `npm run lint`, `npx tsc --noEmit` all clean. `tsconfig.json` gained `"DOM"` in
  `lib` — purely for `fetch`/`Response`/`Headers`/`AbortController`/`RequestInit` TYPE declarations
  (the installed `@types/node@20.19.43` does not ambiently type global `fetch`, even though the real
  Node runtime this app requires — `engines >=22.22.0` — has had it natively since Node 18); no
  runtime behavior changes, verified via the full clean build + full test suite re-run.
- **No real Highlightly credentials exist in this environment** (no account has been created — the
  same "wired but inactive" state as `S3_BUCKET`/`EMAIL_PROVIDER_API_KEY` before their own real
  accounts existed). **Stated plainly, matching every prior vendor integration in this project's own
  disclosed-limitation bar (Postmark, S3): no live round-trip against the real Highlightly API was
  performed. This is unverified in practice.** Every Raw* type and every endpoint's wrapper-envelope
  shape (`{data, pagination}` for matches/highlights, `{groups}` for standings, bare arrays for
  statistics/events/head-to-head, a bare `{homeTeam, awayTeam}` object for lineups) is grounded in
  Highlightly's own public documentation page's literal example JSON, fetched live during this task
  — not guessed from memory, and not assumed from a vendor SDK. The one genuinely ambiguous case
  (`GET /matches/{id}`'s own example response being wrapped in a top-level array despite being a
  single-resource lookup) is handled defensively (accepts either shape) rather than picked one way
  and hoped for the best. The moment a real account exists, the first live call should be traced
  and this README updated with what was actually confirmed vs. assumed.

## Capability signals for vendor-only fields (sprint-4/sports-capability-signals-ui)

Decision Log #313 (player RATING) and #336 items 1 and 3 (top scorers; xG, Pressure index, shot maps, expected lineups) are now wired to explicit availability signals rather than silently omitted.

- Every such response field carries a `FieldAvailability`: `available`, `no_data`, or `not_available_from_provider`. It is derived by `fieldAvailability()` in `sports-data-provider.constants.ts`, which is built on `providerSupports()`, so there is still only one capability check.
- `GET /sports/matches/:id/stats` returns `availability` for `pressureIndex` and `shotMaps` only. Player ratings and xG moved to the box score (below), since their values come from there. `GET /sports/matches/:id/lineups` returns `expectedLineups`. `GET /sports/top-scorers?league=&season=` (new) returns `availability` plus an always-empty `items`. The top-scorers route makes no vendor call and no database read.
- Nothing is ingested for `pressureIndex` and `shotMaps` yet, so each availability is computed with `hasData = false`. Under Highlightly both are `not_available_from_provider`.

## Per-player box score and the call budget (sprint-4/box-score-rating-xg)

`GET /sports/matches/:id/box-score` serves per-player `rating` (from the vendor's `matchRating`) and `expectedGoals` / `expectedAssists` (from the vendor's flat `statistics` object), plus a team xG total. Each team's xG is the sum of its players' values, or `null` when no player carries one. That sum is our inference, not a published vendor figure.

Call-frequency reasoning, against the free-tier budget of 100 requests/day (Decision Log #323):

- **On demand only.** The Match Centre fetches the box score when the Statistics tab opens (lazy, the same `useLazyTab` as every other sub-tab). No list endpoint (`/sports/fixtures`, `/sports/live-scores`) ever reads it, so browsing a full day of fixtures costs zero box-score calls.
- **Refresh cadence.** Live matches refresh at most every 5 minutes (`SPORTS_BOX_SCORE_LIVE_CACHE_TTL_SECONDS`, default 300), matching Highlightly's own documented 5-minute refresh for this endpoint. Finished matches use the 24-hour TTL. Scheduled matches use the 6-hour TTL.
- **Worst case per match.** A live match lasts about 110 minutes, so one continuously-viewed match costs at most about 22 box-score calls. A finished match costs one call per 24 hours. A single Statistics view of a finished match costs one call.
- **Not solved here.** `GET /sports/matches/:id/stats` (team-level) still refreshes every 60 seconds while a match is live, so it can cost about 110 calls per live match if someone keeps the tab open. That was already true before this change. Raising `SPORTS_LIVE_CACHE_TTL_SECONDS` is the lever, and it needs a founder decision on the budget before we touch it.

The box score is served from the `MatchData.boxScore` JSON column (migration `20261003155426_add_match_box_score`), with its own `boxScoreUpdatedAt` freshness timestamp. A failed refresh serves the last stored box score, the same degrade-to-cache rule as every other sub-resource. Under SportMonks, the fields it supports report `no_data`, and `shotMaps` and `expectedLineups` stay unavailable because their status is `unconfirmed`.
- Switching `SPORTS_DATA_PROVIDER` changes only the registry result. `HighlightlyClient` remains the only `SportsDataClient`, so no SportMonks data is fetched.
- The frontend renders any non-`available` state as a disabled placeholder (`apps/web/src/pages/sports-hub/FieldAvailabilityGate.tsx`), with wording that distinguishes "not available from current data provider" from "no data for this match yet".
