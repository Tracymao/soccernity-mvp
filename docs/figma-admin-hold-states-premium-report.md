# Figma: admin hold states, premium restyle

File `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Figma and docs only; no app code or CSS changed. Source of truth: `holdActions.tsx`, `HoldDialog.tsx`, `AppealReviewPage.tsx`, `moderation.css`. Frame ids and names are unchanged. Blocks were cloned from `7041:60951`, `5796:8753` and `6879:31526`; the sources were not edited.

## Frames

| Frame | State | Height | Title | Blocks, in order | Sample values |
|---|---|---|---|---|---|
| `6870:30620` (pilot) | Report Detail, bad faith hold active | 1637 | Report #1042 | Back link, Hold status, Reported content, Report details, Take action, Escalate | Reason category "Abusive language" |
| `6672:28898` | Report Detail, legal hold active | 1637 | Report #1042 | as above | as above, no end date |
| `6672:29059` | Appeal Review, legal hold active | 1810 | Appeal: Report #1042 | Back link, Hold status, Note, Original decision, Appeal submitted, Decide the appeal, Case-level actions, Escalate | Adaeze M.; Content removed; 3 days ago; Abusive language; old appeal quote |
| `6870:30808` | Appeal Review, bad faith hold active | 1810 | Appeal: Report #1042 | as above | as above |
| `6672:27278` | Bad faith confirm dialog | 1585 | Report #1042 | open report without a Hold status row, scrim, dialog 560x373 | |
| `6672:27349` | Legal hold confirm dialog | 1585 | Report #1042 | as above | |
| `6672:27420` | Lift hold confirm dialog | 1637 | Report #1042 | legal-hold-active page, scrim, dialog 560x373 | |

Dialog copy (title; intro; confirm button). All three share the field "Reason (required)", the placeholder "Enter the reason for this action.", the help line "The reason is saved to the audit record." and "Cancel".

| Frame | Title | Intro | Confirm |
|---|---|---|---|
| `6672:27278` | Reporter acted in bad faith | Report #1042. This holds the reporter’s account in full for 6 months. | Confirm bad faith |
| `6672:27349` | Legal hold | Report #1042. This holds both accounts in full until an admin lifts it. | Place legal hold |
| `6672:27420` | Lift hold | Report #1042. Legal hold. Lifting the hold releases both accounts. | Lift hold |

## Hold status row (code: `HoldStatus`)

Layer "Hold status", built on the pilot and cloned. Horizontal auto layout, 1098x32, gap 12, vertically centred, no fill; 20 below the back link and 20 above the next block.

| Item | Spec | Binding |
|---|---|---|
| "Hold" | 12/16 Medium, sentence case | `Admin/Field label`, `color/text/secondary` |
| Pill | 24 high, full radius, 12 Medium. Legal hold: `Pill/Tone=Strong`, navy with white text. Bad faith: `Pill/Tone=Positive`, soft green tint with navy text | Component (`brand/navy` + `color/text/on-navy`; `brand/green-tint` + `color/text/primary`) |
| "Active since 14 Oct 2026", "Ends 14 Apr 2027" | 13/20; "Ends" only on bad faith | `Web/Body small`, `color/text/secondary` |
| "Lift hold" | 32 high, radius 8, padding 5/12, 13 Medium, 1px stroke, no fill | `Admin/Body small medium`, `brand/navy` |

## Removed "[COPY PENDING LEGAL REVIEW]" tags

The shipped code carries no tag on these strings. The tagged originals are now only on hidden, archived layers. For the founder to review:

| Frames | Text (tag removed) |
|---|---|
| all seven | Reporter acted in bad faith holds the reporter’s account in full for 6 months. Legal hold holds both accounts in full until an admin lifts it. Both ask for confirmation first. |
| `6672:29059`, `6870:30808` | CASE-LEVEL ACTIONS (the shipped heading is "Case-level actions") |
| `6672:27278` | Report #1042. This holds the reporter’s account in full for 6 months. |
| `6672:27349` | Report #1042. This holds both accounts in full until an admin lifts it. |
| `6672:27420` | Report #1042. Legal hold. Lifting the hold releases both accounts. |
| `6672:27278`, `6672:27349`, `6672:27420` | The reason is saved to the audit record. |

## Archived layers (hidden, renamed, not deleted)

| Frame | Layers |
|---|---|
| `6870:30620` | `6870:30622` Content (holds the old title, Hold status and Spacer) |
| `6672:28898` | `6672:28900` Content |
| `6672:29059` | `6672:29061` Content |
| `6870:30808` | `6870:30810` Content |
| `6672:27278` | `6672:27280` Content, `6672:27331` Dialog |
| `6672:27349` | `6672:27351` Content, `6672:27402` Dialog |
| `6672:27420` | `6672:27422` Content, `6672:27473` Dialog (includes the stray "Rejection reason (required)" text) |

Where a frame's Admin Shell showed its own nested search bar, that bar is hidden by an instance override; each frame has one separate search bar. The cloned appeal cards also carry the canonical frame's own hidden "ARCHIVED" layers.

In the cloned dialogs, the "Severity" field, the "This concerns a minor" option and the source's hidden layers were removed from the new copies.

## Assumptions

- The old Report Detail frames have no target id, so the clone's is kept. Their "Author" and "Content preview" rows have no place in the shipped card and were not carried over.
- Description, Severity and Concerns a minor keep the clone's values.
- Appeal cards keep the canonical labels (including "Reviewed by (admin id)", here with the old name as its value), the identity line, Description, Severity, Concerns a minor and the Submitted date.
- Take action is the clone's: Suspend User offered, both case-level hold buttons, helper, note and callout.

## Checks

- Page `0:1`: 2004 top-level nodes; id hash 2327422288 (matches baseline).
- Moderation Queue content `5794:8710`: 300,45 1100x620. `5796:8635` content 301,258 1098x1282; `5796:8753` content 301,258 1098x1455. Unchanged.
- All seven: blocks at x=301, 1098 wide (the back link hugs its text), gaps 20, no overlaps; page buttons 40 high, Lift hold 32; no unbound solid fills outside the Admin Shell; no text under 12px; no uppercase labels; one search bar; frame and shell heights equal last block + 45; no visible "COPY PENDING".
- Dialogs: 560 wide, radius 16, centred, scrim covers the frame.
