# Soccernity DPIA Addendum: minors' carousel-impression and view/dwell data

## DRAFT FOR COUNSEL: NOT APPROVED, NOT LEGAL ADVICE, NOT A COMPLETED DPIA

**Status: draft for counsel review.**

This is a **new, standalone addendum**. It deliberately does **not** edit
`docs/sprint-1-dpia-outline-draft.md` (v0.3 when drafted; **[v0.3 CHANGED — #532]** v0.9 on `origin/main` `b67d9c0`), which is the DPIA it would attach to. If counsel
accepts it, folding it into that document (as proposed risks R17 to R22, a new §1.3 row group and
new §5 items) is a separate step for whoever maintains that file.

It was produced by Claude Code acting in the `safeguarding-drafter` role (CLAUDE.md non-negotiable #2:
output is **never** approved; it is a draft for human legal counsel). Nothing here is a statement
that Soccernity is compliant with UK GDPR, EU GDPR, US COPPA, the Nigeria Data Protection Act 2023, the
ICO Age Appropriate Design Code or any other regime. **A DPIA is only a DPIA once a competent person
has completed, challenged and signed it.** The sign-off block in Section 10 is empty on purpose.

**Tag convention.** Every heading and every block of proposed wording below carries
the pending-legal-review tag; the tag is repeated deliberately so it survives being copied into
another document. **[PROPOSAL]** = a suggestion for counsel to confirm, revise or reject.
**[OPEN]** = a decision that belongs to the founder and counsel, which this draft does not make.
**[ASSUMPTION n]** = something this draft took as true; all are listed in Section 8.

- **Document:** DPIA addendum for contest view and impression data
- **Draft date:** 2026-10-27
- **Version:** 0.1 (draft, NOT APPROVED); refreshed 2026-11-17 (**v0.2**, still draft, NOT APPROVED) **[v0.2 CHANGED — #532]**; refreshed again 2026-11-17 (**v0.3**, still draft, NOT APPROVED) **[v0.3 CHANGED — #532]**; revised 2026-11-22 (**v0.4**, still draft, NOT APPROVED)
- **Reviewed by counsel:** NOT YET (Section 10)
- **Companion file:** `docs/legal-copy-part-c-view-data-draft.md` (the proposed Part C row and
  viewer-notice options; it holds the notice wording, this file holds the risk analysis)

---

## Changelog: v0.2 → v0.3 (2026-11-17)

**[v0.3 CHANGED — #532, #534]** v0.3 is a **narrow refresh of stale references only.** It re-points this addendum at the files now on `origin/main` `b67d9c0` (2026-11-17): the DPIA is **v0.9** (this file said v0.3, and the v0.2 note said v0.8) and the legal draft is **v0.17** (this file said v0.8). It **chooses no option, completes nothing and claims nothing as solved.** **Every disposition in v0.2 is unchanged:** Decision Log #534 re-marked no question in this file. Sign-off is empty and counsel has not reviewed it. The statement that the draft Privacy Policy "mentions points and rank in §1.5 and nothing about impressions, view qualification or dwell measurement" was **re-checked against v0.17** (no match for "impression" or "dwell" in that file, 2026-11-17) and **still holds**; it is annotated, not changed. The references to "the v0.3 DPIA" inside the body (§2.1 lawful basis, §2.6 COPPA, §5 R17 numbering "continues from the v0.3 DPIA's R16", the "§0 item 5" limitation) describe what that DPIA said **when this addendum was written**; they are **kept**, not rewritten, because I did not re-verify each one against v0.9 (they are listed in `docs/addenda-stale-fixes-report.md`). Decision Log #533 and #534 are merged (docs PR #816).

**Not verified:** CI cannot be read from here and nothing was run (docs only); the Security session could not be asked (non-interactive); no statute, regulator text or vendor page was retrieved.

--- v0.4 (2026-11-22): the pending-legal-review tag was removed from every place it appeared in this draft, on the founder's decision of 2026-11-22 (review of every tagged string); no wording was changed, and no counsel disposition changed.

## Changelog: v0.1 → v0.2 (2026-11-17)

**[v0.2 CHANGED — #532]** v0.2 is a **narrow refresh**. It exists so counsel receives a current file and one clear list of what still needs a lawyer. It does three things only: (1) it gives **every one of the 16 questions in Section 9 a disposition marker**; (2) it adds a marked note beside the few statements the built system has since contradicted (the contest-entry removal of B-300 and the report-retention cascade of B-307); (3) it adds this changelog. It **chooses no option (R-1 to R-5, P-1 to P-4, N-1 to N-4), completes nothing, applies nothing to the product, the policy or the consent screen, and claims nothing as solved.** No counsel position is recorded, because counsel has not reviewed this file. All earlier text is kept.

**Disposition markers:** `[v0.2 DISPOSITION: A — …]` open for counsel (non-blocking, Decision Log #532); `B` decided by the founder (the Decision Log number is named; "counsel's view not recorded" wherever true, because a founder decision is not legal clearance); `C` resolved, counsel signed off (**none**); `D` founder or engineering housekeeping.

**Result of the check:** a search of the Decision Log entries named in this file found **no entry that decides any of the 16 questions**. The founder decisions that exist are product decisions: "same rules for minors" (#382 to #385, #404), the 40 / 20 daily caps (#383), the 50 percent / 1 second threshold (#405 item 7, #418), fold-and-delete at the crown (#418) and no Contest notifications for unverified accounts (#405 item 4). **All 16 questions therefore stay A**; the product decisions are cited where they bear on a question.

**What the build has changed that touches this file (verified in code on `origin/main` `014afcd`, 2026-11-17):**
- **B-300 (Decision Log #488, #495, built, PR #742):** when a moderator removes the post of a Contest entry, the entry stops competing, the baseline points earned on that post (by anyone) and its win or crown points are **revoked** (marked `PointsLedgerEntry.revokedForRemovalAt`, not deleted) and restored if an appeal is overturned; its `ContestVote` rows are freed. See the notes after R17 and in Section 6.
- **B-307 (PR #758, built):** the report-retention sweep no longer keeps forever a report whose removed post is a Contest entry in a **completed** cycle; deleting the post cascades to that entry's `ContestEngagement`, `ContestImpression`, `ContestVote` and `ContestRoundWinner` rows. The `PointsLedgerEntry` rows stay. This is the **one case** where store D rows are deleted by anything other than an unlike. See the note after R17.
- **Not changed:** `AccountDeletionSweepService.anonymizeUser` still deletes the viewer's `ContestImpression` rows (line 283) and **still contains no deletion of `PointsLedgerEntry` or `ContestEngagement` rows** (re-checked in this pass), so R18 stands as written.

**Not verified:** CI could not be read; nothing was run; the Security session could not be asked (non-interactive). The "v0.3 DPIA" this addendum refers to is now **v0.8** (and later drafts exist on other branches); this file was not re-pointed at them. **[v0.3 CHANGED — #532]** *(Updated: the DPIA on `origin/main` is **v0.9** as of 2026-11-17; the header now says so; the body references are kept, see the v0.3 changelog.)*

---

## 0. Sourcing limitations counsel must know about before reading

1. **Facts come from two engineering reports, cross-checked against the code in one place.** Sections 1 to
   3 are taken from `docs/backend-w11-exposure-report.md` §4 (carousel impressions) and
   `docs/backend-w12-points-report.md` §4 (view/dwell data and the points ledger). Where this draft says
   "the code does X" it was checked in `services/api/prisma/schema.prisma` and
   `account-deletion-sweep.service.ts` on `origin/main` at `d45664d` (2026-10-27). Nothing was run
   against a live database; **none of this processing is live** (no real users, no production
   deployment, Decision Log #409).
2. **No statute, regulator guidance or case law was retrieved or checked in this pass.** Any reference
   to a regime below is the drafter's general knowledge, written to tell counsel where to look; it does not
   assert what the regime requires. This is the same limitation the v0.3 DPIA states at its §0 item 5.
3. **Counsel has not seen this processing.** `docs/contest-spec.md` records it as STILL OPEN: "counsel
   review of minors' baseline points and of view/dwell heartbeat processing" (the list under
   "ASSUMED / OPEN items", items 7 and 8, and again in sections 14b and 14d). The founder decided
   "same rules for minors" (Decision Log #382 to #385, #404). That is a product decision, not a
   legal clearance.
4. **Two of the engineering reports' defaults are founder-adopted and veto-able, not legal
   positions.** The impression threshold (50 percent of the tile for 1 second, Decision Log #405
   item 7) and the retention behaviour of the impression table (fold-and-delete at the crown) are
   both defaults the founder confirmed as product choices (Decision Log #418). Retention periods for
   the other two tables are **undefined** in the code and in every decision record.

---

## 1. Scope: what this addendum covers

Four stores hold behavioural data about *what a signed-in account looked at and for how long*. Three
of them are new in the contest and points work (W7, W11, W12), and none was in the DPIA.

| Ref | Store | Written when | Exists for |
|---|---|---|---|
| **A** | Postgres `ContestImpression` | A Final-week carousel tile was at least 50% in view for 1 continuous second, and the server accepted the event | Balancing exposure between the (at most nine) week-4 finalists, and a per-viewer daily cap |
| **B** | Redis `viewhb:*` keys | While a post is on screen, every ~3 seconds (the "heartbeat") | Measuring, on the server, whether a view qualifies for a point or a contest tally |
| **C** | Postgres `PointsLedgerEntry` (view rows) | Only when a view threshold is met | Leaderboard points for the viewer (1 point) and the creator (0.25 points) |
| **D** | Postgres `ContestEngagement` (kind `view`) | Only for a weeks-1-3 contest entry, when the contest threshold is met | Phase 1 ranking (views + likes + comments) |

Out of scope here (already in or belonging to other analyses): the like and comment rows in
`PointsLedgerEntry` and `ContestEngagement` (same tables, but the underlying act is a deliberate,
public-ish action rather than passive viewing; see Section 8, assumption 9), contest votes, and the
leaderboard read path.

### 1.1 What is stored, exactly

Reproduced from the W11 and W12 reports §4 and checked against the schema.

**A. `ContestImpression` (one row per counted impression)**

| Field | Content | Personal data? |
|---|---|---|
| `viewerId` | the viewing account's id (foreign key to `User`) | Yes: links the row to an account (pseudonymous, no name) |
| `entryId` | which finalist video | No (a contest entry), but it identifies *whose video* the account watched |
| `eventId` | random UUID the **client** generated for the event; idempotency key | Not derived from any device or user attribute |
| `dayKey` | Europe/London calendar day, `YYYY-MM-DD` | With `occurredAt`, behavioural |
| `occurredAt` | the instant the server counted it (millisecond) | Behavioural |
| `id` | random UUID | No |

**B. Redis heartbeat state (never in Postgres)**

| Key | Content | Lifetime |
|---|---|---|
| `viewhb:s:<viewerId>:<postId>:<sessionId>` | last beat time, last `active` flag, last video position (seconds), credited seconds, two "done" flags | expires **120 s** after the last beat |
| `viewhb:rate:<viewerId>` | a beat counter | 60 s window |
| `viewhb:lock:...` | a lock | 5 s |

**C. `PointsLedgerEntry` view rows.** For the viewer an `engagement_view_given` row; for the creator an
`engagement_view_received` row. Fields: user, `source`, `refId` (the post id, or `<postId>:<giverId>` on a
received row), `postId`, **`counterpartId`** (on the creator's row, the account that viewed), `quarterPoints`,
time, the user's represented-club snapshot, `revokedAt`. Append-only. **`refId`, `postId` and
`counterpartId` are plain strings with no foreign key** (a deliberate audit-trail design: the ledger "must
outlive whatever it references").

**D. `ContestEngagement` view rows.** Entry, `userId` (the viewer; a real foreign key to `User`),
`kind` = `view`, `followedAtEngagement` (whether the viewer followed the creator at that moment), `occurredAt`.
Unique per (entry, user, kind). The same table also holds `like` and `comment` rows.
*[v0.2 CHANGED — B-307]* Store D rows are also removed when their entry is removed by the report-retention cascade (see the note after R17); this is the only deletion other than an unlike. Store C rows for a removed entry's post are **marked revoked** (B-300), not deleted. *[v0.2 DISPOSITION: D — a statement of built behaviour.]*

**Deliberately never stored, anywhere (per the reports):** dwell seconds, video playhead, session id, IP
address, user agent, device or browser, mute state, scroll position, viewport, the tile's position in the
carousel, the claimed visible share or milliseconds (checked then discarded).

**Derived and kept:** `ContestEntry.impressionTotal`, one integer per final entry, written at the crown. It
holds no viewer data and lives as long as the entry.

### 1.2 Who can read each store

| Store | In-application access | Other |
|---|---|---|
| A | `ContestExposureService` only, for three uses: the viewer's own cap check and carousel exclusion, the per-entry aggregate across viewers, and the crown fold. **No endpoint returns a `viewerId`, `eventId` or `dayKey`; no user-facing endpoint returns an impression count; the admin exposure endpoint returns aggregates only** (asserted in the unit and e2e tests by searching responses for viewer ids) | Database operators with direct access; database backups at the hosting provider (not assessed) |
| B | The API process only | Redis operator access (Upstash); not assessed |
| C | No endpoint returns ledger rows. `GET /leaderboard` returns per-user totals (rounded to whole points) only | Database operators; backups |
| D | Contest endpoints return tallies, never the log | Database operators; backups |

### 1.3 Who the processing covers

Every non-restricted signed-in account, **including minors whose guardian has confirmed consent**
(`docs/contest-spec.md` 10b audience; "same rules for minors"). Restricted accounts (a minor without
confirmed guardian consent) are never served the carousel and never counted. Differences between
the stores are listed in Section 5, R22.

---

## 2. Purposes and necessity (facts for counsel; no conclusion drawn)

| Store | Stated purpose | Could it be done with less? (the drafter's observations, for counsel to test) |
|---|---|---|
| A | Keep finalist exposure balanced and capped so that no finalist is favoured by follower count or upload time (spec 10b) | The purpose needs *an aggregate count per video* and *a per-viewer cap*. It does not need to know **which** account viewed **which** video on **which** day beyond the cap window. See retention option R-3 (aggregate-only counting with a short-lived cap marker) |
| B | Qualify a view without trusting the client's claim of "seconds watched" | Short-lived by design (120 s) and never written to Postgres. The data is dwell-level, which is the most intrusive grain in this addendum even though it is transient |
| C | Award leaderboard points for views | The point is needed once per (viewer, post). Whether the *viewer-identifying* `counterpartId` on the creator's row is needed after the cap check is the question (R-2) |
| D | Rank weeks 1 to 3 entries by views + likes + comments | A tally is needed; the per-viewer rows exist so an unlike or removal can reduce the tally and so one account counts once |

**[OPEN]** Whether a view-based points system is itself proportionate for children (as opposed to
view-based *ranking* of contest entries) is a product-and-counsel question this draft raises (Q1, Q2)
and does not answer.

---

## 3. Data subjects

1. **Viewers**: every active, non-restricted account, including confirmed-consent minors. Under-16s are
   in scope for the carousel and for views of public posts. Whether an under-16 can be a viewer at all
   in each store is a point to confirm (the under-16 tier restricts messaging, Banter and group creation,
   Decision Log #346; it does not restrict viewing public posts or the Contest). **[ASSUMPTION 1]**
2. **Creators/finalists**: a creator is affected in two ways: aggregate impression counts attach to their
   entry (A), and a viewer-identifying `counterpartId` sits on rows that earn them 0.25 points (C). A
   minor finalist's video is shown to every eligible account, including adults.
3. **Guardians** are not data subjects of this processing but are the consent-holders for the minors in 1
   and 2. Their consent screen does not mention it (Section 8, assumption 6).

---

## 4. Lawful basis

**[PROPOSAL, NOT DETERMINED]** As in the v0.3 DPIA §2.1, this draft does **not** select a lawful basis.
For counsel:

- Candidate bases are legitimate interests (running the contest and leaderboard) or contract (the
  service as described in the Terms). Consent is possible but would need to be freely given, specific and
  withdrawable, and for a child a guardian's consent adds a layer; the existing guardian consent covers
  "using Soccernity", and the consent screen says nothing about view tracking or points.
- Where legitimate interests is relied on for a child, the balancing test weights the child's interests
  more heavily. A passive, continuous measure (B) of what children look at, used to award points,
  is a more intrusive input than an explicit action such as a like.
- Whether the stores **A to D together** amount to **profiling** (evaluating personal aspects of a
  child, here attention) or only to counting. Counsel to determine.
- Whether children's data used to grant **rewards** (points, rank, a public leaderboard that shows
  usernames, including minors, Decision Log #45) engages any rule on nudging or on detrimental use
  (Section 5, R21).
- COPPA (US under-13s): the v0.3 DPIA §2.6 treats card verification as the stated control for the
  under-13 US band. Whether the *collection of view/dwell data* from a verified-consent under-13 is
  within what that consent covers is for counsel.

---

## 5. Risks (proposed R17 to R22; numbering continues from the v0.3 DPIA's R16)

Ratings are placeholders for counsel, in the same convention as the v0.3 DPIA.

### R17: Behavioural data about children's viewing is created and kept without a stated retention period

Store A has a short, defined life (fold and delete at the crown). **Stores C and D have none.**
`PointsLedgerEntry` is documented as append-only and "never deleted"; `ContestEngagement` rows live
with the entry, and nothing in the code deletes them after a contest ends (only an unlike removes the
row). Each is a lasting record that account X viewed post Y at time T (C and D) and, for the creator
rows in C, **that account Z viewed X's post** (`counterpartId`).

**[v0.2 CHANGED — #488, #495, B-300, B-307]** Two built facts narrow, but do not remove, this finding. (1) **Revocation:** when a moderator removes a Contest entry's post, the points earned on it (by anyone) are marked `revokedForRemovalAt` (a flag on the row, **not a deletion**) and restored on an overturned appeal (B-300). The ledger is still never deleted by this. (2) **A removed entry's `ContestEngagement` rows can now be deleted:** if the entry's post was removed, its report is closed and the cycle is completed, the report-retention sweep deletes the post and the database cascade drops that entry's `ContestEngagement`, `ContestImpression`, `ContestVote` and `ContestRoundWinner` rows (B-307, PR #758); a legacy admin-judged cycle that still holds a winner row keeps the report. **Everything else in this finding stands:** no retention period exists for the rows of an entry that was never removed. *[v0.2 DISPOSITION: A — whether the remaining rows need a period is for counsel (Q7); D — the B-300 / B-307 behaviour is built engineering and is stated only so counsel reads current facts.]*

*Draft severity: moderate. Draft likelihood: certain (it is how the code works). Placeholder ratings.*

### R18: Erasure and anonymisation do not reach stores C and D

**Finding from the code, not from a report:** `AccountDeletionSweepService.anonymizeUser` deletes the
viewer's `ContestImpression` rows (A) but contains **no deletion of `PointsLedgerEntry` or
`ContestEngagement` rows** (the only `deleteMany` calls on those tables in `src` are an unlike on
`ContestEngagement` and the crown purge of impressions). Consequences as built:

- The account's own ledger rows (`userId`) remain after anonymisation, pointing at the anonymised
  `User` row. The row holds an opaque id; the account no longer carries a name, email, DOB or profile.
- **Other users' ledger rows keep the anonymised viewer's id in `counterpartId`.** That id is a
  plain string with no foreign key. After anonymisation it points at a row with no personal data.
- `ContestEngagement.userId` is a real, `RESTRICT` foreign key (Decision Log #341), so the viewer's
  engagement rows survive and still reference the anonymised row.

Whether this is acceptable depends on whether the remaining rows are still personal data once the account
is anonymised (the Decision Log #341 reasoning: GDPR Recital 26, anonymised data out of scope) and on
whether a ledger row combined with other data could re-identify. That is a legal question (Q6). It is
also a **disclosure** question: the draft Privacy Policy §9 says signals "that are yours alone"
(follows, likes, saves, notifications, memberships) are removed at anonymisation, and does not mention
the ledger or contest engagement rows.

**[v0.2 CHANGED — B-300, B-307]** Re-checked in this pass: `anonymizeUser` still deletes only the viewer's `ContestImpression` rows (A) and still does **not** delete `PointsLedgerEntry` or `ContestEngagement` rows, so the finding and its three consequences stand. The only deletion of `ContestEngagement` rows other than an unlike is the B-307 cascade described after R17, which is triggered by the retention of a **report**, not by account anonymisation. *[v0.2 DISPOSITION: A — whether the remaining rows are personal data after anonymisation, and what to do (Q6); non-blocking.]*

*Draft severity: moderate. Draft likelihood: certain as built. Placeholder ratings.*

### R19: No transparency, no notice and no opt-out for the viewer or the guardian

Per the W11 report: "The viewer has no control, no notice and no opt-out in this PR (the transparency
copy of spec 10b was displaced by #400 E10 and no replacement is decided)." The draft Privacy Policy
(`docs/legal-copy-draft-tos-privacy-policy.md` v0.8 **[v0.3 CHANGED — #532]** v0.17, re-checked 2026-11-17) mentions points and rank in §1.5 and nothing about
impressions, view qualification or dwell measurement (confirmed by search). The guardian consent
confirmation screen does not mention it, and changing that screen's wording bumps
`CONSENT_SCREEN_VERSION` and the tripwire hash (Decision Log #348, #415). Children's transparency
(age-appropriate, plain-language) is a recognised expectation in the regimes counsel is reviewing against.

*Draft severity: high for a children's service. Draft likelihood: certain as built. Placeholder ratings.*

### R20: Purging depends on a single sweep; no independent control

The impression rows (A) are deleted inside the crown transaction (`ContestLifecycleService.complete`). If
the lifecycle sweep is down at month end, rows persist until it next runs (every minute; steps are
idempotent). There is no independent purge job and no maximum-age backstop. Hosting-provider
backups may retain deleted rows for a provider-defined period (not assessed). A cycle that never
reaches the crown (abandoned, a failed month) has no defined purge path for its impression rows at all
**[ASSUMPTION 7]**.

*Draft severity: low to moderate. Draft likelihood: low. Placeholder ratings.*

### R21: Rewards for viewing as a nudge to children

A giver earns 1 point per qualifying view, capped at 40 points a day (and a creator earns 0.25, capped
at 20), and those points rank people on a public leaderboard that shows usernames, including minors'.
A child can therefore earn rank by watching. The threshold design (3 s photo/text, 60 s video) and the
daily caps are the only brakes. The server cannot see the viewport: it trusts client claims of
"active" and video length, bounded by simple sanity rules (W12 report §3 item 11). A tampering client can
inflate a finalist's impression count by at most the per-viewer daily cap per account per day per video,
and only from eligible accounts; it cannot see the counts it would be inflating (W11 §4 "Trust").
Counsel to say whether reward-for-attention mechanics need a children's-design assessment (for
example, the ICO Age Appropriate Design Code's standards on detrimental use and nudge techniques, which
the drafter knows only in general terms).

*Draft severity: moderate. Draft likelihood: moderate. Placeholder ratings.*

### R22: The stores treat restricted and unverified accounts differently

| Account state | A (carousel impression) | B (heartbeat in Redis) | C and D (Postgres rows) |
|---|---|---|---|
| Restricted (minor, consent not confirmed) | Not served, not counted (403 on the event) | Processed in Redis (beats reach Redis) | Nothing written |
| Unverified email | **Served and counted** (an impression is exposure balancing, not an engagement score; W11 §5 item 4, veto-able) | Processed | **Nothing written** (W12 §4) |
| Active, verified, confirmed-consent minor | Counted | Processed | Written |

So an **unverified-email** account's viewing is recorded in store A but not in C or D. That is a
product default (W11 §5 item 4) that counsel did not see. It matters because Decision Log #404 and
#405 item 4 treat "no Contest notifications for unverified accounts", which is a different (and stricter)
rule. It is flagged for consistency, not as a finding of harm.

*Draft severity: low. Draft likelihood: certain as built. Placeholder ratings.*

---

## 6. Mitigations already in the product

Stated as built; none has been reviewed or tested by counsel, and none is live.

| Risk | Control as built |
|---|---|
| R17, R20 | Store A: fold-and-delete at the crown; deleted at once when the viewer is anonymised. Store B: auto-expiry in Redis (120 s / 60 s / 5 s); never written to Postgres. |
| R17, R19 | No endpoint returns a viewer id, event id, day key or any impression count to users. The admin exposure view returns aggregates only. No ledger endpoint exists. |
| R21 | Daily caps (40 given, 20 received, Europe/London day) held in configuration and enforced under a per-account-day advisory lock (proven by a concurrent test; mutation-checked). Per-viewer per-video cap of 3 per day on carousel impressions. Server-side measurement of qualifying time; a view never qualifies in under 1 s. |
| R21 | Rotation never orders by engagement, live rank or follower count; the viewer's own entry and blocked pairs are excluded. |
| R22 | Restricted accounts never served or counted. |

**[v0.2 CHANGED — B-300, B-307]** **Added controls, as built:** a removed Contest entry is excluded from the carousel, ranking and tallies, its points are revoked and restorable (B-300); a removed entry's engagement and impression rows are deleted with the post once the report is retained out (B-307). Not reviewed or tested by counsel. *[v0.2 DISPOSITION: D — stated as built.]*
| Data minimisation | IP address, user agent, device, dwell time, playhead, scroll and viewport are never stored. The claimed visible share/ms are checked then discarded. |

---

## 7. Options, not decisions

These are for the founder and counsel to choose between. **Nothing below is recommended as
the only reasonable choice**, and where this draft states a lean it says so as a lean. None has been
built. Options for the **viewer-facing notice** are in `docs/legal-copy-part-c-view-data-draft.md`
(Section 3 there), because they are wording choices.

### 7.1 Retention of `PointsLedgerEntry` and `ContestEngagement` view rows

Context: both are undefined today. Choosing a period also decides what the Privacy Policy §9 table says.
Periods below are illustrative placeholders for counsel, not a recommended number.

| Option | What it means | What it costs or risks |
|---|---|---|
| **R-1. Keep as built (no period)** | Ledger append-only forever; `ContestEngagement` kept with the entry | Simplest; keeps a permanent record of who viewed what (R17); the Policy must say so and must justify it |
| **R-2. Keep the points, drop the viewer link** | Keep the `userId` row of the *earner* (needed to rebuild a leaderboard and audit awards); **null or delete `counterpartId`** on `engagement_view_received` rows once the cap/idempotency window has passed (for example after the Europe/London day or after the week's rollup is final), and delete `engagement_view_given` rows' `refId` post link after the same window. The creator keeps a point total but not a list of *who* viewed | Needs a migration (nullable `counterpartId` is already nullable; `refId` is `@@unique([source, refId, userId])`-keyed so changing it needs care); loses the ability to revoke "what an account earned others" after restriction, which W12 wires to `counterpartId` (**must be reconciled**: see assumption 8) |
| **R-3. Aggregate-only impressions** | Store A holds a per-viewer-per-entry-per-day *counter* (or a hashed, rotating key) instead of one row per event; the entry total is incremented directly | Smaller footprint; changes the idempotency model (`eventId` replay would need another mechanism); is the largest engineering change |
| **R-4. Time-boxed retention for C and D** | A fixed period after the contest month or leaderboard period ends (placeholder: a number of months chosen by counsel), then delete D view rows and anonymise C view rows | Needs a retention job (see 7.3); conflicts with "append-only ledger" unless C view rows are explicitly exempted from that design |
| **R-5. Delete view rows on anonymisation** | Add `PointsLedgerEntry` (view and counterpart references) and `ContestEngagement` rows to `AnonymizeUser`, same as `ContestImpression` | Closes R18. Removes points the viewer earned, which removes them from the total a leaderboard would have; the account is already off the board after anonymisation so the visible effect is on **other users' received-points totals** (their `engagement_view_received` rows for that viewer would disappear or lose their counterpart). Founder decision whether received points should survive |

The drafter's lean, labelled as a lean: R-2 plus R-5 together address the identifiability concern
without losing totals, but the interaction with revocation (R-2's cost column) means it needs an
engineering check before counsel relies on it. **[OPEN]** (Q8).

*[v0.2 CHANGED — #532]* **No option R-1 to R-5 has been chosen, and v0.2 does not choose one.** *[v0.2 DISPOSITION: A — R-1 to R-5, P-1 to P-4 and N-1 to N-4 stay open for counsel and the founder; non-blocking.]*

### 7.2 Independent purge job for `ContestImpression`

Context: today only the crown transaction and account anonymisation delete rows (R20).

| Option | What it means | Notes |
|---|---|---|
| **P-1. None (as built)** | Rely on the lifecycle sweep, every minute, idempotent | Matches the W11 report; no backstop for an abandoned cycle |
| **P-2. Daily backstop job** | A separate scheduled job deletes `ContestImpression` rows older than a maximum age (placeholder: the length of a calendar month plus a safety margin) or whose cycle is already crowned/completed | Independent of the lifecycle sweep; cheap (indexed by `entryId`); needs its own test and a monitoring signal |
| **P-3. Purge on cap-window expiry** | Rows are deleted once the Europe/London day that bounds the cap has passed, keeping only a folded total per entry | Shortest possible life (a day); but the rotation uses the live count across the whole final week, so rows would need to be folded into a running aggregate daily; same change as R-3 |
| **P-4. Extend any of the above to C and D** | One retention job owning all three tables | Single point of control; larger scope |

Also for counsel under this heading: the hosting provider's backup retention (Neon, Upstash), which this
draft did not assess and which defines the real outer limit of any purge (Q9).

### 7.3 Transparency notice for viewers and guardians

See `docs/legal-copy-part-c-view-data-draft.md` Section 3. The four options there (Policy only; plus an
in-product notice at the carousel; plus a first-use notice for under-18s; plus a guardian-facing
disclosure on the consent screen) are summarised in the table below so this file stands alone.

| Option | Consent screen changes? | In-product change? |
|---|---|---|
| N-1 Policy text only | No | No |
| N-2 Policy + in-product notice at the carousel / on points | No | Yes (a Figma frame and a code change) |
| N-3 N-2 + a once-only plain-language notice for under-18s | No | Yes |
| N-4 N-3 + a guardian-facing disclosure | **Yes** (bumps `CONSENT_SCREEN_VERSION`; every already-confirmed guardian would not have seen it; Decision Log #363 shows the precedent of asking counsel whether existing guardians must be re-notified) | Yes |

---

## 8. Assumptions this draft made

1. **Under-16s are viewers.** Nothing in the code limits an under-16's view heartbeat or carousel
   impression; the under-16 tier restricts other features (Decision Log #346). Assumed this is intended.
2. **"Same rules for minors" (the founder's words) means identical processing, not a lighter
   regime.** There is no separate, reduced-data path for minors in code.
3. **The reports are accurate.** Sections 1 to 3 rest on the W11 and W12 reports and on two direct code
   checks (the anonymisation sweep, the schema). The reports' statements about what is *never stored* were
   not independently audited against every logging path (application logs, error tracking such as Sentry,
   and the hosting provider's request logs were not examined; a viewer's heartbeat request carries a
   post id and session id in the request, which could appear in logs).
4. **Redis is transient in practice.** Keys expire as described; no Redis persistence, replication or
   snapshot setting was checked, and a snapshot could retain keys beyond their TTL.
5. **The Postgres rows are the only durable record.** Application logs and backups are not analysed.
6. **The guardian-consent screen does not mention view tracking** (confirmed by reading the legal draft
   and the DPIA; the screen's own file was not re-read).
7. **A cycle that never reaches the crown is an edge case** that nothing handles; assumed rare.
8. **W12's "account later restricted" revocation depends on `counterpartId`.** Any option that nulls or
   deletes `counterpartId` (R-2) breaks the revocation of "what that account earned others", which is wired
   in code. Assumed a trade-off to be decided, not a defect.
9. **Likes and comments are not in scope** because they are deliberate public actions. Counsel may
   prefer one treatment for all three kinds of engagement row.
10. **Impressions do not count when a viewer sees the tile on a finalist's profile or pinned entry**
    (W11 §6): only the carousel counts. Assumed intended.
11. **The 50 percent / 1 second threshold and the 40 / 20 point caps are product defaults**, not
    legal figures, and could change.
12. **All processing described is test-only.** No live data exists; nothing here has been run on children.
13. **[v0.2 CHANGED — #532]** **v0.2 reads `CLAUDE.md`'s status bullets, the register and the code on `origin/main` `014afcd` (2026-11-17).** Nothing was run, CI could not be read, the Security session could not be asked, and the DPIA this addendum would attach to is now v0.8 (not v0.3). *[v0.2 DISPOSITION: D — housekeeping.]*

---

## 9. Questions counsel must answer

1. Is processing view and dwell data of children (store B, and the rows in C and D) permissible for the
   stated purposes, and on what lawful basis, in each regime in scope (UK, EU, Nigeria, US)?
   *[v0.2 DISPOSITION: A — for counsel; non-blocking. The founder's "same rules for minors" (#382 to #385, #404) is a product decision, B, not a legal clearance (counsel's view not recorded).]*
2. Does the combination of A to D amount to **profiling** of children, and if so what follows? Does
   awarding points for passive viewing change the analysis compared with ranking by deliberate acts?
   *[v0.2 DISPOSITION: A — for counsel; non-blocking.]*
3. Is **guardian consent** for "using Soccernity" enough for this processing, or does it need its own
   mention, or its own consent? If a consent screen change is required, must already-confirmed guardians
   be re-notified (the Decision Log #363 question again)?
   *[v0.2 DISPOSITION: A — for counsel; non-blocking. D — any consent-screen change bumps `CONSENT_SCREEN_VERSION` and the tripwire hash (engineering housekeeping, #348).]*
4. Is **transient processing** in Redis (120 s) disclosable as "not stored", or must the Policy
   describe it? Same for requests that pass through hosting logs.
   *[v0.2 DISPOSITION: A — for counsel; non-blocking.]*
5. For an **under-13 US** child whose guardian completed card verification, does that consent extend to
   this data collection under COPPA?
   *[v0.2 DISPOSITION: A — for counsel; non-blocking.]*
6. After **anonymisation**, are `PointsLedgerEntry` and `ContestEngagement` rows (and
   other users' `counterpartId` references to the anonymised id) personal data? Is the current behaviour
   (rows kept, account anonymised) acceptable, or must they be deleted or detached (R18)?
   *[v0.2 DISPOSITION: A — for counsel; non-blocking. The current behaviour is re-verified (see the note after R18) and is partly changed only by the B-307 report-retention cascade.]*
7. What **retention period** is defensible for each of C and D, and for the aggregate
   `impressionTotal`? (Options R-1 to R-5.)
   *[v0.2 DISPOSITION: A — for counsel and the founder; no option chosen; non-blocking.]*
8. May the **creator's received-points row carry the viewer's id** (`counterpartId`), and if not, how is
   revocation to be preserved (assumption 8)?
   *[v0.2 DISPOSITION: A — for counsel; non-blocking. Note: B-300's revocation of a removed entry's points uses a flag on the row (`revokedForRemovalAt`) and does not depend on `counterpartId`.]*
9. Does the hosting provider's **backup retention** define the real purge horizon, and must the Policy say so?
   *[v0.2 DISPOSITION: A — for counsel; non-blocking. D — finding the host's actual backup retention is founder housekeeping at the launch gate (not looked up in this pass).]*
10. Is an **independent purge job** a required control or an engineering preference (options P-1 to P-4)?
    *[v0.2 DISPOSITION: A — for counsel; non-blocking. D — if a purge job is wanted, it is engineering work (not built).]*
11. Is there a **viewer-facing transparency duty** for this processing, at what age-appropriate level, and
    where must it appear (options N-1 to N-4)? Must the notice be shown to the child at first exposure?
    *[v0.2 DISPOSITION: A — for counsel; non-blocking. The notice options are in the companion Part C file.]*
12. Do the **reward mechanics** (points, public leaderboard with minors' usernames, daily caps) need a
    separate children's-design assessment (R21)? Is the **40 / 20 daily cap** an adequate brake?
    *[v0.2 DISPOSITION: A — adequacy is for counsel; non-blocking. B — the caps themselves are a founder default (#383, #385; counsel's view not recorded).]*
13. Should **unverified-email** accounts be treated the same across A, C and D (R22)?
    *[v0.2 DISPOSITION: A — for counsel; non-blocking. Related founder decision: unverified-email accounts get no Contest notifications (#405 item 4, B), which is narrower than this question.]*
14. Does the **admin exposure view** (aggregates only) need an access-control or audit-logging rule beyond
    the existing admin guards?
    *[v0.2 DISPOSITION: A — for counsel; non-blocking.]*
15. Is **data protection by design/default** satisfied by "no opt-out"? Should viewing-for-points be
    **off by default for minors**, with an opt-in?
    *[v0.2 DISPOSITION: A — for counsel; non-blocking. The founder decided "same rules for minors" (#382 to #385, #404, B; counsel's view not recorded).]*
16. Should a **fresh DPIA section or a separate DPIA** be completed for the contest as a whole (not only
    view data), given it is new processing of children's data?
    *[v0.2 DISPOSITION: A — for counsel; non-blocking.]*

---

## 10. Sign-off

This block is intentionally empty. A completed addendum requires a competent person to challenge and sign
it.

| | |
|---|---|
| Reviewed by counsel | NOT YET |
| Name / firm | |
| Date | |
| Outcome (approved / approved with amendments / rejected) | |
| Founder acknowledgement | |
| Decision Log entry created | |

---

**[v0.2 CHANGED — #532]** *v0.2 note: a narrow refresh (changelog, disposition markers on all 16 questions, notes beside the statements B-300 and B-307 changed). It chooses no option, applies nothing, claims nothing as solved and records no counsel position, because counsel has not reviewed this file.*

## Closing statement

This addendum exists to put in front of counsel exactly what the contest and points work stores about
what signed-in accounts, including children, look at: one short-lived and aggregated store (A and B), two
durable stores with **no retention period and no deletion on anonymisation** (C and D), and no notice to
the viewer or the guardian. It makes **no** claim that any of it is lawful, proportionate or compliant.
