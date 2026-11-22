# Counsel pack v1.2 refresh (CH-F2): report

Base `origin/main` b6dfe5961e735ccea4d0f8cad99aed6cbe9e5ab8 (fetched fresh), branch `copy/counsel-pack-v12`, Python 3.14.5. DRAFT only: nothing here is approved or legal advice.
Pack: 1033 lines before (HEAD), 1034 after (one added not-asked bullet), LF endings both, no CR. Frozen items untouched: Q1 to Q71, labels, disposition markers, S1 to S144 rows, question-to-source table, v1.0-to-v1.1 map, "Questions that cite it" cells.

## 3a changes (line, old to new)
- L3 title: "Soccernity — draft ..." to "Soccernity: draft ...".
- L5 version line: "Pack version 1.1, prepared 2026-11-17 on branch `legal/counsel-review-pack-v11`" to "Pack version 1.2, prepared 2026-11-22 on branch `copy/counsel-pack-v12`".
- L12 cover "What counsel is asked": the sentence asking counsel about the strings was removed; counsel reads the eight drafts and answers the 71 questions.
- New not-asked bullet under "What counsel is NOT asked": "The 144 on-screen strings in section 4. The founder reviewed every one and cleared the tag himself (R108, 2026-11-22); section 4 keeps them as a record."
- Section 2 intro: "v0.16, v0.17 or v0.18" to "v0.16 to v0.21".
- Documents table versions (before to after): legal copy v0.18 to v0.21, DPIA v0.10 to v0.12, incident plan v0.8 to v0.10, post-media addendum v0.6 to v0.8, post-media Part C v0.3 to v0.4, contest/view-data addendum v0.3 to v0.4, view-data Part C v0.3 to v0.4, Cloudflare v0.3 to v0.5. "What changed" cells extended with one sentence each; the Cloudflare cell now states the two-part position: `media.soccernity.com` is proxied from the start (#541); the proxy for the API and static sites is adopted in principle, building deferred until after launch (#449, #518).
- Sign-off table versions set to the same eight versions.
- Q14 "Why it matters" hosting sentence: "Hosting is in the EU (Frankfurt)" to "Render runs in Frankfurt, Neon and Upstash run in London (eu-west-2, not the EU) and the R2 buckets are in the EU jurisdiction." (#536)
- Q17: "R2, location unconfirmed" to "R2, EU jurisdiction".
- Other hosting statements searched: no further occurrences needing change.
- Two search/build defects found in files this task owns: the sign-off table separator row had 4 columns for 6 header cells, so pandoc dropped "Outcome" and "Notes"; now `|---|---|---|---|---|---|`.

## 3b: questions that say the proxy is deferred or "if added" (listed, NOT changed)
| Q | line | label | sentence |
|---|---|---|---|
| Q18 | 157-158 | Can follow launch | "The proxy is deferred until after launch (#518) but its text is drafted." |
| Q19 | 164 | Can follow launch | "...the proxy is deferred until after launch." |
| Q20 | 170 | Can follow launch | "...the proxy is deferred until after launch; the AWS part is covered by the AWS questions above." |
| Q21 | 176 | Can follow launch | same deferral sentence |
| Q22 | 179-182 | Can follow launch | "The proxy would see every request from US under-13s." / deferral sentence |
| Q23 | 188 | Can follow launch | deferral sentence |
| Q24 | 194 | Can follow launch | deferral sentence |
| Q55 | 385-386 | Can follow launch | "If the proxy is added, Soccernity may learn of an incident late." |
| Q61 | 423 | (question text) | "...and the proxy (if added)..." |
| Q66 | 455 | (why it matters) | "...the proxy is deferred." |
| Q68 | 465-467 | (question text, why) | "...does the proxy (if added) make it untrue?" / "a proxy would see it." |
Founder decision needed: these are right for the API and static-site proxy, but #541 puts the media address behind Cloudflare from the start, so any of them that concern traffic to `media.soccernity.com` (Q22, Q68 in particular: IP addresses and content seen by the proxy) may now apply at launch. Not changed.

## 3c wording pass
Dashes (em, en) before 13 lines, after 4 lines; the 4 remaining are inside quoted S rows (frozen); one ` -- ` remains in S93 (quoted string, frozen). Prose dashes replaced: title and the eight "Group N" headings (colon). Tables: none. Pattern scan (`not just|only|merely|simply`, `not ... but`, `rather than`, `Let's|Here's|Note that`, `could potentially|arguably`): one hit, Q51 "rather than one person" (line 359), a real contrast, kept. No sentences needed rewriting beyond the dashes. Legal-word counts before to after: must 20/20, may 60/60, only 49/49, unless 2/2, within 1/1, not 82/83, no 233/241, never 11/11, cannot 10/10, years 4/4, days 10/10, consent 59/59, guardian 114/114, minor 11/11. The +1 "not" and +8 "no" come from the new sentences in 3a (not-asked bullet, Cloudflare cell, Q14, hosting wording), not from rewritten text. `grep -c 'COPY PENDING LEGAL REVIEW'`: 3 before, 2 after (the removed cover sentence quoted it).

## Checks
`python docs/counsel-pack-check.py`: exit 0 before and after, output diff empty. Counts unchanged: 71 Q headings, 8 documents rows, 144 strings rows (S1 to S144), 8 sign-off rows, 10 cite-it questions in the Cloudflare cell.

## DOCX
`docs/counsel-pack-build.py` as committed cannot rebuild the current pack: it has no widths for the 4-column strings sheet (it expects the old 6-column one). I did not edit it. I ran a patched COPY from the scratchpad (adds a width row for the 4-column "#" table, same other logic). pandoc and python-docx were absent; installed `pypandoc_binary` and `python-docx` with pip and set `PANDOC`. Result: 4 sections (portrait, landscape, portrait, landscape), 48 tables, 71 Q headings, 144 distinct S ids, sign-off table 11 rows x 6 columns, version cells v0.21/v0.12/v0.10/v0.8/v0.4/v0.4/v0.4/v0.5. Not opened in Word; layout and page count not rendered here.
Founder/engineering follow-up: update `docs/counsel-pack-build.py` for the 4-column strings sheet.

## Stale statements noticed in drafts, not fixed
- Cloudflare draft lines 23-28: "built at the launch gate" and "No Cloudflare account ... exists" predate #518 and the existing account; later marked notes (lines 46, 87, 335) carry the deferral. Not a contradiction of the pack's position but stale.
- Pack "Sources" lines still cite older draft versions in places (e.g. "Legal copy v0.18, Part C row 3", "DPIA v0.10, section 5 item 3"); left as history.

## Founder decisions
1. Do the Q18 to Q24, Q55, Q61, Q66, Q68 proxy sentences need rewriting now that the media address is proxied from the start?
2. Update the build script for the 4-column strings sheet.
