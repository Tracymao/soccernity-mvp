# users module

Build target: Sprint 1 (PR B6) and Sprint 2 (`sprint-2/follow-and-notifications`)
— Section 4.2 of the MVP Build Plan.

## Status

**PR B6 (self-profile view/edit) — done.** **Follow (the remaining four
Section 4.2 endpoints) and notification-trigger wiring for
follow/like/comment — done, this PR.**

Section 4.2 lists seven endpoints total:

```
GET    /users/:id                — PR B6
PATCH  /users/:id                — PR B6
GET    /users/:id/profile        — still unbuilt (see below)
POST   /users/:id/follow         — this PR
DELETE /users/:id/follow         — this PR
GET    /users/:id/followers      — this PR
GET    /users/:id/following      — this PR
```

`GET /users/:id/profile` (the public-facing view of *another* user) is
the one Section 4.2 endpoint still unbuilt — see "Deliberately out of
scope" below. Everything else in Section 4.2 now exists.

### Spec discrepancy flagged, not silently resolved

This PR's task brief described the target as `GET /users/me` /
`PATCH /users/me`. Build Plan Section 4.2 (User Service) does not actually
list a `/me` route — it lists:

```
GET    /users/:id
PATCH  /users/:id
GET    /users/:id/profile
POST   /users/:id/follow
DELETE /users/:id/follow
GET    /users/:id/followers
GET    /users/:id/following
```

(There is a `GET /auth/me` in Section 4.1 — Auth Service — but that's a
separate endpoint owned by B2-B4, not this module.)

This PR implements the literal spec routes, `GET /users/:id` and
`PATCH /users/:id`, scoped to **self only**: both handlers return 403 if
the `:id` path param doesn't match the authenticated user's own id (from
the verified JWT, not the path param). This satisfies the PR's actual
brief — "view/edit my own profile" — without inventing an undocumented
`/users/me` endpoint. If a `/me` convenience alias is wanted in addition
to the spec'd `:id` routes, that's a genuine addition beyond Section 4.2
and belongs on the Decision Log, not something to add unilaterally here.

### What's implemented

- `GET /users/:id` — requires a valid access token (`JwtAuthGuard`).
  Returns the caller's own profile, always via a fresh Prisma read
  (never assembled from the JWT). Fields returned: `id`, `email`,
  `phone`, `displayName`, `dateOfBirth`, `isMinor`, `role`,
  `verificationStatus`, `createdAt`, `clubAffiliationId`.
  `passwordHash` is excluded via Prisma `select` (not a post-hoc delete),
  so there's no code path where it ever leaves the database query.
- `PATCH /users/:id` — requires a valid access token. Accepts only
  `displayName` and `phone` (see `dto/update-user.dto.ts`). Any other
  field in the request body — in particular `isMinor`, `role`,
  `verificationStatus`, `email`, `dateOfBirth`, or anything
  guardian/consent-related — is rejected by the global `ValidationPipe`
  (`forbidNonWhitelisted: true`, added to `main.ts` in this PR) AND is
  structurally impossible to reach Prisma even if validation were ever
  loosened, because `UsersService`'s `toUpdateData()` only ever reads
  `displayName`/`phone` off the DTO — it never spreads the request body.

### Deliberately out of scope for PR B6 (all resolved except one)

- `GET /users/:id/profile` — the public-facing view of *another* user.
  Needs its own field curation (what a non-owner should see) rather than
  just an auth check, and pagination isn't relevant to a single-user
  fetch but the surrounding "who can see what" logic is a bigger piece
  of work than B6's brief covered. **Still unbuilt as of this PR** — see
  the Sprint 2 section below.
- ~~`POST/DELETE /users/:id/follow`, `GET /users/:id/followers`,
  `GET /users/:id/following`~~ — **built by this PR**, see below.

---

## Sprint 2 — Follow (`sprint-2/follow-and-notifications`)

### Spec discrepancies flagged, not silently resolved

**1. Is following "posting" in Section 5.7's sense?**

No — re-argued here specifically for follow, not inherited from `POST
/posts` (`feed/README.md`, point 1) or the like/save endpoints'
conclusions (`feed/README.md`, points 3/5), the same "don't assume the
same conclusion carries over silently" discipline `feed/README.md`
itself used when it argued liking separately from posting. `POST/DELETE
/users/:id/follow` are `@UseGuards(JwtAuthGuard)` only — no
`GuardianConsentGuard`.

Section 5.7's safety-sensitive-action list is "posting, messaging,
joining a Banter Room or Community Group." A follow relationship
produces **even less** visible content than a like does:
`feed/README.md` already concluded a like isn't "posting" because it
creates no content of its own beyond a number changing (`likeCount`) —
but a follow doesn't even change a number anyone else sees, because
**there is no follower/following count field anywhere in
`schema.prisma`** (see point 3 below — this was checked deliberately,
not assumed). A follow is strictly less content-producing than the
weakest case (liking) `feed/README.md` already decided doesn't require
the guard, so this reads as unambiguous enough not to flag as a
Decision Log candidate — same category as `feed/README.md` point 3 (the
like question), not point 1/4 (the genuinely contested "is this
posting?" questions).

**2. Are `GET /users/:id/followers` and `GET /users/:id/following`
self-scoped, or public?**

**Public — not self-scoped.** This is a deliberate departure from the
precedent this exact codebase set for `GET /users/:id/saved-posts`
under the identical kind of spec silence (`feed/README.md` point 8,
`SavedPostsController.assertSelf()`): that endpoint defaulted to the
**conservative** self-only reading because Section 4.3 said nothing
either way, and "saved" plausibly implies a private bookmark list. This
PR reaches a **different** conclusion for followers/following, not
because self-only is wrong as a general default, but because there's an
actual signal here that saved-posts didn't have: **followers/following
lists are standard, publicly visible social graph data on essentially
every platform this product is modeled after** (every mainstream social
app exposes "who follows X" / "who does X follow" without requiring X's
own login), and neither Section 8.3 step 5's restricted-pending
enumerated list nor Section 5.7's safety-sensitive-action list names
follower/following visibility as something to restrict. Section 4.2
itself is silent on scope, same as Section 4.3 was for saved-posts — the
difference is entirely in which default reasonably fits the data, not
in how carefully each was reasoned. **Flagged as a Decision Log
candidate anyway**, same as saved-posts was: there's no explicit spec
sentence backing either reading, and if Soccernity ever wants a
"private account" feature (a real, common pattern on the exact platforms
this reasoning cites), this scope decision is exactly what such a
feature would need to revisit.

**3. `payloadRefId` convention for `Notification` (established here, not
inherited)**

`Notification.payloadRefId` (`schema.prisma`) is an optional string with
no prior convention — this is the first PR to actually write to it (PR
#54 created `Like`/`Comment` rows but never touched `Notification` at
all; see `feed/README.md`'s own "deliberately out of scope" note on
this). The convention this PR establishes, for all three trigger types
built so far:

| `type`     | `payloadRefId`                          | `userId` (recipient) |
|------------|------------------------------------------|-----------------------|
| `'follow'` | the follower's own `userId` (the actor)  | the followee          |
| `'like'`   | the `postId` that was liked               | the post's author     |
| `'comment'`| the `postId` that was commented on        | the post's author     |

The asymmetry (follow's `payloadRefId` is a user id; like/comment's is a
post id) is intentional, not an inconsistency: a follow notification's
useful payload IS the actor ("who followed me?" — the recipient's client
needs the follower's id to render/link to them), whereas a like/comment
notification's useful payload is WHICH post was acted on (the recipient
already knows who follows them is irrelevant here; what matters is which
of potentially many posts got the like/comment). Both are single opaque
strings by schema design — `payloadRefId` has no `type`-conditional
shape enforcement at the database level, so this table is the only
source of truth for what it means per `type` until/unless a future PR
needs to type it more strictly. Whoever adds the next notification
trigger (e.g. a future `'reply'` type) should extend this table, not
invent a fourth unstated convention.

There is deliberately **no follower/following count field** anywhere in
`schema.prisma` (`User` has no `followerCount`/`followingCount`). This
PR does not add one speculatively — Section 4.2 and the Figma-derived
profile screens surveyed for this PR don't reference a displayed count,
so there's nothing to flag as a gap here, unlike `payloadRefId` above.
If a future screen needs one, that's a genuine schema addition to
propose then, following the same denormalized-counter pattern
`Post.likeCount`/`Post.commentCount` already established (see
`schema.prisma`'s comments on those two fields).

**4. `Follow.createdAt` — a genuine schema addition beyond Section 3**

`Follow` (`schema.prisma`) had no timestamp field at all before this PR
— Section 3's literal `Follow` fields are `id`, `followerId`,
`followeeId`. `GET /users/:id/followers`/`GET /users/:id/following`
being paginated is a hard Section 5.5 requirement, and keyset pagination
needs *something* to order by; `id` alone doesn't work because Prisma's
`uuid()` default generates a random (v4) UUID with zero chronological
meaning — usable only as the same kind of keyset tiebreaker every other
list endpoint in this codebase already uses `id` for (see
`cursor.util.ts`), never as the primary sort key. This PR adds
`Follow.createdAt DateTime @default(now())` (migration
`20260819160458_add_follow_created_at`) — the exact same fix
`Like.likedAt` and `SavedPost.savedAt` already applied for identical
reasons on the other two join-table models. **Flagged as a Decision Log
candidate**, per `CLAUDE.md`'s "the data model is a fixed spec" rule:
this is a real, if small, addition beyond Section 3's literal field
list, not something to add silently even though the precedent
(`Like`/`SavedPost`) is strong and this reading is very likely
uncontroversial.

### What's implemented

- **`POST /users/:id/follow`** — `@UseGuards(JwtAuthGuard)` only (point
  1). `HttpCode(200)`, same reasoning as `FeedController`'s like/save
  endpoints — a follow/unfollow toggle doesn't always "create a
  resource" on a given call, so 200-with-resulting-state fits better
  than a "Created" status that may not apply. `followerId` comes from
  `@CurrentUser()` (the verified JWT `sub`), `followeeId` is `:id`.
  - **Self-follow → 400** (`UsersService.followUser`, a business rule in
    the service layer — same "cross-field/business rules belong in the
    service" precedent `FeedService.createPost`'s
    clubPageId/banterRoomId check established), checked *before* any
    Prisma query, so a self-follow attempt never even queries whether
    the caller's own id exists.
  - **`:id` not referencing a real `User` → 404**
    (`UsersService.assertUserExists`, mirroring
    `FeedService.assertPostExists`'s exact shape/intent).
  - **Idempotent**: `Follow.@@unique([followerId, followeeId])` backs a
    Prisma `P2002` on a duplicate `create` being caught and treated as
    success, not a 500 — identical pattern to `FeedService.likePost`.
  - **Notification wiring**: the `Follow` row's creation and the
    recipient's `Notification` row (`type: 'follow'`, `payloadRefId:`
    the follower's `userId` — see point 3's table) are written inside
    one Prisma interactive transaction
    (`$transaction(async (tx) => ...)`), the identical pattern
    `FeedService.likePost`/`addComment` use and this PR extends to them
    (see below). Because both writes share one transaction, a duplicate
    (`P2002`) follow can never produce a duplicate `Notification` — if
    `tx.follow.create` throws, `tx.notification.create` never runs at
    all.

- **`DELETE /users/:id/follow`** — `@UseGuards(JwtAuthGuard)` only.
  - **Self-unfollow → 400**, same as self-follow — stated once in this
    PR's brief for both verbs together. There is no `Follow` row a
    self-follow rejection could ever have allowed to exist, so this is a
    consistency choice (explicit 400 rather than silently falling into
    the idempotent-no-op path below), not a behavior change.
  - **Idempotent**: no `Follow` row for the given pair is a 200 success,
    not a 404 (Prisma `P2025` on the `delete` caught and treated as
    success) — same symmetric-idempotency pattern as
    `FeedService.unlikePost`.
  - **No `Notification` on unfollow, ever** — removing an action isn't
    performing one (see point 3's table: only `followUser`,
    `likePost`, and `addComment` create `Notification` rows anywhere in
    this codebase; `unfollowUser`/`unlikePost` do not and should not).

- **`GET /users/:id/followers`, `GET /users/:id/following`** —
  `@UseGuards(JwtAuthGuard)` only, **deliberately not self-scoped**
  (point 2) — a real departure from the self-only default `GET
  /users/:id/saved-posts` chose under the same kind of spec silence, not
  an unexamined default carried over. `:id` not referencing a real
  `User` → 404. Paginated with the exact same keyset-cursor machinery
  every other list endpoint in this codebase uses
  (`FeedQueryDto`/`cursor.util.ts`, reused as-is — no second pagination
  scheme invented), ordered most-recently-followed-first (`createdAt
  desc, id desc` on `Follow`'s own row — see point 4 for why
  `createdAt` had to be added first). Each entry is the minimal
  `{id, displayName}` shape (`FOLLOW_USER_SELECT` in
  `users.service.ts`) — no `passwordHash`/`isMinor`/`email`/`phone`/
  `dateOfBirth`/`verificationStatus` ever leaves Postgres via either
  route. `FOLLOW_USER_SELECT` is a small, deliberate duplicate of
  `FeedService`'s own `POST_AUTHOR_SELECT` rather than a cross-module
  import — `POST_AUTHOR_SELECT` is a private, unexported `const` in
  `feed.service.ts`, not reasonably importable, so this PR's brief
  called for re-declaring the identical field list here instead of
  reaching for a broader `User` select or exporting a shared one across
  module boundaries for a two-field shape.
  - `getFollowers`: `Follow` rows where `followeeId = :id`, embedding
    `follower`.
  - `getFollowing`: `Follow` rows where `followerId = :id`, embedding
    `followee`.
  - Both share a `toFollowPage()` pagination-shaping helper in
    `UsersService` (trim the lookahead row, build `nextCursor` from the
    last kept row's `(createdAt, id)`) — unlike `FeedService`, which
    repeats this logic inline per caller (`getFeed`/`getComments`/
    `getSavedPosts` each have their own single caller), these two
    genuinely share the identical shape with only the embedded relation
    (`follower` vs `followee`) differing, so factoring it once here was
    worth the small indirection.

- **Notification wiring retrofitted into `FeedService.likePost` and
  `FeedService.addComment`** (`../feed/feed.service.ts`) — closing the
  gap PR #54 (Feed Service slice two) correctly left open: that PR built
  every `Like`/`Comment` row-creation path Section 4.3 asked for but was
  never briefed to also touch `Notification`. Both existing
  `$transaction(async (tx) => ...)` callbacks gained one additional
  `tx.notification.create(...)` call each, alongside (not replacing) the
  writes already there:
  - `likePost`: `type: 'like'`, `payloadRefId: postId`, recipient
    `userId: post.authorId` — skipped entirely when `post.authorId ===
    userId` (liking your own post; a real, tested path through this
    code). Because the create is inside the same transaction as
    `tx.like.create`, a duplicate/idempotent like (`P2002`) can never
    reach the notification create at all — the whole callback rolls
    back before it would run.
  - `addComment`: `type: 'comment'`, `payloadRefId: postId`, recipient
    `userId: post.authorId` — skipped when `post.authorId === authorId`
    (the comment's author param; commenting on your own post). Unlike
    `likePost`, there's no idempotency concern here — every
    `addComment` call is a genuinely new `Comment` row (see
    `feed/README.md`'s own note on this), so there's no
    duplicate-notification case analogous to like's `P2002` path.
  - `FeedService.assertPostExists`'s return type changed from `void` to
    `{ id, authorId }` to make the post's `authorId` available to both
    call sites above — a purely additive signature change.
    `unlikePost`/`savePost`/`unsavePost`/`getComments` call it exactly
    as before and simply don't use the returned value.
  - `unlikePost` does **not** get notification wiring — see point 3's
    table and the `DELETE /users/:id/follow` note above: removing an
    action isn't performing one.

### The shared auth guard (for B5/B7 and everything after)

`JwtAuthGuard` (`../auth/guards/jwt-auth.guard.ts`) is the shared "must
have a valid access token" guard, built in this PR because it's the first
PR that needs one. Any future protected route should reuse it rather than
reimplementing bearer-token parsing:

```ts
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '<path>/modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from '<path>/modules/auth/guards/current-user.decorator';
import { AccessTokenPayload } from '<path>/modules/auth/token/token.types';

@UseGuards(JwtAuthGuard)
@Get('some-protected-route')
handler(@CurrentUser() user: AccessTokenPayload) {
  // user is exactly { sub, role } — never isMinor/consentStatus/etc.
  // Re-query Prisma for anything safety-sensitive; see UsersService.
}
```

It's registered as a provider/export on `AuthFoundationModule` (not a new
standalone module), so any module needing it just adds
`AuthFoundationModule` to its own `imports`, the same way `UsersModule`
does — see `users.module.ts`.

### Verification

**Correction (`sprint-2/e2e-test-infrastructure`, superseding both
paragraphs below):** both the PR B6 and Sprint 2 entries here originally
claimed real, live verification against Postgres/Redis via
docker-compose. That claim was inaccurate for both. What was actually
built and run in each case was `users.controller.spec.ts` /
`users.controller.http.spec.ts` / `users.controller.follow.http.spec.ts`
(HTTP-layer routing/guard/DTO-validation coverage with `UsersService`
mocked — `{ provide: UsersService, useValue: <mocked object> }`, no real
Prisma or Postgres) and `users.service.spec.ts` (service-logic coverage
against a hand-built mock `PrismaService`). Confirm this directly by
reading any of those files. No test file, script, or committed artifact
in this codebase ever actually connected to a real Postgres instance
before `sprint-2/e2e-test-infrastructure`. The "Confirmed live, end to
end" bullets below, and the standalone PR B6 sentence above them, describe
a real database connection and real HTTP requests that, as far as this
codebase's own history can verify, never actually happened — treat them
as an inaccurate narrative, not evidence.
**What is newly, genuinely true as of `sprint-2/e2e-test-infrastructure`:**
`services/api/test/auth.e2e-spec.ts` now exercises `GET /users/:id`
(self-scoped) for real — real Postgres, real HTTP via `supertest`, real
`JwtAuthGuard`/`TokenService` chain, no mocked `PrismaService` anywhere in
its `TestingModule` — as the third leg of a real register → login →
fetch-profile round trip. None of the follow/follower/following
endpoints below have e2e coverage yet — that remains an intentionally
deferred backlog item per `test/README.md`'s guiding principle, not
something this PR closes.

<details>
<summary>Original (inaccurate) verification narrative — kept for history, not to be trusted as evidence</summary>

**PR B6**: Real HTTP verification (Postgres/Redis via docker-compose,
real Nest server, real users inserted directly via Prisma, tokens minted
with the `jsonwebtoken` library using the exact same payload shape and
secret `TokenService.signAccessToken` produces — no `/auth/register` or
`/auth/login` endpoint exists yet to get a real one from) is documented
in the PR report, not duplicated here.

**Sprint 2 (`sprint-2/follow-and-notifications`)**: real HTTP
verification against live Postgres/Redis via docker-compose, not
mocked — a real `dist/main.js` server, real `User`/`Post` rows inserted
via Prisma, tokens minted with `jsonwebtoken` against the real
`JWT_SECRET`. Confirmed live, end to end:

- Self-follow → 400; self-unfollow → 400; follow of a non-existent
  `:id` → 404.
- Follow → 200 `{following: true}`; duplicate follow → still 200,
  exactly one `Follow` row in Postgres (not two).
- Exactly one `follow`-type `Notification` row created on a follow,
  recipient (`Notification.userId`) confirmed equal to the *followee*,
  not the follower — read directly back from Postgres, not inferred
  from the HTTP response.
- `GET /users/:id/followers` at a page boundary (`limit=1` against two
  followers): returns exactly one item, a non-null `nextCursor`; the
  second page (using that cursor) returns the remaining item with
  `nextCursor: null`. No `passwordHash`/`isMinor` on any entry.
- `GET /users/:id/following` requested by a *different* user than `:id`
  succeeds (200, correct items) — confirms the not-self-scoped decision
  (point 2) is genuinely live, not just documented.
- Unfollow → 200 `{following: false}`; duplicate unfollow → still 200,
  zero `Follow` rows remaining (confirmed in Postgres, not just the HTTP
  status).
- Like/comment notification retrofit: liking a post creates exactly one
  `like`-type `Notification` with `userId` equal to the post's author
  (not the liker); a duplicate like still leaves exactly one
  `Notification` row (idempotent, matching the `Like` row's own
  idempotency); a user liking their own post creates zero `Notification`
  rows. Identical three checks repeated for commenting
  (`comment`-type `Notification`, recipient-correctness, and
  zero-rows-on-self-comment) — all read directly from Postgres via
  Prisma in the verification script, not inferred from HTTP status
  codes alone.

</details>

Also covered by committed Jest suites (unit + HTTP-layer):

- `users.service.spec.ts` — `followUser`/`unfollowUser` (self-follow/
  self-unfollow rejection, 404 on a non-existent followee, the P2002/
  P2025 idempotency paths, recipient-identity and
  duplicate-produces-one-notification assertions) and
  `getFollowers`/`getFollowing` (scope, ordering, pagination, cursor
  filter, field-minimization).
- `users.controller.spec.ts` / `users.controller.follow.http.spec.ts` —
  controller-level delegation (caller-as-follower, `:id`-as-followee,
  no self-scoping on the two `GET` routes) and HTTP-layer status-code/
  idempotency/error-propagation coverage, following
  `feed.controller.http.spec.ts`'s own precedent.
- `feed.service.spec.ts` — extended with dedicated `notification wiring`
  describe blocks under both `likePost / unlikePost` and `addComment /
  getComments`, covering recipient-identity, no-self-notification, and
  (for like only, matching the idempotency this method actually has)
  duplicate-produces-exactly-one-notification.

Full `services/api` suite after this PR: **30 suites / 304 tests, 0
failures** (up from 29/262 measured immediately before this branch's
changes).
