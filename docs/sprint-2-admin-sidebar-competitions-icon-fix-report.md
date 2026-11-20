# sprint-2/admin-sidebar-competitions-icon-fix — report

Targeted correction pass. Figma design only — no app/backend code. Figma file
`weZWWqggy9j13eX8bhFgs6`, page **Soccernity** `0:1`. Another session finalises the
branch / commit / docx / PR from this report.

One variable collection confirmed live: `Soccernity Theme`
(`VariableCollectionId:5096:2`), modes Light `5096:0` (default) / Dark `5096:1`,
13 COLOR variables. No new colour, no token added, no `brand/green-tint-28`,
no `semantic/alert` introduced. **0 unbound paints on every block touched.**

---

## 1. The bug — confirmed

The "Competitions" sidebar nav item icon was a **mass copy-paste defect**: on every
Admin Panel screen except the two Competition screens, the Competitions row's icon
is an exact duplicate of the "Contest" row icon (the pennant/badge glyph), despite
different labels. The correct icon is a three-bar chart.

Layer names are useless here as the task warned — the Competitions icon frame is
named `u:chat-bubble-user` on **all 29 screens**, correct and broken alike.
The reliable discriminator is the icon frame's child geometry:

| | Competitions icon frame children | Renders as |
|---|---|---|
| **Correct** (`5566:8033`, `5569:7813`) | 3 × `RECTANGLE` (`5568:7854/7855/7856`, bound `color/text/*`) | bar chart |
| **Broken** (all 27 others) | 1 × `VECTOR` — identical node shape to the Contest row's `u:chat-bubble-user` Vector | badge/pennant (a visual clone of "Contest") |

### Verified via screenshot (not asserted from layer names)

| Screen | Block | Before | After |
|---|---|---|---|
| `5566:8033` Admin — Create Competition (reference) | `5566:8067` | bar-chart icon, Competitions active | unchanged — bar-chart icon, Competitions active |
| `5569:7813` Admin — Competition Created (Success) (reference) | `5569:7847` | bar-chart icon (confirmed via structure audit) | unchanged |
| `917:218` Users — team members | `5402:7171` → `5834:9240` | Competitions icon = Contest badge clone; "Users" active | Competitions icon = bar chart; "Users" active, unchanged otherwise |
| `110:5` Dashboard | `5400:6659` → `5835:9369` | Competitions icon = badge clone; "Dashboard" active | Competitions icon = bar chart; "Dashboard" active |
| `5794:8635` Admin — Moderation Queue | `5794:8656` → `5835:9240` | Competitions icon = badge clone; **"Moderation" active with an invisible navy-on-navy icon (DL #146)**; "Users" row icon missing (DL #147) | Competitions icon = bar chart; **"Moderation" active with a visible white icon (DL #146 fixed)**; "Users" row icon still missing (DL #147, untouched) |
| `2363:2244` Contest - Contest Task tab | `2363:2279` → `5835:10485` | Competitions icon = badge clone; "Contest" active | Competitions icon = bar chart; "Contest" active |
| `1658:2303` Settings | `5402:7235` → `5835:11259` | badge clone | bar chart; "Settings" active |
| `5403:7327` Admin - Admin Profile | `5403:7361` → `5835:10872` | badge clone; no active row | bar chart; no active row (unchanged per PR #110) |

Screenshots of the reference block, the two known-broken samples, and the
above spot-checks were captured inline during the pass; all showed exactly the
behaviour tabled here.

---

## 2. What was done — whole-block swap (founder's explicit instruction)

For each of the **27** non-reference screens, the entire sidebar nav block
("Frame 5745" — the "Frame 5744" list of 8 items: Dashboard · Articles · Users ·
Moderation · Categories · Contest · Competitions · Media, plus the pinned
"Frame 5738" Settings item) was **deleted and replaced with a fresh clone of
`5566:8067`** (the Create Competition block).

`5566:8067` and `5569:7847` were confirmed structurally identical (same 9 rows,
same order, same icon node types, both `x:0 y:329 w:260 h:806`, MIN align,
itemSpacing 358, Competitions row = 3 rectangles). `5566:8067` was used as the
single source of truth throughout.

### Per-screen procedure

1. Read the old block's geometry (`x`, `y`, `width`, `height`,
   `primaryAxisAlignItems`, `itemSpacing`) and its parent + child-index.
2. `clone()` `5566:8067`; `insertChild` at the old block's exact index in the
   same parent; rename to `Frame 5745`.
3. Re-apply the **old block's own outer geometry** to the clone — `resize()` to
   the old `width`/`height`, `primaryAxisSizingMode`/`counterAxisSizingMode` =
   `FIXED`, `primaryAxisAlignItems` and `itemSpacing` from the old block, then
   `x`/`y` from the old block. (See §5 judgment call — the source block is
   806px/`MIN`; the 16 Admin-Shell screens are 655px/`SPACE_BETWEEN`. Preserving
   the target's own height + align keeps Settings pinned to the bottom exactly
   as before; a verbatim 806/`MIN` copy would overflow those frames.)
4. Reset the clone's Competitions row (`Nav — Competitions`, which is styled
   **active** on the source) to **inactive**: row fill →
   `color/background/surface`; label + the 3 icon rectangles → `color/text/primary`.
5. Re-apply that screen's own active row using the established binding pattern —
   active row fill → `brand/navy`, label + icon vector(s) → `color/text/on-navy`;
   inactive stays `color/background/surface` + `color/text/primary`. Active row
   per screen determined by reading which row on the *old* block was bound to
   `brand/navy` (`VariableID:5096:4`) before the swap.
6. Delete the old block.

Empty-fill icon vectors (the `fi:A_users` "Users" icon, DL #147) were skipped in
step 5 — left exactly as the reference carries them, neither fixed nor worsened.

`setBoundVariableForPaint` was fed each token's resolved Light-mode RGB as the
literal before binding (per the known gotcha): `color/background/surface`
`#FFFFFF`, `color/text/primary` / `brand/navy` `#282E65`, `color/text/on-navy`
`#FFFFFF`.

### Nothing outside the block was touched

Page content, header, search bar, profile card, scrims/overlays on the two delete
dialogs, and every colour binding elsewhere on each screen are untouched. Z-order
preserved (clone inserted at the old child-index). No prototype reactions existed
on any old block (checked every one — all returned 0), so none were lost.

---

## 3. Coverage audit

- **Total Admin Panel screens: 29.** Re-verified two ways on page `0:1`:
  `u:create-dashboard` icon frames = 29; `Frame 5745` sidebar blocks = 29.
  Matches PR #130's count exactly.
- **Screens carrying the corrected bar-chart Competitions icon: 29 / 29.**
  Post-swap structure audit of all 29 blocks: every `Nav — Competitions` icon
  frame now contains `RECTANGLE,RECTANGLE,RECTANGLE`. The 2 reference screens
  were already correct and were not modified; the 27 others were swapped.
- **Active nav state: correct on all 29.** Audit of which row is bound to
  `brand/navy` per block: 2 references = Competitions; 3 Moderation screens =
  Moderation; 9 Contest screens = Contest; Dashboard = Dashboard; 2 Articles =
  Articles; 2 Categories = Categories; 4 Media = Media; 4 Settings = Settings;
  Users = Users; Admin - Admin Profile = none. All as expected.
- **Unbound paints across all 29 blocks: 0.**
- **Geometry preserved: yes.** 10 FRAME-parented screens stayed 806px / `MIN`;
  16 Admin-Shell-GROUP screens + Users stayed 655px / `SPACE_BETWEEN`. All at
  `x:0 y:329 w:260`. Settings still pins to the block's bottom on every screen.
- **Screens that did not cleanly swap: none.** All 27 swapped without incident,
  including:
  - the 2 legacy Contest-tab frames (`2363:2244`, `2363:3446`) which have their
    own hand-built shell (block is a direct FRAME child, not inside an
    "Admin Shell" group) — swapped generically, fine;
  - the 3 dialog/scrim screens (`5403:7092` Delete Task, `5403:7205` Delete Role
    — and the earlier-done Report Detail) — block sits behind a scrim; the
    same-index insert preserved z-order;
  - the 16 screens where the block lives inside the "Admin Shell" GROUP —
    `insertChild` into a group worked; group bounds unchanged (identical
    geometry in, identical out).
- **No stray clones.** `Admin — Create Competition` and
  `Admin — Competition Created (Success)` each still contain exactly one
  `Frame 5745`; page-root child count unchanged (419); total `Frame 5745`
  count on the page still 29.

---

## 4. Decision Log #146 — now fixed (was: Open)

DL #146 (raised by PR #130): on the 3 Moderation screens the **active** (navy)
Moderation row's `el:ban-circle` icon vector was bound to `color/text/primary`
(navy) and rendered invisible against the navy row background; every sibling
active-row icon binds `color/text/on-navy` (white).

**Fixed as a direct consequence of step 5** (re-applying the established
active-state binding correctly). Verified post-swap on all 3 Moderation screen
blocks (`5835:9240`, `5835:9283`, `5835:9326`): active `Nav — Moderation` row →
fill `brand/navy` (`VariableID:5096:4`), icon vector **and** label →
`color/text/on-navy` (`VariableID:5182:6654`). Screenshot of
`5794:8635` / `5835:9240` confirms the white ban-circle icon now renders on the
navy row. No palette change, no new token — an existing token already used by
every other active-row icon in the file.

The Moderation row name is also now uniformly `Nav — Moderation` across all 3
(one was previously `Frame — Moderation`).

## Decision Log #147 — unchanged (still Open)

`fi:A_users` "Users" nav icon has 4 `Vector` children with empty fills. The
reference block `5566:8067` carries the identical icon nodes, so the swap neither
fixed nor worsened this. Still folds into the DL #52 Admin content-area retrofit
family. (Observed rendering behaviour is inconsistent between screenshots —
sometimes a faint people glyph shows, sometimes nothing — consistent with the
node relying on stroke/partial geometry rather than a bound fill. Out of scope
here.)

---

## 5. Judgment call (flagged, no existing Decision Log entry covers it)

**Outer-frame geometry on the swapped block: preserve the target's own, or copy
the source verbatim?** The founder said "a direct copy of the block used on
`5566:8067`". Taken literally that is 806px tall / `primaryAxisAlignItems = MIN` /
`itemSpacing = 358`. But 16 of the 27 target screens (all the "Admin Shell" GROUP
ones) run a 655px-tall block with `SPACE_BETWEEN` so Settings pins to the bottom
of a shorter sidebar. A verbatim 806/`MIN` copy would push Settings ~170px below
the sidebar's visible area on those screens.

**Chosen (conservative, reversible):** the *content* of the block is a byte
copy of `5566:8067` (all 9 rows, icons, labels, order, internal spacing); only
the block's **own outer frame** keeps the target screen's pre-existing
`height` + `primaryAxisAlignItems` + `itemSpacing`. This is what "don't change
the layout, only fix the icon" implies, and it matches what each screen already
looked like. Flagged as a proposed Decision Log row (#151 below) in case the
founder wants the sidebars actually unified to one height instead.

---

## 6. Full list of screens touched

27 screens. `old block → new clone`. Container = the immediate parent the block
sits in (the "Admin Shell" GROUP for the 655px screens; the screen FRAME itself
for the 806px screens).

| # | Screen | Screen node | Old block | New clone | Container (Admin Shell / frame) | Active row |
|---|---|---|---|---|---|---|
| 1 | Users — team members | `917:218` | `5402:7171` | `5834:9240` | `5402:7215` (GROUP Admin Shell) | Users |
| 2 | Admin — Moderation Queue | `5794:8635` | `5794:8656` | `5835:9240` | `5794:8636` (GROUP Admin Shell) | Moderation |
| 3 | Admin — Report Detail & Action | `5796:8635` | `5796:8656` | `5835:9283` | `5796:8636` (GROUP Admin Shell) | Moderation |
| 4 | Admin — Appeal Review | `5796:8753` | `5796:8774` | `5835:9326` | `5796:8754` (GROUP Admin Shell) | Moderation |
| 5 | Dashboard | `110:5` | `5400:6659` | `5835:9369` | `5400:6703` (GROUP Admin Shell) | Dashboard |
| 6 | Contest - Contest Task tab | `2363:2244` | `2363:2279` | `5835:10485` | `2363:2244` (FRAME) | Contest |
| 7 | Contest - scheduled contest task tab | `2363:3446` | `2363:3484` | `5835:10528` | `2363:3446` (FRAME) | Contest |
| 8 | Contest - Create Task | `5403:6640` | `5403:6674` | `5835:10571` | `5403:6640` (FRAME) | Contest |
| 9 | Contest - Schedule Task | `5403:6753` | `5403:6787` | `5835:10614` | `5403:6753` (FRAME) | Contest |
| 10 | Contest - Edit Task | `5403:6866` | `5403:6900` | `5835:10657` | `5403:6866` (FRAME) | Contest |
| 11 | Contest - Search Task | `5403:6979` | `5403:7013` | `5835:10700` | `5403:6979` (FRAME) | Contest |
| 12 | Contest - Delete Task | `5403:7092` | `5403:7126` | `5835:10743` | `5403:7092` (FRAME) | Contest |
| 13 | Contest - Empty State | `5405:8277` | `5405:8311` | `5835:10786` | `5405:8277` (FRAME) | Contest |
| 14 | Contest - Task Scheduled (Success) | `5405:8390` | `5405:8424` | `5835:10829` | `5405:8390` (FRAME) | Contest |
| 15 | Admin - Admin Profile | `5403:7327` | `5403:7361` | `5835:10872` | `5403:7327` (FRAME) | (none) |
| 16 | Articles | `123:56` | `5402:6659` | `5835:10915` | `5402:6703` (GROUP Admin Shell) | Articles |
| 17 | Articles - Create Post | `124:313` | `5402:6723` | `5835:10958` | `5402:6767` (GROUP Admin Shell) | Articles |
| 18 | Categories | `128:488` | `5402:6787` | `5835:11001` | `5402:6831` (GROUP Admin Shell) | Categories |
| 19 | Categories - Add Category | `138:93` | `5402:6851` | `5835:11044` | `5402:6895` (GROUP Admin Shell) | Categories |
| 20 | Media | `361:553` | `5402:6915` | `5835:11087` | `5402:6959` (GROUP Admin Shell) | Media |
| 21 | Media - Media Preview | `396:442` | `5402:7107` | `5835:11130` | `5402:7151` (GROUP Admin Shell) | Media |
| 22 | Media - Media Upload - step 1 | `916:2362` | `5402:6979` | `5835:11173` | `5402:7023` (GROUP Admin Shell) | Media |
| 23 | Media - Media Upload - step 2 | `917:24` | `5402:7043` | `5835:11216` | `5402:7087` (GROUP Admin Shell) | Media |
| 24 | Settings | `1658:2303` | `5402:7235` | `5835:11259` | `5402:7279` (GROUP Admin Shell) | Settings |
| 25 | Settings - Add new role | `1658:2456` | `5402:7299` | `5835:11302` | `5402:7343` (GROUP Admin Shell) | Settings |
| 26 | Settings - Delete Role | `5403:7205` | `5403:7283` | `5835:11345` | `5403:7263` (GROUP Admin Shell) | Settings |
| 27 | Settings - Edit role | `1658:2592` | `5402:7363` | `5835:11388` | `5402:7407` (GROUP Admin Shell) | Settings |

**Not touched (references, already correct):** `5566:8033` Admin — Create
Competition (block `5566:8067`), `5569:7813` Admin — Competition Created
(Success) (block `5569:7847`).

---

## FOR FINALISING SESSION

### (a) Proposed new Decision Log rows (continuing from #149)

| # | Decision needed | Raised in | Status |
|---|---|---|---|
| 150 | Admin Panel sidebar "Competitions" nav icon was a mass copy-paste defect — on 27 of 29 Admin screens the Competitions row icon was a duplicate of the "Contest" row icon (badge glyph), not the intended bar-chart. Fixed by replacing the entire sidebar nav block ("Frame 5745") on all 27 with a clone of the confirmed-correct block on `5566:8033` (Admin — Create Competition), re-applying each screen's own active-nav highlighting. Layer names could not identify the bug — the icon frame is named `u:chat-bubble-user` on every screen, correct and broken alike; the discriminator is icon-frame child geometry (3 rectangles vs 1 vector). Confirm the whole-block-swap approach (vs. a targeted single-icon patch) is acceptable as the standing fix. **This closes the icon-fidelity gap in the sidebar rollout that PR #130's "29/29 carry it" claim missed** — PR #130's coverage of the *Moderation* item was complete, but it (and PR #110's original "Competitions" propagation) carried the pre-existing broken Competitions icon forward unchanged and did not catch it. | `sprint-2/admin-sidebar-competitions-icon-fix` | Resolved (founder-instructed) — 29/29 Admin screens now carry the correct bar-chart Competitions icon; 0 unbound paints; no other token/colour touched |
| 151 | Admin sidebar block outer geometry: the source block (`5566:8067`) is 806px tall with `primaryAxisAlignItems = MIN`; the 16 "Admin Shell" GROUP screens run a 655px block with `SPACE_BETWEEN` to pin Settings to the bottom of a shorter sidebar. This pass kept each target's own height/align/itemSpacing (copying only the block *content* verbatim) so nothing moved. Decide whether Admin sidebars should instead be unified to a single height/align, or the current two-variant state is intentional. | `sprint-2/admin-sidebar-competitions-icon-fix` | Open — minor; conservative choice (preserve each screen's existing sidebar geometry) made meanwhile |

### (b) Forward-pointers to append to existing Decision Log Status cells

- **#146** (PR #130 — active Moderation-row icon invisible, navy-on-navy):
  > RESOLVED by `sprint-2/admin-sidebar-competitions-icon-fix` — the whole-block
  > swap re-applies the standard active-state binding, so the 3 Moderation
  > screens' active Moderation-row icon is now bound to `color/text/on-navy`
  > (white) like every other active-row icon. Verified on `5835:9240` /
  > `5835:9283` / `5835:9326`. No palette change.

- **#150 / PR #130 "29/29 carry it" claim** (Item 4 of
  `sprint-2/create-post-sports-contest-mobile-admin-notif-fix`): append a note
  that the Moderation-item coverage was complete but the co-resident
  Competitions icon was broken on 27/29 and is fixed here.

- **#147** (`fi:A_users` empty-fill Users icon): no change — still Open, still
  DL #52 family. (Optional: note it was left deliberately untouched by this pass
  because the reference block carries the identical icon nodes.)

### (c) Draft CLAUDE.md "Where things stand right now" bullet

- **`sprint-2/admin-sidebar-competitions-icon-fix` corrects a mass copy-paste
  defect in the Admin Panel sidebar that PR #130 (and PR #110 before it) missed**
  — Figma design only, no app/backend code. Full detail:
  `docs/sprint-2-admin-sidebar-competitions-icon-fix-report.md`.
  - **The bug:** on 27 of the 29 Admin Panel screens the "Competitions" sidebar
    nav item's icon was an exact duplicate of the "Contest" row icon (badge
    glyph) instead of the intended three-bar chart. Only `5566:8033` (Admin —
    Create Competition) and `5569:7813` (Competition Created — Success) had it
    right. Layer names were no help — the icon frame is named
    `u:chat-bubble-user` on every screen; the real discriminator is icon-frame
    child geometry (3 `RECTANGLE`s = correct vs 1 `VECTOR` = broken, the latter
    the same node shape as the Contest icon).
  - **The fix (founder's explicit instruction):** replaced the **entire** sidebar
    nav block ("Frame 5745" — the 8-item list + pinned Settings) on all 27
    non-reference screens with a fresh clone of `5566:8067`, then re-applied each
    screen's own active-nav highlighting using the established binding pattern
    (active = `brand/navy` + `color/text/on-navy`; inactive =
    `color/background/surface` + `color/text/primary`). Each target's own outer
    block geometry (655px/`SPACE_BETWEEN` for the 16 "Admin Shell" GROUP screens,
    806px/`MIN` for the 10 Contest/Profile FRAME screens) was preserved so
    nothing moved and Settings stays bottom-pinned.
  - **Coverage:** 29 Admin screens total (re-verified: `u:create-dashboard`
    instances = 29, `Frame 5745` blocks = 29). **29/29 now carry the correct
    bar-chart Competitions icon.** 0 unbound paints on every block touched;
    no other colour/token/binding changed anywhere; no prototype reactions
    existed on any old block. Every screen swapped cleanly — including the 2
    legacy hand-built Contest-tab shells and the 3 dialog/scrim screens.
  - **Closes Decision Log #146** (PR #130's flagged navy-on-navy invisible
    active Moderation-row icon) as a side effect of re-binding the active state
    correctly — the 3 Moderation screens' active-row icon is now
    `color/text/on-navy` white. **Decision Log #147** (`fi:A_users` empty-fill
    Users icon) unchanged — the reference block carries the identical nodes;
    still DL #52 family. New Decision Log **#150** (the fix) and **#151**
    (whether Admin sidebars should be unified to one height) proposed;
    forward-pointer appended to #146.
  - **This corrects the icon-fidelity gap PR #130's "29/29 carry it" claim
    missed** — PR #130's coverage of the *Moderation* nav item was complete, but
    it propagated the pre-existing broken *Competitions* icon forward unchanged.
  - Not merged — pending review. Branch `sprint-2/admin-sidebar-competitions-icon-fix`.
