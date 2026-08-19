# clubs module

Build target: Sprint 2 (`sprint-2/club-pages`) — Section 4.4 of the MVP
Build Plan, **club subset only**.

## Status

Section 4.4 (Club & Banter Service) lists these endpoints:

```
GET    /clubs                — this PR
GET    /clubs/:id            — this PR
POST   /clubs/:id/join       — this PR
GET    /banter-rooms         — not built, Sprint 3
POST   /banter-rooms/:id/... — not built, Sprint 3
```

This PR builds **only** the three club endpoints. `/banter-rooms*` is
explicitly out of scope — deferred to Sprint 3 per `CLAUDE.md`, not
touched anywhere in this branch.

---

## A pre-existing schema bug, found and fixed by this PR

Before writing any endpoint code, this PR's brief called for directly
verifying (not assuming) what Prisma's implicit many-to-many `connect`
does on a duplicate pair. That investigation surfaced something more
serious than the idempotency question it was looking for: **as
`schema.prisma` was written before this PR, `ClubPage.members` and
`User.clubAffiliation` were not two separate relations — they were the
exact same relation.**

Neither `ClubPage.members User[]` nor `User.clubAffiliation ClubPage?`
had an explicit `@relation(...)` name. Prisma resolves relation fields
between two models by matching up unnamed fields of the right shape —
and because `members` was the only `User[]`-typed field on `ClubPage`,
and `clubAffiliation` was the only `ClubPage?`-typed field on `User`,
Prisma silently paired them into one one-to-many relation, using
`User.clubAffiliationId` as its only backing column. There was no
separate `_ClubPageToUser`-style join table anywhere in the migration
history to back a genuine many-to-many.

This was verified directly against a live Prisma client and Postgres
instance, not inferred from reading the schema:

```js
// Before the fix in this PR:
await prisma.clubPage.update({
  where: { id: club.id },
  data: { members: { connect: { id: user.id } } },
});
const refetched = await prisma.user.findUnique({ where: { id: user.id } });
// refetched.clubAffiliationId === club.id  <-- writing to `members`
// silently set clubAffiliationId. Confirmed live.
```

Had `POST /clubs/:id/join` been built directly against the
pre-existing schema, "joining a club fan page" would have silently
overwritten a user's declared `clubAffiliationId` — exactly the field
this PR's own brief says must never be touched. That would have been a
much harder bug to catch after the fact than before.

**The fix** (`schema.prisma`, migration
`20260819204443_fix_club_membership_relation`): both relations now
have explicit, distinct names —
`@relation("ClubAffiliation", fields: [clubAffiliationId], ...)` on
`User.clubAffiliation`, and `@relation("ClubMembership")` on
`ClubPage.members`. Because Prisma requires both sides of every
relation to be declared, this also required adding two new relation
array fields that don't correspond to any literal field in Build Plan
Section 3, but are Prisma-mechanical necessities, not new business
data:

- `User.clubMemberships ClubPage[] @relation("ClubMembership")` — the
  reverse side of `ClubPage.members`, i.e. the many-to-many this module
  actually uses.
- `ClubPage.affiliatedPlayers User[] @relation("ClubAffiliation")` —
  the reverse side of `User.clubAffiliation`. Not exposed by any
  endpoint in this PR (Section 4.4 has no "list users declaring this as
  their club" route); it exists purely so the relation resolves.

This migration creates a genuine `_ClubMembership` join table for the
first time (confirmed in the generated migration SQL: `"A"` =
`ClubPage.id`, `"B"` = `User.id`, with a unique index on `("A", "B")`).
Re-running the same probe against the fixed schema confirms
`members.connect` no longer touches `clubAffiliationId` at all, and
that `User.clubAffiliationId` stays exactly what it was before this PR
— unread and unwritten by every line of code in this module.

**Flagged as a Decision Log candidate**: this is a real, if
mechanically necessary, addition to `User`/`ClubPage` beyond Section
3's literal field list (`CLAUDE.md`'s "the data model is a fixed
spec"). Unlike `Follow.createdAt` or `Like`/`SavedPost`'s own precedent
(genuine new business data needed for pagination), `clubMemberships`
and `affiliatedPlayers` carry no new information on their own — they're
the unavoidable mechanical cost of Prisma correctly modeling two
distinct relations that already existed in Section 3's intent
(`clubAffiliationId` and `ClubPage`'s member list) but were accidentally
merged by omission. Whoever reviews the Decision Log should confirm
this reasoning, not just the fact that a migration exists.

---

## Two real ambiguities, resolved explicitly

### 1. Auto-join on signup is not built here

Build Plan Section 6's Sprint 2 line reads "Build club fan pages with
auto-join on signup." This PR does **not** wire that. `RegisterDto`
(`auth/registration/dto/register.dto.ts`) has no club-selection field,
and `RegistrationService` (`auth/registration/registration.service.ts`)
has no code path that would know which club a new user should be
auto-joined to — both were read, not modified, to confirm this. Wiring
auto-join now would mean one of two things, neither appropriate for
this PR:

- Guessing a UX for club selection during signup with no Figma screen
  or Build Plan Section 4.1/8.3 signal to build against, or
- Auto-joining every new user to some default/placeholder club, which
  isn't what "auto-join" plausibly means and would need undoing later.

Sprint 1's registration flow is already shipped and independently
verified; speculatively modifying it here, for a feature with no defined
trigger, risks regressing a settled flow for no real benefit. **This
gap is real and unbuilt as of this PR** — `POST /clubs/:id/join` exists
as a standalone, user-initiated action only. Whoever eventually adds
club selection to signup (a genuine product decision: single-select?
multi-select? optional or required? at what step of the six-screen
guardian-consent-aware flow?) should wire it to call the same
`ClubsService.joinClub` this PR built, not reinvent the join logic.
Flagged as a Decision Log candidate.

### 2. `POST /clubs/:id/join` uses `ClubPage.members`, not `clubAffiliationId`

Two different club-relationship concepts exist on `User`:
`clubAffiliationId` (a single nullable FK — "this is my club," a
narrower, player-identity-adjacent concept closer to grassroots-player
identity than fan-page membership) and `ClubPage.members` (now a
genuine many-to-many, post-fix above).

This PR uses `members` exclusively. Reasoning: "club fan pages" with
"members" and a `memberCount` counter is inherently a many-to-many
concept — a fan can plausibly follow/join multiple clubs' pages, the
same way a user can follow multiple other users (`Follow`) or save
multiple posts (`SavedPost`). `clubAffiliationId` reads as a narrower,
different concept that nothing in Section 4.4's contract references at
all — no endpoint in Section 4.4 reads or writes it.

**`clubAffiliationId` is never touched anywhere in this PR** — not read,
not written, not exposed on any response. `ClubsService`,
`ClubsController`, and `clubs.module.ts` have no code path that
references it. The only schema-level change touching it is the
`@relation("ClubAffiliation", ...)` name added in the bug-fix above,
which changes nothing about its meaning, only disambiguates its
relation from `members` at the Prisma layer.

---

## Guard reasoning, argued fresh per route (not inherited)

Per this PR's own brief: every guard choice below is argued
independently for this specific resource, not carried over from
`GET /posts/feed`'s or `GET /users/:id/followers`'s own conclusions,
even where the reasoning ends up similar.

### `GET /clubs`, `GET /clubs/:id` — `JwtAuthGuard` only

Browsing the club catalog isn't a safety-sensitive action under Section
5.7's list ("posting, messaging, joining a Banter Room or Community
Group") — that list is entirely action-verbs, and reading never
qualifies. Nothing in Section 8.3 step 5's restricted-pending
enumeration (no public profile visibility, no DMs from unverified
accounts, no Banter Room participation beyond read-only) mentions club
browsing either. `JwtAuthGuard` alone is required only because every
route in this codebase so far requires *some* authentication — there is
no public/logged-out route anywhere yet, and Section 4.4 gives no
signal that `GET /clubs` should be the first exception to that pattern.
This is a real judgment call, not a rule stated anywhere in the Build
Plan; flagged here for visibility, not flagged as a Decision Log
candidate — there's no real tension to resolve given the "every route
needs auth so far" precedent, unlike the questions below.

### `POST /clubs/:id/join` — `JwtAuthGuard` only, deliberately NOT `GuardianConsentGuard`

Argued fresh, not inherited from `POST /posts`'s guarded conclusion
(`feed/README.md` point 1) or `POST /users/:id/follow`'s unguarded one
(`users/README.md` point 1). Section 5.7's safety-sensitive-action list
names "joining a Banter Room or Community Group" explicitly — a
`ClubPage` fan-page join is neither of those two named things:

- It isn't a Banter Room. `BanterRoom` is a materially different model
  in `schema.prisma`, with its own `memberCount` and (eventually, Sprint
  3) its own membership/moderation concept. Section 8.3 step 5's own
  restricted-pending list separately names "no participation in Banter
  Rooms beyond read-only" — a rule specific to that model, not clubs.
- "Community Group" isn't a term this codebase's schema uses for
  anything. Reading it as covering `ClubPage` would be extending Section
  5.7's own language, not applying it.

A club join also produces no visible content of its own — only a
`memberCount` changing, the same category `feed/README.md` already put
liking and saving in (not "posting"), and `users/README.md` point 1
already put following in for the identical reason. Not flagged as a
Decision Log candidate for that reason — this reads unambiguous enough
that there's no real tension to resolve, the same category as those
three precedents, not the genuinely contested "is this posting?"
questions (`feed/README.md` points 1/4).

---

## Pagination — why alphabetical, not most-recent-first

Every other list endpoint in this codebase (`GET /posts/feed`,
`GET /posts/:id/comments`, `GET /users/:id/saved-posts`,
`GET /users/:id/followers`/`following`) orders by some timestamp
(`createdAt`, `savedAt`) because each underlying model has one.
`ClubPage` doesn't — Section 3's `ClubPage` fields are `id`, `name`,
`league`, `country`, `logoUrl`, `memberCount`, none of them a
timestamp, and this PR does not add one speculatively (unlike
`Follow.createdAt`, which `users/README.md` added because pagination
genuinely needed *some* chronological signal and none existed — here,
`name` already provides a natural, meaningful ordering that a
timestamp wouldn't improve on for a browsable catalog).

`GET /clubs` is a browsable catalog, not an activity feed — alphabetical
by `name` is the natural "let me find a club" ordering a user would
expect, the same way a phone contacts list or a dropdown of leagues
sorts alphabetically by default. `id` (a random UUID) is the keyset
tiebreaker for two clubs sharing an identical `name` — nothing makes
`ClubPage.name` unique in Section 3 or the schema, so a tiebreaker is
required for keyset correctness, same role `id` plays as a tiebreaker
everywhere else in this codebase.

`clubs/cursor.util.ts` is a small, deliberate adaptation of
`feed/cursor.util.ts` — same opaque-base64-JSON-envelope contract, same
encode/decode function shapes, but keyed on `{ name, id }` instead of
`{ createdAt, id }` (a `Date` doesn't fit this cursor's key type, so the
envelope itself couldn't be reused verbatim the way `getSavedPosts`
reused the feed cursor's `createdAt` field to carry `savedAt` — see
`feed/README.md`'s note on that reuse). This is the same
"small, deliberate duplicate over a forced cross-module fit" precedent
`FOLLOW_USER_SELECT` set in `users/README.md`, not a third pagination
scheme invented from scratch.

`?league=` and `?country=` optional filters are included — both already
exist on `ClubPage`, and adding them as plain `WHERE`-clause equality
conditions ANDed alongside the cursor filter doesn't complicate the
cursor's own correctness (they don't participate in ordering or
tiebreaking, only in which rows are eligible at all). Default page size
20, max 50 — the same deliberate numbers `feed/dto/feed-query.dto.ts`
chose, reused here for consistency across the codebase's list endpoints
rather than re-derived from scratch (Section 5.5 doesn't specify
numbers either way).

`GET /clubs` and `GET /clubs/:id` never select `members` (or the new
`affiliatedPlayers`) — same low-bandwidth discipline Section 5.5 already
applied to feed/comment lists in `feed.service.ts`'s `POST_SELECT`
comment. A club with thousands of members returned inline on every page
would be exactly the unbounded payload that discipline exists to
prevent. Section 4.4 has no `GET /clubs/:id/members` endpoint either, so
there's no member-listing route this omission defers to — member data
simply isn't exposed by this module at all yet.

---

## Verified Prisma behavior backing `joinClub`'s idempotency

This PR's brief required directly testing, not assuming, what Prisma's
implicit many-to-many `connect` does on a duplicate pair — see the
schema-bug section above for the first (more serious) thing that
investigation found. Once the relation was fixed to be a genuine
many-to-many, the same live probe was re-run against the corrected
schema:

```
Before connect. user.clubAffiliationId = null
After connect via ClubPage.members (fixed relation): user.clubAffiliationId = null (should be null)
Join-table rows after 1st connect: 1
Second connect: succeeded without throwing
Join-table rows after 2nd (duplicate) connect: 1 (should still be 1, not 2)
```

**Confirmed: Prisma's implicit-m2m `connect` does NOT throw on a
duplicate pair, and does not create a duplicate join-table row either.**
This is a real, meaningful difference from `Like`/`SavedPost`/`Follow`'s
own idempotency, all three of which rely on catching a genuine Postgres
`P2002` unique-constraint violation raised by an explicit model's
`create()` call. There is no equivalent exception to catch here — the
join table itself is implicit (no exposed Prisma model to call
`.create()`/`.findUnique()` on), and its underlying `connect` operation
is already silently idempotent at the row level.

That silence is exactly the problem for `memberCount`: a naive
"always increment on every successful `connect` call" would double-count
a repeat join, since `connect` itself gives no signal about whether it
inserted a new row or not.

**The guard `ClubsService.joinClub` actually uses**: a raw,
parameterized `INSERT INTO "_ClubMembership" ("A", "B") VALUES (...)
ON CONFLICT DO NOTHING` issued directly via `tx.$executeRaw` inside the
same interactive transaction as the conditional `memberCount` increment.
`$executeRaw` returns the number of affected rows — exactly 1 on a
genuine new insert, 0 on a duplicate — giving an atomic,
database-engine-enforced signal (backed by `_ClubMembership`'s own
unique index on `("A", "B")`) for whether this call actually created a
new membership. `memberCount` is only incremented when that count is
greater than 0.

An application-level `findFirst`-then-conditionally-`update` inside the
same transaction was considered and rejected: under Postgres's default
READ COMMITTED isolation, two concurrent `joinClub` calls for the same
`(userId, clubId)` could both observe "not yet a member" before either
commits, double-incrementing `memberCount` even though the join row
itself would stay singular (protected by the join table's own unique
index, independent of any transaction). The raw `INSERT ... ON CONFLICT
DO NOTHING` closes that exact race window by relying on the database
engine's own constraint enforcement, the same category of guarantee
`Like.@@unique([userId, postId])` gives `likePost` — just expressed
differently because there's no exposed model to raise `P2002` against
here.

This does rely on the exact generated join-table name (`_ClubMembership`)
and column order (`"A"` = `ClubPage.id`, `"B"` = `User.id`, alphabetized
by model name) — both confirmed directly against this PR's own migration
SQL (`20260819204443_fix_club_membership_relation/migration.sql`), not
guessed. If a future schema change ever renames the relation or either
model, this raw SQL would need updating alongside it — documented here
and in `clubs.service.ts`'s own comment so it isn't a silent trap.

---

## The join-only, no-leave gap

Section 4.4 lists no `DELETE /clubs/:id/join` (or `/leave`) endpoint —
unlike `follow`/`like`/`save`, which are all `POST`+`DELETE` pairs in
their respective sections, club membership is `POST`-only in the Build
Plan as written. This PR builds exactly that: `POST /clubs/:id/join`
and nothing else. A symmetric `DELETE` "to be consistent with every
other toggle action in this codebase" was deliberately **not** added —
that would be scope Section 4.4 didn't ask for, and inventing an unjoin
endpoint speculatively risks guessing at a URL/response shape a future
real spec update might choose differently.

**This is a real, literal gap, flagged as a Decision Log candidate**: a
user can join a club fan page today and has no way to leave one. Given
every other membership-style relationship in this codebase (`Follow`,
`Like`, `SavedPost`) supports the reverse action, this reads like an
oversight in Section 4.4 rather than an intentional one-way design — but
it's not this PR's place to assume that and build the fix anyway.
Whoever resolves this Decision Log item should also decide whether
`memberCount`'s decrement-on-leave should reuse `unlikePost`'s
`updateMany`-with-a-floor-guard pattern (the established precedent in
this codebase for "never let a denormalized counter go negative").

---

## What's implemented

- **`GET /clubs`** — `@UseGuards(JwtAuthGuard)` only. Cursor-based
  (keyset) pagination, `{ cursor, limit, league, country }` query params,
  `{ items: ClubSummary[], nextCursor: string | null }` response.
  Ordered `name asc, id asc`. Each item:
  `{ id, name, league, country, logoUrl, memberCount }` — no `members`.
- **`GET /clubs/:id`** — `@UseGuards(JwtAuthGuard)` only. Same field
  shape as a list entry. 404 (`NotFoundException`) for a non-existent
  `:id`, never a silent null 200.
- **`POST /clubs/:id/join`** — `@UseGuards(JwtAuthGuard)` only.
  `HttpCode(200)` (idempotent toggle, same reasoning as
  `POST /posts/:id/like`/`/save` and `POST /users/:id/follow` — doesn't
  always "create a resource" on a given call). Response:
  `{ clubId, joined: true, memberCount }`. Idempotent (verified,
  see above): joining twice never double-increments `memberCount`,
  never errors. 404 for a non-existent `:id`, checked before any write.
  No `Notification` created — joining a club isn't on Sprint 2's
  notification-trigger list (follow/comment/like only, per `CLAUDE.md`).

---

## Verification

Real HTTP verification against live Postgres/Redis via docker-compose,
not mocked — a real `dist/main.js` server, a real `User` row and five+
`ClubPage` rows inserted directly via Prisma (no `POST /clubs` endpoint
exists in Section 4.4 to create them through the API — same "seed
directly via Prisma" pattern this codebase already uses for every other
model with no create-endpoint), tokens minted with the `jsonwebtoken`
library against the real `JWT_SECRET`, matching `TokenService`'s exact
`{ sub, role }` payload shape. Confirmed live, end to end:

- `GET /clubs` with no bearer token → 401.
- Pagination at a real boundary: five seeded clubs (`Alpha FC` …
  `Zeta FC`, alphabetically), `limit=2` — page 1 returns exactly
  `[Alpha FC, Beta FC]` with a non-null `nextCursor`; page 2 (using that
  cursor) returns exactly `[Gamma FC, Mu FC]`; page 3 returns exactly
  `[Zeta FC]` with `nextCursor: null`. `?league=`/`?country=` filters
  correctly exclude a sixth seeded club in a different league/country.
- `GET /clubs/:id` returns the exact club; field set confirmed to be
  precisely `{country, id, league, logoUrl, memberCount, name}` — no
  `members` leak, nothing else. Non-existent `:id` → 404.
- `POST /clubs/:id/join` baseline `memberCount` confirmed 0 in Postgres
  before joining; 1st join → `200 { joined: true, memberCount: 1 }`;
  2nd and 3rd (duplicate) joins → still `200`, still `memberCount: 1`,
  read back directly from Postgres after each call, not inferred from
  HTTP responses alone. Exactly 1 row in `_ClubMembership` after three
  join calls (raw `SELECT COUNT(*)` against the join table). `User.
  clubAffiliationId` confirmed still `null` after joining — the exact
  regression the schema-bug fix above exists to prevent, checked live,
  not just asserted in a comment.
- `POST /clubs/:id/join` on a non-existent club → 404.
- `DELETE /clubs/:id/join` → 404 (no route exists — the join-only, no-
  leave gap documented above, confirmed live rather than just claimed).

Also covered by committed Jest suites:

- `clubs.service.spec.ts` — `listClubs` (ordering, lean-select
  discipline, cursor-filter shape combined with league/country filters,
  malformed-cursor rejection), `getClubById` (404), `joinClub`
  (404-before-any-write, the genuine-insert-increments case, the
  duplicate-insert-does-not-increment case, and a sequential
  double-join integration-style test asserting `memberCount` ends up
  exactly 1 higher than baseline, never 2 — using a stateful mock that
  tracks `memberCount` across calls the same way the real transaction
  would).
- `clubs.controller.http.spec.ts` — HTTP-layer coverage for all three
  routes: query-param pass-through, pagination validation (`limit`
  bounds), 404 propagation, route-ordering (`GET /clubs/:id` vs
  `POST /clubs/:id/join` — confirmed `getClubById` is never called when
  the request is actually a join), idempotent double-join at the HTTP
  layer, and confirmation that `DELETE /clubs/:id/join` 404s (no route
  registered).

Full `services/api` suite after this PR: **32 suites / 327 tests, 0
failures** (up from 30/304 measured immediately before this branch's
changes — see `CLAUDE.md`'s Sprint 2 status bullet for that baseline).
