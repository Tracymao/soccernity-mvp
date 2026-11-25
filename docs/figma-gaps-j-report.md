# Figma gaps J report (2026-11-24)

Figma and docs only. File `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Branch `design/figma-gaps-j` from `origin/main` `eed643e`. No code, tests, schema or register changed.

## Part 1: Back to home on the four approved 404 frames

NAVIGATE reactions, read back from fresh handles:

| Frame | Button | Destination |
|---|---|---|
| F-1 `7141:70207` desktop, logged in | `7141:70323` | `1306:354` (Community desktop) |
| F-2 `7141:70548` mobile, logged in | `7141:70575` | `5701:8239` (Community mobile) |
| F-3 `7141:70383` desktop, logged out | `7141:70488` | `5204:6728` (Home desktop) |
| F-4 `7141:70635` mobile, logged out | `7141:70653` | `5543:7407` (Home mobile) |

The navbars have no home link, so the brief's fallback ids were used (all four verified as top-level frames). Notes `7142:70445`: texts `7142:70447` and `7142:70450` updated. `7142:70451` was left untouched and is now stale about the old frames.

## Part 2: four older not-found frames redrawn

New Content blocks cloned from F-1/F-2: `7161:71301`, `7161:71311`, `7161:71321`, `7161:71331`, with the same links. Old nodes hidden and renamed "ARCHIVED — old not-found column": `6738:30523`, `7015:58746`, `6738:30551`, `7015:58740`. Nothing deleted. Frames are now 1440x693 (desktop) and 390x513 (mobile). `6738:30391` moved from y 75400 to y 76000 so it does not overlap note `6738:30554`. Footer finding: AppShell has no footer, so none was added.

## Part 3: Statistics tab state frames (mobile, 390, light), y 352000

Clones of donor `5822:9075` (unedited). Reactions cleared. Box score, team toggle and band removed; the loaded stats list kept (no shortening). Strings come from `MatchCentrePage.tsx` and `FieldAvailabilityGate.tsx`.

| Frame | Id | Height | State and string (code source) |
|---|---|---|---|
| J-1 | `7162:71297` | 1237 | "Loading player ratings and expected goals…" (line 329) |
| J-2 | `7162:71675` | 1279 | "Couldn’t load player ratings and expected goals." plus "Try again" (lines 334, 152-156) |
| J-3 | `7162:72055` | 1382 | Gated "Player box score · RATING" and "Expected goals (xG)", each "No data for this match yet" (FieldAvailabilityGate) |
| J-4 | `7162:72437` | 1521 | Ratings per team, xG row, notes (lines 378, 398) |
| Notes | `7163:71429` | | "Notes — Match Centre Statistics states (J)" |

J-4 was required: the donors show no loaded ratings or xG. Player names, positions, ratings and xG values are illustrative (Liverpool 1–3 Chelsea), not read from the donor. Pressure index and shot map are not drawn: the code renders nothing when the provider does not supply them. The code's gate has opacity 0.85; Figma keeps 1.

## Standing check

- Top-level nodes: 1,985 before, 1,990 after (4 J frames + Notes).
- Hash of the 1,985 original ordered ids (xor-33 over the comma-joined ids): `1162120193`, unchanged.
- Overlaps of new frames with any top-level node: 0. Unbound visible solid fills in new frames: 0.
- Contrast (visible text outside instances, bound-variable colours composited): minimum 4.6:1, from "Ball Possession" in the donor stats list; Notes frame 12.58:1. The new info and error text uses navy on green-tint and secondary text on surface (not separately itemised).

## Not verified

- Screenshots saved: J-3 and J-4 only (`docs/figma-gaps-j-screens/`, 1024 px tall, over the 500 px limit, not downsized). J-1, J-2 and the 8 frames of Parts 1 and 2 were not saved as images.
- J-1 and J-2 layouts were not visually inspected; J-3 and J-4 were captured but not read closely.
- Strings were taken from the code as read earlier; not re-compared character by character.
- No per-node property snapshot of the whole canvas.
