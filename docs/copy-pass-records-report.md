# Record the copy pass (Decision Log #551, register Section 115): report

Base: `origin/main` defbd8a949193f3820edb518167c1456e5e14f42 (fetched fresh). Branch `docs/copy-pass-records`. Docs only. Python: `python -I` with python-docx added to the path from the user site, because `-I` ignores user site-packages.

## What changed (four files plus this report)
- `docs/Soccernity_MVP_Build_Plan_v1.7.docx`: one row appended to the Decision Log table, #551 "Humanize the counsel-facing drafts, apply the hosting facts, clear the pending-review tag from the drafts, refresh the counsel pack to v1.2". The row is a deep copy of the formatting of #550.
- `docs/build-register.md`: new Section 115 appended. No table row or earlier section edited. B-ID count stays 324, gap frames 146 (checked against Section 112, which states 324 B-IDs and 146 gap frames).
- `CLAUDE.md`: one bullet appended at the end. No earlier line edited.

## Numbering verified
- Decision Log: 549 rows before (header plus #1 to #550 with #293 and #294 absent), last row #550, so #551 was free. 550 rows after.
- Register: last heading was `## 114.`, so 115 was free. Latest B-ID is B-324 (also seen in Section 112). No B-ID added.

## Checks
1. Docx: all 549 earlier rows have identical cell text before and after; the other nine tables and all paragraphs are identical; only `word/document.xml` differs inside the zip; `testzip` is clean; the file reopens.
2. `git diff --stat`: `CLAUDE.md` 1 insertion, `docs/build-register.md` 9 insertions, the docx, and no deletions in the two text files. CRLF endings kept (the working files are CRLF; the committed blobs are LF through autocrlf).
3. Facts used and their sources: PR numbers and merge SHAs from `git log --merges` (#828 c2c9d7f, #829 cf34800, #834 1ec0af7, #835 81e8350, #836 ccd4bbd, #838 0e9be7c, #839 712067e, #842 9bed691, #843 37b6e29, #844 9dacc80, #845 52e25cc, #849 fb111d6, #854 b1e64ca, #855 b6dfe59, #856 2fb83b6); versions from `docs/copy-counsel-pack-v12-report.md`; tag counts, the N-4 variant (line 211, confirmed still present) and the `legalDocument.ts` `?raw` cause from `docs/copy-clear-draft-tags-report.md` and `docs/copy-clear-legal-copy-remaining-report.md`; hosting facts from `docs/copy-humanize-*-report.md` (Sentry EU region from the incident plan report). Release proof b6dfe59 is the founder's statement; I also ran `npm run build:release` on this branch (see 6). Nothing I could not confirm was written. I did not describe PRs #851 and #852 (R109a, R109b) because I did not read their reports.
4. Added text contains no em or en dash. The CLAUDE.md bullet keeps the file's existing " -- " convention in its closing sentence.
5. `python -I docs/counsel-pack-check.py`: exit 0 before and after, output identical (no draft touched).
6. `npm run build:release`: both builds passed, then `check:pending-copy` printed "OK: no [COPY PENDING LEGAL REVIEW] text in the production builds." The register and CLAUDE.md name the tag only in text that is not bundled into `apps/web` or `apps/admin`.

## PR list (merged)
Drafts: #834 Cloudflare, #838 contest and view-data addendum, #839 post-media addendum, #842 incident plan, #843 legal copy, #844 completion pass (three drafts), #845 DPIA. Product copy: #829 web, #828 API, #836 admin, #835 guardian-consent next steps. Tags: #849 (app strings, #550), #854 (drafts), #855 (last 13 legal-copy mentions). Counsel pack v1.2: #856.

## Open items (listed only)
1. `docs/counsel-pack-build.py` cannot rebuild the pack: no widths for the 4-column strings sheet. Dev to fix.
2. The legal draft bundle in `apps/web` contains Part C counsel notes and founder notes, because the whole file is imported raw. Dev to slice at build time; separate follow-up, not decided.
3. The web "report incorrect details" screen swallows the server message. The founder has not decided.
4. Stale statements in drafts, listed in the F2 report and the earlier copy reports, not fixed.
