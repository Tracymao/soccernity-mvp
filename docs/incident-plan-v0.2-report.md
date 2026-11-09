# Incident-response plan: v0.1 to v0.2 change report

> **Draft only, for counsel. Not approved, not legal advice** (`CLAUDE.md` non-negotiable #2). Date: 2026-11-09.
> File changed: `docs/incident-response-and-breach-notification-plan-draft.md`. Not edited, as instructed: the legal draft, the DPIA,
> the Log Book, any docx, the build register. Every changed passage carries the marker `[v0.2 CHANGED — source]` in the plan, and a
> change table sits at the top of the plan (search "v0.2 CHANGED" to find all 21 marks).

## Changes, by fact in the brief

| # | Plan section | Change | Source file or entry |
|---|---|---|---|
| 1 | §0 "What the existing documents already say" | The #438 bullet no longer says "open under counsel"; it records that #456 settled it. | Decision Log #456 (as recorded in `CLAUDE.md`); `services/api/src/modules/guardian-security-notice/README.md` (event list, `login_locked` once per account per 24 hours) |
| 1 | §7.4 | One-line pointer replaced: the guardian is emailed when a sign-in lock trips, at most once a day. | same |
| 1 | §12 Q10 (table row and the long sub-section) | Q10 marked SETTLED. The five v0.1 options (A to E) are kept for the record, with a sentence on which one the founder chose in effect (every security action, throttled). Counsel questions that remain (privacy notice / DPIA treatment of the guardian email for this purpose; a stranger triggering a lock) are stated, not reopened. Every other open counsel question (Q1 to Q9, Q11 to Q17) is untouched. | same |
| 2 | §1 data table | New row: "Withhold guardian notices" flag and reason (`GuardianNoticeWithhold`), who can set it, that it is audit-logged, that no endpoint a minor, guardian or non-vetted admin can call returns it. | `admin-users/README.md` "Guardian notices"; `guardian-security-notice/README.md`; Decision Log #458 |
| 2 | §7.1 | New principle bullet pointing to §7.5. | #456, #458, #459 |
| 2 | §7.5 (new section) | What guardians are told today (security actions, safety actions, the fixed rules), that no hold ever notifies a guardian, how the withhold flag changes it (all notices skipped silently, not sent on clear, recovery goes the adult path), what is not affected (consent, withdrawal, expiry, turned-18, guardian-email-replaced), and what this means for a breach notice. | `guardian-security-notice/README.md` (events, safety table, holds, "What the withhold flag gates", sender table); `two-factor/README.md` "Recovery and the withhold flag"; Decision Log #458, #459, #480 |
| 2 | §12 Q5 | One sentence added: #456 tells guardians of security actions, not breaches; Q5 stays open. | #456 |
| 2 | §12 Q18 (new) | Does the flag also stop a breach notice to that guardian, and who decides given the reason is vetted-admin-only? | derived from the above; **no answer given** |
| 3 | §1 data table | Messages row rewritten: not end-to-end encrypted; server stores text; edit original kept; deleting hides, the 12-month job removes. New row for a reported message and the reporter-chosen context messages (up to 10 before and 10 after; staff-only through the report detail; vetting gate for minors; sender public name only). | `messaging/README.md` ("Edit, delete...", "Retention"); `moderation/README.md` ("Reporting a message in a chat", "Context messages"); Decision Log #477, #478 |
| 3 | §2 S1 example | Superadmin-session example now notes it reaches reported messages and their originals. | same |
| 3 | §8.2 evidence table | New "Messages" row: daily 04:00 job, 12 months from send, skips reported and context messages, snapshot first, no pause switch (inferred, flagged `[UNVERIFIED]`). | `messaging/README.md` "Retention" |
| 3 | §12 Q19 (new) | Retention window vs discovery of an incident; a legal hold does not stop the deletion job; message text is exposed by a database leak. | `messaging/README.md` "Retention" (held accounts); **no answer given** |
| 4 | §1 data table | New rows: `EmailChangeRequest` (hashed token) and `TwoFactorRecoveryRequest` (hashed tokens, one active per account, ended rows deleted after 30 days). | `email-change/README.md`; `two-factor/README.md` "Recovery" |
| 4 | §4.1 | Confirmed email change and completed recovery also end all sessions. | same |
| 4 | §4.3 | Users now have a self-service recovery route; how adult, minor and withheld-minor paths work; that password plus mailbox can remove second factor after the wait. | `two-factor/README.md` (Decision Log #455, #456, #480) |
| 4 | §4.9 | New gap: no staff tool to cancel a user's pending email change or recovery request (inferred from no admin route, `[UNVERIFIED]`). | module READMEs |
| 5 | (none) | **Searched the v0.1 plan for social sign-in, Google, Facebook, OAuth and `SocialIdentity`: no containment or data-held entry existed** (the only hit was the phrase "social engineering"), so there was nothing to delete. `services/api/src/modules/social-auth` is also gone from main (confirmed with `ls`). | grep of the plan; Decision Log #479 |
| - | Header, §13 | Version, status date and Decision Log list updated; new repo sources listed; footer says v0.2. | - |

## Things noticed and deliberately NOT changed (outside the five facts)

- **§1 and §4.9 and §8.2 still say there is no endpoint to read `AdminActionLog`.** `GET /admin/action-log` now exists (PR #607,
  Decision Log #464 option B; it hides the `user.guardian_notices_*` rows and date-of-birth rows from admins who are not
  child-safety-vetted). That makes those v0.1 statements stale. Left as is because the brief limited changes to five facts; a v0.3
  should correct them.
- §1 still says guardian consent and withdrawal tokens are stored un-hashed; not re-checked in v0.2.
- §4.4, §4.5 and the processor table were not re-verified against code beyond the changes above.

## What was not verified

- Nothing here has been run against a live system (the platform is not live).
- The "no pause switch" for the message retention job and "no staff tool to cancel a pending request" are inferred from reading the
  READMEs, not tested.
- Whether an email actually went out to a guardian is not recorded by the platform; stated in §7.5 as `[UNVERIFIED]`.
- Decision Log #456 to #459 and #476 to #480 were taken from `CLAUDE.md`'s record, not from the docx (the docx was not opened).

## Not touched
The legal draft, the DPIA, the Log Book, every docx, `docs/build-register.md`. No code. No tests run (docs only).
