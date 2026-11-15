# Figma: pass R note reworded after the club layers were deleted

Branch `figma/pass-r-note-reword`, cut from `origin/main` `4f3338d`. Figma file `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Figma and docs only: no application code, schema, legal copy, register or docx change.

Context: `docs/figma-final-week-club-layers-report.md` section 4. After PR #786 deleted the hidden "Finalist club" layers, the pass R note still listed "hidden club layers" as an open point of pass P. Founder decision 2026-11-15: reword it.

## 1. Notes found before changing anything

A scan of all 40,235 TEXT nodes on page `0:1` for "hidden club", "club layer", "club line" and "Finalist club":

| Node | Text node | Status |
|---|---|---|
| `I6859:30619;6671:27526` (the `Body` of the shared Note instance `6859:30619`, inside the frame "Notes - Pass R", `6859:30608`) | the pass R note | **stale, reworded** |
| `6843:29798` (Pass P note frame `6843:29797`) | already says the layers were deleted (edited by the club-layers PR) | correct, not touched |

No other note repeats the phrase. The note id still resolved.

## 2. What was changed

One text node, `I6859:30619;6671:27526`, one clause only (done with `insertCharacters` / `deleteCharacters` on that range, so the single Inter Regular 13 px style is unchanged: one styled segment before and after).

- Old: "Pass P's other open points (feed samples keep six finalists, hidden club layers) are not changed here."
- New: "Pass P's other open point (feed samples keep six finalists) is not changed here. The hidden club layers it also listed were deleted later: contest tiles never show a club (founder decision 2026-11-14)."

Everything before that clause, the "SCOPE OPEN" heading and the Note component's styling are untouched. The note frame stays 958 x 112; the text still fits in four lines (text height 64 before and after) and nothing is clipped.

Not touched: the leaderboard CLUB column (it shows the club a user supports as a fan, which the contest-tile decision does not affect), `6843:29798`, every other node.

## 3. What I looked at

Screenshots in `docs/figma-pass-r-note-reword-screens/`: `before-note-6859-30619.png` and `after-note-6859-30619.png`. I viewed both. After: the heading and the first part of the note are identical, the new sentence wraps onto the fourth line and ends with the founder-decision date.

## 4. Checks

- Top-level nodes on page `0:1`: 1,864 before and 1,864 after.
- Hash of the ordered top-level ids (djb2-style, my own implementation, so it is not comparable with the `3392401638` in the club-layers report): `1161370306` before and after.
- Edited nodes: 1 (`I6859:30619;6671:27526`). Created: 0. Deleted: 0. No new paint, style or node.
- A per-node property snapshot of the whole canvas was not taken; the evidence is the count, the id hash and the single edit's return value.

## 5. Not verified / left open

- The same note still says "Open: these frames still show impression numbers although impressions start counting at the reveal". Pass S (PR #494) already changed those frames to show no figures, so that sentence is also out of date. It is outside this brief (club layers only) and was not changed.
- The cover page and the dump page were not scanned.
