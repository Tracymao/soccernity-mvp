# Figma admin Media review: three corrections to match shipped code

Date: 2026-11-28. Figma file `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Figma and docs only; no code or CSS changed.

Code read from `origin/main` at `0e77352`: `MediaReviewItemPage.tsx` (`RejectDialog`), `MediaReviewQueuePage.tsx`, and `MEDIA_REVIEW_REJECT_REASON_MAX` (300) in `apps/admin/src/api/mediaReview.ts`.

## 1. Character limit helper line

| Dialog frame | Text node | Old | New |
|---|---|---|---|
| `6852:30985` (empty reason, invalid) | `7331:70481` | Up to 500 characters. | Up to 300 characters. |
| `6852:31327` (reason entered) | `7331:70556` | Up to 500 characters. | Up to 300 characters. |

The three profile and cover dialogs (`6972:46863`, `6972:47057`, `6972:47248`) already read "Up to 300 characters." No other Media reject dialog frame carried the old line.

The set-aside dialog frames read "10 to 500 characters." They are a different dialog, were not checked against code in this pass, and were not changed.

## 2. Disabled submit while the reason is empty

The code disables the submit button when the trimmed reason is empty.

- `6852:30985`: button `6852:31325` switched from `State=Default` to `State=Disabled` (component `6671:27373`, the one `6972:46863` uses). Label, layer name and 134x40 size unchanged.
- `6852:31327`: a reason is entered; button `6852:31664` is still `State=Default`. No change.

## 3. Pending count pill

The code shows the pill only on the pending filter once data has loaded. It reads the number of loaded items, with "+" when there is a next page.

| Queue frame | Old | New |
|---|---|---|
| `6851:29675` Queue (Load more visible) | 5 pending | 5+ pending |
| `6972:46142` Mixed queue (Load more visible) | 5 pending | 5+ pending |
| `6851:30038` Empty | 0 pending | unchanged: no items and no next page |
| `6851:30333` Load error | no visible pill | unchanged: no data, so no pill |

**Pill width.** The pill hugs its text, so it grew from 78px to 86px. Its right edge and vertical position are unchanged; the left edge moved 8px left. It was left as hug-width, matching the shipped pill. Nothing overlaps it.

Layer names were preserved, so the pill layers are still called "Pill — 5 pending".

## Checks

- Screenshots at 1000px of `6852:30985`, `6852:31327`, `6851:29675` and `6972:46142`: no layout change apart from the wider pill.
- Top-level count: 2004.
- Id hash (djb2-xor over ids joined with no separator, excluding `7230:71662`): 2327422288.
- Queue content `5794:8710`: 1100x620. Report Detail `5796:8635` Content: 1098x1282. Appeal Review `5796:8753` Content: 1098x1455.
- Overlaps: none involving the four edited frames. A page-wide count of visible top-level nodes finds 107 overlapping pairs, none of them involving those frames. No top-level node was moved or resized; no before-count of overlaps was taken.
- Nothing deleted.
