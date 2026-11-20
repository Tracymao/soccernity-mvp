# Sprint 2 — Account deactivation backend report

**Branch:** `sprint-2/account-deactivation-backend`
**Agent:** backend-api (backend work resumption explicitly authorised by the founder for this task)
**Date:** 2026-09-06
**Scope:** `services/api` only. No `apps/web`, no Figma.
**Decision Log:** #221 (Build Plan Section 9). Pairs with **#220**
(`sprint-2/account-deactivation-design`, the Figma half — a separate,
also-unmerged branch).

---

## 1. What was already there (confirmed live, not assumed)

The task brief said *"confirm against the actual User schema live before
adding a field, don't assume the current shape."* Doing that turned up
that most of the *state model* already exists:

| Thing | Status on `main` | Source |
| --- | --- | --- |
| `User.accountStatus` — `"active"` \| `"deactivated"` \| `"pending_deletion"`, default `"active"` | **exists** (migration `20260823011617`) | `sprint-1/f5-f6-missing-endpoints` |
| `User.pendingDeletionAt` | **exists** | `sprint-2/account-deletion-sweep` |
| `POST /auth/deactivate-account` (auth'd, password re-entry, revokes sessions) | **exists, unchanged** | `sprint-1/f5-f6-missing-endpoints` |
| `POST /auth/reactivate-account` (unauth'd, `{email,password}`, flips `deactivated → active`) | **exists, unchanged** | `sprint-1/f5-f6-missing-endpoints` |
| `POST /auth/delete-account` (auth'd) → `pending_deletion` + `pendingDeletionAt` | **exists** | `sprint-1/f5-f6-missing-endpoints` |
| 30-day grace → hard-delete → cascade → `ConsentAuditRecord` retention | **exists, unchanged** | `sprint-2/account-deletion-sweep` / `-cascade` (Decision Log #42/#44) |
| `login()` rejects any non-`"active"` account (distinct message for `deactivated`) | **exists** | `sprint-1/f5-f6-missing-endpoints` |

### Schema decision

**No new field. No migration.** `"deactivated"` **is** the "inactive"
state. Renaming it to `"inactive"` (the task's "e.g." wording) was
rejected: it is already shipped, and `auth.service.spec.ts`,
`account-lifecycle.e2e-spec.ts` and — load-bearingly —
`AccountDeletionSweepService`'s `WHERE accountStatus = 'pending_deletion'`
query all depend on the current string values. A cosmetic rename would be
pure churn and risk.

`schema.prisma` has a **zero-line diff** in this PR.

---

## 2. Gap 1 — delete-from-inactive

**The gap:** `deactivateAccount()` revokes *every* session
(`tokenService.revokeAllSessionsForUser`). A deactivated account
therefore has no valid JWT and **cannot reach the
`JwtAuthGuard`-protected `POST /auth/delete-account`**. The Figma flow
(Decision Log #220) reaches Delete from the *unauthenticated* "Inactive
Account" screen.

**The fix — `POST /auth/delete-inactive-account`:**

- Unauthenticated, body `{ email, password }` (`DeleteInactiveAccountDto`),
  `@AuthRateLimit()`, `204 No Content` — the exact posture of
  `POST /auth/reactivate-account`.
- Same fixed-dummy-hash timing-safety as `login()` / `reactivateAccount()`
  (an unknown email costs the same real argon2id work as a known one).
- **Only a genuinely `"deactivated"` account is accepted.** Everything
  else — `"active"` (has a session; must use the authenticated route),
  `"pending_deletion"` (clock already running; never re-started, never
  confirmed), unknown email, wrong password — gets the generic
  `"Invalid credentials"`.
- **No duplicated deletion logic.** Both `deleteAccount()` (authenticated)
  and `deleteInactiveAccount()` (unauthenticated) call the new private
  `AuthService.startPendingDeletion(userId)` — the single place
  `accountStatus` flips to `"pending_deletion"`. It sets `pendingDeletionAt
  = now()` and revokes every session. `AccountDeletionSweepService` then
  applies its 30-day grace, hard-delete, cascade and `ConsentAuditRecord`
  retention **byte-for-byte identically** — the sweep's own
  `pendingDeletionAt <= cutoff` query doesn't know or care which entry
  point set the field.

**The deletion flow is untouched** — no change to
`account-deletion-sweep.service.ts`, the cascade FKs, or `ConsentAuditRecord`.

---

## 3. Gap 2 — "an inactive account should not appear in feeds / search / leaderboards"

Per the brief: *"confirm what 'not appear' means practically against each
of those surfaces, and flag rather than guess if any of them would need
non-trivial query changes."*

### The filter

Every affected read filters on **`accountStatus = 'active'`** — not
`NOT 'deactivated'`. Deliberate: a `pending_deletion` account's content
is equally "should not appear", and this is a **read-visibility** change
only — it does not touch the deletion flow. Every filter **reverses
automatically on reactivation** (a plain `accountStatus` flip back to
`'active'`), with **no per-row backfill**.

### Surfaces that exist today — filtered

| Surface | Practical meaning of "not appear" | Change (all trivial `where` additions) |
| --- | --- | --- |
| `GET /posts/feed` | A deactivated user's posts vanish from their followers' feeds. | `ACTIVE_AUTHOR_POST_FILTER` AND-ed into the scope filter (`feed.service.ts`). |
| `GET /clubs/:id/feed` | Same, for the club fan-page feed. | Spread into the `clubPageId` scope filter. |
| `GET /posts/:id` | A deep link to a deactivated user's post 404s (the "hide via 404" convention this codebase uses for restricted content). | `findUnique` → `findFirst({ where: { id, ...ACTIVE_AUTHOR_POST_FILTER } })`. |
| `GET /clubs/:id/members` | A deactivated user drops out of the club roster. | `VISIBLE_CLUB_MEMBER_FILTER` gains `accountStatus: 'active'` next to the existing restricted-pending-minor `OR`. Same "`memberCount` can exceed the visible roster" note as Decision Log #217. |
| `GET /users/:id/followers` / `/following` — **target** | A deactivated `:id`'s whole follow graph 404s, same as a non-existent user or a restricted-pending minor. | `assertFollowGraphVisible` selects `accountStatus` and 404s a non-`active` target, checked before the minor branch. |
| `GET /users/:id/followers` / `/following` — **entries** | A follower/followee who has since deactivated drops out of an *active* target's list. | `follower: { is: { accountStatus: 'active' } }` / `followee: { is: {...} }` in the `follow.findMany` `where`. No follower/following count field exists, so nothing can visibly drift. |

The caller of all the feed methods is always an active account (`login` /
`JwtAuthGuard` reject non-active accounts, and deactivation revokes every
session), so the author filter can never hide the caller's *own* posts.

### Surfaces that DON'T exist yet — flagged, not guessed

| Surface | Status | Flag |
| --- | --- | --- |
| **Search** | No people-search endpoint exists anywhere in `services/api` (`apps/web`'s search UI has no backend — confirmed). | Whoever builds people-search must filter `accountStatus = 'active'`. Noted here + in the Decision Log. |
| **Leaderboard** | `GET /leaderboard` is unbuilt (Sprint 6). `PointsLedgerEntry` rows *do* accrue now (post / like / follow / contest). | Note added to `leaderboard/README.md` item 5: the future `SUM(PointsLedgerEntry.points)` / `LeaderboardEntry` recompute must filter its user set to `accountStatus = 'active'`. A deactivated user's ledger rows are left intact and are correct on reactivation — the filter belongs on the **rollup/read**, not the ledger write. |

### Deliberate non-changes — flagged with reasoning

| Surface | Why left alone |
| --- | --- |
| `GET /posts/:id/comments` | A comment sits mid-thread on *someone else's* still-visible post. Filtering deactivated-author comments would leave `Post.commentCount` (returned by `GET /posts/:id`) inconsistent with the visible thread, and Section 4.3 defines no comment-visibility model. The post-level filter is the primary protection; a stray old comment under a third party's post is a much smaller surface. One-line change if the founder wants it. |
| `GET /users/:id/saved-posts` | The caller's own **private bookmark list** (Decision Log #22, self-only). Hiding a saved post whose author later deactivated would make the caller's own list mysteriously shrink. Different category from a public surface. |
| `Notification` delivery | A deactivated user still *receives* follow/like/comment notifications on their old content. Not a visibility-to-others concern; they simply can't log in to see them, and they're intact on reactivation. |

---

## 4. Files changed

**Production (`services/api/src`):**

- `modules/auth/auth.service.ts` — extract `startPendingDeletion()`; new
  `deleteInactiveAccount()`.
- `modules/auth/auth.controller.ts` — new `POST /auth/delete-inactive-account`.
- `modules/auth/dto/delete-inactive-account.dto.ts` — new.
- `modules/feed/feed.service.ts` — `ACTIVE_AUTHOR_POST_FILTER`; applied in
  `getFeed`, `getClubFeed`, `getPostById` (`findUnique` → `findFirst`).
- `modules/users/users.service.ts` — `assertFollowGraphVisible` +
  `accountStatus` check; `ACTIVE_FOLLOW_ENTRY_FILTER` in
  `getFollowers` / `getFollowing`.
- `modules/clubs/clubs.service.ts` — `VISIBLE_CLUB_MEMBER_FILTER` +
  `accountStatus: 'active'`.

**Docs / READMEs:**

- `docs/Soccernity_MVP_Build_Plan_v1.7.docx` — Decision Log #221.
- `CLAUDE.md` — status bullet.
- `services/api/src/modules/auth/README.md` — Status update entry.
- `services/api/src/modules/{feed,users,clubs}/README.md` — short notes.
- `services/api/src/modules/leaderboard/README.md` — item 5 (the parked
  requirement).

**Tests:**

- `modules/auth/auth.service.spec.ts` — +9 (`deleteInactiveAccount`).
- `modules/auth/auth.controller.http.spec.ts` — +3.
- `modules/feed/feed.service.spec.ts` — updated `getFeed` / `getClubFeed`
  `where`-shape assertions; +1 `getPostById` deactivated-author 404 case;
  `post.findFirst` added to the mock.
- `modules/users/users.service.spec.ts` — updated `getFollowers` /
  `getFollowing` `where`-shape + user-mock fixtures; +3 deactivated-account
  cases.
- `modules/clubs/clubs.service.spec.ts` — updated `getClubMembers`
  `where.AND` assertion.
- `test/account-deactivation.e2e-spec.ts` — **new.**

---

## 5. Verification

All re-measured directly, not estimated.

- **Mocked unit suite:** `npx jest` → **46 suites / 584 tests, 0 failures**
  (baseline before this branch: 46 / 569; +15).
- **e2e suite (real Postgres + Redis via docker-compose):**
  `npm run test:e2e` → **11 suites / 81 tests, 0 failures**.
  `test/account-deactivation.e2e-spec.ts` (new, 4 tests):
  - **The full sequence the brief demands**, against real Postgres:
    `create → deactivate (auth'd) → reactivate (unauth'd) → deactivate
    again → delete-from-inactive (unauth'd) → assert pending_deletion +
    pendingDeletionAt set + login/reactivate now rejected → run
    AccountDeletionSweepService.sweepPendingDeletions(now + 31 days) →
    assert the User row is genuinely hard-deleted`.
  - `delete-inactive-account` refuses an `active` account.
  - A deactivated author's post disappears from a follower's
    `GET /posts/feed` and `GET /posts/:id` 404s, then **both restore on
    reactivate** with no backfill.
  - A deactivated user drops out of another user's `/followers` list, and
    their own `/followers` 404s.
- `npx tsc --noEmit`, `npm run lint`, `nest build` — all clean.
- `schema.prisma` diff: **empty**. `User.isMinor` / `guardianId` (n/a) /
  `Guardian.consentStatus` / `consentToken` / `consentTimestamp` are
  read-only in every line touched.

---

## 6. Not done — out of scope / flagged

- **Post-action success/status API** — nothing tells a user "your deletion
  is scheduled, N days left" if they sign back in during the grace
  window. The Figma half (Decision Log #220) flagged the equivalent
  screen gap. Not in this brief.
- **Guardian/minor deactivation variant** — a restricted-pending or
  guardian-managed minor deactivating may warrant a guardian
  notification. Not designed, not in the brief.
- **`apps/web` wiring** — `POST /auth/delete-inactive-account` has no
  frontend caller yet; that's a `figma-to-code` follow-up against the
  Decision Log #220 screens.
- **The comment / saved-posts / search / leaderboard items** above — each
  flagged in place with the reasoning and the one-line fix where one
  exists.
