# QA hygiene roll-forward, 2026-11-14

Written for: the founder (Temi), who verifies and merges, and the Dev and QA sessions who read the register.

Docs only. Branch `docs/qa-hygiene-rollforward-2026-11-14`, cut from `origin/main` `10792d2` (after PR #773, the dev leftovers roll-forward, and PR #774, the admin login limit and QA hygiene). No code, schema, Figma, legal copy, DPIA, incident plan or `docs/pending-copy-manifest.md` changed. Nothing was run (no test suite, `tsc`, `eslint`, build or Playwright).

## What was recorded

- **Decision Log #509** (new row, Build Plan docx, append-only). Founder decision 2026-11-14, stated: the admin login limit is configurable for QA by an environment variable and production behaviour is unchanged. Follows #190. Recorded as built (read from the merged diff and the builder's report): `ADMIN_LOGIN_RATE_LIMIT_MAX`, default 5 per 15 minutes per IP on its own counter, read on every request; the API refuses to start in production with it set; exempt from `render.yaml`; documented in `.env.example` (commented) and `docs/deployment.md`; set to 1000000 by the QA stack. The boot refusal and the `render.yaml` exemption follow the pattern of the QA test clock. The QA repairs of the same PR (specs 19, 10, 37-b053, 38, `global-setup.ts` prisma generate, README notes) are test-only and are not decisions. A dated pointer was appended to #190's Status cell; no other existing cell changed.
- **Register B-316** (new row, BUILT by PR #774, W8, counsel-pending N) and **Section 97** (97a to 97f). Section 7 extended to #509. A dated line on B-310 (its hard-coded-limit sentences are superseded; original text unchanged). B-309 was not touched: nothing it records changed.
- **CLAUDE.md:** a new status bullet; the merge status of the `qa/admin-login-limit-and-hygiene` and `docs/dev-leftovers-closeout-2026-11-14` bullets corrected in place (PRs #774 and #773, both confirmed MERGED with `gh pr view`).

## Adopted defaults (builder's, veto-able)

None are founder-stated beyond #509. They are listed in Section 97b: the variable name, per-request reading, the boot refusal, the `render.yaml` exemption, the changed assertion in spec 37-b053 and the log-line signal in spec 38.

## Recorded, not decided

- One test failed in the builder's whole run: `37-b058-admin-remove-account.spec.ts` line 120 (a data-dependent spec defect: the 'OK' button name also matches 'Remove account: Mira Okon'; passes alone 4 of 4; `exact: true` not applied). No row owns it.
- Builder's run (not rerun here): 548 tests, 534 passed, 1 failed, 12 skipped (by design), 1 did not run, 38.6 minutes. No admin login 429 and no two-factor code-limit refusal; the two-factor code limit (10 per 15 minutes) is unchanged. Spec 45 line 63 did not fail and is not named in the report.
- CI was not fully readable from this session (CodeQL success on `10792d2`, main CI still running at the time).

## Statements these changes make stale (named, not edited)

Section 94d (i), Section 93b item (v) 2, the `qa-full-run-after-b310` report sections 4 and 6, the `backend-password-change-fresh-session` report's 'Admin-login limit (B7)' paragraph, and the older CLAUDE.md bullets on the B-310 build and the QA full run. `e2e/README.md` is not stale on spec 19: the PR added a correct sentence.

## Verification

See the PR description for the positional register comparison and the cell-by-cell docx comparison. `docs/check_version_consistency.py` does not exist in the repo, so it was not run; Temi runs it locally before merging. This PR touches the Decision Log docx and merges alone.
