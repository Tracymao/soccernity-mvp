# banter module

Build target: **Sprint 3** — Section 4.4 of the MVP Build Plan (Club &
Banter Service), the `/banter-rooms` half. (The `/clubs` half shipped in
Sprint 2 on `ClubsModule`.) Built by `sprint-3/banter-rooms-backend`
(backend-api, 2026-09-09).

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

### Not built

- **`POST /banter-rooms/:id/topics`** (Section 4.4 literal) — there is
  **no `Topic` entity** in Section 3's 20-model schema and no
  `BanterRoom.topics` relation. `scopeType: 'topic'` is a room
  *category*, not a room *having* topics. A real topics feature needs a
  schema addition — a founder / Decision Log call, the same discipline
  `GrassrootsService` used declining to speculatively add
  `postponed`/`cancelled` fixture statuses. **Decision Log #276.**
- **A `scopeRef` / `scopeName` target field on `BanterRoom`** — so a
  "club-scoped" room can name *which* club/league/country. Section 3
  gives `BanterRoom` only `{ id, name, scopeType, createdBy, memberCount
  }`. MVP treats `scopeType` as a bare filter category + free-text
  `name`, matching the Figma scope-filter-bar-as-categories reading.
  **Decision Log #276.**
- **A room-delete / room-edit endpoint** — Section 4.4 lists neither;
  not invented.

### Beyond Section 4.4's literal list, built anyway (flagged)

`POST`/`DELETE /banter-rooms/:id/join`, `GET /banter-rooms/mine`, and
`POST`/`GET /banter-rooms/:id/posts` are **not** in Section 4.4's literal
five-endpoint list. They come from Section 6's Sprint 3 description ("with
search and a **'My Bants' view**"), the `BanterRoomMember` table this PR
had to add for that view, and `Post.banterRoomId` existing in Section 3
specifically for room-scoped posts. Flagged here (and **Decision Log
#275**) the same way `GrassrootsController` flagged `PATCH
/fixtures/:id/status` (Decision Log #254) — a real, reasoned addition, not
a silent one.

## Permission model (Decision Log #275)

| Action | Who may do it | Guard |
|---|---|---|
| `POST /banter-rooms` (create a room) | **any authenticated, consent-confirmed user** — becomes `createdBy` | `JwtAuthGuard` + `GuardianConsentGuard` |
| `POST`/`DELETE /banter-rooms/:id/join` | any authenticated, consent-confirmed user | `JwtAuthGuard` + `GuardianConsentGuard` |
| `POST /banter-rooms/:id/posts` | any authenticated, consent-confirmed user **who is a member of the room** | `JwtAuthGuard` + `GuardianConsentGuard` |
| all GET reads (list / search / mine / :id / :id/posts) | any authenticated user | `JwtAuthGuard` only |

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
