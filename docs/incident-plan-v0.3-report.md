# Incident-response plan: v0.2 to v0.3 change report

> **Draft only, for counsel. Not approved, not legal advice** (`CLAUDE.md` non-negotiable #2). Date: 2026-11-11.
> File changed: `docs/incident-response-and-breach-notification-plan-draft.md`. Not edited: the legal draft, the DPIA, the Log Book,
> any docx, `docs/build-register.md`, any code. **B-206 is untouched** (it stays with counsel); the plan only points to it.
> Every changed passage carries `[v0.3 CHANGED — source]` (30 marks); a change table sits at the top of the plan.
> New customer-facing wording is tagged `[COPY PENDING LEGAL REVIEW]` (one template, §10.7).
> Read against `origin/main` `0e440bf`.

## Changes, by fact in the brief

| # | Plan section | Change | Source |
|---|---|---|---|
| 1 | §1 (new rows), §4.10 (new), §4.9, §5 steps 1 and 3, §8.2, §8.4 (new), Q22 | Soft removal (#483): row and text stay for staff, the public copy of media is withdrawn at once, a private copy is kept until the removing report closes. The plan lists what a responder triggers and says the text stays in clear text. | `moderation/README.md` ("`actionTaken`"), `post-media/README.md` ("Media of a post removed by moderation", B-296) |
| 2 | §1, §2 S2, §4.1, §4.6, §4.10, §7.5, §10.7 (new), Q20 | Suspension (#485): same code from the user page and from a report; sessions end, earned points are revoked and not restored, a minor's guardian is told once, **the person is emailed** with a fixed reason line. §4.10 gives cautions for using it as containment. New template 10.7, hand-sent, tagged. | `account-suspension/account-suspension.service.ts`, `moderation/README.md` ("Recording `user_suspended`"), `admin-users/README.md` |
| 3 | §1, §8.2, §8.4 (new), §9.1, Q21, Q8 | Report retention (#487): 12 months after closure, 6 years if `concernsMinor`, nightly at 04:15; skipped for legal and bad-faith holds, escalated reports and the B-206 hook; the action log is never touched. §8.4 states what that means for an incident that needs old evidence. | `moderation/README.md` ("Report retention") |
| 4 | §1 context row, §3, Q23 | #486: an unvetted admin sees no message-report context and no edit original when the sender or any participant is under 18. The plan notes that an incident assessor may need a vetted admin. | `moderation/README.md` ("Vetted-only context") |
| 5 | §8.2 messages row, Q19 | #482: an active legal hold on a message's sender or any participant keeps the message. The v0.2 statement that a legal hold did not stop the job is marked superseded. | `messaging/README.md` ("Held accounts") |
| 6 | §1 closing paragraph, §1 audit row, §4.9 | `GET /admin/action-log` exists (PR #607); the v0.2 statements that no read endpoint exists are corrected. (v0.2's report flagged this for v0.3.) | `admin-action-log/README.md`, `app.module.ts` |
| 7 | §3, §5, §8.4 | Where these sit in roles and evidence steps: moderator or superadmin record removal, suspension and holds; the incident lead decides whether; preserve first. | derived from 1 to 6 |

## Points the brief did not name, found while reading, recorded in the plan

- The suspension email goes to the address on file; if an attacker changed it, the victim is not told (inferred from the sender reading `User.email`, not tested). Q20.
- A removal does not erase anything; it can start the report's retention clock (closure = review plus the appeal window).
- No pause switch for the two nightly retention jobs; no staff tool to restore removed content except overturning an appeal; B-292 (staff-recorded appeal) is decided, not built.
- Content removal can only be recorded on a report; whether an admin can file one is inferred (marked `[UNVERIFIED]`).

## Not changed

§6 (legal timelines), §7.1 to §7.4, §10.1 to §10.6, §11 and Q1 to Q18 apart from Q8 and Q19 are as in v0.2. §8.3 (rejected media and possible CSAM) is untouched.

## Not verified

Nothing was run against a live system. The 6-year figure has no legal source. The Decision Log docx was not opened; #482 to #487 were taken from `CLAUDE.md` and `docs/docs-suspension-retention-decisions-2026-11-11-report.md`, and the behaviour from the module READMEs and `account-suspension.service.ts`, not from running code. No tests run (docs only).
