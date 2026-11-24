# Copy pass CH-F4: stale statements in the counsel drafts

Base SHA `6adc373700bd01f906ddfd37cc90b4df583ce9e7`, branch `copy/stale-statements`, Python 3.14.5. The R112 PR (#863) is merged on this base.

## Changes (file, line, old, new, source)

### `docs/cloudflare-processor-and-cross-border-draft.md`

Source: Decision Log #449/#518 (proxy built after launch), #541 (media address proxied from the start), CLAUDE.md launch-gate bullets (Cloudflare account exists, DNS only)

- Line 5
  - old: `...raft for counsel review.** v0.5 tag removal 2026-11-22 (v0.4...`
  - new: `...raft for counsel review.** v0.6 stale-statement fixes 2026-11-23 (proxy timing under #518, accounts and media address under #541); v0.5 tag removal 2026-11-22 (v0.4...`
- Line 22
  - old: `...OVED) **[v0.5 CHANGED, #541]**. Changelog v0.3 → v0.4 (2026-...`
  - new: `...OVED) **[v0.5 CHANGED, #541]**; revised 2026-11-23 (**v0.6**, still draft, NOT APPROVED) **[v0.6 CHANGED, #518, #541]**. Changelog v0.6 (2026-11-23): the statements that no Cloudflare account exists and that the proxy is built at the launch gate were corrected to the current facts (account exists, #541; proxy deferred until after launch, #518); no duty, number or disposition changed. Changelog v0....`
- Line 24
  - old: `...  with an origin lock; built at the launch gate), #424 (the original recommen...`
  - new: `...  with an origin lock; building deferred until after launch, #518), #424 (the original recommen...`
- Line 27
  - old: `...- **Nothing here is live.** No Cloudflare account, domain, DNS record or deployment exists. The proxy is built at the...`
  - new: `...- **Nothing here is live.** A Cloudflare account exists (DNS) and the media address is proxied from the start (#541). The proxy is built after...`
- Line 28
  - old: `...  launch gate (B-090). Everything about Cloudflare ...`
  - new: `...  launch (#518) **[v0.6 CHANGED, #518, #541]**. Everything about Cloudflare ...`
- Line 98
  - old: `...ed (#449); **not built**; built at the launch gate |...`
  - new: `...ed (#449); **not built**; building deferred until after launch (#518) |...`
- Line 392
  - old: `... that decrypts all traffic.** From the launch gate, a Cloudflare free-plan proxy...`
  - new: `... that decrypts all traffic.** After launch (#518), a Cloudflare free-plan proxy...`

### `docs/legal-copy-part-c-post-media-draft.md`

Source: docs/legal-copy-draft-tos-privacy-policy.md header (v0.21)

- Line 17
  - old: `...**, still draft, NOT APPROVED)...`
  - new: `...**, still draft, NOT APPROVED); revised 2026-11-23 (**v0.5**, still draft, NOT APPROVED)...`
- Line 35
  - old: `...--- v0.4 (2026-11-22): the pending-le...`
  - new: `...--- v0.5 (2026-11-23): the stale version pointer in section 2 note updated to the current legal draft; nothing else changed. v0.4 (2026-11-22): the pending-le...`
- Line 47
  - old: `...NGED — #532]** *(It is now v0.17; the numbers have moved again.)* **That file is not touched h...`
  - new: `...NGED — #532]** *(It is now v0.21; the numbers have moved again.)* **[v0.5 CHANGED, current legal draft version]** **That file is not touched h...`

### `docs/legal-copy-part-c-view-data-draft.md`

Source: docs/legal-copy-draft-tos-privacy-policy.md header (v0.21)

- Line 17
  - old: `...**, still draft, NOT APPROVED)...`
  - new: `...**, still draft, NOT APPROVED); revised 2026-11-23 (**v0.5**, still draft, NOT APPROVED)...`
- Line 30
  - old: `...--- v0.4 (2026-11-22): the pending-le...`
  - new: `...--- v0.5 (2026-11-23): the stale version pointer on the "Stale in this file" line updated to the current legal draft; the row-number statement was not re-checked. v0.4 (2026-11-22): the pending-le...`
- Line 40
  - old: `.... The legal draft is now **v0.16** and its Part C already uses...`
  - new: `.... The legal draft is now **v0.21** **[v0.5 CHANGED, current legal draft version]** and its Part C already uses...`

### `docs/dpia-addendum-contest-view-data-draft.md`

Source: docs/sprint-1-dpia-outline-draft.md (DPIA v0.13, risks R17 to R36 present)

- Line 26
  - old: `...**, still draft, NOT APPROVED)...`
  - new: `...**, still draft, NOT APPROVED); revised 2026-11-23 (**v0.5**, still draft, NOT APPROVED)...`
- Line 39
  - old: `...--- v0.4 (2026-11-22): the pending-le...`
  - new: `...--- v0.5 (2026-11-23): "v0.3 DPIA" labels updated to the current DPIA on lines where the cited section still says what the sentence relies on; line 212 (risk numbering) and line 54 were left. v0.4 (2026-11-22): the pending-le...`
- Line 69
  - old: `...is is the same limitation the v0.3 DPIA states at its §0 item 5....`
  - new: `...is is the same limitation the DPIA v0.13 states at its §0 item 5. **[v0.5 CHANGED, DPIA label updated to the current version]**...`
- Line 191
  - old: `..., NOT DETERMINED]** As in the v0.3 DPIA §2.1, this draft does **not** select a lawful basis....`
  - new: `..., NOT DETERMINED]** As in the DPIA v0.13 §2.1, this draft does **not** select a lawful basis. **[v0.5 CHANGED, DPIA label updated to the current version]**...`
- Line 206
  - old: `...- COPPA (US under-13s): the v0.3 DPIA §2.6 treats card verification as the stated control for the...`
  - new: `...- COPPA (US under-13s): the DPIA v0.13 §2.6 treats card verification as the stated control for the **[v0.5 CHANGED, DPIA label updated to the current version]**...`
- Line 214
  - old: `...in the same convention as the v0.3 DPIA....`
  - new: `...in the same convention as the DPIA v0.13. **[v0.5 CHANGED, DPIA label updated to the current version]**...`

### `docs/dpia-addendum-post-media-draft.md`

Source: docs/sprint-1-dpia-outline-draft.md (DPIA v0.13)

- Line 25
  - old: `....7); revised 2026-11-22 (v0.8)...`
  - new: `....7); revised 2026-11-22 (v0.8); revised 2026-11-23 (v0.9)...`
- Line 26
  - old: `...- **Version:** 0.8 (draft, NOT APPROVED) **[v0.6...`
  - new: `...- **Version:** 0.9 (draft, NOT APPROVED) **[v0.6...`
- Line 44
  - old: `...--- v0.8 (2026-11-22): the pending-le...`
  - new: `...--- v0.9 (2026-11-23): "v0.3 DPIA" labels updated to the current DPIA where the cited section still says what the sentence relies on; labels in sentences that describe the old DPIA text as stale were left. v0.8 (2026-11-22): the pending-le...`
- Line 175
  - old: `...ssroots football photography; v0.3 DPIA R8). The check...`
  - new: `...ssroots football photography; DPIA v0.13 R8). The check **[v0.9 CHANGED, DPIA label updated to the current version]**...`
- Line 325
  - old: `..., NOT DETERMINED]** As in the v0.3 DPIA §2.1, this draft does **not** select a lawful basis. For counsel:...`
  - new: `..., NOT DETERMINED]** As in the DPIA v0.13 §2.1, this draft does **not** select a lawful basis. For counsel: **[v0.9 CHANGED, DPIA label updated to the current version]**...`
- Line 341
  - old: `...- COPPA (US under-13s): the v0.3 DPIA §2.6 treats card verification as the stated control. Whether uploads by a...`
  - new: `...- COPPA (US under-13s): the DPIA v0.13 §2.6 treats card verification as the stated control. Whether uploads by a **[v0.9 CHANGED, DPIA label updated to the current version]**...`
- Line 544
  - old: `...in the same convention as the v0.3 DPIA....`
  - new: `...in the same convention as the DPIA v0.13. **[v0.9 CHANGED, DPIA label updated to the current version]**...`
- Line 615
  - old: `...Placeholder ratings.* Extends v0.3 DPIA R9....`
  - new: `...Placeholder ratings.* Extends DPIA v0.13 R9. **[v0.9 CHANGED, DPIA label updated to the current version]**...`
- Line 875
  - old: `...ivalent to the DBS-type check v0.3 DPIA R9 raises)?...`
  - new: `...ivalent to the DBS-type check DPIA v0.13 R9 raises)? **[v0.9 CHANGED, DPIA label updated to the current version]**...`
- Line 973
  - old: `...is is the same limitation the v0.3 DPIA states at its §0 item 5....`
  - new: `...is is the same limitation the DPIA v0.13 states at its §0 item 5. **[v0.9 CHANGED, DPIA label updated to the current version]**...`

### `docs/sprint-1-dpia-outline-draft.md`

Source: CLAUDE.md launch-gate bullets (Render created but not configured, nothing deployed); apps/web and apps/admin are built

- Line 30
  - old: `...1); revised 2026-11-22 (v0.12)...`
  - new: `...1); revised 2026-11-22 (v0.12); revised 2026-11-23 (v0.13)...`
- Line 34
  - old: `...- **Version:** 0.12 (draft, still NOT APPROVED)...`
  - new: `...- **Version:** 0.13 (draft, still NOT APPROVED)...`
- Line 59
  - old: `... any counsel disposition. v0.12 (2026-11-22): the pending-le...`
  - new: `... any counsel disposition. v0.13 (2026-11-23): stale statements fixed in place (hosting account, client applications); no new risk, no re-rating, no counsel disposition changed. v0.12 (2026-11-22): the pending-le...`
- Line 488
  - old: `...**not verified** (no hosting account exists). Sources: `services/api/prisma...`
  - new: `...**not verified** (Render is created but not configured, so nothing is deployed). **[v0.13 CHANGED, hosting facts, runbook accounts list]** Sources: `services/api/prisma...`
- Line 660
  - old: `... the built client applications, which do not yet exist and therefore cannot...`
  - new: `... the built client applications (`apps/web`, `apps/admin`), which this draft has not reviewed and therefore cannot...`

### `docs/incident-response-and-breach-notification-plan-draft.md`

Source: Decision Log #535 (R2 buckets decided, not yet created), #479 (social sign-in removed), runbook (AWS not yet created)

- Line 1
  - old: `...-notification plan (DRAFT v0.10)...`
  - new: `...-notification plan (DRAFT v0.11)...`
- Line 10
  - old: `...9 2026-11-21, v0.10 2026-11-22): **not live**. Accounts for Neon, Upstash, Render, Cloudflare, Stripe, MaxMind, Postmark and Sentry exist (Render is created but not configured, on purpose); the R2 buckets, AWS, Google OAuth and Meta are not yet created **[v0.8 CHANGED — from the ru...`
  - new: `...9 2026-11-21, v0.10 2026-11-22, v0.11 2026-11-23): **not live**. Accounts for Neon, Upstash, Render, Cloudflare, Stripe, MaxMind, Postmark and Sentry exist (Render is created but not configured, on purpose); the four R2 buckets in the EU jurisdiction are decided (#535) and AWS is not yet created; Google and Meta sign-in was removed (#479) **[v0.11 CHANGED, hosting and sign-in facts from #535, #479...`
- Line 45
  - old: `...); the sign-off position. v0.10 (2026-11-22): the pending-le...`
  - new: `...); the sign-off position. v0.11 (2026-11-23): stale statements fixed in place (hosting facts, version pointers); no counsel disposition changed. v0.10 (2026-11-22): the pending-le...`
- Line 56
  - old: `...ot yet reviewed legal copy v0.16, DPIA v0.8, this plan v0.6 or the tagged strings. The founder wants counsel to ...`
  - new: `...ot yet reviewed legal copy v0.21, DPIA v0.13, this plan v0.11 or the strings sheet. **[v0.11 CHANGED, current versions]** The founder wants counsel to ...`
- Line 916
  - old: `...as not yet seen legal copy v0.16, DPIA v0.8, plan v0.6 or the tagged...`
  - new: `...as not yet seen legal copy v0.21, DPIA v0.13, plan v0.11 or the...`
- Line 937
  - old: `...ON: A — no decision recorded; not re-checked against legal copy v0.16]** Does the **absence of any ...`
  - new: `...ON: A — no decision recorded; checked against legal copy v0.21 on 2026-11-23, which still reads the same]** Does the **absence of any ...`

`docs/counsel-review-pack.md` and `.docx` were refreshed to v1.3: title block, section 2 versions (DPIA v0.13, incident plan v0.11, post-media addendum v0.9, Part C post-media v0.5, contest addendum v0.5, view-data Part C v0.5, Cloudflare v0.6, legal copy v0.21 unchanged) and sign-off table versions, plus one sentence explaining that section 3 sources name the version in which a question was raised. Q numbers, labels, the strings sheet and the proxy labels (Q18 to Q24, Q55, Q61, Q66, Q68) are unchanged. The docx was rebuilt with `python docs/counsel-pack-build.py`.

## Left unchanged, and why

- Sentry statements ("no live account exists", conditional lines near DPIA lines 561 to 565 and 1758 to 1762, incident plan equivalents): no citable source says a live DSN exists.
- AWS: the runbook says the account is not yet created, which the task brief contradicts for R2; left as written.
- DPIA line ~1952 ("controls that do not yet exist", R12) and line ~1305.
- Contest addendum line ~212: risk numbering "continues from the v0.3 DPIA's R16"; the DPIA now has R17 to R36, so the numbering needs a founder decision.
- Legal copy lines 913 and 918 (storage provider, Sentry): not edited, the legal draft is outside this task.
- Cloudflare line ~504 "launch-gate" lookup.

## "v0.3 DPIA" decisions

Changed to "DPIA v0.13" in the post-media addendum at lines 175, 325, 341, 544, 615, 875, 973, where the cited section still says what the sentence relies on. Kept as "v0.3" where the surrounding text itself calls the reference stale or historical (lines 602, 621, 819). Contest addendum lines 69, 191, 206, 214 got a version label only.

## Legal copy line 918

Line 918 is in the Part C area of the legal draft, not in the Terms or Privacy slice that `apps/web` renders (the R112 virtual module exports only `TERMS_MARKDOWN` and `PRIVACY_MARKDOWN`). It is not rendered text.

## Sources-line check

No lines were added, removed or split, so every line-numbered "note at line N" reference in the pack points at the same line as before. `docs/counsel-pack-check.py` passes. No missing references found.

## Checks

- Checker output and exit code (0) identical to baseline.
- Per draft: same line count, CRLF kept; `[PROPOSAL`, `[OPEN`, `DISPOSITION` counts identical; dashes not increased; no new pending-review tag (one pre-existing variant at `legal-copy-part-c-post-media-draft.md` line 211).
- Numbers and references on changed lines differ only by versions, the new markers and these intended additions: `#518` and `#541` (Cloudflare), `#479` and `#535` (incident plan), `54` and `212` (contest addendum pointers), `2` (Part C post-media version pointer); Cloudflare `B-090` -1 where a launch-gate reference was reworded.
- Legal-word counts on changed lines: `not` +1 (Cloudflare, Part C post-media), +2 (Part C view-data), +1 (contest addendum), +1 (DPIA), -1 (incident plan); no change in must, may, only, unless, shall, cannot. The `not` differences come from rewritten sentences stating the new fact and were read by eye.
- `npm run build:release` exit 0; `npm run check:pending-copy` exit 0; `LegalPage.test.tsx` 8 of 8 passed.
- Docx: 4 sections, 48 tables, 71 Q headings, 144 distinct S ids, sign-off table 11 by 6 with the new versions.

## Questions for the founder

1. Is Sentry live with a real DSN? Until you say so, the "no live account" statements stay.
2. Does an AWS account exist? The runbook says no; your brief implied the R2 buckets exist.
3. Should the contest addendum's risk numbers be renumbered now that the DPIA reaches R36?
4. Should the legal draft's lines 913 and 918 (storage provider, Sentry) be updated in a separate legal pass?
