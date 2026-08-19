# feed module

Build target: Sprint 2 — Section 4.3 of the MVP Build Plan.

## Status

**Slice one (`POST /posts` + `GET /posts/feed`) — done, merged to `main`
(PR #53).** **Slice two (the remaining seven endpoints) — done, this
PR.**

Section 4.3 lists nine endpoints total:

```
POST   /posts                       — slice one
GET    /posts/feed                  — slice one
GET    /posts/:id                   — slice two
POST   /posts/:id/like               — slice two
DELETE /posts/:id/like               — slice two
POST   /posts/:id/comments           — slice two
GET    /posts/:id/comments           — slice two
POST   /posts/:id/save               — slice two
DELETE /posts/:id/save               — slice two
GET    /users/:id/saved-posts        — slice two
```

All nine endpoints in Section 4.3 now exist. Nothing in Section 4.4
(Club & Banter Service — `GET /clubs`, `GET /clubs/:id`,
`POST /clubs/:id/join`, all of `/banter-rooms*`) is built by either
slice — see "Deliberately out of scope" below.

---

## Slice one — `POST /posts` + `GET /posts/feed`

This section is preserved from PR #53 as-is; slice two did not modify
`createPost()` or `getFeed()`.

### Spec discrepancy flagged, not silently resolved

**1. Is `POST /posts` gated by `GuardianConsentGuard`?**

Build Plan Section 8.3 step 5 enumerates the restricted-pending state's
three behaviors verbatim: "no public profile visibility, no DMs from
unverified accounts, no participation in Banter Rooms beyond
read-only." Read literally, general feed post creation isn't one of
the three — `auth/README.md`'s own PR B7 status update reached the same
literal reading and left the guard unattached anywhere, for exactly
this reason.

However, Build Plan Section 5.7 (the auth implementation spec) says,
independently and more broadly: *"Re-check current status against the
database on every safety-sensitive action (**posting**, messaging,
joining a Banter Room or Community Group), not just on login."*
Section 5.7 names "posting" explicitly as a safety-sensitive action
requiring this re-check — it isn't limited to Banter Room posting.

This PR follows Section 5.7's explicit instruction: `POST /posts` is
gated by `@UseGuards(JwtAuthGuard, GuardianConsentGuard)`, the same
ordering convention documented on `guardian-consent.guard.ts`. This is
a judgment call, not a mechanical read of a single unambiguous
sentence — **flagged as a Decision Log candidate**: should Section 8.3
step 5's enumerated list be read as exhaustive (in which case general
feed posting should NOT be gated, and this PR over-applies the guard),
or should Section 5.7's broader "posting" language control (in which
case this PR's reading is correct, and step 5's list was simply
non-exhaustive)? Whoever resolves Decision Log #12 (DM restriction
scope, Build Plan Section 9) or otherwise revisits Section 8.3's exact
wording should settle this explicitly rather than leave two sections
in tension. **Slice two inherits this exact same unresolved question
and extends it to comments — see below.**

`GET /posts/feed` is deliberately **not** gated by `GuardianConsentGuard`
— only `JwtAuthGuard`. Reading a feed isn't the safety-sensitive action
posting is; nothing in Section 8.3 step 5 or Section 5.7's
safety-sensitive-action list says reading one's own feed should be
blocked, and blocking it would work against "the account exists but is
restricted" (Section 8.3 step 5's own framing — restricted, not
disabled).

**2. What is `GET /posts/feed`'s scope, beyond "paginated"?**

Section 4.3 lists the endpoint itself but does not define what posts it
should return. This PR's judgment call: the caller's own posts, plus
posts by any user the caller follows (`Follow` model — `followerId` is
the caller, `followeeId` is who they follow). This is the only social
graph mechanism that exists at this point in the build (Sprint 2's own
scope per `CLAUDE.md`: "Follow" is explicitly listed alongside Feed
Service). **Flagged, not assumed complete**: club-page and Banter-Room
membership are deliberately NOT part of this scope query — a post
tagged with a `clubPageId`/`banterRoomId` from a club/room the caller
belongs to, written by someone the caller doesn't follow, will **not**
currently appear in that caller's feed. Whether club/room membership
should also pull posts into a member's feed (independent of following
the specific author) is an open product question Section 4.3 doesn't
answer either way — a Decision Log candidate for whoever builds
`ClubPage`/`BanterRoom` membership flows (Section 4.4, Sprint 3+), not
resolved unilaterally here.

### What's implemented

- **`POST /posts`** — `@UseGuards(JwtAuthGuard, GuardianConsentGuard)`.
  `authorId` comes from `@CurrentUser()` (the verified JWT `sub`
  claim), never from the request body — `CreatePostDto` has no
  `authorId` field, and the global `ValidationPipe`
  (`forbidNonWhitelisted: true`) rejects a request that tries to smuggle
  one in.
  - `contentText` (string, required, 1–3000 chars — see
    `dto/create-post.dto.ts` for why 3000 was chosen).
  - `mediaUrls` (optional array of URL strings, max 10 items).
  - `clubPageId` / `banterRoomId` (both optional strings). Setting
    **both** on the same post is rejected with a 400
    (`FeedService.createPost`'s cross-field check, following the same
    "cross-field rules belong in the service, not a DTO decorator"
    precedent `RegistrationService` established for
    "guardian required when isMinor"). A well-formed but
    non-existent `clubPageId`/`banterRoomId` (valid string, no matching
    row) is also rejected with a 400 — the underlying Postgres
    foreign-key violation (Prisma error code `P2003`) is caught and
    mapped, not left to surface as an unhandled 500.
  - Returns the created post with a minimal embedded `author` (`id`,
    `displayName` only — see below).

- **`GET /posts/feed`** — `@UseGuards(JwtAuthGuard)` only. Cursor-based
  (keyset) pagination, not offset — see `dto/feed-query.dto.ts` and
  `cursor.util.ts` for the full reasoning (an offset degrades under
  concurrent inserts, which a feed has by definition). Query params:
  - `cursor` (optional, opaque — base64 of an internal
    `{ createdAt, id }` envelope; a client should treat it as a black
    box, not construct one).
  - `limit` (optional, integer, 1–50; default 20 if omitted). Both
    numbers are deliberate, documented choices — Section 5.5 requires
    pagination but doesn't specify page sizes.
  - Ordered most-recent-first: `createdAt desc, id desc` (the `id` is
    a tiebreaker for rows sharing an identical `createdAt` timestamp,
    not a meaningful secondary sort on its own).
  - Response shape: `{ items: Post[], nextCursor: string | null }`.
  - Does not select `comments`, `likes`, or `savedBy` relations on the
    list payload — Section 5.5's "keep list payloads lean" — only the
    already-denormalized `likeCount`/`commentCount` ints.

---

## Slice two — the remaining seven endpoints

Section 4.3's endpoint list has more surface area than slice one, and
so does this section — every guard/scope judgment call below is argued
at the same depth as slice one's two, not thinner.

### Spec discrepancies flagged, not silently resolved

**3. Is liking "posting" in Section 5.7's sense?**

No. `POST`/`DELETE /posts/:id/like` are `@UseGuards(JwtAuthGuard)` only
— deliberately not `GuardianConsentGuard`. Section 5.7's
safety-sensitive-action list is "posting, messaging, joining a Banter
Room or Community Group." A like produces no content of its own —
nothing new is visible to any other user as a result of it beyond a
number changing — so it doesn't fit "posting" the way `POST /posts`
itself does (per point 1 above) or the way commenting does (point 4,
below). This reading isn't inherited automatically from slice one's own
`POST /posts` conclusion; it's argued independently here because liking
and posting are different enough actions that the same conclusion
shouldn't be assumed to carry over silently. Not flagged as a Decision
Log candidate — this one reads unambiguous enough under Section 5.7's
own language that there's no real tension to resolve, unlike points 1
and 4.

**4. Is commenting "posting" in Section 5.7's sense?**

Yes — this one lands the opposite way from liking, and is flagged as a
Decision Log candidate, same as point 1. `POST /posts/:id/comments` is
`@UseGuards(JwtAuthGuard, GuardianConsentGuard)`. Unlike a like, a
comment is genuine original user-generated content, visible to every
other reader of the post's comment thread — in that respect it's
materially closer to `POST /posts` itself than to liking or saving. The
same tension from point 1 applies here with the same shape: Section
8.3 step 5's enumerated restricted-pending list doesn't literally say
"commenting," but Section 5.7's broader "posting" language is read here
as covering it, for the same reason slice one read it as covering feed
posts. **Flagged as the same open Decision Log candidate as point 1** —
whoever resolves whether Section 8.3 step 5's list is exhaustive should
resolve `POST /posts`, `POST /posts/:id/comments`, and any future
content-creation endpoint (Banter Room posts, Sprint 3) together, not
piecemeal.

`GET /posts/:id/comments` is `@UseGuards(JwtAuthGuard)` only — reading,
same category as `GET /posts/feed` and `GET /posts/:id`.

**5. Is saving "posting" in Section 5.7's sense?**

No. `POST`/`DELETE /posts/:id/save` are `@UseGuards(JwtAuthGuard)` only.
A save is a private bookmarking action — it creates no content visible
to anyone but the person who saved it (there's no `GET
/posts/:id/saved-by` or equivalent, and none is in Section 4.3). It's
even further from "posting" than liking is, since a like at least
surfaces as a visible count change on the post itself; a save doesn't
surface anywhere except the saver's own `GET /users/:id/saved-posts`.

**6. What is `GET /posts/:id`'s field shape?**

Reuses `POST_SELECT` unmodified — the same fields `GET /posts/feed`
returns for each list item. No divergence was needed: nothing about
viewing a single post calls for more or fewer fields than viewing it in
a list. A non-existent `:id` is a 404 (`FeedService.getPostById`
throws `NotFoundException`), never a silent `null` 200.

**7. What is `GET /posts/:id/comments`'s ordering?**

Section 4.3 doesn't specify. This PR's judgment call: oldest-first
(`createdAt asc, id asc`), the opposite direction from the feed's own
most-recent-first. A comment thread reads naturally top-to-bottom in
the order it was written — the same convention this codebase's own
Figma-derived screens already follow, and the same convention
essentially every comment UI (this platform's genuine competitors
included) uses. Not flagged as a Decision Log candidate — this is a UX
convention strong enough that there's no real ambiguity to resolve, but
it IS a genuine judgment call (Section 4.3 is silent) and is documented
as one rather than assumed.

**8. Does `GET /users/:id/saved-posts` require `:id` to equal the
caller's own id, or are saved posts publicly viewable?**

Section 4.3 doesn't say either way. This PR defaults to the
**conservative reading — self-only, 403 on mismatch** — the identical
precedent `users/README.md` established for `GET`/`PATCH /users/:id`
(`UsersController.assertSelf()`; `SavedPostsController.assertSelf()`
here is a deliberate, small, same-shape duplicate — see
`saved-posts.controller.ts`'s own comment on why it isn't extracted
into a shared helper). **Flagged as a Decision Log candidate**: there's
a real product argument on both sides — "saved" often implies a private
bookmark list, but a public "reading list" a user curates and shares
isn't an unreasonable feature either. Whoever revisits this should
decide deliberately, not have the conservative default calcify into the
permanent behavior by omission.

### What's implemented

- **`GET /posts/:id`** — `@UseGuards(JwtAuthGuard)` only. See point 6.
  404 (not a silent null) for a non-existent id.

- **`POST /posts/:id/like`** — `@UseGuards(JwtAuthGuard)` only (point
  3). `HttpCode(200)`, not Nest's POST default of 201 — a like/unlike
  toggle doesn't always "create a resource" on a given call (see
  idempotency below), so 200-with-resulting-state fits better than
  "Created." Response: `{ postId, liked: true, likeCount: number }`.
  - **Idempotent**: liking an already-liked post is a 200 success, not
    a 500 or a 409. `Like.@@unique([userId, postId])` backs this —
    Postgres raises a unique-constraint violation (Prisma `P2002`) on
    the duplicate `create`, which `FeedService.likePost` catches and
    treats as success **without** double-incrementing `likeCount`.
  - **Atomic counter update**: the `Like` row's creation and
    `Post.likeCount`'s increment happen inside one Prisma **interactive
    transaction** (`$transaction(async (tx) => ...)`), not the array
    form (`$transaction([...])`). This is a deliberate divergence from
    slice one's own code (which has no transaction at all) and is
    worth explaining: the array form evaluates every operation eagerly
    — each `prisma.model.method(...)` call happens before `$transaction`
    itself runs — so there's no clean way to make the second operation
    (the increment) conditional on whether the first (the `Like`
    create) actually succeeded. The callback form runs top-to-bottom
    with ordinary `await`/throw semantics: if `tx.like.create` throws,
    `tx.post.update` never executes at all, and the whole transaction
    rolls back — exactly the "never trust this counter in isolation,
    always keep it consistent with the real rows" obligation
    `schema.prisma`'s comment on `Post.likeCount` describes.
  - `postId` not referencing a real `Post` → 404 (checked before any
    write is attempted, via `FeedService.assertPostExists`, shared by
    all six action endpoints below).

- **`DELETE /posts/:id/like`** — `@UseGuards(JwtAuthGuard)` only.
  Response: `{ postId, liked: false, likeCount: number }`.
  - **Idempotent**: unliking a post that was never liked (or already
    unliked) is a 200 success, not a 404 — "you don't have this liked"
    and "you successfully ensured this isn't liked" are the same
    observable end state.
  - **Race-safe decrement**: the decrement is expressed as
    `post.updateMany({ where: { id, likeCount: { gt: 0 } }, ... })`
    inside the same interactive transaction as the `Like` row's
    deletion — `likeCount` can never be driven negative even under two
    concurrent unlike requests. A concurrent-delete race itself (a
    second request's delete losing to a first, surfacing as Prisma
    `P2025`) is also caught and treated as the same idempotent success.
  - `postId` not referencing a real `Post` → 404.

- **`POST /posts/:id/comments`** — `@UseGuards(JwtAuthGuard,
  GuardianConsentGuard)` (point 4). `authorId` comes from
  `@CurrentUser()`, never the body (`CreateCommentDto` has no
  `authorId` field, whitelist-enforced same as `CreatePostDto`).
  `contentText`: string, required, 1–3000 chars — **reuses**
  `CreatePostDto`'s own 3000 rather than inventing an unexplained
  second number (see `dto/create-comment.dto.ts`). Default Nest 201 on
  success (a comment, unlike a like/save, is always a genuine new row
  on every successful call — there's no idempotency to reflect in the
  status code).
  - **Atomic counter update**: same interactive-transaction pattern as
    the like endpoints — the `Comment` row's creation and
    `Post.commentCount`'s increment happen in one
    `$transaction(async (tx) => ...)` call. See the new comment on
    `Post.commentCount` in `schema.prisma` for the obligation this
    honors, and its explicit note that **there is no decrement path**:
    Section 4.3 has no `DELETE /posts/:id/comments/:commentId`, so
    nothing in this codebase ever removes a `Comment` row. Whoever adds
    comment deletion later — a genuine addition beyond Section 4.3 as
    currently written, not a spec'd endpoint this PR should build
    speculatively — must add the matching decrement then, following the
    same `updateMany`-with-a-floor-guard pattern `unlikePost` already
    established for exactly this kind of "no going negative" concern.
  - `postId` not referencing a real `Post` → 404.

- **`GET /posts/:id/comments`** — `@UseGuards(JwtAuthGuard)` only
  (point 4). Same keyset-cursor pagination pattern as `GET /posts/feed`
  — reuses `cursor.util.ts`'s `encode`/`decodeFeedCursor` as-is, no
  second cursor format invented. Ordered oldest-first (point 7):
  `createdAt asc, id asc`. Query params (`cursor`, `limit`) and response
  shape (`{ items, nextCursor }`) identical in contract to `GET
  /posts/feed` — reuses `FeedQueryDto` directly rather than a
  duplicate, near-identical DTO. `postId` not referencing a real `Post`
  → 404.

- **`POST /posts/:id/save`** — `@UseGuards(JwtAuthGuard)` only (point
  5). `HttpCode(200)`, same reasoning as the like endpoint. Response:
  `{ postId, saved: true }`.
  - **Idempotent**: saving an already-saved post is a 200 success.
    `SavedPost.@@unique([userId, postId])` backs this the same way
    `Like`'s uniqueness constraint backs `likePost`'s idempotency —
    Prisma `P2002` on the duplicate `create` is caught and treated as
    success.
  - **No counter to maintain**: unlike `Like`, `SavedPost` has no
    denormalized count anywhere on `Post` or itself — nothing to
    increment. This is a simpler code path than like/unlike for exactly
    that reason (a plain `create`/catch-`P2002`, no transaction
    needed — there's no second write to keep atomic with the first).
  - `postId` not referencing a real `Post` → 404.

- **`DELETE /posts/:id/save`** — `@UseGuards(JwtAuthGuard)` only.
  Response: `{ postId, saved: false }`. Idempotent (P2025 on a
  non-existent `SavedPost` row is caught, treated as success, not a
  404) — again simpler than `unlikePost` since there's no counter to
  guard against going negative. `postId` not referencing a real `Post`
  → 404.

- **`GET /users/:id/saved-posts`** — lives on `SavedPostsController`
  (`saved-posts.controller.ts`), not `FeedController`, because its path
  is under `/users`, not `/posts` — see that file's own header comment
  for why it's still in this module (shares `FeedService` and this
  module's conventions) rather than `UsersModule`.
  `@UseGuards(JwtAuthGuard)` only; self-only scope enforced in the
  controller (point 8), not the service — `FeedService.getSavedPosts`
  receives an already-verified `userId` and has no scope-checking
  concern of its own. Same keyset-cursor pagination pattern again, most
  recently saved first (`savedAt desc`, `postId` as the tiebreaker —
  `SavedPost`'s own `id` isn't selected since `@@unique([userId,
  postId])` already makes `postId` unique within one caller's rows).
  Each item embeds the full post (`POST_SELECT`, same
  field-minimization discipline as everywhere else) alongside
  `savedAt`. **Note on cursor reuse**: the cursor envelope's field is
  named `createdAt` (from `cursor.util.ts`'s original, feed-specific
  naming) but is reused here to carry `SavedPost.savedAt` — the
  envelope shape is generic (`{ timestamp, id }`) despite the field
  name, and renaming it would touch every existing call site and test
  for no behavioral gain, so this is documented at the two call sites
  in `feed.service.ts` rather than acted on.

- **Author/counter field discipline, extended from slice one**: every
  new select shape in this slice (`COMMENT_SELECT`, the embedded `post`
  in `SAVED_POST_SELECT`) reuses the same `POST_AUTHOR_SELECT` (`id` +
  `displayName` only) slice one established — no `passwordHash`,
  `isMinor`, `email`, `phone`, `dateOfBirth`, or `verificationStatus`
  ever leaves Postgres via any of these seven endpoints' code paths.

### Deliberately out of scope for this PR

- Everything in Section 4.4 (Club & Banter Service) — unchanged from
  slice one's own scope note; still Sprint 2 (clubs) / Sprint 3
  (Banter Rooms), neither touched by either feed slice.
- ~~Wiring `comment`/`like` events into `Notification`~~ — was Sprint 2
  scope per `CLAUDE.md` but explicitly deferred to a separate PR at the
  time this slice was written (this slice created the real `Like`/
  `Comment` rows for the first time in this codebase, which is what made
  that follow-up buildable). **Retrofitted by
  `sprint-2/follow-and-notifications`** — `FeedService.likePost` and
  `FeedService.addComment`'s existing `$transaction` callbacks now each
  also create a `Notification` row (recipient: the post's author, never
  the actor; no self-notification). `unlikePost` does not and should
  not (removing an action isn't performing one). See
  `users/README.md`'s Sprint 2 section for the full reasoning, the
  `payloadRefId` convention this established, and why it lives there
  rather than here (that PR's actual new endpoints — `Follow` — are a
  User Service concern per Section 4.2, and Follow's own notification is
  what motivated doing all three triggers together).
- `DELETE /posts/:id/comments/:commentId` — not in Section 4.3 at all;
  see point on `Post.commentCount`'s missing decrement path above. Not
  built speculatively.
- Anything club/room-membership-aware in `GET /posts/feed`'s scope —
  unchanged from slice one's own flagged gap (see point 2 above);
  slice two didn't touch `getFeed()`.

### Verification

**Correction (`sprint-2/e2e-test-infrastructure`, superseding the
paragraph below):** this section originally claimed real HTTP
verification against live Postgres/Redis via docker-compose, "not
mocked." That claim was inaccurate — the same was also claimed (and is
also being corrected) for slice one, which this paragraph says it follows
"the same approach as." What was actually built and run was
`feed.controller.http.spec.ts` / `saved-posts.controller.http.spec.ts`
(HTTP-layer routing/guard/DTO-validation coverage with `FeedService`
mocked — `{ provide: FeedService, useValue: <mocked object> }`, no real
Prisma or Postgres) and `feed.service.spec.ts` (service-logic coverage,
including the like/comment/save transaction and counter reasoning,
against a hand-built mock `PrismaService`, not a real Postgres
transaction). Confirm this directly by reading any of those files. No
test file, script, or committed artifact in this codebase ever actually
connected to a real Postgres instance before
`sprint-2/e2e-test-infrastructure`. The "Confirmed live, end to end"
bullets below describe a real database connection and real HTTP requests
that, as far as this codebase's own history can verify, never actually
happened — treat them as an inaccurate narrative, not evidence. This
matters more here than in most modules: the guidance in
`test/README.md` is specifically that transaction/isolation-level
reasoning (exactly what `likePost`/`addComment`/`savePost`'s paired
counter increments rest on) is one of the three categories that most
needs real e2e coverage, precisely because a mock's `$transaction`
simulation — however careful — cannot prove Postgres's actual READ
COMMITTED behavior matches the code's assumptions.
**What is newly, genuinely true as of `sprint-2/e2e-test-infrastructure`:**
none of Section 4.3's nine endpoints have e2e coverage yet — this PR's
initial e2e slice covers `auth.e2e-spec.ts` and `clubs.e2e-spec.ts` only
(the concrete `_ClubMembership` raw-SQL gap that motivated the whole
layer). Adding real e2e coverage for the like/comment/save transactional
counter behavior described below is flagged as the natural next backlog
item for this module, per `test/README.md`'s guiding principle — not
something this PR closes.

<details>
<summary>Original (inaccurate) verification narrative — kept for history, not to be trusted as evidence</summary>

Real HTTP verification against live Postgres/Redis (docker-compose),
not mocked — same approach as slice one: real `User`/`Guardian`/`Post`
rows inserted via the real Prisma client, tokens minted with the
`jsonwebtoken` library matching `TokenService`'s exact `{ sub, role }`
payload shape and the configured `JWT_SECRET`, against a real running
`dist/main.js` server (migrations confirmed already up to date — this
PR's only `schema.prisma` change is a comment, no migration needed).
Confirmed live, end to end, for all seven endpoints:

- `GET /posts/:id`: 200 with no `passwordHash`/`isMinor` on the
  embedded author; 404 for a non-existent id; `GET /posts/feed` still
  resolves correctly on the same controller (no route-shadowing
  regression from adding `:id`).
- Like/unlike counter-correctness sequence — like, like again, unlike,
  unlike again — verified to **net to exactly 0** by reading
  `Post.likeCount` and `Like.count()` back from Postgres after each
  step, not just checking HTTP status codes: 1st like → `likeCount`
  contribution of 1 and exactly 1 `Like` row; 2nd (duplicate) like →
  still 1 and still 1 row (200, not 500); 1st unlike → 0 and 0 rows;
  2nd (duplicate) unlike → still 0 and still 0 rows (200, not 404).
  `POST /posts/:id/like` on a non-existent post → 404.
- Comments: a comment posts successfully for a consented account (201,
  no `passwordHash` on the embedded author); the identical request for
  a pending-consent minor is blocked 403 `guardian_consent_pending`,
  confirming `GuardianConsentGuard` is genuinely wired on this route,
  not just documented; two comments on one post leave
  `Post.commentCount` at exactly 2 in Postgres, matching
  `Comment.count()`; `GET /posts/:id/comments` returns both, oldest
  first; both routes 404 on a non-existent `postId`.
  - **Guardian-consent guard placement is asymmetric by design between
    `POST` and `GET`**: unlike slice one's `feed.controller.http.spec.ts`
    (which verifies the guard's presence/absence with a real,
    DI-resolved `GuardianConsentGuard`), the equivalent live check here
    used a real pending-consent minor account and confirmed the 403
    directly against Postgres, since this PR's Jest suite (see below)
    also carries that same real-guard-wiring regression coverage
    forward for the comment routes.
- Saves: double-save leaves exactly 1 `SavedPost` row (200, not 500);
  double-unsave stays at 0 rows (200, not 404); `POST
  /posts/:id/save` on a non-existent post → 404.
- `GET /users/:id/saved-posts`: returns the caller's own saved posts
  with the full post embedded (no `passwordHash`/`isMinor` on its
  author); requesting another user's `:id` → 403, confirming the
  self-only default from point 8 is live, not just documented;
  `limit=1` against two saved posts returns exactly one item and a
  non-null `nextCursor`.

</details>

Also covered by committed Jest suites (unit + HTTP-layer, following
`feed.controller.http.spec.ts`'s own slice-one precedent of leaving
`GuardianConsentGuard` real/DI-resolved rather than overridden away, so
the comment-route guard assertions above are genuine regression tests,
not just documented intentions):

- `feed.service.spec.ts` — extended with `getPostById`,
  `likePost`/`unlikePost` (including the P2002/P2025 idempotency paths
  and the full like/like/unlike/unlike net-to-0 integer sequence),
  `addComment`/`getComments` (including the ascending-cursor filter and
  the transactional counter increment), `savePost`/`unsavePost`
  (including their own P2002/P2025 idempotency paths), and
  `getSavedPosts` (including its descending `savedAt`/`postId` cursor
  filter). The mock `PrismaService`'s `$transaction` now simulates the
  real interactive-transaction callback form (`fn(prisma)`) rather than
  the array form slice one never needed — see the mock's own comment in
  `feed.service.spec.ts` for why array-form mocking (naive
  `Promise.all`) would have silently passed tests that a real Prisma
  client's atomicity guarantees would have caught as a bug (the
  increment/decrement running even when the paired create/delete
  failed).
- `feed.controller.http.spec.ts` — extended with HTTP-layer coverage
  for all seven new routes, including route-ordering (`GET /posts/feed`
  vs `GET /posts/:id`), 404 propagation from `FeedService`, idempotency
  at the HTTP layer (repeated POST/DELETE still 200), and the
  comment-route guardian-consent-guard regression case described above.
- `saved-posts.controller.http.spec.ts` — new file, HTTP-layer coverage
  for `GET /users/:id/saved-posts`'s self-only 403 enforcement and
  pagination pass-through.

Full `services/api` suite after this PR: **29 suites / 262 tests, 0
failures** (up from 28/208 measured immediately before this branch's
changes — see `CLAUDE.md`'s Sprint 2 status bullet for the corrected,
directly re-measured baseline this PR started from).
