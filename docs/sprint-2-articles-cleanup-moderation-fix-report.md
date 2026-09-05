# sprint-2/articles-cleanup-moderation-fix — report

**Figma file:** `weZWWqggy9j13eX8bhFgs6` ("Soccernity-MVP"), page **Soccernity** `0:1`.
**Scope:** three Articles/Blog-section findings (Decision Log #195, #196, #198) plus one real,
confirmed layout bug on Admin — Moderation Queue (Decision Log #200).
**Date:** 2026-09-05. Figma design only; no app/backend code. No shell this session — the
finalising session handles branch / commit / docx / CLAUDE.md / PR, per this project's established
pattern.

**Background read before starting**: `docs/sprint-2-admin-panel-fast-follow-report.md` (in full — it
documents the exact `Content`-overlaps-shared-top-bar root cause this session fixes, under the old
pre-height-growth coordinates). `docs/sprint-2-articles-page-split-and-navbar-report.md` does **not
exist** in this repo's `docs/` folder — that PR's full detail lives only in `CLAUDE.md`'s own
`sprint-2/articles-page-split-and-navbar` status bullet (that session had no Bash tool and committed
directly without a separate report file); that bullet was read and used as the background source
instead.

---

## ITEM 1 — Section banner coverage (Decision Log #195) — NO ACTION TAKEN, premise did not hold up live

### Live numbers, verified before touching anything

| Node | x | width | right edge (x + w) |
|---|---|---|---|
| Banner `5942:12065` ("Rectangle 352") | `-43553` | `12093` | **`-31460`** |
| Blog — Article Detail Desktop — Logged In `5997:10905` | `-37407` | `1440` | `-35967` |
| Blog — Article Detail Desktop — Logged Out `5997:11224` | `-35767` | `1440` | `-34327` |
| Blog — Article Detail Mobile — Logged In `6000:11346` | `-34127` | `390` | `-33737` |
| Blog — Article Detail Mobile — Logged Out `6000:11377` | `-33537` | `390` | **`-33147`** (rightmost of the 4) |

The banner's right edge (`-31460`) is already **to the right of** (i.e. numerically greater than) the
rightmost Article Detail frame's right edge (`-33147`) — a margin of **1,687px** to spare, not a
5,620px shortfall. The banner's left edge (`-43553`) similarly sits **1,686px** to the left of the row's
own leftmost frame (Blog Page Desktop — Logged In, `5953:10771`, `x=-41867`). Both margins are within
1px of each other (1686 vs 1687, rounding), confirming the banner is already sized as one symmetric
strip around the *entire* Blog + Articles section (both Desktop/Mobile Blog Page frames and all 4
Article Detail frames), not just the original Blog Page pair.

**Conclusion: the banner already fully covers all 4 Article Detail frames. No resize was performed.**
The brief's estimate (frames starting at `x=-31340`, extending past the banner) does not match the
live file — the frames actually start at `x=-37407` through `x=-33537`, well inside the banner's
existing span. This may already have been corrected as part of whatever commit produced the current
frame positions (no report file exists to confirm when), or the original DL #195 finding may have been
measured before the frames were placed in their final position. Either way, live state today needs no
change.

**Recommendation for the finalising session**: close Decision Log #195 as "verified already covered,
no code change needed" rather than transcribing a resize that was never performed.

---

## ITEM 2 — Live legacy text nav sweep (Decision Log #196)

### 2.1 The two named frames — nothing to hide, "Group 7" does not exist there

Searched both `5997:10905` and `5997:11224` two ways, at full subtree depth: by exact node name
(`name === 'Group 7'`) and by text content (`characters` matching `'Home'`, `'Community'`,
`'Livescores'`, `'About Us'`). **Zero matches on both frames, both methods.** The frames' full
73/74-node text inventories were also reviewed directly — no hand-built nav row of any kind survives;
each frame carries exactly one navbar instance (`Navbar — header 4` on Logged In, `Navbar — header 7`
on Logged Out) and nothing else resembling primary navigation.

This matches — rather than contradicts once reconciled — `CLAUDE.md`'s own
`sprint-2/articles-page-split-and-navbar` bullet, which records that session's own "Legacy chrome
removed (not hidden)" step already stripped `Group 7` (plus its own logo lockup) out of the *new*
Article Detail frames when they were built from the archived `54:434`/`87:80` originals. The current
task's premise — that `Group 7` is "still genuinely live-rendering" on these two frames — does not
match the live file; it was already removed, not merely hidden, before this session started.
**No `visible` flag was touched on these two frames — there was nothing to set it on.**

Screenshots of both frames (§ITEM 3 below) independently confirm this visually: a single clean navbar
at the top, no second nav row of any kind.

### 2.2 File-wide sweep — three real, confirmed findings

Ran a genuinely file-wide scan: `page.findAllWithCriteria({ types: ['TEXT'] })` returned **14,419**
text nodes on page `0:1`; every one was checked against the distinctive legacy-nav vocabulary
`'Livescores'` / `'About Us'` (chosen because these two words appear nowhere else in the file as real
content, unlike `'Home'`/`'Community'`, which are common enough to produce noise). Separately ran
`findAllWithCriteria({ types: ['GROUP','FRAME'] })` filtered to `name === 'Group 7'` across the whole
page, to catch the pattern by its literal template name too.

**Both searches converge on the same, complete, closed set.** There are exactly 4 real (non-instance)
nodes named `Group 7` on the whole page, and exactly 4 real occurrences of `'Livescores'`/`'About Us'`
text — one archived (hidden) pair, three live:

| Frame | Frame node ID | `Group 7` node ID | Visible? | Contents |
|---|---|---|---|---|
| ARCHIVED — Articles Page Desktop | `54:434` | `54:438` | Frame hidden (`visible:false`) — **not live, no action needed** | Home / Community / Livescores / About Us |
| **Contact Us Desktop** | **`87:158`** | **`87:160`** | **LIVE (`visible:true`)** | Home (`87:161`) / Community (`87:162`) / Livescores (`87:163`) / About Us (`87:164`) |
| **Terms of Service Desktop** | **`102:340`** | **`102:342`** | **LIVE (`visible:true`)** | Home (`102:343`) / Community (`102:344`) / Livescores (`102:345`) / About Us (`102:346`) |
| **Privacy Policy Desktop** | **`104:444`** | **`104:446`** | **LIVE (`visible:true`)** | Home (`104:447`) / Community (`104:448`) / Livescores (`104:449`) / About Us (`104:450`) |

All three live findings are **byte-identical in structure and content** to the exact `Group 7` nav the
Articles/Blog pages carried before their own navbar retrofit — same 4 links, same relative geometry
(432×25 group, ~86–98px-wide text runs) — and each frame also carries its own old-style logo lockup
group (`Group 103`: `359:411` on Contact Us, `359:421` on Terms of Service, `359:431` on Privacy
Policy) alongside it, the same pairing the Articles/Blog originals had before their navbars were
retrofitted. **None of these 3 frames has ever been touched by any navbar-retrofit pass** — they are
not mentioned in any prior report or CLAUDE.md bullet.

**Per the brief, this is find-and-report only — nothing on these 3 frames was hidden, deleted, or
otherwise changed in this session.**

### 2.3 Adjacent finding, different category, also reported

The mobile counterparts of the three pages above — **Contact Us Mobile** (`96:253`), **Terms of
Service mobile** (`104:393`), **Privacy Policy mobile** (`104:474`) — do **not** carry a `Group 7` text
nav. Instead each has a `bx:menu` hamburger icon frame (`96:255` / `104:395` / `104:476`) plus its own
logo lockup (`Group 102`, e.g. `359:513` on Contact Us Mobile). This is legacy pre-redesign chrome too
(not the canonical `header 7 — mobile` / `header 4 — mobile` navbar component), but it is an **icon**,
not "a manually-built row of text links" — a different category than what Decision Log #196 literally
names. Reported for completeness, not fixed, and not counted as a #196 hit.

### 2.4 Ruled out, not a nav

- **The Sports mobile frames** `Sports / Livescores — Logged Out — Mobile` (`5647:8023`) and `— Logged
  In — Mobile` (`5647:8169`) each contain one `'Livescores'` text node, but it sits inside a `Content`
  frame as a page heading ("Sports / Livescores"), not a nav-link row — confirmed by inspecting its
  siblings (no `'Home'`/`'Community'`/`'About Us'` nearby, no cluster of short nav-style text runs).
  Not a hit.
- **The other 15 `Group 7`-named nodes found file-wide** are all instance-internal paths (IDs of the
  form `I<instanceId>;<nodeId>`) inside unrelated components — email templates (`Success email -
  password change requested`, `Success email - account created`, etc.) and Bants pages (`Bants homepage
  - All feed`, `Bants - create topic`, etc.). None contain `'Livescores'`/`'About Us'` text or any
  nav-like content; this is a coincidental, unrelated internal grouping name (most likely the
  `simple-line-icons:paper-clip` icon's own internal path grouping, confirmed present in the same
  templates) — not navigation. Ruled out, not reported as findings.

---

## ITEM 3 — Desktop top whitespace (Decision Log #198)

### 3.1 Reference measurement — Blog Page Desktop's actual gap, verified live

`Blog Page Desktop — Logged In` (`5953:10771`): navbar instance (`Navbar — header 4`, `5953:11272`)
spans absolute `y = -30794` to `-30704` (height 90). The frame's first real content child, `Group 36`
(`5953:10781`), starts at absolute `y = -30623`. Gap = `-30623 - (-30704) = 81`.

**The assumed 81px convention is exactly correct, confirmed live — no different number was found.**

### 3.2 Before state on the 2 Article Detail Desktop frames

Both frames' topmost real content (the article headline text, e.g. `5997:10914` "Zaha double helps
Crystal Palace...") sat at frame-relative `y = 311` (absolute `-30483`), against a navbar bottom of
frame-relative `y = 90` (absolute `-30704`) — **gap = 221px**, matching the brief's own figure exactly.

### 3.3 Fix applied

On both `5997:10905` (Logged In) and `5997:11224` (Logged Out):

- Every top-level child **except** the navbar instance (`5997:11133` / `5997:11452`) — 29 nodes on each
  frame (headline, byline, body copy, comment section, "More Trending News" cards, footer band, etc.) —
  had its `y` reduced by **140px**, moving the whole content block up as one unit (relative positions
  between all these siblings are preserved exactly; only their position relative to the navbar changed).
- The frame's own height was reduced by the same 140px (`4657 → 4517`), **not requested literally by
  the brief but applied as a disclosed judgment call** (see §3.5) — this keeps the footer band (`Group
  47`) flush against the frame's bottom edge exactly as it was before (and exactly as `Blog Page
  Desktop` itself does — verified: its own footer sits flush with zero gap against its frame's bottom
  edge too), instead of leaving a new 140px void of empty space at the very bottom of the page.

Constraints were checked before touching anything: every direct child on both frames has
`{horizontal: MIN, vertical: MIN}` (or is a `GROUP`, which has no constraints of its own — its leaves
do, and translating a `GROUP`'s own `x`/`y` moves the whole group as a unit, which is what was used
here). `MIN` vertical means none of these children get repositioned by Figma's own constraint-resolution
when the parent frame is resized, so shrinking frame height afterward was safe and did not require a
second corrective pass.

### 3.4 Verified after

| | Logged In (`5997:10905`) | Logged Out (`5997:11224`) |
|---|---|---|
| Navbar bottom (absolute) | `-30704` | `-30704` |
| New topmost content y (absolute) | `-30623` | `-30623` |
| **New gap** | **`81`** | **`81`** |
| New frame height | `4517` (was `4657`) | `4517` (was `4657`) |
| Max content bottom vs. frame bottom | `-26277` = `-26277` (flush) | `-26277` = `-26277` (flush) |

Screenshot-verified on both frames (full-frame renders): navbar sits directly above the headline with
tight, even spacing; nothing overlaps or clips anywhere down either frame; the footer band sits flush
at the very bottom exactly as before.

### 3.5 Judgment call, disclosed

The brief's literal ask ("shift the content block up... verify nothing overlaps") did not mention frame
height. Shifting content up by 140px alone, with no height change, would have left a 140px empty band
at the bottom of each frame (since the footer previously touched the frame's bottom edge with zero
margin). Reducing the frame height by the same 140px was judged the more correct fix — it matches
`Blog Page Desktop`'s own flush-footer convention exactly and avoids introducing a new, unrequested
visual defect (dead space) while fixing the requested one (excess top whitespace). Flagged here rather
than silently done.

---

## ITEM 4 — Moderation Queue button/table overlap (Decision Log #200)

### 4.1 Re-derived live coordinates — the old report's numbers no longer apply

Per the task's own warning, the coordinates in `sprint-2-admin-panel-fast-follow-report.md` (`Content`
at local `y=45`, `Table` at local `y=99`–`424`, shared top-bar `Frame 5768` at local `y=186`–`227`) were
**not trusted** and re-derived directly. The screen's shell instance really is `6044:14064` (not any
older ID). The local-coordinate numbers above turned out to still be accurate (the height-growth pass
didn't move any of this screen's own content, only the shell), but this was verified, not assumed:

| Node | Absolute bounds (before fix) |
|---|---|
| Screen `5794:8635` | `x=41384, y=-22000, w=1440, h=1184` |
| Admin Shell instance `6044:14064` | same bounds as screen (fills it) |
| Shared top-bar row (`Frame 5768`, inside the shell) | `x=41663…42684, y=-21814…-21773` |
| "Filter" button (`Frame 5750`, inside `Frame 5768`) | `x=42457…42685, y=-21814…-21773` |
| `Content` frame (`5794:8710`) | `x=41684, y=-21955, w=1100, h=483` |
| `Table` (`5794:8718`, before) | `x=41684, y=-21901…-21576, w=1100` |
| Standalone `Button — Export Queue` (`6073:14056`) | `x=42238…42378, y=-21954…-21922` |

**Confirmed overlap**: the Table's vertical span (`-21901` to `-21576`) fully contains the shared
top-bar's span (`-21814` to `-21773`), and their horizontal spans overlap too (`41684–42784` vs.
`41663–42684`) — so the entire search field + "Filter" button row was rendered underneath the Table's
opaque rows, exactly as the prior report described, just at updated coordinates after the 1024→1184
height growth (the growth itself didn't cause or fix this — `Content`'s own `y=45` position, and the
shell's pinned `y=186–227` top-bar, are both unrelated to that change).

### 4.2 Reference measurement — "normal spacing" on a clean Admin list screen

Checked `Articles` (`123:56`) and `Categories` (`128:488`) directly. Neither uses a `Content` >
`Top Row` > `Table` structure by name — they're flatter, older-style screens with a page-title text
(`"Articles"` / `"Categories"`, local `y=135`–`174`) sitting **above** the shared shell's top-bar row,
followed by the table's own background box (`Rectangle 35`) starting at local `y=236`. Measured
directly: shared top-bar bottom = local `y=227` (same fixed position on every Admin Shell instance,
including Moderation Queue's own); table box top = local `y=236`. **Gap = 9px** — this is the real,
measured "normal spacing" between the shared top-bar and a screen's own table content on this file's
Admin screens, and is the number this fix targets (not an assumed round number).

### 4.3 A real Figma-authoring gotcha found while attempting the fix — auto-layout silently discards manual `y`

The first fix attempt (`table.y = table.y + 137`, etc.) **silently did nothing** — before/after values
came back identical. Investigating found `Content` (`5794:8710`) is a `VERTICAL` auto-layout frame
(`itemSpacing: 20`, both axis sizing modes `FIXED`), and `Table`/the 4px spacer `Frame`/`Callout —
Appeal Routing` are all normal (`layoutPositioning: 'AUTO'`) auto-layout children — Figma's own
auto-layout engine recomputes and overwrites any manually-set `.y` on an `AUTO`-positioned child inside
an auto-layout frame, so the assignment appeared to succeed (no error thrown) but had zero effect. This
is a new, disclosed gotcha for this project's standing Figma-authoring notes, distinct from the
already-documented "bound paint takes its alpha from the variable" and "`figma.union()`/`figma.subtract()`
discard input fills" gotchas.

**Fix for the gotcha**: set `layoutPositioning = 'ABSOLUTE'` on `Table`, the spacer `Frame`, and
`Callout — Appeal Routing` first (removing them from the auto-layout flow, letting them be positioned
freely like children of a plain frame), explicitly re-asserting their width/height via `.resize()`
(switching off `STRETCH`/`layoutAlign` can otherwise leave width in an undefined state), and only then
setting `x`/`y`. `Top Row` (the screen's own title/tabs/Export-Queue-button row) was left as a normal
auto-layout child throughout — it doesn't overlap anything and wasn't the node this task asked to move.

### 4.4 Fix applied — before/after y-values

All three of `Table`, the spacer `Frame`, and `Callout — Appeal Routing` were shifted down by the same
**137px** (chosen so `Table`'s new top lands exactly 9px below the shared top-bar's bottom edge, per
§4.2), preserving their existing 20px gaps to each other:

| Node | Before `y` (relative to `Content`) | After `y` | Δ |
|---|---|---|---|
| `Table` `5794:8718` | `54` | **`191`** | `+137` |
| Spacer `Frame` `5794:8780` | `399` | **`536`** | `+137` |
| `Callout — Appeal Routing` `5794:8781` | `423` | **`560`** | `+137` |

`Content` (`5794:8710`, `clipsContent: true`) was grown from height `483` to **`620`** (`+137`, matching
the shift) so the now-lower `Callout` isn't clipped by `Content`'s own bottom edge — verified after the
fact: `calloutBottom − contentBottom = 0` (exactly flush, no clip, same as before the fix).

### 4.5 Verified after — absolute coordinates and overlap check

| | Before | After |
|---|---|---|
| `Table` absolute `y` (top) | `-21901` | **`-21764`** |
| Shared top-bar / "Filter" button bottom | `-21773` | `-21773` (unchanged) |
| **Gap, Filter-bottom → Table-top** | `-128` (i.e. overlapping by 128px) | **`9`** |
| `Table` overlaps `Frame 5750` ("Filter")? | — | **`false`** (programmatic bbox check) |
| `Table` overlaps `Button — Export Queue`? | — | **`false`** |

Screenshot-verified on the full screen (`5794:8635`): the search field and the "Filter" button are now
both clearly visible above the table, unobstructed; "Export Queue" is visible in the top row next to
the "Open Reports (6)" / "Appeals (2)" tabs; the table renders cleanly below both, with the "Appeal
routing" callout banner rendering correctly beneath the table with no clipping or overlap anywhere.

### 4.6 Left untouched, out of this task's named scope

`Admin — Report Detail & Action` (`5796:8635`) and `Admin — Appeal Review` (`5796:8753`) share the
identical `Content`-overlaps-shared-top-bar root cause (per the prior fast-follow report), but both have
`Show Action Button = false`, so there is no visible defect there today — the task named only
`5794:8635`, and neither sibling screen was touched.

---

## Summary of node IDs touched this session

**Item 1 (banner)**: none — `5942:12065` inspected only, not modified.

**Item 2 (legacy nav sweep)**: none — find-and-report only, per the brief. No `visible` flags changed
anywhere (nothing to hide on the 2 named frames; the 3 real findings on Contact Us / Terms of Service /
Privacy Policy Desktop were deliberately left as found).

**Item 3 (whitespace)**:
- `5997:10905` — 28 non-navbar children `y -= 140` (headline text, byline group, body copy, comment
  section groups, trending-news cards, footer band, etc. — full list in the raw tool output above);
  frame resized `1440×4657 → 1440×4517`.
- `5997:11224` — identical treatment, same 28-node shape, mirrored IDs; frame resized identically.

**Item 4 (Moderation Queue)**:
- `5794:8710` ("Content") — resized `1100×483 → 1100×620`.
- `5794:8718` ("Table") — `layoutPositioning: AUTO → ABSOLUTE`, `y: 54 → 191`.
- `5794:8780` ("Frame", 1×4 spacer) — `layoutPositioning: AUTO → ABSOLUTE`, `y: 399 → 536`.
- `5794:8781` ("Callout — Appeal Routing") — `layoutPositioning: AUTO → ABSOLUTE`, `y: 423 → 560`.

No other node in the file was touched.

---

## Judgment calls, deviations, and new Decision Log candidates

| # | Item | Note |
|---|---|---|
| — | Item 1 | Brief's premise (banner short by ~5,620px) did not match live file — banner already covers all 4 frames with ~1,687px to spare. No change made. Recommend closing DL #195 as "verified already covered." |
| — | Item 2 | Brief's premise that `Group 7` is still live on the 2 named Article Detail frames did not match live file — already removed by the prior `sprint-2/articles-page-split-and-navbar` session. Nothing hidden there. |
| **(next available)** | Item 2 | **New Decision Log candidate**: 3 live, never-retrofitted legacy text-nav instances found file-wide — Contact Us Desktop (`87:158`), Terms of Service Desktop (`102:340`), Privacy Policy Desktop (`104:444`) — each still carries the exact pre-redesign `Group 7` "Home / Community / Livescores / About Us" nav plus an old-style logo lockup, and their 3 mobile counterparts still carry an old `bx:menu` hamburger + logo lockup instead of the canonical mobile navbar. None of these 6 frames (3 desktop + 3 mobile) has ever been touched by any navbar-retrofit pass in this project's history. Recommend a scoped `figma-design-system` follow-up to give these 3 page-pairs the same `header 4`/`header 7` (desktop) and `header 4 — mobile`/`header 7 — mobile` (mobile) treatment every other section of the file already has, mirroring exactly how Blog/Articles/Sports were each retrofitted. |
| — | Item 3 | Judgment call: also reduced frame height by 140px (not literally requested) to keep the footer flush with the frame bottom, matching Blog Page Desktop's own convention, rather than leaving a new 140px void at the bottom. Disclosed in §3.5. |
| **(next available)** | Item 4 | **New Figma-authoring gotcha for the standing notes**: a manually-set `.y` on a normal (`AUTO`-positioned) child of an auto-layout frame is silently discarded/recomputed by Figma's own layout engine — no error is thrown, the assignment just has no effect. Work around it by setting `layoutPositioning = 'ABSOLUTE'` on the specific child first (and re-asserting size via `.resize()`, since `STRETCH`/`layoutAlign` no longer applies once a child goes absolute), then setting `x`/`y`. Found and fixed while implementing Item 4; distinct from the already-documented "bound paint takes its alpha from the variable" and "boolean operations discard input fills" gotchas. |

---

## For the finalising session

- Branch off `main` (or off `sprint-2/articles-page-split-and-navbar` if that branch/PR isn't merged
  yet — confirm current `main` state before choosing).
- Commit this report.
- Transcribe the 1 new Decision Log candidate from Item 2 into
  `docs/Soccernity_MVP_Build_Plan_v1.7.docx` Section 9 (Table 6), continuing from the live docx's
  current max entry number.
- Append forward-pointers: **#195** ("verified already covered, no resize performed"), **#196**
  ("the 2 named frames had nothing to hide — already removed by a prior session; new candidate raised
  for 3 other live instances found file-wide"), **#198** ("gap corrected to 81px on both Logged In and
  Logged Out, footer kept flush via a disclosed frame-height reduction"), **#200** ("Table repositioned
  9px below the shared top-bar, matching the Articles/Categories convention; `Report Detail & Action`
  and `Appeal Review` left untouched, no visible defect there today").
- Fold the new auto-layout `layoutPositioning` gotcha (Item 4, §4.3) into this project's standing
  Figma-authoring notes.
- CLAUDE.md "Where things stand" bullet: this session (i) verified Decision Log #195's banner coverage
  is already correct (no change needed), (ii) confirmed Decision Log #196's two named frames have
  nothing to hide but found 3 real, unretrofitted legacy-nav instances elsewhere (Contact Us / Terms of
  Service / Privacy Policy Desktop, flagged as a new candidate, not fixed), (iii) closed Decision Log
  #198 by tightening the Article Detail Desktop top whitespace to 81px on both auth states, and
  (iv) closed Decision Log #200 by repositioning the Moderation Queue table 9px below the shared shell's
  "Filter" button, matching this file's own Admin-screen convention.
- **Do NOT merge** — founder review, as with every design-stage session in this project.
