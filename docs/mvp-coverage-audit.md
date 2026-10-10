# MVP coverage audit — Figma frames vs code vs endpoints

Audit date: 2026-10-08. Branch `audit/mvp-coverage-audit` from `origin/main` `06dcaa087015e605bd4bc3535b0e66062f8e7ce0`.
Read-only: no application code, schema, Figma, Decision Log or `.docx` was changed. Only this report and one CLAUDE.md disclosure entry were added.
Classification only — no fixes are recommended and none are written.

Sources checked: live Figma file `weZWWqggy9j13eX8bhFgs6`, page `0:1` (`get_metadata` full-page dump, `get_design_context` on key frames); `apps/web/src/app/router.tsx`, `apps/admin/src/app/routes.tsx`; every `*.controller.ts` under `services/api/src` (152 route handlers extracted by script); `services/api/prisma/schema.prisma`; email, guardian-consent, auth and account-deletion services; `render.yaml`, `.env.example`; `docs/legal-copy-draft-tos-privacy-policy.md`. CLAUDE.md, the Decision Log and earlier sprint closures were treated as claims to check, not as evidence.

## GitHub checks for the latest origin/main commit

Commit `06dcaa087015e605bd4bc3535b0e66062f8e7ce0` (PR #388 merge). `gh api .../check-runs` returned 1 check run: `build-and-test`, status `completed`, conclusion `success`. The legacy combined-status endpoint reported `pending` with no statuses attached (nothing posts legacy statuses; not a failure). Access to the checks API worked via the authenticated `gh` CLI (account `Tracymao`).

## Method and what the statuses mean

- **Scope of frames.** The page has 565 top-level nodes: **443 frames** and 122 non-frame nodes (13 symbols/components, 53 loose text labels incl. section banners, 40 rounded-rectangles used as section banners, vectors, icons). Of the 443 frames: **36 are hidden/`ARCHIVED —`** (not screens, not counted), **65 are reference/component/annotation frames** (design notes, tokens, navbars, icon fragments, title heads — not screens), leaving **342 screen frames** that were mapped. Desktop vs mobile is by frame width (≤440px = mobile). Mobile frames of a page are mapped to the same responsive route as their desktop twin; mobile layout parity was **not visually inspected** anywhere.
- **Built** = a route/page exists, is wired to the real endpoint(s), and no field/state mismatch was found *in the code paths I read*. It does **not** mean pixel or copy parity — that was only checked where a note says so. Pixel-level comparison of all 342 frames was not done (unknown).
- **Partial** = exists but something is missing/different; the exact difference is in the Notes column.
- **Stub** = placeholder, disabled controls, "designed, not built" screens, or dummy data.
- **Missing** = no route or page.
- **Reference / Archived** are listed but not counted.
- **NotInspected** = frame exists and a plausible code home exists, but I could not confirm the specific variant/state.
- Figma text content is only partially recoverable from `get_metadata` (many text layers keep generic layer names), so frame copy was read with `get_design_context` for these frames: `5108:6626`, `5108:6627`, `5108:6628`, `5108:6629`, `5108:6630`, `5108:6631`, `5491:8241`, `5498:7164`, `5501:8536`, `6113:14053`. Every other frame's copy is **not inspected** beyond layer names (a keyword search of all text-node names is in Q6/Q7).
- Tags: `signup-flow`, `profile`, `username`, `contact-us`, `guardian-copy`, `country`, `admin`, `other`.

## 1. Summary

| Status | Screens |
|---|---:|
| Built | 196 |
| Partial | 71 |
| Stub | 34 |
| Missing | 35 |
| NotInspected | 6 |
| **Screen frames mapped** | **342** |
| Reference / component / annotation (not counted) | 65 |
| Archived / hidden (not counted) | 36 |

Gap counts by tag (Partial + Missing + Stub): signup-flow 15, profile 18, guardian-copy 15, country 2, contact-us 4, admin 8, other 78 (most "other" Stubs are the designed-but-unbuilt Settings leaves and the Competition leaderboard boards).

### Top gaps, ranked by user impact

1. **[signup-flow] No real user can complete the guardian or email verification journey from the emails.** The guardian-consent email body is `Your consent code is: <token>` with no link and no button (`services/api/src/modules/auth/registration/email/registration-email.service.ts:324-328`, HTML at `:470-475`), and nothing in `services/api/src` builds `/guardian-consent/confirm?token=…` (the only email that uses `WEB_APP_BASE_URL` is password reset, `password-reset-email.service.ts:78`). The verify-email email is likewise a bare code (`:322`, `:468-469`) while `VerifyEmailPage.tsx` only works from `?token=` in the URL. The Figma email (`5108:6628`) shows a "Review and give consent" button and a pasted `soccernity.app/consent/<id>` link.
2. **[signup-flow] A minor is never routed to the status/activation page.** Registration does not store a session (`RegisterStep.tsx:104-110` passes the token to the club picker in memory, then `navigate("/")`); login always does `navigate("/")` (`LoginPage.tsx:74`), `/` redirects any token holder to `/community` (`HomePage.tsx:123`). `/guardian-consent` ("Restricted Pending" / "Activation Confirmation") is reachable only by typing the URL, the profile badge, or an error-message link. There is no polling, no push, and **no email to the minor when a guardian approves** (no template exists).
3. **[other] Production readiness gaps:** under-13 US guardians fail closed with HTTP 503 because Stripe keys are `replace-me` (`stripe-card-verification.gateway.ts:11,29,39`); Cloudflare R2/S3 credentials are placeholders so `POST /admin/media/upload` returns 503 (`s3-storage.service.ts:48-60`); 22 variables read in code are absent from `render.yaml` (including `ADMIN_JWT_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `S3_ENDPOINT`; full list in Q11); the render blueprint defines only the two API services (no host for `apps/web` / `apps/admin`).
4. **[profile][contact-us] Whole designed screens have no code:** Create Profile (`1498:2303`, `1629:2449`), viewing another user's profile (no frame and no route; `GET /users/:id/public-profile` has no consumer), Contact Us (4 frames, no route/endpoint; footer "Contact Us" is a non-link), saved-posts tab/screen, standalone post page, message-sidebar/chat popup, conversation actions menu, Contest entries/ranking/voting.
5. **[guardian-copy] Guardian/minor copy promises things that do not exist:** "Build a player profile — Position, club or school team, and stats they add themselves" (`GuardianConsentConfirmPage.tsx:63-64`, Figma `5113:6669`) and "Add your position and photo. It stays private until approval." (`GuardianConsentPage.tsx:299`, Figma `5114:6698`) — there is no position, school-team, stats, photo or avatar field in the schema, API or UI.
6. **[guardian-copy][signup-flow] Decline flow is incompatible with the Figma.** Figma `5491:8241` tells the minor "You can send a new request, or use a different guardian email". Code makes a decline an immediate `pending_deletion` with all sessions revoked (`guardian-consent.service.ts:600-671`, `auth.service.ts:265-271`), so the minor cannot log in and no such page can render.
7. **[country][signup-flow] Country and guardian-name shape differ between Figma and code.** Figma Guardian Details (`5108:6627`) has no country field and one "Guardian's full name" input; code has a required country select and First/Last name inputs.
8. **[other] Other findings:** opaque pagination cursors for user search and club/group rosters carry the raw `displayName` (base64) to other users; the web client never calls `POST /auth/logout` or `POST /auth/refresh` (log-out only clears browser storage; the access token expires with no silent refresh).

## 2. Frame-by-frame table (Part 1)

Columns: Node ID, frame name (truncated to 80 chars), D/M, route/page that implements it, backing endpoint(s) with controller file and line, status, tag, notes. Frame nodes are all on page `0:1`. Data-field mapping for the screens with field-level gaps (Create Profile, Guardian Details, Contact Us, Edit Profile, Account Information) is in the Notes column and in Q3/Q5/Q8/Q13.

| Node ID | Frame | D/M | Route / page | Endpoint(s) | Status | Tag | Notes |
|---|---|---|---|---|---|---|---|
| 1009:128 | ARCHIVED - Blog Page Desktop (superseded by Blog Page Desktop - Logged In / - Lo | desktop | n/a (hidden/archived) | n/a | Archived | other |  |
| 2496:4456 | ci:notification-outline-dot | mobile | icon fragment | n/a | Reference | other |  |
| 2496:4458 | bx:message-dots | mobile | icon fragment | n/a | Reference | other |  |
| 2496:4443 | Group 258 | mobile | loose component fragment | n/a | Reference | other |  |
| 2496:3971 | Group 36 | desktop | loose component fragment | n/a | Reference | other |  |
| 2496:3975 | Group 37 | desktop | loose component fragment | n/a | Reference | other |  |
| 2496:3962 | Group 4 | desktop | loose component fragment | n/a | Reference | other |  |
| 41:4 | ARCHIVED - Blog Page Mobile (375px - superseded by Blog Page Mobile - Logged In  | mobile | n/a (hidden/archived) | n/a | Archived | other |  |
| 54:434 | ARCHIVED - Articles Page Desktop (superseded by Articles Page Desktop - Logged I | desktop | n/a (hidden/archived) | n/a | Archived | other |  |
| 87:80 | ARCHIVED - Articles Page mobile (375px - superseded by Articles Page Mobile - Lo | mobile | n/a (hidden/archived) | n/a | Archived | other |  |
| 2230:2782 | bx:menu | mobile | icon fragment | n/a | Reference | other |  |
| 2230:2806 | Group 102 | mobile | loose component fragment | n/a | Reference | other |  |
| 87:158 | ARCHIVED - Contact Us Desktop (superseded by Contact Us Desktop - Logged In / -  | desktop | n/a (hidden/archived) | n/a | Archived | other |  |
| 205:2 | Sports Page  - when user is not logged in | desktop | /sports-hub SportsHubPage.tsx | GET /sports/live-scores (sports-matches.controller.ts:23); GET /sports/fixtures (:28) | Built | other | 'Most Recent Stories' aside is illustrative (no endpoint). |
| 1009:673 | Sports Page - when user is logged in | desktop | /sports-hub SportsHubPage.tsx | GET /sports/live-scores (sports-matches.controller.ts:23); GET /sports/fixtures (:28) | Built | other | 'Most Recent Stories' aside is illustrative (no endpoint). |
| 632:943 | Match Details | desktop | /sports-hub/matches/:matchId MatchCentrePage.tsx | GET /sports/matches/:id (:37) | Built | other |  |
| 640:3737 | Match Statistics | desktop | MatchCentrePage.tsx Statistics tab | GET /sports/matches/:id/stats (:42); /box-score (:49) | Partial | other | Provider capability gaps (e.g. xG, ratings, pressure index) hidden/placeholder per sports capability registry. |
| 667:151 | First Half Statistics | desktop | MatchCentrePage.tsx Statistics tab | GET /sports/matches/:id/stats (:42); /box-score (:49) | Partial | other | Provider capability gaps (e.g. xG, ratings, pressure index) hidden/placeholder per sports capability registry. |
| 667:1511 | Second Half Statistics | desktop | MatchCentrePage.tsx Statistics tab | GET /sports/matches/:id/stats (:42); /box-score (:49) | Partial | other | Provider capability gaps (e.g. xG, ratings, pressure index) hidden/placeholder per sports capability registry. |
| 667:1952 | Lineups | desktop | MatchCentrePage.tsx Lineups tab | GET /sports/matches/:id/lineups (:54) | Built | other |  |
| 756:11 | H2H | desktop | MatchCentrePage.tsx H2H tab | GET /sports/matches/:id/h2h (:59) | Built | other |  |
| 756:6433 | Standing | desktop | MatchCentrePage.tsx Standings tab | GET /sports/standings (sports-standings.controller.ts:15) | Partial | other | FORM column has no vendor data (standingsForm unsupported on Highlightly). |
| 760:11533 | Video | desktop | MatchCentrePage.tsx Video tab | GET /sports/highlights/:matchId (:83) | Built | other |  |
| 102:340 | ARCHIVED - Terms of Service Desktop (superseded by Terms of Service Desktop - Lo | desktop | n/a (hidden/archived) | n/a | Archived | other |  |
| 104:444 | ARCHIVED - Privacy Policy Desktop (superseded by Privacy Policy Desktop - Logged | desktop | n/a (hidden/archived) | n/a | Archived | other |  |
| 96:253 | ARCHIVED - Contact Us Mobile (375px - superseded by Contact Us Mobile - Logged I | mobile | n/a (hidden/archived) | n/a | Archived | other |  |
| 104:393 | ARCHIVED - Terms of Service mobile (375px - superseded by Terms of Service Mobil | mobile | n/a (hidden/archived) | n/a | Archived | other |  |
| 104:474 | ARCHIVED - Privacy Policy mobile (375px - superseded by Privacy Policy Mobile -  | mobile | n/a (hidden/archived) | n/a | Archived | other |  |
| 2072:5584 | Contest - content entries and ranking page | desktop | none | none | Missing | other |  |
| 2155:1062 | Contest - contest details page | desktop | /contest ContestPage.tsx | GET /contest/current (contest.controller.ts:23); POST /contest/entries (:54) | Partial | other | Entries/ranking/voting subpages absent. |
| 2404:2178 | u:chat-bubble-user | mobile | icon fragment | n/a | Reference | other |  |
| 2363:2244 | ARCHIVED - Contest - Contest Task tab (superseded by the Contest admin console s | desktop | n/a (hidden/archived) | n/a | Archived | other |  |
| 2363:3446 | ARCHIVED - Contest - scheduled contest task tab (superseded by the Contest admin | desktop | n/a (hidden/archived) | n/a | Archived | other |  |
| 2094:994 | Contest - content voting page | desktop | none | none (no vote endpoint in contest.controller.ts) | Missing | other | Frame 'content voting page' / 'Voting' has no code or endpoint. |
| 1380:2297 | Success email - password change requested | desktop | none | none | Missing | other | Frame describes an email-link change flow that does not exist (CLAUDE.md). |
| 1380:2318 | Success email - password changed | desktop | none | none | Missing | other |  |
| 1661:2724 | Success email - admin account created | desktop | none | none | Missing | admin | POST /admin/staff sends no email. |
| 1661:2741 | Success email - account created - other roles not admin | desktop | none | none | Missing | other | No welcome email template. |
| 1380:2274 | Success email - account created | desktop | none | none | Missing | other | No welcome email template. |
| 110:5 | Dashboard | desktop | /dashboard DashboardPage.tsx | GET /admin/dashboard/stats (admin-dashboard.controller.ts:28) | Partial | admin | 'New users by league' + 'Latest posts' remain sample data (StubSection/StubTable imports, DashboardPage.tsx:16). |
| 123:56 | Articles | desktop | /articles ArticlesPage.tsx | GET /admin/articles (:38); PATCH :id (:48) | Built | admin | No edit-article page (list has publish toggle only). |
| 124:313 | Articles - Create Post | desktop | /articles/new CreateArticlePage.tsx | POST /admin/articles (admin-articles.controller.ts:43) | Built | admin |  |
| 128:488 | Categories | desktop | /categories CategoriesPage.tsx | GET /admin/categories (:22); PATCH :id (:32) | Built | admin |  |
| 1658:2303 | Settings | desktop | /settings SettingsRolesPage.tsx | GET /admin/staff (admin-staff-roles.controller.ts:37) | Built | admin | Frame named 'Settings' (1658:2303) is the role/team list. |
| 1658:2592 | Settings - Edit role | desktop | /settings/roles/edit/:id EditRolePage (RoleFormPages.tsx) | PATCH /admin/staff/:id/role (:48), /status (:61), /admin/users/:id/child-safety-vetting | Built | admin |  |
| 1658:2456 | Settings - Add new role | desktop | /settings/roles/new AddRolePage.tsx (StubShell, RoleFormPages.tsx:58-70) | POST /admin/staff exists (admin-staff-roles.controller.ts:43) but page not wired | Stub | admin | Backend now exists; page comment still says it 'remains a disclosed stub per Decision Log #191'. |
| 917:218 | Users - team members | desktop | /users UsersPage.tsx | GET /admin/users (admin-users.controller.ts:28); PATCH :id (:39) | Built | admin | Frame name says 'team members' but page lists platform users (Decision Log #142). |
| 361:553 | Media | desktop | /media MediaLibraryPage.tsx | GET /admin/media (:33) | Built | admin |  |
| 916:2362 | Media - Media Upload - step 1 | desktop | /media/upload MediaUploadPage.tsx | POST /admin/media/upload (admin-media.controller.ts:61) | Partial | admin | S3/R2 not configured: S3StorageService 503s without real credentials. |
| 917:24 | Media - Media Upload - step 2 | desktop | /media/upload MediaUploadPage.tsx | POST /admin/media/upload (admin-media.controller.ts:61) | Partial | admin | S3/R2 not configured: S3StorageService 503s without real credentials. |
| 396:442 | Media - Media Preview | desktop | /media/preview/:id MediaPreviewPage.tsx | GET /admin/media/:id (:43) | Built | admin |  |
| 138:93 | Categories - Add Category | desktop | /categories/new AddCategoryPage.tsx | POST /admin/categories (admin-categories.controller.ts:27) | Built | admin |  |
| 407:844 | Login desktop | desktop | /login LoginPage.tsx:1 | POST /auth/login (auth.controller.ts:32) | Partial | signup-flow | Frame carries Google/Apple/Facebook 'Or continue with' buttons (CLAUDE.md PR #103); none in LoginPage.tsx (grep google/apple/facebook = 0). No OAuth endpoint exists. |
| 407:1051 | Register desktop | desktop | /signup SignupFlow.tsx -> AgeGateStep + RegisterStep.tsx | POST /auth/register (registration.controller.ts:32) | Partial | signup-flow | Social sign-in buttons not coded; frame shows DOB picker on the register form but code collects DOB on a separate Age Gate step; frame has Username/Full-name rows differing by breakpoint; registration does NOT persist the session (RegisterStep.tsx:109 navigates to '/' with no token stored). |
| 409:1264 | Forgot Password desktop | desktop | /forgot-password ForgotPasswordPage.tsx | POST /auth/forgot-password (password-reset.controller.ts:20) | Built | other |  |
| 409:1463 | Reset Password desktop | desktop | /reset-password ResetPasswordPage.tsx | POST /auth/reset-password (password-reset.controller.ts:31) | Built | other |  |
| 1498:2303 | Create Profile desktop | desktop | none | none | Missing | profile | No route, page or endpoint. Fields: Full Name (displayName, collected at register), Username (User.username exists, edited only via EditProfileModal), Date of Birth (collected at Age Gate; encrypted, PATCH-excluded), Location (NO column), Bio (NO column), Preferred Club (clubAffiliationId unwritten; representedClubId via separate screen), Profile picture (NO column/upload endpoint), 'Create profile' button (no endpoint). |
| 949:73 | Post's comment section expanded | desktop | none standalone (comments inline in PostCard.tsx) | GET/POST /posts/:id/comments (feed.controller.ts:133,145) | Partial | other | No /posts/:id route exists (router.tsx). |
| 2876:4628 | Search page with trending topics | desktop | /search SearchTrendingPage.tsx | GET /search (search.controller.ts:16); GET /trending (trending.controller.ts:15); GET /users/suggested (users.controller.ts:66) | Built | other |  |
| 2896:4837 | Trending topics only | desktop | /search SearchTrendingPage.tsx | GET /trending | NotInspected | other | Variant not individually diffed. |
| 2905:4798 | Settings - Account | desktop | /settings/account AccountOverviewPage.tsx | none | Partial | profile | Account Information + Change Password rows disabled; Deactivate/Delete/Club Representation real. |
| 2922:6396 | Settings - Account Info (Confirm Password) | desktop | none (AccountOverviewPage row disabled) | none | Missing | profile |  |
| 2926:8056 | Settings - Security & Account Settings | desktop | /settings/security SecurityOverviewPage.tsx | none | Built | other |  |
| 2926:9230 | Settings - Filters | desktop | /settings/notifications/filters NotificationFiltersPage.tsx | none | Stub | other |  |
| 2926:9721 | Settings - Notification Preferences | desktop | /settings/notifications NotificationPreferencesPage.tsx | none | Stub | other | Hub only; leaf pages disabled. |
| 2927:9954 | Settings - Push Notifications | desktop | /settings/notifications/push PushNotificationsPage.tsx | none | Stub | other |  |
| 2927:10205 | Settings - Email Notifications | desktop | /settings/notifications/email EmailNotificationsPage.tsx | none | Stub | other |  |
| 2926:9482 | Settings - Muted accounts | desktop | /settings/notifications/muted-accounts MutedAccountsPage.tsx | none | Stub | other |  |
| 2926:8294 | Settings - Two-Factor Auth (SMS) | desktop | /settings/security/two-factor TwoFactorAuthPage.tsx | none (no 2FA backend) | Stub | other |  |
| 2926:8764 | Settings - Direct Messages & Read Receipts | desktop | none (PrivacySettingsPage row disabled) | none | Missing | other |  |
| 2926:8996 | Settings - Your Posts (Sensitive Media) | desktop | none (PrivacySettingsPage row disabled) | none | Missing | other |  |
| 2924:6870 | Settings - Change Password | desktop | none under /settings (AccountOverviewPage row disabled); working only inside EditProfileModal | POST /auth/change-password (auth.controller.ts:62) | Stub | other |  |
| 2924:7112 | Settings - Account Information (Edit) | desktop | none (AccountOverviewPage row disabled) | PATCH /users/:id exists for displayName/phone/username only | Missing | profile | Frame fields Username + Country 'no backend field yet' (5649:8189/8201 text): Country has no User column. |
| 2924:7358 | Settings - Deactivate Account (Intro) | desktop | /settings/account/deactivate DeactivateAccountPage.tsx | POST /auth/deactivate-account (auth.controller.ts:72) | Built | other |  |
| 2922:5143 | ARCHIVED - Settings - Security & Account (redundant one-row intermediate - super | desktop | n/a (hidden/archived) | n/a | Archived | other |  |
| 2922:5382 | ARCHIVED - Settings - Privacy & Safety | desktop | n/a (hidden/archived) | n/a | Archived | other |  |
| 2922:5602 | ARCHIVED - Settings - Notification Preferences (By Type) (losing competing hub - | desktop | n/a (hidden/archived) | n/a | Archived | other |  |
| 2922:5832 | Settings - Display, Language & Region | desktop | /settings/display DisplaySettingsPage.tsx | none | Stub | other |  |
| 1306:354 | Community homepage with message sidebar and chat pop up | desktop | none for sidebar/chat popup (CommunityPage.tsx has no message sidebar) | none | Missing | other | Page /community exists but the message sidebar + chat pop-up are not implemented. |
| 1761:2342 | ARCHIVED - Messages mobile window 1 (superseded by 2067:3006 (Message - List of  | mobile | n/a (hidden/archived) | n/a | Archived | other |  |
| 1306:7149 | Community Home Page Template | desktop | n/a (hidden/archived) | n/a | Archived | other |  |
| 2008:655 | Create a post | desktop | /community PostComposer.tsx + CommunityPage.tsx | POST /posts (feed.controller.ts:61); GET /posts/feed (:74) | Built | other |  |
| 2009:5168 | Create a post with attachment | desktop | /community PostComposer.tsx | POST /posts (feed.controller.ts:61) | Partial | other | Attachments disabled in composer (no media-upload endpoint for posts). |
| 2496:4462 | Create a post - feeds with pinned contest post | desktop | /community PostComposer.tsx + CommunityPage.tsx | POST /posts (feed.controller.ts:61); GET /posts/feed (:74) | Built | other |  |
| 2565:3951 | Create a post  - feeds with normal pinned post | desktop | /community PostComposer.tsx + CommunityPage.tsx | POST /posts (feed.controller.ts:61); GET /posts/feed (:74) | Built | other |  |
| 2818:4027 | Group 832 | mobile | n/a (hidden/archived) | n/a | Archived | other |  |
| 2009:2913 | Create a post - For Contest | desktop | /community PostComposer.tsx contest mode | POST /posts (:61); POST /contest/entries (contest.controller.ts:54); GET /contest/current | Partial | other | Contest mode shows disabled 'Upload a video'. |
| 1455:4362 | User's post feed | desktop | /profile ProfilePage.tsx (own profile only) | GET /users/:id (self-only) (users.controller.ts:80) | Partial | profile | Viewing ANOTHER user's profile has no route/page. |
| 1662:2782 | Inactive Account | desktop | /account/inactive InactiveAccountPage.tsx | POST /auth/reactivate-account (auth.controller.ts:97) | Built | other |  |
| 1455:6626 | User's Media feed | desktop | /profile ProfilePage.tsx 'media' tab | GET /posts/feed (client filter) | Partial | profile | Own profile only. |
| 1620:20139 | View post's page | desktop | none standalone (no /posts/:id route) | GET /posts/:id (feed.controller.ts:93) - no web consumer for a single-post page | Missing | other |  |
| 1460:8940 | User's Saved Posts | desktop | none (ProfilePage has Posts/Media tabs only, ProfilePage.tsx:33) | GET /users/:id/saved-posts (saved-posts.controller.ts:35) - no web consumer | Missing | profile |  |
| 1466:15934 | Edit Profile | desktop | EditProfileModal.tsx on /profile | PATCH /users/:id (users.controller.ts:86) | Partial | profile | Only displayName, phone, username editable. Bio/Location/Preferred Club/DOB rendered disabled. |
| 1625:2303 | Login mobile | mobile | /login LoginPage.tsx:1 | POST /auth/login (auth.controller.ts:32) | Partial | signup-flow | Frame carries Google/Apple/Facebook 'Or continue with' buttons (CLAUDE.md PR #103); none in LoginPage.tsx (grep google/apple/facebook = 0). No OAuth endpoint exists. |
| 1625:2404 | Reset Password mobile | mobile | /reset-password ResetPasswordPage.tsx | POST /auth/reset-password (password-reset.controller.ts:31) | Built | other |  |
| 1625:2333 | Register mobile | mobile | /signup SignupFlow.tsx -> AgeGateStep + RegisterStep.tsx | POST /auth/register (registration.controller.ts:32) | Partial | signup-flow | Social sign-in buttons not coded; frame shows DOB picker on the register form but code collects DOB on a separate Age Gate step; frame has Username/Full-name rows differing by breakpoint; registration does NOT persist the session (RegisterStep.tsx:109 navigates to '/' with no token stored). |
| 1629:2449 | Create Profile mobile | mobile | none | none | Missing | profile | No route, page or endpoint. Fields: Full Name (displayName, collected at register), Username (User.username exists, edited only via EditProfileModal), Date of Birth (collected at Age Gate; encrypted, PATCH-excluded), Location (NO column), Bio (NO column), Preferred Club (clubAffiliationId unwritten; representedClubId via separate screen), Profile picture (NO column/upload endpoint), 'Create profile' button (no endpoint). |
| 1625:2375 | Forgot Password mobile | mobile | /forgot-password ForgotPasswordPage.tsx | POST /auth/forgot-password (password-reset.controller.ts:20) | Built | other |  |
| 1661:2763 | Welcome title head for new user | desktop | email title-head component | n/a | Reference | other |  |
| 1661:2769 | Welcome title head for new admin member | desktop | email title-head component | n/a | Reference | other |  |
| 1661:2779 | Welcome title head for new team members for other roles not admin | desktop | email title-head component | n/a | Reference | other |  |
| 1661:2765 | Password change request title head | desktop | email title-head component | n/a | Reference | other |  |
| 1661:2767 | Password change success title head | desktop | email title-head component | n/a | Reference | other |  |
| 1708:2321 | ARCHIVED - community mobile 1 (428px, absolute layout - superseded by 390px auto | mobile | n/a (hidden/archived) | n/a | Archived | other |  |
| 1769:5230 | ARCHIVED - community mobile 4 (428px, absolute layout - superseded by 390px auto | mobile | n/a (hidden/archived) | n/a | Archived | other |  |
| 1770:5435 | ARCHIVED - community mobile 5 (428px, absolute layout - superseded by 390px auto | mobile | n/a (hidden/archived) | n/a | Archived | other |  |
| 1762:2847 | ARCHIVED - community mobile 2 (428px, absolute layout - superseded by 390px auto | mobile | n/a (hidden/archived) | n/a | Archived | other |  |
| 1708:2401 | ARCHIVED - community mobile 3 (428px, absolute layout - superseded by 390px auto | mobile | n/a (hidden/archived) | n/a | Archived | other |  |
| 1761:2321 | ARCHIVED - Messages mobile window 2 (superseded by 2067:3006 (Message - List of  | mobile | n/a (hidden/archived) | n/a | Archived | other |  |
| 1762:2645 | ARCHIVED - Messages mobile window 4 (superseded by 2067:3176 (Message - single c | mobile | n/a (hidden/archived) | n/a | Archived | other |  |
| 1870:2753 | Old - Mobile Drop Down Components | desktop | n/a | n/a | Archived | other | Not archived by prefix hide flag but name says 'Old'. |
| 2074:5914 | Video Thumbnail Hover State | desktop | component | n/a | Reference | other |  |
| 2130:3389 | Promo/Contest Carousel Banner | desktop | component, no route | none | Reference | other |  |
| 2256:6802 | Bants homepage - All feed | desktop | /banter BanterPage.tsx + banter/BanterFilterForm.tsx | GET /banter-rooms (:70), /search (:81), /mine (:90) | Built | other |  |
| 2459:5234 | Bants homepage - User's own created bants | desktop | /banter BanterPage.tsx + banter/BanterFilterForm.tsx | GET /banter-rooms (:70), /search (:81), /mine (:90) | Built | other |  |
| 2459:7671 | Bants homepage - search filter | desktop | /banter BanterPage.tsx + banter/BanterFilterForm.tsx | GET /banter-rooms (:70), /search (:81), /mine (:90) | Built | other |  |
| 2459:10083 | Bants homepage - search filter - categories - All feed | desktop | /banter BanterPage.tsx + banter/BanterFilterForm.tsx | GET /banter-rooms (:70), /search (:81), /mine (:90) | Built | other |  |
| 2459:12447 | Bants homepage - search filter - categories - User's own created bants | desktop | /banter BanterPage.tsx + banter/BanterFilterForm.tsx | GET /banter-rooms (:70), /search (:81), /mine (:90) | Built | other |  |
| 2256:8925 | Bants - create topic with attachment | desktop | /banter BanterPage.tsx create-room form | POST /banter-rooms (banter.controller.ts:57) | Partial | other | Attachment variant has no media upload. |
| 2355:2137 | Bants - create topic | desktop | /banter BanterPage.tsx create-room form | POST /banter-rooms (banter.controller.ts:57) | Partial | other | Attachment variant has no media upload. |
| 2256:11081 | Bants - post page with all comments | desktop | /banter/:roomId BanterRoomPage.tsx | GET/POST /banter-rooms/:id/posts (:152,:168) | Partial | other | BanterRoomPage built with no matching Figma frame per CLAUDE.md; mapped here as closest. |
| 2286:1394 | Frame 398 | desktop | brand-guide fragment | n/a | Reference | other |  |
| 2286:1380 | Mask group | desktop | brand-guide fragment | n/a | Reference | other |  |
| 2285:1216 | Group 400 | desktop | loose component fragment | n/a | Reference | other |  |
| 2286:1280 | Group 401 | desktop | loose component fragment | n/a | Reference | other |  |
| 2285:1240 | Group | mobile | loose brand-guide/component fragment | n/a | Reference | other |  |
| 2286:1328 | Frame 395 | mobile | brand-guide fragment | n/a | Reference | other |  |
| 2286:1355 | Frame 396 | mobile | brand-guide fragment | n/a | Reference | other |  |
| 2286:1277 | Frame 393 | desktop | brand-guide fragment | n/a | Reference | other |  |
| 2286:1315 | Frame 394 | desktop | brand-guide fragment | n/a | Reference | other |  |
| 2286:1366 | Frame 397 | desktop | brand-guide fragment | n/a | Reference | other |  |
| 2358:8184 | Task Card (Contest/Schedule) | mobile | component (legacy) | n/a | Reference | other |  |
| 2363:2708 | Frame 5725 | desktop | legacy component fragment | n/a | Reference | other |  |
| 2365:2033 | Calendar for scheduled task  | desktop | component | n/a | Reference | other |  |
| 2448:2179 | Bants - search result | desktop | /banter BanterPage.tsx + banter/BanterFilterForm.tsx | GET /banter-rooms (:70), /search (:81), /mine (:90) | Built | other |  |
| 2459:4841 | Filter Tabs (All / My Bants) | desktop | component in BanterPage.tsx | n/a | Reference | other |  |
| 2824:4309 | Web app Navbar - Desktop and Mobile | desktop | layout/Header.tsx | n/a | Reference | other |  |
| 2819:4172 | Frame 5864 | mobile | component fragment | n/a | Reference | other |  |
| 2906:7170 | Frame 5904 | desktop | component (settings nav rail) | n/a | Reference | other |  |
| 5100:2 | Brand Guide - Dark Mode Tokens (Sprint D) | desktop | n/a | n/a | Reference | other |  |
| 5108:6626 | Guardian Consent - 1 Age Gate | desktop | /signup AgeGateStep.tsx | none (client-side age calc; DOB sent later in POST /auth/register) | Built | signup-flow | Frame copy: 'Nothing you post is public until they do.' No country field (confirmed 5108:6626). |
| 5108:6627 | Guardian Consent - 2 Guardian Details Capture | desktop | /signup GuardianDetailsStep.tsx | POST /auth/register (guardian block; registration.controller.ts:32) | Partial | country | Frame (5108:6627) has ONE 'Guardian's full name' input and NO country field; code splits first/last name AND adds a required 'Country you live in' select (GuardianDetailsStep.tsx:158-170). Frame says link 'expires after 3 days'. |
| 5108:6628 | Guardian Consent - 3 Consent Email (Reference) | desktop | email template 'guardian-consent' registration-email.service.ts:91 (+ renderTextBody:324) | n/a (sent by RegistrationService) | Partial | guardian-copy | Frame has headline, body copy, 'Review and give consent' button and a pasted link soccernity.app/consent/<id>. Code email body is only 'Your consent code is: <token>' - NO link, NO button; no code anywhere builds /guardian-consent/confirm?token= (grep). Frame URL path /consent/ also differs from the route /guardian-consent/confirm. |
| 5108:6629 | Guardian Consent - 4 Web Consent Confirmation | desktop | /guardian-consent/confirm GuardianConsentConfirmPage.tsx | POST /auth/guardian-consent (:49); POST /auth/guardian-consent/decline (:137); card: /verification (:63) /card/intent (:70) /card/complete (:77) | Partial | guardian-copy | 'Request Summary' panel omitted (frame marks it REFERENCE ONLY; no GET-by-token endpoint). Code copy still says 'Build a player profile - Position, club or school team, and stats they add themselves' (GuardianConsentConfirmPage.tsx:63-64; no such fields exist). Frame's 'What we collect' list and the link-expiry/deletion/withdrawal footnote are NOT in code (GuardianConsentConfirmPage.tsx:263 'COPY PENDING LEGAL REVIEW'); a 'Read our Privacy Policy' link IS present (L266). |
| 5108:6630 | Guardian Consent - 5 Restricted Pending State | desktop | /guardian-consent GuardianConsentPage.tsx (pending branch L243-345) | GET /auth/guardian-consent/status (guardian-consent.controller.ts:184); POST .../resend (:92) | Partial | guardian-copy | Copy 'Add your position and photo. It stays private until approval.' (GuardianConsentPage.tsx:299) - no position field, no photo upload exists. Page is reached only by manual navigation (no redirect, no polling). A 'declined' consentStatus falls into this pending branch (only 'confirmed' is special-cased). |
| 5108:6631 | Guardian Consent - 6 Activation Confirmation | desktop | /guardian-consent GuardianConsentPage.tsx (confirmed branch L180-240) | GET /auth/guardian-consent/status (:184) | Partial | guardian-copy | 'Go to my profile' -> /profile (L224-228). 'Review privacy settings' is a disabled 'Coming soon' button (L233) although /settings/privacy exists. Frame text references 'Settings > Privacy & Safety' (archived frame). Seen by the MINOR only when they navigate here. |
| 5116:6633 | Guardian Consent - Design Notes & Open Decisions | desktop | n/a annotation frame | n/a | Reference | guardian-copy | Design notes; not a screen. |
| 5143:6635 | Verify Email - 1 Verifying | desktop | /verify-email VerifyEmailPage.tsx | POST /auth/verify-email (registration.controller.ts:47) | Partial | signup-flow | Page needs ?token= in the URL, but the verification email body is 'Your Soccernity email verification code is: <token>' with no link (registration-email.service.ts:73-74, 322, 468-469). 'Contact support' = mailto:support@soccernity.com (VerifyEmailPage.tsx:64). |
| 5143:6648 | Verify Email - 2 Verified | desktop | /verify-email VerifyEmailPage.tsx | POST /auth/verify-email (registration.controller.ts:47) | Partial | signup-flow | Page needs ?token= in the URL, but the verification email body is 'Your Soccernity email verification code is: <token>' with no link (registration-email.service.ts:73-74, 322, 468-469). 'Contact support' = mailto:support@soccernity.com (VerifyEmailPage.tsx:64). |
| 5143:6661 | Verify Email - 3 Link Invalid Or Expired | desktop | /verify-email VerifyEmailPage.tsx | POST /auth/verify-email (registration.controller.ts:47) | Partial | signup-flow | Page needs ?token= in the URL, but the verification email body is 'Your Soccernity email verification code is: <token>' with no link (registration-email.service.ts:73-74, 322, 468-469). 'Contact support' = mailto:support@soccernity.com (VerifyEmailPage.tsx:64). |
| 5143:6674 | Verify Email - 4 Missing Token | desktop | /verify-email VerifyEmailPage.tsx | POST /auth/verify-email (registration.controller.ts:47) | Partial | signup-flow | Page needs ?token= in the URL, but the verification email body is 'Your Soccernity email verification code is: <token>' with no link (registration-email.service.ts:73-74, 322, 468-469). 'Contact support' = mailto:support@soccernity.com (VerifyEmailPage.tsx:64). |
| 5146:6635 | Club Picker - 1 Loaded List | desktop | ClubPickerStep.tsx (rendered inside /signup after register, RegisterStep.tsx:105-110) | GET /clubs (clubs.controller.ts:41); POST /clubs/:id/join (:136) | Built | signup-flow | Only reachable immediately after registration; no standalone route (/clubs is a different page). |
| 5146:6648 | Club Picker - 2 Club Joined | desktop | ClubPickerStep.tsx (rendered inside /signup after register, RegisterStep.tsx:105-110) | GET /clubs (clubs.controller.ts:41); POST /clubs/:id/join (:136) | Built | signup-flow | Only reachable immediately after registration; no standalone route (/clubs is a different page). |
| 5146:6661 | Club Picker - 3 Join Failed (Inline Error) | desktop | ClubPickerStep.tsx (rendered inside /signup after register, RegisterStep.tsx:105-110) | GET /clubs (clubs.controller.ts:41); POST /clubs/:id/join (:136) | Built | signup-flow | Only reachable immediately after registration; no standalone route (/clubs is a different page). |
| 5146:6674 | Club Picker - 4 No Clubs Match Filter | desktop | ClubPickerStep.tsx (rendered inside /signup after register, RegisterStep.tsx:105-110) | GET /clubs (clubs.controller.ts:41); POST /clubs/:id/join (:136) | Built | signup-flow | Only reachable immediately after registration; no standalone route (/clubs is a different page). |
| 5146:6687 | Club Picker - 5 Load More Loading | desktop | ClubPickerStep.tsx (rendered inside /signup after register, RegisterStep.tsx:105-110) | GET /clubs (clubs.controller.ts:41); POST /clubs/:id/join (:136) | Built | signup-flow | Only reachable immediately after registration; no standalone route (/clubs is a different page). |
| 5150:6633 | Verify Email - Design Notes & Open Decisions | desktop | n/a | n/a | Reference | other |  |
| 5150:6656 | Club Picker - Design Notes & Open Decisions | desktop | n/a | n/a | Reference | other |  |
| 5171:6633 | Leaderboard Page Desktop | desktop | /leaderboard LeaderboardPage.tsx (Overall) | GET /leaderboard (leaderboard.controller.ts:20) | Partial | other | Header comment (L8-20) says no club filter / no all-time, but code passes clubId (L273); All-time disabled. Club + 7-day-change columns not rendered. |
| 5182:6652 | Brand Guide - Light Mode Tokens (Sprint 2) | desktop | n/a | n/a | Reference | other |  |
| 5204:6728 | Home Page Desktop - Premium Light (Sprint 2, Pass 2) | desktop | / HomePage.tsx (logged-in users redirected to /community) | none (static illustrative content by design) | Built | other | Mobile layout: same page, responsive; not visually inspected. |
| 5230:25113 | Group 846 | desktop | loose component fragment | n/a | Reference | other |  |
| 5230:25115 | Group 847 | desktop | loose component fragment | n/a | Reference | other |  |
| 5372:7272 | Success email - password reset link | desktop | email password-reset-email.service.ts:64 ('Reset your Soccernity password') | n/a | Built | other | Link built from WEB_APP_BASE_URL (default https://app.soccernity.example). |
| 5403:6640 | ARCHIVED - Contest - Create Task (superseded by the Contest admin console screen | desktop | n/a (hidden/archived) | n/a | Archived | other |  |
| 5403:6753 | ARCHIVED - Contest - Schedule Task (superseded by the Contest admin console scre | desktop | n/a (hidden/archived) | n/a | Archived | other |  |
| 5403:6866 | ARCHIVED - Contest - Edit Task (superseded by the Contest admin console screens  | desktop | n/a (hidden/archived) | n/a | Archived | other |  |
| 5403:6979 | ARCHIVED - Contest - Search Task (superseded by the Contest admin console screen | desktop | n/a (hidden/archived) | n/a | Archived | other |  |
| 5403:7092 | ARCHIVED - Contest - Delete Task (superseded by the Contest admin console screen | desktop | n/a (hidden/archived) | n/a | Archived | other |  |
| 5403:7205 | Settings - Delete Role | desktop | /settings/roles/delete DeleteRolePage.tsx | none (no role-deletion endpoint) | Stub | admin |  |
| 5403:7327 | Admin - Admin Profile | desktop | /profile AdminProfilePage.tsx | GET/PATCH /admin/profile (admin-profile.controller.ts:26,31) | Built | admin |  |
| 5405:8277 | ARCHIVED - Contest - Empty State (superseded by the Contest admin console screen | desktop | n/a (hidden/archived) | n/a | Archived | other |  |
| 5405:8390 | ARCHIVED - Contest - Task Scheduled (Success) (superseded by the Contest admin c | desktop | n/a (hidden/archived) | n/a | Archived | other |  |
| 5435:8130 | Password reset link title head | desktop | email title-head component | n/a | Reference | other |  |
| 5435:8132 | Verify email title head | desktop | email title-head component | n/a | Reference | other |  |
| 5435:8134 | Account deletion requested title head | desktop | email title-head component | n/a | Reference | other |  |
| 5439:7053 | Success email - verify email | desktop | email 'verify-email' registration-email.service.ts:73 | n/a | Partial | signup-flow | Frame is link-based (CTA); code body is a code only. |
| 5439:7074 | Success email - account deletion requested | desktop | none | none | Missing | other | No template; account deletion sends no email. |
| 5464:7077 | Guardian Consent - 1a Age Gate - Below Minimum Age | desktop | /signup AgeGateStep.tsx (MINIMUM_SIGNUP_AGE) | none (client-side) | Built | signup-flow |  |
| 5474:7077 | Forgot Password - Link Sent desktop | desktop | /forgot-password ForgotPasswordPage.tsx (inline submitted state, line 61) | POST /auth/forgot-password (password-reset.controller.ts:20) | Built | other | State rendered as inline message, not a separate screen; pixel parity not inspected. |
| 5474:8375 | Forgot Password - Link Sent mobile | mobile | /forgot-password ForgotPasswordPage.tsx (inline submitted state, line 61) | POST /auth/forgot-password (password-reset.controller.ts:20) | Built | other | State rendered as inline message, not a separate screen; pixel parity not inspected. |
| 5488:7164 | Guardian Consent - 7 Consent Approved (Guardian) | desktop | /guardian-consent/confirm GuardianConsentConfirmPage.tsx 'confirmed' state (L155) | POST /auth/guardian-consent (:49) | Partial | guardian-copy | Code: 'Thank you / Your approval has been recorded. The account is now active -- you can close this page.' Frame: 'Your decision was recorded on <date>. <Name> can now use Soccernity with under-18 protections in place.' Copy differs; no profile button in either. |
| 5488:7206 | Guardian Consent - 8 Consent Declined (Guardian) | desktop | /guardian-consent/confirm 'declined' state (L160) | POST /auth/guardian-consent/decline (:137) | Built | guardian-copy | Copy parity not diffed (frame 8 text not fetched). |
| 5488:7248 | Guardian Consent - 10 Approval Request Resent (Minor) | desktop | /guardian-consent GuardianConsentPage.tsx inline 'resendState === sent' footnote (~L335) | POST /auth/guardian-consent/resend (:92) | Partial | guardian-copy | Inline footnote, not a separate screen. |
| 5491:8241 | Guardian Consent - 9 Consent Declined - Minor Notice | desktop | none | n/a | Missing | signup-flow | Frame offers 'Send a new approval request' / 'Change guardian email' to the minor after a decline. In code a decline immediately sets accountStatus=pending_deletion and revokes all sessions (guardian-consent.service.ts:600-671; auth.service.ts:265-271), so the minor cannot log in (auth.service.ts:95-100 'Invalid credentials') and no page can render. Only the declined email is sent. |
| 5498:7164 | Guardian Consent - 11 Change Guardian Email (Minor) | desktop | /guardian-consent/change-email ChangeGuardianEmailPage.tsx | POST /auth/guardian-consent/change-guardian-email (:111) | Partial | guardian-copy | Coded form REQUIRES guardian name + relationship (DTO change-guardian-email.dto.ts:17-27; page L175-217). Neither the desktop frame 5498:7164 nor mobile 5501:8536 has those fields (both show only current email, new email, restart notice, Send/Cancel). |
| 5501:8225 | Guardian Consent - 7 Consent Approved (Guardian) - Mobile | mobile | /guardian-consent/confirm GuardianConsentConfirmPage.tsx 'confirmed' state (L155) | POST /auth/guardian-consent (:49) | Partial | guardian-copy | Code: 'Thank you / Your approval has been recorded. The account is now active -- you can close this page.' Frame: 'Your decision was recorded on <date>. <Name> can now use Soccernity with under-18 protections in place.' Copy differs; no profile button in either. |
| 5501:8289 | Guardian Consent - 8 Consent Declined (Guardian) - Mobile | mobile | /guardian-consent/confirm 'declined' state (L160) | POST /auth/guardian-consent/decline (:137) | Built | guardian-copy | Copy parity not diffed (frame 8 text not fetched). |
| 5501:8342 | Guardian Consent - 10 Approval Request Resent (Minor) - Mobile | mobile | /guardian-consent GuardianConsentPage.tsx inline 'resendState === sent' footnote (~L335) | POST /auth/guardian-consent/resend (:92) | Partial | guardian-copy | Inline footnote, not a separate screen. |
| 5501:8453 | Guardian Consent - 9 Consent Declined - Minor Notice - Mobile | mobile | none | n/a | Missing | signup-flow | Frame offers 'Send a new approval request' / 'Change guardian email' to the minor after a decline. In code a decline immediately sets accountStatus=pending_deletion and revokes all sessions (guardian-consent.service.ts:600-671; auth.service.ts:265-271), so the minor cannot log in (auth.service.ts:95-100 'Invalid credentials') and no page can render. Only the declined email is sent. |
| 5501:8536 | Guardian Consent - 11 Change Guardian Email (Minor) - Mobile | mobile | /guardian-consent/change-email ChangeGuardianEmailPage.tsx | POST /auth/guardian-consent/change-guardian-email (:111) | Partial | guardian-copy | Coded form REQUIRES guardian name + relationship (DTO change-guardian-email.dto.ts:17-27; page L175-217). Neither the desktop frame 5498:7164 nor mobile 5501:8536 has those fields (both show only current email, new email, restart notice, Send/Cancel). |
| 5501:8582 | guardian approved account title head | desktop | email title-head component | n/a | Reference | other |  |
| 5501:8584 | Success email - guardian approved account | desktop | none | none | Missing | guardian-copy | No email to the minor on guardian approval exists (no template; confirmConsent sends nothing). |
| 5501:8605 | guardian declined account title head | desktop | email title-head component | n/a | Reference | other |  |
| 5501:8607 | Success email - guardian declined account | desktop | email 'guardian-consent-declined' registration-email.service.ts:125-126 | n/a | Partial | guardian-copy | Recipient is the minor; copy differs. |
| 5524:7188 | Leaderboard - Contest Tab - Weekly Fill - Vacant (Week 1 - Phase 1) | desktop | /leaderboard LeaderboardPage.tsx ContestBoard | GET /contest/current (contest.controller.ts:23) | Built | other | Phase states derived server-side; per-state visual parity not individually diffed. |
| 5524:7512 | Leaderboard - Contest Tab - 2 Live - Level 1 Final (Week 4) | desktop | /leaderboard LeaderboardPage.tsx ContestBoard | GET /contest/current (contest.controller.ts:23) | Built | other | Phase states derived server-side; per-state visual parity not individually diffed. |
| 5524:7836 | Leaderboard - Contest Tab - 3 Crowned - Monthly Winners | desktop | /leaderboard LeaderboardPage.tsx ContestBoard | GET /contest/current (contest.controller.ts:23) | Built | other | Phase states derived server-side; per-state visual parity not individually diffed. |
| 5528:7260 | Contest - Weekly Results (Top 3) | desktop | /leaderboard?tab=contest (weekly winners table) LeaderboardPage.tsx | GET /contest/current (:23) | Partial | other | Not a standalone route. |
| 5531:7264 | Verify Email - 1 Verifying - Mobile | mobile | /verify-email VerifyEmailPage.tsx | POST /auth/verify-email (registration.controller.ts:47) | Partial | signup-flow | Page needs ?token= in the URL, but the verification email body is 'Your Soccernity email verification code is: <token>' with no link (registration-email.service.ts:73-74, 322, 468-469). 'Contact support' = mailto:support@soccernity.com (VerifyEmailPage.tsx:64). |
| 5531:7284 | Verify Email - 2 Verified - Mobile | mobile | /verify-email VerifyEmailPage.tsx | POST /auth/verify-email (registration.controller.ts:47) | Partial | signup-flow | Page needs ?token= in the URL, but the verification email body is 'Your Soccernity email verification code is: <token>' with no link (registration-email.service.ts:73-74, 322, 468-469). 'Contact support' = mailto:support@soccernity.com (VerifyEmailPage.tsx:64). |
| 5531:7356 | Verify Email - 3 Link Invalid Or Expired - Mobile | mobile | /verify-email VerifyEmailPage.tsx | POST /auth/verify-email (registration.controller.ts:47) | Partial | signup-flow | Page needs ?token= in the URL, but the verification email body is 'Your Soccernity email verification code is: <token>' with no link (registration-email.service.ts:73-74, 322, 468-469). 'Contact support' = mailto:support@soccernity.com (VerifyEmailPage.tsx:64). |
| 5531:7412 | Verify Email - 4 Missing Token - Mobile | mobile | /verify-email VerifyEmailPage.tsx | POST /auth/verify-email (registration.controller.ts:47) | Partial | signup-flow | Page needs ?token= in the URL, but the verification email body is 'Your Soccernity email verification code is: <token>' with no link (registration-email.service.ts:73-74, 322, 468-469). 'Contact support' = mailto:support@soccernity.com (VerifyEmailPage.tsx:64). |
| 5531:7461 | Guardian Consent - 5 Restricted Pending State - Mobile | mobile | /guardian-consent GuardianConsentPage.tsx (pending branch L243-345) | GET /auth/guardian-consent/status (guardian-consent.controller.ts:184); POST .../resend (:92) | Partial | guardian-copy | Copy 'Add your position and photo. It stays private until approval.' (GuardianConsentPage.tsx:299) - no position field, no photo upload exists. Page is reached only by manual navigation (no redirect, no polling). A 'declined' consentStatus falls into this pending branch (only 'confirmed' is special-cased). |
| 5531:7544 | Guardian Consent - 6 Activation Confirmation - Mobile | mobile | /guardian-consent GuardianConsentPage.tsx (confirmed branch L180-240) | GET /auth/guardian-consent/status (:184) | Partial | guardian-copy | 'Go to my profile' -> /profile (L224-228). 'Review privacy settings' is a disabled 'Coming soon' button (L233) although /settings/privacy exists. Frame text references 'Settings > Privacy & Safety' (archived frame). Seen by the MINOR only when they navigate here. |
| 5531:7626 | Guardian Consent - 4 Web Consent Confirmation - Mobile | mobile | /guardian-consent/confirm GuardianConsentConfirmPage.tsx | POST /auth/guardian-consent (:49); POST /auth/guardian-consent/decline (:137); card: /verification (:63) /card/intent (:70) /card/complete (:77) | Partial | guardian-copy | 'Request Summary' panel omitted (frame marks it REFERENCE ONLY; no GET-by-token endpoint). Code copy still says 'Build a player profile - Position, club or school team, and stats they add themselves' (GuardianConsentConfirmPage.tsx:63-64; no such fields exist). Frame's 'What we collect' list and the link-expiry/deletion/withdrawal footnote are NOT in code (GuardianConsentConfirmPage.tsx:263 'COPY PENDING LEGAL REVIEW'); a 'Read our Privacy Policy' link IS present (L266). |
| 5533:7264 | Guardian Consent - 12 Approval Link Unusable (Guardian) | desktop | /guardian-consent/confirm error state (GENERIC_ERROR_MESSAGE) | POST /auth/guardian-consent (:49) | Built | guardian-copy | Parity not diffed. |
| 5533:7306 | Guardian Consent - 12 Approval Link Unusable (Guardian) - Mobile | mobile | /guardian-consent/confirm error state (GENERIC_ERROR_MESSAGE) | POST /auth/guardian-consent (:49) | Built | guardian-copy | Parity not diffed. |
| 5534:7264 | Leaderboard - Contest Tab & Monthly Mechanic - Design Notes | desktop | n/a | n/a | Reference | other |  |
| 5539:7264 | Guardian Consent - 1 Age Gate - Mobile | mobile | /signup AgeGateStep.tsx | none (client-side age calc; DOB sent later in POST /auth/register) | Built | signup-flow | Frame copy: 'Nothing you post is public until they do.' No country field (confirmed 5108:6626). |
| 5539:7314 | Guardian Consent - 1a Age Gate - Below Minimum Age - Mobile | mobile | /signup AgeGateStep.tsx (MINIMUM_SIGNUP_AGE) | none (client-side) | Built | signup-flow |  |
| 5539:7354 | Guardian Consent - 2 Guardian Details Capture - Mobile | mobile | /signup GuardianDetailsStep.tsx | POST /auth/register (guardian block; registration.controller.ts:32) | Partial | country | Frame (5108:6627) has ONE 'Guardian's full name' input and NO country field; code splits first/last name AND adds a required 'Country you live in' select (GuardianDetailsStep.tsx:158-170). Frame says link 'expires after 3 days'. |
| 5540:7264 | Leaderboard - Mobile | mobile | /leaderboard LeaderboardPage.tsx (Overall) | GET /leaderboard (leaderboard.controller.ts:20) | Partial | other | Same as desktop; mobile layout not visually inspected. |
| 5541:7304 | Leaderboard - Contest Tab - Weekly Fill - Vacant (Week 1 - Phase 1) - Mobile | mobile | /leaderboard LeaderboardPage.tsx ContestBoard | GET /contest/current (contest.controller.ts:23) | Built | other | Phase states derived server-side; per-state visual parity not individually diffed. |
| 5541:7527 | Leaderboard - Contest Tab - 2 Live - Level 1 Final (Week 4) - Mobile | mobile | /leaderboard LeaderboardPage.tsx ContestBoard | GET /contest/current (contest.controller.ts:23) | Built | other | Phase states derived server-side; per-state visual parity not individually diffed. |
| 5541:7750 | Leaderboard - Contest Tab - 3 Crowned - Monthly Winners - Mobile | mobile | /leaderboard LeaderboardPage.tsx ContestBoard | GET /contest/current (contest.controller.ts:23) | Built | other | Phase states derived server-side; per-state visual parity not individually diffed. |
| 5542:7344 | Leaderboard - Empty State (Filtered) | desktop | /leaderboard LeaderboardPage.tsx | GET /leaderboard (leaderboard.controller.ts:20) | NotInspected | other | Empty-state variant not individually verified. |
| 5542:7695 | Leaderboard - Empty State (Filtered) - Mobile | mobile | /leaderboard LeaderboardPage.tsx | GET /leaderboard (leaderboard.controller.ts:20) | NotInspected | other | Empty-state variant not individually verified. |
| 5543:7383 | Leaderboard - Filter Matrix (worked combinations) | desktop | n/a | n/a | Reference | other |  |
| 5543:7407 | Home Page - Premium Light - Mobile | mobile | / HomePage.tsx (logged-in users redirected to /community) | none (static illustrative content by design) | Built | other | Mobile layout: same page, responsive; not visually inspected. |
| 5545:7394 | Contest - Weekly Results (Top 3) - Mobile | mobile | /leaderboard?tab=contest (weekly winners table) LeaderboardPage.tsx | GET /contest/current (:23) | Partial | other | Not a standalone route. |
| 5551:7420 | Leaderboard Rank Medal | mobile | component used in LeaderboardPage.tsx | n/a | Reference | other |  |
| 5556:7426 | Leaderboard - Contest Tab - Weekly Fill - Week 1 Winners In (3) | desktop | /leaderboard LeaderboardPage.tsx ContestBoard | GET /contest/current (contest.controller.ts:23) | Built | other | Phase states derived server-side; per-state visual parity not individually diffed. |
| 5556:7529 | Leaderboard - Contest Tab - Weekly Fill - Weeks 1-2 Winners In (6) | desktop | /leaderboard LeaderboardPage.tsx ContestBoard | GET /contest/current (contest.controller.ts:23) | Built | other | Phase states derived server-side; per-state visual parity not individually diffed. |
| 5556:7632 | Leaderboard - Contest Tab - Weekly Fill - Weeks 1-3 Winners In (9 - dynamic) | desktop | /leaderboard LeaderboardPage.tsx ContestBoard | GET /contest/current (contest.controller.ts:23) | Built | other | Phase states derived server-side; per-state visual parity not individually diffed. |
| 5561:7483 | Leaderboard - Contest Tab - Weekly Fill - Week 1 Winners In (3) - Mobile | mobile | /leaderboard LeaderboardPage.tsx ContestBoard | GET /contest/current (contest.controller.ts:23) | Built | other | Phase states derived server-side; per-state visual parity not individually diffed. |
| 5561:7608 | Leaderboard - Contest Tab - Weekly Fill - Weeks 1-2 Winners In (6) - Mobile | mobile | /leaderboard LeaderboardPage.tsx ContestBoard | GET /contest/current (contest.controller.ts:23) | Built | other | Phase states derived server-side; per-state visual parity not individually diffed. |
| 5561:7733 | Leaderboard - Contest Tab - Weekly Fill - Weeks 1-3 Winners In (9 - dynamic) - M | mobile | /leaderboard LeaderboardPage.tsx ContestBoard | GET /contest/current (contest.controller.ts:23) | Built | other | Phase states derived server-side; per-state visual parity not individually diffed. |
| 5563:7573 | Leaderboard - Board Tabs | mobile | component used in LeaderboardPage.tsx | n/a | Reference | other |  |
| 5564:7561 | Leaderboard - Competition Tab - Prediction | desktop | /leaderboard LeaderboardPage.tsx (COMPETITION board) | none (COMPETITION_ROWS dummy data, LeaderboardPage.tsx:48,331) | Stub | other | Page prints 'Competition board uses illustrative data - no data model yet' (L344). |
| 5564:7832 | Leaderboard - Competition Tab - Commentary | desktop | /leaderboard LeaderboardPage.tsx (COMPETITION board) | none (COMPETITION_ROWS dummy data, LeaderboardPage.tsx:48,331) | Stub | other | Page prints 'Competition board uses illustrative data - no data model yet' (L344). |
| 5565:7623 | Leaderboard - Competition Tab - Prediction - Mobile | mobile | /leaderboard LeaderboardPage.tsx (COMPETITION board) | none (COMPETITION_ROWS dummy data, LeaderboardPage.tsx:48,331) | Stub | other | Page prints 'Competition board uses illustrative data - no data model yet' (L344). |
| 5565:7864 | Leaderboard - Competition Tab - Commentary - Mobile | mobile | /leaderboard LeaderboardPage.tsx (COMPETITION board) | none (COMPETITION_ROWS dummy data, LeaderboardPage.tsx:48,331) | Stub | other | Page prints 'Competition board uses illustrative data - no data model yet' (L344). |
| 5566:8033 | Admin - Create Competition | desktop | /competitions CreateCompetitionPage.tsx | none | Stub | admin | No competitions admin endpoint. |
| 5569:7813 | Admin - Competition Created (Success) | desktop | /competitions/created CompetitionCreatedPage.tsx | none | Stub | admin |  |
| 5570:7813 | Which Club Do I Represent - Selector | desktop | /settings/account/club-representation ClubRepresentationPage.tsx | PATCH /users/:id/represented-club (users.controller.ts:100); GET /clubs | Built | profile |  |
| 5570:7887 | Which Club Do I Represent - Selector - Mobile | mobile | /settings/account/club-representation ClubRepresentationPage.tsx | PATCH /users/:id/represented-club (users.controller.ts:100); GET /clubs | Built | profile |  |
| 5607:7813 | Settings - Account - Mobile | mobile | /settings/account AccountOverviewPage.tsx | none | Partial | profile | Account Information + Change Password rows disabled; Deactivate/Delete/Club Representation real. |
| 5640:7815 | Notification Centre - Feed (Read + Unread) - Desktop | desktop | /notifications NotificationCentrePage.tsx | GET /notifications (notifications.controller.ts:27); PATCH read-all (:47) / :id/read (:57) | Built | other |  |
| 5642:7898 | Notification Centre - Empty State - Desktop | desktop | /notifications NotificationCentrePage.tsx | GET /notifications (notifications.controller.ts:27); PATCH read-all (:47) / :id/read (:57) | Built | other |  |
| 5642:7997 | Notification Centre - Empty State - Mobile | mobile | /notifications NotificationCentrePage.tsx | GET /notifications (notifications.controller.ts:27); PATCH read-all (:47) / :id/read (:57) | Built | other |  |
| 5643:8003 | Notification Centre - Feed (Read + Unread) - Mobile | mobile | /notifications NotificationCentrePage.tsx | GET /notifications (notifications.controller.ts:27); PATCH read-all (:47) / :id/read (:57) | Built | other |  |
| 5644:8023 | Notification Centre - Design Notes & Open Decisions | desktop | n/a | n/a | Reference | other |  |
| 5645:8023 | Club Picker - 1 Loaded List - Mobile | mobile | ClubPickerStep.tsx (rendered inside /signup after register, RegisterStep.tsx:105-110) | GET /clubs (clubs.controller.ts:41); POST /clubs/:id/join (:136) | Built | signup-flow | Only reachable immediately after registration; no standalone route (/clubs is a different page). |
| 5645:8082 | Club Picker - 2 Club Joined - Mobile | mobile | ClubPickerStep.tsx (rendered inside /signup after register, RegisterStep.tsx:105-110) | GET /clubs (clubs.controller.ts:41); POST /clubs/:id/join (:136) | Built | signup-flow | Only reachable immediately after registration; no standalone route (/clubs is a different page). |
| 5645:8141 | Club Picker - 3 Join Failed (Inline Error) - Mobile | mobile | ClubPickerStep.tsx (rendered inside /signup after register, RegisterStep.tsx:105-110) | GET /clubs (clubs.controller.ts:41); POST /clubs/:id/join (:136) | Built | signup-flow | Only reachable immediately after registration; no standalone route (/clubs is a different page). |
| 5646:8023 | Club Picker - 4 No Clubs Match Filter - Mobile | mobile | ClubPickerStep.tsx (rendered inside /signup after register, RegisterStep.tsx:105-110) | GET /clubs (clubs.controller.ts:41); POST /clubs/:id/join (:136) | Built | signup-flow | Only reachable immediately after registration; no standalone route (/clubs is a different page). |
| 5646:8044 | Club Picker - 5 Load More Loading - Mobile | mobile | ClubPickerStep.tsx (rendered inside /signup after register, RegisterStep.tsx:105-110) | GET /clubs (clubs.controller.ts:41); POST /clubs/:id/join (:136) | Built | signup-flow | Only reachable immediately after registration; no standalone route (/clubs is a different page). |
| 5647:8023 | Sports / Livescores - Logged Out - Mobile | mobile | /sports-hub SportsHubPage.tsx | GET /sports/live-scores; /fixtures | Built | other |  |
| 5647:8169 | Sports / Livescores - Logged In - Mobile | mobile | /sports-hub SportsHubPage.tsx | GET /sports/live-scores; /fixtures | Built | other |  |
| 5648:8054 | Message - No Messages (Empty State) - Mobile | mobile | /messages MessagesPage.tsx | GET /conversations (:71) | Built | other |  |
| 5649:8074 | ARCHIVED - Settings - Security & Account - Mobile (redundant one-row intermediat | mobile | n/a (hidden/archived) | n/a | Archived | other |  |
| 5649:8092 | ARCHIVED - Settings - Privacy & Safety - Mobile | mobile | n/a (hidden/archived) | n/a | Archived | other |  |
| 5649:8116 | ARCHIVED - Settings - Notification Preferences (By Type) - Mobile (losing compet | mobile | n/a (hidden/archived) | n/a | Archived | other |  |
| 5649:8140 | Settings - Display, Language & Region - Mobile | mobile | /settings/display DisplaySettingsPage.tsx | none | Stub | other |  |
| 5649:8176 | Settings - Account Information (Edit) - Mobile | mobile | none (AccountOverviewPage row disabled) | PATCH /users/:id exists for displayName/phone/username only | Missing | profile | Frame fields Username + Country 'no backend field yet' (5649:8189/8201 text): Country has no User column. |
| 5650:8074 | Bants - All Feed - Mobile | mobile | /banter BanterPage.tsx + banter/BanterFilterForm.tsx | GET /banter-rooms (:70), /search (:81), /mine (:90) | Built | other |  |
| 5650:8161 | Bants - User's Own Created Bants (My Bants) - Mobile | mobile | /banter BanterPage.tsx + banter/BanterFilterForm.tsx | GET /banter-rooms (:70), /search (:81), /mine (:90) | Built | other |  |
| 5650:8221 | Bants - Search Filter (Categories) - Mobile | mobile | /banter BanterPage.tsx + banter/BanterFilterForm.tsx | GET /banter-rooms (:70), /search (:81), /mine (:90) | Built | other |  |
| 5650:8314 | Bants - Search Result - Mobile | mobile | /banter BanterPage.tsx + banter/BanterFilterForm.tsx | GET /banter-rooms (:70), /search (:81), /mine (:90) | Built | other |  |
| 5651:8166 | Bants - Create Topic - Mobile | mobile | /banter BanterPage.tsx create-room form | POST /banter-rooms (banter.controller.ts:57) | Partial | other | Attachment variant has no media upload. |
| 5651:8207 | Bants - Create Topic with Attachment - Mobile | mobile | /banter BanterPage.tsx create-room form | POST /banter-rooms (banter.controller.ts:57) | Partial | other | Attachment variant has no media upload. |
| 5651:8253 | Bants - Post Page with Comments - Mobile | mobile | /banter/:roomId BanterRoomPage.tsx | GET/POST /banter-rooms/:id/posts (:152,:168) | Partial | other | BanterRoomPage built with no matching Figma frame per CLAUDE.md; mapped here as closest. |
| 5685:9241 | Avatar | mobile | component (Avatar set used in Header) | n/a | Reference | other |  |
| 5694:8219 | Settings Toggle | mobile | component | n/a | Reference | other |  |
| 5695:8213 | Settings - Account Info (Confirm Password) - Mobile | mobile | none (AccountOverviewPage row disabled) | none | Missing | profile |  |
| 5695:8234 | Settings - Change Password - Mobile | mobile | none under /settings (AccountOverviewPage row disabled); working only inside EditProfileModal | POST /auth/change-password (auth.controller.ts:62) | Stub | other |  |
| 5695:8262 | Settings - Deactivate Account (Intro) - Mobile | mobile | /settings/account/deactivate DeactivateAccountPage.tsx | POST /auth/deactivate-account (auth.controller.ts:72) | Built | other |  |
| 5695:8279 | Settings - Security & Account Settings - Mobile | mobile | /settings/security SecurityOverviewPage.tsx | none | Built | other |  |
| 5696:8213 | Settings - Two-Factor Auth (SMS) - Mobile | mobile | /settings/security/two-factor TwoFactorAuthPage.tsx | none (no 2FA backend) | Stub | other |  |
| 5696:8241 | Settings - Direct Messages & Read Receipts - Mobile | mobile | none (PrivacySettingsPage row disabled) | none | Missing | other |  |
| 5696:8261 | Settings - Your Posts (Sensitive Media) - Mobile | mobile | none (PrivacySettingsPage row disabled) | none | Missing | other |  |
| 5696:8281 | Settings - Filters - Mobile | mobile | /settings/notifications/filters NotificationFiltersPage.tsx | none | Stub | other |  |
| 5696:8307 | Settings - Muted accounts - Mobile | mobile | /settings/notifications/muted-accounts MutedAccountsPage.tsx | none | Stub | other |  |
| 5696:8340 | Settings - Notification Preferences - Mobile | mobile | /settings/notifications NotificationPreferencesPage.tsx | none | Stub | other | Hub only; leaf pages disabled. |
| 5696:8364 | Settings - Push Notifications - Mobile | mobile | /settings/notifications/push PushNotificationsPage.tsx | none | Stub | other |  |
| 5696:8384 | Settings - Email Notifications - Mobile | mobile | /settings/notifications/email EmailNotificationsPage.tsx | none | Stub | other |  |
| 5701:8239 | Community - Home Feed - Mobile | mobile | /community CommunityPage.tsx (+ NavDrawer.tsx when drawer open) | GET /posts/feed (feed.controller.ts:74) | Built | other |  |
| 5701:8328 | Community - Create Post - Mobile | mobile | /community PostComposer.tsx | POST /posts (:61) | Built | other |  |
| 5702:8250 | Community - Profile - Mobile | mobile | /profile ProfilePage.tsx | GET /users/:id | Partial | profile | Own profile only. |
| 5702:8317 | Community - Edit Profile - Mobile | mobile | EditProfileModal.tsx on /profile | PATCH /users/:id (users.controller.ts:86) | Partial | profile | Only displayName, phone, username editable. Bio/Location/Preferred Club/DOB rendered disabled. |
| 5703:8250 | Community - Home Feed (Navigation Drawer Open) - Mobile | mobile | layout/NavDrawer.tsx | n/a | Reference | other |  |
| 5706:8271 | Message - Conversation - Desktop | desktop | /messages/:conversationId ConversationPage.tsx | GET/POST /conversations/:id/messages (:80,:93); PATCH /conversations/:id/read (:106) | Built | other |  |
| 5708:8184 | Message - Inbox (No Conversation Selected) - Desktop | desktop | /messages MessagesPage.tsx | GET /conversations (:71) | Built | other |  |
| 5708:8362 | Message - Empty Inbox (No Conversations) - Desktop | desktop | /messages MessagesPage.tsx | GET /conversations (:71) | Built | other |  |
| 5709:8354 | Message - Inbox (Chat List) - Mobile | mobile | /messages MessagesPage.tsx | GET /conversations (:71) | Built | other |  |
| 5709:8419 | Message - Conversation - Mobile | mobile | /messages/:conversationId ConversationPage.tsx | GET/POST /conversations/:id/messages (:80,:93); PATCH /conversations/:id/read (:106) | Built | other |  |
| 5709:8461 | Message - Conversation (Actions Menu Open) - Mobile | mobile | none (ConversationPage.tsx has no actions menu: mark as read/view profile/block/delete) | none | Missing | other |  |
| 5776:8405 | Reset Password - Success desktop | desktop | /reset-password ResetPasswordPage.tsx (inline success message, line 76) | POST /auth/reset-password (password-reset.controller.ts:31) | Built | other | Inline message on same page, not separate screen. |
| 5777:8479 | Reset Password - Success mobile | mobile | /reset-password ResetPasswordPage.tsx (inline success message, line 76) | POST /auth/reset-password (password-reset.controller.ts:31) | Built | other | Inline message on same page, not separate screen. |
| 5778:8490 | Community - Profile - Media - Mobile | mobile | /profile ProfilePage.tsx | n/a | Partial | profile |  |
| 5778:8567 | Community - Profile - Saved - Mobile | mobile | none (no Saved tab) | GET /users/:id/saved-posts (no consumer) | Missing | profile |  |
| 5779:8490 | Community - Post View - Mobile | mobile | none standalone | GET /posts/:id (:93) | Missing | other |  |
| 5780:8581 | Community - Search & Trending - Mobile | mobile | /search SearchTrendingPage.tsx (mobile) | GET /search; GET /trending | Built | other |  |
| 5780:8679 | Community - Inactive Account - Mobile | mobile | /account/inactive InactiveAccountPage.tsx | POST /auth/reactivate-account (auth.controller.ts:97) | Built | other |  |
| 5784:8530 | Message - New Conversation (Recipient Picker) - Desktop | desktop | /messages/new NewConversationPage.tsx | POST /conversations (conversations.controller.ts:56); GET /users/:id/following | Built | other | No people-search endpoint: searches only followed users. |
| 5784:8717 | Message - New Conversation (Recipient Picker) - Mobile | mobile | /messages/new NewConversationPage.tsx | POST /conversations (conversations.controller.ts:56); GET /users/:id/following | Built | other | No people-search endpoint: searches only followed users. |
| 5784:8818 | Club Picker - 6 No Clubs Available Yet | desktop | ClubPickerStep.tsx (rendered inside /signup after register, RegisterStep.tsx:105-110) | GET /clubs (clubs.controller.ts:41); POST /clubs/:id/join (:136) | Built | signup-flow | Only reachable immediately after registration; no standalone route (/clubs is a different page). |
| 5784:8848 | Club Picker - 6 No Clubs Available Yet - Mobile | mobile | ClubPickerStep.tsx (rendered inside /signup after register, RegisterStep.tsx:105-110) | GET /clubs (clubs.controller.ts:41); POST /clubs/:id/join (:136) | Built | signup-flow | Only reachable immediately after registration; no standalone route (/clubs is a different page). |
| 5794:8635 | Admin - Moderation Queue | desktop | /moderation ModerationQueuePage.tsx | GET /admin/moderation/reports (admin-moderation.controller.ts:31) | Built | admin |  |
| 5796:8635 | Admin - Report Detail & Action | desktop | /moderation/reports/:id ReportDetailPage.tsx | GET/PATCH .../reports/:id (:41,:46); /escalate (:69) | Built | admin |  |
| 5796:8753 | Admin - Appeal Review | desktop | /moderation/appeals/:id AppealReviewPage.tsx | PATCH .../reports/:id/appeal (:55) | Built | admin |  |
| 5801:8635 | Contest - Details - Mobile | mobile | /contest ContestPage.tsx | GET /contest/current (contest.controller.ts:23); POST /contest/entries (:54) | Partial | other | Entries/ranking/voting subpages absent. |
| 5802:8655 | Contest - Entries & Ranking - Mobile | mobile | none (/contest ContestPage.tsx has no entries gallery) | none (no list-round-entries endpoint) | Missing | other |  |
| 5802:8726 | Contest - Voting - Mobile | mobile | none | none (no vote endpoint in contest.controller.ts) | Missing | other | Frame 'content voting page' / 'Voting' has no code or endpoint. |
| 5802:8978 | Contest - Already Voted | desktop | none | none | Missing | other | Depends on missing voting feature. |
| 5802:9183 | Contest - Between Weeks | desktop | /contest ContestPage.tsx (phase-derived view) | GET /contest/current | NotInspected | other | No dedicated between-weeks state verified. |
| 5803:8876 | Bants - Search Filter - Mobile | mobile | /banter BanterPage.tsx + banter/BanterFilterForm.tsx | GET /banter-rooms (:70), /search (:81), /mine (:90) | Built | other |  |
| 5803:8917 | Bants - No Results (Empty State) - Mobile | mobile | /banter BanterPage.tsx | GET /banter-rooms/search (:81) | NotInspected | other |  |
| 5815:8916 | Contest - Already Voted - Mobile | mobile | none | none | Missing | other | Depends on missing voting feature. |
| 5815:8948 | Contest - Between Weeks - Mobile | mobile | /contest ContestPage.tsx (phase-derived view) | GET /contest/current | NotInspected | other | No dedicated between-weeks state verified. |
| 5818:8962 | Community - Create Post - With Attachment - Mobile | mobile | /community PostComposer.tsx | POST /posts (:61) | Partial | other | Attachments disabled. |
| 5818:8997 | Community - Create Post - Contest Mode - Mobile | mobile | /community PostComposer.tsx contest mode | POST /contest/entries | Partial | other | Disabled video upload. |
| 5818:9031 | Community - Home Feed with Contest (Pinned Post) - Mobile | mobile | /community CommunityPage.tsx (+ NavDrawer.tsx when drawer open) | GET /posts/feed (feed.controller.ts:74) | Built | other |  |
| 5820:8976 | Match Details - Mobile | mobile | /sports-hub/matches/:matchId MatchCentrePage.tsx | GET /sports/matches/:id (:37) | Built | other |  |
| 5821:9009 | Video - Mobile | mobile | MatchCentrePage.tsx Video tab | GET /sports/highlights/:matchId (:83) | Built | other |  |
| 5821:9068 | Standing - Mobile | mobile | MatchCentrePage.tsx Standings tab | GET /sports/standings (sports-standings.controller.ts:15) | Partial | other | FORM column has no vendor data (standingsForm unsupported on Highlightly). |
| 5822:9075 | Match Statistics - Mobile | mobile | MatchCentrePage.tsx Statistics tab | GET /sports/matches/:id/stats (:42); /box-score (:49) | Partial | other | Provider capability gaps (e.g. xG, ratings, pressure index) hidden/placeholder per sports capability registry. |
| 5823:9108 | First Half Statistics - Mobile | mobile | MatchCentrePage.tsx Statistics tab | GET /sports/matches/:id/stats (:42); /box-score (:49) | Partial | other | Provider capability gaps (e.g. xG, ratings, pressure index) hidden/placeholder per sports capability registry. |
| 5823:9317 | Second Half Statistics - Mobile | mobile | MatchCentrePage.tsx Statistics tab | GET /sports/matches/:id/stats (:42); /box-score (:49) | Partial | other | Provider capability gaps (e.g. xG, ratings, pressure index) hidden/placeholder per sports capability registry. |
| 5824:9174 | H2H - Mobile | mobile | MatchCentrePage.tsx H2H tab | GET /sports/matches/:id/h2h (:59) | Built | other |  |
| 5825:9207 | Lineups - Mobile | mobile | MatchCentrePage.tsx Lineups tab | GET /sports/matches/:id/lineups (:54) | Built | other |  |
| 5841:9240 | Clubs - Browse - Desktop | desktop | /clubs ClubsPage.tsx | GET /clubs (clubs.controller.ts:41) | Built | other |  |
| 5841:9306 | Clubs - Browse - Mobile | mobile | /clubs ClubsPage.tsx | GET /clubs (clubs.controller.ts:41) | Built | other |  |
| 5841:9365 | Club - Fan Page - Desktop | desktop | /clubs/:id ClubFanPage.tsx | GET /clubs/:id (:55), /feed (:77), /members (:96) | Built | other |  |
| 5841:9431 | Club - Fan Page - Mobile | mobile | /clubs/:id ClubFanPage.tsx | GET /clubs/:id (:55), /feed (:77), /members (:96) | Built | other |  |
| 5853:9240 | Club Pages - Design Notes & Open Decisions | desktop | n/a | n/a | Reference | other |  |
| 5864:9505 | Reserved (Native App) - header 4 - mobile + Bottom Navigation icon-row | mobile | reserved native app | n/a | Reference | other |  |
| 5864:9592 | Reserved (Native App) - header 7 - mobile + Bottom Navigation icon-row | mobile | reserved native app | n/a | Reference | other |  |
| 5953:10771 | Blog Page Desktop - Logged In | desktop | /blog BlogPage.tsx | GET /articles (articles.controller.ts:15); GET /categories (categories.controller.ts:12) | Built | other |  |
| 5953:11364 | Blog Page Desktop - Logged Out | desktop | /blog BlogPage.tsx | GET /articles (articles.controller.ts:15); GET /categories (categories.controller.ts:12) | Built | other |  |
| 5956:10960 | Blog Page Mobile - Logged In | mobile | /blog BlogPage.tsx | GET /articles (articles.controller.ts:15); GET /categories (categories.controller.ts:12) | Built | other |  |
| 5956:11331 | Blog Page Mobile - Logged Out | mobile | /blog BlogPage.tsx | GET /articles (articles.controller.ts:15); GET /categories (categories.controller.ts:12) | Built | other |  |
| 5956:12797 | Community - Home Feed with Normal Pinned Post - Mobile | mobile | /community CommunityPage.tsx (+ NavDrawer.tsx when drawer open) | GET /posts/feed (feed.controller.ts:74) | Built | other |  |
| 5980:10881 | Bants - Search Filter (Categories) - My Bants - Mobile | mobile | /banter BanterPage.tsx + banter/BanterFilterForm.tsx | GET /banter-rooms (:70), /search (:81), /mine (:90) | Built | other |  |
| 5982:10905 | Community - Create Post - Mobile - Active Contest | mobile | /community PostComposer.tsx | POST /posts (:61) | Built | other |  |
| 5982:10932 | Community - Create Post - Mobile - No Active Contest | mobile | /community PostComposer.tsx | POST /posts (:61) | Built | other |  |
| 5997:10905 | Blog - Article Detail Desktop - Logged In | desktop | /blog/:articleId ArticleDetailPage.tsx | GET /articles/:id (:28) | Built | other | Comments compose box disabled (no comments endpoint). |
| 5997:11224 | Blog - Article Detail Desktop - Logged Out | desktop | /blog/:articleId ArticleDetailPage.tsx | GET /articles/:id (:28) | Built | other | Comments compose box disabled (no comments endpoint). |
| 6000:11346 | Blog - Article Detail Mobile - Logged In | mobile | /blog/:articleId ArticleDetailPage.tsx | GET /articles/:id (:28) | Built | other | Comments compose box disabled (no comments endpoint). |
| 6000:11377 | Blog - Article Detail Mobile - Logged Out | mobile | /blog/:articleId ArticleDetailPage.tsx | GET /articles/:id (:28) | Built | other | Comments compose box disabled (no comments endpoint). |
| 6014:12948 | Admin Shell | desktop | component (apps/admin AdminShell) | n/a | Reference | admin |  |
| 6113:14053 | Contact Us Desktop - Logged In | desktop | none (no route; Footer 'Contact Us' is a non-link span, Footer.tsx:54,74) | none | Missing | contact-us | Frame 6113:14053: Name, Email, 'Choose a category' dropdown (6 options in 6130:14653), Email Subject, message, Submit. No endpoint. |
| 6113:14199 | Contact Us Desktop - Logged Out | desktop | none (no route; Footer 'Contact Us' is a non-link span, Footer.tsx:54,74) | none | Missing | contact-us | Frame 6113:14053: Name, Email, 'Choose a category' dropdown (6 options in 6130:14653), Email Subject, message, Submit. No endpoint. |
| 6114:14222 | Terms of Service Desktop - Logged In | desktop | /terms TermsPage -> legal/LegalPage.tsx | none (renders docs markdown) | Built | other | Footer link to /terms is NOT clickable (span). |
| 6114:14352 | Terms of Service Desktop - Logged Out | desktop | /terms TermsPage -> legal/LegalPage.tsx | none (renders docs markdown) | Built | other | Footer link to /terms is NOT clickable (span). |
| 6114:14471 | Privacy Policy Desktop - Logged In | desktop | /privacy PrivacyPage -> legal/LegalPage.tsx | none (renders docs markdown) | Built | other | Footer link is NOT clickable. |
| 6114:14601 | Privacy Policy Desktop - Logged Out | desktop | /privacy PrivacyPage -> legal/LegalPage.tsx | none (renders docs markdown) | Built | other | Footer link is NOT clickable. |
| 6115:14611 | Contact Us Mobile - Logged In | mobile | none (no route; Footer 'Contact Us' is a non-link span, Footer.tsx:54,74) | none | Missing | contact-us | Frame 6113:14053: Name, Email, 'Choose a category' dropdown (6 options in 6130:14653), Email Subject, message, Submit. No endpoint. |
| 6115:14684 | Contact Us Mobile - Logged Out | mobile | none (no route; Footer 'Contact Us' is a non-link span, Footer.tsx:54,74) | none | Missing | contact-us | Frame 6113:14053: Name, Email, 'Choose a category' dropdown (6 options in 6130:14653), Email Subject, message, Submit. No endpoint. |
| 6116:14627 | Terms of Service Mobile - Logged In | mobile | /terms TermsPage -> legal/LegalPage.tsx | none (renders docs markdown) | Built | other | Footer link to /terms is NOT clickable (span). |
| 6116:14685 | Terms of Service Mobile - Logged Out | mobile | /terms TermsPage -> legal/LegalPage.tsx | none (renders docs markdown) | Built | other | Footer link to /terms is NOT clickable (span). |
| 6116:14734 | Privacy Policy Mobile - Logged In | mobile | /privacy PrivacyPage -> legal/LegalPage.tsx | none (renders docs markdown) | Built | other | Footer link is NOT clickable. |
| 6116:14792 | Privacy Policy Mobile - Logged Out | mobile | /privacy PrivacyPage -> legal/LegalPage.tsx | none (renders docs markdown) | Built | other | Footer link is NOT clickable. |
| 6171:14797 | Create Post - Desktop - Active Contest | desktop | /community PostComposer.tsx | POST /posts (:61) | Built | other |  |
| 6171:16994 | Create Post - Desktop - No Active Contest | desktop | /community PostComposer.tsx | POST /posts (:61) | Built | other |  |
| 6178:14437 | Settings - Privacy | desktop | /settings/privacy PrivacySettingsPage.tsx | GET /auth/guardian-consent/status (:184) | Partial | profile | Public-profile toggle, Download my data, Your Post, Direct Message, marketing rows disabled (no backend). |
| 6185:14547 | Settings - Privacy - Mobile | mobile | /settings/privacy PrivacySettingsPage.tsx | GET /auth/guardian-consent/status (:184) | Partial | profile | Public-profile toggle, Download my data, Your Post, Direct Message, marketing rows disabled (no backend). |
| 6191:15563 | Privacy Settings - Design Notes | desktop | n/a | n/a | Reference | other |  |
| 6205:14551 | Club - Fan Page - Design Notes | desktop | n/a | n/a | Reference | other |  |
| 6213:15617 | Settings - Deactivate Account (Confirm) - Mobile | mobile | /settings/account/deactivate DeactivateAccountPage.tsx | POST /auth/deactivate-account (auth.controller.ts:72) | Built | other |  |
| 6213:15640 | Settings - Deactivate Account (Confirm) | desktop | /settings/account/deactivate DeactivateAccountPage.tsx | POST /auth/deactivate-account (auth.controller.ts:72) | Built | other |  |
| 6215:14657 | Community - Inactive Account - Delete (Confirm) - Mobile | mobile | /account/inactive InactiveAccountPage.tsx delete step | POST /auth/delete-inactive-account (auth.controller.ts:113) | Built | other |  |
| 6217:14677 | Inactive Account - Delete (Confirm) | desktop | /account/inactive InactiveAccountPage.tsx delete step | POST /auth/delete-inactive-account (auth.controller.ts:113) | Built | other |  |
| 6225:14789 | Settings - Delete Account (Confirm) | desktop | /settings/account/delete DeleteAccountPage.tsx | POST /auth/delete-account (auth.controller.ts:82) | Built | other |  |
| 6225:15024 | Settings - Delete Account (Confirm) - Mobile | mobile | /settings/account/delete DeleteAccountPage.tsx | POST /auth/delete-account (auth.controller.ts:82) | Built | other |  |
| 6241:14657 | Contest - Rules - Modal - Desktop | desktop | ContestRulesModal.tsx on /contest | none | Stub | other | Body is the literal '[PLACEHOLDER - founder to supply final Contest Rules copy]' (ContestPage tests). |
| 6241:14677 | Contest - Rules - Modal - Mobile | mobile | ContestRulesModal.tsx on /contest | none | Stub | other | Body is the literal '[PLACEHOLDER - founder to supply final Contest Rules copy]' (ContestPage tests). |
| 6266:14767 | Admin - Contest Console - Weeks In Progress | desktop | /contest ContestConsolePage.tsx (apps/admin) | GET /admin/contest/current (contest-admin.controller.ts:47) | Built | admin |  |
| 6269:14868 | Admin - Contest Console - Vacant (No Week Judged) | desktop | /contest ContestConsolePage.tsx (apps/admin) | GET /admin/contest/current (contest-admin.controller.ts:47) | Built | admin |  |
| 6269:15107 | Admin - Contest Console - All Weeks Judged | desktop | /contest ContestConsolePage.tsx (apps/admin) | GET /admin/contest/current (contest-admin.controller.ts:47) | Built | admin |  |
| 6270:15070 | Admin - Contest Console - Final Live | desktop | /contest ContestConsolePage.tsx (apps/admin) | GET /admin/contest/current (contest-admin.controller.ts:47) | Built | admin |  |
| 6270:15346 | Admin - Contest Console - Crowned | desktop | /contest ContestConsolePage.tsx (apps/admin) | GET /admin/contest/current (contest-admin.controller.ts:47) | Built | admin |  |
| 6271:15272 | Admin - Contest Console - No Cycle | desktop | /contest ContestConsolePage.tsx (apps/admin) | GET /admin/contest/current (contest-admin.controller.ts:47) | Built | admin |  |
| 6272:15373 | Admin - Contest - Start a Cycle | desktop | /contest/cycles/new ContestStartCyclePage.tsx | POST /admin/contest/cycles (:57) | Built | admin |  |
| 6273:15474 | Admin - Contest - Start a Cycle (Custom Weekly Windows) | desktop | /contest/cycles/new ContestStartCyclePage.tsx | POST /admin/contest/cycles (:57) | Built | admin |  |
| 6273:15664 | Admin - Contest - Start a Cycle - Blocked (Cycle Already Running) | desktop | /contest/cycles/new ContestStartCyclePage.tsx | POST /admin/contest/cycles (:57) | Built | admin |  |
| 6274:15676 | Admin - Contest - Judge Week (Open Round) | desktop | /contest/cycles/:id/rounds/:week ContestJudgeWeekPage.tsx | POST .../rounds/:week/results (:62) | Built | admin |  |
| 6275:15777 | Admin - Contest - Judge Week (Already Judged) | desktop | /contest/cycles/:id/rounds/:week ContestJudgeWeekPage.tsx | POST .../rounds/:week/results (:62) | Built | admin |  |
| 6275:15985 | Admin - Contest - Judge Week (No Entries - Thin Week) | desktop | /contest/cycles/:id/rounds/:week ContestJudgeWeekPage.tsx | POST .../rounds/:week/results (:62) | Built | admin |  |
| 6275:16182 | Admin - Contest - Judge Week - Blocked (Out Of Sequence) | desktop | /contest/cycles/:id/rounds/:week ContestJudgeWeekPage.tsx | POST .../rounds/:week/results (:62) | Built | admin |  |
| 6276:16080 | Admin - Contest - Open the Final (Confirm) | desktop | /contest/cycles/:id/final/open ContestOpenFinalPage.tsx | POST .../final/open (:71) | Built | admin |  |
| 6276:16213 | Admin - Contest - Crown Winners | desktop | /contest/cycles/:id/crown ContestCrownWinnersPage.tsx | POST .../crown (:76) | Built | admin |  |
| 6277:16282 | Admin - Contest - Cycle History | desktop | /contest/history ContestHistoryPage.tsx | GET /admin/contest/cycles (:42) | Built | admin |  |
| 6278:16383 | Contest Admin Console - Design Notes | desktop | n/a | n/a | Reference | admin |  |
| 6289:15068 | Settings - Menu - Mobile | mobile | /settings/menu SettingsMenuPage.tsx | none | Built | other |  |
| 6295:15068 | Settings - Overview | desktop | /settings SettingsLandingPage.tsx | GET /users/:id | Built | other |  |
| 6297:15173 | Settings - Overview - Mobile | mobile | /settings SettingsLandingPage.tsx | GET /users/:id | Built | other |  |
| 6303:15173 | Settings - Accessibility - Mobile | mobile | /settings/display/accessibility AccessibilityPage.tsx | none | Stub | other |  |
| 6303:15221 | Settings - Display - Mobile | mobile | /settings/display/density DisplayDensityPage.tsx | none | Stub | other |  |
| 6303:15262 | Settings - Language - Mobile | mobile | /settings/display/language LanguagePage.tsx | none | Stub | other |  |
| 6303:15307 | Settings - Data Usage - Mobile | mobile | /settings/display/data-usage DataUsagePage.tsx | none | Stub | other |  |
| 6304:15181 | Settings - Accessibility | desktop | /settings/display/accessibility AccessibilityPage.tsx | none | Stub | other |  |
| 6304:15329 | Settings - Display | desktop | /settings/display/density DisplayDensityPage.tsx | none | Stub | other |  |
| 6304:15471 | Settings - Language | desktop | /settings/display/language LanguagePage.tsx | none | Stub | other |  |
| 6304:15615 | Settings - Data Usage | desktop | /settings/display/data-usage DataUsagePage.tsx | none | Stub | other |  |
| 6339:16094 | Settings Shell | desktop | SettingsLayout.tsx | n/a | Reference | other |  |
| 6367:16407 | Grassroots - 1 Register Team - Desktop | desktop | /grassroots/register GrassrootsRegisterTeamPage.tsx | POST /teams (grassroots-teams.controller.ts:27) | Built | other |  |
| 6368:16495 | Grassroots - 2 Team Registered - Desktop | desktop | GrassrootsRegisterTeamPage.tsx confirmation state | POST /teams | Built | other |  |
| 6368:16610 | Grassroots - 5 Fixture Scheduled - Desktop | desktop | GrassrootsScheduleFixturePage.tsx confirmation state | POST /fixtures | Built | other |  |
| 6369:16675 | Grassroots - 3 Schedule Fixture - Desktop | desktop | /grassroots/:teamId/fixtures/new GrassrootsScheduleFixturePage.tsx | POST /fixtures (grassroots-fixtures.controller.ts:23) | Built | other | Frames use shared calendar component; code uses native date/time inputs. |
| 6371:16908 | Grassroots - 4 Schedule Fixture (Opponent TBD) - Desktop | desktop | /grassroots/:teamId/fixtures/new GrassrootsScheduleFixturePage.tsx | POST /fixtures (grassroots-fixtures.controller.ts:23) | Built | other | Frames use shared calendar component; code uses native date/time inputs. |
| 6372:17141 | Grassroots - 6 Fixture Manage (Scheduled) - Desktop | desktop | /grassroots/fixtures/:fixtureId GrassrootsFixturePage.tsx | GET /fixtures/:id (:31); PATCH /fixtures/:id/status (:64) | Built | other |  |
| 6372:17259 | Grassroots - 7 Log Result (Live) - Desktop | desktop | GrassrootsFixturePage.tsx | POST /fixtures/:id/result (:48) | Built | other |  |
| 6373:17321 | Grassroots - 8 Result Confirmed (Full Time) - Desktop | desktop | GrassrootsFixturePage.tsx | GET /fixtures/:id | Built | other |  |
| 6373:17444 | Grassroots - 9 Public Team Page (Verified) - Desktop | desktop | /grassroots/:teamId GrassrootsTeamPage.tsx | GET /teams/:id (:66), /teams/:id/fixtures (:78) | Built | other | Login required (JwtAuthGuard) though frame is named 'Public'. |
| 6374:17501 | Grassroots - 10 Public Team Page (No Fixtures, Unverified) - Desktop | desktop | /grassroots/:teamId GrassrootsTeamPage.tsx | GET /teams/:id (:66), /teams/:id/fixtures (:78) | Built | other | Login required (JwtAuthGuard) though frame is named 'Public'. |
| 6375:17591 | Grassroots - 1 Register Team - Mobile | mobile | /grassroots/register GrassrootsRegisterTeamPage.tsx | POST /teams (grassroots-teams.controller.ts:27) | Built | other |  |
| 6375:17646 | Grassroots - 2 Team Registered - Mobile | mobile | GrassrootsRegisterTeamPage.tsx confirmation state | POST /teams | Built | other |  |
| 6376:17631 | Grassroots - 3 Schedule Fixture - Mobile | mobile | /grassroots/:teamId/fixtures/new GrassrootsScheduleFixturePage.tsx | POST /fixtures (grassroots-fixtures.controller.ts:23) | Built | other | Frames use shared calendar component; code uses native date/time inputs. |
| 6376:17711 | Grassroots - 4 Schedule Fixture (Opponent TBD) - Mobile | mobile | /grassroots/:teamId/fixtures/new GrassrootsScheduleFixturePage.tsx | POST /fixtures (grassroots-fixtures.controller.ts:23) | Built | other | Frames use shared calendar component; code uses native date/time inputs. |
| 6377:17671 | Grassroots - 5 Fixture Scheduled - Mobile | mobile | GrassrootsScheduleFixturePage.tsx confirmation state | POST /fixtures | Built | other |  |
| 6377:17724 | Grassroots - 6 Fixture Manage (Scheduled) - Mobile | mobile | /grassroots/fixtures/:fixtureId GrassrootsFixturePage.tsx | GET /fixtures/:id (:31); PATCH /fixtures/:id/status (:64) | Built | other |  |
| 6378:17711 | Grassroots - 7 Log Result (Live) - Mobile | mobile | GrassrootsFixturePage.tsx | POST /fixtures/:id/result (:48) | Built | other |  |
| 6378:17776 | Grassroots - 8 Result Confirmed (Full Time) - Mobile | mobile | GrassrootsFixturePage.tsx | GET /fixtures/:id | Built | other |  |
| 6379:17751 | Grassroots - 9 Public Team Page (Verified) - Mobile | mobile | /grassroots/:teamId GrassrootsTeamPage.tsx | GET /teams/:id (:66), /teams/:id/fixtures (:78) | Built | other | Login required (JwtAuthGuard) though frame is named 'Public'. |
| 6379:17868 | Grassroots - 10 Public Team Page (No Fixtures, Unverified) - Mobile | mobile | /grassroots/:teamId GrassrootsTeamPage.tsx | GET /teams/:id (:66), /teams/:id/fixtures (:78) | Built | other | Login required (JwtAuthGuard) though frame is named 'Public'. |
| 6380:17791 | Grassroots - Design Notes | desktop | n/a | n/a | Reference | other |  |
| 6402:18078 | Grassroots - 11 Browse Teams - Desktop | desktop | /grassroots GrassrootsPage.tsx | GET /teams (:58) | Built | other |  |
| 6404:18180 | Grassroots - 11 Browse Teams - Mobile | mobile | /grassroots GrassrootsPage.tsx | GET /teams (:58) | Built | other |  |
| 6450:18580 | Community Groups - 1 Browse - Desktop | desktop | /groups CommunityGroupsPage.tsx | GET /community-groups (:58) | Built | other |  |
| 6452:18580 | Community Groups - 2 Browse (No Groups Match Filter) - Desktop | desktop | /groups CommunityGroupsPage.tsx | GET /community-groups (:58) | Built | other |  |
| 6452:18692 | Community Groups - 3 Browse (No Groups Yet for This City) - Desktop | desktop | /groups CommunityGroupsPage.tsx | GET /community-groups (:58) | Built | other |  |
| 6453:18580 | Community Groups - 4 Group Page (Not Joined) - Desktop | desktop | /groups/:groupId CommunityGroupPage.tsx | GET /community-groups/:id (:71), /members (:87), POST/DELETE /join | Partial | other | Frame shows a Group feed with sample posts; no group-feed endpoint exists, not built. |
| 6454:18580 | Community Groups - 5 Group Page (Joined) - Desktop | desktop | /groups/:groupId CommunityGroupPage.tsx | GET /community-groups/:id (:71), /members (:87), POST/DELETE /join | Partial | other | Frame shows a Group feed with sample posts; no group-feed endpoint exists, not built. |
| 6454:18709 | Community Groups - 6 Create a Group - Desktop | desktop | /groups/new CreateCommunityGroupPage.tsx | POST /community-groups (community-groups.controller.ts:39) | Built | other | Short-description field in frame omitted (no column). |
| 6455:18580 | Community Groups - 1 Browse - Mobile | mobile | /groups CommunityGroupsPage.tsx | GET /community-groups (:58) | Built | other |  |
| 6456:18580 | Community Groups - 2 Browse (No Groups Match Filter) - Mobile | mobile | /groups CommunityGroupsPage.tsx | GET /community-groups (:58) | Built | other |  |
| 6456:18667 | Community Groups - 3 Browse (No Groups Yet for This City) - Mobile | mobile | /groups CommunityGroupsPage.tsx | GET /community-groups (:58) | Built | other |  |
| 6457:18580 | Community Groups - 4 Group Page (Not Joined) - Mobile | mobile | /groups/:groupId CommunityGroupPage.tsx | GET /community-groups/:id (:71), /members (:87), POST/DELETE /join | Partial | other | Frame shows a Group feed with sample posts; no group-feed endpoint exists, not built. |
| 6458:18580 | Community Groups - 5 Group Page (Joined) - Mobile | mobile | /groups/:groupId CommunityGroupPage.tsx | GET /community-groups/:id (:71), /members (:87), POST/DELETE /join | Partial | other | Frame shows a Group feed with sample posts; no group-feed endpoint exists, not built. |
| 6458:18701 | Community Groups - 6 Create a Group - Mobile | mobile | /groups/new CreateCommunityGroupPage.tsx | POST /community-groups (community-groups.controller.ts:39) | Built | other | Short-description field in frame omitted (no column). |
| 6459:18580 | Community Groups - Design Notes | desktop | n/a | n/a | Reference | other |  |
| 6477:20050 | Coming Soon - Desktop - Logged In | desktop | /scouting, /academy ComingSoonPage.tsx | none | Built | other | Designed placeholder (Phase 2). |
| 6477:20402 | Coming Soon - Desktop - Logged Out | desktop | /scouting, /academy ComingSoonPage.tsx | none | Built | other | Designed placeholder (Phase 2). |
| 6477:20677 | Coming Soon - Mobile - Logged In | mobile | /scouting, /academy ComingSoonPage.tsx | none | Built | other | Designed placeholder (Phase 2). |
| 6477:20764 | Coming Soon - Mobile - Logged Out | mobile | /scouting, /academy ComingSoonPage.tsx | none | Built | other | Designed placeholder (Phase 2). |
| 6477:20865 | Coming Soon - Design Notes | desktop | n/a | n/a | Reference | other |  |
| 6508:21059 | Match Momentum | desktop | MatchCentrePage.tsx Momentum tab | GET /sports/matches/:id/momentum (:67) | Built | other |  |
| 6508:21321 | Live Commentary | desktop | MatchCentrePage.tsx Commentary tab | GET /sports/matches/:id/events (:76) | Built | other |  |
| 6514:21081 | Match Momentum - Mobile | mobile | MatchCentrePage.tsx Momentum tab | GET /sports/matches/:id/momentum (:67) | Built | other |  |
| 6514:21296 | Live Commentary - Mobile | mobile | MatchCentrePage.tsx Commentary tab | GET /sports/matches/:id/events (:76) | Built | other |  |
| 6563:23341 | Group 403 - Room Row | desktop | component | n/a | Reference | other |  |

<!-- COUNTS {'Archived': 36, 'Reference': 65, 'Built': 196, 'Partial': 71, 'Missing': 35, 'Stub': 34, 'NotInspected': 6} -->

## 3. Orphans

### 3a. Orphan routes / pages (code with no Figma frame)

Checked against every live frame name on page `0:1` (not archived).

| Route / page | Evidence | Notes | Tag |
|---|---|---|---|
| `/report` `ReportPage.tsx` | `router.tsx:299`; no "Report" frame in the frame list | Public report form (`POST /reports/public`); linked from `Footer.tsx`. `ReportAction.tsx` (report buttons on `PostCard.tsx`) also has no frame. | other |
| `/banter/:roomId` `BanterRoomPage.tsx` | `router.tsx:197`; closest frames are the "Bants - post page with all comments" frames, which show a comment thread | Room feed + composer built without a matching frame (per its own header). | other |
| Card-verification step `guardian-consent/CardVerificationPanel.tsx` (on `/guardian-consent/confirm`) | no card/payment frame in the list | Built plainly. | guardian-copy |
| `NotFoundPage.tsx` (`router.tsx:172`) | no 404 frame | | other |
| `apps/admin` `/login` `AdminLoginPage.tsx` (`routes.tsx:61`) | no admin login frame among the admin frames | Built plainly. | admin |
| `apps/admin` `AdminNotFound.tsx` (`routes.tsx:139`) | no frame | | admin |
| `/settings/account/club-representation`, `/clubs`, `/groups`, `/grassroots*` | have frames (see table) | not orphans — listed to show they were checked | — |
| `EditProfileModal.tsx` Username field | `Edit Profile` frames `1466:15934`, `5702:8317` have no Username row (the layer-name search found Username only on Create Profile `1498:2312` and Account Information `2924:7229`) | | username |

### 3b. Orphan endpoints (route handlers with no non-comment consumer in `apps/web` or `apps/admin`)

Method: all 152 route handlers were extracted from the controllers; each path was searched for in `apps/web/src` and `apps/admin/src` (tests, `//` comment lines and block comments excluded). Candidates were then verified by hand. Method limitation: matching is by path text, so a path assembled from non-literal parts could be missed; `POST /auth/refresh` and `POST /auth/logout` were verified manually.

| Endpoint | Controller | Consumer | Tag |
|---|---|---|---|
| `GET /users/:id/public-profile` | `users.controller.ts:75` | **none** (no profile card/page for other users) | profile |
| `GET /users/:id/saved-posts` | `feed/saved-posts.controller.ts:35` | **none** (mentioned only in comments in `api/feed.ts:56,114`); no Saved tab in `ProfilePage.tsx:33` | profile |
| `POST /auth/guardian-consent/withdraw/request`, `POST /auth/guardian-consent/withdraw` | `guardian-consent.controller.ts:152,167` | **none** — no guardian-facing page | guardian-copy |
| `POST /auth/refresh` | `auth.controller.ts:38` | **none in web** (refresh token is stored by `LoginPage.tsx:72` and never exchanged); admin has its own `/admin/auth/refresh` | signup-flow |
| `POST /auth/logout` | `auth.controller.ts:44` | **none** — web "Log out" only calls `clearStoredSession()` (`Header.tsx:49`), so the server-side session is not revoked by logging out | other |
| `PUT` / `DELETE /sports/matches/:id/subscription` | `sports-matches.controller.ts:92,99` | **none** (kickoff alerts have no UI) | other |
| `GET /banter-rooms/topics`, `POST /banter-rooms/:id/topics`, `PATCH /banter-rooms/:id/status` | `banter.controller.ts:102,209,199` | **none** (`api/banter.ts` has the status type but no PATCH call; no topic call) | other |
| `GET /admin/users/held-investigations` | `admin-users.controller.ts:34` | **none** (no `apps/admin` screen; CLAUDE.md already says so) | admin |
| `GET /health` | `health.controller.ts:11` | infra / smoke test only | other |

Not orphans (verified consumed): `POST /posts/:id/view` (`VideosCarousel`), `PATCH /posts/:id/comments/:commentId/hide|unhide` (`api/feed.ts:287`, via a ternary), `GET /users/suggested`, `PATCH /users/:id/represented-club`, `PATCH /posts/:id/comment-settings`.

Endpoints that exist but whose designed screen is missing are listed in the frame table (e.g. `GET /posts/:id` single-post page, Contest entries/voting).

## 4. Answers to Q1–Q14

### Q1. "Activation confirmation"

- **Figma:** `Guardian Consent — 6 Activation Confirmation` desktop `5108:6631`, mobile `5531:7544`. It is the **minor's** screen: top bar "Minor Account (Active)", heading "You're all set, Ade", body "Sarah Bello approved your account on 15 August 2026. Everything that was switched off is now on.", cards "Now switched on" (profile visible / DMs on / post in Banter Rooms & Community Groups) and "Some protections stay on because you're under 18", then two buttons: **"Go to my profile"** (`5114:6773`, green) and "Review privacy settings". The footnote says "You can see these in Settings › Privacy & Safety" (that frame is now archived, `2922:5382`).
- **Code:** the `consentStatus === "confirmed"` branch of `apps/web/src/pages/GuardianConsentPage.tsx` (route `/guardian-consent`, `router.tsx:312`), lines ~180-240 (heading "You're all set" at `:186`). Data: `GET /auth/guardian-consent/status` (`guardian-consent.controller.ts:184`).
- **"Go to my profile":** `GuardianConsentPage.tsx:224-228` — `<Link to="/profile">`, which opens the minor's own `ProfilePage.tsx` (there is no other-user profile page). The same label also appears at `:157-161` on the "not-a-minor" branch (an adult who opens `/guardian-consent` sees "This page only applies to accounts registered as under 18" plus a Go to my profile button). "Review privacy settings" (`:233`) is a **disabled** "Coming soon" button although `/settings/privacy` exists.
- **Guardian-side screens are different:** after approving, the guardian sees `GuardianConsentConfirmPage.tsx:155-157` "Thank you / Your approval has been recorded. The account is now active -- you can close this page." (no profile button, no link). Figma frame 7 (`5488:7164`) is the guardian's "Consent Approved" screen. No other minor-facing activation page exists.
- **How a minor gets from "Restricted pending" to this page today:** there is **no automatic transition**. (a) The minor needs a session, but registration does not store one (`RegisterStep.tsx:104-110`), so they must log in. (b) Login always `navigate("/")` (`LoginPage.tsx:74`); `/` redirects any token holder to `/community` (`HomePage.tsx:123`). The minor is **not** sent to `/guardian-consent`. (c) The page is reachable only by typing the URL, the "Guardian consent status" badge on `/profile` (`ProfilePage.tsx:169`, minors only), the Privacy Settings row (`PrivacySettingsPage.tsx:287`), the post-verification CTA (`VerifyEmailPage.tsx:254`), or "Check your consent status" links shown after a 403 (`PostComposer.tsx:282`, `PostCard.tsx:360`, `ConversationPage.tsx:269`, etc.). (d) No polling (`setInterval`/`visibilitychange` absent from the page), no push, **no email to the minor on approval**. (e) Once approved, permissions flip immediately without re-login because `GuardianConsentGuard` re-reads `isMinor`/`consentStatus` from Postgres every request (`guards/guardian-consent.guard.ts`); the page itself shows the new state on the next load/refresh.

### Q2. CURRENT expiry / decline / withdraw behaviour (report only — nothing changed)

**Token TTL and config.** Guardian consent token: `DEFAULT_CONSENT_TOKEN_TTL_HOURS = 72` (`consent-token.constants.ts:17`), override `GUARDIAN_CONSENT_TOKEN_TTL_HOURS` (`.env.example:148`, `render.yaml:109,172`). Withdrawal token has its own TTL `GUARDIAN_CONSENT_WITHDRAWAL_TOKEN_TTL_HOURS` (default 72; read in code, **not** in `render.yaml`). The constants file itself says 72h is "a starting number, not a counsel-reviewed decision". (Figma says "expires after 3 days"/"expires in 3 days".)

**Is there a scheduled sweeper? Yes.** `GuardianConsentExpirySweepService` (`guardian-consent-expiry-sweep.service.ts`), `@Cron(CronExpression.EVERY_HOUR)`, selects `Guardian` rows with `consentStatus='pending'`, `consentTokenExpiresAt <= now`, minor still `isMinor: true`:
- **First lapse** (`consentAutoResentAt IS NULL`): one automatic re-send of the consent email to the guardian (new token, new expiry) and the email "Your Soccernity account is still waiting for guardian approval" to the **minor**.
- **Second lapse** (`consentAutoResentAt` set): treated as an implicit decline via `refuseConsentAndScheduleDeletion({reason:'expired'})`. About 6 days after registration with the default TTL.

**What each path does** (all converge on `GuardianConsentService.refuseConsentAndScheduleDeletion`, `guardian-consent.service.ts:600-671`):
- `Guardian` row: `consentStatus='declined'`, `consentDeclineSource` = `guardian_explicit` (decline, `POST /auth/guardian-consent/decline`), `guardian_withdrawal` (withdraw, `/withdraw/request` then `/withdraw`), or `expiry_timeout`; withdrawal token cleared. The row is **kept** (including `consentToken`, guardian name/email/relationship, declared country).
- `User` row: `AuthService.startPendingDeletion` (`auth.service.ts:265-271`) sets `accountStatus='pending_deletion'`, `pendingDeletionAt=now`, and revokes **all** sessions (Redis refresh tokens). **Email, password hash and encrypted DOB are untouched during the 30-day grace period.** If the account is already `pending_deletion` the clock is not reset.
- Tokens: sessions revoked. The old consent token still exists on the `Guardian` row but `confirmConsent` now refuses a `declined` row with an explicit message.
- Emails to the minor: `guardian-consent-declined` / `guardian-consent-withdrawn` / `guardian-consent-expired` (`registration-email.service.ts:122-170`). No email to the guardian.
- **What the minor sees:** nothing in-app. Login for any non-`active` account returns `Invalid credentials` (`auth.service.ts:95-100`), so no page can render. If they still hold an unexpired access token (≤`JWT_ACCESS_TTL_SECONDS`, default 900s), `/guardian-consent` renders the **pending** layout for a `declined` row, because only `confirmed` is special-cased (`GuardianConsentPage.tsx:179`). Figma frame 9 (`5491:8241`) shows a screen for this state that cannot be reached.

**Is a never-approved minor account ever purged? Not hard-deleted — anonymized.** After `GRACE_PERIOD_DAYS = 30` (`account-deletion-sweep.service.ts:57`) the daily `AccountDeletionSweepService` (`@Cron EVERY_DAY_AT_3AM`, `:105`) runs `anonymizeUser`: snapshots a `ConsentAuditRecord`, **deletes the `Guardian` row**, and anonymizes the `User` row **in place** — `email → deleted-<id>@deleted.soccernity.internal`, `phone/dateOfBirth/username → null`, `displayName → "[deleted user]"`, unusable `passwordHash`, `accountStatus='deleted'` (`:296-305`). **There is no hard delete of the `User` row and no retention timer on the anonymized row** (Decision Log #344 "no purge timer, by design"); `ConsentAuditRecord` is purged after 6 months. An account with an open `Report` against/by/authoring it is **held** and not anonymized (no maximum hold). So: personal data is removed after ~36 days, but the anonymized `User` row and any posts remain indefinitely. If the account is never approved but the guardian token has not yet lapsed, nothing is purged until the second lapse.

**Operational caveat (unknown from code alone):** the sweep proceeds whether or not emails actually went out. `RegistrationEmailService` only sends when `EMAIL_PROVIDER_API_KEY` is a real key; otherwise it logs "Would send" (`registration-email.service.ts:60-66, 283`). Whether the key is set in Render is **unknown** (not inspectable from the repo). With no real key, guardians never receive the request yet the minor's account is still auto-closed ~6 days after sign-up.

### Q3. Create Profile (Figma `1498:2303` desktop, `1629:2449` mobile)

No route, page or endpoint exists (`router.tsx` has no such path; no endpoint accepts these as a set). The mobile frame is 430px wide (not the 390 canonical).

| Frame field | Column / endpoint today |
|---|---|
| Full Name* (First + Last) | `User.displayName` — collected at register; `PATCH /users/:id` accepts `displayName` (`update-user.dto.ts:17-20`) |
| Username* | `User.username String? @unique` exists; `PATCH /users/:id` accepts it (`update-user.dto.ts:34-39`); editable only in `EditProfileModal.tsx` (no Create Profile screen) |
| Date of Birth* | `User.dateOfBirth` exists (encrypted TEXT); set once at register; **no PATCH path** (not in `UpdateUserDto`) |
| Location (optional) | **No column, no endpoint** (`EditProfileModal` shows a disabled field) |
| Bio (optional) | **No column, no endpoint** |
| Preferred Club* | `User.clubAffiliationId` exists but **nothing writes it**; `User.representedClubId` is written by `PATCH /users/:id/represented-club` (users.controller.ts:100); membership via `POST /clubs/:id/join` |
| "Add a Profile Picture" | **No column, no upload endpoint for users** (media upload is admin-only, `admin-media.controller.ts:61`) |
| "Create profile" button | no endpoint |

### Q4. Viewing another user's profile

- **Figma:** yes — `User's post feed` `1455:4362` (screenshot inspected) is a viewer-facing profile: cover photo, avatar photo, name, `@handle`, location ("Port Harcourt"), bio, followers/following counts, **Follow** button, message icon, a "…" menu with **Copy Profile Link / Share Profile Via / Block <handle>**, Posts/Media tabs. Sibling frames: `1455:6626` (Media), `1460:8940` (Saved), mobile `5702:8250`, `5778:8490`, `5778:8567`. The frame set does not say whether the same frames double as the owner's own view (the owner variant would show Edit Profile; `1466:15934` is the separate Edit Profile frame).
- **Code route/page:** none for another user. `/profile` (`ProfilePage.tsx`) is the caller's own profile only (id read from the access token's `sub`); there is no `/users/:id` or `/u/:username` route in `router.tsx`.
- **Endpoints:** `GET /users/:id` is self-only (`users.controller.ts:80`, `assertSelf`). `GET /users/:id/public-profile` (`:75`, `JwtAuthGuard`) returns `{ id, publicName, guardianContact }` — **no frontend consumer** (orphan). Related: `GET /users/:id/followers|following` (consumed), `POST/DELETE /users/:id/follow` (consumed). No block endpoint exists for the frame's "Block" action; no profile-share endpoint.
- Figma fields with no backing column: cover photo, avatar, location, bio.

### Q5. Contact Us

- **Figma frames (live):** `Contact Us Desktop — Logged In` `6113:14053`, `— Logged Out` `6113:14199`; `Contact Us Mobile — Logged In` `6115:14611`, `— Logged Out` `6115:14684`. Plus component `Contact Category Dropdown — Desktop/Mobile` `6130:14653` / `6130:14664` (options: Technical issues / Editorial Complaints / Data / Livescores Issues / Suggestions / Enquiries/Feedback). Fields: Name, Email, Choose a category, Email Subject, message, Submit. Archived originals `87:158`, `96:253`.
- **Code:** no route, page or endpoint. `Footer.tsx:54,74` renders "Contact Us" as a non-interactive `<span>` (header comment `:18-19` says there is no `/contact` route).
- **Every place the code offers a way to contact support:** `mailto:support@soccernity.com?subject=Email%20verification%20help` (`VerifyEmailPage.tsx:64`, on the invalid/missing-token states); `mailto:support@soccernity.com?subject=Report%20a%20concern` and visible address (`ReportPage.tsx:52,171`); `/report` public report form (`POST /reports/public`) linked from the footer; support@soccernity.com mentioned in the emails `guardian-minor-turned-18` and `guardian-email-replaced` (`registration-email.service.ts:406,418` text; `516,524` HTML). That is all (grep for `mailto:`, `support@`, `/contact`).

### Q6. Player-profile claims

**Schema/API/UI:** no `position`, `schoolTeam`, `stats`, `avatar`, `photo`, `bio`, `location` field exists on `User` (`schema.prisma` `model User`, read in full). `User.role` comment says `fan | player | admin` (`schema.prisma`), and `ProfilePage.tsx` renders `profile.role` as a badge. Self-entered stats do not exist anywhere. (Unrelated "position" uses: Contest judging positions, Community Group `positionPlayed` dimension, leaderboard rank.)

**Copy occurrences (exact text) that claim or imply these:**

| Where | Text |
|---|---|
| `apps/web/src/pages/GuardianConsentConfirmPage.tsx:63-64` | "Build a player profile" / "Position, club or school team, and stats they add themselves." |
| Figma `5113:6668` / `5113:6669` (Guardian Consent 4, `5108:6629`) | "Build a player profile" / "Position, club or school team, and stats they add themselves." (mobile twin `5531:7626` not text-inspected) |
| `apps/web/src/pages/GuardianConsentPage.tsx:299` | "Add your position and photo. It stays private until approval." (row title "Set up your profile", `:298`) |
| Figma `5114:6697` / `5114:6698` (`5108:6630`) | "Set up your profile" / "Add your position and photo. It stays private until approval." (mobile twin `5531:7461` not text-inspected) |
| Figma `5113:6704`-`5113:6708` (`5108:6629`) | "Anything Ade chooses to post" / "Profile details, posts, comments and images they upload." |
| Figma `1498:2512` Create Profile | "Add a Profile Picture" (no backing) |
| Figma `5108:6631` card | "Your profile is visible — Other Soccernity members can find and view your profile." (and code `GuardianConsentPage.tsx:61-62`) — no other-user profile page exists |
| `GuardianConsentPage.tsx:280-282` and Figma `5114:6685/6686` | "Browse and follow — Follow teams, players and grassroots leagues." (players cannot be followed as player profiles; users can be followed) |
| `docs/legal-copy-draft-tos-privacy-policy.md` | Keyword search (position, school, player profile, stats, photo, avatar) found **no** "player profile" / "position" / "school team" claim in the ToS/Privacy text. "photo" hits (`:299, 312, 500, 658, 791, 871`) are about uploaded media and CJEU/Cloudflare R2, not a profile feature. "school" in Grassroots (below) is team type. |
| Grassroots (not a profile claim, listed because it contains "school"): `apps/web/src/api/grassroots.ts:375-381`; Figma `6367:16503`, `6367:16521`, `6374:17510` | "school or academy team", "School team" — a `GrassrootsTeam.leagueType` value, real |
| `docs/` | `docs/sprint-5-grassroots-teams-browse-report.md:143-223` ("School team" Grassroots label) only |
| Emails | no occurrence in any email template (`registration-email.service.ts`) |
| Figma keyword scan across all text-node layer names | only the hits above plus Leaderboard/Contest "position" (rank) and Community Group "Position played" filters; scan output saved in the audit working notes |

### Q7. Guardian-flow copy inventory (exact text and location)

**"Go to my profile"**: `GuardianConsentPage.tsx:161` (not-a-minor branch) and `:228` (confirmed branch); Figma `5114:6773` (desktop) and `5531:7613` (mobile). Nowhere else (grep).

**"What you can still do"**: `GuardianConsentPage.tsx:273`; Figma `5114:6679` (rows "Browse and follow", "Check scores and fixtures", "Set up your profile"). Mobile `5531:7461` not text-inspected. Frame 9 has the variant heading "What you can do now" (`5491:8287`).

**Restricted-pending state copy:**
- Code (`GuardianConsentPage.tsx:46-57`): "Your profile is hidden — Nobody can find you in search or open your profile page."; "Direct messages are off — Accounts you have not verified cannot message you."; "Banter Rooms & Community Groups are read-only — You can read posts and conversations, but you cannot post in either."; pill "WAITING FOR GUARDIAN APPROVAL" (`:245`); heading "Your account is waiting for approval" (`:247`); "We emailed {guardianEmail}. Until they approve, the things below are switched off to keep you safe."
- Figma `5108:6630` has the same rows; plus "SCOPE OPEN — does restricted-pending also limit Grassroots record-keeping and Sports Hub?" (`5114:6677`) and "Last sent 2 hours ago. Didn't arrive? Check their spam folder, or send it again." (`5114:6704`, not in code).
- Behaviour check: the "Banter Rooms" row says "read-only", but `/banter-rooms*` is blocked entirely for under-16s (`@RestrictUnder16('banter')`, `banter.controller.ts` class decorator) and the DM row says "Accounts you have not verified cannot message you" while the code blocks sending **and** receiving for restricted-pending minors.

**Photo / avatar visibility:** `GuardianConsentPage.tsx:299` "It stays private until approval." (no photo feature exists). Figma `5114:6698` same. Figma `5108:6631` footnote "Your guardian can review or withdraw consent at any time. You can see these in Settings › Privacy & Safety." (`5114:6770`; archived page).

**Guardian contact visibility ("under-16" vs "under 18"):**
- Code, guardian screen: `GuardianConsentConfirmPage.tsx:97-104` — "Your email on their profile … While the account holder is under 18, your email address appears on their profile, labelled “Guardian contact”, and any logged-in Soccernity user can see it. Under-18 accounts cannot receive ordinary direct messages, so this is how others can reach you about them. It is removed automatically when they turn 18."
- Legal draft: `docs/legal-copy-draft-tos-privacy-policy.md:47-48` and `:229-235` — "shown on the **under-16's** own profile card, visible to any viewer, labelled “Guardian contact”".
- Code behaviour: `GET /users/:id/public-profile` returns `guardianContact` for **every** current minor (under 18) per the CLAUDE.md #363 entry; a minor (under 18) can send DMs, which contradicts "Under-18 accounts cannot receive ordinary direct messages" on the guardian screen (only under-16s are blocked from messaging, `@RestrictUnder16('messaging')`). No web UI renders `guardianContact` for other viewers (orphan endpoint), so the guardian is told the email is visible to any logged-in user while no screen shows it.
- Figma `6184:14562` (Settings — Privacy): "Your guardian has approved your account. This section is only shown for accounts under 18." Legal draft row 32 (`:927`) still says "no public profile card exists" (stale).

**Flow order — account created before or after guardian approval:**
- Code: **before.** `RegistrationService.register` creates the `User` row, then the `Guardian` row, then emails the guardian and the verification email, and returns tokens (`registration.service.ts:108-234`). The minor has a real account in a restricted state immediately.
- Figma `5110:6660` (Age Gate): "If you are under 18, we will ask a parent or guardian to approve your account before it goes live. Nothing you post is public until they do." Figma `5111:6630` (Guardian Details): "We will email your parent or guardian a link. They read what Soccernity is, what we collect, and then approve or decline. Nothing goes public until they do." `5111:6644`: "…before your account goes live." Figma `5108:6628` email: "Before Ade's account can go live, we need your permission." Code: `AgeGateStep.tsx:140-141` and `GuardianDetailsStep.tsx:82,92` reproduce these.
- Legal draft inconsistency: ToS §3.1 (`legal-copy-draft…md:186`) "captures the name, email address, and relationship of a parent or guardian **before the account is created**", but §3.2 (`:189`) "Until a guardian confirms consent, the minor's account **exists** but is restricted", and Privacy §3 (`:557`) "A minor's account exists as soon as it is created". Counsel-approved v0.2 wording is described in the draft header as unchanged.
- Figma frame 4 footnote (`5113:6744`): "Declining keeps the account locked and deletes the details Ade entered after 30 days. You can withdraw consent at any time by contacting us." Code: decline closes the account immediately (login fails) and anonymizes after 30 days; withdrawal needs the two-step guardian code flow (no UI, orphan endpoints); that footnote is **not** rendered (`GuardianConsentConfirmPage.tsx:263` "COPY PENDING LEGAL REVIEW").

**What is collected:** Figma frame 4 list (`5113:6688-6714`): "Name and date of birth — Date of birth is used for age checks only. It is never shown publicly."; "Email address — For sign-in and account notices."; "Anything Ade chooses to post — Profile details, posts, comments and images they upload."; "Your name, email and relationship — Kept only to record that you gave consent, and to contact you about it." **Not present in `GuardianConsentConfirmPage.tsx`** (no "What we collect" section; only a pointer sentence at `:175`). Code additionally collects the guardian's declared **country** (not disclosed in any copy).

### Q8. Country

| Where | What |
|---|---|
| `Guardian.declaredCountry String?` | `schema.prisma:306` (added by migration `20260921120000_add_coppa_card_verification`, `ALTER TABLE "Guardian" ADD COLUMN "declaredCountry" TEXT`) |
| Register DTO | `RegisterDto.countryCode` optional, regex `^[A-Za-z]{2}$` (`register.dto.ts:51-59`) |
| Web | `GuardianDetailsStep.tsx:43,62-63,158-170` required select "Country you live in"; options `COUNTRY_OPTIONS` in `signup/types.ts:31-35` incl. `ZZ` = "Another country"; sent as `countryCode` at `RegisterStep.tsx:66` |
| Storage | `registration.service.ts:183` `declaredCountry: normalizeDeclaredCountry(dto.countryCode)`; `:184` `cardVerificationRequired: requiresCardVerification(dateOfBirth, dto.countryCode)` |
| Policy | `card-verification-policy.util.ts:6-29`: card verification only when under 13 and country is `US` **or omitted** |
| `User` | **no country column**. Account Information frames show "Country (no backend field yet)" (`5649:8201`, `2924:7244`) |
| Not snapshotted | declared country is not copied into `ConsentAuditRecord` |

**Figma:** the Guardian Details frame `5108:6627` has **no** country field (design context read in full: fields are Guardian's full name, Guardian's email address, relationship; no country). Age Gate `5108:6626` has none. **The coded Guardian Details step has one** (required). Create Profile `1498:2303` has no Country field (it has Location); Register frames `407:1051` / `1625:2333` were not text-inspected for country (layer-name search found no "country" text on them; the only `Country` text hits are Bants filter chips and Account Information). The Figma mobile Guardian Details `5539:7354` was not text-inspected.

### Q9. Sign-up and login flow as coded vs designed

**Adults (≥18), coded:** `/signup` (`SignupFlow.tsx`, under `AuthChrome`) → Age Gate (`AgeGateStep.tsx`, DOB) → Register (`RegisterStep.tsx`: first/last name, email, password) → `POST /auth/register` (rate-limited, creates `User`, issues tokens, sends verification "code" email) → success view = `ClubPickerStep` using the token in memory (`POST /clubs/:id/join`) → `navigate("/")`. **No session is stored** (only `LoginPage.tsx:71-72` and `InactiveAccountPage.tsx:79-80` write `sn_access_token` / `sn_refresh_token`). `/` (logged-out marketing) → user must go to `/login` → `POST /auth/login` → `navigate("/")` → `HomePage.tsx:123` redirects to `/community`. Email verification is not enforced by any guard (`verificationStatus` is read only for display; `registration.service.ts:245` is the only writer) and the verification email has no link.
**Minors (<18):** same, with Guardian Details between Age Gate and Register (`guardian-details` step); registration creates `User` + `Guardian` and emails the guardian a **code**. After login a restricted-pending minor lands on **`/community`** (not `/guardian-consent`) on every login. Guards: `JwtAuthGuard` everywhere; `GuardianConsentGuard` only on the endpoints below; no route-level guard in the web router (`router.tsx` has no auth guard; pages check `getStoredAccessToken()` individually).

**Designed:** Figma Guardian Consent 1 → 1a → 2 → (email 3) → 4 → 5 → 6 (+7-12). Register frames carry Google/Apple/Facebook sign-in (not coded).

**Endpoints guarded against restricted-pending (`GuardianConsentGuard`, 403 `guardian_consent_pending`):** `POST /posts`, `POST /posts/:id/comments`, `POST /contest/entries`, `POST /conversations`, `POST /conversations/:id/messages`, `POST /banter-rooms`, `POST|DELETE /banter-rooms/:id/join`, `POST /banter-rooms/:id/posts`, `POST /banter-rooms/:id/topics`, `POST /community-groups`, `POST|DELETE /community-groups/:id/join`, `POST /teams`, `POST /fixtures`, `POST /fixtures/:id/result`, `PATCH /fixtures/:id/status`. Read-side hiding (not the guard): restricted-pending minors are filtered out of user search, club/group rosters, followers/following lists, public-profile (404), leaderboard.

**Endpoints a restricted-pending user can still call (JwtAuthGuard only or no auth) — all unguarded by consent:**
- Profile/account: `PATCH /users/:id` (displayName, phone, username) `users.controller.ts:86`; `PATCH /users/:id/represented-club` `:100`; `POST /auth/change-password`, `/deactivate-account`, `/delete-account`; `POST /auth/guardian-consent/change-guardian-email` (intended).
- Social actions: `POST|DELETE /users/:id/follow` `:141,147`; `POST|DELETE /posts/:id/like` `feed.controller.ts:113,120`; `POST|DELETE /posts/:id/save` `:231,238`; `DELETE /posts/:id` `:158`; `PATCH /posts/:id/comment-settings` `:166`; `PATCH …/hide|unhide` `:178,188`; `DELETE …/comments/:commentId` `:214`; `POST /posts/:id/view` `:256` (optional JWT); `POST|DELETE /clubs/:id/join` `clubs.controller.ts:136,166`; `PATCH /banter-rooms/:id/status` `banter.controller.ts:199`; `PUT|DELETE /sports/matches/:id/subscription`.
- Reports/appeals: `POST /reports`, `POST /reports/:id/appeal` (`reports.controller.ts:28,33`, deliberately open); `POST /reports/public` (no auth).
- Reads: `GET /posts/feed`, `/posts/:id`, comments, club feed/members, banter rooms/feeds (blocked only for under-16), conversations list/messages/read (`conversations.controller.ts:71,80,106`; under-16 guard only), notifications, leaderboard, contest current/cycle, teams/fixtures, community groups, `GET /users/suggested`, `/users/:id/followers|following`, and the public `GET /search`, `GET /trending`, `GET /sports/*`, `GET /articles`, `GET /categories`.
- Avatar/media upload: **no such endpoint exists for users** (media upload is `AdminJwtAuthGuard`-only), so there is no unguarded upload path.

### Q10. Other-facing payloads exposing real names (#364 intended `publicName`)

Payload bodies were converted to `{ id, publicName }` (`public-name.util.ts`; confirmed in feed, comments, clubs/groups rosters, search, followers, leaderboard, contest, messaging, notifications). **Remaining leaks of the raw `displayName`:**
1. **User search cursor:** `encodeSearchUserCursor({ displayName: last.displayName, id })` — base64url JSON (`search/cursor.util.ts:45-48`), returned as `nextCursor` (`search.service.ts:273-274`) to any caller. Real name of the last result is recoverable even for username-holders.
2. **Club roster cursor:** `encodeClubCursor({ name: last.displayName, id })` (`clubs.service.ts:306-307`).
3. **Community Group roster cursor:** `encodeCommunityGroupMemberCursor({ name: last.displayName, id })` (`community-groups.service.ts:420-421`).
4. **Ordering:** rosters and user search are ordered by `displayName` (`clubs.service.ts:298`, `community-groups.service.ts:411`, `search.service.ts:265`) so order reveals real-name ordering (code comments flag "flagged follow-up").
5. **Own-user summaries** (`toAuthUserSummary`, `GET /users/:id`) include `displayName`, `email`, `dateOfBirth`, `phone` — self-only, intended.
6. **Admin surfaces** (`admin-users.service.ts:24-26` displayName+email; moderation) return real names to admins — intended, not other-user-facing.
7. Emails to guardians/minors use real `displayName` (`guardian-consent.service.ts:223`) — intended.
No endpoint returns another user's email or DOB to non-admin callers (checked `*.service.ts` selects for `email: true`/`dateOfBirth` — only own-profile, admin and sweep paths).

### Q11. External accounts and environment variables

**Read in code** (from `config.get`/`process.env` greps): `ADMIN_JWT_ACCESS_TTL_SECONDS`, `ADMIN_JWT_REFRESH_TTL_DAYS`, `ADMIN_JWT_SECRET`, `AUTH_RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_WINDOW_MS`, `COPPA_VERIFICATION_AMOUNT_CENTS`, `DATABASE_URL`, `DIRECT_URL` (schema datasource), `DOB_ENCRYPTION_KEY`, `EMAIL_PROVIDER_API_KEY`, `GUARDIAN_CONSENT_TOKEN_TTL_HOURS`, `GUARDIAN_CONSENT_WITHDRAWAL_TOKEN_TTL_HOURS`, `HIGHLIGHTLY_DAILY_REQUEST_BUDGET`, `JWT_ACCESS_TTL_SECONDS`, `JWT_REFRESH_TTL_DAYS`, `JWT_SECRET`, `PORT`, `POSTMARK_FROM_EMAIL`, `REDIS_URL`, `RESET_TOKEN_TTL_MINUTES`, `S3_ACCESS_KEY`, `S3_BUCKET`, `S3_ENDPOINT`, `S3_REGION`, `S3_SECRET_KEY`, `SENTRY_DSN`, `SPORTS_BOX_SCORE_LIVE_CACHE_TTL_SECONDS`, `SPORTS_DATA_API_KEY`, `SPORTS_DATA_BASE_URL`, `SPORTS_DATA_MAX_REFRESH_PAGES`, `SPORTS_DATA_PROVIDER`, `SPORTS_DATA_RAPIDAPI_HOST`, `SPORTS_{FINISHED,H2H,HIGHLIGHTS,LIVE,SCHEDULED,STANDINGS}_CACHE_TTL_SECONDS`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `WEB_APP_BASE_URL`. Web: `VITE_API_BASE_URL` (`apps/web/.env.example`). Admin: `VITE_API_BASE_URL` (read at `adminAuth.ts:11`, `adminClient.ts:16`; **no `apps/admin/.env.example`** exists).

| Account / service | Variables |
|---|---|
| Neon Postgres | `DATABASE_URL` (pooled), `DIRECT_URL` (unpooled, migrations) |
| Upstash Redis | `REDIS_URL` |
| Render (API hosting) | `PORT` (implicit) |
| Postmark | `EMAIL_PROVIDER_API_KEY`, `POSTMARK_FROM_EMAIL` |
| Sentry | `SENTRY_DSN` |
| Stripe (card verification) | `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `COPPA_VERIFICATION_AMOUNT_CENTS` |
| Cloudflare R2 / S3 | `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_ENDPOINT`, `S3_REGION` |
| Highlightly (sports data) | `SPORTS_DATA_API_KEY` (+ `SPORTS_DATA_BASE_URL`, `_RAPIDAPI_HOST`, `_PROVIDER`, `HIGHLIGHTLY_DAILY_REQUEST_BUDGET`, 6 cache TTLs, `SPORTS_DATA_MAX_REFRESH_PAGES`, `SPORTS_BOX_SCORE_LIVE_CACHE_TTL_SECONDS`) |
| Secrets (no external account) | `JWT_SECRET`, `ADMIN_JWT_SECRET`, `DOB_ENCRYPTION_KEY` |
| Frontends | `VITE_API_BASE_URL` (web + admin), `WEB_APP_BASE_URL` (API, for email links) |

**Mismatches.**
- In code but **absent from `render.yaml`** (22): `ADMIN_JWT_ACCESS_TTL_SECONDS`, `ADMIN_JWT_REFRESH_TTL_DAYS`, **`ADMIN_JWT_SECRET`**, `COPPA_VERIFICATION_AMOUNT_CENTS`, `GUARDIAN_CONSENT_WITHDRAWAL_TOKEN_TTL_HOURS`, `HIGHLIGHTLY_DAILY_REQUEST_BUDGET`, `PORT`, `S3_ENDPOINT`, `S3_REGION`, `SPORTS_BOX_SCORE_LIVE_CACHE_TTL_SECONDS`, `SPORTS_DATA_BASE_URL`, `SPORTS_DATA_MAX_REFRESH_PAGES`, `SPORTS_DATA_PROVIDER`, `SPORTS_DATA_RAPIDAPI_HOST`, `SPORTS_FINISHED_CACHE_TTL_SECONDS`, `SPORTS_H2H_CACHE_TTL_SECONDS`, `SPORTS_HIGHLIGHTS_CACHE_TTL_SECONDS`, `SPORTS_LIVE_CACHE_TTL_SECONDS`, `SPORTS_SCHEDULED_CACHE_TTL_SECONDS`, `SPORTS_STANDINGS_CACHE_TTL_SECONDS`, **`STRIPE_PUBLISHABLE_KEY`**, **`STRIPE_SECRET_KEY`**. `JwtModule` for admin is registered with `secret: config.get('ADMIN_JWT_SECRET')` (`admin-auth-foundation.module.ts:50`); whether the process fails at boot or only on admin login when it is unset was **not inspected**. `S3_ENDPOINT` is required for R2 (R2 has no default AWS endpoint).
- In `.env.example` but unread by the app code I scanned: none besides `DIRECT_URL` (used by Prisma `datasource`, not by `config.get`). Nothing in `render.yaml` is unread.
- `HELD_INVESTIGATION_ALERT_DAYS` is **not** an env var (constant at `account-deletion-sweep.service.ts:62`), contrary to CLAUDE.md.
- `render.yaml` defines only `soccernity-api-staging` and `soccernity-api`; no static-site/host definition for `apps/web` or `apps/admin` exists in `render.yaml`, `docs/deployment.md` or `.github/workflows` (only `WEB_APP_BASE_URL` guidance at `docs/deployment.md:105-107`). Where the frontends are hosted: **unknown**.

**Payment provider for card verification: Stripe** (`@stripe/react-stripe-js`, `@stripe/stripe-js` in `apps/web/package.json:14-15`; `stripe` in `services/api/package.json:35`; `src/payments/stripe-card-verification.gateway.ts`). Needed to go live: real `STRIPE_SECRET_KEY` + `STRIPE_PUBLISHABLE_KEY` (currently `"replace-me"`, `.env.example:197-198`); they must also be added to `render.yaml`; a Stripe account; an operational PCI SAQ-A step (CLAUDE.md flags it). Without keys every in-scope (US/unknown-country, under-13) guardian gets 503 and cannot be approved (`stripe-card-verification.gateway.ts:11,29,39`). Never run against live Stripe.

**R2/S3 status:** code is provider-agnostic AWS SDK v3 (`s3-storage.service.ts`); `.env.example` records R2 with `S3_ENDPOINT="https://<account>.r2.cloudflarestorage.com"` and `S3_REGION="auto"` but the active values are `replace-me` placeholders (`.env.example:170-189`). With placeholders `isConfigured=false` and upload returns 503 (`s3-storage.service.ts:48-60`). `S3_ENDPOINT`/`S3_REGION` missing from `render.yaml`. The Cloudflare account/bucket/token are a human action (CLAUDE.md #307) and are **unknown** whether they exist. Public URL caveat in CLAUDE.md (URL is the authenticated S3 endpoint, not publicly readable) was not re-verified.

### Q12. Email inventory

| Template | Trigger (caller) | Recipient | File |
|---|---|---|---|
| `verify-email` "Verify your Soccernity email" | `RegistrationService.register` (`registration.service.ts:212`) | the new user | `registration-email.service.ts:73-74` — body is a code, no link |
| `guardian-consent` "Consent requested for {minor}'s Soccernity account" | register (`:218`), resend, change-guardian-email, expiry sweep re-send (`guardian-consent.service.ts:263,395`) | guardian | `:91-92` — code only, no link |
| `guardian-consent-withdrawal-request` | `POST /auth/guardian-consent/withdraw/request` | guardian | `:115-116` — code only |
| `guardian-consent-declined` "Your Soccernity account was not approved" | decline (`guardian-consent.service.ts:694`) | **minor** | `:125-126` |
| `guardian-consent-withdrawn` | withdrawal (`:687`) | minor | `:137-138` |
| `guardian-consent-reminder` | expiry sweep first lapse (`guardian-consent-expiry-sweep.service.ts:181`) | minor | `:154-155` |
| `guardian-consent-expired` | expiry sweep second lapse (`guardian-consent.service.ts:691`) | minor | `:165-166` |
| `guardian-minor-turned-18` | age-reclassification sweep (`age-reclassification-sweep.service.ts:209`) | guardian | `:183-184` |
| `guardian-email-replaced` | change-guardian-email (`guardian-consent.service.ts:410`) | previous guardian | `:200-201` |
| `public-report-acknowledgement` "We received your report" | `POST /reports/public` (`moderation.service.ts:112`) | public reporter | `:228-229` |
| `report-actioned` | moderation action (`moderation.service.ts:289`) | reporter | `:252-253` |
| `appeal-decision` | appeal decided (`moderation.service.ts:313`) | appellant | `:273-274` |
| password reset "Reset your Soccernity password" | `POST /auth/forgot-password` | user | `password-reset/email/password-reset-email.service.ts:64` — the only email that builds a link (`WEB_APP_BASE_URL`, `:78`) |

**Email to the MINOR when a guardian approves: does not exist** (no template; `confirmConsent` sends nothing — grep for approve/confirmed templates returns none). Figma has the frame `Success email - guardian approved account` `5501:8584` (title head `5501:8582`). Also designed but with no template: account created/welcome `1380:2274`, admin account created `1661:2724`, other-roles account created `1661:2741`, password change requested `1380:2297`, password changed `1380:2318`, account deletion requested `5439:7074`. Delivery is "wired but inactive" unless a real `EMAIL_PROVIDER_API_KEY` is set (otherwise logged only, `registration-email.service.ts:60-66,283`); the other four registration-style emails also use the same inactive path.

### Q13. Change Guardian Email

- **Desktop** `5498:7164` fields: "Current guardian email" (read-only text), "New guardian email" input with helper "Double-check this. The approval link goes to this address and nowhere else.", notice "Sending a new email restarts approval from scratch" (account back to pending, current link stops working, fresh request to the new address), buttons "Send new request" and "Cancel". Top bar: logo bar.
- **Mobile** `5501:8536` (390×927): identical fields, notice and buttons (full-width stacked), 64px top bar. No differences in content from desktop other than layout.
- **Coded** `ChangeGuardianEmailPage.tsx` / `ChangeGuardianEmailDto`: adds **guardian name** and **relationship select** as required fields (`cge-name` L175, `cge-relationship` L207; DTO `change-guardian-email.dto.ts:17-27`), shows the current email, new-email input, restart notice and Send/Cancel. So the coded screen has two fields that **neither** frame has — the desktop frame also lacks them (confirmed by `get_design_context`), and so does the mobile frame. The belief that only the desktop frame lacks them is not correct: both lack them.
- Also: server refuses the minor's own email, a changed email while card charge is unrefunded, a confirmed/declined consent; per-minor cap of 5 changes / 24h (not in either frame).

### Q14. Anything else found

1. **Frame 6/Activation vs Restricted-pending copy references archived pages:** "Settings › Privacy & Safety" (`5114:6770`) — that frame was archived (DL #222); the Privacy page is "Settings — Privacy".
2. **Footer legal links dead although routes exist:** `Footer.tsx:54,74` renders Terms/Privacy/Contact as `<span>`; its comment (`:18-19`) says `/terms`/`/privacy` routes don't exist, but `router.tsx:381-382` defines both.
3. **Stale comment vs code in `LeaderboardPage.tsx:8-20`:** says Overall has no club filter / `displayName` rows, but code passes `clubId` (`:273,294`) and rows carry `publicName`.
4. **Web never refreshes tokens and never logs out server-side** (`POST /auth/refresh`, `/auth/logout` unused): the access token expires (`JWT_ACCESS_TTL_SECONDS`, default 900) and the page then fails with 401s; the stored refresh token is unused; "Log out" leaves the refresh token valid in Redis.
5. **`GuardianConsentPage` treats `declined` as pending** (only `confirmed` special-cased, `:179`).
6. **Admin "Add Role" is a stub though `POST /admin/staff` exists** (`RoleFormPages.tsx:58-70`; header comment `:18-22` still cites Decision Log #191 as the reason).
7. **Contest voting/entries/ranking** have 6 frames and no code or endpoint (`2072:5584`, `2094:994`, `5802:8655`, `5802:8726`, `5802:8978`, `5815:8916`).
8. **Create Profile / Edit Profile frames list Bio, Location, avatar and cover photo** — no columns (schema read).
9. **Figma Guardian Consent 2 has "Guardian's full name" (single input) — matches `Guardian.name` (single column); the code splits first/last and re-joins** (`RegisterStep.tsx:63`), and Change Guardian Email coded form uses a single `name`. CLAUDE.md PR #107 (DL #63) says the frame was collapsed to one field to match the column.
10. **GuardianConsentConfirmPage lists "Messages from unverified accounts — Only accounts they follow can start a direct message" (Figma `5113:6729`)**; `messaging.service.ts` contains no follow-based check (grep: only comments referencing `assertFollowGraphVisible`). Actual rules: under-16 blocked entirely; restricted-pending minors cannot send or be messaged; an adult cannot start a new thread with a minor (404).
11. **Email-delivery dependency of the expiry sweep** — see Q2 caveat.
12. **`GET /users/:id/public-profile` returns `guardianContact` to any viewer while no UI uses it**; guardian consent screen discloses it as visible (Q7).
13. **`ProfilePage.tsx` shows `profile.email`** under the name on the owner's own profile (self-only; noted because the Figma shows an `@handle` instead).
14. **Mobile Create Profile frame is 430px wide** (not 390); Blog/other mobile frames are 390 per DL #86.
15. **Hidden `Community Home Page Template` `1306:7149` and instance `1308:11643`** are `visible: false`.
16. **A top-level "Future Features" section banner exists (`6527:21127` text, `6527:21125` rectangle, 62,208px wide)**; which frames sit under it was not inspected, so it is unknown whether built features (e.g. Match Momentum/Live Commentary, which have code) are filed under that label.
17. **No `apps/admin/.env.example`**, although admin needs `VITE_API_BASE_URL`.

## 5. Contradicts prior claims

Each item gives the claim (verbatim from CLAUDE.md unless stated) and what was found.

1. **Claim:** "the guardian could confirm consent via a real emailed-link page" (CLAUDE.md, F5 bullet) and "Sprint 1's own exit criterion ('register, verify email, declare age, guardian-consent-gated access') is now fully walkable end to end by a real user, with all four steps real" (`sprint-1/f7-club-picker-code`). **Found:** the guardian email contains only "Your consent code is: <token>" with no URL (`registration-email.service.ts:324-328`, `470-475`) and nothing builds `/guardian-consent/confirm?token=`; the verify-email email is a bare code (`:322`, `:468-469`) though `/verify-email` only works from `?token=`; registration stores no session so the user must also log in separately. [signup-flow]
2. **Claim:** CLAUDE.md `sprint-2/club-picker-ui` describes the club picker as a post-account step that "uses the `accessToken` `RegisterResponse` already returns" and then continues to `/`, implying a logged-in user. **Found:** `RegisterStep.tsx:104-110` uses that token only in memory and navigates to `/` without persisting it, so the user lands logged out. [signup-flow]
3. **Claim:** Decision Log #63 / PR #107 — "GC2 guardian name collapsed from First/Last to one 'Guardian's full name' input (matches `Guardian.name` single column)". **Found:** the Figma is single-field, the code still has First/Last (`GuardianDetailsStep.tsx:39-40,49,106,114`). [country][signup-flow]
4. **Claim:** CLAUDE.md `sprint-1/guardian-consent-decline-web` — "success shows a 'decision recorded' state saying the account stays closed". **Found:** matches code; **contradicts Figma frame 9** (`5491:8241`) which offers the minor "Send a new approval request"/"Change your guardian's email" after a decline — impossible since decline sets `pending_deletion` and blocks login. [guardian-copy][signup-flow]
5. **Claim:** CLAUDE.md `safeguarding/guardian-contact-public-visibility` — "`guardianContact` … now shows for every current minor (not only under-16)" and legal draft ToS/Privacy "under-16's own profile card". **Found:** guardian screen says "under 18" and "Under-18 accounts cannot receive ordinary direct messages" (`GuardianConsentConfirmPage.tsx:98-104`) but only under-16s are blocked from DMs; legal draft says under-16; no UI renders the field. [guardian-copy]
6. **Claim:** CLAUDE.md `sprint-2/privacy-settings-to-code` / `Footer`: "Legal links … non-interactive: there are no /terms, /privacy or /contact routes yet (legal pages are unconverted, blocked on Decision Log #203)". **Found:** `/terms` and `/privacy` exist (`router.tsx:381-382`); links remain `<span>`s. Contact Us still has no route. [contact-us][other]
7. **Claim:** CLAUDE.md `sprint-2/legal-pages-navbar-retrofit` closes Decision Log #202 (Contact Us frames retrofitted). **Found (Figma only):** frames exist; no code implements Contact Us. [contact-us]
8. **Claim:** CLAUDE.md `sprint-2/decision-log-204-208-cleanup`, #208: footer links "wired to the correct new Legal page frame". **Found:** Figma prototype wiring only; the code footer has no links. [other]
9. **Claim:** CLAUDE.md `sprint-2/account-anonymization-followups` — "Default **90 days, tunable** (`HELD_INVESTIGATION_ALERT_DAYS`)". **Found:** constant `export const HELD_INVESTIGATION_ALERT_DAYS = 90` (`account-deletion-sweep.service.ts:62`), not an environment variable; only the `olderThanDays` query param varies it. [admin]
10. **Claim:** CLAUDE.md `sprint-2/admin-settings-roles-stub` — Add Role "remain disclosed stubs — per Decision Log #191", and DL #191 resolved by `feat/admin-staff-create` (PR #340). **Found:** `POST /admin/staff` exists; `AddRolePage` is still a stub (`RoleFormPages.tsx:58-70`). [admin]
11. **Claim:** CLAUDE.md `sprint-1/f5-f6-real-screens` — "Screen 5 'Restricted Pending' … Only Section 8.3 step 5's three named restrictions … are rendered". **Found:** the same page still renders "Add your position and photo. It stays private until approval." (`GuardianConsentPage.tsx:299`) which is not a restriction and is not backed. [guardian-copy]
12. **Claim:** CLAUDE.md Sprint 2 ("The Overall board… no club filter" in `LeaderboardPage.tsx` header comment) vs `feat/leaderboard-by-club-filter` (CLAUDE.md "now built"). **Found:** the page code has the club filter (`:273,294`); the header comment (`:8-20`) is stale. [other]
13. **Claim (legal draft, own text):** ToS §3.1 "before the account is created" vs §3.2 "the minor's account exists but is restricted" and Privacy §3 "A minor's account exists as soon as it is created" (`legal-copy-draft…md:186,189,557`); the code creates the account first. [guardian-copy]
14. **Claim (legal draft row 32 / CLAUDE.md PR #363):** row 32 still states "no public profile card exists" after the built label. **Found:** the endpoint exists with no consumer; the statement is true of the UI, contradicts the "Built" label. [guardian-copy]
15. **Claim:** CLAUDE.md `sprint-2/shared-footer-layout` — "Legal pages (Contact Us / ToS / Privacy Policy) have no React implementation yet". **Found:** ToS/Privacy exist now; only Contact Us is absent. [contact-us]
16. **Claim:** Figma frame 4 (`5113:6744`): "You can withdraw consent at any time by contacting us" vs code: withdrawal is a two-step self-service guardian flow (`/withdraw/request`, `/withdraw`) with no guardian-facing page. [guardian-copy]

## 6. Not inspected (and why)

- **Pixel/copy parity of all 196 "Built" frames** — only a code-path/endpoint check was done; copy was text-read for 10 frames only (listed under Method). Reason: ~342 frames; `get_design_context` on each was out of scope for a single audit pass.
- **Mobile layouts** — every mobile frame is mapped to its responsive route; no mobile screenshot comparison. Mobile twins of `5108:6628`/`6629`/`6630` (`5531:7626`, `5531:7461`) were not text-read except node `5531:7613`.
- **Figma frames `5108:6631` mobile `5531:7544`, `5539:7264`, `5539:7314`, `5539:7354`, `5488:7206` (frame 8), `5533:7264` (frame 12)** — copy not text-read.
- **`2896:4837` Trending topics only; `5542:7344`/`5542:7695` Leaderboard empty state; `5802:9183`/`5815:8948` Contest Between Weeks; `5803:8917` Bants No Results** — variant states not confirmed in code (status NotInspected).
- **Register frames `407:1051`, `1625:2333`** — field list not text-read for country (layer-name search only).
- **Whether `EMAIL_PROVIDER_API_KEY`, `STRIPE_*`, `S3_*`, `ADMIN_JWT_SECRET` are set in the real Render environments** — not visible from the repo.
- **Whether the process boots when `ADMIN_JWT_SECRET` is unset** — not run.
- **Where `apps/web` / `apps/admin` are hosted** — no host definition found.
- **Test suites** — not run in this audit (read-only; no verification of the claimed counts).
- **`docs/sprint-1-dpia-outline-draft.md` and all `.docx` files** — deliberately not read or touched.
- **Figma non-frame top-level nodes (122)** — counted only (symbols, banners, loose text); not mapped.
- **`services/api` endpoint behaviour beyond controller signatures/guards** — response shapes were read only where cited.
