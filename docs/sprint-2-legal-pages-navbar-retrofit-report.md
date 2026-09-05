# sprint-2/legal-pages-navbar-retrofit — report

**Figma file:** `weZWWqggy9j13eX8bhFgs6` ("Soccernity-MVP"), page **Soccernity** `0:1`.
**Scope:** net-new screen creation closing **Decision Log #202** — give the three legacy legal /
utility content pages (Contact Us, Terms of Service, Privacy Policy) the same navbar-variant split
Blog and Articles already received.
**Date:** 2026-09-05. Figma design only; no app/backend code. No shell this session — the finalising
session handles branch / commit / docx / CLAUDE.md / PR, per this project's established pattern.

**Background read before starting**: `docs/sprint-2-articles-cleanup-moderation-fix-report.md` (in
full — its §2.2 is where these three pages were found and flagged as never-retrofitted). As that
report itself notes, `docs/sprint-2-articles-page-split-and-navbar-report.md` **does not exist** in
this repo; the split pattern was instead read from `CLAUDE.md`'s own
`sprint-2/articles-page-split-and-navbar` and `sprint-2/blog-split-and-pinned-post-mobile` status
bullets, plus — more importantly — **directly from the live Figma frames those two sessions
produced**, which is what the geometry rules below are actually derived from rather than from prose.

**Session note:** this session was interrupted by a rate limit immediately after the 6 desktop frames
were built. On resume, live state was re-verified before any further writes (§4.1) rather than
trusting the prior summary — 8 frames were confirmed correctly built, 4 were confirmed missing, and
no half-finished or orphaned nodes were found. Nothing was rebuilt or duplicated.

---

## 1. Precondition check — verified live before touching anything

All six frames exist exactly as the brief described. Every reported figure held up:

| Frame | Node ID | Reported | **Measured live** | Navbar instances | Legacy chrome present |
|---|---|---|---|---|---|
| Contact Us Desktop | `87:158` | 1440×2081, 0 navbars | **1440×2081, 0** ✓ | none | `Group 7` `87:160` (live), `Group 103` `359:411` (live) |
| Terms of Service Desktop | `102:340` | 1440×2129, 0 navbars | **1440×2129, 0** ✓ | none | `Group 7` `102:342`, `Group 103` `359:421` |
| Privacy Policy Desktop | `104:444` | 1440×2129, 0 navbars | **1440×2129, 0** ✓ | none | `Group 7` `104:446`, `Group 103` `359:431` |
| Contact Us Mobile | `96:253` | 375×1191, hamburger | **375×1191, 0** ✓ | none | `bx:menu` `96:255`, `Group 102` `359:513` |
| Terms of Service mobile | `104:393` | 375×3563, hamburger | **375×3563, 0** ✓ | none | `bx:menu` `104:395`, `Group 102` `359:523` |
| Privacy Policy mobile | `104:474` | 375×3563, hamburger | **375×3563, 0** ✓ | none | `bx:menu` `104:476`, `Group 102` |

All six were `visible: true`, `layoutMode: NONE` (absolute layout), `clipsContent: true`.

### 1.1 Confirmed: logged-out-accessible, footer-linked content pages

The brief asked this to be confirmed rather than assumed. It checks out, via two independent routes:

- **The named footer link nodes exist and are live.** `Link — Terms of Service` (`5213:6858`),
  `Link — Privacy Policy` (`5213:6861`), `Link — Contact Us` (`5213:6867`) all sit inside
  **`Home Page Desktop — Premium Light (Sprint 2, Pass 2)` `5204:6728`** — which Decision Log #46
  makes the canonical homepage and Decision Log #152 makes **exclusively the logged-out marketing
  page**. Their mobile counterparts (`5543:7704` / `5543:7707` / `5543:7713`) sit in
  `Home Page — Premium Light — Mobile` `5543:7407`. So these three pages are reachable from a page
  that by definition has no session.
- **They are equally reachable from logged-in surfaces.** A file-wide text scan found **203**
  `Terms of Service` / `Privacy Policy` / `Contact Us` strings; the footer trio recurs on
  `Sports Page - when user is logged in` (`1009:673`), `Post's comment section expanded` (`949:73`),
  `Search page with trending topics` (`2876:4628`), and on the legal pages themselves.

**Conclusion: both auth states are genuinely reachable, so both are genuinely needed** — the same
justification Blog and Sports used. These pages correctly take the **full content-icon navbar**
(`header 4` / `header 7`), not the logo-only auth Top Bar, because they are ordinary site content
reachable mid-session, not a focused credential-entry step. (The auth Top Bar's own scope was fixed
by Decision Log #172 to `/login`, `/signup`, `/forgot-password`, `/reset-password` only.)

### 1.2 One correction to the brief's own arithmetic — 12 new frames, not 18

The brief's numbered steps specify, per page: **2 desktop frames** (step 1) + **2 mobile frames**
(step 2) + **2 old frames archived** (step 3). That is **4 new frames per page → 12 new frames
total**, plus 6 archived. The brief's summary line ("6 new frames per page × 3 pages = **18 new
frames total**, plus 6 old frames archived") double-counts the 2 archived frames as new, then counts
them again in the "plus 6 archived" clause.

**Built to the step-by-step spec: 12 new frames + 6 archived.** This matches the Blog and Articles
precedent exactly — each of those produced 4 new frames per page family (Desktop Logged In/Out,
Mobile Logged In/Out), never 6. Flagged rather than silently padding the count with two invented
extra frames per page that the brief never actually describes.

---

## 2. Method: how the pattern was derived (measured, not assumed)

Rather than reconstruct the split pattern from prose, the live Blog/Articles output was measured.

### 2.1 Desktop — navbar placement and the 81px gap

| Reference frame | Navbar instance | Placement | Content top | Gap |
|---|---|---|---|---|
| `Blog Page Desktop — Logged In` `5953:10771` | `Navbar — header 4` `5953:11272` | x0 y0, 1440×90, last child (topmost) | `Group 36` y=171 | **81** |
| `Blog Page Desktop — Logged Out` `5953:11364` | `Navbar — header 7` `5953:11866` | x0 y0, 1440×90 | `Group 36` y=171 | **81** |

Crucially, **all three legal desktop frames already carry `Group 36` at exactly y=171** — identical
to Blog's. So the desktop content needed **zero vertical repositioning**: dropping a 90px navbar at
y=0 lands the canonical 81px gap for free. The legacy `Group 7` nav (y 82–107) and `Group 103` logo
lockup (y 76–122) both sit inside that top band and were removed, not left stacked underneath.

### 2.2 Mobile — the 375→390 transform, derived by diffing archived vs. new Blog frames

Diffing `ARCHIVED — Blog Page Mobile` (`41:4`, 375px) against `Blog Page Mobile — Logged In`
(`5956:10960`, 390px) gives the rule unambiguously:

| Child | 375px x | 390px x | Δ |
|---|---|---|---|
| `Group 36` (w318) | 28 | 36 | +8 |
| `Group 42` / `44` / `45` / `46` (w335) | 20 | 28 | +8 |
| `Trending Topics` | 113 | 121 | +8 |
| `Group 55` footer (w375) | 0 | 0 | **width 375 → 390** |

So: **every non-full-bleed element shifts +8** (`(390−375)/2 = 7.5`, rounded to an integer — i.e.
this is a re-centring shift, not an arbitrary nudge), and **full-bleed elements stay at x=0 and widen
to 390**. Navbar instances are resized 428 → 390 and pinned x0 y0. Content y is untouched
(`Group 36` stays at y=144, giving an **80px** gap under the 64px mobile navbar).

### 2.3 Throwaway test proved a plain `frame.resize()` would corrupt this content

Per the Articles precedent, the reflow method was **tested before being committed to**, not assumed.
A clone of `Contact Us Mobile` was resized 375 → 390 and its children diffed:

| Child | dx | dw |
|---|---|---|
| `bx:menu` | **+12** | 0 |
| `Contact Us` | **+4** | 0 |
| `Group 22` | **+4** | 0 |
| `akar-icons:chevron-down` | **+12** | 0 |
| `Group 102` | **+1.16** | **+3.86** |

**5 of 18 children drifted, by four different amounts, and one was actually stretched** — Figma
applies each leaf's own constraints (`CENTER` / `MAX` / `SCALE`) during a parent resize, and GROUPs
have no constraints of their own, so their leaves resolve independently. A plain resize was therefore
rejected.

**Method used instead: reparent into a fresh 390px shell.** Clone the source → create a new
`figma.createFrame()` at 390×h, copying `fills`/`strokes`/`effects`/`clipsContent`/`cornerRadius`
from the source → snapshot every child's `x`/`y` → `appendChild` each child in z-order and
re-assert the snapshotted `x`/`y` → delete the clone. Cross-frame `appendChild` does not trigger
constraint resolution, and the explicit re-assert makes it deterministic regardless. Then, and only
then, apply the §2.2 transform. This is the same conclusion the Articles session reached, reached
independently by re-running the test on *this* content rather than inheriting the finding.

### 2.4 A deliberate, disclosed improvement on the Blog footer result

Blog's own 390px footer is **~4–5px off-centre** (measured: `Contact Us` centre at 199 vs. frame
centre 195; `Soccernity.` at 200.5; the `Terms of Service · Privacy Policy` pair at 199), because its
children were moved by a mix of +8 / +12 / +15 — the signature of a group resize resolving mixed
constraints.

This session applied the §2.2 rule **uniformly** instead: inside a full-bleed footer group, the
background rectangle widens to 390 and **every other child shifts by exactly +8**. Result, measured
on `Contact Us Mobile — Logged In`: `Contact Us` centre **195.0**, `Terms/Privacy` pair centre
**195.5**, `Copyright` centre **195.5**, against a frame centre of 195 — centred within 0.5px.

**This is a deviation from the literal precedent output, and it is an intentional one**: it applies
the precedent's own stated *rule* more consistently than the precedent's own *result* did. Flagged
here rather than passed off as identical. It does not change any copy, colour, or type.

---

## 3. The 12 new frames

All 12 sit in a single new row at **y = -26800**, in a region confirmed empty beforehand (the only
top-level nodes anywhere in `x ∈ [-20000, 8000], y ∈ [-27300, -14000]` were the two 3563-tall legacy
mobile frames bottoming out at y = -27231, and `Lineups — Mobile` far to the right at x = 7626).
Order matches the source row: Contact Us → Terms of Service → Privacy Policy; within each page,
Desktop Logged In → Desktop Logged Out → Mobile Logged In → Mobile Logged Out. 200px gap within a
page group, 600px between page groups.

### 3.1 Contact Us

| Variant | Frame node ID | Size | x | Navbar instance | → main component |
|---|---|---|---|---|---|
| **Desktop — Logged In** | **`6113:14053`** | 1440×2081 | -15510 | `6113:14108` `Navbar — header 4` | `2838:3502` `Property 1=header 4` |
| **Desktop — Logged Out** | **`6113:14199`** | 1440×2081 | -13870 | `6113:14254` `Navbar — header 7` | `2841:4104` `Property 1=header 7` |
| **Mobile — Logged In** | **`6115:14611`** | 390×1191 | -12230 | `6115:14612` `Navbar — header 4 — mobile` | `5386:6576` `Property 1=header 4 — mobile` |
| **Mobile — Logged Out** | **`6115:14684`** | 390×1191 | -11640 | `6115:14685` `Navbar — header 7 — mobile` | `5386:6575` `Property 1=header 7 — mobile` |

### 3.2 Terms of Service

| Variant | Frame node ID | Size | x | Navbar instance | → main component |
|---|---|---|---|---|---|
| **Desktop — Logged In** | **`6114:14222`** | 1440×2129 | -10650 | `6114:14261` `Navbar — header 4` | `2838:3502` |
| **Desktop — Logged Out** | **`6114:14352`** | 1440×2129 | -9010 | `6114:14391` `Navbar — header 7` | `2841:4104` |
| **Mobile — Logged In** | **`6116:14627`** | 390×3563 | -7370 | `6116:14628` `Navbar — header 4 — mobile` | `5386:6576` |
| **Mobile — Logged Out** | **`6116:14685`** | 390×3563 | -6780 | `6116:14686` `Navbar — header 7 — mobile` | `5386:6575` |

### 3.3 Privacy Policy

| Variant | Frame node ID | Size | x | Navbar instance | → main component |
|---|---|---|---|---|---|
| **Desktop — Logged In** | **`6114:14471`** | 1440×2129 | -5790 | `6114:14510` `Navbar — header 4` | `2838:3502` |
| **Desktop — Logged Out** | **`6114:14601`** | 1440×2129 | -4150 | `6114:14640` `Navbar — header 7` | `2841:4104` |
| **Mobile — Logged In** | **`6116:14734`** | 390×3563 | -2510 | `6116:14735` `Navbar — header 4 — mobile` | `5386:6576` |
| **Mobile — Logged Out** | **`6116:14792`** | 390×3563 | -1920 | `6116:14793` `Navbar — header 7 — mobile` | `5386:6575` |

### 3.4 Navbar confirmation (brief item 3)

**All 12 frames carry exactly one navbar instance, visible, at x0 y0, resolving to the correct
canonical component** — verified programmatically via `instance.mainComponent.id`, not by layer name:

- 6 desktop navbars: 1440×90 — three `header 4` (`2838:3502`), three `header 7` (`2841:4104`).
- 6 mobile navbars: resized 428 → **390**×64 — three `header 4 — mobile` (`5386:6576`), three
  `header 7 — mobile` (`5386:6575`).
- All four are variants of the single canonical set `Web app Navbar - Desktop and Mobile`
  (`2824:4309`). **No new navbar component was built.**

Measured gap between navbar bottom and first content child: **81px on all 6 desktop frames**, **80px
on all 6 mobile frames** — matching the Blog/Articles convention exactly on both breakpoints.

Screenshot-verified: `header 4` desktop renders the icon nav + messages glyph + avatar; `header 7`
desktop renders the icon nav + Login button; `header 4 — mobile` renders logo + search + messages +
avatar at 390px; `header 7 — mobile` renders logo + search + Login button at 390px, correctly
reflowed by its `SPACE_BETWEEN` auto-layout.

### 3.5 Legacy chrome removed (not hidden)

Removed from every clone before the navbar was added, matching the Blog/Articles precedent:

- **Desktop (all 3 pages):** `Group 7` — the live pre-redesign `Home / Community / Livescores /
  About Us` text nav — and `Group 103`, the old logo lockup.
- **Mobile (all 3 pages):** `bx:menu` — the old hamburger icon — and `Group 102`, the old logo
  lockup.

Post-build check on all 12 frames: **zero** children named `Group 7`, `Group 103`, `Group 102`, or
`bx:menu` remain. The originals keep all of theirs intact (they were archived, not edited).

### 3.6 Content preservation — verified node-by-node, zero drift

Every descendant of every new frame was compared against its source, by name+type path, at full
subtree depth:

| Frame | Source nodes | New nodes | **Anomalies** |
|---|---|---|---|
| Contact Us Desktop — Logged In / Out | 36 / 36 | 36 / 36 | **0 / 0** |
| Terms of Service Desktop — Logged In / Out | 20 / 20 | 20 / 20 | **0 / 0** |
| Privacy Policy Desktop — Logged In / Out | 20 / 20 | 20 / 20 | **0 / 0** |
| Contact Us Mobile — Logged In / Out | 38 / 38 | 38 / 38 | **0 / 0** |
| Terms of Service Mobile — Logged In / Out | 23 / 23 | 23 / 23 | **0 / 0** |
| Privacy Policy Mobile — Logged In / Out | 23 / 23 | 23 / 23 | **0 / 0** |

Desktop was checked for **exact** positional identity (dx=dy=dw=dh=0). Mobile was checked against
the §2.2 rule — every node had to be either exactly `dx=+8, dy=dw=dh=0` or exactly
`dx=0, dw=+15` from `x=0` (a full-bleed widen). **Any node that drifted by any other amount would
have been reported; none did.** Node counts match exactly, so nothing was dropped or duplicated
either.

**No copy was invented, rewritten, or removed** anywhere. The Contact Us form, the Terms of Service
and Privacy Policy bodies, the hero band ("Feel The Passion, Enjoy the Game."), and both footers are
byte-identical to the originals.

---

## 4. Archiving the 6 originals

### 4.1 Resume-point verification (done before any further writes)

On resuming after the rate-limit interruption, live state was checked rather than trusted:

- **8 frames existed and were correct** — 6 desktop (all `topGap: 81`, correct navbar main
  components, zero legacy chrome remaining) and the 2 Contact Us mobile frames (390 wide,
  `topGap: 80`, correct mobile navbar variants).
- **4 frames were genuinely missing** — Terms of Service Mobile ×2, Privacy Policy Mobile ×2.
- **No broken intermediate state.** Page top-level child count was 462 vs. 454 at session start —
  exactly +8, matching the 8 real frames, so no orphaned clone or empty shell had been left behind
  by the interruption. The throwaway resize-test frame (`ZZ TEMP RESIZE TEST`) had been correctly
  removed.
- All 6 originals were still `visible: true` and un-renamed — archiving had not yet run.

Nothing was rebuilt; the 4 missing frames were built and the sequence continued.

### 4.2 Reference check — run before archiving, all clean

For each of the 6 originals, four things were checked:

| Original | Inbound prototype reactions | Outbound reactions | Nested components w/ external instances | Flow starting point |
|---|---|---|---|---|
| `87:158` Contact Us Desktop | **0** | 0 | **0** (0 components inside) | no |
| `102:340` Terms of Service Desktop | **0** | 0 | **0** | no |
| `104:444` Privacy Policy Desktop | **0** | 0 | **0** | no |
| `96:253` Contact Us Mobile | **0** | 0 | **0** | no |
| `104:393` Terms of Service mobile | **0** | 0 | **0** | no |
| `104:474` Privacy Policy mobile | **0** | 0 | **0** | no |

Inbound reactions were found by scanning **every node on page `0:1`** for a `destinationId` matching
any of the six (this also covers overlay and scroll targets, which are expressed as reactions). None
of the six contains any `COMPONENT` or `COMPONENT_SET`, so no instance anywhere derives from them.
None is one of the page's 8 flow starting points.

**Nothing referenced any of the six. No link was broken by archiving them.**

### 4.3 Archived — hidden and renamed, not deleted

| Node ID | New name | `visible` | Children intact |
|---|---|---|---|
| `87:158` | `ARCHIVED — Contact Us Desktop (superseded by Contact Us Desktop — Logged In / — Logged Out)` | `false` | 5 ✓ |
| `102:340` | `ARCHIVED — Terms of Service Desktop (superseded by Terms of Service Desktop — Logged In / — Logged Out)` | `false` | 6 ✓ |
| `104:444` | `ARCHIVED — Privacy Policy Desktop (superseded by Privacy Policy Desktop — Logged In / — Logged Out)` | `false` | 6 ✓ |
| `96:253` | `ARCHIVED — Contact Us Mobile (375px — superseded by Contact Us Mobile — Logged In / — Logged Out at 390px)` | `false` | 18 ✓ |
| `104:393` | `ARCHIVED — Terms of Service mobile (375px — superseded by Terms of Service Mobile — Logged In / — Logged Out at 390px)` | `false` | 6 ✓ |
| `104:474` | `ARCHIVED — Privacy Policy mobile (375px — superseded by Privacy Policy Mobile — Logged In / — Logged Out at 390px)` | `false` | 6 ✓ |

Naming copies the file's own established convention verbatim, including the **em-dash** prefix and
the parenthetical "superseded by…" / "(375px — … at 390px)" forms used by
`ARCHIVED — Blog Page Desktop …` and `ARCHIVED — Articles Page mobile …`. **All six still exist with
every child intact; none was deleted.**

---

## 5. Paint / token audit (brief item 5)

Standing rules checked: palette-only, no `brand/green-tint-28`, Light mode only, no new colours.

| Frame | Total SOLID paints | Bound | Unbound | Off-palette | `green-tint-28` |
|---|---|---|---|---|---|
| Contact Us Desktop — Logged In `6113:14053` | 105 | 104 | **1** | `#D9D9D9` ×1 | **none** |
| Contact Us Desktop — Logged Out `6113:14199` | 98 | 97 | **1** | `#D9D9D9` ×1 | **none** |
| Contact Us Mobile — Logged In `6115:14611` | 50 | **50** | **0** | — | **none** |
| Contact Us Mobile — Logged Out `6115:14684` | 43 | **43** | **0** | — | **none** |
| Terms of Service Desktop — Logged In `6114:14222` | 91 | 90 | **1** | `#D9D9D9` ×1 | **none** |
| Terms of Service Desktop — Logged Out `6114:14352` | 84 | 83 | **1** | `#D9D9D9` ×1 | **none** |
| Terms of Service Mobile — Logged In `6116:14627` | 36 | **36** | **0** | — | **none** |
| Terms of Service Mobile — Logged Out `6116:14685` | 29 | **29** | **0** | — | **none** |
| Privacy Policy Desktop — Logged In `6114:14471` | 91 | 90 | **1** | `#D9D9D9` ×1 | **none** |
| Privacy Policy Desktop — Logged Out `6114:14601` | 84 | 83 | **1** | `#D9D9D9` ×1 | **none** |
| Privacy Policy Mobile — Logged In `6116:14734` | 36 | **36** | **0** | — | **none** |
| Privacy Policy Mobile — Logged Out `6116:14792` | 29 | **29** | **0** | — | **none** |
| **Total** | **776** | **770** | **6** | `#D9D9D9` ×6 | **0** |

**Bound tokens used, all from `Soccernity Theme` (`5096:2`), all Light mode:** `brand/navy`,
`brand/green`, `brand/green-tint` (12%), `brand/off-white` (via `color/background/page`),
`color/background/page`, `color/background/surface`, `color/text/primary`, `color/text/secondary`,
`color/text/on-navy`, `color/icon/inactive`. **Zero new colours introduced. Zero
`brand/green-tint-28`. Zero dark-mode bindings.**

### 5.1 The 6 unbound paints — disclosed, deliberately not fixed

All six are the **same node in the same place**: `Rectangle 14`, a **294×67 `#D9D9D9` grey pill** in
the desktop footer, one per desktop frame —
`6113:14086`, `6113:14232`, `6114:14237`, `6114:14367`, `6114:14486`, `6114:14616`.

This is **the exact defect Decision Log #174 already identified and fixed on the Blog Page desktop
frames** — same 294×67 geometry, same hex, same position in the same shared footer layout — which
the founder confirmed there is *a missing "Soccernity." wordmark*, not decoration. The mobile footers
on these same three pages render the wordmark correctly as real text, which corroborates it.

**Not fixed here, deliberately.** DL #174 scoped itself to "the 4 Blog Page frames only" and
explicitly left the equivalent `#D9D9D9` paints on `Articles Page Desktop` (`54:434`) and
`Articles Page mobile` (`87:80`) open as out-of-scope. This session's named scope is the navbar
retrofit; widening it to a third page family unilaterally would break that same scoping discipline.
Raised as a Decision Log candidate instead (§6, candidate **B**) so one pass can close all remaining
families together.

### 5.2 Non-SOLID paints — disclosed, correctly left alone

Two `IMAGE` paints per Logged In frame, one per Logged Out frame (18 total):

- **`Intersect` (1 per frame, all 12)** — the photographic fill of the "Feel The Passion, Enjoy the
  Game." hero band, inherited unchanged from the originals. Genuine photographic content; the same
  category as the Blog hero imagery, and not a token candidate.
- **`Ellipse 33` (1 per Logged In frame, 6 total)** — the user-avatar photo fill **inside the shared
  `header 4` / `header 4 — mobile` navbar instance**
  (`I…;2838:3579;2819:4082` / `I…;5387:7675;2819:4082`). This is the file's long-standing
  shared-component debt: it is not editable from an instance, and it is present on every logged-in
  screen in the file. Correctly excluded, not counted as a defect of these frames.

**No paint was force-bound to hit a "0 unbound" number.** In particular, the `#D9D9D9` pill was not
bound to `brand/green-tint` to clear the count — that would have disguised a missing wordmark as a
deliberate grey block, which is worse than leaving it visibly wrong and flagged.

### 5.3 Overlap check

**0 overlaps between the 12 new frames**, and **0 overlaps between any new frame and any visible
existing top-level node** on page `0:1` — verified by bounding-box intersection against all 462
top-level children.

---

## 6. Judgment calls, deviations, and new Decision Log candidates

| # | Item | Note |
|---|---|---|
| — | **Brief arithmetic** | The brief's "18 new frames total" double-counts the archived frames. Its own step-by-step spec describes 4 new frames per page (2 desktop + 2 mobile) = **12 new + 6 archived**, which is also exactly what Blog and Articles each produced. Built to the steps, not the summary line. §1.2. |
| — | **Mobile reflow method** | Plain `frame.resize()` was tested and rejected — it drifted 5 of 18 children by four different amounts and stretched one (§2.3). Used reparent-into-a-fresh-390px-shell instead, same conclusion as the Articles session, reached by re-testing on this content rather than inheriting the finding. Verified afterwards at full subtree depth: **0 drift anomalies across all 6 mobile frames**. |
| — | **Footer centring deviation** | Applied the +8 re-centring rule uniformly inside full-bleed footer groups, which lands the footer centred within 0.5px. Blog's own 390px footer is ~4–5px off-centre. This follows the precedent's *rule* more faithfully than its *output*; disclosed as a deviation rather than claimed as identical. §2.4. |
| — | **Mobile frame naming normalised** | Originals were `Terms of Service mobile` / `Privacy Policy mobile` (lowercase `m`). New frames use `… Mobile — Logged In/Out`, matching the canonical `Blog Page Mobile — Logged In` / `Articles Page Mobile — Logged In` convention. Archived names keep the original lowercase spelling for traceability. |
| — | **Desktop content not shifted** | Unlike Decision Log #198's Article Detail fix, no vertical shift was needed: all three legal desktop frames already had content starting at y=171, which yields the canonical 81px gap under a 90px navbar with no edit. Verified, not assumed. |
| **A** | **Legal body copy is Lorem ipsum** | **The Terms of Service and Privacy Policy bodies are placeholder Lorem ipsum**, inherited unchanged (correctly — this session had no mandate to write legal text). This is worth its own entry because it is not ordinary placeholder content: this is a minors' platform with real DPIA/GDPR/NDPA obligations, and CLAUDE.md non-negotiable #2 requires counsel review of any policy language. **`figma-to-code` must not ship these two screens as though the body text were real**, and drafting the real copy is a `safeguarding-drafter` → counsel deliverable, not a design task. |
| **B** | **`#D9D9D9` footer wordmark pill, 3rd family** | The 294×67 missing-wordmark pill Decision Log #174 fixed on the 4 Blog Page desktop frames is also present on the 6 new legal **desktop** frames (§5.1), and #174 itself left the `Articles Page` family open. Recommend one scoped `figma-design-system` pass applying #174's own fix (replace the pill with a real "Soccernity." text node bound to `color/text/on-navy`, Montserrat ExtraBold, 30px desktop) across **all** remaining families at once. |
| **C** | **Orphaned page-level `Contact Dropdown` group** | `87:250` — a top-level `GROUP` named "Contact Dropdown", 415×330 at `x=-13944, y=-29514`, sitting **outside any frame** and visually overlapping the (now archived) `Contact Us Mobile`. It appears to be the open-state of the Contact Us form's "Choose a category" select, detached from its parent screen. It was **not touched** (out of scope, and no new frame depends on it). Needs a decision: rebuild it as a real state on the new Contact Us frames, or delete it as a stray. |
| **D** | **No section banner over the new row** | The Blog/Articles section has a banner strip (`5942:12065`). These three legal pages have **never had one** — confirmed by scanning the original band, which contained only the 6 frames plus candidate C. The 12 new frames sit in a clean new row at y=-26800 with no section banner or label. Recommend adding one covering the new row, matching how every other section of the file is delimited. |
| **E** | **Stale `Copyright © 2022`** | Both footers still read "Copyright © 2022 Soccernity" — inherited verbatim, not introduced here. Same defect class the homepage rebuild found and fixed on its own footer; still live on these (and, by inspection, other) legacy footers. Not fixed, since it recurs across many frames and belongs in one file-wide copy pass. |
| **F** | **No prototype wiring on the new navbars** | The 12 new navbar instances carry no reactions, so the footer `Terms of Service` / `Privacy Policy` / `Contact Us` links elsewhere in the file still do not navigate to these screens. This matches the rest of the file (the Blog/Articles retrofits added none either), so it is consistent, not a regression — but the link targets now genuinely exist, so wiring them is newly possible if wanted. |

---

## 7. Summary of every node touched this session

**Created (12 frames + 12 navbar instances):**
`6113:14053`, `6113:14199`, `6115:14611`, `6115:14684`, `6114:14222`, `6114:14352`, `6116:14627`,
`6116:14685`, `6114:14471`, `6114:14601`, `6116:14734`, `6116:14792` — plus their navbar instances
`6113:14108`, `6113:14254`, `6115:14612`, `6115:14685`, `6114:14261`, `6114:14391`, `6116:14628`,
`6116:14686`, `6114:14510`, `6114:14640`, `6116:14735`, `6116:14793`.

**Mutated (6 — archived only, name + `visible` flag):**
`87:158`, `102:340`, `104:444`, `96:253`, `104:393`, `104:474`.

**Deleted:** only nodes *inside the new clones* — the cloned copies of `Group 7` / `Group 103` /
`bx:menu` / `Group 102`, plus the six temporary clone shells used during the reparent, and the
throwaway resize-test frame. **No node belonging to any pre-existing frame was deleted.**

**No other node in the file was touched.** No component was modified. No variable was created or
changed. No text was edited anywhere.

---

## 8. For the finalising session

- Branch off `main` (or off `sprint-2/articles-cleanup-moderation-fix-hygiene` if that branch/PR
  isn't merged yet — confirm current `main` state before choosing).
- Commit this report.
- **Append a forward-pointer to Decision Log #202's Status** — e.g. "Resolved: all three legal page
  families (Contact Us, Terms of Service, Privacy Policy) split into Desktop/Mobile × Logged In/Out
  with canonical navbar instances; 12 new frames, 6 originals archived; see
  `docs/sprint-2-legal-pages-navbar-retrofit-report.md`."
- **Transcribe the 6 new Decision Log candidates (A–F above)** into
  `docs/Soccernity_MVP_Build_Plan_v1.7.docx` Section 9 (Table 6), continuing from the live docx's
  current max entry number. Candidate **A** (Lorem-ipsum legal copy) is the one that matters most —
  it is a safeguarding/compliance item, not a design nicety.
- CLAUDE.md "Where things stand" bullet: this session closed Decision Log #202 by giving Contact Us /
  Terms of Service / Privacy Policy the same navbar-variant split Blog and Articles already had —
  12 new frames (desktop 1440px, mobile rebuilt at the canonical 390px), 6 legacy frames archived,
  0 `brand/green-tint-28`, 0 new colours, 0 overlaps, and 6 disclosed unbound paints that are all the
  same already-known missing-wordmark defect from Decision Log #174.
- Also worth folding into the standing Figma-authoring notes: **`frame.resize()` applies each leaf's
  own constraints even on a `layoutMode: NONE` frame, and GROUPs have no constraints of their own, so
  their leaves resolve independently and drift by differing amounts.** Reparenting children into a
  fresh, correctly-sized shell (then re-asserting each child's snapshotted `x`/`y`) is the safe way
  to change a frame's width without corrupting absolute-positioned legacy content. This corroborates
  the Articles session's finding on entirely different content.
- **Do NOT merge** — founder review, as with every design-stage session in this project.
