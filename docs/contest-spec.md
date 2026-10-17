# Contest and leaderboard points specification

Version: 2026-10-14, updated 2026-10-15 (Decision Log #393) and 2026-10-16 (Decision Log #394-#401, and #402 for the week-4 scope of the exposure settings). Docs only: no code, schema or Figma is changed by this file. Everything below is DECIDED, NOT BUILT, unless a section says otherwise. Follow-up 2026-10-16 (Decision Log #403): non-finalist tab visible, forfeit pop-up, final task text, Final-week carousel, Voting page design. Follow-up 2026-10-17 (Decision Log #404): pop-up reading, vote-toggle count, carousel impressions, final-week journey, pinned-entry lifecycle, day-1 Contest tab, Contest notifications (Section 14e).

## 1. Status and sources

Source: founder decisions, chat 9 (Aug 2026), chat 11 (Sept 2026), the session of 2026-10-14, the confirmations of 2026-10-15 and the decisions of 2026-10-15/16.

This file is the single source of truth for the Contest mechanic, the leaderboard points model and the engagement counting rules. It supersedes every earlier contest and leaderboard-points description where they conflict, including Decision Log #61, #70, #71, #130, #218, #219, #241, #242 and #243, `services/api/src/modules/contest/README.md`, `services/api/src/modules/points/README.md`, `services/api/src/modules/leaderboard/README.md`, and the per-PR status bullets in `CLAUDE.md`. Those documents are not rewritten; each carries a "Superseded by" / "Amended by" pointer (Decision Log #381-#392) or a banner.

Decision Log numbers used here (all in `docs/Soccernity_MVP_Build_Plan_v1.7.docx`, Section 9):

| Topic | Decision Log |
|---|---|
| Contest rebuild spec and correction of #218/#241 | #381 |
| Platform-wide engagement counting rule | #382 |
| Baseline leaderboard points | #383 |
| View-qualification rules | #384 |
| Placement points | #385 |
| Week-4 final mechanism | #386 |
| Weekly mechanics | #387 |
| Week-4 finalist exposure rule | #388 |
| Guardian decline cap | #389 |
| DOB correction tool and guardian re-trigger | #390 |
| EU hosting | #391 |
| Founder answers to build register Section 6, scope | #392 |
| Founder confirmations 2026-10-15 | #393 |
| Contest admin form: Title, week-4-only switch, final task text, locking, ranges | #399 |
| Calendar change (20:00 lock, 08:00 open), Between Weeks, hidden tab, final-week pinning, forfeit pop-up | #400 |
| Vote control is one toggle | #401 |
| Tolerance and per-viewer cap are week 4 only (founder-adopted default, veto-able) | #402 |
| Follow-up 2026-10-16: non-finalist tab stays visible, forfeit pop-up scope, final task text states, Final-week carousel, Voting page adopts Already Voted design | #403 |
| Follow-up 2026-10-17: forfeit pop-up reading, vote-toggle count, carousel impressions, final-week journey, pin lifecycle, day-1 Contest tab, Contest notifications | #404 |
| Sign-up, decline, block, 2FA, admin moderation (not contest; see Section 14c) | #394-#398 |

## 2. Boundary: Contest vs Competition

Contest and Competition are two separate features that share the leaderboard.

- **Contest** is the weekly video-skill challenge with its own fixed mechanic, described in this file.
- **Competition** is the admin-configured umbrella: Prediction (accuracy-scored), Commentary (community-voted) and custom types, created through Create Competition (Decision Log #72/#73).

Competition rules in this file apply only where a section says so (sections 9a, 9d). Competition and Create Competition are now IN SCOPE for launch (Decision Log #392 item 1); they were previously deferred by Build Plan 2.2.

## 3. Correction: contests are not admin-judged, and there is no "Level 1 / Level 2"

1. The admin-judged contest backend (Decision Log #218 and #241: `POST /admin/contest/cycles/:id/rounds/:week/results`, enforced sequential judging, admin "crown" endpoint) was never the founder's design. **Contests are NOT admin-judged.** That behaviour is to be replaced, not preserved. Winners are determined by the engagement and voting rules below.
2. There is NO "Level 1 / Level 2". The month has weeks 1-3 and the final (week 4). The words "Level 1", "Level-1" and "LEVEL 1 FINAL" are retired. The Figma frame names that still carry them (`5524:7512`, `5541:7527`) are to be renamed in the Figma pass (build register B-096).
3. The admin console screens built on the judged model (Decision Log #242/#243: Judge Week, Open the Final, Crown Winners; `apps/admin` `ContestJudgeWeekPage`, `ContestCrownWinnersPage`, `ContestOpenFinalPage`) are superseded by the admin Contest tab redesign in section 4.

**Remaining "Level 1" / "Level-1" occurrences in the repo** (checked 2026-10-14):

- Contest-related, in files this PR does not edit (historical per-PR reports, left as written; superseded by this section): `docs/sprint-2-contest-posting-flow-to-code-report.md:94`, `docs/sprint-2-desktop-icon-nav-and-header-fix-report.md:32`, `docs/sprint-2-leaderboard-competition-split-admin-homepage-report.md:53,83,260`, `docs/sprint-2-leaderboard-footer-removal-and-contest-rules-modal-report.md:33,36`, `docs/sprint-2-mobile-leaderboard-homepage-contest-audit-report.md:53,136,137,152`, `docs/sprint-2-retrofit-screen-build-guardian-email-home-contest-report.md:23,152,185,199,209`.
- Contest-related, in files this PR edits: the literal Figma frame names `5524:7512` and `5541:7527` are quoted in `docs/mvp-coverage-audit.md:253,271` (a frame-name column; not altered, annotated), `services/api/src/modules/contest/README.md:69` (superseded by banner), and `CLAUDE.md` historical bullets (reworded in this PR; the literal Figma names are quoted once with a "retired" note).
- NOT contest-related, correct as they are: "Level 1 / Level 2" in `docs/sprint-4-sports-hub-*.md` and in `CLAUDE.md`'s Sports Hub bullets refer to the Match Centre tab hierarchy (Level 1: Match / H2H / Standings / Video; Level 2: Summary / Statistics / ...). Unrelated to the contest; unchanged.

## 4. Admin creation (Admin > Contest tab, to be redesigned)

Each contest is created from the admin panel. The admin Contest tab is redesigned (build register B-095, B-097) to hold:

- A required contest TITLE (e.g. "November Challenge"), maximum 80 characters. The contest name is NOT auto-generated (Decision Log #399, E1).
- A contest DESCRIPTION (not only current-cycle history). The contest details page "task for this week" is populated from this tab.
- The mechanism for the week, stated by the admin inside the task as FREE TEXT. There is no option list.
- Required per contest:
  - (a) **Minimum tally**: x points a finalist needs to be considered for the final top 3. Admin-set at creation, no hardcoded default; a contest cannot be created without it.
  - (b) **Placement points** for 1st / 2nd / 3rd, weekly and monthly (defaults in section 9d).
  - (c) **Per-week view-qualifying watch limit**, in seconds, for video entries (section 9c). Allowed range 3-120 seconds (#399, E5). The founder said the limit is "always communicated in the contest description". Because the system must enforce it, it is recorded as a required structured numeric field in addition to the description text. **ASSUMED interpretation** (open item b). **CONFIRMED 2026-10-15 (Decision Log #393): required structured numeric field on the admin form.**
- The "followers-excluded counting" switch applies to WEEK 4 ONLY (section 10). It is NOT available for weeks 1-3 (Decision Log #399, E2). This resolves the earlier contradiction between this section ("per-week") and section 10 ("for that week only") in favour of section 10.
- The final (week 4) HAS task text. It is displayed at the BOTTOM of the leaderboard page; there is no other dedicated page for the final (#399, E3).
- Week-4 exposure settings (section 10b): tolerance, allowed range 1-50 percent; per-viewer daily cap, allowed range 1-50 (#399, E5). These two settings belong to WEEK 4 ONLY (the exposure rule of #388 runs only on the final): they are not per contest and not per week, and weeks 1-3 do not have them. Founder-adopted default, veto-able (Decision Log #402, item 6). The ranges stay as the validation bounds of the week-4 settings.

### 4a. Editable after launch (Decision Log #399, E4)

- BEFORE launch everything is editable except dates.
- Once week 1 starts, LOCKED: placement points, the minimum tally, and the watch limit, followers switch, tolerance and per-viewer cap of any week that has started. [Tolerance and the per-viewer cap are week-4 settings (#402), so they lock when week 4 starts (day 22), not when week 1 starts; until then they stay editable. The watch limit is unaffected.]
- Still editable after launch: the description, and the task text of weeks that have not started.
- Dates are never editable.
- RESOLVED 2026-10-16 (Decision Log #402, founder-adopted default, veto-able): tolerance and per-viewer cap belong to week 4 ONLY. Earlier text, kept: "OPEN (not stated): whether tolerance and per-viewer cap are per contest or belong to week 4 only (#388 attaches them to the week-4 exposure rule)."

## 5. Calendar (fixed, Europe/London time)

| Period | Days of the calendar month | Notes |
|---|---|---|
| Week 1 | 1-7 | Opens 08:00:00 on day 1. Phase 1 = from opening to the end of day 4, Phase 2 = days 5-7. Votes lock 20:00:00 on day 7 |
| Week 2 | 8-14 | Opens 08:00:00 on day 8. Phase 1 = from opening to the end of day 11, Phase 2 = days 12-14. Votes lock 20:00:00 on day 14 |
| Week 3 | 15-21 | Opens 08:00:00 on day 15. Phase 1 = from opening to the end of day 18, Phase 2 = days 19-21. Votes lock 20:00:00 on day 21 |
| Week 4 (final) | 22 to month end | Opens 08:00:00 on day 22. Days 22-24: finalist upload window, deadline 23:59:59 on day 24 (unchanged). 00:00 on day 25: REVEAL. Day 25 to month end: engagement window |

**Calendar change 2026-10-16 (Decision Log #400, E6; SUPERSEDES the 23:59:59 vote lock of Decision Log #393 for the lock time only).** Votes lock at 20:00:00 on days 7, 14 and 21. The next week opens at 08:00:00 on days 8, 15 and 22. Week 1 also opens at 08:00:00 on day 1. Phase 1 still ends at the end of day 4, so entry windows are 8 hours shorter (founder's wording: "weeks 2-4 get 8 fewer hours of entries"; the 08:00 opening also shortens week 1 against a midnight start). At 20:00 the tally freezes and the weekly result is calculated. The week-4 upload deadline stays 23:59:59 on day 24.

**Between Weeks (Decision Log #400, E7): KEPT.** From the lock at 20:00 to the next opening at 08:00 is 12 hours (20:00 to 08:00 on days 7-8, 14-15 and 21-22). The state shows the week's result and when the next week opens. W0 Figma pass E's Between Weeks frames are kept (5802:9183, 5815:8948).

OPEN (not decided): what the Contest tab shows between the end of one month and 08:00:00 on day 1 of the next (00:00 to 08:00 on day 1).

Consequence, accepted by the founder as a result of the fixed calendar: the engagement window is 4 days in a 28-day February (days 25-28) and up to 7 days in a 31-day month (days 25-31).

All boundaries are evaluated in Europe/London time, including across the BST/GMT change.

## 6. Entry

- Entry is via Create Post > Contest tab. One entry per user per week (the 1/0 counter in the design).
- An entry is auto-pinned to the top of the entrant's feed with a "Contest" label.
- One fixed challenge per week for everyone.
- Minors can enter. Past winners can re-enter and win again in future months (no sit-out).
- Restricted-pending accounts cannot enter (uniform write block, Decision Log #370).
- OBSERVATION (recorded, no change made): Phase 1 ranks by engagement at the end of day 4, so an entry posted on day 1 has more time to earn engagement than one posted on day 4. The founder's design stands unless she asks for an entry cutoff.
- ASSUMED (open item h): weekly entries are accepted during Phase 1 (days 1-4) only, because Phase 1 ranking closes at the end of day 4. The founder did not state an entry deadline for weeks 1-3. **CONFIRMED 2026-10-15 (#393): entries are accepted in Phase 1 (days 1-4) only.** Since 2026-10-16 (#400) Phase 1 starts at the week's opening (08:00:00 on its first day), not at 00:00.

## 7. Phase 1 (days 1-4 of each of weeks 1-3)

- Entries are ranked by engagement = views + likes + comments, counted under the platform engagement rule (section 9a) and the contest view-qualification rule (section 9c).
- The top 10 qualify for Phase 2.
- If there are fewer than 10 entries, everyone qualifies.
- If there are fewer than 3 entries, the week is FORFEITED: the leaderboard shows "Forfeited" for that week's 3 slots and no placement points are awarded. The reason is SHOWN to users, and the forfeit is announced as a POP-UP (Decision Log #400, E11). **[2026-10-16, #403 item 9 (amends #400 E11): the pop-up is shown ONLY on the Contest page, on every load of that page, one pop-up per forfeited week from when the week is deemed forfeited; the reason is shown; nothing is remembered between loads. The leaderboard Contest tab shows the forfeited writing in place of the three names for that week and shows no pop-up.]**
- Tie at the 10th place cutoff: **CONFIRMED 2026-10-15 (#393): exactly ONE user qualifies as 10th. Tie-breaker = whoever reached the tied qualifying-engagement total earliest, by timestamp of the engagement that brought their tally to that total, from the log of qualifying engagement (removed engagement excluded). If still identical, the earlier entry submission wins.**

## 8. Phase 2 (days 5-7)

- VOTES ALONE decide the top 3. Phase 1 engagement only decides who reaches the top 10.
- One vote per user per round. Entrants have one vote too and MAY vote for themselves.
- A vote can be changed or retracted. Retracting returns the user to the Voting page; voting again returns them to the Already Voted page. **[2026-10-16, #403 item 7: the Voting <-> Already Voted navigation described here goes away - the Voting page adopts the Already Voted design (entries column + board column, fan cards) with the vote toggle, and the separate Already Voted screens are archived afterwards.]**
- **The vote control is ONE button with two states (vote / un-vote): click to vote, click again to un-vote (Decision Log #401, E9).** There is NO separate "Change vote" control; changing a vote = un-voting, then voting for another entrant. A retracted vote reduces the entrant's tally. A restricted account cannot perform ANY function, including voting, so NO restricted Voting state is drawn. OPEN (not stated): whether the Already Voted page and the page navigation above remain now that the control is a toggle. **[2026-10-16, #403 item 7: the OPEN point is closed - the Already Voted page does not remain as a separate screen; its design moves to the Voting page.]**
- Minors can vote even if they are not entrants.
- ACCOUNTS WITH RESTRICTIONS CANNOT VOTE (founder confirmed; consistent with the restricted-pending write block, Decision Log #370).
- Tie-break: earliest vote reached. The entrant whose tally first reached the tied number ranks higher, computed from the current non-retracted vote log by timestamp. **INTERPRETATION** (open item a), for founder confirmation. **CONFIRMED 2026-10-15 (#393)** (previously an interpretation).
- ASSUMED (open item h): votes lock at 23:59:59 on day 7; weekly winners are confirmed at that point. **CONFIRMED 2026-10-15 (#393): votes lock at 23:59:59 on day 7 and winners are confirmed then.** **SUPERSEDED 2026-10-16 by Decision Log #400 (E6), for the lock time only: votes lock at 20:00:00 on days 7, 14 and 21; the tally freezes and the weekly result is calculated at that moment; the next week opens at 08:00:00 on days 8, 15 and 22.**

## 9. Leaderboard points and engagement counting

### 9a. Platform-wide engagement counting rule (Decision Log #382)

Applies to EVERY engagement-based contest, challenge or competition and to every user (including contestants and minors).

- Only VIEWS, LIKES and COMMENTS earn points. FOLLOWS AND POSTS EARN NO POINTS IN ANY CIRCUMSTANCE.
- Per account per item: 1 for a qualifying view (only where views are counted), 1 for a like, 1 for a comment, regardless of how many views, likes or comments that account makes (ten comments = 1).
- There is NO flat cap of 2. The signals available depend on the contest: Phase 1 = views + likes + comments (up to 3 per account per entry); the final = likes + comments (up to 2).
- In contest and competition tallies SELF-ENGAGEMENT COUNTS.
- Accounts with restrictions never count. Accounts without a verified email never count.
- A comment counts only if it passes the existing content screening.
- Non-engagement-based competition types (Prediction accuracy-scored, Commentary community-voted) are unaffected.

### 9b. Baseline leaderboard points (Decision Log #383; AMENDS #130)

Everyday engagement, outside any contest.

- The account that GIVES the engagement earns FULL points: 1 per qualifying view / like / comment per unique post.
- The creator who RECEIVES it earns one QUARTER point (0.25) per qualifying view / like / comment per unique account per post.
- Founder's rationale: "it is more profitable to give than to receive", to encourage engagement.
- The 0.25 rule applies ONLY to baseline leaderboard points and never affects contest or competition tallies.
- SELF-ENGAGEMENT IS EXEMPT from baseline points (a user's own views / likes / comments on their own content earn nothing).
- Points are REVOKED when the engagement is removed (unlike, comment deleted or removed, post removed, account later restricted). Revocation also reduces that day's cap counter (ASSUMED detail, open item d). **CONFIRMED 2026-10-15 (#393): revoking a point also reduces that day's cap counter; a removed-then-restored engagement earns its point once.**
- Storage and display: points are stored internally in quarter-point units (1 point = 4 units) and DISPLAYED rounded to the nearest whole number (half rounds up). RANKING uses the exact stored value, so rounding never creates false ties.
- DAILY CAPS (founder confirmed 2026-10-14; admin-configurable settings, not hardcoded; Europe/London calendar day): **40 points per day earned for GIVING and 20 points per day earned for RECEIVING** (about 1,800 per month maximum from baseline). Revisit after two weeks of live data.
- A verified email is required; restricted accounts never earn. Same rules for minors.
- A comment earns points only if it passes the existing content screening.

### 9c. View-qualification rules (Decision Log #384)

A "view" counted for display is distinct from a "view POINT". Points are awarded only when the thresholds are met; one view point per account per post.

**Baseline**

| Content | Qualifies after |
|---|---|
| Photo | at least 3 seconds on screen |
| Video | the full length if shorter than 60 seconds, otherwise 60 seconds watched |
| Text-only post | at least 3 seconds visible |

"Watched" means active playback while the post is visible and the tab or app is in the foreground. Muted autoplay in the feed counts. Skipping ahead earns no credit. A loop counts once. The creator's 0.25 for a view uses the same qualification as the viewer's.

**Contest and competition tallies** (views counted for the contestant)

- Video: the viewer must watch min(video length, the contest's weekly view-qualifying limit L in seconds). A video shorter than L must be watched completely; a video longer than L qualifies after L seconds.
- Photo: at least 5 seconds on the image.
- Views are not counted in the week-4 final.

### 9d. Placement points (Decision Log #385; AMENDS #130 and #219)

Leaderboard points as a PRIZE for winning. The founder confirmed winners earn leaderboard points and approved these defaults. The admin sets points for 1st / 2nd / 3rd when creating each contest or competition.

| Occasion | 1st | 2nd | 3rd |
|---|---:|---:|---:|
| Weekly contest | 500 | 300 | 150 |
| Monthly final | 2,000 | 1,200 | 600 |
| Prediction, Commentary and other competitions | 500 | 300 | 150 (**CONFIRMED 2026-10-15, #393**: other competitions default to the weekly figures; admins can override per contest/competition at creation) |

- Weekly placement points are awarded when that week's winners are confirmed. Monthly final points are awarded on crowning.
- Forfeited weeks and "No winner this month" award nothing.
- Points accrue to the user's represented club and to the time period in which they are awarded (Decision Log #128/#130).
- This SUPERSEDES the "conversion formula parked for backend" part of #130 for contests, and the 50/30/20 and 250/150/100 weights of #219.

### 9e. Terminology

The "minimum tally" (section 10) is an entry bar for the final top 3. "Placement points" are the leaderboard prize. They are different things.

## 10. Week 4 final (Decision Log #386)

- Only the finalists (the weekly winners, about 9: a dynamic count; fewer if weeks were forfeited; none means no final, and the leaderboard states so) get access to the Create Post > Contest tab portal, and only during the upload window (opens 08:00:00 on day 22; days 22-24; deadline 23:59:59 on day 24, unchanged by #400).
- Each finalist uploads a NEW video. The server flags it as a final entry (no hashtag parsing).
- FINALIST VIDEOS ARE HIDDEN from everyone except their owner until the reveal at 00:00 on day 25 (founder confirmed). Only engagement made after the reveal counts. The leaderboard shows live ranking from the reveal.
- The leaderboard ranks only flagged final entries.
- Ranking = likes + comments under the platform rule. Views are NOT counted in the final. Self-engagement counts in contest tallies.
- A finalist who does not upload by the deadline scores 0, falls below the minimum tally and cannot place. The portal closes at the deadline.
- MINIMUM TALLY: a finalist needs at least x points to be considered for the top 3. If nobody reaches x, there is NO WINNER for that month and the leaderboard shows a "No winner this month" state.
- Tie-break: total points, then comments, then earliest upload.
- FOLLOWER-BIAS HYBRID: by default all community engagement counts. An admin switch applies "followers-excluded counting" (only engagement from accounts that do not follow the finalist) for that week only; the switch exists for week 4 ONLY and is not available in weeks 1-3 (#399, E2). Follow status is FROZEN at the moment an account engages, so later follows never change the count. Self-engagement counts in BOTH modes (founder confirmed: nobody follows themselves).

- **Hidden tab (Decision Log #400, E8):** during days 22-24 the Contest tab is HIDDEN for a non-finalist; other users cannot see that a finalist has uploaded before the reveal. The minimum tally x is ADMIN-ONLY and is never shown to users, including on "No winner this month". **[2026-10-16, #403 item 1 (AMENDS #400 E8): the Contest tab is NOT hidden for a non-finalist. It stays visible, and a non-finalist who opens it during days 22-24 sees the existing 'Closed (not a finalist)' frames (6660:31044 / 6660:35699), which are restored. The minimum tally stays admin-only. OPEN: whether the closed copy may reveal anything about uploads before the reveal.]**
- **Final-week entries are not on the Contest page (Decision Log #400, E10).** Week 4 has no active Contest page. Finalist entries are pinned on the finalist's own profile feed with the contest label (the Phase 1 pattern). Before the reveal ALL engagement on them is locked: buttons disabled, counts hidden, nothing recorded. Impression counts are never shown to users. **[2026-10-16, #403 item 11: the Community-feed 'Final week' module STAYS - see section 10b.]**
- The final has task text, shown at the BOTTOM of the leaderboard page (#399, E3). **[2026-10-16, #403 item 10: the task text shows on the live-ranking and uploading states only, not on 'No winner this month' or the crowned state.]**

### 10b. Week-4 finalist exposure rule (Decision Log #388)

**AMENDED 2026-10-16 (Decision Log #400, E10).** The founder decided that the final week's entries do NOT appear on the Contest page. This displaces the Contest-page listing in "Placement" and the Contest-page copy in "Transparency" below, and W0 Figma pass E's "Final-week showcase" frames on the Contest page are to be archived. Impression counts are never shown to users (the admin impression view stays). NOT ADDRESSED by the founder, so left as written and OPEN: whether the Community-feed "Final week" module and the balanced-impression rotation remain, and how other users reach a finalist's entry after the reveal. **[2026-10-16, #403 item 11: the OPEN point 'whether the Community-feed Final week module remains' is answered - it STAYS. The dead 'View on the Contest page' link is removed. Its videos become a carousel that keeps the current frame size and serves as a preview slot reusable for other showcases later; it shows only during a final contest week and not at all when there is none. The balanced-impression rotation is not restated by the founder and stays as written below. OPEN: whether carousel views count as impressions (B-092); how other users reach a finalist's entry after the reveal.]**

**Provenance: FOUNDER-DELEGATED DESIGN.** The founder asked for "a reasonable and moderate, non-biased" flow. Drafted by Claude 2026-10-14. The founder APPROVED the proposal and parameters on 2026-10-14.

Goal: every finalist gets comparable community exposure, independent of follower count, prior engagement or upload time.

- **Audience**: all logged-in accounts that are not restricted (minors included, under the normal minor-safe feed rules).
- **Placement**: a "Final week" showcase module pinned in the Community feed and listed on the Contest page [Contest-page listing displaced by #400, E10], live from the reveal, identical for every eligible viewer.
- **Ordering**: NEVER by engagement, live leaderboard rank, follower count or recency. A per-viewer shuffle seeded per viewer per day (stable within a session).
- **Balanced-impression rotation**: impressions are tracked per finalist video (an impression = the card rendered in the viewport) and the video with the FEWEST impressions is served next, keeping counts within a tolerance of each other.
- **Frequency cap**: any one viewer sees a given finalist video at most N times per day.
- **Confirmed parameters** (admin-configurable settings, WEEK 4 ONLY, #402): tolerance = within 10% of the mean impressions across live finalist videos; N = 3 per viewer per day.
- Followers get no extra push in the module.
- **Transparency**: Contest page copy tells viewers every finalist is shown to everyone equally [Contest-page copy displaced by #400, E10]. An admin view shows the impression distribution per finalist and flags any video outside the tolerance.
- Unchanged by the followers-excluded switch.
- Fewer than 9 finalists: same rule over those that exist.

## 11. Weekly leaderboard fill (Decision Log #387; supersedes the single static empty state of PR #108)

- The Contest tab is vacant ONLY during week 1 Phase 1. (OPEN, #400: what shows from 00:00 to 08:00 on day 1, before week 1 opens.)
- 3 winners after week 1, 6 after week 2, 9 after week 3 (dynamic count).
- Forfeited weeks read "Forfeited"; the reason is shown and the forfeit is announced as a pop-up (#400, E11). **[2026-10-16, #403 item 9: the pop-up appears on the Contest page only (every load, one per forfeited week, reason shown, not remembered); this tab shows the forfeited writing in place of the three names, with no pop-up.]**
- Between a week's lock (20:00) and the next opening (08:00) the Between Weeks state (section 5) shows the week's result and when the next week opens.
- Week 4: finalists listed during the upload window (days 22-24, "uploading" state), live ranking from the reveal; then crowned top 3 with medals (or "No winner this month"). **[2026-10-16, #403 item 10: the final task text is shown on the uploading and live-ranking states only.]**

## 12. Screens and states map

Existing frames:

| Screen | Desktop | Mobile |
|---|---|---|
| Contest Details | 2155:1062 | 5801:8635 |
| Entries | 2072:5584 | 5802:8655 |
| Voting | 2094:994 | 5802:8726 |
| Already Voted | 5802:8978 | 5815:8916 |
| Between Weeks | 5802:9183 | 5815:8948 |
| Contest Design Notes | 5534:7264 | - |
| Leaderboard Contest tab frames | per Decision Log #61/#70/#71 | per #61/#70/#71 |

NEW frames or states required. **None are designed yet; each is Missing.**

| New frame or state | Build register |
|---|---|
| Weekly "Forfeited" slot state | B-096 |
| "No winner this month" state | B-096 |
| Week-4 "uploading" state before the reveal | B-096 |
| Finalist-only Create Post > Contest tab for the upload window, plus the closed state for non-finalists and after the deadline | B-096 |
| "Final week" showcase module (feed and Contest page) with its explanatory copy | B-096 |
| Retract-vote interaction | B-096 |
| Contest-vs-leaderboard handoffs | B-096 |
| Admin Contest tab redesign (description, weekly task with free-text mechanism, minimum tally, placement points, view-qualifying limit, followers-excluded switch) | B-095 |
| Admin impression-distribution view | B-095 |
| Rename of "Level 1 Final" frames | B-096 |

Re-sync work added 2026-10-16 (Decision Log #399-#401; all carried by build register B-107):

| Change | Decision |
|---|---|
| Create Contest: required Title field (max 80), followers-excluded switch for week 4 only, final-week task text | #399 (E1-E3) |
| Between Weeks content: result of the week and when the next week opens (kept, not dropped) | #400 (E6, E7) |
| Non-finalist Contest tab during days 22-24: HIDDEN (replaces the "closed for non-finalists" frames); minimum tally not shown on "No winner this month" | #400 (E8) |
| Archive the "Final-week showcase" frames on the Contest page; add the pinned final entry on the finalist's profile feed with locked engagement | #400 (E10) |
| Forfeit pop-up with the reason | #400 (E11) |
| Vote button with two states (replaces the separate "Retract vote" button) | #401 (E9) |

Re-sync work added 2026-10-16 (Decision Log #403; carried by build register B-113, with B-107 reversed where noted):

| Change | Decision |
|---|---|
| Non-finalist Contest tab: the 'Closed (not a finalist)' frames 6660:31044 / 6660:35699 are RESTORED (un-archived); this REVERSES the 'hidden tab replacing the closed-state frames' item above | #403 (item 1) |
| Voting page (2094:994 / 5802:8726) adopts the Already Voted design with the vote toggle; the Already Voted screens (5802:8978 / 5815:8916, and 6671:27155) are archived afterwards | #403 (item 7) |
| Forfeit pop-up on the Contest page only; leaderboard Contest tab shows the forfeited writing in place of the three names | #403 (item 9) |
| Final task text on the live-ranking and uploading states only (remove from other states) | #403 (item 10) |
| Community-feed 'Final week' module (6661:26929 / 6661:29200): remove the dead 'View on the Contest page' link; videos as a carousel at the current frame size; final contest week only | #403 (item 11) |
| Delete the ten hidden legacy absolute layers inside the ten rebuilt Create Post frames (only those) | #403 (item 6) |

## 13. Backend implications (planning only, no code)

- Community votes: one per user per round, retractable, with an event log and timestamps; restricted accounts cannot vote.
- Engagement counters under the platform rule (views / likes / comments, unique per account).
- Server-validated playback and dwell heartbeats for view qualification (client-reported watch time alone is spoofable).
- Baseline points ledger in quarter-point units with giver / receiver entries, daily caps, revocation, self-engagement exemption and the content-screening condition.
- `LeaderboardEntry.points` is currently `Int`: store quarter-units, display rounded.
- Placement-points awards.
- Final-entry flag, hidden-until-reveal visibility, and a reveal scheduler (Europe/London).
- Minimum tally, forfeit and no-winner states.
- Admin endpoints replacing the judging endpoints.
- Follow-status snapshot at engagement time.
- Impression tracking and balanced-rotation serving with admin-configurable tolerance and frequency cap.
- Phase scheduling in Europe/London, including the 20:00 vote lock on days 7, 14 and 21, the 08:00 opening on days 1, 8, 15 and 22, and calculation of the weekly result at the lock (Decision Log #400; build register B-091).
- Contest edit-locking after launch and server-side validation of the ranges in sections 4 and 4a (#399; B-091).
- Engagement on a finalist entry is refused and not recorded before the reveal (#400, E10).
- A retracted vote removes that vote from the entrant's tally (#401, E9).
- No follow or post point awards (see section 14 grep result and B-094).

Build register rows: B-091 (contest backend), B-092 (exposure engine), B-093 (points engine), B-094 (remove follow/post awards), B-095 to B-099 (frames and code), B-100 (Competition backend).

## 14. Decisions confirmed 2026-10-14

1. Restricted accounts cannot vote.
2. Self-engagement counts in contest tallies in both follower modes, but is exempt from baseline points.
3. Follows and posts earn no points anywhere.
4. The exposure rule and its parameters are approved (tolerance 10%, N = 3 per viewer per day).
5. The upload window ends 23:59:59 on day 24, with a synchronised reveal at 00:00 on day 25 and finalist videos hidden until then.
6. Baseline rule: giver 1 / receiver 0.25, displayed rounded to the nearest whole number.
7. Daily caps: 40 given / 20 received.
8. Points are revoked on removal.
9. Comments must pass content screening to count.
10. View-qualification rules, including muted autoplay and text-only posts.
11. The contest view limit is set weekly in the contest description (min(video length, limit)).
12. Placement points are approved with the defaults in 9d.
13. Contests are not admin-judged; no "Level 1 / Level 2" (corrections, section 3).
14. Competition umbrella and Create Competition are in scope for launch.
15. Guardian decline cap, DOB correction tool and EU hosting (Decision Log #389-#391).

Founder wording recorded: "it is more profitable to give than to receive" (baseline rule); "a reasonable and moderate, non-biased" flow (exposure rule); the limit is "always communicated in the contest description" (view limit). No other verbatim founder wording was available to this document; none has been invented.

### ASSUMED / OPEN items (none silently resolved)

- (a) **CONFIRMED 2026-10-15 (#393)** (was ASSUMED): the tie-break "earliest vote reached" is computed from the current non-retracted vote log by timestamp (section 8). 
- (b) **CONFIRMED 2026-10-15 (#393)** (was ASSUMED): the weekly view-qualifying limit is a required structured numeric field in addition to the description text (section 4).
- (c) **CONFIRMED 2026-10-15 (#393)** (was ASSUMED): default placement points for Prediction, Commentary and other competitions are 500 / 300 / 150 (section 9d). 
- (d) **CONFIRMED 2026-10-15 (#393)** (was ASSUMED): revocation of baseline points also reduces that day's daily-cap counter (section 9b).
- (e) **OBSERVATION**: Phase 1 early-poster advantage (section 6). No change made.
- (f) **Read-only grep result** (2026-10-14, `origin/main`): leaderboard points ARE awarded for follows and posts today. `services/api/src/modules/points/points.constants.ts` `ENGAGEMENT_POINTS = { POST_CREATED: 3, LIKE_GIVEN: 1, FOLLOW_MADE: 1 }`; awarded at `feed.service.ts:279` (`createPost`, source `engagement_post`), `feed.service.ts:644` (`likePost`, `engagement_like`), `users.service.ts:395` (`followUser`, `engagement_follow`); counted by `leaderboard.constants.ts:24-26` and capped in `leaderboard-rollup.service.ts:128`; described in `points/README.md:16`, `leaderboard/README.md:228-234`, `contest/README.md:181-203`, and Decision Log #130 ("likes, follows, and posts"), #219 (post 3 / like 1 / follow 1). No web/admin copy promising points for follows or posts was found. Removal task: B-094. **RESOLVED 2026-10-15 (#393 (e)): the platform is not live and no points or ledger rows exist, so B-094 needs no historical-row handling; existing rows are simply reset.**
- (g) **Conflicts with #128-#130 beyond the stated amendments**: #130 says Contest/Competition points come "via each competition's own scoring mechanism" and that weights were "parked as a backend-api task"; #219 later built post 3 / like 1 / follow 1 and weekly 50/30/20, monthly 250/150/100; this file replaces all of those weights (9b, 9d). #130 and #219 say engagement points are awarded once per target and never revoked; 9b revokes. #61(c) and #218(2) allow position ties in weekly and monthly top 3 ("two rows carrying the same ordinal"); the tie-breaks in sections 8 and 10 remove ties, so tied-row rendering is no longer needed. #148/#188 define the Create Post "For Contest" tab as visible whenever a round is open; section 10 restricts it to finalists in week 4. #128 says points attribute to the represented club at award time; unchanged.
- (h) **Other ambiguities**: 1. weekly entry deadline (assumed Phase 1 only, section 6); 2. tie at the 10th-place Phase 1 cutoff; 3. when votes lock and when weekly winners are confirmed (assumed end of day 7); 4. what happens to existing `engagement_follow` / `engagement_post` ledger and `LeaderboardEntry` rows (keep, revoke, or leave as historical); 5. weekly view-qualifying limit for photos is fixed at 5 seconds, not admin-set; 6. whether a withdrawn-then-restored engagement re-earns points; 7. whether `User.isMinor` accounts' baseline points are subject to any additional safeguarding review (founder said "same rules for minors"; not reviewed by counsel; the legal draft has no contest or points section); 8. counsel has not reviewed processing of minors' view/dwell heartbeats (new personal-data processing).
  **Status 2026-10-15 (#393):** items 1, 2, 3, 4, 5 and 6 are CONFIRMED (entries Phase 1 only; one user qualifies as 10th with the earliest-reached tie-break; votes lock 23:59:59 day 7 [lock time superseded 2026-10-16, #400: 20:00:00 on days 7, 14 and 21]; historical rows reset because nothing is live; photo threshold fixed 5 seconds; removed-then-restored earns once). STILL OPEN: item 7 (counsel review of minors' baseline points) and item 8 (counsel review of view/dwell heartbeat processing).

### 14b. Founder confirmations 2026-10-15 (Decision Log #393)

(Vote lock time: superseded 2026-10-16 by Decision Log #400; see section 14c.)

1. Phase 1 tie at 10th place: exactly ONE user qualifies as 10th (section 7).
2. Previously ASSUMED, now confirmed: vote tie-break earliest vote reached from the non-retracted vote log; weekly view limit is a required numeric admin field; revocation reduces that day's cap counter; entries Phase 1 only; votes lock 23:59:59 day 7 [lock time superseded 2026-10-16, #400]; photo view threshold fixed at 5 seconds; removed-then-restored engagement earns once; placement-point defaults (weekly 500/300/150, monthly 2,000/1,200/600, other competitions default to the weekly figures, admin may override at creation).
3. No historical ledger handling for B-094: nothing is live, rows are reset.
4. Outside this file: Guardian Details Option A (B-075), Change Guardian Email frames updated (B-004), corrections to #392 items 4, 8, 10.

STILL OPEN: counsel review of minors' baseline points and of view/dwell heartbeat processing; (e) early-poster advantage observation; (g) conflicts with #128-#130 are resolved by this file as already stated.

### 14c. Founder decisions 2026-10-15/16 (Decision Log #394-#401)

DECIDED, NOT BUILT. Source: founder decisions 2026-10-15/16. Contest items are applied in sections 4, 4a, 5, 7, 8, 10, 11, 12 and 13 above. Non-contest items are recorded in the Decision Log and `docs/build-register.md` Section 10 and are listed here only so this file points at them.

| Item | Summary | Decision Log | Where it is applied |
|---|---|---|---|
| E1 | Create Contest has its own required Title, max 80 characters | #399 | Section 4 |
| E2 | Followers-excluded switch is week 4 only; removed from weeks 1-3 | #399 | Sections 4, 10 |
| E3 | The final has task text, shown at the bottom of the leaderboard page | #399 | Sections 4, 10 |
| E4 | Edit locking once week 1 starts; dates never editable | #399 | Section 4a |
| E5 | Ranges: watch limit 3-120 s; tolerance 1-50 %; per-viewer daily cap 1-50 | #399 | Sections 4, 4a |
| E4/E5 scope | Tolerance and per-viewer daily cap apply to week 4 only; lock when week 4 starts (founder-adopted default, veto-able) | #402 | Sections 4, 4a, 10b |
| E6 | Votes lock 20:00:00 on days 7, 14, 21; next week opens 08:00:00 on days 8, 15, 22 and on day 1 | #400 | Sections 5, 8 |
| E7 | Between Weeks is kept (12 hours) | #400 | Sections 5, 11 |
| E8 | Non-finalist Contest tab hidden days 22-24; minimum tally admin-only | #400 | Section 10 |
| E9 | One vote toggle button; no separate Change vote | #401 | Section 8 |
| E10 | Final-week entries not on the Contest page; pinned on the finalist's profile; engagement locked before reveal | #400 | Sections 10, 10b |
| E11 | Forfeit reason shown; announced as a pop-up | #400 | Sections 7, 11 |
| A1-A6 | Sign-up and profile | #394 | Not contest |
| B1-B4 | Decline, withdrawal, DOB correction in flight (B1 amended by #402: decline page inside the account, sessions valid between declines; third decline = pending deletion with the 30-day grace) | #395, #402 | Not contest |
| C1-C2 | Block (defaults adopted by #402) | #396, #402 | Not contest |
| C3 | 2FA recovery (10 hashed backup codes; recovery by backup code, or email confirmation plus password; #402) | #397, #402 | Not contest |
| D1-D4 | Admin moderation, username revoke (handle held 30 days, never re-picked by that user; #402), single-user read | #398, #402 | Not contest |

STILL OPEN (not decided here): counsel wording for every [COPY PENDING LEGAL REVIEW] item; the number of days or window lengths stated as "configuration"; the CSAM path; the placeholder name for incomplete profiles (#369); what the Contest tab shows from 00:00 to 08:00 on day 1; whether the Community-feed "Final week" module and the balanced-impression rotation remain (E10); whether the Already Voted page remains (E9). [2026-10-16, #402: "whether tolerance and per-viewer cap are per contest or week 4 only" is resolved - week 4 only, founder-adopted default, veto-able.] [2026-10-16, #403: answered - 'whether the Community-feed Final week module remains' (it does, as a carousel; open: whether carousel views count as impressions) and 'whether the Already Voted page remains' (it does not; the Voting page adopts its design). The placeholder name for incomplete profiles is 'Soccernity member'. Still open: what the Contest tab shows from 00:00 to 08:00 on day 1; how other users reach a finalist's entry after the reveal; counsel wording; window lengths stated as configuration other than the withdrawal throttle (5 attempts per 15 minutes).]

### 14d. Founder decisions 2026-10-16, follow-up (Decision Log #403)

DECIDED, NOT BUILT. Contest items are applied in sections 7, 8, 10, 10b, 11 and 12 above. Non-contest items are recorded in the Decision Log and `docs/build-register.md` Section 12 and listed here only so this file points at them.

| Item | Summary | Decision Log | Where it is applied |
|---|---|---|---|
| 1 | Non-finalist Contest tab stays visible in days 22-24 and shows the restored 'Closed (not a finalist)' frames; amends #400 E8 | #403 | Section 10 |
| 7 | Voting page adopts the Already Voted design with the vote toggle; Already Voted screens archived afterwards | #403 | Sections 8, 12 |
| 9 | Forfeit pop-up on the Contest page only, every load, one per forfeited week, reason shown, not remembered; leaderboard shows the forfeited writing; amends #400 E11 | #403 | Sections 7, 11 |
| 10 | Final task text on the live-ranking and uploading states only; changes #399 E3 | #403 | Sections 10, 11 |
| 11 | Community-feed 'Final week' module stays as a carousel, final week only; amends #400 E10 | #403 | Section 10b |
| 2-6, 8, 12-19 | Decline-page cap sentence, Approved screens, admin components and shell search bar, Create Post deletion exception, lift hold, mobile Block, accepted Create Post changes, Montserrat Field, defaults, Bants open forum, two country fields, deferred production wiring, new register rows | #403 | Not contest |

### 14e. Founder decisions 2026-10-17 (Decision Log #404)

Everything below is DECIDED, NOT BUILT. Items 4, 5, 6, 9 and 13 are founder-adopted defaults (veto-able); items 15 and 16 are founder decisions. Earlier text in this file is not rewritten; where it differs, this section prevails.

- **Forfeit pop-up (item 4; refines #403 item 9).** 'Contest page' means the Contest details page and the Voting page. When several weeks are forfeited, one pop-up opens after another, oldest week first. Unchanged: every load, reason shown, nothing remembered, no pop-up on the leaderboard tab.
- **Vote toggle (item 5; #401).** The vote count updates live by one, in either direction, when the toggle flips. No banner on toggle.
- **Carousel impressions (item 6; closes the open point of #403 item 11).** Final-week carousel views count as impressions when a tile is actually visible, and tile order follows the balanced rotation of section 10b. OPEN: the numeric definition of 'actually visible' (share of the tile in view, time in view). The per-viewer daily cap and tolerance of section 10b are unchanged.
- **Pinned final entry and the journey (items 9 and 15).** Others see nothing before the reveal. After the reveal the entry is pinned on the finalist's profile until the contest ends at the end of that month, then the pin is removed; the label stays 'Contest post'. Finalist names on the leaderboard Contest tab open the finalist's profile; carousel tiles open the entry itself. The entry does not also appear as a normal Community-feed post; the carousel is the daily exposure. Item 15 prevails where its wording differs from item 9. OPEN: whether the entry reaches the Community feed after the pin is removed (item 9 says it becomes an ordinary post; item 15 says only that the pin is removed).
- **Contest tab on day 1 (item 13; closes the open E6 point of #403).** From 00:00 to 08:00 on day 1 the Contest tab shows the Between Weeks state, variant 'Week 1 opens at 08:00'. This window is 8 hours; the Between Weeks state of #400 stays at 12 hours for days 7/8, 14/15 and 21/22.
- **Contest notifications (item 16; the spec had none).** In-app only, Europe/London, to every non-restricted account that is eligible for the Contest under sections 6 and 8 (minors included; restricted accounts excluded). One notification per account per event; a re-run never duplicates. Push and email are not decided and stay deferred to launch gate B-090. Wording is functional and tagged [COPY PENDING LEGAL REVIEW] where it reaches minors.

| Event | When | Who | Status |
|---|---|---|---|
| a. Week opens | 08:00 on days 1, 8, 15, 22 | Every eligible account | Decided |
| b. Votes-closing reminder | 19:00 on days 7, 14, 21 | Eligible accounts that have not voted that week | Decided |
| c. Week result | At the 20:00 lock on days 7, 14, 21 | Winners announced to everyone; a personal notification to each winner | Decided. A forfeited week sends none (g). |
| d. Final qualification | When the finalists are known: ASSUMED at the week-3 result (20:00 on day 21) | Each finalist: the entry stays hidden until the reveal | Decided; timing ASSUMED |
| e. Reveal | 00:00 on day 25 | Everyone: 'The final is live' | Decided |
| f. Final result | ASSUMED at the end of the contest month (the spec states no crown moment) | Everyone: the winners, or 'No winner this month' | Decided; timing ASSUMED |
| g. Forfeit | No extra notification | None (the pop-up covers it) | Decided |
| h. Finalist upload reminder | 12:00 on day 24 | Finalists who have not uploaded | Default added by Claude, veto-able |

  OPEN or BACKEND TO CONFIRM: whether an account with an unverified email receives them (not stated); a uniqueness key per (account, event, cycle, week) is needed for 'never duplicates', possibly a schema addition; `Notification.type` is a free string, but `NotificationsService` and the Notification Centre must learn each new type (an unrendered type shows the generic row). Register rows: B-121 (Figma), B-122 (backend), B-123 (frontend).
- **Not contest decisions of #404** (see `docs/build-register.md` Section 14): Account Information Country, profile design direction, admin components, 2FA recovery details, blocked users list, Bants thread model, Block and the age rules, the W3 judgment calls, the standing Figma check.

## 15. Where each decision lives

| Decision | Decision Log | This file | Build register |
|---|---|---|---|
| Contest not admin-judged; no Level 1/2 | #381 | 3 | B-091, B-095, B-096, B-097 |
| Admin creation, minimum tally, view limit | #381 | 4 | B-091, B-095, B-097 |
| Fixed calendar (Europe/London) | #387 | 5 | B-091 |
| Weekly entry | #387 | 6 | B-091 |
| Phase 1 ranking, forfeit | #387 | 7 | B-091 |
| Phase 2 voting, retract, tie-break | #387 | 8 | B-091, B-098 |
| Platform engagement rule | #382 | 9a | B-093 |
| Baseline leaderboard points | #383 | 9b | B-093, B-094 |
| View qualification | #384 | 9c | B-093 |
| Placement points | #385 | 9d | B-091, B-093, B-100 |
| Week-4 final | #386 | 10 | B-091, B-096 |
| Finalist exposure rule | #388 | 10b | B-092, B-095, B-096 |
| Weekly leaderboard fill | #387 | 11 | B-099 |
| Competition umbrella in scope | #392 | 2 | B-100 |
| Guardian decline cap | #389 | - | B-102, B-003 |
| DOB correction tool | #390 | - | B-103, B-104 |
| EU hosting | #391 | - | B-018, B-088 |
| Community Group feed | #392 | - | B-101 |
| Phase 1 10th-place tie; confirmed assumptions; no historical-row handling | #393 | 7, 8, 9, 14b | B-091, B-093, B-094 |
| Contest admin form: Title, week-4-only switch, final task text, locking, ranges | #399 | 4, 4a, 10 | B-091, B-095, B-097, B-099 |
| Tolerance and per-viewer cap are week 4 only; lock when week 4 starts | #402 | 4, 4a, 10b | B-091, B-092, B-095, B-097 |
| Calendar: 20:00 lock, 08:00 open, Between Weeks kept | #400 | 5, 8, 11 | B-091, B-096, B-099 |
| Hidden non-finalist tab; minimum tally admin-only; final entries pinned on profile; forfeit pop-up | #400 | 7, 10, 10b, 11 | B-092, B-096, B-107 |
| Vote toggle button | #401 | 8 | B-091, B-098, B-107 |
| Forfeit pop-up reading, vote-toggle count, carousel impressions, final-week journey, pin lifecycle, day-1 Contest tab | #404 | 7, 8, 10, 10b, 11, 14e | B-091, B-092, B-096, B-098, B-099, B-082 |
| Contest notifications (a-h) | #404 | 14e | B-121, B-122, B-123, B-090 |
| Non-finalist tab visible; forfeit pop-up on the Contest page only; final task text on two states; Final-week carousel; Voting page adopts Already Voted design | #403 | 7, 8, 10, 10b, 11, 12 | B-091, B-092, B-096, B-098, B-099, B-113 |

## 16. Change history

### 2026-10-14

Changes versus chat 9 (Aug 2026) and chat 11 (Sept 2026):

- The final is judged by engagement (likes + comments), not by voting.
- Views stay in Phase 1 only (qualified by 9c); views are not counted in the final.
- "Level 1 / Level 2" removed.
- The admin-judged backend (#218, #241) and its admin screens (#242, #243) are corrected as not the design.
- Platform-wide engagement rule added (views / likes / comments, unique per account, self-engagement counts in contests, restricted and unverified accounts never count, comments must pass screening).
- Follows and posts earn no points anywhere (reverses #130 "likes, follows, and posts" and #219 weights).
- Baseline leaderboard rule: giver 1 / receiver 0.25, self-engagement exempt, quarter-point storage, rounded display, daily caps 40 / 20, revocation.
- Placement points added (weekly 500 / 300 / 150, monthly 2,000 / 1,200 / 600).
- View-qualification rules added (baseline and contest).
- Minimum tally and "No winner this month" added.
- Forfeits for weeks with fewer than 3 entries added.
- Fixed Europe/London calendar added.
- Week-4 schedule: upload window days 22-24, finalist videos hidden, synchronised reveal at 00:00 on day 25.
- Week-4 finalist exposure rule added (provenance: founder-delegated design, drafted by Claude, approved by the founder).
- Restricted accounts cannot vote.
- Competition umbrella and Create Competition moved into launch scope.

### 2026-10-15

- Decision Log #393: Phase 1 10th-place tie rule added; ASSUMED items (a)-(d) and (h)1-6 confirmed; historical-ledger question closed (nothing is live). Items (h)7 and (h)8 remain open (counsel).

### 2026-10-16

- Decision Log #399: Create Contest has its own required Title (max 80 characters); the followers-excluded switch is week 4 only and is removed from weeks 1-3 (resolves the Section 4 vs Section 10 contradiction); the final has task text shown at the bottom of the leaderboard page; edit locking after week 1 starts and dates never editable; validation ranges (watch limit 3-120 s, tolerance 1-50 %, per-viewer daily cap 1-50).
- Decision Log #400: votes lock at 20:00:00 on days 7, 14 and 21 and the next week opens at 08:00:00 on days 8, 15 and 22 (week 1 also opens at 08:00:00 on day 1), superseding the 23:59:59 lock time of #393; Between Weeks kept (12 hours); non-finalist Contest tab hidden during days 22-24 and the minimum tally admin-only; final-week entries not on the Contest page, pinned on the finalist's profile with engagement locked before the reveal (amends #388); forfeit reason shown as a pop-up.
- Decision Log #401: the vote control is one toggle button; no separate Change vote.
- Decision Log #394-#398 (sign-up and profile, decline and withdrawal, Block, 2FA recovery, admin moderation) are not contest decisions; see Section 14c.
- Not changed: placement points, baseline points, view qualification and the week-4 upload deadline (23:59:59 on day 24).
- Decision Log #402 (founder-adopted defaults, veto-able): tolerance and the per-viewer daily cap apply to week 4 only (Sections 4, 4a, 10b; E4/E5 scope in 14c); they lock when week 4 starts. The remaining items of #402 (decline sessions, third decline, revoked username, Block, 2FA) are not contest decisions; see Section 14c and `docs/build-register.md` Section 11.

### 2026-10-16 (follow-up)

- Decision Log #403 (founder decisions 2026-10-16): the Contest tab is NOT hidden for a non-finalist - it stays visible and shows the restored 'Closed (not a finalist)' frames in days 22-24 (amends #400 E8, section 10); the forfeit pop-up is shown on the Contest page only, on every load, one per forfeited week, reason shown, not remembered, and the leaderboard tab shows the forfeited writing in place of the three names (amends #400 E11, sections 7 and 11); the final task text shows on the live-ranking and uploading states only (changes #399 E3, sections 10 and 11); the Community-feed 'Final week' module stays as a carousel, final week only, dead link removed (amends #400 E10, section 10b); the Voting page adopts the Already Voted design and the Already Voted screens are archived afterwards (closes the #401 open point, sections 8 and 12).
- Not changed: calendar, placement points, baseline points, view qualification, the week-4 upload deadline (23:59:59 on day 24), the vote lock (20:00:00).
- Decision Log #403 also records non-contest decisions (decline-page cap sentence, Approved screens, admin components, lift hold, Bants, country, defaults); see section 14d and `docs/build-register.md` Section 12.

### 2026-10-17

- Decision Log #404 (founder decisions 2026-10-17): the forfeit pop-up reading of 'Contest page' (Contest details and Voting) and several forfeited weeks in order (refines #403 item 9, section 7); the vote count updates live by one with no banner (section 8); carousel views count as impressions when a tile is actually visible, in balanced-rotation order (closes the #403 item 11 open point, section 10b); finalist names open the profile, carousel tiles open the entry, no normal feed post, pin lasts to month end (extends #400 E10 and #403 item 11, section 10); the Contest tab on day 1 from 00:00 to 08:00 shows Between Weeks 'Week 1 opens at 08:00' (closes the #403 E6 point, section 11); Contest notifications a-h (new, section 14e).
- Not changed: calendar, placement points, baseline points, view qualification, the week-4 upload deadline (23:59:59 on day 24), the vote lock (20:00:00).
- Decision Log #404 also records non-contest decisions; see section 14e and `docs/build-register.md` Section 14.
