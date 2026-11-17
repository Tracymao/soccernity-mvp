# Legal copy v0.16 to v0.17: report

Safeguarding-drafter work, 2026-11-17. **DRAFT ONLY: nothing here is approved or legal advice (CLAUDE.md non-negotiable #2).** I decided nothing for the founder or counsel; every decision is recorded as made in the Decision Log, and counsel's view is "not recorded" wherever no sign-off exists.

- **Base:** `origin/main` `014afcd` (after PR #808). Branch `legal/legal-copy-v017-counsel-refresh`.
- **Files changed:** `docs/legal-copy-draft-tos-privacy-policy.md` (v0.16 to v0.17, Part C included), this report, and one status bullet in `CLAUDE.md`. Nothing else: not the Build Plan docx, `docs/build-register.md`, `docs/pending-copy-manifest.md`, the runbook, `docs/deployment.md`, code, Figma or any other draft.
- **Handshake:** fetched `origin`, zero open PRs, PRs #806 to #808 merged, Decision Log #524 to #532 and register Sections 101 and 102 read. **The Security session could not be asked** (non-interactive session); the founder's decisions were read from the register and the named reports only.

## 1. What the founder wanted, and how it is reflected

Counsel has not reviewed v0.16, DPIA v0.8, incident plan v0.6 or the tagged strings. Counsel gets current documents plus **one** list of questions holding only what is still unresolved and needs a lawyer (Decision Log #532). So every Part C row is sorted A/B/C/D, each marked `[v0.17 DISPOSITION: ...]` in the row's first cell, and a new Part C subsection "Questions for counsel (v0.17, the one list)" collects the A items. No row was deleted. The B-206 decisions (#524 to #530) are stated in the changelog, in Part C row 37 and in the new set-aside sentences, and nothing says counsel agreed to them.

## 2. Changed lines

Every change is marked `[v0.17 CHANGED ...]` in the file unless noted. "Tagged" means `[COPY PENDING LEGAL REVIEW]`.

| Where | Before | After | Source | Tagged |
|---|---|---|---|---|
| Header, version bullet | v0.16 | v0.17 | - | no |
| New "v0.17 changelog (2026-11-17)" before the v0.16 one | - | changelog entry (earlier style) | this task | no |
| ToS 6.3 | ends "If you delete a comment, it is removed. If you delete your account," | adds the set-aside sentence after "removed." | #525, #530 | yes |
| ToS 7.6 | ends "...for as long as the hold lasts." | adds the set-aside sentence | #525, #530 | yes |
| ToS 8.3 | list ends with the guardian-consent bullet | new bullet "Pictures and videos set aside as possibly illegal imagery" | #525, #530 | yes |
| PP 1.3 | ends "...is removed." | adds the set-aside sentence | #525, #530 | yes |
| PP 5, Amazon Rekognition bullet | "automated safety check on uploaded images (avatars and cover photos) ... Flagged images go to a Soccernity moderator and are not shown until reviewed." | "uploaded pictures and videos (for a video, on still frames taken from it), including avatars and cover photos ... Files the check is unsure about, and files that users report, go to a Soccernity reviewer, and a file is not shown to other users until it has passed. No hash-matching against known abuse imagery is in place." The `[OPEN: counsel ...]` bracket and the `[PROPOSAL ... #371]` marker are untouched | #524, #525, #430 item 1 | yes (the changed sentences) |
| PP 9, "Media you upload" row | "...(see "Pictures and videos of a post a moderator removed")" | adds a pointer to the new row | #525 | no |
| PP 9, new row "Pictures and videos set aside as possibly illegal imagery" | - | kept privately, away from other users, not deleted with the post, account or a removal; a record of who set it aside and when; 365 days (default) and longer if the law requires; `[OPEN: counsel]` on evidence retention beyond 365 days | #525, #530 | yes |
| Part C row 37 | v0.8 text only | rewritten: founder decisions behind uploads (#524, #529, #530), built path (#525), what is not built, the non-blocking counsel list (a) to (f); the v0.8 text is kept after it as history | #524 to #530 | no (a counsel note, not customer wording) |
| Part C rows 1 to 54 | no letter | each ends with `[v0.17 DISPOSITION: A, B, C or D ...]` (table in section 3) | #532 | no |
| New Part C subsection "v0.17 disposition of items and in-text markers" | - | legend, counts, in-text marker table, "Questions for counsel (v0.17, the one list)" | #532 | no |
| "Open for counsel (added v0.12)" | one item (ToS 3.2 wording) | item 1 marked D (housekeeping, not a counsel question); new items 2 (set-aside retention wording incl. "currently 365 days") and 3 (the plain wording shown to the person whose file was removed), both A | #525 | item 2 yes |

**The uploader and a guardian see only the generic rejection when a file is set aside; the draft contains no sentence saying otherwise.** The new customer-facing sentence is the same wording repeated in five places; I added as little as possible.

## 3. Part C disposition table (all 54 rows)

A = open for counsel, B = decided by the founder, C = resolved (counsel signed off), D = housekeeping.

| Row | Letter | Reason |
|---|---|---|
| 1 | C | counsel signed off; applied v0.7 (Decision Log #4, #203) |
| 2 | D | a fact the founder supplies once the entity is re-registered; not a legal question |
| 3 | C | counsel signed off; applied v0.7 |
| 4 | C | counsel signed off; applied v0.7 |
| 5 | D | built, nothing left to ask (PR #261; Decision Log #34, #337-#340) |
| 6 | A | counsel to confirm the consent audit trail is sufficient for UK GDPR Art. 7(1); built under Decision Log #348 |
| 7 | D | built (PR #261); no open question |
| 8 | D | product housekeeping; whether and how a non-user route exists is a product matter (see row 35) |
| 9 | A | cross-border transfer assessment for the named processors |
| 10 | A | whether showing minors' real names on the Leaderboard needs its own safeguarding review (the decision itself is the founder's, Decision Log #45; counsel's view not recorded) |
| 11 | A | encryption-at-rest and breach-notification commitments, including guardian notification |
| 12 | A | who exercises a minor's data-subject rights and how a minor/guardian disagreement is handled |
| 13 | C | counsel signed off; applied v0.7 |
| 14 | A | Nigerian counsel to cross-check the 6-month consent-record retention window against the NDPA 2023 |
| 15 | D | an engineering audit of what the web app stores must exist before counsel can read PP section 6; none is recorded (the web token model changed, B-246). Listed under 'unclear' in the report |
| 16 | D | built (PR #272, Decision Log #346, #351); the guardian-contact part is row 32 |
| 17 | A | counsel to confirm the consent-screen version and device type are sufficient evidence; built under Decision Log #348 |
| 18 | A+B | founder accepted the timing jitter (Decision Log #350); counsel to confirm the accepted limitation |
| 19 | C | counsel signed off; see row 4 |
| 20 | A | restates row 9 |
| 21 | A | restates row 11 |
| 22 | D | built (Decision Log #362, #372): date of birth encrypted at rest and shown on the guardian page's request summary; counsel's view on the request summary is not recorded |
| 23 | A | no maximum duration for an open investigation hold (Decision Log #345, #376); founder and counsel |
| 24 | A | accepted ~24h misclassification window and reliance on an unverified date of birth (Decision Log #349) |
| 25 | D | built (Decision Log #351); no open question |
| 26 | A | guardian authority at 18, retention of the age-reclassification log and minimisation of guardian details after 18 |
| 27 | A | counsel-approved v0.2 wording is looser than the code; left unchanged and flagged |
| 28 | C | counsel signed off; no representative required |
| 29 | C | counsel signed off; card verification is the stated COPPA control (PRs #297/#298) |
| 30 | D | superseded by row 36 |
| 31 | C | counsel signed off; applied v0.7 |
| 32 | A+B | founder decided guardian contact for every minor (Decision Log #363) and states counsel agrees (counsel's view not recorded); counsel review of the final wording and of whether already-confirmed v1 guardians must be notified is pending |
| 33 | D | built (usernames required, username rules and revoke built, PRs W3/W4 and #626); the row's 'not yet built' text is stale and is listed under 'unclear' |
| 34 | A+D | built (Decision Log #365); counsel to confirm the wording against the shipped behaviour |
| 35 | A | the public report page exists but ToS 7.4 does not describe it; counsel and product to confirm that is intended (the founder may read this as product only; listed under 'unclear') |
| 36 | D | operational: payment-provider keys, the 50-cent figure and PCI-DSS self-assessment are the founder's launch-gate steps |
| 37 | A+B | B: uploads go live at launch with no counsel gate, off switch MEDIA_UPLOADS_ENABLED, founder accepts launching before hash-matching as his own risk (Decision Log #524, #529, #530); the imagery path is built (#525). A: the duties question below, non-blocking |
| 38 | A | IP address processed transiently at registration; wording, lawful basis and whether 'transient, in memory' is enough |
| 39 | A | a reporter's data held in full under bad faith or a legal hold; whether it is lawful and proportionate |
| 40 | A+B | founder decided the purge rule and the post-closure hold (Decision Log #375, #376); counsel to review the retention and the appeal-window length (not counsel-sourced) |
| 41 | B | social sign-in was removed completely (Decision Log #479); the row and the PP wording that mention it are stale and are listed, not edited |
| 42 | B | founder decided 12 months from the last message (Decision Log #440, #444, #460); not a counsel question |
| 43 | A | avatar, cover photo, bio and country visible to other users including minors; counsel pending |
| 44 | A+D | built; counsel to read what is stored for two-factor, the guardian page's request summary and the approval email (the 56 admin two-factor strings were cleared by the founder, Decision Log #531) |
| 45 | B | founder's wording and the 12-month figure (Decision Log #440, #460); not a counsel question |
| 46 | B | founder decided direct messages are deleted 12 months after sending, with legal-hold and report exceptions (Decision Log #478, #482); counsel's view not recorded |
| 47 | B | founder decided what staff see when a message is reported (Decision Log #477, #486); counsel's view not recorded |
| 48 | D | read-only check; no clause changed |
| 49 | B | founder decided soft removal of content (Decision Log #483); counsel's view not recorded |
| 50 | A+B | founder decided the stored-file rule (Decision Log #484); counsel questions (a) to (c) in the row remain |
| 51 | D | read-only check; nothing contradicted the draft |
| 52 | C+B | the 6-7 year range is the counsel-approved figure (v0.7 resolved decision 10); #490 restored it |
| 53 | A+B | founder decided suspension, emails and appeals (Decision Log #485, #492); counsel to read the email wording and the appeal route |
| 54 | B | founder decided who sees a reported message's context (Decision Log #477, #486); counsel's view not recorded |

The in-text `[PROPOSAL]`/`[OPEN]` markers in the Terms and Privacy Policy are sorted in the file's new subsection, not edited.

## 4. Unclear, founder to say (left as written)

1. **Row 15 (cookie and local-storage audit):** no engineering audit of what `apps/web` stores is recorded, and the token model changed (in-memory access token plus an httpOnly cookie, B-246). Marked D; PP section 6 is stale and unchanged.
2. **Row 33 (usernames):** the row's "not yet built" text is stale (required username, username rules and revoke are built). Marked D, text unchanged.
3. **Row 35 (public report page vs ToS 7.4):** marked A as written ("counsel/product to confirm"); the founder may read it as product only.
4. **Row 41 and PP 1.9 and 5 (Google and Facebook sign-in):** removed from the product (#479). The row and the passages are stale. Marked B, **not edited** (the brief: do not delete a row).
5. **Other stale markers** listed in the new subsection and left: `[PROPOSAL ... #371/#368/#369/#370/#372/#373]` (built), ToS 7.3 "being built into the Admin Console" (built), ToS 7.9 marker (built, PRs #739, #740), PP 1.9 two-factor marker (built), PP 5 "Not yet live" paragraph.
6. **Why PhotoDNA and the Cloudflare scanning tool were dropped:** the founder gave no reason for PhotoDNA (register Section 102 says so); I recorded none and wrote nothing about detection technology that is not built.
7. **"Currently 365 days"** is a default the Dev session chose (Decision Log #525), not a founder-stated figure. The sentence says it and is an A item (Open for counsel, item 2); the founder may prefer to remove the figure from the public text.
8. **Row 22 (date of birth on the guardian page's request summary)** is marked D (built); counsel's view on that summary is not recorded and the row does not list it as a counsel question. Say if it should be A.
9. **Evidence reading:** I disagree with nothing the founder said and changed nothing on that basis. One point to keep in view: the protection is of the file only and does not stop a person deleting their picture or account (stated in row 37 and in the code reports); the public sentence says the file "is not deleted when ... your account ... would otherwise delete it", which describes the file, not the person's ability to delete their own post.

## 5. Changed versus listed and left

- **Changed:** the items in section 2 only.
- **Listed and left:** every stale marker and statement in section 4; every row's own text (only a disposition was appended; row 37's v0.8 text is kept below the new text); the NOT APPROVED banner and the empty sign-off block.

## 6. Verification and what could not be verified

- `apps/web` renders this draft at `/terms` and `/privacy`; `LegalPage.test.tsx` (8 tests) **passes** (8/8) after the edit. The file keeps CRLF line endings; every anchor was asserted to match exactly once before replacement; all 54 Part C rows carry exactly one disposition.
- **NOT verified:** the Security session was not asked; CI cannot be read from here; nothing else was run (no `tsc`, lint or Playwright; this is a docs change); no Build Plan docx was opened (Decision Log text taken from the register and the named reports); the claims about built behaviour (set-aside path, profile pictures and covers, the automatic check on video frames) are read from the reports of PRs #800, #801, #803, #806 and #807, not re-run.
- **Counsel has not seen any of v0.16 or v0.17.**
