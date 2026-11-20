# admin-staff-vetting module

Build target: **schema/report-severity-escalation-admin-vetting-application**
(backend-api, 2026-09-27) — the application half of
`AdminUser.childSafetyVetted`/`vettedAt`/`vettedByAdminId`, laid down as
schema groundwork by `schema/report-severity-escalation-admin-vetting`
and flagged there as "no application code reads or writes any of these
three fields yet — no vetting endpoint, no gate on Report review keyed
to this flag." This module builds the vetting endpoint; the gate on
Report review lives in `ModerationModule` — see
`modules/moderation/README.md`'s own "The child-safety-vetting gate"
section, not duplicated here.

Zero `schema.prisma` diff, zero new migration — every field this module
reads/writes already existed.

---

## Endpoint

| Method & path | Guards | Purpose |
|---|---|---|
| `PATCH /admin/users/:id/child-safety-vetting` | `AdminJwtAuthGuard` + `AdminRolesGuard('superadmin')` | Set or unset `childSafetyVetted` (and `vettedAt`/`vettedByAdminId` together with it) on the target admin `:id`. |

**Superadmin ONLY** — not `moderator`, unlike every other role-gated
route in this codebase so far (`ModerationModule`, `AdminUsersModule`,
`AdminContentModule`, `MediaModule` all gate at `'moderator'`/`'editor'`
+ `'superadmin'`). Deciding who is trusted to review reports concerning
minors is a step above ordinary report-moderation access; only a
superadmin may record it.

---

## Disclosed naming overlap with `AdminUsersController`, not an accident

This controller's `@Controller('admin/users')` shares its URL prefix
with `../admin-users/admin-users.controller.ts`'s own `GET`/`PATCH
/admin/users*` — but the two operate on **completely different
resources**:

- `AdminUsersController`'s `:id` is a **platform `User`** id
  (`GET /admin/users`, `PATCH /admin/users/:id`).
- This controller's `:id` is an **`AdminUser`** id — an
  editor/moderator/superadmin staff account.

No route literally collides — Nest's router treats `:id` and
`:id/child-safety-vetting` as different path shapes — but a future
reader should not assume both routes act on the same model just because
they share a prefix. The literal path (`/admin/users/:id/child-safety-
vetting`) was given explicitly in this PR's own task brief; it was
honored as written rather than renamed to something like
`/admin/staff/:id/...`, with this overlap flagged here rather than
silently resolved either way.

**Why a dedicated module, not folded into `AdminModule` or
`AdminUsersModule`**: `AdminModule` is explicitly scoped to Admin
Console account/auth/profile only (Decision Log #54 —
`modules/admin/README.md`'s own "what this covers vs. what's still
Sprint 5" framing); vetting *another* admin is not a self-service
profile concern. `AdminUsersModule` manages a different resource
(platform `User` accounts) entirely — mixing an `AdminUser`-vetting
method into that controller/service would conflate two unrelated models
under one class, the same "one module per Section 4.8 sub-resource"
precedent `admin-users/README.md` already states for why Moderation/
AdminContent/AdminUsers are three separate modules despite all being
Section 4.8 admin surfaces.

---

## The write shape: `vettedAt`/`vettedByAdminId` move together with `childSafetyVetted`, not independently settable

`SetChildSafetyVettingDto` takes a single required boolean,
`childSafetyVetted`. `AdminStaffVettingService.setChildSafetyVetting`
writes all three fields together, in one direction each:

- **`childSafetyVetted: true`** → `vettedAt = now()`,
  `vettedByAdminId = ` the **calling** superadmin's id (not the target
  admin's own id) — a fresh record of who most recently confirmed this,
  and when.
- **`childSafetyVetted: false`** → `vettedAt = null`,
  `vettedByAdminId = null`.

**The `false` branch is a disclosed judgment call, not an obvious
default.** Unsetting clears the record rather than preserving who last
vetted the admin before it was revoked — this schema has no separate
"un-vetted by / un-vetted at" pair to record *that* action against.
Precedent for "this model only tracks the MOST RECENT state of an
admin-recorded decision, not a full history of it" already exists
elsewhere in this codebase: `Report.reviewedByAdminId`/
`.appealReviewedByAdminId` are overwritten on re-review the same way (see
`moderation/README.md`'s own "disclosed limitation" section on this
exact pattern). A richer append-only vetting-history entity (mirroring
`AdminActionLog`, itself still schema-only/unwritten-to) is a real,
flagged future option — not built here, genuinely out of this PR's
scope.

**No self-vetting restriction is imposed.** A superadmin may vet
themselves (`:id` equal to the caller's own id). Nothing in the task
brief asked for this to be blocked, and a superadmin recording their own
real-world DBS/background-check confirmation is a legitimate use —
proven directly by both a mocked and an e2e test.

**No per-role restriction on the TARGET.** Any `AdminUser` — editor,
moderator, or superadmin — may be vetted or un-vetted. `Report` review
access itself is still gated by role (`moderator`/`superadmin` only, via
`ModerationModule`'s own `AdminRolesGuard`) — vetting an `editor` has no
practical effect today (an editor can never reach `GET`/`PATCH
/admin/moderation/reports*` regardless of vetting status), but nothing
here prevents recording it, since role assignments can change later and
a vetting record shouldn't need to be re-created after a role promotion.

---

## Response shape: an explicit allowlist, never a spread of the raw row

`ADMIN_STAFF_VETTING_SELECT` (`id`, `email`, `fullName`, `role`,
`childSafetyVetted`, `vettedAt`, `vettedByAdminId`) is a Prisma `select`
clause, not `{ ...adminUser }` — the same "never leak `passwordHash`"
discipline `admin-response.mapper.ts`'s `toAdminSummary` and
`admin-users.service.ts`'s `USER_LIST_SELECT` already apply for their
own resources. **Deliberately NOT folded into `admin-response.mapper.ts`'s
shared `AdminSummary` shape** — that type backs `GET`/`PATCH
/admin/profile` (a different resource, "my own profile," used by every
admin regardless of role) and has no reason to grow vetting-specific
fields for every caller of it. A separate, narrower type
(`AdminStaffVettingSummary`) was defined here instead.

---

## Testing

**Mocked suite** (`admin-staff-vetting.service.spec.ts`,
`admin-staff-vetting.controller.http.spec.ts`) covers: 404 for a
non-existent target with no write attempted; the exact `data`/`select`
shape Prisma is called with on both the `true` and `false` branches
(proving `vettedByAdminId` is the CALLING admin, never the target's own
id, and that unsetting clears both timestamp fields); self-vetting; and,
at the HTTP layer, real `AdminRolesGuard` behavior — an `editor` **and**
a `moderator` are both rejected 403 (moderator being rejected is the
distinguishing case versus every other role-gated route in this
codebase, which all admit moderator), a superadmin is admitted, DTO
validation (missing/non-boolean `childSafetyVetted`, an unrecognised
extra field under `whitelist: true, forbidNonWhitelisted: true`), and
that the response never leaks `passwordHash`.

**A real e2e spec was added** (`test/admin-staff-vetting.e2e-spec.ts`) —
hits `test/README.md`'s third e2e trigger: `AdminUser.vettedByAdminId` is
a genuinely NEW self-relation FK (`AdminUser` → `AdminUser`) that no
application code had ever written to before this PR — a mock can't tell
you whether Prisma's self-relation write actually round-trips against a
real Postgres table. Proves, against real Postgres: role-gating (editor
AND moderator both 403, confirmed the target row is untouched); 404 for a
non-existent target; setting `true` genuinely persists `vettedAt`/
`vettedByAdminId`, confirmed by an independent second query resolving
`vettedByAdminId` back to the real seeded superadmin row (the actual FK
proof, not just trusting the HTTP response); unsetting genuinely clears
both fields back to `null`; self-vetting; and — the test this file
ultimately exists for — an end-to-end trace across BOTH this module and
`ModerationModule`: an unvetted moderator is blocked (list-filtered AND
403'd on direct action) from a real, seeded `concernsMinor: true`
`Report`, a superadmin then calls this endpoint, and the SAME moderator
— same access token, no re-login — can immediately see and action that
same report, proving the gate reads fresh from Postgres on the very next
request rather than anything cached in the token.

This route carries **no `@AuthRateLimit()`** at all (unlike
`POST /reports/public`), so none of the shared-`'auth'`-throttler
workarounds other e2e files in this suite need apply here.

**Verification, all re-measured directly**: mocked suite gained 2 new
suites / 12 new tests (4 in `admin-staff-vetting.service.spec.ts`, 8 in
`admin-staff-vetting.controller.http.spec.ts`) — full repo mocked suite
**102 suites / 1367 tests, 0 failures → 104 suites / 1403 tests, 0
failures** (this module's 12 tests plus 24 more added across
`moderation/*` in the same PR — see `moderation/README.md`'s own Testing
section for that split). e2e suite gained 1 new suite / 6 new tests —
full repo e2e suite (real Postgres/Redis via docker-compose,
`npm run test:e2e`) **26 suites / 250 tests, 0 failures → 27 suites / 263
tests, 0 failures** (this module's 6 tests plus 7 more added to
`test/moderation.e2e-spec.ts` in the same PR). `npx tsc --noEmit`,
`npm run lint`, and `nest build` are all clean.

---

## What this module does NOT do

- **No self-service vetting flow, no upload of a DBS/background-check
  document, no real-world verification of any kind.** This endpoint
  records a decision a superadmin has already made outside the system —
  it performs no verification itself, exactly as the task brief that
  dispatched this work specified.
- **`AdminUser.vettedAt`/`vettedByAdminId` still only ever hold the MOST
  RECENT state** — no change here, see "The write shape" section above.
  **Partially superseded by `feat/admin-action-log`, though**: every call
  to `setChildSafetyVetting` now also writes a genuinely append-only
  `AdminActionLog` row (`admin_user.child_safety_vetting_updated`,
  `notes: childSafetyVetted=<bool>`) — so a full history of every
  vet/un-vet call now exists in `AdminActionLog`, even though
  `AdminUser`'s own three fields still don't carry it themselves. See
  `modules/admin-action-log/README.md`.
- **No `apps/admin` UI.** No Figma frame exists for this yet, and none
  was built or converted here — this PR is `services/api` only. A
  superadmin-facing "vet this admin" action on the existing Users/Roles
  admin screens is a real, flagged follow-up, not built.
- **Does not touch `ModerationModule`'s own gate.** See that module's
  README for the gate itself — this module only ever sets the flag the
  gate reads.

---

## Files

```
admin-staff-vetting.module.ts                     — wires AdminAuthFoundationModule + AdminActionLogModule
admin-staff-vetting.service.ts                    — AdminStaffVettingService, all business logic
admin-staff-vetting.controller.ts                 — PATCH /admin/users/:id/child-safety-vetting
dto/set-child-safety-vetting.dto.ts
../admin-action-log/                              — AdminActionLogService.record(...) (own module, own README)
```
