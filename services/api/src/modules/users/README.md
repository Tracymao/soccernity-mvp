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
  desc, sequence desc` on `Follow`'s own row — see point 4 for why
  `createdAt` had to be added first). **`fix/follow-pagination-tiebreaker`
  fixed the tiebreaker itself**: it used to be `id desc` (`Follow.id`, a
  random UUID with no relation to insertion order — the same class of
  bug `fix/feed-pagination-tiebreaker` already fixed for
  `Post`/`Comment`/`SavedPost`); `Follow.sequence` (see its own comment
  in `schema.prisma`) is now a genuinely monotonic counter, and
  `getFollowers`/`getFollowing` use `FeedSequenceCursor`/
  `encodeFeedSequenceCursor`/`decodeFeedSequenceCursor` from
  `feed/cursor.util.ts` (the same pair `feed.service.ts`'s own
  sequence-tiebroken call sites use) instead of the plain `FeedCursor`
  pair. Each entry is the minimal
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

---

## `sprint-2/followers-scope-fix` — followers/following restricted-pending gap

**Supersedes Decision Log #31, pending founder review.** This does not
silently override #31's own text in the Build Plan docx — that edit is
deliberately left for the founder to make by hand after reading this
section, per this task's own brief. This section is the "same depth"
writeup that brief asked for.

### The gap, confirmed directly against code before any fix was written

Decision Log #31 (documented above as this file's own point 2, "Are `GET
/users/:id/followers` and `GET /users/:id/following` self-scoped, or
public?") made both endpoints public — `JwtAuthGuard` only, no
self-scoping, no `GuardianConsentGuard`. Its reasoning was entirely
product-parity ("every mainstream social app exposes this") plus a check
of whether **Section 8.3 step 5's own enumerated restricted-pending
list** — "no public profile visibility, no DMs from unverified accounts,
no participation in Banter Rooms beyond read-only" — named
followers/following specifically. It doesn't.

What #31 never did: cross-check that conclusion against **Section 8.3's
broader principle**, not just its step-5 list — "Until consent is
recorded, the minor's account exists but is restricted," and the first
item on that same enumerated list is literally "no public profile
visibility." A user's followers/following list is part of their public
profile surface on every platform #31's own product-parity argument
cites — the same platforms that also gate a private/restricted account's
follower list behind that same privacy setting. #31 checked "is this
named," not "does this fall under the thing that IS named."

Confirmed directly by reading `users.controller.ts` and
`users.service.ts` on a fresh `main` before writing any fix: neither
`getFollowers`/`getFollowing` nor the `assertUserExists` check they both
called read `isMinor` or `consentStatus` anywhere, for either the caller
or the target `:id`. A restricted-pending minor's full social graph was
visible to any authenticated caller.

### Why `GuardianConsentGuard` itself isn't reusable here

Checked directly (`auth/guards/guardian-consent.guard.ts`) before
designing the fix, per this task's own instruction to look at existing
precedent first. `GuardianConsentGuard` reads `request.user` — the
**caller** — and decides what the caller may do (block a restricted-
pending minor from posting/commenting on `POST /posts`,
`POST /posts/:id/comments`, per Decision Log #21). It has never been used
to protect a *different* user's data from being viewed. This gap is the
opposite direction: `:id` in the URL (the **target**, who is very often
not the caller at all) needs to be checked, not `request.user`. A guard
can express "check the authenticated caller" cheaply
(`context.switchToHttp().getRequest().user`); it can't cleanly express
"check the user identified by this route's `:id` param" without becoming
route-shape-aware in a way no existing guard in this codebase is. So the
fix is a service-level check (`UsersService.assertFollowGraphVisible`),
not a new guard — consistent with this module's own existing precedent
that cross-field/business rules (self-follow, existence) belong in the
service layer, not the controller or a guard.

### Options considered

**(a) Hide followers/following entirely for a restricted-pending target
user (404, indistinguishable from non-existent), regardless of caller —
chosen, implemented.**
- Pro: matches Section 8.3's "no public profile visibility" item
  literally — a followers/following list is exactly that kind of
  visibility. Simplest to reason about and to prove correct (one check,
  one outcome, no caller-identity branching to get wrong). Fails safe:
  a bug in "is this the target's own request" logic can't leak data,
  because there's no such logic to have a bug in.
- Con: also hides the list from the minor's own client, e.g. a
  restricted-pending minor's own "who follows me" screen (if one is ever
  built) would 404 too, even though they're not viewing anyone else's
  data. No such screen exists in this codebase today (confirmed —
  `apps/web` has no followers/following UI at all yet), so this con is
  theoretical right now, not a regression against real shipped UI.

**(b) Same as (a), but only when the caller isn't the user themselves.**
- Pro: closes the gap for every third party while letting a
  restricted-pending minor still see their own social graph.
- Con: requires threading the caller's identity into
  `getFollowers`/`getFollowing` (currently `(userId, query)` only — no
  caller param at all), which both controller routes and the service
  signature would need to change to support. A restricted-pending
  minor's own client could then distinguish "I am restricted" (200) from
  "this other minor is restricted" (404) by comparing who's asking —
  not a data leak about a *third party*, but it does mean the
  restricted-pending state itself becomes observable through a side
  channel (self-request succeeds, others' requests to the same `:id`
  don't) that (a) doesn't have. Real added complexity for a UI surface
  that doesn't exist yet.

**(c) Leave endpoints public but exclude a restricted-pending user from
appearing *in other users'* followers/following lists (their own graph
edges hidden from others, not their own view of their own edges).**
- Pro: closest to "hide the edges, not the node" — a restricted-pending
  minor could still see who they follow/who follows them; only
  *appearing in someone else's list* is suppressed.
- Con: doesn't actually close Section 8.3's "no public profile
  visibility" concern — `GET /users/:id/followers` for the
  restricted-pending minor's own `:id` would still return 200 with a
  full (if filtered-from-others'-perspective) list, meaning the minor's
  own follow relationships remain directly queryable by anyone who
  simply asks `GET /users/:minor-id/following` — the exact endpoint this
  gap is about. This option only partially closes the gap (hides the
  minor from *appearing on other people's pages*) while leaving the
  minor's *own* page's data exposed, which is the more direct version of
  the same problem. Also the most implementation complexity of the
  three — filtering "does this row's embedded user need hiding" per-row
  in `toFollowPage`, on every single page fetched by every caller,
  forever, vs. one existence-time check.

**Decision: (a).** Per this task's own instruction and
`CLAUDE.md`'s non-negotiable stance, minors' data safety takes precedence
over product-parity reasoning when the two conflict — and unlike (b)/(c),
(a) has no path by which a restricted-pending minor's status or graph
data leaks to anyone, including through a side channel, at the cost of a
theoretical (not currently real) UX gap for the minor's own eventual
"my followers" screen. That screen, when built, should use
`GET /auth/guardian-consent/status` (already built, already
`JwtAuthGuard`-only-not-`GuardianConsentGuard`, exactly so a restricted
minor can check their own status) to decide whether to render a
"you'll be able to see this once your guardian confirms" state instead
of calling `GET /users/:id/followers` for their own id at all — a future
frontend concern, not something this backend-only PR needs to solve.

### What's implemented

`UsersService.assertFollowGraphVisible(userId)` — a new private method,
used by `getFollowers`/`getFollowing` only (NOT by `followUser`/
`unfollowUser`/`assertUserExists`, which are unchanged and out of this
PR's scope — see "Deliberately not touched" below). Mirrors
`GuardianConsentGuard`'s own `isMinor` → `Guardian.consentStatus` read
pattern and Section 5.7's fresh-read-from-Postgres discipline exactly,
but checks the **target** `:id`, not `request.user`:

- `:id` doesn't exist at all → 404 (unchanged from before).
- `:id` exists and `isMinor: false` → visible (unchanged from before;
  `Guardian` is never even queried in this case).
- `:id` exists, `isMinor: true`, no `Guardian` row, or
  `Guardian.consentStatus !== 'confirmed'` → 404, identical to
  non-existent — **the fix**.
- `:id` exists, `isMinor: true`, `Guardian.consentStatus === 'confirmed'`
  → visible, same as any non-minor (once consent is confirmed, this
  restriction no longer applies to that user at all).

This is a genuine 404, not a distinct 403/error code — deliberately
matching this codebase's established "hide via 404, never a signal that
confirms a restricted account exists" convention, the same reasoning
`GuardianConsentController`'s own "no Guardian row for this caller" 404
already uses.

### Deliberately not touched, flagged rather than silently expanded

- `followUser`/`unfollowUser`/`assertUserExists` are unchanged. Whether
  *following* or *being followed by* a restricted-pending minor should
  itself be blocked (as opposed to just hiding the resulting lists) is a
  different, broader question this task's brief didn't ask and this PR
  doesn't answer — a real follow-up Decision Log candidate, not resolved
  here.
- `GET /users/:id` / `PATCH /users/:id` (the self-only profile
  endpoints) are untouched — already self-scoped by `assertSelf()`, not
  part of this gap.
- No `Notification`, guard, or route/controller signature changes.
  `assertFollowGraphVisible` takes only `(userId: string)` — no caller
  param — by design, matching option (a)'s "regardless of caller"
  requirement structurally, not just by convention.

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

## Status update — inactive-account follow-graph visibility (`sprint-2/account-deactivation-backend`, Decision Log #221)

`assertFollowGraphVisible` now also 404s when the target `:id` is a
deactivated / `pending_deletion` account — the same treatment a
restricted-pending minor already gets, checked before the minor branch
since it applies regardless of age. Separately, `getFollowers` /
`getFollowing` filter their **list entries** to `accountStatus: 'active'`
(`follower: { is: {...} }` / `followee: { is: {...} }`), so a
follower/followee who has since deactivated drops out of an active
target's list. There is no follower/following count field, so nothing
can visibly drift from the filtered list. Reverses on reactivation.

## Status update — `GET /users/suggested` (`sprint-6/suggested-people-backend`, Decision Log #139)

```
GET /users/suggested?limit=
```

The Search & Trending "Suggested" follow panel's real backend — a
genuine addition beyond Section 4.2's literal seven-endpoint list,
flagged as a Decision Log candidate the same way `search`/`banter`/
`grassroots` each flagged their own additions. `JwtAuthGuard` required
(unlike `GET /search` / `GET /trending`, both genuinely public in the
`search` module) — this endpoint's whole job is "who is the *caller* not
already following," which has no meaning without a caller.

Declared as `@Get('suggested')` **before** `@Get(':id')` on
`UsersController` — Nest/Express match a controller's routes in
declaration order, so a `:id`-first ordering would let `:id`'s own
`assertSelf`/`ForbiddenException` swallow this route entirely (`:id`
would bind to the literal string `"suggested"`). Same static-route-
before-dynamic-`:id` convention `BanterController` already establishes
for `GET /banter-rooms/search` and `GET /banter-rooms/mine`.

### No follower/following count field — re-confirmed, not re-added

This module's own comment on `followUser` (above) already documents that
there is no follower/following count field anywhere in `schema.prisma`,
by deliberate choice — re-read before adding one for this endpoint, per
this task's own brief. Nothing here adds one; a "suggested" ranking that
needed one would be real, separate future work.

### Ranking — a v1 heuristic, not a real recommendation algorithm

Ordered by `createdAt desc` (most-recently-joined), `id desc` as a
stable tiebreaker. `schema.prisma`'s `User` model has **no**
`lastActiveAt` / `lastLoginAt` / `updatedAt` field anywhere — confirmed
by grep before writing this (the only `DateTime` columns on `User` are
`dateOfBirth`, `createdAt`, and `pendingDeletionAt`) — so
"most-recently-active" is not a signal this codebase can cheaply compute
today. `createdAt` is the only timestamp on `User` available for free,
so that's the heuristic this ships with. **Explicitly not a real
recommendation algorithm** (no mutual-follow graph traversal, no
shared-club/shared-interest scoring, no engagement weighting) — revisit
once a real activity signal exists (a dedicated `lastActiveAt` column,
or deriving one from the most recent `Post`/`Like`/`Comment` row — both
real future work, not attempted here).

### Exclusion rules — reused, not reinvented

`getSuggestedUsers` re-declares `search.service.ts`'s own
`VISIBLE_SEARCH_USER_FILTER` inline (same "small duplicate over
cross-module import" convention `search/README.md`'s "Exclusion rules"
section documents — neither constant is exported from its own module):

- **`accountStatus: 'active'` only** — a deactivated, `pending_deletion`,
  `suspended`, or anonymized (`'deleted'`) account is never suggested.
- **Restricted-pending minors excluded** — a minor with no *confirmed*
  guardian consent is invisible here, the same "hide via absence, never
  a distinct signal" treatment `assertFollowGraphVisible` above and
  `search.service.ts`'s own filter already give this exact case.
- **The caller themselves, excluded** (`id: { not: callerId }`).
- **Every user the caller already follows, excluded**
  (`followedBy: { none: { followerId: callerId } }` — `followedBy` is
  `User`'s own back-relation to `Follow` as the `followee` side, so this
  reads "no `Follow` row exists where the candidate is the followee and
  the caller is the follower").

**No user-to-user "block" feature exists anywhere in this schema** — the
same grep `search/README.md`'s "Exclusion rules" section already
confirms (the only "block"-adjacent surfaces are the under-16 messaging
restriction, the adult-cannot-message-a-minor rule, and admin-imposed
suspension, none of which is a per-pair block a list filter could
apply). Nothing further to exclude on that front — those safeguarding
rules are enforced at the point of *action* (starting a conversation),
not at the point of *discovery*, the same split this module's own
`getFollowers`/`getFollowing` already draw.

### Response shape — no pagination

```json
{ "items": [ { "id": "...", "displayName": "..." }, ... ] }
```

Same `{id, displayName}`-only shape as `FOLLOW_USER_SELECT` (reused
as-is — no `passwordHash`, `email`, `isMinor`, or `dateOfBirth` ever
leaves Postgres via this select). `limit` alone, no `cursor` — the same
deliberate "plain top-N cut, not a browsable/paginated catalog"
precedent `GET /trending` already sets in the `search` module (default
10, max 50, mirroring `TRENDING_DEFAULT_LIMIT`/`TRENDING_MAX_LIMIT`
exactly — see `suggested-users.constants.ts`).

### Verification

No e2e spec was added, same conclusion `search/README.md`'s own
"Trending topics" section and `blog`/`admin-content`/`community-groups`'s
READMEs already reached for their own analogous modules: this is a
plain `findMany` against `User`'s already-existing columns and FKs (the
`followedBy` relation and the `guardian` relation both already exist and
are already read elsewhere), no raw SQL, no transaction, no novel Prisma
relation or constraint — none of `test/README.md`'s own three e2e-add
triggers apply.


## Status update -- uniform write block and the placeholder name (B-026, B-027, B-118; 2026-10-17)

This **supersedes** the guard reasoning earlier in this file and in
`feed/README.md` / `clubs/README.md` that kept follow, like, save, club join and
`PATCH /users/:id` at `JwtAuthGuard` only. Decision Log #370 widens the rule to a
uniform restricted-pending write block, so those routes now also carry
`GuardianConsentGuard` (and, for the creating forms, `EmailVerifiedGuard` --
#403 item 15). Reads, the follower/following lists and `GET /users/:id` stay open
so a restricted-pending minor can read their own state. The complete route table is
in `docs/backend-w3-gates-report.md` and is pinned by
`src/write-route-guards.spec.ts`.

`publicName` (every payload that shows a user to *other* users) is now the username
or the placeholder **`Soccernity member`** -- the displayName fallback from #364 is
gone (`public-name.util.ts`). People search matches the username only.
`GET /users/:id` additionally returns `profileComplete`, `guardianConsentStatus`
and `nextStep` (see `auth/README.md`). Roster and people-search cursors and
ordering still use `displayName` (B-034, open).


## backend/w5-profile-block (B-035, B-038, B-081, B-082 backend leg)

Profile content columns on `User` (migration `20261020151920_add_profile_fields_avatar_and_block`, nullable, CHECK-constrained):
`bio` (<= 160), `preferredClub` (<= 80, free text, owner-only), `profileCountry` (ISO alpha-2, upper-case), and the avatar
trio `avatarUrl` / `avatarKey` / `avatarStatus` (all NULL or all set).

- **`PATCH /users/:id`** also accepts `bio`, `preferredClub`, `profileCountry` (`null` or blank clears; the username still cannot
  be cleared). Bio and preferred club go through the sensitive-content screen: a flagged value is a coded
  `422 sensitive_content_rephrase_required` ("please rephrase", #394 A3), field names and categories only, nothing saved, no
  override, no Report. The profile country must be a real ISO 3166-1 code (`ZZ` etc. are refused) and is **never** the safeguarding
  country: `declaredCountry` / `derivedCountry` are neither read nor written by any profile endpoint.
- **`GET /users/:id`** (own) returns the four content fields and `avatar: { url, status } | null` (never the storage key).
- **`GET /users/:id/public-profile`** (other users) now returns `bio`, `country` (profile country, `null` unless the user entered
  one -- a minor's country is visible only if the minor entered it), `avatarUrl` (**approved avatars only**), `isFollowing` and
  `viewerHasBlocked`, plus the existing `guardianContact`. It does **not** return the preferred club. A user the target has
  blocked gets the same 404 as a non-existent profile.
- **`POST` / `DELETE /users/:id/avatar`** (`user-avatar.*`, self only, multipart `file`, JPEG/PNG/WebP, 5 MB, magic bytes checked):
  stored through the same `StorageService` as `POST /admin/media/upload`, so with no object store configured it is the same
  `503` and nothing is written. An upload is **`pending`** and invisible to everyone but its owner until something sets
  `approved` (the automatic image check, B-036, is not built). It does not create a `MediaAsset` row (that table is the admin
  library). Bytes are stored as uploaded: no EXIF stripping yet (B-036).
- Block: see `../block/README.md`. Follow, follower/following lists and suggested users honour it.
- Account anonymization clears all of the above and deletes the avatar object (best effort) and every Block row.

## backend/w8-image-rejection-reason (B-214, Decision Log #412 item 2, #398 D2)

- **Storage.** Nullable `User.avatarRejectionReason` and `User.coverRejectionReason` (migration `20261025150000_add_profile_image_rejection_reason`, additive, rollback in its header). CHECK: a reason exists only while that image's status is `'rejected'` and is never blank, so a new upload, a delete and anonymization (which move the status away from `'rejected'`) all clear it. `'rejected'` was already inside the existing status CHECK.
- **`UserImageReviewService.rejectProfileImage(userId, 'avatar' | 'cover', reason)`** (`user-image-review.service.ts`, exported from `UsersModule`). One transaction: the image goes to `'rejected'` (from `'pending'` or `'approved'`), the trimmed reason is stored, and ONE `Notification` of type `profile_image_rejected` is written (`payloadRefId` = the kind; the reason is not copied). The status test is in the WHERE of the write, so two simultaneous rejections give one winner and one notification; the loser is a 409. No such image is a 404; a missing, blank or over-300-character reason is a 400 before any database work. **No HTTP route calls it yet**: the review queue and admin reject screen (B-037, B-012) will. In-app only: no email, no push.
- **Owner-only exposure.** The reason is returned as `avatar.rejectionReason` / `cover.rejectionReason` on the owner's own `GET /users/:id` (null unless the image is rejected). The avatar and cover upload responses carry `rejectionReason: null` (an upload clears it). `getPublicProfile` does not select either column, and `GET /users/:id` for another user is a 403.
- **Adopted defaults, veto-able:** maximum 300 characters (application rule, not frozen in the database); an already-rejected image is a 409, not an overwrite; the old notification stays after a re-upload.

## backend/w6-username-cover-block (B-181, B-196)

- **Username allow-list (B-181, Decision Log #410 item 2, #411 item 9).** A handle skips the guarded `nazi` CONTAINS rule when, **as typed** and compared case-insensitively, it is `nazif`, `nazifa` or `nazifah`, or one of them followed only by digits with at most one underscore between (`^(nazif|nazifa|nazifah)_?[0-9]+$`, `isAllowedNameHandle` in `username-rules.util.ts`). **No underscore is removed first**, so `naz_ifa`, `_nazif_`, `nazi_f` and `nazif_a` are refused (W3f accepted the first two), and `nazifa2`, `nazif_10` are accepted (W3f refused them). Still refused: `nazifan`, `nazifan_10`, `nazif_an`, `xnazifa`, `nazif__10`, `10nazif`. The allowance exempts that one rule only; `nazifhitler`, `nazif_porn` and a phone-like digit run are still refused by the other rules. Not decided: a limit on the number of digits; digits before the name (refused).
- **Cover photo (B-196, #411 item 4).** `User.coverUrl` / `coverKey` / `coverStatus` (migration `20261024120000_add_user_cover_photo`, additive; all NULL or all set, status CHECK; rollback in its header). `POST` / `DELETE /users/:id/cover` (`user-cover.*`), the avatar pipeline with the same rules: same `StorageService` (so **the same 503 with no object store**, nothing written, proven by unit and e2e parity tests against the avatar and the admin upload), same file rules (`profile-image.util.ts`, shared with the avatar: JPEG/PNG/WebP, 5 MB, magic bytes), same guards (Consent on both, EmailVerified on the creating form, not ProfileComplete), same **pending-and-invisible** rule (only `approved` is served to other users; nothing sets it until B-036/B-037), same object removal on replace / delete / anonymization (`covers/<userId>/<uuid>.<ext>`). `GET /users/:id` returns `cover: { url, status } | null`; `GET /users/:id/public-profile` returns `coverUrl` (approved only, so null today). Not decided: cover dimensions / aspect ratio; EXIF is not stripped (B-205).


## backend/b036-avatar-cover-check (B-036, Decision Log #411 item 1, #394 A2, #468)

**Where a profile picture lives (a safeguarding fix, found in step 1 of this task).** Before this change a new avatar or cover was stored at `avatars/<userId>/<uuid>` or `covers/<userId>/<uuid>` in the SAME bucket that `S3_PUBLIC_BASE_URL` serves, so a `pending` or `rejected` picture of a child was readable by anyone holding its address, whatever the database said. The row's status only hid it from the API. It now follows the post-media design (B-257): a new upload is written to the **private prefix** `private-profile/<userId>/<uuid>.<ext>`, and is copied to the **public prefix** `profile-media/<userId>/<uuid>.<ext>` only when approved. `User.avatarKey` / `coverKey` always hold the file's **current** key (the prefix says which state), `avatarUrl` / `coverUrl` hold its **future public URL** (built with `publicUrlFor`, no network call). The owner sees a pending or rejected picture through a **5-minute signed link** to the private file (`ProfileImageViewService`, the same window as the post-media view link), made fresh on every read and never stored; the response carries `url: null` if a link cannot be made. `GET /users/:id/public-profile` serves a picture only while it is `approved` **and** its key is in `profile-media/`.

**Launch-gate consequence (B-265).** The public address must now serve `post-media/` **and** `profile-media/` and nothing else (or the private files must live in a separate bucket). `docs/deployment.md` carries the wording. The two profile prefixes deliberately do not start with `post-media` or `private-media`: the post-media stray sweep lists those and deletes any object without a `PostMedia` row. Old keys (`avatars/...`, `covers/...`, written before this change) are still checked and published by the same code; nothing migrates them, because the platform is not live.

**The check (`profile-image-check.service.ts`).** A per-minute sweep, `ProfileImageCheckSweepService`, takes every avatar and cover whose status is `pending` and, for each: reads the stored file (`MediaCheckService.checkStoredImage`, the SAME download / shrink / Rekognition / thresholds as a post image, stricter for a minor; the pieces are reused, not copied) and decides:

| Result | What happens |
|---|---|
| clearly fine | copy the file to the public key, verify the copy (size), and only then write `approved` + the public key + the public URL, **only while the row still points at the key that was checked** (a re-upload cannot be approved by the old file's result; the stale public copy is deleted). The private original is deleted afterwards. |
| reject category at/above the reject threshold | `UserImageReviewService.rejectProfileImage(userId, kind, "This file didn't meet our rules", checkedKey)`: status `rejected`, the generic reason, one `profile_image_rejected` notification, and the guardian notice for a minor (all already built, B-214/B-279). The new optional `expectedKey` makes the write conditional on the same key (a replaced picture is a 404 and is skipped). The file stays private. |
| in between | stays `pending`; recorded as `state = 'review'` for the moderator queue (**B-037, not built**); never re-checked. |
| the check throws | retried with the post-media back-off (60 s, doubling, max 1 h); after `MEDIA_CHECK_MAX_ATTEMPTS` (5) failures it is left `pending` as `gave_up`. A failed copy is a failure (**fail closed**: nothing is approved and nothing is left public). |

**Nothing is approved by default.** If Rekognition is not configured (`REKOGNITION_ACCESS_KEY_ID` / `REKOGNITION_SECRET_ACCESS_KEY`) the sweep does not run at all: no query, no write, every picture stays `pending`. The thresholds, attempt limit and batch size are the existing post-media settings; **no new environment variable and no new figure** were added.

**New table, flagged (`ProfileImageCheck`, migration `20261112090000_add_profile_image_check`, additive).** The retry state, kept to the fewest columns: primary key `(userId, kind)`, `objectKey` (which file the row describes; a row for an older key is stale and is overwritten), `state` (`retry` | `review` | `gave_up`), `attempts`, `nextAttemptAt` (the claim writes `now + lease` into it, so there is no separate lease column; null once settled). No foreign key (bookkeeping, no image, no labels). Deleted when the image is approved or rejected, by the sweep's own cleanup when the image is no longer the pending one, and at anonymisation. A genuine addition beyond Section 3's entity list: a Decision Log candidate, not transcribed here.

**Not built / still open.** The moderator queue and the admin reject/approve routes (B-037): a moderator **reject of an already-approved picture must also move the file back to the private prefix** (it would otherwise stay fetchable at its old public address; noted on `rejectProfileImage`). No notification on approval (not asked for). The CSAM / statutory-reporting path (B-206, counsel). The AWS account and keys (founder step B-193). Orphaned objects under the two new prefixes (a failed best-effort delete) are logged, not swept.

## Read receipts (build-register B-061; Decision Log #472, founder decision 2026-11-08)

`GET` and `PATCH /users/me/settings` now carry a third setting, `readReceipts: boolean` (alongside `dmPermission` and
`mediaSensitive`; same route, same `JwtAuthGuard`-only rule, self-scoped by the token subject, no id anywhere).

* **Storage:** `User.readReceipts Boolean?` (migration `20261122090000_user_read_receipts`, additive). **NULL means "use
  the age default"**, decided at READ time from the stored `isMinor` flag: ON for an adult account, OFF for an under-18
  account (DEFAULT, founder-veto-able). An account that turns 18 therefore changes default with no backfill. The GET
  returns the EFFECTIVE boolean (`effectiveReadReceipts` in `user-settings.constants.ts`), never the raw nullable
  column. The PATCH stores an explicit `true` or `false`; there is no way to set it back to NULL from the API (an
  explicit `null` is a 400, like the other two settings).
* **Anonymisation** (and held-account minimisation) resets it to NULL.
* **What it controls** is only what is disclosed about `Message.readAt`, never whether it is recorded. The disclosure
  rule (both settings on, same age class, read, sender only) is documented in the messaging README, "Read receipts".
* The purge reference list is derived from `Prisma.dmmf` for relations to `User`; a plain column on `User` needs no entry
  (confirmed: `anonymized-row-purge.references.spec.ts` unchanged and passing).


## Public profile toggle (build-register B-060; founder decision 2026-11-08)

`User.isProfilePublic` (default `true`, migration `20261121090000_user_profile_public`) is the "Public profile"
switch on Settings > Privacy. When it is OFF the profile is **followers-only**. Nothing changes for anyone until
they turn it off. The one rule lives in `profile-visibility.util.ts` (`profileVisibleTo`, `postProfileVisibleTo`,
`effectiveProfilePublic`), the same shape as `block/block.util.ts`: a profile is VISIBLE to a viewer when the owner
left it public, **or the owner is under 18**, or the viewer is the owner, or the viewer follows the owner. The
column is read **only together with `isMinor`**, so an under-18 account is always effectively public (the existing
safeguarding rules decide, unchanged), including an adult who turned it off and is later reclassified as a minor.
Only an explicit `false` counts as private. Read fresh from Postgres on every request; no cache sits in front of
any of these reads (checked: none of feed, search, clubs, users, banter or leaderboard caches a response).

**Known limit, stated plainly:** following is instant and needs no approval, so this limits casual browsing,
search and links, not a determined viewer. Follow requests or approval would be a separate decision.

### Settings

`GET`/`PATCH /users/me/settings` gain `isProfilePublic` (the EFFECTIVE value on read). An **under-18 account
cannot set it**: any `isProfilePublic` in a PATCH is a `403` with `code: "profile_visibility_not_available"` (a fresh
read of `isMinor`, the whole request refused, nothing written). No notification, email or audit entry is sent
when it changes. An anonymised account is reset to `true` in the same transaction, so its surviving posts
("[deleted user]") stay readable.

### What a stranger gets: the minimal card

`GET /users/:id/public-profile` gains `isPrivate` and `viewerFollows` (the same value as the existing
`isFollowing`, kept alongside it). `isPrivate` is true ONLY when the viewer is not allowed to see the content. Then
the card carries `id`, `publicName`, `avatarUrl` (under the existing image-visibility rules), `isPrivate: true`,
`viewerFollows`/`isFollowing` and `viewerHasBlocked`; `bio`, `country`, `coverUrl` and `guardianContact` are `null`.
No count exists in this payload, so "counts absent" holds by construction (there is no follower, following or post
count on any user read today). Block, restricted-pending and non-active 404s are decided first, exactly as before.

### Inventory: every route that can return another person's profile, posts or activity

| Route | Decision | Why |
|---|---|---|
| `GET /users/:id` | not applicable | self only (403 for anyone else) |
| `GET /users/:id/public-profile` | **minimal card** to a non-follower | the profile read |
| `GET /users/:id/followers`, `/following` | **404** to a non-follower (the same 404 as a missing user) | "no follower or following lists"; the existing hidden-graph convention |
| `GET /users/suggested` | kept | identity only (public name) |
| `GET /posts/feed` | filter applied (no-op in practice) | scope is already own plus followed |
| `GET /clubs/:id/feed` | **hidden** from a non-follower | club feeds are listed as hidden |
| `GET /posts/:id` | **404** to a non-follower | same 404 as a missing post |
| `GET /posts/:id/comments` | **404** (post gate) | a hidden post has no readable thread |
| `POST /posts/:id/like`, `/comments`, `/save`, `/view`, `/view-heartbeat` | **404** to a non-follower, nothing written | they read the post first |
| `DELETE` like or save (undo forms) | kept open | own actions, they reveal nothing |
| `GET /users/:id/saved-posts` | a hidden post is **dropped** from the saver's page | self only (403 otherwise); never the text. DEFAULT: dropped, not a placeholder, because the web contract needs a post on every entry and blocked or deactivated authors are already dropped the same way |
| `GET /search` (posts) | **hidden**, anonymous searchers included | post search is a post read |
| `GET /search` (people, clubs) | kept | identity only |
| `GET /trending` | kept | aggregate hashtag counts, not attributable to a person |
| `GET /banter-rooms/:id/posts`, Banter room posts everywhere | **NOT hidden** | a room is an open public forum (Decision Log #403 item 16, B-117). Applied as a post-level exemption, so likes and comments on room posts keep working for non-followers. DEFAULT, founder-veto-able |
| Contest entries, `GET /contest/*` (entries, pinned entry, carousel) | **NOT hidden** | entering a contest is a public act. Post-level exemption. DEFAULT, founder-veto-able |
| `POST /media/:id/report` | **404** when the file is on a hidden post | the reporter cannot see it |
| `GET /clubs/:id/members`, community-group members, leaderboard, banter room lists | kept | identity (public name) and public ranking, no profile content |
| Comments written by a private owner on someone else's post | kept | identity necessarily appears. **Known gap** |
| `GET /conversations*`, `/notifications*` | not applicable | DMs and notifications show the public name only; the post text in a notification is the recipient's own post |
| `GET /users/me/data-export*` | not applicable | the person's own data |
| `/admin/*` (staff) | unchanged, always everything | separate admin auth domain; none of these routes goes through the filter |

Post-level reads share one clause: `visibleToViewer` (feed) now ANDs in `postProfileVisibleTo`, `assertPostExists`
(anonymous branch), `searchPosts` and the media-report lookup add it directly. Saved posts, the single post, the
club feed, view recording and the heartbeat all go through `visibleToViewer`.

### Defaults I adopted (founder-veto-able)

- An under-18 account is effectively public and cannot set the toggle (403), and a viewer who is under 18 is a stranger like any other.
- Banter Room posts and Contest entries are exempt from the filter; comments by a private owner stay visible.
- A hidden saved post is dropped from the saver's list (no "unavailable" placeholder).
- The follower and following lists of a private owner are a 404 to a non-follower, not an empty list.
- `viewerFollows` is added next to the existing `isFollowing` (identical value).
- Migration `20261121090000` sorts before the already-merged `20261122090000`; a database that already applied the
  later one applies this one on `migrate deploy` (it is a plain additive column). `migrate dev` may report it as out of order.

## Uploads switch (B-306; Decision Log #501)

`POST /users/:id/avatar` and `POST /users/:id/cover` carry `MediaUploadsEnabledGuard` first in their guard list. With
`MEDIA_UPLOADS_ENABLED` off (production default, see `post-media/README.md` "Uploads switch") they answer
`403 { code: 'media_uploads_disabled' }` before the multipart body is parsed, so nothing is re-encoded, stored or written.
`DELETE /users/:id/avatar` and `/cover` are not gated: a person can still remove a picture they already hold.
