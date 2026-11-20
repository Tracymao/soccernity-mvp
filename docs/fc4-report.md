# FC4 report: cross-tab refresh lock, semantic/alert callouts, admin developer notes, mobile header, revoke hold line

Branch `fc4/lock-callouts-mobile-header`, 2026-10-20, from fresh `origin/main` (`be37af8`). Agent scope: figma-to-code. `apps/web`, `apps/admin`, `packages/shared` (one token), `e2e/`, `docs/`, plus **one `services/api` constants file** (section 2, item b). **Figma is untouched** (read only). PR opened against `main`, not merged: Temi verifies and merges.

Read first: Decision Log #408 (as recorded in `CLAUDE.md` and the register: items 2, 4, 5, 6, 8), `docs/fc3a-onboarding-fixes-report.md`, `docs/fc3b-admin-report.md` (open points), `docs/figma-pass-k4-report.md`, register rows B-164, B-166, B-167, B-168, B-169, B-178. The Figma frames were read live: `6784:29454`, `6784:29476`, `6785:29485` (header and drawers), `6647:25789`, `6649:24462`, `6649:24714` (revoke), and the red-bound nodes in the admin error frames.

## 1. What was built

### (a) Cross-tab lock for the refresh-token rotation (B-164)
- `apps/web/src/lib/silentRefresh.ts`: the rotation now runs under a cross-tab lock. **Mechanism: the Web Locks API** (`navigator.locks.request("sn-refresh-token-rotation", ...)`). **Fallback where it is missing:** a best-effort `localStorage` lease (`sn_refresh_lock` = `{ owner, until }`, 10 s TTL, 40 ms poll, 12 s maximum wait, a stuck or dead-tab lease never blocks forever, storage unavailable runs unlocked). The tab that takes the lock **re-reads the stored access token first**: if it is no longer the one that just 401'd, another tab already rotated, so it uses the new pair and does **not** call the server. The server's reuse detection is unchanged.
- Unit tests (`silentRefresh.test.ts`, 4 new): takes the Web Lock around the rotation; no server call when the tokens changed while waiting for the lock; the localStorage lease waits out a live lease; a lease left by a dead tab does not block.
- **Playwright, two pages** (`e2e/tests/12-fc4-cross-tab-and-mobile-header.spec.ts`): two pages in one browser context share a "Stay signed in" (localStorage) session with an expired access token and a live refresh token and fire an authenticated request at the same moment. Asserts both get 200, **exactly one** `POST /auth/refresh`, the refresh token rotated once, the session still works, and the old refresh token is dead.
- **The test catches the bug.** Run against the original `silentRefresh.ts` it fails: "the refresh endpoint was called more than once, Expected 1, Received 2" (both tabs sent the same refresh token). With the fix it passes.
- **`06-login-routing` workaround: kept, not removed.** I removed the `about:blank` detour and re-ran the "silently refreshed" test 8 times: **3 of 8 failed** (timeout). So the real fix does not make the workaround unnecessary. That test's race is the old page and the new page of the **same tab** (an unload mid-rotation can lose the response of a rotation the server already did), which no cross-tab lock can repair. The workaround stays; only its comment was updated to say so.

### (b) Guardian post-decline clause tagged (B-169)
- `GuardianConsentConfirmPage.tsx`: the clause "You have declined permission for this account, so it stays switched off." now ends with `[COPY PENDING LEGAL REVIEW]`. Wording unchanged. Manifest row added (`docs/pending-copy-manifest.md`); `pendingCopyManifest.test.ts` passes 15/15.
- **`CONSENT_SCREEN_VERSION` v4 -> v5 and `CONSENT_SCREEN_TEXT_HASH` updated** in `services/api/src/modules/auth/guardian-consent/consent-screen-version.constants.ts`. **This touches `services/api`, which your brief said not to.** The tag is part of the guardian-visible text the Decision Log #348 tripwire hashes, so without the bump CI fails (`consent-screen-version.spec.ts`), and B-169 itself specifies the bump in the same PR. It is the same single constants file FC2 and FC3a touched for the same reason; nothing else in `services/api` changed. The whole `guardian-consent` directory ran green: 17 suites, 258 tests.

### (c) `semantic/alert` for error callouts (B-166)
- Token added: `semanticAlert: "#FA0606"` (Light and Dark, the Figma variable `VariableID:5670:8226`, Decision Log #99) in `packages/shared/src/tokens/index.ts`, mapped to `--sn-semantic-alert` in both `apps/web/src/theme/applyTheme.ts` and `apps/admin/src/theme/adminTheme.ts`. No other colour. A test in each app asserts the variable is applied.
- Used for the **accent only** (adopted reading of #408 item 4): bar, border, icon. Error text stays navy, buttons stay navy (white on alert is 4.12:1, below AA). The CSS test in `e2e/tests/13` asserts the border is `rgb(250, 6, 6)` and the text is **not**.
- Applied where the frames draw red (checked by reading the nodes bound to the variable in `6649:24714`, `6752:30141`, `6738:28693`, `6738:28328`): the Revoke error banner, the DOB guardian validation banner, the incorrect-details reports load-error and resolve-failed banners (all `.us-error` / `.ud-callout--error`, 6 px left bar), the field error line (3 px bar) and the invalid-input border (`.ud-input[aria-invalid]`), all in `apps/admin/src/pages/users/users.css`.
- **Not changed:** error callouts on pages whose frames draw no red bar (`.ac-error` articles/categories, `.ct-error` contest, `.med-error` media, `.mod-error` moderation); `apps/web` (no `apps/web` frame in this brief draws a red callout, so the token is available there but unused); the LIVE and unread dots (brand green, not covered by #408).

### (d) Developer notes removed from `apps/admin`
Each string changed (old -> new):

| File | Old | New |
|---|---|---|
| `layout/AdminPageHeader.tsx` (tooltip) | Admin search is not available yet — no search endpoint exists in services/api. | Admin search is not available yet. |
| `pages/articles/CreateArticlePage.tsx` | Image attachment ships once the Media library backend exists. | Uploading images from this form is not available yet. |
| `pages/competitions/CompetitionCreatedPage.tsx` (banner) | No competitions backend exists (Decision Log #72/#73) — this success screen is not reachable from a real flow. Shown for design fidelity. | Competitions can't be created yet, so this screen can't be reached. It is shown as a preview of the success message. |
| same (link note) | View competition board (not built) | View competition board (not available yet) |
| `pages/competitions/CreateCompetitionPage.tsx` (banner) | No competitions admin endpoint exists. The Competition umbrella (Prediction / Commentary types, votes) is parked — Build Plan Section 2.2, Decision Log #72/#73. This form is not submittable. | Competitions can't be created yet. This form is a preview and can't be submitted. |
| `pages/DashboardPage.tsx` | Sample — not real data. No league concept exists on User; blocked on Decision Log #6. | Sample — not real data. |
| `pages/moderation/AppealReviewPage.tsx` | ...actioned the original report (Decision Log #138) — the backend rejects this decision outright if you were that reviewer. The outcome is final, and the reported user is notified. | ...actioned the original report. If you were that reviewer, this decision is rejected. The outcome is final, and the reported user is notified. |
| same | The reported user's own identity isn't part of this response — `Report` has no denormalized reported-user column (it's resolved dynamically depending on targetType, see the moderation module's README). | The reported user's identity is not shown here. |
| `pages/moderation/ModerationQueuePage.tsx` | ...made the original decision (Decision Log #138). Both the reporter and the reported user are notified of the outcome (Build Plan Section 8.4). | ...made the original decision. Both the reporter and the reported user are notified of the outcome. |
| same (callout 1) | Reported content and the reporter are shown by id — the queue endpoint (GET /admin/moderation/reports) doesn't return a display name or a content preview, only the raw Report row. A future pass could join in reporter/author names; flagged, not built here. | Reported content and the reporter are shown by id. Names and a content preview are not shown in the queue. |
| same (callout 2) | Recording an action on a report does not by itself enforce it — there is still no content-removal mechanism. A real account-suspension mechanism now exists (PATCH /admin/users/:id, Users), but actioning a report as "Suspend User" here does not automatically call it — a moderator suspends a reported user separately, on the Users screen, if the decision warrants it. Actioning a report only records the decision and notifies both parties. | Recording an action on a report does not by itself enforce it, and content is not removed automatically. Actioning a report as "Suspend User" does not suspend the account: a moderator suspends a reported user separately, on the Users screen, if the decision warrants it. Actioning a report only records the decision and notifies both parties. |
| `pages/moderation/ReportDetailPage.tsx` | Once actioned, both the reporter and the reported user are notified of the outcome (Build Plan Section 8.4). Recording an action does not by itself remove content or suspend an account — see the moderation module's own disclosed-limitation note. | Once actioned, both the reporter and the reported user are notified of the outcome. Recording an action does not by itself remove content or suspend an account. |
| `pages/settings/RoleFormPages.tsx` (banner) | There is no self-service admin/moderator account creation or deletion endpoint — accounts are provisioned by direct DB insert (Decision Log #191). | Admin and moderator accounts can't be added or removed from this screen yet. |
| same (note) | This screen really creates an admin/moderator account (name, email, password) — see Decision Log #191 for why that is not self-service. | This screen would create an admin or moderator account (name, email, password). |

- No real product wording and no `[COPY PENDING LEGAL REVIEW]` string was removed or reworded.
- **Guard:** `apps/admin/src/noDeveloperNotes.test.ts` scans every screen component (comments stripped) and fails on `Decision Log`, `Build Plan`, `services/api`, `endpoint`, `backend`, `direct DB insert` or `README` in markup or string literals. I proved it bites by injecting "Decision Log #6" into a string (it failed) and reverting.
- Three existing tests that asserted the old strings were updated. Comments in source files are untouched (not visible to a user).
- **Not in scope, flagged:** `apps/web` was not swept for developer notes (the brief says `apps/admin`).

### (e) Mobile header, signed in (<= 820 px) (B-178)
- `apps/web/src/layout/Header.tsx` (+ `Header.css`): below 820 px the header is the Figma `header 4 — mobile`: logo, a **search icon** (a link to `/search`), the messages glyph, and the avatar, which opens the existing `NavDrawer`. **The nine-icon row and the disabled search box are not rendered on mobile** (they stay on desktop). Height 64 px, as drawn. Two icons were exported from the Figma nodes (`search-mobile.svg` from `5387:7664`, `menu-hamburger.svg` from `6784:29490`).
- **"Search field as drawn" is a search icon.** K4 found `header 4 — mobile` draws a search **icon**, not a field (K4 report section 6, finding). Built as drawn, as a real link to `/search` (which exists), not a disabled input.
- **No overflow at 390 px**, measured in the browser on 13 signed-in pages: `/community`, `/blog`, `/sports-hub`, `/profile`, `/notifications`, `/clubs`, `/banter`, `/leaderboard`, `/messages`, `/groups`, `/grassroots`, `/settings`, `/search`: all 0. **One page was not clean and I fixed it:** `/profile` scrolled 175 px sideways (the page body, not the header: the 120 px avatar + 32 px padding + a long email in the name block). `ProfilePage.css` now stacks the header and lets long values wrap below 820 px. The existing QA 390 px checks (spec 09) still pass.

### (f) Mobile header, logged out, and the logged-out drawer (B-178)
- Built to the K4 frames `6784:29476` (closed) and `6785:29485` (drawer open): logo, search icon, the **Login** button, and a **menu control** (the `bx:menu` hamburger) that opens the drawer.
- `NavDrawer.tsx` gains `variant="logged-out"` (reuse, not a second component): Login (navy, filled) and Sign up (outlined) replace the identity block; the rows are **Sports Hub, Blog, Scouting, Academy** (`loggedOutDrawerNavItems` in `navigation.ts`, the sections the K4 report found a logged-out visitor can open); marker dots on the rows as drawn; no divider, no Log out. Close on scrim, Escape, or choosing a row. The signed-in drawer is unchanged.
- **K4's "component change needed" is still OPEN in Figma** (`header 7 — mobile` has no Logged Out variant with the menu control, `Navigation Drawer — Mobile` has no logged-out variant). **I built to the frames anyway**, as instructed.
- Playwright at 390 px (spec 12): signed in has no icon row, 64 px header, the avatar opens the drawer (Log out visible), a row navigates and closes it; logged out shows Login + menu control, the menu lists exactly the four sections plus Login and Sign up (no Log out), "Sports Hub" and "Login" are reachable, Escape/scrim close. Logged-out overflow checked on `/`, `/sports-hub`, `/blog`, `/scouting`, `/community`, `/search`: 0. Unit tests: 6 new in `Header.test.tsx`.

### (g) Revoke username: the 30-day hold line (B-168)
- Read from the three frames, node by node: the dialog frame `6647:25789` and the error frame `6649:24714` carry, as a second line of the dialog body, "The username is held for 30 days after it is revoked: nobody can take it, and this user cannot choose it again."; the revoked frame `6649:24462` carries, in the banner, "Username revoked. The action was recorded. The username is held for 30 days."
- Built exactly: `UserDetailPage.tsx` shows the line in the dialog (it stays visible in the error state, as the error frame draws it) and in the revoked banner.
- **No tag on the line** (the frames tag only the first line, which already has its manifest row), so **no new manifest row**. **No held-until date** (no frame draws one; `heldUntil` from the response is not shown).

## 2. Verification (measured)

- `apps/web`: `tsc --noEmit`, `npm run lint`, `npm run build` clean. vitest **72 files / 662 -> 73 files / 673 tests, 0 failures** (before = the FC3a figure on `origin/main`; new: 6 in `Header.test.tsx`, 4 in `silentRefresh.test.ts`, 1 new file `applyTheme.test.ts`).
- `apps/admin`: `tsc`, lint, build clean. vitest **18 files / 207 -> 20 files / 211 tests, 0 failures** (2 guard tests, 2 token tests; three existing tests updated to the new wording).
- `services/api` `guardian-consent` directory: 17 suites / 258 tests, 0 failures (includes the tripwire at v5). The full mocked suite was not re-run.
- Pending-copy manifest test: 15/15 (now with the new row).
- **e2e (real Chrome, real API, Postgres, Redis): full suite 176 -> 180 passed, 0 failed (7.9 min).** The 4 new tests: the two-tab refresh lock, the signed-in and logged-out mobile header at 390 px (spec 12), and the admin revoke/validation screens (spec 13).

## 3. Visual check in a real browser (screenshots in `docs/fc4-screens/`)

Chrome via Playwright at the frame sizes (390 px mobile, 1440 px admin), compared with the K4 and pass K frames (frame PNGs saved in `docs/fc4-screens/frames/`):

| Screenshot | Compared with | Result |
|---|---|---|
| `mobile-header-logged-out-closed.png` | `6784:29476` | Matches: logo, search icon, Login, hamburger, 64 px. |
| `mobile-header-signed-in-closed.png` | `6784:29454` | Matches: logo, search icon, messages, avatar. **Difference:** the avatar is the app's initials-less green-tint disc, the frame shows a photo (no avatar image field exists). |
| `mobile-drawer-logged-out.png` | `6785:29485` | Matches: Login, Sign up, four rows with dots, scrim and shadow. **Difference:** headless Chrome in this environment renders the system sans-serif where the frame uses Montserrat/Inter (font file not loaded), so glyph widths differ slightly. |
| `mobile-drawer-signed-in.png` | signed-in drawer | Unchanged component. |
| `admin-01-revoke-dialog.png`, `admin-03-revoke-error.png`, `admin-04-username-revoked.png` | `6647:25789`, `6649:24714`, `6649:24462` | Hold line present in the dialog, the error state and the banner; red bar on the error banner. |
| `admin-02-revoke-field-error.png`, `admin-05-dob-guardian-validation.png` | `6752:30141` | Red bar on the validation banner, red invalid borders on the three guardian fields. |

Known differences, all deliberate: the reason field in the revoke dialog (not drawn, required by the endpoint, as FC3b); admin page header/shell as in the existing admin screens.

**Not visually checked:** the guardian post-decline clause (reached only through a guardian link after a decline; covered by the unit test and the manifest row, no screenshot), and the `/profile` mobile layout beyond the measured zero overflow (no frame for a 390 px profile header).

## 4. Open points and findings not fixed

1. **`services/api` was touched** (one constants file, section 1b), against the brief. Reason and scope are stated above; revert it and CI's tripwire fails.
2. **The `06` workaround stays** (section 1a). Same-tab old/new page race, not a cross-tab race; recorded in the test comment.
3. `apps/web` has no consumer of `semantic/alert` yet (B-166 says the LIVE and unread dots stay brand green, so none was needed).
4. The page minimum heights that still use `calc(100vh - 90px)` (guardian consent, verify email, club picker, sign-up split) assume the old 90 px desktop header; on mobile the header is now 64 px, so those pages end up to 26 px shorter than the viewport. No scroll or overflow results; cosmetic.
5. The mobile search icon links to `/search`, which for a logged-out visitor shows the "log in" prompt (the frame draws the icon, not what it opens).
6. Admin error callouts on pages whose frames draw no red (`.ac-error`, `.ct-error`, `.med-error`, `.mod-error`) are still navy; whether to unify them is a design call.
7. The K4 Figma "component change needed" (a Logged Out variant of `header 7 — mobile` and of `Navigation Drawer — Mobile`) is still open in Figma.

## 5. Register status lines (for you to route; `docs/build-register.md` is not edited)

- **B-164:** `FC4 2026-10-20 (docs/fc4-report.md): BUILT (apps/web). silentRefresh.ts rotates under a cross-tab lock (Web Locks API; localStorage lease fallback) and re-reads the stored tokens first. Unit tests + a two-page Playwright test (fails on the old code: two refresh calls; passes now). The 06-login-routing workaround is kept: removing it failed 3 of 8 repeats (same-tab race).`
- **B-166:** `FC4: BUILT. semanticAlert #FA0606 added to packages/shared and both apps' theme (--sn-semantic-alert). Used for the accent bar / border of error callouts and invalid fields on the admin users screens (revoke, DOB guardian validation, incorrect-details reports). Text and buttons stay navy. Other admin error callouts and apps/web unchanged.`
- **B-168:** `FC4: BUILT (apps/admin). The 30-day hold line shown in the Revoke username dialog (also in the error state) and the revoked banner, wording exactly from frames 6647:25789, 6649:24714, 6649:24462. No tag on it, no manifest row, no held-until date (no frame draws one).`
- **B-169:** `FC4: BUILT. The clause 'so it stays switched off' is tagged, its manifest row added, CONSENT_SCREEN_VERSION v4 -> v5 and the text hash updated (one services/api constants file).`
- **B-178:** `FC4: BUILT (apps/web). Mobile header <= 820 px: signed in = logo, search icon, messages, avatar opening NavDrawer, no nine-icon row; logged out = logo, search icon, Login, menu control opening NavDrawer variant 'logged-out' (Sports Hub, Blog, Scouting, Academy, Login, Sign up). Built to the K4 frames; the K4 Figma component change is still OPEN. 0 overflow at 390 px on 13 signed-in and 6 logged-out pages (one fix: /profile).`
- **B-132:** `FC4: the mobile header no longer renders the icon row at all (supersedes the scrolling icon row FC3a kept); /profile overflow at 390 px fixed.`
- **B-124:** `FC4: manifest gains one row (the guardian post-decline clause); the apps/admin developer notes are gone (guard: noDeveloperNotes.test.ts).`
