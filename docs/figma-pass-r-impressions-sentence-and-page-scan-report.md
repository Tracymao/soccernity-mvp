# Figma: stale impressions sentence reworded, and the first scan of the cover and dump pages

Branch `figma/pass-r-impressions-sentence-and-page-scan`, cut from `origin/main` `59016bc`. Figma file `weZWWqggy9j13eX8bhFgs6`. Figma and docs only: no application code, schema, legal copy, register or docx change.

Context: `docs/figma-pass-r-note-reword-report.md` section 5 (the pass R note still said the old impressions frames "still show impression numbers") and section 5 of `docs/figma-final-week-club-layers-report.md` (the cover page and the dump page were never scanned for contest-tile club layers; Decision Log #514: no one's club appears on a contest tile).

## 1. The sentence

### 1.1 Every text node that repeats it (found before changing anything)

A scan of all TEXT nodes on the three pages (cover `1860:2500`, `0:1`, dump `2155:1285`) for "still show impression numbers" and "impression numbers" found one node:

| Node | Where |
|---|---|
| `I6859:30619;6671:27526` | the `Body` of the shared Note instance `6859:30619`, inside the frame "Notes - Pass R" (`6859:30608`) |

No other note on any page repeats the sentence.

### 1.2 Looked at the frames first

The six old Finalist impressions frames named in the note (`6646:22745`, `6646:23097`, `6646:23419`, `6646:23765`, `6646:23984`, `6646:24345`). I read all their text nodes and looked at the screenshot of `6646:22745` (`before-impressions-frame-6646-22745.png`): every impression figure reads "—", the status pills read "No impressions yet", and a line says counting starts at the reveal. The only numerals on the frames are settings (finalist count 9, tolerance, daily cap and similar), not impression counts. So the frames no longer show impression numbers, which is what pass S (PR #494) did, and the sentence was out of date. (I did not stop and report: the stop condition was "frames still show numbers", and they do not.)

### 1.3 Edit

One clause in `I6859:30619;6671:27526`, done with `insertCharacters` / `deleteCharacters` on that range only, so the single text style is unchanged.

- Old: "Open: these frames still show impression numbers although impressions start counting at the reveal; Pass P's"
- New: "Resolved by pass S (PR #494): these frames no longer show impression numbers, every figure reads '—', because impressions only start counting at the reveal. Pass P's"

Everything before and after that clause, the "SCOPE OPEN" heading and the Note component's styling are untouched. The heading was left as "SCOPE OPEN" (it is the shared component's text and the note still carries one open point, the feed samples).

Layout effect: the text grew from 64 to 80 px high, the note frame `6859:30608` is 480 px high (464 before). Nothing is clipped and nothing overlaps (checked against every top-level node on `0:1`).

## 2. The scan

Method as in `docs/figma-final-week-club-layers-report.md`: every TEXT node on each page, by name starting "Finalist club" or containing "club", plus a look at the children of the finalist-card containers; the pages were switched once per call.

| Page | Result |
|---|---|
| Cover page `1860:2500` | logo and background only; no text node mentions a club or a finalist |
| `0:1` | 0 layers named "Finalist club" (the 66 deleted by PR #786 are gone and none has come back); the 144 finalist-card containers (carousel sets, states, Contest-page modules, the two Community-feed frames) contain only a "Finalist name" text layer, no club text |
| Dump page `2155:1285` | no layer named "Finalist club" and no contest tile; the only club-related nodes are the navbar "clubs" icon instances inside two Home Page Desktop frames |

**Hidden "Finalist club" layers found: 0, so nothing was deleted. Visible club on a contest tile found: 0.**

### 2.1 Clubs seen and not touched (for the record)

- The leaderboard's CLUB column and every Contest-tab leaderboard row that shows a club name (for example `5524:7512`, `5524:7836`, `5556:7426`, `5556:7529`, `5556:7632`, `6659:25987`, `6659:26310`, `6659:26636`). They are table rows, not tiles, and the club is the one the user supports as a fan (Decision Log #523). Not touched.
- The navbar "clubs" icon instances on two Home Page Desktop frames on the dump page. They are the Clubs navigation glyph, not a club on a tile.

## 3. Checks

- Top-level nodes on page `0:1`: 1,864 before and 1,864 after.
- Hash of the ordered top-level ids (the same function as `docs/figma-pass-r-note-reword-report.md`): `1161370306` before and after.
- Edited nodes: 1 (`I6859:30619;6671:27526`). Created: 0. Deleted: 0. No new paint, style or node.
- Screenshots in `docs/figma-pass-r-impressions-sentence-and-page-scan-screens/`: `before-note-6859-30619.png`, `after-note-6859-30619.png` (I viewed both; the new sentence wraps onto the fourth line and ends the paragraph with the founder-decision date, nothing clipped) and `before-impressions-frame-6646-22745.png`.

## 4. Odd findings (reported, not changed)

- The dump page's top-level node count was not stable between reads (28 on one, 67 on another): pages load incrementally. The scan above used the loaded content of the last read; the dump page is scratch content.
- The heading of the pass R note stays "SCOPE OPEN" although its first open point is now marked resolved; it still lists one open point (the feed samples).

## 5. Not verified

- The scan finds layers by name and text. A club badge or crest drawn as an unnamed vector or image on a tile would not be caught; I looked at one carousel tile screenshot (`6841:29676`, 9-finalist Page=1) in the earlier pass, not at every tile again.
- A per-node property snapshot of the whole canvas was not taken; the evidence for "nothing else changed" is the node count, the id hash and the single edit's return value.
- Other stale notes that mention the old 6-finalist feed samples (for example the pass P note) were not re-read in this pass.
