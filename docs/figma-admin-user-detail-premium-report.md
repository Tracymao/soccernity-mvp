# Figma: admin User detail frames restyled to the premium design (Decision Log #616)

File `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Figma and docs only. No code or CSS changed. Source of truth: `UserDetailPage.tsx`, `GuardianNoticesSection.tsx`, `guardianNoticesCopy.ts`, `usersShared.tsx`, `users.css` and `moderation/SuspendAccountDialog.tsx` at `origin/main` `5f4c57b`.

All frames: 1440 wide, at least 1184 high, Admin Shell active item "Users", header (title, status pill, "Back to users") at x301 y128, search bar at (302,182) 740x44, content at (301,258), width 1098, gap 20. Every frame was rebuilt: the old layers are hidden in "ARCHIVED Content" below the frame. Nothing was deleted. Prototype links on the old dialog and Suspend buttons were copied to the new buttons.

## Frames restyled (frame ids kept)

| Frame | State | Height | New content | Dialog |
| --- | --- | --- | --- | --- |
| `6647:25540` | Adult, active, with username | 1184 | `7417:70268` | |
| `6647:25789` | Revoke username dialog | 1184 | `7417:70330` | `7417:70393` |
| `6649:24462` | Username revoked | 1184 | `7417:70412` | |
| `6649:24714` | Revoke username error | 1184 | `7417:70478` | `7417:70545` |
| `6920:34766` | Minor, notices off | 1213 | `7417:70564` | |
| `6921:34878` | Set dialog | 1213 | `7417:70640` | `7417:70726` |
| `6921:35065` | Set dialog, reason required | 1213 | `7417:70748` | `7417:70837` |
| `6921:35255` | Notices on | 1293 | `7417:70859` | |
| `6921:35449` | Notices on, review due | 1353 | `7417:70949` | |
| `6921:35655` | Record review dialog | 1353 | `7417:71045` | `7417:71140` |
| `6921:35894` | Clear dialog | 1293 | `7417:71162` | `7417:71251` |
| `6921:36121` | Cleared | 1303 | `7417:71273` | |
| `6921:36281` | No confirmed guardian | 1184 | `7417:71354` | |
| `6921:36445` | Restricted (not vetted) dialog | 1184 | `7417:71429` | `7417:71488` |
| `6950:41191` | Under 16 | 1213 | `7417:71507` | |
| `7045:63231` | Suspend dialog, default | 1213 | `7417:71583` | `7417:71701` |
| `7045:63341` | Suspend dialog, category required | 1213 | `7417:71723` | `7417:71844` |
| `7045:63452` | Suspend dialog, category chosen | 1213 | `7417:71866` | `7417:71985` |

## New frames (the code renders the state and no frame drew it)

At the end of the page, row y 371400. There was no loading or error frame for this page.

| Frame | State | Content |
| --- | --- | --- |
| `7417:72001` | Page loading | `7417:72119` |
| `7417:72121` | Page load error | `7417:72239` |
| `7417:72245` | Account suspended (banner, grey pill, no Suspend button) | `7417:72365` |

## Archived frames (hidden, "ARCHIVED " prefix, moved below; contents not restyled)

| Frame | Reason |
| --- | --- |
| `6950:40855` Age cases A, adult | Same state as `6647:25540` once both match the code (adult, active, with username). Only the sample person differed. |
| `6950:41024` Age cases B, under 18 and 16 or over | Same state as `6920:34766` (minor, Under 16 "No", guardian confirmed, notices off). |
| `7045:63053` Suspend account row | The code shows the Suspend row on every account that is not deleted, so this is the same state as `6920:34766`. Its Suspend link, and the three Suspend dialogs' Close and Cancel links, now use `6920:34766`. |

## Unsure (left as they were)

- The links on the guardian-notice and Suspend confirm buttons (and on the guardian dialogs' Close and Cancel) point to `6878:31198` "Admin — Enquiry Detail" and `6878:31438` "Admin — Enquiry Detail — Escalated". This looks wrong. The links were copied unchanged.

## Where the old frames and the code disagreed (the code wins)

- Account card: the base frames lacked "Age group", "Under 16" and "Guardian"; the minor and age frames lacked "Status" and "User ID". The code always shows all nine rows.
- "Support actions" lacked the Account (Suspend) row outside the `7045` frames.
- Revoke dialog: no reason field or help line was drawn. The code requires a reason.
- All "[COPY PENDING LEGAL REVIEW]" tags removed: the chip above the Guardian notices card, the tag on the revoke dialog text, and the tag on the audit help line. The code renders none.
- "The reason is saved to the audit record." was drawn on the review and clear dialogs. The code shows it only on the set dialog.
- Restricted dialog: the title is "Restricted: child-safety vetting required" (colon, not a dash). The page behind it no longer shows the Guardian notices card, because the page re-reads the profile and removes the section.
- Pills are drawn as the browser renders them: `.us-pill` capitalises every word, so "Sending Normally", "No Guardian To Notify" and "Review Due". This looks unintended in code (see below).
- The revoke dialog was a component instance. The new one is plain frames.
- The page header has no email or age indicator. Those are rows in the Account card.

## Code has them, no frame

- Revoke: "Give a reason of at least 10 characters.", "Keep the reason under 500 characters.", "Revoking…", server 4xx message.
- Guardian notices: "Loading guardian notices…", section load error with Retry, 404 message, stale-page line (409), "Enter between 10 and 1000 characters.", "Couldn’t save that. Nothing was changed. Try again.", "Withholding…", "Recording…", "Clearing…".
- Guardian notices: "No guardian to notify" pill on an ON card, "Last review note", set-dialog intro for an account with no confirmed guardian, review and clear field errors, restricted dialogs for review and clear.
- Guardian notices section absent for a non-vetted admin on a minor (same page as the adult layout apart from the field values).
- Suspend: "Suspending…", server 4xx message, "Couldn’t suspend this account. Please try again.".
- Deleted account (no Suspend row). A load error that keeps the already-loaded cards on screen after a reload.

## Notes for a code PR

"Code" sizes are from a throwaway headless-Chrome harness (real `foundations.css`, `global.css`, `AdminPageHeader.css`, `moderation.css`, `users.css`, hand-copied markup, colour variables set by hand) or read from the CSS. Not measured in a built app. "Shared" names the other users of a rule.

Cards (radius 12, padding 20), pills (24 high, 12/500), buttons (32 and 40 high, radius 8), the Account and Support card layout already match.

| File | Item | Code | Frames | Shared with |
| --- | --- | --- | --- | --- |
| users.css | `.ud-dialog` | 520, radius 12 | 560, radius 16 | Correct DOB, Incorrect-details reports, Guardian notices |
| users.css | `.ud-dialog__head` | padding 18/22, title 18 | padding 24/28/20, title 20/28 Semi Bold | same |
| users.css | `.ud-dialog__close` | radius 6, 18px glyph | radius 8, 13px glyph | same |
| users.css | `.ud-dialog__body` | gap 14, padding 18/22/22, 13px | gap 16, padding 22/28, 14/22 | same |
| users.css | Dialog buttons | inside the body | actions row, padding 0/28/24 | same |
| users.css | `.ud-input` / `.ud-textarea` | radius 6, 1px border, padding 10/12 | radius 8, no visible border, padding 11/14, 96 high | Correct DOB |
| users.css | `.ud-field label` | 12 secondary | 13 Semi Bold primary | Correct DOB, Incorrect-details reports |
| users.css | `.ud-field__error` | 3px alert bar | same | same |
| users.css | `.ud-callout` | radius 6, 3px bar, 12/14 | same; line height 20 | Correct DOB, Incorrect-details reports |
| users.css | `.ud-callout--error` | 1px navy border, 6px alert bar, bold | alert callout: no border, 3px alert bar, regular | same |
| users.css | `.us-page > .us-error` | white card, 6px alert bar | alert callout | **Users list** and the other users pages |
| users.css | `.us-loading` | 19 high | 22 line | Users list and the other users pages |
| users.css | `.gn-alert` | white background, navy border | tinted alert callout | Guardian notices only |
| users.css | `.us-pill` | `text-transform: capitalize` | drawn the same; "Sending Normally" and the other guardian labels would need `us-pill--plain` | **Users list** |
| GuardianNoticesSection.tsx | Notice pills | no `us-pill--plain` | change there first, then the frames | |
| moderation.css | `.mod-dialog__body` | 13px | 14/22 | every `mod-dialog` (Set aside, Escalate, Hold, Record appeal, Decide, Suspend) |
| moderation.css | `.mod-radio-list` | radius 8, 1px border | same | Suspend only |
| moderation.css | `.mod-dialog__field-error` | no bar | 3px alert bar | every `mod-dialog` |
| moderation.css | `.mod-card--restricted` | navy border, radius 12 | same | Media review, Suspected illegal |

## Standing check (passed)

- Top-level count **2026** = 2023 + 3 new frames.
- Id hash of the first 2023 ids (excluding `7230:71662`): **3256625424**. First 2017: **4020296636**. First 2004: **2327422288**.
- Queue content `5794:8710` 1100x620; Report Detail `5796:8635` content 1098x1282; Appeal Review `5796:8753` content 1098x1455.
- 21 restyled and new frames: 1440 wide, at least 1184 high, bottom padding at least 45, no overlap with another visible top-level frame, no unbound solid fill or stroke outside the Admin Shell (one shell fill hit per frame), no text under 12px, no uppercase label, no "[COPY PENDING" text, one search bar. 0 issues after the three new frames were moved off an occupied row.
- Screenshots (1000px): `6649:24714`, `6921:35449`, `6950:41191`, `7045:63341`, `7417:72245`. Contrast and dark mode were not checked. Sample data is reused from the old frames; the three new user ids are invented.
