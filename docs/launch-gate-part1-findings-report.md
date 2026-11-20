# Launch-gate Part 1 findings: report (R99, 2026-11-20)

Docs and config only. Branch `docs/launch-gate-part1-findings-2026-11-20`, from `origin/main` `31d1353`. No application code, Figma, legal draft, DPIA, manifest or test file changed.

## What was done

- **`render.yaml`**: staging static sites now allow `https://media.staging.soccernity.com` (CSP `img-src`, `media-src`) instead of the production host; all four static sites also allow `https://*.eu.r2.cloudflarestorage.com` beside `https://*.r2.cloudflarestorage.com`; API-service comments name the four buckets, the hosts and the `.eu.` endpoint; header comment says Render is Frankfurt and Neon/Upstash are London. `sync: false` count is still 81; YAML parses, six services.
- **Runbook** (`docs/launch-gate-runbook.md`): 246 changed to 196 (web 145, admin 51); steps 1.2, 1.3 (Neon two projects, London), 1.4 (four buckets, two tokens, `.eu.` endpoint), 1.5 (Postmark staging Live, sender), 1.7 (MaxMind permalink checked), 1.8 (Sentry EU, two projects), 1.9 (AWS Paid plan, opt-out done), 1.11 and 2.2 (DNS at Cloudflare), 3.2 (PowerShell alternative to `openssl rand`), 6.8 (per-environment media hosts, two CSP wildcards), Appendix A S3 rows.
- **`docs/deployment.md`**: title and region lines, Neon and Upstash London, two Neon projects, four buckets and per-environment tokens, per-environment media hosts, CSP section, DNS at Cloudflare. The CSP audit report (`docs/security-headers-csp-audit-report.md`) does not name these origins and was not edited.
- **Decision Log** (docx, append only): #535 (four buckets, two hosts) and #536 (London, two Neon projects, Sentry EU); dated pointer on #391. Compared with HEAD cell by cell: only row #391 differs, two rows added (535 data rows).
- **Register**: Section 104, dated lines on B-088, B-265 and B-024, Section 7 heading to #536, line-3 "Updated" sentence. No B-ID added (323).

## Defaults and doubts

- I added the `.eu.` wildcard instead of replacing the old one: a CSP wildcard probably covers several labels, but I did not test it in a browser and nothing in the repo says either way.
- The AWS opt-out wording and the Cloudflare/Neon/Upstash facts are the founder's statements, not checked by an agent.
- The Security session could not be asked (non-interactive).

## Stale statements NOT edited (they still say hosting is EU or lack the new hosts)

`docs/sprint-1-dpia-outline-draft.md` (line about 554, "Neon and Upstash in the EU"), `docs/legal-copy-draft-tos-privacy-policy.md`, `docs/cloudflare-processor-and-cross-border-draft.md`, the two post-media and contest addenda, `docs/counsel-review-pack.md`, `docs/incident-response-and-breach-notification-plan-draft.md`, `docs/pen-test-scope-brief-draft.md`, older QA and rollforward reports, and the dated notes in older register sections. Spec and README files that mention `r2.cloudflarestorage.com` without `.eu.` (`render-static-sites.spec.ts`, storage specs) were not touched.

## Not verified

No bucket, token, custom domain or Render service exists yet; the exact S3 host awaits the Cloudflare account id; cross-bucket copy on R2 is unproven; `docs/check_version_consistency.py` does not exist in the repo. The jest result for the two `render.yaml` specs is stated in the PR.
