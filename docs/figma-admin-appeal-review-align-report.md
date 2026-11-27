# Figma: Appeal Review frame aligned to the shipped admin code (2026-11-27)

Figma and docs only. No application code, CSS, schema or legal text changed. This is the align step only; nothing was restyled.

Frame (page `0:1`): `5796:8753` "Admin — Appeal Review". The variant frames `6672:29059` and `6870:30808` were not touched.

Source of truth: `AppealReviewPage.tsx`, `moderationShared.tsx` (`formatDateTime`, `EscalateReportCard`), `moderation.css`.

## Before and after

Positions are frame-relative.

| Item | Before | After |
| --- | --- | --- |
| Frame | 1440x1234 | 1440x1703, page fill off-white, Admin Shell resized to 1703 |
| Title | "Appeal — Report #1042" in the content column | "Appeal: Report #a1b2c3d4", page-title style, 301,129 |
| Search bar | 302,182 740x44 | unchanged |
| Content node `5796:8828` | 300,45 900x964 | 301,258 1098x1400, gap 20 |
| Back link | 300,45 | "← Moderation Queue" 301,258, 16 high |
| Intro | blue callout, 60 high | note 301,294 1098x32, "different" bold |
| Original decision | card 900x155, four one-line fields | card 301,346 1098x401, seven stacked fields |
| Appeal | card 900x164 with excerpt box | card 301,767 1098x185 |
| Decide | bare label, buttons 40 high | card 301,972 1098x140; buttons 39 high, 209 and 165 wide, gap 12, radius 6 |
| Case-level actions | bare label, buttons and 60-high callout | card 301,1132 1098x191; buttons 221 and 112 wide; alert callout 1058x67, no stroke |
| Escalate | not drawn | card 301,1343 1098x315 |

## Content node box

`5796:8828` changed from 300,45 900x964 to 301,258 1098x1400. The node id is kept.

## Copied from the Report Detail frame `5796:8635`

- Page title
- Back link
- Card shell and card title
- Field rows, and the Severity field with its pill (label set to "Low")
- Note text style (intro note, identity note, overturn note)
- Button styles (outline and primary) and the two-button hold row
- Alert callout
- Escalate card

The two cards that already existed (`5796:8835`, `5796:8849`) keep their ids and names and took the card shell's values. The two decide buttons (`5796:8859`, `5796:8861`) keep their ids and moved into the new "Decide the appeal" card.

## Archived Figma-only layers

Hidden and renamed `ARCHIVED - …`. No original layer was deleted.

- Old back link (`5796:8829`)
- Old in-content title "Appeal — Report #1042" (`5796:8831`)
- Sidebar spacer (`6934:37859`)
- "You are reviewing this…" callout (`5796:8832`)
- Uppercase section labels: "ORIGINAL DECISION (READ-ONLY)", "APPEAL SUBMITTED BY REPORTED USER", "DECIDE THE APPEAL" (`5796:8857`)
- The four old fields in the original-decision card, including the reviewer name and relative time
- The old "Submitted by" field, "Appeal reason" label and excerpt box
- "The outcome of this appeal…" callout (`5796:8863`)
- Old case-level section: label (`6635:22219`), actions (`6635:22220`), callout (`6635:22225`)

## Not drawn

The code renders these only in other states, so the base frame does not show them:

- Active hold status
- "Staff recorded this appeal" note and pill
- The note for a report that concerns a minor
- The vetting-restricted notice
- Action errors and the "Last recorded" escalation line

Nothing in the brief was left unmatched.

## Standing check

- Top-level nodes on `0:1`: 2004.
- Top-level id hash (excluding `7230:71662`): 2327422288.
- Moderation Queue content node `5794:8710`: 300,45 1100x620.
- Overlaps: 0. Unbound solid fills (outside shell and search instances): 0. Callout strokes: 0. Search bars showing: 1.
- Lowest text contrast: 4.80:1.
- Screenshot taken at maxDimension 1000.
