# Admin User detail, Incorrect-details reports and Correct date of birth aligned to the premium design (code)

Date: 2026-11-28. Branch `ui/admin-user-detail-premium`, from `origin/main` `6ee8c94`. Register section 190, Decision Log #618. Design values only; no structure, copy or behaviour changed. Values come from the Figma restyle (#965, #966).

## What changed

| File | Change |
| --- | --- |
| `users.css` (`ud-*`, `gn-*`) | Dialog 560, radius 16. Head 24/28/20, title 20/28 600. Close box radius 8, 13px glyph. Body gap 16, padding 22/28/24, 14/22. Inputs 44, radius 8, green tint, 2px transparent border; textarea 96; read-only keeps white and a 1px grey border. Field gap 8, label 13/20 600. Help and error line 16. Callout 13/20. Error and warning callouts lose their border (3px bar), error is regular weight. Guardian block radius 8, padding 14. `.gn-alert` is the tinted alert callout, title 14/22, body 13/20. |
| `users.css` (scoped) | `.ud-page .us-loading` line 22. `.ud-page .us-error` and `.ud-dialog .us-error` are the alert callout. |
| `UserDetailPage.tsx`, `CorrectDobPage.tsx`, `IncorrectDetailsReportsPage.tsx` | Class name only: `ud-page` on the page wrapper. |
| `GuardianNoticesSection.tsx` | Class name only: `us-pill--plain` on "Sending normally", "Review due" and "No guardian to notify" (founder decision 2026-11-28). "Withholding" is unchanged. |
| `moderation.css`, `SuspendAccountDialog.tsx` | `mod-dialog__body--suspend-user` (User page mode only): body 14/22, field error with a 3px alert bar and 16 line. |

The dialog buttons stay inside the body in markup. A CSS rule (`margin-top: 6px`, body bottom padding 24) places them where the frames' actions row sits: 22 above, 24 below.

## Scoped instead of changing a shared rule

| Rule | Why |
| --- | --- |
| `.us-loading` | The Users list (`917:218`) has no loading frame, so it could not be confirmed. |
| `.us-error` (page and dialog) | The Users list has no load-error or row-error frame. |
| `.mod-dialog__body` 14/22 | Only the User page Suspend frames (`7045:63231`, `63341`, `63452`) draw 14/22. Set aside (`7092:67168`, `7094:67685`), the hold dialogs (`6672:27278`, `27349`, `27420`), Escalate (`6879:31526`), Record appeal (`7044:62187`, `62269`), Decide (`6955:44021`, `44629`, `45845`) and the report-page Suspend confirm (`7042:61845`) draw 13px body text. |
| `.mod-dialog__field-error` bar | Drawn on `7045:63341`; not on `7092:67168`, `7044:62269` or `6955:44629`. |

The Suspend scope is by dialog mode, so the report-page Suspend dialog is unchanged and still matches `7042:61845`. The radio list and radios measure as before.

## Skipped

- **Table divider.** No change. `--sn-icon-inactive` is navy at 15%, which is what both `917:218` and `6737:27844` draw (`color/icon/inactive`, opacity 0.15). The #617 report's "lighter hairline" note does not hold.
- `.mod-radio-list` and `.mod-card--restricted` already match.
- The Suspend frames also draw the "Reason category" legend at 13 Semi Bold; the code's `.mod-dialog__label` is 12/500. Not in this brief, left as is.
- The Users list `.us-error` base keeps `border-radius: 4px` (shared, not touched).

## Measurements

Headless Chrome on a throwaway harness (not committed): the real `foundations.css`, `global.css`, `moderation.css`, `users.css` and Inter; markup copied by hand; colour variables set by hand; 1138px wide. Montserrat was not loaded. Not a built app.

| Item | Before | After | Figma |
| --- | --- | --- | --- |
| Dialog width / radius | 520 / 12 | 560 / 16 | 560 / 16 |
| Head padding, title | 18/22, 18px | 24/28/20, 20/28 600 | same |
| Close box | radius 6, 18px | 32x32, radius 8, 13px | same |
| Body padding, gap, text | 18/22/22, 14, 13px | 22/28/24, 16, 14/22 | 22/28 + actions 0/28/24 |
| Input | 41, radius 6 | 44, radius 8 | 44, 8 |
| Textarea | min 96 | 96, radius 8, 11/14 | same |
| Field label, gap | 12px, 6 | 13/20 600, 8 | 13/20 600, 8 |
| Callout | 13, normal line | 13/20, radius 6, 3px bar, no border | same |
| Guardian block | radius 6, 12/14 | radius 8, 14 | same |
| Pills | 24 | 24, 12/500, sentence case | same |
| `.us-error` (this family) | white card, radius 12 | tint, radius 6, 12/14, 13/20, 3px alert bar, 400 | alert callout |
| `.us-loading` (this family) | 17 high | 22 | 22 |
| Suspend (user) body / field error | 13px / no bar | 14/22 / 3px bar, 16 | same |

**Unchanged against `origin/main`:** 18 probes on the Users list (loading, load error, row error, table, head, row, pill) and a non-Suspend moderation dialog (body, text, list, label, field error, radios, note, actions) were identical. All moderation dialogs other than the User page Suspend dialog share those rules.

## Checks

- `npm test` (65 files, 1034 tests), `npm run lint`, `tsc --noEmit`, `npm run build` pass. No test was changed.
- No `text-transform: uppercase`, no hex colour values and no font-size under 12px in the touched files (the `#` matches are comment references).
- Contrast and dark mode were not checked. The inputs now rely on the browser's default focus ring, with no visible border at rest, as drawn.
