# Figma gaps H: Match Centre mobile states, part 2 of 2

Figma file `weZWWqggy9j13eX8bhFgs6`, page `0:1`, 2026-11-24. Figma and docs only. No code, tests, schema, register or Decision Log change. Nothing is tagged `[COPY PENDING LEGAL REVIEW]` (no legal wording).

## Frames (390 px wide, light, y 352000, same shell and donor as PR G, donor not edited)

Names follow "Sports Hub — Match Centre — <Tab> — <State> — Mobile (H-<n>)".

| # | Frame id | State | Text (source: `MatchCentrePage.tsx`) |
|---|---|---|---|
| H-1 | `7149:70802` | Momentum loading | "Loading match momentum…" |
| H-2 | `7149:70874` | Momentum error | "Couldn’t load match momentum." + "Try again" |
| H-3 | `7149:70948` | Momentum empty | "Not enough match event data yet to chart momentum." |
| H-4 | `7149:71020` | Commentary loading | "Loading match events…" |
| H-5 | `7149:71092` | Commentary error | "Couldn’t load this match’s events." + "Try again" |
| H-6 | `7149:71166` | Commentary empty | Heading "Live commentary", the automated-feed disclosure, "No match events yet." |
| H-7 | `7149:71242` | H2H loading | "Loading head-to-head record…" |
| H-8 | `7149:71314` | H2H error | "Couldn’t load this head-to-head record." + "Try again" |
| H-9 | `7149:71388` | H2H empty | "No previous meetings between these two teams yet." |
| H-10 | `7149:71460` | Standings and Top scorers loading | "Loading standings…" and "Loading top scorers…" |
| H-11 | `7149:71534` | Standings and Top scorers error | "Couldn't load standings." and "Couldn't load top scorers." (each + "Try again") |
| H-12 | `7149:71612` | Standings and Top scorers empty | "Standings aren’t available for this league yet." and heading "Top scorers" + "No scorers recorded for this league yet." |
| H-13 | `7149:71688` | Video loading | "Loading video clips…" |
| H-14 | `7149:71760` | Video error | "Couldn’t load video clips for this match." + "Try again" |
| H-15 | `7149:71834` | Video empty | "No video clips for this match yet." |
| Notes | `7149:71906` | Notes frame | explanatory notes |

Screenshots: `docs/figma-gaps-h-screens/` (H-1 to H-15, notes). All 15 frame screenshots were retaken after the final fill fix. Only H-6 and H-11 were looked at by eye.

## Code wins over the brief
- Commentary empty (H-6) draws the heading and the disclosure sentence the code renders above "No match events yet.".
- Standings (H-10 to H-12): the standings block has no heading in code and Top scorers has its own, so each is drawn that way. In H-11 the standings error text is dynamic (`standings.message`, fallback "Couldn't load standings."); the fallback is drawn.
- The no-league-id messages are not drawn (a state the screens cannot reach from a match with a league).
- Straight and curly apostrophes copied as in code.

## Fix made during the pass
The first build left Status, Section title and Disclosure frames with a navy or secondary-text fill behind text bound to the same colour (invisible in H-11, dark bars in H-6). Those 21 frames now use the `brand/green-tint` variable fill, so the text reads. Text fills stay bound to tokens (navy for errors).

## Not drawn
- Ratings and expected-goals sub-sections and the advanced-field gates.
- A retry on the Summary or Momentum empty states (none in code).

## Not edited, but flagged
- The merged PR G frames (G-2, G-5, G-6, G-8, G-9 and others) use the same Status-frame fill pattern and probably have the same dark-bar defect. They were not changed here; G-8 (`7144:71202`) and G-6 (`7144:70985`) were inspected and carry it.

## Standing check (Decision Log #404 item 14)
- Top-level nodes 1,969 to 1,985 (+16). Hash of the original 1,969 ordered ids (comma-joined djb2): 1175102831, unchanged. (A different routine than PR G's report, so the two hashes are not comparable.)
- 0 overlaps with any top-level node; 0 unbound text fills on authored nodes. Nothing deleted, no new colour.
- 15 reactions are found, all the inherited navbar Avatar overlay (same in the donor and G frames). No prototype link was added.

## Not verified
- Only H-6 and H-11 were checked by eye; the others come from the same script.
- Notes frame screenshot was not retaken after the fill fix (it has no Status frames).

## Total
Match Centre mobile state frames across PR G (12) and PR H (15): 27.
