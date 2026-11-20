# sprint-2/admin-panel-fast-follow — report

**Figma file:** `weZWWqggy9j13eX8bhFgs6` ("Soccernity-MVP"), page **Soccernity** `0:1`.
**Scope:** fast-follow to `sprint-2/admin-shell-componentization` (merged) — Items 1, 3, 4, 5 from
`docs/sprint-2-admin-panel-structural-pass-report.md`, plus Decision Log #178 (calendar `calendar 1`
retrofit).
**Date:** 2026-09-05. Figma design only; no app/backend code. No shell this session — the finalising
session handles branch / commit / docx / CLAUDE.md / PR, per this project's established pattern.

---

## 0. Precondition check — PASSED

Re-verified live before any work began, per the task's mandatory first step:

- `Admin Shell` COMPONENT_SET (`6014:12948`) confirmed live: parked at `x:60000, y:-30000`, 10
  variants (`Active=None/Dashboard/Articles/Users/Moderation/Categories/Contest/Competitions/Media/
  Settings`), matching the prior report exactly.
- Spot-checked 8 of the 29 screens across every height/topology combination (`2363:2244` @1184,
  `110:5` @1024, `917:218` @1024, `5566:8033` @1530, `5796:8753` @1234, `5794:8635` @1024,
  `5569:7813` @1184, `5403:6753` @1184) — every one has **exactly one** `Admin Shell` INSTANCE as a
  direct child, each with a valid `mainComponent` pointing at one of the 10 real variant component IDs.

Proceeded with all five items.

---

## 1. ITEM 1 — Icon standardization on Carbon (Decision Log #49 / #147 / #179)

### 1.1 Structural finding, flagged before building

The task brief's own framing ("navy 1.5px stroke/fill on a `brand/green-tint` 12% 31×31 r3 tile")
does **not** match the sidebar nav icons' actual structure — live inspection shows each icon lives in
a plain 24×24 `FRAME` (fill white, `boundVariables: null`, untouched historically and left untouched
here) containing one or more `VECTOR`/`RECTANGLE` glyph shapes, with **no separate tile background**
anywhere in the sidebar nav rows. The "31×31 green-tint tile" description matches a **different**
icon context in this file (the desktop navbar's `Clubs` icon added in `sprint-2/navbar-icon-set-
complete`), not the Admin Shell sidebar. **Preserved what's actually there**, not what the brief
described: icon glyphs are solid-fill shapes, colored `color/text/on-navy` (`VariableID:5182:6654`,
white) on the active navy row and `color/text/primary` (`VariableID:5096:8`, navy) on every inactive
row — confirmed and preserved exactly, on all 90 icon-row instances (9 icons × 10 variants).

### 1.2 Icons built (once, as reusable off-canvas templates, then cloned into all 10 variants)

All 8 new glyphs (Competitions needed no redraw) were designed as primitive-shape compositions
(rectangles, ellipses, a star-based gear, two custom vector paths, and Figma boolean union/subtract
operations), built once off-canvas, screenshot-verified in isolation, then cloned into every variant's
matching icon-frame slot.

| Nav item | Old icon | → New icon | Geometry | Fidelity note |
|---|---|---|---|---|
| Dashboard | `u:create-dashboard` | **`carbon:dashboard`** | 2×2 grid of 4 rounded squares (boolean union) | Faithful — same 2×2 panel motif as before, redrawn as 4 distinct cells |
| Articles | `u:document-layout-left` | **`carbon:document`** | Page silhouette (rounded rect) minus a folded-corner triangle minus 3 text-line rectangles (boolean subtract) | Faithful — drops the old "left rule" detail, adds a real folded-corner + text-line motif |
| Users | `fi:A_users` (rendered as **nothing** — DL #147) | **`carbon:user--multiple`** | Two overlapping person silhouettes (head ellipse + rounded-top body), boolean union | Faithful, and **fixes DL #147** — the new glyph has real, solid fills, unlike the old empty-fill vectors |
| Moderation | `el:ban-circle` | **`carbon:gavel`** (founder-approved) | Diagonal mallet: a thin handle + wider head rect, both rotated -45° about matching centers so they sit on one continuous diagonal, plus an unrotated base/sound-block bar — boolean union | First attempt (two independently-rotated rects) did not read as a gavel (looked like a checkmark); rebuilt using matched-center rotation math so handle and head form one continuous diagonal bar — confirmed by screenshot to read clearly as a gavel |
| Categories | `u:apps` | **`carbon:categories`** | 3 overlapping circles in a triangular cluster, boolean union | Faithful — reads as a clustering/categorization glyph, visually distinct from Dashboard's square grid |
| Contest | `u:chat-bubble-user` (misnamed pennant) | **`carbon:trophy`** (founder-approved) | Cup bowl (rounded rect) + two ring handles (each an ellipse-minus-ellipse) + stem + base, boolean union | Faithful trophy silhouette, confirmed by screenshot |
| Competitions | `u:chat-bubble-user` (stale layer name; geometry already correct per PR #131) | **`carbon:chart-column`** | **No redraw** — existing 3-rectangle bar-chart geometry is already correct | Layer/icon-frame renamed only, per the prior report's own finding |
| Media | `u:images` | **`carbon:image`** | Photo-frame ring (rounded rect minus inset rect, boolean subtract) + a small sun ellipse + a mountain-peak vector triangle, boolean union | Faithful — classic picture-frame-with-mountain-and-sun glyph |
| Settings | `u:setting` | **`carbon:settings`** | 8-point star (shallow inner radius, approximating gear teeth) minus a center-hole ellipse, boolean subtract | Faithful gear/cog silhouette |

**A real bug was found and fixed mid-build, disclosed rather than silently worked around**: Figma's
`figma.union()`/`figma.subtract()` boolean operations **discard the input shapes' own fills**,
resetting the resulting node to Figma's own default gray (`#D9D9D9`) regardless of what color the
input primitives were filled with. All 8 glyphs initially rendered pale gray instead of navy. Fixed
by explicitly re-setting `.fills` on each **resulting boolean-operation node** (not just its
now-irrelevant input primitives) after the operation completes. Confirmed via a temporary off-canvas
verification frame + screenshot before touching any real screen — a new Figma-authoring gotcha worth
folding into this project's standing Figma notes (see §8).

### 1.3 Application across all 10 variants

For each of the 9 nav-row icon frames across all 10 `Active` variants (90 icon-row edits total):
existing icon-frame children were removed, the corresponding new glyph template was cloned in and
centered within the 24×24 icon frame, its fill was rebound to `color/text/on-navy` (if that row is
the variant's own active row) or `color/text/primary` (if inactive) — **the active/inactive
determination was read live per row** (via each row's own fill's bound-variable ID, not assumed from
a lookup table), and the icon frame itself was renamed to its new `carbon:` name. Competitions rows
were renamed only, geometry untouched.

**Verified**: screenshotted the full sidebar nav block for `Active=Dashboard` (Dashboard row active,
white icon/label on navy; all 8 other icons navy on white) and `Active=Moderation` (Moderation row
active, white gavel icon/label on navy; all others navy) — both render correctly, confirming the
active/inactive color-swap logic works across variants, not just visually verified on one.

**Tile treatment / token bindings preserved exactly**: no tile background was added (none existed to
preserve — see §1.1); active-row icon color is `color/text/on-navy` (`VariableID:5182:6654`) and
inactive-row icon color is `color/text/primary` (`VariableID:5096:8`) on every one of the 90 icon
instances, confirmed programmatically during application (not just visually).

---

## 2. ITEM 3 — Frame height normalization (Decision Log #50, resolved via #177: 1184 is a FLOOR)

### 2.1 Live re-derivation (not trusted from the prior report)

Re-queried all 16 candidate screens directly: confirmed all are `FRAME` type (not `GROUP` — meaning
`resize()` changes canvas dimensions only, without scaling children, which is what's wanted), all
genuinely still at `1024` height, and checked every non-shell content child's `y + height` for
bottom-anchoring risk. 15 of the 16 had `maxContentBottom` safely inside 1024 (mostly ~970–978); one
(**Settings - Delete Role**, `5403:7205`) had a content child at exactly `bottom: 1024` — investigated
before touching anything (see §2.3).

### 2.2 15 plain screens grown 1024 → 1184

| # | Screen | Node ID | Shell instance |
|---|---|---|---|
| 1 | Dashboard | `110:5` | `6044:2` |
| 2 | Articles | `123:56` | `6044:344` |
| 3 | Articles - Create Post | `124:313` | `6044:418` |
| 4 | Categories | `128:488` | `6044:12510` |
| 5 | Settings | `1658:2303` | `6044:12584` |
| 6 | Settings - Edit role | `1658:2592` | `6044:12658` |
| 7 | Settings - Add new role | `1658:2456` | `6044:12732` |
| 8 | Users - team members | `917:218` | `6044:12806` |
| 9 | Media | `361:553` | `6044:12880` |
| 10 | Media - Media Upload - step 1 | `916:2362` | `6044:12954` |
| 11 | Media - Media Upload - step 2 | `917:24` | `6044:13028` |
| 12 | Media - Media Preview | `396:442` | `6044:13102` |
| 13 | Categories - Add Category | `138:93` | `6044:13176` |
| 14 | Admin — Moderation Queue | `5794:8635` | `6044:14064` |
| 15 | Admin — Report Detail & Action | `5796:8635` | `6044:14138` |

For each: screen frame resized `1440×1024 → 1440×1184`; shell instance explicitly resized to match
(**confirmed the instance's own top-level `constraints` relative to its parent screen are `{horizontal:
MIN, vertical: MIN}`, i.e. pinned, NOT stretch** — so the instance does **not** auto-grow when its
parent frame is resized; it had to be resized explicitly, which this pass did for all 16). The
component's own *internal* pieces (sidebar wash, nav block) do stretch correctly once the instance
itself is resized, per the componentization session's own constraint setup — confirmed working, not
just assumed (see §3). **Every one of the 15 screens' content children were read before and after
resize and compared by exact JSON equality — all 15 came back `contentUnchanged: true`, zero pixel
drift.**

### 2.3 The 16th screen — Settings - Delete Role (`5403:7205`), a scrim/modal screen requiring extra care

Live inspection found a `Scrim` node (`5404:7369`) sized exactly `1440×1024` (full-bleed) and a
`Confirm Dialog` (`5404:7370`) vertically centered within it. Growing the frame without also growing
the scrim would have left a ~160px unscrimmed gap exposed at the bottom, and left the dialog
off-center. Handled explicitly, not left to the generic procedure:
- Screen frame and shell instance resized to 1184, same as the other 15.
- **Scrim explicitly resized to `1440×1184`** to keep full-bleed coverage.
- **Confirm Dialog recentered**: `y` recomputed from `(1184 − dialogHeight) / 2` (was previously
  centered in 1024) — moved from `y=404` to `y=484`.
- Every other content child's `x, y` re-verified unchanged (`otherContentUnchanged: true`).
- Screenshot-verified: sidebar/topbar span the full new height, scrim covers edge-to-edge, dialog is
  visually centered, no gap.

### 2.4 The 2 taller screens — confirmed left alone

`Admin — Appeal Review` (`5796:8753`) and `Admin — Create Competition` (`5566:8033`) were re-queried
directly after the above and confirmed **unchanged**: `1234` and `1530` respectively. Not touched at
any point.

---

## 3. ITEM 4 — Sidebar geometry unification (Decision Log #151) — CONFIRMED, not redone

Per the task's own instruction, this was expected to already fall out of the componentized shell's
`SPACE_BETWEEN` nav-block constraint from the prior session — **confirmed live via screenshot on all 3
requested cases, no component fix needed**:

- **(a) A screen at 1184 that was already 1184 before Item 3** — `Contest - Contest Task tab`
  (`2363:2244`). Screenshot: Settings row sits flush at the sidebar's bottom edge.
- **(b) A screen that just grew 1024 → 1184 via Item 3** — `Dashboard` (`110:5`). Screenshot: Settings
  row sits flush at the bottom, with the extra bottom whitespace correctly absorbed above it (between
  the "Media" row and "Settings", not below Settings).
- **(c) The 1530 screen** — `Admin — Create Competition` (`5566:8033`). Screenshot: Settings row sits
  flush at the bottom at this much taller height too.

All three render identically correctly. **No component-level fix was needed.**

---

## 4. ITEM 5 — Top-bar action button KEEP/LOSE (Decision Log #51)

### 4.1 Pre-verification of in-content buttons on every LOSE screen (done BEFORE removing anything)

All 16 claimed LOSE screens were checked live for a genuine in-content submit/action button by
searching every descendant `TEXT` node for the expected label text, **excluding matches that were
inside the shell instance itself** (which would just be the current/about-to-change top-bar label, not
real content). **All 16 confirmed to have a real, non-shell content button**:

| Screen | In-content button confirmed |
|---|---|
| Articles - Create Post | "Submit Post" |
| Categories - Add Category | "Submit" |
| Settings - Add new role | "Submit" |
| Settings - Edit role | "Submit" |
| Media - Media Upload - step 1 | "Upload" |
| Media - Media Upload - step 2 | "Upload" |
| Contest - Create Task | "Create Task" (in-content, distinct from the shell's own) |
| Contest - Edit Task | "Save Changes" |
| Contest - Schedule Task | "Schedule Task" / calendar's own "Schedule" |
| Admin - Create Competition | "Create Competition" (×2, in-content) |
| Admin - Report Detail & Action | "Dismiss Report", "Remove Content", "Warn User" (3 navy action buttons) |
| Admin - Appeal Review | "Uphold Original Decision", "Overturn Decision" |
| Contest - Delete Task (modal) | "Cancel" / "Delete Task" |
| Settings - Delete Role (modal) | "Cancel" / "Delete Role" |
| Contest - Task Scheduled (Success) (modal) | "View schedule" / "Done" |
| Admin - Competition Created (Success) (modal) | "View competition board" |

**No LOSE screen was missing its claimed in-content button** — every one was applied as instructed,
none needed the "leave the top-bar button alone" fallback.

### 4.2 Final state — all 29 screens (live-read after every mutation, not assumed)

| # | Screen | Height | Active | Show Action Button | Action Label |
|---|---|---|---|---|---|
| 1 | Contest - Contest Task tab | 1184 | Contest | **true** | Create Task |
| 2 | Contest - scheduled contest task tab | 1184 | Contest | **true** | Create Task |
| 3 | Dashboard | 1184 | Dashboard | false | *(already removed)* |
| 4 | Articles | 1184 | Articles | **true** | Create Article |
| 5 | Articles - Create Post | 1184 | Articles | **false** | — |
| 6 | Categories | 1184 | Categories | **true** | Add Category |
| 7 | Settings | 1184 | Settings | **true** | Add Role |
| 8 | Settings - Edit role | 1184 | Settings | **false** | — |
| 9 | Settings - Add new role | 1184 | Settings | **false** | — |
| 10 | Users - team members | 1184 | Users | **true** | Add Member |
| 11 | Media | 1184 | Media | **true** | Add Media |
| 12 | Media - Media Upload - step 1 | 1184 | Media | **false** | — |
| 13 | Media - Media Upload - step 2 | 1184 | Media | **false** | — |
| 14 | Media - Media Preview | 1184 | Media | false | *(already removed)* |
| 15 | Categories - Add Category | 1184 | Categories | **false** | — |
| 16 | Contest - Create Task | 1184 | Contest | **false** | — |
| 17 | Contest - Schedule Task | 1184 | Contest | **false** | — |
| 18 | Contest - Edit Task | 1184 | Contest | **false** | — |
| 19 | Contest - Search Task | 1184 | Contest | **true** | Create Task |
| 20 | Contest - Delete Task | 1184 | Contest | **false** | — |
| 21 | Settings - Delete Role | 1184 | Settings | **false** | — |
| 22 | Admin - Admin Profile | 1184 | None | false | *(already removed)* |
| 23 | Contest - Empty State | 1184 | Contest | **true** | Create Task |
| 24 | Contest - Task Scheduled (Success) | 1184 | Contest | **false** | — |
| 25 | Admin — Create Competition | **1530** *(unchanged)* | Competitions | **false** | — |
| 26 | Admin — Competition Created (Success) | 1184 | Competitions | **false** | — |
| 27 | Admin — Moderation Queue | 1184 | Moderation | **true** | **Filter** |
| 28 | Admin — Report Detail & Action | 1184 | Moderation | **false** | — |
| 29 | Admin — Appeal Review | **1234** *(unchanged)* | Moderation | **false** | — |

**Summary: KEEP 10 (9 original + Moderation Queue's special case) / LOSE 16 / already-removed 3.**
Every value above was read directly from each instance's live `componentProperties` after mutation,
not assumed from the plan.

### 4.3 Admin — Moderation Queue special case — done, with one real problem found and disclosed

Set `Show Action Button = true`, `Action Label = "Filter"` on the shared component slot, per
instruction. Then added a **second, standalone button, genuinely outside the Admin Shell component** —
a new `Button — Export Queue` frame (`6073:14056`), white fill / navy 1px stroke / navy label,
appended directly into this screen's own `Content (5794:8710) > Top Row (5794:8711)` (confirmed this
exact path exists and is a real, live `HORIZONTAL` auto-layout frame — not invented). Because `Top
Row` is a genuine auto-layout container, appending the new button let Figma's own layout engine
position it correctly in the existing flow (after the "Open Reports (6)" / "Appeals (2)" tabs, with
matching gap), rather than needing manual absolute placement — confirmed via `topRowLayoutMode:
"HORIZONTAL"`. Screenshot-verified: "Export Queue" renders cleanly next to the tabs, at the top of the
content area.

**A real, pre-existing layout defect was found while doing this — flagged, not silently fixed, and not
introduced by this session's own Item 3/4/5 edits:**

The shared component's own "Filter" button (`Frame 5750`, inside the persistent top-bar row `Frame
5768`) is **not actually visible anywhere on this screen**, despite the property now being correctly
set to `true`. Root cause, confirmed by direct geometry comparison, not guessed:
- `Frame 5768` (search bar + action button) sits at absolute `(279, 186)` to `(1300, 227)` — this is
  the shell's own persistent top-bar row, unchanged by any edit in this session.
- This screen's own `Content` frame (`5794:8710`) starts at absolute `y=45`, and its `Table` sub-frame
  spans absolute `y=99` to `y=424` — **fully overlapping** `Frame 5768`'s `y=186`–`227` band, and wide
  enough (`x=300`–`1400`) to fully cover it horizontally too (`Frame 5768` spans `x=279`–`1300`).
- Because `Content` is a later sibling than the `Admin Shell` instance in the screen's own children
  array (drawn on top), and the `Table`'s rows have opaque backgrounds, the entire search bar +
  action-button row is **rendered underneath this screen's own content** and never visible — confirmed
  directly in the rendered screenshot (§4.3's own screenshot shows no search bar and no "Filter"
  button anywhere, only "Log Out" and the new "Export Queue").
- This is **pre-existing** (unrelated to Item 3/4/5's own edits — `Content`'s `y=45` position was never
  touched by this session, and `Frame 5768`'s position is pinned `MIN`/`MIN`, unaffected by the height
  growth in Item 3). It most likely dates to whichever earlier pass first built this screen's `Content`
  frame without accounting for the shared top-bar row's own absolute position (unlike, e.g., `Users -
  team members`, whose `Add Member` button **is** visible — confirmed by a direct screenshot
  comparison in this same session — because that screen's own content starts low enough to clear the
  top-bar row).
- **Same root cause likely applies to `Admin — Report Detail & Action` and `Admin — Appeal Review`**
  (both also `Active=Moderation`, both share the same sparse single-`Content`-child structure) — but
  since both are `Show Action Button = false` (LOSE) by this session's own design, there is no button
  to hide there, so it produces no visible defect on those two.
- **Not fixed here** — repositioning `Content` on this screen would be a real layout change beyond
  this task's "toggle the shared component's properties, don't redesign layout" scope, and touching it
  wasn't requested. **Flagged as a new Decision Log candidate** (see §7) for the founder to decide:
  either move `Content` down on this one screen to actually reveal the Filter button, or accept that
  "Filter" is a real, wired but currently-invisible feature until a future content-layout pass fixes
  it.

---

## 5. DECISION LOG #178 — `calendar 1` retrofit

Target: `calendar 1` (`2363:2242`, 308×562, the variant of `Calendar for scheduled task` `2363:2033`
that is **not** instanced anywhere in the file — confirmed 0 instances, same as the prior session's own
finding).

### 5.1 Structure differs slightly from `calendar 2`, reconciled node-by-node, not assumed identical

`calendar 1` is a narrower, single-column layout with its own distinct node IDs — not a literal
structural clone of `calendar 2`. Every node was mapped to its closest analogous element in `calendar
2`'s already-completed treatment before binding, and two real structural differences were found and
handled explicitly rather than assumed away:

- **Two `Cancel`/`Schedule` buttons already existed with different starting states**: `Cancel`'s button
  background (`2363:2099`, "Rectangle 310") had its **fill's own `.visible` flag already `false`**
  (outline-only button, by original design) while its stroke was unbound navy — bound the stroke to
  `brand/navy` and the (invisible-anyway) fill too, for full audit cleanliness, confirmed the fill
  stayed invisible after binding. `Schedule`'s button background (a **different** node, also named
  "Rectangle 310", `2363:2102`) and the `Cancel` label text (`2363:2100`) were **already correctly
  bound** to `brand/navy` / `color/text/primary` respectively before this pass — left untouched, not
  re-bound.
- **The selected-day highlight disc** (`Days` frame `2363:2172`) was **already bound** to `brand/navy`
  — only its white numeral (`2363:2173`, "1") needed binding, to `color/text/on-navy`, for contrast.

### 5.2 Tokens applied (same `Soccernity Theme` Light-mode set `calendar 2` used)

| Token | ID | Applied to |
|---|---|---|
| `color/text/primary` | `VariableID:5096:8` | Month heading, both nav-arrow vectors, 24 day-number texts (8–31), "Set time" label (fixing an off-palette `#040404` near-black), 1 hidden vector (`Rectangle 296`, the "Set time" caret — safe to bind despite being hidden, confirmed no visual effect since `visible:false` is unaffected by paint binding) |
| `color/text/on-navy` | `VariableID:5182:6654` | Selected-day "1" numeral, "Schedule" button label |
| `color/text/secondary` | `VariableID:5096:9` | 7 weekday labels (Sun–Sat) + 14 time-picker digit/label texts (`AM`, two rows of `06 27 54`) |
| `color/icon/inactive` | `VariableID:5097:2` | Heading divider line, both time-box (`Frame 574`/`Frame 575`) borders |
| `brand/navy` | `VariableID:5096:4` | Cancel button's rect (fill + stroke) |
| `color/background/surface` | `VariableID:5096:7` | 2 icon-instance backdrop fills (nav-arrow icon frames) + 34 "Days" cell background frames |

**One disclosed, deliberate judgment call**: the 14 time-picker texts (`AM`/digit rows) were a genuine
neutral grey (`#4E4E4E`-ish, not a navy-derived shade) in the original — unlike `calendar 2`'s
equivalent nodes, which happened to already be bound to `color/text/primary` before that pass ever
touched them. There is no neutral-grey token in the Soccernity Theme, so these were bound to
`color/text/secondary` (a muted, navy-at-70%-opacity token) as the closest real semantic match —
a small, visible hue shift (neutral grey → slightly blue-tinted grey) in exchange for being on-palette,
consistent with how this file's other muted/secondary text is already styled. Flagged here, not
silently done.

### 5.3 Deliberately left unbound — 1 paint, disclosed (exact precedent match to `calendar 2`)

| Node | Value | Why left |
|---|---|---|
| `2363:2107` "Rectangle 314" (hidden frosted panel) | `#FFFFFF` @ opacity 0.9 | Identical to `calendar 2`'s own disclosed frosted-panel exception — binding to `color/background/surface` would force the paint's opacity to `1` (the documented "a variable-bound paint takes its alpha from the variable, not the paint's own opacity" gotcha), destroying the frosted effect. Left exactly as found. |

### 5.4 Final paint-binding count (measured)

**100 bound / 4 unbound-visible (disclosed) / 1 unbound-hidden (disclosed)** — total 105 paints,
matching the original pre-pass count exactly (no paints were added or removed, only rebound).

The 4 disclosed unbound-visible paints are the **exact same category `calendar 2` already
documented and left alone**: 4 adjacent-month trailing day numerals (`"25"`, `"26"`, `"27"`, `"28"` —
node IDs `2363:2231`, `2363:2235`, `2363:2239`, `2363:2241`) rendered at `opacity: 0` (invisible by
design, to show a partial trailing week) — binding any of these to a token would force the token's own
opacity onto the paint and make the previously-invisible numerals appear, which was tested and
reverted, matching `calendar 2`'s own precedent exactly. **0 count discrepancy vs. `calendar 2`'s own
5-total-disclosed figure** (4 + 1 here vs. `calendar 2`'s 4 + 1 — same shape).

Screenshot-verified in isolation: renders cleanly — navy heading and day numbers, muted weekday row,
navy selected-day disc with white "1", navy "Set time" heading, three-row muted/highlighted time
picker (top and bottom rows correctly muted secondary, middle row correctly bold navy — unchanged, it
was already bound), outlined navy "Cancel" and solid navy "Schedule" buttons. No layout shift, no
newly-revealed invisible elements.

---

## 6. Summary answers to the brief's 8 report questions

1. **Precondition check**: passed (§0).
2. **9-icon mapping as applied**: full table in §1.2; tile treatment/token bindings preserved exactly
   as they actually exist in the file (§1.1), not as the brief assumed.
3. **16 screens grown 1024→1184**: full list in §2.2 + the 16th (scrim screen, §2.3); the 2 taller
   screens (`Admin — Appeal Review` 1234, `Admin — Create Competition` 1530) confirmed untouched (§2.4).
4. **Sidebar bottom-pin confirmed on all 3 required screenshots** (§3) — no component fix was needed.
5. **Final KEEP/LOSE state for all 29 screens**: full table in §4.2. Every claimed LOSE screen's
   in-content button was verified to genuinely exist before removal (§4.1) — none needed the
   leave-alone fallback.
6. **Moderation Queue's final two-button layout**: `Filter` (component slot, `6044:14064`, currently
   NOT visually visible — see the disclosed defect in §4.3) + `Export Queue` (`6073:14056`, standalone,
   inside `Content > Top Row`, confirmed visible in the rendered screenshot).
7. **Calendar 1's final paint count**: **100 bound / 4 unbound-visible (disclosed) / 1 unbound-hidden
   (disclosed)** — see §5.4.
8. **Judgment calls / deviations / new Decision Log candidates**: see §7 below.

---

## 7. New Decision Log candidates

| # | Decision needed | Raised in | Status |
|---|---|---|---|
| **(next available)** | **A pre-existing, real layout defect on `Admin — Moderation Queue` (`5794:8635`) makes its own top-bar action button structurally invisible**, discovered while implementing this screen's founder-resolved "Filter + Export Queue" two-button design. This screen's own `Content` frame starts at absolute `y=45` and its `Table` sub-frame (opaque rows) spans `y=99`–`424`, fully overlapping the shared shell's persistent top-bar row (`Frame 5768`, `y=186`–`227`) both vertically and horizontally; since `Content` is a later sibling than the shell instance (drawn on top), the entire search bar + action button are rendered underneath the table and never visible. `Show Action Button = true` / `Action Label = "Filter"` were set correctly per instruction and are real, live, correctly-bound property values — they simply produce no visible change on this specific screen today. The same root-cause structure exists on `Admin — Report Detail & Action` and `Admin — Appeal Review` (both `Active=Moderation`, same sparse layout), but produces no visible defect there since both are `Show Action Button = false` by this session's own design. **Recommendation: a small, scoped follow-up should move this screen's own `Content` frame down (e.g. to the same `y≈95` convention other 1024/1184 Admin screens use) so the "Filter" button — a real, founder-requested feature — actually renders.** Not fixed in this session: repositioning screen content is layout redesign, outside this task's "toggle the shared component" scope. | `sprint-2/admin-panel-fast-follow` | Open — flagged, not fixed; recommend a scoped follow-up on `5794:8635`'s (and possibly its two siblings') `Content` frame position |
| **(next available)** | **New Figma-authoring gotcha, worth folding into this project's standing Figma notes**: `figma.union()` / `figma.subtract()` (and presumably `figma.intersect()`/`figma.exclude()`) **discard the input shapes' own fills**, resetting the resulting `BOOLEAN_OPERATION` node to Figma's own default gray (`#D9D9D9`) regardless of what color the input primitives were filled with. The fix must be applied to the **resulting boolean node itself**, not its (now-irrelevant, consumed) input primitives. Found and fixed while building the 8 new Admin Shell nav icons (all 8 initially rendered pale gray before this was caught and fixed via a verification screenshot). Distinct from, but adjacent to, this project's already-documented "a variable-bound paint takes its alpha from the variable, not the paint's own opacity" gotcha and the "`createInstance()` resets fractional-opacity bound paints" gotcha found in `sprint-2/admin-shell-componentization`. | `sprint-2/admin-panel-fast-follow` | Open — fix applied locally to all 8 icon builds in this session; recommend folding into the file-wide Figma-notes gotcha list |

---

## 8. Node IDs reference

**New icon glyph templates** (off-canvas, `x≈60000`, `y≈-27000`, kept as clone sources — do not delete):
`carbon:dashboard-glyph` `6065:13145`, `carbon:document-glyph` `6065:13151`,
`carbon:user--multiple-glyph` `6065:13156`, `carbon:gavel-glyph` `6067:13144` (rebuilt version — the
original `6065:13160` was deleted mid-session), `carbon:categories-glyph` `6065:13164`,
`carbon:trophy-glyph` `6065:13174`, `carbon:image-glyph` `6065:13180`, `carbon:settings-glyph`
`6065:13183`.

**New standalone button**: `Button — Export Queue` `6073:14056`, inside `Admin — Moderation Queue`'s
`Content (5794:8710) > Top Row (5794:8711)`.

**Calendar 1 mutated nodes**: 85 paint-binding calls across the `2363:2242` subtree (month heading,
nav arrows, weekday labels, 24 day-number texts, 34 "Days" cell backgrounds, selected-day numeral,
2 icon-instance backdrops, heading divider, 2 time-box borders, `Cancel` button rect, `Schedule` button
label, `Set time` label, hidden caret vector, 14 time-picker texts). Deliberately unbound and disclosed:
`2363:2107` (frosted panel) and the 4 opacity-0 trailing-day numerals `2363:2231/2235/2239/2241`.

---

## 9. For the finalising session

- Branch `sprint-2/admin-panel-fast-follow` off `main`; commit this report.
- Transcribe the 2 new Decision Log candidates (§7) into `docs/Soccernity_MVP_Build_Plan_v1.7.docx`
  Section 9 (Table 6), continuing from the live docx's current max entry number (confirm live, per
  this project's own recurring numbering-drift caution).
- Append a forward-pointer to Decision Log **#53**'s Status noting `calendar 1` is now also fully
  retrofitted (100 bound / 5 disclosed-unbound), closing out the item the prior session's #178 left
  open.
- Append forward-pointers to **#49 / #50 / #51 / #151 / #147 / #179** noting Items 1/3/4/5 are now
  executed (not just planned) — #147 specifically closed by the new `carbon:user--multiple` glyph
  having real fills.
- CLAUDE.md "Where things stand" bullet: Items 1, 3, 4, 5 of the Admin Panel structural pass are now
  DONE (icon standardization on Carbon across all 10 Admin Shell variants; 16 screens grown 1024→1184
  with the 2 legitimately-taller screens left alone; sidebar bottom-pin confirmed working with no
  component fix needed; top-bar action button KEEP/LOSE applied to all 29 screens including
  Moderation Queue's two-button special case) — plus Decision Log #178 (calendar `calendar 1`
  retrofit) is now also done. One new real defect was found and flagged, not fixed: Admin — Moderation
  Queue's own "Filter" button is correctly configured but not actually visible due to a pre-existing
  content-layout overlap on that screen — recommend a small scoped follow-up.
- **Do NOT merge** — founder review, as with every design-stage PR in this project.
- Only Figma changes this session: the `Admin Shell` COMPONENT_SET's 9 icon slots across all 10
  variants; 16 screens' + their shell instances' heights (+ one scrim/dialog reposition on
  `5403:7205`); all 29 screens' `Show Action Button`/`Action Label` properties; one new standalone
  button on `5794:8635`; the `calendar 1` (`2363:2242`) subtree's paint bindings. No other node in the
  file was touched.
