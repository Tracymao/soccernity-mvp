# FC5: profile, Block and Contest frontend (2026-10-25)

Branch `fc5/profile-block-contest-frontend`, from `origin/main` at `619842a` (after W5 #439, W6 #441, W7 #443, D11 #445, K6 #442 and pass L #446). Build register Section 37. This report lists what was built, the judgment calls, and everything that is not built.

## 1. What was built

### apps/web

| Area | Rows | Where |
|---|---|---|
| Create Profile (full) | B-081, B-194, B-196, B-215, B-216 | `pages/CreateProfilePage.tsx` |
| Edit Profile fields and image controls | B-194, B-196, B-215, B-216 | `pages/profile/EditProfileModal.tsx`, `ProfileImageControl.tsx`, `rephrase.tsx` |
| Own profile | B-081 | `pages/ProfilePage.tsx` (cover, avatar, bio, country, preferred club) |
| Other-user profile | B-082, B-007 | `pages/OtherProfilePage.tsx`, route `/users/:userId` |
| Block and Blocked users | B-007, B-108, B-197 | `OtherProfilePage.tsx`, `pages/settings/BlockedUsersPage.tsx`, Privacy row |
| Restricted Pending status line | B-199 | `GuardianConsentPage.tsx` |
| Guardian footnote | B-185 | `GuardianConsentConfirmPage.tsx` |
| Developer-notes guard and sweep | B-186 | `noDeveloperNotes.test.ts` and ~15 rewordings |
| Page heights | B-187 | four CSS files, `AppShell.css`, `AuthChrome.css` |
| Contest page, Voting, Leaderboard tab, final-week upload, forfeit pop-ups | B-098, B-099 | `ContestPage.tsx`, `ContestVotingPage.tsx`, `leaderboard/ContestBoard.tsx`, `community/FinalWeekPanel.tsx` |
| Contest notification rows | B-123 | `NotificationCentrePage.tsx`, `api/notifications.ts` |

### apps/admin

Contest rebuilt against the self-running API (B-097): console (read-only status), create and edit form, cycle detail, cycle history, finalist impressions (disclosed stub). The Judge Week, Open the Final, Crown Winners and Start a Cycle pages and routes are deleted.

### services/api (small)

- `GET /auth/guardian-consent/request-summary` returns `expiresAt`, needed for the footnote date. `CONSENT_SCREEN_VERSION` v5 to v6 with the new hash.
- `test/grassroots.e2e-spec.ts`: a restricted-pending minor is refused (403 `guardian_consent_pending`) on `POST /teams`, `POST /fixtures`, `PATCH /fixtures/:id/status` and `POST /fixtures/:id/result`, and reads stay open.

## 2. Judgment calls (all open to veto)

1. **Which strings carry the tag.** The instruction said to tag all new wording. Decision Log #412 item 5 says a string carries the tag only when it makes a legal or safety promise (what is checked, who sees it, what blocking does) and that buttons, progress and status labels do not. I followed #412 item 5. Every tagged string has a manifest row (17 added); the inventory test passes.
2. **Cover photo on Create Profile.** The Figma frame draws only the picture. B-196 and Decision Log #411 item 4 say the cover is optional at Create Profile too, so I added it.
3. **Cover crop.** The browser centre-crops to 796/192 (the desktop cover slot of the K2/K4 frames) before upload. The mobile slot is a different shape (about 390x120) and is shown with `object-fit: cover`. The crop step with position and zoom (B-210) is not drawn and not built.
4. **Rejection reason.** B-214 (the backend column and notification) is not built, so the control renders `Reason: ...` only when the server sends one.
5. **Item 8, "notifications hidden per D11".** D11 is `backend/notification-actor-id` (B-213): like and comment rows between a blocked pair are hidden at read time by the server. The frontend therefore needs no filter. I added a regression test that the page renders exactly what the server returns. If you meant a different change, say so.
6. **Contest rules modal.** Its placeholder text ("founder to supply final Contest Rules copy") is founder-mandated (Decision Log #227) and was left, so it is the one exception to the developer-notes guard intent.
7. **Final-week upload.** There is no media upload endpoint for posts, and `POST /contest/final-entry` needs at least one media URL, so the composer takes an https "Video link". It says so on screen.
8. **Weekly winners** show no placement points: the points are not returned to users.
9. **Voting page** omits "Your fans right now" and the "Last week" points board (no data) and shows "Winners so far" instead, which is real.
10. **B-187.** Only `GuardianConsent.css` and `VerifyEmail.css` (under `AppShell`) had the wrong offset at narrow widths. `ClubPickerStep.css` and `SignupSplitScreen.css` sit under `AuthChrome`, whose bar is 90px at every width, so they were already right. All four now read one variable, `--sn-chrome-height`.
11. **Own-id redirect.** `OtherProfilePage` no longer fetches the profile when the id in the URL is your own (it redirects to `/profile`).

## 3. Not built

- B-214 / B-217 (rejection reason and the image-decision notification): need backend work.
- B-210 (the cover crop step), B-092 (exposure engine: no impression counts, no Final week carousel, no pinned final entry on a profile), B-093, B-094 (follow and post points are still awarded).
- A guardian withdrawal web page (B-112): the footnote sentence names it.
- Admin Revoke username remains as it was (not part of this task).

## 4. Verification

| Suite | Before (clean main) | After |
|---|---|---|
| apps/web vitest | 73 files / 673 tests | 83 files / 769 tests, 0 failures |
| apps/admin vitest | 20 files / 211 tests | 20 files / 218 tests, 0 failures |
| services/api: `consent-screen-version`, `guardian-consent-summary` | n/a | 3 suites / 29 tests, 0 failures |
| services/api e2e: `grassroots.e2e-spec.ts` | 31 tests (last recorded) | 38 tests, 0 failures |
| Playwright `e2e/` (180 tests) | 180 (last recorded) | first run 177 passed, 1 failed, 2 did not run; the failure was my Create Profile rewrite changing the heading ("Create your profile") and button ("Continue"), restored; re-run of specs 01 and 07: 24/24 passed |

`npx tsc --noEmit`, `npm run lint` and `npm run build` are clean in `apps/web` and `apps/admin`.
