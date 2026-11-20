# Sprint 2 — Mobile build + audit: Guardian Consent (mobile gaps), Leaderboard, Homepage, Contest

**Branch:** `sprint-2/mobile-leaderboard-homepage-contest-audit`
**Agent:** figma-design-system
**Date:** 2026-08-28
**Figma file:** `weZWWqggy9j13eX8bhFgs6` ("Soccernity-MVP"), page "Soccernity" (`0:1`)

Six-item combined audit-and-build pass. Light-mode Soccernity Theme variables
(collection `5096:2`), no hardcoded hex in authored content. No application/backend
code touched — backend remains paused. Founder-blocked items listed explicitly.

---

## ITEM 1 — Guardian Consent mobile screens 1, 1a, 2 — BUILT

| Screen | Frame |
|---|---|
| 1 Age Gate — Mobile | `5539:7264` |
| 1a Age Gate — Below Minimum Age — Mobile | `5539:7314` |
| 2 Guardian Details Capture — Mobile | `5539:7354` |

Desktop screens 1/1a/2 are split-screen (Right safeguarding panel + Left form).
The mobile versions drop the right panel (as Register mobile does), keep the
left-panel content left-aligned, re-stack the desktop form auto-layout at 342px,
and use the **Guardian-Consent-family 64px logo top bar** — the same shell as
screens 4/5/6/12, not the `header 7 — mobile` auth navbar. **Decision Log #67**
(this closes PR #107's open "auth-mobile pattern" follow-up toward the GC-family
pattern). GC2's single "Guardian's full name" field (from PR #107) carries over.

The whole Guardian Consent mobile set is now complete (1, 1a, 2, 4, 5, 6, 7, 8,
9, 10, 11, 12).

---

## ITEMS 2 & 3 — Leaderboard: mobile build + full 4-step audit

### Step 1 — follow-up screens

| Finding | Resolution |
|---|---|
| No **empty state** — a filter combination (new club, just-started competition, narrow weekly window) with zero ranked players had no screen. | **BUILT** — `Leaderboard — Empty State (Filtered)` desktop `5542:7344` + mobile `5542:7695`. One centred card, "No ranked players here yet", Reset filters. **Decision Log #66.** |
| No concrete artifact for **SCOPE = By club** (base frame is Global). | **BUILT into the empty state** — SCOPE segmented shows "By club" active, CLUB dropdown shows the selected club, summary pill resolves to the club name. A populated By-club board is the identical table filtered. |
| "Load more" loading state, "you're not ranked yet" pinned bar. | Minor — the pinned-rank variant is already documented in State Study A on the desktop frame; a loading spinner variant is deferred (low value, no backend). |

### Step 2 — missing mobile

**All built:**

| Screen | Frame |
|---|---|
| Leaderboard (base) — Mobile | `5540:7264` |
| Contest Tab · 1 Pending — Mobile | `5541:7304` |
| Contest Tab · 2 Live — Level 1 Final — Mobile | `5541:7527` |
| Contest Tab · 3 Crowned — Monthly Winners — Mobile | `5541:7750` |
| Empty State — Mobile | `5542:7695` |

The desktop 5-column table (RANK / PLAYER / CLUB / 7-DAY CHANGE / POINTS) becomes
a **card-style row list** at 390px — rank + avatar + "name / @handle · Club" stack
on the left, right-aligned POINTS + delta stack on the right; column header
collapses to "# / PLAYER / PTS"; your-rank inline highlight preserved. Filter bar
stacks vertically (4 full-width controls, segmented controls split 50/50); active
filter summary wraps. Header → `header 4 — mobile` (`5386:6576`, logged-in).
Footer social/legal links wrap and centre. **Decision Log #65.**

The 3 Contest-tab mobile states carry the same content decisions as their
desktop counterparts (PR #107 / Decision Log #61): ranked list + LIVE banner for
the live state; "1st · winner" text pill (no trophy iconography) for crowned;
"Wk 1/2/3" as the small line under points; "View this contest ›" connector on the
table footer of the live and crowned states, and a primary CTA on the pending
state.

### Step 3 — field-accuracy + the tab/filter matrix

Built the **`Leaderboard — Filter Matrix (worked combinations)`** annotation
frame, cross-referencing every axis of the locked spec against a real artifact:

| Combination | Real artifact |
|---|---|
| SCOPE Global · COMPETITION All · TIME All-time | Base frame `5171:6633` / mobile `5540:7264` |
| SCOPE Global · TIME Weekly | Same base frame — segmented TIME toggles Weekly; 7-DAY CHANGE column is always present. (Weekly reset timing/timezone still open.) |
| SCOPE By club · CLUB selected | Empty State frame `5542:7344` / `5542:7695` (By-club control active, club selected) |
| COMPETITION Contest (3 monthly phases) | `5524:7188` / `5524:7512` / `5524:7836` (desktop) + `5541:7304` / `5541:7527` / `5541:7750` (mobile); TIME relabels This month / Past months |
| COMPETITION Prediction & Commentary | Disabled in the selector (State Study B `5176:6652`) — **founder-blocked**, no source screen |
| Any combination · 0 ranked players | Empty State frame |
| Which "club" does the club axis mean? | **UNRESOLVED / founder-blocked** — `ClubPage` membership vs `User.clubAffiliationId` vs unbuilt grassroots teams. The By-club UI is built; the data source is not decided. |

**Confirmed, not assumed:** the matrix is satisfied by one frame + the 4-control
filter bar + summary row + the empty state + the Contest-tab states. No
per-combination full frame is needed (the design's stated principle: any state is
a different set of pills + a re-queried table). The one genuine spec gap was the
missing empty state and the missing concrete By-club artifact — both now built.

**Points model** (no `User` points field, no Section 4 endpoint) is unchanged and
**founder-blocked** — figma-to-code must not build the Leaderboard or its Contest
tab until a scoring model is specced.

---

## ITEM 4 — Homepage mobile — BUILT

`Home Page — Premium Light — Mobile` (`5543:7407`), cloned from the canonical
`5204:6728` (Decision Log #46). ~6750px tall. Reflow:

- Header → `header 7 — mobile` (`5386:6575`, logged-out — matches the canonical
  page's `header 7`)
- Every section: horizontal padding 100 → 20, vertical padding reduced
- Hero: HORIZONTAL → VERTICAL (copy column then card cluster); headline 34px,
  CTAs full-width stacked; decorative accent circles set to absolute + hidden
- Today's Fixtures: 4-across card row → vertical stack
- Why Soccernity: 3-across pillar row → vertical stack; centred header set to
  full-width
- Talents: 3-across → vertical stack
- Trending: editorial split (760 + 452 side-by-side) → vertical (featured story
  then story list)
- Closing CTA: texts full-width, CTAs full-width stacked
- Footer: social + legal links wrap and centre
- Annotation zone removed

Token bindings inherited unchanged from the canonical page (no fills touched —
only layout, sizing, font-size, and hard-newline removal on display headings).
0 placeholder shimmers, 0 overlaps.

**Field accuracy (unchanged, founder-blocked):** Today's Fixtures and Trending
have no data source (Decision Log #6); the "Season Record" card implies a
per-player stats model absent from Section 3. All placeholder — figma-to-code
must not wire them.

---

## ITEM 5 — Contest: full 4-step audit

### Step 1 — follow-up screens

| Finding | Resolution |
|---|---|
| Contest details page (`2155:1062`) "How Contest works" + "Task for this week" were lorem ipsum. | **FIXED** — real copy describing the monthly mechanic (weeks 1–3 weekly challenges → nine weekly winners → Week 4 Level 1 final → overall top 3 tracked on the Leaderboard Contest tab; "enter once per week"). Text-only edit on a legacy frame — no token change. |
| No **phase indicator** ("Week N of 4" / "Level 1 Final week") on the 3 user-facing Contest frames. | **Flagged — Contest section's own coordinated pass.** The 3 legacy frames (`2072:5584`, `2155:1062`, `2094:994`) are old-style and pre-date the mechanic; adding a phase state belongs with modernising them, not this pass. |
| No **"you've already voted"** state, no **"contest not open / between weeks"** state. | **Flagged — founder-blocked** (no backend; Contest is Sprint 4+). Design states are buildable but belong with the coordinated pass once a Contest data model exists. |
| Contest entry **submission**. | Covered elsewhere — `Create a post — For Contest` (`2009:2913`) in the Community section is the entry flow. |
| Contest results screen + connectors. | Built in PR #107 (`5528:7260` + connectors). |

### Step 2 — missing mobile

| Screen | Resolution |
|---|---|
| Contest — Weekly Results (Top 3) | **BUILT** — `5545:7394` (mobile). Header → `header 4 — mobile`; 3-across winner cards → vertical stack; "View leaderboard ›" connector preserved. |
| `2072:5584`, `2155:1062`, `2094:994` mobile | **Flagged — Contest section's coordinated pass.** These are 100% unbound legacy frames; mobilising them without first modernising them would bake in tech debt. |

### Step 3 — field accuracy

The entire Contest feature is **design-ahead-of-backend** — no Section 4
endpoints, no `schema.prisma` models (entries, votes, weekly rounds, Level-1
field). "Vote once per contest", vote counts, entry lists — **all unbacked,
founder-blocked for wiring.** figma-to-code must not build any Contest surface
until a Contest data model + monthly handoff mechanic is specced.

---

## ITEM 6 — Green-tint light-token retrofit at `2072:5584` — DONE

Targeted single-frame retrofit (NOT the file-wide `brand/green-tint-28` cleanup —
that variable and every other frame using it were untouched; the shared `Header`
instance in this frame was skipped, 82 nodes).

- **8 unbound `#d9d9d9` fills** → `brand/green-tint` (12%, `5096:5`): the 6
  "Contest Leaderboard" zebra-row rectangles, 2 carousel nav-button ellipses,
  plus the image-placeholder fills behind the 6 entry-card thumbnails/avatars
  (invisible under the IMAGE fills, bound for completeness).
- **3 off-palette trophy vectors** (`#e9c400` / `#bcb5b5` / `#cd7f32`) →
  `brand/navy` — non-negotiable #3 (two-colour palette); the main Leaderboard
  already dropped trophy iconography. Left as navy silhouettes rather than
  deleted. **Decision Log #68.**
- Everything else in the frame was already token-bound (`#282e65` → navy /
  text-primary, `#7bb929` → green).

---

## Decision Log (added to Build Plan Section 9, this PR)

- **#65** — Leaderboard mobile card-row transformation (fields dropped/combined; column header reduced).
- **#66** — Leaderboard empty state (0 ranked players → one card, not a blank table or error).
- **#67** — Guardian Consent mobile 1/1a/2 use the GC-family top bar, not the auth navbar.
- **#68** — `2072:5584` trophy icons rebound to navy during the green-tint retrofit.

---

## Founder-blocked (not guessed)

1. Leaderboard/Contest **points model** — no field, no endpoint.
2. Leaderboard **club axis** — which "club" mechanism the By-club filter means.
3. Leaderboard **public visibility** to logged-out visitors.
4. **Prediction & Commentary** competition type — no source screen.
5. Entire **Contest data model + monthly handoff mechanic** — no Section 4
   endpoints, no schema.
6. Contest **"already voted"** and **"between weeks / not open"** states — need a
   backend state to reflect.
7. Homepage **fixtures / news / season-record** data sources (Decision Log #6 +
   no stats model).

## Scoped follow-ups (design, deliberately not bundled)

1. **Contest user-facing section** — a coordinated modernise + mobile + phase-indicator
   pass over `2072:5584` / `2155:1062` / `2094:994`.
2. `2072:5584` still carries the shared Header's `brand/green-tint-28` (file-wide
   cleanup, out of this pass's scope).

---

## Verification

- Every new frame: Soccernity Theme Light variables, no hardcoded hex in authored
  content; homepage/leaderboard mobile inherit their source frames' bindings
  unchanged (layout-only reflow).
- 0 frame overlaps among the 12 new frames and against every existing page
  element (checked programmatically).
- 0 placeholder shimmers.
- Screenshots captured for all new frames.
- **No real browser / Playwright check** — not available in this environment,
  same ceiling as every prior Figma PR.
- **No application code, DTOs, endpoints or backend touched.**
