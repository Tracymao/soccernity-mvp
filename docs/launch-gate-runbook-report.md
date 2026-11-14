# Launch-gate runbook - report (B-180)

Branch `docs/launch-gate-runbook`, 2026-11-14. Docs only. Produces `docs/launch-gate-runbook.md`. Changes no code, no schema, no `docs/build-register.md`, no Build Plan docx, no `docs/deployment.md`, no wording and no decision.

## 1. Coverage table (rows)

Source of the row set: the W11 and W12 founder-owned or launch-gate rows named in the brief (47 ids). "Step" = where the runbook handles it.

| Row | Handled in | Kind |
|---|---|---|
| B-088 accounts | 1.1-1.11 | step |
| B-089 legal-copy gate | 7.2 | step |
| B-090 launch gate | Parts 4-10 | step |
| B-124 pending-copy guard | 7.1, 4.1 | step |
| B-134 Playwright not in CI | 6.10 | step |
| B-159 legal copy / DPIA | 7.2, 7.3 | step |
| B-162 under-13 end to end | 1.6, 6.12 | step |
| B-179 static sites | 2, 4.1 | step |
| B-180 this runbook | whole file | deliverable |
| B-189 typographic club marks | Appendix C | no action (decided) |
| B-193 AWS opt-out | 1.9 | step |
| B-200 withdrawal wording | 7.4 | step |
| B-206 CSAM / reporting | 7.5, 8.7 | step |
| B-207 R2 token (list) | 1.4, 6.8 | step |
| B-208 pending-copy collation | 7.1 | step |
| B-219 Playwright count | 6.10 | note (stale figure) |
| B-220 Contest Rules | 7.6 | step |
| B-221 withdrawal page check | 6.11 | step |
| B-231 | Appendix C | built, no step |
| B-235 video upload record | 8.5 | step |
| B-236, B-241 SG drafts | 7.3 | step |
| B-265 private prefix | 6.8 | step |
| B-267 (a)-(l) | 6.2, 6.3, 6.5, 6.6, 6.7, 6.10, 6.1, 8.6, 8.7, 12.1, 12.3 | steps |
| B-273 QA harness | Appendix C | built |
| B-285 VAPID / push | 3.4, 8.2 | step |
| B-242 patching | Appendix C | built |
| B-243 API headers | Appendix C | built |
| B-244 global rate limit | Appendix C | built (note: per-instance memory) |
| B-245 cookie API | Appendix C | built |
| B-246, B-247, B-248 cookie sessions | 6.5 | check |
| B-249 domains | 2 | step |
| B-250 CI scanning | 12.1, 12.3 | step |
| B-251 Cloudflare | 8.1, 7.9 | step (NOT DECIDED) |
| B-252 DOB key boot check | 3.2, 3.3 | step |
| B-253 incident plan | 7.7 | step |
| B-254 pen test | 7.8 | step (NOT DECIDED) |
| B-255 admin router | Appendix C | built |
| B-256 auth limits | 6.3 | check |
| B-262, B-263, B-264 | Appendix C, 6.6 | built |
| B-268, B-269 toolchain | 12.2 | built |
| B-272 key rotation | 6.1 | step |

All 47 ids appear in the runbook (verified by script, section 4). **Rows left out: none of the 47.** Rows deliberately NOT included although launch-adjacent, with the reason: B-084 and B-085 (social sign-in) - removed, Decision Log #479, not a launch item; B-106 and B-055 are included (step 6.11) though they are W-something other than W11/W12 because the brief named them.

## 2. Unknown and undecided (each is a founder question in the runbook)

- F2 staging migrations on the free plan (`preDeployCommand` paid-only).
- F3 how the first superadmin's argon2 hash is made: **no command exists in the repo**; none invented.
- F4 Cloudflare proxy and origin lock (and whether Render's plans allow the lock).
- F5 pen test vendor, budget, scope, severity scale, retest window.
- F7 repository visibility vs required Analyze check.
- F8 Stripe test vs live keys at launch.
- F10 R2 public address (r2.dev vs custom) and the exact CSP hosts.
- F13 Upstash behaviour at free-plan limits.
- F15 video hosting (no ffmpeg on Render's native runtime).
- F17 `www` redirect.
- F19 no written same-site Playwright procedure on real domains.
- DNS record types and values, Render custom-domain steps, Neon restore-point steps, AWS opt-out setting name, Cloudflare R2 token permission names and CORS screen: all vendor screens, UNKNOWN until read on the day.
- Node version: the root requires `>=22.22.0` with no upper limit and nothing pins it on Render.
- Counsel/founder items owned elsewhere: 246 tagged strings, B-206, B-220, B-253, DPIA and legal-copy sign-off, B-200, Decision Log #438.

The runbook numbers the questions F2-F19 with gaps; the numbers are labels, not a count.

## 3. What could not be verified

- Nothing was run: no command, no build, no test, no Render/Neon/Upstash/Cloudflare/Postmark/Stripe/MaxMind/Sentry/AWS/Highlightly account exists. Every command is quoted from a file named next to it.
- `render.yaml` has never been imported or validated by Render (see `docs/infra-static-site-hosting-report.md` for the list).
- The recovery SQL and the key-rotation script have never run against real Neon/Render.
- CI cannot be read from this session beyond what `gh` shows; the 246-place pending-copy figure and the Playwright figures are quoted from `docs/qa-launch-gate-full-run-report.md` and CLAUDE.md, not re-run.
- Steps 6.4, 6.5, 6.9 depend on real accounts and domains.
- The "suggested" manual checks in 10.2 are a drafted list built from register launch items; there is no recorded smoke procedure in the repo beyond `deploy.yml`'s health check.

## 4. Verification run (script)

- All 47 row ids present in the runbook: yes (after adding B-243, B-244, B-245 to Appendix C).
- Every environment variable name in `render.yaml` (`key:` lines) and `.env.example` (127 distinct names) appears in the runbook: yes. The 37 `sync: false` names are in Appendix A; the plain-value names are listed one per line in Appendix B; `NODE_ENV`, `PORT` and the QA-only names are in step 3.6.
- Every file path named in backticks exists, except this report file itself (created in this PR).
- No TODO/TBD/XXX placeholders.

## 5. Where code and register disagree (followed the code)

- `docs/deployment.md` and the register's B-179/B-088 statuses are stale after the static-site PR (R70).
- B-219 "180 tests" is stale; the suite is 548 tests.
- `docs/admin-two-factor-recovery.md` says B-180 "will fold it in": step 6.2 does by reference; the SQL itself stays in that file (one source).
- Register says Sentry alerts "go to Sentry": true only once a real DSN exists (step 1.8).

## 6. Corrections needed in `docs/deployment.md` (not edited here)

1. Step 4: the password-reset placeholder-address fallback sentence is stale (fixed by B-115, PR #633).
2. "Before you start", step 3 and the `/sw.js` section still say two services / no static-site definition (dated update notes exist but the body text is wrong).
3. The origin-variable lines (`WEB_APP_BASE_URL`, `ADMIN_APP_BASE_URL`) still say `sync: false` / prompted at import; they are plain values.
4. The step 4 variable list omits some `sync: false` variables (`VAPID_*` appear only under `/sw.js`; `MEDIA_UPLOADS_ENABLED`, `ADMIN_2FA_ENFORCED`, `TRUST_PROXY_HOPS` guidance is thin).
5. No smoke-test, rollback, backup or monitoring guidance beyond step 5; no mention that no Stripe webhook exists.
6. Should point to this runbook as the launch procedure.
