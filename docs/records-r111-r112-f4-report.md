# Records for R111, R112 and CH-F4 (Decision Log #552, register Section 119)

Docs only. Branch `docs/records-r111-r112-f4` from `origin/main` b06b97e.

## Numbering verified
- Last Decision Log row before this change: #551 (550 data rows; 551 after). New row: #552.
- Last register section: 118. New section: 119.
- Latest B-ID: B-324. No new B-ID.

## PRs recorded (from `git log --merges`)
| PR | Merge SHA | Subject |
| --- | --- | --- |
| #862 | e323b45 | R111, guardian report-failure reason |
| #863 | 6adc373 | R112, pack build script and legal-text slice |
| #864 | 44c5c06 | CH-F4, stale statements, pack v1.3 |

Versions were read from the document table of `docs/counsel-review-pack.md` (pack v1.3) and checked against `docs/copy-stale-statements-report.md`.

## Open items (copied from the F4 report plus the R112 finding)
1. Whether Sentry is live with a real DSN.
2. Whether an AWS account exists.
3. Whether the contest addendum's risk numbering should be renumbered now the DPIA reaches R36.
4. Whether legal copy lines 913 and 918 get a separate legal pass.
5. The rendered Terms and Privacy text still carries draft markers ([OPEN, [PROPOSAL, Decision Log).

## Not done
Nothing outside the four files was edited. Section 117's "Decision Log row to follow" and Section 118's matching line were left unedited (append only); #552 is the row.

## Checks
- Docx: every cell of rows #1 to #551, every other table and all body paragraphs compared text-identical to the committed file; one row added.
- Zero em or en dashes in added text; `docs/counsel-pack-check.py` output and exit code (0) unchanged.
- New row text is the last row of table 6 in the docx.
