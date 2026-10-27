# Figma pass O — B-092 / B-093 front-end states

Date: 2026-10-27. Figma file `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Figma and docs only: no application code, schema, legal copy, DPIA or Decision Log `.docx` changed. Nothing archived, nothing deleted. `docs/build-register.md` was not edited (the rows are very long single lines and other open PRs touch it); the frame ids below are the record. Screenshots: `docs/figma-pass-o-screens/before/` (existing frames that cover an item) and `docs/figma-pass-o-screens/after/` (every new frame).

Method: each of the four items was checked against the live canvas first (frame screenshots plus node reads), and only what was missing was drawn. Sources read: `docs/contest-spec.md` (sections 4a, 9b, 10, 10b, 14e-14g), Decision Log #383, #388, #400, #402-#405.

## 1. Counts

| Check | Before | After |
|---|---|---|
| Top-level nodes on `0:1` | 934 | 948 (14 new: 10 frames, 4 note frames) |
| Hash of the 934 original top-level ids (djb2 over ids joined by commas, in order) | 1697076073 | 1697076073 (unchanged; original ids still first and in order) |
| All nodes on `0:1` (`findAll`) | 144,686 | 145,904 (+1,218, all in the new frames) |
| Nodes archived or deleted | n/a | 0 |
| Overlaps of new frames with other top-level nodes | n/a | 0 |
| Unbound solid fills or strokes on the five carousel clones and the desktop entry frame | n/a | 0 (own white wrapper fills cleared) |

The hash algorithm is this pass's own (earlier passes used a different one, so the figures are not comparable to theirs); it was run before and after in the same way.

Existing frames touched: only the two Community-feed Final week frames `6661:26929` and `6661:29200` (six tile links added, no visual change). Nothing else existing was edited.

Unbound paints that remain on new frames, all inherited from donor frames and not editable from an instance: 1 on the Settings Locked frame (`Rectangle 223`, the Admin Shell sidebar wash, a literal paint by design, Decision Log #199); 3 per leaderboard frame from the `tab/*` instances (white); on the mobile leaderboard 10 more white `cell/score` fills, which also draw a small white patch behind the points of the highlighted "You" row (7), a defect already present in the donor frame `5540:7264`, not fixed here. The mobile "Load more" button is also slightly clipped at the right edge, again inherited from `5540:7264`.

## 2. Item by item

### (1) Pinned final entry on the finalist's own profile, locked engagement (#400 E10, #404 item 15)

Already covered, nothing redrawn. Screenshots in `before/`.

| State | Desktop | Mobile |
|---|---|---|
| Before the reveal: Contest post label, "Pinned", video, buttons disabled, counts hidden, "Engagement is locked until the reveal. Only you can see this entry until then." | `6707:26727` | `6709:26922` |
| After the reveal: same card, engagement unlocked (8 / 31 / 4) | `6707:26938` | `6709:27056` |

Added for the next step of that journey, which had no frame: the entry itself as it opens from a carousel tile (see item 3). The pin removal at the end of the contest month is a state change (the entry becomes an ordinary feed post, #405 item 1), not a separate screen; nothing drawn.

### (2) Admin impression-distribution view (B-095, #388)

Existing coverage (pass C, `docs/w0-figma-pass-c-report.md`): list `6646:22745` (9 finalists, one outside tolerance), fewer than 9 `6646:23097`, before reveal `6646:23419`, no finalists `6646:23765`, settings validation `6646:23984`, load error `6646:24345`, notes `6650:25201`-`6650:25214`. They show per-finalist impression counts, the distribution bars, "vs mean" and the tolerance band, and no per-user data.

Gap found: #402 and contest-spec 4a say tolerance and the per-viewer daily cap lock when week 4 starts (day 22). The impression view exists only from week 4, yet every existing frame shows the two settings as editable with "Save settings". New frame:

| New frame | Id |
|---|---|
| Admin — Contest — Finalist Impressions — Settings Locked (week 4 started, #402) | `6838:29547` (1440 x 1228, Admin Shell `Active = Contest`) |

Clone of `6646:22745`: card title "Distribution settings · locked", a banner in the locked card, both inputs drawn read-only (`brand/off-white` fill), "Save settings" removed, and one line under the table stating how an impression is counted (#405 item 7: at least half of the tile in view for at least one second). Note `6838:30458`.

### (3) Community-feed "Final week" carousel (component sets `6697:26234` / `6697:27448`)

Confirmed on the existing sets: Page 1 and Page 2 variants, header, "Every finalist is shown to everyone equally." copy, previous and next arrows (each wired ON_CLICK to the other page, read back), dots, "Showing 1–3 of 6 finalists" footer, 6 finalists in 2 pages. The dead "View on the Contest page" link is archived and hidden. The sets were not edited.

Missing, drawn (plain frames cloned from the variants, so bindings are inherited):

| State | Desktop | Mobile |
|---|---|---|
| Tile hover / keyboard focus (desktop) and press (mobile): navy 2 px outline, play disc, underlined name | `6836:29561` | `6838:29460` |
| Single page, 3 finalists or fewer: arrows at 40%, no dots, "Showing 1–2 of 2 finalists" | `6836:29600` | `6838:29502` |
| Last page of 5 finalists: next arrow disabled, second dot active, "Showing 4–5 of 5 finalists" | `6836:29637` | not drawn (the mobile pager behaves the same; see the single-page frame) |

Tiles open the entry itself: that destination did not exist, so it was drawn.

| New frame | Id |
|---|---|
| Community — Final Entry — Opened from the Final week carousel — Desktop | `6836:29397` (1440 x 1000) |
| Community — Final Entry — Opened from the Final week carousel — Mobile | `6836:29312` (390 x 710) |

Built from existing pieces: the header-4 Navbar and the pinned-entry card (author with the Contest post label, video, unlocked engagement) from the pass H profile frames, plus the Post View back bar, comments and composer from `5779:8490`. Six tile links were set as per-instance ON_CLICK / NAVIGATE overrides and read back from fresh handles: `I6661:29097;6661:26764`, `...26769`, `...26774` in `6661:26929` to `6836:29397`; `I6661:29294;6661:26847`, `...26853`, `...26859` in `6661:29200` to `6836:29312`.

### (4) Leaderboard Contest tab and Contest page: fractional (quarter) points, rounded display only (contest-spec 9b)

Checked, not redrawn, for the Contest tab and the Contest page:

- The 0.25 rule applies to baseline leaderboard points only and never to contest tallies (9b). Contest tab scores (for example 512, 498, 471), the Crowned and Week 4 frames, placement points (+500 / +300 / +150 on Between Weeks), the Voting page counts and Entries ranking are whole numbers by rule.
- A text scan of the 49 other visible frames whose name starts with Leaderboard or Contest found no decimal-point figure.

The one place where a fraction can reach the screen is the Overall board (baseline points, stored in quarter units). It had no state showing the rounded display next to exact ranking, so that was drawn:

| New frame | Id |
|---|---|
| Leaderboard — Overall — Rounded points, exact ranking (#383) — Desktop | `6838:29800` (1440 x 1526; the annotations block was left out of the clone) |
| Leaderboard — Overall — Rounded points, exact ranking (#383) — Mobile | `6838:30234` (390 x 1877) |

Ranks 5 and 6 both show 3,318, with a one-line note under the table. Note `6838:30464`.

## 3. Every new string

Functional or sample copy; per Decision Log #412 item 5 none of it makes a legal or safety promise, so nothing is tagged `[COPY PENDING LEGAL REVIEW]`. (The existing tagged transparency sentence in the carousel was inherited unchanged.) The one sentence a reviewer may want to veto is "no per-viewer data is shown": it describes what the admin screen shows, not a promise to users.

Admin locked frame (`6838:29547`): "Distribution settings · locked"; "Locked since 08:00 on day 22. Tolerance and the per-viewer daily cap are week-4 settings and cannot be changed once week 4 starts."; "How impressions are counted: a finalist tile counts as one impression when at least half of it is in view for at least one second. Figures are totals per finalist video; no per-viewer data is shown."

Carousel states: "Showing 1–2 of 2 finalists"; "Showing 4–5 of 5 finalists".

Final entry frames (illustrative sample content): "SB"; "Sarah Bello"; "@sarah_bello · 1d"; "My final-week entry: first-touch passing drill from Saturday’s session at Yaba."; "Comments · 8"; "Clean first touch. Saving this drill for Tuesday’s session."; "Love it. Which cones did you use?". (The back-bar title "Post", the "Contest post" label, the counts and the composer text are reused.)

Leaderboard frames: "Points are shown rounded to the nearest whole number. Ranking uses the exact total, so players who show the same points can hold different ranks (ranks 5 and 6 here)."

Note frames (canvas documentation, not shipped UI): `6838:30458`, `6838:30460`, `6838:30462`, `6838:30464`.

## 4. Open points (written on the canvas as SCOPE OPEN, none resolved by guessing)

- Impression threshold detail: whether the one second must be continuous and whether re-entry counts again (#405 item 7 does not say).
- Page-2 carousel tiles are not linked: a variant swap drops instance overrides, and Figma does not allow NAVIGATE on component descendants.
- Entry page: where Back returns to (feed or carousel); whether the author name opens the profile; the comment sample is illustrative.
- 7-day change column when the net change is a fraction (for example +0.25 shows as +0).
- The impression view's setup-state frames (`6646:22745` and siblings) still show editable settings; they are now the pre-week-4 state and were not retitled.
- Inherited defects listed in section 1 (white patch behind the "You" points on mobile, clipped "Load more") belong to the donor frame and were left.
- Real implementation of the view and ledger is B-092 / B-093 (backend, not built).
