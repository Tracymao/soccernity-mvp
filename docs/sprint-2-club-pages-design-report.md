# Sprint 2 — Club Pages design report

**Branch:** `sprint-2/club-pages-design` (from `origin/main`)
**Agent:** figma-screen-builder
**Date:** 2026-09-02
**Figma file:** `Soccernity-MVP` (`weZWWqggy9j13eX8bhFgs6`), page `Soccernity` (`0:1`)

Closes the **design half** of Decision Log #155 — the persistent Club Pages
surface that Sprint 2's own "Club Pages" scope (Build Plan Section 6:
"Sprint 2 — Feed, Club Pages, Follow" / "Build club fan pages with auto-join
on signup") never fully shipped. What Sprint 2 actually built was
`ClubPickerStep.tsx`, a one-time join-picker shown only during onboarding;
there was no way to browse clubs or view a single club afterward, and no
returning-user surface where the per-caller `joined` flag (Decision Log #154)
or `DELETE /clubs/:id/join` (Decision Log — `sprint-2/club-leave`) mattered.

Frontend code conversion is a **separate `figma-to-code` follow-up** — no
React code was written in this task, per this project's agent-sequencing rule.

---

## 1. What was built

Five frames on page `0:1`, positioned in a new row directly below the mobile
Club Picker family (`x` from 60093, `y` = -6600):

| Frame | Node ID | Size |
|---|---|---|
| Clubs — Browse — Desktop | `5841:9240` | 1440 × 948 |
| Clubs — Browse — Mobile | `5841:9306` | 390 × 938 |
| Club — Fan Page — Desktop | `5841:9365` | 1440 × 532 |
| Club — Fan Page — Mobile | `5841:9431` | 390 × 386 |
| Club Pages — Design Notes & Open Decisions | `5853:9240` | 900 × auto |

All four screen frames were **cloned from the existing Club Picker frames**
(`5146:6635` desktop, `5645:8023` mobile) so every card / badge / button /
search / load-more / empty-state pattern — and every variable binding — is
inherited verbatim rather than reinvented, exactly as the brief required.

### 1a. Clubs — Browse (desktop + mobile)

The persistent, always-reachable version of what `ClubPickerStep` already
does, with the onboarding-specific framing removed:

- **Removed:** the "Skip for now" / "Continue to Soccernity" dynamic-label
  footer action and the optional confirmation-message slot. A persistent
  browse page has nothing to skip or continue past.
- **Header copy:** "Join a club" → **"Clubs"**; subheading → *"Browse clubs
  on Soccernity and follow the ones you support — join or leave at any time."*
- **Club cards** — real `ClubSummary` fields only: logo-or-initial badge
  (`brand/green-tint` 12% ground, navy initial when no `logoUrl`), club name,
  `league • country` (falls back to "Independent"), member count (singular /
  plural). Four sample cards, reusing the Club Picker's own sample data,
  including the no-logo / "Independent" / "1 member" edge case on card 3.
- **Join / Leave button reading real `joined` state (Decision Log #154):**
  three cards show the green **"Join"** button (`joined = false`); one sample
  card (Surulere United) shows the **"Leave"** state (`joined = true`) — a
  white / navy-15%-outline / navy-label button, de-emphasised against the
  green Join. This Leave affordance is genuinely new: `ClubPickerStep` never
  needed it because a fresh signup has nothing to leave. `DELETE
  /clubs/:id/join` already exists on the backend.
- **Search** — kept the Club Picker's honest client-side substring filter
  over already-loaded pages. `GET /clubs` has no text-search parameter (only
  `league` / `country` equality), so the placeholder stays *"Filter loaded
  clubs by name"* — nothing implies a full-catalogue search.
- **"Load more"** — same cursor-pagination button pattern. `GET /clubs` pages
  alphabetically by name.
- **Card → Fan Page navigation:** every club card carries a prototype
  `ON_CLICK → NAVIGATE` reaction to the corresponding Club Fan Page frame.

### 1b. Club — Fan Page (desktop + mobile)

View a single club. The **entire real-data content** is:

- a "← Clubs" back link (prototype-wired back to Browse);
- the club identity block — badge (88px desktop / 72px mobile), club name
  (30px / 22px), `league • country`, member count;
- a single **Join / Leave** button (green primary "Join" shown; same Leave
  treatment as Browse when `joined = true`);
- one thin divider and one muted scope note: *"Member posts and a full member
  list aren't part of club pages yet."*

Nothing else. The page is deliberately sparse — an honest reflection of what
`ClubSummary` / `JoinClubResult` actually expose, the same discipline
`ProfilePage.tsx` applies to its own unbacked tabs. It was **not** padded
with dummy content.

---

## 2. HARD CONSTRAINT — no club feed, no posts (confirmed honoured)

- **No** "recent posts from this club" section, composer, poll, or feed of
  any kind on either screen.
- **No** member list (`GET /clubs` / `GET /clubs/:id` deliberately do not
  select `members`, and Section 4.4 defines no `GET /clubs/:id/members`).
- `GET /posts/feed` is scoped to the caller's own posts + follows and never
  reads or filters `Post.clubPageId`, despite that column existing. A club
  feed has **no backend endpoint to bind to**. This is a real missing
  endpoint (not vendor-blocked content like the homepage fixtures), so it is
  flagged as a new Decision Log candidate (#157) rather than faked with dummy
  data.

---

## 3. New Decision Log candidates (this PR adds #156–#158)

### #156 — Navigation entry point for "Clubs — Browse"

"Clubs — Browse" has no nav-bar entry point anywhere. The `Web app Navbar`
component set (`2824:4309`: `header 4` / `header 7` + mobile variants) has no
Clubs slot, and the whole Club Picker family plus the "Which Club Do I
Represent" selector (`5570:7813`) use the simple **"Top Bar — Soccernity"**
logo bar, not the full logged-in `header 4`.

**Conservative choice made meanwhile:** both new screens use that same simple
logo Top Bar, matching the immediate family. **Open:** whether persistent
Club Pages (unlike mid-onboarding steps) should adopt the real `header 4`
navbar and get a discoverable Clubs entry point — its own nav item, a link
from Profile, or from the Community left rail. A coordinated navbar decision,
deferred rather than invented here.

### #157 — Club fan-page feed / club-scoped posts endpoint

`Post` has a `clubPageId` column but nothing reads or filters by it. There is
no way to show a club's posts. Defining a club feed — `GET /clubs/:id/posts`,
or a `clubPageId` filter on `GET /posts/feed`, with its own scope and
pagination rules — is real backend design work. Flagged; not built around,
not faked.

### #158 — `apps/web` needs a `leaveClub()` API client

`api/clubs.ts` has `joinClub()` and `listClubs()` but **no client for the
already-shipped `DELETE /clubs/:id/join`** (`sprint-2/club-leave`). The Browse
and Fan Page "Leave" affordance is the first surface that needs it —
`figma-to-code` must add it during conversion.

---

## 4. Standing rules — verification

- **Palette:** `brand/navy`, `brand/green`, `brand/green-tint` (12%) only.
  **No `brand/green-tint-28`. No new colours.**
- **Light mode only**, matching every other Sprint 2 screen.
- **0 unbound paints, 0 off-palette paints** across all five frames —
  verified node-by-node via a `use_figma` audit script. Every solid fill /
  stroke resolves to a `Soccernity Theme` variable: cloned frames inherited
  their bindings from the already-bound Club Picker frames (frame grounds use
  `color/background/page`; cards/inputs use `color/background/surface` +
  `color/icon/inactive` border; badges use `brand/green-tint`; Join button
  `brand/green` + `color/text/on-green`; text `color/text/primary` /
  `color/text/secondary`), and every freshly created node (back link,
  divider, scope note, all Design Notes text) was bound on creation.
- **Reused** the Club Picker card / badge / button / search / empty-state
  patterns rather than redesigning a closely-related feature.

---

## 5. Verification performed

- Screenshots of all four screen frames + the Design Notes frame reviewed —
  no clipped text, no overlap, layouts reflow cleanly after content edits and
  frame resize.
- `use_figma` paint audit across all five frame subtrees: 0 unbound, 0
  off-palette, 0 non-`Soccernity Theme` variables.
- Prototype reactions confirmed wired: 4 desktop cards → `5841:9365`, 4
  mobile cards → `5841:9431`, back links → Browse.
- No real browser / Playwright check applies — this is Figma design work, not
  code.

---

## 6. Deliverables checklist

- [x] Both screens designed in Figma, desktop + mobile, within all constraints
- [x] This report
- [x] CLAUDE.md updated in the same PR (new dated bullet)
- [x] Build Plan Decision Log (Section 9) updated in the same PR — rows
      #156–#158 + forward-pointer on #155's Status cell
- [x] Branch from `origin/main` → commit → push → open PR against `main`,
      **do not merge**
