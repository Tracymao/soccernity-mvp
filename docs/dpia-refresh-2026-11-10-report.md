# DPIA refresh, 2026-11-10: messages and content removal

Written for: the founder and, through the founder, Soccernity's legal counsel (and whoever maintains the two DPIA files). Draft only.

**Status: DRAFT FOR COUNSEL. NOT APPROVED. NOT LEGAL ADVICE.** Per `CLAUDE.md` non-negotiable #2, nothing in the two changed files is
approved by this refresh. Both sign-off blocks are unchanged and empty ("Reviewed by counsel: NOT YET"). No lawful basis was chosen, no
residual risk was rated, no earlier `[PROPOSAL]` or `[ACTION FOR REVIEW]` was accepted or closed, and no legal proposition was checked against
a statute, regulator text or case law (the DPIA's own section 0 item 5 limitation applies to everything added).

Branch `docs/dpia-refresh-2026-11-10`, cut from `origin/main` `29e0966`. Docs only. Not merged: Temi verifies and merges.

## What was changed

Two files, and only the four subjects asked for. Every changed passage carries a visible marker: **[CHANGED v0.4 — 2026-11-10]** in
`docs/sprint-1-dpia-outline-draft.md` (v0.3 → v0.4) and **[CHANGED v0.2 — 2026-11-10]** in `docs/dpia-addendum-post-media-draft.md` (v0.1 → v0.2).
Each file also has a changelog block at the top saying so. Nothing else was edited: not the legal draft, the incident plan, the Log Book, any
`.docx`, the build register, or code. `CLAUDE.md` gained one status bullet (its own "Keeping this file current" rule).

### `docs/sprint-1-dpia-outline-draft.md` (DPIA, v0.4)

| Where | Change | Source of the facts |
|---|---|---|
| Header (version, dates, drafted-by) | v0.4 added | n/a |
| New changelog "v0.3 → v0.4" | States what this update is and is not; lists the four subjects; lists stale passages **noticed but deliberately not edited** | n/a |
| §1.3 "Private communications" | Adds the new `Message` fields (`editedAt`, `originalContentText`, `deletedForEveryoneAt`, `removedByModerationAt`, `removedByReportId`), `MessageHide`, `ConversationHide`, `ReportContextMessage`; states **messages are not end-to-end encrypted** and at-rest encryption by the host is unverified | `services/api/prisma/schema.prisma` (`Message`), `modules/messaging/messaging.service.ts` |
| §1.3 "User-generated content" | Adds `removedByModerationAt` / `removedByReportId` on `Post` and `Comment`, and `PostMedia.deletedByModerationAt` | `schema.prisma`; migrations `20261125090000_add_content_removal`, `20261126090000_add_post_media_deleted_by_moderation` |
| §1.3 "Safeguarding and moderation" | A report can target a message and link up to 20 context messages | `modules/moderation/moderation.service.ts`, `moderation.constants.ts` |
| §2.2 table, `Conversation` / `Message` row | 12-month retention, original text of an edited message and reporter-chosen context are new data; no counsel position on 12 months | Decision Log #478, #477 |
| §2.4 first bullet | **Supersedes** the line that messages are kept under "[deleted user]" after anonymisation (the line the brief pointed at, around line 427): messages are now deleted 12 months after sending, except under a report, as report context, or under an active legal hold; the Article 17 question is narrowed accordingly | `modules/messaging/message-retention.service.ts`; Decision Log #478, #482 |
| R2 | New residual point (g) pointing to R33; notes that R2(e) is partly out of date | `moderation.service.ts` (`assertMessageReportable`) |
| **New R33** | (a) stored readable, not E2E; (b) 12-month deletion, 500 per run, minors and adults alike, includes edited originals and messages deleted for everyone; (c) exceptions: reported message, report context, active **legal** hold on the sender **or any other participant** (bad-faith and report-derived holds do **not** exempt); open-ended because reports have no retention clock; (d) reporter-added context: up to 20 messages, 10 before and 10 after, server-checked, recipient-only, same 404 for every refusal; (e) who sees them (moderator and superadmin report detail: public name, text, **original text before an edit**, flags; no conversation id, recipient or other messages; nobody notified); (f) **the child-safety-vetting gate keys off `Report.concernsMinor`, which on a message report is set only by the reason category `child_safety_concern`, not by the participants' ages**; (g) own-data export covers only sent messages (current text); (h) what is unchanged (R2 rules) | `message-retention.service.ts`; `moderation.service.ts` (`resolveContextMessageIds`, `attachContextMessages`, admin report detail ~lines 755-808, vetting ~591-722); `moderation.constants.ts` (`MESSAGE_REPORT_CONTEXT_MAX = 20`, `..._WINDOW = 10`); `modules/data-export/data-export-file.builder.ts`; Decision Log #466, #477, #478, #482; `docs/backend-message-retention-report.md`, `docs/backend-message-retention-legal-hold-report.md`, `docs/backend-message-report-context-report.md` |
| **New R34** | (a) what is built: soft removal for post, comment, message only; stubs shown to users; staff still see everything; (b) removed is not deleted and no retention clock; (c) the author can still hard-delete a removed post; (d) appeals restore; closure = appeal window lapsed (30 days default) or appeal upheld; (e) own-data export still includes removed items; (f) undecided effects (points, Contest, vetted-only view of removed items about minors, guardian notice of the *kind* of action); (g) summary of the media rule | `modules/moderation/content-removal.util.ts`, `moderation.service.ts`; Decision Log #442, #483, #484; `docs/backend-content-removal-report.md`, `docs/backend-removed-post-media-report.md` |
| §4 mitigations table | New rows R33 and R34 (after R16) | as above |
| §5 open items | New items 29 to 34 | as above |
| Closing statement | v0.4 note | n/a |

### `docs/dpia-addendum-post-media-draft.md` (post-media addendum, v0.2)

| Where | Change | Source of the facts |
|---|---|---|
| Header (version, date, link to the DPIA) | v0.2; notes the DPIA is now v0.4 | n/a |
| New changelog "v0.1 → v0.2" | Scope, markers, and an explicit list of what is **stale and not rewritten** (see below) | n/a |
| §1.2 table | New row `PostMedia.deletedByModerationAt` | migration `20261126090000_add_post_media_deleted_by_moderation` |
| **New §1.5** "The files of a post a moderator has removed" | Six-step table (removal recorded; public copy withdrawn after commit, creating the private copy because an approved file normally has none; private copy kept; closure deletes it; exceptions; author-deletes-first deferral) and six findings | `post-media/post-media-objects.service.ts`, `post-media/rejected-media-evidence.util.ts` (`removedMediaDeletableNow`, `partitionEvidence`), `post-media/rejected-media-sweep.service.ts`, `modules/account-hold/account-hold.rules.ts` (`reportClosedAt`); Decision Log #484, #442; `docs/backend-removed-post-media-report.md` |
| R30 | One marked paragraph: a clock now exists for removed posts' files only; what that does and does not narrow | as above |
| §9 mitigations | One new bullet | as above |
| §10.2 | One marked note: the built rule resembles F-3 with "N" = closure of the removing report; it is a product decision, not counsel-approved | as above |
| §11 | New assumption 14 | n/a |
| §12 | New questions 21 to 23 | as above |
| Closing statement | v0.2 note | n/a |

## Things I found that you should know

1. **The vetting gate does not follow the children in a thread (new, DPIA R33(f)).** A message report made under any category other than
   `child_safety_concern` (for example harassment between two 14-year-olds) is readable, with up to 20 context messages and edited originals, by any moderator
   or superadmin whether vetted or not. This is a gap between the safeguarding intent and the build, recorded as an open question for counsel; I changed no code.
2. **Staff can read the original text of an edited message** (reported message and context). `schema.prisma`'s own comment still says "there is no admin read of it yet"; that comment is out of date.
3. **Hold rules differ between messages and files.** Messages: legal hold only. Removed-post files: legal **or** bad-faith hold. Raised as addendum question 23.
4. **"Withdrawn at once" is exact for what the app shows, not for the stored object.** The post is hidden when the database write commits, but the public object is withdrawn by a background step; if it fails, the object stays at its unsigned address until the 5-minute reconciler retries. Recorded in addendum §1.5 finding 1.
5. **Reports have no retention clock**, so every "kept as long as the report" exception (reported message, report context, removed message) is open-ended.
6. **The decisions report is stale on one point.** `docs/docs-content-removal-decisions-2026-11-10-report.md` lists B-290 (and B-289) as "DECIDED, NOT BUILT"; both are merged (PR #714, #716). I used the code and the two backend reports.
7. **The incident plan cites a README that does not say what it is cited for.** `docs/incident-response-and-breach-notification-plan-draft.md` (line 85) attributes "messages are NOT end-to-end encrypted" to `modules/messaging/README.md`; that README contains no such sentence. The statement is true of the code (plain `contentText` column, no encryption in the module) and the DPIA cites the schema and service instead. Not edited, as instructed.
8. **R32 is held.** `docs/cloudflare-processor-and-cross-border-draft.md` §8.4 offers R32 as an option for a Cloudflare risk, so the new risks are R33 and R34.

## Stale text I noticed and deliberately did not change

Listed in each changelog so counsel does not read the unedited text as current.

DPIA main file: §2.4's "an open `Report` holds the anonymization indefinitely" and "no purge timer" (predate Decision Log #375, #376); R8 and §1.2 still describe `Post.mediaUrls` and `Message.mediaUrl` as the media path (replaced by the upload pipeline); R9's statement that no field marks a minor-related report and no staff vetting exists (`Report.concernsMinor`, `AdminUser.childSafetyVetted` now exist); R2(e)'s "no safeguarding flag inside a conversation".

Addendum: §1.1, §1.2's other rows, R24, R30's first paragraph and §10.6 describe the 2026-10-27 pipeline (processed file written to the **public** prefix before any check; rejected file **kept**). Since then B-257 (private prefix, copy on approval, PR #489) and B-283 (rejected files deleted on every path, PR #608) were built. The new §1.5 relies on the later build and says so. A separate refresh of the rest is needed.

## Verification

- `git fetch origin`; branch cut from `origin/main` `29e0966`.
- Every factual claim added was checked against the code on that commit, not only against reports: the retention SQL (`message-retention.service.ts`, including the legal-hold join through `Conversation.participantIds`), the context-message window and cap and the admin read (`moderation.service.ts`, `moderation.constants.ts`), the vetting gate, the removal helper (`content-removal.util.ts`), the removed-media deletion function and protection rule (`rejected-media-evidence.util.ts`), and the data-export selection.
- Not verified, stated in the files: any live behaviour (nothing was run), at-rest encryption by the host, R2 versioning and backups, whether a staff read of a reported message is logged, and every legal proposition.
- Both files keep their original CRLF line endings throughout (1540 / 792 lines, no mixed endings). Marker counts: 17 `CHANGED v0.4` in the DPIA, 11 `CHANGED v0.2` in the addendum.
- `git diff --stat`: the two DPIA files, this report, and one added status bullet in `CLAUDE.md`. No code, no `.docx`, no register, no legal draft, incident plan or Log Book.
- No tests run: docs PR.
