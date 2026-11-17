# Counsel-pack roll-forward (R98), 2026-11-17

Docs only. Branch `docs/counsel-pack-rollforward-2026-11-17`, cut from `origin/main` `b67d9c01a1921d459a1bda324eed4a92bf92c1b1`. No code, schema, Figma, legal draft, DPIA, incident plan, counsel pack or manifest changed.

## Handshake

- `git fetch origin`; `origin/main` = `b67d9c01a1921d459a1bda324eed4a92bf92c1b1`.
- `gh pr list --state open` returned no open PR, so none touches the register, the Build Plan docx or the runbook.
- The Security session could not be asked (non-interactive session); stated, not assumed.
- Read first: `docs/counsel-review-pack-report.md`, `docs/counsel-pack-left-out.md`, register Section 102.
- Numbers used: Decision Log #533 and #534 (next free; #532 was the last), register Section 103 (102 was the last).

## What changed

### Decision Log docx (append only)

| Row | Content |
|---|---|
| #533 | Founder decision 2026-11-15, recorded 2026-11-17: only vetted, authorised staff may open suspected-illegal-imagery files; staff vetting and welfare are Soccernity's HR duty, owned by the founder, not a question for counsel; evidence mechanism chosen (#525); if the law requires more the founder will cooperate fully. Counsel's view not recorded. Notes it had never been a Decision Log row. |
| #534 | Founder decision 2026-11-17 applying #532: (a) five pack questions removed; (b) the 365-day figure stays configuration and is not stated in public legal copy; (c) ten items recorded as founder or engineering housekeeping, "recorded, not decided", owner named. Marked NOT YET EXECUTED (D6 to D9). |
| #532 | Dated pointer appended to the Status cell: "applied by #534". |

### Register (`docs/build-register.md`)

- Line 3 header paragraph: one sentence appended.
- Section 7 heading renamed `#367-#532` to `#367-#534`; two rows added.
- Dated lines appended (old text a prefix, one cell each) on B-206 and B-321. No B-ID added (323; 146 gap frames; W11 30).
- Section 103 added (rows changed, adopted defaults, recorded-not-decided with owners, executed-by-later-PRs and stale statements, arithmetic, verification).

### Runbook (`docs/launch-gate-runbook.md`)

Two lines changed:

- Part 7: one paragraph added after "None of these is decided by this runbook" saying counsel receives `docs/counsel-review-pack.docx` (source `docs/counsel-review-pack.md`): the questions, grouped, and the strings sheet. No question count.
- Step 7.5: "These questions are Group 1 of the counsel pack." added; the step stays NON-BLOCKING; nothing else touched.

## Proofs

- Register compared positionally (`difflib.SequenceMatcher`, line order, LF/CRLF normalised) against `git show origin/main:docs/build-register.md`: changes are line 3, B-206 and B-321 (cell 5 only, every cell's old text a prefix of the new), the Section 7 heading, two inserted Section 7 rows, and the appended Section 103. 323 unique B-IDs, every main-table row 12 cells.
- Docx Decision Log compared cell by cell: the only changed pre-existing cell is #532 Status (old text a prefix); 532 data rows, 532 unique numbers, only #293 and #294 absent; all other tables and body paragraphs text-equal; only `word/document.xml` differs in the zip; `testzip` clean.
- Runbook: `git diff` shows exactly the two lines above.
- `check_version_consistency.py`: not present in the repo, so not run. Temi runs it locally.

## Found, not changed

- The counsel pack on main (`docs/counsel-review-pack.md` and `.docx`) and `docs/counsel-pack-left-out.md` still contain the five removed questions; D9 regenerates them. Pack counts (75 questions) are pre-D9.
- Runbook step 7.5 still lists four questions inline; they overlap the pack's Group 1. Reconciling them belongs to D9.
- Section 102c says the counsel pack is a later PR; it has since been built. History, not edited.
- "Authorised" in #533 is the founder's word; code checks only the child-safety-vetted flag.
- The first statement of #533 on 2026-11-15 has no cited source document in the brief.

## Not run

No test suite, `tsc`, `eslint`, build or Playwright (docs PR). Figma not read. CI not read.
