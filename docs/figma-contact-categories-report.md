# Figma: Contact Us categories (six) and notice first sentence

Branch `design/contact-categories-and-notice`, 2026-10-30. Figma file `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Figma and docs only. No application code, schema, legal text, Build Plan docx, `docs/build-register.md` or `docs/pending-copy-manifest.md` changed.

Founder decision 2026-10-30: the Contact Us categories are six, in this order: **Technical issues, Editorial Complaints, Data, Suggestions, Enquiries, Feedback**. "Livescores Issues" is removed (live scores come from a third-party service) and "Enquiries/Feedback" is split into two options. The notice's first sentence is the exact wording of `docs/legal-copy-draft-tos-privacy-policy.md` v0.11: "Our support team reads the messages sent through this form."

## 1. Dropdown components

| Node | Before | After |
|---|---|---|
| `6130:14653` Contact Category Dropdown — Desktop | 5 rows, 1030 x 330 | 6 rows, 1030 x 396 |
| `6130:14664` Contact Category Dropdown — Mobile | 5 rows, 318 x 165 | 6 rows, 318 x 198 |

Per component: row 3 `Data / Livescores Issues` is now `Data` (`6130:14657`, `6130:14668`); row 5 `Enquiries/Feedback` is now `Enquiries` (`6130:14659`, `6130:14670`); a sixth row `Feedback` (a clone of row 5, so same font, size and fill) and a fifth divider `Line 5` (a clone of `Line 4`) were added; `Background` and the component grew by exactly one row pitch (66 desktop, 33 mobile). Layer names follow the text. Row pitch, text x, divider colour and the rounded background are unchanged.

There were no instances of either component (they are overlay destinations: the chevron triggers on the four Contact Us frames open them with `OPEN_OVERLAY`, which was left as is), so nothing needed keeping in step.

## 2. Every other place a category label or list appears

A text scan of all 26,900 text nodes on page `0:1` for the old and new labels found 71 hits; the ones outside this feature (Sports Hub "Livescores" navigation labels, "Back to Livescores", archived frames) are unrelated and were left alone. Contact-related nodes:

| Frame | Node | Result |
|---|---|---|
| Contact Us Desktop / Mobile, Logged In / Out (`6113:14053`, `6113:14199`, `6115:14611`, `6115:14684`) | field shows only "Choose a category" / "Select Category" | no label to change; the list lives in the component above |
| Form-state frames (validation, submitting, rate limited, server error; `6884:31883`, `6885:31869`, `6885:32076`, `6885:32263`, `6885:32453`, mobile `6886:32370`, `6886:32485`, `6886:32603`, `6886:32703`, `6886:32806`) | field values read "Technical issues" | unchanged (still a valid category) |
| Admin — Contact Enquiries — Tab (list) `6876:30850` | filter field "Category" with helper "Any category from the Contact Us form." (no option list drawn) | unchanged |
| same frame, row category cells | `6876:31229` `Data / Livescores Issues` | now `Data` |
| same frame, row category cells | `6876:31257` `Enquiries/Feedback` | now `Enquiries` |
| Tab (empty) `6876:31297`, Tab (load error) `6876:31513`, Enquiry Detail `6878:31198`, Escalated `6878:31438`, Escalate Dialog `6879:31526` and (restricted) `6879:31599`, Report Detail From Contact Enquiry `6878:31683` | category value "Technical issues" | unchanged |

The sample rows were mapped the way the backend migration maps old keys (`livescores_issues` to `data`, `enquiries_feedback` to `enquiries`), so no sample row shows `Feedback`; it appears only in the dropdown.

After the edits a rescan finds no `Data / Livescores`, `Enquiries/Feedback` or `Soccernity staff read` text anywhere on the page.

## 3. Notice first sentence

Fourteen text nodes named `[COPY PENDING LEGAL REVIEW] Contact Us form notice` (the four Contact Us frames and the ten form-state frames; the success frames carry no notice): `6887:32448`, `6887:32452`, `6887:32456`, `6887:32460`, `6884:32031`, `6885:32022`, `6885:32209`, `6885:32399`, `6885:32589`, `6886:32431`, `6886:32549`, `6886:32649`, `6886:32752`, `6886:32855`.

Only "Soccernity staff read" became "Our support team reads" (inserted and deleted in place, so the three styled segments, the tag chip and the Privacy Policy link style survive: 3 segments before and after on every node). The rest of the sentence, the second sentence and the tags are untouched. Heights: 60 px desktop, 78 px mobile (the frames hug, so nothing was resized); a sibling overlap check found none.

## 4. Checks

- Paints on the two edited components: 0 unbound solid fills or strokes (all new nodes are clones of bound ones). Light mode only, no new colour, nothing deleted. The scan's top-level node count is 1,044 and unchanged by this pass (no node was added at page level).
- Before/after screenshots in `docs/figma-contact-categories-screens/`: dropdown desktop and mobile, Contact Us Desktop Logged In, admin list (after only: Contact Us Mobile Logged In).

## 5. Follow-ups (not fixed)

- `apps/web` `ContactPage` still uses the old category list until the frontend PR for the six categories lands; the admin app's filter likewise.
- The admin list draws only a "Category" field with no option list, so the six options are not drawn there; a drawn open state of that filter would be a separate pass.
- `docs/pending-copy-manifest.md` has no row for the notice (its inventory test covers `apps/web` and `apps/admin` only); the build PR that puts the text in the form should add it. The v0.11 "our support team" wording was decided by the founder, not counsel, and the tags remain.
- Tool calls: no stray calls. Two ToolSearch/skill loads were the required prerequisites. The shared checkout holds another session's uncommitted edits (`backend/w7-contact-categories`), so this work was done in its own worktree.
