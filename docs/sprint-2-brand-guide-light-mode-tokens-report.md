# Sprint 2 — Brand Guide: Light Mode Tokens

Figma-only design work in file "Soccernity-MVP" (key `weZWWqggy9j13eX8bhFgs6`),
page "Soccernity" (`0:1`), new top-level frame **"Brand Guide — Light Mode
Tokens (Sprint 2)"** (`5182:6652`), by the `figma-design-system` agent, branch
`sprint-2/brand-guide-light-mode-tokens`. No application code was touched —
this is brand-guide documentation work plus one confirmed existing-node bug
fix, scoped strictly to the brand guide area per the task brief.

## 0. Prerequisite check

Read before changing anything, per this agent's own process: the existing
brand guide reference frames (`2286:1355` "Frame 396" — logo lockup +
wordmark; `2286:1366` "Frame 397" — footer social-icon bar) and their demo
composition (`Rectangle 219`/`220`/`221`, `2286:1329`/`1330`/`1381`), plus the
precedent frame this one is meant to pair with, **"Brand Guide — Dark Mode
Tokens (Sprint D)"** (`5100:2`). All colours used here trace back to one of
the two brand hex values (`#7BB929` green, `#282E65` navy) or to a disclosed,
reasoned derivation from them — nothing was invented from scratch.

**Sprint D's tokens are real Figma Variables, not just documented swatches**
— confirmed directly, not assumed: collection `Soccernity Theme`
(`VariableCollectionId:5096:2`), modes Light (`5096:0`) / Dark (`5096:1`), 10
variables, every Sprint D swatch's fill genuinely bound via
`boundVariables.color` (e.g. the `brand/green` swatch, `5100:4`, is bound to
`VariableID:5096:3`, not a hardcoded hex). This frame matches that
convention — see §2.

## 1. Frame identity

**`5182:6652`** — "Brand Guide — Light Mode Tokens (Sprint 2)", 1400 × 1392,
canvas `x = 79898, y = 16820`, explicit **Light** mode set on `Soccernity
Theme`. Placed directly below Sprint D's dark-mode frame (`5100:2`, which
spans `y = 14320`–`16720`) in the existing "Brand Guide" section, so the two
frames read as a vertically stacked matched pair. Verified empty before
placement — a scan of every top-level node in `x 78000–90000, y 10000–20000`
found no overlap with the chosen bounds (the nearest neighbour, "Desktop -
13" at `x = 78016–79456`, ends before this frame's `x = 79898` starts).

Visual format mirrors Sprint D's exactly, confirmed against its real layout
(read via `get_metadata`/`get_screenshot` before building, not guessed):
white frame background, `Inter Bold 36` black title, a row of `160×100`
swatches with `Inter Regular 16` labels beneath, and an `Inter Regular 18`
derivation/contrast-notes block underneath — same font sizes, same swatch
dimensions, same section-header note style ("DERIVATION", "\<X> CONTRAST
CHECK", "OPEN ITEMS FOR FOLLOW-UP").

## 2. The 5 tokens

| # | Name | Hex (Light) | Swatch/label node | Variable | Source |
|---|---|---|---|---|---|
| 1 | `brand/navy` | `#282E65` | `5182:6656`/`5182:6657` | `VariableID:5096:4` (existing) | Brand anchor colour, unchanged |
| 2 | `brand/green` | `#7BB929` | `5182:6658`/`5182:6659` | `VariableID:5096:3` (existing) | Brand accent colour, unchanged |
| 3 | `brand/green-tint 12%` | `#7BB929` @ 12% opacity | `5182:6660`/`5182:6661` | `VariableID:5096:5` (existing) | Reused as-is from Sprint D — see §2.3 |
| 4 | `color/text/on-navy` | `#FFFFFF` | `5182:6662`/`5182:6663` | `VariableID:5182:6654` (**new**) | Formalises an existing, already-correct usage — see §2.4 |
| 5 | `brand/off-white` | `#F4F5FB` | `5182:6664`/`5182:6665` | `VariableID:5182:6655` (**new**) | Derived this session — see §2.5 |

All five swatch fills are genuinely bound to these variables (via
`figma.variables.setBoundVariableForPaint`, the same mechanism Sprint D
used), not hardcoded hex — confirmed by reading each swatch's `fills` back
after creation.

### 2.1–2.2 `brand/navy` and `brand/green`

Straight reuse of the two existing brand variables, no change. Usage notes
documented on-canvas: navy as anchor (footer bars, wordmark, headings), green
as accent (icons, interactive accents) — matching how they're actually used
in `Frame 396`/`397` today.

### 2.3 `brand/green-tint 12%` — reused, not re-derived

Pulled directly from the existing Sprint D variable (`brand/green-tint`,
`VariableID:5096:5`), whose real Light-mode value is `#7BB929` at 12%
opacity — confirmed two ways before reuse: reading the variable's own
`valuesByMode` for the Light mode ID, and independently checking `Rectangle
221`'s (`2286:1381`) real fill, which is exactly `#7BB929` at `opacity:
0.12`. No new tint value was invented; this token's swatch binds to the same
variable ID Sprint D already created.

### 2.4 `color/text/on-navy` — new variable, formalising an existing correct pairing

**Value**: `#FFFFFF` in both Light and Dark mode (`VariableID:5182:6654`,
scopes `TEXT_FILL`/`STROKE_COLOR`). The navy footer surface itself doesn't
change between light/dark theme, so the correct text colour on it doesn't
either — same value both modes, by design, not an oversight.

**Evidence, not assumption**: `Frame 397`'s (`2286:1366`) Instagram/Twitter/
Facebook labels (`2286:1370`/`1374`/`1378`) were read directly and are
already solid `#FFFFFF` on `Rectangle 220`'s (`2286:1330`) `brand/navy`
fill — this token didn't change any colour, it named and bound a pairing
that was already correct but had no formal token behind it, the same gap
Sprint D closed for `text/on-green`.

### 2.5 `brand/off-white` — the new derived neutral (full reasoning)

**Value: `#F4F5FB`** (`VariableID:5182:6655`, Light mode; scopes
`FRAME_FILL`/`SHAPE_FILL`).

**Derivation, mirroring Sprint D's own method for its dark neutral, not
inventing a new approach**: Sprint D's own derivation note (still on
`5100:2`, read directly before deriving this token) states navy `#282E65` =
`HSL(234.1°, 43.3%, 27.6%)`, and derives `bg/page-dark` (`#0D0F21`) by
keeping that exact hue and saturation and **lowering** lightness to 9% —
"near-black, navy-tinted — not an arbitrary new dark blue" in Sprint D's own
words. `brand/off-white` applies the identical logic in the opposite
direction: same hue (`234.1°`) and saturation (`43.3%`) as navy, lightness
**raised** to 97% instead of lowered. `HSL(234.1°, 43.3%, 97%)` converts to
`#F4F5FB` (computed by hand via the standard HSL→RGB conversion, not
guessed).

**Why 97% and not 100%, disclosed explicitly**: a flat `L = 100%` would just
be pure white, which the task brief explicitly rules out as a base neutral
value ("no black exists anywhere in this palette" — and by the same logic,
using unmodified pure white would be the mirror-image mistake). `L = 97%`
keeps a faint, real navy-tinted cast so the swatch is visibly a *derived*
colour rather than an arbitrary flat white — the same reasoning Sprint D
gave for choosing `L = 9%` over `L = 0%` (true black) on the dark side. No
black, no pure white, used as either token's base value.

**A real, disclosed finding this derivation surfaced**: the *existing*
`color/background/page` variable's Light-mode value is a flat `#FFFFFF` —
confirmed directly by reading the live variable, not assumed — meaning it
was **not** derived from navy's hue/saturation the way Sprint D's dark-mode
`bg/page-dark` was. `brand/off-white` is therefore a genuinely new,
additional token, not a re-derivation of `color/background/page` itself.
Whether `brand/off-white` should eventually *replace* `color/background/
page`'s Light value, or remain a separate, more narrowly-scoped token, is
recorded as an open question in §5, not decided here.

**Dark-mode value, flagged rather than independently derived**: the
`brand/off-white` variable still needs *some* Dark-mode value (Figma
variables require one per mode in the collection). Rather than inventing a
new dark-mode neutral in a session scoped to light mode only, its Dark value
is set equal to the already-existing `color/background/page` dark value
(`#0D0F21`) — an inherited placeholder, not a fresh derivation, and called
out as needing its own review in §5 if this token is adopted more broadly.

## 3. Contrast checks (WCAG AA)

All combinations actually used by this token set were checked; none needed a
silent colour swap.

| Pair | Ratio | Result |
|---|---|---|
| `brand/navy` text on `brand/off-white` bg | 11.57:1 | PASS (AAA) |
| `brand/navy` text on white (existing precedent, for comparison) | 12.59:1 | PASS (AAA) |
| `color/text/on-navy` (white) on `brand/navy` bg | 12.59:1 | PASS (AAA) — confirmed against Frame 397's real rendered labels, not just computed |
| `brand/green` on `brand/off-white` bg | 2.19:1 | **FAILS AA** (needs 4.5:1 normal / 3:1 large) |

**The one failure, and how it's resolved — flagged, not silently avoided**:
green on the new light neutral background fails AA for both normal and
large text. This is a genuinely new check — Sprint D only ever tested green
against dark backgrounds and against itself as a CTA fill, never against a
light background as a text/icon colour. Resolution: green's usage note on
this token set is deliberately scoped to **icon and interactive-accent
fills only** (badges, borders, icon glyphs), never body/label text on a
light background — which is already how the file treats it elsewhere
(`color/text/primary` and `color/text/on-green` are both navy, never
green). No new colour was introduced to patch this; the existing navy text
tokens already cover the case green can't, so the fix was scope discipline
on green's documented usage, not a colour change.

## 4. Wordmark bug fix — the one existing-node edit in scope

**Node `2286:1364`** ("Soccernity" text inside `Frame 396`).

- **Before**: `#040404` (near-black), confirmed by direct fill inspection.
- **After**: `#282E65`, bound to the real `brand/navy` variable
  (`VariableID:5096:4`) — not just a matching hex, the actual token.

**Explicitly not a contrast fix** — near-black on the white background
technically measures a *higher* raw contrast ratio (~20:1) than navy will.
This was a brand-fidelity error: a third, off-palette colour with no basis
in Soccernity's two-colour brand, corrected per CLAUDE.md non-negotiable #3.
The corrected value still passes AAA on its white background at 12.59:1, so
legibility is unaffected. Verified visually via a screenshot of `Frame 396`
after the fix (wordmark renders navy, matching the logo mark's own navy
tones). This is the **only** existing-node edit made in this session —
everything else touched is new node creation inside the new frame.

## 5. Explicitly open — not decided here

1. **Should `brand/off-white` replace `color/background/page`'s flat
   `#FFFFFF` Light value, or stay a separate, more narrowly-scoped wash
   token?** A product/visual-design call, not a derivation question — not
   decided here.
2. **`brand/off-white`'s Dark-mode value is inherited, not independently
   derived** (§2.5) — needs its own review before this token is used more
   broadly than this light-mode documentation pass.
3. **Icon library standardisation (Build Plan Section 10) was not touched
   this session** — same open item Sprint D already flagged (15+ mixed
   iconify libraries across Navigation/Header/Dropdown/sample screens), out
   of scope for a token-only pass focused on the brand guide area.
4. **Real club crest colours** (Community Home Page Template, component
   `1306:7149`) remain untouched third-party trademark colours, not brand
   tokens. The crest-licensing question on the Match Details screen stays a
   separate legal/business flag per this agent's own boundaries — not
   addressed, not a design-token problem.

## 6. Explicitly NOT touched (per brief)

- **`5100:2`** — Sprint D's dark-mode frame — read only, never modified.
- **Every other screen/frame** outside the brand guide area (Community,
  Sports Hub, Admin Console, Auth, Banter Rooms, the Leaderboard frame,
  etc.) — untouched, confirmed by scope of all writes in this session (see
  §7's node ID list — every mutated/created ID is inside the new frame or is
  the one wordmark node).
- **No application code** — `apps/`, `services/` untouched. This report and
  the CLAUDE.md status update are the only file changes in this PR.

## 7. Node IDs

**Created**: root frame `5182:6652` · title `5182:6653` · swatches
`5182:6656`/`5182:6658`/`5182:6660`/`5182:6662`/`5182:6664` · labels
`5182:6657`/`5182:6659`/`5182:6661`/`5182:6663`/`5182:6665` · derivation
notes text `5184:2`. **New Figma Variables** (both in `VariableCollectionId:
5096:2`, "Soccernity Theme"): `color/text/on-navy` (`VariableID:5182:6654`),
`brand/off-white` (`VariableID:5182:6655`).

**Mutated (the one in-scope existing-node edit)**: `2286:1364` (wordmark
fill, `#040404` → `#282E65`).

**Read but not modified**: `5100:2` and its full contents (Sprint D
frame), `2286:1355`/`2286:1356` (Frame 396/its logo group), `2286:1366`–
`2286:1378` (Frame 397/its social rows), `2286:1329`/`2286:1330`/
`2286:1381` (Rectangle 219/220/221).

## 8. Verified vs. assumed

**Verified**: Sprint D's tokens are real, mode-bound Figma Variables (not
just documented swatches) before deciding to match that convention; the
new frame's placement is collision-free against every top-level node in its
canvas region; every new swatch's fill is genuinely bound to its variable
(re-read after creation, not just set-and-trusted); the wordmark's before/
after fill values via direct read; the `brand/green-tint 12%` reused value
against both the live variable and `Rectangle 221`'s real fill; the
`color/text/on-navy` white value against `Frame 397`'s real rendered
labels; all four contrast ratios computed by hand via the standard WCAG
relative-luminance formula; final visual result via full-frame screenshot
(§ images taken during the session) showing all five swatches legible,
including the white swatch against the white frame background (given a
thin `color/icon/inactive`-bound border specifically for on-canvas
documentation legibility — a presentation aid only, not a value change to
the `#FFFFFF` token itself).

**Assumed, not independently re-verified**: the exact byte-for-byte HSL→RGB
rounding Figma's own colour picker would produce for `HSL(234.1°, 43.3%,
97%)` — computed by hand to `#F4F5FB`, cross-checked once, but not run
through a second independent tool.

## 9. CLAUDE.md "Where things stand right now" — updated in this PR

Per CLAUDE.md's own rule, a status bullet for this token work is added in
the same PR, not deferred — see the new bullet directly following the
Sprint D dark-mode-tokens context in that section.
