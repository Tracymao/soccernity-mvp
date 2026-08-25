# Sprint 2 — Home Page Desktop (full rebuild, light mode)

Figma-only design work in file "Soccernity-MVP" (key `weZWWqggy9j13eX8bhFgs6`),
page "Soccernity" (`0:1`), new top-level frame **"Home Page Desktop — Light Mode
Rebuild (Sprint 2)"** (`5191:6652`), by the `figma-screen-builder` agent, branch
`sprint-2/homepage-rebuild`. No application code was touched. The original
`Home Page Desktop` (`2631:3951`) was read exhaustively but **not modified** —
see §1.2 for why, flagged rather than silently decided.

This replaces `sprint-2/homepage-hero-rework` (PR #94, merged), which patched
only the hero section and was found unsatisfactory. This is the full-page
reassembly, not another isolated patch.

## 0. Routing note — flagged, not silently followed

This track was dispatched labelled **"Agent: figma-screen-builder"**. That
label is not obviously correct, and the tension is worth stating plainly
rather than going along with the track name or quietly overriding it.

Per `.claude/agents/figma-design-system.md` / `figma-screen-builder.md` and
CLAUDE.md's own agent map, `figma-screen-builder` designs **screens that don't
exist yet**, while `figma-design-system` **retouches/restyles screens that
already exist**. `Home Page Desktop` (`2631:3951`) is not a new screen — it has
existed in the file since Sprint 2's earliest homepage work, and PR #94 already
edited it. On the "does the target frame exist?" test alone, this is
`figma-design-system`'s domain.

What tips it the other way is the actual scope. The brief is a **full
reconstruction and reassembly of the whole page** — a new section order, new
containers, auto-layout throughout, content de-duplication, and a from-scratch
composition — not a token/colour retouch of the existing layout, which is the
work `figma-design-system` is scoped to. That is why it was dispatched here,
and the rebuild proceeded on that basis.

Contrast with the Leaderboard precedent, where the same class of flag ran the
opposite direction: that task was labelled `figma-design-system` but was
genuinely greenfield, so it was re-routed to `figma-screen-builder`. Both cases
share one rule — say which boundary is being crossed and why, in the report.

## 0.1 Prerequisite check

`figma-design-system`'s token pass is complete and was confirmed live before
anything was drawn, not assumed: collection `Soccernity Theme`
(`VariableCollectionId:5096:2`), modes **Light** (`5096:0`) / **Dark**
(`5096:1`), **12 variables** — Sprint D's original 10 plus PR #96's two
(`color/text/on-navy` `VariableID:5182:6654`, `brand/off-white`
`VariableID:5182:6655`). All 12 were read with their per-mode resolved values
before use.

**No new variable was created and no new colour was invented in this rebuild.**
Every colour authored here resolves to one of the 12 existing variables. The
one place a non-token value appears by design is node-level *opacity* on a
navy fill (the hero scrim, §3.1) — that is a transparency of `brand/navy`, not
a third colour, and it is disclosed rather than buried.

Frame 396 (`2286:1355`), Frame 397 (`2286:1366`) and their demo composition
(`Rectangle 219`/`220`/`221` — `2286:1329`/`1330`/`1381`) were read as the
visual reference for how navy / green / off-white / green-tint combine, per the
brief. All read-only.

## 1. What the frame looked like before

### 1.1 Structure and content

`2631:3951` — 1440 × 3601, **2,191 nodes**, at canvas `x = -27389, y = 16440`
inside the existing "Homepage" section band. It is a **logged-out marketing
landing page**, not an app screen: its `Header` instance (`2841:4506`) resolves
to variant **`header 7`** (`2841:4104`), the unauthenticated variant with a
`Login` button rather than an avatar.

Section inventory, in the frame's real child order (which is reversed relative
to visual order — the frame relied on z-order and absolute `x`/`y` throughout,
with no auto-layout anywhere):

| Section | Node | What it held |
|---|---|---|
| `footer` | `2631:4012` | Near-black bar, wordmark, **two** social rows, 5 legal links, copyright, an orphan "Address" label |
| `trending` | `2631:4044` | "Trending Topics" green band, 1 featured story, 3 identical cards, 2 clipped off-canvas cards, "See more" |
| `talent` | `2632:6113` | "Talents" + 4 video cards, the 4th positioned at `x = 1454` (outside the 1440 frame) |
| `about us` | `2632:6114` | "About us" + 3 lorem-ipsum cards, plus a 1107×1148 decorative overflow frame at `-199,-56` |
| `Frame 5850` / `fixture` | `2632:6118` / `2631:4111` | "Today's fixture" navy strip + 8 identical Chelsea 3 – Liverpool 1 cells on a green-tint wash |
| `video` / `Frame 5851` / `hero content overlay` | `2654:14944` / `2654:14946` / `2632:6117` | Three overlapping full-bleed frames making up the hero |
| `Header` | `2841:4506` | Instance of `header 7` |

### 1.2 The original frame was preserved, not overwritten — flagged

The brief names `2631:3951` as the target frame. The rebuild was nonetheless
built as a **new, adjacent, descriptively-named frame**, and the original left
byte-for-byte intact (re-confirmed at the end of the session: still present,
still 2,191 nodes).

Reasoning, stated so it can be overruled rather than discovered later:
2,191 nodes with 21 image fills whose raster placement/cropping is not
reproducible from any source in the repo; a destructive in-place rebuild is
effectively irreversible and would have left the founder — who rejected PR #94
— nothing to compare against. This also matches how every prior design-stage PR
in this file has worked (Leaderboard, Brand Guide: new frame, existing frames
read-only). If the intent is genuinely to *replace* `2631:3951` on canvas, that
is a one-line follow-up once the rebuild has been reviewed; doing it before
review would have been the unrecoverable order.

The new frame is named `Home Page Desktop — Light Mode Rebuild (Sprint 2)`,
deliberately specific — this file already carries 22 identically-named
"Settings" frames as the cautionary example, and `Home Page Desktop` alone
would have created a second ambiguous pair.

### 1.3 Colour audit of the original — every solid paint, measured

A script walked all 2,192 nodes and tallied every `SOLID` fill and stroke.

**2,006 solid paints. 27 bound to a variable — 1.3%. All 27 are inside the
imported `Header` instance. The homepage body itself had zero variable-bound
paints.**

| Hex | Count | Where | Verdict |
|---|---|---|---|
| `#FFFFFF` | 809 | Crest art, footer text | Mostly legitimate (crest geometry) |
| `#ED1C24`, `#D00027`, `#00A398`, `#DBA111`, `#FEF667`, `#034694`, `#D1D3D4`, `#6A7AB5` | 944 | Club crest vector art in the fixture cells | **Third-party trademark colours — not brand tokens, correctly left alone** (same precedent PR #96 set for crests) |
| **`#000000`** | **59** | Footer social icon vectors, misc | **Off-palette black** |
| **`#232323`** | **18** | Trending card headlines/body | **Off-palette near-black** |
| **`#1E1E1E`** | **5** | **The footer's own background (`2631:4012`)** | **Off-palette near-black** |
| **`#0E0E0E`** | **2** | Inside the `Header` instance | **Off-palette near-black** |
| **`#000000` @ 35% / @ 50%** | **3** | Header search placeholder; hero paragraph | **Off-palette black** |
| `#282E65` | 37 (+17 bound) | Various | Correct hex, but 37 of 54 unbound |
| `#7BB929` | 21 (+2 bound) | Various | Correct hex, 21 of 23 unbound |
| `#7BB929` @ 12% | 1 | Fixture row wash | Correct value, unbound |
| `#D9D9D9`, `#B0B0B0`, `#B9B9B9`, `#61B2E4`, `#CCDBB2` | 32 | Greys, Twitter blue | Off-palette greys / third-party |

This is the same class of finding PR #96 disclosed for the `#040404` wordmark,
at roughly 90× the scale. It also independently confirms the Leaderboard
report's claim that the Home Page footer had "0 of 46 solid fills bound" — the
footer background itself was `#1E1E1E`.

### 1.4 Non-colour defects found in the original

All confirmed by direct node inspection, not inferred:

1. **Duplicate social bars in the footer.** Two exist: `Frame 5836`
   (`2631:4028`, 3 emoji-style icons) at `y = 73` and `sm` (`2632:14943`,
   6 outline icons with labels) at `y = 121`. Both visible, stacked.
2. **`LinkedIn` is hidden inside the 6-icon bar.** `2869:17884` has
   `visible = false` in the source — so the footer advertises six socials and
   renders five. Almost certainly unintentional.
3. **A 4.97 px ghost text node.** `2817:3953`, Inter Regular, characters
   "Soccernity", nested inside the footer logo group — a sub-5px invisible
   duplicate of the wordmark sitting beneath the real 16px one.
4. **Duplicated legal link.** "Terms of Service" appears twice in the five
   footer links (`2631:4014` and `2631:4023`).
5. **Stale copyright** — "© 2022".
6. **Orphan "Address" label** (`2841:6928`) with no address after it.
7. **Copy leakage in the hero.** The hero's supporting paragraph
   (`2631:4007`) is not hero copy — it is verbatim the Zaha/Crystal Palace
   news blurb from the Trending section (`2631:4103`), pasted in and rendered
   at `#000000` @ 50%.
8. **Duplicated card content.** The three Trending cards carry the identical
   "Kane joins 250 club…" headline, body and date; the eight fixture cells are
   eight identical "Chelsea 3 – Liverpool 1".
9. **"Scounting" typo**, ×4, across the Talents captions.
10. **Clipped / off-canvas content.** Two Trending cards sit at `x = 1333`
    inside a 1292-wide parent; the 4th Talents card sits at `x = 1454` in a
    1440-wide frame. Both are invisible in the rendered page.
11. **Sub-pixel/negative-offset drift** throughout — e.g. `Frame 5826` at
    `x = -19`, `Frame 5825` at `x = -114`, `Frame 5835` at `-199,-56` — the
    signature of an absolutely-positioned page assembled by nudging.

## 2. Frame identity of the rebuild

**`5191:6652`** — "Home Page Desktop — Light Mode Rebuild (Sprint 2)",
**1440 × 4525** (3,301 px of page + a 1,224 px annotation zone), canvas
`x = -24209, y = 16440`, explicit **Light** mode set on `Soccernity Theme`.

Placed in the existing "Homepage" section band, to the right of the Leaderboard
frame. **Verified empty before writing**: a collision test of the candidate
bounds against every top-level node on page `0:1` returned zero overlaps.

Structurally the opposite of the original: the root is a **vertical
auto-layout**, every section is a `FILL`-width auto-layout child, and every card
row is an auto-layout with real padding and gaps. There is no absolute
positioning anywhere except deliberate overlay composition inside the hero.

| Order | Section | Node | Size |
|---|---|---|---|
| 1 | `Header` (instance of `header 7`) | `5191:6653` | 1440 × 90 |
| 2 | `Hero — Feel The Passion` | `5191:6730` | 1440 × 620 |
| 3 | `Today's Fixture Bar` | `5191:6731` | 1440 × 137 |
| 4 | `About Soccernity` | `5191:6732` | 1440 × 589 |
| 5 | `Talents — Scouting Videos` | `5191:6733` | 1440 × 541 |
| 6 | `Trending Topics` | `5191:6734` | 1440 × 1010 |
| 7 | `Footer` | `5191:6735` | 1440 × 314 |
| — | `Annotation Zone — not part of the page` | `5198:6728` | 1440 × 1224 |

## 3. What was reused vs. what is new

The brief's instruction was an **assembly of known pieces**, not new UI
concepts. Held to, section by section.

| Section | Reused (read-only source → clone) | Genuinely new, and why |
|---|---|---|
| Header | Live **instance** of `header 7` (`2841:4104`) — the same variant the original used | Nothing |
| Hero | Pitch photo `2654:14947`; player art `2631:4011`, `2631:4009` | Navy scrim (§3.1); real subhead copy replacing the leaked news blurb (§3.2); auto-layout copy column and CTA pair |
| Fixture bar | All 8 crest cells cloned wholesale (`2631:4116`, `4354`, `4592`, `4830`, `5068`, `5306`, `5544`, `5782`) — crest vector art untouched | Navy title strip + green-tint row rebuilt as auto-layout; dividers re-cut as token-bound 1 px rules |
| About | The three 52 px icons (`2631:3991`, `2631:3978`, `2631:3984`) | Green-tint wash cards on a white icon chip; draft copy replacing lorem ipsum (§3.3) |
| Talents | Three video thumbnails (`2632:6082`, `2632:6138`, `2632:6141`) | Caption moved off the photo into a surface block; `SCOUTING` tag chip; "See all talents →" replacing the clipped 4th card |
| Trending | Featured image `2631:4098`; card images `2631:4049`, `2631:4058`, `2631:4067`; the real Zaha and Kane story text | Green header band; two additional placeholder stories replacing the two duplicated Kane cards (§3.4) |
| Footer | Logo mark `2817:3946`; the 6-icon social bar `2632:14943` | Everything else rebuilt on navy — see §5 |

**Gap found while doing this**: three of the components the brief named as
things to reuse — the create-a-post card, suggested follows, and feed posts —
do not exist on this frame at all. See §8, item 1. That is the single biggest
finding of this rebuild.

### 3.1 The hero scrim — a transparency, not a new colour

The original hero stacked three full-bleed frames with a `#000000` @ 50% text
fill doing the legibility work. The rebuild uses a single rectangle filled with
`brand/navy` at **72 % node-level opacity** over the reused pitch photo. Node
opacity is not a colour value, so this introduces no third hue — it is navy,
partially transparent. Disclosed here because "72 %" is a real design decision
with no token behind it. The number is not arbitrary — see §6.

### 3.2 Hero copy — the leaked news blurb was replaced, not reproduced

`2631:4007`'s Zaha news paragraph is unambiguously copy-paste leakage, not hero
copy. Reproducing it would have preserved a bug. Replaced with a positioning
line derived from the product description in CLAUDE.md ("unaffiliated
grassroots football players — and the fans, coaches, and communities around
them"). Draft quality, flagged in §8.

### 3.3 About copy — lorem ipsum replaced with draft copy

The three original cards were identical lorem ipsum. Three short cards were
written instead, mapped to the three existing icons (pitch / location /
player): *Grassroots first*, *A community around your game*, *A record that
travels with you*. The third is deliberately worded so it does **not** promise
Discover-pillar features as available now — "Verified profiles and discovery
tools arrive in a later phase" — because Build Plan Section 2.2 defers them and
CLAUDE.md non-negotiable #4 forbids building toward them without a go-ahead.
This is draft copy pending a real `content-ops` pass, flagged in §8.

### 3.4 Trending and Talents dummy data

The three duplicated Kane cards became one real Kane card plus two
plausible-register Premier League placeholders. Real pro-club names were kept
here **on purpose**, unlike the Leaderboard frame, which deliberately avoided
them: that board ranks unaffiliated grassroots players, where pro names would
misrepresent who is on it; this is a sports-news module, where they are the
correct register.

Talents captions were varied using the grassroots-club names the Leaderboard
frame already established (Ikoyi Rovers FC, Surulere United, Port Harcourt
Blues) rather than inventing a fresh convention, and the **"Scounting" → "Scouting"**
typo was fixed.

## 4. Full token mapping

Every colour in the rebuild, excluding the shared `Header` instance and the
reused crest art (both §5).

| Token | Variable ID | Light hex | Where it is used in the rebuild |
|---|---|---|---|
| `brand/off-white` | `5182:6655` | `#F4F5FB` | Root page background |
| `brand/navy` | `5096:4` | `#282E65` | Fixture title strip; footer; "Premier League" tag; "See more" button; hero scrim (at 72 % opacity) |
| `brand/green` | `5096:3` | `#7BB929` | "Sign up" button fill; Trending header band; `SCOUTING` tag fill; About icon glyphs; footer social glyphs; footer link dots; annotation left-bars |
| `brand/green-tint` | `5096:5` | `#7BB929` @ 12 % | Fixture row wash; About card wash; Talents section wash; annotation divider bar |
| `color/background/surface` | `5096:7` | `#FFFFFF` | Talent cards; Trending featured + news cards; About icon chips; annotation zone |
| `color/text/primary` | `5096:8` | `#282E65` | All headings; card titles; fixture cell text; "See all talents →" |
| `color/text/secondary` | `5096:9` | `#282E65` @ 70 % | Body copy; dates; lede; annotation body |
| `color/text/on-navy` | `5182:6654` | `#FFFFFF` | Hero headline + subhead; "Today's fixture"; "Login" outline + label; footer wordmark, labels, links, copyright; "See more" label; "PREMIER LEAGUE" label; footer logo-mark ball panels |
| `color/text/on-green` | `5096:10` | `#282E65` | "Sign up" label; "Trending Topics" band title; `SCOUTING` label |
| `color/icon/inactive` | `5097:2` | `#282E65` @ 15 % | Card hairline borders; fixture dividers; footer rule |
| `brand/green-tint-28` | `5098:7071` | `#7BB929` @ 28 % | *(not used — reached for, then not needed; noted so its absence is deliberate rather than an oversight)* |
| `color/background/page` | `5096:6` | `#FFFFFF` | *(not used — `brand/off-white` was specified as the page background by the brief; see §8, open question 6)* |

**Binding is real, not nominal.** Final audit of the frame: **2,006 solid
paints, 205 variable-bound.** Broken down by zone:

| Zone | Unbound paints | Status |
|---|---|---|
| Body of the page (everything authored here) | **0** | Fully token-bound |
| Reused club-crest vector art in the fixture cells | 1,760 | **Correct** — third-party trademark colours, same precedent PR #96 set |
| `Header` shared component instance | 38 | **Deliberately not overridden** — see §5.3 |

## 5. Off-palette findings and fixes

Disclosure discipline follows PR #96: state what was found, what was changed,
and what was deliberately left alone.

### 5.1 Fixed in the rebuild

| Finding | Before | After |
|---|---|---|
| Footer background | `#1E1E1E` (near-black, `2631:4012`) | `brand/navy`, bound |
| Trending card text | `#232323` ×18 | `color/text/primary` / `color/text/secondary`, bound |
| Hero paragraph fill | `#000000` @ 50 % | `color/text/on-navy`, bound |
| Footer social glyphs | `#000000` ×59 and third-party brand colours | `brand/green`, bound |
| Black stroke on the facebook letterform | `#000000` stroke on `2632:14928` (carried into the clone) | Stroke removed |
| Iconify frame backgrounds in the social bar | Opaque `#FFFFFF` 24×24 squares behind each glyph — would render as white chips on the navy footer | Cleared |
| Dead `#D9D9D9` solids sitting *underneath* opaque `IMAGE` paints on two reused photo rectangles | Invisible but unbound | Removed (no visual change) |
| Footer logo mark | Raw `#7BB929` ×2, raw `#282E65` ×1, unbound | Greens bound to `brand/green`; the navy vector bound to `color/text/on-navy` instead — navy-on-navy would have been invisible in the footer |
| 4.97 px ghost "Soccernity" text (`2817:3953`) | Present inside the logo group | Not carried into the clone; removed and logged |
| Hidden `LinkedIn` icon | `visible = false` in the source | Restored to visible **in the clone only** — the source `2632:14943` is untouched |
| Duplicate 3-icon social bar (`2631:4028`) | Rendered alongside the 6-icon bar | Not carried over |
| Duplicate "Terms of Service" link | 5 links, one repeated | 4 deduped links |
| Copyright year | "© 2022" | "© 2026" |
| Orphan "Address" label | Label with no address | Not carried over |
| "Scounting" typo | ×4 | Fixed |
| Clipped/off-canvas cards | 2 Trending + 1 Talents card outside their parents | Replaced by real "See more" / "See all talents →" affordances |

### 5.2 Deliberately NOT changed — third-party colours

The 1,760 unbound paints in the reused fixture crest art (`#ED1C24`,
`#D00027`, `#00A398`, `#DBA111`, `#FEF667`, `#034694`, and the whites and greys
that make up the crest geometry) are **club trademark colours**, not Soccernity
brand colours. Left exactly as-is, matching PR #96's own stated position on
crests. The separate crest-licensing question remains a legal/business flag,
untouched here.

### 5.3 Deliberately NOT changed — the shared `Header` component

The `header 7` instance still carries **`#000000` ×12, `#0E0E0E` ×2,
`#000000` @ 35 % ×2, `#CCDBB2` ×1**, and 17 unbound raw `#282E65` fills, and its
search field resolves to a green-tint pill that reads louder than intended.

These were **not** overridden. Fixing them means editing a shared component's
internals from inside a screen-design task, which is `figma-design-system`'s
job — the exact same call the Leaderboard design made about the same component.
**This is a real, open retrofit item for `figma-design-system`, on a component
used by every screen in the file, not just this one.**

## 6. Contrast checks (WCAG AA)

Ratios computed by hand via the standard WCAG relative-luminance formula, with
alpha-composited tokens blended against their real backgrounds first (not
treated as if opaque).

| Pair | Ratio | Result |
|---|---|---|
| `color/text/on-navy` (`#FFFFFF`) on `brand/navy` — fixture strip, footer, "See more" | 12.59 : 1 | PASS (AAA) |
| `color/text/primary` (navy) on `brand/off-white` — all headings | 11.57 : 1 | PASS (AAA) |
| `color/text/primary` (navy) on `brand/green-tint` over off-white (`≈#E6EEE2`) — Talents heading, About card titles | 10.58 : 1 | PASS (AAA) |
| **`color/text/on-green` (navy) on `brand/green`** — "Trending Topics" band, "Sign up", `SCOUTING` | **5.28 : 1** | **PASS (AA)** |
| `color/text/secondary` (navy @ 70 %) on `color/background/surface` — card body copy, dates | 5.01 : 1 | PASS (AA) |
| `color/text/secondary` on `brand/off-white` — About lede | 4.80 : 1 | PASS (AA) |
| `color/text/secondary` on `brand/green-tint` over off-white — About card body | 4.60 : 1 | PASS (AA), tightest pair in the frame |
| `brand/green` on `brand/off-white` | 2.19 : 1 | **FAILS** — and is therefore never used as text; see below |
| **White on `brand/green`** | **2.38 : 1** | **FAILS** — see below |

**Two findings worth naming rather than burying.**

**(a) White must never sit on green.** The obvious instinct for the green
"Trending Topics" band was white text; it measures **2.38 : 1** and fails AA
badly. The file's own `color/text/on-green` token is already navy, which is
correct, and is what the band uses. This is the mirror image of PR #96's
green-on-light finding and confirms the same rule from the other direction:
green is a *surface and accent* colour, and the only safe text on or against it
is navy.

**(b) The hero scrim opacity was set by measurement, not by eye.** White hero
text over the pitch photo is not a flat-colour pair, so it was checked against
the **worst case** — a pure-white pixel in the photo. At the initially-built
62 % navy scrim, white text measures **3.98 : 1**: passes for large text, fails
AA for the 16 px subhead. Raised to **72 %**, the same worst case measures
**5.32 : 1** — passes AA — and the subhead's 85 % opacity was taken to 100 % at
the same time. Against the actual (dark grass) photo the real ratio is
comfortably higher; 72 % is the floor that holds even where the image is
brightest.

Green is used in this frame **only** as a fill, glyph or accent — the "Sign up"
button, the Trending band, the `SCOUTING` chip, About icon glyphs, footer social
glyphs, the 6 px link dots and the annotation left-bars. It is never a text
colour on a light background, per PR #96's scoping rule.

## 7. A real Figma-API footgun found while building — worth recording

`figma.variables.setBoundVariableForPaint()` returns a paint that keeps the
**literal colour you passed in** underneath the binding. Following the
documented pattern with a `{r:0,g:0,b:0}` placeholder, most nodes rendered
correctly — but the recoloured Iconify glyphs inside the About cards rendered
**solid black**, despite reading back as genuinely bound to `brand/green` with a
correct Light-mode value. The binding was real; the render fell through to the
black literal.

Fix, applied as a sweep across the whole frame: for every bound paint, set its
literal colour to the variable's own resolved Light value, so literal and
resolved agree. Only **7 paint arrays** needed it, which is exactly why this is
easy to miss — it is not a systematic failure, it is an occasional one. Every
paint authored after that point was built with the resolved value from the
start. Recording it here so the next agent building in this file does not spend
the same three calls diagnosing a black icon.

## 8. Explicitly open — not decided here

All eight are also written into the `Design Notes & Open Decisions` panel
(`5198:6731`) inside the frame, so they travel with the file rather than living
only in this report.

1. **BLOCKER — is `/` the marketing landing page, or the authenticated home
   feed?** The brief named a *create-a-post card*, *suggested follows* and
   *feed posts* among the components to reuse "from the current Home Page
   Desktop frame (2631:3951) and its variants". **They are not on that frame,
   and it has no variants** — confirmed by direct inspection, not assumed. They
   live in the **Community** pillar: `Community Home Page Template`
   (`1306:7149`, 2 variants) and the four `Create a post` frames
   (`2008:655`, `2009:5168`, `2496:4462`, `2565:3951`), where they exist as flat
   absolute-positioned rectangles and groups, **not as components**. The
   homepage's own Header instance is `header 7`, the logged-out variant with a
   Login button — a signed-in composer cannot coexist with it. In `apps/web`,
   `/` still routes to a `PlaceholderPage` stub, so the code settles nothing
   either. The page was therefore rebuilt as the logged-out marketing landing
   page it demonstrably is. **Merging the Community feed into `/` is a product
   decision, not a layout one — Decision Log candidate, flagged rather than
   assumed in either direction.**
2. **Club-picker entry point — deliberately not built, and not an oversight.**
   No club-picker component exists anywhere in this file (CLAUDE.md already
   records this as a known design gap). More decisively, adding one to a
   logged-out page would contradict an **already-resolved** decision:
   `sprint-2/club-picker-ui` chose direction (b) — club selection happens
   *after* account creation — because `GET /clubs` is `JwtAuthGuard`-only and no
   JWT exists pre-signup. Building a club picker here would require reopening
   that, which is not this task's call.
3. **Trending Topics and Today's Fixture have no data source.** Both are
   placeholder content. **Decision Log #6 (sports-data vendor) is unresolved**
   and blocks Sprint 4, and Build Plan Section 4 defines no news or fixtures
   endpoint. `figma-to-code` should not wire either section to anything until
   #6 lands.
4. **About Soccernity copy is a draft, not approved.** It replaces lorem
   ipsum and carries the right meaning, but a real pass is `content-ops`'
   territory. Same for the hero subhead (§3.2).
5. **The `Header` shared component needs an off-palette retrofit** (§5.3) —
   `figma-design-system` work, affecting every screen in the file, not just
   this one.
6. **Should `brand/off-white` replace `color/background/page`'s flat `#FFFFFF`
   Light value?** This rebuild uses `brand/off-white` as the page background
   because the brief specified it, which means `color/background/page` — the
   variable whose *name* says it is the page background — goes unused here.
   That is the open question PR #96 already raised, now with a concrete screen
   depending on the answer.
7. **Light mode only, by instruction.** This frame carries an explicit Light
   mode and no dark variant. Because every fill outside the `Header` instance
   is variable-bound, flipping it to Dark later is a single mode switch, not a
   redraw. Note the platform-wide default is still unresolved — this frame and
   Community/Settings/Contest are Light; the guardian-consent, verify-email and
   Leaderboard frames are Dark.
8. **The original frame's fate.** §1.2 — whether `2631:3951` should now be
   archived, replaced, or kept as the "before" reference is the founder's call,
   not made here.

## 9. Explicitly NOT touched (per brief)

- **`2631:3951`** — the original Home Page Desktop — read exhaustively, never
  modified. Re-confirmed present at 2,191 nodes after the session.
- **`2632:14943`, `2817:3946`, `2631:4116`/`4354`/`4592`/`4830`/`5068`/`5306`/
  `5544`/`5782`, `2631:3991`/`3978`/`3984`, `2631:4098`/`4049`/`4058`/`4067`,
  `2632:6082`/`6138`/`6141`, `2654:14947`, `2631:4009`/`4011`** — all reuse
  sources. **Cloned, never edited.** Every fix in §5.1 was applied to the clone.
- **The `Header` component set (`2824:4309`) and its variants** — an instance
  was placed; no component internals were overridden.
- **Frame 396 / Frame 397 / Rectangle 219–221** — read as visual reference only.
- **Every other screen and sprint track** — Leaderboard (`5171:6633`), Brand
  Guide (`5100:2`, `5182:6652`), guardian-consent, Settings, Community, Sports
  Hub, Admin Console, Banter Rooms: untouched. Every created or mutated node ID
  in §10 is inside the new frame.
- **No new Figma Variable, no new brand colour.**
- **No application code.** `apps/`, `services/` untouched.

## 10. Node IDs

**Root** `5191:6652` · **Header instance** `5191:6653`.

**Hero** `5191:6730` — photo `5192:6728` · scrim `5192:6729` · players
`5192:6730`/`5192:6731` · headline `5192:6734` · subhead `5192:6735` · CTA row
`5192:6736` (Sign up `5192:6737`, Login `5192:6739`).

**Fixture bar** `5191:6731` — title strip `5193:6728` (label `5193:6729`) ·
row `5193:6730` · cells `5193:6731`, `5193:6968`, `5193:7206`, `5193:7444`,
`5193:7682`, `5193:7920`, `5193:8158`, `5193:8396` (dividers interleaved).

**About** `5191:6732` — heading `5194:6728` · lede `5194:6729` · row
`5194:6730` · cards `5194:6731`, `5194:6737`, `5194:6745` (icons `5194:6733`,
`5194:6739`, `5194:6747`).

**Talents** `5191:6733` — header `5195:6728` · row `5195:6731` · cards
`5195:6732`, `5195:6739`, `5195:6746`.

**Trending** `5191:6734` — green band `5196:6728` · body `5196:6730` ·
featured story `5196:6731` (image `5196:6732`) · card row `5196:6739` · cards
`5196:6740`, `5196:6746`, `5196:6752` · "See more" `5196:6758`.

**Footer** `5191:6735` — wordmark lockup `5197:6728` (mark vectors
`5197:6732`/`6733`/`6734`) · social bar `5197:6738` (LinkedIn `5197:6766`) ·
legal links `5197:6770` · rule `5197:6783` · copyright `5197:6784`.

**Annotation zone** `5198:6728` — notes panel `5198:6731`.

**Removed during the build**: `5192:6732` (a redundant ball clone in the hero —
the reused photo already contains one).

**Read but not modified**: `2631:3951` and its full 2,191-node subtree,
`1306:7149`, `1308:11643`, `2008:655`, `2824:4309` and all 7 variants,
`2841:4104`, `2286:1355`, `2286:1366`, `2286:1329`/`1330`/`1381`, `5100:2`,
`5182:6652`, `5171:6633`.

## 11. Verified vs. assumed

**Verified**: the variable collection, its two modes and all 12 resolved
values, read live before any drawing; the original frame's full node tree and
its complete 2,006-paint colour census; that only 27 of those were bound and all
27 sat inside the `Header` instance; that `LinkedIn` is genuinely
`visible = false` in the source social bar; that the 4.97 px ghost text node
really exists inside the logo group (it was found and logged at removal time,
not predicted); that `create-a-post` / `suggested follows` / `feed posts` exist
in the Community pillar and **not** on the homepage or any variant of it; that
the homepage's Header instance resolves to `header 7`; that the placement bounds
were collision-free against every top-level node on the page; font style strings
via `listAvailableFontsAsync` (**Montserrat uses `"SemiBold"`/`"ExtraBold"`
without a space, Inter uses `"Semi Bold"`/`"Extra Bold"` with one** — a real
footgun in a file that mixes both families); that the rebuild's body has **zero**
unbound paints, by re-running the same audit script that measured the original;
that no `placeholder` shimmer was left on any node; that no text node is
zero-size or clipped; and the rendered result via full-frame plus per-section
screenshots at each step.

**Assumed, not independently re-verified**: that `header 7` remains the right
Header variant for a logged-out marketing page — it is what the original used
and it is the only variant with a `Login` button rather than an avatar, but no
spec names a canonical header per page type; that the annotation zone belongs
inside the page frame behind an explicit "the page ends above" divider — this
follows the Leaderboard frame's precedent, though the guardian-consent pass used
a separate top-level notes frame instead; that the contrast ratios in §6 are
correct to the third significant figure — each was computed by hand once and
sanity-checked against the two values PR #96 had already published (12.59 : 1
and 11.57 : 1, both of which reproduced exactly), but they were not run through
a second independent tool.

## 12. CLAUDE.md "Where things stand right now" — NOT updated here, follow-up named

CLAUDE.md's own rule is that a PR touching something that section describes
updates it in the same PR, with an explicit escape hatch: *"If updating this
file in the same PR genuinely isn't practical, the PR description must say so
explicitly and name the exact follow-up needed."*

That escape hatch applies literally here, and for a mechanical reason worth
stating: **the agent session that produced this rebuild had no file-edit tool
and no shell.** Only whole-file `Write` was available, and rewriting a
~2,000-line `CLAUDE.md` from a transcription would risk corrupting a file that
is the project's primary context document — a worse outcome than a named,
tracked follow-up. **The same limitation means this branch was not committed,
pushed, or opened as a PR by the agent either** — the Figma work is live in the
file and this report is written to disk, but the git steps need a human or a
session with shell access.

**Exact follow-up needed**, in two parts:

1. **Commit, push and open the PR** — `docs/sprint-2-homepage-rebuild-report.md`
   (this file) plus the CLAUDE.md edit below, on branch
   `sprint-2/homepage-rebuild`, PR against `main`, left open for review.
2. **Insert the following bullet into CLAUDE.md's "Where things stand right
   now"**, immediately after the `sprint-2/brand-guide-light-mode-tokens`
   bullet (the one ending "…same as Sprint D and the leaderboard design left
   them.") and before the "Community, Sports Hub, and Admin Console remain the
   strongest-designed pillars" bullet:

```markdown
- **`sprint-2/homepage-rebuild` rebuilds the homepage from scratch in Figma as a
  new frame, "Home Page Desktop — Light Mode Rebuild (Sprint 2)" (`5191:6652`),
  replacing the hero-only patch of PR #94 (`sprint-2/homepage-hero-rework`),
  which the founder rejected as insufficient.** Routing note: dispatched
  labelled "Agent: figma-screen-builder", but the target frame (`2631:3951`)
  **already exists**, which normally makes it `figma-design-system`'s domain —
  the brief's scope (full reconstruction/reassembly of the whole page, not a
  token retouch of an existing layout) is why it was routed to
  `figma-screen-builder` instead. Flagged rather than silently followed; this is
  the mirror of the Leaderboard bullet's own routing flag, running the opposite
  direction. **The original `2631:3951` was deliberately preserved, not
  overwritten** (2,191 nodes, non-reproducible raster placement, and the founder
  needs a side-by-side) — whether it should now be archived or replaced is an
  open call, not made there. Full-page assembly of reused pieces only: Header
  re-instanced as the same `header 7` variant, and all hero / fixture-crest /
  About-icon / Talents / Trending imagery cloned from the original rather than
  re-sourced. Everything is auto-layout, explicit **Light** mode, and **the body
  of the page has zero unbound paints** (the two remaining unbound zones are
  deliberate: reused club-crest trademark art, and the shared `Header`
  instance). **Before/after colour audit, measured not estimated**: the original
  had 2,006 solid paints with only **27 bound (1.3%), all 27 inside the `Header`
  instance**, and carried real off-palette black — `#1E1E1E` (the footer's own
  background), `#232323` ×18, `#000000` ×59, `#0E0E0E` ×2, `#000000` @35%/@50% —
  all fixed in the rebuild, same disclosure discipline as PR #96's `#040404`
  wordmark. Non-colour defects found and fixed: two duplicate footer social
  bars, a `visible = false` LinkedIn icon, a 4.97px ghost "Soccernity" text
  node, a duplicated "Terms of Service" link, a 2022 copyright, an orphan
  "Address" label, the hero's supporting paragraph being copy-paste leakage of
  the Zaha news blurb, ×3 duplicated Trending cards, the "Scounting" typo ×4,
  and three cards positioned off-canvas outside their own parents. **One real
  contrast failure caught by measurement, not by eye**: white hero text over the
  reused pitch photo at the initially-built 62% navy scrim measures 3.98:1
  worst-case (fails AA); raised to 72%, it measures 5.32:1. Separately confirmed
  that **white on `brand/green` is 2.38:1 and fails AA** — the green Trending
  band uses `color/text/on-green` (navy, 5.28:1) instead, the mirror of PR #96's
  green-on-light finding. Full detail in
  `docs/sprint-2-homepage-rebuild-report.md`. **This rebuild surfaces new open
  Decision Log candidates, none resolved there**: (1) **the big one — is `/` the
  logged-out marketing landing page or the authenticated home feed?** The brief
  named a create-a-post card, suggested follows and feed posts as things to
  reuse "from the current Home Page Desktop frame"; they are not on it and it
  has no variants — they live in the **Community** pillar (`1306:7149` and the
  four `Create a post` frames), and the homepage's own Header is `header 7`, the
  logged-out variant, so a signed-in composer can't coexist with it; `apps/web`'s
  `/` is still a `PlaceholderPage` stub, so the code settles nothing either;
  rebuilt as the marketing page it demonstrably is, with the merge question
  flagged rather than assumed; (2) a **club-picker entry point was deliberately
  not built** — no component exists for it, and adding one to a logged-out page
  would contradict `sprint-2/club-picker-ui`'s already-resolved direction (b)
  (club selection happens *after* account creation, because `GET /clubs` is
  `JwtAuthGuard`-only); (3) **Trending Topics and Today's Fixture have no data
  source** — both are placeholder, blocked on the still-unresolved **Decision Log
  #6** (sports-data vendor), and Section 4 defines no news or fixtures endpoint,
  so `figma-to-code` must not wire either; (4) the shared **`Header` component
  still carries `#000000` ×12, `#0E0E0E` ×2, `#000000` @35% and a green-tint
  search pill** — deliberately not overridden from inside a screen-design task,
  so this is a real open retrofit item for `figma-design-system` affecting
  **every** screen in the file, not just this one; (5) whether `brand/off-white`
  should replace `color/background/page`'s flat `#FFFFFF` Light value — PR #96's
  own open question, now with a concrete screen depending on the answer. Also
  worth knowing for anyone writing Figma variables in this file:
  `setBoundVariableForPaint()` keeps the literal colour you pass it underneath
  the binding, and a genuinely-bound paint can still **render as that literal**
  (black icons that read back as correctly bound to `brand/green`) — pass the
  variable's resolved value, not a `{0,0,0}` placeholder.
```
