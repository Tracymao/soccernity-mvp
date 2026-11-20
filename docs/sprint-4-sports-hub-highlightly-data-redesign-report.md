# Sprint 4 — Sports Hub / Highlightly data redesign

**Agent:** `figma-screen-builder`
**Date:** 2026-09-16
**Scope:** Figma design only. **No `apps/web` or `services/api` code was touched.**
**File:** `Soccernity-MVP` (`weZWWqggy9j13eX8bhFgs6`), page `Soccernity` (`0:1`)

---

## 0. Routing note

This task was **explicitly routed to `figma-screen-builder` by founder decision**, as a one-time
exception to the standing `figma-design-system` / `figma-screen-builder` split. The work is
substantial **new data-content enrichment of already-built screens** — not a token/colour retouch
(normally `figma-design-system`) and not purely brand-new screens either. The founder judged it
closer to `figma-screen-builder`'s domain given how much genuinely new content is involved.

Logged here explicitly rather than silently followed, matching the established convention for
cross-routed tasks in this project (PRs #102, #110, #130, #151, and the Leaderboard/homepage
routing flags). **This does not change the standing agent-sequencing rule.**

---

## 1. Premise corrections — what the live file actually contained

Three things in the task brief did not survive contact with the live file. All were checked
directly before any edit, per this project's standing "verify, don't trust the brief" discipline.

### 1.1 There are **10** mobile Sports Hub frames, not 8

The brief said "10 desktop + 8 mobile". The live file has **10 desktop + 10 mobile** — full 1:1
parity. The "8" counts only PR #130's match-centre mobile set and misses PR #112's two
`Sports / Livescores — … — Mobile` frames (`5647:8023`, `5647:8169`).

### 1.2 The screens were **not** "bare league/status/score placeholder content"

That description is accurate for the **shipped frontend stub**
(`apps/web/src/pages/sports-hub/sportsHubData.ts`, whose own header comment documents it), but
**not** for the Figma frames. Measured live:

| Screen | What was actually already there |
|---|---|
| Match Statistics / 1H / 2H | **18 team-stat rows already built** — Ball Possession, Shots on Targets, Blocked Shots, Corner Kicks, Throw-in, Fouls, Yellow Card, Completed Passes, Attacks, Goal Attempts, Shots off Goal, Free Kicks, Offsides, Goalkeeper Saves, Red Cards, Total Passes, Tackles, Dangerous Attacks |
| Standing | Full league table **including a `FORM` column header and 5 form chips per row** |
| H2H | `LAST MATCHES: LIVERPOOL`, `LAST MATCHES: CHELSEA` and a `HEAD TO HEAD` block, all with real historical rows |
| Lineups | `STARTING LINEUPS`, `FORMATION` (4-2-3-1 / 4-1-4-1), `SUBTITUTES` *(sic)*, `MISSING PLAYERS`, `COACHES` |
| Video | **Genuinely bare** — one grey rectangle + a YouTube logo. The only screen matching the brief's description. |

**Consequence:** every Highlightly *team*-stat category named in the brief (possession, shots on
target, corners, fouls, cards, passes completed) **already existed**. The genuinely missing item on
those screens was **player-level box scores**, which is what was built. This sharpened the scope
considerably and is reported rather than quietly padded out with duplicate stat rows.

### 1.3 Standing was **not** missing a form guide — but it was off-palette

Desktop Standing already had the FORM column. What it *did* have wrong was the colour scheme:
`#d3f502` (lime — draws) ×20 and `#cfcfcf` (grey — no-data) ×20, both **unbound and off-palette**,
plus unbound white chip text. **Mobile Standing had no form column at all** — that was the real gap.

---

## 2. What was built / changed

### 2.1 New frames (4)

| Frame | Node ID | Size | Position |
|---|---|---|---|
| **Match Momentum** (desktop) | `6508:21059` | 1440 × 1708 | x 28800, y −26792 |
| **Live Commentary** (desktop) | `6508:21321` | 1440 × 2405 | x 30400, y −26792 |
| **Match Momentum — Mobile** | `6514:21081` | 390 × 1027 | x 12700, y −30833 |
| **Live Commentary — Mobile** | `6514:21296` | 390 × 1788 | x 13300, y −30833 |

Both desktop frames were assembled from cloned in-file parts (score header, Level-1 nav card,
Level-2 sub-tab row, Close Window) so they inherit existing structure and bindings rather than
reinventing chrome. Both mobile frames are clones of `Match Statistics — Mobile` with the stats
body removed. Canvas space was verified empty by a pairwise AABB probe **before** creation;
a post-creation overlap check against all page children returned **0 overlaps**.

#### Match Momentum
Modelled on Flashscore's Match Momentum, as instructed. A 90-bar minute-by-minute attacking-danger
chart: **navy bars above the centre line = home (Liverpool), green below = away (Chelsea)**, bar
height = danger level. Includes a half-time divider, a minute axis (0'/15'/30'/HT/60'/75'/90'),
timestamped event markers (goals at 23', 41', 58', 71'; red card at 76'), a legend, three
peak-pressure summary cards, and an explainer stating momentum is a **derived** metric — not a count
of shots or possession.

#### Live Commentary
A chronological, **newest-first** feed of 18 timestamped entries covering **every** event type named
in the brief: goals, assists, cards (yellow + red), substitutions, VAR decisions, penalties and
injury-time additions — plus KICK OFF / HALF TIME / FULL TIME period markers and an event-type
filter row.

### 2.2 The Live Commentary framing decision (explicitly requested)

The screen is framed as an **automated event feed, not editorial commentary**, in the design itself
— not only in this report. A persistent note sits directly under the section band on both
breakpoints:

> "This is an automated match-event feed, not written commentary. Every entry below is generated
> directly from timestamped match data — goals, assists, cards, substitutions, VAR decisions,
> penalties and added time. **There is no commentator and no editorial narration.**"

Consequently the design carries **no commentator byline, no attributed author, no prose-style
narration, and no avatar/personality treatment** anywhere. Every entry is a structured record
(minute · event-type badge · subject · factual detail), deliberately readable as data rather than
writing.

### 2.3 Existing screens enriched

| Screen | Node ID | What changed |
|---|---|---|
| Video (desktop) | `760:11533` | Rebuilt from one grey rect into a full clip system: hero caption with clip-type badge + geo status, 7-type filter row, `ALL CLIPS` band, 2×3 clip grid, geo-restriction explainer. Unbound `#d9d9d9` hero rebound to `brand/green-tint`. Height 1639 → 2548. |
| Video — Mobile | `5821:9009` | Same system reflowed to a 390px list: hero caption, scrollable filter row, 6-item clip list, geo note. Height 590 → 1381. |
| Match Statistics | `640:3737` | Added `PLAYER STATISTICS` band, team toggle, and an 11-player box-score table (MIN/G/A/SHOTS/ON TARGET/PASSES/PASS %/TACKLES/FOULS) plus a `SUBSTITUTES USED` block. Height 2568 → 3462. |
| First Half Statistics | `667:151` | Same box score, first-half values, `NO SUBSTITUTES IN THIS HALF`. Height → 3373. |
| Second Half Statistics | `667:1511` | Same box score, second-half values + subs. Height → 3462. |
| Match Statistics / 1H / 2H — Mobile | `5822:9075`, `5823:9108`, `5823:9317` | Compact mobile box score (name + position pill + MIN/G/A/SH, with a secondary passes/%/tackles/fouls line per player). |
| Standing | `756:6433` | **100 form chips** rebound to the palette W/D/L scheme. See §2.4. |
| Standing — Mobile | `5821:9068` | **New FORM column** — header + 14 rows × 5 chips; columns rebalanced (Team 150→100, PTS fixed 40, FORM 92 right-aligned) so nothing collides. |
| Lineups | `667:1952` | Fixed `SUBTITUTES` → `SUBSTITUTES` (`689:257`). Added a `SUBSTITUTIONS` band + real-time substitution timeline (MIN / TEAM / OFF / ON, 5 subs). Height 3870 → 4287. |
| Lineups — Mobile | `5825:9207` | Compact substitutions timeline. Height 2057 → 2433. |
| H2H | `756:11` | Added `HEAD TO HEAD RECORD` band + aggregate card (last-10 W/D/W tally, proportional split bar, goal aggregates). **Also rebound 12 off-palette W/L form chips** (§2.4). Height 2977 → 3348. |
| H2H — Mobile | `5824:9174` | Same aggregate record card, mobile scale. Height 1196 → 1455. |
| Match Details (+ Mobile) | `632:943`, `5820:8976` | Sub-tab row extended (§2.5) — this is the entry point into the two new sections. |

### 2.4 Form-guide / W-D-L colour scheme (palette-only)

Applied consistently to **112 chips** (100 on Standing, 12 on H2H) and to all new mobile chips:

| Result | Chip fill | Label |
|---|---|---|
| W | `brand/green` | `color/text/on-green` (navy) — 5.29:1 |
| D | `brand/navy` | `color/text/on-navy` (white) — 12.58:1 |
| L | `semantic/alert` | `color/text/on-navy` (white) — **4.12:1** |
| ? (no data) | `color/icon/inactive` | `color/text/primary` |

**Disclosed contrast measurement:** white on `semantic/alert` measures **4.12:1** — this fails
WCAG AA for normal text but **passes AA Large (3:1)**, which is the applicable threshold for the
bold single-letter glyph in a 34px chip. This matches the figure already recorded in CLAUDE.md
and the existing Decision Log #99/#149 treatment. Navy on `semantic/alert` was measured as an
alternative at **3.05:1** — worse — so white was kept.

### 2.5 Information architecture — where the new sections live

The file has a two-level tab system: **Level 1** (`Match | H2H | Standings | Video`) and **Level 2**
(`Match Summary | Statistics | Lineups`, the sub-tabs of *Match*). Momentum and Live Commentary are
both in-match content, so they were added as **Level-2 sub-tabs under Match**:

`Match Summary | Statistics | Lineups | Momentum | Commentary`

Rebuilt on **5 desktop frames** (`632:943`, `640:3737`, `667:151`, `667:1511`, `667:1952`) — row
re-centred on x=720, width 308 → 552, active-tab indicator repositioned per screen — and on
**5 mobile frames** (`5820:8976`, `5822:9075`, `5823:9108`, `5823:9317`, `5825:9207`).

**Sports Page (Logged Out / Logged In) was deliberately left structurally unchanged.** Navigation
into the new sections follows the file's existing pattern — Sports Page → Match Details →
sub-tabs — so no new link surface was invented on a screen that is already a correct fixture list.

---

## 3. Fast-follow exclusions — honoured, not quietly skipped

| Excluded | Status |
|---|---|
| **Top scorers** | Not designed. Highlightly endpoint support unconfirmed. |
| **Match-specific notification/alert preferences** | Not designed. Blocked on the separate unresolved investigation into reusing Notification Centre infrastructure. |
| **xG, Pressure Index, ball-coordinate shot maps, Expected Lineups** | Not designed. SportMonks-exclusive — literally unavailable from Highlightly. No UI was drawn against data that does not exist. |

**One further item was hit during the pass and excluded on the same principle:** a **player RATING
column** was scoped into the box-score table during design, then removed before build. The brief's
confirmed Highlightly category list names "player-level box scores" but not ratings, which are a
derived metric. It is flagged below rather than shipped on assumption.

---

## 4. Token / paint audit

### 4.1 Everything authored in this pass

Measured node-by-node across **73 authored subtrees**:

| Metric | Result |
|---|---|
| Nodes scanned | **2,363** |
| Bound SOLID paints | **2,212** |
| **Unbound paints** | **0** |
| **Off-palette paints** | **0** |
| **`brand/green-tint-28` usages** | **0** (Decision Log #47 honoured) |
| New colours introduced | **0** |
| Frame overlaps (4 new frames vs all page children) | **0** |
| Mode | **Light only** |

Standing form chips separately: **100 groups, 200 bound paints, 0 unbound.**

### 4.2 Pre-existing debt in the frames touched (inherited, *not* introduced)

| Frame group | Bound | Unbound | Nature |
|---|---|---|---|
| All 10 mobile match-centre frames + 2 new mobile frames | 150–317 each | **0** (one frame has 1) | Mobile is fully clean |
| Desktop match-centre frames | 72–415 each | 221–4,271 each | **Overwhelmingly club-crest / country-flag trademark artwork** |

File-wide top unbound hexes across these frames: `#ffffff` ×6,525, `#d00027` ×2,390, `#ed1c24`
×1,750, `#00a398` ×1,680, `#dba111` ×1,050, `#fef667` ×420, `#034694` ×110, `#8f8f8f` ×108.

**Traced directly, not assumed:** every `#dba111` instance in H2H (399 of them) resolves inside
`XMLID_189_` / `Group 118` — i.e. the Liverpool and Chelsea **crest vector artwork**, ~21 paints per
crest. This is the same licensed-trademark-art category PR #97 / Decision Log #85 already leaves
unbound by design.

**This materially corrects Decision Log #149's framing.** #149 records that "desktop's off-palette
amber is now the flagged deviation" for H2H/Standing. The amber is crest art, not UI. The *real*
UI-level off-palette values in that family were `#d3f502` (draw chips) and `#cfcfcf` (no-data chips)
— **both now fixed, on Standing and H2H.**

### 4.3 One genuine debt item found and deliberately **not** fixed

`#8f8f8f` @10% ×108 file-wide (36 per screen × 3 desktop statistics screens) — the **stat-bar track
rectangles** behind the 18 team-stat rows. This is real, non-crest, off-palette, unbound UI colour,
and it is **not** covered by the "flag/crest/jersey art" disclosure PR #111 recorded for this
section.

**Left unfixed on purpose**, because the brief explicitly scopes token/housekeeping work out
("Don't touch Figma housekeeping/tokens… that's `figma-design-system`'s domain"). The line drawn
was: off-palette values *inside a deliverable this ticket names* were fixed (the Standing/H2H form
guide — the brief directly instructs reusing the palette-compliant W/D/L scheme; and the Video hero,
which this ticket rebuilt around). Off-palette values in rows this pass did not rebuild were flagged
instead. Flagged as a candidate below with exact counts so it does not need rediscovering.

---

## 5. Decision Log candidates

**Numbering caveat, stated plainly:** I have **no shell access** and cannot read
`docs/Soccernity_MVP_Build_Plan_v1.7.docx` directly. Per CLAUDE.md the live table runs `#1`–`#310`
with `#293`/`#294` missing (claimed in CLAUDE.md prose but never transcribed). I have therefore
numbered these **#311 onward**, but the finalising session **must re-verify the real highest entry
before transcribing** — the unmerged `sprint-4/public-blog-articles-feed` work on the current branch
mentions two further deferred candidates that may not yet be numbered.

| # | Candidate | Status |
|---|---|---|
| **#311** | **Eight desktop match-centre frames carry no navbar at all** (`632:943`, `640:3737`, `667:151`, `667:1511`, `667:1952`, `756:11`, `756:6433`, `760:11533`). PR #151 retrofitted only the two Sports Page frames and explicitly left this "separate legacy set" out of scope. The two **new** desktop frames follow the family convention (no navbar) rather than the brief's generic "reuse the shared Navbar" instruction — adding chrome to only 2 of 10 sibling screens would be a visible inconsistency, and retrofitting all 10 shifts every screen's content by 90px. Needs a coordinated `figma-design-system` pass. | Open |
| **#312** | **`#8f8f8f` @10% stat-bar track rectangles, ×108** across the 3 desktop statistics screens — genuine non-crest off-palette debt, not covered by PR #111's flag/crest disclosure. Recommend rebinding to `color/icon/inactive`. Deliberately not fixed here (token scope). | Open |
| **#313** | **Player RATING column omitted from box scores.** Ratings are a derived metric not named in the confirmed Highlightly category list. Needs vendor confirmation before design. | Open |
| **#314** | **Legacy score-header crest artwork renders outside its reported bounds** and visually overlaps the team-name text on every desktop match-centre frame (`XMLID_189_` reports h=158 but paints taller). Pre-existing on all 8 legacy frames; now inherited by the 2 new frames via the cloned header. Cosmetic, file-wide, `figma-design-system` territory. | Open |
| **#315** | **Decision Log #149 correction.** The "off-palette amber on desktop H2H/Standing" is club-crest trademark art (399 paints in H2H alone), not UI. The real UI-level off-palette form-chip values were `#d3f502` / `#cfcfcf`, now fixed on both screens. #149's Status should be amended. | Proposed |
| **#316** | **Live Commentary orders newest-first.** Matches the live-feed convention the feature name implies; for a finished match ascending order is arguably more readable. Recorded as a deliberate choice, not an oversight. | Resolved (design) |
| **#317** | **Mobile sub-tab type reduced 12px → 11px**, gap 20 → 9, padding 20 → 16, to fit five tabs inside 390px (measured row width 371–373). Alternative (horizontal-scroll clipping) was rejected because the active tab could fall out of view. | Resolved (design) |
| **#318** | **Momentum and Commentary are Level-2 sub-tabs under Match**, not Level-1 siblings of H2H/Standings/Video. Both are in-match content. This is the IA decision `figma-to-code` will inherit. | Resolved (design) |
| **#319** | **Geo-restriction treatment is a navy pill + `semantic/alert` dot**, not a red badge — white-on-red fails AA for the small badge label. Restricted thumbnails use `color/icon/inactive` (a bound "greyed" fill) rather than a translucent overlay, which avoids the documented "bound paint takes its alpha from the variable" gotcha entirely. | Resolved (design) |
| **#320** | **On Standing, `brand/green` / `brand/navy` / `semantic/alert` now carry two different meanings in two different columns** — promotion/relegation on the rank chip (x≈100) and W/D/L on the form chips (x≈1053+). Unavoidable under the two-colour palette rule; readable because the columns are far apart and the glyphs differ (numbers vs letters). Flagged so it is a recorded trade-off. | Resolved (design) |
| **#321** | **All match data on these screens remains dummy data** (Liverpool 1–3 Chelsea, consistent across Momentum, Commentary, box scores, Lineups subs and Video clips). Highlightly is resolved as the vendor (Decision Log #6) but **no integration exists** — there is no sports module, no endpoint, and `MatchData` has zero live reads. **`figma-to-code` must not wire any of these screens to data.** | Open |
| **#322** | **No prototype wiring was added** to the new sub-tabs or the new frames, consistent with the rest of this file (the match-centre family has never carried `NAVIGATE` reactions). Routing is a code-side concern. | Resolved (design) |

---

## 6. Data consistency note

All invented match content is internally consistent across every screen touched — one coherent
narrative for Liverpool 1–3 Chelsea:

- **Goals:** Salah 23' (LIV, assist Alexander-Arnold); Havertz 41' (CHE, assist Chilwell);
  Palmer 58' (CHE, penalty); Jackson 71' (CHE, assist Palmer)
- **Cards:** Caicedo 33' (yellow, CHE); Fernández 76' (second yellow → red, CHE); Robertson 84'
  (yellow, LIV)
- **Substitutions:** 55' CHE, 62' LIV, 68' CHE, 79' LIV, 88' CHE
- **VAR:** 66' (goal disallowed, offside), 74' (red card upheld); penalty awarded 56'

These line up across Live Commentary, Match Momentum (event markers + peak spells), the Lineups
substitutions timeline, the player box scores (minutes played reflect the subs), and the Video clip
titles. Anyone wiring this later can use it as a single fixture.

---

## 7. Verification performed

- Every frame ID was resolved by **live Figma read**, not from memory. The brief supplied no node
  IDs, and none were assumed from prior sessions.
- Every structural edit was screenshot-verified (Standing chips, mobile FORM column ×3 iterations,
  desktop + mobile Video, sub-tab rows, momentum chart, both commentary feeds, box scores ×2,
  substitution timelines ×2, H2H record cards ×2).
- **Two real layout bugs were caught by screenshot and fixed**, not shipped: (a) the mobile Standing
  PTS column collided with the form chips through two rounds of rebalancing before the widths
  resolved cleanly; (b) the new desktop frames' section band overlapped the sub-tab row by 17px
  (band at y=710 is correct only for Level-1 screens with no sub-tabs; Level-2 screens need y=790) —
  everything below was shifted 80px.
- **Frame height growth on legacy absolute-layout frames was drift-checked. Stated precisely, since
  the two frames were checked by different methods:** on `760:11533` (Video) an explicit
  child-position snapshot was taken immediately before and after `resize()` and diffed — **measured
  drift: 0 nodes**. For the other five resized frames (`640:3737`, `667:151`, `667:1511`,
  `667:1952`, `756:11`) the safety property was verified *structurally* rather than by snapshot
  diff: every direct child was confirmed to carry a `vertical: MIN` constraint — **0 non-MIN
  children across all six frames** — which is the condition that makes a height-only resize
  non-drifting. Per the standing `frame.resize()` gotcha, only *height* was ever changed;
  **no width resize was performed on any absolute-layout frame**, which is the case that actually
  causes constraint drift.
- Free canvas space was probed by pairwise AABB **before** creating any new frame; overlap
  re-checked after.
- **A known authoring gotcha was hit and handled:** `TEXT` nodes with `textAutoResize:
  WIDTH_AND_HEIGHT` silently ignore `resize()` and hug their content, which is what caused the
  mobile Standing column collision. Fixed by setting `textAutoResize = 'NONE'` before resizing.
  Worth adding to the standing gotcha list if it is not already covered by the existing
  wrapping-TEXT note.

---

## 8. Handoff

Nothing was committed — this session had no shell/git access. A follow-up session should:

1. Create the branch and commit the Figma work + this report.
2. **Re-verify the real highest Decision Log number in the docx** before transcribing #311–#322
   (see the caveat in §5), and consider whether `#293`/`#294` should finally be transcribed under
   their already-claimed numbers.
3. Append a forward-pointer to **Decision Log #149**'s Status per #315, and to **#6** noting that
   Sports Hub screens are now designed against the resolved Highlightly categories but remain
   unwired.
4. Add a status bullet to CLAUDE.md's "Where things stand right now" — per that file's own
   "Keeping this file current" rule, this should land in the *same* PR, not a later sweep.
