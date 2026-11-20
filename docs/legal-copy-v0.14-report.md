# Legal copy v0.14 -- content a moderator removes (report)

Draft only (`CLAUDE.md` non-negotiable #2). `docs/legal-copy-draft-tos-privacy-policy.md` moves v0.13 to v0.14, still NOT APPROVED. Nothing here is legal advice and counsel has not seen any of it. One topic only: content a moderator removes. Written for: the founder and counsel reading the diff.

Decisions used: Decision Log #483 (moderator removal of a post, comment or message) and #484 (the stored files of a removed post), both the founder's decisions, not counsel's. Both are built in the back end on `main` (PR #714 for #483, PR #716 for #484). The notices a person sees (comment and message placeholders, the author's removed notice) are Figma only (PR #715); `apps/web` has no `removedByModeration` code, so the display sentences are marked `[PROPOSAL, not yet built]`.

## What changed in the draft

| Where | Change |
|---|---|
| Header, version line | v0.13 to v0.14; one clause added to the version history. |
| v0.14 changelog | New, above v0.13's. |
| Terms, new 7.5 | What other people see when a moderator removes a post, comment or message; the item is kept, hidden, as evidence for as long as its report is kept; an overturned appeal restores it. |
| Terms, new 7.6 | Pictures and videos of a removed post: made unavailable at once; stored file deleted when the removal is confirmed; kept longer only under a hold (8.4). |
| Terms, new 7.7 | Guardians: for a minor's account we normally email the confirmed guardian that content was removed; kind of action and time only. |
| Privacy Policy section 9, table | Two new rows, "Content a moderator has removed" and "Pictures and videos of a post a moderator removed", inserted before "Moderation reports and actions". The "Content you posted" and "Media you upload" rows each carry a pointer to them. |
| Privacy Policy section 9, text | One paragraph, "Content a moderator removes, stated plainly", before "Guardians and minors". |
| Part C | Rows 49 (hidden and kept), 50 (stored files), 51 (guardian check). |

Every new sentence carries `[COPY PENDING LEGAL REVIEW]` (bold in prose, plain in table cells, as the file already does). No figure was added: the appeal period is deliberately described, not stated, because the draft already says its length is not counsel-sourced (Part C row 40). Nothing else was touched.

### The wording, as written

- Removed item: "If a moderator removes a post, a comment or a message, it is hidden from other people. A removed comment or message is replaced by a notice that Soccernity removed it. A removed post no longer appears anywhere, and its author is shown a notice that it was removed. We do not erase the removed item at that moment: we keep it, hidden, as evidence, for as long as the report it belongs to is kept (Privacy Policy, Section 9). If an appeal against the removal succeeds, the content is restored."
- Files: "When a post is removed, its pictures and videos are made unavailable at once, so that no link to them works. We keep a private copy only while the removal could still be appealed ... The stored file is deleted when the removal is confirmed, that is, when the time allowed for an appeal has passed or an appeal has been decided and the removal stands. The exception is a file that is kept as evidence under a hold (Section 8.4), which is kept for as long as the hold lasts."
- Guardian: "If the account that posted the removed content belongs to a minor, we normally email the guardian who has confirmed consent to say that Soccernity removed content posted from the account. The email states only the kind of action and when it happened. It does not say why, does not say that a report was made or who made it, and does not include the content."

## Read-only check: item (3), the guardian notice (B-279)

The brief said the B-279 text was already drafted and to check that nothing contradicts it. It is drafted in code and in `docs/pending-copy-manifest.md` (template `guardian-safety-notice`: subject "An update on {name}'s Soccernity account", sentence "Soccernity removed content that was posted from {name}'s account.", a time line, and the Contact Us pointer). It is **not** in the legal draft. I therefore added one short sentence (Terms 7.7, plus a pointer in the section 9 paragraph) so the removal wording and the notice agree, and checked the rest of the draft for contradictions:

| Where in the draft | Says | Conflict? |
|---|---|---|
| Terms 7.2 | "Both the person who reported and the person reported are notified of the outcome." | No. The guardian email is an addition about a minor's account, not a replacement. |
| Terms 8.4 / Privacy Policy 9 (holds) | During a hold we keep the report, the reported content and messages. | No. Consistent with files being kept under a hold. No hold ever notifies a guardian (Decision Log #459); the draft does not say otherwise. |
| Privacy Policy 11 | A breach notification procedure that separately notifies a minor's guardian. | No. A different event. |
| Privacy Policy 1.6 | A report can contain an allegation about or by a child. | No. The guardian email never says a report exists. |
| Terms 6.3 / Privacy Policy 9 "A post you delete yourself" | A post the author deletes is permanently deleted. | Not a contradiction in wording, but see row 49(a) below: the author can delete a removed post. |
| Privacy Policy 9 "Content you posted", Terms 8.3 | Content stays, as "[deleted user]", after anonymisation. | Compatible: a removed item stays hidden; the "Content you posted" row now points to the new row. |

Result: nothing contradicts B-279. Two points are left for counsel (Part C row 51): the draft says "normally" because a child-safeguarding admin can switch these emails off for one account (Decision Log #458, built so the minor and guardian see no trace), and at most one email per kind per account is sent an hour. I did not write the exception into the public text; counsel decides whether to.

## Where the wording is ahead of, or differs from, the build

Checked against `docs/backend-content-removal-report.md` and `docs/backend-removed-post-media-report.md` (read, not run).

1. **"Kept as evidence for as long as the report is kept" is not enforced.** A removed post or comment is soft-hidden only. The author can still call `DELETE /posts/:id` on their removed post, which hard-deletes the row and the evidence the removal rests on (the media copy is protected, the text is not). Row 49(a).
2. **The data export still includes a person's own removed items with full text** (row 49(b)).
3. **Anonymisation leaves removed posts and comments hidden in place**; contest effects and engagement points already earned are not revoked (row 49(c), (d)).
4. **"At once" for the files.** The post is hidden immediately by the database read gate. The public file is withdrawn in the background just after the removal is recorded, with a repair job every 5 minutes; if the first attempt fails the file can be reachable for a few minutes, and a file approved while its post is already removed is withdrawn on that next pass (row 50(a)). The Terms say "made unavailable at once", as the brief asked; counsel should decide whether that is accurate enough.
5. **The only hold that keeps a file today** is an active legal or bad-faith hold on the uploader, or another report on the same post that is not yet closed. Report-derived account holds do not keep it (row 50(d)).
6. **Deleting the file at confirmation may destroy material statutory reporting needs.** It stays inside the open CSAM / statutory-reporting question (Part C row 37, build-register B-206); the later evidence set-aside overrides deletion for that file. I added an `[OPEN]` marker in the section 9 row.

## Pending-copy manifest: no row added, on purpose

`docs/pending-copy-manifest.md` and its inventory test cover strings in `apps/web` and `apps/admin`. The removal placeholders and the removed notice are not in the app yet, and the guardian email wording is already listed in the manifest's `services/api` section. So no row was added; Part C rows 49 to 51 are the record. The build PR that puts the notices in the app adds the manifest rows.

## Not done / not touched

- The DPIA, the incident plan, the Log Book, any `.docx`, `docs/build-register.md`, `docs/pending-copy-manifest.md` and all code were not touched, as instructed.
- No wording about holds or the "withhold guardian notices" switch was added to the public text.
- The Decision Log forward-pointers and register status lines for this wording belong to the next docs PR.

## Verification

- Branch cut from `origin/main` `29e0966`. The file's CRLF line endings were preserved; the diff is 42 insertions and 5 deletions in the legal draft (the 5 deletions are the heading line, the version line, the version-history line and the two section 9 rows that gained a pointer).
- `apps/web` renders this file, so `src/pages/legal` (`LegalPage.test.tsx`) was run: 8 tests, 0 failures. No other test run (docs PR).
- Part C rows 49 to 51 sit directly after row 48 and before the "Screen copy -- Contact Us form notice" block.
