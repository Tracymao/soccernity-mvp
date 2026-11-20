# sprint-2/admin-shell-componentization — report

**Figma file:** `weZWWqggy9j13eX8bhFgs6` ("Soccernity-MVP"), page **Soccernity** `0:1`.
**Scope:** Decision Log #49 / #180 — Admin Shell componentization (Item 2 only), dispatched as its own
dedicated session per `docs/sprint-2-admin-panel-structural-pass-report.md`'s explicit recommendation.
**Date:** 2026-09-04. Figma design only; no app/backend code. No shell this session — the finalising
session handles branch / commit / docx / CLAUDE.md / PR, per this project's established pattern for
`figma-design-system` sessions without Bash access.

**Explicitly out of scope, per this task's brief, and NOT attempted:** Item 1 (icon library
standardization), Item 3 (frame height normalization to 1184), Item 4 (sidebar geometry
unification — beyond what falls out naturally from the Item 2 component definition itself, which
the brief's own component spec requires), Item 5 (top-bar action button removal), and Decision Log
#178 (calendar `calendar 1` variant retrofit). Note: the prior report's own §12 "founder decisions"
section suggested folding #178 into this session; this task's brief explicitly overrode that and
listed #178 as out of scope — followed the live brief, flagged here rather than silently doing
extra work beyond it.

---

## 0. Executive summary

**Item 2 is DONE.** One `COMPONENT_SET` named **"Admin Shell"** (`6014:12948`) was built with a
10-value `Active` variant property and two component properties (`Show Action Button` boolean,
`Action Label` text), parked off-canvas at `x:60000, y:-30000`. All **29** Admin Panel screens were
swapped from their old 7-loose-node shell (in either of the 2 prior topologies) to a single instance
of this component, each carrying its own pre-existing `Active` / `Show Action Button` / `Action Label`
state faithfully replicated (not changed). Every screen's real content geometry was captured before
the swap and re-verified byte-identical after. A genuine, previously-undocumented Figma rendering bug
was found and fixed mid-build (§3). Two factual discrepancies against the prior report/brief were
found and are flagged, not silently resolved (§6).

---

## 1. Pre-build verification (re-confirmed live, not trusted from the prior report)

Re-verified directly via `get_metadata`/`use_figma` before building anything:

- Reference screen **Admin — Create Competition** (`5566:8033`) shell pieces confirmed exactly as
  the prior report described: `Rectangle 223` (`5566:8066`, sidebar wash), `Frame 5745`
  (`5566:8067`, nav block — containing `Frame 5744` nav list + `Frame 5738` Settings row),
  `Frame 5748` (`5566:8100`, logo lockup), `Frame 5780` (`5566:8115`, avatar+name block),
  `Frame 5768` (`5566:8058`, top-bar row — containing `Group 826` search + `Frame 5750` action
  button), `publish` (`5566:8111`, Log Out group), and the hidden `Navigation` frame (`5566:8040`,
  dropped, not carried into the component).
- The 29-screen inventory was re-derived live (not copied from the prior report) via a batch
  existence + structure check — **all 29 node IDs, names, widths, heights, and topologies matched
  the prior report's table exactly**. No drift since that report was written. See §5 for the full,
  freshly-verified table.
- Row structure inside `Frame 5744`/`Frame 5738` was inspected directly: 9 nav rows (Dashboard,
  Articles, Users, Moderation, Categories, Contest, Competitions, Media, Settings), each a
  `HORIZONTAL` auto-layout frame with its own fill (bound to `brand/navy` `VariableID:5096:4` when
  active / `color/background/surface` `VariableID:5096:7` when inactive), an icon frame whose
  descendant shapes (VECTOR/RECTANGLE, varies per icon — Users has 4 vectors, Competitions has 3
  rectangles, the rest have 1 vector) are bound to `color/text/on-navy` `VariableID:5182:6654` when
  active / `color/text/primary` `VariableID:5096:8` when inactive, and a label TEXT node bound the
  same way.

---

## 2. Component built

### 2.1 `Admin Shell` COMPONENT_SET

- **Node ID: `6014:12948`**, parked at `x:60000, y:-30000`, 10 variants laid out in a row
  (`w:15400 h:1224`, purely a canvas-organization convenience — never rendered as a group on any
  real screen).
- **Variant property `Active`** (10 values, matches the brief exactly): `None`, `Dashboard`,
  `Articles`, `Users`, `Moderation`, `Categories`, `Contest`, `Competitions`, `Media`, `Settings`.
  `None` is the default variant and covers `Admin — Admin Profile` (no nav row active).
- **Component property `Show Action Button#6014:0`** (BOOLEAN, default `true`) — bound via
  `componentPropertyReferences.visible` on each variant's own `Frame 5750` (the top-bar action
  button), individually, across all 10 variants.
- **Component property `Action Label#6014:11`** (TEXT, default `"Create"`) — bound via
  `componentPropertyReferences.characters` on each variant's own button label TEXT node,
  individually, across all 10 variants.
- Built by cloning the reference screen's 6 real (non-hidden) shell pieces once into an
  off-canvas "Active=None" template (all 9 rows set to inactive styling — the reference screen's
  own "Competitions" active row was explicitly flipped back to inactive to produce this neutral
  base), cloning that template 9 more times (one flip to active styling per nav item), then
  converting all 10 to `COMPONENT`s via `figma.createComponentFromNode()` and combining via
  `figma.combineAsVariants()`. **No icon glyph or label was redrawn or retyped anywhere** — every
  icon/label in every variant is a direct, unmodified clone of the reference screen's own nodes,
  including the reference's own pre-existing rendering bugs (see §6.2).

### 2.2 Variant component IDs (`compIdMap`)

| Active value | Component node ID |
|---|---|
| None | `6014:12938` |
| Dashboard | `6014:12939` |
| Articles | `6014:12940` |
| Users | `6014:12941` |
| Moderation | `6014:12942` |
| Categories | `6014:12943` |
| Contest | `6014:12944` |
| Competitions | `6014:12945` |
| Media | `6014:12946` |
| Settings | `6014:12947` |

### 2.3 Internal layout / constraints for multi-height support

Per the brief's spec exactly:

- **Sidebar wash** (`Rectangle 223` in every variant): `constraints = { horizontal: 'MIN', vertical:
  'STRETCH' }` — stretches to fill whatever height the instance is resized to.
- **Nav block** (`Frame 5745` in every variant): `constraints = { horizontal: 'MIN', vertical:
  'STRETCH' }`, **and** its own internal `primaryAxisAlignItems` changed from the reference's
  original `MIN` to **`SPACE_BETWEEN`** (with `primaryAxisSizingMode`/`counterAxisSizingMode` both
  `FIXED`) — so the nav list (`Frame 5744`) stays pinned to the block's own top and the Settings row
  (`Frame 5738`) stays pinned to the block's own bottom, regardless of how tall the block is
  stretched. This is the exact behavior the brief specified for Item 2's own component build, and
  it is what naturally makes Decision Log #151 (sidebar geometry unification, listed as a separate,
  out-of-scope item) fall out for free — noted, not claimed as having separately executed #151.
- **Logo lockup, avatar+name block, top-bar row, Log Out group**: `constraints = { horizontal:
  'MIN', vertical: 'MIN' }` (pinned to top, do not stretch or reposition on resize). The Log Out
  group's own children were set individually (Figma `GROUP` nodes carry no `constraints` property
  of their own; resizing propagates to the group's children).
- **Component root**: plain (non-auto-layout) frame with absolutely-positioned children using
  `constraints`, matching the brief's instruction that this be constraint-based, not auto-layout,
  at the root.
- Canonical geometry baked into the template (chosen from the FRAME-topology reference, since it
  is the brief's own reference screen): nav block top offset **329px**, bottom margin **49px**
  (i.e. `806` tall at the reference's own `1184` height: `329 + 806 + 49 = 1184`). Verified by
  direct arithmetic and by live testing (§2.4) that this offset/margin pair leaves comfortable room
  for the 8-row nav list + Settings (352px content) at every one of the 4 real frame heights in use
  today (1024 → 646px available; 1184 → 806px; 1234 → 856px; 1530 → 1152px) — no clipping at any
  height, confirmed by direct resize testing, not just arithmetic.

### 2.4 Multi-height testing (required by the brief before the 29-screen swap)

A sample instance (`Active=Users`) was created and put through the full required test sequence
before any real screen was touched:

- Resized to **1024** → screenshot confirmed: sidebar wash fills fully, nav list top-anchored, no
  clipping, "Users" row active, "Add Member" button visible, Settings pinned to the very bottom.
- Resized to **1530** → screenshot confirmed: identical correct behavior, more sidebar whitespace
  between the nav list and Settings (expected — Settings still bottom-pinned).
- Resized to **1184** with `Show Action Button` set to `false` → screenshot confirmed the button
  disappears cleanly with no dead space, search bar unaffected.
- `setProperties({ Active, "Show Action Button#6014:0", "Action Label#6014:11" })` all confirmed
  working correctly across property changes.

All test/isolation instances (5 were created in total across debugging — see §3) were deleted
before the 29-screen swap began; a final orphan-search (`figma.currentPage.findAll` matching test
naming patterns) after the swap confirmed **zero** leftover test nodes.

---

## 3. A real bug found and fixed mid-build (new Figma-authoring gotcha, disclosed)

**The bug:** the sidebar wash (`Rectangle 223`) is, in the ORIGINAL/reference screen, a `brand/navy`
(`VariableID:5096:4`) fill at **12% paint opacity** — a subtle, pale sidebar tint, confirmed against
a fresh screenshot of the untouched reference screen (`5566:8033`) as ground truth. When this exact
paint (variable-bound + a separate fractional `opacity` on the paint) was carried into the new
component and an **instance** was created from it (`createInstance()` — reproduced even with zero
`resize()`/`setProperties()` calls, isolated specifically to instance-creation itself), the paint's
opacity silently reset to **`1`** on the instance, rendering the sidebar as **solid, fully-saturated
navy** instead of the intended pale wash — confirmed both via direct fill inspection (`opacity: 1`
read back on the instance vs. `opacity: 0.12` on the master component) and via screenshot.

**Root cause, isolated empirically:** this is the same class of bug this project's own Figma notes
already document ("a variable-bound paint takes its alpha from the variable, not from the paint's
own opacity") — but a NEW, more specific finding than what's currently written down: it affects
paints where the **bound variable itself carries no alpha** (like `brand/navy`, a plain opaque RGB)
combined with a separate fractional paint-level `opacity`, and specifically triggers **at
`createInstance()` time**, not just at `setBoundVariableForPaint()` construction time as the
existing notes describe. Two other fractional-opacity bound paints in the same shell were tested and
found **safe**: `Rectangle 110` (the search-bar background, bound to `brand/green-tint`,
`VariableID:5096:5`) and the search placeholder text (bound to `color/text/secondary`,
`VariableID:5096:9`) — both of these variables **carry their own alpha as part of the variable's
resolved value** (`brand/green-tint` = `rgba(...,0.12)` in Light mode; `color/text/secondary` =
`rgba(...,0.70)`), and both survived `createInstance()` with their opacity unchanged. Confirmed via
direct fill inspection on a test instance for both.

**Fix applied:** `Rectangle 223`'s fill was changed on **all 10 master components** from a
variable-bound paint to a **literal, unbound** `SOLID` paint using `brand/navy`'s own resolved RGB
(`{r: 0.1568627506494522, g: 0.18039216101169586, b: 0.3960784375667572}`) at `opacity: 0.12` — the
exact same visual value, just not routed through variable binding for this one node. Re-tested via a
fresh instance after the fix: opacity correctly reads `0.12` and renders as the intended pale wash at
every height tested. **This is a disclosed, deliberate deviation, not a silent one** — it trades one
node's variable traceability for correctness of the shared component's rendering across all future
instances (including any created later directly from the Figma UI, not just this session's
scripted swap). No new colour was introduced — the literal value is `brand/navy`'s own resolved
value at the design's own pre-existing 12% opacity, not a new hex or a different shade. Flagged as a
new Decision Log candidate (§7) since this pattern (fractional opacity + a non-alpha-carrying brand
variable) likely recurs elsewhere in the file and is worth a documented rule going forward.

---

## 4. Swap results — all 29 screens

Swap procedure followed exactly as specified: BEFORE geometry captured for every non-shell content
child on every screen (4 read-only batch calls), then swapped in 10 mutation batches (2–3 screens
each), each batch creating the instance with `setProperties` matching the screen's **pre-existing**
`Active`/`Show Action Button`/`Action Label` state (re-derived live from each screen's own current
fills/visibility — not copied from the prior report's Item-5 KEEP/LOSE *recommendations*, which
describe a different, not-yet-executed future state), inserting it at the old shell's z-index,
deleting the old shell nodes, then immediately re-reading and asserting every content child's
`x/y/width/height` unchanged. **Every single one of the 29 screens passed with zero deviation** — no
screen needed a fix, and no screen's content shifted by even one pixel.

### 4.1 Full 29-screen mapping (screen → instance node ID → live property state)

| # | Screen | Screen node ID | Instance node ID | Height | Active | Show Action Button | Action Label |
|---|---|---|---|---|---|---|---|
| 1 | Contest - Contest Task tab | `2363:2244` | `6044:76` | 1184 | Contest | true | Create Task |
| 2 | Contest - scheduled contest task tab | `2363:3446` | `6044:270` | 1184 | Contest | true | Create Task |
| 3 | Dashboard | `110:5` | `6044:2` | 1024 | Dashboard | false | (hidden) |
| 4 | Articles | `123:56` | `6044:344` | 1024 | Articles | true | Create Article |
| 5 | Articles - Create Post | `124:313` | `6044:418` | 1024 | Articles | true | Publish Post |
| 6 | Categories | `128:488` | `6044:12510` | 1024 | Categories | true | Add Category |
| 7 | Settings | `1658:2303` | `6044:12584` | 1024 | Settings | true | Add Role |
| 8 | Settings - Edit role | `1658:2592` | `6044:12658` | 1024 | Settings | true | Save Changes |
| 9 | Settings - Add new role | `1658:2456` | `6044:12732` | 1024 | Settings | true | Save Role |
| 10 | Users - team members | `917:218` | `6044:12806` | 1024 | Users | true | Add Member |
| 11 | Media | `361:553` | `6044:12880` | 1024 | Media | true | Add Media |
| 12 | Media - Media Upload - step 1 | `916:2362` | `6044:12954` | 1024 | Media | true | Upload Media |
| 13 | Media - Media Upload - step 2 | `917:24` | `6044:13028` | 1024 | Media | true | Upload Media |
| 14 | Media - Media Preview | `396:442` | `6044:13102` | 1024 | Media | false | (hidden) |
| 15 | Categories - Add Category | `138:93` | `6044:13176` | 1024 | Categories | true | Save Category |
| 16 | Contest - Create Task | `5403:6640` | `6044:13250` | 1184 | Contest | true | Create Task |
| 17 | Contest - Schedule Task | `5403:6753` | `6044:13324` | 1184 | Contest | true | Schedule Task |
| 18 | Contest - Edit Task | `5403:6866` | `6044:13398` | 1184 | Contest | true | Save Changes |
| 19 | Contest - Search Task | `5403:6979` | `6044:13472` | 1184 | Contest | true | Create Task |
| 20 | Contest - Delete Task | `5403:7092` | `6044:13620` | 1184 | Contest | true | Create Task |
| 21 | Settings - Delete Role | `5403:7205` | `6044:13694` | 1024 | Settings | true | Add Role |
| 22 | Admin - Admin Profile | `5403:7327` | `6044:13546` | 1184 | None | false | (hidden) |
| 23 | Contest - Empty State | `5405:8277` | `6044:13842` | 1184 | Contest | true | Create Task |
| 24 | Contest - Task Scheduled (Success) | `5405:8390` | `6044:13768` | 1184 | Contest | true | Create Task |
| 25 | Admin — Create Competition | `5566:8033` | `6044:13916` | 1530 | Competitions | true | Create Competition |
| 26 | Admin — Competition Created (Success) | `5569:7813` | `6044:13990` | 1184 | Competitions | true | Create Competition |
| 27 | Admin — Moderation Queue | `5794:8635` | `6044:14064` | 1024 | Moderation | true | Add Member |
| 28 | Admin — Report Detail & Action | `5796:8635` | `6044:14138` | 1024 | Moderation | true | Add Member |
| 29 | Admin — Appeal Review | `5796:8753` | `6044:14212` | 1234 | Moderation | true | Add Member |

### 4.2 BEFORE/AFTER geometry verification — explicit confirmation

**Every one of the 29 screens' content geometry matched exactly before vs. after, with no
unexplained shifts.** Method: for each screen, every non-shell content child's `x`, `y`, `width`,
`height` was read and stored immediately before that screen's swap, then re-read and compared via
exact equality immediately after; all 29 screens returned 100% `matches: true` across every content
child (ranging from 1 content child on the 3 simple Moderation screens up to 24 on `Settings - Add
new role`). No screen required a fix. No screen's content position, size, or visibility changed.

A final, independent structural audit (separate from the per-screen swap-time check) was also run
across all 29 screens after the full swap was complete: **zero** screens had more or fewer than
exactly one `Admin Shell` instance, and **zero** screens retained any stray old-shell-named node
(`Rectangle 223`, `Frame 5745`, `Frame 5748`, `Frame 5780`, `Frame 5768`, `publish`, `Navigation`,
or a leftover `Admin Shell` GROUP) as a direct child.

### 4.3 Special cases — as specified in the brief

- **The 3 real scrim screens** (`5403:7092` Contest - Delete Task, `5403:7205` Settings - Delete
  Role, `5405:8390` Contest - Task Scheduled (Success)) — explicitly verified after swap that the
  new shell instance's z-index is **below** the `Scrim` node in each case (`instanceBelowScrim:
  true` on all 3, checked programmatically, not assumed). Screenshot of `5403:7092` confirms the
  scrim + confirm dialog render correctly on top of the (correctly dimmed-behind) new shell.
- **`5569:7813` (Admin — Competition Created (Success))** — the brief listed this as one of "4
  scrim screens," but **direct inspection found no `Scrim` node anywhere on this screen** — its
  full children list shows the confirmation content rendered as plain page content, not a
  modal-over-scrim. Treated as a standard (non-scrim) screen; the swap used the generic procedure
  and passed with the same 100%-match geometry check as every other screen. **Flagged as a
  discrepancy against the brief, not silently corrected or silently followed** — see §6.1.
- **The 2 legacy Contest-tab frames** (`2363:2244`, `2363:3446`) — swapped with the same generic
  procedure; both passed geometry verification with no special handling needed. Their decorative
  background images (`ph:soccer-ball-fill` ×2 hidden, `7448202 1` hidden, `md-mahdi-...` visible)
  are correctly classified as "content" (not shell) by the generic name-based partition and were
  left completely untouched.

---

## 5. Live-verified 29-screen inventory (re-derived this session, not copied from the prior report)

| # | Screen | Node ID | W×H | Topology (before) |
|---|---|---|---|---|
| 1 | Contest - Contest Task tab | `2363:2244` | 1440×1184 | FRAME (loose) |
| 2 | Contest - scheduled contest task tab | `2363:3446` | 1440×1184 | FRAME |
| 3 | Dashboard | `110:5` | 1440×1024 | GROUP "Admin Shell" |
| 4 | Articles | `123:56` | 1440×1024 | GROUP |
| 5 | Articles - Create Post | `124:313` | 1440×1024 | GROUP |
| 6 | Categories | `128:488` | 1440×1024 | GROUP |
| 7 | Settings | `1658:2303` | 1440×1024 | GROUP |
| 8 | Settings - Edit role | `1658:2592` | 1440×1024 | GROUP |
| 9 | Settings - Add new role | `1658:2456` | 1440×1024 | GROUP |
| 10 | Users - team members | `917:218` | 1440×1024 | GROUP |
| 11 | Media | `361:553` | 1440×1024 | GROUP |
| 12 | Media - Media Upload - step 1 | `916:2362` | 1440×1024 | GROUP |
| 13 | Media - Media Upload - step 2 | `917:24` | 1440×1024 | GROUP |
| 14 | Media - Media Preview | `396:442` | 1440×1024 | GROUP |
| 15 | Categories - Add Category | `138:93` | 1440×1024 | GROUP |
| 16 | Contest - Create Task | `5403:6640` | 1440×1184 | FRAME |
| 17 | Contest - Schedule Task | `5403:6753` | 1440×1184 | FRAME |
| 18 | Contest - Edit Task | `5403:6866` | 1440×1184 | FRAME |
| 19 | Contest - Search Task | `5403:6979` | 1440×1184 | FRAME |
| 20 | Contest - Delete Task | `5403:7092` | 1440×1184 | FRAME |
| 21 | Settings - Delete Role | `5403:7205` | 1440×1024 | GROUP |
| 22 | Admin - Admin Profile | `5403:7327` | 1440×1184 | FRAME |
| 23 | Contest - Empty State | `5405:8277` | 1440×1184 | FRAME |
| 24 | Contest - Task Scheduled (Success) | `5405:8390` | 1440×1184 | FRAME |
| 25 | Admin — Create Competition | `5566:8033` | 1440×**1530** | FRAME |
| 26 | Admin — Competition Created (Success) | `5569:7813` | 1440×1184 | FRAME |
| 27 | Admin — Moderation Queue | `5794:8635` | 1440×1024 | GROUP |
| 28 | Admin — Report Detail & Action | `5796:8635` | 1440×1024 | GROUP |
| 29 | Admin — Appeal Review | `5796:8753` | 1440×**1234** | GROUP |

Confirmed identical to the prior report's own table — no drift, no new/removed/renamed screens
since that report was written.

---

## 6. Discrepancies found and flagged (not silently resolved)

### 6.1 `5569:7813` is not actually a scrim screen

The brief listed "4 scrim screens: `5403:7092`, `5403:7205`, `5405:8390`, `5569:7813`," but live
inspection found only 3 of these actually carry a `Scrim` node — `5569:7813` (Admin — Competition
Created (Success)) has no scrim/dialog structure at all; its confirmation content is plain page
content. This was verified by reading the screen's full, ordered children list directly rather than
trusting either the brief or a partial scan. No action was needed beyond using the generic
(non-scrim) swap procedure for this one screen, which passed verification normally. Flagged here per
this project's "flag rather than silently follow or silently override" convention.

### 6.2 3 Moderation screens show a stale/incorrect action-button label, faithfully preserved

Live inspection found `Admin — Moderation Queue` (`5794:8635`), `Admin — Report Detail & Action`
(`5796:8635`), and `Admin — Appeal Review` (`5796:8753`) **currently** render their top-bar action
button as **visible**, labelled **"Add Member"** — the label from `Users - team members`'s own
button, evidently left over from whatever screen these 3 were originally cloned from during a prior
build pass. This contradicts the prior structural-pass report's own Item-5 table, which described
Moderation Queue as having "no primary action today — confirm; likely LOSE." Per this task's
explicit instruction ("Do NOT change any screen's current button visibility or label in this pass —
just faithfully replicate whatever state it already has today"), this stale label was **preserved
exactly as found**, not corrected. Fixing this mislabelled/likely-unwanted button is Item 5's job
(a separate, not-yet-dispatched pass) — flagged here so whoever picks up Item 5 knows the real
current state to work from, not the prior report's inaccurate description of it.

---

## 7. New Decision Log candidate

| # | Decision needed | Raised in | Status |
|---|---|---|---|
| **(next available)** | **A new Figma-authoring gotcha, worth writing into this project's standing Figma notes**: a paint bound to a variable that does **not** itself carry alpha (e.g. `brand/navy`, a plain opaque RGB), combined with a separate fractional paint-level `opacity`, silently resets to `opacity: 1` specifically at `createInstance()` time (reproduced with zero other mutations) — not just at `setBoundVariableForPaint()` construction time as the existing project notes describe. Variables that carry their own alpha (`brand/green-tint`, `color/text/secondary`) are unaffected. Found and fixed on the Admin Shell's sidebar wash (`Rectangle 223`, all 10 variants) by using a literal, unbound paint at the same resolved value/opacity instead of a bound one — same visual result, immune to the bug. Recommend: (a) fold this into the file's own documented Figma gotchas so future sessions don't lose time rediscovering it, and (b) audit other `brand/navy`/`brand/green` (non-tint) variables anywhere else in the file that might be bound with a separate fractional paint opacity — none other were found in this shell (`Rectangle 110`/search-placeholder-text were checked and are safe, since they use alpha-carrying tokens), but this shell was not an exhaustive file-wide check. | `sprint-2/admin-shell-componentization` | Open — fix applied locally to this one component; file-wide audit not attempted (out of this session's scope) |

---

## 8. Explicit confirmations requested by the brief

- **Icon glyphs and labels**: not touched. Every icon vector/rectangle and every text label in every
  one of the 10 variants is an unmodified clone of the reference screen's own nodes — including the
  reference's own pre-existing bugs (the `fi:A_users` Users icon and `el:ban-circle` Moderation icon
  both still render as empty/invisible shapes in every variant, exactly as they did before this
  session — Decision Log #147 territory, correctly left for Item 1).
- **No screen's height was changed.** All 29 screens retain their pre-existing height exactly:
  16 at 1024, 11 at 1184, 1 at 1234 (`5796:8753`), 1 at 1530 (`5566:8033`) — confirmed both in the
  live pre-swap inventory (§5) and in the final per-screen audit (§4.1's Height column).
  Normalizing heights is Item 3, explicitly out of scope.
- **No screen's button visibility or label was changed from its pre-existing state.** Every
  `Show Action Button`/`Action Label` value in §4.1 was read live from each screen's own
  Frame 5750 state immediately before that screen's swap, not assumed or taken from the prior
  report's Item-5 recommendations. The 3 already-buttonless screens (Dashboard, Media Preview,
  Admin Profile) remain buttonless. The 3 Moderation screens' stale "Add Member" label (§6.2) was
  preserved, not corrected.
- **Items 1, 3, 4, 5 and Decision Log #178 were not attempted.** The only Figma changes this session
  are: the new `Admin Shell` COMPONENT_SET and its 10 variants (parked off-canvas, `6014:12938`–
  `6014:12948`), the 29 new instances replacing the 29 old shells, and the deletion of the 29 old
  shells' nodes. No content-area node on any screen was created, moved, resized, or deleted. No
  icon, label, or other component in the file outside the Admin Shell was touched.

---

## 9. For the finalising session

- Branch `sprint-2/admin-shell-componentization` off `main`; commit this report.
- Transcribe the new Decision Log candidate (§7) into `docs/Soccernity_MVP_Build_Plan_v1.7.docx`
  Section 9 (Table 6), continuing from the live docx's current max entry number (confirm the exact
  next number live — this report does not assume a number, since the docx has been a moving target
  across recent sessions).
- CLAUDE.md "Where things stand" bullet: Item 2 (Admin Shell componentization) is now DONE — one
  `Admin Shell` COMPONENT_SET (`6014:12948`, 10 `Active` variants + `Show Action Button`/`Action
  Label` component properties) now backs all 29 Admin Panel screens, replacing the old 7-loose-node/
  2-topology shell; a new Figma-authoring gotcha was found and fixed (fractional-opacity
  variable-bound paint resetting on `createInstance()`); Decision Log #180's recommendation is now
  fulfilled for Item 2. Items 1/3/4/5 and #178 remain open, now genuinely one-line-per-instance/
  one-edit-on-the-component operations once dispatched, per Decision Log #180's own reasoning.
- **Do NOT merge** — founder review, as with every design-stage PR in this project.
