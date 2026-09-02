# Sprint 2 — Clubs per-caller `joined` flag (closes Decision Log #154)

Branch: `sprint-2/clubs-joined-flag` (from `origin/main`).
Agent: `backend-api`. **`services/api` only — `apps/web` is NOT touched.**

Closes Decision Log **#154** — the sibling gap PR #136's report flagged off
Decision Log #153: `GET /clubs` and `GET /clubs/:id` could tell you a club's
`memberCount` but not whether *you* were one of those members. Now they return a
real per-caller `joined` boolean, computed the same batched, N+1-free way #153's
backend half (PR #136) computed `isLiked` / `isSaved` / `isFollowing`.

---

## What changed

### `services/api/src/modules/clubs/clubs.service.ts`

- **New exported type `ClubSummaryWithViewerState`** = `ClubSummary & { joined:
  boolean }`. `CLUB_SELECT` / `ClubSummary` are unchanged — `joined` is computed,
  not a column, so it's an intersection on top (same discipline as
  `FeedPostWithViewerState`).
- **`ClubPageResult.items`** is now `ClubSummaryWithViewerState[]`.
- **`listClubs(query, userId)`** — gained the `userId` parameter. After the
  existing `clubPage.findMany` resolves and the lookahead row is trimmed, a new
  private `membershipSubset(userId, clubIds)`:
  - `if (clubIds.length === 0) return new Set()` — **a zero-club page issues no
    membership query** (same short-circuit `attachViewerState` uses).
  - otherwise **one batched query**:
    `clubPage.findMany({ where: { id: { in: clubIds }, members: { some: { id: userId } } }, select: { id: true } })`
    → returns exactly the subset of the page's ids the caller belongs to → a
    `Set` → the page is mapped **once** to attach `joined` from `Set` membership.
- **`getClubById(clubId, userId)`** — gained `userId`. One club, so one
  `clubPage.findFirst({ where: { id: clubId, members: { some: { id: userId } } }, select: { id: true } })`
  existence check. The `NotFoundException` for a missing club is still thrown
  **before** the membership lookup.
- **Plain Prisma relation filter, not raw SQL.** `joinClub`/`leaveClub` use raw
  `$executeRaw` against `"_ClubMembership"` only for the atomicity an
  `INSERT`/`DELETE` + `memberCount` update needs — a read-only existence check
  has no such need, so `members: { some: { id } }` is correct here. This does not
  contradict the existing raw-SQL reasoning in that file — it builds alongside
  it.

### `services/api/src/modules/clubs/clubs.controller.ts`

- **Both `list` and `getById`** gained `@CurrentUser() user: AccessTokenPayload`
  and pass `user.sub` to the service — mirroring exactly what PR #136 did for
  `feed.controller.ts`'s `getById`. `JwtAuthGuard` already attaches
  `request.user`, so this is a handler-signature change only, no new guard
  wiring.

### No schema / migration change

Nothing is stored. The `ClubPage.members` ⇄ `User.clubMemberships` relation
(`@relation("ClubMembership")`, backed by the implicit `_ClubMembership` table)
already exists — this only reads it.

---

## N+1 avoided — confirmation

- `listClubs`: **exactly one** `clubPage.findMany` for the page + **exactly one**
  for the membership subset, regardless of page size — keyed on an `IN (...)`
  list built from the single page already in memory. Asserted directly in
  `clubs.service.spec.ts` (`toHaveBeenCalledTimes(2)` + exact `where` args on
  call `[1]`), and a zero-club page asserted to issue only the first
  (`toHaveBeenCalledTimes(1)`).
- `getClubById`: one `findFirst` for one club — not a loop.
- No query inside any `.map` / `.forEach` / `for` in the new code.

---

## What stays unenriched — deliberately, flagged not fixed

- `joinClub` / `leaveClub` — their `JoinState` return type already carries
  `joined` directly (it's the whole point of those responses). **Unchanged.**
- No other Clubs endpoint returns `ClubSummary`, so there's nothing else in
  scope.

---

## `apps/web` NOT touched in this PR

Frontend consumption — updating `apps/web/src/api/clubs.ts`'s `ClubSummary` type
and wherever club "joined" state is currently hardcoded or locally tracked (e.g.
`ClubPickerStep.tsx`) — is a **separate follow-up**, the same two-PR split
Decision Log #153 used (backend PR #136, then frontend PR #137).

---

## Tests

`clubs.service.spec.ts` — `buildPrismaMock()`'s `clubPage` gained `findFirst`
(default `null`) and `findMany` now defaults to `[]`; tests reaching the second
`findMany` call use `.mockResolvedValueOnce(...)` per call in sequence (the same
technique `feed.service.spec.ts` uses for multiple call sites on one `jest.fn()`).
Existing `listClubs` / `getClubById` tests updated for the new `userId` param and
`joined` field. New cases:

- `listClubs` mixed page — some clubs joined, some not → `joined` per club correct.
- `listClubs` — the membership subset is **one** query, keyed on the page's ids
  (no N+1).
- `listClubs` zero-club page — **no** membership query issued.
- `getClubById` — `joined: false` (no row) and `joined: true` (row exists, exact
  `where` asserted); 404 for a missing club thrown before any membership lookup.

`clubs.controller.http.spec.ts` — `GET /clubs` passthrough test now asserts
`listClubs` is called with `(query, callerSub)`; `GET /clubs/:id` asserts
`getClubById` is called with `(id, callerSub)`.

`test/clubs.e2e-spec.ts` — new describe block (real Postgres, real
`_ClubMembership` table), extending the existing file rather than adding a
sibling:

- `GET /clubs` reports `joined: true` only for clubs the caller actually joined.
- `GET /clubs/:id` reports `joined: true` after a real join, `false` for a
  non-member.
- **The flag is scoped to the calling user** — user B joining does not flip it
  true for user A (proven on both `GET /clubs/:id` and `GET /clubs`).
- Leaving a club flips `joined` back to `false`.

New e2e users are seeded via Prisma + a real `TokenService` token (the file's
existing `createUser()` helper), not `POST /auth/register`, to stay under
`AuthThrottlerGuard`'s limit — the same already-documented workaround the
`leaveClub` tests use.

### Test run output

Full `services/api` unit suite (`npx jest`):

```
Test Suites: 35 passed, 35 total
Tests:       419 passed, 419 total
Time:        66.841 s
```

(up from 35 / 415 — new `clubs.service.spec.ts` viewer-state cases)

Clubs module in isolation:

```
PASS src/modules/clubs/clubs.service.spec.ts
PASS src/modules/clubs/clubs.controller.http.spec.ts
Test Suites: 2 passed, 2 total
Tests:       33 passed, 33 total
```

e2e suite (`npm run test:e2e`, real Postgres via docker-compose):

```
Test Suites: 8 passed, 8 total
Tests:       58 passed, 58 total
```

(up from 8 / 54 — `test/clubs.e2e-spec.ts` went from 9 to 13 tests; the new
describe block's 4 cases prove `joined` against the real `_ClubMembership`
table, including caller-scoping)

`nest build` + `npm run lint` — clean.

---

## Docs updated in this PR

- `docs/Soccernity_MVP_Build_Plan_v1.7.docx` — new Decision Log **#154** row
  recording this fix and pointing back to #153's own status text where the
  candidate was raised; `#153`'s Status cell gets a forward-pointer to #154.
- `CLAUDE.md` — dated Sprint 2 status bullet.
- `services/api/src/modules/clubs/README.md` — new "Per-caller `joined`" section.
