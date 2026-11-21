# CH-D2 report: humanize the contest and view-data DPIA addendum

Draft only. The addendum stays NOT APPROVED, NOT LEGAL ADVICE (non-negotiable #2).

1. **Base and files.** `origin/main` `d4a134d7371038209b576bdfcc23d3ea02c334cb`, branch `copy/humanize-contest-addendum`. `docs/dpia-addendum-contest-view-data-draft.md`: 486 lines before, 486 after.
2. **Dashes (em, none en).** Before 52 (42 inside bracketed markers, 0 lone empty cells, 10 prose). After 42 (42 inside markers, 0 lone, 0 prose). All 10 prose dashes were in headings (title, DRAFT banner, two changelog headings, R17 to R22) and became colons or were dropped. No prose dash remains.
3. **Tags.** `[COPY PENDING LEGAL REVIEW]`: 28 before, 28 after.
4. **Checker.** `python -I docs/counsel-pack-check.py`: exit 0 before and after, output diff empty (marker line numbers unchanged). Manifest test run: `npx vitest run src/pendingCopyManifest.test.ts`, 15 passed (not `npm run check:pending-copy`, which fails by design).
5. **Facts block.** None applied. The addendum names Neon, Upstash and "the hosting provider" only as items not assessed (lines 146, 147, 362) and makes no region, R2, Sentry or media-domain claim.
6. **Left unchanged for meaning risk.** The prose was already plain. Contrast sentences that carry information (lines 73, 75, 164, 229, 302, 384) were kept. Line 68 to 69 clipped tail ("not to assert what the regime requires") became "it does not assert what the regime requires"; no other prose was reworded.
7. **Stale, not fixed.** Body references to "the v0.3 DPIA" (lines 54, 69, 191, 206, 212) and the line 407 note that the DPIA is v0.8 are older than the current DPIA (v0.10); several are already annotated. No hosting or counsel-pack quotes were edited.
8. **Changed lines.** 1, 3, 33, 41, 68, 216, 228, 253, 265, 276, 291.
