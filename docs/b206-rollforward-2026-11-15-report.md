# B-206 roll-forward, report (2026-11-16)

Branch `docs/b206-rollforward-2026-11-15`, cut from `origin/main` `634c3b3` after PRs #799 to #803 (R91, R90, R89, R87, R88) were all merged. Docs only. Touches the Build Plan docx, `docs/build-register.md`, `docs/launch-gate-runbook.md`, `docs/deployment.md`, this report and one `CLAUDE.md` bullet.

## Numbers used

- Decision Log: #524, #525, #526, #527, #528 (last number before was #523; 521 data rows before, 526 after; #293 and #294 still absent; no duplicates).
- Register: B-321, B-322, B-323 (320 B-IDs before, 323 after: 41 with gap frames + 282 without; 146 gap frames unchanged). All three in W11, which is the hosting and launch-gate wave already holding B-206, B-179 and B-180 (W11 27 to 30). New Section 101.

## Decisions recorded

| # | What | Status |
|---|---|---|
| 524 | B-206 no longer waits for counsel; uploads go live at launch, `MEDIA_UPLOADS_ENABLED` is the off switch; founder accepts launching before hash-matching exists (his risk, not counsel's view); counsel list is non-blocking | Founder, stated |
| 525 | Shape of the reporting path | BUILT, PRs #800 and #803 |
| 526 | Detection after launch: IWF Image Intercept first, Hive fallback | Founder, stated; NOT BUILT |
| 527 | API runs from a Docker image with ffmpeg and ffprobe | BUILT, PR #801; proven locally only |
| 528 | B-162 is a launch-gate check on staging with Stripe test keys and GeoLite2; no test seam in product code | Founder, stated |

**#526 gap:** the reasons for dropping PhotoDNA and the Cloudflare scanning tool were not in the brief. They are not recorded, and the entry says so; the founder should add them.

**The brief said the decisions were "at the top of this file".** They were not in the text pasted to the Dev session; they were derived from the founder's brief and from the reports of PRs #799 to #803. The Security session could not be asked (non-interactive).

## Register lines changed (old text a prefix in each)

Dated lines appended to the Spec status cell of: B-206, B-306, B-267 (item (l) and B-162), B-283, B-290, B-294, B-235, B-180, B-162. Stale-sentence lines from a status audit: B-246 (B-248 is built), B-269 (B-268 is built), B-272 (the Neon and Render accounts exist), B-263 (guardian notification was settled by #456 and built by B-275). New rows B-321 to B-323 inserted after B-320. Counters updated on line 3 (Updated paragraph), line 27 (Register size), the Waves table, the Section 3 W11 list, the Section 7 heading (now #367-#528) and five new Section 7 rows.

## Docx

Five rows added; dated pointers appended to the Status cells of #462, #501, #419, #430 and #371. #409 and #450 not changed (#511 already lifted that deferral for repo files). #4 not changed (its counsel position is the one in the legal draft).

## Runbook and `docs/deployment.md`

Rewritten for #524 to #528: Docker image (runbook step 4.5, 5.1, 6.4, 6.15), B-162 (6.12), reporting-path check on staging (6.14), static-site headers (6.16), counsel list as non-blocking (7.5), launch condition (8.7), detection layer (12.6), checklist, F10 (cross-bucket CopyObject unproven), F15 answered, Appendices A and C. `deployment.md`: Docker image, GeoLite2 fetched at container start, the three-part private-bucket proof, the new `MEDIA_UPLOADS_ENABLED` condition.

## Stale items found and NOT changed

- `docs/incident-response-and-breach-notification-plan-draft.md`, `docs/dpia-addendum-post-media-draft.md` (R23 and neighbours), and `docs/legal-copy-draft-tos-privacy-policy.md` Part C rows 37 and 46: may describe uploads as waiting on counsel or the evidence path as absent (legal copy and DPIA are out of scope).
- `services/api/src/modules/two-factor/README.md` lines 54 and 182 still say issued access tokens stay valid (R90's verdict: no longer true after B-305 apart from the one-second edge). The founder should decide whether the 2026-10-31 "accepted" position was meant to survive.
- Older CLAUDE.md bullets quoting "uploads stay off until counsel answers B-206"; they are history.
- F2 (free-plan pre-deploy command), F5, F8, F17, F19 and the Node version for the static sites remain open in the runbook.

## What was not run

No test suite, `tsc`, `eslint`, build or Playwright (docs only); all test results are quoted from the PR reports. Figma not read. No vendor account touched. `docs/check_version_consistency.py` does not exist in the repo, so it was not run. Nothing here proves the Docker image on Render, the reporting path on staging, or any receiving body's process.

## Verification done

Register compared positionally with `git show origin/main:docs/build-register.md` (`difflib`, LF/CRLF normalised): the only differing lines are the intended ones; the 13 edited rows changed in the Spec status cell only with the old cell a prefix; 323 unique B-IDs, every main-table row has 12 cells; CRLF intact in every edited file. Docx compared cell by cell: only the Status cells of #371, #419, #430, #462 and #501 changed (appended text); five rows added; every other table and paragraph equal; `word/document.xml` is the only differing zip part; `testzip` clean.
