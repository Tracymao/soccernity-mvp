# Figma gaps I: Match Centre mobile G frames, status text check

Figma file `weZWWqggy9j13eX8bhFgs6`, page `0:1`, 2026-11-24. Figma and docs only. No code, tests, schema, register or Decision Log change. Nothing tagged `[COPY PENDING LEGAL REVIEW]`.

## Result in one line
**No edit was made.** The brief says the Status text in G-1 to G-12 is invisible (navy fill behind navy text). When I read the live frames, all 12 already carry the fix PR H used, so there is nothing to repair. I do not know when or how it got there (not a PR H edit per its report, which says G was not changed); I did not find the cause.

## What I measured (read-only)
Frames: G-1 `7144:70445`, G-2 `7144:70553`, G-3 `7144:70661`, G-4 `7144:70769`, G-5 `7144:70877`, G-6 `7144:70985`, G-7 `7144:71093`, G-8 `7144:71202`, G-9 `7144:71314`, G-10 `7144:71423`, G-11 `7144:71532`, G-12 `7144:71644`.

| Frame | Status frame id | Old fill | New fill |
|---|---|---|---|
| G-1 | `7144:70551` | `brand/green-tint` (`VariableID:5096:5`, opacity 0.12) | unchanged |
| G-2 | `7144:70659` | same | unchanged |
| G-3 | `7144:70767` | same | unchanged |
| G-4 | `7144:70875` | same | unchanged |
| G-5 | `7144:70983` | same | unchanged |
| G-6 | `7144:71091` | same | unchanged |
| G-7 | `7144:71200` | same | unchanged |
| G-8 | `7144:71309` | same | unchanged |
| G-9 | `7144:71421` | same | unchanged |
| G-10 | `7144:71530` | same | unchanged |
| G-11 | `7144:71639` | same | unchanged |
| G-12 | `7144:71751` | same | unchanged |

- Each G frame contains exactly one frame named Status. No "Section title" or "Disclosure" frame exists in any of the 12, so there is nothing else to fix.
- Compared with the matching H frames (H-2 `7149:70874` Status `7149:70944` for error tone, H-3 `7149:70948` Status `7149:71018` for info tone): same fill variable (`5096:5`, opacity 0.12), same padding (16 horizontal, 12 vertical), same corner radius (0). No difference found.

## Contrast
Computed from resolved fills composited over the ancestor fills (WCAG relative luminance), every visible text node outside instances.
- Lowest info-tone text: **4.60:1** (G-1 `7144:70552`). Lowest error-tone text: **10.58:1** (G-3 `7144:70768`). Nothing below 4.5:1. The info figure sits close to the limit; it is secondary text on the 12% green tint, the same pairing PR H uses.

## Standing check (Decision Log #404 item 14)
- Top-level nodes: **1,985 before and 1,985 after** (nothing was written).
- Hash of the ordered top-level ids, djb2 variant (`h = 5381; h = ((h*33) ^ charCode) >>> 0` over the comma-joined ids): **1162120193 before and after**. This is my own routine; it is not comparable with the hashes in the PR G or PR H reports.
- Overlapping top-level frames: 0. Overlapping text boxes in the 12 frames: 0. Text outside its frame: 0.
- Unbound solid paints inside the 12 frames: 0. The Admin Shell `Rectangle 223` is not in these frames and was not audited.
- Reactions: 1 per G frame, 12 in total, all the inherited navbar Avatar overlay; same count before and after.

## Screenshots
`docs/figma-gaps-i-screens/G-1.png` to `G-12.png` (taken at scale 0.4, retaken after my checks; G-2, G-3, G-8, G-11 had an earlier 0.5 pass, the saved G-8 and G-11 are that pass). Looked at by eye:
- **G-2** (match not found): pale green bar, dark text "Match not found." clearly readable.
- **G-3** (could not load match): pale green bar, "Couldn't load this match." readable.
- **G-8** (statistics error): pale green bar with the statistics message readable, and a white "Try again" button below it.
- **G-11** (lineups error): same pattern, "Couldn't load this match's lineups." readable with "Try again".
Also seen in the batch: G-1, G-4, G-5, G-6, G-7, G-9, G-10, G-12 all show readable text on the green tint.

## Not verified
- Why the frames already carry the fix, and whether the brief's "1.0:1" was measured on an older state. The brief's description does not match the live file.
- Only four frames were looked at at larger size; the rest are small screenshots.
- No per-node property snapshot of the whole canvas was taken; the check is the id hash plus counts.
- G-6 `7144:70985` and G-8 `7144:71202` were flagged by PR H as having the dark-bar defect; both are fine now.

## Follow-up for Maintenance
Add a line on Decision Log #561 that the G frames needed no repair (they were already fixed when inspected). Nothing was edited in the register or the Decision Log here.
