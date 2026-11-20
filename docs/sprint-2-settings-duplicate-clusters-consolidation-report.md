# Sprint 2 — Settings duplicate-cluster consolidation — PR 4 of 6

**Agent:** figma-design-system
**Date:** 2026-09-07
**Scope:** Executes **founder decisions #1, #2, #3, #5, #6** of the Settings-family consolidation (Decision Log #230 / `docs/sprint-2-settings-family-consolidation-audit-report.md` §3). Phase A (PRs 1–3, decisions #7/#8/#10) is merged.
**Figma design only** — no app code, no backend code, no merge.
**Branch (not yet created — see §8):** `sprint-2/settings-duplicate-clusters-consolidation` off `main` (the finaliser stacks it).

---

## 1. Summary table

### 1a. Frames renamed (6)

| # | Node | Old name | New name |
|---|---|---|---|
| D9 | `2926:8056` | Settings — Security Overview | **Settings — Security & Account Settings** |
| M9 | `5695:8279` | Settings — Security Overview — Mobile | **Settings — Security & Account Settings — Mobile** |
| D19 | `2926:9482` | Settings — Mute New Accounts | **Settings — Muted accounts** |
| M19 | `5696:8307` | Settings — Mute New Accounts — Mobile | **Settings — Muted accounts — Mobile** |
| D16 | `2926:9230` | Settings — Notifications (Mute & Filter) | **Settings — Filters** |
| M16 | `5696:8281` | Settings — Notifications (Mute & Filter) — Mobile | **Settings — Filters — Mobile** |

D15 `2926:9721` **"Settings — Notification Preferences"** and M15 `5696:8340` **"…— Mobile"** — confirmed **kept** (decision #3), not renamed.

### 1b. Frames archived (4) — reference-checked, re-pointed, hidden, prefixed, moved

Discipline followed exactly: full page-`0:1` reaction scan first → re-point every inbound reference to the survivor → `visible = false` → `ARCHIVED — ` (em-dash) prefix → moved to a new **Settings archive strip at `y −13500`** (`x −16000 / −14200` desktop, `x −12400 / −11800` mobile). **0 overlaps** with any page child or each other (verified by bounding-box check). **Not deleted.**

| Node | New name | Inbound references found | Re-pointed to |
|---|---|---|---|
| D8 `2922:5143` | `ARCHIVED — Settings — Security & Account (redundant one-row intermediate — superseded by Settings — Security & Account Settings)` | **23** nodes: 21 × rail "security" row instances (`Frame 5906`) across the live Settings frames + `Settings — Security Overview`'s own security rail row + its own `arrow-back` | D9 `2926:8056` (rail rows); D9's own security rail row + arrow-back had their now-self-referential reactions **removed** |
| M8 `5649:8074` | `ARCHIVED — Settings — Security & Account — Mobile (…superseded by Settings — Security & Account Settings — Mobile)` | **0** — no node anywhere references it (the mobile menu hub, PR 1, already targets M9 `5695:8279` directly) | n/a |
| D14 `2922:5602` | `ARCHIVED — Settings — Notification Preferences (By Type) (losing competing hub — superseded by Settings — Notification Preferences)` | **24** nodes: 21 × rail "notification" row instances (`Frame 5908`) + `Settings — Notification Preferences`'s own `arrow-back` + `Settings — Filters`'s own `arrow-back` + D15's own notification rail row | D15 `2926:9721` (rail rows + D16 arrow-back); D15's own notification rail row + arrow-back reactions **removed** |
| M14 `5649:8116` | `ARCHIVED — Settings — Notification Preferences (By Type) — Mobile (…superseded by Settings — Notification Preferences — Mobile)` | **0** — the mobile menu hub (PR 1) already targets M15 `5696:8340` directly | n/a |

Plus **4 dead references cleaned inside already-hidden frames** for a genuinely-zero final scan: `Frame 5906`/`Frame 5908` inside `ARCHIVED — Settings — Privacy & Safety` (`2922:5382`) and the two frames being archived themselves — all re-pointed to D9/D15.

**Final verification scan: `0` nodes anywhere on page `0:1` reference any of the 4 archived frames.** No `flowStartingPoints` referenced them.

### 1c. Rail nav-TARGET re-point — **per-frame, not component-set level**

Checked first (as the brief asked): the 5 rail rows in each Settings frame are **instances of variants of the `Frame 5904` component set (`2906:7170`)**, but the component-set variants carry **only `ON_HOVER → CHANGE_TO` (variant-swap) reactions — no navigation**. Every `ON_CLICK → NAVIGATE` is an **instance-level override**. So a one-edit component-level re-point was **not possible**; the re-point was done **per instance**.

| Rail row | Instances re-pointed | Old target | New target |
|---|---|---|---|
| "security and account access" (`Frame 5906`) | **21** | D8 `2922:5143` | D9 `2926:8056` |
| "notification" (`Frame 5908`) | **21** | D14 `2922:5602` | D15 `2926:9721` |
| `arrow-back` on `Settings — Filters` (D16) | 1 | D14 `2922:5602` | D15 `2926:9721` (its hub) |
| self-referential reactions removed | 4 | — | D9's security rail row + arrow-back; D15's notification rail row + arrow-back |
| dead refs cleaned in hidden frames | 4 | D8 / D14 | D9 / D15 |

**51 reaction edits total** (matches the 51 pre-work scan hits exactly: 21 + 21 + 1 + 4 + 4). Every edit read back from a fresh node handle and confirmed. Each `Frame 5906` edit **preserved its `ON_HOVER → CHANGE_TO` reaction** — only the `ON_CLICK` destination changed. Aligning the rail *label* text is **not** this PR (PR 6, at component level).

### 1d. D15 / M15 — Notification Preferences hub extended 2 rows → 4

The hub already carried Push notifications + Email notifications, both already correctly wired. Two rows were added by **cloning the existing row pattern**:

| Row | D15 desktop node | D15 → | M15 mobile node | M15 → |
|---|---|---|---|---|
| Push notifications | `2926:9840` (existing) | D17 `2927:9954` (existing, unchanged) | `5696:8353` (existing) | M17 `5696:8364` (**added** — was unwired) |
| Email notifications | `2926:9950` (existing) | D18 `2927:10205` (existing, unchanged) | `5696:8359` (existing) | M18 `5696:8384` (**added** — was unwired) |
| **Filters** | `6314:15613` (**new**) | D16 `2926:9230` | `6314:15626` (**new**) | M16 `5696:8281` |
| **Muted accounts** | `6314:15618` (**new**) | D19 `2926:9482` | `6314:15633` (**new**) | M19 `5696:8307` |

- Desktop: cloned `Frame 5927` (the Push row). Each new row's frame set to `FIXED` width 548 + `primaryAxisAlignItems = SPACE_BETWEEN` / `itemSpacing = 0` so the chevron pins to the right edge regardless of label length — the **same layout trap PR 2 hit** on the rail (the source rows fake alignment with a hard-coded `itemSpacing: 375` tuned to "Push notifications"'s width; a shorter label would have pulled the chevron inward). The row's (clipped-and-effectively-hidden) description text node was set to `layoutPositioning: ABSOLUTE` at `(0, 21)` to keep it out of the `SPACE_BETWEEN` calc, matching the siblings' rendered result.
- Mobile: cloned `Divider` + `Row — Email notifications`, edited the label + sub-label, wired the reaction. Mobile rows show their sub-labels (desktop's are clipped — pre-existing, see §7).
- Chevrons: desktop rows carry `Frame 5927`'s own `Vector` chevron (stroke bound to `brand/navy` `VariableID:5096:4` — visible, **not** the invisible white-bound `Category Nav` chevron); mobile rows use the `›` text glyph, matching M15's existing rows.
- **New-row descriptions** were authored fresh, **not** copied from the source rows — the Push/Email source rows carry copy-pasted 2FA boilerplate ("Help protect your account from unauthorized access…"), which is pre-existing junk (flagged §7, not fixed here). New copy: Filters → *"Choose which lower-quality notifications to filter out."*, Muted accounts → *"Choose whose notifications you don't want to see."* (the latter is verbatim M16's own former mute-row sub-label).

### 1e. D16 / M16 — "Mute notifications ›" nav row removed

| Frame | Removed node | Its reaction (deleted with it) | Remaining content |
|---|---|---|---|
| D16 `2926:9230` (Settings — Filters) | `Frame 5927` `2926:9347` | `ON_CLICK → NAVIGATE → 2926:9482` | Quality filter control only (`Frame 5920` `2926:9344`) |
| M16 `5696:8281` (Settings — Filters — Mobile) | `Settings Group` `5696:8301` (sole child `Row — Mute notifications` `5696:8302`, no reaction) | — | Quality filter control only (`Settings Group` `5696:8293`) |

Muting is now reached only via the hub's "Muted accounts" row → D19/M19.

### 1f. Coupled copy corrections (disclosed, tightly scoped)

| Node | Old | New | Why |
|---|---|---|---|
| D9 subtitle `2926:8166` | "See information about your account" (flagged junk, and `visible: false`) | "Manage your account's security and keep track of your account's usage." | Explicitly requested — port D8's blurb into D9's intro. Node also set `visible: true` so the ported intro actually shows (matches M9, which already renders a real subtitle); bound to `color/text/secondary`, no new paint. |
| D16 heading `2926:9339` | "Filter" | "Filters" | Consistency with the decision-#6 frame rename + the hub row that navigates here |
| D16 subtitle `2926:9340` | "See information about your account" (flagged junk) | "Choose what you see in your notifications." | Matches M16's existing subtitle; kills a flagged-junk instance |
| M16 heading `5696:8291` | "Filter" | "Filters" | Same as D16 heading |

D9/M9 **on-screen heading kept as "Security"** (not rewritten to "Security & Account Settings") — it is a clean, standard section heading, not junk, and section-heading/rail-label alignment is PR 6's job. Flagged §7.

---

## 2. Paint audit — authored nodes, node-by-node

Only nodes **this PR created** are audited (the 4 new hub rows). Everything else is clones of existing bound elements or reaction-only edits.

| Node | Paints | Bound | Unbound | Off-palette | `green-tint-28` | New colours |
|---|---|---|---|---|---|---|
| Filters row — desktop `6314:15613` | 3 | 3 | 0 | 0 | 0 | 0 |
| Muted accounts row — desktop `6314:15618` | 3 | 3 | 0 | 0 | 0 | 0 |
| Filters row — mobile `6314:15626` | 3 | 3 | 0 | 0 | 0 | 0 |
| Muted accounts row — mobile `6314:15633` | 3 | 3 | 0 | 0 | 0 | 0 |
| **Total** | **12** | **12** | **0** ✅ | **0** ✅ | **0** ✅ | **0** ✅ |

Bindings inherited from the cloned source rows: label → `color/text/secondary` (`5096:9`, desktop) / `color/text/primary` (`5096:8`, mobile), sub-label → `color/text/secondary` (`5096:9`), chevron → `brand/navy` (`5096:4`, desktop `Vector`) / `color/text/secondary` (`5096:9`, mobile `›`). Light mode only. Text edits reused existing font styles (`Montserrat SemiBold` / `Montserrat Regular`) via the canonical load→await→mutate recipe.

**0 frame overlaps** across all page children (archive strip included). No clash with the parked Admin Shell zone (`x 37943–53343, y −16153→−14929`).

---

## 3. Screenshot verification

- **D15 desktop** (`2926:9721`) — 4 rows render: Push notifications · Email notifications · Filters · Muted accounts, all with the navy chevron pinned to the right edge, uniformly aligned. Rail still shows stale "Security And Account Access" / "Notifications" labels and the Community sidebar is still present — both out of scope (PR 5/6).
- **M15 mobile** (`5696:8340`) — 4 rows with sub-labels and `›` glyphs, dividers between; frame auto-grew to fit; no clipping/overlap.
- **D16 desktop** (`2926:9230`) — heading now "Filters", subtitle "Choose what you see in your notifications.", **only** the Quality filter toggle remains (mute row gone).
- **M16 mobile** (`5696:8281`) — heading "Filters", Quality filter toggle only.
- **D9 desktop** (`2926:8056`) — heading "Security" + the ported blurb subtitle now visible + the 2FA content, no collision.
- **M9 mobile** (`5695:8279`) — unchanged content ("Security" + "Manage your account security and how you log in." + 2FA), frame renamed only.

---

## 4. What this PR did NOT touch (per brief)

- Community-style left sidebar on desktop frames — **left** (PR 5).
- Inline 5-row hub list on `5607:7813` / `6185:14547` — **left** (PR 5).
- Nav-rail **label** text on any frame or on `Frame 5904` (`2906:7170`) — **left** (PR 6). Only rail *targets* were re-pointed.
- Shell componentization, layout re-balancing / left-gutter reclaim — **left** (PR 6).
- The 4 Display leaves and the Display-merge question — **left** (unresolved).
- App / backend code — **untouched**.

---

## 5. Flagged, not fixed

1. **D15/M15 hub heading still reads "Preferences"**, not "Notification Preferences". Decision #3 kept the *frame* name; the on-screen heading is a separate copy call, deferred (same class as the D9 heading below). PR 6 or a text-hygiene pass.
2. **D9/M9 on-screen heading is "Security"**, while the frame is now "Security & Account Settings" and PR 1's mobile hub row that navigates here is labelled "Security & Account Settings". Left as-is (a clean heading, not junk); heading↔rail-label alignment is PR 6.
3. **Desktop hub rows' description text is clipped/invisible** (the `Frame 5927` pattern is 22px tall and clips a 51px description). Pre-existing; the Push/Email source rows carry 2FA-boilerplate junk in those (hidden) description nodes. Mobile rows show descriptions fine. A text-hygiene / PR 6 pass should either surface + fix the desktop descriptions or drop the nodes.
4. **D9's security rail row and D9's + D15's `arrow-back` now carry no reaction** (their targets were the archived twins; re-pointing to self is invalid, so the reactions were removed). D9 is a section page and D15 is a section hub — the persistent rail is the real nav on desktop — but a visible back-arrow with no action is a minor UX gap. A later pass could point these two arrow-backs at the desktop Settings landing (`6295:15068`, PR 2) instead.
5. **4 dead references remain only inside `ARCHIVED — Settings — Privacy & Safety`** were cleaned in this pass (re-pointed to D9/D15) — noting it so a future scan doesn't flag them as new.
6. **Neither Settings section banner covers the new archive strip** — the strip sits at `y −13500`, well outside `2930:10458` (desktop) / `5698:8239` (mobile). Consistent with the same pre-existing banner-coverage gap PRs 1–3 flagged; archived content doesn't need banner coverage.
7. **Rail label mismatch across ~24 frames** — every live Settings frame's rail now correctly *targets* D9/D15, but still *labels* the rows "Security and account access" / "Notifications" (and D15's landing, PR 2, uses instance-override labels). PR 6 should fix labels at the `Frame 5904` component level and strip the PR-2/PR-3 instance overrides.

---

## 6. Draft Decision Log entry — #247

> **#247 — Settings duplicate clusters consolidated: Security & Notifications survivors chosen and renamed, 2 competing/redundant frames archived per platform, the Notification Preferences hub extended to 4 rows, and the Filters/Muted-accounts leaves split.**
> `sprint-2/settings-duplicate-clusters-consolidation`, 2026-09-07. Executes **founder decisions #1, #2, #3, #5, #6** of the Settings-family consolidation set (Decision Log #230). **PR 4 of 6**; Phase A (#7/#8/#10) is merged.
> **Renamed (6):** `Settings — Security Overview` (`2926:8056`) → **`Settings — Security & Account Settings`** (+ `— Mobile` `5695:8279`); `Settings — Mute New Accounts` (`2926:9482`) → **`Settings — Muted accounts`** (+ `— Mobile` `5696:8307`); `Settings — Notifications (Mute & Filter)` (`2926:9230`) → **`Settings — Filters`** (+ `— Mobile` `5696:8281`). `Settings — Notification Preferences` (`2926:9721` / `5696:8340`) confirmed **kept** (decision #3).
> **Archived (4), reference-checked → re-pointed → hidden → `ARCHIVED —` prefixed → moved to a new Settings archive strip at `y −13500`, 0 overlaps, not deleted:** `Settings — Security & Account` (D8 `2922:5143`) + `— Mobile` (M8 `5649:8074`) — the redundant one-row intermediate; `Settings — Notification Preferences (By Type)` (D14 `2922:5602`) + `— Mobile` (M14 `5649:8116`) — the losing competing hub. **D8's one-line blurb was ported into D9's intro** (`2926:8166`, previously the flagged "See information about your account" junk *and* `visible: false` — now carries "Manage your account's security and keep track of your account's usage." and is visible, matching M9).
> **Rail target re-point was per-frame, not component-set level** — confirmed the `Frame 5904` set (`2906:7170`) variants carry only `ON_HOVER → CHANGE_TO` reactions; every `ON_CLICK → NAVIGATE` is an instance override. **51 reaction edits** (exactly matching a full page scan's 51 hits, all read back from fresh handles): 21 × rail "security" rows D8 → D9; 21 × rail "notification" rows D14 → D15; D16's `arrow-back` → D15 (its hub); D9's + D15's now-self-referential security/notification rail rows and `arrow-back` reactions **removed**; 4 dead refs inside already-hidden frames cleaned. `ON_HOVER` reactions preserved throughout. **Final scan: 0 nodes reference any archived frame.**
> **Notification Preferences hub extended 2 → 4 rows** (decision #1), desktop + mobile, by cloning the existing row pattern: **Push notifications** (→ D17, existing) · **Email notifications** (→ D18, existing) · **Filters** (new, → D16) · **Muted accounts** (new, → D19). Mobile's Push/Email rows were also **unwired** and got their `NAVIGATE` reactions added (→ M17/M18). New rows use the navy-bound chevron and were pinned right with `SPACE_BETWEEN` (the same rail layout trap PR 2 hit — source rows fake alignment with a hard-coded `itemSpacing`). New-row descriptions authored fresh (the source Push/Email rows carry pre-existing 2FA-boilerplate junk, flagged not fixed).
> **"Mute notifications ›" nav row removed from D16 + M16** (decision #6) — the row and its reaction deleted; only the quality-filter control remains. D16/M16 on-screen heading aligned "Filter" → "Filters" and D16's junk subtitle replaced to match M16.
> **Audit:** 4 authored nodes, **12 paints, 12 bound, 0 unbound / 0 off-palette / 0 `brand/green-tint-28` / 0 new colours**, **0 overlaps**, no Admin-zone clash. Screenshot-verified D15/M15 (4-row hub), D16/M16 (post-removal), D9 (ported blurb), and a sample of re-pointed rails.
> **Flagged, not fixed:** D15/M15 heading still "Preferences" and D9/M9 heading still "Security" (heading↔rail-label alignment is PR 6); desktop hub rows' descriptions are clipped/invisible (pre-existing); D9's + D15's `arrow-back` now carry no reaction (self-nav invalid — could point at the PR 2 landing later); ~24 frames' rail *labels* still stale (PR 6, component-level).
> Full detail: `docs/sprint-2-settings-duplicate-clusters-consolidation-report.md`. **Decision Log #230 stays Open** — after this PR only decision **#4** (remove the Community sidebar) and the structural **#11** (componentize the shell) remain, i.e. PRs 5 and 6.

---

## 7. Draft CLAUDE.md status bullet

> - **`sprint-2/settings-duplicate-clusters-consolidation` (figma-design-system,
>   2026-09-07) is PR 4 of 6 in the Settings-family consolidation (Decision Log
>   #230) and executes founder decisions #1/#2/#3/#5/#6 — the duplicate-cluster
>   resolution. Figma design only, no app/backend code.** Report:
>   `docs/sprint-2-settings-duplicate-clusters-consolidation-report.md`. Decision
>   Log **#247** added; forward-pointer on **#230**, which **stays Open** — after
>   this PR only decision **#4** (Community sidebar removal) and structural **#11**
>   (shell componentization) remain, i.e. PRs 5 and 6.
>   - **Renamed 6 frames:** `Settings — Security Overview` (`2926:8056`) →
>     **`Settings — Security & Account Settings`**; `Settings — Mute New Accounts`
>     (`2926:9482`) → **`Settings — Muted accounts`**; `Settings — Notifications
>     (Mute & Filter)` (`2926:9230`) → **`Settings — Filters`** (each + its
>     `— Mobile` pair). `Settings — Notification Preferences` (D15/M15) confirmed
>     **kept** (decision #3).
>   - **Archived 4 frames** (reference-checked → re-pointed → hidden →
>     `ARCHIVED —` prefixed → moved to a new Settings archive strip at
>     `y −13500`, **0 overlaps**, not deleted): the redundant Security one-row
>     intermediate D8/M8 (`2922:5143` / `5649:8074`) and the losing Notifications
>     competing hub D14/M14 (`2922:5602` / `5649:8116`). D8's blurb was ported
>     into D9's intro (`2926:8166` — previously the flagged "See information about
>     your account" junk *and* hidden; now carries D8's copy and is visible).
>     **M8/M14 had zero inbound references** — the PR 1 mobile menu hub already
>     targeted the survivors directly.
>   - **Rail target re-point was per-frame, NOT component-set level** — confirmed
>     the `Frame 5904` set (`2906:7170`) variants carry only `ON_HOVER → CHANGE_TO`;
>     every `ON_CLICK → NAVIGATE` is an instance override. **51 reaction edits**,
>     exactly matching a full page scan's 51 hits, all read back from fresh
>     handles: 21 × rail "security" rows → D9, 21 × rail "notification" rows → D15,
>     D16's `arrow-back` → D15, D9's/D15's now-self-referential rail rows +
>     `arrow-back` reactions removed, 4 dead refs inside already-hidden frames
>     cleaned. `ON_HOVER` reactions preserved. **Final scan: 0 nodes reference any
>     archived frame.**
>   - **Notification Preferences hub extended 2 → 4 rows** (decision #1), desktop
>     + mobile: Push (→ D17, existing) · Email (→ D18, existing) · **Filters**
>     (new → D16) · **Muted accounts** (new → D19). Mobile's Push/Email rows were
>     also **unwired** and got their reactions added. New rows cloned from the
>     existing pattern, pinned right with `SPACE_BETWEEN` (the same rail layout
>     trap PR 2 hit — source rows fake alignment with a hard-coded `itemSpacing`),
>     navy-bound chevron, fresh accurate descriptions (the source Push/Email rows
>     carry pre-existing 2FA-boilerplate junk in their clipped/hidden description
>     nodes — flagged, not fixed).
>   - **"Mute notifications ›" nav row removed from D16 + M16** (decision #6) —
>     row + reaction deleted, quality-filter control only remains; D16/M16
>     heading aligned "Filter" → "Filters", D16 junk subtitle replaced to match
>     M16.
>   - **Audit:** 4 authored nodes, **12 paints / 12 bound / 0 unbound / 0
>     off-palette / 0 `brand/green-tint-28` / 0 new colours**, **0 overlaps**.
>     Screenshot-verified D15/M15, D16/M16, D9, and re-pointed rails.
>   - **Flagged, not fixed:** D15/M15 heading still "Preferences" and D9/M9
>     heading still "Security" (heading↔rail-label alignment is PR 6); desktop hub
>     rows' descriptions clipped/invisible (pre-existing); D9's + D15's
>     `arrow-back` now carry no reaction (self-nav invalid — could point at the
>     PR 2 landing later); ~24 frames' rail *labels* still stale (PR 6,
>     component-level, strip the PR-2/PR-3 instance overrides at the same time).
>   - Figma writes by the agent (no shell that session); branch, commit, docx
>     Decision Log transcription (#247) and PR finalised in a follow-up session
>     with shell access — same pattern as PRs #98 / #102 / #110 / #130 / #151 /
>     #205 and PRs 1–3 of this set.

---

## 8. No shell in this session

No Bash/shell tool was available. To be finalised in a follow-up session — same pattern as PRs 1–3 of this set:

- create branch `sprint-2/settings-duplicate-clusters-consolidation` off `main` (finaliser stacks it on the Phase A branches)
- commit this report
- transcribe the §6 entry into the Build Plan's live docx (Section 9) as **#247**, and append a forward-pointer to **#230**'s Status cell (**#230 stays Open** — decisions #4 and #11 remain, PRs 5 and 6)
- open the PR

---

## 9. Frames / nodes touched

**Renamed:** `2926:8056`, `5695:8279`, `2926:9482`, `5696:8307`, `2926:9230`, `5696:8281`.
**Archived (renamed + hidden + moved):** `2922:5143`, `5649:8074`, `2922:5602`, `5649:8116`.
**Created:** `6314:15613`, `6314:15618` (D15 rows), `6314:15625`, `6314:15626`, `6314:15632`, `6314:15633` (M15 dividers + rows).
**Deleted:** `2926:9347` (D16 mute row), `5696:8301` (M16 mute group).
**Text edited:** `2926:8166` (D9 subtitle, + made visible), `2926:9339` / `2926:9340` (D16 heading/subtitle), `5696:8291` (M16 heading).
**Reactions edited (51 = 47 remaps + 4 removals):**
- 47 remaps: 21 × rail "security" rows → D9; 21 × rail "notification" rows → D15; 1 × D16 `arrow-back` → D15; 4 × dead refs inside already-hidden frames (`2922:5483` / `2922:5485` in ARCHIVED P&S, `2922:5246` in D8, `2922:5703` in D14) → D9 / D15.
- 4 removals: D9's own security rail row (`2926:8157`) and `arrow-back` (`2926:8162`); D15's own notification rail row (`2926:9824`) and `arrow-back` (`2926:9827`) — all self-referential to an archived twin.
