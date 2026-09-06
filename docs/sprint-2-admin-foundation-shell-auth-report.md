# Sprint 2 — apps/admin foundation: shell + isolated admin auth + routing (PR 1 of ~10)

**Agent:** figma-design-system (one-time cross-assignment — this is figma-to-code work; see CLAUDE.md precedents PRs #98/#102/#110/#130 the other direction. Founder-assigned.)
**Branch:** `sprint-2/admin-foundation-shell-auth`
**Date:** 2026-09-06
**Scope:** the foundation the other 9 Admin Console conversion PRs build on. No section screen is converted here.

---

## What this PR ships

`apps/admin` was a bare scaffold (`App.tsx` = one `<div>`). It now has:

| Area | File(s) | Backend |
|---|---|---|
| **Admin Shell** (sidebar + top bar) | `src/layout/AdminShell.tsx` + `.css`, `src/layout/adminNav.ts` | — (from Figma `6014:12948`) |
| **Isolated admin auth** | `src/lib/adminSession.ts`, `src/api/adminClient.ts`, `src/api/adminAuth.ts`, `src/auth/AdminAuthContext.tsx`, `src/auth/RequireAdminAuth.tsx` | ✅ `POST /admin/auth/{login,refresh,logout}`, `GET /admin/profile` (Decision Log #54) |
| **Login screen** (no Figma source) | `src/pages/AdminLoginPage.tsx` + `.css` | ✅ `POST /admin/auth/login` |
| **Routing** | `src/app/routes.tsx` (`adminRoutes` + `router`), `src/App.tsx`, `src/main.tsx` | — |
| **Per-section placeholder** | `src/pages/AdminSectionPlaceholder.tsx`, `src/layout/AdminPageHeader.tsx` + `.css`, `src/pages/AdminNotFound.tsx` | discloses each section's real backend gap |
| **Theme + tokens** | `src/theme/adminTheme.ts`, `src/styles/global.css` | — (`@soccernity/shared` colors) |
| **Config** | `package.json` (+ testing deps), `vite.config.ts` (vitest/jsdom), `.eslintrc.cjs` (matches apps/web), `index.html` | — |
| **Icons** | `src/assets/icons/*.svg` (8 Carbon nav glyphs + search + logo, exported from Figma, normalised to `currentColor`) | — |

`apps/admin` stays on **React 18 / react-router-dom 6** — it was deliberately left off apps/web's React 19 / React Router 8 upgrades (CLAUDE.md). `@testing-library/react` is pinned to `^14` (last major supporting React 18).

---

## Isolated admin auth — the important part

The Admin Console authenticates **only** against the AdminUser path (Decision Log #54): its own JWT signing secret (`ADMIN_JWT_SECRET`), an `aud: "admin-console"` claim, a disjoint `admin:refresh:*` Redis namespace. A User token and an admin token are mutually unusable — proven by `services/api/test/admin-auth-isolation.e2e-spec.ts`.

`apps/admin` reflects that boundary:

- **Own storage keys** — `sn_admin_access_token` / `sn_admin_refresh_token` (localStorage). Never `apps/web`'s `sn_access_token`. A test asserts this.
- **Own client** — `adminClient.ts` attaches the admin bearer and, on a 401, transparently refreshes once against `POST /admin/auth/refresh` and retries the original request; a burst of concurrent 401s triggers exactly one refresh (shared in-flight promise); a refresh that itself 401s ends the session (`onAuthLost` → clear + route to `/login`).
- **Own context** — `AdminAuthContext` is the single owner of session state (`loading` / `authenticated` / `unauthenticated` + the `AdminSummary`). apps/web never built an AuthContext for itself (its `session.ts` flags this as owed follow-up); the Admin Console gets one from the start because nothing here is public.
- **No import from `apps/web`** — they are separate Vite builds; `apps/admin` cannot resolve `apps/web` anyway, and nothing tries.

Boot sequence: if a stored access token exists → `GET /admin/profile` (hydrates the sidebar identity **and** validates the token; a 401 that can't be refreshed lands on `/login`, not a half-authenticated shell). No token → straight to `unauthenticated`.

---

## The Admin Shell

From the shared Figma "Admin Shell" component (`6014:12948`, 10 `Active` variants):

- **260px sidebar** (navy @ 12% wash): Soccernity logo, the signed-in admin's identity block (initials avatar + real full name + title-cased role, links to `/profile`), the 8-item nav, **Settings pinned to the bottom**. Active item = navy fill + white text; inactive = white fill + navy text. Carbon icons, recoloured via CSS mask + `currentColor`.
- **content region**: a top bar with the **Log Out** action, then the routed screen (`<Outlet/>`).
- The Figma shell's **search pill** and **configurable primary action button** are per-screen (Dashboard has no action; "Articles" has "Create Article"; etc.), so they live in `AdminPageHeader`, not the shell. The search field renders **disabled and disclosed** — there is no admin search endpoint anywhere in `services/api`.

---

## Backend reality — verified against Build Plan §4.8 and `services/api/src/modules/admin/README.md`

Only **two controllers** exist in the admin module: `admin-auth` and `admin-profile`. Plus `contest-admin` (`@Controller('admin/contest')`) for the Contest state machine.

| Section (10) | Endpoint(s) intended (§4.8) | Built? |
|---|---|---|
| Auth / Profile | `/admin/auth/*`, `GET/PATCH /admin/profile` | ✅ (Decision Log #54) |
| Dashboard | `GET /admin/dashboard/stats` | ❌ |
| Articles | `POST /admin/articles`, `PATCH /admin/articles/:id` | ❌ (and no list endpoint in §4.8) |
| Users | `GET /admin/users`, `PATCH /admin/users/:id` | ❌ |
| Moderation | `GET /admin/moderation/reports`, `PATCH .../:id` | ❌ (Sprint 5 — Decision Log #135/#189) |
| Categories | `POST /admin/categories` | ❌ (no list endpoint in §4.8) |
| Contest | `POST /admin/contest/{cycles, cycles/:id/rounds/:week/results, cycles/:id/final/open, cycles/:id/crown}` | ⚠️ write-only state machine (Decision Log #218/#219); **no admin read endpoint**; Figma "task" screens don't map to `ContestCycle`/`ContestRound` |
| Competitions | — (no §4.8 line) | ❌ (umbrella parked — Decision Log #72/#73) |
| Media | `GET /admin/media`, `POST /admin/media/upload` | ❌ (and no file storage configured) |
| Settings / roles | — (no §4.8 line) | ❌ (role enum fixed; no self-service provisioning — Decision Log #191) |

Each unbuilt section's route renders `<AdminSectionPlaceholder>` with that exact note visible to the operator. Later PRs replace the placeholder with the real (often still stub) screen.

---

## Judgment calls (Decision Log #231 — flagged, not silently made)

1. **Admin login screen has no Figma source** → built plain and on-brand (`AdminLoginPage.tsx`), same precedent as apps/web's ClubPickerStep / "Manage Account" panel. Non-enumerating 401 → single "Invalid email or password" message.
2. **Disclosed-stub pattern** (`AdminSectionPlaceholder`) — the baseline the 9 later PRs replace section by section. Not a "coming soon" state — it names the design that exists and the backend that doesn't.
3. **Identity hydration (`GET /admin/profile`) overlaps PR 2's scope** — done here anyway so the shell never ships a hardcoded name. PR 2 builds the *editable* screen.
4. **Montserrat loaded from Google Fonts** in `index.html` — apps/web doesn't; the Admin Shell design is Montserrat throughout and this is an internal tool.
5. **`--sn-text-on-navy` defined locally** (static `#FFFFFF`, light-only) not promoted to `@soccernity/shared` — that object drives apps/web's typed CSS var map; promoting it is a figma-design-system token pass, not this PR's job.
6. **Sidebar wash = literal `rgba(40,46,101,0.12)`** — no navy-tint token exists; same call Decision Log #199 already made for the Figma shell.
7. **No invented error colour** on the login screen — navy-on-tint + border + the message text carries the information, matching apps/web's `Auth.css` convention.

---

## Verification

- `npx tsc --noEmit` (apps/admin) — clean
- `npm run lint --workspace=apps/admin` — clean (eslintrc updated to match apps/web's `@typescript-eslint/no-unused-vars` config)
- `npm run build` (full workspace) — clean; apps/admin bundle 236 kB / 77 kB gzip
- `npm run test --workspace=apps/admin` — **7 files / 28 tests, 0 failures**:
  - `adminSession.test.ts` (5) — store/get/clear, admin-prefixed keys distinct from apps/web, token decode
  - `adminClient.test.ts` (4) — bearer attach, refresh-once-and-retry on 401, `onAuthLost` on refresh failure, no refresh for `auth:false`
  - `AdminAuthContext.test.tsx` (5) — boot without/with token, 401-after-refresh ends session, login stores + authenticates, logout clears
  - `RequireAdminAuth.test.tsx` (3) — loading splash / redirect / render outlet
  - `AdminLoginPage.test.tsx` (4) — form renders, submit → navigate, 401 error stays on page, already-authed redirect to remembered destination
  - `AdminShell.test.tsx` (4) — all 10 nav items + outlet, real name/role, generic fallback, logout → `/login`
  - `app/routes.test.tsx` (3) — real route tree via `useRoutes`: deep-link redirect to `/login`, authenticated shell + placeholder, not-found
- Dev-server smoke test — `apps/admin` served, `/` and `/login` return the app, `main.tsx` transforms.
- **No real browser / Playwright check available** in this environment — same verification ceiling as every apps/web figma-to-code PR.

---

## The remaining 9 PRs (unchanged from the confirmed plan)

2. `sprint-2/admin-profile-and-password` — Admin Profile (real) + Change Password
3. `sprint-2/admin-moderation-stub`
4. `sprint-2/admin-dashboard-stub`
5. `sprint-2/admin-articles-categories-stub`
6. `sprint-2/admin-users-stub`
7. `sprint-2/admin-media-stub`
8. `sprint-2/admin-competitions-stub`
9. `sprint-2/admin-contest` (partial backend)
10. `sprint-2/admin-settings-roles-stub`

Not merged — founder's call after review.
