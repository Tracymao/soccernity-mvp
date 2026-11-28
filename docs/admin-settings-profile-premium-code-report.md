# Admin Settings/Roles and Profile aligned to the premium design (code)

Date: 2026-11-28. Branch `ui/admin-settings-profile-premium`, from `origin/main` `795cca1`. Register section 187, Decision Log #615. Design values only; no structure, copy or behaviour changed. Values come from the Figma restyle (#961, #962).

## What changed

| File | Change |
| --- | --- |
| `settings.css` | Table header 40, sentence case. Rows at least 52, 14/22, 1px hairline, padding 10/20/9 (read from frame `7403:69134`, so a row with a 32px button stays 52). Pills 24 high, capitalised (`rl-pill--keep-case` unchanged). Card and table radius 12. Callout radius 6, 12/14, 13/20. `.rl-error` is the alert callout (CSS only). `.rl-loading` line 22. Buttons 40 radius 8; small 32, 13 Medium. Select 44, radius 8, green tint, 2px border. `.rl-success` radius 6. |
| `addRole.css` | Card padding 20, gap 12, no shadow, title 16. Filled 44px inputs, alert border when invalid, navy outline on focus. Submit and "Back to Roles" 40, radius 8, Semi Bold. Generated password text 13/20. |
| `removeAccount.css` | Buttons 40 radius 8. Body padding 22/28, gap 16. Radii written as tokens (same values). |
| `AdminProfilePage.css` | Card padding 20, gap 12. Name 20, role 14, label 13/600. Value box and input 44, radius 8. Buttons 40, radius 8, 14/600. Error is the alert callout. Panel gap 12. 20px above the two-factor card and the turned-off banner. |
| `twoFactor.css` | Card radius 12, extra `margin-top` removed. Pill 24, 12/500. In-session only: buttons 40/8, banners radius 6 with no stroke on green tint, dialog 560 radius 16 with header band and divider, dialog text 14/22, field 44, codes 14/600, 16px checkbox with navy outline. No close box added. |
| `TwoFactorCard.tsx` | Class name only: `tf-banner--session` on the turned-off banner. |
| `AdminStub.css` | Delete Role stub banner is the callout look. |

## Scoping

- **Two-factor.** The sign-in screens render neither `.tf-profile-card` nor `.tf-dialog`, so those existing classes are the scope. Only the turned-off banner sits outside both and needed a new class. `ResetTwoFactorCard.tsx`, `TwoFactorDialog.tsx` and `BackupCodesPanel.tsx` did not need edits. `.tf-pill`, `.tf-profile-card`, `.tf-dialog` and `.tf-dialog__title` were edited in place; sign-in uses none of them.
- **Admin Profile.** `.admin-btn` is used only by `AdminProfilePage.tsx` (the sign-in page does not use it), so no wrapper class.
- **Stub banner.** Scoped as `.rl-back ~ .admin-stub__banner`, which only the Delete Role stub matches. The competition stubs are unchanged, including their uppercase section titles.
- **Remove account.** `removeAccount.css` does not import the moderation CSS; it copies its look. Width 560 and radius 16 already matched and measure the same.

## Measurements

Headless Chrome on a throwaway harness: the real `foundations.css`, `global.css`, the CSS files above and Inter; markup copied by hand; colour variables set by hand; 1138px wide. Not a built app.

| Item | Measured | Figma |
| --- | --- | --- |
| Roles table header | 40, 12/16 500, sentence case | 40 |
| Roles row, with and without a row button | 52, 14/22 | 52, 14/22 |
| Roles pill | 24 | 24 |
| Table, card radius | 12 | 12 |
| Roles callout | radius 6, 12/14 | same |
| `.rl-error` | radius 6, 12/14, 13/20, 3px alert bar | alert callout |
| `.rl-btn` / `.rl-btn--sm` | 40 radius 8 / 32 radius 8, 13/500 | same |
| Roles select | 44, radius 8 | 44, radius 8 |
| Add Role input and select | 44, radius 8 | 44, radius 8 |
| Add Role submit | 40, radius 8 | 40, radius 8 |
| Remove account dialog | 560, radius 16, body 22/28, button 40 | same |
| Profile card | padding 20, gap 12, radius 12 | 20, 12 |
| Profile value box / input | 44 / 44, radius 8 | 44 |
| Profile button | 40, radius 8 | 40, radius 8 |
| Two-factor card | radius 12, 20 above (Profile and Edit role) | 12, 20 |
| Two-factor pill / button | 24 / 40 | 24 / 40 |
| Two-factor banner | radius 6, no border | 6, no stroke |
| Dialog | 560, radius 16, title 20/600 with 24/28/20 | same |
| Dialog text / field / codes | 14/22 / 44 / 14/600 | same |

### Sign-in two-factor screens, against `origin/main`

Both sets of markup (code entry with banners and field; backup codes) were rendered with the old and new CSS. All 14 probes were identical and the screenshots matched byte for byte: card 380 wide radius 8, text 13/19.5, banner radius 8 with 1px border, field 40 radius 4, button 42 radius 4, codes 15/600, native checkbox. A non-Delete stub banner was also identical.

## Not done, and choices to check

- The "turned off" banner still spans the full content width. The code renders it with no width cap; the Figma report lists this as a choice to check. It now sits 20 below the profile card, as the frame draws it (it touched the card before).
- Radii of 4 and 2 remain in the base `twoFactor.css` rules (`.tf-btn`, `.tf-field input`, `.tf-error`, `.tf-banner__bar`) because the sign-in screens use them, except `.tf-error`, which is overridden in the dialog. They are for the sign-in pass. The avatar keeps `border-radius: 50%`.
- The checkbox tick is drawn with `::after`. Browsers that do not draw it show a filled navy box when ticked. Forced-colours mode uses the native control.
- Delete Role stub buttons were not in this brief and are unchanged.
- Add Role field error lines (`.ar-field__error`) keep their navy bar; not in this brief.
- Contrast and dark mode were not checked.

## Checks

- `npm test` (65 files, 1034 tests), `npm run lint`, `tsc --noEmit`, `npm run build` all pass. No test was changed.
- No `text-transform: uppercase` in `settings.css`, `addRole.css`, `removeAccount.css` or `AdminProfilePage.css`. `AdminStub.css` keeps one, for other stubs. No hex colours and no font-size under 12px in the touched files.
