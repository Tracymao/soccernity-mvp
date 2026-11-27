# Figma: align the Incorrect-details reports frames to the shipped admin code

Docs and Figma only. No application code changed. File `weZWWqggy9j13eX8bhFgs6`, page `0:1`.
Source of truth: `IncorrectDetailsReportsPage.tsx` and `users.css` (`.us-*`, `.ud-*`, `.ir-*`).

## Where the brief and the shipped code differ (code was followed)

| Item | Brief | Shipped code and Figma now |
|---|---|---|
| Consent "Pending" pill | outline, about 69 wide | soft green, 67 wide |
| Row text | 13px, minor name semi-bold | 14px, minor name Medium |
| Copy tag | not mentioned | "[COPY PENDING LEGAL REVIEW]" removed from the explainer callout and the dialog help line; the code does not render it |

## Frames, before and after

All frames after: content at x302 y129, 1098 wide; title 300x32; "Back to users" 110x32; explainer callout 302,261, 1098x56.

| Frame | Before | After |
|---|---|---|
| 6737:27844 List | content 300,45, 1100 wide; UPPERCASE header 43; rows 60; Resolve 110x32 filled | table 302,337, 1098x248; header 40, rows 52; column lefts 20, 161.7, 323.7, 435.7, 577.4, 784, 876, 988; pills 24 high; Resolve 75x32 outline |
| 6738:27962 Truncated | banner 1100x44; table 286 high | second callout at y337, 40 high; table y397, 1098x248 |
| 6738:28144 Empty | card 1100x100, no header | table 302,337, 1098x136 with header band and empty block (padding 28/20) |
| 6738:28328 Load error | banner with bar and Retry button | `.us-error` 302,337, 1098x60 with "Retry" text link; no table |
| 6738:28510 Already resolved | old table | notice at y337, 40 high; table y397, 196 high |
| 6738:28693 Resolve failed | old table | notice at y337, 40 high; table y397, 248 high |
| 6738:29952 Loading | header 43, skeleton rows | table 302,337, 1098x116: header and "Loading the open reports." |
| 6738:30173 Dialog | 560x246 at 440,240, radius 16, elevation/overlay | 520x223 at 460,481, radius 12, elevation/menu; header 68; close 32x32; Cancel 89x40; Resolve report 140x40 |

## Figma-only layers (kept, not deleted)

- Hidden divider rectangles in the restyled tables.
- Loading: the old header row, skeleton rows and dividers (hidden).
- Loading and Load error banners: the old bar layers (hidden).
- Load error: the old "Actions" Retry button frame (hidden).

## Layers added inside the frames

A table frame in Empty, and a cloned header band in Empty and Loading.

## Not matched

Nothing known. Widths are as Figma rounds them (column lefts within 0.6px of the measured values).

## Standing checks

- Top-level nodes on page `0:1`: 2004 (unchanged).
- Id hash: 2327422288 (matches the baseline).
- Moderation Queue content `5794:8710`: 300,45, 1100x620 (unchanged).
- Overlaps among visible content blocks in the 8 frames: 0.
- Unbound solid fills: one per frame, the inherited Admin Shell `Rectangle 223`. No new ones.
- Text contrast: minimum 4.79:1 on the seven non-dialog frames (computed). The dialog uses navy, secondary navy and white-on-navy tokens on white; it was not computed by the script.
