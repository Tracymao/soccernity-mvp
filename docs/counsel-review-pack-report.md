# Counsel review pack: build report (task D5)

Branch `legal/counsel-review-pack`, cut from `origin/main` `4131ec0`, 2026-11-17. Written by the safeguarding-drafter. DRAFT ONLY: nothing here is legal advice, and nothing is decided for the founder or counsel.

## 1. What was produced

| File | What it is |
|---|---|
| `docs/counsel-review-pack.md` and `.docx` | The pack for counsel: cover page, documents table, 75 questions in 8 groups, a 150-row strings sheet, a blank sign-off table. |
| `docs/counsel-pack-left-out.md` | INTERNAL, not for counsel. Every item from the drafts that is not in the pack, with the reason; plus the "unclear, founder to say" list. |
| `docs/counsel-review-pack-report.md` | This report. |
| `CLAUDE.md` | One status bullet. |

Nothing else was touched: not the six refreshed drafts (eight files, see section 6), the Build Plan docx, `docs/build-register.md`, `docs/pending-copy-manifest.md`, the runbook, `docs/deployment.md`, code or Figma.

## 2. Counting rule

- An **item** is one unit that carries its own `[vX.Y DISPOSITION: ...]` marker in one of the drafts (a Part C row, an in-text marker, an "open item", a DPIA section 5 item, an incident question, an addendum question, or a marked note).
- The marker definition lines are not items. Sub-markers (4a, 5a, 12a, 14a) fold into their parent. Two container questions (post-media addendum section 12 Q11; view-data Part C Q6) are not items.
- An item with any A component counts once, as A, and goes in the pack. Its non-A remainder gets a second, partial row in the left-out list. That partial row is not an extra item.
- Incident Q18, Q23 and Q24 carry no disposition in the draft ("not assigned", marked X here). They are in the left-out list and flagged for the founder; I did not assign them.

## 3. Arithmetic

Items started with, per document (the eight files):

| Document | Items | A | B | C | D | X | A items with a non-A remainder (partial rows) |
|---|---|---|---|---|---|---|---|
| Legal copy v0.17 | 67 | 28 | 10 | 9 | 20 | 0 | 8 |
| DPIA v0.9 | 51 | 14 | 13 | 10 | 14 | 0 | 0 |
| Incident plan v0.7 | 32 | 23 | 3 | 1 | 2 | 3 | 0 |
| Post-media addendum v0.5 | 33 | 20 | 8 | 0 | 5 | 0 | 7 |
| Post-media Part C v0.2 | 21 | 16 | 2 | 0 | 3 | 0 | 10 |
| Contest and view-data addendum v0.2 | 22 | 19 | 0 | 0 | 3 | 0 | 7 |
| View-data Part C v0.2 | 10 | 8 | 0 | 0 | 2 | 0 | 2 |
| Cloudflare draft v0.2 | 13 | 13 | 0 | 0 | 0 | 0 | 6 |
| **Total** | **249** | **141** | **36** | **20** | **49** | **3** | **40** |

**A + B + C + D + X = 141 + 36 + 20 + 49 + 3 = 249 = items started with.** Nothing is lost.

Where each went:

- **141 A items** are in the pack. They produce **75 questions** (average 1.9 items per question). The questions cite 149 source links to 141 distinct items, so 8 items feed more than one question. A script confirmed every one of the 141 is cited at least once and that no non-A item is cited.
- **108 non-A items** (B 36, C 20, D 49, X 3) are rows 1 to 108 of the left-out list.
- **40 partial rows** (the non-A remainder of A items) are rows 109 to 148 of the left-out list.
- Left-out list rows: **148** = 108 + 40. The 40 partial rows are the second halves of items already counted in the 141, so 141 + 108 = 249 still holds.
- The strings sheet is separate from the item count: 150 rows (web 99, admin 51), all from the manifest, grouped by screen.

How the 75 questions were reached by merging: where two or more drafts ask the same thing, one question cites all of them. Examples: legal rows 20 and 21 restate rows 9 and 11; the four US questions and the four EU questions of the incident plan became one US and one EU question; incident Q5 and Q6 became one; a Cloudflare question and the matching post-media question (Cloudflare Q4 and post-media section 12 Q10) became one. Merging changes only how many times counsel is asked, never what is asked.

## 4. Pack structure check

Required: cover, documents table, questions grouped and ending in a mapping table, strings sheet, blank sign-off.

- Cover page: who Soccernity is, what is asked, every draft NOT APPROVED, what counsel is NOT asked (B, C, D items, the 56 admin two-factor strings, and whether launch waits). Done.
- Documents table: file, version, what changed since counsel last saw it, which questions cite it (one row per document). Counsel last saw the legal draft at v0.7; no other draft has been reviewed. Done.
- Questions: Q1 to Q75, 8 groups (Group 1 suspected illegal imagery; 2 automated rejection of a child's file and video from children; 3 cross-border transfers and processors; 4 profiling of children through view data and points; 5 erasure, anonymisation, age changes and retention; 6 breach notification; 7 legal facts the drafts recall from memory; 8 notices and wording that change when processing changes). Group sizes 7, 7, 12, 9, 11, 13, 3, 13. Each question has the question, one sentence on why it matters, its sources and a label. 42 are labelled "needed before the documents are signed" and 33 "can follow launch" (a founder-veto-able default with a one-clause reason). Ends with a table mapping every Q to every source item. Done.
- Strings sheet: 150 rows, three empty columns (approve as is, reword to, reject), states that on approval an agent removes the tag and the manifest row, and that the 56 staff-only strings were cleared by the founder (#531). Done.
- Sign-off: blank table, no names or dates. Done.

## 5. Verification

- `docs/counsel-review-pack.md`: 75 questions counted (`**Q` lines), 150 string rows (`S1` to `S150`), 8 group headings.
- Manifest: 150 table rows parsed from `docs/pending-copy-manifest.md` (web 99, admin 51), matching the expected split. Rows are reproduced verbatim apart from escaping the pipe character.
- Coverage script: no unknown sources, no A item missing, no non-A item cited.
- DOCX: built with pandoc 3.9 (via `pypandoc_binary`), converted back to text, headings compared with the markdown (result in the PR description and below).
- No `[v0.N DISPOSITION` text appears in the pack (checked by search).

DOCX round-trip result: recorded in section 10.

## 6. Differences from the brief

1. **Eight files, not six.** The brief says "six documents". The pack has eight draft files, because the post-media addendum and the contest/view-data addendum each have a separate Part C file. I included all eight; the documents table groups each addendum with its Part C.
2. **Post-media addendum version.** Earlier notes disagreed about whether the addendum went v0.3 to v0.4 or v0.4 to v0.5; the file is v0.5, and the pack uses the file.
3. **Counts per group** in my planning notes (7, 7, 12, 8, 11, 12, 3, 15) differ from the generated file (7, 7, 12, 9, 11, 13, 3, 13). The numbers in this report are from the generated file; both total 75.
4. **Q18, Q23, Q24 of the incident plan** are NOT ASSIGNED in the draft and I left them that way (founder to say).

## 7. Stale statements and possible errors found in the drafts (listed, NOT edited)

I made no edits to any draft. Each of these is for the founder or the next drafting pass:

- **DPIA v0.9**: a line near 484 still says hosting is not decided (Decision Log #9); the v0.4 and v0.5 changelog lists are stale against v0.9; section 2.6.3 findings and the R9 body text were not refreshed; the status text of item 1 still reads OPEN although the item is sorted as resolved.
- **Legal copy v0.17**: in-text markers 1, 2, 5, 6, 8 and 9 and Part C rows 33 and 41 describe things that are now built or removed (social sign-in removed by #479, usernames built, web token model changed). PP 1.9 and PP 5 still describe Google and Facebook sign-in. ToS 7.3 and 7.9 and the PP 1.9 two-factor marker are stale. All left as written.
- **Addenda and Part C files**: references to legal draft v0.8 and v0.11, DPIA v0.3, and legal row numbers 45 and 47 are out of date (the legal draft is now v0.17 and uses rows 45 and 52 to 54 differently). Post-media Part C has small oddities at lines 55, 97 and 148 that I noted and did not resolve.
- **Incident plan v0.7**: questions 19 and 20 are sorted B but have residual points that no decision covers (see the left-out list, unclear items 22 and 23).

## 8. "Unclear, founder to say"

These are in `docs/counsel-pack-left-out.md` section 3 (34 entries). The main ones:

- Incident Q18, Q23, Q24: no disposition could be justified; the Decision Log does not cover them (Q24 only part (c), #503).
- DPIA items 2, 9, 27, 37, 40, 41 and 47: dispositions rest on thin or no evidence (for example, no row records counsel's sign-off on the minimum age; some items say "recorded, not decided" but are marked B).
- Why PhotoDNA was dropped (#526): no reason recorded.
- The "currently 365 days" figure for set-aside files is a Dev-session default, not a founder figure (#525).
- The founder's statements on staff vetting, welfare, HR duty and full cooperation are not recorded as a Decision Log row, and the post-media addendum lists reviewer welfare as a counsel question, which conflicts with the HR-duty reading.
- Addenda: whether admin file-opens should be logged (not built); a public non-user report route; deleting a surviving post's files at anonymisation; the legacy admin-judged Contest cycle winner row; the 5-minute reconciler window; the hold-rule difference; R2 cross-bucket copy still unproven; the AWS opt-out not done.

## 9. What could not be verified

- **Nothing was run.** No test suite, `tsc`, lint, build or Playwright. This is a docs-only change.
- **CI could not be read** from this session.
- **The Security session was not asked.** The session is non-interactive, and an overlapping PR might exist; I did not check for one.
- **Law and vendor statements were not re-fetched.** The pack repeats what the drafts say; it does not check any law, regulator, vendor or price.
- The dispositions (A, B, C, D) are the drafts' own. I did not re-sort any item against the Decision Log except where the left-out list says "unclear, founder to say".
- The pack has not been read by counsel or by the founder. No sign-off exists.

## 10. DOCX round-trip

`docs/counsel-review-pack.docx` was built from the markdown with pandoc 3.9 (`pipe_tables`), 47,881 bytes. The zip is intact (`testzip` clean) and pandoc reads it back. Converted back to plain text, 61 of the 62 markdown headings match exactly. The 62nd ("Group 2: Automated rejection of a child's file ...") differs only because pandoc turned the straight apostrophe into a curly one. The converted text has all 75 questions and all 150 string numbers (S1 to S150). I did not open the file in Word, so layout (table widths, page breaks) is unchecked; the three-column tick table in section 4 may need widths adjusted by hand.
