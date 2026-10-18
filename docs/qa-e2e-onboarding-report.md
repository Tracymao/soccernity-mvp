# QA report: end-to-end onboarding (web + admin against the real API)

Branch `qa/e2e-onboarding`, from `origin/main` at `2f46638` (2026-10-18). **No product code was changed.**
The only additions are `e2e/` (a Playwright suite, not an npm workspace), `docs/qa-e2e-onboarding-screens/`
and this report.

## 1. How it was run

Real `apps/web` and `apps/admin` (Vite dev servers) in real Chrome, against a real `services/api` (built, `node dist/main.js`),
real Postgres 16 and real Redis 7 (the repo's docker-compose containers), on a scratch database `soccernity_qa`
and Redis DB 5, migrated with the repo's 51 migrations. **No network call is mocked.** Emails are read from the API
log (no Postmark key set, so every would-be email is logged with its link). Full details: [`e2e/README.md`](../e2e/README.md).

Result of the last full run: **165 tests, 165 pass, 6.3 min.** 15 of those are *known-defect* tests (`D-nn`) that
use `test.fail()`: they pass while the defect exists and go red the day it is fixed.

What the harness changes, and why (all in `e2e/support`, none in product code):

| Change | Reason |
|---|---|
| A thin proxy between the browsers and the API that only rewrites CORS response headers | **Defect D-01**: sign-up cannot complete in a browser otherwise. |
| `AUTH_RATE_LIMIT_MAX=1000` | The default 5 requests/60 s auth throttle is below what a full run needs. The throttle is not tested here. |
| `STRIPE_*` and `EMAIL_PROVIDER_API_KEY` set to `replace-me` | The root `.env` holds what looks like a real Stripe *test* key; the run must never reach Stripe. Under-13 card verification therefore fails closed (503). |
| One test sets `Guardian.cardVerificationRequired=false` in SQL | Local runs have no GeoLite2 database, so every under-13 needs the card step (by design, Decision Log #368). Marked `WORKAROUND` in `tests/09-edge-cases.spec.ts`. |

## 2. Scope coverage

| Requested | Covered by | Result |
|---|---|---|
| Adult sign-up | `01`, `06` | Works end to end (needs D-01 workaround). |
| Minor sign-ups: under 13 | `03`, `09` | Age Gate, guardian step, register, restricted-pending, card gate (UI and API), decline. Approval itself **only via the SQL workaround** (no GeoLite2/Stripe locally). |
| Minor sign-ups: 13-15 and 16-17 | `02` | Full path incl. approval email, idempotent re-confirm. |
| Email verification | `01`, `02`, `06`, `09` | Works; D-08, D-16. |
| Guardian consent confirm | `02`, `05`, `09` | Works; D-09, D-10, D-15. |
| Decline x3, web decline view for declines 1-2 | `04` | Backend behaves as decided (#389/#395/#402). The web view renders; **two of its three actions are broken (D-03, D-04)**. |
| Report incorrect details | `05` | Works end to end incl. admin resolve (API). No admin screen (gap G-2). |
| Login routing on `nextStep` | `06` | All 8 states route correctly. |
| Create Profile and username rules | `07` | Rules work as written; D-05, D-06. |
| Admin DOB correction | `08` | Works in the UI incl. all tier changes; D-07. |
| Admin username revoke | `08` | Works via API; **the UI button is disabled** (gap G-1). |

## 3. Defects

Severity: **Blocker** = a core journey cannot be completed; **High** = a shipped control does not do what it says;
**Medium** = wrong behaviour/copy with a workaround or limited reach; **Low** = cosmetic or dev-only.
Each has an automated test (file in brackets) unless noted.

### D-01 Blocker: sign-up fails in every browser (CORS)
- **Steps:** serve `apps/web` on one origin and `services/api` on another (as in production: separate Render services). Open `/signup`, pass the Age Gate, fill Register, click **Create account**.
- **Expected:** account created, redirect to the next onboarding step.
- **Actual:** red message "Couldn't reach the Soccernity server. The account service may not be available yet". Console: *"The value of the 'Access-Control-Allow-Origin' header in the response must not be the wildcard '*' when the request's credentials mode is 'include'"*. No request reaches the API.
- **Cause:** `apps/web/src/api/auth.ts:648` sends `credentials: "include"`; `services/api/src/main.ts:21` calls `app.enableCors()` with no options (answers `*`). Only `registerUser` uses credentials, so login etc. work.
- Test: `tests/00-known-defects.spec.ts` (real browser, raw API).

### D-02 Medium (safeguarding): the age-5 floor is only enforced in the web form
- **Steps:** `POST /auth/register` with a date of birth 4 years ago, valid guardian block.
- **Expected:** 400 (Decision Log #19: "hard blocking regardless of guardian consent").
- **Actual:** 201, account and guardian request created. `age.util.ts` says the floor is deliberately left to the frontend Age Gate.
- Test: `03-age-gate-and-under-13.spec.ts` (D-02).

### D-03 High: "Resend approval request" does nothing
- **Steps:** minor whose guardian declined once logs in, lands on the decline view, clicks **Resend approval request**.
- **Expected:** request reopens, page switches to the pending view, a fresh link goes to the guardian.
- **Actual:** nothing visibly changes (no message either), no email, status stays `declined`.
- **Cause:** `GuardianConsentPage.tsx` sends `status.guardianEmail` (the *guardian's* address) to `POST /auth/guardian-consent/resend`, which looks the account up by the *minor's* email (`guardian-consent.service.ts:311`) and silently no-ops. The route works when given the minor's email (also tested).
- Test: `04` (D-03). Affects the pending view's resend wording too ("If your guardian's email is still pending...").

### D-04 High: "Change guardian email" on the decline view is a dead end
- **Steps:** same account, click **Change guardian email**.
- **Expected:** the change form (the decline view says "use a different guardian email"; the API accepts a change after decline 1 or 2 and restarts the request).
- **Actual:** "This request is closed, so the guardian email can't be changed." `ChangeGuardianEmailPage.tsx:~145` treats every status except `pending` as closed.
- Test: `04` (D-04). The API path was verified (restart, decline counter kept at 2).

### D-05 Low: Edit Profile still calls the username "Optional"
The hint reads "Optional. If you set one, other people see your username..." although a username is required and cannot be cleared. Clearing it does give a correct server message ("A username can't be removed..."). Test: `07` (D-05). Screenshot: `edit-profile-clear-username.png`.

### D-06 Medium: hate/sexual terms bypass the username filter when glued to other letters
`xxhitlerxx` and `nazifan` are accepted (HTTP 200); `hitler_1488`, `nazi_fan`, `fuckface` are refused. The "EXACT" list only matches the whole handle or an underscore token (`username-rules.constants.ts`). On a platform with minors, public names are exactly where this matters. Test: `07` (D-06).

### D-07 Medium: opening User Detail is an audited date-of-birth read
- **Steps:** admin opens `/users/:id`.
- **Expected:** no DOB read, no `user.dob_viewed` row (Decision Log #406 item 4 / B-129).
- **Actual:** the page calls `getUserDetail()` (the DOB endpoint), so each open writes audit rows (two per open in dev, StrictMode) and the DOB is sent to the browser (not displayed). `/summary` exists and is unused. Test: `08` (D-07).

### D-08 Low-Medium: no "resend verification email" on the verify prompt
`POST /auth/resend-verification-email` works (identical answer for known/unknown/verified, sends a new working link; tested). The prompt page only offers "Contact support". Test: `09` (D-08).

### D-09 Low: guardian is told "The account is now active"
After approval the guardian sees "Your approval has been recorded. The account is now active", but the minor still has to verify email and create a profile. Test: `09` (D-09).

### D-10 Medium: decline wording is wrong for declines 1 and 2 (already tracked as B-130, still open)
The guardian page footnote says "Declining closes the account and schedules it for deletion" and the post-decline screen says it "will be scheduled for deletion". Only the third decline does that (verified in `04`). Test: `09` (D-10).

### D-11 Medium: `/signup` scrolls 98 px sideways at 390 px
The left panel keeps a 488 px width. `/login` and `/forgot-password` are fine. Test: `09` (D-11). Screenshot: `mobile-390-_signup.png`.

### D-12 Medium: pages under the site header scroll 167-188 px sideways at 390 px
`/verify-email`, `/guardian-consent/confirm`, `/verify-email/prompt`, `/guardian-consent` (the desktop icon header does not collapse). Test: `09` (D-12 x3). Screenshot: `mobile-390-_verify_email.png`.

### D-13 Medium: the restricted-pending screens promise "follow", but follows are refused
The pending view says "Browse and follow - Follow teams, players and grassroots leagues" and the guardian page lists "Follow teams and check scores". `POST /users/:id/follow` returns 403 for a pending minor (uniform write block, Decision Log #370). Test: `09` (D-13).

### D-14 Low-Medium: text inputs render at 20 px with no visible border
In Register, Guardian details and Create Profile, the Email, Password, Date of birth, Guardian name/email and Username fields measure **20 px** high, against **65 px** for the name and date fields on the same forms (measured in the browser). The Create Profile username box is a barely visible grey strip. Not automated (visual). Screenshots: `03-guardian-details.png`, `11-create-profile.png`, `04-register-minor.png`.

### D-15 Medium (known, copy): guardian page content does not match the product
"Build a player profile - Position, club or school team, and stats they add themselves" (player profile is not MVP, Decision Log #377) and a visible drafting note: "[COPY PENDING LEGAL REVIEW -- expiry/deletion/withdrawal copy from the Figma frame is not reproduced here since it isn't backed by a real policy yet.]". The 19 `[COPY PENDING LEGAL REVIEW]` strings in the manifest are visible throughout; the release check (`npm run check:pending-copy`) is the guard. Screenshot: `06-guardian-confirm-page.png`. Not automated.

### D-16 Low (dev builds): a valid verification link can show "no longer valid"
`VerifyEmailPage` consumes the single-use token inside a `useEffect`; under React StrictMode (dev servers) it runs twice, the successful first response is discarded as cancelled and the second finds the token used. The email **is** verified (database checked), but the screen can say otherwise (seen intermittently; which request wins is a race). The suite tolerates either screen and records an annotation. Production builds run the effect once, but this is not verified.

### D-17 Low: developer notes shown to users
Edit Profile: "Not shown on the Figma frame -- added since it's a real, functional field.", "Not editable yet -- there's no `bio` field on the User model in services/api.". Profile: "Posts for this profile aren't available yet -- there's no per-user posts endpoint in the API yet." Screenshot: `edit-profile-clear-username.png`. Not automated.

## 4. Gaps confirmed (built in the API, missing or disabled in a UI)

- **G-1** Admin User Detail: **Revoke username** is a disabled button ("Not built in this screen yet"). The API works and is tested end to end (clear, 30-day hold for everyone, permanent bar on the old owner, email without the internal reason, audit row, user falls back into the incomplete-profile gate on the same token).
- **G-2** No admin screen for incorrect-details reports (list/resolve are API-only; B-120). The sidebar has no entry.
- **G-3** Under-13 approval cannot be completed locally without Stripe and a GeoLite2 database; only the gate (UI + API + 503 fail-closed) and the post-lift path were tested.

## 5. What was checked and works

- **Adult**: Age Gate -> Register (read-only DOB, no Apple button) -> verify prompt -> link works -> Create Profile -> Club Picker -> `/community`; DOB stored encrypted (`v1:`); no guardian row; every later login goes straight to `/community`.
- **Age Gate**: impossible/future dates, mandatory country, under 5 hard stop that clears date and country, 5 accepted, 18th-birthday boundary (today = adult, one day short = minor), guardian validation, one full-name field and no country select, Back keeps values.
- **Register API**: `countryCode` required, minor without guardian refused, guardian = own email refused, future date refused, duplicate email (case-insensitive) 409, no hash/ciphertext in the response.
- **Minors 13-15 / 16-17**: `isUnder16` set correctly, guardian row, emails to the right people with web links (never a guardian mail to the minor), pending view, login while pending always routes to Restricted Pending even with a verified email, server refuses posting (403), guardian page shows the request summary with no account, consent recorded with screen version and device type, approval email to the minor with a `/login` link, re-using the link is an idempotent no-op (no second email, evidence kept), then Create Profile; approved-but-unverified goes to the verify prompt.
- **Decline x3**: decline 1 and 2 keep the account active and sessions valid, send no email, show the decline view with the cap sentence and no running count; the declined link cannot approve; change-of-guardian restarts approval without resetting the count; decline 3 blocks login at once (generic 401, no oracle), `pending_deletion`, one email; a later confirm cannot reopen it.
- **Incorrect details**: report puts approval on hold (UI and API), survives reload, decline still possible, admin resolve lifts it, repeat resolve is a clean 4xx.
- **Login routing**: unverified adult -> verify; verified no username -> Create Profile; done -> `/community`; minor pending -> Restricted Pending; declined -> decline view; approved unverified -> verify; approved verified -> Create Profile; fully onboarded -> `/community`. `/continue`, deep links, no-session redirects, same generic message for wrong password and unknown email, case-insensitive email, "Stay signed in" storage, **silent refresh of an expired access token with refresh-token rotation**, log-out kills the refresh token.
- **Username rules**: letters required, reserved/leet/affix forms, contact details, personal data (own name either order, email, birth year, phone-like digits) with the specific message, club impersonation, lower-case storage and case-insensitive 409, cannot clear (400), 30-day cooldown after one free correction (429 with `availableAt`), a released handle is free at once, public name never shows the real name.
- **Admin**: sign-in, route protection, user-app token is not an admin session; DOB correction validation (no date in the reason, length, future, unchanged), adult->adult, adult->minor (server asks for guardian, flow starts, user restricted), minor->adult (request cancelled), different tier restarts and resets the decline counter, same tier leaves both alone, no DOB ever written to the audit notes.

## 6. Notes

- The `D-nn` tests are the regression net: when a defect is fixed its test goes red, delete the `test.fail()` line. D-01's fix also lets the CORS proxy go.
- Wording tagged `[COPY PENDING LEGAL REVIEW]` was not judged here.
- Not covered (not requested): guardian withdrawal, password reset, 2FA, the hourly expiry/stale-decline sweeps (time-based), real Postmark/Stripe/GeoLite2.
- Screenshots: `docs/qa-e2e-onboarding-screens/` (plus the full set under `e2e/.run/shots` after a run).
