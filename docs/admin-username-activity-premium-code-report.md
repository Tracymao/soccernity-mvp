# Admin Username reviews and Activity aligned to the premium design (code)

Date: 2026-11-28. Branch `ui/admin-username-activity-premium`, from `origin/main` `3c223de`. Register section 184, Decision Log #612. Design values only; no structure, copy or behaviour changed.

## What changed

| File | Change |
| --- | --- |
| `activity.css` | Header sentence case, 40 high. Rows 14/22, at least 52. Loading skeleton rows stay 40. Skeleton bar radius 4 to `radius/sm` (6). |
| `usernameReviews.css` | Header sentence case, 40 high. Rows 14/22, at least 52. Hint line-height 20. Detail page (scoped to `.ur-detail`): card gap 12, key/value 14/22, message 14/22 with padding 12/14, 4 under the "Decision recorded" title. Decision card rows 8 apart. Option box radius written as `radius/md` (same 8px). |
| `moderation.css` | `.mod-loading` line-height 22. `.hi-filter__row` gap 12. `.mod-textarea` 90 high, `.mod-dialog__input` 96 high. Bants room restricted notice radius 6. |
| `UsernameReviewDetailPage.tsx` | Class names only: `ur-detail`, `ur-decision`. |
| `ReportedRoomCard.tsx` | Class name only: `mod-room-card`. |

## Textarea heights

The frames draw two heights, read from Figma:

| User | Figma | Rule |
| --- | --- | --- |
| Hold, Record appeal, Set aside, Username decide dialogs | 96 | `.mod-dialog__input` |
| Report Detail "Escalation notes", media "Reject picture" reason | 90 | `.mod-textarea` |

The Suspected illegal textareas use `.si-form`, not `.mod-textarea`, and did not change.

## Measurements

Headless Chrome on a throwaway harness: the real `foundations.css`, `global.css`, `moderation.css`, `activity.css`, `usernameReviews.css` and Inter; markup copied by hand; colour variables set by hand; 1098px wide. Not a built app.

| Item | Measured | Figma |
| --- | --- | --- |
| Audit log header | 40, 12/16, sentence case | 40 |
| Audit log row | 52, 14/22 | 52, 14/22 |
| Audit log skeleton row | 40 | 40 |
| Filter gap (4 fields and button) | 12, one line | 12 |
| Username reviews header | 40, sentence case | 40 |
| Username reviews row | 52, 14/22 | 52, 14/22 |
| Hint line-height | 20 | 20 |
| `.mod-loading` line-height | 22 | 22 |
| Detail card gap | 12 | 12 |
| Detail key/value, message | 14/22, message padding 12/14 | same |
| Decision card row gap, height | 8, 125 | 8, 125 |
| "Decision recorded" callout | 68 | 68 |
| Dialog textarea | 96 | 96 |
| In-page textarea | 90 | 90 |
| Bants room notice radius (other restricted cards) | 6 (12) | 6 |
| Shared `.ce-kv`, card gap, message outside `.ur-detail` | 13/20, 8, 13/20 with 10/12 | unchanged |

## Not done

- Decide dialog option rows are still 60 high against 64 (`.ur-option__title` and `__help` have no line-height), and `.mod-dialog__field-error` is 15 high against 20. Neither was in this brief. With the textarea now 96, the valid dialog should be about 537 high against 545 (calculated, not measured).
- The skeleton bar radius is now 6; the Activity Figma pass drew it at 4. The brief's radius scale was followed.
- `text-transform: uppercase` in Contest, Media, Settings, Search and the stub pages is left for their own passes.

## Checks

- `npm test` (65 files, 1034 tests), `npm run lint`, `tsc --noEmit`, `npm run build` all pass. No test was changed. The repo uses npm workspaces, not pnpm. On Windows the tests must be run from `D:\`; from a lowercase `d:\` path every suite fails to load.
- No `text-transform: uppercase` in `activity.css` or `usernameReviews.css`; no hex colours or font-size under 12px in the three CSS files; every radius is a scale token.
