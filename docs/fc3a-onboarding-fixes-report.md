# FC3a - onboarding fixes (QA D-01 to D-17, build register B-127 to B-133 and B-151 to B-157)

Branch `fc3a/onboarding-fixes`, 2026-10-19, from `origin/main` `b36ab53` (after PR #429). Agent scope: figma-to-code. `apps/web`, `e2e/` and `docs/`, plus two `services/api` files that the Decision Log #348 tripwire forces (see section 3). **Figma, the Decision Log docx, legal copy and DPIA are untouched.** PR opened against `main`, not merged.

Read first: `docs/qa-e2e-onboarding-report.md`, `docs/fc2-gates-routing-report.md`, `docs/backend-w3e-report.md`, `docs/pending-copy-manifest.md`, build-register rows B-127 to B-133 and B-151 to B-157, Decision Log #402 to #407 as recorded in `CLAUDE.md` and the register (the docx was not opened). Figma frames read live: 5108:6626, 5108:6627, 5108:6629, 5108:6631, 5491:8241, 5539:7264, 6750:29378, 6750:29429, 6750:29480.

## 1. What was done, item by item

| Item | Result | Where |
|---|---|---|
| (a) D-01 | **Nothing to do: already fixed.** `registerUser` no longer sends `credentials: "include"` since backend/w3e (PR #429); a comment in `api/auth.ts` says so. The browser test for it already runs against the real API. | `api/auth.ts` |
| (b) B-127 light theme | Age Gate, Guardian Details, Create Profile, Guardian Consent (pending, declined, approved, change email, web confirm, card panel), Verify Email, the verify prompt and the Club Picker now use `colors.light`. The four route-scoped dark variable sets are gone: three files now read `colors.light` (exports renamed `consentThemeVars`, `verifyThemeVars`, `clubPickerThemeVars`); `authThemeVars.ts` keeps one set. Age Gate / Guardian Details are a light left panel with the navy safeguarding panel on the right and a green button, as in 5108:6626 / 5108:6627 (new `rightTone="navy"` prop on `SignupSplitScreen`). Text that was brand green on the light surface (pills, row glyphs, join buttons, error text, links) moved to navy for contrast; no new colour. `colorUtils.ts` (`hexToRgba`) was only used by the old grey input fill and is deleted. | `signup/*`, `guardian-consent/*`, `verify-email/*`, CSS |
| (c) B-132, D-11, D-12 | `/signup`: the left panel gets `min-width: 0` so its 480 px flex basis can shrink. Pages under the site header: at <= 820 px the header hides its search box (a disabled placeholder), tightens padding and gaps, and the icon row scrolls inside its own flexible width. Measured at 390 px by the QA suite on `/signup`, `/verify-email`, `/guardian-consent/confirm`, `/community` (logged out), `/blog`, and signed in on `/verify-email/prompt`, `/create-profile`, `/guardian-consent`. | `SignupSplitScreen.css`, `Header.css` |
| (d) B-155, D-14 | Root cause: `flex: 1` on the inputs is a width rule in a row but, in a column group, makes the flex basis 0, so Email, Password, Guardian name/email and Username collapsed to ~20 px. Fields directly in a group now use `flex: none; width: 100%` and keep 65 px. The grey fill and transparent border of the light variant are gone: every field is white with a 1 px token border and a focus outline, as in 5108:6626. | `SignupSplitScreen.css` |
| (e) B-151, D-03 | The resend button now sends the **minor's own email** (read from `GET /users/:id`), not the guardian's; after success the status is re-read, the page moves to the pending view and says "We've sent a new approval email to {guardian email}. The previous link no longer works." | `GuardianConsentPage.tsx` |
| (e) B-152, D-04 | `ChangeGuardianEmailPage` accepts `declined` as well as `pending` (confirmed still refuses; non-minor still shows the 404 text). | `ChangeGuardianEmailPage.tsx` |
| (f) B-131 | Decline page: "{Guardian first name} hasn't approved your account" and "They chose not to approve your account on {date}." (5491:8241). Approved page: "Your account is approved, {minor first name}" and "{Guardian first name} approved your account on {date}." (5108:6631). Falls back to "Your guardian" / no date when the response has none. No decline count anywhere. | `GuardianConsentPage.tsx`, `api/auth.ts` |
| (g) B-130, #348 | Guardian footnote and post-decline state both carry the cap sentence addressed to the guardian (one constant, one manifest row replacing the "Declining closes the account..." row). `CONSENT_SCREEN_VERSION` v3 -> **v4** and `CONSENT_SCREEN_TEXT_HASH` updated. The drafting note in the old footnote is gone. | `GuardianConsentConfirmPage.tsx`, `services/api/.../consent-screen-version.constants.ts` |
| (h) B-153, B-154, D-09, D-13 | Approval thank-you: "Your approval has been recorded. The account holder can now continue registration. You can close this page." Pending view: "Browse and follow" -> "Browse and read" (Sports Hub, Blog, Banter Rooms; following and posting switch on once the guardian approves); the "Set up your profile / Add your position and photo" row is removed (a pending minor cannot write a profile, and #377 drops the claim). Decline view: "browse the Sports Hub and check scores". Guardian page: "Follow teams and check scores" -> "Check scores and fixtures", and "Build a player profile" is removed (#377). All new wording is tagged `[COPY PENDING LEGAL REVIEW]` with manifest rows (7 added, 1 replaced). | `GuardianConsent*.tsx`, `docs/pending-copy-manifest.md` |
| (i) B-128, D-08 | "Resend verification email" link on the prompt, wired to `POST /auth/resend-verification-email` with the account's own email; the generic "sent" line and the "Too many requests" line from 6750:29429 / 6750:29480; a plain line for any other failure. New client `resendVerificationEmail`. The two tagged strings have manifest rows. | `VerifyEmailPromptPage.tsx`, `api/auth.ts` |
| (j) B-157, D-15, D-17 | Removed from user-visible strings: the Edit Profile hints that named Figma, the User model, services/api and `clubAffiliationId`; the Profile Posts-tab "no per-user posts endpoint" line; the Community Groups "No group photo" callout's Decision Log / endpoint wording; the blog comments note; the Privacy "needs a backend endpoint" line; "Sample - no X endpoint yet" captions on Community and Bants (now "Sample content"). The guardian page's drafting note and "Build a player profile" are gone. The strings in the manifest were not removed. | several pages |
| (k) B-156, D-16 | `VerifyEmailPage` submits each token exactly once (a ref guard) and always applies that one request's result; the "cancelled" discard that threw away the successful response is gone. A StrictMode vitest case proves one call and the verified screen. | `VerifyEmailPage.tsx` |
| (l) B-133, D-05 | Edit Profile never sends `username: null`: emptying an existing username is refused in the modal ("A username can't be removed...") with no request. `username_not_allowed`, `username_change_cooldown`, `username_required` and the 409 show the server's own message under the Username field (`UsersApiError` now carries the server's `code`). The "Optional." username hint is gone. | `EditProfileModal.tsx`, `api/users.ts` |

## 2. Visual check (real Chrome, real stack, screenshots in `docs/fc3a-onboarding-fixes-screens/`)

Done with the QA suite's real stack (real `apps/web` / `apps/admin` dev servers, real built `services/api`, real Postgres and Redis, nothing mocked), via `e2e/tests/10-screenshots.spec.ts`: 14 desktop captures (`real/01` to `real/14`) and 7 at 390 px (`real/m01` to `real/m07`) next to the Figma frames I compared against (`figma/`).

| Screen | Capture | Frame | Differences found |
|---|---|---|---|
| Age Gate | `real/01`, `real/m01` | 5108:6626, 5539:7264 | Matches (light, navy right panel, green button, white bordered fields). The frame draws the logo above the form; code uses the logo-only Top Bar above both panels (#172). |
| Guardian Details | `real/03` | 5108:6627 | Matches; the frame's "Options: ..." developer note under the select is not reproduced (it is a design annotation). |
| Decline page | `real/08` | 5491:8241 | Matches (named guardian, date, cap sentence, green primary, outline secondary). Site Header instead of the logo-only Top Bar. The frame's "follow teams" line is deliberately different (D-13). |
| Approved page | `real/10` | 5108:6631 | Matches except "Review privacy settings" is still the disabled placeholder. |
| Guardian confirm | `real/06`, `real/m06` | 5108:6629 | Layout differs: the frame is a bordered card with a centred logo, the code is a page of cards under the site Header; no "What we collect" list and no expiry footnote (not asked). Names and wording are not personalised in the heading ("for this account", not "for Ade"). |
| Verify prompt | `real/13`, `real/verify-prompt-resent`, `real/m07` | 6750:29378 / 29429 | Matches. The mobile frames 6750:29531 / 29582 / 29633 were not opened. |
| Club Picker | `real/12` | 5146:6635 | Light and matches the card style; not compared line by line (only the empty list was on screen in this run). |
| Create Profile, Register | `real/11`, `real/04` | 1498:2303, 407:1051 | Fields are now full height with visible borders. Create Profile is still the interim username-only page. |
| 390 px | `real/m02`, `real/m03`, `real/m04`, `real/m05` | none | No sideways scroll (also asserted by the suite). The logged-out and logged-in mobile header keeps a short scrolling icon row; the Figma mobile navbars have no icon row at all (not changed). |

**A mistake of mine, caught by this check:** my first contrast pass used a `sed` that also matched `background-color: var(--...-brand-green)`, turning every green button on the guardian, verify and club pages navy with unreadable labels. It showed up in the first screenshots; all backgrounds were restored and the pages re-captured. The final screenshots are from after the fix.

## 3. Changes outside `apps/web` and `docs/`, and why

- `services/api/src/modules/auth/guardian-consent/consent-screen-version.constants.ts`: `CONSENT_SCREEN_VERSION` `'v3'` -> `'v4'` and `CONSENT_SCREEN_TEXT_HASH` updated. Required by Decision Log #348 because the guardian-visible wording on `GuardianConsentConfirmPage.tsx` changed (the instruction asked for it). One bump covers B-130, B-153 and B-154 together.
- `.../consent-screen-version.spec.ts`: two tests edited the string "Build a player profile", which no longer exists, so their `replace` became a no-op and the "one-letter typo trips the hash" test would have failed. They now edit "Check scores and fixtures". Nothing else in `services/api` changed.
- `e2e/`: see section 5.

## 4. Verification (measured)

| Check | Before | After |
|---|---|---|
| `apps/web` vitest | 72 files / 651 tests (clean `main`, FC2 report and w3e report) | **72 files / 662 tests, 0 failures** (+11: resend verification x3, token-once StrictMode, change-email for a declined row, guardian name/date, approved heading, no-follow promise, confirm-page wording x3, username never null, username error under the field, no "optional") |
| `npx tsc --noEmit`, `npm run lint`, `npm run build` (`apps/web`) | clean | clean |
| `apps/admin` `tsc --noEmit` | clean | clean (not otherwise touched) |
| Pending-copy manifest test | 15 tests | 15 tests, 0 failures (manifest: 19 rows -> 25: 7 added, 1 replaced) |
| `services/api` `consent-screen-version.spec.ts` | 6 tests | 6 tests, 0 failures |
| QA suite `e2e/` (real Playwright, real API, 1 worker) | 169 passed (backend/w3e report) | **172 passed, 0 failed** (5.4 min, one clean run on a fresh scratch database) |

`npm run check:pending-copy` (the release gate) still fails, as designed: the manifest now lists 25 tagged strings.

An earlier full run failed 4 tests. Two were my own test expectations (the decline heading now starts with the guardian's name; my new Phone "Optional." hint matched the D-05 regex, so that test now looks only inside the Username field). The other two were fallout from a still-running first run sharing the scratch database (my wrapper shell had exited without killing it): `409` on a username another run had taken, and a trace file deleted mid-test. Re-running specs 03, 04 and 07 on their own passed, and so did the final full run above.

## 5. `e2e/` changes (which `test.fail()` lines went, and what else)

`test.fail()` **removed** for: **D-03** and **D-04** (`04-guardian-decline-x3.spec.ts`), **D-05** (`07`), **D-08**, **D-09**, **D-10**, **D-11**, **D-12** (the five 390 px page cases and the signed-in case), **D-13** (`09-edge-cases.spec.ts`). **Not touched:** D-07 (admin User Detail audited DOB read, `apps/admin`, outside this task) keeps its `test.fail()`. D-01, D-02, D-06 were already ordinary tests.

Beyond deleting the lines:
- D-03: the test now asserts the real outcome (page leaves the decline view, a second guardian email is sent). The next test no longer calls the API resend itself; it asserts the state the button produced (old link dead, fresh link, count still 1).
- D-04: asserts the change form opens for a declined row.
- D-08: clicks the new link and checks a second verify email with a working link.
- D-13: rewritten. It used to assert that follow works (inverted by `test.fail()`); it now asserts the pending screen no longer promises following and the server still returns 403.
- D-16: `expectVerifyScreen` no longer tolerates "no longer valid"; it requires the verified heading. The three "D-16 tolerant" test titles and the screenshot spec lost their "either screen" waits.
- Added `/community` (logged out) and `/blog` to the 390 px list, and a 390 px capture test in `10-screenshots.spec.ts`.

## 6. Judgment calls (adopted defaults, all veto-able)

1. **Wording written here (all tagged except one clause):** "Browse and read ..." and the three other rewordings in section 1 (h), the guardian cap sentence, and the post-decline line. The clause "so it stays switched off" in the guardian's post-decline state is **not founder wording and not tagged** (Decision Log #406 does not cover that state); counsel should see it, or it should be tagged.
2. **The cap sentence addressed to the guardian** is my rewrite of the minor-facing sentence ("You can decline up to 3 times. Changing the guardian email does not reset the count. After the third decline the account is scheduled for deletion.").
3. **Mobile header:** the search box is hidden at <= 820 px (it is disabled anyway) and the icon row keeps scrolling inside what is left, instead of removing the row as the Figma mobile navbars do (a logged-out visitor would lose all navigation).
4. **Register fields lose the grey fill.** The older Register frame (407:1051) drew grey fields; every field is now white with a token border like the Age Gate frame, which is what QA D-14 asked ("the height and border the Figma frames draw").
5. **Pending view:** the "Set up your profile" row is removed rather than reworded, because a restricted-pending minor cannot write a profile.
6. **Copy cleanup beyond the onboarding pages** (Community, Bants, Privacy, Community Groups, blog) because B-157 names "any other user-visible string in apps/web or apps/admin" and the grep finds them. Each was reworded to plain product wording ("Sample content", "Not available yet.", "Coming soon.").
7. **Edit Profile Date of Birth hint** now reads "Your date of birth can't be changed here. If it is wrong, contact support." (support is the correction path, #390).

## 7. Open / not done

- **Figma not edited:** frames 5491:8241, 5501:8453 and 5108:6629 still say "follow teams"; 5108:6629, 6748:29330 and 6748:29450 still carry the old decline footnote (B-146).
- **Guardian confirm page layout** is not the frame's centred card; no "What we collect" list or expiry footnote (B-078 stays partly open).
- **`apps/admin` user-visible developer notes** (stub banners naming endpoints and Decision Logs) were not touched, so B-157 is only partly closed. **D-07** (admin User Detail loads the DOB) is not fixed (B-129 frontend).
- **Create Profile** is still the interim username-only page (B-081); Club Picker was compared with its frame only for the empty state.
- The mobile verify-prompt frames (6750:29531 / 29582 / 29633) were not opened; the resend link follows the shared `.verify-button` mobile rule.
- **Multi-tab refresh race** in `silentRefresh.ts` (backend/w3e report) is not fixed.
- The release check `npm run check:pending-copy` still fails by design until counsel clears the 25 rows.

## 8. Register status lines

Appended to the Spec-status cell of B-076, B-078, B-079, B-127, B-128, B-130, B-131, B-132, B-133, B-151, B-152, B-153, B-154, B-155, B-156 and B-157 in `docs/build-register.md`, plus a Section 26. No B-ID added or removed (162 B-IDs, 146 gap frames unchanged).
