# DPIA v0.6, post-media addendum v0.4 and incident plan v0.4: report retention restored, acting vetting, appeals (2026-11-11)

**DRAFT FOR COUNSEL — NOT APPROVED, NOT LEGAL ADVICE** (`CLAUDE.md` non-negotiable #2). Safeguarding-drafter work, docs only. Branch
`legal/dpia-incident-retention-restored-2026-11-11`, cut from `origin/main` `e6bcf0e`. Decision Log numbers **#490 to #494** are the docs PR's
(register Section 85); this change does not edit the Build Plan docx or the register.

**What this change is not.** It does not complete, advance or approve the DPIA, closes no risk, and adds no counsel position. The DPIA Section 6
sign-off block is still empty ("Reviewed by counsel: NOT YET"). No statute, regulator guidance or case law was retrieved. Nothing was run against
a live environment. Facts were read from the merged code on `origin/main` `e6bcf0e` (PRs #730, #731, #732, #735).

## Files changed

| File | From → to | What |
|---|---|---|
| `docs/sprint-1-dpia-outline-draft.md` | v0.5 → v0.6 | Changelog; §1.3 (row and note); §2.4; R33(c) and R33(f) updates; R34(b); R35 (one in-place edit and a new update block); R36 (in-place edits to (b) and (d), new (g), (h), (i)); §4 rows R34, R35, R36; §5 items 36, 37, 39, 41 reworded and items 42 to 47 added; closing note |
| `docs/dpia-addendum-post-media-draft.md` | v0.3 → v0.4 | It states the report figure in four places; all changed; new "Update to §1.5 (v0.4)" block |
| `docs/incident-response-and-breach-notification-plan-draft.md` | v0.3 → v0.4 | New "v0.4 changes" section; the reports rows, the pause note, Q8, Q21, §3, §4.10, §8.4; new Q24 |

Not touched (as instructed): the legal copy draft, the Build Plan docx, `docs/build-register.md`, `docs/pending-copy-manifest.md`.

Every changed passage carries `[CHANGED v0.6 — 2026-11-11]` (DPIA), `[CHANGED v0.4 — 2026-11-11]` (addendum) or `[v0.4 CHANGED …]` (plan). New sentences are tagged
`[COPY PENDING LEGAL REVIEW]` where they are customer-facing (the addendum carries it as its standing banner; the other two files have no customer-facing text).

## What changed, point by point

### 1. Report retention is 6 years, 7 for a child-safety report (Decision Log #490)

- Read in `report-retention.config.ts`: `DEFAULT_REPORT_RETENTION_YEARS = 6`, `DEFAULT_REPORT_RETENTION_CONCERNS_MINOR_YEARS = 7`; settings
  `REPORT_RETENTION_YEARS` and `REPORT_RETENTION_CONCERNS_MINOR_YEARS`; `REPORT_RETENTION_MONTHS` is gone. All in-place statements of "12 months / 6 years" for
  reports were replaced (the DPIA's v0.4 to v0.5 changelog, which is history, was left as written).
- **Where the range comes from.** The legal draft v0.7 "resolved decision 10" records "6–7 years for data tied to a concluded investigation or moderation case". This
  draft relies on that record; it has not seen counsel's advice.
- **R36(h) says plainly that this is a larger store:** the typical report is kept six times as long as v0.5 said (6 years instead of 12 months), a
  child-safety report one year longer, and R33(c) now records that a reported message and its up-to-20 context messages from a child's private chat can survive for
  the same period. This is the largest increase in how long children's private messages can be kept, and it comes from the report clock, not from the 12-month message rule.
- **Mitigations recorded are only ones that exist in the code:** the sweep (04:15, cap 100 per run, re-checked in the transaction, counts-only log); moderator/superadmin-only
  access on a separate admin domain; the vetting gate; vetted-only message context (#486); the admin action log, which the sweep never touches. **Not invented:**
  none for the following, which are stated as absent — no field-level encryption of `Report` columns; reading a report is not logged (the action-log constants have
  no view action); this pass found no step that minimises a report between closure and deletion; backups and R2 versioning not examined.

### 2. Acting on a message report involves a vetted admin (Decision Log #491, B-297)

Read in `moderation.service.ts` (`assertVettedToActOn`): a `concernsMinor` report needs a vetted admin as before; a message report also needs one when the reported
sender or any participant is under 18 (fail-closed: missing message row, or a participant with no user row, counts as a child). Used by `actionReport`, `decideAppeal`
and the staff-recorded appeal. R33(f)(iii) and R35(c)(vi) are narrowed, not closed.

### 3. The staff-recorded appeal and the Contact Us category (Decision Log #492, B-292, B-298)

Read in `recordAppealOnBehalf` and `decideAppeal`: only for a `user_suspended` action, report actioned and not already appealed, reported account must exist and not be
anonymised, same 30-day window, reason required, vetting gate as above, the recorder stored in `appealRecordedByAdminId` and barred from deciding (and so is the
original actioner, #138). The reported person is sent nothing. The action log records the status only, never the reason text. `suspension_appeal` is the seventh Contact
Us category in `contact.constants.ts`. **A pending appeal pauses the closure clock**, so the report stays out of the sweep (intended).

**What a suspension appeal puts in the database** (R35 update, items 1 and 2): the Contact Us enquiry (name, email, subject, message, and — per the B-298 register row —
a helper line asking for the account's email); the staff-typed reason in `Report.appealReason`, kept as long as the report. **The enquiry inbox has no vetting gate.**

### 4. Suspension rulings (Decision Log #494)

No legal-hold check on a suspension is recorded as a founder decision, no counsel position; the reinstatement email says nothing about points; emails as built are the
source of truth. R35(b)(iii) amended.

### 5. Recorded-not-decided points, stated as open (register Section 85c)

1. **The suspension email goes to the address on file** (R35 update item 6; §5 item 46; plan §4.10 and Q24(c)).
2. **A held report keeps its enquiry until the report is purged** (R36(i)(4); §5 item 47; plan §8.4 and Q24(a)). Reason read in code: the 12-month enquiry job never
   deletes an escalated enquiry; `report-retention.service.ts` detaches the enquiry only when it purges the report.

Also recorded, from the same sweep: a hold record that points at a purged report now stays with `reportId` cleared (migration `20261129090000_account_hold_report_detachable`);
the Contest-entry and context-of-another-report blocks stay.

## Who each question goes to

Only these are marked **[ACTION FOR REVIEW]** (counsel): whether a **dismissed** or bad-faith report is "data tied to a concluded investigation or moderation case" and
so inside the approved range; whether the 6/7 split by `concernsMinor` is the split counsel meant (DPIA R36(g), §5 item 42); and, in the plan, whether counsel wants the
suspension-appeal enquiry exposure limited (Q24(b), the design part is the founder's). Everything else new is **[FOR FOUNDER — not a counsel blocker]**: the inbox gate, the
remaining ungated actions, reads of child-flagged reports not logged, minimisation at closure, the suspension email address, a held report's enquiry, how long
context messages and removed text should live.

## Findings from reading the code (not fixed; recorded in the drafts)

1. **The hold routes (place or lift a legal or bad-faith hold) gate on `concernsMinor` only** (`moderation-holds.service.ts` `assertVettedForMinorReport`), not on the
   participants' ages, so a non-vetted moderator can place or lift a hold on a message report between two children. A hold keeps data longer (R36(e)).
2. **The user-page suspension (`PATCH /admin/users/:id`) has no vetting call** in `admin-users.service.ts` (found by search, not tested).
3. **Post, comment and user reports about a child** under a category other than `child_safety_concern` can still be actioned, including suspended, by a non-vetted moderator.
4. **The Contact Us "Appeal a suspension" category is accepted by the API only.** `suspension_appeal` appears nowhere under `apps/web` or `apps/admin` (search on
   `origin/main` `e6bcf0e`), so the web page and the admin inbox filter do not offer it yet.
5. **Contest entries:** the "removed post is a Contest entry" block (R36(d)) is stated as it was; this pass did not check whether Decision Log #488 is built.

## Not verified / limits

- Counsel's advice behind "6–7 years" was not seen; only the legal draft's record of it. Jurisdictions other than the draft's baseline were not checked.
- Nothing was run: no test, no sweep, no email. The behaviour of `recordAppealOnBehalf`, `assertVettedToActOn` and the sweep was read, not exercised.
- The helper line wording of the seventh Contact Us category and the Figma pass V frames were not read; the description relies on build-register row B-298 and the API constant.
- The user-page suspension's lack of a vetting call is a negative found by search.
- Backups, R2 versioning and the provider's own copies of reports were not examined.
- Stale text noticed and not edited: the v0.5 "still visibly stale" list in the DPIA is unchanged (its items (a) to (e) stand), and v0.3 incident-plan table rows that recite the
  12 months / 6 years are kept as the v0.3 record with a pointer (v0.4 changes, item 1).
