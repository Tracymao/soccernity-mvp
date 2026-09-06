# Sprint 2 — apps/admin PR 6: Users (disclosed stub)

**Branch:** `sprint-2/admin-users-stub` — stacks on PR 5 (`sprint-2/admin-articles-categories-stub`, #196).
**Figma:** `917:218` ("Users - team members").

## Why a stub

`GET /admin/users` and `PATCH /admin/users/:id` are not built (Build Plan Section 4.8).

## What this PR ships

`/users` renders the real layout: a sample table (Username / Date Joined / Status / block-delete row actions) + a disabled **Add Member** button. Dashed disclosure banner names the missing endpoints.

An on-screen note repeats **Decision Log #142** — this is the platform-user list (status, block, delete), **not** admin/moderator role management (correcting PR #124's original misread of this screen).

## Verification

- apps/admin vitest — **12 files / 44 tests, 0 failures** (`UsersPage.test.tsx` +1)
- `npx tsc --noEmit`, `npm run lint`, `npm run build` — clean

**Decision Log #236.** Not merged — founder's call. Next: PR 7 `sprint-2/admin-media-stub`.
