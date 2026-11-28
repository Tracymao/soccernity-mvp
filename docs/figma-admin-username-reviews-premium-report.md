# Figma: Admin Username reviews list and detail, premium restyle

Date: 2026-11-28. Branch `docs/figma-admin-username-reviews-premium`, from `origin/main` `6476857`. Register section 181, Decision Log #609. Figma file `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Figma and docs only. No code or CSS changed.

Source of truth: `apps/admin/src/pages/username-reviews/` and `moderation.css` at `origin/main` (after #956).

## Frames (all 1440x1184, ids kept)

| Frame | Now shows |
| --- | --- |
| `6955:42228` List (Pending) | Filter card, 7-column table, three pending rows with "Review" |
| `6955:42587` List (**renamed** from "Decided" to "Declined") | Filter "Declined", two declined rows with "View" |
| `6955:42945` List (Empty) | Filter card, empty card "No pending requests.", no table |
| `6955:43121` List (Loading) | Filter card, "Loading the review requests…", no table |
| `6955:43361` List (Error) | Filter card, error callout, separate "Retry" outline button (32 high, `--sm` in code) |
| `6955:43541` Detail (Pending) | Back link, pill, Removal and Request cards, Actions, hint, callout |
| `6955:43828` Detail (Decided) | The state right after a reinstatement: pill, "Decision recorded" callout, Removal, Request, Decision card |

Cloned from the restyled frames: Suspected illegal imagery list and states (`7075:65405`, `65573`, `65747`, `65920`) and Contact enquiry detail (`6878:31198`). The seven-column table was built from the former's header and row.

Columns follow `usernameReviews.css`: 100, 211.5, 192.25, 192.25, 100, 100, 90 with a 12px gap.

## Archived layers

In each of the seven frames the old `Content` frame is hidden, renamed `ARCHIVED Content` and moved below the frame: `6955:42230`, `42589`, `42947`, `43123`, `43363`, `43543`, `43830`. Nothing was deleted from the old frames. The Admin Shell instance was kept as it was.

## Prototype links

- "Review" goes to `6955:43541`. "View" goes to `6955:43828`.
- Detail back links go to `6955:42228`.
- The old links were wrong and were not carried over: the row buttons pointed at Contact enquiry detail `6878:31198`, and the back links at `6876:30850`.
- "View" on a declined row would show a Declined pill and a Decision card with only "Decision: Declined", with no banner. No such frame exists, so the link goes to the one decided frame, which shows a reinstatement.

## Removed copy tags

None. No layer or string on the seven frames carried "[COPY PENDING LEGAL REVIEW]".

## Dropped: the old frames showed it, the code does not render it

- List: the "Reinstated" row (Seun Ajayi, @seunaj). A reinstated request is never listed.
- Empty and Loading: the table header row.
- Loading line text changed from "Loading review requests…" to "Loading the review requests…".
- Detail: "Reason recorded at removal", "New username chosen".
- Decided detail: "Decided by", "Reason (internal)".
- Uppercase column headers and card titles.

## Notes frame `6956:47360`

One block was wrong (it said the detail view shows "Reason recorded at removal"). It now says the view shows neither that nor "New username chosen". The other blocks, including its "[COPY PENDING LEGAL REVIEW]" block about the web frames, were not touched.

## Assumptions

- Sample people and dates are reused from the old frames. "09 Oct 2026" became "9 Oct 2026".
- Request id `#3f8a21c4` is invented (the code shows the first 8 characters of the id; the old frames showed `#214`).
- "Decided on 3 Nov 2026" is reused. It only shows right after a decision in the same session.
- Key/value rows keep the Contact enquiry frame's 14/22 text and the brief's 12px card gap.

## Notes for the code PR

Measured in headless Chrome on a throwaway harness (real `foundations.css`, `global.css`, `moderation.css`, `usernameReviews.css` and Inter; markup copied by hand from the TSX; colour variables not set, as they do not change sizes). Differences over 1px:

| Item | Shipped | Figma | Cause / fix in `usernameReviews.css` |
| --- | --- | --- | --- |
| Table header | 44 high, **uppercase** | 40, sentence case | `.ur-table__row` padding 14px overrides the head padding; `.ur-table__row.mod-table__row--head` sets `text-transform: uppercase` |
| Table row | 60 high, 13px | 52, 14/22 | Padding 14px; should be about 10px with `min-height: 52px`, 14/22 |
| Loading line | 17 high | 22 | `.mod-loading` has no line-height (shared with other pages) |
| "Apply filter" | 116.9 wide | 115 | Text rendering |
| "Pending" pill | 67 wide | 69 | Text rendering or 1px border; check |
| Removal card | 193 high | 207 | `.ce-cards > .mod-card` gap 8 against 12; `.ce-kv` 13/20 against 14/22 |
| Request card | 157 high | 175 | As above, and `.ce-message` 13/20, padding 10/12 (60 high) against 14/22, 12/14 (68) |
| Actions block | 157 high | 161 | `.ur-hint` has no line-height (16 against 20) |
| "Decision recorded" callout | 64 high | 68 | Figma has 4px between title and body |
| Decision card (same height, 125) | rows 12 apart, 13/20 | rows 8 apart, 14/22 | Inner spacing only |

`ce-*` and `mod-loading` are shared in `moderation.css`; scope any change to the `ur-` pages unless the other pages should move too.

Matching within 1px or exactly: filter card 132, select 300x44, column widths, "Review" button 71x32, "Declined" pill, empty card, error callout 64, "Retry", back link, notify callout 44, action buttons 40 high. "Username removed" wraps onto two lines in the 110px label column in both.

Not measured: the Reinstated pill, the "View" button, a real built app, dark mode.

## Checks

- Top-level count **2004**; id hash (djb2-xor of ids joined with no separator, excluding `7230:71662`) **2327422288**. Same before and after.
- Queue content `5794:8710` 1100x620; Report Detail `5796:8635` content 1098x1282; Appeal Review `5796:8753` content 1098x1455.
- On all 7 frames, outside the Admin Shell: no text under 12px, no uppercase labels, no unbound solid fills or strokes, no overlaps, lowest text contrast 4.79:1, one search bar.
