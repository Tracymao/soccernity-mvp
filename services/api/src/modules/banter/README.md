# banter module

Build target: **Sprint 3** — Section 4.4 of the MVP Build Plan (Club &
Banter Service), the `/banter-rooms` half. (The `/clubs` half shipped in
Sprint 2 on `ClubsModule`.) Built by `sprint-3/banter-rooms-backend`
(backend-api, 2026-09-09). Extended by `sprint-3/banter-room-topics`
(backend-api, 2026-09-29), which resolves **Decision Log #276** — the
`Topic`/`BanterRoomTopic` schema addition and `POST /banter-rooms/:id/topics`,
Section 4.4's originally-named but previously-unbuilt route.

Backs the "well-developed Figma Banter frames" (Log Book Section 23.1) and
`apps/web`'s existing disclosed-stub `BanterPage.tsx` — a later
`figma-to-code` pass wires that page to these endpoints; this PR is
backend only.

## Schema change — one new model, one migration

`BanterRoom` (Section 3) has `memberCount` but **no join table**, so
nothing recorded *which* users joined a room — and "My Bants" (Build Plan
Section 6, Sprint 3) requires exactly that. `sprint-3/banter-rooms-backend`
adds **`BanterRoomMember`** (migration
`20260909003336_add_banter_room_member`):

```prisma
model BanterRoomMember {
  id           String     @id @default(uuid())
  userId       String
  user         User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  banterRoomId String
  banterRoom   BanterRoom @relation(fields: [banterRoomId], references: [id], onDelete: Cascade)
  joinedAt     DateTime   @default(now())

  @@unique([userId, banterRoomId])
}
```

**Why an explicit join model, not an implicit Prisma m2m** (like
`ClubPage.members` / `_ClubMembership`): the implicit route caused a real
silent-relation-merge bug on `ClubPage.members` (see `schema.prisma`'s
comment there) and forced `ClubsService.joinClub` into raw `$executeRaw`
for idempotency, because this Prisma version does **not** throw on a
duplicate implicit-m2m `connect`. An explicit model — the exact shape of
`Like` / `SavedPost` / `Follow` — gives `joinRoom` a plain **P2002-catch**
idempotency mechanism (identical to `FeedService.likePost`) and a real
`joinedAt` timestamp to keyset-paginate "My Bants" by. `joinedAt` is a
flagged addition beyond Section 3's literal field list — the same flag
`Like.likedAt` / `SavedPost.savedAt` / `Follow.createdAt` already carry,
for the same reason (Section 5.5 needs a column to order a list endpoint
by). **Decision Log #275.**

Both FKs are `onDelete: Cascade` per Decision Log #44 — a `User` delete
cascades these rows away with **no** change to
`AccountDeletionSweepService` (it relies on Postgres-level cascade; its
`P2003` catch stays a defensive fallback, never hit here).

`BanterRoom.createdBy` stays a bare `String` (not a `User` `@relation`),
exactly as Section 3 scaffolded it — making it a real FK would pull room
creation into the Decision Log #44 cascade scope for no MVP benefit.
Flagged, not changed.

`User` / `Guardian` safeguarding fields are **untouched** — the schema
diff is one new model plus two mechanical reverse-relation array fields
(`BanterRoom.members`, `User.banterRoomMemberships`) and tightened `//`
comments.

## Topics (`sprint-3/banter-room-topics`, resolves Decision Log #276)

Decision Log #276 flagged two gaps in the original `sprint-3/banter-rooms-backend`
PR: (1) no `Topic` entity, so `POST /banter-rooms/:id/topics` could not be
built; (2) no `scopeRef`/`scopeName` target field on `BanterRoom`. **This
PR resolves (1) only** — (2) remains open, unchanged, still flagged below.

### Schema — two new models, one migration

Migration `20260929001933_add_banter_room_topics`, purely additive (two
`CREATE TABLE`s, two unique indexes, two foreign keys, zero `ALTER`/`DROP`
on any existing table):

```prisma
model Topic {
  id             String            @id @default(uuid())
  name           String
  nameNormalized String            @unique
  createdAt      DateTime          @default(now())
  rooms          BanterRoomTopic[]
}

model BanterRoomTopic {
  id           String     @id @default(uuid())
  banterRoomId String
  banterRoom   BanterRoom @relation(fields: [banterRoomId], references: [id], onDelete: Cascade)
  topicId      String
  topic        Topic      @relation(fields: [topicId], references: [id], onDelete: Cascade)
  createdAt    DateTime   @default(now())

  @@unique([banterRoomId, topicId])
}
```

Plus `BanterRoom.topics BanterRoomTopic[]`. A genuine addition beyond
Section 3's literal 20-entity list, flagged per CLAUDE.md's "the data
model is a fixed spec" rule — the same category of flagged addition
`CommunityGroup`/`BanterRoomMember` already made. `User`/`Guardian`
safeguarding fields are untouched — neither `Topic` nor `BanterRoomTopic`
references `User` at all.

**Checked, not assumed, that this is a genuinely different concept from
`Hashtag`/`PostHashtag`** (search module, `sprint-4/trending-topics-backend`)
before building a second, parallel model: `Hashtag` rows are auto-EXTRACTED
from free `Post.contentText` via a `#(\w+)` regex scan and exist purely to
power `GET /trending`'s windowed decay aggregation — a rolling popularity
signal over post text. A Banter Room Topic is a manually CURATED,
creator-attached categorization tag with a completely different lifecycle
(no decay/trending concept, no `postCount`). Reusing `Hashtag` here would
conflate two unrelated concerns; kept as two separate models.

### Cardinality — a real judgment call: many-to-many, not a single nullable FK

`BanterRoomTopic` is an **explicit join model** (never an implicit Prisma
m2m — see `ClubPage.members`'s own real silent-relation-merge-bug
precedent), mirroring `BanterRoomMember`/`CommunityGroupMember`/`Like`/
`SavedPost`/`Follow`'s exact shape: a surrogate `id` + `@@unique` composite
for P2002-catch idempotency.

**Many-to-many was chosen over a single nullable `BanterRoom.topicId` FK**,
argued explicitly rather than picked by default:

1. Section 4.4's own route is named `POST /banter-rooms/:id/topics` —
   **plural**, a collection-style sub-resource (the same shape this
   codebase already uses for a genuinely multi-valued relationship —
   compare `GET /banter-rooms/:id/posts`, a collection under a resource).
   A single-FK design would more naturally be expressed as
   `PATCH /banter-rooms/:id { topicId }`, which Section 4.4 does not name.
2. `scopeType` (`club | league | country | topic`) already IS the
   single-value categorization axis for a room. Topic is the orthogonal,
   genuinely multi-valued axis — a room built around a topic-scoped
   conversation ("Transfer Deadline Day Chat") plausibly touches more
   than one topical tag at once ("Transfers" + "Deadline Day"), and
   nothing in `scopeType`'s own four-value enum forces a 1:1 relationship.
3. The alternative (a single nullable `topicId` FK) was considered and
   rejected on both points above — it would need a different endpoint
   shape than the one Section 4.4 already names, and it would collapse a
   real multi-tag use case into a single label.

### `POST /banter-rooms/:id/topics` — find-or-create + attach, and a real bug found + fixed

Each `name` in the request body is **find-or-created** against `Topic` by
its normalized (trim + lowercase) form — the same
`CommunityGroup.nameNormalized` dedup concept `CommunityGroupsService.createGroup`
already establishes, but resolved via `upsert`, not create-then-catch (see
below for why). A `Topic` name collision is never a client-facing error
the way a duplicate `CommunityGroup` name is — `Topic` has no "who owns
this name" concept to protect.

**A real, reproduced bug, not a hypothetical one.** The first
implementation of `attachTopics` ran the whole batch's find-or-create +
attach inside **one shared** `$transaction`, catching a `P2002` from
`Topic.create` and then issuing a `findUnique` recovery read **on the
same transaction client**. `test/banter.e2e-spec.ts`'s own genuine
concurrent-attach test (two different rooms attaching the same brand-new
topic name at once, via `Promise.all`) caught this immediately: one of
the two requests failed with a real `500`, not the expected `200`. Root
cause, confirmed directly (not assumed): **Postgres aborts an entire
transaction the instant any query inside it fails** (a real
unique-constraint violation from a concurrent writer, here) — every
further command issued on that same transaction is then rejected until it
ends. Catching the error at the application layer and issuing a
*different* query on the *same* now-aborted transaction throws a second,
unrelated error on that very next query, which the original code's catch
block didn't handle.

**`upsert` alone is not sufficient either — also confirmed empirically,
not assumed safe.** Switching `Topic.create`/`findUnique` to a single
atomic `Topic.upsert` (an `INSERT ... ON CONFLICT DO UPDATE` at the SQL
level, the same pattern `hashtag.util.ts`'s own `recordPostHashtags`
already uses) removes most of the risk, but a standalone script run
directly against this project's real Postgres instance still hit a raw
`P2002` escaping `$transaction()` on 1 of 5 runs under genuine concurrent
load — a documented Postgres `ON CONFLICT` caveat (the conflict check can
still race a not-yet-committed concurrent transaction), not a Prisma bug.

**The actual fix**: each `name` gets its **own** transaction
(`attachOneTopic`), containing exactly one `Topic.upsert` + one
`BanterRoomTopic.upsert` (idempotent by construction — `update: {}`/`{
name }`, never a `create`-then-catch). If that whole transaction still
fails with `P2002` (the rare residual race above), the ENTIRE transaction
is retried from scratch, up to 3 times — a fresh transaction on retry
sees the now-committed winning row and completes normally via the
`upsert`'s own update branch. Proven fixed by re-running the exact e2e
test that caught the original bug, now passing reliably. The response
returns the room's **full current topic list** (not just the
newly-attached ones), read fresh after all per-name transactions commit,
so a client can simply replace its local state.

### Permission model — a real judgment call, argued explicitly

**Only the room's creator (`BanterRoom.createdBy`) may attach topics** —
not any member, and not any consent-confirmed authenticated user (403
otherwise, settled AFTER the standard 404-before-403 existence check).

- Mirrors `GrassrootsService.createFixture`'s own "you manage what you
  created" ownership model — the closest analogous precedent this
  codebase has for who may mutate a record's own metadata (Decision Log
  #255's own team-creator-only reasoning for fixture/result actions).
- Avoids compounding the spam/safeguarding concern this module's own
  README already flags (judgment call 1, below) about unbounded
  room-metadata mutation on a minors' platform — if any authenticated
  user could tag any room, the surface for abuse would be strictly
  larger than the already-flagged room-creation one.
- **"Any member may attach topics" was considered and rejected** — no
  analogous "shared metadata, editable by any member" precedent exists
  anywhere in this codebase (`CommunityGroup`/`ClubPage` don't have one
  either).
- **"Any authenticated, consent-confirmed user, even non-members" was
  considered and rejected** — an even weaker restriction than "any
  member," so a stronger case against it than the one above.

**Guard: `JwtAuthGuard` + `GuardianConsentGuard`** — a short confirmation
of `POST /banter-rooms`'s own "posting"-class reasoning (Decision Log
#21), not a fresh argument: attaching a topic tag changes a public-facing,
persistent room's own discoverability metadata (it's exactly what
`?topicId=` filters against), the same category of action room *creation*
already treats as consent-gated.

### `GET /banter-rooms/topics` — beyond Section 4.4's literal list, built anyway

Section 4.4 names only `POST /banter-rooms/:id/topics`. Without a topics
catalog endpoint, `GET /banter-rooms`'s new `?topicId=` filter (below)
would be effectively unusable from a client with no other rooms already
fetched to derive ids from — the same "a filterable dynamic resource
needs an enumeration endpoint" convention `GET /categories` already
establishes for `Article.categoryId`. `JwtAuthGuard` only, alphabetical by
`name`, keyset-paginated (reuses `BanterRoomCursor`'s own `{name, id}`
shape/functions directly — same module, same shape, no duplicate type).

### `?topicId=` filter on `GET /banter-rooms` / `GET /banter-rooms/search`

A plain equality condition against `BanterRoomTopic` (`{ topics: { some: {
topicId } } }`), ANDed alongside the existing `scopeType`/`q` filters. An
unknown/bad `topicId` is not a `400` — it simply matches zero rooms, the
same behavior a `q` that matches nothing already has.

## Endpoints

Section 4.4 lists: `GET /banter-rooms`, `GET /banter-rooms/:id`, `POST
/banter-rooms`, `POST /banter-rooms/:id/topics`, `GET
/banter-rooms/search?q=`.

| Method & path | Guards | Notes |
|---|---|---|
| `POST /banter-rooms` | `JwtAuthGuard` + `GuardianConsentGuard` | Create. `{ name, scopeType }`; `scopeType` `@IsIn(['club','league','country','topic'])`. `createdBy` = caller. **Creator is auto-joined** (`memberCount` starts at 1). Default `201`. |
| `GET /banter-rooms` | `JwtAuthGuard` | List, keyset alphabetical by `name` (`id` tiebreak). Optional `?scopeType=` exact filter, optional `?q=` name substring (ILIKE). Per-caller `joined` boolean (batched — no N+1). |
| `GET /banter-rooms/search?q=` | `JwtAuthGuard` | Section 4.4's literal search route. **Shares `BanterService.listRooms`** with `GET /banter-rooms` — same `scopeType` + `q` mechanism (the `GrassrootsPage`/`?city=` server-side-filter precedent this task points at). Exists because Section 4.4 names it. |
| `GET /banter-rooms/mine` | `JwtAuthGuard` | "My Bants" — rooms the caller has joined, keyset by `joinedAt desc` (`banterRoomId` tiebreak). |
| `GET /banter-rooms/:id` | `JwtAuthGuard` | One room + per-caller `joined`. 404 if missing. |
| `POST /banter-rooms/:id/join` | `JwtAuthGuard` + `GuardianConsentGuard` | Join. `200`, idempotent (P2002-catch), `memberCount` incremented transactionally. `{ roomId, joined: true, memberCount }`. |
| `DELETE /banter-rooms/:id/join` | `JwtAuthGuard` + `GuardianConsentGuard` | Leave. `200`, idempotent (leaving a room you're not in is not a 404), `memberCount` decremented transactionally and floor-guarded `>= 0`. |
| `GET /banter-rooms/:id/posts` | `JwtAuthGuard` | Room feed. `assertRoomExists` (404) → `FeedService.getBanterRoomFeed`. Identical `FeedPage` / `FeedPostWithViewerState` shape to `GET /posts/feed`. |
| `POST /banter-rooms/:id/posts` | `JwtAuthGuard` + `GuardianConsentGuard` | Post into a room. `assertRoomExists` (404) → **must be a member** (403) → `FeedService.createPost(userId, { ...dto, banterRoomId: id })` — the single post-creation path, never a parallel one. `{ contentText, mediaUrls? }`. |
| `GET /banter-rooms/topics` | `JwtAuthGuard` | The topics catalog. Alphabetical by `name`, keyset-paginated. `sprint-3/banter-room-topics`, Decision Log #276. |
| `POST /banter-rooms/:id/topics` | `JwtAuthGuard` + `GuardianConsentGuard` | Attach one or more topics to a room. **Room creator only** (403 otherwise). `{ names: string[] }`, max 5. Find-or-create + idempotent attach — see "Topics" above. `sprint-3/banter-room-topics`, resolves Decision Log #276. |

### Not built

- **A `scopeRef` / `scopeName` target field on `BanterRoom`** — so a
  "club-scoped" room can name *which* club/league/country. Section 3
  gives `BanterRoom` only `{ id, name, scopeType, createdBy, memberCount
  }`. MVP treats `scopeType` as a bare filter category + free-text
  `name`, matching the Figma scope-filter-bar-as-categories reading.
  **Still open — Decision Log #276's other flagged item; the `Topic`
  half of #276 is now resolved by `sprint-3/banter-room-topics`, this
  half is not.**
- **A room-delete / room-edit endpoint** — Section 4.4 lists neither;
  not invented.
- **Room-name moderation / a topic-name moderation queue** — an unbounded
  supply of user-named public rooms and topics on a minors' platform is a
  real spam/safeguarding surface, flagged (judgment call 1, below and in
  the Topics section above) but not built.

### Beyond Section 4.4's literal list, built anyway (flagged)

`POST`/`DELETE /banter-rooms/:id/join`, `GET /banter-rooms/mine`,
`POST`/`GET /banter-rooms/:id/posts`, and `GET /banter-rooms/topics` are
**not** in Section 4.4's literal five-endpoint list. The first three come
from Section 6's Sprint 3 description ("with search and a **'My Bants'
view**"), the `BanterRoomMember` table this PR had to add for that view,
and `Post.banterRoomId` existing in Section 3 specifically for room-scoped
posts. `GET /banter-rooms/topics` comes from `POST /banter-rooms/:id/topics`
itself needing a way for a client to discover topic ids at all (see the
Topics section above). Flagged here (and **Decision Log #275**/**#276**)
the same way `GrassrootsController` flagged `PATCH /fixtures/:id/status`
(Decision Log #254) — a real, reasoned addition, not a silent one.

## Permission model (Decision Log #275)

| Action | Who may do it | Guard |
|---|---|---|
| `POST /banter-rooms` (create a room) | **any authenticated, consent-confirmed user** — becomes `createdBy` | `JwtAuthGuard` + `GuardianConsentGuard` |
| `POST`/`DELETE /banter-rooms/:id/join` | any authenticated, consent-confirmed user | `JwtAuthGuard` + `GuardianConsentGuard` |
| `POST /banter-rooms/:id/posts` | any authenticated, consent-confirmed user **who is a member of the room** | `JwtAuthGuard` + `GuardianConsentGuard` |
| `POST /banter-rooms/:id/topics` | **the room's creator only** (`createdBy`) | `JwtAuthGuard` + `GuardianConsentGuard` |
| all GET reads (list / search / mine / :id / :id/posts / topics) | any authenticated user | `JwtAuthGuard` only |

### Judgment calls (stated, not built-around — same discipline as Grassroots #255)

1. **Room creation is open to any consent-confirmed user** (default),
   mirroring `POST /teams` (Decision Log #255): a room is a public-facing
   named record → "posting"-class under Section 5.7's broad reading
   (Decision Log #21) → consent-gated. There is **no admin/moderator role
   in the user-facing guards** to restrict creation to, and the Figma
   Banter frames show users creating rooms. **Flagged**: whether room
   creation should later be moderator-gated or rate-limited — an
   unbounded supply of user-named public rooms on a minors' platform is a
   real spam / safeguarding surface.

2. **Join / leave / post ARE consent-gated** (`GuardianConsentGuard`), a
   deliberate divergence from `POST /clubs/:id/join` (`JwtAuthGuard`
   only). Section 5.7 names "joining a **Banter Room** or Community
   Group" and Section 8.3 step 5 names "no participation in **Banter
   Rooms** beyond read-only" — this is the exact action both name
   *literally*, unlike a `ClubPage` fan-page join (which
   `clubs/README.md` argued is neither of those two things). A
   restricted-pending minor can browse rooms and read room feeds; they
   cannot join, leave, or post.

3. **Posting requires room membership (403 otherwise)**. "Join a room to
   participate" matches the Figma flow and is the only reading of Section
   8.3 step 5's "read-only [without participating]" that makes sense.
   Alternative (any consent-confirmed user may post into any room without
   joining) considered, not chosen — **flagged**.

4. **The creator is auto-joined** on `POST /banter-rooms` (`memberCount`
   starts at 1, a `BanterRoomMember` row is written in the same
   transaction). "Create a group → you're in it" matches every
   comparable platform and keeps `memberCount` from being misleadingly 0
   for an active room. Alternative (creator must then explicitly join
   their own room) considered, not chosen.

5. **404 before 403** everywhere (`FeedService.deleteComment` /
   Grassroots convention): room existence is settled before any
   membership check, so a non-member never learns anything about a room
   that doesn't exist.

6. **`POST /banter-rooms/:id/topics` is creator-only, not member-or-broader**
   (`sprint-3/banter-room-topics`, Decision Log #276) — see the dedicated
   "Topics" section above for the full argument. Short version: mirrors
   `GrassrootsService.createFixture`'s "you manage what you created"
   model; "any member" and "any authenticated user" were both considered
   and rejected as compounding judgment call 1's already-flagged spam
   surface.

## `memberCount` discipline

`BanterRoom.memberCount` is a denormalized cache — same obligation as
`Post.likeCount` / `Post.commentCount` / `ClubPage.memberCount`. Every
`BanterRoomMember` create/delete is paired with the counter mutation
**inside one interactive `$transaction`**:

- `joinRoom` — `tx.banterRoomMember.create` + `tx.banterRoom.update({
  memberCount: { increment: 1 } })`. A duplicate join throws P2002 on the
  create, the increment never runs, the whole callback rolls back —
  caught as idempotent success (`FeedService.likePost` pattern exactly).
- `leaveRoom` — `findUnique` first (a never-joined caller is a no-op
  success, not a 404), then `tx.banterRoomMember.delete` +
  `tx.banterRoom.updateMany({ where: { memberCount: { gt: 0 } }, ...
  decrement })`. Two layered guards against negative `memberCount`: only
  enter the transaction when a row exists, AND the `gt: 0` floor on the
  decrement (`ClubsService.leaveClub` / `FeedService.unlikePost`
  pattern). A concurrent-delete P2025 is caught as idempotent success.
- `createRoom` — `memberCount: 1` literal + the creator's own
  `BanterRoomMember` row, one transaction.

`memberCount` is never authoritative in isolation — recomputable via
`BanterRoomMember.count({ where: { banterRoomId } })`.

## Delegation to FeedService (no parallel post CRUD)

`BanterService` injects `FeedService` (via `BanterModule` importing
`FeedModule`, which `exports: [FeedService]` — no cycle, `FeedModule`
imports neither). Two delegations, both the same pattern
`ClubsController` established for `GET /clubs/:id/feed`:

- `GET /banter-rooms/:id/posts` → `FeedService.getBanterRoomFeed` — a new
  method that adds exactly one WHERE clause (`banterRoomId`) to the
  shared `paginatePostsWithViewerState` pipeline `getFeed` / `getClubFeed`
  already use. Same `FeedPage` shape, same viewer state (`isLiked` /
  `isSaved` / `author.isFollowing`, Decision Log #153).
- `POST /banter-rooms/:id/posts` → `FeedService.createPost(userId, {
  contentText, mediaUrls, banterRoomId })` — the single post-creation
  path. Its `GuardianConsentGuard` is also on this route's controller;
  its P2003 catch, engagement-points award (Decision Log #219), and "at
  most one of clubPageId/banterRoomId" check all apply as-is. No
  `post.create` is written in this module.

## Verification

- **Mocked unit suite** — `banter.service.spec.ts` (`PrismaService` +
  `FeedService` mocked) covers: `scopeType` allow-list, the shared
  list/search filter + cursor, "My Bants" ordering, `joined`
  computation, join/leave idempotency (P2002/P2025) + the transactional
  `memberCount` pairing, the creator auto-join, the 404-then-403 ordering
  on `postToRoom`, and that `postToRoom` forwards to `FeedService.createPost`
  with `banterRoomId` set. `banter.controller.http.spec.ts` (mocked
  `BanterService`, guards overridden) covers routing, DTO validation
  (bad `scopeType` → 400, body-whitelist strips `createdBy`), route
  ordering (`search`/`mine` not shadowed by `:id`), and that
  `GuardianConsentGuard` runs on exactly the four write routes.
  `sprint-3/banter-room-topics` adds: the `?topicId=` filter (mocked),
  the raw-junction-to-`TopicSummary[]` flattening (`toRoomSummary`), and
  a full `attachTopics`/`listTopics` describe block covering 404-then-403
  ordering, the `upsert`-based attach (name normalization, per-name
  independence), the retry-on-`P2002` path (both "retries once and
  succeeds" and "exhausts 3 retries and rethrows"), rethrow-on-non-P2002
  without retrying, multi-name attach, and the topics catalog's ordering/
  cursor/malformed-cursor behavior — plus new controller-HTTP coverage
  for route ordering (`topics` not shadowed by `:id`), DTO validation
  (empty/oversized/too-short `names`), and that `GuardianConsentGuard`
  runs on the new write route too (now five write routes total, up from
  four). Note: the transaction-poisoning bug itself (see the "find-or-create
  + attach" section above) could NOT have been caught by this mocked
  suite — it only manifests against a real Postgres transaction's real
  abort semantics, which is exactly why `test/banter.e2e-spec.ts`'s own
  concurrent-attach test exists and is what actually found it.
- **e2e suite** — `test/banter.e2e-spec.ts`, real Postgres via
  docker-compose. Hits `test/README.md`'s e2e triggers: a **genuinely
  new Prisma relation/constraint** (`BanterRoomMember`, its `@@unique`,
  the `onDelete: Cascade` FKs) and **transaction reasoning** (the
  `memberCount` increment/decrement paired with the member row, proven
  never to drift or go negative across a real
  join/join/leave/leave/join cycle, and a concurrent double-join
  `Promise.all` asserting exactly one row + `memberCount` 1). Also: the
  real `GuardianConsentGuard` blocking a restricted-pending minor from
  creating/joining/posting while still allowing them to browse and read;
  "My Bants" against real rows; the room feed reading `Post.banterRoomId`
  (which `GET /posts/feed` never does); and a real `User` hard-delete
  cascading `BanterRoomMember` rows away.

  `sprint-3/banter-room-topics` adds its own dedicated describe block,
  hitting two MORE genuinely new real Prisma constraints (`Topic.nameNormalized`'s
  `@@unique` and `BanterRoomTopic`'s own `@@unique([banterRoomId, topicId])`
  — neither ever exercised against real Postgres before this PR): creator
  can attach / non-creator (even a room member) gets a real 403 with zero
  side effects; attached topics surfaced correctly on `GET /banter-rooms`,
  `GET /banter-rooms/:id`, AND `GET /banter-rooms/mine`; idempotent
  re-attach across a case/whitespace-different name resolving to the same
  real `Topic` row; the `?topicId=` filter against real rows; the topics
  catalog's real alphabetical keyset pagination; a **genuine concurrent
  double-attach of the same new topic name from two different rooms**
  (`Promise.all`) proving `Topic.nameNormalized`'s `@@unique` constraint
  resolves to exactly one row under a real race, not a mocked one; a
  restricted-pending minor genuinely blocked (403 `guardian_consent_pending`)
  from attaching topics to a room seeded directly via Prisma (since a
  minor can't create one through the real API); and 401/400/404 coverage.

  Before this PR, both suites' totals (mocked and e2e) are as recorded in
  CLAUDE.md's own Sprint 3 status bullet for `sprint-3/banter-rooms-backend`.
  Real before/after counts for `sprint-3/banter-room-topics` are recorded
  in CLAUDE.md's matching status bullet for this PR — check there rather
  than trusting a number written here going stale.

## Under-16 restriction (sprint-1/under-16-restrictions, Decision Log #346)

`isUnder16` accounts are fully blocked from Bants — every route,
including reads, joining and posting (`Under16RestrictionGuard` +
`@RestrictUnder16('banter')` at class level). Layered on top of
`GuardianConsentGuard`, which stays on the write routes unchanged.
