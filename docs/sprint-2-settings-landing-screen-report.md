# Sprint 2 — Settings landing screen (desktop + mobile) — PR 2 of 6

**Agent:** figma-screen-builder
**Date:** 2026-09-07
**Scope:** Executes **founder decision #8 only** (top-level Settings landing), plus the one coupled existing-frame edit that decision requires (the D1/M1 rename that frees the name). Part of the Settings-family consolidation, Decision Log #230.
**Figma design only** — no app code, no backend code.
**Branch (not yet created — see §9):** `sprint-2/settings-landing-screen` off `main`.

Per the founder clarification of 2026-09-07, the landing is **two separate frames**, mobile and desktop — not one shared frame, and distinct from PR 1's `Settings — Menu — Mobile`.

---

## 1. What was built / changed

| # | Item | Node ID | Status |
|---|---|---|---|
| 1 | `Settings — Overview` (desktop landing) | **`6295:15068`** | NEW — 1440 × 2517 at `x −16469, y −8642` |
| 2 | `Settings — Overview — Mobile` (mobile landing) | **`6297:15173`** | NEW — 390 × 408 at `x 5439, y −8642` |
| 3 | `2905:4798` `Settings — Overview` → **`Settings — Account`** | `2905:4798` | RENAMED |
| 4 | `5607:7813` `Settings — Overview — Mobile` → **`Settings — Account — Mobile`** | `5607:7813` | RENAMED |

The renames were done **first**, as instructed, so both `Settings — Overview` names were free before the new frames were created. A post-rename sweep of the whole Settings family confirms **43 uniquely-named frames, no duplicates and no collisions** — both old names are now held only by the new landings, and both new names by the renamed section pages.

### The rename did not break PR 1 — verified, not assumed

PR 1's `Nav Row — Account` (`6290:15068`) is wired to `5607:7813` **by node ID**. Read back from a fresh node handle *after* the rename:

```
reaction: ON_CLICK → NAVIGATE → 5607:7813
resolves to: { id: "5607:7813", name: "Settings — Account — Mobile", type: "FRAME" }
```

The link survived and now correctly points at the renamed frame. Re-checked a second time at the end of the session — still valid.

---

## 2. Desktop landing — proposed content, then built

### Proposed

```
Settings — Overview          FRAME 1440 × 2517, absolute layout (canonical family geometry)
├── Web app Navbar           clone of the header-4 (logged-in) instance, 1440×90 @ (0,0)
├── Frame 5910 (nav rail)    clone @ (344,116) — "Settings" H1 + the 5-item rail,
│                            ALL FIVE ROWS IN THEIR RESTING VARIANT (active section = none)
├── Line 106 / Line 107      the two canonical column dividers @ x 674 / x 1239
└── Content Panel            @ (688,186), width 396, VERTICAL gap 28
    ├── Panel Header         "Overview" (Bold 18) + one-line intro (Regular 14)
    ├── Signed In As         compact identity row — initials disc + display name + email
    └── Section Links        5 entry rows (name + factual one-liner + chevron)
```

**NO Community-style left sidebar** — no profile card, no bio/location, no follower/following/post counts, no "View profile", no Trending News, no Suggested follows.

### Built — confirmed identical to the proposal

The finished frame has exactly **5 direct children**, against the source shell's **43**:

| Child | ID | Geometry |
|---|---|---|
| `Web app Navbar - Desktop and Mobile` (INSTANCE, header 4) | `6295:15069` | 1440×90 @ (0,0) |
| `Frame 5910` (nav rail block) | `6295:15160` | 331×265 @ (344,116) |
| `Line 106` | `6295:15168` | divider @ x 674 |
| `Line 107` | `6295:15169` | divider @ x 1239 |
| `Content Panel` | `6296:15173` | 396×475 @ (688,186) |

That 5-vs-43 child count is the cleanest proof the sidebar was never cloned. Independently, a text sweep of the whole subtree for `@christine001`, `Trending News`, `Suggested`, `Followers`, `Following`, `View profile`, `Port Harcourt`, `Arsenal Stan`, `Kane joins` returned **zero hits** (§6).

### Nav rail — "active section = none" built from real variants, not a faked look

The rail rows are instances of the existing set `Frame 5904` (`2906:7170`), which carries 15 variants across `Property 1` — a resting, a `hover`, and a `click`/`clicked` state for each of the 5 sections. In the source frame row 1 sat in `click account` (the active state: navy fill, white label, plus a `Rectangle 351` accent bar). For this landing every row was set to its **resting** variant, so "active = none" is a genuine component state rather than a hand-restyled copy:

| Row | Variant applied | Label set (decisions #2/#3) |
|---|---|---|
| 1 | `account` | Account |
| 2 | `security and account access` | Security & Account Settings |
| 3 | `privacy and safety` | Privacy |
| 4 | `notification` | Notification Preferences |
| 5 | `Display and language` | Display, Language & Region |

Labels are **instance-level text overrides**, so the set's other ~90 instances across the file are untouched.

**A real layout trap was found and fixed rather than shipped.** Each rail variant hard-codes a per-row `itemSpacing` (245 / 100 / 173 / 215 / 81) to fake right-alignment against its *original* label width. Replacing "notifications" (89px) with "Notification Preferences" (169px) against a fixed 215px gap would have pushed the chevron out of the row. Each row was therefore switched to `primaryAxisAlignItems: SPACE_BETWEEN` with `itemSpacing: 0`, so the chevron pins right regardless of label length. Verified after the fact — **all five chevrons now sit at exactly `x 305`**, uniform across rows of very different label widths.

### Content panel content — grounded, nothing invented

- **Header:** "Overview" + "Manage your Soccernity account, privacy, and preferences". Deliberately *not* the Account section's rows — those stay on `2905:4798`.
- **Signed In As:** initials disc + display name + email. Both `displayName` and `email` are real `User` columns returned by `GET /users/:id`, so this row is backed. It uses the file's established sample person for consistency. It is explicitly **not** the Community profile card — no bio, no location, no follower/following/post counts, no "View profile" link.
- **Section Links:** 5 entry rows, each name + factual one-liner + chevron, **cloned from PR 1's rows** so every variable binding, font, sizing mode and the navy chevron are inherited rather than re-authored. The desktop landing and the mobile menu hub therefore carry byte-identical row content.
- **No status widgets were invented.** Nothing on this panel displays data without a source.

---

## 3. Mobile landing — proposed content, then built

### Proposed and built (identical)

```
Settings — Overview — Mobile   FRAME 390 × hug, VERTICAL, color/background/page
├── Top Bar — Soccernity        clone of the canonical 6185:14548 logo bar
└── Content                     VERTICAL, pad 24/20/40/20, gap 28
    ├── Header                  "Settings" (Bold 28) + one-line intro (Regular 14)
    ├── Signed In As            identity snapshot — initials disc + display name + email
    └── All Settings Link       PROMINENT green-tint card → Settings — Menu — Mobile
```

Final size **390 × 408** (Decision Log #86). Two direct children: `Top Bar — Soccernity` (`6297:15174`), `Content` (`6297:15178`).

**This deliberately does NOT repeat the 5-section list.** Per the brief, the mobile landing is the `/settings` root — identity + intro + one prominent way in; the menu hub (PR 1) is one tap deeper. That is exactly what distinguishes this frame from `Settings — Menu — Mobile`.

The "All settings" card is made prominent using `brand/green-tint` (12%) at radius 12 with 16px padding — **no new colour, and not `brand/green-tint-28`**. It carries the label "All settings", the sub-line "Account, security, privacy, notifications, and display", and the same navy chevron used everywhere else.

---

## 4. Route mapping — all 11 reactions wired and read back

Every reaction was written, then **re-read from a fresh node handle**, and every destination confirmed live to be an existing top-level `FRAME` before wiring (Figma's `NAVIGATE` requires a different top-level frame).

### Desktop — nav rail (5) and content entry rows (5), same targets

| Label | Rail row | Content row | → Destination | Destination name (read live) |
|---|---|---|---|---|
| Account | `6295:15163` | `6296:15184` | `2905:4798` | Settings — Account |
| Security & Account Settings | `6295:15164` | `6296:15190` | `2926:8056` | Settings — Security Overview |
| Privacy | `6295:15165` | `6296:15196` | `6178:14437` | Settings — Privacy |
| Notification Preferences | `6295:15166` | `6296:15202` | `2926:9721` | Settings — Notification Preferences |
| Display, Language & Region | `6295:15167` | `6296:15208` | `2922:5832` | Settings — Display, Language & Region |

The 5 content rows were cloned from PR 1, which meant they arrived carrying PR 1's **mobile** targets. Those were explicitly cleared and re-wired to the desktop frames — verified, so no row silently points at a mobile screen.

### Mobile — one link

| Element | Node | → Destination | Destination name (read live) |
|---|---|---|---|
| All Settings Link | `6297:15188` | `6289:15068` | Settings — Menu — Mobile |

---

## 5. Screenshot verification

**Desktop (`6295:15068`)** — navbar renders with the full logged-in chrome; "Settings" H1 and the 5-item rail render with **no navy highlight on any row**, visually confirming active = none; all five rail labels show the decision #2/#3 wording; both column dividers render; the content panel shows the Overview header, the identity card, and 5 entry rows each with a visible navy chevron. **The left gutter is empty** — the intended, disclosed consequence of decision #4 (see §7.1). No clipping, no overlap, no text collision.

**Mobile (`6297:15173`)** — logo top bar with its hairline divider; "Settings" heading and intro; identity card with the green-tint initials disc, name and email; and the prominent green-tint "All settings" card with its navy chevron. Content hugs to 408px with no dead space. No clipping, no overlap.

---

## 6. Paint audit — node-by-node, measured

Audited by walking both subtrees and classifying every visible fill and stroke as either **authored** (nodes this PR created) or **inherited** (nodes inside a cloned component `INSTANCE`, which cannot be edited from the instance).

### Authored nodes — the target metric

| Metric | Desktop | Mobile | Target |
|---|---|---|---|
| Authored paints | 27 | 17 | — |
| **Bound to a `Soccernity Theme` variable** | **27** | **17** | — |
| **Unbound** | **0** | **0** | 0 ✅ |
| **Off-palette** | **0** | **0** | 0 ✅ |
| **`brand/green-tint-28`** | **0** | **0** | 0 ✅ |
| **New colours** | **0** | **0** | 0 ✅ |
| **Frame overlaps (vs. all page children)** | **0** | **0** | 0 ✅ |
| Admin Shell parked-zone clash | none | none | none ✅ |
| Community-sidebar content hits | **0** | **0** | 0 ✅ |
| Nodes in subtree | 154 | 21 | — |

### Inherited component-instance debt — disclosed, not hidden

| | Desktop | Mobile |
|---|---|---|
| Paints inside instances | 81 | 0 |
| Bound | 80 | 0 |
| **Unbound** | **1** | 0 |
| Off-palette | 0 | 0 |
| `brand/green-tint-28` | 0 | 0 |

The single unbound paint is `Ellipse 33` (`I6295:15069;2838:3579;2819:4082`) — the **avatar `IMAGE` fill inside the shared Navbar instance**. This is the exact, already-documented shared-component debt CLAUDE.md names repeatedly ("the only residual unbound paints are the shared Navbar instance's avatar `[IMAGE]` fill — pre-existing component debt, not editable from an instance"). It was **not** force-bound, because doing so is impossible from an instance and papering over it would make the audit dishonest.

The mobile frame has **zero** inherited instance paints — its cloned top bar is a plain `FRAME`, not an instance, so every one of its paints is authored and bound.

### Token usage (Light mode, collection `VariableCollectionId:5096:2`)

Desktop: `brand/navy` 60 · `color/text/primary` 17 · `brand/green-tint` 10 · `color/text/secondary` 10 · `color/icon/inactive` 4 · `brand/green` 3 · `color/background/surface` 2 · `color/background/page` 1.
Mobile: `color/text/secondary` 4 · `color/text/primary` 3 · `brand/green-tint` 2 · `brand/navy` 2 · `color/icon/inactive` 2 · `color/background/surface` 2 · `brand/green` 1 · `color/background/page` 1.

Only the two brand colours and their derived tokens. No `semantic/alert`, no `brand/off-white`, no shadow token.

---

## 7. Decisions taken, and disclosed

**7.1 — The desktop landing keeps the canonical rail/content x-positions, leaving an empty left gutter. Deliberate.**
With the Community sidebar omitted, the `x 0–344` band is empty. The alternative was to shift the rail and content panel left to reclaim it. I kept the canonical positions (rail `x 344`, content `x 688`, dividers `x 674` / `x 1239`) because **that is exactly what the other 19 desktop Settings frames will look like once PR 5 removes their sidebars**. Matching them keeps all 20 frames geometrically identical, so PR 6's componentization is a uniform swap rather than a reconciliation. Re-balancing the layout is a legitimate call — but it belongs to PR 6, applied to all 20 at once, not to this one frame in isolation.

**7.2 — Height kept at the family's canonical 2517px.** Content ends around y 660, so the frame is mostly empty below. Every existing desktop Settings frame is 2517 with content in its top portion, and the cloned dividers are sized to that height. Diverging here would break row alignment and complicate PR 6.

**7.3 — Rail rows switched to `SPACE_BETWEEN`.** An instance-level layout override, needed because the variants hard-code per-row `itemSpacing` tuned to their original label widths (§2). Without it the longer decision #2/#3 labels would have displaced the chevrons.

**7.4 — Identity row uses backed fields only.** `displayName` and `email` are real `User` columns. No follower counts, no bio, no location, no `@handle` (which has no backing column — Decision Log #58). The email shown is a clearly-fictional sample address.

**7.5 — Desktop content rows cloned from PR 1 rather than re-authored**, so the landing and the mobile hub cannot drift in copy or styling, and the navy chevron carries over automatically.

**7.6 — Both landings intentionally omit a back affordance**, consistent with the reasoning recorded in PR 1: these are top-level screens, and the mobile entry point (`Navigation Drawer — Mobile`, `5870:10689`) is an overlay, not a `NAVIGATE` destination.

---

## 8. Flagged, not fixed (all out of scope)

1. **The `Settings` section banner does not cover either new frame.** The desktop banner `2930:10458` spans `x −15259 → −11873`; the new desktop landing sits at `x −16469 → −15029`, just left of it. The mobile banner `5698:8239` spans `x −4751 → −2085`; the new mobile landing sits at `x 5439 → 5829`. This is the same pre-existing coverage gap flagged in PR 1 (and the same class as Decision Log #195/#206) — now affecting four frames. Whichever later PR reflows these rows should widen both banners.
2. **Invisible chevrons on the existing inline `Category Nav`** — carried forward from PR 1, still for PR 5.
3. **Stale rail labels on the other ~19 desktop frames.** This landing's rail shows the decision #2/#3 wording via instance overrides; every other frame still shows "security and account access" / "notifications". Aligning them file-wide is PR 5/PR 6 — ideally at the component level rather than 19 more instance overrides.
4. **Navbar avatar `IMAGE` fill** (§6) — shared-component debt, not addressable from an instance.

---

## 9. No shell in this session

No Bash/shell tool was available, so the following must be finalised in a follow-up session — same pattern as PRs #98 / #102 / #110 / #130 / #151 / #205:

- create branch `sprint-2/settings-landing-screen` off `main`
- commit this report
- transcribe the §10 entry into the Build Plan's live docx (Section 9) as **#245**, and append a forward-pointer to **#230**'s Status cell (**#230 stays Open** — 8 of the 10 founder decisions remain unexecuted after this PR)
- open the PR

---

## 10. Draft Decision Log entry — #245

> **#245 — Top-level Settings landing built, desktop + mobile, as two separate frames; `Settings — Overview` renamed to `Settings — Account`.**
> `sprint-2/settings-landing-screen`, 2026-09-07. Executes **founder decision #8** of the Settings-family consolidation set. Per the founder's 2026-09-07 clarification the landing is **two separate frames**, not one shared frame, and is distinct from PR 1's `Settings — Menu — Mobile` (Decision Log #244).
> **New: `Settings — Overview` (`6295:15068`)**, 1440 × 2517, built in the standard desktop Settings shell — cloned header-4 navbar, cloned nav rail, both canonical column dividers, and a content panel at the canonical `(688,186)` — but **deliberately without the Community-style left sidebar** (decision #4), so it is not born with debt PR 5 would immediately have to remove. Proof it was never cloned: the frame has **5 direct children against the source shell's 43**, and a text sweep for `@christine001` / `Trending News` / `Suggested` / `Followers` / `View profile` / bio / location returns **zero hits**.
> The nav rail is set to **active section = none using the set's real resting variants** (`account`, `security and account access`, `privacy and safety`, `notification`, `Display and language` on `Frame 5904` `2906:7170`), not a hand-restyled copy of the active state. Rail labels apply founder decisions **#2**/**#3** verbatim as **instance-level text overrides**, leaving the set's other ~90 instances untouched. Content panel = "Overview" header + a compact signed-in identity row (`displayName` and `email` only — both real `User` columns; no follower counts, bio, location or `@handle`, which has no backing column per #58) + 5 section entry rows **cloned from PR 1's rows**, so the desktop landing and the mobile hub cannot drift.
> **New: `Settings — Overview — Mobile` (`6297:15173`)**, 390 × 408 (#86) — logo top bar, intro, identity snapshot, and one **prominent** `brand/green-tint` "All settings" card wired to `Settings — Menu — Mobile` (`6289:15068`). It deliberately does **not** repeat the 5-section list: this is the mobile `/settings` root, the menu hub is one tap deeper.
> **Renamed (the one existing-frame edit, coupled to this decision):** `2905:4798` → **`Settings — Account`**, `5607:7813` → **`Settings — Account — Mobile`**, resolving the audit's finding that "Settings — Overview" was mislabelled and was actually the Account section page. **PR 1's Account row (`6290:15068`) was wired by node ID and survived**, confirmed by reading the reaction back after the rename and re-confirming at session end. A family sweep afterwards found 43 uniquely-named frames, no duplicates.
> **11 reactions wired, every one read back from a fresh handle**, with all destinations confirmed live as existing top-level frames: 5 rail rows and 5 content rows → `2905:4798` / `2926:8056` / `6178:14437` / `2926:9721` / `2922:5832`; the mobile card → `6289:15068`. The cloned content rows arrived carrying PR 1's **mobile** targets — these were explicitly cleared and re-wired, so no desktop row silently points at a mobile screen.
> **A real layout trap was found and fixed rather than shipped:** each rail variant hard-codes a per-row `itemSpacing` (245/100/173/215/81) tuned to its *original* label width, so the longer decision #2/#3 labels would have displaced the chevrons. Rows were switched to `SPACE_BETWEEN` with `itemSpacing: 0`; all five chevrons now sit at exactly `x 305`.
> **Audit, measured node-by-node, authored vs. inherited stated separately:** authored — desktop **27/27 bound**, mobile **17/17 bound**, both **0 unbound / 0 off-palette / 0 `brand/green-tint-28` / 0 new colours**, **0 overlaps**, no Admin-zone clash. Inherited component-instance debt — desktop **1 unbound**, the shared Navbar's avatar `IMAGE` fill, which is not editable from an instance and was **not** force-bound; mobile **0**.
> **Disclosed judgment calls:** the desktop landing keeps the canonical rail/content x-positions, leaving an empty left gutter — matching what all 19 other frames will look like post-PR-5 so PR 6 can componentize uniformly, rather than re-balancing this one frame in isolation; height kept at the family's canonical 2517px for the same reason.
> **Flagged, not fixed:** neither section banner covers the new frames (same pre-existing gap as PR 1, now 4 frames); the invisible white-bound `Category Nav` chevrons (PR 5); and the ~19 other desktop frames still showing the stale rail labels, which should be fixed at component level rather than by 19 more instance overrides.
> Full detail: `docs/sprint-2-settings-landing-screen-report.md`. This is **PR 2 of 6**; **Decision Log #230 stays Open** — 8 founder decisions remain.

---

## 11. Draft CLAUDE.md status bullet

> - **`sprint-2/settings-landing-screen` (figma-screen-builder, 2026-09-07) is
>   PR 2 of 6 in the Settings-family consolidation (Decision Log #230) and
>   executes founder decision #8 — the top-level Settings landing. Figma design
>   only, no app/backend code.** Report:
>   `docs/sprint-2-settings-landing-screen-report.md`. Decision Log **#245**
>   added; forward-pointer on **#230**, which **stays Open** (8 of the 10 founder
>   decisions remain unexecuted).
>   - Per the founder's 2026-09-07 clarification the landing is **two separate
>     frames**, not one shared frame, and distinct from PR 1's menu hub:
>     **`Settings — Overview` (`6295:15068`)**, 1440 × 2517 desktop, and
>     **`Settings — Overview — Mobile` (`6297:15173`)**, 390 × 408 (Decision Log
>     #86).
>   - **The desktop landing is built in the standard Settings shell but
>     deliberately WITHOUT the Community-style left sidebar** (decision #4), so it
>     is not born with debt PR 5 would immediately have to remove. Proof it was
>     never cloned: **5 direct children against the source shell's 43**, and a
>     text sweep for `@christine001` / `Trending News` / `Suggested` /
>     `Followers` / `View profile` / bio / location returns **zero hits**.
>   - **The nav rail's "active section = none" uses the set's real resting
>     variants** (on `Frame 5904` `2906:7170`), not a hand-restyled copy of the
>     active state. Rail labels apply founder decisions **#2**/**#3** verbatim as
>     **instance-level text overrides**, so the set's other ~90 instances across
>     the file are untouched.
>   - **A real layout trap was found and fixed rather than shipped:** each rail
>     variant hard-codes a per-row `itemSpacing` (245/100/173/215/81) tuned to its
>     *original* label width, so the longer decision #2/#3 labels would have
>     pushed the chevrons out of their rows. Rows were switched to
>     `SPACE_BETWEEN`/`itemSpacing: 0`; all five chevrons now sit at exactly
>     `x 305`, verified.
>   - **Renames (the one existing-frame edit, coupled to decision #8):**
>     `2905:4798` → **`Settings — Account`**, `5607:7813` → **`Settings — Account
>     — Mobile`** — closing the audit's finding that "Settings — Overview" was
>     mislabelled and was really the Account section page. **PR 1's Account row
>     was wired by node ID and survived**, confirmed by reading the reaction back
>     after the rename; a family sweep found 43 uniquely-named frames, no
>     duplicates.
>   - **11 reactions wired, every one read back from a fresh handle**, all
>     destinations confirmed live as real top-level frames. The 5 desktop content
>     rows were cloned from PR 1 and therefore **arrived carrying PR 1's mobile
>     targets** — explicitly cleared and re-wired to the desktop frames, so no
>     desktop row silently points at a mobile screen. The mobile landing's one
>     prominent `brand/green-tint` "All settings" card routes to
>     `Settings — Menu — Mobile` (`6289:15068`); it deliberately does **not**
>     repeat the 5-section list, since it is the `/settings` root and the hub is
>     one tap deeper.
>   - **Audit, measured node-by-node, authored vs. inherited stated separately:**
>     authored — desktop **27/27 bound**, mobile **17/17 bound**, both **0
>     unbound / 0 off-palette / 0 `brand/green-tint-28` / 0 new colours**, **0
>     overlaps**, no Admin-zone clash. Inherited component-instance debt —
>     desktop **1 unbound**, the shared Navbar's avatar `IMAGE` fill, which is
>     **not editable from an instance and was deliberately not force-bound**;
>     mobile **0**.
>   - **Disclosed judgment calls:** the desktop landing keeps the canonical
>     rail/content x-positions and the family's canonical 2517px height, leaving
>     an empty left gutter — matching what all 19 other desktop frames will look
>     like once PR 5 strips their sidebars, so PR 6 can componentize all 20
>     uniformly rather than reconciling one re-balanced outlier. The identity row
>     shows only backed fields (`displayName`, `email`) — no follower counts, bio,
>     location or `@handle` (no backing column, Decision Log #58).
>   - **Flagged, not fixed:** neither section banner covers the new frames (same
>     pre-existing gap PR 1 flagged, now affecting 4 frames); the invisible
>     white-bound `Category Nav` chevrons (PR 5); and the ~19 other desktop frames
>     still showing the stale rail labels — which should be fixed at the component
>     level, not by 19 more instance overrides.
>   - Figma writes by the agent (no shell that session); branch, commit, docx
>     Decision Log transcription and PR finalised in a follow-up session with
>     shell access.
