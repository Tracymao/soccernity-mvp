# R107: Playwright specs survive wording and tag changes

e2e specs and support only. No product code, API or copy changed. Base: main `52e25ccd`, branch `r107-e2e-spec-fixes`. Decision Log #549, register Section 112.

## What was wrong (the six baseline failures)
| Spec | Cause | Fix |
|---|---|---|
| 18:105, 62:65 | Upload note lost its tag (R101, #539) | `textMatching` |
| 24:212 | "Regenerate" lost its tag (#531) | `textMatching` (exact) |
| 17:417 | Footer now "Showing 7 to 9 of 9 finalists" | strip regex accepts `–` or ` to `; the no-count check is unchanged |
| 15:316, 45:63 | Random usernames the real rules refuse (old rates: `b117-creator` 5.8%, `blk10` 0.5%, `blk9` 0.01%) | letters-only generator, retry once |

## Changes
- `helpers.ts`: `textMatching(text, { exact })` escapes the text and accepts an optional trailing ` [COPY PENDING LEGAL REVIEW]`. Used in 14 specs: 18, 20, 24, 31, 38, 39, 40, 44, 52, 53, 54, 55, 60, 62.
- `support/username.ts`: `uniqueUsername` = `u` + run time and counter mapped onto the letters `bdgjpqvwxz` + 4 random letters; 22 to 25 letters, no digits, label ignored. `assignUsername` (used by specs 08, 12, 14, 15, 16, 18, 23, 29, 36, 39, 45 to 51 and `contest-clock.ts`) tries `PATCH /users/:id` twice, retries only on a 400, and puts every status and body in the failure message.
- Spec 67 imports the real `checkUsernameRules` and checks 120,000 names over 34 labels (all labels the specs use plus `blk9`, `blk10`, `b117-creator`) and four owner contexts: zero rule failures, zero duplicates, all 3 to 30 letters. Run alone in 4 s.

## Runs (each spec alone, this clone, ports free)
| Spec | Result |
|---|---|
| 15 | 27 passed, 1 skipped (fresh-API-only test, by design) |
| 17 | 12 passed, 2 skipped (single-phase tests, by design); the crowned test (17:499) now runs |
| 18 | 8 passed; the 7 not-run tests now run |
| 24 | 6 passed, 1 skipped (24:379 needs enforcement); with `ADMIN_2FA_ENFORCED=true`: 6 passed, 1 skipped (the enforcement-off test 24:315, by design). 24:379 ran only in the enforced run |
| 45 | 3 passed on rerun. The first run failed at start-up (`API /health never became healthy`, slow first migration on this machine) and two earlier runs hit my own command timeout; not a test failure |
| 62 | 3 passed; the 2 not-run tests now run |
All 17 previously not-run tests now run and pass. Screenshots under `docs/` rewritten by the runs were restored (`git checkout -- docs/`, new ones removed).

## Specs asserting a string from `docs/pending-copy-manifest.md`
The 14 above (through `textMatching`). Still assert the tag itself, kept on purpose because the tag is the thing tested: 21 (:45), 25 (:93), 32 (:61), 51 (`TAG`), 53 (:193), 54 (:96), 65 (:92), 66 (:98), 52 (tag lines). 44:186 asserts the tag is absent. These break only if a string is cleared, and then the failing test says so.

## Not covered
`POST /admin/media/upload` (B-267 (e)): grep of `e2e/tests` and `e2e/support` finds no match. Still missing; spec not written here.

## Found, not fixed
- Spec 45 and others depend on a first-run migration that can exceed the harness health wait on a cold database.
- The 24:379 enforcement test only runs with the environment variable, so a plain full run never executes it.
- Specs that assert the tag's presence (list above) will need a one-line change each when their strings are cleared.
- Nothing was run as a whole suite; CI not read.
