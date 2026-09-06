# Sprint 2 — Account deactivation / deletion flow → code

**Branch:** `sprint-2/account-deactivation-to-code`
**Agent:** figma-to-code
**Date:** 2026-09-06
**Scope:** `apps/web` only. No `services/api` code touched.
**Decision Log:** #225 (new); forward-pointers on #220 / #221.
**Depends on:** PR K1 `sprint-2/account-deactivation-design` (#179, merged) +
PR K2 `sprint-2/account-deactivation-backend` (#180, merged). Both confirmed
merged to `main` before starting.

---

## 1. What was built

| Route | File | Figma | Endpoint |
|---|---|---|---|
| `/settings/deactivate` | `src/pages/settings/DeactivateAccountPage.tsx` | Intro `2924:7358` → Confirm `6213:15640` (mobile `5695:8262` / `6213:15617`) | `POST /auth/deactivate-account` |
| `/settings/delete-account` | `src/pages/settings/DeleteAccountPage.tsx` | `6225:14789` (mobile `6225:15024`) — Decision Log #222 | `POST /auth/delete-account` |
| `/account/inactive` | `src/pages/InactiveAccountPage.tsx` | `1662:2782` → `6217:14677` (mobile `5780:8679` / `6215:14657`) | `POST /auth/reactivate-account`, `POST /auth/delete-inactive-account` |

All three were `PlaceholderPage` stubs (deactivate/delete) or absent
(`/account/inactive`) before this PR. `PrivacySettingsPage`'s "Account
status" row already linked to the two `/settings/*` routes.

### `api/auth.ts` additions

- `reactivateAccount(email, password): Promise<LoginResponse>` — `POST
  /auth/reactivate-account`, 200 with the same token+user shape `login()`
  returns.
- `deleteInactiveAccount(email, password): Promise<void>` — `POST
  /auth/delete-inactive-account`, 204. Sets `pending_deletion` + starts
  the 30-day grace clock (same server path as `deleteAccount()`), never a
  hard delete.
- `AuthApiError` gains an optional `code` discriminator.
- `login()` now reads the 401 body; a message matching `/deactivat/i`
  (returned by `AuthService.login` **only after** the password verifies)
  throws `AuthApiError` with `code: "account_deactivated"`.

### Deleted

- `src/pages/PlaceholderPage.tsx` — its last two consumers became real
  pages; nothing else imported it (grep-confirmed).

---

## 2. Flow

```
Settings ─► /settings/deactivate ──(intro)──► (confirm: password)
                                                  │ POST /auth/deactivate-account
                                                  ▼
                                       session cleared, "…no time limit", 2.5s ─► /login

Settings ─► /settings/delete-account ─► (confirm: 30-day grace + password)
                                                  │ POST /auth/delete-account
                                                  ▼
                                       session cleared, "…30 days to cancel", 2.5s ─► /login

/login (correct password, deactivated account)
      │  login() → AuthApiError code:"account_deactivated"
      ▼
/account/inactive   (email+password carried in in-memory router state)
      ├─ "Activate account" ─► POST /auth/reactivate-account ─► store tokens ─► /
      └─ "Delete account" ─► (confirm: 30-day grace + password re-entry)
                                   │ POST /auth/delete-inactive-account
                                   ▼
                              "…30 days to cancel", 2.5s ─► /login
                              (login now gets the generic 401 — no way back in)
```

**Deactivation is indefinite** (founder-confirmed, Decision Log #220): the
corrected K1 copy is reproduced verbatim — no 30-day expiry on
deactivation itself; the 30-day clock is the *delete* choice only.

---

## 3. Judgment calls (flagged, not silently made)

1. **`login()` detects "deactivated" by string-matching the 401 body.**
   The backend returns a bare 401 for both a wrong password and a
   deactivated account; the distinct message is the only signal. A
   dedicated response code / 403 would be more robust. **Decision Log
   #225** — a small backend follow-up, no user-facing bug (a failed match
   just shows the normal wrong-password error).

2. **`/account/inactive` renders under `AuthChrome`'s logo-only Top Bar**,
   not the site Header the Figma frames draw. The person is not
   authenticated on this screen (their login was rejected), so a
   logged-in navbar with an avatar/messages cluster would be wrong — the
   same reasoning the four core auth routes use (Decision Log #172).

3. **Credentials carried via `location.state`, not re-prompted.** The
   backend returns "deactivated" *only after* the password verifies, so
   the interstitial has a known-good `{ email, password }`. It's passed
   in react-router's in-memory `location.state` (never persisted, never
   in the URL — same lifetime as component state). A refresh / direct
   visit loses it and redirects to `/login`. This is why the Figma
   Inactive frame has no password field.

4. **Delete-from-inactive re-asks for the password** even though it's
   already known — the Figma "Delete (Confirm)" frame shows the field and
   a deliberate friction step for a destructive action is the right call.

5. **`/settings/delete-account` built too**, though the literal brief is
   "the Settings deactivation UI + the Inactive Account screen". It was a
   live stub linked from the shipped `PrivacySettingsPage`, with the
   design (`6225:14789`, Decision Log #222) and backend
   (`POST /auth/delete-account`) already done — leaving it a stub would
   half-break that page.

6. **The Figma "Settings" nav rail + profile sidebar are not reproduced**
   on the two `/settings/*` pages — the same call `PrivacySettingsPage`
   made; a "Back to settings" link stands in for the frame's arrow-back.

7. **Post-action / grace-window status screens not built.** The pre-action
   confirm screens satisfy the brief's "don't let a user think it's
   instant" requirement; a "deletion scheduled — N days left" surface for
   someone who signs in during the grace window is additive scope (the
   same gap K1 §8 and K2 §6 flagged on their sides).

8. **`EditProfileModal.tsx`'s inline "Manage Account" deactivate/delete
   panel** now duplicates these dedicated routes. Left in place (it
   works, it's tested) as a valid secondary entry point — a consolidation
   follow-up, not done here.

---

## 4. Verification

- `npx tsc --noEmit` — clean.
- `npm run lint` — clean.
- `npm run build` — clean production bundle.
- `npx vitest run` — **26 files / 166 tests, 0 failures** (baseline
  22 / 146):
  - `src/pages/settings/DeactivateAccountPage.test.tsx` — +6
  - `src/pages/settings/DeleteAccountPage.test.tsx` — +6
  - `src/pages/InactiveAccountPage.test.tsx` — +7
  - `src/pages/account/accountLifecycle.test.tsx` — +1: a single
    `MemoryRouter` walk with the real page components and real
    react-router navigation (only `api/auth` mocked) through
    **deactivate (Settings) → login rejected as deactivated →
    interstitial → reactivate → signed back in → deactivate again →
    login rejected → delete-from-inactive (30-day grace) → account can no
    longer log in**. Mirrors `services/api`'s
    `test/account-deactivation.e2e-spec.ts` sequence at the UI layer.
  - No existing test changed except one stale name in
    `PrivacySettingsPage.test.tsx` ("stub routes" → "routes"; assertions
    unchanged).
- Dev server: `/`, `/login`, `/account/inactive`, `/settings/deactivate`,
  `/settings/delete-account`, `/settings/privacy` all HTTP 200.
- **No real browser / Playwright check available in this environment** —
  same verification ceiling as every prior `apps/web` PR.

---

## 5. Files

**New:**
- `src/pages/settings/DeactivateAccountPage.tsx` (+ `.test.tsx`)
- `src/pages/settings/DeleteAccountPage.tsx` (+ `.test.tsx`)
- `src/pages/InactiveAccountPage.tsx` (+ `.test.tsx`)
- `src/pages/account/accountActions.css` (shared styling)
- `src/pages/account/accountLifecycle.test.tsx`
- `docs/sprint-2-account-deactivation-to-code-report.md`

**Changed:**
- `src/api/auth.ts` — `reactivateAccount`, `deleteInactiveAccount`,
  `AuthApiError.code`, `login()` deactivated-detection.
- `src/pages/LoginPage.tsx` — route to `/account/inactive` on
  `code: "account_deactivated"`.
- `src/app/router.tsx` — `/account/inactive` route; real components on
  `/settings/deactivate` + `/settings/delete-account`; dropped the
  `PlaceholderPage` import.
- `src/pages/PrivacySettingsPage.tsx` + `.test.tsx` — stale "stub" wording.
- `CLAUDE.md` — status bullet.
- `docs/Soccernity_MVP_Build_Plan_v1.7.docx` — Decision Log #225 +
  forward-pointers on #220 / #221.

**Deleted:**
- `src/pages/PlaceholderPage.tsx`
