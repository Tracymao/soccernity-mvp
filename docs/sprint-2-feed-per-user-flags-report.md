# Sprint 2 — feed per-user viewer-state flags (closes Decision Log #153)

Branch: `sprint-2/feed-per-user-flags` (from `origin/main`).
Agent: `backend-api`. **`services/api` only — `apps/web` is untouched.**

Closes Decision Log #153: `GET /posts/feed` and `GET /posts/:id` now tell the
calling user whether *they* have already liked / saved a post, and whether they
follow its author. The `apps/web` `PostCard.tsx` session-local workaround is
**not touched here** — dropping it is the follow-up this PR unblocks, not part
of it.

---

## What changed

### `services/api/src/modules/feed/feed.service.ts`

- **New exported type `FeedPostWithViewerState`** = `FeedPost & { isLiked:
  boolean; isSaved: boolean; author: FeedPost['author'] & { isFollowing:
  boolean } }`. `FeedPost` itself (the raw `Prisma.PostGetPayload<{ select:
  POST_SELECT }>`) is unchanged — the three fields are **computed, not columns**,
  so they're an intersection on top, never added to `POST_SELECT`.
- **`FeedPage.items`** is now `FeedPostWithViewerState[]`.
- **`getFeed(userId, query)`** — after the existing `post.findMany` resolves and
  the lookahead row is trimmed, a new private `attachViewerState(userId, posts)`
  enriches the page:
  - `if (posts.length === 0) return []` — **zero-post pages issue zero lookups**
    (no empty-`IN` queries).
  - Otherwise, **three batched queries in `Promise.all`** (not one per post):
    - `like.findMany({ where: { userId, postId: { in: postIds } }, select: { postId: true } })`
    - `savedPost.findMany({ where: { userId, postId: { in: postIds } }, select: { postId: true } })`
    - `follow.findMany({ where: { followerId: userId, followeeId: { in: otherAuthorIds } }, select: { followeeId: true } })`
      — where `otherAuthorIds` is the **deduped** set of post authors **excluding
      the caller** (a self-follow row can't exist, so the caller's own posts get
      `isFollowing: false` with nothing queried; if the whole page is the
      caller's own posts, the follow query is skipped entirely).
  - Three `Set`s are built from the results; the posts are mapped **once** to
    attach `isLiked` / `isSaved` / `author.isFollowing` from `Set` membership.
- **`getPostById(postId, userId)`** — signature gains `userId`. A single post, so
  **three unique-key existence checks** (`findUnique` on `Like`/`SavedPost`'s
  `userId_postId` and `Follow`'s `followerId_followeeId`), again in `Promise.all`,
  again skipping the follow check (returning `null`) when the post is the
  caller's own. The `NotFoundException` for a missing post is still thrown
  **before** any viewer-state lookup.
- `SAVED_POST_SELECT` gained a comment noting `getSavedPosts` and `createPost`
  deliberately still return the **raw** `FeedPost` shape (see "Deliberately not
  done" below).

### `services/api/src/modules/feed/feed.controller.ts`

- `getById` gains `@CurrentUser() user: AccessTokenPayload` and passes
  `user.sub` to `getPostById`. `JwtAuthGuard` already attaches `request.user`,
  so this is a handler-signature change only — no new guard wiring. `POST
  /posts/feed`'s handler already had `@CurrentUser()`.

### No schema / migration changes

Nothing is stored. `Like`, `SavedPost`, `Follow` and their composite-unique
constraints (`@@unique([userId, postId])` ×2, `@@unique([followerId,
followeeId])`) already exist.

---

## N+1 avoided — confirmation

- `getFeed`: **exactly one** `like.findMany`, **one** `savedPost.findMany`, and
  **at most one** `follow.findMany` per request, regardless of page size — each
  keyed on an `IN (...)` list built from the single page of posts already in
  memory. Asserted directly in `feed.service.spec.ts`
  (`toHaveBeenCalledTimes(1)` + exact `where` args).
- `getPostById`: three `findUnique` calls for one row — not a loop.
- No `findMany`/`findUnique` inside any `.map`/`.forEach`/`for` in the new code.

---

## Tests

`feed.service.spec.ts` — `buildPrismaMock()` extended: `like` gained
`findMany`/`findUnique` (defaulting to `[]` / `null`), `savedPost` gained
`findUnique`, and a new `follow` mock (`findMany`/`findUnique`, same defaults).
The defaults mean every pre-existing `getFeed`/`getPostById` test keeps passing
untouched.

New/changed cases:

- **`getFeed` mixed page** — one post liked+author-followed, one saved+not-followed,
  one with nothing → each flag asserted per post.
- **`getFeed` batching** — one `findMany` per relation, exact `where` args, author
  ids deduped, caller never in the follow `IN` list.
- **`getFeed` own posts** — `author.isFollowing` is `false` even when a bogus
  self-follow row is in the mock result, and the caller's id is filtered out of
  the follow lookup's `IN` list.
- **`getFeed` zero results** — none of the three lookups are issued.
- **`getFeed` all-own page** — like/save lookups still run, follow lookup skipped.
- **`getPostById`** — default (no rows) → all three false; real rows → correct
  per-field; own post → `isFollowing` false with `follow.findUnique` never
  called; missing post → 404 before any lookup.

`feed.controller.http.spec.ts` — the `GET /posts/:id` "returns the post" case now
also asserts `getPostById` is called with `('post-1', <caller sub>)`.

### Test run output

Full `services/api` unit suite (`npx jest`):

```
Test Suites: 35 passed, 35 total
Tests:       415 passed, 415 total
Snapshots:   0 total
Time:        161.869 s
```

(A "worker process failed to exit gracefully" warning prints — pre-existing
test-teardown noise unrelated to this change; exit code 0, all green.)

Feed module in isolation (`npx jest src/modules/feed`):

```
PASS src/modules/feed/cursor.util.spec.ts
PASS src/modules/feed/feed.service.spec.ts
PASS src/modules/feed/saved-posts.controller.http.spec.ts
PASS src/modules/feed/feed.controller.http.spec.ts
Test Suites: 4 passed, 4 total
Tests:       113 passed, 113 total
```

e2e suite (`npm run test:e2e`, real Postgres) — **unchanged**, nothing here
touches an e2e-covered path:

```
Test Suites: 8 passed, 8 total
Tests:       54 passed, 54 total
```

---

## Deliberately NOT done (scope)

- **`apps/web` is untouched.** `PostCard.tsx`'s documented session-local
  workaround stays exactly as it is. Removing it — and consuming the three new
  fields — is the separate frontend follow-up this PR exists to unblock.
- **`createPost` (`POST /posts`) response** still returns the raw `FeedPost`
  shape (no viewer-state fields). For a freshly created post all three are
  trivially `false` (you just made it; you can't follow yourself); the frontend
  follow-up can treat a create response that way without a round-trip. Adding
  the fields to `createPost` was left out to keep this change to the two
  endpoints Decision Log #153 actually names.
- **`getSavedPosts` (`GET /users/:id/saved-posts`)** — its embedded `post` is
  still the raw shape. `isSaved` would be trivially `true` for every row, but
  `isLiked` / `isFollowing` would need the same enrichment. Flagged as a
  follow-up in a code comment on `SAVED_POST_SELECT`; the `apps/web` saved-posts
  screen isn't built yet.

---

## New Decision Log candidate — flagged, NOT fixed here

**`GET /clubs` has the same class of gap as Decision Log #153.**
`ClubsService.listClubs` returns `ClubSummary` (`id`, `name`, `league`,
`country`, `logoUrl`, `memberCount`) with **no per-user `joined` / `isMember`
field** — only the `POST`/`DELETE /clubs/:id/join` action responses (`JoinState`
/ the leave equivalent) tell a caller their membership state. So `apps/web`'s
club-picker / any future "my clubs" surface has the identical problem the feed
had: it can't render a club's join button in the right state on load. Out of
scope for this PR (Decision Log #153 is Feed-only, and Clubs wasn't part of the
brief) — recorded here so it's on the books rather than silently noticed and
dropped. Candidate for a `GET /clubs` follow-up: add a caller-scoped
`_ClubMembership` existence check to the list payload, batched the same way
`attachViewerState` does it here.

---

## Verification

- `npm run build` (`nest build`) — clean.
- `npm run lint` — clean.
- `npx jest` (full unit suite) — **35 suites / 415 tests, 0 failures**.
- `npm run test:e2e` — **8 suites / 54 tests, 0 failures**, unchanged. No e2e
  change: `GET /posts/feed` / `GET /posts/:id` have no e2e coverage today, and
  this change is plain `findMany`/`findUnique` with `IN`/unique keys — none of
  `test/README.md`'s "add an e2e" triggers (raw SQL, transaction/isolation
  reasoning, novel relation/constraint) apply, so the mocked unit layer is the
  right one. A possible future e2e alongside `feed-reactions.e2e-spec.ts` if that
  file ever grows a `GET /posts/feed` case.

## Docs updated in this PR

- `docs/Soccernity_MVP_Build_Plan_v1.7.docx` — Decision Log #153 Status cell
  gets a `RESOLVED` forward-pointer.
- `CLAUDE.md` — dated Sprint 2 status bullet.
- `services/api/src/modules/feed/README.md` — new "Per-caller viewer state"
  section.
