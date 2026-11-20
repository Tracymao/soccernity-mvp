# FC1 - sign-up flow (B-017, B-019, B-073, B-074, B-075)

Branch `fc1/signup-flow-b017-b019-b073-b074-b075`, 2026-10-17. Agent scope: figma-to-code. `apps/web` and `apps/admin` only; `services/api`, Figma, the Decision Log docx, legal copy and DPIA are untouched. PR opened against `main`, not merged.

Read first: build-register rows B-017 / B-019 / B-073 / B-074 / B-075, Decision Log #367, #368, #393 (a), #394 (A4) (from `docs/build-register.md` and `CLAUDE.md`), `docs/figma-pass-f1-report.md`, and the frames below, re-read live with `get_design_context`: Age Gate `5108:6626` (mobile `5539:7264`), below-minimum-age `5464:7077` (`5539:7314`), Guardian Details `5108:6627` (`5539:7354`), Register `407:1051`, note `6673:27346`.

## Status lines (as added to `docs/build-register.md`)

| Row | Status |
|---|---|
| B-017 | BUILT (web). Session persisted at registration, silent refresh, server-side logout. |
| B-019 | BUILT. `apps/admin/.env.example`. |
| B-073 | BUILT. Country select, `countryCode` sent for every signup, denial screen, DOB + country cleared on Back. |
| B-074 | BUILT. Read-only DOB, no picker, no Apple button, session persisted. Google / Facebook buttons NOT built (oauth_login, W10). |
| B-075 | BUILT, after B-073 (commit order and flow order). One full-name field, no country select. |

## What changed

**B-073 - Age Gate** (`pages/signup/AgeGateStep.tsx`, `SignupFlow.tsx`, `types.ts`)
- Heading "Date of birth and country", subheading per frame, a required "Country you live in" select (coded list `COUNTRY_OPTIONS`, unchanged), hint text per frame. `onContinue` now also returns the country; `SignupFlow` holds it and passes it to Register.
- Below minimum age (Decision Log #19) the step swaps to the denial screen of frames `5464:7077` / `5539:7314` (heading, "Why there's an age limit" panel, navy "Back to sign up") instead of the old inline error. "Back to sign up" clears DOB and country in the step and, through `onDenialBack`, in the flow state (#394 A4, note `6673:27346`).
- Order of checks: valid date, then minimum age, then country. A child under 5 therefore sees the denial without being asked for a country.

**B-075 - Guardian Details** (`GuardianDetailsStep.tsx`)
- One "Guardian's full name" input (placeholder as drawn); the country select and its hint are gone. `GuardianDetailsValues` is now `{ name, email, relationship }`. Register posts `guardian.name` as that single trimmed string, which `RegisterDto` already takes.
- Link lifetime text changed from "7 days" to "3 days" to match the frame (72 h TTL, #62).
- Sequencing: B-075 is safe to ship because B-023/B-025 are merged and card verification no longer reads `Guardian.declaredCountry` (grep of `services/api/src`: only the registration write, the deletion sweep and the admin detail read it). It was committed after B-073 and the flow order is Age Gate first.

**B-074 - Register** (`RegisterStep.tsx`)
- "Date of Birth" row, read-only, formatted `DD / MM / YYYY` (frame `5376:6186`), no picker. Sends `countryCode` from the Age Gate for every registrant (adults too). Button label "Create account" and subheading "Create your Soccernity account." per frame.
- No Apple button exists in code (none to remove). Google / Facebook buttons from frame `5418:7097` are not built: they belong to oauth_login (W10).

**B-017 - session** (`lib/session.ts`, `lib/silentRefresh.ts`, `main.tsx`, `api/auth.ts`, `layout/Header.tsx`, `LoginPage.tsx`, `InactiveAccountPage.tsx`)
- `storeSession()` is now the only writer (login, registration, reactivation); registration stores to `sessionStorage`, like a login without "Stay signed in".
- Silent refresh: `installSilentRefresh()` wraps `window.fetch`. A 401 on an API request that carried the current stored access token triggers one `POST /auth/refresh`, shared by parallel requests (single-flight, because refresh tokens are single-use and reuse revokes the family), then the request is replayed once with the new token. A rejected refresh (401) clears the session and returns the original 401; a 5xx leaves the session alone. Login / register / refresh / logout / reactivate / delete-inactive are never refreshed. This avoids editing the ~20 API clients.
- Logout: Header calls `POST /auth/logout` with the refresh token (best-effort, not awaited, no Authorization header) and then clears both tokens as before.

**B-019** - `apps/admin/.env.example` with `VITE_API_BASE_URL` (the only variable `apps/admin/src` reads).

## Wording tagged [COPY PENDING LEGAL REVIEW] in Figma, implemented as drawn - pending counsel

1. Age Gate heading "Date of birth and country" and subheading "We ask everyone this when they join. Your date of birth is never shown on your profile." (chip `6669:27179`).
2. Register DOB note "Set when you signed up and cannot be changed here." (`6627:22258`). The bracket tag is rendered verbatim, following the existing precedent on `GuardianDetailsStep.tsx`; it should be stripped once counsel approves.
3. Guardian Details fineprint "We only use this email address to request and record consent." (`5111:6669`, already in code before this PR, tag kept).

Not tagged but new and worth a counsel glance: the Age Gate country hint ("Some countries ask for an extra check when a guardian approves an account for a younger child.") and the denial-screen wording.

## Verification

- `apps/web`: `tsc --noEmit` clean, `npm run lint` clean, `npm run build` clean, vitest **67 files / 597 tests, 0 failures** (re-run in full after the last change; the 20 new tests are included). New: `session.test.ts` (3), `silentRefresh.test.ts` (6), `GuardianDetailsStep.test.tsx` (4), `RegisterStep.test.tsx` (5), `SignupFlow.test.tsx` (2); `AgeGateStep.test.tsx` updated (country, denial, clear-on-Back; 12 tests), `Header.test.tsx` +1 (logout revokes the refresh token).
- `apps/admin`: `tsc --noEmit`, lint, build clean; vitest 16 files / 163 tests, 0 failures (no admin source changed besides `.env.example`).
- Not done: no real browser or visual comparison against Figma (none available here); only jsdom tests. The silent refresh was tested against a mocked `fetch`, not against a live `services/api`.

## Judgment calls and open points

1. Registration stores the session in `sessionStorage` (not `localStorage`): the same default as an un-ticked login. Switch if the founder wants registrants to stay signed in across browser restarts.
2. `RegisterDto.countryCode` is still optional on the API; this PR makes the web always send it. Making it required is a backend change ("in the same change that ships the Age Gate step", per the DTO comment) and was not touched here.
3. The silent refresh only recognises requests made with `fetch(string, init)` and an explicit `Authorization: Bearer` header, which is how every current client calls the API. A future client that passes a `Request` object would not be refreshed.
4. Nothing yet routes a freshly registered restricted-pending minor to `/guardian-consent` or an unverified adult to email verification (B-030 frontend). Registration still ends at the Club Picker, then `/`.
5. After registration the Club Picker join now runs with a persisted session but returns `403 email_verification_required` until the email is verified (B-118, already noted in `CLAUDE.md`).
6. The below-age denial is a screen inside `AgeGateStep` (no route change). Refresh or Back in the browser leaves the signup route entirely, so nothing is retained either way.
