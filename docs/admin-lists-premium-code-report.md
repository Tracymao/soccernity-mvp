# Admin list pages premium restyle and Inter body text (step 2d)

Code only: no Figma, schema, API, copy or JSX change. The platform is not live.

## Files
`apps/admin`: `package.json` (+`@fontsource/inter` ^5.3.0), `src/main.tsx`, `src/styles/global.css`, `index.html` (comment), `src/pages/users/users.css`, `src/pages/content/content.css`; `package-lock.json` (+1 line).

## Inter
Body text is `var(--sn-font-ui)` (Inter 400, 500, 600, 700, self-hosted). Montserrat stays loaded and is used only on `.admin-page-header__title` and `.admin-shell__wordmark`.

## Class families now (`us-*` and `ac-*`)
- Table and card: surface, radius lg (12), no border or shadow. Header band: green tint, 40 high, 12/16 medium secondary, no uppercase.
- Rows: min 52, bottom line on every row, 14/22; primary cell 500; secondary cells grey. Article titles clamp at two lines.
- Pills: 24 high, radius full, 12 medium navy; positive green tint, others grey. No filled navy pill.
- Tabs: 14 medium, 2px navy underline when active, focus ring. Note: 13/20 secondary.
- Buttons: outline is transparent with a navy border, hover 8%, pressed 15%; primary navy, hover opacity 0.9; disabled 0.4; radius md; focus ring. Row actions 32 high; Load more sizes unchanged.
- Form fields: label 12 medium above; white input, radius md, navy border and ring on focus.

## Judgment calls (founder-veto-able)
- A list page's load error is a plain card. On `us-*` pages it keeps the 6px alert bar. On `ac-*` pages the card rule is limited to pages without form fields, so the Create article and Add category errors keep their callout.
- `.ac-field span` became `.ac-field > span`, so nested spans are not styled as labels.
- On the incorrect-details table the soft pill marks the positive status, so it is green there.

## Other pages that share these classes (changed with them, TSX untouched)
- `UserDetailPage`: buttons, cards, pills, link row errors. A direct-child `.us-error` there is now the card with the alert bar.
- `CorrectDobPage`: same, including its submit error on the form stage.
- `IncorrectDetailsReportsPage`: buttons, pills, 52px rows with lines, load error card.
- `GuardianNoticesSection`: buttons, cards, pills (the outline pill text is now navy, not grey).
- `CreateArticlePage` and `CoverImagePicker`: buttons, fields and labels; the small picker button stays 29 high.

## Checks
- `npm run lint` and `tsc --noEmit`: clean. `npm run build`: passes (the existing chunk-size notice remains).
- Admin vitest: 65 files, 1,034 tests passed (1,034 before).
- New colour literals in the CSS diff: only `rgba(40, 46, 101, 0.08)` and `0.15`.
- `moderation.css` and `AdminShell.css`: untouched.

## Not verified
- Nothing was checked in a browser.
- Inter text widths in tight places (the "Username reviews" nav label, long usernames, narrow table columns) are unchecked.
- Playwright was not run.
