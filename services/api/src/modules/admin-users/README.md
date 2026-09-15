# admin-users module

Build target: **Sprint 5** — Section 4.8 (Admin Service), the
platform-user management half. Built by
`sprint-5/admin-users-dashboard-backend` (backend-api, 2026-09-15),
alongside the Dashboard module (`modules/admin-dashboard/`) — sequenced
together per the task brief, since two of the Dashboard's three real
stats are User-table reads this module already touches.

Backs `apps/admin/src/pages/users/UsersPage.tsx` — previously a
self-documented STUB ("GET /admin/users and PATCH /admin/users/:id are
not built"). This PR converts it to real data
(`sprint-5/admin-users-dashboard-frontend` is the second half of this
same branch, not a separate PR). `UsersPage.tsx` is the platform-user
list (Username/Date Joined/Status, Block/Delete row actions) — **not**
admin-role management (Decision Log #142 already corrected this misread
once; this module does not repeat it).

`User.accountStatus` gains a fourth real value, `"suspended"` — a plain
comment update on an already-`String` column, **no migration**. See
"The 'suspended' Decision Log candidate" below for the full reasoning.

---

## Endpoints

| Method & path | Guards | Purpose |
|---|---|---|
| `GET /admin/users` | `AdminJwtAuthGuard` + `AdminRolesGuard('moderator', 'superadmin')` | The platform-user list, keyset-paginated, optional `?status=` filter (any of the four real `accountStatus` values). |
| `PATCH /admin/users/:id` | same | Exactly one action per call: `active`, `suspended`, or `deleted`. |

Both routes are **not** literal Section 4.8 lines — the section names
`GET`/`PATCH /admin/users` only in passing, with no defined query/body
shape. Built anyway (see the Decision Log candidates below), per the
task brief's own explicit instruction to state back the two real
decisions this module required before building.

---

## Decision Log candidate #1: "suspended" — a new, ADMIN-only `accountStatus` value

**Stated back before building, per the task brief's own instruction.**
`User.accountStatus` had three values before this PR: `"active"`,
`"deactivated"` (self-service, reversible via
`POST /auth/reactivate-account`), `"pending_deletion"` (self-service, no
self-service undo). None of the three fit "an admin blocks a user" —
reusing `"deactivated"` was explicitly considered and rejected:
`"deactivated"` is **self-service-reversible by design**
(`AuthService.reactivateAccount` exists specifically to undo it), and an
admin-imposed block must **not** be undoable by the blocked user
themselves. Recommendation, implemented: a genuinely new value,
`"suspended"`, written only by `PATCH /admin/users/:id`, and — this is
the load-bearing part — **never** treated as reversible by any
self-service `AuthService` path. See `schema.prisma`'s own comment on
`User.accountStatus` for the same reasoning recorded at the field
itself, the same "document the reasoning in the guard/service code, not
just assumed" discipline `AdminRolesGuard`'s own trust-model comment
(Decision Log #295/moderation's own precedent) already established for
an analogous judgment call.

**Two real, confirmed gaps this introduction would otherwise have left
open — found by tracing every `accountStatus` branch in `AuthService`
against the new value, not assumed safe by default:**

1. `AuthService.reactivateAccount` only ever checked for
   `"pending_deletion"` up front, and further down only ever
   special-cased `"deactivated"` → `"active"`. A `"suspended"` user would
   have fallen through **both** checks unchanged and still been issued a
   working token pair — silently undoing an admin-imposed suspension
   through the self-service reactivation endpoint. **Fixed**: the same
   generic-message exclusion `"pending_deletion"` already gets is now
   also applied to `"suspended"`.
2. `AuthService.deactivateAccount`/`deleteAccount` had no
   `accountStatus` check on the caller at all. A suspended user holding a
   still-valid (not-yet-expired) access token — from before this
   module's own session-revocation call takes effect — could call
   `deactivateAccount()` within that brief window, flip their own status
   to `"deactivated"`, and **later self-reactivate** via the now-fixed
   `reactivateAccount()` (which *does* allow reactivating a
   `"deactivated"` account) — a two-step escape from suspension. **Fixed**:
   both methods now reject a `"suspended"` caller with the same generic
   `"Invalid credentials"` message, checked after password verification
   (matching `login()`'s own ordering).

`AuthService.login()` needed **no code change** — its existing
`accountStatus !== 'active'` generic-message branch already covers any
future non-`'active'` value, `"suspended"` included. Extended in comment
only, to state explicitly that this was checked, not assumed.

**Why `"suspended"` gets the same generic `"Invalid credentials"`
message as `"pending_deletion"`, not a distinct one like
`"deactivated"`'s**: the established precedent in this codebase (see
`login()`'s own comment) is that a distinct message is only useful when
it points at a real, actionable next step — `"deactivated"` gets one
because `POST /auth/reactivate-account` exists. `"suspended"` has no
self-service next step by design (only `PATCH /admin/users/:id` can move
it back to `"active"`), so revealing it would tell an attacker who
already has the correct password something they can't act on anyway —
generic, same as `"pending_deletion"`.

**Not resolved here, a real open question**: whether a suspended user
should ever see a *different, informative* message (e.g. "contact
support") once a support/appeals channel exists. Out of scope — no such
channel exists in this codebase yet.

---

## Decision Log candidate #2: admin-triggered delete skips the 30-day grace period

**Stated back before building, per the task brief's own instruction.**
Two real options existed: (a) reuse the self-service
`accountStatus = 'pending_deletion'` flow as-is, letting an
admin-triggered delete sit through the same 30-day grace period a
self-service request does, or (b) delete immediately, reusing the
underlying hard-delete mechanism directly but skipping the grace period
entirely. **Recommendation, implemented: (b)** — an admin-triggered
delete is a moderation action, not a self-service request, and there is
no product reason a platform-safety removal should sit in a reversible
limbo waiting for tomorrow's 3am sweep.

**Reuses `AccountDeletionSweepService.hardDeleteUser` directly** — made
`public` by this PR (was `private`; see that file's own updated
comment) specifically for this second caller, rather than
re-implementing the Guardian-snapshot + `ConsentAuditRecord` + cascade
sequence a second time. One real deletion primitive, two entry points:
the scheduled sweep (30-days-past-due `pending_deletion` rows only,
unchanged) and this module (immediate, on demand). `sweepPendingDeletions`/
`runDailySweep` themselves are **untouched** — the admin path never goes
through either, it calls `hardDeleteUser` directly. Sessions are
revoked first (`TokenService.revokeAllSessionsForUser`, the same
mechanism `AuthService.deactivateAccount`/`deleteAccount` already use),
so a still-live access token stops working immediately rather than
lingering until natural expiry.

**The DTO value is `"deleted"`, deliberately NOT `"pending_deletion"`**
— using the existing self-service value here would misleadingly imply a
30-day window that doesn't apply, and there is no resting
`accountStatus` value for this action at all (the row is gone, not
transitioned through an intermediate state first).

---

## Who may act: role-gating (mirrors Moderation, not Articles/Categories)

`AdminRolesGuard('moderator', 'superadmin')` on the **entire** controller
— GET included, no view-vs-mutate split, mirroring
`AdminModerationController`'s exact shape rather than
`AdminArticlesController`/`AdminCategoriesController`'s
(`'editor', 'superadmin'`). Blocking/suspending/deleting a platform user
is moderation-adjacent work — `AdminUser`'s own schema comment already
frames the job split as "authors Articles; actions Reports," and
managing platform users sits squarely on the "actions Reports" side, not
the editorial one. Reuses the exact `AdminRolesGuard`/`@AdminRoles(...)`
infrastructure `modules/admin/guards/` already exports — no new guard
class.

---

## No per-status-machine restriction beyond the two real write values

An admin may move **any** user into `active` or `suspended` from
**whatever** their current `accountStatus` is — including
`deactivated` or `pending_deletion` — not just from `active`. This is a
deliberate, disclosed choice: it is a moderation action, not bound by
the self-service state machine those two states belong to. One concrete
consequence: an admin can undo an accidental (or coerced) self-deletion
request within the grace window by setting `active`, which also clears
a stale `pendingDeletionAt` in the same write so
`AccountDeletionSweepService`'s own query (`accountStatus =
'pending_deletion'`) can never pick that row up again — data hygiene,
not a functional requirement (the sweep already wouldn't match on
`accountStatus` alone).

---

## Testing

**Mocked suite** (`admin-users.service.spec.ts`,
`admin-users.controller.http.spec.ts`) covers the branching/guard logic
a mock can prove: keyset pagination + status filter, both write branches
(`active`/`suspended` — session revocation only on suspend, not on
reactivation; the stale-`pendingDeletionAt`-clearing case), the
`deleted` branch (revoke-then-`hardDeleteUser`, never a plain
`accountStatus` update), 404 for a non-existent user, and role-gating +
DTO validation at the HTTP layer (an `editor` gets 403; `deactivated`/
`pending_deletion` are rejected 400 by `UpdateUserStatusDto`'s own
allow-list, since this route can never write either).

`auth.service.spec.ts` gained a new describe block proving the two real
gaps above are closed: a suspended account cannot log in (generic
message), cannot be reactivated via `reactivateAccount()` even with
correct credentials, and cannot self-deactivate or self-delete via
`deactivateAccount()`/`deleteAccount()`.

**A real e2e spec was added** (`test/admin-users.e2e-spec.ts`) — this
hits `test/README.md`'s fourth e2e trigger
(`admin-auth-isolation.e2e-spec.ts`'s own precedent): proving a security
property that depends on the whole, really-bootstrapped app, not one
class in isolation. Specifically: a real `PATCH /admin/users/:id`
suspend really revokes a real, previously-issued refresh token (proven
via a real `POST /auth/refresh` call, not just trusting the response
body); a real admin-triggered delete really removes the `User` row from
real Postgres immediately (`findUnique` returns `null`, no
`pending_deletion` limbo); and — the two tests this file exists for —
a real `POST /auth/login` and a real `POST /auth/reactivate-account`
both genuinely reject a suspended account end to end. Both of those two
routes carry `@AuthRateLimit()` (a shared 5-requests/60s `'auth'`
bucket) — this file makes exactly two real calls to those two routes
combined, well under the limit, so one shared app instance suffices (no
need for `account-lifecycle.e2e-spec.ts`'s own two-describe-block
split). Also covers role-gating (editor → 403) and list filtering
against real seeded rows.

**Verification, all re-measured directly**: mocked suite **67 suites /
949 tests, 0 failures → 72 suites / 982 tests, 0 failures** (5 new
suites — 2 for this module, 2 for `admin-dashboard`, 1 for
`month.util.ts` — plus 4 new tests added to the existing
`auth.service.spec.ts`). e2e suite (real Postgres/Redis via
docker-compose) **17 suites / 161 tests, 0 failures → 18 suites / 170
tests, 0 failures** (1 new suite, 9 new tests — every pre-existing e2e
suite re-run and still green alongside the new file, not just the new
file in isolation). `nest build` + `npm run lint` both clean.

---

## What this PR does NOT do

- **Does not wire `PATCH /admin/moderation/reports/:id`'s
  `user_suspended` action to this module.** That action already existed
  (Decision Log — see `moderation/README.md`'s own disclosed limitation:
  "recording `user_suspended` does not itself touch `User.accountStatus`").
  This PR makes the underlying mechanism real and callable
  (`PATCH /admin/users/:id { status: 'suspended' }`), but does **not**
  automatically call it from `ModerationService.actionReport` — that is a
  separate, cross-module decision (should actioning a report as
  `user_suspended` *automatically* suspend the target user, or should a
  moderator do both explicitly?) deliberately left for a follow-up, not
  decided unilaterally here. Noted explicitly so a future pass has
  something concrete to wire, per the task brief's own instruction.
- **No `Add Member` endpoint.** Section 4.8 defines no
  admin-user-creation route, and users self-register on this platform by
  design. `UsersPage.tsx`'s "Add Member" button stays disabled with a
  disclosed note — flagged as a Decision Log candidate for the founder to
  decide if an admin-initiated registration path is ever actually
  needed, not built speculatively.
- **No audit trail** of who suspended/deleted a user beyond application
  logs (`Logger.log`, includes the acting admin's id) — no schema field
  records it. A future pass wanting a real audit trail should follow the
  `ModerationService`/`Report.reviewedByAdminId` precedent rather than
  inventing a new shape.

---

## Files

```
admin-users.module.ts       — wires AdminAuthFoundationModule + AuthFoundationModule + AccountDeletionModule
admin-users.service.ts      — AdminUsersService, all business logic
admin-users.constants.ts    — ADMIN_USER_WRITE_STATUSES, ADMIN_USER_ACTIONS, ADMIN_USER_FILTER_STATUSES, page sizes
cursor.util.ts              — this module's own (createdAt, id) keyset cursor
admin-users.controller.ts   — GET/PATCH /admin/users*
dto/list-users-query.dto.ts
dto/update-user-status.dto.ts
```
