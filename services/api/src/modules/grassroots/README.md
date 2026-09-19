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

The original `sprint-5/grassroots-records-service` PR had **zero
`schema.prisma` diff**. The follow-up `sprint-5/grassroots-opponent-name`
(backend-api, 2026-09-08) adds exactly one nullable column,
`Fixture.opponentName` (migration
`20260908143301_add_fixture_opponent_name` — a single additive
`ALTER TABLE "Fixture" ADD COLUMN "opponentName" TEXT;`) — see
["Free-text opponent name"](#free-text-opponent-name-decision-log-256)
below. The permission model is still enforced entirely by joining through
`teamA`/`teamB.createdById`; the status machine still uses the existing
`Fixture.status` string (`scheduled | live | full_time`).

`User` / `Guardian` safeguarding fields are untouched — only `Fixture`
changes (confirmed by schema diff).

### Team-organiser flag (`backend/team-organiser-flag`)

A second follow-up, `backend/team-organiser-flag` (backend-api), adds one
more genuine schema addition — **`User.isTeamOrganiser Boolean
@default(false)`** (migration `20260916190058_add_user_is_team_organiser`),
flagged the same way `Fixture.opponentName` was: beyond Section 3's literal
`User` field list, so a real Decision Log candidate, not a silent change.

**Deliberately separate from `User.role`** (`fan | player | admin`, still
unenforced anywhere in this codebase — checked via grep before this PR, no
route reads it as an authorization check). `isTeamOrganiser` does not touch
or repurpose `role`; it is a single-purpose flag for one thing only: "has
this user ever registered a Grassroots team."

**Set exactly once — inside the same `$transaction` as a successful `POST
/teams`** (`GrassrootsService.createTeam`, which is now wrapped in an
interactive transaction: `tx.grassrootsTeam.create` then
`tx.user.update({ where: { id: userId }, data: { isTeamOrganiser: true } })`).
Never settable any other way, never unset — registering a second team is a
no-op on an already-`true` flag (proven in `test/grassroots.e2e-spec.ts`),
and there is no team-deletion endpoint anyway.

**Read on `GET /users/:id`** (`UsersService.OWN_PROFILE_SELECT`/`OwnProfile`)
— no new endpoint, `apps/web` reads it off the same profile call it already
makes. This is a **UI-visibility convenience, never a trust boundary**:
every Grassroots write endpoint still enforces its own real
per-team/per-fixture organiser check server-side (Decision Log #255)
regardless of what this flag says — `apps/web`'s
`pages/grassroots/organiser.ts` (`fetchIsTeamOrganiser`) says so explicitly
in its own comment.

**Frontend gating** (`apps/web`, same branch): browsing (team list, fixture
list, results) stays visible to every logged-in user regardless of the
flag. Create/manage actions are gated on it:

- `GrassrootsTeamPage.tsx` — the "Schedule a fixture" toolbar/empty-state
  CTA and per-fixture "Manage" links now require `isOrganiser &&
  isTeamOrganiser` (`canManage`), not just the pre-existing per-team
  `team.createdById === myId` check. The two signals are almost always in
  lockstep (the flag flips in the same transaction that creates the
  team), so this is mostly defense-in-depth here.
- `GrassrootsScheduleFixturePage.tsx` — the same AND added to its
  `not-organiser` gate. Same defense-in-depth note as above.
- `GrassrootsFixturePage.tsx` — the **meaningful** new gating. This page's
  own header comment has always disclosed that `GET /fixtures/:id` returns
  no `createdById`, so it could not client-side guard *who* the fixture's
  manager is at all — it rendered the manage UI (Start match / Log the
  result / End match & save result) for any signed-in user and relied
  entirely on the server's 403. It now also checks the caller's own
  `isTeamOrganiser` (a real, narrower signal than "signed in") and shows a
  plain read-only note instead of live buttons when false. The per-fixture
  gap is still real and still server-enforced either way — this narrows
  who sees action buttons at all, it doesn't close the gap completely (a
  real organiser of some *other* team than either side of this fixture
  still gets the server's own 403 on submit).

**Verification, all re-measured directly, not estimated**: `services/api`
mocked suite 83 suites / 1097 → 1099 tests, 0 failures (2 new —
`grassroots.service.spec.ts`'s "flips User.isTeamOrganiser..." test,
`users.service.spec.ts`'s "includes isTeamOrganiser..." test). e2e suite
(real Postgres/Redis via `docker compose up -d`, `npm run test:e2e`) —
`test/grassroots.e2e-spec.ts` alone re-run standalone at 21/21 tests, 0
failures, including two new cases: a real create-team-then-read round trip
proving the flag flips true in Postgres and is visible on `GET /users/:id`
with the *same* access token (no re-login), and a second-registration
case proving it stays `true`, never toggled back. The **full** e2e suite
was then re-run as a whole-repo regression check: **19 suites / 183 → 185
tests, 0 failures** (the same 2 new tests; no other suite changed). `nest
build` + `npm run lint` + `npx tsc --noEmit` all clean, both workspaces.
`apps/web`: `npx tsc --noEmit` / `npm run lint` / `npm run build` all
clean; vitest 44 suites / 340 → 345 tests, 0 failures (5 new: 3 in
`GrassrootsFixturePage.test.tsx`, 1 in `GrassrootsTeamPage.test.tsx`, 1 in
`GrassrootsScheduleFixturePage.test.tsx`) — plus `UserProfile`'s now
-required `isTeamOrganiser` field fixed in five unrelated fixture objects
(`Header.test.tsx`, `BanterPage.test.tsx`, `PrivacySettingsPage.test.tsx`,
`EditProfileModal.test.tsx`, `ProfilePage.test.tsx`) that constructed the
type directly.

Manual trace, per this PR's own brief — stated plainly, not overclaimed
(no real browser/Playwright is available in this environment, the same
disclosed ceiling every prior `apps/web` PR in this project states):
proven end to end via two layers, not a live click-through. Backend:
`test/grassroots.e2e-spec.ts`'s new case above drives the real sequence
— `GET /users/:id` (isTeamOrganiser: false) → `POST /teams` → the SAME
access token's `GET /users/:id` (isTeamOrganiser: true) — against real
Postgres via NestJS's own HTTP pipeline (supertest against the real,
unmocked app, the same rigor a live dev server would give). Frontend:
`GrassrootsTeamPage.test.tsx`'s two organiser-affordance tests are the
same trace at the component level — a fresh mount with
`isTeamOrganiser: false` (the "does NOT show..." test) shows no manage
UI even for the team's own `createdById`, and a fresh mount with
`isTeamOrganiser: true` (the "shows the organiser..." test) shows it —
proving the manage UI is driven by a fresh `GET /users/:id` fetch on
every mount, not a stale/cached value, so navigating from the
register-team confirmation to the real team page picks up the flag with
no re-login or token refresh needed.

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
| `POST /fixtures` | `JwtAuthGuard` + `GuardianConsentGuard` | Schedule a fixture. **Authz: caller must be `createdById` of `teamA`.** Away side = `teamBId` XOR `opponentName` (or neither — "Opponent TBC"). Decision Log #256. |
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

## Free-text opponent name (Decision Log #256)

`sprint-5/grassroots-opponent-name` (backend-api, 2026-09-08) resolves the
**backend half** of Decision Log #256 (the Figma design half was already
done by `sprint-5/grassroots-record-keeping-screens`). An opponent that is
not a registered Soccernity team now persists as a typed name — e.g.
"Riverside FC" — not just the `teamBId = null` "Opponent TBC" placeholder.

**`Fixture.opponentName String?`** — nullable, no default. Migration
`20260908143301_add_fixture_opponent_name`, a single additive
`ALTER TABLE "Fixture" ADD COLUMN "opponentName" TEXT;`.

The away side of a fixture is **exactly one of three states** —
`teamBId` XOR `opponentName`, or neither:

| Input to `POST /fixtures` | Result |
|---|---|
| `teamBId` set, no `opponentName` | valid — registered opponent; `opponentName` stored as `null` |
| `opponentName` set, no `teamBId` | valid — free-text opponent; the **trimmed** string is stored |
| both `teamBId` and a non-empty `opponentName` | **400** — `"Provide either a registered opponent team or an opponent name, not both."` |
| neither | valid — fully-TBD fixture (unchanged from before) |

Enforcement details:

- `CreateFixtureDto.opponentName` is `@IsOptional() @IsString()
  @MaxLength(120)`. There is **no `@Transform` trim** — this module's DTOs
  use no transform convention (`create-team.dto.ts` is plain
  class-validator too). Trimming + the empty/whitespace-only → absent
  normalisation happens in `GrassrootsService.createFixture`.
- An `opponentName` that is empty or **whitespace-only after trimming** is
  treated as absent: persisted as `null`, never `""`. (A whitespace-only
  `opponentName` supplied alongside `teamBId` is therefore *not* "both
  set" — the fixture is created.)
- The cross-field 400 fires in `createFixture` right after the existing
  `teamBId === teamAId` check, before the create (and before the teamA-
  creator 403 — consistent with how the `teamBId === teamAId` 400 already
  orders relative to authz).
- `opponentName: true` is on the shared `FIXTURE_SELECT`, so it flows
  through **every** fixture-returning path (`POST /fixtures`,
  `GET /fixtures/:id`, `GET /teams/:id/fixtures`,
  `PATCH /fixtures/:id/status`, `POST /fixtures/:id/result`). It is
  **deliberately not** on `FIXTURE_AUTHZ_SELECT` (not permission-relevant).

**The API returns the raw field (`string | null`) only — it does NOT
render an "Opponent TBC" fallback string.** That display fallback (when
both `teamB` and `opponentName` are absent) is a **frontend concern**;
`figma-to-code` owns it.

### Parked: renaming the opponent of an existing fixture

There is **no general `PATCH /fixtures/:id`**, so naming the opponent of an
*already-created* fully-TBD fixture has no endpoint. Scope here is
`POST /fixtures` only — a rename endpoint was deliberately not added.
Flagged as a follow-up candidate for the founder (alongside the parked
result-correction/dispute question above).

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

## Status update — dormant-team reclaim + dormant-team delete (`sprint-5/grassroots-team-dormant-reclaim`)

Consumes the nullable `GrassrootsTeam.createdById` introduced by the
account-anonymisation redesign (Decision Log #341): an anonymised organiser
leaves their team **dormant** (`createdById: null`), read-only via the existing
403 checks. No schema change, no account-deletion code touched.

- **`POST /teams` now matches before creating.** Identity key: trimmed,
  case-insensitive `name` + `city` (no stored/normalised column — Decision Log
  #342). Any **live** match (organiser set, including the caller's own) → `409`.
  A **dormant** match is reassigned to the caller instead of duplicated; the
  existing row's name/city/`leagueType`/`verified`/fixtures/results are kept
  (the request's `leagueType` is ignored on this path) and `User.isTeamOrganiser`
  is set as on any registration. The response gains `reclaimed: boolean` and,
  on a takeover, a `message` — status stays `201` — so the client can tell the
  user they took over an existing team rather than created a fresh one (the web
  register page does not surface this yet; a `figma-to-code` follow-up).
- **Concurrency.** A transaction-scoped `pg_advisory_xact_lock` on the
  (name, city) key serialises racing registrations, and the reassignment is an
  `updateMany` guarded on `createdById: null`; the loser of a race gets `409`,
  never a duplicate row. Proven against real Postgres.
- **`DELETE /teams/:id` (new, `204`).** The smallest deletion capability: only
  a **dormant** team **with no fixtures** (as teamA or teamB) may be deleted;
  anything else is `409` (a live team is never end-user-deletable, under any
  framing), missing → `404`. **Admin-only (Decision Log #343, resolved):**
  `AdminJwtAuthGuard` + `AdminRolesGuard('moderator', 'superadmin')` — a dormant
  team has no organiser who could authorise its own deletion, so no regular
  caller may (a User token is a 401, an `editor` admin a 403). A registrant who
  does not want to inherit a dormant team no longer clears it themselves;
  `POST /teams` reclaims it. A dormant team *with* fixtures can only be taken
  over.
- **Tests.** Mocked: `grassroots.service.spec.ts` + `grassroots.controller.http.spec.ts`
  extended. e2e (`test/grassroots.e2e-spec.ts`): the full trace — organiser
  anonymised by the real `AccountDeletionSweepService` → new user registers the
  same name/city → reassigned not duplicated → new organiser creates
  fixtures/status/results, old organiser gets 403 — plus live-duplicate 409,
  both race cases, and every DELETE branch.
