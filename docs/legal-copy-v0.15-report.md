# Legal copy v0.15 -- suspension, appeals, message reports, report retention (report)

Draft only (`CLAUDE.md` non-negotiable #2). `docs/legal-copy-draft-tos-privacy-policy.md` moves v0.14 to v0.15, still NOT APPROVED. Nothing here is legal advice and counsel has not seen any of it. Written for: the founder and counsel reading the diff.

Decisions used: Decision Log #485 (suspension), #486 (message context visibility), #487 (report retention), #489 (data export unchanged), read from the Build Plan docx on `main` (the docs PR #720 is merged). Also read: #456, #458, #459 (guardian notices), #477, #478, #482, #483, #484. All are the founder's decisions, not counsel's.

What is built on `main` (checked in the code, read not run): suspension on a report and the two emails (PR #722); the vetting rule for message context (PR #721); the web and admin message-context step; the report-retention sweep (PR #725, `report-retention.service.ts`, defaults 12 months and 6 years, both configuration). **Not built:** staff recording an appeal on a person's behalf (B-292; no such route in `services/api/src/modules/moderation`). So Terms 7.9 is marked `[PROPOSAL, not yet built]` and the others are not.

## What changed in the draft

| Where | Change |
|---|---|
| Header, version line | v0.14 to v0.15; one clause added to the version history. |
| v0.15 changelog | New, above v0.14's. |
| Terms 7.3 | One tagged pointer sentence to 7.9 for a person who cannot sign in. |
| Terms 7.5 | One tagged sentence: when the report is deleted, the removed item is deleted with it. |
| Terms, new 7.8 | Suspending an account: email at once, short reason in plain words, how to appeal, no duration, can be lifted (by a moderator, or automatically when an appeal against the causing report succeeds), reinstatement email, guardian "normally" emailed. |
| Terms, new 7.9 | Appealing a suspension through the Contact Us page; staff record it on the person's behalf. `[PROPOSAL, not yet built]`. |
| Terms, new 7.10 | Reporting a message: what can be attached, who sees it, and that where a child is involved only specially vetted staff see the context and the original of an edited message. |
| Terms 8.6 | One tagged pointer to 7.8. |
| Privacy Policy 1.6 | One tagged sentence: we record the suspension, the reason category and, where relevant, the report that led to it. |
| Privacy Policy 8 | The "if a message is reported" paragraph gains the vetted-staff rule. |
| Privacy Policy 9, table | "Moderation reports and actions" row rewritten (12 months / 6 years, how a report closes, what is kept longer, deletion order, the staff action log, the 6-year figure marked unverified); "Content a moderator has removed" row now ends with deletion with the report. |
| Privacy Policy 9, text | One sentence added to "Content a moderator removes, stated plainly". |
| Part C | New rows 52 (report retention), 53 (suspension and appeals), 54 (message visibility). Short bracketed notes appended to rows 40, 46(a), 46(c) and 49(e), which the new text made stale. |

Every new sentence carries `[COPY PENDING LEGAL REVIEW]` (bold in prose, plain in table cells, as the file already does). Nothing outside the draft, this report and `CLAUDE.md` was touched. `apps/web` renders the draft on `/terms` and `/privacy`; `LegalPage.test.tsx` was run: 8 tests, 0 failures.

## Places I decided not to promise something

- **Duration of a suspension.** The draft says we do not promise how long one lasts.
- **Appeal period length.** "The time allowed for appeals", never a number of days (configuration, and not counsel-sourced, Part C row 40). The "closes" definition in section 9 is also described, not stated in days.
- **The report-retention periods are stated (12 months, 6 years)** because the brief asked; they are configuration in code, so counsel should know the public text and the code can drift. The 6-year figure is marked unverified.
- **The exact number of attachable context messages (10 and 10).** Public text says "a limited number"; the figure stays in Part C row 54.
- **Reasons in the suspension email.** The draft says "a short reason in plain words (for some reasons only a general one)". It does not say that a child-safety report, "other", or no category gives only "breaching our community rules".
- **Points.** It does not say engagement points are revoked at suspension and not restored.
- **Holds.** No guardian notice for any hold is mentioned anywhere (Decision Log #459). The hold wording that already existed in 8.4 and section 9 was not changed.
- **The guardian notice is "normally", not "will".** Both 7.7 (v0.14) and the new 7.8 use "normally" because a child-safeguarding admin can withhold these emails for one account without any visible trace (#458). The exception is not written into the public text; Part C rows 51 and 53 say so.
- **Appeal outcomes to a guardian.** The code can email a guardian about an appeal outcome (B-279), but I did not add it to the text; it is not in the brief and #456 group A lists it only generally.
- **The other person in a reported chat, and the reported person, being told about attached messages.** Not stated; Part C row 54(d).

## Guardian-notice check against #456 to #459

| Draft sentence | Checked against | Result |
|---|---|---|
| 7.8: guardian "normally" emailed about a suspension or its lifting, kind of action and time only | #456 A (platform actions on a minor's account notify the guardian) | Consistent; uses "normally". |
| Same sentence | #458 (withhold exception: every B-275 and B-279 notice skipped silently for one account) | Consistent only because of "normally"; exception not written in. Counsel decides whether to say more (row 53). |
| Same sentence and all of 7.8 to 7.10 | #459 (no hold ever notifies a guardian) | No sentence mentions a hold notice. |
| 7.10 / Privacy Policy 8: reporting a message | #456 B and C (a minor's own report is not told to the guardian; a report about the minor is told only by outcome) | No guardian notice is promised for filing or receiving a report; the text says "filing a report does not by itself tell anyone". |
| 7.7 (v0.14, unchanged) | #456 A, #458, #459 | Unchanged and still consistent. |
| 3.6 (turned-18 email), 3.3 (guardian-email-replaced), 11 (breach notice to guardian) | #458 (4): these keep working under the exception | Not touched; consistent. |
| 7.2 "both the person who reported and the person reported are notified of the outcome" | #456 C | Not touched; says nothing about guardians. |

## Other things I noticed (not fixed unless stated)

1. **Stale text updated in place (bracketed notes, Part C only):** row 40 and 46(c) and 49(e) referred to the "6--7 year" moderation retention; row 46(a) said the message-retention job does not pause for a legal hold, but Decision Log #482 (PR #711) made it pause for an active legal hold. The public messages text in sections 8 and 9 does not mention the legal-hold exemption; I did not add it (not in the brief).
2. **Terms 13 and Privacy Policy 1.9 still mark the Contact Us form `[PROPOSAL, not yet built]`**, but the page and the admin inbox are built. Not changed (outside the brief); referenced in row 53(e).
3. **The removal of Contest entries (#488) and the data-export / removed-message stub (#489) are not in the draft.** #488 changes ranking and points, not a data-protection disclosure; #489 confirms the export is unchanged. Part C row 49(b) (the export still includes a person's own removed items) stands.
4. **Row 49(a) not re-checked:** whether an author can still delete their own removed post was raised in v0.14; `backend/b296-removal-followups` is on `main` and may have changed it. I did not re-read it.

## Open questions for counsel (real blockers only)

1. **The report retention figure replaces counsel-approved wording.** The 6--7 years line in the "Moderation reports and actions" row was counsel-approved (resolved decision 10 in the v0.7 changelog). The founder has now set 12 months (6 years for a child-safety flag). Counsel must say whether that stands, and whether 6 years is right for UK law and for Nigeria (Part C row 52 (a)).
2. **Conflict between Terms 7.3 and a direct suspension.** 7.3 says an appeal is "always" reviewed by a different member of staff; the founder's rule for a suspension made without a report has no second-reviewer requirement (Part C row 53 (b)).
3. **Reports that outlive the period with no end date** (escalated for statutory reporting, legal hold, an active hold on an involved account, or blocked by a dependent record) and an action log with no retention period (row 52 (c) to (e)).
4. **Suspension email to a minor goes to the child's own address**, and a suspension has no duration (row 53 (a)).

Smaller questions (the guardian-notice word "normally", who decides a staff-recorded appeal, the in-app sentence not mentioning the vetted-staff rule) are in Part C rows 53 and 54.

## Not done / not touched

The DPIA, incident plan, Log Book, any `.docx`, `docs/build-register.md`, `docs/pending-copy-manifest.md` and all code were not touched. No manifest row was added: the manifest and its inventory test cover strings in `apps/web` and `apps/admin`; the suspension email wording is already in the manifest's `services/api` section, and the new sentences here are legal draft text. The Decision Log forward-pointers and register status lines belong to the next docs PR.
