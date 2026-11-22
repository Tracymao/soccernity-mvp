# CH-D4b completion pass: D3, D4, D5 drafts

Branch `copy/humanize-completion-d3-d4-d5`. Files edited: `docs/dpia-addendum-post-media-draft.md` (DOC3), `docs/incident-response-and-breach-notification-plan-draft.md` (DOC4), `docs/legal-copy-draft-tos-privacy-policy.md` (DOC5). All three stay DRAFT, NOT APPROVED. No status, disposition or sign-off wording changed. No secret, DSN or key was seen in any edited line.

## Checks (measured)

- Line counts unchanged: DOC3 995, DOC4 1032, DOC5 1378.
- `docs/counsel-pack-check.py`: output and exit code (0) identical before and after (`diff` empty).
- `cd apps/web && npx vitest run src/pendingCopyManifest.test.ts`: 1 file, 15 tests passed.
- Marker counts (lines matching `DISPOSITION` or `[v0.`): DOC3 and DOC5 unchanged. DOC4 went 118 to 120: lines 394 and 395 (two table cells that carried no standard marker) now carry `**[v0.9 CHANGED, #536, #541]**` as item 3c asks. No marker text was otherwise touched.
- Numbers, `#` and `§` references on changed lines are the same except the version labels and markers named above.
- A stray whole-file line-ending change appeared in `docs/sprint-1-dpia-outline-draft.md` during the session (not edited by me); it was reverted with `git checkout`, so it is not in the commit.
- Python on this machine: `python3` is a Store alias, so all scripts ran as `python -I`.

## 3a. Contrast and tell scan, plus dashes

Rewritten (old to new):

- DOC3 line 732: "N" is not a number of days but the closure of the removing report (§1.5). to "N" means the closure of the removing report (§1.5), not a count of days. (same meaning, direct form; the contrast stays because the reader could assume days)
- DOC4 line 718: "...rather than expecting a filing path" to "...and should not expect a filing path".
- DOC5 line 184: "method disclosed rather than asserted as precise:" to "method disclosed:".
- DOC5 line 809: "it fails closed rather than open." to "it fails closed.".
- DOC5 line 868: "is left inert rather than being allowed to auto-decline an adult into deletion." to "is left inert so it cannot auto-decline an adult into deletion.".
- DOC5 lines 1111 to 1112: "wherever they differ, rather than ... the weaker one. These include" to "wherever they differ. These include" (the sentence that named the weaker one was folded away; the stricter-rule duty is unchanged).
- Prose dashes: DOC4 line 318 "on a report —" to "on a report,"; DOC4 legend labels (lines 922 to 926) now `A: open for counsel`, `B: decided by the founder`, `C: resolved, counsel signed off`, `D: founder or engineering housekeeping`, `NOT ASSIGNED: founder to say`. Checker re-run after that edit: identical output.

Kept (contrast carries information, states a disclosure or limit, or corrects a likely belief): the remaining "not ... but", "rather than", "not just" hits in all three files, including every "is not a decision ... it is", "not legal advice", "not verified", "counsel's view not recorded", "not the EU" and "not live" statements. No hit was kept in doubt without being listed here; the same-sentence negatives that state a limit were left in place on purpose.

Dash counts are approximate: my heuristic cannot tell a prose dash from one inside a multi-line marker or table cell, and those are frozen.

## 3b. DOC3 version label

Line 25 now reads "revised 2026-11-17 (v0.6); revised 2026-11-21 (v0.7)" and line 26 "Version: 0.7 (draft, NOT APPROVED)", matching its v0.7 markers. The `[v0.6 CHANGED ...]` marker on line 26 is frozen and unchanged.

## 3c. DOC4 standard marker

Lines 391, 392, 575 changed to exactly `[v0.9 CHANGED, #536, #541]`; lines 394 and 395 gained it.

## 3d. DOC4 stale statements (listed, not edited)

- Line 10: lists the accounts that exist; the R2 buckets and AWS are said not to exist yet, which was true when written; check against the runbook before sending.
- Line 56: "Counsel has not yet reviewed legal copy v0.16, DPIA v0.8, this plan v0.6": the current versions are legal copy v0.19, DPIA v0.10 and this plan v0.9.
- Line 198 and line 384: same "R2 buckets do not yet exist" statement.
- Lines 230 and 260 and the Sentry table row (line 704): "Sentry inactive until a real DSN is set". Correct today, but recheck at launch.
- Line 937 (Q7): "not re-checked against legal copy v0.16"; the legal copy is now v0.19.

## 3e. DOC5 quoted product strings (listed, not edited)

I extracted every double-quoted string of 18 or more characters from DOC5 body text and compared it with the non-test source in `apps/web`, `apps/admin` and `services/api`: 14 match, 49 do not. Almost all of the 49 are not product strings (changelog and history text quoting earlier drafts, counsel questions, or sentences inside `[PROPOSAL]` and counsel-question markers). The ones that are product-related:

- Lines 72, 76: "Soccernity staff read the messages sent through this form". This is quoted as the OLD wording. The product says "Our support team reads the messages sent through this form." (`apps/web/src/pages/ContactPage.tsx`). Line 72 states the change, so the quote is correct as history.
- Line 1306: "Registration cannot be completed until the guardian approves". Found in `apps/web/src/pages/GuardianConsentPage.tsx`; it is the tagged sentence under review, so it matches.
- Lines 149, 152: "cannot receive direct messages" and "removed from public view" are quoted as superseded earlier wording, not current strings.
- Line 106 "no IP is processed" and line 1308 "kept privately ... for a set period (currently 365 days) ...": quoted earlier wording, not current product strings.

No current product string in DOC5 was found to disagree with the product.

## Not done

Nothing was added, removed, merged or split. Counsel dispositions, markers and sign-off blocks are untouched. The Security session could not be asked and CI cannot be read from here.
