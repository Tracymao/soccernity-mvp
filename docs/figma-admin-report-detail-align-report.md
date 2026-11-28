# Figma: Report Detail frames aligned to the shipped admin code (2026-11-27)

Figma and docs only. No application code, CSS, schema or legal text changed. This is the align step only; nothing was restyled.

Frames (page `0:1`):

- `5796:8635` "Report Detail & Action" (base state)
- `6947:41119` "Report Detail — reason category (B-284)"
- `6947:41276` "Report Detail — older report, not categorised (B-284)"

Source of truth: `ReportDetailPage.tsx`, `moderationShared.tsx` (`EscalateReportCard`), `holdActions.tsx`, `moderation.css`. The other Report Detail variant frames (targets, suspend, appeal, hold, Banter room) were not touched.

## Before and after

Positions are frame-relative. The three frames now share the same structure.

| Item | Before | After (all three) |
| --- | --- | --- |
| Frame | 1440x1184 | 1440x1534, page fill off-white, Admin Shell resized to 1534 |
| Title | "Report #1042" in the content column | "Report #a1b2c3d4", page-title style, 301,129 |
| Search bar | 279,186 on the two B-284 frames | 302,182 740x44, one per frame |
| Content node | 300,45 900x652 | 301,258 1098x1231, gap 20 |
| Back link | 300,45 | "← Moderation Queue" 301,258, 16 high |
| Reported content | left column, uppercase title | card 301,294 1098x157 |
| Report details | right column, uppercase title | card 301,471 1098x401 |
| Take action | bare label, buttons 40 high | card 301,892 1098x262; buttons 39 high (154, 113, 137, 144, 221, 110), gap 12, radius 6 |
| Hold callout | two callouts, 60 high | one alert callout 321,1067 1058x67, no stroke |
| Escalate | not drawn | card 301,1174 1098x315; textarea 1058x90; button 163x39 |

Per-frame values:

| Frame | Reason category | Description |
| --- | --- | --- |
| `5796:8635` | Harassment or bullying | Abusive language |
| `6947:41119` | Harassment or bullying | Insults the player each week. |
| `6947:41276` | Not categorised | Abusive language |

The older report keeps its Description row because the frame already had reporter text. The code omits the row only when the text is empty.

## Archived Figma-only items

Layers are hidden and renamed `ARCHIVED - …`. No original layer was deleted.

- "Author" row
- Content preview
- Relative time ("2 hours ago")
- Two-column layout (`Two Column`: `5796:8714`, `6947:41127`, `6947:41284`)
- In-content title ("Report #1042") and the sidebar spacer
- Old "TAKE ACTION" label and action row
- Old callouts, including "Callout — Case-level actions"
- Uppercase card titles

The seven copies of the base frame's archived layers that came across when its cards were duplicated into `6947:41119` were removed from the new copies, before `6947:41276` was built from them.

## Added to match the code

- Escalate card, with its intro note, "Escalation notes" field, textarea, checkbox and "Record escalation" button
- The two hold buttons in the action row
- "Target id" field with the full uuid

## Content node box

`5796:8710` changed from 300,45 900x652 to 301,258 1098x1231. `6947:41122` and `6947:41279` now have the same box. Node ids are kept.

## Differences from the code or the brief

- **Pre-agreed:** Status reads "Open". The code renders lowercase "open"; the code change comes in the M1 code PR.
- The Escalate card is 315 high because it carries the code's full intro note.
- The base frame's hold callout instance had a 1px stroke the code does not draw. The stroke is removed on that instance, and the copies in the other two frames have none. The Callout component itself was not edited.

## Standing check

- Top-level nodes on `0:1`: 2004 (unchanged).
- Top-level id hash (excluding `7230:71662`): 2327422288 (unchanged).
- Moderation Queue content node `5794:8710`: 300,45 1100x620 (unchanged).
- Overlaps: 0. New unbound solid fills: 0. Callout strokes: 0.
- Lowest text contrast: 5.01:1.
- Screenshots taken of all three frames.
