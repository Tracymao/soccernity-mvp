# CH-F1b report: last pending-legal-review tags cleared from the legal copy draft

1. Base: `origin/main` b1e64ca62ea85d9eec091bd06d17394f524c5aff (DOC unchanged since #854). Branch `copy/clear-legal-copy-remaining`. Python: `python -I` (`python3` is a Store alias). DOC: 1378 lines, line endings unchanged (mixed, 1378 CR and 1378 LF before and after).
2. The 13 places (old to new):
   - Lines 52, 56, 60, 64, 68, 76, 85, 1229: "tagged `[tag]`" became "tagged with the pending-legal-review tag (removed in v0.20)". The rest of each sentence is unchanged, including "counsel has not seen any of it".
   - Line 72: "its `[tag]` tags are where they were" became "its pending-legal-review tags (removed in v0.20) are where they were".
   - Line 1298 (quoted Contact Us notice, 2 tags): both `**[tag]**` and the space before each removed. No other word changed.
   - Line 1306: "Suggested wording, **[tag]**:" became "Suggested wording:".
   - Line 1308: "...#534)]** **[tag]**. Is..." became "...#534)]**. Is...".
3. Tag count: 13 before, 0 after. `[PROPOSAL` 58, `[OPEN` 25, `DISPOSITION` 58, all unchanged.
4. Version: line 3 `DRAFT (v0.20)` to `DRAFT (v0.21)`; line 36 `Version:** 0.20` to `0.21`; line 44 got one appended sentence for v0.21. Line 42 not edited.
5. `docs/counsel-pack-check.py`: exit 0 before and after, output identical. Diff against the saved copy: only lines 3, 36, 44, 52, 56, 60, 64, 68, 72, 76, 85, 1229, 1298, 1306, 1308 differ (section 3 and section 5 only).
6. `npm run build:release`: both production builds passed, then `check:pending-copy` printed "OK: no [COPY PENDING LEGAL REVIEW] text in the production builds." `vitest run src/pendingCopyManifest.test.ts src/pages/legal`: 2 files, 23 tests passed (`LegalPage.test.tsx` is the only test importing `legalDocument`).
7. Line 1298 notice vs `apps/web/src/pages/ContactPage.tsx` (lines 337 to 341): matches word for word. Not edited.
8. Stale items noticed, not fixed: none beyond those already listed in the draft's own changelog and Part C.
