# CH-D5 report: humanize the Terms of Service and Privacy Policy draft

File: `docs/legal-copy-draft-tos-privacy-policy.md`. Base: origin/main `9bed691`, branch `copy/humanize-legal-copy`.
Draft stays NOT APPROVED, sign-off empty, no counsel disposition changed.

1. Lines before and after: 1378 / 1378. Checker run with `python -I docs/counsel-pack-check.py`.
2. Dashes (em, en, ` -- `): 348 before, 146 after.
   - Inside bracketed markers: 108 before, 108 after (frozen).
   - Lone empty-cell "—": 14 before, 14 after (frozen).
   - Prose: 226 before, 24 after. The 24 are number ranges and quoted ranges: "6–7 years" (lines 52, 56, 140, 1066, 1227, 1239, counsel range, quoted), "#367–#380", "#337–#340", "v0.3–v0.6", "rows 32–34" (92, 161, 167, 1192), and "[PROPOSAL — ...]" text remaining outside the bracket-strip on 221, 524, 555, 647 (marker text, frozen).
3. Patterns: the dash pass changed 163 lines, plus comma-splice and trailing-comma repairs. The remaining patterns (not-X-but-Y, closers, triads, riders) were checked while reading the changed lines; no further rewrites were made because the remaining candidates sit inside clauses where a change would risk a right, duty or retention meaning. Not a full second pass over sections 4 to 11: found-and-kept counts per pattern were not tallied.
4. Markers before/after: COPY PENDING LEGAL REVIEW 53/53, [PROPOSAL 58/58, [OPEN 25/25, [PLACEHOLDER 0/0, DISPOSITION 58/58.
5. Checker exit code 0 before and 0 after; diff of outputs empty.
6. Version bump v0.19 on line 3, line 36 (consistency; not one of the three named places) and the end of line 44. Facts marker `[v0.19 CHANGED, #536, #541]` on lines 904, 917, 923, 924.
7. Facts block:
   - 904-905: added EU-jurisdiction buckets and the public media address served through Cloudflare; #541 added to #307.
   - 917: added "(EU data region)". Statement "not yet actively collecting data" untouched.
   - 923-924: added Render in Frankfurt, Neon and Upstash in London (eu-west-2); #536 added to #26.
   - Lines 154 and 1196 left alone as instructed.
8. Quoted product strings were not compared against `apps/web`, `apps/admin` and `services/api` in this pass. Not done.
9. Sentences not changed for meaning: the "6–7 years" counsel range and every bracketed disposition text.
10. Stale statements, not fixed: line 917 still says no live account exists for Sentry; line 68 history text.
11. Changed lines: all 163 dash-pass lines plus 3, 36, 44, 736, 826, 904, 905, 917, 923, 924, 986, 214, 583, 788, 1042, 1217.

Checks: `cd apps/web && npx vitest run src/pendingCopyManifest.test.ts` passes (15 tests). `npm run check:pending-copy` was not run (fails by design).
