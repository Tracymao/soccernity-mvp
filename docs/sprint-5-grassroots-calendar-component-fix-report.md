# Sprint 5 — Calendar component fix for Grassroots reuse (Figma design)

**Agent:** `figma-design-system` · **Date:** 2026-09-08 · **Branch:** `sprint-5/grassroots-calendar-component-fix`
**Scope:** Figma design only — no `apps/*` or `services/api` code, nothing merged, no shell commands run.
Finalising shell session applies the branch/commit/docx/CLAUDE.md/PR (same pattern as PRs #98/#102/#110/#130/#151/#216).

Resolves **Decision Log #257** (calendar carries an inherited time row + action buttons; no mobile
variant; "January 2022" sample month). **Decision Log #258** (teams-browse screen + Grassroots nav
entry point) is unaffected and stays **Open**.

---

## 1. What changed in Figma — node IDs

**File:** "Soccernity-MVP" (`weZWWqggy9j13eX8bhFgs6`), page `0:1` ("Soccernity"). Component set
**`Calendar for scheduled task ` (`2365:2033`)**, parked at `x 49716, y −26607`.

### Created

| Node | ID | Notes |
|---|---|---|
| Variant component `Property 1=calendar 2 — mobile` | **`6393:17791`** | 3rd variant in set `2365:2033`. 308 × 562. Cloned from `calendar 1` (`2363:2242`) — single-column month, the reference structure for a 390px frame. |
| └ its `Group 825` (time row + Cancel/Schedule) | `6393:17888` | `componentPropertyReferences.visible` → `Show Time & Actions#6392:0` |
| └ its `Month label` text | `6393:17794` | "Month YYYY" |
| Calendar instance on Grassroots mobile frame 3 | **`6397:17793`** | inside `Field — Match date` (`6376:17693`), `Show Time & Actions = false`, resized 308 × 300 |
| Calendar instance on Grassroots mobile frame 4 | **`6397:17935`** | inside `Field — Match date` (`6376:17753`), `Show Time & Actions = false`, resized 308 × 300 |

### Mutated

| Node | ID | Change |
|---|---|---|
| Component set | `2365:2033` | **Added BOOLEAN component property `Show Time & Actions` — key `Show Time & Actions#6392:0`, default `true`.** Added 3rd variant. Set resized 1199 × 662 → 1152 × 1264 (grew down to fit the new variant). Added a `description` documenting the variants + the property + the resize-after-toggle note. |
| `calendar 1` → `Group 825` | `2363:2094` | `componentPropertyReferences.visible` → `Show Time & Actions#6392:0` |
| `calendar 2` → `Group 825` | `2365:2131` | `componentPropertyReferences.visible` → `Show Time & Actions#6392:0` |
| `calendar 1` → Month text | `2363:2168` | characters `"January 2022"` → `"Month YYYY"`; node renamed `"January 2022"` → `"Month label"` |
| `calendar 2` → Month text | `2365:2037` | same |
| `calendar 2 — mobile` → Month text | `6393:17794` | renamed `"January 2022"` → `"Month label"` ("Month YYYY" carried from the clone) |
| Grassroots mobile F3 `Field — Match date` | `6376:17693` | plain date `Input` removed; inline calendar instance inserted after the label |
| Grassroots mobile F3 annotation | `6376:17697` | rewritten — the stale "[GAP] no mobile variant, mobile shows a field" note replaced with a description of the inline mobile calendar |
| Grassroots mobile F4 `Field — Match date` | `6376:17753` | same as F3 |
| Grassroots mobile F4 annotation | `6376:17757` | same as F3 |

### Removed

| Node | ID | Notes |
|---|---|---|
| F3 plain date `Input` frame | `6376:17695` | replaced by the inline calendar |
| F4 plain date `Input` frame | `6376:17755` | replaced by the inline calendar |

### NOT touched (out of scope, confirmed unchanged)

- Grassroots **desktop** frames `6369:16675` / `6371:16908` and their calendar instances `6369:16816` /
  `6371:16959` — see §5, Figma auto-migrated their manual override into the new property with zero
  appearance change, so no edit was needed.
- The Admin instance `6281:16383` (`Admin — Contest — Start a Cycle (Custom Weekly Windows)`) and the
  archived `5404:7423` (`ARCHIVED — Contest - Schedule Task`).
- `calendar 1` (`2363:2242`) structure — kept (see §3).

---

## 2. `Show Time & Actions` property — mechanism and the height/hug decision

**Mechanism.** A single BOOLEAN component property `Show Time & Actions` (key
`Show Time & Actions#6392:0`, default `true`) was added **to the component set** (`ComponentSetNode`
supports `addComponentProperty` via the shared `ComponentPropertiesMixin`), then bound via
`componentPropertyReferences.visible` to the one `Group 825` node in each of the three variants
(`2363:2094`, `2365:2131`, `6393:17888`). `Group 825` already wrapped the entire redundant region in
both original variants — the "Set time" label, the hours/minutes/**seconds** + AM/PM inputs, and the
Cancel / Schedule buttons — so one reference per variant covers all of it. An instance now hides that
region with one discoverable toggle instead of a deep manual `visible` override into instance
internals (which breaks silently if the component is ever restructured).

**Default `true` was deliberate** — every existing instance keeps its exact current appearance
(§5). The set-level property has a single default; per-variant boolean defaults are not possible in a
set, so the mobile variant also defaults `true` and the Grassroots mobile instances set it `false`
explicitly, the same pattern the Grassroots desktop instances already follow.

**Height / hug decision: shipped the property alone, no auto-collapse.** The calendar body is
`layoutMode: NONE` (absolute layout) with a precisely-placed two-column week grid in `calendar 2` and
a six-row single-column grid in `calendar 1` / `calendar 2 — mobile`. Wrapping the body in
auto-layout to make the frame hug when `Group 825` is hidden would risk drifting those grids — exactly
the "don't restructure a working absolute layout" hazard the calendar's own earlier retrofit
(DL #53/#178) and the Grassroots screens report both respected. So: **an instance that turns the
property off does one manual `resize()`** to trim the now-empty space (~300 px for the single-column
variants, ~242 px for `calendar 2`). This is what the two new Grassroots mobile instances do, and what
the Grassroots desktop instances already did. Still a large improvement over the stopgap: a semantic,
discoverable, restructure-proof toggle instead of a raw override into a composed sub-node.

**Existing Admin + Grassroots-desktop instances were NOT retrofitted onto the property** as their own
deliberate feature choice — minimal blast radius. Figma migrated the Grassroots-desktop instances'
pre-existing manual override into the property automatically (§5); that is preservation of appearance,
not a retrofit. See §7 for the optional follow-up.

---

## 3. Mobile variant — the variant-structure decision

### Structure chosen

**Kept `Property 1` as the axis; added one value `calendar 2 — mobile`.** Values are now
`calendar 1`, `calendar 2`, `calendar 2 — mobile`. The new variant (`6393:17791`) is a clone of
`calendar 1`'s single-column structure at its native **308 px** width, with the `Show Time & Actions`
property linked and the "Month YYYY" placeholder.

### Why not a semantic `Size = Desktop | Mobile` axis

The task flagged that an industry-standard breakpoint/size property would be cleaner than a
three-value `Property 1` axis whose values are weak placeholder names, and noted the DL #67 precedent
(mobile navbar variants added *into* the existing set with single-property naming, specifically to
avoid renaming existing variants and risking instance resolution). The task said renaming here was
"defensible" **on the stated premise that `calendar 1` is un-instanced.**

**That premise is stale.** `calendar 1` gained a live instance in `sprint-2/admin-contest-screens`
(DL #242) — `6281:16383` on `Admin — Contest — Start a Cycle (Custom Weekly Windows)`
(`6273:15474`). Verified live. So **both** existing variant values now have live instances
(`calendar 1`: 1, `calendar 2`: 3 on page `0:1` + 1 on the ignored `dump` page). Renaming the axis
`Property 1` → `Size`, renaming both values, and adding a third — against 4 live instances across
3 screens (one archived, two carrying geometry overrides) — is precisely the multi-hazard operation
the `use_figma` gotchas warn about (`setProperties` invalidates handles; `clone()` drops references;
etc.), for a cosmetic naming gain. The DL #67 precedent's reasoning applies unchanged now that its
"un-instanced" exception is void.

**Decision: follow the DL #67 precedent exactly** — keep `Property 1`, add
`Property 1=calendar 2 — mobile` (the direct analog of `Property 1=header 4 — mobile` /
`Property 1=header 7 — mobile` in the navbar set). Renaming the axis to a semantic `Size` property is
recorded as a clean future refactor for its own focused pass (DL #263 / §8).

### How every live instance was kept resolving

Adding a value to an existing VARIANT property does not disturb instances bound to other values —
`Property 1` simply gains an option. `calendar 2`'s 4 instances and `calendar 1`'s 1 instance keep
their `Property 1` value and were verified unchanged before and after (§5). The new value has no
instances except the two I created on the Grassroots mobile frames.

### `calendar 1` — kept, not renamed or retired

The task offered "rename to fit the new axis, or retire it — your call". Both are off the table:
`calendar 1` is **not** unused (instance `6281:16383`), so retiring it breaks the Admin Custom Weekly
Windows screen, and renaming its value is the same instance-migration risk as renaming the axis.
`calendar 1` is left exactly as-is. Its poor name is folded into the DL #263 future-refactor note.

### Width — 308 px, not widened to fill the mobile column

The Grassroots mobile content column (`Content` frame) is **350 px**; the `Field —` inputs are
**314 px**, inset at x 18. `calendar 1` is **308 px** and fits comfortably (fits even inside the
314 px field). Widening to ~334–350 px to "fill" the column would require re-pitching the seven
absolutely-positioned day columns (42 day cells across 6 rows + the week-header cells + the divider
line) — a grid re-layout with real drift risk and no UX gain, since 308 px already reads as a full
calendar. **Kept at 308 px, left-aligned in the field.** Same discipline as the width decision above.

Only a mobile counterpart of `calendar 2` was built — no `calendar 1 — mobile` — as instructed.

---

## 4. "January 2022" → "Month YYYY"

Hardcoded in the `Month` header text of both original variants (`2363:2168`, `2365:2037`) and flagged
unfixed in **DL #178**, the Grassroots screens report, and the admin-contest-screens report. Replaced
with the neutral, non-dated placeholder **`"Month YYYY"`** on all three variants (the mobile clone
inherited it). "Month YYYY" can never render stale or wrong and reads as a template slot; a
current-date string ("September 2026") was rejected because it goes stale the same way "January 2022"
did. Nodes also renamed `"January 2022"` → `"Month label"` so the layer name stops lying too.
Canonical text-edit recipe used (Montserrat Regular loaded → mutate → return IDs). Fill stays bound to
`brand/navy` (`VariableID:5096:8`) on all three.

---

## 5. Instance / variant audit — before / after

### Component set `2365:2033`

| | Before | After |
|---|---|---|
| Variants | `Property 1` = {`calendar 1`, `calendar 2`} | `Property 1` = {`calendar 1`, `calendar 2`, `calendar 2 — mobile`} |
| Non-variant props | none | `Show Time & Actions#6392:0` (BOOLEAN, default `true`), bound to `Group 825.visible` in all 3 variants |
| Size | 1199 × 662 | 1152 × 1264 |
| Month header | "January 2022" ×2 | "Month YYYY" ×3 |

### Every live instance of the set — all resolve, all appearance-preserved

| Instance | Screen | Variant | Before | After | Verified |
|---|---|---|---|---|---|
| `6281:16383` | `Admin — Contest — Start a Cycle (Custom Weekly Windows)` (`6273:15474`) | `calendar 1` | full picker, h 562, time row visible | `Show Time & Actions = true` (inherited default, no override), h 562, `Group 825` visible | ✅ unchanged |
| `6369:16816` | `Grassroots — 3 Schedule Fixture — Desktop` (`6369:16675`) | `calendar 2` | time row hidden via **manual `visible` override** on `I…;2365:2131`, h 242 | manual override **auto-migrated** to `Show Time & Actions = false`, h 242, time row still hidden | ✅ unchanged |
| `6371:16959` | `Grassroots — 4 Schedule Fixture (Opponent TBD) — Desktop` (`6371:16908`) | `calendar 2` | same as above | same as above | ✅ unchanged |
| `5404:7423` | `ARCHIVED — Contest - Schedule Task` (`5403:6753`, hidden) | `calendar 2` | default appearance, time row visible, h 423 | `Show Time & Actions = true` (default), h 423 | ✅ unchanged |
| `5230:23397` | `dump` page (ignored scratch — CLAUDE.md) | `calendar 2` | default, h 423 | `Show Time & Actions = true` (default), h 423 | ✅ unchanged, no action |

**Key finding — the migration is safe.** Binding a `visible` component property onto a node that
instances already override manually did **not** force those instances to the property default
(`true`). Figma preserved each instance's actual state: the two Grassroots-desktop instances that had
`Group 825.visible = false` now carry `Show Time & Actions = false` as an instance value (the raw
override is retained alongside it), so their rendered output is byte-identical. The two Grassroots
desktop frames were confirmed visually unchanged and **were not edited** — item 4 honoured without
compromise.

### New instances (Grassroots mobile frames 3 & 4)

`6397:17793` (F3) and `6397:17935` (F4): `calendar 2 — mobile`, `Show Time & Actions = false`,
308 × 300, inserted into `Field — Match date` between the label and the annotation, mirroring how the
desktop frames place the calendar inline (`Field — Match date` → label → calendar → annotation). The
plain date `Input` workaround (`6376:17695` / `6376:17755`) was removed. Both frames grew ~255 px
taller (auto-layout) — expected for an inline calendar, matches the desktop proportions
(desktop F3 is h 1795). No overlap introduced (mobile row frames are 500 px apart, 390 px wide).

---

## 6. Paint / token audit

Measured node-by-node, visible `SOLID` paints on visible nodes.

| Surface | Total | Unbound | Off-palette | `brand/green-tint-28` | New colours |
|---|---|---|---|---|---|
| New variant `calendar 2 — mobile` (`6393:17791`) | 108 | 5 | 0 | 0 | 0 |
| Whole set `2365:2033` (3 variants) | 325 | 16 | 0 | 0 | 0 |
| New instance F3 (`6397:17793`, visible only) | 48 | 4 | 0 | 0 | 0 |
| New instance F4 (`6397:17935`, visible only) | 48 | 4 | 0 | 0 | 0 |
| Grassroots mobile frame 3 (`6376:17631`) | 110 | 4 | 0 | 0 | 0 |
| Grassroots mobile frame 4 (`6376:17711`) | 104 | 4 | 0 | 0 | 0 |

**The mobile variant's paint audit is identical to `calendar 1`'s baseline** (108 total, 5 unbound) —
it introduces **zero** new unbound / off-palette / new-colour paints.

**Accepted pre-existing unbound paints** (exactly the disclosed DL #53/#178 debt, ×3 now that there
are three variants — 15 total, deliberately left, never force-bound):

- 4 × `opacity: 0` adjacent-month day numerals per variant (`25` `26` `27` `28`, `#0F2552` at zero
  opacity — binding them makes invisible days visible because a bound paint takes the token's alpha).
- 1 × `Rectangle 314` per variant — the frosted `#FFFFFF` @ 90% panel, `visible: false`.

**One additional pre-existing unbound paint, disclosed:** the component **set node** `2365:2033`
carries a `#9747FF` (`151,71,255`) 1 px dashed (`[10,5]`) stroke — Figma's standard component-set
boundary indicator, also present on the `Web app Navbar` set (`2824:4309`). It is not a rendered
design paint (never appears in instances or in the variant previews' content), it pre-dates this pass,
and it is not consistently present across the file's sets. Left as-is and disclosed, matching how
prior passes disclosed the navbar avatar `IMAGE` fill.

Tokens bound across the set: `brand/navy`, `color/background/surface`, `color/icon/inactive`,
`color/text/on-navy`, `color/text/primary`, `color/text/secondary`. Light mode only, no dark-mode
work. **0 frame overlaps** — set bounds `x 49716–50868 / y −26607 → −25343`, pairwise AABB test
against every page `0:1` child returned 0 clashes; the mobile Grassroots frames grew vertically only
and stay 110 px clear of their row neighbours.

---

## 7. Screenshot verification

- **Component set** — all 3 variants render: `calendar 1` (308, single-column), `calendar 2` (687,
  two-column), `calendar 2 — mobile` (308, single-column). Each shows "Month YYYY" and, at the
  property default `true`, the "Set time" row + Cancel/Schedule buttons.
- **`6369:16816`** (Grassroots desktop D3 calendar instance) screenshotted after the property change —
  clean date grid, "Month YYYY", no time row, no action buttons. Byte-identical to its prior state.
- **Grassroots mobile frame 3** (`6376:17631`) — full-frame render: the inline `calendar 2 — mobile`
  instance sits under the "Match date" label, above the "Kick-off time" field, with the day grid,
  "Month YYYY" header + chevrons, "1" selected in navy, no time row, no buttons. No clipping.
- **Grassroots mobile frame 4** (`6376:17711`) — same, with the "Opponent TBD" content above.
- Toggle proof: an instance of `calendar 2 — mobile` created off-canvas, `Show Time & Actions` set to
  `false` → `Group 825` becomes non-traversable (hidden). Removed after the check.

No real browser render is possible in this environment — Figma canvas screenshots are the ceiling,
same as every prior design-system pass.

---

## 8. Ready-to-paste — Build Plan Section 9, Decision Log

The live docx Decision Log ends at **#261**. The rows below are drafted as **#262–#264** (the
finalising shell session verifies the numbers). A `RESOLVED` rewrite for **#257**'s Status cell is
first. **#258 is unaffected and stays Open.**

### #257 — Status cell rewrite (replace the "Open — `figma-design-system`" text)

> **Resolved by `sprint-5/grassroots-calendar-component-fix`, 2026-09-08 (`figma-design-system`).**
> The `Calendar for scheduled task` set (`2365:2033`) gained a BOOLEAN component property
> **`Show Time & Actions`** (default `true`, bound to `Group 825.visible` in every variant) so an
> embedding form hides the redundant "Set time" row + Cancel/Schedule buttons with one discoverable
> toggle instead of a raw per-instance override — see **#262**. A third variant
> **`Property 1=calendar 2 — mobile`** (`6393:17791`, 308 px single-column) was added for 390 px
> frames — see **#263**. The "January 2022" sample month is now the neutral placeholder
> **"Month YYYY"** on all variants — see **#264**. The two Grassroots Schedule Fixture **mobile**
> frames (`6376:17631` / `6376:17711`) now embed an inline instance of the new mobile variant instead
> of a plain date field. All 5 pre-existing live instances verified appearance-unchanged. **#258**
> (teams-browse screen + Grassroots nav entry point) is separate and stays Open.

### #262 — `Show Time & Actions` component property on the Calendar set; no auto-collapse

> **#262 — Calendar `Show Time & Actions` property, and the decision to ship it without hug/collapse.**
> `sprint-5/grassroots-calendar-component-fix`, 2026-09-08, `figma-design-system`. Added a BOOLEAN
> component property `Show Time & Actions` (key `Show Time & Actions#6392:0`, default `true`) to the
> component set `2365:2033`, bound via `componentPropertyReferences.visible` to the `Group 825` node
> in each of the three variants (`2363:2094`, `2365:2131`, `6393:17888`) — `Group 825` already wrapped
> the whole redundant region (the "Set time" hours/minutes/seconds + AM/PM inputs and the
> Cancel/Schedule buttons), inherited from the calendar's original Admin-dialog context. **Decision:
> shipped the property alone with no auto-collapse.** The calendar body is `layoutMode: NONE`
> (absolute-positioned week/day grids); wrapping it in auto-layout to make the frame hug when the
> group is hidden risks drifting those grids — the same "don't restructure a working absolute layout"
> hazard DL #53/#178 respected. An instance that turns the property off does one manual `resize()`
> (~300 px single-column, ~242 px `calendar 2`) — still a large improvement over a raw override into
> a composed sub-node. Default `true` preserves every existing instance's appearance. Figma
> **auto-migrated** the two Grassroots-desktop instances' pre-existing manual `Group 825.visible =
> false` overrides into the new property (`= false`), so those two frames were verified unchanged and
> not edited. The Admin (`6281:16383`) and archived (`5404:7423`) instances were not retrofitted onto
> the property — minimal blast radius; retrofitting them + the Grassroots-desktop instances is an
> optional follow-up. **Resolved.**

### #263 — Mobile calendar variant; kept `Property 1`, did not add a `Size` axis

> **#263 — Calendar mobile variant added; variant axis deliberately not renamed.** Added
> `Property 1=calendar 2 — mobile` (`6393:17791`) to the set `2365:2033` — a clone of `calendar 1`'s
> 308 px single-column structure (the reference for a 390 px frame), with the `Show Time & Actions`
> property linked and the "Month YYYY" placeholder. **The axis `Property 1` was kept, not renamed to a
> semantic `Size = Desktop | Mobile` property.** The task allowed renaming *on the premise that
> `calendar 1` is un-instanced* — that premise is stale: `calendar 1` gained a live instance in
> `sprint-2/admin-contest-screens` / DL #242 (`6281:16383` on `Admin — Contest — Start a Cycle
> (Custom Weekly Windows)`). Both existing values now have live instances (4 on page `0:1` + 1 on the
> ignored `dump` page), so renaming the axis + both values + adding a third is the multi-hazard
> instance-migration operation the `use_figma` gotchas warn about, for a cosmetic gain — exactly what
> the DL #67 precedent (mobile navbar variants added *into* the set with single-property naming) chose
> to avoid. `Property 1=calendar 2 — mobile` is the direct analog of `Property 1=header 4 — mobile`.
> `calendar 1` is kept as-is (cannot retire — it is instanced). The mobile variant stays at
> `calendar 1`'s native 308 px (fits the 350 px / 314 px Grassroots mobile column); widening it to
> "fill" would require re-pitching the 7 absolutely-positioned day columns — declined, no UX gain.
> **Renaming `Property 1` → `Size` and both legacy values is recorded as a clean future refactor for
> its own focused pass** once it can carry the instance migration safely. Raised and part-resolved by
> `sprint-5/grassroots-calendar-component-fix`. **Resolved (mobile variant); the axis-rename refactor
> is a tracked follow-up.**

### #264 — "January 2022" sample month replaced with a neutral placeholder

> **#264 — Calendar "January 2022" sample month → "Month YYYY".** The `Month` header text of the
> Calendar variants (`2363:2168`, `2365:2037`) was hardcoded to "January 2022" — flagged unfixed in
> DL #178, the Grassroots screens report and the admin-contest-screens report. Replaced with the
> neutral, non-dated placeholder **"Month YYYY"** on all three variants (fill still bound to
> `brand/navy`); the layer name `"January 2022"` was corrected to `"Month label"`. A current-date
> string was rejected — it goes stale the same way. `sprint-5/grassroots-calendar-component-fix`.
> **Resolved.**

---

## 9. Ready-to-paste — CLAUDE.md "Where things stand right now" bullet

Insert in the Sprint 5 area, **after** the `sprint-5/grassroots-opponent-name-design` bullet and
**before** "Community, Sports Hub, and Admin Console remain the strongest-designed pillars".

```markdown
- **`sprint-5/grassroots-calendar-component-fix` (figma-design-system, 2026-09-08) fixes the shared
  `Calendar for scheduled task` component set (`2365:2033`) so the Grassroots Record-Keeping frames
  can reuse it cleanly — resolves Decision Log #257 (and the long-flagged "January 2022" sample
  month). Figma design only, no app/backend code.** Report:
  `docs/sprint-5-grassroots-calendar-component-fix-report.md`. Decision Log **#262–#264** added; #257
  rewritten to Resolved; #258 (teams-browse screen + Grassroots nav entry) unaffected, stays Open.
  - **New BOOLEAN component property `Show Time & Actions`** (key `Show Time & Actions#6392:0`,
    default `true`) on the set, bound to `Group 825.visible` in every variant — hides the redundant
    inherited "Set time" row (hours/minutes/seconds + AM/PM) and the Cancel/Schedule buttons with one
    discoverable toggle instead of a raw per-instance override. **Shipped without auto-collapse**: the
    calendar body is absolute-layout; an instance that toggles it off does one manual `resize()`
    (~300px single-column / ~242px `calendar 2`) — same "don't restructure a working absolute layout"
    discipline as DL #53/#178. Figma **auto-migrated** the two Grassroots-desktop instances'
    pre-existing manual `visible:false` overrides into the property, so those out-of-scope frames were
    verified byte-unchanged and not edited.
  - **New variant `Property 1=calendar 2 — mobile`** (`6393:17791`, 308px single-column, cloned from
    `calendar 1`'s structure) for 390px frames. **The axis `Property 1` was deliberately NOT renamed
    to a semantic `Size` property**: the task allowed it only on the premise `calendar 1` is
    un-instanced, but `calendar 1` gained a live instance in `sprint-2/admin-contest-screens` (DL
    #242, `6281:16383`), so both existing values have live instances and renaming the axis against 4+
    live instances is the exact multi-hazard operation the DL #67 navbar precedent chose to avoid.
    Kept `Property 1`, added the value the DL #67 way. `calendar 1` kept (can't retire — instanced).
    Semantic `Size` axis logged as a future refactor (DL #263). Mobile variant kept at 308px rather
    than widened to fill the 350px column — widening needs re-pitching 42 absolutely-positioned day
    cells, no UX gain.
  - **"January 2022" → "Month YYYY"** on all three variants (neutral non-dated placeholder; layer
    renamed to "Month label"; fill still bound to `brand/navy`) — DL #264.
  - **Grassroots mobile frames 3 & 4** (`6376:17631` / `6376:17711`) now embed an inline instance of
    the new mobile variant (`6397:17793` / `6397:17935`, `Show Time & Actions=false`, 308×300) in
    `Field — Match date` instead of the plain date-field workaround; the stale "no mobile variant"
    annotations were rewritten. Both frames grew ~255px taller (expected for an inline calendar,
    matches desktop proportions); no overlaps.
  - **Audit:** the mobile variant's paint audit is identical to `calendar 1`'s baseline — 0
    newly-introduced unbound / off-palette / `brand/green-tint-28` / new-colour paints; the 15
    unbound (5 per variant) are exactly the disclosed DL #53/#178 opacity-0-numeral + frosted-panel
    debt, deliberately left. All 5 live instances of the set verified appearance-unchanged. 0 frame
    overlaps. Light mode only.
  - Not merged — founder's call after review.
```

---

## 10. New Figma-authoring gotcha (for the standing "Figma-authoring gotchas" list)

> **`component.clone()` on a variant `COMPONENT` drops `componentPropertyReferences` on its children
> that point to a set-level property key.** Cloning a variant to seed a new variant, then
> `set.appendChild(clone)`, produced a clone whose `Group 825` had `componentPropertyReferences: {}`
> even though the source variant's `Group 825` was bound to `Show Time & Actions#6392:0`. The
> reference had to be re-applied on the clone's child after the append. This is distinct from the
> already-documented "`component.clone()` drops nested-instance reaction overrides" — here it is a
> `componentPropertyReferences` binding on a plain child node, not a reaction.

> **Reassuring finding (worth recording alongside):** adding a BOOLEAN component property bound to
> `node.visible` on an existing set does **not** force instances that already carry a manual
> `visible` override to the property default. Figma migrates the manual override into the property
> value (the instance gets the corresponding boolean), so appearance is preserved. The failure mode
> to worry about — default `true` forcing a hidden node visible — did not occur.

---

## 11. Handover / deferred

- **Optional retrofit — Admin + Grassroots-desktop instances onto `Show Time & Actions`.** Not done
  (minimal blast radius). `6281:16383` (Admin Custom Weekly Windows) shows the full time row and needs
  no change. `6369:16816` / `6371:16959` (Grassroots desktop D3/D4) already have `Show Time & Actions
  = false` via auto-migration but also retain a redundant raw `visible` override on `I…;2365:2131` —
  harmless, but a tidy-up pass could delete the raw override so the property is the single source of
  truth. Low priority.
- **Semantic `Size = Desktop | Mobile` axis rename (DL #263).** Recommended as its own focused pass:
  rename `Property 1` → `Size`, `calendar 1` → e.g. `Compact`, `calendar 2` → `Desktop`,
  `calendar 2 — mobile` → `Mobile`, migrating all live instances (`5404:7423`, `6281:16383`,
  `6369:16816`, `6371:16959`, `6397:17793`, `6397:17935`, plus `5230:23397` on `dump`). Not bundled
  here because it is an instance-migration operation that deserves isolated verification.
- **`calendar 1` is not un-instanced** — the task brief (and CLAUDE.md's DL #257 summary) said it was.
  It has one live instance, `6281:16383` on `Admin — Contest — Start a Cycle (Custom Weekly Windows)`
  (`6273:15474`), from `sprint-2/admin-contest-screens`. Noted so a future pass doesn't retire it.
- **`5230:23397`** — one more `calendar 2` instance on the `dump` scratch page. Verified unaffected
  (default `true`). Ignored per CLAUDE.md's "dump = unused scratch, ignore it".
- **Component-set `#9747FF` dashed boundary stroke** on `2365:2033` — Figma tooling chrome, pre-existing,
  left as-is (see §6). Not consistently present across the file's sets; not worth touching.
- **Grassroots mobile frames 3 & 4 grew ~255px taller.** Expected. The Grassroots section banner
  coverage is already a broadly-flagged item in the Grassroots screens report — unchanged by this.
- **DL #258 (teams-browse screen + Grassroots nav entry point) is untouched and stays Open** — not in
  scope for this component fix.
- Nothing merged; no git or shell command run. The finalising shell session applies the branch,
  commit, the #257 rewrite + #262–#264 rows into the Build Plan docx, the CLAUDE.md bullet, and opens
  the PR.
