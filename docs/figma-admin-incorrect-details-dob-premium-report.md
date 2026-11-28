# Figma: admin Incorrect-details reports and Correct date of birth frames restyled to the premium design (Decision Log #617)

File `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Figma and docs only. No code or CSS changed. Source of truth: `IncorrectDetailsReportsPage.tsx`, `CorrectDobPage.tsx`, `usersShared.tsx` and `users.css` at `origin/main` `afe0337`.

All frames: 1440 wide, at least 1184 high, Admin Shell active item "Users", title row at x301 y128, search bar at (302,182) 740x44, content at (301,258), width 1098, gap 20. Every existing frame was rebuilt: the old layers are hidden in "ARCHIVED Content" inside the frame, moved below it. Nothing was deleted.

## Group a: Incorrect-details reports

| Frame | State | New content | Dialog |
| --- | --- | --- | --- |
| `6737:27844` | List | `7423:70516` | |
| `6738:27962` | Truncated | `7423:70628` | |
| `6738:28144` | Empty | `7423:70743` | |
| `6738:28328` | Load error | `7423:70774` | |
| `6738:28510` | Already resolved (404) | `7423:70790` | |
| `6738:28693` | Resolve failed | `7423:70884` | |
| `6738:29952` | Loading | `7423:70999` | |
| `6738:30173` | Resolve confirm | `7423:71029` | `7423:71136` |

The three existing prototype links were copied to the new elements: Resolve (first row) to `6738:30173`, Retry to `6738:29952`, Cancel to `6737:27844`.

The task wrote the already-resolved case as 409. The code treats **404** as already resolved, and the frame is drawn that way.

## Group b: Correct date of birth

| Frame | State | Height | New content | Dialog |
| --- | --- | --- | --- | --- |
| `6649:24980` | Form | 1184 | `7424:69881` | |
| `6649:25217` | Validation | 1184 | `7424:69920` | |
| `6649:25463` | Confirm dialog | 1184 | `7424:69965` | `7424:69998` |
| `6649:25721` | Success | 1184 | `7424:70026` | |
| `6649:25952` | Error in the confirm dialog | 1184 | `7424:70059` | `7424:70092` |
| `6752:29980` | Adult to minor, guardian details | 1237 | `7424:70124` | |
| `6752:30141` | Adult to minor, guardian details missing | 1301 | `7424:70179` | |

### New frames (the code renders the state and no frame drew it)

At the end of the page, row y 373200.

| Frame | State | Content |
| --- | --- | --- |
| `7424:70232` | Page loading | `7424:70427` |
| `7424:70429` | Page load error | `7424:70624` |

## Archive decisions

No frame was archived. Each of the 15 existing frames draws a state the code renders, and no two draw the same state. The only things archived are the old layers inside each restyled frame.

## Group c: two corrections to the User detail frames (#965)

### Pill wording

Eleven pill texts changed, text only: "Sending normally" (`7417:70623`, `70699`, `70807`, `71337`, `71566`, `71642`, `71782`, `71925`), "Review due" (`71010`, `71106`) and "No guardian to notify" (`71413`). They are on frames `6920:34766`, `6921:34878`, `6921:35065`, `6921:35449`, `6921:35655`, `6921:36121`, `6921:36281`, `6950:41191`, `7045:63231`, `7045:63341` and `7045:63452`. "Withholding" is unchanged.

**The code does not match yet.** `GuardianNoticesSection.tsx` needs the `us-pill--plain` class on these pills (code PR).

### Prototype links

All on visible layers. "Old" targets: Enquiry = `6878:31198` "Admin — Enquiry Detail", Escalated = `6878:31438`.

| Frame (dialog) | Element | Old | New |
| --- | --- | --- | --- |
| `6921:34878` (Set) | Close `7417:70728` | Enquiry | `6920:34766` notices off |
| `6921:34878` | Cancel `7417:70734` | Enquiry | `6920:34766` |
| `6921:34878` | Withhold notices `7417:70736` | Escalated | `6921:35255` notices on |
| `6921:35065` (Set, reason required) | Close `7417:70839` | Enquiry | `6920:34766` |
| `6921:35065` | Cancel `7417:70845` | Enquiry | `6920:34766` |
| `6921:35065` | Withhold notices `7417:70847` | Escalated | `6921:35255` |
| `6921:35655` (Record review) | Close `7417:71142` | Enquiry | `6921:35449` review due |
| `6921:35655` | Cancel `7417:71148` | Enquiry | `6921:35449` |
| `6921:35655` | Record review `7417:71150` | Escalated | `6921:35255` notices on |
| `6921:35894` (Clear) | Close `7417:71253` | Enquiry | `6921:35255` |
| `6921:35894` | Cancel `7417:71259` | Enquiry | `6921:35255` |
| `6921:35894` | Clear `7417:71261` | Escalated | `6921:36121` cleared |
| `6921:36445` (Restricted) | Close box `7417:71490` | Enquiry | `6920:34766` |
| `6921:36445` | Close button `7417:71496` | Enquiry | `6920:34766` |
| `7045:63231` (Suspend) | Suspend account `7417:71711` | Escalated | `7417:72245` suspended |
| `7045:63341` | Suspend account `7417:71854` | Escalated | `7417:72245` |
| `7045:63452` | Suspend account `7417:71995` | Escalated | `7417:72245` |

The Suspend dialogs' Close and Cancel already pointed to `6920:34766`. Old links to the Enquiry frames remain only inside hidden "ARCHIVED Content" layers, where they cannot be clicked. The Correct date of birth frames have no prototype links, before or after.

## Unsure

- `6921:36445` Restricted dialog: the code removes the Guardian notices card behind this dialog, and no frame draws that page for this person. Close points to `6920:34766`, which still shows the card.
- The "Review due" pills measure 89x26, not 24 high. Only the text was changed here.

## Where the old frames and the code disagreed (the code wins)

- Validation: the "2 fields need attention before the correction can be reviewed." banner is dropped. The messages are now "Enter the new date of birth." (was "Enter the corrected date of birth.") and "Give a reason of at least 10 characters." (was "A reason is required for every correction.").
- Confirm error: "Couldn't apply the correction." (was "The correction could not be saved. Nothing was changed. Try again."), drawn after the list, as the code places it.
- Guardian intro now reads "…We will email the consent request to the guardian at the address you enter below. Use the address from the support ticket."
- Success: the "Age tier" and "Guardian request" rows were missing and are added. Their sample values ("under 16 → adult", "The open guardian request was cancelled") are invented.
- "[COPY PENDING LEGAL REVIEW]" removed from non-legal strings the code renders without it: the info callout under the form, the three confirm bullets, the success callout and the guardian intro.
- The confirm dialog is 560 wide (was 620). The date field is drawn as a native date input ("dd/mm/yyyy" with a calendar icon).

## Code has them, no frame

- Reports: "Resolving…"; the truncated callout together with a resolve message.
- Correct DOB: "The date of birth can't be in the future.", "That is already the date of birth on file.", "Keep the reason under 500 characters.", the client date-in-reason message, the server `reason_contains_date` message under the reason, the server "Provide guardian…" message that reveals the guardian block, "Applying…", the other four guardian-request outcomes, "—" when there is no date of birth on file, a server-supplied load error message.

## Drawing choices to check

- The guardian block draws "Guardian details" inside the box. A browser draws a `legend` on the border line.
- The read-only "Current date of birth" keeps a white fill and a 1px grey border, so it still reads as read-only.
- The confirm bullets are text with a "•" character.

## Notes for a code PR

"Code" sizes are from a throwaway headless-Chrome harness (real `foundations.css`, `global.css`, `AdminPageHeader.css`, `users.css`, hand-copied markup, runtime colour variables not set) or read from the CSS. Not measured in a built app. "Shared" names other users of a rule. The `ud-dialog*` rows in the User detail report (#616: width 560, radius 16, header band, body 22/28 and 14/22, actions row, 32x32 close box) apply unchanged to both dialogs here.

Already matching: page gap 20, card radius 12 / padding 20 / gap 12, pills 24 and 12/500, buttons 32 and 40, table head 40, rows 52, report columns, `.ir-empty`, `.ud-fields__row`, textarea 96, invalid border 2px alert. No change is needed in `IncorrectDetailsReportsPage.tsx` or `CorrectDobPage.tsx` markup.

| File / page | Item | Code | Frames | Shared with |
| --- | --- | --- | --- | --- |
| users.css | `.ud-input` | 37–39 high, radius 6, 1px border, 10/12 | 44, radius 8, no visible border, 0/14 | User detail dialogs, Guardian notices |
| users.css | `.ud-input--readonly` (DOB) | 37 high | 44 high | DOB only |
| users.css | `.ud-field` / label | gap 6; label 12 secondary | gap 8; 13 Semi Bold primary | User detail |
| users.css | `.ud-field__help` / `__error` | normal line height | 16 | User detail |
| users.css | `.ud-callout` (both pages) | 13, normal line height | 13/20 | User detail |
| users.css | `.ud-callout--warning` (DOB) | 1px navy border, 6px bar | no border, 3px bar | DOB only |
| users.css | `.ud-guardian` (DOB) | radius 6, 12/14 | radius 8, 14 | DOB only |
| users.css | `.us-page > .us-error` | white card, 6px alert bar | alert callout | **Users list**, User detail |
| users.css | `.us-error` in the DOB dialog | navy border, radius 4, 600 | alert callout, regular | User detail, Users list row errors |
| users.css | `.us-loading` | normal line height | 22 | Users list, User detail |
| users.css | `.us-table__row` divider | solid `--sn-icon-inactive` | lighter hairline | **Users list** |
| GuardianNoticesSection.tsx | Notice pills | no `us-pill--plain` | sentence case | User detail only |

Moderation pages (`moderation.css`) use none of the rules above.

## Standing check (passed)

- Top-level count **2028** = 2026 + 2 new frames.
- Id hash of the first 2026 ids (excluding `7230:71662`): **2027538330**. First 2023: **3256625424**. First 2017: **4020296636**. First 2004: **2327422288**.
- Queue content `5794:8710` 1100x620; Report Detail `5796:8635` content 1098x1282; Appeal Review `5796:8753` content 1098x1455.
- 38 frames (17 reports and DOB, 21 User detail): 1440 wide, at least 1184 high, no overlap with another visible top-level frame, no unbound solid fill or stroke outside the Admin Shell (one shell fill hit per reports/DOB frame), no text under 12px, no uppercase label, no visible "[COPY PENDING" text, one search bar, no visible "Sending Normally", "Review Due" or "No Guardian To Notify".
- The only check hits: 17 old links to the Enquiry frames, all inside hidden archived layers.
- Screenshots (1000px): `6738:30173`, `6752:30141`, `6649:25952`, `6921:36281`, `7424:70429`. Contrast and dark mode were not checked.
