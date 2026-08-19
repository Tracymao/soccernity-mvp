# feed module

Build target: Sprint 2 — Section 4.3 of the MVP Build Plan.

## Status

**Slice one (`POST /posts` + `GET /posts/feed`) — done.**

Section 4.3 lists nine endpoints total:

```
POST   /posts
GET    /posts/feed
GET    /posts/:id
POST   /posts/:id/like
DELETE /posts/:id/like
POST   /posts/:id/comments
GET    /posts/:id/comments
POST   /posts/:id/save
DELETE /posts/:id/save
GET    /users/:id/saved-posts
```

This PR implements only the first two. `GET /posts/:id`, like, comment,
and save are a deliberate, separate follow-up slice — not started here,
not stubbed, not partially wired. In particular: **no code path in this
slice creates a `Like` or `Comment` row.** `Post.likeCount` and
`Post.commentCount` stay at their schema default of `0` on every post
this slice creates — see the comment on `Post.likeCount` in
`schema.prisma` for the consistency obligation the like/comment slice
will need to honor.

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
in tension.

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

- **Author field minimization on every response in this module**: both
  endpoints select `id` + `displayName` only for the embedded `author`
  — not `passwordHash` (excluded via Prisma `select`, same pattern as
  `UsersService.OWN_PROFILE_SELECT` — never pulled out of Postgres by
  this code path in the first place), and deliberately not `isMinor`,
  `verificationStatus`, `email`, `phone`, or `dateOfBirth` either. No
  `GET /users/:id/profile` (the public-facing view of another user)
  exists yet to define what's genuinely public — it's explicitly out of
  scope in `users/users.controller.ts`'s own header comment — so this
  is the narrowest defensible field set until that endpoint exists and
  settles the question properly.

### Deliberately out of scope for this PR

- `GET /posts/:id`, `POST`/`DELETE /posts/:id/like`,
  `POST`/`GET /posts/:id/comments`, `POST`/`DELETE /posts/:id/save`,
  `GET /users/:id/saved-posts` — a separate follow-up slice. No `Like`
  or `Comment` row is ever created by this PR's code.
- Everything in Section 4.4 (Club & Banter Service — `GET /clubs`,
  `GET /clubs/:id`, `POST /clubs/:id/join`, and all of `/banter-rooms*`)
  — Sprint 2's actual scope per `CLAUDE.md` is the club subset of
  Section 4.4 only, and Banter Rooms specifically is Sprint 3. Neither
  is touched here.
- Wiring `follow`/`comment`/`like` events into `Notification` — also
  Sprint 2 scope per `CLAUDE.md`, but a separate PR: this slice creates
  no `Comment`/`Like` events to wire in the first place, and `Follow`
  creation itself (`POST`/`DELETE /users/:id/follow`) is not part of
  this PR either — `getFeed()` reads existing `Follow` rows but nothing
  here creates one.

### Verification

Real HTTP verification against live Postgres/Redis (docker-compose),
not mocked: real `User`/`Guardian`/`Follow`/`ClubPage`/`Post` rows
inserted via the real Prisma client, tokens minted with the
`jsonwebtoken` library matching `TokenService`'s exact `{ sub, role }`
payload shape and the configured `JWT_SECRET` (same approach documented
in `users/README.md`), against a real running `dist/main.js` server.
Confirmed live: guard composition (adult passes without querying
`Guardian`; pending-consent minor blocked 403
`guardian_consent_pending` and `FeedService.createPost` never called;
confirmed-consent minor succeeds); DTO validation (missing/oversized
`contentText`, non-URL `mediaUrls` entry, `authorId` rejected by
whitelist, both `clubPageId`+`banterRoomId` rejected); a real
foreign-key violation on a nonexistent `clubPageId` mapped to 400; feed
scope (a followed user's post — including one tagged with a real
`clubPageId` — appears, an unfollowed stranger's post never does, no
`passwordHash`/`isMinor` on any embedded author); pagination boundary
(27 posts in scope, default page size 20: page one returns exactly 20
with a non-null `nextCursor`, page two returns the remaining 7 with a
null `nextCursor`, zero overlap and zero gaps between the two pages);
`GET /posts/feed` succeeding for a pending-consent minor (confirming
`GuardianConsentGuard` is genuinely absent from that route, not just
undocumented); and a post-run count confirming zero `Like`/zero
`Comment` rows exist anywhere in the database after the entire run.

Also covered by committed Jest suites (unit + HTTP-layer, following
`registration.controller.spec.ts` / `users.controller.http.spec.ts`'s
precedent of mocking the service layer for CI, with the live pass above
covering the real Postgres/Redis-backed path):
`feed.service.spec.ts`, `feed.controller.http.spec.ts`,
`cursor.util.spec.ts`. Notably, `feed.controller.http.spec.ts` does
**not** override `GuardianConsentGuard` away (unlike every other guarded
controller test in this codebase so far) — it supplies a mocked
`PrismaService` and lets the real guard run, so it's a genuine
regression test of the guard's wiring onto `POST /posts` and its
absence from `GET /posts/feed`, not just a documented intention.
