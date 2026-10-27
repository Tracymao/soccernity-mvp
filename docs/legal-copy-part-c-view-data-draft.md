# Legal copy: proposed Part C row and viewer-notice options for view and impression data

## DRAFT FOR COUNSEL — NOT APPROVED, NOT LEGAL ADVICE

**Status: draft for counsel review. [COPY PENDING LEGAL REVIEW]**

This is a **new, standalone file**. It does **not** edit `docs/legal-copy-draft-tos-privacy-policy.md`
(v0.8), and nothing here has been applied to the Terms, the Privacy Policy, the guardian consent
screen or any Figma frame. It supplies material for whoever next revises that draft, after counsel
has answered the questions in `docs/dpia-addendum-contest-view-data-draft.md` (the **DPIA addendum**,
which holds the risk analysis, the store-by-store facts and the questions for counsel).

Produced by Claude Code in the `safeguarding-drafter` role (CLAUDE.md non-negotiable #2: every output
is a draft, never approved). Every block of wording below carries `[COPY PENDING LEGAL REVIEW]` on purpose,
and **[PROPOSAL]** / **[OPEN]** follow the conventions of the existing legal draft.

- **Draft date:** 2026-10-27, **Version:** 0.1 (draft, NOT APPROVED)
- **Facts from:** `docs/backend-w11-exposure-report.md` §4 and `docs/backend-w12-points-report.md` §4, with
  two direct code checks recorded in the DPIA addendum (R18). **Nothing here is live** and no regulator
  guidance was retrieved.

---

## 1. Proposed Part C row **[COPY PENDING LEGAL REVIEW]**

Same table format as Part C of the v0.8 draft. The last existing row is **44**, so this is proposed as
**row 45**. One row, because the findings are one processing activity; the detail lives in the DPIA addendum.

| # | Item | Where it appears above | Owner |
|---|---|---|---|
| 45 | **New — view, impression and dwell data of signed-in accounts, including minors, for Contest ranking, finalist-exposure balancing and leaderboard points. Not built into the policy text; the processing itself is built in `services/api` (W7, W11, W12) but not live.** The draft Policy mentions points and rank (§1.5) and nothing about impressions, view qualification or dwell measurement. Facts as built: (a) a Final-week carousel **impression** row records the viewing account, the finalist video, the London day and the instant (kept until the contest is closed, then folded into one count per video and deleted; deleted at once if the viewer's account is anonymised); (b) a **heartbeat** while a post is on screen is held only in short-lived memory (about 2 minutes) and is never written to the database; (c) when a view threshold is met, **leaderboard points** rows are written for the viewer and, with the viewer's account id as a reference, for the creator, and a weeks-1-3 **contest view** row is written for the contest entry. **(c) has no retention period, and neither (c) store is deleted when the account is anonymised** (code check, DPIA addendum R18). Never stored: IP address, device, user agent, dwell time, video position, scroll or viewport. Applies to every non-restricted account **including confirmed-consent minors** ("same rules for minors", founder); restricted minors are not served or counted. No notice, no opt-out, and the guardian consent screen does not mention it. Counsel status: **pending** (counsel has not reviewed minors' baseline points or view/dwell processing: `docs/contest-spec.md`, open items 7 and 8). **Counsel to answer:** lawful basis and whether this is profiling of children; whether guardian consent covers it; retention for the two durable stores; whether anonymised ledger and contest rows are still personal data; the viewer/guardian notice (options below); COPPA position for verified-consent under-13s; independent purge job | PP §1.5, §7, §9; ToS §3 (guardian consent) and the guardian consent screen (wording changes bump `CONSENT_SCREEN_VERSION`) | Founder + counsel |

---

## 2. Policy-text insertion candidates (NOT applied) **[COPY PENDING LEGAL REVIEW]**

These are *candidate* sentences, written so counsel can accept, reword or reject them. They are keyed to
the sections of the v0.8 draft they would extend. **They describe the product as built, and several
depend on a retention decision that has not been made (marked [OPEN]).**

### 2.1 Candidate for PP §1.5 ("Engagement and ranking data") — what we record **[COPY PENDING LEGAL REVIEW]**

> **[PROPOSAL]** To work out points and Contest rankings, we measure whether you have actually looked at
> a post (for example, a photo on screen for a few seconds, or a video watched for long enough) while
> the app is open. While you are looking, a short-lived record is kept for about two minutes so we can
> measure this, and it is then discarded. When a viewing counts, we keep a record that your account
> viewed that post, so we can award points. We also record when a Final-week Contest video was shown to
> you, so that every finalist is shown fairly. We do not record how long you looked, where on the screen
> you looked, your device, or your IP address for this.

### 2.2 Candidate for PP §1.5 or §7 — who can see it **[COPY PENDING LEGAL REVIEW]**

> **[PROPOSAL]** Other people can see your points and rank on the Leaderboard (and, as set out in
> Section 7, that can include a username if you are under 18). They cannot see which posts you viewed, or
> who viewed a post, and Contest creators are never told who watched their video. Our team can see
> aggregate figures about how often each Final-week video was shown, but not who it was shown to.

### 2.3 Candidate for the PP §9 retention table — one row per store **[COPY PENDING LEGAL REVIEW]**

| Data type | Retention period | What triggers change |
|---|---|---|
| Final-week Contest "was shown" records (per account) | Until the Contest month is closed and winners are confirmed, then replaced by one total number for each video and deleted. Deleted immediately if your account is anonymised. **[PROPOSAL, built]** | Month close; account anonymisation |
| Short-lived "currently viewing" measurement | About 2 minutes after you stop viewing, held in memory only **[PROPOSAL, built]** | Automatic |
| Points records, including records of which post you viewed | **[OPEN — no retention period is set or decided; counsel to determine, see DPIA addendum options R-1 to R-5.]** Records are not currently removed when an account is anonymised. | To be set |
| Contest view records for weeks 1 to 3 | **[OPEN — as above.]** | To be set |

### 2.4 Candidate for PP §9 "Signals that are yours alone" **[COPY PENDING LEGAL REVIEW]**

The existing draft lists follows, likes, saves, notifications and memberships as removed at anonymisation.
If counsel chooses retention option R-5 (DPIA addendum 7.1), add "points and view records" to that list.
**If counsel does not, that sentence is accurate as written and the table in 2.3 carries the exception.**
**[OPEN]**

---

## 3. Viewer-facing transparency notice: options, not decisions **[COPY PENDING LEGAL REVIEW]**

Context: Decision Log #400 E10 displaced the original Contest-page transparency copy (spec 10b), and
no replacement was decided. The DPIA addendum R19 records the gap. Each option below is wording plus
what it would require; none has a Figma frame yet (the `figma-screen-builder` would draw it) and
none is built.

| Option | Where the notice appears | Needs |
|---|---|---|
| **N-1. Policy text only** | Privacy Policy (2.1 to 2.3 above) | Nothing else |
| **N-2. Policy + in-product notice** | Policy, plus a short notice where the points or the Final-week carousel appear | One Figma frame and a code change in `apps/web` |
| **N-3. N-2 + once-only plain-language notice for under-18s** | As N-2, plus a one-time message the first time an under-18 is served the carousel or earns a view point | A Figma frame, a stored "seen" flag (a new field, so a schema change) |
| **N-4. N-3 + guardian-facing disclosure** | As N-3, plus a sentence on the guardian consent confirmation screen | **Bumps `CONSENT_SCREEN_VERSION` and the tripwire hash** (Decision Log #348, #415); already-confirmed guardians would not have seen it, so counsel must say whether they must be re-notified (as for Decision Log #363) |

### 3.1 Draft wording for each option **[COPY PENDING LEGAL REVIEW]**

**N-2, in-product (short, adult register):**

> Points and Final-week videos: to count a view, we check that a post was on your screen for long
> enough while the app was open. We keep a record that your account viewed it, and nothing about how long
> you looked or what device you used. Contest creators never see who viewed. Learn more in the Privacy
> Policy.

**N-3, once-only for under-18s (plain language, written to be read by a young person):**

> When you watch a post for long enough, you earn points. To do that we note that you looked at it.
> We don't record how long you looked, and nobody can see which posts you watched. If you would like
> to know more, ask a parent or guardian, or read our Privacy Policy.

**N-4, guardian-facing sentence (for the consent confirmation screen):**

> **[PROPOSAL, bumps `CONSENT_SCREEN_VERSION`]** Soccernity awards points for viewing, liking and
> commenting on posts and records that an account viewed a post. It does not record device or location
> details for this, and the points can appear on a public Leaderboard under your child's username.

### 3.2 Drafting notes for counsel on the wording **[COPY PENDING LEGAL REVIEW]**

- The N-2 to N-4 wording says "nothing about how long you looked". That is true of what is **stored**
  but not of what is **measured** (the 2-minute in-memory record does use timing). Counsel to say whether
  the sentence must mention the transient measurement (question 4 in the DPIA addendum).
- "Contest creators never see who viewed" is true as built (no endpoint exposes viewers). It is a design
  fact, not a legal promise; counsel to confirm the Policy may promise it.
- The N-4 sentence mentions the public Leaderboard username because Decision Log #45 shows real
  names/usernames of minors on the Leaderboard; whether that belongs on this screen is separate from the
  view-data question.
- None of the wording promises that data is deleted on anonymisation, because the ledger and contest
  rows are **not** deleted (DPIA addendum R18). If that behaviour is changed (R-5), edit 2.3, 2.4 and the
  N-3/N-4 wording to match.

---

## 4. Assumptions and open points **[COPY PENDING LEGAL REVIEW]**

Assumptions are numbered in the DPIA addendum (Section 8) and are not repeated; those that bear on this file:

- DPIA addendum assumption 3: the reports' "never stored" statements were not audited against application
  logs, Sentry or hosting request logs. The candidate wording in 2.1 ("we do not record ... your IP address for
  this") **needs that check before counsel relies on it.**
- DPIA addendum assumption 6: the guardian consent screen's wording was not re-read; N-4 assumes it has
  no view-tracking sentence today.
- The legal draft's Part C row numbering assumed the last row is 44 (v0.8); if another row has been added since,
  renumber.
- The proposed row 45 says "same rules for minors" is the founder's words. This draft treats that as a
  product decision, not a legal clearance.

## 5. Questions this file raises for counsel **[COPY PENDING LEGAL REVIEW]**

1. Which of N-1 to N-4 is required, and may the in-product copy be short and linked to the Policy?
2. Must the child-register wording (N-3) be shown to every under-18, or only to under-13s or under-16s?
3. If N-4 is chosen, must guardians who already confirmed consent be told?
4. May the Policy say "Contest creators never see who viewed" and "we do not record how long you looked"?
5. Is the proposed retention-table row (2.3) adequate while the periods for the two durable stores remain
   undecided, or must the Policy not be published until they are set?
6. All other questions are in the DPIA addendum, Section 9 (1 to 16); they are not repeated here.

---

## Closing statement **[COPY PENDING LEGAL REVIEW]**

This file proposes one Part C row and four notice options so that counsel can decide what the Privacy
Policy and the product must tell viewers and guardians about view and impression data. It decides
nothing, applies nothing, and does not claim that any wording is accurate beyond what the two engineering
reports and the two code checks support.
