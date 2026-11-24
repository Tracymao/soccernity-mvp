# CH-F6 report: accounts live, addendum risks, legal copy v0.22, pack v1.4

Branch `copy/accounts-live-renumber`, built on `origin/main` after PR #866 (docs only, 2026-11-23). Decision Log #553, register Section 120. No B-ID added (324), 146 gap frames unchanged.

## What changed

Accounts: every draft that said Sentry had no real DSN, no AWS account existed, or the R2 buckets did not exist now says the account exists. Kept on purpose: nothing is deployed, and nothing is sent to AWS today because no check key is configured. Google and Meta sign-in stays removed (#479).

| File | Old version | New version | Change |
| --- | --- | --- | --- |
| legal copy | v0.21 | v0.22 | line 910 AWS sentence; line 913 now names Cloudflare R2 (EU jurisdiction buckets); line 918 says the account and DSN exist but nothing is deployed |
| DPIA | v0.13 | v0.14 | Sentry, AWS and storage statements |
| incident plan | v0.11 | v0.12 | Sentry, R2, AWS statements; pointers |
| post-media addendum | v0.9 | v0.10 | AWS account exists, no key; pointer to DPIA v0.14 |
| post-media Part C | v0.5 | v0.6 | pointer to legal copy v0.22; AWS statement |
| contest and view-data addendum | v0.5 | v0.6 | stale risk-numbering sentence fixed; DPIA pointers |
| view-data Part C | v0.5 | v0.6 | pointer to legal copy v0.22 |
| Cloudflare draft | v0.6 | v0.6 | unchanged |
| counsel pack | v1.3 | v1.4 | title block, documents table, sign-off table, "v0.16 to v0.22", line 145 AWS sentence |

Every changed place carries a `[vX CHANGED ...]` marker or a changelog line. Line counts and CRLF endings are unchanged in the seven drafts.

## Renumbering collision table

| Range | Where defined | Collides with a DPIA risk? | Action |
| --- | --- | --- | --- |
| R1 to R16, R33 to R36 | DPIA | n/a | none |
| R17 to R22 | contest and view-data addendum | no | none; stale "continues from R16" sentence corrected |
| R23 to R31 | post-media addendum | no | none |
| R32 | Cloudflare option | no | none |

No DPIA risk id was changed. There was no collision, so no "same as DPIA R<n>" mapping was needed. Ambiguous references: none found beyond the corrected sentence.

## Lines 913 and 918

Both are inside the Privacy slice that `apps/web` renders (Terms to `## PART B`, Privacy to `## PART C`), so they are rendered text. All [PROPOSAL] and [OPEN] markers kept; no tag added.

## "v0.21" pointers moved

Incident plan (three), post-media Part C, view-data Part C, counsel pack (title, intro, documents table, sign-off table). Older history sentences keep their old versions on purpose.

## Checks

- `docs/counsel-pack-check.py` (run with `python -I`): output identical before and after, exit 0.
- Pack docx rebuilt with `docs/counsel-pack-build.py`: 4 sections, 48 tables, 71 question headings, 144 distinct S ids, last table 11x6.
- `npm run build:release` and `npm run check:pending-copy`: OK. `LegalPage` tests: 12 passed.
- Decision Log: last row was #552; #553 added by deep copy; all earlier rows text-identical.

## Not verified

Nothing was deployed or run against any vendor. CI cannot be read from here. Whether each account is configured as the drafts now describe rests on the founder's statement.

## Questions for the founder

1. Is Render now configured and the API deployed? The drafts still say nothing is deployed.
2. Do you want the contest and post-media risks renumbered anyway (they collide with nothing today)?
3. Is a Rekognition key planned before launch? Until then the drafts say nothing is sent to AWS.
