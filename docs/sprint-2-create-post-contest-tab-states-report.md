# Sprint 2 — Create Post mode-tab row: both visibility states (Decision Log #148)

**Branch (for the finalising session):** `sprint-2/create-post-contest-tab-states`
**Scope:** Figma design only. No application code touched. Two net-new frames + two caption notes.
**Closes:** Decision Log #148 (the open "should the tab row appear only once Contest mode is
entered, or belongs on the plain composer" question left by
`sprint-2/create-post-sports-contest-mobile-admin-notif-fix`, PR #130).
**Agent:** figma-design-system. No shell available that session — git/gh/docx work is this
finalising session's, per the project's established handoff precedent.

---

## 1. The founder's decision

The tab row's visibility is driven by whether an **ACTIVE CONTEST** currently exists in the
system right now — **not** by which composer mode the user happens to have selected. This is not
a user-controlled toggle; it's a conditional render based on real-time contest state.

## 2. The two states

| | |
|---|---|
| **Active-contest state** | **`5982:10905`** — "Community — Create Post — Mobile — Active Contest" |
| **No-active-contest state** | **`5982:10932`** — "Community — Create Post — Mobile — No Active Contest" |
| **Base frame (unchanged)** | `5701:8328` — "Community — Create Post — Mobile" |
| **Page** | `0:1` ("Soccernity") |
| **Position** | x 14031/14531, y 23522 — placed immediately right of `5956:12797` in the existing Community mobile frame row |

Both are clones of the base frame, not mutations of it — the same "clone, don't overwrite the
canonical" precedent used throughout this file (the Blog split, the homepage passes, the Bants
mobile categories-view frame).

### Active-contest state (`5982:10905`)

Clone of `5701:8328`, **no visible content change**. The Mode Tabs row is present exactly as
already built — "Create a Post" tab active with its green underline, "Contest" tab present
alongside it. 390 × 457. The point of this frame existing is to give the already-built appearance
an explicit, independent identity as "what renders when an active contest exists," decoupled from
the base frame's other role as the generic starting point other Create Post frames were cloned
from.

### No-active-contest state (`5982:10932`)

Clone of `5701:8328` with the entire `Mode Tabs` child removed via a real node deletion — **not**
hidden, **not** disabled/greyed out, genuinely absent, as if the tab row never existed on this
screen. Because the parent frame is `VERTICAL` auto-layout with `primaryAxisSizingMode: AUTO`,
removing the child reflowed automatically: `Content` moved up from y 129 to y 74 with zero gap,
and the frame hugged down from 457px to **402px** (74 App Bar + 328 Content, no dead space).
Confirmed via before/after screenshots — clean reflow, no overlap, no leftover gap.

## 3. Caption notes

Following the exact established convention set by nodes `5933:10771` / `5933:10772` / `5933:10773`
(the Create Post overlay-context notes added in `sprint-2/blog-sports-navbar-retrofit`) — one note
per frame, cloned from one of those nodes for exact font/size/opacity/color-token match (11px,
`color/text/secondary` at 70% opacity, `textAutoResize: HEIGHT`) — rather than inventing a
shared-note pattern covering both frames at once.

**`5982:10959`** (above `5982:10905`, active-contest frame):

> NOTE — Community — Create Post — Mobile — Active Contest
>
> Runtime condition (Decision Log #148) — this frame represents the state that renders when an
> ACTIVE CONTEST currently exists in the system. The "Create a Post / Contest" Mode Tabs row is
> visible here — Contest tab included — matching the original base frame's built appearance
> (Community — Create Post — Mobile, 5701:8328) exactly, with no visible content change. This is
> NOT a user-controlled toggle: whether this state or its sibling, Community — Create Post —
> Mobile — No Active Contest (5982:10932), renders depends entirely on a real-time "is there an
> active contest right now?" check. That check has no backend to run against — no
> Contest/Competition entities, endpoints, or active-contest-status source exist anywhere in
> services/api as of this task (Decision Log #148, see also #70–#73). NOT YET BUILDABLE — a future
> figma-to-code pass must not wire this condition against anything that exists today.

**`5982:10960`** (above `5982:10932`, no-active-contest frame):

> NOTE — Community — Create Post — Mobile — No Active Contest
>
> Runtime condition (Decision Log #148) — this frame represents the state that renders when NO
> active contest currently exists in the system. The "Create a Post / Contest" Mode Tabs row is
> removed entirely — not disabled, not greyed out, genuinely absent — and Content reflows up to
> close the gap, opening straight into the plain post view. See its sibling, Community — Create
> Post — Mobile — Active Contest (5982:10905), for the other state. This is NOT a user-controlled
> toggle: whether this state or its sibling renders depends entirely on a real-time "is there an
> active contest right now?" check. That check has no backend to run against — no
> Contest/Competition entities, endpoints, or active-contest-status source exist anywhere in
> services/api as of this task (Decision Log #148, see also #70–#73). NOT YET BUILDABLE — a future
> figma-to-code pass must not wire this condition against anything that exists today.

## 4. Paint audit

| Frame | Paints | Bound | Unbound | Off-palette | `brand/green-tint-28` |
|---|---|---|---|---|---|
| Active-contest (`5982:10905`) subtree | 23 | 23 | 0 | 0 | 0 |
| No-active-contest (`5982:10932`) subtree | 18 | 18 | 0 | 0 | 0 |
| Caption note `5982:10959` | 1 | 1 | 0 | 0 | 0 |
| Caption note `5982:10960` | 1 | 1 | 0 | 0 | 0 |

Zero new colours introduced — both frames are pure clones inheriting only tokens the base frame
already used (`brand/green`, `brand/navy`/`color/text/*` variants, `color/background/surface`).
Nothing outside these two frames plus the two notes was touched; the shared Navbar component was
not touched (these Create Post compose frames carry no navbar, per the existing convention
documented in `sprint-2/blog-sports-navbar-retrofit`'s own caption notes).

## 5. New Decision Log candidate

**#188 — The active-contest check behind the Create Post mode-tab row (#148) has no data source to
bind to.** Same category of gap as #157 (club-scoped feed) and the broader Contest/Competition
data-model absence already tracked since #70–#73/#134. This is a documentation-only surfacing, not
a new blocker beyond what #148 and #70–#73 already record — flagged as its own numbered candidate
so a future `figma-to-code` pass has one canonical line item to check before attempting to wire
this specific tab-row condition, rather than needing to cross-reference three different prior
entries. **Open — blocked on the Contest/Competition data model. Not resolvable until backend work
on Contest/Competition resumes.**

## 6. Does this close Decision Log #148?

**Yes, on the design side.** #148 asked whether the tab row belongs on the plain composer or
should appear only once Contest mode is entered. The founder's answer reframes the question
entirely: visibility isn't about composer mode at all, it's about whether a contest is currently
active. Both resulting states are now explicit, named, audited frames, each carrying its own
caption note making the still-unbuilt runtime dependency unmistakable to whoever picks this up
next. What #148 does not resolve, and what #188 records: there is no way to actually wire either
state to real data yet, because the Contest/Competition data model itself does not exist.

## 7. Handoff to the finalising session

- **Branch:** `sprint-2/create-post-contest-tab-states` off `main`.
- **Docx (Build Plan Section 9):** forward-pointer appended to **#148**'s Status cell; new row
  **#188** added. Both done in this finalising session.
- **CLAUDE.md status bullet:** added in this finalising session, recording the two frame IDs, the
  two caption-note IDs, the paint audit, and that #148 is closed while #188 is a new open
  candidate.
- **PR:** push and open, do **not** merge.
- **No application code was touched.** `apps/web` and `services/api` are untouched — there is
  nothing to build, lint, or test in this PR.
