# CH-F7 report: Rekognition key configured, Render configured and the API deployed

Branch `copy/rekognition-render-live`, docs only, 2026-11-23. Decision Log #554, register Section 121. No B-ID added (324), 146 gap frames unchanged. Source of every change: the founder statement of 2026-11-23 (AWS account exists and the check key is configured; Render is configured and the API is deployed). No key, DSN or secret was read or is quoted. Nothing was run or deployed; CI cannot be read from here.

## Changes

| File | Old to new | Change |
| --- | --- | --- |
| legal copy | v0.22 to v0.23 | line 910 (check key configured, check can run); line 918 (Render configured, API deployed, product not launched) |
| DPIA | v0.14 to v0.15 | lines 488, 562, 1020, 1762, 1922 (Render and Sentry statements) |
| incident plan | v0.12 to v0.13 | lines 1, 10, 71, 230, 377, 394, 424, 704; pointers on 56, 916, 937 |
| post-media addendum | v0.10 to v0.11 | lines 112, 113, 537, 604, 836, 848, 859, 863; DPIA pointers |
| post-media Part C | v0.6 to v0.7 | line 142; legal pointer on 47 |
| contest and view-data addendum | v0.6 to v0.7 | DPIA pointers only |
| view-data Part C | v0.6 to v0.7 | legal pointer only |
| Cloudflare draft | v0.6 | not edited (no pointers to the old versions) |
| counsel pack | v1.4 to v1.5 | title, documents table, intro, line 145, sign-off row. The Word file was NOT rebuilt (no pandoc in this session). |

Line counts and CRLF endings are identical in all seven edited drafts. `python -I docs/counsel-pack-check.py` output is identical before and after.

## Arguments that rested on nothing being sent

These were not rewritten beyond the status clause; the founder should re-read them:
- Post-media addendum lines 604 and 848 (the data-protection argument that nothing reaches AWS today). The status now reads that files can be sent; the surrounding rating and disposition are unchanged.
- DPIA R12 (line 1923) still says controls are deployed and tested in a way the new facts may not support; left as is.
- DPIA and incident plan statements that Sentry collects nothing: now "nothing from real use", because the API is deployed.

## "Deployed" that could be read as "launched"

Incident plan lines 10 and 424, post-media addendum line 112. All now say the product has not launched or holds no real use.

## Questions for the founder

1. Which Render environment is deployed (staging, production, or both)? The repo does not say, so the drafts say only "deployed".
2. Was the AWS opt-out of AI-services data use set before the key was configured? The drafts say it is not confirmed.
3. Does the deployed API hold the Sentry DSN? The drafts say this is not confirmed.
4. DPIA R12 wording (see above).

## Not verified

Everything rests on the founder statement. Not run: tests, `build:release`, `check:pending-copy`, the Word rebuild.
