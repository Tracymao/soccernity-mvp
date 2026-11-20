# Figma — Admin Contact enquiries (design only)

Branch `design/admin-contact-enquiries`. Figma file `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Figma and docs only: no application code, schema, legal copy, Build Plan docx, `docs/build-register.md` or `docs/pending-copy-manifest.md` changed. Desktop only (Admin Console), light mode. Screenshots are in `docs/figma-admin-contact-enquiries-screens/`.

Decisions this design follows: Decision Log #440 (Contact Us enquiries kept 12 months from the last message, the founder's own decision, not counsel's) and #444 (an enquiry can be escalated into a report; the report's retention then applies).

## Frames

New band below the canvas, `y 118000`, 1440 × 1184 each (the 1184 floor), `x` step 1640. Nothing existing was edited.

| Frame | Id | x |
|---|---|---|
| Admin — Contact Enquiries — Tab (list) | `6876:30850` | 0 |
| Admin — Contact Enquiries — Tab (empty) | `6876:31297` | 1640 |
| Admin — Contact Enquiries — Tab (load error) | `6876:31513` | 3280 |
| Admin — Enquiry Detail | `6878:31198` | 4920 |
| Admin — Enquiry Detail — Escalated | `6878:31438` | 6560 |
| Admin — Enquiry Detail — Escalate Dialog | `6879:31526` | 8200 |
| Admin — Enquiry Detail — Escalate Dialog (restricted) | `6879:31599` | 9840 |
| Admin — Report Detail — From Contact Enquiry | `6878:31683` | 11480 |
| Notes — Contact enquiries admin | `6880:31755` | 0, y 119384 |

1. **Tab** (three frames). Built from a clone of Held Investigations (`6647:23351`, so the Admin Shell instance, spacer and card/table styling are inherited). The top row reuses the Moderation Queue tab pills (`5794:8713`) with a third tab, "Contact enquiries (3)", active. Filter card: Status and Category Field instances plus an Apply filter Button. List columns Received, Name, Email, Category, Subject, Status (Pill), Source (Signed-in / Guest), Flags ("Escalated" Pill, Outline) and an Open button. Empty state clones the Held empty card. Load error is a Banner (Error tone), no action.
2. **Enquiry Detail** (two frames). Cloned from Report Detail (`6672:28898`). Cards ENQUIRY and MESSAGE, status Pill, actions Reply by email (a mailto link), Mark handled, Escalate to a report. The Escalated frame shows Handled + Escalated pills, a Report row, Reopen instead of Mark handled, and View report #1043 instead of Escalate.
3. **Escalate dialog** (two frames). The shared hold dialog pattern (`6672:27331` plus the scrim). Severity Field (Medium, low/medium/high/critical), a "This concerns a minor" checkbox option (cloned from the Grassroots checkbox), the required reason field (10 to 500 characters is the rule from the hold dialogs; no counter is drawn, as in those dialogs), the existing help line, Cancel and "Escalate to a report". The second frame replaces the form with the existing child-safety restricted notice.
4. **Report Detail from an enquiry.** REPORTED ENQUIRY card (From Contact Us, category, subject, contact name, contact email, message), REPORT DETAILS card, only Dismiss Report and View enquiry #318, no reported-user section, no hold actions.

Components used: Button, Pill, Field, Callout, Banner and Note instances from the F2 set. Local frames only for the table (the F2 Table Row has four cells; this list needs nine, same reason pass J gave), the cards and the dialog shell (cloned).

Prototype links (read back, 12 reactions, all inside this band): list rows 1 and 6 → detail / escalated; D Escalate → dialog; dialog Cancel and X → D; dialog confirm → E; restricted Close and X → D; E View report → H; H View enquiry → E; back links → list.

## Strings

New (untagged unless noted):

- Tab: `Contact enquiries (3)`.
- Filters: `Status`, `New, handled or all.`, `Category`, `Any category from the Contact Us form.`, `Apply filter`, values `All`.
- Columns: `RECEIVED`, `NAME`, `EMAIL`, `CATEGORY`, `SUBJECT`, `STATUS`, `SOURCE`, `FLAGS`, `ACTION`. Pills `New`, `Handled`, `Escalated`, `From Contact Us`, `Open`. Source `Signed-in`, `Guest`. Button `Open`. Categories are the five from the Contact Us dropdown.
- Empty: `No contact enquiries`, `Messages sent through the Contact Us form will appear here.`
- Error: `Couldn’t load the contact enquiries`, `Check the connection and try again.`
- Detail: `← Contact enquiries`, `Enquiry #318`, `ENQUIRY`, `MESSAGE`, keys `Name`, `Email`, `Category`, `Subject`, `Received`, `Source`, `Report`, `ACTIONS`, buttons `Reply by email`, `Mark handled`, `Reopen`, `Escalate to a report`, `View report #1043`, line `Reply by email opens your email app with the sender’s address filled in.`
- Dialog: `Escalate to a report`, `Enquiry #318. This creates a report in the Moderation Queue and links it to this enquiry.`, `Severity`, `Medium`, `Low, medium, high or critical.`, `This concerns a minor`, `Reports marked this way can only be opened by child-safety-vetted admins.`, `Escalate to a report`, `Close`.
- Report detail: `← Moderation Queue`, `Report #1043`, `REPORTED ENQUIRY`, `REPORT DETAILS`, keys `Source`, `Category`, `Subject`, `Contact name`, `Contact email`, `Message`, `Escalated by`, `Reason`, `Severity`, `Concerns a minor`, `Submitted`, `Status`, buttons `Dismiss Report`, `View enquiry #318`, `This report came from a Contact Us enquiry. It has no reported account or content, so there are no account or hold actions.`

Tagged `[COPY PENDING LEGAL REVIEW]` (retention, listed here and on the Notes frame):

- `Enquiries are deleted automatically 12 months after the last message. If you escalate one, the report’s retention applies instead. [COPY PENDING LEGAL REVIEW]` (frame D).
- `Escalated to report #1043. That report’s retention applies instead of the 12-month deletion. [COPY PENDING LEGAL REVIEW]` (frame E).

Reused unchanged: `Reason (required)`, `Enter the reason for this action.`, `The reason is saved to the audit record. [COPY PENDING LEGAL REVIEW]` (already tagged in the hold dialogs), `Cancel`, and the restricted notice `Restricted — child-safety vetting required` plus its body (from `VettingRestrictedNotice` in `apps/admin`).

Judgment call: `Reports marked this way can only be opened by child-safety-vetted admins.` describes how the backend filters reports, so it is not tagged; flag it if you want it tagged.

## Open points (also on the Notes frame)

- The Moderation Queue frame draws only two tabs; Media review and Held investigations exist in code but not on the frame. The tab count (3) is assumed to be new enquiries.
- No reply is sent or stored by the console; nothing promises one.
- Mark handled / Reopen are assumed to toggle one status; Escalated enquiries assumed reopenable.
- Which actions apply to an enquiry-origin report is undefined; only Dismiss Report is drawn.
- The existing Report Detail has an "Escalate" card (child-safety escalation record). The new action is labelled "Escalate to a report" to avoid a clash; final name is a founder call.
- Whether a non-vetted admin sees minor-concerning enquiries in the list is not decided; not drawn.
- Not drawn: load more, search inside the tab, delete.
- No Figma frame existed for the restricted notice; it is a Callout instance with the code text.

## Checks

- Paints: every visible solid fill and stroke on the eight frames is variable-bound except the inherited Admin Shell `Rectangle 223` (sidebar wash, a literal by design, Decision Log #199). Notes frame 0 unbound. 0 `brand/green-tint-28`, no new colour.
- Overlaps: none against the 1023 existing top-level nodes or among the new ones.
- Standing check (Decision Log #404 item 14): top-level nodes 1023 → 1032 (eight frames + the notes frame); hash of the 1023 pre-existing ids is `3096112924` (taken after the pass, over the ids that are not mine; a before-hash was not taken).
- Nothing deleted or archived. Cloned hidden ARCHIVED frames inside the dialog frames were kept hidden; their stale prototype links were cleared (only on the clones).

## Disclosures

- A first dialog link was set on the wrong node (the frame also holds a copy of D's button under the scrim); found by a reaction scan, fixed.
- A first list column layout wrapped dates and clipped the Open button; fixed (gap 12, widths, cells hug) and re-checked by screenshot.
- Default white fills on my own auto-layout helper frames were cleared (31 nodes).
- A first read call exceeded the return-size limit and committed nothing.
- Follow-ups, not done: `apps/admin` build (no endpoint or model exists for contact enquiries); copy review of the two retention sentences; Figma frames for the Contact Us form itself are unchanged.
