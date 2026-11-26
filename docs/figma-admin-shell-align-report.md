# Figma: Admin Shell aligned to the shipped code, part 1 of 2

File `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Figma and docs only. Values were measured by rendering the shipped CSS in headless Chrome at 1440x1184.

## Changes (Admin Shell set `6014:12948`, all 12 variants)
- Nav group moved up 74px: first row y329 to y255 (rows 44 high, pitch 54). Settings stays at y1091.
- Active marker 4x24 to 4x20, centred on its row (11 variants; the None variant has none).
- Log Out 123x44 at x1177 to 103x44 at x1296, y45. Same style and label.
- Search bar x279 y186 to x302 y182, 740x44. The shell Create button stays at x1073 y186.
- Profile block replaced by the code's version: 56x56 green-tint circle with "KA" at (23,147), name and role at x89. No photo.
- Deleted per variant: photo ellipse, hidden `Frame 5751`, `Group 826`.
- Admin Search Bar `6926:35951`, Idle and Focused placeholder: "Search Soccernity". With text and Submitting unchanged.
- States frame `7204:71662`: marker `7204:71698` 4x24 to 4x20. Behaviour spec `7205:71662` unchanged.

## Verification (numbers)
- Top-level count 2004, id hash 2327422288: match.
- 12 of 12 variants match first nav row, Settings, Log Out, search bar and avatar boxes (tolerance 2px).
- Variant `6014:12941`, before and after: nav subtree (81 nodes) up 74px; Log Out group (3 nodes) +119px in x; search holder subtree (7 nodes) moved, Create unmoved; Settings (6 nodes) unmoved; profile block now 5 nodes.
- Moderation Queue content `5794:8710`: 89 descendants, geometry hash 3566905863 before and after: match.
- Moderation shell instance `6044:14064` follows the listed changes only.
- Unbound solid fills in `6014:12941`: 1, `Rectangle 223` (allowed).
- Contrast: initials 9.36, name 10.11, role 10.11. Lowest 9.36.

## New search bar box (x302 to 1042, y182 to 226): overlaps with frame content
| Frame | Count |
| --- | --- |
| `5794:8635`, `6947:40930`, `6851:29675`, `7051:63458`, `6644:22559`, `1658:2303` | 0 |
| `5796:8635`, `5796:8753` | 1 each |

## Unexpected (reported, not fixed)
- `5796:8635` and `5796:8753` have no shell instance. Each has a standalone Admin Search Bar still at (279,186), so it did not move with the shell. That instance is the 1 overlap counted for each.

## Screenshots viewed (3)
Variant `6014:12941`, Moderation Queue `5794:8635`, Contest overview `6644:22559`: initials circle with name and role, nav starting at the new height with a short active marker, narrower Log Out at the right, search bar reading "Search Soccernity". Nothing clipped or overlapping.

## Not in this PR
- The six frames that still draw the shell Create button (Create Task x4, Add Role, Add Media, Filter; as listed in the brief, which adds up to seven, not recounted here).
- Page title positions on all other frames. Moderation Queue content and tab strip, and the list frames (part 2).

## Not verified
- The contents of `Frame 5751` were not listed before it was deleted.
- The rail's 1px right line (a stroke exists; side and weight not read), logo and wordmark positions (untouched).
- Other variants' node-by-node movement, and frames beyond those named above.
