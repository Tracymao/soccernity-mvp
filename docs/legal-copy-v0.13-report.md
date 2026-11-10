# Legal copy v0.13 -- direct messages (report)

Draft only (`CLAUDE.md` non-negotiable #2). `docs/legal-copy-draft-tos-privacy-policy.md` moves v0.12 to v0.13, still NOT APPROVED. Nothing here is legal advice and counsel has not seen any of it. One topic only: direct messages. Written for: the founder and counsel reading the diff.

Decisions used: Decision Log #478 (message retention, 12 months) and #477 (message report context), both the founder's decisions, not counsel's. Both are built in the back end on `main` (PRs #700 and #697). The web step that lets a reporter choose context messages is Figma only (PR #704), so the disclosure is marked `[PROPOSAL, not yet built]`.

## What changed in the draft

| Where | Change |
|---|---|
| Header, version line | v0.12 to v0.13; one clause added to the version history. |
| v0.13 changelog | New, above v0.12's. |
| Privacy Policy section 9, table | Row "Messages between users" rewritten (see below). Row "Content you posted" no longer lists messages and points to the messages row. |
| Privacy Policy section 8 | Two new paragraphs after the first: "If a message is reported" (disclosure) and "How long messages are kept". |
| Terms section 8.3, first bullet | "messages" taken out of the list of content that stays after anonymisation; one sentence added saying messages are deleted at 12 months. |
| Part C | Rows 46 (retention), 47 (report disclosure), 48 (the privacy/security/encryption check). |

Every new sentence carries `**[COPY PENDING LEGAL REVIEW]**`. The only figure added is 12 months. No other clause was touched; the Contact Us wording (v0.9 to v0.11) is untouched.

### The wording, as written

- Retention: "A direct message is deleted 12 months after it was sent, for everyone, including people under 18. A message that is the subject of a report, or that the reporter chose to include as context, is kept with that report, under the retention that applies to reports (Section 9)."
- Disclosure: "When a person reports a message, our safeguarding team sees that message and any messages around it that the reporter chooses to include with the report, and nothing else of the conversation."

## A difference from the brief

The brief says to replace "has no retention period set" in Part C and the retention table. That exact phrase appears once, in Privacy Policy 4.5 (line 799), and is about the **age-reclassification log**, not messages. It was left alone. The messages wording that was replaced is the table row "Retained ... A rolling retention window for messages generally is [PROPOSAL] (starting figure only: 12 months)". Part C had no separate messages row, so row 46 is new.

Two knock-on edits were needed so the draft does not contradict itself, and are outside the literal ask: Terms 8.3 and the section 9 "Content you posted" row both said messages stay after anonymisation. Both now carve messages out. Say if you would rather have those two reverted and handled in a separate pass.

## Pending-copy manifest: no row added, on purpose

`docs/pending-copy-manifest.md` and its inventory test cover strings in `apps/web` and `apps/admin` only; a row with no matching tagged string in those apps fails `pendingCopyManifest.test.ts`. The file's own convention (v0.10, the Contact Us notice) is that the manifest row is added by the build PR that puts the text in the app. So the "manifest rows the convention requires" are none today; the Part C rows 46 to 48 are the record. The report dialog step and any in-app retention line will need rows when built.

## Read-only check (no edit): where messages are called private, secure or encrypted

Messages are **not end-to-end encrypted**: the server stores the message text (`Message.contentText`) and staff can read it when a report is made. I checked the draft, the DPIA, the incident plan and the app strings.

| # | Where | Wording | Accurate? |
|---|---|---|---|
| 1 | Draft, PP section 8 (line ~923) | "visible to the participants in that conversation and to Soccernity's moderation staff where a report is made" | Accurate for participants. "Where a report is made" is wider than the new "reported message and chosen context only" sentence, so the two read slightly differently. Left unchanged; flagged in row 47. |
| 2 | Draft, PP section 11 (line ~1051) | "secure password storage ... access controls on our moderation and administration tools" | Accurate; does not mention messages. |
| 3 | Draft, PP section 11 (line ~1055) | "[PROPOSAL -- technical standard TBD] We commit to encryption at rest" | A commitment, not a statement of fact, and unverified for the message table (depends on the host and database settings; no application-level message encryption exists). Flagged in row 48. |
| 4 | Draft, PP 1.2 (line ~602) | date of birth "encrypted at rest, not hashed" | Accurate for date of birth (AES-256-GCM in the app); says nothing about messages. Do not generalise it. |
| 5 | Draft, lines ~520, 903, 909 | "kept private", "private-account setting", "Saved posts are private" | Not about messages. |
| 6 | DPIA line 244 | "**Private communications:** Conversation, Message" | A data-category label. Reads as "non-public channel", not a confidentiality promise, but could be misread. Not edited (DPIA is out of scope). |
| 7 | DPIA line 427 | "retaining a departed user's posts, comments and private messages under an anonymous label" | Needs updating by whoever next edits the DPIA: messages are now deleted at 12 months, so "retaining ... private messages" is no longer the design. "private" here is again a label. |
| 8 | DPIA line 733 | "`Conversation` and `Message` permit direct private messaging" | Label, as in 6. Accurate as "between two people, not public"; not a claim of secrecy. |
| 9 | DPIA lines 980 and 1176 (R10) | "encryption at rest ... counsel to consider" / "Encryption at rest; access controls" | Proposals, not facts; same caveat as 3. |
| 10 | Incident plan | encryption mentions are about date of birth and two-factor secrets (lines 61, 70, 245, 278, 414, 562) | Accurate for those; it records messages as plain text at the application level. No claim to correct. |
| 11 | App strings (`apps/web`, `apps/admin`) | No string calls a message private, secure or encrypted. "Only you will stop seeing it" (delete for me) is accurate. "Choose a new secure password" is about passwords. The delete-for-everyone line "We may keep a copy of the original for safety and legal reasons" is accurate. | Accurate. |

Result: no sentence in the draft or the app string set claims messages are private, secure or encrypted, so nothing is false today. The risks are (a) the DPIA's "private" labels, which a reader may take as a confidentiality promise; (b) the PP section 11 at-rest commitment, which may be read as covering messages; (c) the wider "where a report is made" sentence in section 8. All three are recorded in Part C rows 47 and 48 for counsel.

## Things counsel should look at (Part C row 46)

1. The deletion job does not pause for an account under an investigation hold or a legal hold; it spares only a message a report points at or that a reporter attached. Section 9 says that during a hold "we keep the report, the reported content and messages".
2. A thread is one record, so deletion removes it for both people, including someone who has not left.
3. After 12 months a message that later becomes evidence is already gone, against the 6 to 7 year moderation retention.
4. After the 30-day anonymisation, an account whose only remaining content was old messages becomes purgeable.

## Verification

- `git diff`: one file changed (plus this report), 25 insertions, 7 deletions; CRLF line endings preserved.
- `apps/web` `src/pages/legal` vitest (the page renders this file live): 1 file, 8 tests, 0 failures.
- Not touched: the DPIA, the incident plan, the Log Book, any `.docx`, `docs/build-register.md`, the pending-copy manifest.
