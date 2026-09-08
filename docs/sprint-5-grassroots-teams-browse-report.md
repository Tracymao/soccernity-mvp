# Sprint 5 — Grassroots "Browse Teams" screen + mobile drawer entry (Decision Log #258)

**Agent:** `figma-screen-builder` · **Date:** 2026-09-08 · **Branch:** `sprint-5/grassroots-teams-browse`

**Scope:** Figma design only — no `apps/*` or `services/api` code touched. **No Bash this session** — the
branch, commit, Build Plan docx Decision Log transcription, `CLAUDE.md` bullet and the PR are deferred to
a follow-up shell session, the same pattern as PRs #98 / #102 / #110 / #130 / #151 / #216 / #217. Not merged.

Resolves **Decision Log #258** ("No teams browse screen and no Grassroots nav entry point"), raised by
`sprint-5/grassroots-record-keeping-screens` (Decision Log #253, FLAG 10).

---

## 0. Preconditions verified live

Confirmed by reading the file directly rather than trusting the brief:

- **File / page.** Three pages present; real screens on **`0:1`** ("Soccernity"), 537 top-level children
  before this pass. As `CLAUDE.md` warns, the default page listing is unreliable here — page `0:1` was
  fetched by ID.
- **Design-system token pass complete.** One collection, `Soccernity Theme`
  (`VariableCollectionId:5096:2`), modes **Light** (`5096:0`, default) / **Dark** (`5096:1`), **14 COLOR
  variables** — matches `CLAUDE.md` exactly, nothing stale. All work is **Light mode only**.
- **All 21 Grassroots frames present** at the node IDs and coordinates recorded in
  `docs/sprint-5-grassroots-record-keeping-screens-report.md`, including frame 9's post-#261 state.
- **All four "← Teams" back-link nodes confirmed, each with `reactions.length === 0`** before this pass:
  `6373:17537` (frame 9 D), `6374:17504` (frame 10 D), `6379:17774` (frame 9 M), `6379:17871` (frame 10 M).

---

## 1. Three brief premises checked and corrected

Each was verified against the live file before acting, in line with this project's standing practice.

### 1.1 The drawer does **not** need to grow by 48px — measured, not assumed

The brief asked to "shift `Nav — Messages` / `Notifications` / `Profile` / `Settings` / the trailing
`Space` / `Divider` / `Nav — Log out` down by the row pitch (48px), and grow `Panel` (`5870:10692`),
`Scrim` (`5870:10690`) and the component frame height by 48px."

Two findings changed this:

1. **`Panel` is a `VERTICAL` auto-layout frame** (`itemSpacing: 4`, `padding 24/20/24/20`), not an
   absolute-positioned stack. Inserting a child reflows every sibling below it automatically — **no manual
   shifting was needed, and none was done.** Verified: the post-insert child order and the 48px pitch
   (44px row + 4px gap) both land exactly as intended.
2. **The panel had 113px of unused vertical headroom, so nothing needed to grow.** Measured directly:

   | | Before | After |
   |---|---|---|
   | Panel content bottom | **731** | **779** |
   | Panel height (FIXED) | 844 | 844 |
   | Usable bottom (height − `paddingBottom` 24) | 820 | 820 |
   | Fits? | — | **yes, 41px spare** |

   Growing `Panel` / `Scrim` / the component to **892** would have made a **390 × 844 full-screen mobile
   overlay overhang the very viewport it overlays** — the drawer's height is deliberately the mobile
   screen height, not a hug of its own content. **Deliberate disclosed deviation: nothing was resized.**
   Confirmed visually — "Log out" still renders well clear of the panel's bottom edge.

### 1.2 The drawer component has **1** live instance, not ~46

The brief asked to "verify a sample of the ~46 live instances inherits cleanly." Measured page-wide:

| Component | Node | Live instances on `0:1` |
|---|---|---|
| `Navigation Drawer — Mobile` | `5870:10689` | **1** |
| `header 4 — mobile` | `5386:6576` | 66 |
| `header 4` | `2838:3502` | 95 |

The ~46 figure describes the drawer's **trigger** (`header 4 — mobile`'s avatar, Decision Log #162), not
the drawer itself. The single live instance — `5874:10690`, on `Community — Home Feed (Navigation Drawer
Open) — Mobile` — was checked and **inherited the new row cleanly**: 13 nav rows, `Nav — Grassroots`
present, correct position between `Nav — Clubs` and `Nav — Messages`, no detachment, no override drift.

### 1.3 The section banner already covers the extended row — no extension needed

The Grassroots section banner is `Rectangle 353` (`6383:18357`) plus the `Grassroots` display TEXT
(`6383:18358`), at `y 30064`. Measured:

| | Extent |
|---|---|
| Banner strip | `x −2048 → 19456` |
| Desktop row **after** this pass | `x 0 → 19160` |
| Mobile row **after** this pass | `x 0 → 5390` |

The strip already overhangs the new desktop frame's right edge by **296px**, and the display TEXT is
centred on the *strip* (mid 8725 vs strip mid 8704), not on the row — so re-centring it would have moved
it off its own backdrop. **Nothing was touched.** (The two left-aligned caption TEXT nodes at `y 32280` /
`y 32440` start at `x 0` and are unaffected by a row extending rightward.)

---

## 2. What was built

### 2.1 Two new frames

| Frame | Node ID | x | y | Size |
|---|---|---|---|---|
| `Grassroots — 11 Browse Teams — Desktop` | **`6402:18078`** | 17720 | 32800 | 1440 × 1758 |
| `Grassroots — 11 Browse Teams — Mobile` | **`6404:18180`** | 5000 | 35600 | 390 × 1447 |

Placement continues the existing rows at their own measured pitch — desktop `1440 + 200` gap (last frame
`Grassroots — Design Notes` ends at `x 17520`, so `17720`); mobile `390 + 110` gap (last frame ends at
`x 4890`, so `5000`). Mobile is **390px**, the canonical width (Decision Log #86).

### 2.2 Layout from Clubs, chrome from Grassroots — the deliberate divergence

This is the same split Decision Log #253 already made for the public team page, running one layer up.

- **Chrome (from Grassroots):** each frame was built by cloning the Grassroots public-team-page shell
  (frame 10, `6374:17501` / `6379:17868`) and emptying its `Content` column — so it inherits the
  section's own `VERTICAL` auto-layout frame, its 700px / 350px content column, and a real
  **`Navbar — header 4`** (`6402:18079` → `2838:3502`) / **`Navbar — header 4 — mobile`**
  (`6404:18181` → `5386:6576`) instance.
- **Layout (from Clubs):** the body is the four structural pieces cloned verbatim out of
  `Clubs — Browse — Desktop` (`5841:9252`) / `Clubs — Browse — Mobile` (`5841:9311`) — **Header**,
  **Search**, **Card list**, **`Button — Load More`** — so every card frame, radius, stroke, spacing and
  variable binding is inherited rather than re-authored.

**Divergence from Clubs — Browse, stated plainly:** Clubs — Browse uses the logo-only
`Top Bar — Soccernity`; this screen does not. Decision Log #156's "logo bar until nav is decided"
rationale no longer applies once Grassroots has a nav home, and this screen links directly to and from
the Grassroots public team pages, which already use `header 4`.

**Content-column width:** kept at the Grassroots shell's **700px** (not Clubs' 760px) — the column width
reads as chrome, and section-internal coherence matters more here than matching Clubs to the pixel.

### 2.3 Search = city, not a name filter

The search field is renamed `Search — City` with the placeholder **"Search teams by city"**, and carries
an on-frame annotation stating it maps to **`GET /teams?city=`** — a *server-side equality filter*, not
Clubs — Browse's client-side substring filter over already-loaded rows. Section 4.5 defines no
team-name text search, so none is implied.

### 2.4 Team card anatomy

Monogram + team name + a `{city}  •  {type} team` secondary line + the verified / unverified badge.

- **Monogram, not a crest** — `GrassrootsTeam` has no badge/photo field (Decision Log #253).
- **Secondary line mirrors frame 9's own identity line** (`Lagos  •  Informal team`). Only the two
  `leagueType` labels that already exist in the file are used — **"Informal team"** (frame 9) and
  **"School team"** (frame 10). No third label was invented.
- **Badges cloned verbatim** from frames 9 and 10 — `Badge — Verified` (`6373:17545` / `6379:17782`) and
  `Badge — Community team (unverified)` (`6374:17694` / `6379:17985`). No badge colour was re-derived.
- **No Join / Leave action.** Confirmed, not assumed: `GrassrootsTeam` has no membership concept —
  Section 4.5 defines no join endpoint and `GET /teams/:id` returns no member list. The cloned Clubs
  `Action — idle` / `Action — joined (Leave)` frames were **deleted** from all 8 cards, and the
  `Member Count` text line with them.
- **The whole card is the click target** — `ON_CLICK → NAVIGATE`, see §3.

Sample mix (some verified, some not, mixed cities):

| Card | City / type | Badge |
|---|---|---|
| Surulere United | Lagos • Informal team | **Verified** |
| Marina Boys FC | Lagos • School team | Community · Unverified |
| Ikorodu Rangers | Ikorodu • Informal team | Community · Unverified |
| Peckham Town Youth | London • School team | Community · Unverified |

### 2.5 Empty states — both variants, designed properly

Clubs — Browse has no empty state at all (the same Decision-Log-#137-shaped gap). Both real variants are
designed here, below a divider and a `STATE — EMPTY LIST` caption stating they replace the list and the
"Load more" button rather than sitting alongside results:

- **`Card — Empty state (city filter returned nothing)`** — "No teams in Lagos yet"
- **`Card — Empty state (no teams registered at all)`** — "No teams registered yet"

Both are clones of frame 10's real `Card — Empty state (no fixtures)` (`6374:17696` / `6379:17987`), so
the surface / stroke / radius treatment matches the section exactly.

They live **inside** the two named frames rather than as extra frames, because the brief names exactly two
frames and this file already documents state variants in-frame with a labelled caption.

### 2.6 `Nav — Grassroots` in the mobile drawer

`Nav — Clubs` (`5870:10735`) was cloned → renamed **`Nav — Grassroots`** (**`6401:18075`**, label TEXT
`6401:18077`, Montserrat Medium 14) → `insertChild(11, …)` into `Panel` (`5870:10692`), i.e. **directly
after `Nav — Clubs`, before `Nav — Messages`**.

**A flat sibling row — adjacency, not nesting.** No drawer-nesting or expandable-group pattern exists
anywhere in this file, and none was invented. See §6 for the flagged question.

Resulting order (19 panel children):

> Logo · Space · Signed in as · Space · Home · Community · Sports Hub · Blog · Bants · Leaderboard ·
> **Clubs · Grassroots** · Messages · Notifications · Profile · Settings · Space · Divider · Log out

The clone carries no reaction — confirmed first that **all 18 pre-existing panel children have 0
reactions** (correct: `NAVIGATE` is rejected on `COMPONENT` descendants, so drawer nav targets are set
per-instance, per Decision Log #249).

---

## 3. Reactions wired — 12, all read back from fresh handles

Every one was verified `navigation === 'NAVIGATE'` with the expected `destinationId` after writing.

### The four "← Teams" back-links (the #258 ask)

| Source | Frame | → Destination |
|---|---|---|
| `6373:17537` | Grassroots 9 Public Team Page (Verified) — **Desktop** | `6402:18078` Browse Teams — Desktop |
| `6374:17504` | Grassroots 10 Public Team Page (Unverified) — **Desktop** | `6402:18078` Browse Teams — Desktop |
| `6379:17774` | Grassroots 9 Public Team Page (Verified) — **Mobile** | `6404:18180` Browse Teams — Mobile |
| `6379:17871` | Grassroots 10 Public Team Page (Unverified) — **Mobile** | `6404:18180` Browse Teams — Mobile |

### The eight team cards

| Source card | → Destination | Note |
|---|---|---|
| `6402:18196` Surulere United (D) | `6373:17444` frame 9 D | same team as frame 9 |
| `6402:18206` Marina Boys FC (D) | `6374:17501` frame 10 D | **same team as frame 10** |
| `6402:18216` Ikorodu Rangers (D) | `6373:17444` frame 9 D | representative |
| `6402:18225` Peckham Town Youth (D) | `6373:17444` frame 9 D | representative |
| `6404:18228` Surulere United (M) | `6379:17751` frame 9 M | same team as frame 9 |
| `6404:18238` Marina Boys FC (M) | `6379:17868` frame 10 M | **same team as frame 10** |
| `6404:18248` Ikorodu Rangers (M) | `6379:17751` frame 9 M | representative |
| `6404:18258` Peckham Town Youth (M) | `6379:17751` frame 9 M | representative |

**Small disclosed improvement on the brief:** the brief said to point every sample card at frame 9. The
Marina Boys FC card is literally frame 10's team — same name, same "Lagos • School team" line, same
unverified badge — so it points at frame 10 instead. Costs nothing and makes the prototype honest: the
verified card opens the verified page, the unverified card opens the unverified page.

---

## 4. Design Notes frame updated (`6380:17791`)

| Node | Change |
|---|---|
| `6380:17924` | Endpoint→screen mapping for `GET /teams?city=`: was "No screen designed. See FLAG 10…", now names both Browse Teams frames and what the search / Load more / card-click map to. |
| `6381:17823` | FLAG 10 title → **"FLAG 10 — teams browse screen and nav entry point (RESOLVED — Decision Log #258)"** |
| `6381:17824` | FLAG 10 body → RESOLVED, naming both frames, the drawer row, and the four wired back-links; **explicitly keeps the desktop-navbar gap open**. |
| `6381:17865` | DL candidate title → **"#258 — … — RESOLVED"** |
| `6381:17866` | DL candidate body → RESOLVED, incl. adjacency-not-nesting, and the two deferred items. |

---

## 5. Audit — measured node-by-node, authored vs inherited stated separately

Visible `SOLID` fills **and** strokes on visible nodes; "inherited" = anything inside a component instance.

| | Bound | Unbound | Off-palette | `brand/green-tint-28` |
|---|---|---|---|---|
| Browse Teams — Desktop, **authored** | **60** | **0** | **0** | **0** |
| Browse Teams — Desktop, inherited | 70 | 0 | 0 | 0 |
| Browse Teams — Mobile, **authored** | **59** | **0** | **0** | **0** |
| Browse Teams — Mobile, inherited | 14 | 0 | 0 | 0 |
| `Nav — Grassroots`, **authored** | **2** | **0** | **0** | **0** |
| **Total authored** | **121** | **0** | **0** | **0** |

- **0 new colours. 0 hardcoded hex. 0 `brand/green-tint-28` (Decision Log #47). Light mode only.**
- The only non-`SOLID` residual is **1 `IMAGE` fill per frame** — `Ellipse 33`, the shared navbar
  instance's avatar (`I6402:18079;2838:3579;2819:4082` and `I6404:18181;5387:7675;2819:4082`).
  Pre-existing shared-component debt, not editable from an instance, **deliberately not force-bound** —
  the same residual every prior Grassroots pass disclosed.
- **Overlaps: 0.** A strict pairwise AABB test of both new frames against **all 539** page `0:1`
  top-level children — **1,076 comparisons, no type exclusions** — returned zero clashes, including
  between the two new frames themselves.
- **Tokens used:** `brand/green`, `brand/green-tint` (12%), `color/background/surface`,
  `color/text/primary`, `color/text/secondary`, `color/text/on-green`, `color/icon/inactive`.
  Type is **Inter** on the frames (matching the Grassroots section) and **Montserrat Medium** on the
  drawer row (matching the drawer's own type).

### One real fill bug found and fixed in-pass

`Clubs — Browse`'s four cards are **not** structurally uniform: card 3's logo slot is a different variant,
`Club Logo — Placeholder (no logoUrl)`, with **no text child** and a fill bound to **`color/icon/inactive`
(navy 15%)** instead of `brand/green-tint`. Cloned forward unchecked, that card's monogram rendered as a
grey tile among three green ones. Caught by screenshot, then **all four desktop monogram tiles and their
four text nodes were normalised** to the donor's exact `brand/green-tint` fill / `color/text/primary`
text / radius 8, and the stray stroke cleared.

**This is the audit lesson worth carrying:** the wrong fill was **correctly variable-bound the whole
time**, so it would have passed a "0 unbound / 0 off-palette" audit while being visibly wrong. A binding
audit proves provenance, not correctness — cloned repeated content still needs a screenshot.

---

## 6. Screenshot verification

- **Browse Teams — Desktop** (full frame): `header 4` navbar renders with the full icon nav + avatar;
  "Teams" H1, subheading, city search, four team cards with correct monograms / cities / badges (one green
  verified pill, three outlined unverified pills), "Load more", three schema annotations, the empty-state
  caption, both empty cards, and the deferred-navbar annotation — no clipping, no overlap.
- **Browse Teams — Mobile** (full frame): same content reflowed to the 350px column under
  `header 4 — mobile`; badges wrap correctly under each card's two text lines.
- **`Navigation Drawer — Mobile` component** and its **live instance `5874:10690`**: "Grassroots" renders
  directly under "Clubs", correct Montserrat weight, correct marker dot, and "Log out" plus the divider
  still sit well clear of the panel bottom at the unchanged 844px height.

---

## 7. Figma-authoring gotcha for the standing list

> **A repeated card list cloned from another screen is not necessarily structurally uniform — index
> positionally at your peril, and re-audit cloned fills for *semantic* correctness, not just binding.**
> Cloning `Clubs — Browse`'s four visually-identical cards produced a `TypeError: cannot set property
> 'characters' of undefined`, because one card's logo slot was a different variant with no text child.
> The same card's tile was also bound to the wrong token (`color/icon/inactive` rather than
> `brand/green-tint`) — a **correctly bound but semantically wrong** paint, which a "0 unbound /
> 0 off-palette" audit passes silently. Prefer `findOne(n => n.type === 'TEXT')` with a
> clone-a-donor fallback over `children[0]`, and always screenshot cloned repeated content.

*(Also re-confirmed on this pass, already documented under Decision Log #246: `use_figma` rolls a failed
run's writes back atomically — the `TypeError` above left **zero** partial writes on the canvas, verified
by re-reading before retrying.)*

---

## 8. Full node-ID inventory

### Created — frames and components

| Node | ID |
|---|---|
| `Grassroots — 11 Browse Teams — Desktop` | `6402:18078` |
| ├ `Navbar — header 4` (instance of `2838:3502`) | `6402:18079` |
| ├ `Content` | `6402:18080` |
| ├ `Header` (title `6402:18188`, subheading `6402:18189`) | `6402:18187` |
| ├ `Search — City` (placeholder `6402:18194`) | `6402:18190` |
| ├ `Team List` | `6402:18195` |
| │ ├ `Team Card — Surulere United (verified)` | `6402:18196` |
| │ │  monogram `6402:18198` / text `6402:18199` · info `6402:18200` · badges `6403:18169` (badge `6403:18170`) | |
| │ ├ `Team Card — Marina Boys FC (unverified)` | `6402:18206` |
| │ │  monogram `6402:18208` / text `6402:18209` · info `6402:18210` · badges `6403:18173` (badge `6403:18174`) | |
| │ ├ `Team Card — Ikorodu Rangers (unverified)` | `6402:18216` |
| │ │  monogram `6402:18218` / text `6403:18168` · info `6402:18219` · badges `6403:18176` (badge `6403:18177`) | |
| │ └ `Team Card — Peckham Town Youth (unverified)` | `6402:18225` |
| │    monogram `6402:18227` / text `6402:18228` · info `6402:18229` · badges `6403:18179` (badge `6403:18180`) | |
| ├ `Button — Load More (idle)` | `6402:18235` |
| ├ `Annotation — city filter` | `6404:18168` |
| ├ `Annotation — no membership` | `6404:18169` |
| ├ `Annotation — monogram and pagination` | `6404:18170` |
| ├ `Divider` | `6404:18171` |
| ├ `Caption — Empty states` | `6404:18172` |
| ├ `Card — Empty state (city filter returned nothing)` (texts `6404:18174`, `6404:18175`) | `6404:18173` |
| ├ `Card — Empty state (no teams registered at all)` (texts `6404:18177`, `6404:18178`) | `6404:18176` |
| └ `Annotation — no desktop navbar entry` | `6404:18179` |
| | |
| `Grassroots — 11 Browse Teams — Mobile` | **`6404:18180`** |
| ├ `Navbar — header 4 — mobile` (instance of `5386:6576`) | `6404:18181` |
| ├ `Content` | `6404:18182` |
| ├ `Header` | `6404:18219` |
| ├ `Search — City` | `6404:18222` |
| ├ `Team List` | `6404:18227` |
| │ ├ `Team Card — Surulere United (verified)` · badges `6404:18270` | `6404:18228` |
| │ ├ `Team Card — Marina Boys FC (unverified)` · badges `6404:18274` | `6404:18238` |
| │ ├ `Team Card — Ikorodu Rangers (unverified)` · badges `6404:18277` | `6404:18248` |
| │ └ `Team Card — Peckham Town Youth (unverified)` · badges `6404:18280` | `6404:18258` |
| ├ `Button — Load More (idle)` | `6404:18268` |
| ├ `Annotation — city filter` | `6404:18283` |
| ├ `Annotation — no membership` | `6404:18284` |
| ├ `Divider` | `6404:18285` |
| ├ `Caption — Empty states` | `6404:18286` |
| ├ `Card — Empty state (city filter returned nothing)` (texts `6404:18288`, `6404:18289`) | `6404:18287` |
| ├ `Card — Empty state (no teams registered at all)` (texts `6404:18291`, `6404:18292`) | `6404:18290` |
| └ `Annotation — nav entry scope` | `6404:18293` |
| | |
| `Nav — Grassroots` (drawer row, label TEXT `6401:18077`) | **`6401:18075`** |

### Mutated — existing nodes

| Node | ID | Change |
|---|---|---|
| `Panel` (drawer) | `5870:10692` | one child inserted at index 11; **no resize** (§1.1) |
| `Navigation Drawer — Mobile` | `5870:10689` | **unchanged size** 390 × 844 |
| `Scrim` | `5870:10690` | **untouched** |
| `Link — Back to teams` × 4 | `6373:17537`, `6374:17504`, `6379:17774`, `6379:17871` | `ON_CLICK → NAVIGATE` added |
| Design Notes text × 5 | `6380:17924`, `6381:17823`, `6381:17824`, `6381:17865`, `6381:17866` | rewritten to RESOLVED |
| Desktop monogram tiles × 4 | `6402:18198`, `6402:18208`, `6402:18218`, `6402:18227` | fills normalised to `brand/green-tint`, strokes cleared, radius 8 |
| Desktop monogram texts × 4 | `6402:18199`, `6402:18209`, `6403:18168`, `6402:18228` | fills normalised to `color/text/primary` |

**Nodes NOT touched, deliberately:** the section banner `Rectangle 353` (`6383:18357`) and its display
TEXT (`6383:18358`) — already span the extended row (§1.3); `Clubs — Browse — Desktop/Mobile`
(`5841:9240` / `5841:9306`) — clone sources only, read never written; Grassroots frames 1–8 — untouched.

---

## 9. Decision Log draft

> **The live docx Decision Log ends at #264. New rows are drafted as #265–#267 — the finalising shell
> session must re-verify the high-water mark and renumber if it has moved.**

### 9.1 Rewrite of **#258**'s Status cell

Currently reads *"Open -- founder + figma-screen-builder."* Replace with:

> **Resolved by `sprint-5/grassroots-teams-browse`** (`figma-screen-builder`, 2026-09-08). Founder
> decision: Grassroots nests adjacent to Clubs — the closest existing pillar, same content shape, informal
> vs licensed — and gets an entry in the **mobile Navigation Drawer specifically**. Delivered:
> `Grassroots — 11 Browse Teams — Desktop` (`6402:18078`) / `— Mobile` (`6404:18180`), giving
> `GET /teams?city=` a real surface; `Nav — Grassroots` (`6401:18075`) inserted directly after
> `Nav — Clubs` in the `Navigation Drawer — Mobile` component (`5870:10689`) as a flat sibling row; and
> all four "← Teams" links on the public team pages (`6373:17537`, `6374:17504`, `6379:17774`,
> `6379:17871`) wired to the matching Browse Teams frame, closing the "points nowhere" half of this
> entry. See **#265** (the screen), **#266** (the drawer entry, plus the two deferred follow-ups) and
> **#267** (the drawer-nesting question). **Still open and deliberately out of scope: a Grassroots item
> in the desktop icon navbar** — see #266.

### 9.2 New row **#265** — Grassroots Browse Teams screen

| Column | Text |
|---|---|
| **#** | 265 |
| **Candidate** | **Grassroots "Browse Teams" screen designed, desktop + mobile.** `Grassroots — 11 Browse Teams — Desktop` (`6402:18078`, 1440 × 1758, `x 17720 / y 32800`) and `— Mobile` (`6404:18180`, 390 × 1447, `x 5000 / y 35600`). **Layout from `Clubs — Browse`** (`5841:9240` / `5841:9306` — header, search, card list, `Button — Load More`, all cloned so bindings are inherited); **chrome from Grassroots** — a real `header 4` (`2838:3502`) / `header 4 — mobile` (`5386:6576`) instance, **not** the logo-only `Top Bar — Soccernity` Clubs — Browse uses, matching the public team pages this screen links to and from. This repeats the layout-from-Clubs / chrome-from-Grassroots divergence Decision Log #253 already made one layer down, and Decision Log #156's "logo bar until nav is decided" rationale no longer applies now that Grassroots has a nav home (#266). Four real divergences from Clubs — Browse: (1) **search = city**, labelled "Search teams by city", mapping to `GET /teams?city=`'s **server-side equality filter**, not Clubs' client-side name filter — Section 4.5 defines no team-name search; (2) **no Join / Leave action** — `GrassrootsTeam` has no membership concept (no join endpoint, `GET /teams/:id` returns no member list), so the whole card is the click target and navigates to that team's public page; (3) **both empty states designed** — "No teams in {city} yet" (filter returned nothing) and "No teams registered yet" (bare catalogue), a gap Clubs — Browse still has; (4) **monogram, not a crest** (no badge field, Decision Log #253), with the verified / community-unverified badges cloned verbatim from frames 9 and 10. `Load more` reflects the endpoint's keyset pagination. **Audit: 121 authored paints, 0 unbound, 0 off-palette, 0 `brand/green-tint-28`, 0 new colours, 0 frame overlaps** (strict pairwise AABB against all 539 page `0:1` children, 1,076 comparisons); the only residual is the shared navbar instance's avatar `IMAGE` fill, pre-existing debt, deliberately not force-bound. The section banner (`6383:18357`, `x −2048 → 19456`) was **measured** and already covers the extended desktop row (`x 0 → 19160`) — not resized. |
| **Raised by** | `sprint-5/grassroots-teams-browse` — `figma-screen-builder`, 2026-09-08 |
| **Status** | **Resolved (design).** Closes the "no browse screen" half of **#258**. `figma-to-code` must not wire this screen until the Grassroots backend is reachable from `apps/web` — `GrassrootsModule` is wired in `services/api`, but Grassroots has no `apps/web` route or API client yet. |

### 9.3 New row **#266** — `Nav — Grassroots` in the mobile drawer

| Column | Text |
|---|---|
| **#** | 266 |
| **Candidate** | **Grassroots gets a mobile Navigation Drawer entry — adjacency, not nesting.** `Nav — Grassroots` (`6401:18075`) was cloned from `Nav — Clubs` (`5870:10735`) and inserted **directly after it, before `Nav — Messages`**, into `Panel` (`5870:10692`) of the `Navigation Drawer — Mobile` COMPONENT (`5870:10689`) — a **flat sibling row**, not a nested or expandable group, because no drawer-nesting pattern exists anywhere in this file (see **#267**). Nav order is now Home · Community · Sports Hub · Blog · Bants · Leaderboard · **Clubs · Grassroots** · Messages · Notifications · Profile · Settings · Log out. The row carries no reaction, matching all 18 pre-existing panel children — `NAVIGATE` is rejected on `COMPONENT` descendants, so drawer targets are per-instance overrides (Decision Log #249). **Two brief premises were measured and corrected rather than followed:** (a) `Panel` is a `VERTICAL` auto-layout frame, so the rows below reflowed automatically — no manual 48px shift was needed or made; and (b) **`Panel` / `Scrim` / the component were NOT grown by 48px**, because the panel's content bottom moves 731 → 779 against a FIXED 844 height (usable 820 after `paddingBottom` 24) — it already fits with 41px spare, and growing a 390 × 844 full-screen overlay to 892 would have made it overhang the very mobile viewport it covers. (c) The component has **1** live instance, not the ~46 the brief assumed (that is `header 4 — mobile`'s count, the drawer's *trigger*); that one instance, `5874:10690`, inherited the new row cleanly — 13 nav rows, correct position, no detachment. |
| **Raised by** | `sprint-5/grassroots-teams-browse` — `figma-screen-builder`, 2026-09-08 |
| **Status** | **Resolved (design), with two named follow-ups deliberately NOT built.** (1) **Desktop icon-navbar entry — open.** #258 scoped the nav entry to the mobile drawer "specifically", so adding a Grassroots glyph to the shared `header 4` / `header 7` content-nav row — the way Clubs got its shield in Decision Log #159 — is a separate `figma-design-system` shared-component task touching ~95 + ~9 instances. Until then the desktop Browse Teams screen is reachable via the "← Teams" links and by direct route; this is annotated on the frame itself, not just here. (2) **Code mirror — open.** `{ label: "Grassroots", to: "/grassroots", available: false }` should be added to `drawerNavItems` in `apps/web/src/layout/navigation.ts`, matching exactly how Messages and Notifications are handled as disabled placeholder rows (Decision Log #166) — a small `figma-to-code` follow-up, recorded not built. |

### 9.4 New row **#267** — should the drawer support expandable groups?

| Column | Text |
|---|---|
| **#** | 267 |
| **Candidate** | **Should `Navigation Drawer — Mobile` support nested / expandable groups?** #266 added Grassroots as a flat sibling directly after Clubs, because no drawer-nesting pattern exists anywhere in this file and inventing one unasked was out of scope. The drawer is now 13 flat rows. A plausible alternative is a "Clubs" group that expands to Clubs / Grassroots — arguably a better fit for the founder's own "Grassroots nests adjacent to Clubs" framing, and it would stop the list growing linearly as pillars are added. But it is a genuine IA/interaction design conversation, not a mechanical change: it needs an expand/collapse affordance, a collapsed vs expanded state pair, a rule for which group is open by default, and a decision on whether the desktop icon navbar mirrors the grouping. Raised, not built. |
| **Raised by** | `sprint-5/grassroots-teams-browse` — `figma-screen-builder`, 2026-09-08 |
| **Status** | **Open — founder + `figma-design-system`.** Not blocking: the flat row shipped in #266 is complete and correct on its own. |

---

## 10. CLAUDE.md draft — "Where things stand right now"

Insert in the Sprint 5 area, **after** the `sprint-5/grassroots-calendar-component-fix` bullet (if present
— it postdates this session's snapshot; otherwise after the last `sprint-5/grassroots-*` bullet) and
**before** "Community, Sports Hub, and Admin Console remain the strongest-designed pillars".

```markdown
- **`sprint-5/grassroots-teams-browse` (figma-screen-builder, 2026-09-08) designs the Grassroots
  "Browse Teams" screen desktop + mobile, adds a `Nav — Grassroots` row to the mobile Navigation
  Drawer, and wires the four dangling "← Teams" links — **closing Decision Log #258**. Figma design
  only, no app/backend code.** Report: `docs/sprint-5-grassroots-teams-browse-report.md`. Decision Log
  **#265–#267** added; **#258** flipped to Resolved.
  - **Two new frames:** `Grassroots — 11 Browse Teams — Desktop` (`6402:18078`, 1440×1758, `x 17720 /
    y 32800`) and `— Mobile` (`6404:18180`, 390×1447, `x 5000 / y 35600`), continuing each Grassroots
    row at its own measured pitch. **Layout from `Clubs — Browse`** (header / search / card list /
    `Button — Load More` cloned verbatim so bindings are inherited); **chrome from Grassroots** — a real
    `header 4` / `header 4 — mobile` instance, **not** the logo-only Top Bar Clubs — Browse uses,
    matching the public team pages this screen links to and from. Same layout-from-Clubs /
    chrome-from-Grassroots divergence Decision Log #253 made one layer down; #156's "logo bar until nav
    is decided" rationale no longer applies now Grassroots has a nav home (**#265**).
  - **Four real divergences from Clubs — Browse, each backed by the schema:** search is a **city**
    field mapping to `GET /teams?city=`'s server-side equality filter, not a client-side name filter
    (Section 4.5 defines no team-name search); **no Join/Leave action** — `GrassrootsTeam` has no
    membership concept, so the whole card is the click target; **both empty states designed** ("No
    teams in {city} yet" / "No teams registered yet" — a gap Clubs — Browse still has); monogram not a
    crest (no badge field, #253), with the verified / community-unverified badges cloned verbatim from
    frames 9 and 10.
  - **`Nav — Grassroots` (`6401:18075`)** cloned from `Nav — Clubs` and inserted directly after it in
    the `Navigation Drawer — Mobile` component (`5870:10689`) — a **flat sibling row, adjacency not
    nesting**, since no drawer-nesting pattern exists in this file (**#267** raises whether it should).
  - **Three brief premises were measured and corrected rather than followed (#266):** `Panel` is a
    `VERTICAL` auto-layout frame, so rows below reflowed automatically — no manual 48px shift needed;
    **`Panel`/`Scrim`/the component were NOT grown by 48px** — content bottom moves 731 → 779 against a
    FIXED 844 height (usable 820), so it already fits with 41px spare, and growing a 390×844
    full-screen overlay to 892 would make it overhang the viewport it covers; and the component has
    **1** live instance, not ~46 (that is `header 4 — mobile`'s count, the drawer's *trigger*) — that
    one instance inherited cleanly. Separately, the section banner (`x −2048 → 19456`) was measured and
    **already covers** the extended desktop row (`x 0 → 19160`) — not resized.
  - **12 reactions wired, every one read back from a fresh handle:** the four "← Teams" links
    (`6373:17537`, `6374:17504`, `6379:17774`, `6379:17871`) → the matching Browse Teams frame, and all
    eight team cards → a public team page. Small disclosed improvement on the brief: the Marina Boys FC
    card points at frame 10 (its own unverified team page) rather than frame 9, so the verified card
    opens the verified page and the unverified card the unverified one.
  - **Audit, measured node-by-node: 121 authored paints, 0 unbound, 0 off-palette, 0
    `brand/green-tint-28`, 0 new colours, Light mode only, 0 overlaps** (strict pairwise AABB against
    all 539 page `0:1` children, 1,076 comparisons, no type exclusions). The only residual is the
    shared navbar instance's avatar `IMAGE` fill — pre-existing component debt, deliberately not
    force-bound.
  - **One real fill bug found and fixed in-pass, with a reusable lesson:** `Clubs — Browse`'s four cards
    are not structurally uniform — card 3's logo slot is a `Club Logo — Placeholder (no logoUrl)`
    variant with no text child, bound to `color/icon/inactive` instead of `brand/green-tint`. Cloned
    forward it rendered as a grey tile among three green ones. All four monogram tiles + texts were
    normalised. **The wrong fill was correctly variable-bound the whole time — a binding audit proves
    provenance, not correctness; cloned repeated content still needs a screenshot.**
  - **Flagged, NOT built:** a Grassroots item in the **desktop** icon navbar (#258 scoped the entry to
    the mobile drawer specifically; a shared `header 4`/`header 7` glyph the way Clubs got its shield in
    #159 is a separate `figma-design-system` task — annotated on the frame itself); the
    `{ label: "Grassroots", to: "/grassroots", available: false }` mirror in
    `apps/web/src/layout/navigation.ts` (a small `figma-to-code` follow-up, matching how Messages and
    Notifications are handled per #166); and drawer group-nesting (**#267**).
  - Not merged — founder's call after review.
```

---

## 11. Handover / deferred

Nothing committed, no branch created, no PR opened, `CLAUDE.md` and the Build Plan docx not edited — all
deferred to a follow-up shell session, which must:

1. Create branch **`sprint-5/grassroots-teams-browse`** and commit this report.
2. Transcribe **#265–#267** into Build Plan Section 9, Table 6 (**re-verify the high-water mark first** —
   this session's snapshot says the live docx ends at **#264**).
3. **Flip #258's Status to Resolved** using §9.1 verbatim.
4. Add the §10 bullet to `CLAUDE.md` "Where things stand right now".
5. Open the PR. **Do not merge** — founder's call.

**Deferred by design, each recorded above:**

- **Desktop icon-navbar Grassroots entry** (#266) — `figma-design-system` shared-component task.
- **`navigation.ts` code mirror** (#266) — `figma-to-code`.
- **Drawer expandable-group nesting** (#267) — founder + `figma-design-system`.
- **`figma-to-code` conversion of these two frames** — Grassroots has no `apps/web` route or API client
  yet, even though `GrassrootsModule` is wired in `services/api`.
- **Unrelated, untouched, still open:** #257 (the calendar component's inherited time row / missing
  mobile variant / "January 2022" sample month).
