# CH-D3 report: humanize the post-media DPIA addendum

File: `docs/dpia-addendum-post-media-draft.md` (still a DRAFT, NOT APPROVED; version label left at v0.6).
Branch `copy/humanize-post-media-addendum`, from `origin/main` `0e9be7c9e35d49ce62929350fe4e41347a23c897`.

## 1. Lines
995 before, 995 after (`wc -l`). No line added, removed, merged or split. 36 lines changed.

## 2. Dashes (em and en)
| | before | after |
|---|---|---|
| inside bracketed markers (frozen) | 102 | 102 |
| lone "—" empty table cells (lines 143, 144) | 2 | 2 |
| prose | 35 | 1 |
| total | 139 | 105 |

The one remaining prose dash is line 293: the en dash in the quoted "6–7 years" (counsel's approved range, quoted from the legal draft; frozen). Prose dashes were replaced by colons, commas, parentheses or semicolons, including nine R-headings, four changelog headings, the title, the draft banner, the "Mode A/B" table headings and the italic "*Disposition: X — …*" tails.

## 3. `[COPY PENDING LEGAL REVIEW]`
48 before, 48 after.

## 4. counsel-pack-check
`python -I docs/counsel-pack-check.py`: exit 0 before, exit 0 after. `diff` of the before and after output is empty (marker line numbers identical).
Also run: `cd apps/web && npx vitest run src/pendingCopyManifest.test.ts` (15 passed). `npm run check:pending-copy` was not run (fails by design).

## 5. Facts block (marked `[v0.7 CHANGED, #536, #541]`)
- 376: after the quoted #391 wording, added that #536 amends it: Neon and Upstash are in London (eu-west-2). The quote itself is unchanged.
- 379: "has no region or jurisdiction setting recorded anywhere in the repo" became "buckets are in the EU jurisdiction".
- 396: "Cloudflare R2 (location not set)" became "(EU jurisdiction)".
- 604: "the bucket's location is still unset" became "the buckets are in the Cloudflare EU jurisdiction".
- 862: "R2 bucket location (unset)" became "(EU jurisdiction)".
- 146: "served from `media.soccernity.com`" gained "(proxied by Cloudflare from the start)".
Render Frankfurt (380, 396, 860) already matched. Sentry is only named at line 801 (logs not examined); no region statement exists, so nothing was added.

## 6. Left unchanged because meaning could not be safely preserved or the rule did not allow it
- Bold decoration, "not X but Y" contrasts, triads and stacked hedges across the document were NOT rewritten. Bold is heavily used for legal emphasis and the pack-check regexes anchor on `**[v…` line starts; rewriting risked meaning and marker shifts. Only dashes and the facts block were done. Founder may want a second pass.
- Line 293 en dash (quoted).
- Quoted product strings and all bracketed markers untouched.

## 7. Stale statements found, not fixed
- 863 (inside a frozen `[v0.5 DISPOSITION …]` marker): "the bucket location is still unset" is now wrong under #536.
- 376-378: the quoted #391 line "Neon/Upstash EU" is the old wording (annotated, quote kept).
- 119, 604, 825 and others: "no AWS account exists" predates the founder's record of accounts (runbook update); not rechecked here.
- 597, 860, 861: Rekognition "Ireland by default" and the "Frankfurt host → Ireland → Cloudflare chain" were not changed; the facts do not cover Rekognition.
- 801: Sentry data region (EU) is not stated in DOC; not added.

## 8. Changed line numbers (for sampling)
1, 3, 32, 46, 62, 77, 117, 118, 119, 146, 188, 203, 224, 251, 376, 379, 396, 427, 489, 521, 546, 559, 574, 576, 584, 586, 594, 604, 606, 619, 631, 660, 735, 825, 862, 917
