# Figma: Suspend and Record-appeal frames on Report Detail (premium restyle)

File `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Figma only; no code or CSS changed. Source of truth: `SuspendAccountDialog.tsx`, `RecordAppealDialog.tsx`, `ReportDetailPage.tsx`, `moderationShared.tsx` and `holdActions.tsx` at origin/main `ca960c7`.

All 8 frame ids are unchanged. No top-level frame was added or replaced. Inside each frame, the old layers are hidden, prefixed `ARCHIVED ` and moved below the frame. Nothing was deleted from the existing design.

## Group 1: dialogs

Page content is cloned from `6672:28898` (`7350:69846`), the dialog from `7350:70370`, the scrim from `6672:27401`.

| Frame | State | Height | New Content / title / search | New scrim / dialog | Archived |
|---|---|---|---|---|---|
| `7042:61845` | Suspend confirm | 1585 | `7356:70116` / `7356:70193` / `7356:70194` | `7356:70198` / `7356:70199` | `7042:61847`, `61848`, `61906`, `61907` |
| `7044:62187` | Record appeal | 1808 | `7356:70218` / `7356:70377` / `7356:70378` | `7356:70382` / `7356:70383` | `7044:62189`, `62190`, `62245`, `62246` |
| `7044:62269` | Reason required | 1808 | `7356:70402` / `7356:70561` / `7356:70562` | `7356:70566` / `7356:70567` | `7044:62271`, `62272`, `62327`, `62328` |
| `7044:62352` | Window closed | 1808 | `7356:70587` / `7356:70746` / `7356:70747` | `7356:70751` / `7356:70752` | `7044:62354`, `62355`, `62410`, `62411` |

- Suspend dialog: lead and all five bullets verbatim from the code (report mode, post target); buttons Cancel and "Suspend account" (navy).
- Record appeal: two paragraphs, "Reason (required)", placeholder, audit-record line, Cancel and "Record appeal".
- Invalid: alert border and "Enter a reason for the appeal." (12px Semi Bold, as `.mod-dialog__field-error`; set directly, as no 12 Semi Bold Inter text style was found).
- Window closed: the server message "The time allowed for appealing this report has passed." in an Error callout at the top of the body. The typed reason is kept, and the buttons stay Cancel and "Record appeal".

## Group 2: page states

| Frame | State | Height | New Content / title / search | Archived |
|---|---|---|---|---|
| `7042:61926` | Suspend, vetting required | 1447 | `7356:69866` / `7356:69966` / `7356:69967` | `7042:61928`, `61929`, `61987`, `61988` |
| `7042:61998` | After suspend | 1808 | `7355:69693` / `7355:69852` / `7355:69853` | `7042:62000`, `62001` |
| `7044:62498` | Appeal recorded | 1891 | `7356:69698` / `7356:69861` / `7356:69862` | `7044:62500`, `62501` |
| `7044:62425` | Record appeal, vetting required | 1754 | `7356:69971` / `7356:70111` / `7356:70112` | `7044:62427`, `62428`, `62483`, `62484` |

- Vetting, report open: no dialog; the restricted card replaces "Take action".
- Vetting, report actioned: no dialog; "Case-level actions" is hidden and the restricted card follows "Already reviewed". The "Account suspended" callout stays.
- After suspend: Account pill, Status "Actioned", Action taken "User suspended", suspended callout, "Already reviewed", "Case-level actions" (Record an appeal, both hold buttons, hold callout), Escalate.
- Appeal recorded: adds the "Pending, recorded by staff" pill and "Review its pending appeal ›"; shows the appeal callout instead of the suspended one; no "Record an appeal" button.

## Dropped extras (not rendered by the code)

- Author, Posted and Post text rows (a post report shows only Type and Target id).
- The two-column layout and uppercase section labels.
- The @christine001 name in the dialog leads and callouts.
- The vetting dialogs with a Close button, and the "Appeal window closed" dialog body with a Close button.

## Removed "[COPY PENDING LEGAL REVIEW]" tags (11, all in archived layers)

| String the tag followed | Frames |
|---|---|
| Hold callout, "…Both ask for confirmation first." | all 8 |
| Suspend dialog list, "…the account is reinstated automatically." | `7042:61845` |
| "The reason is saved to the audit record." | `7044:62187`, `7044:62269` |

## Assumptions (sample data)

- Report #1052, a post report; Target id reused from the #1042 sample; reporter "Emeka John"; reason "Harassment or bullying"; description "Insults the player each week."; severity Medium; not concerning a minor.
- Submitted "2 Nov 2026, 09:12"; reviewed "2 Nov 2026, 11:04".
- No active holds, so the hold status row is not drawn.
- Typed reason in the window-closed frame: "The player says the post was quoted from another account."
- Escalate card shown unused.

## For the later Moderation code PR

- `.mod-callout-error` has a 1px navy border and a 6px left bar; Figma follows the brief (no stroke, 3px alert bar).
- `.mod-callout` uses radius 8; the Figma Callout component uses 6.
- The Status row prints the raw value ("open", "actioned"); Figma shows it capitalised.
- `.mod-textarea` has a 1px grey border and surface fill; Figma uses the green-tint input with no resting border.

## Checks

- Top-level count 2004; no frames added.
- Id hash (djb2-xor, ids concatenated, excluding `7230:71662`): 2327422288 (matches baseline).
- `5794:8710` at (300,45) 1100x620; `5796:8635` Content at (301,258) 1098x1282; `5796:8753` Content at (301,258) 1098x1455. All unchanged.
- All 8: 1440 wide, Content at x301 y258 and 1098 wide, 20px block gaps, height = content bottom + 45, one search bar, dialogs centred, no page-level overlaps.
- All 8, visible layers outside the Admin Shell: no text under 12px, no uppercase labels, no copy tags, no unbound solid fills, no stroked callouts, no text under 4.5:1 contrast (computed against ancestor fills; the scrim over the page behind a dialog is not counted).
