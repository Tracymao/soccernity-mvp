# Incident plan v0.6 to v0.7 — report

*Draft for counsel review — not approved, not legal advice (CLAUDE.md non-negotiable #2). Docs only. Nothing was run; CI cannot be read from here. The Security session could not be asked (this session is non-interactive).*

Branch `legal/incident-plan-v07-counsel-refresh`, base `origin/main` `014afcd`. Edited file: `docs/incident-response-and-breach-notification-plan-draft.md` (v0.6 to v0.7, CRLF kept, 0 LF-only lines). Not touched: the Build Plan docx, `docs/build-register.md`, `docs/pending-copy-manifest.md`, the runbook, `docs/deployment.md`, code, Figma, other drafts.

## Why

Counsel has not yet reviewed legal copy v0.16, DPIA v0.8, plan v0.6 or the tagged strings. The founder wants counsel to get current documents and **one** list holding only unresolved items that need a lawyer. Every question in section 12 (Q1 to Q24) and the US/EU questions in sections 6.3 and 6.4 now carries a `[v0.7 DISPOSITION: A|B|C|D — reason]` marker. Nothing was dropped or deleted; the old v0.6 text of every changed passage is kept next to the marker.

## Changes (each marked `[v0.7 CHANGED — #n]` in the plan)

| Place | Change | Source |
|---|---|---|
| Title, blockquote | v0.7; also reflects #524 to #532 | brief |
| New "v0.7 changes" block | Seven numbered items; explains the re-sort | brief |
| Section 0 | Decision Log #4 reads "Resolved — signed off" (scope UK, Nigeria, US, EU; no EU representative; card verification is the COPPA control). Sign-off covers decisions, not prose | #4 |
| Section 1, "removed post media" and "Photos and videos" rows | Uploads on at launch; set-aside files kept 365 days by default, past account deletion; profile pictures and covers included, file-level only | #524, #525, #530 |
| Section 4.7 | Uploads go on at launch, `MEDIA_UPLOADS_ENABLED` is the incident off switch, no counsel gate (v0.6 sentence kept); Docker image with ffmpeg and ffprobe, proven locally only | #524, #527, #529 |
| Section 4.10 | New table row for "set aside as suspected illegal imagery"; new paragraph saying a set-aside is not Remove Content and not a hold, is file-level, has its own clock | #525, #530 |
| Sections 6.3, 6.4 | Disposition A for Q-US1 to Q-US4 and Q-EU1 to Q-EU4 (the Decision Log has no decision on any of them) | brief |
| Section 8.2 | New row for a set-aside file and its record | #525 |
| Section 8.3 | Rejected-media bullet updated; **one new paragraph** on how a responder treats a set-aside file (do not delete; do not open unless child-safety-vetted; filing is made by a vetted admin outside the platform; no prepared route until the founder registers with a receiving body; file-level only for profile pictures and covers; welfare and vetting is the founder's HR duty); detection (IWF Image Intercept first, Hive fallback) after launch and NOT BUILT; launching before hash-matching is the founder's accepted risk, not counsel's view | #524, #525, #526, #529, #530, #430 |
| Section 8.4 | New retention row; the escalated-report skip kept with a note that a set-aside has its own 365-day clock | #525 |
| Section 12 | Summary table of dispositions; Q22 rewritten (v0.6 text kept in the cell); Q21 narrowed; Q11 merged with the B-206 duties, non-blocking | brief |
| Section 13 / closing | Sources line; "End of draft v0.7" | — |

No new customer-facing wording was written, so nothing is tagged `[COPY PENDING LEGAL REVIEW]`.

## Disposition table

| Disposition | Items |
|---|---|
| **A — open for counsel** | Q2, Q3, Q4, Q5, Q6, Q7, Q8, Q11 (non-blocking, with the suspected-illegal-imagery duties), Q12, Q13, Q14, Q16, Q17, Q21 (narrowed), Q22 (rewritten), Q-US1 to Q-US4, Q-EU1 to Q-EU4 |
| **B — decided by the founder** | Q10 (#456), Q19 (#478, #482), Q20 (#503). Counsel's view is not recorded for any of them |
| **C — resolved, counsel signed off** | Q1 (#4) |
| **D — housekeeping** | Q9, Q15 |
| **NOT ASSIGNED — founder to say** | Q18, Q23, Q24 |

### Unclear, founder to say (evidence did not support the reading; not re-sorted)

- **Q18** (does the withhold-guardian-notices flag also stop a breach notice): the founder's reading was "B if decided". #458 and #459 say nothing about breach notices, so nothing was found to point to.
- **Q23** (who may read messages for a breach assessment): no decision found; #486 and #491 cover who sees report context and who may act, not this.
- **Q24**: only part (c) is covered by a decision (#503). Parts (a) (a legal hold has no end date) and (b) (the enquiry inbox has no vetting gate) are not covered by #492 to #494 as I read them.
- **Q19 residual**: whether the message-retention job should be paused while an incident is open is not decided anywhere. Marked B for the decided part; founder to say whether the residual is A.
- **Q20 residual**: whether points should be restored after a precautionary suspension, and whether the hand-sent note in section 10.7 is acceptable. Same.

### Other findings

- No Decision Log entry for the staff welfare and vetting duty exists; the plan records it as a founder statement from the brief.
- The DPIA addendum lists reviewer welfare as a counsel question; it conflicts with the founder's reading (HR duty) and was not edited.
- Register Sections 101 and 102 were not read directly; the statements about #524 to #532 come from the roll-forward reports and CLAUDE.md.
- Stale statements in other documents (legal copy Part C rows 37 and 46, DPIA files, the incident plan elsewhere) were not edited, per the brief.

## Not verified

No test or build was run. CI cannot be read from here. The built-behaviour statements are read from the merged builders' reports and module READMEs, not exercised. No real Render deploy, receiving-body registration or detection vendor exists.
