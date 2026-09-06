# Sprint 2 — apps/admin PR 2: Admin Profile + Change Password

**Agent:** figma-design-system (one-time cross-assignment to figma-to-code work, founder-directed)
**Branch:** `sprint-2/admin-profile-and-password` — **stacks on PR 1** (`sprint-2/admin-foundation-shell-auth`, PR #192). Reviewer merges #192 first.
**Date:** 2026-09-06
**Figma:** `5403:7327` ("Admin - Admin Profile") + card `5405:7173`.

---

## Why this is PR 2

Admin Profile + Change Password is the **only** Admin Console area with real end-to-end backend: `GET/PATCH /admin/profile` and `POST /admin/auth/change-password` are all built (Decision Log #54). Converting it second (right after the foundation) establishes the real-wiring pattern — isolated auth client, `AdminApiError` handling, disclosed read-only fields — that the remaining stub PRs reference.

---

## What this PR ships

| | File | Backend |
|---|---|---|
| **Admin Profile page** (view + edit + change-password) | `src/pages/AdminProfilePage.tsx` + `.css` | ✅ `GET/PATCH /admin/profile`, `POST /admin/auth/change-password` |
| Profile / change-password clients | `src/api/adminAuth.ts` (+`updateAdminProfile`, `changeAdminPassword`) | ✅ |
| `applyProfile()` on the auth context | `src/auth/AdminAuthContext.tsx` | — |
| Route | `src/app/routes.tsx` — `/profile` now renders the real page (was `AdminSectionPlaceholder`) | — |

The identity block in the shell sidebar (PR 1) links here; a successful profile edit updates that block immediately via `applyProfile`.

---

## Screen behaviour

**View mode** (matches the Figma): Full name / Email address / Role / Phone as read-only value boxes, plus **Edit Profile** and **Change Password** actions.

**Edit mode** (Figma has the button, not the mode): Full name + Phone become inputs. **Email and Role stay read-only** with a disclosed *"Email and role are changed by a superadmin, not here"* note — `PATCH /admin/profile` rejects those fields both at the DTO (`forbidNonWhitelisted`) and the service allowlist; this client never sends them. Save → `PATCH /admin/profile` → `applyProfile(result)`.

**Change Password** (no Figma frame — the screen only has the button): an inline panel — current / new / confirm-new, with client-side match + `>= 8` checks before `POST /admin/auth/change-password`. Success copy: *"You've been signed out of every other Admin Console session"* — the backend's real behaviour (same session-revocation as `AuthService.changePassword`). A 401 → *"Your current password is incorrect."*

---

## Judgment calls — Decision Log #232

| | Call |
|---|---|
| (a) | **Change Password built plain** — inline panel, no Figma frame exists; disclosed. Same precedent as PR 1's login screen. |
| (b) | **Email/Role read-only in edit mode**, shown-but-locked with a note (not hidden) — mirrors apps/web's `EditProfileModal` disabled-field pattern. |
| (c) | **Role display labels** — `editor`/`moderator`/`superadmin` → "Editor"/"Moderator"/"Super Admin" (matches the Figma's "Super Admin" text), plain title-case fallback. |
| (d) | **Value-box height** — Figma's fixed 100px value boxes read as empty for a one-line value; used a comfortable min-height (disclosed deviation). |
| (e) | **Initials avatar**, not the Figma stock photo — `AdminUser` has no avatar column. |
| (f) | **`applyProfile()` added to `AdminAuthContext`** so a PATCH updates the shell identity without a refetch. |

No invented error colour — navy-on-tint + border + informative text, matching apps/web's `Auth.css` and PR 1's login screen.

---

## Verification

- `npx tsc --noEmit` (apps/admin) — clean
- `npm run lint` / `npm run build` (apps/admin) — clean
- `npm run test --workspace=apps/admin` — **8 files / 35 tests, 0 failures** (`AdminProfilePage.test.tsx` +7: view read-only, edit is fullName/phone-only with locked email/role, PATCH + `applyProfile`, change-password client-side mismatch/short rejects without an API call, success other-sessions message, 401 wrong-current-password)
- dev-server smoke — `/profile` served, no console errors
- **No real browser / Playwright check available** — same ceiling as every apps/web figma-to-code PR

---

## Next: PR 3 — `sprint-2/admin-moderation-stub` (Moderation Queue / Report Detail / Appeal Review — disclosed stubs, IA + DL #138 appeal-routing copy preserved).

Not merged — founder's call after review.
