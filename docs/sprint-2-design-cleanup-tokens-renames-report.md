# Sprint 2 — Design Cleanup: Tokens & Renames

**File:** Soccernity-MVP (`weZWWqggy9j13eX8bhFgs6`), page `0:1` "Soccernity". Correct file/page confirmed
open and frontmost. Figma design only — no application code touched.

Produced by the `figma-design-system` agent (no shell that session); the branch, commit, Decision Log
docx transcription and PR were finalised in a follow-up session with shell access — same pattern as
PRs #98 / #102 / #110 / #130 / #151.

---

## TASK 1 — Delete archived Message frames (Decision Log #114)

Canonical Message frames confirmed present and untouched: `5706:8271`, `5708:8184`, `5708:8362`,
`5709:8354`, `5709:8419`, `5709:8461`.

Reference check ran against all 110,638 nodes on page `0:1`: prototype reactions
(`ON_CLICK`/`NAVIGATE`/`OPEN_OVERLAY`/`NODE`), component instances derived from the frame or any
descendant, overlay/scroll targets, and `prototypeStartNode`.

| Frame | Name | Reference-check result | Deleted |
|---|---|---|---|
| `1871:2762` | ARCHIVED — Message - no message page | No external references. Contains an internal child (`2017:7593` "contact 1", inside hidden `Frame 19`) whose `NODE/NAVIGATE` reaction points at `2025:8112` — an archived→archived cross-link, both frames deleted together, so not a live reference. | **Yes** |
| `2025:8112` | ARCHIVED — Message - chat page desktop | Only inbound reference is the one above, from inside `1871:2762` (also deleted). No live references. | **Yes** |
| `2067:3006` | ARCHIVED — Message - List of chats - mobile app | No references of any kind. | **Yes** |
| `2067:3176` | ARCHIVED — Message - single chat page - mobile app | No references of any kind. | **Yes** |

All 4 verified as `null` after `.remove()`. No live prototype flow, instance, or dependency broken.

---

## TASK 2 — Shadow / elevation token (Decision Log #118)

### The decision: COLOR variable + effect style (not a true effect variable)

Figma's `VariableBindableEffectField` is `'color' | 'radius' | 'spread' | 'offsetX' | 'offsetY'`;
`color` binds to a **COLOR** variable, the geometry fields bind only to **FLOAT** variables. This
file's `Soccernity Theme` collection is COLOR-only, and adding FLOAT variables purely to hold
`4`/`16`/`0` is disproportionate. There is also no FLOAT/EFFECT-variable object that could carry the
whole drop-shadow spec.

**Chosen form:**
1. **`color/shadow/elevated`** — new COLOR variable in `Soccernity Theme` (`VariableCollectionId:5096:2`),
   `VariableID:5973:2`. Holds only the shadow *colour*.
2. **`elevation/menu`** — new **effect style** (`S:550da29e6b8187717ea2265706b2507a00d75afc`), holds the
   full drop-shadow spec with its `color` field bound to the variable. Components apply it via
   `effectStyleId`, so geometry is centrally editable and colour is token-driven.

Matches the file's naming (`color/<group>/<variant>`; `shadow` is a new group alongside
`background`/`text`/`icon`) and the `figma-generate-library` guidance.

### Values

| | Light (`5096:0`) | Dark (`5096:1`) |
|---|---|---|
| `color/shadow/elevated` | `#282E65` @ **14% alpha** — i.e. `brand/navy` | `#0D0F21` @ **45% alpha** |
| Scope | `EFFECT_COLOR` | |
| WEB syntax | `var(--color-shadow-elevated)` | |

**Drop-shadow spec (`elevation/menu`):** `DROP_SHADOW`, offset **x 0 / y 4**, blur **16**, spread **0**,
`showShadowBehindNode: false`, blend `NORMAL`.

### Rationale — every colour traceable

- **Light = `brand/navy` at 14%**, not pure black (non-negotiable #3). A navy shadow reads softer
  against the warm-navy UI. 14% sits between `brand/green-tint` (12%) and `color/icon/inactive` (15%),
  the ceiling of the task's 8–16% band — a blurred single-layer shadow disperses density and navy
  (luminance ≈ 0.18) is lighter than black, so it needs ~+40% alpha over a typical 10% black menu
  shadow to read equivalently.
- **Dark = `#0D0F21` at 45%.** `#0D0F21` is not a new colour — it is the existing
  `color/background/page` **Dark** value (a documented navy-derivative). In dark mode `brand/navy` is
  *lighter* than the page background, so a literal navy shadow would glow. Dark mode has no screens in
  the file yet — defined-but-untested, flagged in the variable description.
- **x0 y4 blur16 spread0** — a standard single-layer menu/popover elevation.

Shadow colours are non-text decorative indicators — no AA text-contrast obligation; surfaces also have
a fill + corner radius + (mostly) a hairline, so meaning never rides on the shadow alone.

### Nodes changed

**Primary — Message Actions Menu (`5706:8270`, component, 1 instance `5709:8504`):** removed the 1px
`color/icon/inactive` stroke (the border-as-shadow workaround); applied `elevation/menu`. Fill already
bound to `color/background/surface`, radius 12 — unchanged. Instance count 1 → 1. Verified in context.

**Rebound off-palette-black shadows → `color/shadow/elevated`:**

| Node(s) | Component | Was | Now |
|---|---|---|---|
| `2819:4073/4074/4077/4079/4095` | `Dropdown menu/no notification` (`2841:5361`) | per-row `DROP_SHADOW` `#000000` @ 25%, y2 blur3.9 | colour bound to `color/shadow/elevated`, geometry kept |
| `2841:5364/5366/5368/5370/5372` | `Dropdown menu/notification on` (`2841:5363`) | same | same |
| `5685:9301/9303/9305/9307/9309` | `Dropdown menu/mobile - no notification` (`5685:9300`) | same | same |
| `5685:9313/9315/9317/9321/9323` | `Dropdown menu/mobile - notification on` (`5685:9312`) | same | same |
| `2459:10077` | `Banter post menu setting` (component, 0 instances) | `DROP_SHADOW` `#000000` @ 15%, blur4 | colour bound, geometry kept |

All 4 account-dropdown components have 0 instances (`OPEN_OVERLAY` prototype destinations only, per
DL #100–#103).

**Added real shadow (border-as-shadow workaround):**

| Node | Location | Change |
|---|---|---|
| `5176:6659` "menu" | inside `State Study B — Competition Selector` (Leaderboard design study) | applied `elevation/menu`; 1px `color/icon/inactive` border kept (spec-study frame, redundant-but-harmless) |

### Flagged — NOT changed

1. **Navigation Drawer — Mobile Panel (`5870:10692`)** — no elevation treatment at all (relies on the
   scrim). Not a border-as-shadow case; adding a leading-edge shadow is a visible design change →
   **DL #183**.
2. **Date-picker Month/Year panels** (`915:2307`, `915:2332`, `1557:2369`, `1557:2394`) — already carry
   a well-built **4-layer** drop shadow in off-palette `#130A2E`. A single bound COLOR variable forces
   one alpha across all layers, flattening the ramp. Left intact → **DL #182**.
3. **`calendar 2` (`2365:2034`) + instance `5404:7423`** — off-palette grey `#969696` @ 11% drop
   shadow. Owned by **Decision Log #53 / #178** (calendar retrofit session) — deferred there.
4. **Account-dropdown per-row shadow structure** — shadow applied to each of 5 row frames (the
   container has no fill to cast from), producing a faint inter-row stripe. Rebinding colour was safe;
   consolidating to one container shadow is structural → **DL #181**.
5. **Collapsed dropdown *triggers*** (~90 Leaderboard filter-bar instances) — inline 43px form
   controls, their 1px border is a legitimate input border, correctly excluded.
6. **`Old — Mobile Drop Down Components` (`1870:2753`)** — dead COMPONENT_SET, not touched.

---

## TASK 3 — Bants / Banter nav rename (Decision Log #163 remaining half)

Scope: nav chrome only (navbars `2838:3502` / `2841:4104` / `5386:6575` / `5386:6576`, drawer
`5870:10689`, and their icon/label children). Content-section frames named "Banter…" ("Banter
homepage", "Banter Rooms", "Banter - create topic", "Bants — All Feed — Mobile", the
`Filter Tabs (All / My Bants)` component, etc.) **left untouched** — Blog/News-rename precedent (#165).

| Node ID | Old → New | Location | Notes |
|---|---|---|---|
| `2838:3560` | `banter` → **`Bants`** | `header 4` desktop (`2838:3502`), `Frame 5858` nav row, 6th of 7 icons | GROUP. Component-level edit — name inherits to all ~60 navbar instances; instance count 60 → 60. No `banter`-named child layers inside. |
| `2841:4158` | `Group 831` → **`Bants`** | `header 7` desktop (`2841:4104`), `Frame 5858` nav row, 6th of 7 icons | GROUP. **Judgment call**: not literally named "banter", but unambiguously the header-7 Bants nav icon (vector children match `2838:3560` exactly; identical slot after `leaderboad`, before `clubs`). Renamed for consistency with its header-4 twin. Instance count 10 → 10. |

**Checked, no change needed:** drawer `5870:10689` (`Nav — Bants` `5870:10713`, label TEXT `5870:10715`
= "Bants" — already correct); `header 4 — mobile` / `header 7 — mobile` (64px logo+action bars, no
6-icon content-nav row); component set `2824:4309` and its variant names (no "banter" string);
`Bottom Navigation — Mobile App Nav` (`5863:9505`); `Old — Mobile App Nav Icons` (`2230:4328`).

**Adjacent observation (not fixed):** header-7 desktop's other nav items are also generically named
(`Group 833` Sports Hub, `Group 830` Blog) → **DL #184**.

---

## 4. Paint / token audit — everything touched

| Check | Result |
|---|---|
| Unbound paints introduced | **0** |
| Off-palette colours introduced | **0** — new token's Light value is `brand/navy` exactly; Dark value is the existing `color/background/page` Dark value |
| `brand/green-tint-28` | **0** introduced |
| Off-palette colours *removed* | `#000000` @ 25% (×20 effects), `#000000` @ 15% (×1 effect) → navy-derived token |
| Renames — instance integrity | `2838:3502`: 60 → 60. `2841:4104`: 10 → 10. 0 detachments. |

---

## 5. Decision Log — forward-pointer substance (written into the docx by the finalising session)

- **#114** — Resolved. 4 archived legacy Message frames reference-checked file-wide and deleted; only
  inbound reference was an archived→archived link, deleted with them.
- **#118** — Resolved. `color/shadow/elevated` COLOR variable + `elevation/menu` effect style added;
  applied to the Message Actions Menu (fake border removed), the 4 account-dropdown components (20
  per-row shadows rebound off `#000000`), `Banter post menu setting`, and the Competition-selector
  study menu. Follow-ups #181 / #182 / #183.
- **#163** — Fully resolved. Bants/Banter nav-label/icon half now done (`2838:3560` `banter` → `Bants`,
  `2841:4158` `Group 831` → `Bants`); Blog/News half was already closed via #165. Content-section
  "Banter…" frames deliberately unchanged.

---

## 6. New Decision Log candidates (continuing from #180)

- **#181 — Account-dropdown menus use a per-row drop shadow instead of one container shadow.** Fix =
  give the container a bound `color/background/surface` fill + radius, move one `elevation/menu` shadow
  to it, drop the per-row effects. Structural, deferred.
- **#182 — No multi-layer elevation token for large floating panels.** Date-picker Month/Year panels
  carry a 4-layer `#130A2E` shadow that a single bound COLOR variable would flatten. Consider an
  `elevation/overlay` effect style with 2–3 stacked navy-derived layers.
- **#183 — Navigation Drawer — Mobile Panel (`5870:10692`) has no elevation treatment.** Relies
  entirely on the scrim; could reuse `color/shadow/elevated` with a horizontal offset. Founder call.
- **#184 — `header 7` desktop nav items are generically named** (`Group 833` Sports Hub, `Group 830`
  Blog in `Frame 5858` `2841:4115`). Fold into the Log Book §23.4 generic-component naming cleanup.
- **Note for #53 / #178** — the `calendar 2` component (`2365:2034`) + instance `5404:7423` use an
  off-palette grey `#969696` @ 11% drop shadow. Rebind to `color/shadow/elevated` during the calendar
  retrofit session.
