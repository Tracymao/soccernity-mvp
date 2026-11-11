# DPIA refresh, 2026-11-11: suspension on a report, message context, report retention, hold rules

Written for: the founder and, through the founder, Soccernity's legal counsel (and whoever maintains the two DPIA files). Draft only.

**Status: DRAFT FOR COUNSEL. NOT APPROVED. NOT LEGAL ADVICE.** Per `CLAUDE.md` non-negotiable #2, nothing in the two changed files is
approved by this refresh. Both sign-off blocks are unchanged and empty ("Reviewed by counsel: NOT YET"). No lawful basis was chosen, no
residual risk was rated, no earlier `[PROPOSAL]` or `[ACTION FOR REVIEW]` was accepted or closed, **no risk is closed by having been
drafted**, and no legal proposition was checked against a statute, regulator text or case law (the DPIA's own section 0 item 5
limitation applies to everything added).

Branch `legal/dpia-refresh-2026-11-11`, cut from `origin/main` `0e440bf`. Docs only. Not merged: Temi verifies and merges. Read first:
`docs/dpia-refresh-2026-11-10-report.md` (R33, R34).

## What was changed

Two files plus this report and one `CLAUDE.md` status bullet. Every changed passage carries a marker: **[CHANGED v0.5 — 2026-11-11]** in
`docs/sprint-1-dpia-outline-draft.md` (v0.4 → v0.5, 23 markers) and **[CHANGED v0.3 — 2026-11-11]** in
`docs/dpia-addendum-post-media-draft.md` (v0.2 → v0.3, 9 markers). Each file has a new changelog block at the top. Nothing else was
edited: not the legal draft, the incident plan, the Log Book, any `.docx`, the build register, or code.

### `docs/sprint-1-dpia-outline-draft.md` (DPIA, v0.5)

| Where | Change | Source of the facts |
|---|---|---|
| Header, new changelog "v0.4 → v0.5" | States what the update is and is not, lists the four subjects and the stale passages **noticed but not edited** | n/a |
| §1.3 (after the v0.4 report paragraph) | `User.suspendedByReportId` (account → the one report that caused its suspension, `ON DELETE SET NULL`); the report is now deleted by a sweep | `schema.prisma`; migration `20261127090000_add_user_suspended_by_report`; `account-suspension.service.ts` |
| §2.2 `Report.reason` row | Retention now exists for a closed report (R36) | `report-retention.service.ts` |
| §2.4 (after the v0.4 paragraph) | "No retention clock exists for a report" is no longer true for a closed report; still true for open, appeal-pending, escalated, held and blocked reports | `report-retention.service.ts`; Decision Log #487 |
| R33(c) | **Update:** closed reports are deleted (12 months / 6 years), context messages fall to the 12-month message sweep | `report-retention.service.ts` |
| R33(f) | **Update (answers the vetting-gate finding):** for a non-vetted admin, the report detail reads `isMinor` of the sender and every participant; if any is under 18 (fails closed) it returns `contextHidden: true`, no context and no edited original. **What remains stated:** the bare reported message is still visible; the requirement to *act* still keys off `concernsMinor`; post/comment/user reports not gated by participants' ages; the age flag lags up to about a day; only the report-detail read was checked | `moderation.service.ts` (`getReportById`, `threadInvolvesMinor`); `moderation.message-context-vetting.spec.ts`; Decision Log #486 |
| R34(b), (a), (f) | **Update (b):** a clock now exists through the report sweep; **(a):** the removed-message stub carries `isMine`; **(f):** Contest effect decided by #488, not checked whether built | `report-retention.service.ts`; `messaging.service.ts`; Decision Log #488, #489 |
| **New R35** | (a) what is built (suspension on a report, offered for user/post/comment/message targets only; sessions ended, points revoked and not restored, guardian told the kind of action unless withheld, person emailed, pointer stored); (b) notice to the person and the **tipping-off** question (immediate automatic email, fixed category-based reason line, generic line for `child_safety_concern`/`other`; no switch to withhold the person's email; no hold check); (c) **wrongful suspension**: protections and gaps as built (no way for a suspended person to file an appeal through the product, B-292 not built; points not restored; no duration or review; pointer lost on report deletion; non-vetted moderator can suspend a child on a message report whose context is hidden) | `account-suspension.service.ts`; `moderation.service.ts`; `registration-email.service.ts` (`suspensionReasonLine`); `feed.service.ts` author filter; Decision Log #485, #458, #138 |
| **New R36** | (a) what a report holds; (b) the clock: 12 months, 6 years if `concernsMinor`, from `reportClosedAt`, 100 per run, **6-year figure unverified for UK law**; (c) what is deleted with it and in what order; (d) what keeps or blocks a report (holds, escalation, removed-media rule, other open report; hold record, contact-enquiry escalation, Contest entry, context of another report); (e) the **hold rules compared** across messages, removed-post files, reports and anonymisation; (f) effects on R33/R34 | `report-retention.service.ts`, `report-retention.config.ts`; `account-hold.rules.ts`; `rejected-media-evidence.util.ts`; `message-retention.service.ts`; Decision Log #487, #482, #484, #466, #442 |
| §4 mitigations table | New rows R35 and R36 after R34; a marked sentence appended to the R33 and R34 rows | as above |
| §5 open items | New items 35 to 41 | as above |
| Closing statement | v0.5 note | n/a |

### `docs/dpia-addendum-post-media-draft.md` (post-media addendum, v0.3)

| Where | Change | Source of the facts |
|---|---|---|
| Header, new changelog "v0.2 → v0.3" | Scope limited to a removed post's files; the v0.2 stale-body warning is repeated, not fixed | n/a |
| End of §1.5, new "Update to §1.5 (v0.3)" (five points) | (1) the report sweep now deletes the post and its `PostMedia` rows with the report, which **partly answers finding 4**; (2) when the sweep keeps the post, and that a Contest entry is blocked; (3) **finding 1's "approved while removed" gap is closed for the two approval paths** (file marked approved, no public copy made); (4) finding 3 restated, pointing to DPIA R36(e); (5) what is unchanged | `report-retention.service.ts`; `media-check.service.ts`, `post-media-decision.service.ts` (B-296); `rejected-media-evidence.util.ts` |
| R30 | One marked paragraph: `PostMedia` rows of a removed post now go with the post | as above |
| §12 | Question 23 extended (23a); new questions 24 and 25 | as above |
| Closing statement | v0.3 note | n/a |

## What each of your four items now says, and what it does not

1. **Suspension on a report.** New R35 (tipping off; wrongful suspension, mitigated only by an appeal route and automatic reinstatement
   that **cannot currently be reached by the suspended person**, see below). It is described "as built", with the gaps in the same
   paragraph as the mitigations.
2. **Vetted-only message context.** R33(f) is amended: the gap is **narrowed, not closed**. What remains is listed (bare reported
   message still visible; acting still keys off `concernsMinor`; non-message reports not covered).
3. **Report retention.** New R36; R33(c), R34(b) and §2.4 amended. The statement that reports had no retention clock is replaced by
   a precise one (closed reports only), **as drafted, not as approved**. The 6-year figure is marked unverified for UK law.
4. **Hold rules.** Restated as a four-row table in R36(e) and in addendum §1.5. Not resolved: whether the differences are intended.

## Things I found that you should know

1. **A person suspended by a report has no working appeal route today.** `POST /reports/:id/appeal` accepts an appeal only from the
   signed-in reported user (`ModerationService.appealReport`); a suspended user cannot sign in; Contact Us has no path that turns an
   enquiry into an appeal; the staff-recorded appeal (B-292) is **not built** (the register row says so). So the "automatic
   reinstatement on an overturned appeal" mitigation (Decision Log #485) cannot currently be reached, and the 30-day appeal window
   runs. R35(c) says so plainly.
2. **A non-vetted moderator can suspend a child on a message report whose context is hidden from them.** The vetting requirement to
   act (`assertChildSafetyVetted`) applies only when `Report.concernsMinor` is true; B-293 hides *context* but does not extend the
   requirement. Recorded in R33(f)(iii) and R35(c)(vi).
3. **No hold check on suspension.** Neither `AccountSuspensionService` nor the lines of `actionReport` that call it consult
   `AccountHold`. (Grep of `moderation.service.ts` and `account-suspension/*.ts` for `findActiveAccountHold`/`accountHold`: no
   match.) R35(b)(iii).
4. **No way to withhold the email to the suspended person.** The #458 flag withholds guardian notices only.
5. **A deleted report empties `User.suspendedByReportId`** (`ON DELETE SET NULL`), leaving a suspended account that can only be
   reinstated by hand. The sweep's own header comment says so. R35(c)(iv).
6. **The retention sweep leaves several cases open-ended**: open and appeal-pending reports (no closure), escalated reports (until
   B-206), reports under an active admin hold, and four "blocked" cases, including any removed post that is a Contest entry.
7. **The hold rules really are four different rules** (messages: legal only; removed files: legal or bad-faith; reports: legal or
   bad-faith plus escalation and others; anonymisation: any hold). A bad-faith hold on a reporter keeps their reports but not their
   old messages. "The accounts involved" in the report sweep is the builder's reading (register Section 84b).
8. **B-296 closed one gap v0.2 recorded**: a file approved while its post is removed is now approved but not published
   (`media-check.service.ts`, `post-media-decision.service.ts`). The other window (a failed background withdrawal leaves the public
   object for up to about 5 minutes) is unchanged.
9. **Ordering detail**: the report sweep (04:15) deletes the report and its context links; a reported-but-not-removed message is
   then deleted by the message sweep at the next 04:00 run, not the same night.
10. **Stale text noticed and not edited** is listed in each changelog (DPIA: §2.4's older sentences, R8/§1.2 media path, R9, R2(e), R34(f)
    Contest wording vs #488; addendum: the v0.2 stale-body list).
11. **Not verified**: any live behaviour; whether Decision Log #488 (removed Contest entries) is built; backups and R2 versioning for
    hard-deleted data; whether a staff read of a reported message is logged; every legal proposition. All stated in the files.

## Verification

- `git fetch origin`; branch cut from `origin/main` `0e440bf`. B-291 (PR #722), B-293 (PR #721), B-294 (PR #725) and B-296 (PR #724)
  are merged on that commit (`git log --merges`).
- Every factual claim was checked against code read on that commit, not only against reports: `account-suspension.service.ts` (phases,
  outcomes, pointer rules), `moderation.service.ts` (`threadInvolvesMinor`, `getReportById` message branch, the `user_suspended`
  gate and calls, `appealReport` guard), `report-retention.service.ts` and `.config.ts` (clock, skips, blocks, order, cap, 04:15),
  `account-hold.rules.ts` (`findActiveAccountHold`), `rejected-media-evidence.util.ts`, `message-retention.service.ts` (legal hold
  only), `media-check.service.ts` and `post-media-decision.service.ts` (B-296), `registration-email.service.ts`
  (`suspensionReasonLine`, both emails), `feed.service.ts` (author filter), `messaging.service.ts` (`isMine`).
- Both files keep their original CRLF line endings throughout (DPIA 1,762 lines, addendum 861; no mixed endings). The only removed
  lines in `git diff` are header/version lines and three table rows that were extended in place.
- No code, `.docx`, register, legal draft, incident plan or Log Book changed. No tests run: docs PR.
