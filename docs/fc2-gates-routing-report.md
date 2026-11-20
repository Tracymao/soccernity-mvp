# FC2 - onboarding routing, decline view, admin DOB correction, pending-copy guard (B-030, B-081 interim, B-102, B-103, B-104, B-109, B-110, B-118, B-124, B-125)

Branch `feat/fc2-gates-routing`, 2026-10-17, from `origin/main` `309f8ad`. Agent scope: figma-to-code. `apps/web`, `apps/admin`, `scripts/`, `docs/` only. **Figma, the Decision Log docx, legal copy and DPIA are untouched. `services/api` is untouched except `consent-screen-version.constants.ts`: `CONSENT_SCREEN_VERSION` v2 -> v3 and the tripwire hash, required by Decision Log #348 because this PR changed the guardian confirm page wording (CI caught it after the first push). Guardian confirmations made from this build are stamped v3.** PR opened against `main`, not merged.

Read first: `docs/backend-w3-gates-report.md`, `docs/backend-w3b-report.md`, `docs/fc1-signup-flow-report.md`, build-register rows B-030 / B-081 / B-104 / B-118 (and B-029, B-102, B-103, B-109, B-110, B-119, B-124, B-125), Decision Log #374, #375, #389, #402-#404 as recorded in `CLAUDE.md` and the register (the docx itself was not opened). Figma frames re-read live: 5491:8241, 5501:8453, 5108:6629, 5108:6631, 6647:25540, 6649:24980 / 25463 / 25721.

## 1. What was built

### apps/web

| Item | What | Where |
|---|---|---|
| Routing on `nextStep` | After **registration**, **login** and **reactivation** the app routes on the server's `nextStep`: `restricted_pending` -> `/guardian-consent` (every login, a declined row too), `verify_email` -> `/verify-email/prompt`, `create_profile` -> `/create-profile`, `none` -> `/community`. The Verified screen's CTA goes to `/continue`, which asks the server (`GET /users/:id`) and routes the same way. A minor no longer lands on `/community`, and no longer gets a Club Picker right after registering (every join would have been a 403). There was **no polling** in the web app to remove (the audit's "no polling" was already true). | `lib/onboarding.ts`, `LoginPage.tsx`, `RegisterStep.tsx`, `InactiveAccountPage.tsx`, `VerifyEmailPage.tsx`, `ContinuePage.tsx` |
| Types | `AuthUserSummary` and `UserProfile` carry `profileComplete`, `guardianConsentStatus` (`declined` is its own value), `nextStep`. | `api/auth.ts`, `api/users.ts` |
| Verify-email prompt | New `/verify-email/prompt`: "Verify your email to continue", names the address, offers support. **No resend** (no endpoint exists, Decision Log #37). No Figma frame exists for it. | `VerifyEmailPromptPage.tsx` |
| Create Profile (interim) | New `/create-profile`: **username only**, via the existing `PATCH /users/:id`; redirects an account whose `nextStep` is not `create_profile`; shows the server's refusal message verbatim. See section 5, call 1. | `CreateProfilePage.tsx` |
| Club Picker | Now a route, `/signup/clubs`, reached after Create Profile (Decision Log #367 order). A join refused with `403 email_verification_required` shows "Verify your email address before joining a club" with a link to the prompt, is not marked as a failed join, and Skip still works. `ClubsApiError` gained `code`. | `ClubPickerRoute.tsx`, `ClubPickerStep.tsx`, `api/clubs.ts` |
| Decline view (declines 1 and 2) | `GuardianConsentPage` renders `declined` as its own state: "Your guardian hasn't approved your account", the three OFF rows, "What you can do now", the static cap sentence, **Resend approval request** (the email-keyed route, then re-reads the status) and **Change guardian email**. **No decline count is shown** (the status response has none; a test asserts no "N of 3" text). `declined` is no longer rendered as pending. | `GuardianConsentPage.tsx` |
| Approved view | Reworded to the Figma "approved, continue registration" wording (tagged), "Switched on when you finish registration" with SOON pills, CTA **Continue registration** -> `/continue`. | `GuardianConsentPage.tsx` |
| Request summary, report, hold | The guardian confirm page loads `GET .../request-summary` (token in `X-Consent-Token`), shows who is asking / date of birth given / named as / requested on, the two notices, a **Report incorrect details** action (token-only POST), and an **Approval is on hold** card when a report is open (this session's or earlier): "I consent" is disabled, "I do not consent" stays available, matching the server. A failed lookup (invalid token) is silent and changes nothing. | `GuardianConsentConfirmPage.tsx` |

### apps/admin

| Item | What | Where |
|---|---|---|
| User Detail (B-109) | `/users/:id`, frame 6647:25540: Account card and Support actions; reached from a new **View** link on each Users row. **Every load is an audited date-of-birth read** (section 5, call 3). "Revoke username" is drawn but **rendered disabled** (not built). | `UserDetailPage.tsx`, `UsersPage.tsx` |
| DOB correction (B-103 / B-104) | `/users/:id/dob-correction`, frames 6649:24980 / 25217 / 25463 / 25721 / 25952: form, validation, confirm dialog ("What happens next"), success. A **visible warning** says not to enter either date of birth in the reason; a date-shaped reason is **also refused client-side** (the server does not check). Guardian fields appear only after the server answers "Provide guardian name, email and relationship" (adult account corrected to a minor); no frame designs them. Moderator / superadmin only, as the section already is. | `CorrectDobPage.tsx`, `usersShared.tsx`, `api/adminUsers.ts` |
| Incorrect-details list (B-119) | **Not built.** No Figma frame exists (checked: the register row still says so), so there is no screen for `GET /admin/users/incorrect-details-reports` or its resolve action. | - |

### Pending-copy guard (B-124)

- `docs/pending-copy-manifest.md`: **19 rows** (file, string as rendered, Figma frame), every user-visible string carrying `[COPY PENDING LEGAL REVIEW]` in `apps/web` and `apps/admin`.
- `apps/web/src/pendingCopyManifest.test.ts` (runs with `npm test`, so in CI): parses both apps with the TypeScript AST (comments are ignored; JSX text, string and template literals are not) and **fails when a tagged string has no manifest row, or a row matches no string**. Tests for the tooling itself use fixtures. I proved the failure mode by hand: adding a tagged paragraph to `NotFoundPage.tsx` failed the test and so did deleting a row; both were restored.
- `scripts/check-pending-copy-dist.mjs` (`npm run check:pending-copy`, `npm run build:release` runs build + check): scans the production builds of both apps and **fails if the literal tag would ship**. The allow-list, `scripts/pending-copy/dist-allowlist.json`, is `[]`, a test asserts it stays empty, and the failure message and manifest both say the strings must be **stripped from source when counsel approves** (and the row deleted), never allow-listed.
- **That check fails today, on purpose**: it reports exactly the 19 strings. I ran it against fresh builds (exit 1, 19 places). It is **not** part of `npm run build` or the normal CI run (that would break every pull request); it belongs in the production deploy path (B-090). See section 5, call 2.
- Tagged as instructed: the Age Gate country hint and the denial text (subheading and "Why there's an age limit" panel). I also tagged the Age Gate **sub-heading**, which Figma tags (chip 6669:27179) but the code had only in a comment; without that the guard would not see it.

## 2. Verification

| Check | Before | After |
|---|---|---|
| `apps/web` vitest | 67 files / 597 tests (measured with my source changes in and the new tests not yet written; the FC1 report records the same 67 / 597) | **72 files / 651 tests, 0 failures** |
| `apps/admin` vitest | 16 files / 163 tests (FC1 report) | **17 files / 186 tests, 0 failures** |
| `tsc --noEmit`, `npm run lint` | - | clean in both apps |
| `npm run build` | - | clean in both apps |
| `npm run check:pending-copy` | - | **exit 1, 19 places** (expected, see above) |

New tests: `lib/onboarding.test.ts` (3), `LoginPage.test.tsx` (6, new: the app had no login test), `CreateProfilePage.test.tsx` (7), `VerifyEmailPromptPage.test.tsx` (7, also covers `/continue`), `userDetailDob.test.tsx` (23), `pendingCopyManifest.test.ts` (15), plus additions to `GuardianConsentPage.test.tsx` (declined view, no count, resend), `GuardianConsentConfirmPage.test.tsx` (summary, report, hold, decline stays available), `RegisterStep.test.tsx` (routing per `nextStep`), `ClubPickerStep.test.tsx` (403 prompt). Existing tests that encoded the old behaviour were **changed, not deleted**: the Verified CTA is `/continue`, reactivation lands on `/community`, the approved-state wording, and ~12 fixtures gained the three new fields.

Not run: the full API test suites; only `src/modules/auth/guardian-consent` was run, for the constants change.

## 3. Browser check (real Chrome, screenshots in `docs/fc2-gates-routing-screens/`)

Done with Chrome driving the Vite dev servers, the API mocked at the network layer (no backend or database needed): 14 screenshots, each compared with its Figma frame. jsdom alone was not relied on.

| Screen | Screenshot | Frame | Differences found |
|---|---|---|---|
| Decline, desktop | `real-decline-desktop.png` | 5491:8241 | Heading and sentence generic (no guardian name, no decision date: the status endpoint returns neither). Dark theme (section 4). Site Header instead of the logo-only Top Bar. |
| Decline, mobile 390 | `real-decline-mobile.png` | 5501:8453 | As above; **buttons were side by side, fixed to stack full width** (re-shot after the fix, CSS only). |
| Approved | `real-approved-desktop.png` | 5108:6631 | No guardian first name or name in the heading and sentence (not in the status response); dark theme; "Review privacy settings" is the old disabled placeholder. |
| Guardian confirm | `real-confirm-normal.png`, `real-confirm-hold.png` | 5108:6629 | Summary panel built; heading still "...for this account to be activated?" (frame: "...for Ade to use Soccernity?"); the "What the account holder will be able to do" lists still say "Build a player profile" (the frame dropped it, Decision Log #377); no "What we collect" section; the expiry footnote differs from the frame's; dark theme. The **hold state has no frame**. |
| Age Gate | `real-agegate.png` | 5108:6626 | Tag now visible on the sub-heading and country hint; dark theme. |
| Verify prompt | `real-verify-prompt.png` | none | No frame. Built from the Verify Email card classes, so dark. |
| Create Profile (interim) | `real-create-profile.png` | 1498:2303 | Username only; not the Figma layout. |
| Club Picker 403 | `real-clubpicker-403.png` | 5146:6635 | The prompt is new; the picker is dark vs the light frame. |
| Admin User Detail | `real-admin-userdetail.png` | 6647:25540 | Matches the frame's content and layout. Differences: no "Search Soccernity" band (the Users section hides the shell search, as before); initials instead of the avatar photo; "Joined" reads "3 Sept 2026" (frame: "03 Sep 2026"). |
| Admin DOB form / confirm / success | `real-admin-dob-form.png`, `-confirm.png`, `-success.png` | 6649:24980 / 25463 / 25721 | Match closely; the visible warning callout is added (the frames have none). Same search-band and avatar differences. The date input is the browser's native date control. |
| Admin DOB, reason contains a date | `real-admin-dob-reason-has-date.png` | none | Shows the client-side refusal. |

Not visually checked: mobile of the admin screens (desktop-only console, as designed) and the frames' 390 mobile variants of Create Profile / Verify prompt (no frames).

## 4. Findings the browser check surfaced (not fixed, not mine)

1. **The onboarding flows render in the dark theme; their Figma frames are light.** Age Gate, Guardian Details, Guardian Consent (all states), Verify Email and the Club Picker use `dark*ThemeVars` built from `colors.dark`, while the light-mode retrofit (PRs #98 and later) made the frames light. The whole app otherwise runs light-only. This is the single biggest visual difference on every guardian and sign-up screen and predates this work. My new pages follow their family (dark) for consistency. The fix is a theme flip of three small vars files plus a pass over their CSS; it needs its own pass and a founder call, so I did not do it.
2. **Mobile horizontal overflow at 390px on pages under the site Header** (measured: `/community`, `/blog`, `/guardian-consent` scroll width 578, `/login` 390). Pre-existing.
3. The Figma consent frames use the logo-only Top Bar; code keeps the site Header on these routes (Decision Log #172 left them under `AppShell`).

## 5. Judgment calls (adopted defaults, all veto-able)

1. **Create Profile is an interim, username-only page, not B-081.** The routing target had to exist: `nextStep: create_profile` fires on every login for every account without a username, so a 404 would trap them. The full screen needs an avatar upload endpoint and `User` columns that do not exist (bio, preferred club) and is still open under B-081.
2. **The pending-copy release check is a separate release gate, not part of `build`.** Because the 19 strings still carry the tag and the allow-list must stay empty, the check can only fail today; wiring it into `build` would fail CI on every pull request. If you want it inside `build` anyway, it is one script line.
3. **User Detail loads the record through the audited endpoint, so each load writes a `user.dob_viewed` audit row** although the screen does not display the date; the endpoint always includes and logs the DOB and has no way to omit it. The correction form reads it again (a second row) because it shows the current date. A lighter read endpoint without the DOB would remove the first row; that is a backend change.
4. **The warning "Do not enter either date of birth in the reason" is not tagged**: it is an operational instruction from the brief, not counsel wording. Say if counsel should see it.
5. **A date-shaped reason is blocked outright** (any full date, not only the two DOBs), which also blocks a harmless reference such as "ticket of 3 Oct 2026". The audit trail must never hold a DOB and the server does not check; I chose over-blocking.
6. **The Age Gate sub-heading was tagged** (see section 1). The manifest has 19 rows because of it.
7. **No route guard.** A restricted-pending minor who types `/community` still sees the page; the server blocks every write. The brief asked to route after registration and login only.
8. **The Verified screen's CTA no longer goes to `/profile`**; it goes to `/continue`.

## 6. Open / not done

- The admin incorrect-details list (B-119, no frames), Revoke username (drawn on User Detail, rendered disabled, B-033 frontend), the full Create Profile (B-081).
- `EditProfileModal` still sends `username: null` when the field is cleared, which the API now answers with 400 `username_required` (B-031); it also does not handle the new username error codes. Not touched here.
- Counsel clearing the 19 manifest rows (legal-copy Part C rows 22, 33, 43, 44 are the gating rows); until then the release check fails.
- The approved and decline views lack the guardian's name and the decision date; a status response that returned them would let the frames be matched exactly.
- Nothing was checked against a live `services/api`: the browser check mocks the network, and the routing is covered by tests against the response shape documented in `docs/backend-w3-gates-report.md`.

## 7. Register status lines

Appended to the Spec-status cell of B-030, B-081, B-029, B-110, B-102, B-118, B-103, B-104, B-109, B-119, B-124 and B-125 in `docs/build-register.md` (original text unchanged), plus a Section 21. 126 B-IDs and 146 gap frames unchanged.
