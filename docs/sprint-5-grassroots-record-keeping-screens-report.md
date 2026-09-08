# Sprint 5 — Grassroots Record-Keeping screens (Figma design)

**Agent:** `figma-screen-builder` · **Date:** 2026-09-08 · **Scope:** Figma design only — no `apps/*` or
`services/api` code touched, nothing merged, no shell commands run.

Build Plan **Sprint 5 / Section 4.5**, entities `GrassrootsTeam` / `Fixture` / `Result`. No prior Figma
screen existed for any part of this feature. `GrassrootsModule` is still not wired into `services/api`
(confirmed in CLAUDE.md's own account-deletion-cascade bullet), so **every screen here is pre-backend**
and `figma-to-code` must not wire any of it until the gaps in §5 are resolved.

---

## 0. Preconditions verified live before authoring

The design-system token pass is **complete** — confirmed by reading the file directly rather than
trusting the brief:

- One real collection, `Soccernity Theme` (`VariableCollectionId:5096:2`), modes **Light** (`5096:0`,
  default) / **Dark** (`5096:1`), **14 COLOR variables**. Matches CLAUDE.md exactly; nothing stale.
- File "Soccernity-MVP" open, three pages present, real screens on **`0:1`**. As CLAUDE.md warns,
  `get_metadata`'s default page listing is unreliable here — page `0:1` was fetched directly.

All 21 frames are **Light mode only**.

---

## 1. Frame index — 21 frames

### Desktop row — `y 32800`

| # | Frame name | Node ID | x | Height |
|---|---|---|---|---|
| 1 | `Grassroots — 1 Register Team — Desktop` | `6367:16407` | 0 | 1118 |
| 2 | `Grassroots — 2 Team Registered — Desktop` | `6368:16495` | 1640 | 833 |
| 3 | `Grassroots — 3 Schedule Fixture — Desktop` | `6369:16675` | 3280 | 1795 |
| 4 | `Grassroots — 4 Schedule Fixture (Opponent TBD) — Desktop` | `6371:16908` | 4920 | 1548 |
| 5 | `Grassroots — 5 Fixture Scheduled — Desktop` | `6368:16610` | 6560 | 913 |
| 6 | `Grassroots — 6 Fixture Manage (Scheduled) — Desktop` | `6372:17141` | 8200 | 770 |
| 7 | `Grassroots — 7 Log Result (Live) — Desktop` | `6372:17259` | 9840 | 1032 |
| 8 | `Grassroots — 8 Result Confirmed (Full Time) — Desktop` | `6373:17321` | 11480 | 821 |
| 9 | `Grassroots — 9 Public Team Page (Verified) — Desktop` | `6373:17444` | 13120 | 1126 |
| 10 | `Grassroots — 10 Public Team Page (No Fixtures, Unverified) — Desktop` | `6374:17501` | 14760 | 799 |
| — | `Grassroots — Design Notes` | `6380:17791` | 16400 | 3945 |

### Mobile row — `y 35600`, all **390px** wide (Decision Log #86)

| # | Frame name | Node ID | x | Height |
|---|---|---|---|---|
| 1 | `Grassroots — 1 Register Team — Mobile` | `6375:17591` | 0 | 906 |
| 2 | `Grassroots — 2 Team Registered — Mobile` | `6375:17646` | 500 | 651 |
| 3 | `Grassroots — 3 Schedule Fixture — Mobile` | `6376:17631` | 1000 | 1248 |
| 4 | `Grassroots — 4 Schedule Fixture (Opponent TBD) — Mobile` | `6376:17711` | 1500 | 1180 |
| 5 | `Grassroots — 5 Fixture Scheduled — Mobile` | `6377:17671` | 2000 | 778 |
| 6 | `Grassroots — 6 Fixture Manage (Scheduled) — Mobile` | `6377:17724` | 2500 | 651 |
| 7 | `Grassroots — 7 Log Result (Live) — Mobile` | `6378:17711` | 3000 | 809 |
| 8 | `Grassroots — 8 Result Confirmed (Full Time) — Mobile` | `6378:17776` | 3500 | 742 |
| 9 | `Grassroots — 9 Public Team Page (Verified) — Mobile` | `6379:17751` | 4000 | 1062 |
| 10 | `Grassroots — 10 Public Team Page (No Fixtures, Unverified) — Mobile` | `6379:17868` | 4500 | 652 |

### Section caption (page-level, above the desktop row)

| Node | ID | x | y |
|---|---|---|---|
| `Section Title — Grassroots Record-Keeping` | `6367:16405` | 0 | 32280 |
| `Section Subtitle — Grassroots` | `6367:16406` | 4 | 32440 |

Both caption nodes are token-bound (`brand/navy`, `color/text/secondary`) — verified, not assumed.

**Scope note:** the brief asked for ~19 frames. This delivers **20 screens + 1 Design Notes frame**.
The extra pair is `Grassroots — 4 Schedule Fixture (Opponent TBD)` (desktop + mobile) — see §6.

---

## 2. Parking location and overlap check

- **Before:** page `0:1` envelope measured live as `x −69602 → 98176`, `y −32681 → 30577`
  across 512 top-level children. A candidate band at `y ≥ 32000` was tested and returned
  **0 intruders** — the entire band below the bottom-most existing node (`y+h = 30577`) is empty.
- **Parked at:** desktop row `y 32800`, mobile row `y 35600`. Final new-content bounds
  **`x 0 → 17520`, `y 32800 → 36848`** (plus the caption at `y 32280`).
- **Clear of both parked component zones** by a wide margin — the `Admin Shell` COMPONENT_SET
  (~`x 20000, y −16000`) and the `x 37943–53343 / y −16153 → −14929` zone are both at strongly
  negative `y`; this row is at positive `y 32800+`.
- **After:** a full pairwise AABB intersection test of all 21 new frames against **every** page `0:1`
  top-level child returned **0 clashes** — including no clashes among the new frames themselves.
  No relocation was needed.

---

## 3. Paint audit

Measured node-by-node across all 21 frames, counting only visible `SOLID` paints on visible nodes,
with **authored** and **inherited** (inside a component instance) reported separately.

| | Bound | Unbound | Off-palette | `brand/green-tint-28` |
|---|---|---|---|---|
| **Authored** | **861** | **0** | **0** | **0** |
| **Inherited (component instances)** | 942 | 8 | 0 | 0 |

- **0 new colours, 0 hardcoded hex, 0 `brand/green-tint-28`, 0 frame overlaps.**
- The **8 inherited unbound paints** are `4 × 2` — the four `opacity: 0` adjacent-month day numerals
  (`25`, `26`, `27`, `28`, all `#0F2552` at zero opacity) inside each of the two calendar instances on
  desktop frames 3 and 4. **These are exactly the paints the earlier calendar retrofit
  (`sprint-2/admin-panel-structural-pass`, Decision Log #53/#178) deliberately left unbound and
  disclosed**, because binding them makes invisible days visible — a bound paint takes its alpha from
  the token, overriding `opacity: 0`. Pre-existing, already-documented component debt; not introduced
  here and deliberately not "fixed" to hit a cosmetic zero.
- The navbar avatar `IMAGE` fill is the usual shared-component residual and is likewise not editable
  from an instance.

### Per-frame (authored bound / authored unbound / inherited bound / inherited unbound)

| Frame | A-bound | A-unbound | I-bound | I-unbound |
|---|---|---|---|---|
| 1 Register Team — D | 32 | 0 | 70 | 0 |
| 2 Team Registered — D | 21 | 0 | 70 | 0 |
| 3 Schedule Fixture — D | 53 | 0 | 121 | 4 |
| 4 Schedule Fixture (TBD) — D | 40 | 0 | 121 | 4 |
| 5 Fixture Scheduled — D | 27 | 0 | 70 | 0 |
| 6 Fixture Manage — D | 22 | 0 | 70 | 0 |
| 7 Log Result — D | 43 | 0 | 70 | 0 |
| 8 Result Confirmed — D | 27 | 0 | 70 | 0 |
| 9 Public Team Page — D | 74 | 0 | 70 | 0 |
| 10 Public Team Page (empty) — D | 16 | 0 | 70 | 0 |
| 1 Register Team — M | 31 | 0 | 14 | 0 |
| 2 Team Registered — M | 21 | 0 | 14 | 0 |
| 3 Schedule Fixture — M | 50 | 0 | 14 | 0 |
| 4 Schedule Fixture (TBD) — M | 41 | 0 | 14 | 0 |
| 5 Fixture Scheduled — M | 26 | 0 | 14 | 0 |
| 6 Fixture Manage — M | 20 | 0 | 14 | 0 |
| 7 Log Result — M | 42 | 0 | 14 | 0 |
| 8 Result Confirmed — M | 28 | 0 | 14 | 0 |
| 9 Public Team Page — M | 68 | 0 | 14 | 0 |
| 10 Public Team Page (empty) — M | 16 | 0 | 14 | 0 |
| Design Notes | 163 | 0 | 0 | 0 |

### Tokens used

`brand/navy`, `brand/green`, `brand/green-tint` (12%), `brand/off-white`, `color/background/surface`,
`color/text/primary`, `color/text/secondary`, `color/text/on-navy`, `color/text/on-green`,
`color/icon/inactive`, `semantic/alert`. Type is **Inter** throughout, matching the Club Fan Page
chrome convention.

---

## 4. Reuse vs. built fresh

### Reused as real component instances

| Component | Node | Instances |
|---|---|---|
| `header 4` (logged-in desktop navbar) | `2838:3502` | 10 (one per desktop screen) |
| `header 4 — mobile` | `5386:6576` | 10, each resized 428 → 390 on placement |
| `Calendar for scheduled task` / `calendar 2` | `2365:2034` | 2 (desktop frames 3 and 4) — **not rebuilt**, same reuse Admin Contest Schedule Task made |

### Reused as visual patterns (rebuilt in place — no component exists for these in the file)

- **Form language** — `Guardian Consent — 2 Guardian Details Capture` (`5108:6627`): eyebrow / H1 /
  body stack, field labels, `brand/green-tint` input fills, helper text, green-tint callout card,
  full-width CTA, trailing text link.
- **Segmented control** — the Age Gate step's three-option pattern, applied to `leagueType`.
- **Public entity page** — `Club — Fan Page — Desktop` (`5841:9365`) / `Mobile` (`5841:9431`) and the
  shipped `apps/web/src/pages/ClubFanPage.tsx`: back link, monogram identity block, `hr` dividers,
  stacked sections with a title plus a count on the right.
- **Fixture rows and status pills** — Sports Hub match-list shape, using the palette-compliant
  green / navy / `semantic/alert`-as-a-dot scheme (Decision Log #149).
- **Confirmation screens** — Club Picker / `Guardian Consent — Activation Confirmation` (`5108:6631`) /
  `Admin — Competition Created (Success)` (`5569:7813`): success disc, H1, summary card, stacked
  primary + secondary actions, trailing link.

### Built fresh (no precedent existed anywhere in the file)

- **Score stepper** — `−` / value / `+`, in a wide desktop pair and a stacked mobile form.
- **Three-state fixture status pill** — `scheduled` / `live` / `full_time`.
- **"Opponent TBC" placeholder** — an outlined `?` tile standing in for a monogram when
  `teamBId = null`.
- **Verified vs. Community-team-unverified badges.**
- **Opponent search-results dropdown** with an inline "Opponent to be confirmed" option row.

---

## 5. Schema and contract gaps — flagged, never silently filled

The seven flags in the brief all held up. **Flag 3 was materially wrong and is corrected below**, and
**three further gaps (8, 9, 10) were found**. Each is annotated on the frame it affects as well as here.

| # | Gap | How the design handles it |
|---|---|---|
| **1** | **No team badge/photo field** on `GrassrootsTeam` (contrast `ClubPage.logoUrl`) | Initial monogram on a `brand/green-tint` square everywhere — the `ClubFanPage` fallback. A real badge needs a schema addition plus image storage. |
| **2** | **No free-text opponent name** | An unregistered opponent can only be `teamBId = null`. Frames 4 (D+M) design that as an explicit **"Opponent to be confirmed"** state; the public page renders it as **"Opponent TBC"**. A typed name would need e.g. `Fixture.opponentName String?`. |
| **3** | **`scheduledAt` is one `DateTime` — and the reused calendar is NOT date-only** | **CORRECTION to the brief.** The calendar component also carries an internal **"Set time"** row (with seconds) *and* its own **Cancel / Schedule** buttons, inherited from its Admin dialog context — both duplicate this form's own kick-off time field and primary CTA. Resolved by hiding that group (`Group 825`) as an **instance-level override** on frames 3 and 4, leaving a clean date grid; the shared component is deliberately **not** edited from a screen-design task. Date + a separate "Kick-off time" field combine client-side into one `scheduledAt`. |
| **4** | **No League / season / competition entity** | "Team/league profile creation" maps only to the three-value `leagueType`. One registration form; no league builder, no season, no table. |
| **5** | **`Result` is the final score only** | No half-time, goalscorers, cards or events designed. Won/Drew/Lost on the public page is derived client-side from `scoreA`/`scoreB` — not stored. |
| **6** | **No permission model and no result-dispute model** | Frame 7 warns *before* the irreversible save rather than offering an edit after. `Result.fixtureId @unique` means two organisers can race and first write wins. → **DL #255**. |
| **7** | **No `postponed` / `cancelled` status** | Only three values exist, so no call-off state is designed. Annotated on frame 6. |
| **8** | **NEW — no endpoint changes `Fixture.status`** | §4.5 lists `POST /fixtures` and `POST /fixtures/:id/result` and nothing that mutates `status`. So **"Start match" (scheduled → live) has no backing endpoint at all**, and "End match" can only be inferred as a side effect of writing the `Result`. Designed as a real affordance and annotated on-frame; the contract was not invented into. → **DL #254**. |
| **9** | **NEW — the reused calendar has no mobile variant** | It is a fixed **687px** desktop layout, wider than a 390px frame. Mobile frames 3 and 4 show a tappable date field instead. Same category of gap the mobile navbar had before Decision Log #48. → **DL #257**. |
| **10** | **NEW — no teams browse screen, no Grassroots nav entry point** | `GET /teams?city=` implies a browse-by-city surface that does not exist, and Grassroots has no home in the navbar or mobile drawer. The public page's "← Teams" link points nowhere. Same shape as Decision Log #156 for Clubs. → **DL #258**. |

---

## 6. Judgment calls

1. **`header 4` on every frame, including the public team page.** The organiser flows are
   authenticated, so this is unambiguous for frames 1–8. For the public page the choice was between
   the Club Fan Page's Figma "Top Bar — Soccernity" and the full nav. **The full nav wins** because the
   *shipped* `ClubFanPage.tsx` deliberately does **not** reproduce that top bar (it is an `AppShell`
   child rendering the shared `Header`), and `SportsHubPage` sets the precedent that a publicly
   viewable page shows identical content in both auth states. A logged-out visitor gets `header 7`
   from the same shared Header; only the logged-in variant is drawn.
2. **Primary buttons are `brand/navy`, not `brand/green`** — following the auth/email precedent
   (PR #100) of one consistent primary treatment. Green is reserved for status, accents, the verified
   badge and the success tick. Destructive/blocking actions are also navy: no
   `color/action/destructive` token exists and non-negotiable #3 forbids inventing one.
3. **`semantic/alert` is used exactly once, as a 6–7px non-text dot** inside the LIVE pill — never as a
   fill behind a label or as body copy, since it fails AA as text. The LIVE pill itself is
   `brand/green` with `color/text/on-green` (navy) at 5.29:1.
4. **Grassroots is deliberately visually distinct from a licensed club.** The public page withholds
   licensed-club chrome: no crest, no honours, no Join action, no club feed. The unverified default is
   an explicit outlined "Community team · Unverified" badge, so an organiser can never make their own
   team read as official. **Frame 9 draws `verified === true`; frame 10 draws the `false` default** —
   both variants exist, one per frame, as the brief asked.
5. **Two frames beyond the ~19 briefed.** The "Opponent to be confirmed" state got its own
   desktop + mobile pair rather than staying an inline note, because Flag 2 is the largest modelling
   constraint in the feature and the selected state changes the field, the callout *and* the
   downstream public row. Nothing was trimmed to compensate — no frame in the brief duplicates another.
6. **Mobile annotations are condensed**; the desktop frames and the Design Notes frame are
   authoritative for the full schema commentary, so a 390px screen is not dominated by annotation text.
7. **One neutral empty state on frame 10, not an owner-specific one.** Nothing in §4.5 tells the client
   whether the viewer is the organiser, and the schema encodes no permission model, so a conditional
   "Schedule a fixture" CTA could not be shown without a product decision. Flagged, not guessed.

---

## 7. Screenshot verification

Every frame was rendered and visually checked at build time (not just structurally validated).
Representative sample:

- **Frame 1 (Register Team — D)** — segmented control renders with `Informal` selected in navy, inputs
  in green-tint, annotations legible, no clipped text.
- **Frames 2 / 5 / 8 (confirmations)** — success disc, summary cards, status pills and stacked
  actions all render; the `full_time` outline pill and `2 – 1` score read correctly.
- **Frame 3 (Schedule Fixture — D)** — verified **twice**: once before the calendar fix (which is how
  the redundant "Set time" row and Cancel/Schedule buttons were caught), and again after, confirming a
  clean date-only grid. The calendar instance was separately screenshotted in isolation.
- **Frame 4 (Opponent TBD — D)** — checkbox filled navy with a white tick, search field and results
  list correctly removed, explanatory callout in place.
- **Frame 7 (Log Result — D and M)** — steppers, LIVE pill with its red dot, and the pre-save warning
  callout all correct in both the wide desktop pair and the stacked mobile form.
- **Frames 9 / 10 (D and M)** — fixture rows, "Opponent TBC" placeholder tile, results rows with
  scores, verified vs. unverified badges, and the empty state all render as intended.
- **Design Notes** — all seven sections render, no clipping.

Structural verification beyond screenshots: the calendar instance's child geometry was read
before/after the height change (`Month` at `y 0`, day grid at `y 113`, unchanged) to prove **zero child
drift**; the cloned frames were confirmed to carry the calendar override through the clone
(`height 242`, group still hidden).

---

## 8. Figma-authoring gotchas hit

1. **The brief's premise about the calendar was wrong** — it is not date-only. Caught by rendering
   rather than trusting the description. Same class of stale-premise catch as previous sessions in
   this project; corrected in place rather than designed around.
2. **A height-only instance resize after hiding a child is safe here, and was proven rather than
   assumed.** Trimming the calendar instance 423 → 242 produced zero drift because the remaining
   children are top-anchored — consistent with the previously documented finding that the
   `frame.resize()` constraint-drift bug bites on **width**-axis resizes. Verified by reading child
   coordinates before and after, not inferred.
3. **Avoided `figma.union` / `figma.subtract` entirely** (they discard input fills) by drawing the
   check, `−` and `+` glyphs as text nodes instead of vector booleans — so no unbound-black-stroke or
   default-gray cleanup was needed anywhere.
4. **Avoided `node.query()` throughout** and used `findAll` with predicates, because every frame name
   in this file contains an em-dash and the query selector rejects non-ASCII.
5. **Sidestepped the `createInstance()` alpha-reset trap by construction** — no authored paint relies
   on a fractional paint-level `opacity` under a bound variable. Washes use tokens that carry their own
   alpha (`brand/green-tint` 12%, `color/icon/inactive` 15%, `color/text/secondary` 70%), so alpha
   travels with the token.
6. **`clone()` parents under `figma.currentPage`, which resets to the cover page each call** — every
   script sets `await figma.setCurrentPageAsync(page 0:1)` first *and* explicitly re-appends clones to
   the page.
7. **TEXT sizing order** — create, `appendChild`, then `textAutoResize = 'HEIGHT'`, then
   `layoutSizingHorizontal = 'FILL'`. Applied uniformly; no collapsed-width text nodes resulted.

---

## 9. Ready-to-paste — Build Plan Section 9, Decision Log

> **#253 — Grassroots Record-Keeping screens designed (Sprint 5, Section 4.5).**
> `sprint-5/grassroots-record-keeping-screens`, 2026-09-08, `figma-screen-builder`. Figma design only —
> no app/backend code; `GrassrootsModule` is still unwired. **21 new frames on page `0:1`**: a desktop
> row at `y 32800` (`x 0 → 17520`) and a 390px mobile row at `y 35600` (`x 0 → 4890`), plus a
> `Grassroots — Design Notes` frame (`6380:17791`). Four flows, each desktop + mobile: team
> registration (`6367:16407` / `6375:17591`, `6368:16495` / `6375:17646`); fixture entry
> (`6369:16675` / `6376:17631`, `6371:16908` / `6376:17711`, `6368:16610` / `6377:17671`); result
> logging across the real `scheduled → live → full_time` status machine (`6372:17141` / `6377:17724`,
> `6372:17259` / `6378:17711`, `6373:17321` / `6378:17776`); and the public team page in both
> `verified` variants (`6373:17444` / `6379:17751` verified, `6374:17501` / `6379:17868` unverified +
> empty state). Reused as real instances: `header 4` (`2838:3502`) ×10, `header 4 — mobile`
> (`5386:6576`) ×10 resized to 390, and `Calendar for scheduled task` / `calendar 2` (`2365:2034`) ×2 —
> no calendar was rebuilt. Form language follows `Guardian Details Capture` (`5108:6627`); the public
> page follows `Club — Fan Page` (`5841:9365`) but deliberately withholds licensed-club chrome (no
> crest, no Join, no feed) so a self-registered grassroots team never reads as official. Built fresh
> (no precedent in the file): the score stepper, the three-state fixture status pill, the "Opponent TBC"
> placeholder, and the verified / community-unverified badges. **Audit: 861 authored paints, 0 unbound,
> 0 off-palette, 0 `brand/green-tint-28`, 0 new colours, 0 frame overlaps**; the only 8 inherited
> unbound paints are the four `opacity: 0` adjacent-month numerals inside each calendar instance —
> pre-existing debt already disclosed by Decision Log #53/#178, deliberately left. Primary and
> destructive buttons are `brand/navy` (PR #100 precedent); `semantic/alert` appears once, as a
> non-text LIVE dot (Decision Log #149). **Surfaces new candidates #254–#258 and corrects one brief
> premise** (the reused calendar is not date-only — see #257). `figma-to-code` must not build these
> screens until #254 at minimum is resolved.

> **#254 — No endpoint changes `Fixture.status`.** Section 4.5 defines `POST /fixtures` and
> `POST /fixtures/:id/result` but nothing that mutates `status`, so the "Start match"
> (`scheduled → live`) affordance on frame 6 has no backing endpoint, and `live → full_time` can only
> be inferred as a side effect of writing the `Result`. Needs either `PATCH /fixtures/:id` or an
> explicit documented derived-status rule. Raised by `sprint-5/grassroots-record-keeping-screens`.
> **Open — `backend-api`. Blocks `figma-to-code` on frames 6 and 7.**

> **#255 — No permission model, and a race on the `@unique` Result row.** The schema does not encode
> who may create a fixture for a team or who may log its result, and `Result.fixtureId @unique` means
> two organisers can submit concurrently with first-write-wins and no amend or dispute path. The design
> warns before the irreversible save rather than offering a post-hoc edit. Raised by
> `sprint-5/grassroots-record-keeping-screens`. **Open — `backend-api` + founder.**

> **#256 — No free-text opponent name on `Fixture`.** An opponent not registered on Soccernity can only
> be stored as `teamBId = null`, designed as an explicit "Opponent to be confirmed" state and rendered
> publicly as "Opponent TBC". Confirm this is the intended permanent answer, or add a nullable
> opponent-name field. Raised by `sprint-5/grassroots-record-keeping-screens`. **Open — founder.**

> **#257 — Calendar component carries an inherited time row and action buttons, and has no mobile
> variant.** `Calendar for scheduled task` (`2365:2033`) is not date-only: it includes a "Set time" row
> (with seconds) and its own Cancel/Schedule buttons from its original Admin dialog context, which
> duplicate a host form's own time field and primary CTA. Suppressed per-instance on frames 3 and 4;
> the proper fix is a component property or variant on the shared component. Separately, it is a fixed
> 687px desktop layout with no mobile variant, so mobile frames show a date field instead. Its sample
> month still reads "January 2022". Raised by `sprint-5/grassroots-record-keeping-screens`.
> **Open — `figma-design-system`.**

> **#258 — No teams browse screen and no Grassroots nav entry point.** `GET /teams?city=` implies a
> browse-by-city surface that does not exist, Grassroots has no home in the navbar or the mobile
> drawer, and the public team page's "← Teams" link points nowhere. Same shape of gap Decision Log
> #156 recorded for Clubs. Raised by `sprint-5/grassroots-record-keeping-screens`.
> **Open — founder + `figma-screen-builder`.**

---

## 10. Ready-to-paste — CLAUDE.md "Where things stand right now" bullet

```markdown
- **`sprint-5/grassroots-record-keeping-screens` (figma-screen-builder, 2026-09-08) designs the
  Grassroots Record-Keeping feature (Build Plan Sprint 5, Section 4.5) — 21 brand-new Figma frames,
  the first screens this feature has ever had. Figma design only, no app/backend code;
  `GrassrootsModule` is still unwired in `services/api`.** Report:
  `docs/sprint-5-grassroots-record-keeping-screens-report.md`. Decision Log **#253–#258** proposed.
  - **Parked in a fresh row on page `0:1`** — desktop at `y 32800` (`x 0 → 17520`), 390px mobile at
    `y 35600` (`x 0 → 4890`), plus a section caption at `y 32280`. The band below `y 32000` was
    verified empty beforehand (page content ends at `y 30577`) and a full pairwise AABB test against
    every page `0:1` child afterwards returned **0 clashes**. Clear of both parked component zones.
  - **Four flows, desktop + mobile each:** team registration (`6367:16407`/`6375:17591`,
    `6368:16495`/`6375:17646`); fixture entry (`6369:16675`/`6376:17631`, plus a dedicated
    Opponent-TBD state `6371:16908`/`6376:17711`, and `6368:16610`/`6377:17671`); result logging
    across the real `scheduled → live → full_time` machine (`6372:17141`/`6377:17724`,
    `6372:17259`/`6378:17711`, `6373:17321`/`6378:17776`); and the public team page in both
    `verified` variants (`6373:17444`/`6379:17751` verified, `6374:17501`/`6379:17868` unverified
    with the no-fixtures empty state). Plus `Grassroots — Design Notes` (`6380:17791`).
  - **Reused, not rebuilt:** `header 4` (`2838:3502`) ×10, `header 4 — mobile` (`5386:6576`) ×10
    resized to 390, and `Calendar for scheduled task`/`calendar 2` (`2365:2034`) ×2. Form language
    from `Guardian Details Capture` (`5108:6627`); public page from `Club — Fan Page` (`5841:9365`)
    but **deliberately withholding licensed-club chrome** (no crest, no Join, no feed) so a
    self-registered team never reads as official. Built fresh: score stepper, three-state fixture
    status pill, "Opponent TBC" placeholder, verified/community-unverified badges.
  - **Audit, measured node-by-node: 861 authored paints, 0 unbound, 0 off-palette, 0
    `brand/green-tint-28`, 0 new colours, 0 overlaps.** The only 8 inherited unbound paints are the
    four `opacity: 0` adjacent-month numerals inside each calendar instance — pre-existing debt
    already disclosed under Decision Log #53/#178, deliberately left rather than force-bound.
    Primary *and* destructive buttons are `brand/navy` (PR #100 precedent — no destructive token
    exists, non-negotiable #3); `semantic/alert` appears exactly once as a non-text LIVE dot (#149).
  - **A brief premise was wrong and was corrected rather than followed:** the reused calendar is
    **not** date-only — it carries an internal "Set time" row and its own Cancel/Schedule buttons
    from its Admin dialog context, which duplicate the host form's time field and primary CTA. Both
    are hidden as an **instance-level** override; the shared component is deliberately not edited
    from a screen-design task (**#257**, which also records that it has no mobile variant at 687px
    fixed, and that its sample month still reads "January 2022").
  - **Seven schema gaps confirmed and three more found, all flagged not filled:** no team
    badge/photo field (monogram used); no free-text opponent name (`teamBId = null` / "Opponent TBC"
    is the only option — **#256**); `scheduledAt` is one DateTime; no League/season entity; `Result`
    is final-score-only; **no permission model and a first-write-wins race on the `@unique` Result
    row (#255)**; no `postponed`/`cancelled` status; **NEW — Section 4.5 defines no endpoint that
    changes `Fixture.status`, so "Start match" has no backing endpoint at all (#254)**; NEW — the
    calendar has no mobile variant (#257); **NEW — no teams browse screen and no Grassroots nav
    entry point, so `GET /teams?city=` has no surface and "← Teams" points nowhere (#258, the same
    shape as #156 for Clubs)**.
  - **`figma-to-code` must not build these screens until at least #254 is resolved** — the status
    machine the result flow depends on has no endpoint today.
  - Not merged — founder's call after review.
```

---

## 11. Handover

- Nothing was merged; no git or shell command was run.
- **Not designed, deliberately:** a teams browse/discovery screen (#258), any squad/player list, any
  league table or standings, any fixture-edit or result-amend screen (no endpoint, and #255 is
  unresolved), and any postponed/cancelled state (#7 — the status enum has no such value).
- The Design Notes frame (`6380:17791`) carries the flow map, the full schema-field-to-UI mapping, the
  endpoint-to-screen mapping, all ten flags, the judgment calls and the proposed Decision Log entries,
  so the next agent can work from the canvas without this file.
