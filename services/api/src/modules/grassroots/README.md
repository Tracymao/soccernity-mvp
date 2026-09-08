# grassroots module

Build target: **Sprint 5** — Section 4.5 of the MVP Build Plan (Grassroots
Records Service). Built by `sprint-5/grassroots-records-service`
(backend-api, 2026-09-08), ahead of the rest of Sprint 5 by founder
decision — the same call the backend `admin` module (Decision Log #54) and
the Contest data model (Decision Log #218) got.

Backs the Figma design in
`docs/sprint-5-grassroots-record-keeping-screens-report.md` (Decision Log
#253). Resolves **Decision Log #254** (no status-transition endpoint) and
**Decision Log #255** (no permission model + Result race).

**Zero `schema.prisma` diff — no migration.** The `GrassrootsTeam` /
`Fixture` / `Result` models (Section 3) already carry every field this
module needs. The permission model is enforced entirely by joining through
`teamA`/`teamB.createdById`; the status machine uses the existing
`Fixture.status` string (`scheduled | live | full_time`). The only
`schema.prisma` change in this PR is tightened `//` comments documenting
the permission rule and the status machine on those three models.

`User` / `Guardian` safeguarding fields are untouched (confirmed by
schema diff).

---

## Endpoints

All 7 Section 4.5 endpoints plus one addition (`PATCH /fixtures/:id/status`,
Decision Log #254):

| Method & path | Guards | Purpose |
|---|---|---|
| `POST /teams` | `JwtAuthGuard` + `GuardianConsentGuard` | Register a team. `createdById` = caller. |
| `GET /teams?city=` | `JwtAuthGuard` | Browse teams, keyset-paginated alphabetically by name; optional exact-match `city` filter. |
| `GET /teams/:id` | `JwtAuthGuard` | One team. 404 if missing. **No organiser PII** (no nested `User`, no email — only `createdById`). |
| `GET /teams/:id/fixtures` | `JwtAuthGuard` | The team's fixtures (as teamA or teamB), keyset-paginated newest-scheduled-first, each with `status` + `result`. 404 if team missing. |
| `POST /fixtures` | `JwtAuthGuard` + `GuardianConsentGuard` | Schedule a fixture. **Authz: caller must be `createdById` of `teamA`.** `teamBId` optional (null = "Opponent TBC", Decision Log #256). |
| `GET /fixtures/:id` | `JwtAuthGuard` | One fixture with `status`, both teams (minimal shape), `result` if present. 404 if missing. |
| `POST /fixtures/:id/result` | `JwtAuthGuard` + `GuardianConsentGuard` | Log the final score. **Authz: caller must be `createdById` of `teamA` OR (`teamBId` set) `teamB`.** "First write is final" — see below. Moves the fixture to `full_time`. `HttpCode(200)`. |
| `PATCH /fixtures/:id/status` | `JwtAuthGuard` + `GuardianConsentGuard` | Change the fixture status (`scheduled -> live`, `live -> full_time`). **Authz: same as result.** Decision Log #254. |

The GET reads are `JwtAuthGuard`-only (not public) — even though the Figma
frame 9 is a "Public Team Page". Relaxing GET reads to logged-out access
is the same shape as the Leaderboard public-visibility question and ties to
Decision Log #258; flagged for the founder, not decided here.

---

## Permission matrix (Decision Log #255)

| Action | Who may do it |
|---|---|
| `POST /teams` | any authenticated (consent-confirmed) user; becomes the `createdById` |
| `POST /fixtures` | the `createdById` of **`teamA`** only (the team scheduling the fixture) |
| `POST /fixtures/:id/result` | the `createdById` of **either team** in the fixture |
| `PATCH /fixtures/:id/status` | the `createdById` of **either team** in the fixture |
| all GET reads | any authenticated user |

**404 vs 403 ordering** (mirrors `FeedService.deleteComment`): resource
existence is always settled with a 404 before any authorization check runs
a 403. For `POST /fixtures` that means both `teamAId` and (if supplied)
`teamBId` are asserted to exist first; for the result / status endpoints
the fixture's own 404 is checked before the 403. The fixture's *status* is
never leaked to a non-manager (403 fires before the 409 status check).

### Judgment calls (all founder-approved)

1. **`POST /fixtures` authz = teamA creator only.** "Either team's creator
   may create a fixture" was considered and not chosen — a fixture is
   created by the organiser scheduling it, from their own team's context.
2. **`POST /result` + `PATCH /status` authz = either team's creator** —
   once a fixture exists, either side may run it and record its result.
3. **`GuardianConsentGuard` on all four write endpoints** (`POST /teams`,
   `POST /fixtures`, `POST /result`, `PATCH /status`), per Decision Log
   #21's broad reading of Section 5.7 "posting" — organiser actions
   produce public-facing records. GET reads: `JwtAuthGuard` only.
4. **GET reads stay `JwtAuthGuard` (not public) for now** — flagged for the
   founder, ties to Decision Log #258.
5. **Result race resolution = "first write is final, no amend path in
   MVP".** Correction/dispute is a parked founder candidate (below).
6. **`GET /teams?city=` existing does NOT resolve Decision Log #258** — see
   below.

---

## Status machine (Decision Log #254)

`Fixture.status` (`scheduled | live | full_time`, Section 3) — a new
fixture is always `scheduled`. Legal forward moves:

```
scheduled --("Start match", PATCH /fixtures/:id/status {status:"live"})------> live
live      --("End match",   PATCH /fixtures/:id/status {status:"full_time"})--> full_time
scheduled|live --(POST /fixtures/:id/result)--------------------------------> full_time
```

Everything else is a **409** naming the current and requested status:
any backwards move, `full_time -> *`, a no-op same-status PATCH, or reaching
`full_time` via `PATCH` from `scheduled` (that path is result-only). The
DTO additionally rejects `PATCH {status:"scheduled"}` with a **400** (not a
patchable target).

`PATCH /fixtures/:id/status` is a **dedicated narrow sub-resource**, not a
general `PATCH /fixtures/:id` (avoids scope creep — nothing else about a
fixture is editable) and not a derived rule (`live` is a real organiser
action that can't be inferred from any timestamp).

There is **no `postponed` / `cancelled` status** — Section 3's enum has
only three values and this PR does not add a fourth speculatively. Flagged
open (see below).

---

## "First write is final" — the Result race (Decision Log #255)

`Result.fixtureId` is `@unique` — at most one `Result` per `Fixture`. The
Figma (frame 7) warns *before* the irreversible save rather than offering
an edit after, so this is enforced as a hard 409, **not** a 409-then-amend
flow.

`POST /fixtures/:id/result`:

1. **Pre-checks (outside the transaction):** 404 fixture -> 403 not a
   manager -> 409 if a `Result` already exists -> 409 if status is not
   `scheduled`/`live`. (The "result already exists" check is deliberately
   *before* the status check, so the "first write is final" case reports
   the informative "already been recorded" message rather than "wrong
   status" — a fixture with a result is always already `full_time`. The
   status check still fires for the *other* path to `full_time`: a
   `PATCH live -> full_time` with no score entered.)
2. **Inside one interactive `$transaction`:** re-read the fixture; if a
   `Result` row already exists -> 409; `tx.result.create({ enteredById:
   caller })`; `tx.fixture.update -> status: 'full_time'`; return the
   updated fixture view.
3. A genuine concurrent race (both requests pass the pre-check, both enter
   their transaction) has one winner and one **P2002** on
   `tx.result.create` — caught and re-thrown as the **same 409**, never a
   raw 500. Same belt-and-braces pattern as `FeedService.likePost`'s P2002
   handling.

Proven by `test/grassroots.e2e-spec.ts`: two concurrent `POST
/fixtures/:id/result` (`Promise.all`) against real Postgres return exactly
one 200 and one 409, and the single persisted `Result` matches whichever
request won, with `Fixture.status = 'full_time'`.

### Parked: result correction / dispute

There is **no amend or dispute path in MVP**. A wrong score, once
submitted, is final. Whether Soccernity wants an organiser-correction
window, a two-organiser-agreement flow, or an admin override is a real
founder/product decision — deliberately not invented here.

---

## `GET /teams?city=` does NOT close Decision Log #258

Decision Log #258 (raised by the Figma design pass) is: there is **no
teams-browse screen** and **no Grassroots entry point in the navbar or
mobile drawer**. This PR builds `GET /teams?city=` — a real query surface —
but there is still no designed UI that calls it and no way to reach a
teams list in the app. The public team page's "← Teams" link points
nowhere. Same shape of gap Decision Log #156 recorded for Clubs. Still
open — founder + `figma-screen-builder`.

---

## Still open / not built (flagged, not silently filled)

- **Decision Log #256** — no free-text opponent name on `Fixture`. An
  unregistered opponent is `teamBId: null` ("Opponent TBC"). This PR
  *designs-and-backs* that (`CreateFixtureDto.teamBId` is optional; the
  fixture view returns `teamBId: null` / `teamB: null`). Confirm-or-add a
  nullable `opponentName` is still a founder call.
- **Decision Log #257** — the reused calendar component has no mobile
  variant and carries an inherited time row. `figma-design-system`.
- **Decision Log #258** — no browse screen / no nav entry point (above).
- **No team badge/photo field** on `GrassrootsTeam` — the Figma uses an
  initial monogram (the `ClubFanPage` fallback). A real badge needs a
  schema addition + image storage.
- **No `postponed` / `cancelled` fixture status** — Section 3's enum has
  three values; not extended here.
- **`verified` is set by no endpoint** — an operations/trust decision, not
  self-service. `GrassrootsTeam.verified` stays at its `@default(false)`;
  the public page renders "Community team · Unverified".
- **`Result` is the final score only** — no half-time, goalscorers, cards
  or events (Section 3 has no such fields). Won/Drew/Lost is derived
  client-side from `scoreA`/`scoreB`, not stored.
- **`Fixture.teamAId`/`teamBId` and `Result.fixtureId` are still
  `RESTRICT`** against their parents (not `ON DELETE CASCADE` like the
  Decision Log #44 tables). Unchanged by this PR — the account-deletion
  hard-delete sweep is a separate concern; whoever revisits #44 cascade
  coverage should bring these under it then (a User who created a team
  with fixtures would otherwise hit the RESTRICT wall). Flagged in
  `schema.prisma`'s own comment on `GrassrootsTeam`.

---

## Files

```
grassroots.module.ts               — GrassrootsModule (imports AuthFoundationModule)
grassroots-teams.controller.ts     — POST /teams, GET /teams, GET /teams/:id, GET /teams/:id/fixtures
grassroots-fixtures.controller.ts  — POST /fixtures, GET /fixtures/:id, POST /fixtures/:id/result, PATCH /fixtures/:id/status
grassroots.service.ts              — all business logic + the permission model + the status machine + the result race
grassroots.constants.ts            — GRASSROOTS_LEAGUE_TYPES, FIXTURE_STATUSES, PATCHABLE_FIXTURE_STATUSES, page sizes
cursor.util.ts                     — two keyset cursors: { name, id } (teams) and { scheduledAt, id } (fixtures)
dto/                               — create-team, list-teams-query, create-fixture, log-result, update-fixture-status, list-fixtures-query
```

## Tests

- `grassroots.service.spec.ts` (mocked Prisma) — DTO-shaped inputs, the
  state-machine rejections, the 403 authz paths, the 404-vs-403 ordering,
  the two-tier "result already exists" 409s (fast path + inside the
  transaction), the P2002 -> 409 re-throw, cursor filter shapes,
  malformed-cursor 400.
- `grassroots.controller.http.spec.ts` (mocked service) — routing, guard
  wiring (both `JwtAuthGuard` and `GuardianConsentGuard` proven to run on
  the four writes), DTO validation (bad `leagueType`, non-UUID `teamAId`,
  non-ISO `scheduledAt`, negative/non-integer scores, `status: "scheduled"`
  rejected at the DTO layer), `forbidNonWhitelisted` stripping a
  body-supplied `createdById`, route ordering (`GET /teams` vs
  `GET /teams/:id` vs `GET /teams/:id/fixtures`), status-code propagation.
- `test/grassroots.e2e-spec.ts` (real Postgres, `npm run test:e2e`) — the
  permission checks against real rows; the full `scheduled -> PATCH live ->
  POST result -> full_time` machine verified against Postgres at each
  step; teamB-creator can drive the machine; a stranger gets 403 with
  nothing changed; illegal transitions 409 with the current+requested
  status named; the genuine concurrent race (`Promise.all` — exactly one
  200 + one 409, one consistent persisted `Result`); "first write is
  final" sequential (409, original score untouched); "Opponent TBC"
  `teamBId: null`; `GET /teams?city=` filter + keyset pagination;
  `GET /teams/:id/fixtures` teamA-or-teamB scope + newest-first keyset;
  no organiser PII on `GET /teams/:id`.
