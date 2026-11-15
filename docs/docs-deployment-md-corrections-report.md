# docs/deployment.md corrections - report

Branch `docs/deployment-md-corrections`, 2026-11-14, from `origin/main` `a31dec6`. Docs only. Changes `docs/deployment.md` and this report (plus one `CLAUDE.md` status bullet). No change to `render.yaml`, the runbook, the register, the Build Plan docx or any code. Handshake: `git fetch` clean, no open PR touched `docs/deployment.md`. Source list: `docs/launch-gate-runbook-report.md` section 6.

## 1. Corrections (old to new, one line each)

1. **Stale password-reset fallback sentence** - old: "(The password-reset email still falls back to a placeholder address; it is a known follow-up.)" - new: deleted. Checked: `password-reset-email.service.ts` no longer falls back; with an unusable `WEB_APP_BASE_URL` it sends nothing and logs an error naming the variable (B-115, PR #633). The password-reset email is now named in the list of emails that follow the `WEB_APP_BASE_URL` rule.
2. **"Two services" body text** - old: "intro: Render runs `services/api`"; "Region... puts both services in Frankfurt"; step 4.3 "show you the two services it defines... Both should show the Frankfurt region"; `/sw.js` section "This repo has no web static-site definition yet (`render.yaml` defines only the two API services...)" - new: Render runs the API and the two static sites; "both API services... the static sites have no region"; step 4.3 lists the six services (two APIs, four static sites, no region for the static sites); the `/sw.js` section says `render.yaml` defines the web static sites (section 4b) and the settings are checked on the first deploy. The dated "Update 2026-11-14" notes are kept.
3. **Origin variables said prompted / `sync: false`** - old: `WEB_APP_BASE_URL` and `ADMIN_APP_BASE_URL` were two bullets inside the "Render prompts for every `sync: false` variable" list, with a dated note saying they had changed - new: removed from that list and put in a separate "Plain values you check, not enter" block, with the four origins and the explanation of each. The dated note's content is folded into that block (so its separate note is gone, not duplicated).
4. **Step 4 variable list missing variables** - old list lacked 9 of the 37 `sync: false` names - new: bullets with one line of guidance and a runbook pointer for `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (runbook 3.4, 8.2), `REKOGNITION_ACCESS_KEY_ID`, `REKOGNITION_SECRET_ACCESS_KEY` (1.9), `MEDIA_UPLOADS_ENABLED` (7.5, 8.7), `ADMIN_2FA_ENFORCED` (6.2, 8.6), `DOB_ENCRYPTION_KEY_VERSION`, `DOB_ENCRYPTION_KEY_PREVIOUS` (6.1); `TRUST_PROXY_HOPS` gained a pointer to 6.3 and `SENTRY_DSN` to 1.8 and 6.6. The step 4 lead-in now says 37 per API service, none on the static sites, and points to runbook Appendix A and steps 3 and 4.2. Checked by script: all 37 `sync: false` names in `render.yaml` appear in `deployment.md`. No value, default or number was invented: every instruction comes from text already in `deployment.md`, `render.yaml` comments or the runbook.
5. **Go-live pointer** - new short section "Before and after go-live: where it is written" (before "What this repo still can't do"): smoke test (runbook Part 10), rollback (Part 11), backup (step 5.4, `dob-encryption-rollback.md`), monitoring (1.8, 6.6, 10.3), and one line that no Stripe webhook exists. Checked: no match for "webhook" in `services/api/src`, `apps/*/src`, `render.yaml` or `.env.example`.
6. **Top sentence** - new first paragraph: `docs/launch-gate-runbook.md` is the launch procedure; this file is the Render setup reference.

## 2. Left undecided

- **Node version**: the 4b "Inputs for the launch-gate runbook" bullet already says the root `engines` has no upper bound and the pin is decided at the gate; no correction needed, wording left as is (matches the runbook's "Node version" unknown).
- Founder questions F2 (staging migrations on the free plan), F3 (first superadmin hash), F4, F5, F7 and the rest live in the runbook and are not repeated here.

## 3. Found stale and NOT changed

- Step 3 line "None of these three has a code default..." reads ambiguously now that more switch bullets exist near it (it refers to the three generated secrets); left, outside the brief.
- Step 4, "Staging and the pre-deploy command": still says `render.yaml` is "deliberately unchanged" on that point; still true, and the decision (F2) is open.
- Step 5 ("After the first successful deploy") describes only the API URLs and the health check, not the static sites; the runbook (Parts 6 and 10) covers the sites. Section 4b has the header and `/sw.js` checks.
- Dated "Update 2026-11-14" notes in step 4 item 3 and in the `/sw.js` section are kept as asked, though their content is now repeated in the corrected body text.

## 4. Verification

Docs only; no test, build or lint run. Line endings (CRLF) preserved; `git diff` shows 80 insertions and 35 deletions, all in `docs/deployment.md`. Every runbook step number cited (1.8, 1.9, 3.4, 4.2, 5.4, 6.1, 6.2, 6.3, 6.6, 7.5, 8.2, 8.6, 8.7, 10.1, 10.3, Parts 3, 10, 11) was found in `docs/launch-gate-runbook.md`.
