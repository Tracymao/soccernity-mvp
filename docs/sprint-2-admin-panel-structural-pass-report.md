# sprint-2/admin-panel-structural-pass — report

**Figma file:** `weZWWqggy9j13eX8bhFgs6` ("Soccernity-MVP"), page **Soccernity** `0:1`.
**Scope:** coordinated Admin Panel structural pass — Decision Log #49, #50, #51, #53, #146, #147, #150, #151.
**Date:** 2026-09-04. Figma design only; no app/backend code. No shell this session — the finalising
session handles branch / commit / docx / CLAUDE.md / PR.

---

## 0. Executive summary — what was done, what was not, and why

| Item | Decision Log | Status this session |
|---|---|---|
| **6 — Calendar component token retrofit** | #53 | **DONE and verified.** `calendar 2` variant (`2365:2034`) of `Calendar for scheduled task` (`2365:2033`) fully token-bound: 103 bound paints, **0 unbound-visible**, 5 deliberately-unbound (disclosed, §6). Schedule Task screen (`5403:6753`) screenshot-verified — renders identically, now fully bound. |
| **1 — Icon library standardization** | #49, #147 | **NOT executed. Authoritative mapping table delivered (§1).** Must be done as a single edit on the componentized shell (Item 2), not 29× on the current clones. |
| **2 — Admin Shell componentization** | #49 | **NOT executed. Full executable build+swap plan delivered (§2), plus complete 29-screen inventory (§7).** This is a large, high-regression-risk structural refactor across 29 heterogeneous screens (2 shell topologies, 4 distinct frame heights). It cannot be completed safely alongside the other five items in one session without risking leaving 29 Admin screens in a broken half-converted state — the exact failure mode this project's norms exist to prevent. Recommended as its own dedicated session. |
| **3 — Frame height normalization to 1184** | #50 | **NOT executed. Plan + blocker delivered (§3).** New blocker found: 2 screens already EXCEED 1184 (`5796:8753` @1234, `5566:8033` @1530) — forcing them down risks clipping real content. → new Decision Log candidate **#177**. |
| **4 — Sidebar geometry unification** | #151 | **NOT executed.** Falls out of Item 2's component definition (§4). |
| **5 — Top-bar action button removal** | #51 | **NOT executed. Per-screen KEEP/LOSE table delivered (§5).** Becomes a per-instance boolean toggle once Item 2 is done. |

**Why the split:** Items 1, 3, 4, 5 all depend on Item 2 being done first (the task itself sequences them
this way). Item 2 done wrong = content clipped/shifted on up to 29 screens, or instances that can't be
cleanly reverted. The prior comparable Admin passes (PR #102, #110, #130, #131) were each their own
focused PR for this reason. Item 6 is fully independent of the shell, bounded to one component, and was
completed and verified.

---

## 1. ITEM 1 — Icon library standardization (Decision Log #49 / #147)

### 1.1 Current state (verified live, all 29 screens)

The sidebar nav-icon set is **identical across all 29 Admin screens** (1 distinct set — confirmed by
reading every `Frame 5745` › `Frame 5744` nav list on page `0:1`). Current icon-frame names:

| Nav item | Current icon-frame name | Library | Renders as |
|---|---|---|---|
| Dashboard | `u:create-dashboard` | Unicons | 2×2 panel grid |
| Articles | `u:document-layout-left` | Unicons | document w/ left rule |
| Users | `fi:A_users` | Feather-ish | **nothing** — 4 `Vector` children, empty fills (DL #147) |
| Moderation | `el:ban-circle` | Elusive | circle-with-slash |
| Categories | `u:apps` | Unicons | 2×2 grid |
| Contest | `u:chat-bubble-user` | Unicons (misnamed) | pennant/badge glyph |
| Competitions | `u:chat-bubble-user` (**misnamed**) | — | 3-bar column chart (correct since PR #131; layer name is stale on all 29) |
| Media | `u:images` | Unicons | stacked images |
| Settings | `u:setting` | Unicons | gear |

Mix of libraries: `u:*` (Unicons ×6), `fi:*` (×1), `el:*` (×1), plus `carbon:*` / `ic:*` / `clarity:*` /
`akar-icons:*` used elsewhere in Admin content areas. Carbon is the most-used file-wide → standardize on
`carbon:`.

**Important:** these are hand-drawn `VECTOR` nodes, NOT instances of a real icon library. "Standardize on
`carbon:`" means (a) rename each icon frame to `carbon:<name>`, and (b) redraw the glyph paths to match
Carbon's actual geometry so the set is visually coherent. On the current clone-based sidebars that is
~9 glyphs × 29 copies = **261 vector edits**. On a componentized shell (Item 2) it is **9 edits, once.**
→ Item 1 must run after Item 2.

### 1.2 Proposed old → `carbon:` mapping

| Nav item | Old name | → New `carbon:` name | Fidelity |
|---|---|---|---|
| Dashboard | `u:create-dashboard` | `carbon:dashboard` | **Faithful** — Carbon `dashboard` is the same 2×2 panel motif |
| Articles | `u:document-layout-left` | `carbon:document` | Minor — drops the "left rule" detail; plain doc |
| Users | `fi:A_users` | `carbon:user--multiple` | **Faithful** + **fixes DL #147** (Carbon glyph has real fills) |
| Moderation | `el:ban-circle` | `carbon:rule` **(recommended)** *or* `carbon:gavel` | **FLAGGED — no exact match.** `carbon:rule` = moderation-rules semantic; `carbon:gavel` = review/decision. Both change the visual from a circle-slash. A shape-faithful option is `carbon:misuse--outline` (circle-slash) but it reads "error", not "moderation". Recommend `carbon:rule`. |
| Categories | `u:apps` | `carbon:categories` | **Faithful** — Carbon has a literal `categories` glyph |
| Contest | `u:chat-bubble-user` | `carbon:trophy` **(recommended)** *or* `carbon:flag` | **FLAGGED — no exact match.** Current renders as a pennant/badge; `carbon:trophy` reads "contest/challenge" best. Visual changes from pennant to trophy. `carbon:flag` is closer to the current pennant shape if visual continuity matters more than semantics. |
| Competitions | `u:chat-bubble-user` (stale) | `carbon:chart-column` | **Faithful** to the corrected bar-chart glyph (PR #131). **Also fix the stale layer name.** |
| Media | `u:images` | `carbon:image` | **Faithful** (`carbon:image` = single framed image; `carbon:media--library` if the stacked look must be kept) |
| Settings | `u:setting` | `carbon:settings` | **Faithful** — direct equivalent |

Icon treatment to preserve exactly (unchanged): navy 1.5px stroke / navy fill on a `brand/green-tint`
12% 31×31 r3 tile for tiles that use it; **active** row icon → `color/text/on-navy`; **inactive** →
`color/text/primary`. (Confirmed: `color/text/on-navy` = `VariableID:5182:6654` = `#FFFFFF`;
`color/text/primary` = `VariableID:5096:8` = `#282E65`.)

**3 flagged imperfect matches:** Moderation, Contest, Articles (Articles is minor). Founder should
pick Moderation (`carbon:rule` vs `carbon:gavel`) and Contest (`carbon:trophy` vs `carbon:flag`).

---

## 2. ITEM 2 — Admin Shell componentization (Decision Log #49) — executable plan (NOT executed)

### 2.1 The shell is currently 7 loose nodes, in 2 topologies

Reference screen `Admin — Create Competition` (`5566:8033`), shell pieces (direct frame children):

| Piece | Node (on ref) | Geometry on a 1440-wide frame |
|---|---|---|
| Sidebar wash | `Rectangle 223` `5566:8066` | x0 y0, 260 × **frameHeight** (full-bleed) |
| Nav block | `Frame 5745` `5566:8067` | x0 y329, 260 × 806 (contains `Frame 5744` list + `Frame 5738` Settings, pinned) |
| Logo lockup | `Frame 5748` `5566:8100` | x41 y45, 130 × 68 |
| Avatar + name block | `Frame 5780` `5566:8115` | x23 y162, 215 × 73 |
| Top-bar row (search + primary action) | `Frame 5768` `5566:8058` | x279 y186, 1021 × 41 |
| Log Out button | `publish` `5566:8111` | x1177 y45, 123 × 39 |
| Old navbar (hidden) | `Navigation` `5566:8040` | x0 y0, 1440 × 84, `visible=false` — DROP on componentize |

- **17 screens** carry these wrapped in a `GROUP` named **"Admin Shell"** (all 1024-tall except
  `5796:8753` @1234), nav block 655 / `SPACE_BETWEEN`.
- **12 screens** carry them as **loose FRAME siblings** (all 1184-tall except `5566:8033` @1530),
  nav block 806 / `MIN`.

### 2.2 Recommended component model

**One `COMPONENT_SET` `Admin Shell`** parked off-canvas (suggest `x 60000 y -30000`).

- **Variant property `Active`** — 10 values: `Dashboard`, `Articles`, `Users`, `Moderation`,
  `Categories`, `Contest`, `Competitions`, `Media`, `Settings`, `None`. → **10 variants.**
  (Variant-per-active-item beats instance-override here: only one row's fill + icon + label bindings
  flip between navy/on-navy and surface/primary; encoding that as 10 variants makes each screen a
  one-line `setProperties({ Active: 'Media' })` with zero override drift. 10 variants is well within
  the "cap at 30" guidance. `None` covers `Admin — Admin Profile`.)
- **Component property `Show Action Button`** (BOOLEAN, default `true`) → toggles visibility of the
  top-bar primary button (`Frame 5750` inside `Frame 5768`). Item 5 becomes per-instance.
- **Component property `Action Label`** (TEXT, default `"Create"`) → bound to the button's label text.
- **Internal layout for multi-height support** (frames are 1024 / 1184 / 1234 / 1530):
  - Sidebar wash `Rectangle 223`: constraints `horizontal: MIN`, `vertical: STRETCH` (top+bottom).
  - Nav block `Frame 5745`: constraints `vertical: TOP_BOTTOM` (stretch) + keep its own
    `SPACE_BETWEEN` so `Frame 5744` sits top and `Frame 5738` (Settings) pins bottom at any height.
    Standardize `blockH` to fill (see Item 4).
  - Logo / avatar / top-bar row / Log Out: constraints `vertical: MIN` (pinned to top).
  - Component frame itself: `layoutSizingVertical` FIXED; each instance resized to its screen's height.

### 2.3 Swap procedure (per screen — 29×)

1. **Capture BEFORE:** record the screen's content-area bbox — every non-shell child's `x/y/w/h`
   (content starts at x≈279). Screenshot.
2. Create an `Admin Shell` instance; `setProperties({ Active, 'Show Action Button', 'Action Label' })`
   per §5 / §7 table.
3. Insert at the shell's old z-index (behind content). For GROUP screens: insert into the parent that
   held the "Admin Shell" group; for FRAME screens: insert as a frame child at the lowest shell index.
4. `instance.resize(1440, frameHeight)` (or 260-width-only if the component is sidebar-only — decide in
   2.2; recommend full-width component so the top-bar row + Log Out are included).
5. Delete the 7 old shell nodes / the "Admin Shell" group.
6. **Verify AFTER:** re-read every content child's `x/y/w/h` — assert unchanged. Screenshot, compare.
   Any screen where content moved → investigate before proceeding to the next.
7. Special cases: the 4 scrim screens (`5403:7092`, `5403:7205`, `5405:8390`, `5569:7813`) — the shell
   sits *behind* a navy-45% scrim; insert below the scrim, confirm z-order. The 2 legacy Contest-tab
   frames (`2363:2244`, `2363:3446`) have their own hand-built content — shell swap is generic, fine.

### 2.4 Estimated effort
~10–14 `use_figma` calls to build+validate the component set; ~29–40 calls to swap+verify 29 screens
(1–2 screens per call with before/after geometry assertion + screenshot). **~45–55 calls total, one
focused session.** Return the final `COMPONENT_SET` id + the 29 instance ids.

---

## 3. ITEM 3 — Frame height normalization to 1184 (Decision Log #50) — plan + blocker

### 3.1 Current heights (verified, all 29 — full table in §7)
- **1024:** 16 screens (all GROUP "Admin Shell")
- **1184:** 11 screens (all loose-FRAME) — already canonical
- **1234:** 1 — `Admin — Appeal Review` (`5796:8753`)
- **1530:** 1 — `Admin — Create Competition` (`5566:8033`)

### 3.2 Plan
For the **16 @1024** screens: grow the frame `5566:8033`→1184… i.e. resize frame height 1024→1184.
Their shell is a GROUP with the nav at y95-ish (PR #102's y-95 adaptation); with Item 2's component the
shell auto-fills the new height. Content on these 16 starts at y≈95–135 and is shorter than 1184 — no
downward shift needed, just more bottom whitespace. **Verify per screen** that no child was pinned to
the old bottom edge (GROUPs have no constraints; children keep absolute y — safe here since nothing is
bottom-anchored on a list/form screen, but confirm).

### 3.3 BLOCKER → new Decision Log candidate #177
`Admin — Appeal Review` (1234) and `Admin — Create Competition` (1530) **exceed** 1184. Forcing them
*down* to 1184 would clip real content (Create Competition's form is ~1121px tall starting at y329 →
needs ≥1450). **Recommendation:** normalize the *floor* to 1184 (grow the 16 short ones), leave frames
that legitimately need more height taller, OR set 1184 as a min and let tall content screens keep their
required height. Do **not** blindly force 1184 on all 29. Founder call — see §8 #177.

---

## 4. ITEM 4 — Sidebar geometry unification (Decision Log #151)

Two geometries today: **655 / `SPACE_BETWEEN`** (17 GROUP screens) vs **806 / `MIN`** (12 FRAME
screens). Both keep Settings visually bottom-pinned (655 via SPACE_BETWEEN; 806 via a tall fixed block
+ MIN).

**Canonical choice (recommended):** the nav block (`Frame 5745`) **fills the sidebar height**
(`layoutSizingVertical = FILL` inside the component, or height = frameHeight − topOffset) with
`primaryAxisAlignItems = SPACE_BETWEEN` so `Frame 5744` (items) pins top and `Frame 5738` (Settings)
pins bottom at any frame height. This is topology-independent and **falls out of the Item 2 component
definition** (§2.2) — once the shell is one component, there is exactly one sidebar geometry by
construction. No separate pass needed; confirm during Item 2 validation that Settings pins bottom on a
1024, an 1184, and the 1530 instance.

---

## 5. ITEM 5 — Top-bar action button removal (Decision Log #51) — per-screen table

Rule: **keep** the top-bar primary button only where the screen has **no in-content submit/save/upload
action**; **remove** it where an in-content button already exists. Becomes `Show Action Button` boolean
per instance (§2.2).

| Screen | Node | KEEP / LOSE | Label (if kept) / in-content button justifying removal |
|---|---|---|---|
| Dashboard `110:5` | — | already removed (PR #102) | overview, no action |
| Media - Media Preview `396:442` | — | already removed (PR #102) | lightbox, no action |
| Articles `123:56` | KEEP | "Create Article" |
| Categories `128:488` | KEEP | "Add Category" |
| Media `361:553` | KEEP | "Add Media" |
| Users - team members `917:218` | KEEP | "Add Member" |
| Settings `1658:2303` | KEEP | "Add Role" |
| Contest - Contest Task tab `2363:2244` | KEEP | "Create Task" |
| Contest - scheduled contest task tab `2363:3446` | KEEP | "Create Task" |
| Contest - Search Task `5403:6979` | KEEP | "Create Task" (search is a list view) |
| Contest - Empty State `5405:8277` | KEEP | "Create Task" (the empty-state CTA is in-content but is the *primary* affordance; keeping the top-bar one too is consistent with list screens — founder may prefer LOSE) |
| Admin — Moderation Queue `5794:8635` | KEEP | (no primary action today — confirm; likely LOSE) |
| Articles - Create Post `124:313` | **LOSE** | in-content "Submit Post" `124:478` |
| Categories - Add Category `138:93` | **LOSE** | in-content "Submit" `359:491` |
| Settings - Add new role `1658:2456` | **LOSE** | in-content "Submit" `1658:2580` |
| Settings - Edit role `1658:2592` | **LOSE** | in-content "Submit" `1658:2716` |
| Media - Media Upload - step 1 `916:2362` | **LOSE** | in-content "Upload" `917:13` |
| Media - Media Upload - step 2 `917:24` | **LOSE** | in-content "Upload" `917:209` |
| Contest - Create Task `5403:6640` | **LOSE** | in-content "Create Task" submit |
| Contest - Edit Task `5403:6866` | **LOSE** | in-content "Save Changes" submit |
| Contest - Schedule Task `5403:6753` | **LOSE** | in-content "Schedule" (calendar component) — **confirmed via screenshot this session** |
| Admin — Create Competition `5566:8033` | **LOSE** | in-content "Create Competition" `5566:8139` |
| Admin — Report Detail & Action `5796:8635` | **LOSE** | 4 in-content navy action buttons |
| Admin — Appeal Review `5796:8753` | **LOSE** | in-content Uphold / Overturn |
| Contest - Delete Task `5403:7092` | **LOSE** | modal — [Cancel]/[Delete Task] in the dialog |
| Settings - Delete Role `5403:7205` | **LOSE** | modal — [Cancel]/[Delete Role] |
| Contest - Task Scheduled (Success) `5405:8390` | **LOSE** | success modal — [View schedule]/[Done] |
| Admin — Competition Created (Success) `5569:7813` | **LOSE** | success modal — in-dialog buttons |
| Admin - Admin Profile `5403:7327` | already removed (PR #102) | profile view; in-content [Edit Profile]/[Change Password] |

**Summary: KEEP 11, LOSE 15, already-removed 3.** Two founder judgment calls flagged: Contest Empty
State (KEEP vs LOSE), Moderation Queue (does it get a primary action at all).

---

## 6. ITEM 6 — Calendar component token retrofit (Decision Log #53) — DONE

Target: `calendar 2` variant `2365:2034` of `Calendar for scheduled task` (`2365:2033`) — the variant
instanced on `Contest - Schedule Task` (`5403:6753`).

### 6.1 Tokens used (all `Soccernity Theme` `VariableCollectionId:5096:2`, Light `5096:0`)

| Token | ID | Light value |
|---|---|---|
| `color/text/primary` | `5096:8` | `#282E65` |
| `color/text/secondary` | `5096:9` | `#282E65` @ 0.70 |
| `color/text/on-navy` | `5182:6654` | `#FFFFFF` |
| `brand/navy` | `5096:4` | `#282E65` |
| `color/icon/inactive` | `5097:2` | `#282E65` @ 0.15 |
| `color/background/surface` | `5096:7` | `#FFFFFF` |

Literal RGB resolved and passed to `setBoundVariableForPaint` before binding (per the known gotcha).

### 6.2 Paint-by-paint binding (66 paints rebound)

| Node(s) | Current value | → Token | Note |
|---|---|---|---|
| `2365:2037` "January 2022" heading | `#0F2552` | `color/text/primary` | |
| `I2365:2036;1270:9889`, `I2365:2038;1270:9889` month-nav arrows | `#848A95` | `color/text/primary` | instance-nested vectors — override applied cleanly |
| `2365:2039` "Line 1" heading divider | stroke `#E4E5E7` | `color/icon/inactive` | |
| `2365:2042/2044/2046/2048/2050/2052/2054` + `2365:2178/2180/2182/2184/2186/2188/2190` — 14 weekday labels | `#7E818C` | `color/text/secondary` | muted labels; token carries the 70% alpha |
| `2365:2058` selected-day "1" numeral | `#FDFDFD` | `color/text/on-navy` | sits on the navy selected-day disc (`2365:2057`, already bound `brand/navy`) |
| `2365:2060/2062/2064/2066/2068/2070` days 2–7 | `#282E65` | *(already bound `color/text/primary`)* | left as found |
| `2365:2073…2365:2122` days 8–31 (24 texts) | `#0F2552` | `color/text/primary` | |
| `2365:2059…2365:2129` + `2365:2036/2038` — 36 hidden (`visible:false`) day-cell / icon-wrapper white fills | `#FFFFFF` | `color/background/surface` | bound for audit cleanliness; `visible:false` preserved |
| `2365:2132` "Rectangle 296" (vector, "Set time" caret) | `#252B26` | `color/text/primary` | |
| `2365:2142` "Set time" label | `#040404` | `color/text/primary` | off-palette near-black → navy |
| `2365:2140` "Schedule" button label | `#FFFFFF` | `color/text/on-navy` | (`2365:2139` button fill already bound `brand/navy`) |
| `2365:2136` "Cancel" button — hidden fill `#343835` → `color/background/surface`; stroke `#282E65` → `brand/navy` | | | outline button |
| `2365:2145` "Frame 574" time-box border | stroke `#8B8B8B` | `color/icon/inactive` | |
| `2365:2149` "Frame 575" time-box border | stroke `#8B8B8B` | `color/icon/inactive` | |
| `2365:2137` "Cancel" label, `2365:2146` "PM", `2365:2151/2153/2155/2157/2159` time digits/colons | `#282E65` | *(already bound `color/text/primary`)* | left as found |

### 6.3 Deliberately left unbound — 5 paints, DISCLOSED (not silently skipped)

| Node(s) | Value | Why left |
|---|---|---|
| `2365:2124`, `2365:2126`, `2365:2128`, `2365:2130` — 4 adjacent-month trailing day numerals | `#0F2552` @ **opacity 0** (invisible by design) | Binding to any token forces the **token's** alpha onto the paint (Figma gotcha: a variable-bound paint ignores paint-level `opacity`). Attempted `color/text/secondary` + re-assert `opacity:0` → the paint rendered at 0.70 and the previously-invisible "25 26 27 28" showed. **Reverted to the exact original** (`#0F2552`, opacity 0, unbound). Redesigning the adjacent-month affordance is out of scope. |
| `2365:2144` "Rectangle 314" frosted panel | `#FFFFFF` @ **opacity 0.9** | Same constraint — binding to `color/background/surface` forced opacity 1 (lost the frosted effect). Reverted to original (`#FFFFFF` @ 0.9, unbound). |

### 6.4 Verification (measured)
- `calendar 2` subtree audit after the pass: **103 bound**, **0 unbound-visible**, 5 unbound
  (the 4 opacity-0 days + 1 frosted panel above).
- Screenshot of the isolated component variant: renders identically to before — navy heading, navy
  nav arrows, muted weekday row, navy day numbers, navy selected-day disc with white numeral, navy
  "Schedule" / outlined "Cancel". Adjacent-month days invisible (correct).
- Screenshot of `Contest - Schedule Task` (`5403:6753`) with the live instance: calendar reads
  correctly in context; no layout shift.
- **`calendar 1` variant `2363:2242`** (308×562, the narrow single-column view) is **NOT instanced
  anywhere in the file** and was **left untouched** — it still carries 48 unbound-visible + 43
  unbound-hidden paints. Recommend the same treatment in a small follow-up to fully close #53, or
  accept that only the in-use variant matters. → §8 #178.

### 6.5 Node IDs mutated (Item 6)
`2365:2037, 2365:2039, 2365:2042, 2365:2044, 2365:2046, 2365:2048, 2365:2050, 2365:2052, 2365:2054,
2365:2058, 2365:2073, 2365:2075, 2365:2077, 2365:2079, 2365:2081, 2365:2083, 2365:2085, 2365:2088,
2365:2090, 2365:2092, 2365:2094, 2365:2096, 2365:2098, 2365:2100, 2365:2103, 2365:2105, 2365:2107,
2365:2109, 2365:2111, 2365:2113, 2365:2115, 2365:2118, 2365:2120, 2365:2122, 2365:2132, 2365:2136,
2365:2140, 2365:2142, 2365:2145, 2365:2149, 2365:2178, 2365:2180, 2365:2182, 2365:2184, 2365:2186,
2365:2188, 2365:2190, I2365:2036;1270:9889, I2365:2038;1270:9889` + 36 hidden fills
(`2365:2036, 2365:2038, 2365:2059, 2365:2061, 2365:2063, 2365:2065, 2365:2067, 2365:2069, 2365:2072,
2365:2074, 2365:2076, 2365:2078, 2365:2080, 2365:2082, 2365:2084, 2365:2087, 2365:2089, 2365:2091,
2365:2093, 2365:2095, 2365:2097, 2365:2099, 2365:2102, 2365:2104, 2365:2106, 2365:2108, 2365:2110,
2365:2112, 2365:2114, 2365:2117, 2365:2119, 2365:2121, 2365:2123, 2365:2125, 2365:2127, 2365:2129`).
Reverts: `2365:2124, 2365:2126, 2365:2128, 2365:2130, 2365:2144`.

---

## 7. Full Admin Panel screen inventory (29 screens, verified live on page `0:1`)

| # | Screen | Node ID | W×H | Shell topology | Nav block | Active nav |
|---|---|---|---|---|---|---|
| 1 | Contest - Contest Task tab | `2363:2244` | 1440×1184 | FRAME (loose) | 806 / MIN | Contest |
| 2 | Contest - scheduled contest task tab | `2363:3446` | 1440×1184 | FRAME (loose) | 806 / MIN | Contest |
| 3 | Dashboard | `110:5` | 1440×1024 | GROUP "Admin Shell" | 655 / SPACE_BETWEEN | Dashboard |
| 4 | Articles | `123:56` | 1440×1024 | GROUP | 655 / SB | Articles |
| 5 | Articles - Create Post | `124:313` | 1440×1024 | GROUP | 655 / SB | Articles |
| 6 | Categories | `128:488` | 1440×1024 | GROUP | 655 / SB | Categories |
| 7 | Settings | `1658:2303` | 1440×1024 | GROUP | 655 / SB | Settings |
| 8 | Settings - Edit role | `1658:2592` | 1440×1024 | GROUP | 655 / SB | Settings |
| 9 | Settings - Add new role | `1658:2456` | 1440×1024 | GROUP | 655 / SB | Settings |
| 10 | Users - team members | `917:218` | 1440×1024 | GROUP | 655 / SB | Users |
| 11 | Media | `361:553` | 1440×1024 | GROUP | 655 / SB | Media |
| 12 | Media - Media Upload - step 1 | `916:2362` | 1440×1024 | GROUP | 655 / SB | Media |
| 13 | Media - Media Upload - step 2 | `917:24` | 1440×1024 | GROUP | 655 / SB | Media |
| 14 | Media - Media Preview | `396:442` | 1440×1024 | GROUP | 655 / SB | Media |
| 15 | Categories - Add Category | `138:93` | 1440×1024 | GROUP | 655 / SB | Categories |
| 16 | Contest - Create Task | `5403:6640` | 1440×1184 | FRAME | 806 / MIN | Contest |
| 17 | Contest - Schedule Task | `5403:6753` | 1440×1184 | FRAME | 806 / MIN | Contest |
| 18 | Contest - Edit Task | `5403:6866` | 1440×1184 | FRAME | 806 / MIN | Contest |
| 19 | Contest - Search Task | `5403:6979` | 1440×1184 | FRAME | 806 / MIN | Contest |
| 20 | Contest - Delete Task | `5403:7092` | 1440×1184 | FRAME | 806 / MIN | Contest |
| 21 | Settings - Delete Role | `5403:7205` | 1440×1024 | GROUP | 655 / SB | Settings |
| 22 | Admin - Admin Profile | `5403:7327` | 1440×1184 | FRAME | 806 / MIN | (none) |
| 23 | Contest - Empty State | `5405:8277` | 1440×1184 | FRAME | 806 / MIN | Contest |
| 24 | Contest - Task Scheduled (Success) | `5405:8390` | 1440×1184 | FRAME | 806 / MIN | Contest |
| 25 | Admin — Create Competition | `5566:8033` | 1440×**1530** | FRAME | 806 / MIN | Competitions |
| 26 | Admin — Competition Created (Success) | `5569:7813` | 1440×1184 | FRAME | 806 / MIN | Competitions |
| 27 | Admin — Moderation Queue | `5794:8635` | 1440×1024 | GROUP | 655 / SB | Moderation |
| 28 | Admin — Report Detail & Action | `5796:8635` | 1440×1024 | GROUP | 655 / SB | Moderation |
| 29 | Admin — Appeal Review | `5796:8753` | 1440×**1234** | GROUP | 655 / SB | Moderation |

Heights: **16 @ 1024**, **11 @ 1184**, **1 @ 1234** (#29), **1 @ 1530** (#25).
Topology: **17 GROUP "Admin Shell"**, **12 loose FRAME**.

---

## 8. Paint audit (this session)

| Component / frame touched | unbound-visible | unbound-hidden | off-palette | green-tint-28 |
|---|---|---|---|---|
| `calendar 2` variant `2365:2034` (Item 6) — after | **0** | 5 (disclosed §6.3) | 0 | 0 |
| Everything else | untouched | — | — | — |

No new colour introduced. No `brand/green-tint-28`, no `semantic/alert`. Light mode only.

---

## 9. NEW Decision Log candidates (continuing from #176)

| # | Decision needed | Raised in | Status |
|---|---|---|---|
| **177** | **Admin frame height normalization has 2 outliers that exceed the proposed 1184 canon** — `Admin — Appeal Review` (`5796:8753`, 1234) and `Admin — Create Competition` (`5566:8033`, 1530). Forcing them down to 1184 would clip real content (Create Competition's form alone is ~1450px of vertical content). Proposal: treat 1184 as the **minimum** — grow the 16 screens currently at 1024 to 1184, leave any screen whose content genuinely needs more height taller. Confirm, or specify a different rule. | `sprint-2/admin-panel-structural-pass` | Open — blocker on Item 3; conservative reading (1184 as floor, not a hard clamp) recommended |
| **178** | **Calendar `calendar 1` variant (`2363:2242`) is still un-retrofitted** — 48 unbound-visible paints. It has **0 instances anywhere in the file** (only `calendar 2` is used, on Schedule Task). Retrofit it too in a small follow-up to fully close Decision Log #53, or accept that only the in-use variant is bound and mark #53 resolved on that basis. | `sprint-2/admin-panel-structural-pass` | Open — minor; `calendar 2` (the only instanced variant) is done |
| **179** | **Icon-library standardization (`carbon:`) has 3 imperfect matches needing a founder pick** — Moderation `el:ban-circle` → `carbon:rule` vs `carbon:gavel` vs shape-faithful `carbon:misuse--outline`; Contest pennant → `carbon:trophy` vs `carbon:flag`; Articles `carbon:document` drops a minor detail. Also: the sidebar icons are hand-drawn vectors, not library instances, so "standardize" = rename + redraw glyphs, best done once on the Item-2 component (9 edits) not 29× (261 edits). Confirm the mapping in §1.2 and the Moderation/Contest choices. | `sprint-2/admin-panel-structural-pass` | Open — mapping table delivered; 3 picks outstanding |
| **180** | **Admin Shell componentization (Item 2) should be its own dedicated session.** It is a ~45–55-call structural refactor across 29 heterogeneous screens (2 topologies, 4 heights) with real content-clipping risk if rushed. Items 1, 3, 4, 5 all depend on it. This pass delivered Item 6 + the full plan + the 29-screen inventory; recommend dispatching Item 2 (then 1/3/4/5 as its fast-follow, since they become one-line-per-instance once the component exists). | `sprint-2/admin-panel-structural-pass` | Open — recommendation; the plan in §2 is executable as-is |

Forward-pointers to append to existing Decision Log Status cells:
- **#53** — "Partially resolved by `sprint-2/admin-panel-structural-pass`: the `calendar 2` variant
  (`2365:2034`, the only variant instanced in the file — on Schedule Task `5403:6753`) is fully
  token-bound (103 bound, 0 unbound-visible; 5 opacity-constrained paints disclosed). `calendar 1`
  variant still unbound — see Decision Log #178."
- **#49 / #50 / #51 / #151** — "Plan delivered by `sprint-2/admin-panel-structural-pass` (§1–§5 of its
  report) but NOT executed — the componentization it all hinges on is recommended as its own session
  (Decision Log #180)."
- **#146** — unchanged (already resolved by PR #131).
- **#147** — "Will be fixed as part of Item 1 icon standardization — `fi:A_users` → `carbon:user--multiple`
  (a real-fill glyph). Still open pending that pass."

---

## 10. For the finalising session

- Branch `sprint-2/admin-panel-structural-pass` off `main`; commit this report.
- Transcribe Decision Log **#177–#180** into `docs/Soccernity_MVP_Build_Plan_v1.7.docx` Section 9
  (Table 6, continuing from #176 which is the live max per the task brief), and append the
  forward-pointers above to #53 / #49 / #50 / #51 / #151 / #147.
- CLAUDE.md "Where things stand" bullet: Item 6 done (calendar `calendar 2` retrofitted, DL #53
  partially resolved); Items 1–5 planned not executed (DL #180 — recommend dedicated session).
- **Do NOT merge** — founder review, as with every design-stage PR.
- Only Figma change this session: the `calendar 2` variant (`2365:2034`) subtree. No app/backend code.

## 11. Verified before/after (Item 6 only — Items 1–5 not executed, nothing to verify)

- Isolated `calendar 2` component variant: screenshot before pass 3 and after the revert — identical
  render, adjacent-month days invisible both times.
- `Contest - Schedule Task` (`5403:6753`): screenshot with the live instance — calendar reads
  correctly, sidebar/topbar/content unchanged, no layout shift.
- No other Admin frame was touched, so no before/after check applies to Items 1–5.

---

## 12. Founder decisions (finalising session, 2026-09-04)

Taken so the dedicated componentization session (Decision Log #180) can execute without re-stalling
on these:

- **Items 1–5 — proceed as recommended (Decision Log #180 confirmed).** Item 6 ships as this PR
  (`sprint-2/admin-panel-structural-pass`). The Admin Shell componentization (Item 2), then Items
  1 / 3 / 4 / 5 as its fast-follow, are dispatched as their own focused session, matching how PRs
  #102 / #110 / #130 / #131 were each scoped.
- **Item 1 — Moderation icon: `carbon:gavel`** (not `carbon:rule`). Reads as adjudication/review,
  which matches the Moderation queue's actual function. Resolves the Moderation half of #179.
- **Item 1 — Contest icon: `carbon:trophy`** (not `carbon:flag`). Semantic clarity over visual
  continuity with the old pennant. Resolves the Contest half of #179.
- **Item 1 — Articles: `carbon:document`** accepted as-is (the dropped "left rule" detail is
  immaterial). #179's remaining content is just confirming the rest of the §1.2 table, which is
  approved.
- **Item 3 — `carbon:user--multiple` for Users** accepted (also closes #147).
- **Item 3 height rule (#177): 1184 is a FLOOR, not a hard clamp.** Grow the 16 screens at 1024 up
  to 1184; leave `Admin — Appeal Review` (1234) and `Admin — Create Competition` (1530) at their
  content-driven heights. No screen is forced shorter / redesigned to fit.
- **#178 — `calendar 1` retrofit:** do it in the same dedicated session as Item 2 (it's small and
  the session is already in the Admin/Figma context), rather than a separate micro-PR.
