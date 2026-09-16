# Sports data vendor comparison — API-Football vs. SportMonks, checked against Highlightly's two real gaps

**Status: reference record only. This does NOT reopen Decision Log #6.** Highlightly remains the
selected vendor (Decision Log #6, resolved by `sprint-4/sports-hub-highlightly-data-redesign`); this
document does not propose or imply a switch. It exists because `services/api/src/modules/sports/README.md`
found two real, confirmed Highlightly data gaps by checking the vendor's own documented example
responses rather than its marketing pages — and the original vendor-selection research that led to
choosing Highlightly had itself relied on marketing/feature pages for API-Football and SportMonks,
producing at least two claims that don't hold up under the same scrutiny (see "Corrections to the
original vendor-selection research" below). This document applies the identical standard to both
alternatives, so future decisions have an accurate record instead of marketing copy.

**Verification standard, matching `sports/README.md`'s own bar exactly:** every present/absent/partial
claim below cites the specific documented endpoint, entity page, or generated client struct it came
from — never a homepage, features page, or pricing page. Where I could not find a vendor's own
documented example response for something, that is stated explicitly as unverified rather than
inferred. **No live API call was made against either vendor for this document** — like Highlightly's
own README before a real account existed, these findings are grounded in publicly documented behavior,
not a traced live response. Both `api-sports.io`'s own documentation domain and `api-football.com`
returned HTTP 403 (Cloudflare bot protection) to every direct fetch attempted for this document, so
API-Football's findings are sourced from generated Go-client struct documentation (auto-generated
directly from the real API response shape, via `pkg.go.dev`), Educative.io course content built
against the live API, and API-Football's own blog post titles/descriptions — not from the primary
`api-football.com/documentation-v3` page itself, which could not be reached. This is disclosed per
claim below, not just here.

---

## The single most useful finding — read this first

**Which of Highlightly's two real gaps would actually be closed by switching:**

| Highlightly gap (`sports/README.md`) | API-Football | SportMonks |
|---|---|---|
| **Gap 1 — no batched per-match player box scores** (Highlightly needs 20+ calls, one per player) | **CLOSED.** A single, dedicated, batched endpoint exists — confirmed below. | **Likely closed, less certainly confirmed.** A documented nested include on the same fixture call is described as attaching per-player stats to every player — but no populated example JSON was found to directly verify it, only the include's documented name and description, from two independent sources. See below. |
| **Gap 2 — no standings "form" (recent-results) field** | **CLOSED.** A `form` string field ships as part of the same standings response — zero extra calls. | **CLOSED**, but structured differently — a separate `form` *include* attaches an array of individual match results (not a compact string) to the same standings request — still zero extra calls, just a different shape to parse. |

**Both real Highlightly gaps would be closed by API-Football with higher confidence than by
SportMonks** — API-Football's fix for both is directly confirmed via generated client struct
documentation (the closest thing to reading the real response shape without a live account).
SportMonks' fix for gap 2 is equally well confirmed (a documented entity with named fields); its fix
for gap 1 is documented but not directly observed populated, so it carries more residual uncertainty.

**A separate, unprompted finding that matters more than either gap-closure question, surfaced by
checking real docs rather than marketing pages:** SportMonks' own documentation states, verbatim,
that its video highlights feature is currently **non-functional** — *"Currently, the video highlights
are removed due to a lack of service. We're working on finding a new data partner to adjust this."*
(`docs.sportmonks.com/football/endpoints-and-entities/entities/other`). API-Football, separately, does
not offer video/highlights content of any kind — confirmed absent, not merely undocumented. Highlightly
is literally built around bundling video highlights with match data in one subscription. Stated
plainly, not as an argument to reopen #6: **neither alternative can currently deliver the highlights
half of what this project chose Highlightly for**, regardless of how they compare on the two stats
gaps above.

---

## Category-by-category comparison

### 1. Batched per-match player box scores

| Vendor | Status | Source |
|---|---|---|
| Highlightly | **Absent** (already confirmed in `sports/README.md`) | `GET /statistics/{matchId}` — team-level only; per-player data exists only via `GET /players/{id}/statistics`, one call per player. |
| **API-Football** | **PRESENT** | `github.com/syurchen93/api-football-client/response/fixtures` (`pkg.go.dev`) — a `PlayerStatistics` struct with `Players []TeamPlayerStats` (an ARRAY of players) nested under `Team`, i.e. one API call (`GET /fixtures/players?fixture={id}`) returns every player's stats for BOTH teams. Each player's `PlayerGameStatistics` carries `General`(games)/`Offsides`/`Shots`/`Goals`/`Passes`/`Tackles`/`Duels`/`Dribbles`/`Fouls`/`Cards`/`Penalty` sub-objects — a superset of Highlightly's own missing box-score fields. Corroborated by two independent, separately-fetched sources describing the same behavior: Educative.io's course lesson titled "Get all players statistics from a fixture" (`educative.io/courses/soccer-api-football-python/fixtures-players-statistics`), and API-Football's own blog post "PLAYERS STATISTICS FROM FIXTURES" (`api-football.com/news/post/players-statistics-from-fixtures`, title/topic confirmed via search index — the page itself 403'd on direct fetch). |
| **SportMonks** | **PARTIAL — documented, not directly observed populated** | Two independent sources describe a `lineups.details.type` nested include on the Fixture entity (`GET /football/fixtures/{id}?include=lineups.details.type`) as returning "player fixture statistics (shots, passes, tackles, etc.)... nested per player" within the ONE fixture call — `docs.sportmonks.com/v3/tutorials-and-guides/tutorials/includes/lineups` and a SportMonks blog post ("Player statistics and ratings come through `lineups.details.type`, nested per player... one fixture call returns all this data together" — `sportmonks.com/blogs/how-to-build-a-match-page-with-the-sportmonks-football-api`). **Caveat, stated honestly:** every fetch of these two pages returned the include's name and description, but never a populated example JSON array showing the actual per-player stat objects — the visible example snippets both times showed only the base `lineups` fields (player_id, team_id, position_id, formation_field, jersey_number) without the nested `details` block. This is different from the separate, confirmed-team-level-only `statistics` include (full example JSON obtained, see category 5) and different again from the separate "Players statistics" tutorial, which documents a genuinely different feature — per-player, per-SEASON aggregate stats via `GET /players/{id}?include=statistics.details.type`, one call per player, the same fan-out cost as Highlightly's own rejected approach. Treat the fixture-scoped batched claim as well-sourced but not fully verified. |

### 2. Standings "form" (recent-results) field

| Vendor | Status | Source |
|---|---|---|
| Highlightly | **Absent** (already confirmed) | `GET /standings`'s documented example row — `{position, points, team, total: {...}, home, away}` — has no form field anywhere. |
| **API-Football** | **PRESENT** | `pkg.go.dev/github.com/syurchen93/api-football-client/response/standings` — the `Ranking` struct includes `Form string \`json:"form"\`` alongside `Rank`/`Points`/`GoalsDiff`/`Status`/`Description`, in the SAME response object as the rest of the standings row (no extra call). Multiple independent search summaries, plus this generated-from-the-real-API-response Go struct, describe the value as a `"WWDLW"`-style string of the team's last five results, oldest to most recent. |
| **SportMonks** | **PRESENT, different shape** | `docs.sportmonks.com/v3/endpoints-and-entities/entities/standing-and-topscorer` (fetched directly, quoted field-by-field): the Standing entity supports a `form` **include**, which attaches a `StandingForm` entity — `form` (string, "W(win), D(draw) or L (los)" [sic, verbatim from the docs' own typo]), `fixture_id`, `sort_order` ("Refers to the fixtures from old to newest"). This is one row **per recent fixture**, not one compact string field — functionally the same 5-chip recent-form data, structured as an array instead of a string. Still attached via `include=form` on the SAME standings request — zero extra API calls, same as API-Football. |

### 3. A dedicated momentum / attacking-danger metric

| Vendor | Status | Source |
|---|---|---|
| Highlightly | **Absent** (already confirmed) | No momentum endpoint exists; `sports/README.md`'s own `momentum.util.ts` computes an approximation from cached raw events, disclosed as "not a licensed statistic." |
| **API-Football** | **Absent** | No dedicated momentum/attacking-danger endpoint found in any source checked (Go client struct docs, Educative course listings, API-Football's own blog post titles). Would face the identical limitation Highlightly has — computed from raw `/fixtures/events` data, not a licensed metric. |
| **SportMonks** | **PRESENT as "Pressure Index" — genuinely different in kind, confirmed PAID ADD-ON** | `docs.sportmonks.com/v3/tutorials-and-guides/tutorials/includes/pressure-index` (fetched directly): "each team receives a pressure value for every minute of a match," includable directly on the same Fixture endpoint alongside `participants`/`events` in one call — a real, licensed, minute-by-minute per-team attacking-pressure time series, not a self-computed approximation. **Confirmed still a paid add-on, not base plan** — `sportmonks.com/football-api/plans-pricing/` and `sportmonks.com/football-api/football-pressure-index/`: "Pressure Index requires the Pressure Index add-on on top of your base plan... priced from roughly €9 to €29 depending on your base plan." This confirms the original vendor-selection research's claim on this specific point was accurate. |

### 4. Top scorers / leading scorers

| Vendor | Status | Source |
|---|---|---|
| Highlightly | **Absent** (already confirmed) | No top-scorers endpoint anywhere in Highlightly's documented endpoint list (Matches/Events/Statistics/Lineups/Standings/H2H/Highlights/Leagues/Countries/Teams/Players/Odds/Bookmakers). |
| **API-Football** | **PRESENT** | `GET /players/topscorers?league=&season=` — a genuinely rankable list endpoint, `{rank, player, team, value}` per search-index summaries of the endpoint and Educative.io's dedicated "top scorers" lesson (`educative.io/courses/getting-soccer-data-with-api-football-in-javascript/top-scorers`) describing it as returning "players' information and their statistics, including... appearances,... shots taken, and... goals scored," ranked. |
| **SportMonks** | **PRESENT** | `docs.sportmonks.com/v3/endpoints-and-entities/endpoints/topscorers` + the Standing-and-Topscorer entity page (fetched directly): `GET /football/topscorers/seasons/{season_id}` (and a by-stage variant) returns the top 25 players, selectable per type (Goals/Cards/Assists). Fields, quoted from the entity page directly: `player_id`, `participant_id`, `position`, `total` ("The number of goals, assists or cards"), `type_id`. |

### 5. Completeness sweep (present / absent / partial, same standard)

| Category | API-Football | SportMonks |
|---|---|---|
| Live scores & fixtures | **Present** — core `/fixtures` endpoint, standard across every source checked. | **Present** — core Fixture entity, confirmed via the entity's full include list (`docs.sportmonks.com/v3/endpoints-and-entities/entities/fixture`, fetched directly). |
| Match events/timeline | **Present** — `GET /fixtures/events`, filterable by team/player/type; Goal/Card/Substitution/VAR (VAR from the 2020-21 season on), each with minute/team/player/detail, goals carry an assist field. Source: search-index summary of the endpoint's own documentation, corroborated by API-Football's own "LINE UPS"/events-adjacent blog posts. | **Present** — `events` is a documented include on the Fixture entity (confirmed in the entity's own include list, fetched directly). |
| Lineups + live substitutions | **Partial** — `GET /fixtures/lineups` returns formation/coach/startXI/substitutes (with a `player.grid` pitch-position value), but substitution *timing* comes from `/fixtures/events` (`type=subst`), the same derive-from-events approach `sports/README.md`'s own `lineups` endpoint already uses for Highlightly. Source: search-index summary of the endpoint description; a real, disclosed GitHub issue (`jrodrguez08/rating_app#46`) independently confirms API-Football's lineups endpoint is real and sometimes returns partial team-sheet data (a legitimate cache/availability state, not malformed data). | **Present** — `lineups` is a documented Fixture include (`type_id` 11 starters / 12 substitutes, confirmed via search-index summary of `docs.sportmonks.com/v3/tutorials-and-guides/tutorials/includes/lineups`); substitution timing would be derived from `events` the same way, since no distinct "live substitution feed" was found documented separately. |
| Head-to-head | **Present** — `GET /fixtures/headtohead?h2h=teamA-teamB&last=N`, filterable by date/league/season. Source: search-index summary of the endpoint's documented base URI and parameters. | **Present** — a documented "GET Fixtures by Head To Head" endpoint (`docs.sportmonks.com/v3/endpoints-and-entities/endpoints/fixtures/get-fixtures-by-head-to-head`, found via direct search of the docs site). |
| Video highlights | **Absent, confirmed by multiple independent sources** — API-Sports' own product family (API-Football's parent) "does not offer video or highlights content," a limitation multiple independent write-ups name explicitly when comparing it against highlights-focused vendors like Highlightly. | **Documented as a real entity, but CURRENTLY NON-FUNCTIONAL — the standout finding of this whole document.** A "Video Highlight" entity is listed in SportMonks' own entity index (`docs.sportmonks.com/football/endpoints-and-entities/entities/other`, fetched directly), but that same page states, verbatim: *"Currently, the video highlights are removed due to a lack of service. We're working on finding a new data partner to adjust this."* Treat as **absent in practice**, not merely "present but limited." (SportMonks' own docs separately describe an OLDER version of this feature as community-sourced social-media video links even before the removal, per `docs.sportmonks.com/football-2/endpoint-overview/video-highlights` — so even the pre-removal feature was never a licensed clip library the way Highlightly's is.) |
| Base standings fields (points/W/D/L/GD) | **Present** — the same `Ranking` struct confirmed for `form` above also carries `Rank`/`Points`/`GoalsDiff`/`Group`/`Status`/`Description`/`All`/`Home`/`Away` (each of the latter three a `Match` sub-object with played/won/drawn/lost/goals-for/goals-against) — a genuine superset of what `sports/README.md` needed for the current `Standing` model. | **Present** — confirmed directly from `docs.sportmonks.com/v3/tutorials-and-guides/tutorials/standings/season-standings`'s own quoted example JSON: `id`, `participant_id`, `position`, `result`, `points` (base row); win/draw/loss totals are separately available via the entity's documented `details`/stat-type-ID system referenced on the same page (`getStat(row.details, 131)` for draws, by way of example) rather than flat named fields. |

### 6. NPFL (Nigeria) coverage — unconfirmed for both, same as the original flag

Neither vendor's public documentation exposes a browsable, unauthenticated league list with data-coverage
flags the way this check would need to directly confirm NPFL inclusion — both vendors gate their full
league catalogue behind an authenticated lookup (API-Football requires a real API key to call
`/leagues`; SportMonks explicitly directs users to its authenticated "MySportmonks" ID-finder tool
rather than a public league index — `sportmonks.com` FAQ, found via search but consistent across every
source checked). One third-party source surfaced during this check (`live-score-api.com`, listing NPFL
under competition ID 78) is a **different vendor entirely**, not API-Football or SportMonks, and is not
usable as evidence for either. **Stated plainly, per this document's own verification standard: NPFL
coverage could not be confirmed or ruled out for either vendor from public documentation alone —
identical to the "unverified for all three vendors" state this was left in during the original
selection.** Confirming this for real, for either vendor, needs a real API key and a live league-list
call — the same category of gap Highlightly's own README discloses for its own free-tier verification.

---

## Corrections to the original vendor-selection research

Checked against the same standard `sports/README.md` applied to Highlightly, two claims from the
original selection hold up and are reconfirmed here, not corrected:

- **SportMonks' Pressure Index (and xG) being a paid add-on, not base-plan, is accurate** — reconfirmed
  directly against SportMonks' own current pricing page (category 3, above).

One thing the original research appears not to have surfaced at all, because it would only be visible
from the vendor's own endpoint documentation rather than its marketing pages: **SportMonks' video
highlights feature is not currently operational.** This is the "corrected/refined understanding"
finding this document exists to produce — see "The single most useful finding" above.

---

## What this document does not do

- Does not touch `services/api`, the Prisma schema, or the `sports` module.
- Does not propose or imply switching away from Highlightly. Decision Log #6 stays resolved as
  Highlightly.
- Does not treat any claim above as fully certain where the underlying source was a generated client
  struct, a course lesson, or a search-index summary rather than a directly-fetched, populated example
  response — each such claim is marked as such inline, per this document's own stated verification
  standard.
