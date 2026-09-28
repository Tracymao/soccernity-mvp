# admin-staff-roles module

Build target: **feat/admin-role-management** (backend-api) — the
`AdminUser.role` (`editor | moderator | superadmin`) role-management
endpoints the apps/admin Settings/Roles screens
(`SettingsRolesPage.tsx`/`RoleFormPages.tsx`) were built as a disclosed
stub for, per those files' own header comments:

> `// STUB: there is NO admin role-management endpoint. AdminUser.role
> is a fixed enum ... with no self-service way to change it`

`admin-action-log.constants.ts` had already reserved
`ADMIN_ACTION_LOG_ACTIONS.ADMIN_ROLE_CHANGED` (`admin_user.role_changed`)
for exactly this — see that module's own README's "Admin-user 'block'
vs. 'role-change'" section, which confirmed (by grep across
`src/modules` and by checking for a remote branch/PR at the time) that
no role-change endpoint or call site existed anywhere in this codebase.
This module is that endpoint.

Zero `schema.prisma` diff, zero new migration — `AdminUser.role` already
existed (a plain Postgres `String`, not a Prisma/Postgres enum).

---

## Endpoints

| Method & path | Guards | Purpose |
|---|---|---|
| `GET /admin/staff` | `AdminJwtAuthGuard` + `AdminRolesGuard('superadmin')` | List every `AdminUser` (id, email, fullName, role, accountStatus, createdAt). Keyset-paginated, optional exact-match `role` filter. |
| `PATCH /admin/staff/:id/role` | `AdminJwtAuthGuard` + `AdminRolesGuard('superadmin')` | Reassign the TARGET `AdminUser`'s `role` to one of `editor`/`moderator`/`superadmin`. |

| `POST /admin/staff` | `AdminJwtAuthGuard` + `AdminRolesGuard('superadmin')` | Provision a new `AdminUser` (Decision Log #191). Body: `email`, `fullName`, `role`, optional `temporaryPassword`. |

---

## Who may view — a deliberate divergence from the rest of Section 4.8

Every other Section 4.8 module that gates GET at all admits a second
role alongside `superadmin`: `ModerationModule`/`AdminUsersModule` admit
`moderator`; `AdminContentModule`/`MediaModule` admit `editor`. This
module admits **neither** — `GET /admin/staff` is `superadmin`-only, the
same shape `AdminStaffVettingModule`'s own `PATCH
/admin/users/:id/child-safety-vetting` already uses (that module has no
GET at all, but its own reasoning for superadmin-only access is the
direct precedent this module follows for both its routes).

**Reasoning**: an editor or a moderator has a real, ordinary task
elsewhere in the Admin Console that depends on visibility into *their
own job's* resource — a moderator needs `GET /admin/users` (platform
Users) to actually moderate; an editor needs `GET /admin/articles` to
actually edit. Neither role has any task anywhere in this codebase that
depends on seeing the full roster of admin/moderator/superadmin staff
accounts and their exact role assignments. Deciding who else gets
visibility into (and, separately, write access over) who holds what
level of trust on this platform is a step above ordinary
moderation/editorial access — the same category `AdminStaffVettingModule`'s
own README already argues for child-safety vetting: "Deciding who is
trusted with child-safety vetting is a step above ordinary
report-moderation access; only a superadmin may record it." Deciding
*who is trusted with what role at all* sits at least as high.

---

## Naming: a dedicated `admin/staff` prefix, not a third meaning for `admin/users`

`AdminUsersController` already uses `admin/users` for platform `User`
management, and `AdminStaffVettingController` already reuses the same
prefix — disclosed as a deliberate overlap — for `AdminUser` child-safety
vetting. That controller's own header comment explicitly warns: "a
future reader should not assume both routes act on the same model just
because they share a prefix." Reusing the same prefix a THIRD time, for
a third distinct concern (role assignment) on the same `AdminUser`
resource the vetting module already overlaps onto, would compound
exactly the confusion that comment exists to flag rather than resolve
it. This module instead uses its own, unambiguous prefix — `admin/staff`
— naming the resource (AdminUser staff accounts) directly. No route
collision risk either way: `admin/staff` is a completely distinct path
segment from `admin/users`.

**Why a dedicated module, not folded into `AdminStaffVettingModule`**:
despite being the same `AdminUser` resource, role assignment and
child-safety vetting are different concerns with different guard
histories and different write shapes — the same "one module per
Section 4.8 sub-resource" precedent `admin-users/README.md` and
`admin-staff-vetting/README.md` both already state for why
Moderation/AdminContent/AdminUsers/AdminStaffVetting are four separate
modules despite all being Section 4.8 admin surfaces.

---

## Write shape: role-only, no self-role-change restriction, one safety guard

`UpdateAdminRoleDto` accepts a single required `role` field. This
endpoint writes **only** `AdminUser.role` — `fullName`/`email`/`phone`
already have `PATCH /admin/profile` (self-service only);
`childSafetyVetted`/`vettedAt`/`vettedByAdminId` already have `PATCH
/admin/users/:id/child-safety-vetting`; `accountStatus` has no write
path for `AdminUser` at all yet (see "Not built" below) and this
endpoint does not add one.

**No self-role-change restriction is imposed** — mirrors
`AdminStaffVettingService.setChildSafetyVetting`'s own "nothing in the
task brief asked for this to be blocked" precedent. A superadmin may
change their own role, including demoting themselves.

**The one safety guard this module adds beyond the literal task ask,
disclosed rather than silently built in**: demoting the LAST remaining
active superadmin is rejected with a `409`. There is no self-service
admin/moderator registration endpoint (Decision Log #191) and — until
this module existed — no way to promote anyone to superadmin at all
short of a direct DB write. If every active superadmin account ever
demoted itself (or each other), this endpoint itself would become
permanently unreachable, and recovering would require exactly the same
direct-DB-insert Decision Log #191 already requires for account
creation. A single `COUNT` query — checked ONLY when the target's
*current* role is `superadmin` and the *new* role is not — closes that
one irreversible failure mode:

```ts
if (target.role === 'superadmin' && dto.role !== 'superadmin') {
  const remainingActiveSuperadmins = await this.prisma.adminUser.count({
    where: { role: 'superadmin', accountStatus: 'active', id: { not: targetAdminId } },
  });
  if (remainingActiveSuperadmins === 0) throw new ConflictException(...);
}
```

- Promotions (`editor`/`moderator` → anything, or anything →
  `superadmin`) never trigger the count query at all.
- A superadmin re-assigning themselves to `superadmin` (a no-op write)
  never trips the guard — the target's *current* role and the requested
  role are the same, so the `dto.role !== 'superadmin'` half of the
  condition is false.
- The count deliberately excludes the target itself (`id: { not:
  targetAdminId } }`) — so a genuinely sole superadmin cannot demote
  themselves either, the same as they could not be demoted by anyone
  else.
- **Deactivated superadmin accounts do not count as "remaining"** —
  `AdminUser.accountStatus` already exists (`active`/`deactivated`,
  mirrors `User.accountStatus`'s convention) and a deactivated admin
  cannot authenticate (`AdminAuthService.login()` already checks it), so
  counting a deactivated superadmin as a safety net would be a false
  sense of security.

This is a real, disclosed judgment call beyond the task's literal
"build endpoints to view and assign role" ask — flagged here rather
than silently added, matching this codebase's own "state the reasoning,
flag if uncertain" convention.

---

## Response shape: an explicit allowlist, never a spread of the raw row

`ADMIN_STAFF_SELECT` (`id`, `email`, `fullName`, `role`, `accountStatus`,
`createdAt`, plus `childSafetyVetted`/`vettedAt`/`vettedByAdminId` — see
below) is a Prisma `select` clause, not `{ ...adminUser }` — the
same "never leak `passwordHash`" discipline
`admin-response.mapper.ts`'s `toAdminSummary`,
`admin-users.service.ts`'s `USER_LIST_SELECT`, and
`admin-staff-vetting.service.ts`'s `ADMIN_STAFF_VETTING_SELECT` already
apply for their own resources. `accountStatus`/`createdAt` are included
on the list/write response even though this module never writes either
— the real conversion of `SettingsRolesPage.tsx` (see below) shows
whether a listed admin account is still active.

**`childSafetyVetted`/`vettedAt`/`vettedByAdminId` were added to this
select afterwards** (`apps/admin` frontend-conversion follow-up, not a
new endpoint or a schema change — all three columns already existed on
`AdminUser`, added by `schema/report-severity-escalation-admin-vetting-application`).
Reasoning: `AdminStaffVettingModule`'s own `PATCH
/admin/users/:id/child-safety-vetting` is PATCH-only — there is no GET
anywhere that exposes another admin's current vetting status — so once
`RoleFormPages.tsx`'s `EditRolePage` needed to render a real
vetted/not-vetted toggle for a specific admin, it had nothing to read
that state from. Rather than add a second GET endpoint duplicating
`GET /admin/staff`'s own per-admin lookup shape, this module's existing
select was widened to also carry the three columns — `GET /admin/staff`
and `PATCH /admin/staff/:id/role` are otherwise completely unchanged
(same guards, same DTOs, same write behaviour), and `PATCH
/admin/users/:id/child-safety-vetting` itself was NOT touched. This
module still never *writes* any of the three fields — `updateAdminRole`
only ever sets `role`; an existing vetting record survives a role
change untouched, and its own select was already this same constant.

---

## Matching the existing frontend stub — now converted

`SettingsRolesPage.tsx`'s roles table and `RoleFormPages.tsx`'s
`EditRolePage` (frontend follow-up, `feat/admin-roles-vetting-wiring`)
are wired to `GET /admin/staff` (the list) and `PATCH
/admin/staff/:id/role` (the Edit form's role reassignment), plus the
new child-safety-vetting toggle described above, wired to
`AdminStaffVettingModule`'s own `PATCH
/admin/users/:id/child-safety-vetting`. There is no `GET
/admin/staff/:id` — `EditRolePage` is reached from the roles list's own
"Edit" link, which passes the row's already-fetched `AdminStaffListItem`
via router `state` (the same `ReportDetailPage.tsx`/`MediaPreviewPage.tsx`
precedent); a direct visit or refresh falls back to
`apps/admin/src/api/adminStaff.ts`'s `findStaffById`, which re-lists
(bounded to a few pages) and searches client-side, same shape as
`findReportById`/`findMediaById`.

**`AddRolePage`/`DeleteRolePage` remain correctly out of scope and
correctly still stubs** — per Decision Log #191, there is still no
self-service admin/moderator account creation or deletion endpoint
anywhere in this codebase; "Add a New Role" is really "create an
admin/moderator account" (RoleFormPages.tsx's own header comment), which
this module's own task brief explicitly did NOT ask for ("view and
assign role", not "create or delete an account"). Building account
creation/deletion here would be real, unscoped new architecture (its
own password-provisioning/email-verification concerns) well beyond this
module's literal brief.

---

## Testing

**Mocked suite only** (`admin-staff-roles.service.spec.ts`,
`admin-staff-roles.controller.http.spec.ts`) — no e2e spec added.
`updateAdminRole` is a plain `prisma.adminUser.update()` write to an
existing `String` column, with a plain `count()` read as its one guard
— no raw SQL, no transaction, and no new relation/constraint (`role` is
not an FK and carries no unique/check constraint). None of
`test/README.md`'s three e2e-add triggers apply, the same conclusion
`admin-action-log/README.md` and `admin-content/README.md` already
reached for their own analogous plain-write/plain-read modules. Real
`AdminUser` row behaviour (a genuinely persisted `role` write against
Postgres) is exercised indirectly by every other e2e spec that already
seeds `AdminUser` rows with a specific role and asserts on
`AdminRolesGuard` behaviour (e.g.
`test/admin-staff-vetting.e2e-spec.ts`); none of those specs assert on
this module's own two routes, since this module didn't exist when they
were written.

Covers: role-gating (editor AND moderator both 403 on BOTH routes —
distinct from every other role-gated module in this codebase except
`AdminStaffVettingModule`, which all admit moderator on GET, superadmin
admitted on both); `GET /admin/staff`'s cursor/role-filter/pagination
logic (mirrors `admin-users.service.spec.ts`'s own shape); DTO
validation (missing/invalid `role`, an unrecognised extra field under
`whitelist: true, forbidNonWhitelisted: true`); the last-active-superadmin
guard (rejects when zero OTHER active superadmins remain, allows when at
least one does, never trips on a promotion or a same-role no-op write,
excludes the target itself from the count so a sole superadmin cannot
self-demote); that the response never leaks `passwordHash`; and the
`AdminActionLogService.record()` wiring (called only on a successful
write, with the CALLING superadmin as `adminId` and the TARGET admin as
`targetId`, action `admin_user.role_changed` — never called on the
404 or 409 rejection paths).

**Verification, all re-measured directly.** See this PR's own commit
message / PR description for the exact before/after suite counts.
`npx tsc --noEmit`, `npm run lint`, and `nest build` are all clean.

---

## Not built (flagged, not silently decided either way)

- **No `POST /admin/staff` (create an admin/moderator account) or
  `DELETE /admin/staff/:id`.** Per Decision Log #191, there is still no
  self-service admin/moderator registration — accounts are provisioned
  by direct DB insert. This PR's own task brief scoped strictly to
  "view and assign role," not account lifecycle; `AddRolePage`/
  `DeleteRolePage` in `RoleFormPages.tsx` correctly remain stubs.
- **No `GET /admin/staff/:id` (single-admin lookup).** `EditRolePage`'s
  own "no dedicated GET, use router state + a bounded fallback listing"
  workaround is disclosed above, matching the same real gap
  `api/moderation.ts`'s `findReportById` and `api/adminMedia.ts`'s
  `findMediaById` already carry for their own resources. A real one
  would remove that workaround entirely.
- **No append-only role-change HISTORY on `AdminUser` itself** — only
  the current `role` value is stored, same "this model only tracks the
  MOST RECENT state of an admin-recorded decision" limitation
  `admin-staff-vetting/README.md` already discloses for
  `vettedAt`/`vettedByAdminId`. A full history now exists in
  `AdminActionLog` (`admin_user.role_changed` rows), even though
  `AdminUser.role` itself doesn't carry it.
- **No rate limiting beyond the shared admin-console session/guard
  posture.** Every write here already requires a real superadmin
  session; no additional `@AuthRateLimit()`-style throttle was added,
  matching `AdminStaffVettingController`'s own precedent (that route
  also carries none).

---

## Files

```
admin-staff-roles.module.ts                       — wires AdminAuthFoundationModule + AdminActionLogModule
admin-staff-roles.service.ts                       — AdminStaffRolesService, all business logic
admin-staff-roles.controller.ts                    — GET /admin/staff, PATCH /admin/staff/:id/role
admin-staff-roles.constants.ts                     — ADMIN_USER_ROLES, page-size defaults
cursor.util.ts                                     — (createdAt, id) keyset cursor, this module's own copy
dto/list-staff-query.dto.ts
dto/update-admin-role.dto.ts
../admin-action-log/                               — AdminActionLogService.record(...) (own module, own README)
```


---

## POST /admin/staff � creating admin accounts (Decision Log #191)

Previously `AdminUser` rows could only be provisioned by direct DB insert.
`POST /admin/staff` (superadmin-only, same guards as the rest of this
controller) creates one from `email`, `fullName`, `role` and an optional
`temporaryPassword`.

- **Password convention.** No existing one to reuse:
  `PasswordResetService` is `User`-only, and nothing else creates an
  `AdminUser`. So: an admin-set password (min 8, same rule as
  `ChangePasswordDto`), or � if omitted � a random 16-char one returned
  **once** in the response as `temporaryPassword`. The new admin replaces
  it via the existing `POST /admin/auth/change-password`. The password is
  hashed with the shared `PasswordService` (argon2id), never logged, never
  written to the action log, never returned when admin-supplied.
- **Not built:** no must-change-on-first-login flag (no such `AdminUser`
  column; would be a schema change), no invite email, no admin
  set-password/reset flow. The first superadmin is still bootstrapped by
  direct DB insert.
- Email is trimmed + lower-cased (matching `AdminAuthService.login`);
  duplicates are a 409 (pre-check plus a `P2002` race backstop). Response
  is the same allowlist as the rest of this module (no `passwordHash`).
- Audited as `admin_user.created` (detail `role=<role>`).
