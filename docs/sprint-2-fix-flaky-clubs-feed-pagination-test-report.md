# Sprint 2 — Fix flaky `clubs.e2e-spec.ts` feed-pagination test

**Branch:** `sprint-2/fix-flaky-clubs-feed-pagination-test`
**Agent:** backend-api
**Date:** 2026-09-06
**Scope:** **test-only.** No production code, no `schema.prisma`, no
`FeedService` / `orderBy` change.
**Decision Log:** #226 (new — flagged, not fixed).

---

## 1. The failure

CI's `build-and-test` / `Run e2e tests` step was intermittently failing on
`test/clubs.e2e-spec.ts` →
`GET /clubs/:id/feed keyset-paginates (limit + cursor) consistently with
GET /posts/feed` (assertion around line 574), blocking PR #185's merge as
a required check even though #185 never touches `services/api`.

## 2. Root cause (confirmed by code read, then reproduced by fixing + running)

- `Post.id` is `@default(uuid())` (`schema.prisma:305`) — random, no
  relation to creation order.
- `Post.createdAt` is `@default(now())` (`schema.prisma` Post block) —
  millisecond precision, set by the DB when the helper omits it.
- `seedClubPost()` created 3 posts in a tight `for` loop with no explicit
  `createdAt`.
- `FeedService.paginatePostsWithViewerState` (used by `getClubFeed` **and**
  `getFeed`) orders `[{ createdAt: 'desc' }, { id: 'desc' }]`
  (`feed.service.ts:302`).
- When two of the three seeded posts land in the same millisecond (a
  realistic outcome of a fast local-loop insert), `createdAt` ties and the
  tiebreaker falls to `id desc` — a random UUID. That produces the exact
  swap seen in CI: two adjacent posts trading places in the `expectedOrder`
  array.

This is a **test-determinism bug**, not a feed-ordering regression. The
`createdAt desc, id desc` tiebreaker convention is pre-existing and shared
with `GET /posts/feed`.

## 3. The fix

`test/clubs.e2e-spec.ts` only — `seedClubPost()` (the sole post-seeding
helper in the file; the one other `prisma.post.create` at line ~552 seeds
a `clubPageId: null` post that is never in a club feed and never
order-asserted):

```ts
let seedClock = new Date('2026-09-01T00:00:00.000Z').getTime();
async function seedClubPost(authorId, clubPageId, contentText) {
  const prisma = getTestPrismaClient();
  seedClock += 10;
  return prisma.post.create({
    data: { authorId, clubPageId, contentText, mediaUrls: [], createdAt: new Date(seedClock) },
  });
}
```

- Closure-level `seedClock`, so every call across every test in the block
  gets a strictly-increasing timestamp; `reset-database` between tests
  clears rows, not this counter.
- 10ms spacing is far past any realistic clock resolution.
- Covers **both** call sites: the 3-post `for` loop in the
  keyset-pagination test **and** the 2-post `older`/`newer` sequential-await
  case in the sibling test (line ~526) — confirmed, not assumed. That
  two-post case was less collision-prone but is now fully deterministic
  too.

Grep of every other `test/*.e2e-spec.ts` for multi-post-seed-then-assert
order: none. `feed-reactions.e2e-spec.ts` compares comment id sets with
`.sort()` on both sides (order-independent).

## 4. Flagged, not fixed — Decision Log #226

The `createdAt desc, id desc` tiebreaker is non-deterministic in
**production** too for any pair of Posts sharing a millisecond-precision
`createdAt` — their relative order is effectively random per request.
Same class as Decision Log #153/#154: cosmetic, not data loss or
duplication. At worst one same-millisecond pair swaps between two
paginated requests, or a cursor on that boundary row skips/repeats that
one pair. It predates this PR and also affects `GET /posts/feed`; feed
volume is near zero today so there is no observable churn.

Fix options for a future feed-ordering-hardening pass (documented in
#226, not done here): (a) a monotonic `seq BigInt @default(autoincrement())`
column on `Post` as the tiebreaker key instead of `id`, encoded into the
cursor; (b) higher-precision `createdAt` if Postgres/Prisma expose it
reliably; (c) formally accept as cosmetic. Low priority.

## 5. Verification

`npm run test:e2e` (real Postgres + Redis via docker-compose, `--runInBand`),
run **twice in a row**:

| Run | Result |
|---|---|
| 1 | **Test Suites: 11 passed, 11 total. Tests: 81 passed, 81 total.** 0 failures. (203.95 s) |
| 2 | **Test Suites: 11 passed, 11 total. Tests: 81 passed, 81 total.** 0 failures. |

The previously-flaky `GET /clubs/:id/feed` pagination test passed cleanly
both times, as did every other suite — no sign of the same flake
elsewhere.

## 6. Files

- `services/api/test/clubs.e2e-spec.ts` — `seedClubPost()` explicit `createdAt`.
- `services/api/test/README.md` — note on the seeding convention.
- `docs/Soccernity_MVP_Build_Plan_v1.7.docx` — Decision Log #226.
- `CLAUDE.md` — "Where things stand" bullet.
- `docs/sprint-2-fix-flaky-clubs-feed-pagination-test-report.md` — this file.
