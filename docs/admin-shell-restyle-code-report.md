# Admin shell restyle: code half (Decision Log #575)

Visual only. No markup, route, prop or class renamed. Colours unchanged; foundations tokens used.

## Changed
- `packages/shared/src/tokens/index.ts`, `foundations.css`, `README.md`: new type step `nav` (15px / 20px, `--sn-text-nav-size`, `--sn-text-nav-line`).
- `apps/admin/src/layout/AdminShell.css`: sidebar gets a 1px right hairline (`--sn-icon-inactive`); nav group 12px inset; rows 44px, radius md, transparent, 15px labels (500, active 600); hover navy 8%, pressed 15%, focus-visible 2px navy outline; active row navy fill, white text and a 4x20 leading indicator; transitions on background, color, outline only. Log Out is now secondary (44px, 1px navy border, transparent, 16px, hover/pressed/focus as above). One comment: no sticky header exists, and a future one must not cover content.
- `apps/admin/src/layout/AdminPageHeader.css`: Create is primary (44px, navy, radius md, 16px; hover 90% opacity, focus ring, disabled 0.4 and not-allowed).
- `apps/admin/src/components/search/AdminSearchBar.css`: white surface, 1px border, radius md, no green tint; focus keeps size (1px border plus 1px ring in navy). Clear button, spinner, live region untouched.
- Tests: `AdminShell.test.tsx` (only the active row has `aria-current="page"`), `apps/web/src/theme/foundations.test.ts` (nav step in CSS and TS export).

## Results
- apps/admin: lint clean, `tsc --noEmit` clean, vitest 1,034 passed, build clean.
- apps/web: `src/theme` 11 passed, build clean.
- Override grep (`admin-page-header__action|admin-nav__|admin-shell__logout|admin-search__bar` outside layout/ and components/search/): no matches, so no page overrides these classes.

## Not verified
- Not verified in a browser (no dev server screenshots, no Figma screenshots taken); hover, pressed and focus states and the Moderation tab strip were not looked at.
- Placeholder contrast (`--sn-text-secondary`, navy 70% on white) was estimated, not measured.
- Full web vitest suite and Playwright not run.
