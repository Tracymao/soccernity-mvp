# Sprint 2 — All-Sections Follow-up: Missing Screens, Mobile Parity & Field Accuracy

**Branch:** `sprint-2/all-sections-followup-mobile-field-audit`
**Agent:** figma-design-system (founder-authorised audit **and** build override for this pass — same category as PR #102 / PR #110, wider scope)
**Figma file:** `weZWWqggy9j13eX8bhFgs6`, page **Soccernity** (`0:1`)
**Date:** 2026-09-01

---

## 0. Method & honest scope statement

The brief is a full audit-and-build sweep of **all 20 sections** against three checks (missing
follow-up screens, missing mobile screens, field accuracy vs. Build Plan §3/§4 and the shipped
`services/api` DTOs). That is a multi-PR body of work. This pass:

1. **Audited all 20 sections structurally** — full top-level frame inventory of page `0:1`
   (349 nodes) cross-referenced against the flow each section implies and against the Build
   Plan data model / API contract / Decision Log (read in full).
2. **Built the highest-value, clearly-in-scope gaps** — Community (the *current* sprint) mobile
   parity, plus the one backend-contract-implied Auth flow-completion screen that was missing.
3. **Flagged everything else** as new Decision Log candidates (#131–#137) with the reason it
   was deferred rather than built — Sprint 4/5 sections not yet started, absent data models
   (Contest/Competition, Report/moderation), or work already earmarked in a prior PR as its
   own coordinated pass.

Field-accuracy checking was a **spot-check**, not exhaustive: prior passes (PR #100, #104,
#105, #107, #116, DL #58/#63) already reconciled Auth / Email / Guardian-Consent / Settings /
Leaderboard fields against the shipped backend, and those reconciliations were confirmed to
still hold. Sections that are deferred for building (Sports, Contest, Admin moderation) were
**not** deep-audited at field level — noted per section below.

**What was built (7 frames, all 0 unbound paints except inherited illustration tones):**

| Frame | Node ID | Section |
|---|---|---|
| Reset Password — Success desktop | `5776:8405` | Auth Pages |
| Reset Password — Success mobile | `5777:8479` | Auth Pages |
| Community — Post View — Mobile | `5779:8490` | Community (Mobile) |
| Community — Profile · Media — Mobile | `5778:8490` | Community (Mobile) |
| Community — Profile · Saved — Mobile | `5778:8567` | Community (Mobile) |
| Community — Search & Trending — Mobile | `5780:8581` | Community (Mobile) |
| Community — Inactive Account — Mobile | `5780:8679` | Community (Mobile) |

---

## 1. BLOG

**Audited:** Blog Page (`1009:128` / `41:4`), Articles Page (`54:434` / `87:80`), Contact Us
(`87:158` / `96:253` + Contact Dropdown `87:250`), Terms of Service (`102:340` / `104:393`),
Privacy Policy (`104:444` / `104:474`).

**Follow-up screens:** complete for the flow. Article list, article detail, the three static
legal pages and Contact all present.

**Mobile:** every desktop screen has a mobile counterpart. No gap.

**Field accuracy:** Contact Us is a name / email / message form — matches nothing in §3 (no
Contact entity) and §4.7 defines no contact endpoint; it is a static-send form, consistent
with how the Build Plan scopes "Contact Us" as a legal-baseline page, not a data feature. No
change.

**Nothing built. No new Decision Log candidate.**

---

## 2. SPORTS / LIVESCORES

**Audited:** Sports Page logged-in (`1009:673`) / logged-out (`205:2`), Match Details
(`632:943`), Match Statistics (`640:3737`), First Half Statistics (`667:151`), Second Half
Statistics (`667:1511`), Lineups (`667:1952`), H2H (`756:11`), Standing (`756:6433`), Video
(`760:11533`). Mobile: Sports/Livescores Logged Out (`5647:8023`) / Logged In (`5647:8169`)
only.

**Missing mobile — real gap:** the entire match centre has **no mobile screens** — Match
Details, Match Statistics, First/Second Half Statistics, Lineups, H2H, Standing, Video (7
desktop screens, 0 mobile).

**Not built this pass — deferred → Decision Log #133.** Sports Hub is **Sprint 4**, not yet
started; the sports-data vendor (Decision Log #6) is still open and blocks the section; and a
match-centre mobile set is a substantial coordinated pass (7 dense data screens) that belongs
with the Sprint 4 Sports build, not bolted on from a cross-cutting audit. Flagged, not
silently skipped.

**Field accuracy:** not deep-audited — `MatchData` (§3) is an externally-synced cache and
§4.6's eight endpoints are all reads; field shapes should be checked when Sprint 4 wires the
real vendor, not against placeholder data now.

---

## 3. ADMIN PANEL

**Hard constraint honoured:** no colour / token treatment touched anywhere in Admin Panel.

**Audited (screens vs. §4.8):** Dashboard (`GET /admin/dashboard/stats`), Articles + Create
Post (`POST/PATCH /admin/articles`), Categories + Add Category (`POST /admin/categories`),
Media + Upload 1/2 + Preview (`GET /admin/media`, `POST /admin/media/upload`), Users – team
members (`GET/PATCH /admin/users` — this frame is role management), Settings + Add/Edit/Delete
Role, Admin Profile, and the full Contest-admin family (Contest Task tab, scheduled tab,
Create/Schedule/Edit/Search/Delete Task, Empty State, Task Scheduled Success, Calendar), plus
Create Competition + Competition Created Success.

**Missing follow-up screens — real gap:** there is **no moderation-queue screen anywhere**.
§4.8 defines `GET /admin/moderation/reports` and `PATCH /admin/moderation/reports/:id`; §8.4
defines the full workflow (report → queue → admin action → notify reporter **and** reported
user → appeal routed to a *second* reviewer). None of it exists as a screen. The `Report`
entity (§3) has no admin review UI, no action UI, and no appeal UI.

Also missing: a genuine **user-management list/detail** screen for `GET/PATCH /admin/users`
(the "Users – team members" frame is admin-role management, a different thing), and an
**article-status / publish-workflow** view is thin (`status`, `published_at` on `Article`).

**Not built this pass — deferred → Decision Log #135.** Admin Console + moderation queue is
**Sprint 5**. New moderation screens are net-new design that needs founder input on the
appeal-routing model (§8.4 step 4 — "a second reviewer, not the same admin"), which is a
product/policy decision, not something to invent unilaterally. Admin Panel is also explicitly
desktop-only, so no mobile dimension here.

**Field accuracy:** Admin frames were structurally audited only, per the colour constraint's
spirit of minimal touching. The Create Competition form (`5566:8033`) still implies a
Competition data model that does not exist (Decision Log #73) — unchanged.

---

## 4. AUTH PAGES

**Audited:** Login (`407:844` / `1625:2303`), Register (`407:1051` / `1625:2333`), Forgot
Password (`409:1264` / `1625:2375`), Forgot Password — Link Sent (`5474:7077` / `5474:8375`),
Reset Password (`409:1463` / `1625:2404`), Create Profile (`1498:2303` / `1629:2449`), the
"Group 847" DOB date picker.

**Missing follow-up screen — built.** The password-reset flow is
`forgot-password → link-sent → (email) → reset-password form → SUCCESS`. Every step had a
screen **except the success state.** `POST /auth/reset-password`
(`services/api/src/modules/auth/password-reset/`) succeeds and — per
`PasswordResetService.resetPassword` — **revokes every other active session**. A user needs a
confirmation screen telling them the change landed and that they must log in again.

**Built:**
- **Reset Password — Success desktop** (`5776:8405`) — cloned from Reset Password desktop
  (`409:1463`) so the split-screen shell, navbar instance (`header 7`) and every token binding
  are inherited unchanged. Left panel: "Password updated" / body copy stating the change is
  done **and all other sessions have been signed out** (matches the real backend behaviour) /
  a single navy **"Continue to log in"** primary button (the two password inputs + field hint
  removed).
- **Reset Password — Success mobile** (`5777:8479`) — cloned from Reset Password mobile
  (`1625:2404`), same treatment, full-width button.

**Judgment calls (→ Decision Log #131):**
- The CTA routes to `/login` (Login page), not `/` — the app's `/` is still a
  `PlaceholderPage` stub; Login is the real, deliberate destination for a just-reset user.
- Copy explicitly names the session revocation. This is a design choice to set the
  expectation before the user hits a "why am I logged out?" moment — it mirrors how the
  Account-Deletion and Change-Password copy already disclose their side effects.
- Illustration skin/hair tones (`rgb(247,187,195)` etc., 12 paints) are carried over from the
  source frame's `undraw` goalkeeper — the **already-accepted** exception (PR #100, PR #104:
  "re-binding them would break the figure"), identical to every other Auth desktop frame. Not
  introduced here.

**Mobile:** every Auth screen now has a mobile counterpart (Reset Success mobile closes the
last gap). No remaining mobile gap.

**Field accuracy:** Register's DOB field (PR #100), Create Profile's username/avatar/bio/
location (Decision Log #58, resolved keep-and-back-with-real-columns), and Reset Password's
"Use at least 8 characters" hint (Decision Log #14) are all present and correct. No new
mismatch found. The social-sign-in buttons (PR #103) remain UI-only, correctly flagged.

---

## 5. EMAIL TEMPLATE

**Audited:** account created (`1380:2274`), password change requested (`1380:2297`), password
changed (`1380:2318`), password reset link (`5372:7272`), verify email (`5439:7053`), account
deletion requested (`5439:7074`), guardian approved (`5501:8584`), guardian declined
(`5501:8607`), admin account created (`1661:2724`), account created – other roles
(`1661:2741`), plus all matching title-head frames.

**Missing follow-up templates — real gap, not built → Decision Log #135:** §8.4 requires the
system to **notify both the reporter and the reported user** of a moderation outcome, and to
notify on an appeal decision. No moderation-outcome / appeal-decision email templates exist.
These pair with the missing Admin moderation-queue screens and belong to the same Sprint 5
work.

Also still carried forward (unchanged, per PR #100 §5 / PR #104): 5 of the existing templates
have **no wired backend send** (welcome, both password-change emails, both admin/mod emails) —
only the reset-password email maps to a real `services/api` send today.

**Mobile:** emails are single fluid-width frames (680px content column). Spot-checked — the
existing templates reflow acceptably; no per-email "mobile frame" needed and none should be
built (per the brief's email-specific rule). No fix required.

**Field accuracy:** verify-email body still renders a "verification code" placeholder while
the shipped `VerifyEmailPage.tsx` and `RegistrationEmailService` are link-based — already
flagged (Decision Log #56), unchanged.

---

## 6. CLUB PICKER

**Audited:** Loaded List (`5146:6635` / `5645:8023`), Club Joined (`5146:6648` / `5645:8082`),
Join Failed (`5146:6661` / `5645:8141`), No Clubs Match Filter (`5146:6674` / `5646:8023`),
Load More Loading (`5146:6687` / `5646:8044`), Which Club Do I Represent selector
(`5570:7813` / `5570:7887`).

**Follow-up screens:** desktop + mobile complete for every state.

**Field accuracy:** `RegisterDto.clubId` (`@IsUUID()`) is real backend capability but unused
by the web client (post-account `POST /clubs/:id/join` is used instead) — correct per
`sprint-2/club-picker-ui`. The represented-club selector's persistence is a parked backend
requirement (Decision Log #74 / #128). No screen change needed.

**One residual gap → Decision Log #137 (not resolved this pass):** the single
"No clubs match that filter" state still conflates *"the filter matched nothing"* with
*"there are no clubs in the catalogue at all"* (flagged since `sprint-1/f7-club-picker-code`).
A distinct "No clubs available yet" empty state would resolve it. Left as the conservative
single-state for now — it is a copy/one-frame change, low urgency, and worth doing in the same
pass that next opens the Club Picker frames rather than as a one-off here.

---

## 7. GUARDIAN CONSENT

**Audited:** screens 1, 1a, 2, 3 (email reference), 4, 5, 6, 7, 8, 9, 10, 11, 12 — **all
present desktop + mobile** (screen 3 is an email, no mobile frame needed), plus Design Notes
(`5116:6633`). This section has had the most prior investment (Sprint D, PR #104, #105, #107,
#108) and is the most complete in the file.

**Follow-up screens:** complete. Approve / decline / declined-minor-notice / resend / change-
guardian-email / link-unusable are all covered.

**Field accuracy (confirmed still correct):** guardian name is a single field (Decision Log
#63 → `Guardian.name`); relationship options are `Parent / Legal Guardian / Grandparent /
Other` (`GUARDIAN_RELATIONSHIPS`); consent-link lifetime copy reads "3 days" matching
`DEFAULT_CONSENT_TOKEN_TTL_HOURS = 72` (Decision Log #62, still provisional per DPIA R5);
GC4's "Request Summary" panel is annotated reference-only (no GET-by-consent-token endpoint).

**Backend still owes (unchanged, parked):** guardian decline endpoint (Decision Log #34),
change-guardian-email endpoint with the DL #60 restart behaviour, real sends for the two new
guardian emails.

**Nothing built. No new Decision Log candidate.**

---

## 8. EMAIL VERIFICATION

**Audited:** Verifying (`5143:6635` / `5531:7264`), Verified (`5143:6648` / `5531:7284`), Link
Invalid Or Expired (`5143:6661` / `5531:7356`), Missing Token (`5143:6674` / `5531:7412`),
Design Notes (`5150:6633`).

**Follow-up screens:** the four real states of `POST /auth/verify-email` all present, desktop
+ mobile.

**Still open (flagged in prior passes, unchanged):** no `POST /auth/resend-verification`
endpoint and no "resend verification" screen (Decision Log #37); no "minor verified but
consent still pending" variant of the Verified state (product decision). Both are
founder-blocked, not audit gaps — not built.

**Nothing built. No new Decision Log candidate.**

---

## 9. BANTS

**Audited (desktop):** All feed (`2256:6802`), My Bants (`2459:5234`), search filter
(`2459:7671`), search filter categories – All feed (`2459:10083`), search filter categories –
My Bants (`2459:12447`), search result (`2448:2179`), create topic (`2355:2137`), create topic
with attachment (`2256:8925`), post page with comments (`2256:11081`).
**Mobile:** All Feed (`5650:8074`), My Bants (`5650:8161`), Search Filter Categories
(`5650:8221`), Search Result (`5650:8314`), Create Topic (`5651:8166`), Create Topic with
Attachment (`5651:8207`), Post Page with Comments (`5651:8253`).

**Missing mobile:** the pre-categories "search filter" state and one of the two categories
variants have no mobile frame (7 of 9 desktop covered). **Missing follow-up screens:** no
empty states ("no bants yet", "no search results"), no join-a-room confirmation.

**Not built this pass — deferred → Decision Log #134 (grouped with Contest).** Banter Rooms is
**Sprint 3**; `/banter-rooms*` (§4.4) is entirely unbuilt backend; the section will need a
coordinated Sprint 3 pass anyway (Community Groups is a net-new sibling feature to design
alongside it). Two missing mobile variants + empty states are small but belong in that pass,
not this cross-cutting audit.

**Field accuracy:** not deep-audited — `BanterRoom` (§3) has `scope_type (club/league/country/
topic)`; the create-topic frames should be checked against that enum when Sprint 3 builds the
section.

---

## 10. MESSAGE  /  MESSAGE MOBILE

**Audited (desktop):** Conversation (`5706:8271`), Inbox – No Conversation Selected
(`5708:8184`), Empty Inbox – No Conversations (`5708:8362`), + Conversation Actions Menu
component (`5706:8270`). **Mobile:** Inbox – Chat List (`5709:8354`), Conversation
(`5709:8419`), Conversation (Actions Menu Open) (`5709:8461`), No Messages – Empty State
(`5648:8054`). (Legacy frames correctly archived per PR #116.)

**Missing follow-up screen — real gap → Decision Log #136 (not built this pass):** §4.7
defines `POST /conversations`, but there is **no "new conversation / pick a recipient"
screen** anywhere. The inbox screens assume conversations already exist; nothing designs the
act of *starting* one (recipient search or follow-list picker → first message).

**Not built this pass** — deliberately conservative: a recipient picker depends on an
unresolved choice between a `GET /search?q=` people-search and a follow-graph list, and DMs
are **Sprint 3**. Flagged rather than invented. Note: the restricted-pending rule (§8.3 step
5, "no DMs from unverified accounts") also needs a state here eventually (Decision Log #12).

**Mobile:** the states that exist have mobile counterparts. The gap is the missing
new-conversation flow on **both** platforms, not a desktop/mobile mismatch.

**Field accuracy:** `Message` (§3) — `content_text`, `media_url`, `read_at`. The conversation
frames' composer + read-receipt affordances match; no mismatch found in the built states.

---

## 11. CONTEST

**Audited (desktop):** contest details (`2155:1062`), content entries & ranking (`2072:5584`),
content voting (`2094:994`), Weekly Results Top 3 (`5528:7260`). **Mobile:** Weekly Results
Top 3 (`5545:7394`) only.

**Missing mobile — real gap:** contest details, entries & ranking, and voting pages have **no
mobile.** **Missing follow-up screens:** "already voted", "between weeks / voting closed",
"you won / you placed" states.

**Not built this pass — deferred → Decision Log #134.** This is **explicitly already flagged**
(PR #108: "the 3 legacy user-facing Contest frames' full mobile + phase-indicator work is …
the Contest section's own coordinated pass — they are 100% unbound legacy frames"). Those
three legacy frames need a light-token retrofit *first* (real regression risk from a
cross-cutting audit), and the Contest/Competition **data model does not exist** (backend
paused) — Decision Log #128–#130 unblocked the *scoring concept* for design but not the
schema. Building the full Contest user-facing section is a dedicated pass, correctly not
started here.

**Field accuracy:** the entries/ranking/voting frames imply a Competition entities +
entries + votes model that §3 does not contain (Decision Log #70–#73) — unchanged.

---

## 12. COMMUNITY  (desktop)

**Audited:** Post's comment section expanded (`949:73`), Community homepage w/ message sidebar
(`1306:354`), User's post feed (`1455:4362`), User's Media feed (`1455:6626`), User's Saved
Posts (`1460:8940`), Edit Profile (`1466:15934`), View post's page (`1620:20139`), Inactive
Account (`1662:2782`), Search page with trending topics (`2876:4628`), Trending topics only
(`2896:4837`), Community Home Page Template (`1306:7149`, hidden — populated, per Decision Log
#111).

**Follow-up screens (desktop):** the feed / single-post / profile / media / saved / edit /
search / inactive / comment-thread set is complete on desktop.

**Field accuracy:** `Post` (`content_text`, `media_urls[]`, `like_count`, `comment_count`),
`Comment` (`content_text`), `SavedPost`, `Follow` — the feed/post/profile frames match the
shipped Feed Service (PR #53/#54/#56). Edit Profile's disabled Bio/Location/DOB/Preferred-Club
fields are the established backend-pending convention (now Decision Log #58 — keep + real
columns owed). No new mismatch.

**Nothing built here** — desktop is covered; the gap was mobile (§13).

---

## 13. COMMUNITY (MOBILE)  — built

**Audited (existing mobile):** Home Feed (`5701:8239`), Home Feed – Nav Drawer Open
(`5703:8250`), Create Post (`5701:8328`), Profile (`5702:8250`), Edit Profile (`5702:8317`).
The PR #116 rebuild covered feed / composer / profile / edit / drawer.

**Missing mobile — real gap, and Community is the CURRENT sprint (Sprint 2), so this is
where check #2's mandate bites hardest.** No mobile for: single post view, the Media profile
tab, the Saved profile tab, search & trending, inactive account, the expanded comment thread.

**Built (5 frames, cloned from the real PR #116 mobile frames so navbar instances + every
token binding are inherited; 0 unbound paints):**

| Frame | ID | Source clone | Notes |
|---|---|---|---|
| Community — Post View — Mobile | `5779:8490` | Profile mobile (`5702:8250`) | Back app-bar "Post"; expanded post card; "Comments · 25" header + 2 comment rows (avatar disc + name + body, all bound tokens); pinned "Add a comment…" composer with a top border. Covers both `1620:20139` and `949:73`. |
| Community — Profile · Media — Mobile | `5778:8490` | Profile mobile | Tab underline moved to **Media** (active = `brand/green` underline + `text/primary`; others → `icon/inactive` + `text/secondary`); post list replaced with a 3-col wrapping media grid, 9 `brand/green-tint` tiles. |
| Community — Profile · Saved — Mobile | `5778:8567` | Profile mobile | Tab underline moved to **Saved**; two saved-post cards; save glyph re-bound to `brand/green` to show the saved state. |
| Community — Search & Trending — Mobile | `5780:8581` | Home Feed mobile (`5701:8239`) | Composer row replaced with a `brand/green-tint` search field + a For you / Trending / News chip row (For you active = `brand/navy` pill + `text/on-navy`); feed posts kept as results. |
| Community — Inactive Account — Mobile | `5780:8679` | Home Feed mobile | `header 4 — mobile` navbar; centred "Hello!" + body + **"Activate account"** (`brand/green`) and **"Delete account"** (outline, `icon/inactive` border) — mirrors desktop `1662:2782`. |

**Judgment calls (→ Decision Log #132):**
- **Media / Saved built as Profile tab *states*, not standalone routes** — the mobile Profile
  screen already renders the Posts/Media/Saved tab bar; the desktop treats them as separate
  frames (`1455:6626`, `1460:8940`) only because desktop has room for a full-page layout.
  Frontend can implement these as one route with a tab query param.
- **Search filter chips = For you / Trending / News** — mirrors the desktop
  `2876:4628` tab set minus "Bant" (Banter search is its own Sprint 3 surface). `GET /search`
  and `GET /trending` (§4.7) back this.
- **Inactive Account actions** — "Activate account" / "Delete account", matching the desktop
  frame and the shipped `POST /auth/reactivate-account` / `POST /auth/delete-account`. Both
  require password re-entry per the shipped backend — the mobile frame shows the entry point,
  not the confirm step (same pattern the desktop frame uses).
- **New comment rows / composer / grid** use only existing Soccernity Theme Light tokens
  (`brand/green-tint` 12%, `text/primary`, `text/secondary`, `surface`, `icon/inactive`,
  `brand/navy`, `brand/green`, `text/on-navy`). No `brand/green-tint-28` (Decision Log #47),
  no new colour.

**Still missing on Community mobile (deliberately not built — lower value / not current-flow
critical):** Nav Drawer variants beyond the one that exists, the "Community homepage with
message sidebar + chat pop-up" desktop composite (`1306:354`) has no mobile equivalent but it
is a desktop-only three-pane layout that collapses to the already-built Home Feed on mobile.

---

## 14. CREATE POST

**Audited (desktop):** Create a post (`2008:655`), For Contest (`2009:2913`), with attachment
(`2009:5168`), feeds w/ pinned contest post (`2496:4462`), feeds w/ normal pinned post
(`2565:3951`). **Mobile:** Community — Create Post — Mobile (`5701:8328`) covers the base
composer.

**Missing mobile:** the "with attachment" and "for contest" composer variants have no mobile
frame.

**Not built this pass** — low value: the base composer mobile exists and the attachment/
contest variants are additive states of the same component; a frontend build renders them as
one composer with conditional affordances. Noted, not a Decision Log candidate on its own.

**Field accuracy:** `Post.media_urls[]`, `club_page_id`, `banter_room_id` — the composer
variants match. `POST /posts` is gated by `GuardianConsentGuard` (Decision Log #21) — no UI
implication on the composer itself.

---

## 15. SETTINGS  /  SETTINGS (MOBILE)

**Audited:** 19 user-facing desktop Settings frames + ~19 mobile counterparts (PR #112, #116,
#119). This section has had four dedicated hygiene passes (PR #117, #118, #119 + the DL #110
audit). Structurally the most complete section after Guardian Consent.

**Follow-up screens:** complete. Overview, Security, Privacy, Notifications (all sub-types),
Display/Language, Account Info, Change Password, Deactivate — all present desktop + mobile.

**Field accuracy:** Account Information (Edit)'s Username + Country fields have no `User`
column (Decision Log #58 → keep, backend owes the columns). The Change Password screen matches
shipped `POST /auth/change-password`. Deactivate matches `POST /auth/deactivate-account`. No
new mismatch.

**Nothing built. No new Decision Log candidate** — the remaining Settings items (hidden-
scaffolding text-hygiene micro-pass, `brand/green-tint-28` file-wide cleanup per Decision Log
#47) are already tracked.

---

## 16. HOMEPAGE

**Audited:** Home Page Desktop — Premium Light (`5204:6728`, canonical per Decision Log #46) +
Home Page — Premium Light — Mobile (`5543:7407`).

**Follow-up screens:** the marketing homepage exists desktop + mobile. The open question of
whether `/` is the logged-out marketing page or the authenticated home feed
(Decision Log candidates from PR #97) is unchanged and unresolved — not an audit gap, a
product decision.

**Field accuracy:** Trending Topics and Today's Fixture are placeholder, blocked on Decision
Log #6 (no news/fixtures endpoint in §4). "Season record" hero card already removed (Decision
Log #75). No change.

**Nothing built. No new Decision Log candidate.**

---

## 17. COMPONENTS

**Exempt** per the brief (shared library, not user-facing pages). Not audited for
missing-screen / mobile. Noted only: the `Avatar` set (`5685:9241`), the four `Dropdown menu/*`
components, `Settings Toggle` (`5694:8219`), `Leaderboard Board Tabs` / `Rank Medal`, and the
navbar variant set (`2824:4309`) are the live component surface referenced by the frames built
this pass — all reused, none cloned as one-offs.

---

## 18. LEADERBOARD

**Audited:** base desktop (`5171:6633`) + mobile (`5540:7264`); empty states (`5542:7344` /
`5542:7695`); Board Tabs component (`5563:7573`); Rank Medal component (`5551:7420`); Contest
Tab weekly-fill progression Vacant/3/6/9 desktop (`5524:7188`, `5556:7426/7529/7632`) + mobile
(`5541:7304`, `5561:7483/7608/7733`); Contest Tab Live (`5524:7512` / `5541:7527`) + Crowned
(`5524:7836` / `5541:7750`); Competition Tab Prediction/Commentary desktop (`5564:7561/7832`) +
mobile (`5565:7623/7864`); Filter Matrix (`5543:7383`); Design Notes (`5534:7264`); Which Club
Do I Represent (`5570:7813` / `5570:7887`).

**Follow-up screens:** exhaustively covered by PR #107–#109. Overall / Contest (all 3 monthly
phases) / Competition (Prediction + Commentary) boards, empty states, medals, board tabs —
desktop + mobile.

**Now unblocked:** Decision Log #128 (club axis = `User.clubMemberships` + represented-club
selector), #129 (login required, no logged-out view), #130 (points = Contest/Competition
results + baseline engagement). No screen needs to *change* as a result — these confirm the
existing screens are a real data-driven feature, not a placeholder. Exact per-action point
weights remain a parked backend task and are correctly **not shown as a formula** anywhere in
the UI.

**Field accuracy:** the boards rank by a plain integer "points" field the schema does not yet
have (Decision Log #130 — parked backend). The Competition boards' middle metric column
(Accuracy vs. Votes) is competition-supplied, not hardcoded (Decision Log #72). No mismatch to
fix — the whole model is parked, consistently.

**Nothing built. No new Decision Log candidate** — the section is design-complete pending
backend.

---

## 19. NOTIFICATION CENTRE

**Audited:** Feed (Read + Unread) desktop (`5640:7815`) / mobile (`5643:8003`); Empty State
desktop (`5642:7898`) / mobile (`5642:7997`); Design Notes (`5644:8023`).

**Follow-up screens:** the three real states (populated read/unread, empty) exist desktop +
mobile. Only follow / like / comment row types are designed — the three the shipped backend
(PR #56) can produce (Decision Log #87). No mention/Banter/club row types invented.

**Field accuracy:** `Notification` (`type`, `payload_ref_id`, `read`) — rows match the shipped
`payloadRefId` convention (follower `userId` for `follow`; `postId` for `like`/`comment`).
`PATCH /notifications/:id/read` and `PATCH /notifications/read-all` (§4.7) are implied by the
read/unread distinction and a "mark all read" affordance — present. No mismatch.

**Nothing built. No new Decision Log candidate.**

---

## 20. Cross-cutting field-accuracy notes

- **`GET /auth/me`** — formally dropped (Decision Log #23). No screen references it. No action.
- **`User.username` / avatar / `bio` / `location`** — parked backend columns (Decision Log
  #58). Screens already show them (Create Profile, Edit Profile disabled fields). No new work.
- **Represented-club field** — parked backend (Decision Log #74 / #128). Selector screen
  exists. No new work.
- No screen in the file references a field or endpoint that is *demonstrably wrong* against
  the shipped `services/api` DTOs — the mismatches that exist are all **backend-owes-a-column**
  cases already logged, not **screen-shows-something-fake** cases.

---

## 21. New Decision Log candidates raised by this pass

Added to Build Plan §9 (Table 6) as rows **#131–#137**, continuing from #130.

| # | Subject | Disposition |
|---|---|---|
| 131 | Reset Password — Success screen (desktop + mobile) — flow-completion; CTA → `/login`; copy discloses session revocation | **Resolved (built)** |
| 132 | Community mobile parity — 5 new mobile screens; Media/Saved as Profile tab-states; search chips For you/Trending/News; Inactive Account mirrors desktop | **Resolved (built)** |
| 133 | Sports Hub match-centre mobile (7 screens) — missing | **Open — deferred to Sprint 4** (blocked with Decision Log #6) |
| 134 | Contest user-facing mobile + legacy light-token retrofit; Bants missing mobile variants + empty states | **Open — deferred to a dedicated Sprint 3 Contest/Bants pass** (already flagged PR #108; data model absent) |
| 135 | Admin moderation-queue screens + moderation-outcome / appeal-decision email templates (§4.8, §8.4) — none exist | **Open — deferred to Sprint 5**; needs founder input on the §8.4 appeal-routing model |
| 136 | Message "new conversation / recipient picker" screen (`POST /conversations`, §4.7) — none exists | **Open — deferred to Sprint 3**; recipient-picker source (search vs. follow-graph) unresolved |
| 137 | Club Picker — "no clubs match filter" vs "no clubs exist at all" still one conflated state | **Open — minor**; conservative single-state kept; resolve in the next pass that opens Club Picker |

---

## 22. Verification

- **7 frames built.** All new frames: **0 unbound paints** except Reset Password — Success
  desktop's 12 `undraw` goalkeeper skin/hair vectors, which are **inherited verbatim from the
  clone source** (`409:1463`) and are the already-accepted illustration exception present on
  every Auth desktop frame (PR #100 / #104).
- **0 `brand/green-tint-28`** in anything built (Decision Log #47).
- **0 new colours** — every authored paint bound to an existing Soccernity Theme Light
  variable (`VariableCollectionId:5096:2`).
- **No overlaps** — Community mobile row frames are 390px wide on a 500px pitch (110px gaps);
  Reset Success frames placed clear of the existing Auth cluster.
- **Admin Panel colour/token treatment: untouched** (hard constraint honoured — audited
  structure only).
- Screens visually verified via `get_screenshot` after each build step.
- **No application or backend code changed** — Figma + docs only.
