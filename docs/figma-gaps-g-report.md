# Figma gaps G: Match Centre mobile states, part 1 of 2

Figma file `weZWWqggy9j13eX8bhFgs6`, page `0:1`, 2026-11-24. Figma and docs only. No code, tests, schema, register or Decision Log change. Nothing is tagged `[COPY PENDING LEGAL REVIEW]` (no legal wording).

## Frames (390 px wide, light, y 352000, cloned from `5820:8976`, donor not edited)

| # | Frame id | State | Text (source: `MatchCentrePage.tsx`) |
|---|---|---|---|
| G-1 | `7144:70445` | Page loading | "Loading match…" (no header, no tabs) |
| G-2 | `7144:70553` | Page not found | "← Sports Hub" + "Match not found." (error tone) |
| G-3 | `7144:70661` | Page error | "← Sports Hub" + "Couldn't load this match." |
| G-4 | `7144:70769` | Summary loading | "Loading match events…" |
| G-5 | `7144:70877` | Summary error | "Couldn’t load this match’s events." (no retry) |
| G-6 | `7144:70985` | Summary empty | "No goals yet." |
| G-7 | `7144:71093` | Statistics loading | "Loading team statistics…" |
| G-8 | `7144:71202` | Statistics error | "Couldn’t load this match’s statistics." + "Try again" |
| G-9 | `7144:71314` | Statistics empty | "Team statistics aren’t available for this match yet." |
| G-10 | `7144:71423` | Lineups loading | "Loading lineups…" |
| G-11 | `7144:71532` | Lineups error | "Couldn’t load this match’s lineups." + "Try again" |
| G-12 | `7144:71644` | Lineups empty | "Lineups aren’t available for this match yet." |
| Notes | `7145:70802` | Notes frame | seven paragraphs |

Screenshots: `docs/figma-gaps-g-screens/`.

## Code wins over the brief
- The Summary error (G-5) has no retry button in the code, so none is drawn.
- The page error text is dynamic (server message for `SportsApiError`, fallback "Couldn't load this match."). G-3 draws the fallback.
- Page-level strings use straight apostrophes; tab strings use curly ones. Copied as in code.

## Not drawn
- Player ratings and expected-goals sub-section states on Statistics.
- The advanced-field gates rendered after the G-9 empty message.
- Older mobile match frames still say "← Back to Livescores" (not edited).

## Standing check (Decision Log #404 item 14)
- Top-level nodes 1,956 to 1,969 (+13). Hash of the original ordered ids (comma-joined djb2) unchanged: 3931838847.
- 0 overlaps with any top-level node; 0 text outside its frame.
- Unbound solid fills: the 12 Status text fills were found unbound by the final check and bound (secondary text token; navy token for the five error frames). No prototype links added. No new colour.

## Not verified
- Only G-2, G-8 and G-10 were looked at by eye; the others come from the same script.
- Notes frame not individually overlap-checked beyond the whole-page check.
- Post-binding screenshots were not retaken.
