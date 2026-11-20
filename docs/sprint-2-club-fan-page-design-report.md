# sprint-2/club-fan-page-design — report

**Agent:** figma-design-system / figma-screen-builder · **Date:** 2026-09-05
**Scope:** Figma design only — no `apps/web` / `services/api` code.
**File:** Soccernity-MVP (`weZWWqggy9j13eX8bhFgs6`), page `Soccernity` (`0:1`).
**Decision Log:** #216 added; forward-pointer appended to #157.

Extends `Club — Fan Page — Desktop` (`5841:9365`) and `Mobile` (`5841:9431`) from their
deliberately-minimal placeholder state (badge / name / join-button / back-link /
scope-note only — an intentional DL #157 placeholder) into the real page.

---

## Header section — carried forward UNCHANGED

Both frames keep, exactly as-is:
- `← Clubs` back link
- Club badge / initial · Club Name · `League • Country` · Member Count
- The green **Join** button

The only change in the header area: the **"Member posts and a full member list aren't
part of club pages yet"** scope note is **removed** — both are now designed, so the note's
claim is false. Everything else appends *below* the first divider.

Verified against the pre-change frames (screenshots before/after): the badge header +
join button + back link render identically.

---

## 1. Club feed  (closes the DESIGN side of Decision Log #157)

- New **"Club feed"** section below the header divider.
- Post cards **cloned from the Community — Home Feed post-card pattern**
  (`Community — Home Feed — Mobile` `5701:8239` — `Post — Emeka John` / `Post — Adeniyi
  Christiana`). Same card: author identity row (avatar + name + `@handle · time` + ⋯),
  body text, divider, engagement row (comment / like / repost / save counts).
- Posts are **illustrative member social posts** (dummy data) — "Massive win at the
  weekend…", "Anyone driving to the away match…". Same dummy-data-ahead-of-backend
  convention as every other pre-backend screen in the file.
- **No composer** — deliberately not designed. There's no club-post-creation endpoint,
  and posting-to-a-club is further from the backend than reading a club feed.

**Decision Log #157 is advanced, not closed.** `GET /posts/feed` still never reads
`Post.clubPageId`; there is no club-scoped posts endpoint or route. `figma-to-code` must
**not** wire this feed to real data until one exists.

## 2. Member list / roster

- New **"Members"** section: header ("Members" + "2,106 members") + a roster of member
  rows + a **"View all members →"** link.
- **Roster row** adapted from the post-card author-identity block (avatar + display name
  + `@handle`) — the existing member-identity pattern in the same section the brief
  points at — plus a secondary outline **"Follow"** button (`POST /users/:id/follow` is a
  real, shipped endpoint).
  - The Admin Panel `Users - team members` table (`917:218`) was checked and rejected as
    the base — it's a moderation table (ban / delete actions, no avatars), wrong shape
    for a public roster. The Settings "Suggested" rail is absolute-positioned (not
    auto-layout), also poor to adapt. The post-card author block is the cleanest
    existing avatar+name+handle row.
- The roster is conceptually **"users whose represented club is this club"** — that
  field / endpoint does not exist yet either (Decision Log #74 — represented-club
  selector designed, no backend). Dummy members.
- **"View all members →"** has **no destination screen** — a dedicated full-roster screen
  isn't built. Flagged, not wired.

---

## Out of scope (founder-confirmed)

Club announcements, fixtures, or any other content — no data source exists for either,
none designed.

---

## Verification

- **Screenshot-verified both viewports** against the pre-change minimal frames — the
  badge / name / join-button / back-link header carries forward unchanged, new
  feed + roster appended below the divider, not replacing it.
- Post cards reuse the Community feed pattern verbatim (clones), so card styling / type /
  engagement icons match Community exactly.
- **Token discipline:** no new colour, **no `brand/green-tint-28`**, Light mode only.
  Paint audit — **both frames 0 unbound paints** (layout-wrapper default white fills
  cleared; post-card and Follow-button fills bound to `color/background/surface`, text to
  `color/text/primary` / `secondary`, link to `brand/green`).
- Post cards carry **Montserrat** (Community feed convention); new chrome (section
  headers, roster names, links) uses **Inter**, matching the Club Fan Page's existing
  header type.
- On-canvas **`Club — Fan Page — Design Notes`** annotation added.
- No real browser / Playwright check available — screenshot + structural audit is the
  ceiling, same as every prior Figma pass.

## Decision Log

- **#216** added — records the feed + roster additions, the no-composer / no-roster-screen
  flags, and that #157's endpoint is still unbuilt.
- **#157** — forward-pointer appended noting the design side is now built.
