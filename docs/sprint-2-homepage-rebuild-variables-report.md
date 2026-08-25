# Sprint 2 — Home Page Desktop, Pass 2 (premium light, variable-first)

Figma-only design work in file "Soccernity-MVP" (key `weZWWqggy9j13eX8bhFgs6`),
page "Soccernity" (`0:1`), new top-level frame **"Home Page Desktop — Premium
Light (Sprint 2, Pass 2)"** (`5204:6728`), by the `figma-screen-builder` agent,
branch `sprint-2/homepage-rebuild`. **Fix-up commit on the existing, unmerged
PR #97 — not a new branch and not a new PR.** No application code was touched.

## 0. Relationship to the first report — read that one too

This is a **sibling report**, not an addendum, to
`docs/sprint-2-homepage-rebuild-report.md` (Pass 1, same branch, same PR).

Sibling rather than addendum was chosen deliberately. Pass 1's report is a
complete, self-contained record of a **different frame that still exists and is
still the artifact under review**; appending 400 lines to the end of it would
have made it read as if it described one continuous piece of work on one frame,
which is not what happened. It also would have buried this pass's single most
important finding — a factual contradiction about the file's own state — at the
bottom of a 630-line document. The two reports are cross-referenced in both
directions; Pass 1's §12 follow-up list is **not** completed by this pass and is
restated in §11 below so it does not get lost.

| | Pass 1 | Pass 2 (this report) |
|---|---|---|
| Frame | `5191:6652` | `5204:6728` |
| Brief | "Assembly of known pieces only, no new UI concepts" | Reuse navbar + footer only; **invent** everything else |
| Result | Faithful reassembly of the original, cleaned and token-bound | New premium composition, token-bound, crest-free |
| Nodes | 2,165 | 441 |
| Status | Untouched by this pass | New |

## 1. Routing note — flagged, not silently followed

Same flag as Pass 1, restated because it still applies and because the
alternative is that the boundary quietly erodes.

Per CLAUDE.md's agent map, `figma-screen-builder` designs **screens that don't
exist yet**; `figma-design-system` **retouches screens that already exist**. On
the "does the target frame exist?" test alone, `Home Page Desktop` (`2631:3951`)
exists, and this is `figma-design-system`'s domain.

What routes it here is scope: this brief is a **full creative reconstruction**
— new hero, new fixtures module, new feature band, new media cards, new
editorial layout, new closing CTA — not a token or colour retouch of an existing
layout. That is screen-building work. Stated so it can be overruled rather than
discovered later.

## 2. The variables contradiction — resolved by direct measurement

The brief for this pass stated, verbatim:

> IMPORTANT — this file currently has no Figma variables; every existing frame
> (including the Sprint D dark-mode brand guide and the Sprint light-mode brand
> guide) uses hard-coded hex/rgba fills. This build is the first to use
> variables, so the variable collection itself needs to be created as part of
> this task.

Pass 1's report claimed the opposite. **Neither claim was trusted. The live file
was read first.**

### 2.1 What is actually in the file

`figma.variables.getLocalVariableCollectionsAsync()`, run against the live file
before anything was drawn:

- **1 collection**, `Soccernity Theme`, id `VariableCollectionId:5096:2`
- **2 modes** — `Light` (`5096:0`, the default) and `Dark` (`5096:1`)
- **12 COLOR variables**, every one carrying a real resolved value in **both**
  modes

**The brief's premise is incorrect.** The collection predates this session by
two sprints (Sprint D created ten of the variables; PR #96 added
`color/text/on-navy` and `brand/off-white`). **No new collection was created and
no duplicate was introduced** — doing so would have produced two competing
sources of truth for the same five colours.

### 2.2 Every value the brief asked for already existed, at exactly that value

This is worth stating precisely, because it means the brief and the file
disagreed only on *naming and existence*, never on the colours themselves.

| Brief asked for | Value asked for | Already exists as | Variable ID | Actual Light value | Match? |
|---|---|---|---|---|---|
| `brand/navy` | `#282E65` | `brand/navy` | `VariableID:5096:4` | `#282E65` | Exact, same name |
| `brand/green` | `#7BB929` | `brand/green` | `VariableID:5096:3` | `#7BB929` | Exact, same name |
| `brand/green-tint-12` | `rgba(123,185,41,0.12)` | `brand/green-tint` | `VariableID:5096:5` | `#7BB929` @ 12 % | Exact value, **different name** |
| `surface/neutral` | `#F4F5FB` (PR #96's off-white) | `brand/off-white` | `VariableID:5182:6655` | `#F4F5FB` | Exact value, **different name** |
| `text/on-dark` | white, for text on navy | `color/text/on-navy` | `VariableID:5182:6654` | `#FFFFFF` | Exact value, **different name** |

### 2.3 Naming call — existing names kept, new near-duplicates rejected

Three of the five requested names differ from what the file already uses. The
brief itself contains the deciding instruction — *"Match variable names to the
token names already used in the light-mode brand guide frame so there's no
naming drift"* — and creating `brand/green-tint-12` alongside the existing
`brand/green-tint`, or `surface/neutral` alongside `brand/off-white`, would have
been the drift that instruction exists to prevent. **The existing names were
kept.** Nothing was renamed either: renaming `brand/green-tint` would silently
change the token surface every already-built screen references.

One genuine inconsistency was noticed and is flagged rather than fixed: the
existing set contains **both** `brand/green-tint` (12 %) and
`brand/green-tint-28` (28 %) — one suffixed with its alpha, one not. The brief's
instinct to call the first one `green-tint-12` is defensible on that basis. It
is a real naming asymmetry in the existing token set, it belongs to
`figma-design-system`, and renaming a token that live frames already bind to is
not a change to make from inside a screen-design task. See §10, candidate 4.

### 2.4 Is this the first variable-bound frame in the file? No.

Asked explicitly by the brief, so answered explicitly and from measurement, not
from either party's claim.

**It is not.** Pass 1's frame `5191:6652` was re-audited live during this
session, and its binding claims hold up:

| Zone of `5191:6652` | Solid paints bound | Unbound | Verdict |
|---|---|---|---|
| Hero | 7 | **0** | genuinely bound |
| Fixture bar | 42 | 1,760 | unbound are reused club-crest trademark art |
| About | 24 | **0** | genuinely bound |
| Talents | 21 | **0** | genuinely bound |
| Trending | 26 | **0** | genuinely bound |
| Footer | 32 | **0** | genuinely bound |
| Annotation zone | 28 | **0** | genuinely bound |
| `Header` instance | 27 | 38 | deliberately not overridden |

So Pass 1 was already a variable-bound frame, and Pass 2 is the second. What is
genuinely new here is that Pass 2 is the **first frame in the file with zero
unbound paints in its page body *and* no third-party crest art** — see §6.

### 2.5 Disclosed, not fixed — the brand-guide frames

The brief's claim that the two brand-guide frames use hard-coded fills was
**not** verified in depth, because rebinding them is explicitly out of scope for
this task and re-auditing them would have invited scope creep. What can be said
from the collection read: both `brand/off-white` and `color/text/on-navy` were
created *by* PR #96 as real variables, and PR #96's own report states it bound
the wordmark fix to `brand/navy`. So the light-mode brand guide is at minimum
partially bound. **Whether either brand-guide frame is fully bound remains
genuinely unchecked here, and neither was modified.**

## 3. Why a new frame rather than extending `5191:6652`

The brief left this call open. A new frame was built. Reasoning, stated so it
can be overruled:

1. **Pass 1 is the artifact under review.** PR #97 is open and unmerged. The
   founder has not yet seen or accepted `5191:6652`. Overwriting the thing
   currently under review, in a fix-up commit on that same PR, destroys the
   comparison the review exists to make.
2. **The two passes answer different briefs.** Pass 1 was told *reuse only*;
   Pass 2 was told *invent*. They are two design directions, not two revisions
   of one. Directions should be comparable side by side.
3. **Pass 1's binding claims were true**, so there was no defect to repair in
   place — the premise that would have justified rebinding `5191:6652` turned
   out not to hold (§2.4).
4. **Consistency with this file's own precedent** — Leaderboard, both brand
   guides and Pass 1 itself all created new frames and left existing ones
   read-only.

`2631:3951` — the true original — was **not touched**, per the standing
constraint. Re-confirmed after the session: still 2,191 nodes, 1440 × 3601.
`5191:6652` was also re-confirmed unchanged: 2,165 nodes, 1440 × 4525.

The file now carries three homepage frames. That is a real cost, and choosing
which one is canonical is the founder's call, not this pass's — see §10,
candidate 3. The name is deliberately specific (the file's 22 identically-named
"Settings" frames being the cautionary example).

## 4. What was built

**`5204:6728`** — 1440 × 5298 (4,021 px of page + a 1,277 px annotation zone),
canvas `x = -22669, y = 16440`, explicit **Light** mode pinned on
`Soccernity Theme`. Root is a vertical auto-layout; every section is a
`FILL`-width auto-layout child. **Placement collision-tested against every
top-level node on page `0:1` at the frame's final bounds — zero overlaps.**

| Order | Section | Node | Height | Reused or new |
|---|---|---|---|---|
| 1 | `Header (instance of header 7 — reused)` | `5204:6729` | 90 | **Reused** — live instance, per brief item 1 |
| 2 | `Hero — Grassroots Football, Recorded` | `5205:6804` | 586 | **New** |
| 3 | `Today's Fixtures — Grassroots` | `5208:6804` | 440 | **New** |
| 4 | `Why Soccernity — Three Pillars` | `5209:6804` | 689 | **New** |
| 5 | `Talents — Weekend Clips` | `5210:6804` | 589 | **New** chrome, reused imagery |
| 6 | `Trending — Football Stories` | `5212:6804` | 825 | **New** chrome, reused imagery |
| 7 | `Closing CTA — Start Your Record` | `5213:6804` | 488 | **New** — no equivalent existed |
| 8 | `Footer (cloned from Pass 1 5191:6735 …)` | `5213:6816` | 314 | **Reused**, per brief item 1 |
| — | `Annotation Zone — not part of the page` | `5214:6805` | 1,277 | Notes, not page content |

### 4.1 Header and footer — the two things the brief said to reuse

**Header** is a live instance of `header 7` (`2841:4104`), the same
unauthenticated variant (Login button, not an avatar) the original homepage
uses. No component internals overridden — see §7.

**Footer** is a clone of **Pass 1's** footer (`5191:6735`) rather than a fresh
derivation from `2631:4012`. This is a deliberate deviation from the letter of
the brief ("pull these from the current Home Page Desktop frame") and is called
out rather than buried: Pass 1's footer *is* the original's footer, already
carrying its documented fixes — `#1E1E1E` background replaced with bound
`brand/navy`, the duplicate 3-icon social bar dropped, the `visible = false`
LinkedIn icon restored, the 4.97 px ghost "Soccernity" text node removed, the
duplicated "Terms of Service" link deduped, the 2022 copyright corrected, the
orphan "Address" label dropped. Re-deriving from the raw original would have
meant re-introducing all eight defects and then re-fixing them.

### 4.2 What is genuinely new, and why

- **Hero.** Navy full-bleed, editorial type, two decorative green-tint circles,
  and a floating two-card cluster (a live grassroots fixture, and a personal
  season-record card). Deliberately **photograph-free**: Pass 1's hero needed a
  measured 72 % navy scrim to make white text legible over a pitch photo, which
  is a real contrast liability that varies with the image. A flat token surface
  has no such failure mode, and it lets the frame claim zero invented opacity.
- **Fixtures.** Four typographic cards with club-initial badges, competition
  labels and status pills (LIVE / FT / kickoff time), replacing the original's
  eight identical crest cells. See §6 for why the crests are gone.
- **Why Soccernity.** A centred header plus three numbered green-tint cards on a
  white band. The numerals sit in **navy-on-green badges** rather than being set
  in green — green as text on a light background fails AA (§8), and that rule is
  already established in this file by PR #96.
- **Talents.** New card chrome (media well, play affordance, duration pill, club
  tag, player meta) around the original's three cloned video thumbnails.
- **Trending.** An editorial split — one large featured story, one ranked
  "Top stories today" panel — replacing the original's green band and three
  identical duplicated cards.
- **Closing CTA band.** No equivalent exists anywhere in the original. A
  logged-out marketing page that never asks for the signup is an obvious gap.

### 4.3 Content decisions

- **Fixtures show grassroots clubs, not Premier League clubs.** The original
  showed eight identical `Chelsea 3 – Liverpool 1` cells. Grassroots names reuse
  the convention the Leaderboard frame already established (Ikoyi Rovers FC,
  Surulere United, Port Harcourt Blues) rather than inventing a fresh one. This
  is a deliberate divergence from the original and from Pass 1 — flagged, since
  it is a positioning statement, not a layout choice.
- **Trending keeps real pro-club names**, matching Pass 1's reasoning: a
  sports-news module is the correct register for them, unlike a grassroots
  leaderboard. The real Zaha and Kane stories from the original are carried
  over; one of the three list stories is a grassroots story, deliberately.
- **All copy is draft.** Hero, pillar and CTA copy were written here to replace
  lorem ipsum and Pass 1's documented copy-paste leakage. The third pillar is
  worded so it does **not** promise Discover-pillar features as available now
  ("Verified profiles and discovery tools arrive in a later phase") — Build Plan
  Section 2.2 defers them and CLAUDE.md non-negotiable #4 forbids building
  toward them without a go-ahead.

## 5. Full token mapping

Every colour in the frame, excluding the shared `Header` instance (§7).

| Variable | ID | Light value | Where used in Pass 2 |
|---|---|---|---|
| `brand/off-white` | `VariableID:5182:6655` | `#F4F5FB` | Root page background; Trending list panel; annotation zone |
| `brand/navy` | `VariableID:5096:4` | `#282E65` | Hero band; CTA band; footer; duration pills; media-well backing; "See more stories" button; play glyphs |
| `brand/green` | `VariableID:5096:3` | `#7BB929` | Primary CTA fills (×2); LIVE pills; pillar index badges; hero live dot; annotation accent bars |
| `brand/green-tint` | `VariableID:5096:5` | `#7BB929` @ 12 % | Pillar card wash; club-initial badges; club tags; rank chips; kickoff-time pill; CTA decorative circles; hero soft circle |
| `brand/green-tint-28` | `VariableID:5098:7071` | `#7BB929` @ 28 % | Hero eyebrow chip; hero accent circle; annotation divider bar |
| `color/background/surface` | `VariableID:5096:7` | `#FFFFFF` | Hero cards; fixture cards; Why-Soccernity band; talent cards; featured story card; play discs |
| `color/text/primary` | `VariableID:5096:8` | `#282E65` | All headings, team names, scores, card titles, badge numerals, link labels |
| `color/text/secondary` | `VariableID:5096:9` | `#282E65` @ 70 % | All body copy, eyebrows, metadata, venue lines, annotation body |
| `color/text/on-navy` | `VariableID:5182:6654` | `#FFFFFF` | Hero headline/subhead/eyebrow; CTA band copy; ghost-button strokes and labels; duration pills; "See more stories" label |
| `color/text/on-green` | `VariableID:5096:10` | `#282E65` | Primary CTA labels; LIVE pill labels; pillar index numerals |
| `color/icon/inactive` | `VariableID:5097:2` | `#282E65` @ 15 % | All hairline card borders, dividers and rules |
| `color/background/page` | `VariableID:5096:6` | `#FFFFFF` | **Not used** — see §10, candidate 5 |

**11 of the 12 existing variables are used. No new variable was created. No new
brand colour was invented.**

## 6. Binding audit — measured, not asserted

Same script that measured the original and Pass 1, re-run against this frame at
the end of the session.

| Zone | Bound | Unbound | Verdict |
|---|---|---|---|
| **Entire authored page body** (hero, fixtures, pillars, talents, trending, CTA, footer, annotation zone) | **269** | **0** | **Fully token-bound** |
| Root frame's own fill | 1 | 0 | Bound |
| `Header` shared component instance | 27 | 38 | Deliberately not overridden — §7 |
| **Total** | **297** | **38** | |

Two things this frame achieves that Pass 1 did not:

- **No third-party trademark art at all.** Pass 1 carried 1,760 unbound club
  crest paints (`#ED1C24`, `#D00027`, `#00A398`, `#DBA111`, `#FEF667`, `#034694`
  and the whites/greys making up the crest geometry) inherited from the
  original's fixture strip. Rendering fixtures typographically removes every one
  of them, and sidesteps the still-open crest-licensing question rather than
  inheriting it. This is a **design decision with a product consequence**, not a
  cleanup — flagged as §10, candidate 2.
- **Node count down from 2,165 to 441**, almost entirely from that same change.

### 6.1 Two real bugs found and fixed during the build

Both found by inspection, not predicted — recorded so the next agent in this
file does not re-discover them.

1. **Stale layout width when sizing cloned images.** The three talent
   thumbnails were resized against `media.width` read immediately after setting
   `layoutSizingHorizontal = 'FILL'`, before Figma had relaid the row. They came
   out **1240 / 608 / 397 px wide** instead of ~397 each, so card 1 rendered
   only the left third of its photo (an unreadable close-up of a sock). Fixed by
   resizing against the settled width in a later call and adding
   `constraints: { horizontal: 'STRETCH', vertical: 'STRETCH' }` so the crop
   survives future reflow. **Read a laid-out dimension in a later `use_figma`
   call, or use an explicit number — do not read it in the same call that set
   the sizing mode.**
2. **`figma.createVector()` adds a default black stroke.** The three play glyphs
   each carried an unbound `#000000` stroke nobody asked for — the last three
   unbound paints in the body. Invisible at that size, but real off-palette
   black. Cleared. This is a sibling of the footgun Pass 1 recorded about
   `setBoundVariableForPaint()`: **newly created nodes arrive with paints you
   did not author, and an audit is the only way to see them.**

### 6.2 Disclosed: elevation shadows are effects, not fills

Three elevated surfaces — the two hero cards and the three play discs — carry a
`DROP_SHADOW` whose colour is **brand navy at low alpha** (`rgba(40,46,101,0.16)`
and `0.28`). Figma effect colours are not variable-bindable the way paints are,
so this value is written literally.

Stated plainly rather than buried: this is a transparency of an existing brand
colour, not a third hue, and it is the direct analogue of Pass 1's disclosed
72 % navy hero scrim. **Every actual FILL and STROKE in the authored body is
variable-bound; the shadow colour is the one literal colour value in the frame,
and it is an effect.** Whether the token set should gain an elevation convention
is §10, candidate 6.

## 7. Deliberately NOT changed — the shared `Header` component

The `header 7` instance still carries **`#000000` ×12, `#0E0E0E` ×2,
`#000000` @ 35 % ×2, `#CCDBB2` ×1** and 17 unbound raw `#282E65` fills, and its
search field renders as a green-tint pill that reads louder than intended.

Not overridden — identical call to Pass 1 and to the Leaderboard design. Fixing
it means editing a shared component's internals from inside a screen-design
task, which is `figma-design-system`'s job, and the component is used by every
screen in the file. **Still an open retrofit item, now flagged by three separate
design passes.**

## 8. Contrast checks (WCAG AA)

Ratios computed by hand via the standard WCAG relative-luminance formula, with
alpha tokens composited against their real backgrounds first rather than treated
as opaque.

| Pair | Ratio | Result |
|---|---|---|
| `color/text/on-navy` on `brand/navy` — hero, CTA band, footer, pills | 12.58 : 1 | PASS (AAA) |
| `color/text/primary` on `color/background/surface` — card headings | 12.58 : 1 | PASS (AAA) |
| `color/text/primary` on `brand/off-white` — section headings | 11.57 : 1 | PASS (AAA) |
| `color/text/primary` on `brand/green-tint` over white — club tags, rank chips, kickoff pill | 11.42 : 1 | PASS (AAA) |
| `color/text/primary` on `color/icon/inactive` over white — FT pill | 9.54 : 1 | PASS (AAA) |
| `color/text/on-navy` on `brand/green-tint-28` over `brand/navy` — hero eyebrow **(after fix)** | 7.96 : 1 | PASS (AAA) |
| `color/text/on-green` on `brand/green` — CTA labels, LIVE pills, index numerals | 5.28 : 1 | PASS (AA) |
| `color/text/secondary` on `color/background/surface` — card body, metadata | 5.01 : 1 | PASS (AA) |
| `color/text/secondary` on `brand/off-white` — annotation body, list metadata | 4.80 : 1 | PASS (AA) |
| `color/text/secondary` on `brand/green-tint` over white — pillar card body | 4.79 : 1 | PASS (AA), tightest pair in the frame |
| **`brand/green` on `brand/green-tint-28` over `brand/navy`** | **3.34 : 1** | **FAILED — found and fixed, see below** |
| `brand/green` on `brand/off-white` | 2.19 : 1 | Fails — therefore never used as text |
| White on `brand/green` | 2.38 : 1 | Fails — therefore never used |

**One real contrast failure, caught by measurement rather than by eye, and
fixed.** The hero eyebrow chip was first built as green `BUILT FOR GRASSROOTS
FOOTBALL` on a `brand/green-tint-28` pill over navy. Composited, that pill's
background luminance is 0.0820, giving green text **3.34 : 1** — a clear AA
failure at 12 px Semi Bold, which does not qualify as large text under any
reading. Dropping the pill to 12 % tint only reaches 4.41 : 1, still short.
**Fixed by setting the label in `color/text/on-navy` (7.96 : 1) and keeping the
green as an 8 px dot beside it** — the dot is a non-text graphic at 3.34 : 1,
comfortably over the 3 : 1 required by WCAG 1.4.11.

This is the same rule PR #96 and Pass 1 each found from a different direction,
now confirmed a third way: **green is a surface and accent colour. Navy and
white are the only safe things to set type in, and green is only safe as type
when it sits on navy at full strength.** Green appears in this frame **only** as
a fill or a non-text graphic.

One consequence worth naming: the play glyph was initially green on a white
disc, which is 2.38 : 1 and would have **failed the 3 : 1 non-text requirement
for a meaningful UI control**. It was changed to navy (12.58 : 1) at the same
time as the media-well fix. The green accent bars in the annotation zone are
2.19 : 1 on off-white and are left as-is — purely decorative, in a zone that is
explicitly not part of the page.

## 9. Verified vs. assumed

**Verified live, this session, not carried over from any report:** the variable
collection's existence, id, both mode ids and all 12 variables' per-mode resolved
values; that Pass 1's frame `5191:6652` is genuinely variable-bound, by re-running
the audit per section rather than trusting its report; that `2631:3951` is still
2,191 nodes and `5191:6652` still 2,165 after this session; the placement bounds
being collision-free against all 291 top-level nodes at the frame's **final**
height, not its planned one; font style strings via `listAvailableFontsAsync`
(Montserrat uses `SemiBold`/`ExtraBold` with no space, Inter uses `Semi Bold`/
`Extra Bold` with one — a real footgun in a file mixing both); that the authored
body has **zero** unbound paints; that no text node is zero-size; that no
`placeholder` shimmer was left anywhere; the three cloned talent thumbnails and
four cloned trending images all resolving to real image paints at their intended
sizes; and the rendered result via full-frame and per-section screenshots at
four points during the build.

**Assumed, not independently re-verified:** that `header 7` remains the correct
Header variant for a logged-out marketing page — it is what the original uses and
the only variant with a Login button rather than an avatar, but no spec names a
canonical header per page type; that the contrast ratios in §8 are correct to
three significant figures — each was computed by hand once and cross-checked
against the two values PR #96 published (12.58 and 11.57, both reproduced
exactly), but not run through a second independent tool; that the brand-guide
frames' binding state is as the brief describes (§2.5 — deliberately unchecked,
out of scope).

## 10. Open questions and Decision Log candidates

The first five are new to this pass. Items 7–9 are carried forward unresolved
from Pass 1 and are restated, not re-decided. All are written into the
`Annotation Zone` (`5214:6805`) inside the frame so they travel with the file.

1. **Process finding — briefs are being written from stale file state.** This
   task's brief asserted, incorrectly and in bold, that the file had no
   variables. Pass 1's report asserted the opposite and was right. The cost was
   real: a duplicate collection would have been created had the instruction been
   followed literally. **Suggested fix: add the collection id
   (`VariableCollectionId:5096:2`, modes `Light 5096:0` / `Dark 5096:1`) to
   CLAUDE.md's "Figma notes" section**, so it is discoverable in the same place
   the page ids already are and no future brief has to guess.
2. **Should club crest artwork appear in the fixtures module at all?** Dropped
   here on purpose (§6). The upside is 1,760 fewer unbound trademark paints and
   no dependency on the unresolved crest-licensing question. The downside is
   that crest-free fixture cards look less like a mainstream sports product.
   This is a product/legal call, not a layout one.
3. **Which homepage frame is canonical?** Three now exist: `2631:3951`
   (original), `5191:6652` (Pass 1, faithful), `5204:6728` (Pass 2, premium).
   Deliberately not decided here — but leaving three indefinitely recreates
   exactly the ambiguity the file's 22 "Settings" frames are the warning about.
4. **Token naming asymmetry: `brand/green-tint` vs. `brand/green-tint-28`.** One
   carries its alpha in the name, one does not. Renaming is `figma-design-system`'s
   call and touches every frame that binds it — flagged, not done (§2.3).
5. **`color/background/page` is unused for the second pass running.** Its Light
   value is flat `#FFFFFF`, while both passes use `brand/off-white` (`#F4F5FB`)
   as the actual page background. The variable whose *name* says "page
   background" is not the page background. PR #96 raised this; two screens now
   depend on the answer.
6. **No elevation/shadow token convention exists.** Three surfaces here carry a
   navy-derived drop shadow written as a literal because Figma effect colours are
   not bindable like paints (§6.2). If elevation is going to recur, it needs a
   documented rule.
7. **Carried forward, still the blocker: is `/` the logged-out marketing landing
   page or the authenticated home feed?** Create-a-post, suggested follows and
   feed posts live in the Community pillar (`1306:7149` and the four
   `Create a post` frames), not on any homepage frame. The Header here is still
   `header 7` (logged-out). `apps/web`'s `/` is still a `PlaceholderPage` stub.
   Built as a marketing page on that evidence; the question is unchanged.
8. **Carried forward: Fixtures and Trending have no data source.** Decision Log
   #6 (sports-data vendor) is unresolved and Build Plan Section 4 defines no
   fixtures or news endpoint. `figma-to-code` must not wire either module. **New
   sibling gap this pass introduces:** the hero's "Your season record" card
   (appearances / goals / assists) implies a per-player stats model that does not
   exist anywhere in `schema.prisma` — the same class of gap the Leaderboard
   design flagged about its points model. Illustrative only.
9. **Carried forward: the shared `Header` component needs an off-palette
   retrofit** (§7) — `figma-design-system` work, affecting every screen in the
   file.

## 11. Explicitly NOT touched

- **`2631:3951`** — the true original. Read, never modified. Re-confirmed at
  2,191 nodes / 1440 × 3601 after the session.
- **`5191:6652`** — Pass 1's frame. Read and re-audited, never modified.
  Re-confirmed at 2,165 nodes / 1440 × 4525.
- **The Sprint D dark-mode brand guide (`5100:2`) and the Sprint 2 light-mode
  brand guide (`5182:6652`)** — not opened, not rebound, not modified.
  Explicitly out of scope per the brief.
- **The `Soccernity Theme` collection** — no variable created, renamed, deleted
  or re-valued. **No Dark-mode value was added or changed** (the collection's
  existing Dark values predate this pass and were left exactly as found).
- **Reuse sources — cloned, never edited**: `2841:4104` (header component),
  `5191:6735` (Pass 1 footer), `2632:6082` / `2632:6138` / `2632:6141` (talent
  thumbnails), `2631:4098` / `2631:4049` / `2631:4058` / `2631:4067` (trending
  imagery). Every fix described above was applied to the clone.
- **Every other screen and sprint track** — Leaderboard, guardian-consent,
  Settings, Community, Sports Hub, Admin Console, Banter Rooms, Contest.
- **No application code.** `apps/`, `services/`, `packages/` untouched.

## 12. Node IDs

**Root** `5204:6728` · **Header instance** `5204:6729`.

**Hero** `5205:6804` — accent circles `5205:6805` / `5205:6806` · copy column
`5205:6807` (chip `5205:6808`, headline `5205:6811`, subhead `5205:6812`, CTA row
`5205:6813` with buttons `5205:6814` / `5205:6816`) · card cluster `5206:6804`
(live fixture `5206:6805`, season record `5206:6823`).

**Fixtures** `5208:6804` — header `5208:6805` · row `5208:6811` · cards
`5208:6812`, `5208:6830`, `5208:6848`, `5208:6866`.

**Why Soccernity** `5209:6804` — header `5209:6805` · row `5209:6809` · cards
`5209:6810`, `5209:6815`, `5209:6820`.

**Talents** `5210:6804` — cards `5210:6812`, `5210:6824`, `5210:6836` ·
thumbnails `5210:6814`, `5210:6826`, `5210:6838` · play glyphs `5210:6816`,
`5210:6828`, `5210:6840`.

**Trending** `5212:6804` — featured story `5212:6812` (image `5212:6814`) ·
list panel `5212:6824` (thumbnails `5212:6827`, `5212:6836`, `5212:6845`).

**Closing CTA** `5213:6804` · **Footer** `5213:6816` · **Annotation zone**
`5214:6805`.

## 13. Git and CLAUDE.md — not done here, follow-ups named

Same mechanical limitation as Pass 1, stated plainly rather than glossed:
**this session had no shell and no file-edit tool.** Only whole-file `Write` was
available.

- **Nothing was committed, staged or pushed.** The Figma work is live in the
  file; this report is written to disk. `git add` / `commit` / `push` to the
  existing `sprint-2/homepage-rebuild` branch, on the existing PR #97, needs a
  session with shell access.
- **CLAUDE.md was not updated.** Rewriting a ~2,000-line context document from a
  transcription risks corrupting the project's primary context file — a worse
  outcome than a named, tracked follow-up, which is exactly the escape hatch
  CLAUDE.md's own "Keeping this file current" section provides for.
- **Pass 1's §12 follow-up list is NOT completed by this pass** and still stands
  in full, including the CLAUDE.md bullet it drafted.
- **Additional CLAUDE.md follow-up this pass adds:** the Pass 1 bullet should be
  extended (or a second bullet added) recording that a second frame `5204:6728`
  exists on the same PR, that the file's variable collection is
  `VariableCollectionId:5096:2` with modes `Light 5096:0` / `Dark 5096:1` (see
  §10, candidate 1 — this belongs in the "Figma notes" section specifically), and
  that the five open Decision Log candidates in §10 items 1–6 are new.

### Files written by this session

- `d:\Projects\soccernity-mvp\docs\sprint-2-homepage-rebuild-variables-report.md`
  (this file — new)
