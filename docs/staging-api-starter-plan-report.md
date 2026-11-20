# Staging API moves to the Starter plan (R100, 2026-11-20)

Branch `docs/staging-api-starter-plan-2026-11-20`, from `origin/main` `746736e58452b418130457a72d4e9ebed9e58a9f`. No open PR touched `render.yaml`, the runbook, the Build Plan docx or the register. The Security session could not be asked (non-interactive session). Numbers used: Decision Log #537, register Section 105.

## Fact and decision
- Observed by the founder: importing `render.yaml` as a Blueprint failed with "services[0]: pre-deploy command is not supported for free tier services". `services[0]` is `soccernity-api-staging`. Nothing was created.
- Decision (founder, 2026-11-20): `soccernity-api-staging` is `plan: starter`, like production. Option B (keep free, move the commands into the start script) was rejected: staging would behave differently from production. This resolves runbook F2.

## Changed lines
- `render.yaml`: header comment "PRE-DEPLOY ON THE FREE PLAN ... will probably NOT run ..." replaced by the observed fact and the decision; staging API `plan: free` to `plan: starter`; the comment "Free for staging: no guardian-consent traffic ..." replaced by "Starter for staging (Decision Log #537) ...". Nothing else. Parses (six services, plans starter, starter, none x4); `sync: false` count 81 before and after.
- `docs/launch-gate-runbook.md`: step 1.1 (plans, note), step 4.1 (bring `staging` up to `main` first: it was 1,928 commits behind and had no `render.yaml`, done on 2026-11-20 by a pull request from `main` into `staging`; the observed failure; retry the import), step 4.5 (free-plan Docker UNKNOWN removed), step 5.2 (on Starter the command runs; look for the migration lines and `DOB encryption backfill: scanned=`), F2 (ANSWERED), F15 (free-plan sentence removed).
- `docs/deployment.md`: Docker free-plan sentences (two places), the "Staging and the pre-deploy command" section, the closing sentence of "Why Starter, not Free, for production".
- Build Plan docx: row #537 added; pointers appended to #527 and #535 (append only; python-docx diff against the base: only those two Status cells differ, old text a prefix; 536 to 537 rows; zip intact).
- `docs/build-register.md`: dated lines on B-180 and B-322 (old text a prefix); Section 105. No new B-ID.

## Stale and NOT changed
- Sections 100 to 104 of the register that say F2 or the free-plan Docker question is open (history); `docs/infra-api-docker-ffmpeg-report.md`, `docs/infra-static-site-hosting-report.md`; the text of #527.
- The promotion process after launch is NOT decided (whether a merge to `main` deploys production automatically): founder question for runbook Part 9.

## Not run
- Render's reaction to the new file (only visible when the founder retries the import).
- `render-static-sites.spec.ts` and `env-completeness.spec.ts` were started; see the PR description for the result. Neither names the staging plan (grep).
- `check_version_consistency.py` does not exist in the repo.
