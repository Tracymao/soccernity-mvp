# Admin Moderation family: premium restyle in code

Date: 2026-11-28. Branch `ui/admin-moderation-premium`, from `origin/main` `3b74845`. Register section 180, Decision Log #608.

CSS first. Page structure, routes, API calls, behaviour and visible strings are unchanged. Target: the merged `docs/figma-admin-*premium*` reports.

## Also changes two pages outside the family

`moderation.css` is shared. **Activity** and **Username reviews** use its `mod-*` and `hi-*` classes, so their cards, table headers, pills, buttons, callouts, dialogs, errors and filter cards change too. Their files were not edited and they were not rendered or checked by eye. `UsersPage` and `UserDetailPage` import the stylesheet; no `mod-*` class names were found in their markup.

## What changed, by group

1. **Foundations.** Page 1098 wide. Cards and tables radius 12. Table header 40 high, tint, 12 Medium, sentence case. Rows at least 52 with a bottom hairline, 14/22. Pills 24 high, 12 Medium, capitalised; outline pill 1px navy. Buttons 40 high (small 32), radius 8, with hover, pressed and focus states. Callouts radius 6, no stroke, 3px bar flush left. Inline errors are the alert callout; a page-level error is a card with a 6px alert bar. Inputs, textareas and selects use the tint fill, 2px transparent border, alert border when invalid. Dialogs radius 16, `--sn-elevation-3` (the same three shadow layers as before).
2. **Queue, Report Detail, Appeal Review, holds, context messages.** Tabs 14 Medium. Field labels sentence case 12/16, values 14/22. Report Status capitalised. Context pills 24 high and 12px (were 11px). Checkbox 16px. Helper line 13/20.
3. **Contact enquiries and Held investigations.** Rows and headers as above; filter inputs 44 high, radius 8; "Apply filter" lines up with the input; detail cards use an 8px row gap.
4. **Media review.** Statistics, filters (220x44), table, viewer radius 12, reject dialog radius 16 with a 32x32 close button, 16px between the back link and the viewer, load-error card with a 6px alert bar.
5. **Suspected illegal imagery.** Columns spread over the full width (110:90:150:130:100 as `fr`). Form controls 44 high on the tint fill. Field errors 12 Semi Bold.
6. **Docs.** No test file needed changing.

## TSX files touched

All edits are class names, except one optional prop.

| File | Why |
| --- | --- |
| `ReportDetailPage.tsx` | Capitalise Status; "Content removed" pill marked plain so it does not become "Content Removed" |
| `EnquiryReportView.tsx` | Status pill and Status value capitalised |
| `contactEnquiryShared.tsx` | `KeyValue` gained an optional `valueClassName` prop for the line above |
| `MediaReviewQueuePage.tsx` | "N pending" pill marked plain (it rendered as "5+ Pending"); load-error class; "Try again" and "Load more" 40 high |
| `MediaReviewItemPage.tsx` | Load-error class (not on "Item not found"); "Try again" 40 high |
| `ModerationQueuePage.tsx`, `ContactEnquiriesPage.tsx` | "Load more" 40 high |
| `HeldInvestigationsPage.tsx` | "Back to moderation" 40 high |
| `SuspectedIllegalListPage.tsx` | "Retry" and "Load more" 40 high |

Capitalisation is done with CSS (`text-transform: capitalize`), as in the Lists group, so the DOM text is unchanged. A multi-word lower-case value in a pill (for example an automatic-check label) is capitalised word by word.

## No change, and why

| Note in a Figma report | Reason |
| --- | --- |
| "Use at most 1000 characters." | The textarea has `maxLength` 1000, so a browser cannot show it |
| "Enter a valid date and time." | Unlikely from a `datetime-local` input; string kept |
| Media reject limit 300, disabled submit, "5+ pending" | The code already does this |
| Round profile picture | The code draws it square; the report records that |
| Suspected illegal record load error | Figma D12 draws a plain card, no alert bar |
| Figma sample values and dropped extras | Not code |

## Measurements

Headless Chrome on a throwaway harness: the real CSS files, markup copied by hand from the TSX, and hand-set colour variables. Figma values from `get_metadata`.

| Item | Figma | Rendered |
| --- | --- | --- |
| Queue 5794:8635: tab / note / header / row / minor row | 35 / 20 / 40 / 52 / 80 | same |
| Queue: table radius, pill, "Load more", callout | 12, 24, 113x40, 44 | same |
| Media queue 6851:29675: heading, filters, select, header, row, row button | 24, 68, 220x44, 40, 52, 32 | same |
| Media queue statistics card | 162 | 161 |
| Media item 6852:30003: viewer / details card / content | 412 / 204 / 732 | 412 / 203 / 731 |
| Dialog 6672:27278: width, radius, close, header with divider, actions, buttons | 560, 16, 32, 77, 64, 40 | same |
| Dialog textarea / body / dialog height | 96 / 232 / 373 | 108 / 244 / 385 |

Differences over 1px:

- **Dialog textarea is 12px taller**, which makes the body and dialog 12px taller. The markup has `rows={4}` and the brief says textareas keep their row height. The media reject textarea has the same cause (Figma 90).
- **Button widths** differ by up to 2px ("Confirm bad faith" 160 against 158). Tab widths differ by about 1px. Text rendering.

## Acceptance checks

- `text-transform: uppercase` in the three CSS files: none.
- Font sizes under 12px: none.
- Hex or `rgb()` values: none (the one `#` match is a Decision Log number in a comment).
- Radius outside the scale: one, `border-radius: 0` on `.media-dialog__error`, which resets the radius so the bar stays square. It was there before.
- `box-shadow`: two `var(--sn-elevation-3)` and the existing navy inset bar on open suspected-illegal rows. No new shadow values.
- Admin tests: 65 files, 1034 tests, all pass. Lint, `tsc --noEmit` and `vite build` pass.
- Two focus tests each failed once in a full run (`contactEnquiries.test.tsx`, `addRole.test.tsx`), passed when run alone and in later full runs. They look flaky.
- On Windows, tests must run from a path with an upper-case drive letter, or every suite fails to load.

## Not matched, or worth knowing

- Selects keep the browser's own chevron.
- The native checkbox keeps its own corner radius (Figma 4, which is not on the scale).
- The restricted notice inside the Bants room card has radius 12, from `.mod-card` (the Figma report has 6).
- A "could not load more" line that sits directly in the page also gets the error-card look.
- The "Apply filter" offset (28px) assumes each filter field has a label above it.
- The suspected-illegal form keeps its 560px maximum width; it was not measured against Figma.
- Contrast was not re-measured; colours are the existing tokens.

## Not verified

A real built app, staging, dark mode, narrow screens, and every screen other than the four measured.
