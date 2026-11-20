# Report reason categories: Figma pass for B-284

Branch `design/b284-report-reason-categories`, cut from fresh `origin/main` `0dfe112` (the docs PR for Decision Log #465, PR #610, is merged and was read first). Figma file `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Figma and docs only: no application code, schema, legal copy, Build Plan docx or `docs/build-register.md`. Nothing existing was edited, archived or deleted. Light mode only.

Written for: `figma-to-code` (web and admin) and `backend-api`, and the founder who verifies it.

Founder decision drawn (#465, 2026-11-03): reports get a REASON CATEGORY from a fixed list of nine, required on a new report; the free-text description stays but is optional, except for Other.

## What was read first (live)

- `apps/web/src/pages/community/ReportAction.tsx` and `ReportAction.css`: the in-app report flow (menu to pick post or author, then a textarea, Submit report, Cancel, inline error, inline "Reported" line). No Figma frame existed for it.
- `apps/web/src/pages/ReportPage.tsx`: the public `/report` page (contact email, target type select, target ID, reason textarea, "This involves a child" checkbox, Submit; success view). No Figma frame existed for it either. It shows no severity control (the API accepts one; the page does not send it), so none is drawn.
- The existing report-on-media sheets (`6849:30010`, `6849:30169`, `6858:30635`, `6858:30711`): the closest user-facing report sheet. All new web frames are clones of their parts (Title, Subtitle, Label, Reason field, Counter, Send error, Buttons), so every text style and variable binding is inherited.
- Admin frames: Moderation Queue `5794:8635`, Report Detail & Action `5796:8635`, Appeal Review `5796:8753`, the enquiry-origin report `6878:31683`, and the search frames `6938:38451` / `6938:38813` (docs/figma-admin-search-report.md).
- Variables (`Soccernity Theme`, `Soccernity Spacing & Radius`) and the local text styles. The F2 admin components were not needed (the admin frames are clones; the web frames are user-facing Montserrat, Decision Log #403 item 14).

## The nine categories (fixed order, #465)

Harassment or bullying; Hate or abusive language; Threats or violence; Child safety concern; Sexual or inappropriate content; Impersonation or fake account; Spam or scam; Privacy or image misuse; Other.

## A. In-app report form (post, comment, user)

A radio list, not a select (my design call): one tap per choice, a 46 to 48 px row, all nine options visible. The selected row takes the `brand/green-tint` fill, a navy ring and a navy dot, all variable-bound. Layout is the existing report sheet: a 440 px white dialog on a 560 px scrim frame (desktop), a 358 px dialog on a 390 px frame (mobile). Title names the target ("Report this post / comment / user"); Subtitle is the existing "Tell us what’s wrong. Our team will review it."; then "What’s the problem? (choose one)", the nine rows, "Details (optional)" (or "Details (required)" for Other), the field, the `0 / 500` counter, the Send error (existing component), Submit report and Cancel. Submit is disabled (`color/icon/inactive` fill, secondary label) until a category is chosen, and for Other until details are written, matching the code's disabled-until-valid pattern.

| # | State | Desktop | Mobile |
|---|---|---|---|
| 01 | Post, nothing chosen (Submit disabled) | `6946:40232` | `6946:40823` |
| 02 | Post, category chosen, details empty (optional; Submit enabled) | `6946:40301` | `6946:40892` |
| 03 | Comment, nothing chosen | `6946:40371` | `6946:40962` |
| 04 | User, nothing chosen | `6946:40440` | `6946:41031` |
| 05 | Other chosen, details required and empty (hint "Details are required when you choose Other."; Submit disabled) | `6946:40509` | `6946:41100` |
| 06 | Other chosen, details written (Submit enabled) | `6946:40580` | `6946:41171` |
| 07 | Submitting ("Submitting…", disabled) | `6946:40650` | `6946:41241` |
| 08 | Send error (existing error component) | `6946:40720` | `6946:41311` |
| 09 | Sent ("Reported — thanks", "Our team will review it.", Close) | `6946:40796` | `6946:41387` |

Positions: desktop row y 174000 (x 0 to 5440), mobile row y 175700 (x 0 to 4080). Heights: desktop 904 (933 for 05, 992 for 08, 270 for 09), mobile 852 (881, 940, 182).

## B. Public report page

Same category step, placed after "Where can we find it?" and before the description. Chrome is the real `Navbar header 7` / `header 7 — mobile` instance on `brand/off-white`, a 640 px column on desktop, a card (`color/background/surface`, 1 px `color/icon/inactive`, radius 12). The existing fields are kept (Your email, What are you reporting?, Where can we find it?, "This involves a child" checkbox). No severity control, as in the code.

| # | State | Desktop (1440) | Mobile (390) |
|---|---|---|---|
| 01 | Empty, nothing chosen (Submit disabled) | `6947:39713` | `6947:40539` |
| 02 | Category chosen, details written | `6947:39889` | `6947:40628` |
| 03 | Other chosen, details required and empty | `6947:40066` | `6947:40718` |
| 04 | Send error | `6947:40244` | `6947:40809` |
| 05 | Sent ("Report submitted" with the confirmation line from the code) | `6947:40427` | `6947:40905` |

Positions: desktop y 177500 (pitch 1640), mobile y 181600 (pitch 510).

## C. Admin views (desktop, like the other admin frames)

Clones of the existing frames, so the original frames stay as they were.

- **Moderation Queue** `6947:40930`: the REASON column is now "Reason category" and shows the category label per row; one row reads "Not categorised" (an older report), one reads "Other".
- **Report Detail** `6947:41119`: the "Reason" row is "Reason category: Harassment or bullying" and a new "Description" row shows the reporter's optional text.
- **Report Detail, older report** `6947:41276`: "Reason category: Not categorised", the Description row carries the old free text, so an older report loses nothing.

## D. Admin search

- **Search, reason-category query** `6947:41433` (query "impersonation"): the REASON column is "REASON CATEGORY" with the label ("Impersonation or fake account"), MATCHED ON "Reason category"; the helper line now reads "Email lookups need the full address, for example name@example.com. Reports can be found by reference, username or reason category."
- **Search, username query with an older report** `6947:41607` (query "nelson"): same header and helper line; one row's category is "Not categorised".

Positions: admin row y 185200, pitch 1620 (x 0 to 6480). Notes frame `6948:40809` at x -1200, y 174000 (eight F2 Note instances: defaults to veto, design calls, SCOPE OPEN).

## Decisions I made (all defaults for the founder to veto)

1. **Labels and helper texts are defaults.** The nine category labels (taken from #465 as written), "What’s the problem? (choose one)", "Details (optional)" / "Details (required)", "Details are required when you choose Other.", "Reported — thanks / Our team will review it.", "Reason category", "Not categorised", and the extended search helper line. All plain and functional. **Nothing is tagged `[COPY PENDING LEGAL REVIEW]`.** The old media-report sentence "Only our moderators see your reason, not the person who posted this." (tagged) was deliberately not carried over, since it is a promise about who sees what.
2. Radio list over select (see A). Cost: the mobile sheet is about 850 px tall.
3. The category is shown in the queue row, not the description; the description is shown in Report Detail only.
4. Older reports read "Not categorised" with their old text kept as the Description.
5. Fonts: Montserrat, like the other user-facing frames. The code (`ReportAction.css`, `ReportPage.css`) uses Inter; not changed here.

## SCOPE OPEN (also on canvas as Notes)

- "Child safety concern": the in-app form has no "involves a child" control and #465 item 5 says a category sets neither `concernsMinor` nor severity, so choosing it does not flag a minor. Whether it should, or point to a more urgent route, is a founder call.
- Mobile sheet height: scrolling inside the sheet and a pinned Submit row are not drawn.
- The enquiry-origin report (`6878:31683`) carries no category (#465 item 6); the frame was not changed. Whether it shows "Not categorised" or omits the row is not decided.
- Appeal Review is not redrawn (it would show the category row exactly as Report Detail does).
- Original admin frames (5794:8635, 5796:8635, 5796:8753, 6938:38451, 6938:38813) are untouched and still show the old free-text sample reasons.
- The search box does not match the description (#465 item 8): stated, not drawn.
- Media reports (`PostMediaReport`) are out of scope (#465 item 7) and unchanged.
- No inline validation error is drawn for a missing category (the code disables Submit instead).
- Prototype links between the new frames were not added.
- The queue's Reason column is a fixed 215 px; the longest label ("Impersonation or fake account") fits, the search results wrap it onto two lines.

## Standing check (Decision Log #404 item 14)

- Top-level nodes on `0:1`: 1,216 to 1,250 (34 new: 28 web frames, 5 admin frames, 1 notes frame). The original 1,216 are the first 1,216 children in order; **no before-hash was taken for this pass** (a gap in my procedure), so unchanged ids are shown by count and order only.
- 1,161 solid fills and strokes on authored nodes (instance internals excluded): 1,158 variable-bound, 3 unbound. The 3 are the cloned queue's existing "Export Queue" button (pre-existing, not authored here).
- 0 overlaps with any top-level node. Nothing deleted or archived.
- Screenshots read: in-app 02, 05, 08, 09 (desktop and mobile samples), public desktop 02 and 03, public mobile 02, public 05, admin queue, both Report Detail frames and both search frames, the notes frame.

## Disclosures

- My first build call forgot to switch to page `0:1` (page context resets each call), so 9 frames landed on the cover page. I moved them to `0:1`, found a radio-dot placement bug, deleted those 9 of my own new frames and rebuilt all 18 correctly. The cover page has only its original four nodes.
- A default white fill on frames I created was swept to none (114 frames), and a second pass fixed single-line field alignment and the success-page centering.
- One `use_figma` setting (`textAlignHorizontal`) did not centre text on the first try; fixed in a later call.
- Screenshots were downloaded to the session scratchpad; none are committed.

## Follow-ups (nothing fixed here)

- `figma-to-code`: add the category step to `ReportAction.tsx` and `ReportPage.tsx` (and the admin queue, detail and search), once the backend field exists (B-284).
- Decide the open points above; consider a Figma pass for Appeal Review and the enquiry-origin report once decided.
