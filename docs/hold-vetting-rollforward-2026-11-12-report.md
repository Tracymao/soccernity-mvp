# Hold-vetting roll-forward, 2026-11-12 (docs only)

Branch `docs/hold-vetting-rollforward-2026-11-12`, cut from `origin/main` `6cc1522`. No code, schema, Figma, legal draft, DPIA or `docs/pending-copy-manifest.md` changed. No Decision Log row and no B-ID added. Register Section 90.

## 1. What changed

| File | Change |
|---|---|
| `docs/build-register.md` | Dated lines on B-295, B-297, B-298, B-301, B-302, B-303 (cell 5, Spec status); built-by pointers on Section 7 rows #497 to #499; four bracketed notes in Section 89 (89a B-302, 89a B-303, 89c item 1, 89c item 5); one sentence on the "Updated" paragraph; new Section 90 (55 lines: 90a rows, 90b recorded-not-decided i to viii, 90c stale statements, 90d arithmetic, 90e verification). Sections 86 to 88 untouched. |
| `docs/Soccernity_MVP_Build_Plan_v1.7.docx` | Bracketed 2026-11-12 notes appended to the Status cell of #488, #489, #492, #497, #498, #499. #485 to #487 not edited. |
| `CLAUDE.md` | New status bullet; merge-status lines corrected in place for the #744, #747, #748 and #749 bullets. |
| this file | New. |

## 2. PR map (checked with `git log`, `gh pr view`)

The brief's map was correct: #744 docs roll-forward (#496/#497, B-301, Section 88), #745 DPIA v0.7 / plan v0.5, #746 B-301, #747 docs (#498/#499, B-302, B-303, Section 89), #748 B-303, #749 B-302; B-296 = PR #724 (web alignment #737); B-300 / #495 = PR #742. All merged. `gh pr list --state open` returned nothing at the start.

## 3. Discrepancies and findings (every one, however small)

1. **CI on `main` at `6cc1522` (merge of PR #748) FAILED.** `gh run view 43304296432 --log-failed`: `build-and-test` failed at "Run e2e tests", 98 of 99 suites and 1,667 of 1,668 tests passing. The single failure is Postgres deadlock `40P01` in `TRUNCATE ... CASCADE` inside `resetDatabase` (`test/reset-database.ts:52`), at the start of a test in `test/email-change.e2e-spec.ts` line 103. CodeQL and `dependency-audit` passed. `f9b9df6` (PR #749) passed CI in full. PR #748 touches only `apps/admin`. It resembles the `40P01` recorded in the B-290 bullet, but that is a reading of the log: not rerun, not investigated, flake or defect unknown. This pass neither caused nor fixed it. This PR is docs-only, so its own CI will skip e2e.
2. Earlier docs passes said CI cannot be read from here. It can (`gh run list`, `gh run view`).
3. No Playwright spec exists for the Suspend dialog, Record an appeal, the hidden-context line, the seventh Contact Us option, or the vetting rule on the hold routes. The only `Suspend` match in `e2e/tests` is `22-contact-enquiries-escalate.spec.ts` line 213, which asserts the button is ABSENT on an enquiry-origin report. Existing specs that drive changed screens (20, 21, 22, 27, 28, `47-b284-admin-message-report`, 50, 51) have not been run since. Of the brief's nine spec numbers, 29 and `47-b284-message-report-web` do not match a file change in #737, #739, #740, #746, #748 or #749. Spec numbers are duplicated across files (36, 37, 41, 43, 47) and 33 is absent. None was run.
4. The Report detail response still lists a child-involved message report's holds and the Lift control is still shown to an admin who is not child-safety vetted; since #749 the click is refused with the restricted notice (`onRestricted` in `holdActions.tsx`). Hiding the control would be an `apps/admin` change nobody asked for.
5. PR #748 found and did not fix three audit-log display problems: the username-review notes are a raw `key=value` string carrying the handle and the internal reason; the appeal note is only `pending`; the username-review row links to the user, not the review.
6. Process notes in the builders' reports: the shared checkout switched branch mid-build for B-302; one unidentified test failed under load and passed on rerun for B-303. Test counts quoted for #746, #748, #749 are the builders' own and were not confirmed. The #746 report defers its numbers to the PR description; the 17 / 17 / 2 counts come from the PR's CLAUDE.md bullet and `git show 75c8657`.
7. Stale text named, not edited: `docs/sprint-1-dpia-outline-draft.md` v0.7 lines 87, 1448 to 1449, 1603 still say the hold routes are gated on `concernsMinor` only; incident plan v0.5 lists vetting coverage without the hold routes; Decision Log #485 to #487 keep "DECIDED, NOT BUILT"; Section 88c items 3 and 5 are history.
8. CLAUDE.md: the #745 and #746 bullets already carried "Merged". The #748 bullet sits out of order near line 10345 (where its branch left it); not moved. Older "not merged" lines were not swept.
9. Still open and unchanged: the suspension email goes to the address on file; the `contest_entry` retention block still stands.
10. `docs/check_version_consistency.py` does not exist in the repo.

## 4. Verification

- Register compared positionally with `git show origin/main:docs/build-register.md` (blob LF, working file CRLF, normalised for comparison; no bare LF in the working file). Differences: line 3; six main-table rows in cell 5 only (B-295, B-297, B-298, B-301, B-302, B-303); three Section 7 rows (#497, #498, #499); four Section 89 lines; one inserted 55-line block at the end. Every old text is a prefix of the new. 303 main-table rows, all 12 cells, 303 unique B-IDs. Section 90 contains no pipe character.
- Docx: only the Status cells of #488, #489, #492, #497, #498, #499 differ, append-only; paragraphs text-equal; 497 data rows, #293 and #294 absent, no duplicates; same zip parts, only `word/document.xml` differs; `testzip` clean; Build Plan stays v1.7.
- **Not run:** any test suite, `tsc`, `eslint`, build, Playwright, real-browser check. Code facts were read from files on `origin/main` or `git show`, not executed.
