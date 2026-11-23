# R112: pack build script and legal slice

## Part A: counsel-pack-build.py
- Failure: "no widths for table starting '#' with 4 columns" (the strings sheet now has 4 columns).
- Fix: WIDTHS entry for the "#" table changed to [1.4, 14.0, 6.5, 4.2] cm, with a comment. Nothing else in the script changed. No rebuilt docx committed.
- Check: the rebuilt pack equals the committed docx in sections, tables, paragraph text, cell text and grid widths (0 differences). A first guess of [1.3, 13.0, 8.0, 3.8] gave grid differences and was replaced.

## Part B: legal text slice
- New `apps/web/vite-plugins/legalCopy.ts` (virtual module `virtual:legal-copy`, watches the draft, full reload on change), `apps/web/src/pages/legal/legalSlice.ts` (the slicing logic, moved unchanged), `apps/web/src/virtual-legal-copy.d.ts`. `legalDocument.ts` re-exports the four values; no importer changed.
- Byte identity: the four exports equal the old logic on the real file (test, and a comparison against values saved before the change). Also tested with LF and CRLF input.
- Bundle, `apps/web` production build: markers "PART C" 0, "DISPOSITION" 0, "founder decision" 0. The Terms and Privacy slices (32,009 and 49,016 characters) are in the bundle; the draft is 158,626 bytes, so about 77 KB of Part C, changelog and counsel notes no longer ships. Main JS bundle now 1,135,483 bytes. A before size from a clean build was not measured.
- Finding: the rendered Terms and Privacy text itself contains "[OPEN", "[PROPOSAL" and "Decision Log" (16, 32 and 41 occurrences). That is existing draft text and was not edited; the test asserts only that Part C and disposition markers are absent. For the founder to decide.

## Checks
`tsc --noEmit` clean, eslint on the touched files clean, `vitest run src/pages/legal` 12 of 12, `npm run build` OK, `npm run check:pending-copy` OK on the current dist. Not run: the full web suite, Playwright, CI.
