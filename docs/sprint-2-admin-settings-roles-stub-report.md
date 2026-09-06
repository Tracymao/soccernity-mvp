# Sprint 2 — apps/admin PR 10 (final): Settings / Roles (disclosed stubs)

**Branch:** `sprint-2/admin-settings-roles-stub` — stacks on PR 9 (`sprint-2/admin-contest`, #200).
**Figma:** `1658:2303` (Roles list), `1658:2456` (Add a New Role), `1658:2592` (Edit Role), `5403:7205` (Delete Role).

## Why stubs

No admin role-management endpoint exists. `AdminUser.role` is a fixed enum (`editor | moderator | superadmin`), and there is no self-service admin/moderator registration — accounts are provisioned by direct DB insert (Decision Log #191). "Add a New Role" really creates an admin/moderator account.

## What this PR ships

| Screen | Route |
|---|---|
| Roles list | `/settings` — sample table (Name / Role / Edit-Delete) + Add Role link |
| Add a New Role | `/settings/roles/new` — name / email / role / password / confirm — **all disabled** |
| Edit Role | `/settings/roles/edit` — name / role — disabled |
| Delete Role | `/settings/roles/delete` — confirm; **Delete Role is navy, not red** (no destructive token) |

## This is the last of the ~10-PR Admin Console conversion

**All 10 sidebar sections now have real screens:**
- **Profile + Change Password** — fully wired to `/admin/profile` + `/admin/auth/change-password` (Decision Log #54, PR 2)
- **The other 8** — honest disclosed stubs (their Section 4.8 endpoints don't exist)

`src/pages/AdminSectionPlaceholder.tsx` is deleted (every route now has a real screen). `routes.tsx` / `adminNav.ts` / `App.tsx` header comments updated; `routes.test.tsx`'s placeholder assertion repointed to the Settings/Roles stub banner.

**Full dev-server smoke test:** all 16 real routes + a 404 path served HTTP 200 with a clean dev log.

## Verification

- apps/admin vitest — **16 files / 55 tests, 0 failures** (`settingsRoles.test.tsx` +3)
- `npx tsc --noEmit`, `npm run lint`, `npm run build` — clean

**Decision Log #240.** Not merged — founder's call.

---

## The full stack (PRs 1–10)

| PR | # | Section(s) | Backend |
|---|---|---|---|
| 1 | 192 (merged) | Shell + auth + login + routing | ✅ auth |
| 2 | 193 (merged) | Admin Profile + Change Password | ✅ profile/password |
| 3 | 194 | Moderation (3 screens) | ❌ Sprint 5 |
| 4 | 195 | Dashboard | ❌ |
| 5 | 196 | Articles + Categories (4) | ❌ |
| 6 | 197 | Users | ❌ |
| 7 | 198 | Media (4) | ❌ + no storage |
| 8 | 199 | Competitions (2) | ❌ parked |
| 9 | 200 | Contest (9) | ⚠️ 4 write endpoints, no read, no task model — **DL #239 open** |
| 10 | (this) | Settings / Roles (4) | ❌ DL #191 |
