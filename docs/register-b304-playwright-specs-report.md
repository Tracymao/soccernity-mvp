# Register B-304: Playwright specs after the QA run (docs only)

Written for: Temi (founder) and the next dev/QA session. A register-only PR: `docs/build-register.md` (new row B-304, new Section 91, counters, one dated line on B-297) and `CLAUDE.md` (one status bullet). No application code, spec, schema, Figma, legal draft, DPIA, Build Plan docx or manifest changed, and nothing under `e2e/`. No Decision Log row.

## 1. Handshake (results)

- `git fetch origin`: `origin/main` is `2ddb300` (merge of PR #751), the head named in the brief. No newer merge to list.
- `gh pr list --state open`: no open PR, so none edits `docs/build-register.md` or `CLAUDE.md`.
- Section 90 is the last register section, so Section 91 is next. `B-304` had no match anywhere in the register. No Decision Log number is needed and none was added.
- **A collision to know about.** My first clone went to `D:\Projects\soccernity-b304`. Another session is using that same path on branch `qa/b304-playwright-specs`, and it has uncommitted edits to `e2e/tests/20-...`, `27-...`, `47-b284-admin-message-report...` and `51-b289-...` (the spec repair work). I did not touch it. This PR was built in a separate fresh clone, `D:\Projects\soccernity-register-b304`, on branch `docs/register-b304-playwright-specs`. Nothing from that other session is in this PR.

## 2. What changed

| Place | Change |
|---|---|
| Row B-304 (main table, after B-303) | New. 12 cells. Item: Playwright specs for the suspension, appeal, hidden-context, hold-vetting and Contact Us seventh-option changes, plus repair of four stale specs. Gap frames 0, "No frame counted here". Spec status starts "NOT BUILT. No Decision Log row." and holds the scope (a) four repairs, (b) new specs numbered 52 and up, (c) the QA run numbers and "the suite is not in CI". Owner `FC -> QA`, wave W8, counsel cell `N`. |
| Row B-297, cell 5 (Spec status) | One dated line appended (old text a prefix): a report whose message row is gone fails closed and can only be closed by a vetted admin; confirmed by QA spec 47; adopted default, veto-able. |
| Line 3 ("Updated" paragraph) | One sentence appended. |
| Section 1 "Register size" paragraph | `303 B-IDs ... 262` becomes `304 B-IDs ... 263`, and "was 303 = 41 + 262 before B-304 (Section 91 ...)" is added in front of the history. |
| Waves table | W8 `50` becomes `51`; Total `303` becomes `304`. |
| W8 list (Section 3) | `B-IDs (50)` becomes `B-IDs (51)`; `B-304 (playwright_specs)` appended. |
| Section 91 | New, in the structure of Section 90: 91a rows changed, 91b recorded not decided, 91c stale statements, 91d arithmetic, 91e verification. |
| `CLAUDE.md` | One status bullet, placed after the QA run bullet (PR #751), before "## Figma notes". Nothing else corrected. |

References in the B-304 row were checked against the rows I read, not copied from the brief: the Decision Log cell lists #485 (B-291, B-292), #486 (B-293), #491 (B-297), #492 (B-298), #498 and #499 (B-302), #465 (B-284), #489 (B-296) and #483 (B-289). B-172's own row carries #408, #407 and #406 (its Spec status cell mentions the later decision), so B-172 appears only in the refs and Depends cells, not as a Decision Log number.

## 3. Arithmetic (printed from the file, not copied)

- Main table: 304 rows, 304 unique B-IDs, all 12 cells (script check). Before: 303.
- Waves from the table: W0 61, W1 13, W2 3, W3 16, W4 7, W5 21, W6 9, W7 3, W8 51, W9 57, W10 16, W11 26, W12 21: sum **304**; gap column sum **146**.
- The wave column of the 304 main-table rows gives the same counts (W8 = 51).
- W8 list line: 51 names.
- 41 rows with gap frames + 263 without = 304. 146 + 196 Built = 342; 342 + 65 + 36 = 443 (unchanged).

## 4. Positional comparison with `origin/main`

Method: `difflib.SequenceMatcher` over lines, in order, not by B-ID (about 157 B-IDs sit on two lines). The blob is LF, the working file CRLF through autocrlf; both normalised to LF for the comparison. Working file: 4,839 CRLF, 0 bare LF. Line counts: 4,795 old (the trailing empty element), 4,840 new.

Eight non-equal opcodes, nothing else differs:

| Old line | New line | Kind | Detail |
|---|---|---|---|
| 3 | 3 | replace | Appended 577 characters; the old line is a prefix of the new one. |
| 27 | 27 | replace | Counters only: `303`->`304`, `262`->`263`, and the inserted text ` 303 = 41 + 262 before B-304 (Section 91; no Decision Log row; it carries 0 gap frames),`. |
| 41 | 41 | replace | W8 `50`->`51`. |
| 46 | 46 | replace | Total `303`->`304`. |
| 350 | 350 | replace | B-297: 12 cells before and after; only cell 5 (Spec status) differs, and the old cell is a prefix of the new one. |
| (after 356) | 357 | insert | One line: the B-304 row (12 cells). |
| 414 | 415 | replace | W8 list: `(50)`->`(51)` and `, B-304 (playwright_specs)` appended. |
| (after 4794) | 4797 to 4840 | insert | Section 91 (44 lines, with a blank line before the heading). |

(Old and new line numbers differ after the inserted B-304 row, which is why the W8 list is old 414 / new 415.)

`CLAUDE.md`: one opcode, an insert of one line (the new bullet) at old line 10539; 0 bare LF.

Byte-identity: `git diff --name-only origin/main` lists only `CLAUDE.md` and `docs/build-register.md`. The Build Plan docx, `docs/pending-copy-manifest.md`, `docs/sprint-1-dpia-outline-draft.md`, `docs/dpia-addendum-post-media-draft.md`, `docs/incident-response-and-breach-notification-plan-draft.md` and `docs/legal-copy-draft-tos-privacy-policy.md` are unchanged. Nothing under `e2e/` changed.

## 5. What I could not verify

- No test suite, `tsc`, `eslint`, build or Playwright was run (docs PR).
- I cannot read CI from here and did not try. The failure on `6cc1522` (Section 90b item viii) is left exactly as Section 90 recorded it.
- The QA numbers (115 tests, 97 passed, 4 failed, 14 not run, none flaky) are quoted from `docs/qa-playwright-run-2026-11-12-report.md`; I did not rerun them.
- That `.github/workflows/ci.yml` has no Playwright step rests on a case-insensitive search of that file (the only matches for "e2e" are the Jest `npm run test:e2e` step and comments).
- The two founder-accepted recommendations (decisions 3 and 4) are labelled "adopted default, veto-able" in the register as instructed; I recorded them from the brief, not from a Decision Log row.
- `docs/check_version_consistency.py` does not exist in the repo, so it was not run.

## 6. Next step

One spec PR (the other session's branch `qa/b304-playwright-specs` appears to be it) builds B-304. When it merges, a status line on B-304 and B-297 and a pointer on Section 90b (vii) are the follow-up docs change.
