# Highlightly vs SportMonks — field-by-field data comparison

**Built by `sprint-4/sports-vendor-capability-registry` (2026-09-26).** Extends, does not redo, the
Highlightly research already in `README.md`, and complements `docs/sports-data-vendor-comparison.md`
(API-Football vs SportMonks vs Highlightly, from the vendor-selection pass). **This does not reopen
Decision Log #6 — Highlightly stays the chosen vendor.** Its purpose is to record exactly which fields each
vendor's *public documentation* supports, so the capability registry
(`sports-data-provider.constants.ts`) rests on cited facts instead of recollection.

## How to read this, and how much to trust it

- **Method, stated plainly:** every claim below was read from the vendor's public documentation through a
  page-fetching tool that returns a *summary* of each page, not the raw HTML, and cross-checked with a web
  search where a claim mattered. That method has a visible failure mode, and it showed up: three fetches
  of Highlightly's Match Box Score section produced three different request paths (see Finding 1). Treat
  anything marked **unconfirmed** as needing a live call before anyone builds on it.
- **Nothing here was verified against a live API.** No Highlightly or SportMonks account exists for this
  project (same disclosed state as `README.md`'s "Verification" section).
- **Status legend**, matching the registry's `CapabilityStatus`:
  **✅ supported** — the docs describe the field/endpoint · **❌ unsupported** — the docs describe the
  product's endpoint list and the field is absent (or explicitly "not available") ·
  **❓ unconfirmed** — the docs don't document it, rule it out, or contradict themselves.
  The service treats anything but ✅ as "do not emit".
- **Tier/price facts** (checked 2026-09-26) will drift; re-check before any purchasing decision.

## Findings that change what the repo already says

1. **`README.md` data gap #1 is wrong and is corrected in this PR.** It states Highlightly has *no* batched
   per-match player box scores and that only `GET /players/{id}/statistics` (one player at a time) exists.
   Highlightly's documentation has a dedicated **"Football.Match Box Score"** section:
   *"Retrieve detailed per-player box score match statistics data by specifying the `matchId`"*, refreshed
   every 5 minutes, returning `[{ team, players: [{ id, name, number, position, statistics: [{ name, value }] }] }]`.
   One call per match returns every player. **The exact request path is unresolved** — the three fetches
   rendered `/box-score/{matchId}`, `/players/{matchId}` and `/players/{id}/box-scores`, and a web search
   result gave `/football/match-box-score/{matchId}`. Only the last is even self-consistent with the
   section name; none was traced live. The one example response shows only *Goals* and *Assists*, so which
   statistics a real response carries (and whether any is a rating) is **unconfirmed**. Consequence: the
   Figma redesign's player-box-score assumption (`sprint-4/sports-hub-highlightly-data-redesign`) may be
   buildable from Highlightly after all. That is a founder/`backend-api` call, not made here.
2. **The Highlightly paid-tier budget (Decision Log #323, "unknown") is now publicly documented** — see
   the pricing table. #323's real question shifts from "what is the budget" to "which plan do we buy".
3. **Highlightly's own documentation contradicts itself on Odds/geo-restriction tiers.** The endpoint
   reference says both are *"not available in the Basic/Free plan"*; the pricing page lists a
   "geo restriction checker for highlights" among features included in *all four* plans. Unresolved.
4. **SportMonks' own pages disagree on add-on pricing.** The pricing page lists *xG & Pressure Index* as a
   single €29/month add-on; the pressure-index tutorial says the add-on is "€9–€29 depending on your base
   plan"; the xG endpoint page describes "Basic" (post-match) and "Advanced" (real-time) xG packages that
   the pricing page doesn't separate. The registry records only *that* they are paid add-ons.

## Plans (as documented 2026-09-26)

| | Highlightly | SportMonks |
|---|---|---|
| Entry | **Basic** — $0, 100 requests/day | **Starter** — €29/mo, 5 leagues of your choice, 2,000 calls/entity/hour |
| | **Pro** — $9.49/mo, 7,500 req/day, 12 req/s | **Growth** — €99/mo, 30 leagues, 2,500 calls/entity/hour |
| | **Ultra** — $20.99/mo, 25,000 req/day, 20 req/s | **Pro** — €249/mo, 120 leagues, 3,000 calls/entity/hour |
| Top | **Mega** — $45.99/mo, 65,000 req/day, 100 req/s | **Enterprise** — custom, 2,300+ leagues, 5,000 calls/entity/hour |
| What differs by tier | Request volume/rate. Per the pricing page, features are identical across all four (but see Finding 3). | League count and rate limit. "All base plans include… live scores, fixtures, lineups, events, statistics, player statistics." |
| Paid add-ons | none listed | Odds & Predictions €24 · xG & Pressure Index €29 · Extra API calls €29 · News API €99 · Transfer Rumours €99 · Premium Odds Feed €129 · Extra leagues €4 · Historical data €29 one-off |

Sources: <https://highlightly.net/football-api/> · <https://www.sportmonks.com/football-api/plans-pricing/>

## The matrix

"Tier" is the plan/add-on the docs attach to the field, or "—" where none is documented.

| Field | Highlightly | SportMonks | Notes and sources |
|---|---|---|---|
| **Live scores** | ✅ all tiers | ✅ base plans | H: `GET /matches` + `state`, "refresh: once per minute". S: Livescores group (Inplay / All / Latest Updated). |
| **Fixtures** | ✅ all tiers | ✅ base plans | H: `GET /matches` (filter by leagueId/date/teamIds). S: Fixtures group (by date, date range, team, multiple IDs, H2H, …). |
| **Standings (table)** | ✅ all tiers | ✅ base plans | H: `GET /standings` (`leagueId` + `season` required). S: Standings group, incl. *Live Standings by League ID* and *Standing Correction*. |
| **Standings FORM** | ❌ | ✅ | H: documented row = position, games, wins/draws/loses, scored/received goals, points — no form field. S: standings `include=form` returns per-team W/D/L history tied to `fixture_id`, `sort_order` oldest→newest. **This is the field hidden today.** Tier: — (no restriction wording found). |
| **Match events** | ✅ all tiers | ✅ base plans | H: `GET /events/{id}` — goals, own goals, penalties, missed penalties, cards, substitutions, VAR; refreshed once a minute. S: fixture `events` include. |
| **Lineups** | ✅ all tiers | ✅ base plans | H: `GET /lineups/{matchId}` — formation, initial lineup, substitutes; available ~40 min before to ~120 min after kickoff; 15-min refresh. S: fixture `lineups` include; "Premium Expected Lineups" is a separate paid product. |
| **Match statistics (team level)** | ✅ all tiers | ✅ base plans | H: `GET /statistics/{matchId}` — per-team `[{displayName, value}]`, 5-min refresh. S: fixture `statistics` include. |
| **Player box scores (per-player, per-match)** | ✅ documented, **path unconfirmed** | ✅ documented, **not observed populated** | H: "Match Box Score" section — see Finding 1. S: per-player stats come from the fixture `lineups.details` nested include (not the flat `statistics` include), one fixture request for all players. Neither vendor's real payload has been seen. |
| **Player / match ratings** | ❓ | ✅ | H: no rating documented anywhere; box-score example shows Goals/Assists only, full stat list unreadable. S: "`rating` is a documented player statistic type", `type_id` 118, in fixture player statistics. Tier: — |
| **Momentum series** | ❌ | ✅ (as Pressure Index) | H: none. S: the Pressure Index is SportMonks' momentum-equivalent (attack, possession and shots weighted). Soccernity's own `GET /sports/matches/:id/momentum` is **derived from events** (`momentum.util.ts`) and is independent of both vendors. |
| **Pressure Index** | ❌ | ✅ **add-on** | S: `pressure` include → `{ id, fixture_id, participant_id, minute, pressure }`, per minute per team. "Pressure Index data requires the Pressure Index add-on." |
| **xG (expected goals)** | ❌ | ✅ **add-on** | S: Expected group — `GET Expected by Team` / `by Player`: `{ fixture_id, participant_id, value, location }`. Docs: "Basic" gives all xG after the match, "Advanced" real-time; the xG Basic add-on "includes shot-level xG values (and an xG timeline)". H: not documented. |
| **Shot maps (x/y shot locations)** | ❌ | ❓ | S docs: "don't confirm shot-location (x/y) data for building a true shot map"; event objects "don't include pitch coordinates"; only a `ballCoordinates` include (ball position) and shot-level xG are documented. H: not documented. **No vendor is confirmed to supply a true shot map.** |
| **Top / leading scorers** | ❌ | ✅ | H: no such endpoint in the full endpoint list (README's finding, re-confirmed). S: Top Scorers group — by Season ID / by Stage ID; `type_id` selects goals/assists/cards, fields `position`, `total`, `player_id`, `participant_id`. Tier: — |
| **Head-to-head** | ✅ all tiers | ✅ base plans | H: `GET /head-2-head` — last 10 meetings. S: *Fixtures by Head To Head*. Also H: `GET /last-five-games`. |
| **Highlights (video)** | ✅ all tiers ("unlimited") | ❌ | H: `GET /highlights` — verified/unverified clips, embeds, 9 categories; "verified highlights are uploaded anywhere from 1 to 48 hours" after the match. S API FAQ: **"Match highlights: Not currently available."** This is the field Highlightly was chosen for. |
| **Leagues metadata** | ✅ | ✅ | H: `GET /leagues`. S: Leagues group. |
| **Countries metadata** | ✅ | ✅ | H: `GET /countries`. S: via the Core API (`/core/…`). |
| **Teams metadata** | ✅ | ✅ | H: `GET /teams` + team statistics. S: Teams group. |
| **Players metadata** | ✅ | ✅ | H: `GET /players`, `/players/{id}`, `/players/{id}/statistics` (also transfers, market value, injuries). S: Players + Team Squads groups. |
| **Odds** | ✅ tier **contradictory** | ✅ **add-on** | H: `GET /odds`, `GET /bookmakers`; endpoint page says not in Basic/Free, pricing page says features are identical across tiers (Finding 3). S: Standard/Premium odds feeds, markets, bookmakers; Odds & Predictions €24, Premium Odds Feed €129. |

**Other SportMonks products with no Highlightly counterpart** (not in the requested matrix, listed so the
comparison isn't accidentally one-sided): Predictions/Probabilities/Value Bets, Match Facts, Team
Rankings (beta), Team of the Week (beta), Commentaries, News, Transfers + Rumours, Rivals, Referees,
Coaches, Venues, TV Stations, Expected Lineups.

**Coverage of Nigerian football (NPFL) — unconfirmed for both.** SportMonks' docs do not mention NPFL and
point to "MySportmonks → Data Coverage" for checking; Highlightly's page doesn't list league coverage in
what was readable. Phase 1 launch markets include Nigeria, so this needs a real coverage check with each
vendor before any pivot.

## What this means for Soccernity today

The active provider is **Highlightly**. Six fields are hidden right now because Highlightly has no
documented data source for them — and, per the task's own rule, hidden means *omitted*, never sent as
`null`, `0` or any placeholder:

| Hidden field | Why | State in code |
|---|---|---|
| **Standings FORM** | Highlightly's standings row has no `form`. | The one field that exists in the API today and is gated: `PublicStandingRow.form` is only added when the active provider supports `standingsForm` **and** the row has data. On Highlightly it is absent from every response. |
| **Top scorers** | No endpoint at Highlightly. | No endpoint or field exists — nothing to gate. |
| **xG** | Not documented at Highlightly. | Same. |
| **Pressure Index** | Not documented at Highlightly. | Same. |
| **Shot maps** | Not documented at Highlightly, and not confirmed at SportMonks either. | Same. |
| **Player / match ratings** | No rating documented at Highlightly (**unconfirmed**, not documented-absent — the box-score stat list couldn't be read). | Same. |

Three things this deliberately is **not**:

- **Not a pivot recommendation.** SportMonks closes five of the six hidden fields on paper, but it has no
  video highlights ("Not currently available"), the xG/Pressure Index fields are paid add-ons, its plans
  are league-metered (5–120 leagues) rather than request-metered, and NPFL coverage is unchecked.
  Highlightly's differentiator is exactly the field SportMonks lacks.
- **Not player box scores being "hidden".** They are absent from the hidden list on purpose: per Finding 1
  Highlightly *does* document a per-match box-score endpoint. Nothing serves it yet (`GET
  /sports/matches/:id/stats` is team-level only), so the current behaviour is unchanged, but the reason
  for it in `README.md` was wrong.
- **Not new UI or endpoints.** No frontend renders any of the six fields, and no placeholder endpoints were
  added — the registry, this document, and the FORM gate are the deliverable.

## If the provider is ever flipped

`SPORTS_DATA_PROVIDER=sportmonks` changes only what `providerSupports()` reports. `SportsDataClient` still
has exactly one implementation (`HighlightlyClient`), so data is still fetched from Highlightly and the
service logs a warning at boot saying so. A real pivot also needs: a SportMonks `SportsDataClient`
adapter (auth, includes, pagination), normalisation of its `form` include into `RawStandingRow.form`, a
re-derivation of the cache TTLs and the request-budget guard for a call-rate-metered plan, and the
NPFL/coverage check above.

## Sources

Highlightly — <https://highlightly.net/football-api/documentation/> ·
<https://highlightly.net/documentation/football/> · <https://highlightly.net/football-api/> (pricing)

SportMonks — endpoint index <https://docs.sportmonks.com/v3/endpoints-and-entities/endpoints.md> ·
standings <https://docs.sportmonks.com/v3/endpoints-and-entities/endpoints/standings/get-standings-by-season-id.md> ·
top scorers <https://docs.sportmonks.com/v3/endpoints-and-entities/endpoints/topscorers/get-topscorers-by-season-id.md> ·
xG <https://docs.sportmonks.com/v3/endpoints-and-entities/endpoints/expected-xg/get-expected-by-team.md> ·
Pressure Index <https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/includes/pressure-index> ·
fixture-by-id <https://docs.sportmonks.com/v3/endpoints-and-entities/endpoints/fixtures/get-fixture-by-id.md> ·
lineups/ratings <https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/lineups-and-formations.md> ·
API FAQ <https://docs.sportmonks.com/v3/api-faq> · pricing <https://www.sportmonks.com/football-api/plans-pricing/>
