# Sports API: league ranking and country ordering (report)

## 0. Handshake
- Branched from origin/main `f6908886664e5d034d7325cca84dbed1f6454c5b`; rebased onto origin/main `ca51a063` (PR #902) before commit, clean.
- Open-PR check (`gh pr list --state open`, 2026-11-25): none open, so nothing overlaps `services/api/src/modules/sports`, `schema.prisma` or the migrations folder.
- Founder decisions of 2026-11-25. Backend and docs only. Highlightly could not be reached from the shell, so real league ids, names and countries are UNVERIFIED (section 4).

## 1. What changed
- New table `SportsLeague` (migration `20261203090000_add_sports_league`, additive, rollback `DROP TABLE "SportsLeague";`): leagueId, name, countryName, countryCode, logo, fetchedAt.
- `league-priority.constants.ts`: the ranked list, `normalizeLeagueText`, `leagueRank`, `compareLeagues`.
- Public match shape: `league.rank` (1-based, null = unranked) and `league.country` (null = metadata not cached).
- `GET /sports/fixtures` gains optional `status` (scheduled|live|finished); `GET /sports/live-scores` gets the same league order. The league order is applied BEFORE pagination, with an opaque `{id, offset}` cursor (old id-only cursors still decode; a malformed one is 400).
- New `GET /sports/results/recent?limit=`: finished matches of the latest day that has any, looking back at most 7 days, database only, returns `{ date, items }`.
- New `GET /sports/leagues`: distinct cached leagues joined with metadata, ordered by `compareLeagues`, 5-minute in-process cache, `Cache-Control: public, max-age=300`, no guard.
- Metadata refresh: Highlightly `/leagues`, one Redis lock per UTC day, at most 10 pages of 100 per refresh, only when a league on screen has no metadata. Every failure is swallowed and logged as a warning: fixtures never fail because of metadata, the country is just null.
- Tests: `league-priority.constants.spec.ts` (8), `sports.league-ranking.spec.ts` (17); `sports.kickoff-alert.spec.ts` updated for the new live-first order. Verified: `tsc --noEmit`, eslint on `src/modules/sports` and `src/sports-data`, `prisma validate`, sports specs 12 suites / 163 tests, 0 failures. No e2e.

## 2. Order
International finals, big European competitions, Nigerian and African competitions, the rest of the ranked list, then unranked leagues by country A-Z, then league name A-Z, null country last. Within one league: live (kickoff asc), then scheduled and other (kickoff asc), then finished (kickoff desc), id as tiebreak.

## 3. Final ranked list (29)
1. FIFA World Cup (any country)
2. UEFA European Championship (any country)
3. Africa Cup of Nations (any country)
4. Copa America (any country)
5. Premier League (England)
6. UEFA Champions League (any country)
7. La Liga (any country)
8. Serie A (Italy)
9. Bundesliga (Germany)
10. Ligue 1 (France)
11. UEFA Europa League (any country)
12. UEFA Europa Conference League (any country)
13. Nigeria Premier Football League (any country)
14. CAF Champions League (any country)
15. CAF Confederation Cup (any country)
16. FA Cup (England)
17. EFL Cup (any country)
18. Championship (any country)
19. UEFA Nations League (any country)
20. Copa del Rey (Spain)
21. Coppa Italia (Italy)
22. DFB-Pokal (any country)
23. Coupe de France (France)
24. Eredivisie (Netherlands)
25. Primeira Liga (any country)
26. Saudi Pro League (any country)
27. MLS (any country)
28. Brasileirao Serie A (any country)
29. Liga Profesional (any country)

## 4. Adopted defaults (veto-able) and unverified entries
- "International finals first" is the founder's order; which tournaments count as finals is my choice (World Cup, Euros, AFCON, Copa America).
- Matching is conservative: names are lowercased, diacritics stripped, alphanumerics only, whole-name match. Country-bound entries match only when the cached country matches; with no metadata a country-bound league (for example Premier League) is NOT ranked. "Any country" entries (continental cups) match whatever the country.
- Within-league group order above; 2000-match read cap before the in-memory sort (far above one day's volume); 7-day look-back; 5-minute leagues cache; metadata page cap 10 (env `SPORTS_DATA_MAX_LEAGUE_META_PAGES`); null country when metadata is missing; new `status` filter.
- **UNVERIFIED: all 29 entries.** None was matched against a real Highlightly response. The names above are my best guess at how Highlightly spells them, and the countries at how it names them (England vs United Kingdom, USA vs United States). The `getLeagues` request path and response shape (`/leagues`, limit/offset, `country.name`, `country.code`, `logo`) are also unverified. A name or country that differs makes that league fall into the unranked tail, not an error.

## 5. Open points
- Founder: check the order on staging and send corrections to names and countries.
- The existing `sports.service.spec.ts` Prisma mock has no `sportsLeague`; it passes only because metadata errors are swallowed. Left unchanged.
- No Playwright or e2e run. Head-to-head meetings carry a rank but never a country.
