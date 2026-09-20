# community-groups module

Build target: **Sprint 3** — Build Plan Sprint 3 (Community Groups), Decision
Log #281 (design: `sprint-3/community-groups-design`, figma-screen-builder).
Built by `sprint-3/community-groups-backend` (backend-api, 2026-09-14).

Backs the Community Groups Figma frames (`docs/sprint-3-community-groups-design-report.md`)
— `apps/web` has no Community Groups screen yet; a later `figma-to-code`
pass wires it to these endpoints. This PR is backend only.

## Schema — two new models, shipped together, from the start

Neither `CommunityGroup` nor `CommunityGroupMember` had any Section 3
precedent to defer to at all — unlike `BanterRoom`, which Section 3
already scaffolded with a bare `createdBy String` and no join table
(forcing `sprint-3/banter-rooms-backend` to add `BanterRoomMember`
**retroactively**, in a follow-up PR, once "My Bants" needed it — see
`banter/README.md`'s own "Schema change" section for the full story of
that mistake). Community Groups has no such excuse: both models are
genuinely new (a flagged addition beyond Section 3's literal 20-entity
list), so this PR deliberately builds `CommunityGroupMember` in the
**same PR** as `CommunityGroup` itself, not deferred.

```prisma
model CommunityGroup {
  id             String  @id @default(uuid())
  name           String
  nameNormalized String  @unique
  city           String?
  positionPlayed String?
  careerTrack    String?
  createdById    String
  createdBy      User    @relation(fields: [createdById], references: [id], onDelete: Cascade)
  memberCount    Int     @default(1)
  createdAt      DateTime @default(now())
  members        CommunityGroupMember[]
}

model CommunityGroupMember {
  id               String         @id @default(uuid())
  userId           String
  user             User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  communityGroupId String
  communityGroup   CommunityGroup @relation(fields: [communityGroupId], references: [id], onDelete: Cascade)
  joinedAt         DateTime       @default(now())

  @@unique([userId, communityGroupId])
}
```

Migration: `20260914000000_add_community_group_and_member`. Applied
cleanly against both the local dev database and a fresh
`soccernity_test` database (see Verification below) — a pure additive
diff, two `CREATE TABLE`s, two unique indexes, three foreign keys, no
`ALTER`/`DROP` on any existing table.

**`User` / `Guardian` safeguarding fields are untouched** — confirmed
directly: the only change inside `model User { ... }` is two mechanical
reverse-relation array fields (`createdCommunityGroups`,
`communityGroupMemberships`), no business data of their own.

### Why an explicit join model, not an implicit Prisma m2m

Same reasoning `banter/README.md` already gives for
`BanterRoomMember` over `ClubPage.members`: the implicit-m2m route
(`ClubPage.members` / `_ClubMembership`) caused a real silent-relation-merge
bug (see `schema.prisma`'s comment on `ClubPage.members`) and forced
`ClubsService.joinClub` into raw `$executeRaw` for idempotency, because
this Prisma version does **not** throw on a duplicate implicit-m2m
`connect`. An explicit model — the exact shape of `BanterRoomMember` /
`Like` / `SavedPost` / `Follow` — gives `joinGroup` a plain **P2002-catch**
idempotency mechanism and a real `joinedAt` timestamp, the same "a list
endpoint needs a real column to order by" reasoning `Like.likedAt` /
`SavedPost.savedAt` / `Follow.createdAt` / `BanterRoomMember.joinedAt`
already carry.

### `nameNormalized` — the one deliberate anti-spam safeguard

`nameNormalized` (`name.trim().toLowerCase()`, `@unique`) is the **one**
deliberate, lightweight anti-spam safeguard this PR builds for Decision
Log #281's flagged item 1 ("who may create a group" — see Permission
model below). A duplicate name (case-insensitive, whitespace-insensitive)
is rejected at creation with a clear `409`, not a raw `P2002` surfaced to
the client — `CommunityGroupsService.createGroup` pre-derives
`nameNormalized` and catches the constraint violation, so the
`@@unique` index is the actual race-safe enforcement mechanism and the
try/catch is what turns a genuine concurrent double-create into a clean
`409` for the loser (proven in `test/community-groups.e2e-spec.ts`'s
concurrent-create test) rather than a raw 500.

**Deliberately NOT built beyond this one safeguard** — see Permission
model below.

### Cross-field validation — a real, new DTO-level custom validator

`CreateCommunityGroupDto` requires at least one of `city` /
`positionPlayed` / `careerTrack`. This codebase's established convention
for cross-field rules is **service-layer** enforcement (see
`GrassrootsService.createFixture`'s `teamBId`/`opponentName` XOR check —
that DTO's own comment is explicit: "a cross-field rule, not expressible
on a single-field decorator"). This task was specifically briefed to
enforce this one at the **DTO layer** instead, via a real
`class-validator` custom decorator — `IsAtLeastOneDimensionPresent`
(`dto/at-least-one-dimension.validator.ts`), a genuinely **new** pattern
for this codebase (confirmed by grep: zero `registerDecorator` /
`ValidatorConstraint` usage anywhere in `services/api/src` before this
PR). Flagged here as a deliberate divergence, not silently introduced as
if it were already this codebase's norm. `CommunityGroupsService.createGroup`
does **not** re-derive this condition before writing (the DTO validator
is the sole enforcement layer for HTTP callers; the `nameNormalized`
uniqueness check is the only service-layer defence-in-depth this PR
adds) — a genuinely new non-HTTP caller would need its own check, flagged
rather than silently assumed safe.

## Endpoints

No Section 3/Section 4 endpoint list exists for Community Groups — the
whole feature is a genuine addition (Decision Log #281), the same
category of addition `GrassrootsModule` and `BanterModule` already made
for their own features.

| Method & path | Guards | Notes |
|---|---|---|
| `POST /community-groups` | `JwtAuthGuard` + `GuardianConsentGuard` | Create. `{ name, city?, positionPlayed?, careerTrack? }` — at least one dimension required (`IsAtLeastOneDimensionPresent`). `createdById` = caller. **Creator is auto-joined** (`memberCount` starts at its schema `@default(1)`). Duplicate normalized name → `409`. Default `201`. |
| `GET /community-groups` | `JwtAuthGuard` | List, keyset **newest-first** (`createdAt desc, id desc` — see cursor.util.ts for why this diverges from `ClubPage`/`BanterRoom`'s own alphabetical ordering). Three optional, combinable, exact-match equality filters: `?city=&positionPlayed=&careerTrack=`. Per-caller `joined` boolean (batched — no N+1). |
| `GET /community-groups/:id` | `JwtAuthGuard` | One group + per-caller `joined`. `404` if missing. |
| `POST /community-groups/:id/join` | `JwtAuthGuard` + `GuardianConsentGuard` | Join. `200`, idempotent (P2002-catch), `memberCount` incremented transactionally. `{ groupId, joined: true, memberCount }`. |
| `DELETE /community-groups/:id/join` | `JwtAuthGuard` + `GuardianConsentGuard` | Leave. `200`, idempotent (leaving a group you're not in is not a `404`), `memberCount` decremented transactionally and floor-guarded `>= 0`. |
| `GET /community-groups/:id/members` | `JwtAuthGuard` | The roster. Mirrors `GET /clubs/:id/members` exactly — keyset pagination alphabetically by `displayName`, restricted-pending minors AND non-`active` accounts excluded. |

### Deliberately NOT built

- **Any group-post-composer or group-feed endpoint.** The design's own
  Design Notes frame (Decision Log #281) is explicit: a group page
  mirrors **Club — Fan Page's own no-composer state** (Decision Log
  #157) — Community Groups has no scoped feed-posting capability at all,
  even on the Joined state. Nothing in this module ever touches `Post`,
  and `CommunityGroupsModule` does not import `FeedModule` (unlike
  `BanterModule`, which delegates room-scoped posting/feed reads to
  `FeedService` — see `banter/README.md`'s "Delegation to FeedService"
  section).
- **Any moderation/report endpoint for group names.** Flagged item 2 on
  the Design Notes frame ("group-name moderation — a new surface beyond
  ordinary post moderation") is left open, not built.

## Permission model (this PR resolves Decision Log #281's flagged item 1)

| Action | Who may do it | Guard |
|---|---|---|
| `POST /community-groups` (create a group) | **any authenticated, consent-confirmed user** — becomes `createdById` | `JwtAuthGuard` + `GuardianConsentGuard` |
| `POST`/`DELETE /community-groups/:id/join` | any authenticated, consent-confirmed user | `JwtAuthGuard` + `GuardianConsentGuard` |
| all GET reads (list / `:id` / `:id/members`) | any authenticated user | `JwtAuthGuard` only |

### Item 1 resolved: "who may create a group"

**Default: any consent-confirmed authenticated user may create a
Community Group** — the same default `POST /teams` (Decision Log #255)
and `POST /banter-rooms` (Decision Log #275) already use. The **one**
deliberate anti-spam safeguard is `nameNormalized`'s uniqueness
constraint (above, `409` on a duplicate). Everything else the design's
Design Notes flagged is left **open**, not built — the same "flagged,
not built" precedent Decision Log #255/#275 already set for their own
analogous Grassroots/Banter Room questions:

- **No moderation queue** for group creation or group names.
- **No group-size limit.**
- **No creation rate-limit beyond whatever platform-wide throttling
  already exists** (none of these routes carry `@AuthRateLimit()`).
- **No role-gating** — there is no admin/moderator role in the
  user-facing guards to restrict creation to, matching Banter Room
  creation's own reasoning (Decision Log #275 item 1).

An unbounded supply of user-named public groups on a minors' platform is
a real spam/safeguarding surface, same as Decision Log #275 already
flagged for Banter Rooms — worth its own follow-up ticket if it becomes
a real problem, not solved here beyond the one uniqueness guard.

### Join/create guard reasoning: the literal referent of Section 5.7

Section 5.7's safety-sensitive-action list names **"joining a Banter
Room or Community Group"** literally (`clubs.controller.ts`'s own guard
comment already quotes this exact phrase, arguing a `ClubPage` fan-page
join is "neither a Banter Room nor a Community Group" under that literal
list). This model is the first schema this codebase has ever given to
the second half of that phrase — so, unlike Banter Room creation (which
needed the *interpretive* "posting"-class reading of Section 5.7,
Decision Log #21/#275), creating and joining a Community Group is
consent-gated **without any interpretive leap at all**. This is, if
anything, a *stronger* case for `GuardianConsentGuard` than Banter Room
creation's own reasoning.

### `DELETE /community-groups/:id/join` — the leave-guard judgment call

**This is a real judgment call, argued explicitly, not silently
inherited from either precedent available in this codebase.** Two
existing precedents point in different directions:

1. **`ClubsService.leaveClub` is `JwtAuthGuard`-only** — no consent gate
   on leaving a club fan page. But `clubs.controller.ts`'s own reasoning
   for that is explicit and narrow: a `ClubPage` join is "neither a
   Banter Room nor a Community Group" under Section 5.7's literal list —
   which is exactly the carve-out that does **not** apply to this model.
2. **`BanterService.leaveRoom` is `GuardianConsentGuard`-gated** — the
   same pair as `joinRoom`, reasoning: "Section 5.7 names 'joining a
   Banter Room'; leaving is the reverse of the same named action."

**Resolution: `DELETE /community-groups/:id/join` follows
`BanterService.leaveRoom`'s precedent, not `ClubsService.leaveClub`'s** —
`JwtAuthGuard` + `GuardianConsentGuard`, the same pair as
`POST /community-groups/:id/join`. Reasoning: Section 5.7 literally names
"Community Group" (unlike `ClubPage`, which the codebase's own existing
reasoning excludes from that phrase), so leaving — the reverse of the
literally-named "joining a ... Community Group" action — stays
consent-gated by the same short-confirmation logic `BanterService.leaveRoom`
already established, not the `ClubsService.leaveClub` precedent that
only applies because `ClubPage` is a different, excluded case.

**Practical consequence, flagged**: because both join and leave are
consent-gated, a restricted-pending minor can never actually reach
`CommunityGroupMember` membership through the real API at all — the
roster-visibility filter below (`VISIBLE_GROUP_MEMBER_FILTER`) is
therefore pure defence-in-depth for this model (unlike `ClubsService`'s
own roster filter, where a restricted-pending minor genuinely *can*
join a `ClubPage` since that join is `JwtAuthGuard`-only). Proven directly
in `test/community-groups.e2e-spec.ts` by seeding a `CommunityGroupMember`
row for a restricted-pending minor directly via Prisma (since the real
join path can't produce that state) and confirming the roster still
excludes them.

### 404 before 403

Everywhere a resource-existence check and an authorization check could
both apply, existence is settled first — the established
`FeedService.deleteComment` / `GrassrootsService` / `BanterService`
convention. `assertGroupExists` runs before any membership/authorization
check throughout this service.

## `memberCount` discipline

`CommunityGroup.memberCount` is a denormalized cache — same obligation as
`Post.likeCount` / `ClubPage.memberCount` / `BanterRoom.memberCount`
(Decision Log #199/#275). Every `CommunityGroupMember` create/delete is
paired with the counter mutation **inside one interactive `$transaction`**,
the exact `BanterService.joinRoom`/`leaveRoom` pattern:

- `createGroup` — `memberCount: 1` literal + the creator's own
  `CommunityGroupMember` row, one transaction, wrapped in the same
  try/catch that turns a `nameNormalized` collision into a `409`.
- `joinGroup` — `tx.communityGroupMember.create` + `tx.communityGroup.update({
  memberCount: { increment: 1 } })`. A duplicate join throws `P2002` on
  the create, the increment never runs, the whole callback rolls back —
  caught as idempotent success.
- `leaveGroup` — `findUnique` first (a never-joined caller is a no-op
  success, not a `404`), then `tx.communityGroupMember.delete` +
  `tx.communityGroup.updateMany({ where: { memberCount: { gt: 0 } }, ...
  decrement })`. Two layered guards against negative `memberCount`: only
  enter the transaction when a row exists, AND the `gt: 0` floor on the
  decrement. A concurrent-delete `P2025` is caught as idempotent success.

`memberCount` is never authoritative in isolation — recomputable via
`CommunityGroupMember.count({ where: { communityGroupId } })`. Flagged
consequence (same as `ClubsService`'s own roster): the *visible* roster
(after `VISIBLE_GROUP_MEMBER_FILTER`) can be shorter than `memberCount`
if that filter ever excludes a real member row.

## Roster visibility filter

`GET /community-groups/:id/members` mirrors `ClubsService.getClubMembers`
exactly, per this task's own instruction: keyset pagination alphabetically
by `displayName` (`id` tiebreak — reusing the same `{ name, id }` cursor
envelope shape `clubs/cursor.util.ts` established, re-declared locally
rather than imported across the module boundary). Excludes:

- **Restricted-pending minors** (CLAUDE.md non-negotiable #1; Build Plan
  Section 8.3) — non-minor, OR a minor whose `Guardian` row exists AND has
  `consentStatus: 'confirmed'`.
- **Non-`active` accounts** (Decision Log #221) — `accountStatus:
  'active'` only.

Both conditions exactly match `ClubsService.VISIBLE_CLUB_MEMBER_FILTER`,
re-declared locally as `VISIBLE_GROUP_MEMBER_FILTER` rather than imported
across the module boundary — the same small-deliberate-duplicate
precedent this codebase already uses for its per-module `{id,
displayName}` member-select shapes.

## What `apps/web` still needs

No Community Groups screen exists in `apps/web` yet — this PR is
backend-only. A `figma-to-code` pass converting the design (Decision Log
#281, `docs/sprint-3-community-groups-design-report.md`) against these
endpoints is the natural next step, following the exact two-PR split this
project used for Grassroots (`sprint-5/grassroots-conversion-read` /
`-organiser`) and Clubs (`sprint-2/club-pages-conversion`).

## Verification

- **Mocked unit suite** — `community-groups.service.spec.ts` (`PrismaService`
  mocked) covers: `nameNormalized` derivation + `P2002` → `409`, the
  newest-first `(createdAt, id)` cursor + the three combinable filters,
  per-caller `joined` computation (list + single), join/leave idempotency
  (`P2002`/`P2025`) + the transactional `memberCount` pairing, the
  creator auto-join, the roster's membership + visibility filter
  (`communityGroupMemberships: { some: { communityGroupId } }` — **not**
  `{ id }`, since `CommunityGroupMember` is an explicit join model, unlike
  `ClubPage.members`'s implicit m2m), and alphabetical roster pagination.
  `community-groups.controller.http.spec.ts` (mocked `CommunityGroupsService`,
  guards overridden) covers routing (`:id/members` not shadowed by
  `:id`), DTO validation (missing all three dimensions → `400`,
  whitespace-only dimensions → `400`, either `positionPlayed` or
  `careerTrack` alone satisfies the rule, body-whitelist strips
  `createdById`/`memberCount`/`nameNormalized`), and that
  `GuardianConsentGuard` runs on exactly the three write routes (create,
  join, leave).
- **e2e suite** — `test/community-groups.e2e-spec.ts`, real Postgres via
  docker-compose. Hits `test/README.md`'s e2e triggers: **genuinely new
  Prisma relations/constraints** (`CommunityGroupMember`'s
  `@@unique([userId, communityGroupId])`, `CommunityGroup`'s own
  `nameNormalized` `@@unique`, and the `onDelete: Cascade` FKs — never
  exercised against a real Postgres before this PR) and **transaction
  reasoning** (`memberCount` incremented/decremented paired with the
  member row, proven never to drift or go negative across a real
  join/join/leave/leave/join cycle; a genuine concurrent double-join via
  `Promise.all` producing exactly one row; a genuine concurrent duplicate
  create producing exactly one `CommunityGroup` row and one `409`). Also:
  the real `GuardianConsentGuard` blocking a restricted-pending minor
  from creating/joining/leaving while still allowing them to browse and
  read; combinable `city`/`positionPlayed`/`careerTrack` filtering +
  newest-first keyset pagination against real rows; per-caller `joined`
  scoped correctly; alphabetical roster pagination; the restricted-pending
  minor roster-exclusion proof (seeded directly via Prisma, since the
  real join path is consent-gated — see the Permission model section
  above); and a real `User` hard-delete cascading `CommunityGroupMember`
  rows away while leaving the group and other members intact.

Exact before/after suite counts for this PR are recorded in
`CLAUDE.md`'s matching Sprint 3 status bullet.

## Under-16 restriction (sprint-1/under-16-restrictions, Decision Log #346)

`isUnder16` accounts are read-only: `POST /community-groups` (content
creation) is blocked with `under_16_restricted`. Reads and join/leave stay
open (membership is not content). No group post/comment/reply endpoint
exists, so there is nothing further to gate.
