# Design foundations tokens: report

Branch `feat/design-foundations-tokens`, from origin/main `b8c97b8` (unchanged at the end).

## Handshake
- Open PRs: none (`gh pr list --state open` returned `[]`). No remote branch for the parallel Figma PR "Design foundations (Figma only)" was found, so it is not named; the values here must be compared with it when it appears.
- Next free register section: 139. Decision Log: last row #571, so this is #572.

## What was added
- `packages/shared/src/tokens/index.ts`: exported `radius`, `typeScale`, `fontFamily`, `elevation`, `motion` and types. Existing exports untouched.
- `packages/shared/src/tokens/foundations.css`: the static foundations as `--sn-*` custom properties on `:root`, plus one `prefers-reduced-motion` block (durations 0.01ms, distances 0, `html { scroll-behavior: auto }`; no `animation: none`).
- Imported as `@soccernity/shared/src/tokens/foundations.css` from `apps/web/src/main.tsx` and `apps/admin/src/main.tsx`. One shared file, no per-app copy; Vite resolves it through the workspace link and both builds pass.
- `apps/web/src/theme/foundations.test.ts` (10 tests across the file with `applyTheme.test.ts`): CSS values equal the shared objects (radius, all ten type steps, fonts, elevation, motion), the reduced-motion block has exactly the six overrides, no blanket animation rule, both entries import the file.
- `packages/shared/src/tokens/README.md`: scales, legacy radii, migration guide.

## Defaults (veto-able)
All values are the founder-approved 2026-11-25 spec. My own additions: the exact font stacks (Inter / Montserrat with system fallbacks, matching the fonts already loaded); `0px` instead of bare `0` for reduced-motion distances so they stay valid in `calc()`; `staggerMax: 6` kept in the TypeScript object only (no CSS variable was specified).

## Verification
- `vitest run src/theme` (web): 2 files, 10 tests passed.
- `tsc --noEmit` web and admin: clean. `packages/shared` has no tsconfig of its own; it is type-checked through the apps.
- eslint on the changed web files: clean. `vite build` web and admin: pass.
- No visual change: only the two `main.tsx` import lines and the `tokens/index.ts` additions changed among existing files, plus new files and docs. No stylesheet or component was edited and nothing references the new variables.

## Not done
Comparison with the Figma values (parallel PR not visible); admin vitest and the full web suite were not run; Playwright not run.
