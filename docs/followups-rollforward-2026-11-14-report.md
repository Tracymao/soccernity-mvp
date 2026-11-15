# Follow-ups roll-forward, 2026-11-14 (docs only)

Branch `docs/followups-rollforward-2026-11-14`, from `origin/main` `f7aaabc` (the merge of PR #791). Docs only: no code, schema, migration, Figma, legal text, DPIA, retention document or `docs/pending-copy-manifest.md` changed.

## What was recorded

**Decision Log #514 to #521** (the real next numbers; #513 was the last):

| # | Subject | Status as recorded |
|---|---------|--------------------|
| 514 | Contest tiles never show a club | Founder decision; BUILT by PR #789 (API field removed, a DEFAULT the founder may veto) and PR #786 (hidden Figma layers deleted) |
| 515 | A Bants room continues after its creator is anonymised or purged | Founder decision; PROVED by PR #788 (test only), its five findings stated in the row |
| 516 | Accepted as they are (four items) | Founder decision; (a) clock-before-lock stamps and (b) leaderboard default week are accepted risks, with reasons |
| 517 | Upstash plan (F13) | Founder decision; Security session conditions recorded as notes |
| 518 | Cloudflare proxy deferred until after launch (F4) | Founder decision; the Render IP-rule reason is a Security session finding, not verified |
| 519 | Repository stays public until launch (F7) | Founder decision; the paid-product reason is a Security session finding, price not confirmed |
| 520 | Public media on `media.soccernity.com` (F10) | Resolved in part; exact S3-endpoint host for the CSP still unknown |
| 521 | Two R2 buckets (B-265) | Founder decision; code BUILT by PR #791 (merged); R2 cross-bucket CopyObject unproven |

Pointers appended (original text unchanged) to the Status cells of #418, #424, #439, #441, #449, #471 and #510. The docx was changed only in the Decision Log table.

**Register:** new row B-319 (first superadmin command, BUILT by PR #787, `docs/first-superadmin.md`); Section 99; dated lines on B-071, B-088, B-090, B-134, B-179, B-180, B-208, B-219, B-232, B-234, B-251, B-265, B-267 and Section 98c (viii); Section 7 extended to #521. 319 B-IDs (41 with gap frames plus 278 without), 146 gap frames, W11 27.

**Runbook (`docs/launch-gate-runbook.md`) and `docs/deployment.md`:** the "no vendor account exists" statements corrected from the founder's own record (accounts exist for Neon, Upstash, Render, Cloudflare, Stripe, MaxMind, Postmark and Sentry; Render is created but not configured, on purpose; AWS, Google OAuth, Meta and the R2 buckets are not yet created; Highlightly and the per-account project, database, key or token state are for the founder to confirm at the step). Step 5.5 and F3 now point at the new command; F4, F7, F10 (in part) and F13 are marked answered; checklist rows 5.5, 8.1 and 12.3 updated. Steps 6.7, 6.8 and the two-bucket text of PR #791 were not rewritten; F2, F5, F8, F15, F17, F19 and the Node version were not touched.

## Why the vendor-account error was in the runbook

The runbook builder was never given the founder's vendor-account record, so it stated that no account existed. That is a gap in what the builder was told, not a mistake by the founder. The older reports (`docs/launch-gate-runbook-report.md`, `docs/infra-static-site-hosting-report.md`) and the older `CLAUDE.md` bullets carry the same sentence and are left as dated records (named in Section 99d).

## PR numbers cited

#785 (deployment.md corrections), #786 (Figma layers), #787 (first superadmin), #788 (room continuity test), #789 (carousel club removed), #791 (two-bucket storage), plus #777, #779, #781, #783 and the reports they came from.

## Verification and what was not verified

- Register compared positionally with `git show origin/main:docs/build-register.md` (difflib, LF and CRLF normalised; CRLF kept, no bare LF). Every changed main-table row differs in the Spec status cell only, old text a prefix; the other changes are the intended counters, the Section 7 heading and rows, one inserted row (B-319) and the appended Section 99. All 319 main-table rows have 12 cells.
- Docx Decision Log compared cell by cell: only the seven Status cells above changed, by appended text; eight rows added; 519 data rows, #293 and #294 still absent, no duplicate; `word/document.xml` is the only differing zip part; `testzip` clean.
- `check_version_consistency.py` does not exist in the repo, so it was not run; Temi runs it locally if it exists on his machine.
- No test suite, `tsc`, `eslint`, build or Playwright was run (docs PR). Test results quoted come from the builders' reports. Nothing was run against a vendor account. Figma was not read. The Security session's claims (Render IP rules, GitHub code scanning price, Upstash limits) were not verified.
- Only PR #790 (a Dependabot bump of `node-forge`) was open at the start; it touches none of the files edited here.
