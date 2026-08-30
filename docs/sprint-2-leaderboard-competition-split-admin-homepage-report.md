# Sprint 2 — Leaderboard top-3 medals, Contest weekly-fill, Contest/Competition tab split, Admin competition creation, homepage hero, club-representation selector

**Branch:** `sprint-2/leaderboard-competition-split-admin-homepage`
**Agent:** figma-design-system (consolidated fix-and-build pass)
**Date:** 2026-08-30
**Figma file:** `weZWWqggy9j13eX8bhFgs6` ("Soccernity-MVP"), page "Soccernity" (`0:1`)

A single consolidated pass covering six founder decisions. Light-mode Soccernity Theme
variables (collection `5096:2`) throughout; no hardcoded hex in authored content;
`brand/green-tint-28` deliberately not used anywhere (Decision Log #47). No
application/backend code touched — backend remains paused. Founder-blocked items
listed explicitly.

**Routing note.** Items 1, 2 and 5 are retouches of already-merged Figma work
(`figma-design-system`'s remit). Items 3, 4 and 6 create brand-new screens
(normally `figma-screen-builder`). The brief dispatched all six to
`figma-design-system` as one consolidated pass — the same one-time combined-scope
model PR #102 (Admin Panel shell unification) used. Flagged here rather than
silently followed; the normal split resumes after this PR.

---

## ITEM 1 — Leaderboard top-3 badges (founder override of the no-iconography rule)

`Leaderboard Rank Medal` component set **`5551:7420`** — 3 variants
(`rank=1` `5551:7414`, `rank=2` `5551:7416`, `rank=3` `5551:7418`).
Palette-only, no gold/silver/bronze (non-negotiable #3):

| Rank | Disc | Numeral |
|---|---|---|
| 1 | solid `brand/green` | `color/text/on-green` (navy) |
| 2 | solid `brand/navy` | `color/text/on-navy` (white) |
| 3 | `brand/green-tint` fill + 1.5px `brand/navy` outline | `brand/navy` |

The numeral stays **inside** the disc, so the rank number is not removed — it is
restyled. The **points value and the points-based ordering are untouched** — the
medal is layered on, additive.

**Placed on every built board where a final 1/2/3 exists:**

| Frame | Rows |
|---|---|
| Leaderboard Page Desktop `5171:6633` | 1 · 2 · 3 |
| Leaderboard — Mobile `5540:7264` | 1 · 2 · 3 |
| Contest Tab · Crowned — Monthly Winners `5524:7836` | 1 · 2 · 3 |
| Contest Tab · Crowned — Mobile `5541:7750` | 1 · 2 · 3 |
| Competition Tab · Prediction `5564:7561`, Commentary `5564:7832` + mobiles | 1 · 2 · 3 |

The base Leaderboard frame *is* the per-club / per-time-period view (same frame,
different filter pills), so a single placement covers all three.

**Deliberately NOT badged** — positions are still live / not a settled 1/2/3:
Contest Level-1 Final (`5524:7512` / `5541:7527`), the weekly-fill states (Item 2),
the filtered empty states, and State Study A (viewer at rank 1,284).

The base frame's `DECIDED — No badge, tier, trophy or reward iconography` design
note (`5177:6676` / `5177:6677`) is rewritten in place to record the override and
its scope. → **Decision Log #69** (with a forward-pointer added to #68).

---

## ITEM 2 — Contest tab weekly-fill progression (corrects PR #108)

PR #107/#108 shipped the Contest "pending" phase as **one static state** for the
whole weeks-1–3 period. That is replaced by a **progressive sequence** — desktop
and mobile for each:

| State | Desktop | Mobile | Shows |
|---|---|---|---|
| Vacant (Week 1 · Phase 1) | `5524:7188` (repurposed in place) | `5541:7304` (repurposed) | empty-state card, "Week 1 · in play" chip only, "View this week's contest ›" CTA — no winner list yet |
| Week 1 winners in | `5556:7426` | `5561:7483` | 3-row weekly-winners table |
| Weeks 1–2 winners in | `5556:7529` | `5561:7608` | 6 rows |
| Weeks 1–3 winners in | `5556:7632` | `5561:7733` | 9 rows — **count is dynamic**, copy never hard-codes "9" ("varies month to month with ties and forfeits") |

The old "pending" frames were **converted in place** — there is no orphaned
duplicate. The four desktop states sit in a labelled strip at `y ≈ 25400`
(`5570:7951`), the four mobiles at `y ≈ 27700`.

**Winners-table design.** Columns `WEEKLY ROUND / WINNER / CLUB / WEEKLY POINTS`
(desktop) or a card row (mobile). Each row's week-place ("Week 1 · 1st") is plain
text in the WEEKLY ROUND column — **no medal**, because weekly winners are equal,
not ranked 1/2/3 against each other. That ranking only happens in the Week 4
Level 1 final. Once Week 4 begins the tab switches to the existing Live state,
unchanged; the transition from "Weeks 1–3 in" → Live reads cleanly (both list the
same nine finalists; Live adds the ranking and the persistent LIVE banner).

The crowned/final state (`5524:7836` / `5541:7750`) is unchanged apart from
receiving Item 1's medals.

→ **Decision Log #70**. Contest Design-Notes frame `5534:7264` rewritten to
document the progression.

---

## ITEM 3 — Contest and Competition split into two independent board tabs

**Judgment call, flagged.** The existing Leaderboard uses a combinable 4-control
*filter bar*, not literal tabs, and "Contest" was one value inside the COMPETITION
dropdown. The brief asks for "Global / Per-Club / Contest / Competition /
Per-Time-Period — all combinable". That five-name list is read as the **union of
dimensions**, not five literal tabs:

- **Global / Per-Club** = the existing SCOPE segmented control (unchanged, combinable).
- **Per-Time-Period** = the existing TIME PERIOD control (unchanged, combinable).
- **Contest / Competition** (+ an implicit **Overall**) = a **new board-tab row**.

**`Leaderboard — Board Tabs` component set `5563:7573`** — underline-tab style
(distinct from the segmented pill filters), 3 variants: `active=Overall`
(`5563:7543`), `active=Contest` (`5563:7553`), `active=Competition` (`5563:7563`).
Inserted directly under the page title, above the filter bar.

**Applied to every built Leaderboard frame:**

| Board | Frames | Filter-bar change |
|---|---|---|
| Overall | base desktop `5171:6633`, base mobile `5540:7264`, empty states `5542:7344` / `5542:7695` | COMPETITION dropdown **removed** (its job is now the tab); controls renumbered 1·SCOPE / 2·CLUB / 3·TIME PERIOD; "All competitions" summary pill removed; subtitle updated |
| Contest | `5524:7188` / `5556:7426` / `5556:7529` / `5556:7632` / `5524:7512` / `5524:7836` + 6 mobiles | COMPETITION dropdown **removed** — the Contest mechanic is fixed, no selector; redundant "Contest" pill hidden |
| Competition | new frames (below) | COMPETITION dropdown **kept**, relabelled **`COMPETITION TYPE`** |

### New Competition-tab frames

| Frame | Node |
|---|---|
| Competition Tab · Prediction (desktop) | `5564:7561` |
| Competition Tab · Commentary (desktop) | `5564:7832` |
| Competition Tab · Prediction — Mobile | `5565:7623` |
| Competition Tab · Commentary — Mobile | `5565:7864` |

All at `y ≈ 31000` in a labelled strip (`5570:7952`).

**Generic results view.** The shell table is `RANK / PLAYER / CLUB / <metric> /
SCORE`. The middle **metric column is competition-supplied** — `ACCURACY` (Prediction,
objective) vs `VOTES` (Commentary, community-voted) — and is **not** hardcoded into
the shell. Both example states use placeholder personas already in the file
(Emeka John, Chukwu James, …) and the same grassroots club names as the
Leaderboard/homepage fixtures. Medals on ranks 1–3 (Item 1). A `COMPETITION TYPE`
dropdown (Prediction / Commentary / …) drives the view. → **Decision Log #72**.

**State Study B** (`5176:6652`) on the base frame — previously documenting the old
"Competition is the umbrella, Contest is a type" model — is rewritten as the
**COMPETITION TYPE selector** for the Competition board, with an explicit note that
Contest is *not* in this list because it is its own tab with a fixed mechanic.

→ **Decision Log #71** (with a forward-pointer added to #61).

---

## ITEM 4 — Admin Panel: Create Competition

New admin screens, following the unified Admin shell (PR #102):

| Frame | Node |
|---|---|
| Admin — Create Competition | `5566:8033` |
| Admin — Competition Created (Success) | `5569:7813` |

Both at `y ≈ -23600` in the Admin band.

**New sidebar nav item "Competitions"** (a 3-bar podium glyph, distinct from
Contest's chat-bubble icon), inserted after "Contest", set active. This screen's
shell is the only one carrying it — **propagating "Competitions" to the other 15
Admin shells is a flagged follow-up**, the same way "Categories" was originally
added to one screen then rolled out (Decision Log #49).

**Form fields:** Competition name · Competition type (dropdown; feeds the
Leaderboard's COMPETITION TYPE selector) · **Scoring mechanism** (segmented:
Accuracy-scored / Community-voted / Custom) · Custom scoring method · Entry brief ·
Entry window (Opens / Closes) · Entries allowed per player · **Leaderboard
visibility** (public toggle) · "Create competition".

The visibility toggle deliberately surfaces the still-open question of whether
competition boards are public to logged-out visitors (its helper text says so).
→ **Decision Log #73**.

---

## ITEM 5 — Homepage: remove "Your season record" card

On the canonical homepage `5204:6728` (Decision Log #46) the hero card cluster's
`Card — Your Season Record` (`5206:6823`, appearances / goals / assists) is
**removed entirely**. The hero (`5205:6804`) already centres its card cluster
against the copy column, so the single remaining `Card — Live Fixture`
(`5206:6805`) now sits vertically centred and reads as an intentional
single-card cluster — no empty gap.

Mobile homepage `5543:7407` (PR #108): the season-record card exists there as its
own node (`5543:7445`) and is **also removed**; the mobile hero is a vertical
stack, so the cluster collapses cleanly with no re-layout needed.

This also resolves the standing flag that the season-record card "implies a
per-player stats model absent from Section 3" — for the homepage. → **Decision
Log #75** (light forward-pointer on #46).

---

## ITEM 6 — "Which club do I represent" selector (new standalone screen)

| Frame | Node |
|---|---|
| Which Club Do I Represent — Selector (desktop) | `5570:7813` |
| Which Club Do I Represent — Selector — Mobile | `5570:7887` |

**Placement (flagged):** next to the Club Picker family (`x ≈ 70000`,
`y = -9371`) — it re-uses the Club Picker shell and card language, and it is
club-membership work. Its natural navigational entry point is **Settings** (the
subtitle says "change this any time from Settings"); a Settings row to reach it is
not built here.

A user who has joined **multiple** club pages picks **exactly one** as their
represented club (radio select, first pre-selected). A green-tint banner states
plainly what the choice controls: *"Only one represented club counts for points.
Joining or leaving other club pages doesn't change this — only this choice does."*
CTA: "Save represented club". Club names are the file's grassroots convention
(Ikoyi Rovers FC, Surulere United, Port Harcourt Blues).

→ **Decision Log #74**. **Backend requirement (parked):** persisting the
represented club needs a real field / endpoint — it is distinct from `ClubPage`
membership and arguably *is* what `User.clubAffiliationId` was always for (no
endpoint writes it today). This is the concrete artifact the open Leaderboard
"which club does the club axis mean?" question now depends on.

---

## Cleanup

- Deleted orphan frame `5542:7694` — an empty 100×100 "Empty State" frame at
  `(0,0)`, a stray `createFrame()` default left by an earlier PR.

---

## Decision Log (added to Build Plan Section 9 this PR)

| # | Entry |
|---|---|
| 69 | Leaderboard top-3 medals — founder override of the no-iconography rule; palette-only; additive to points; settled boards only. Forward-pointer added to #68. |
| 70 | Contest tab weekly-fill progression (Vacant → 3 → 6 → 9-dynamic), replacing the single static pending state; weekly-fill rows carry no medal. |
| 71 | Contest and Competition split into two board tabs via a new board-tab row; COMPETITION dropdown removed from Overall/Contest, kept as COMPETITION TYPE on Competition. Forward-pointer added to #61. |
| 72 | Competition results view is one generic RANK/PLAYER/CLUB/<metric>/SCORE shell; metric column is competition-supplied. |
| 73 | Admin "Create Competition" screen + new "Competitions" sidebar item; 15-shell propagation flagged as follow-up. |
| 74 | "Which club do I represent" selector — one represented club for points; backend field/endpoint required. |
| 75 | "Your season record" card removed from the canonical homepage hero (desktop + mobile). Light forward-pointer on #46. |

`#45` remains an un-transcribed gap in the table (real-names-on-leaderboard) —
untouched here, still needs its own transcription.

---

## Founder-blocked / still open (not guessed)

1. **Points model** — no `User` points field, no Section 4 endpoint. Every board
   here (Overall, Contest, Competition) ranks by placeholder integers. `figma-to-code`
   must not build the Leaderboard until a scoring model is specced.
2. **Club axis** — which "club" mechanism the By-club filter and the new
   represented-club selector mean. Item 6 gives this a concrete UI; the data model
   is still undecided.
3. **Public visibility** of the Leaderboard / competition boards to logged-out
   visitors (safeguarding-adjacent). Item 4's visibility toggle exposes the
   question; it does not answer it.
4. **Entire Contest + Competition data model** — no schema, no endpoints. Weekly
   rounds, Level-1 field, prediction accuracy, commentary votes, competition
   entities — all unbacked.
5. Propagating the "Competitions" Admin nav item to the other 15 Admin shells.

---

## Verification

- Every new/edited frame: Soccernity Theme Light variables, no hardcoded hex in
  authored content, no `brand/green-tint-28`.
- **0 frame overlaps** among all new/moved frames and against every existing
  page element (checked programmatically).
- Old Contest "pending" frames converted in place — **no orphaned duplicate**;
  stray `5542:7694` deleted.
- Screenshots captured for: base Leaderboard desktop + mobile, all 4 weekly-fill
  states (desktop) + 4 (mobile), Contest Live + Crowned, Competition Prediction +
  Commentary (desktop + mobile), Empty state, Admin Create Competition + success,
  Which-club desktop + mobile, homepage hero before/after, the Rank Medal and
  Board Tabs component sets.
- **No real browser / Playwright check** — not available in this environment, the
  same ceiling as every prior Figma PR in this project.
- **No application code, DTOs, endpoints or backend touched.**
