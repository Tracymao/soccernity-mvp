# sprint-2/create-post-desktop-and-auth-navbar-fixes — report

**Agent:** figma-design-system · **Date:** 2026-09-05
**Scope:** Figma design only — no `apps/web` or `services/api` code touched.
**File:** Soccernity-MVP (`weZWWqggy9j13eX8bhFgs6`), page `Soccernity` (`0:1`).
**Decision Log:** #214 added to Build Plan Section 9.

A scoped edit + new-frame pass. New frames only within an already-existing family
(Create Post desktop). No new page concepts.

---

## Part 1 — Create Post desktop parity (2 new frames)

Mobile already had 5 Create Post states; desktop had 3
(`2008:655` "Create a post", `2009:2913` "Create a post - For Contest",
`2009:5168` "Create a post with attachment"), all built as full-page-with-modal-overlay
frames (1440 wide, feed dimmed under a scrim, compose card centred).

Built the two missing states by **cloning the (now navbar-fixed) `2008:655` frame** —
keeping the page-with-overlay pattern, not a bare 390-wide modal like mobile:

| New frame | Node | Modal content | Mobile counterpart |
|---|---|---|---|
| **Create Post — Desktop — Active Contest** | `6171:14797` | "Create a Post \| Contest ①" tabs present (unchanged from `2008:655`) | `5982:10905` |
| **Create Post — Desktop — No Active Contest** | `6171:16994` | Contest tab + count badge (`Frame 14`) removed; "Create a Post" kept as the modal heading; divider kept | `5982:10932` |

Placed continuing the Create Post desktop row (`x = -32555` and `-30950`, `y = -7988`,
same 1605px column spacing as the existing three).

**Judgment call (flagged, Decision Log #214d):** on the No-Active-Contest desktop modal
the "Create a Post" label keeps its tab-style navy accent underline and serves as the
modal heading. A desktop modal needs a title; mobile's header-less composer doesn't
translate 1:1. Removing only the Contest affordance (not inventing a new heading style)
is the minimal, safe change.

---

## Part 2 — Wrong navbar on all 5 Create Post desktop frames

Confirmed live: the 3 existing frames used a hand-drawn bar — a plain `Rectangle 109`
(1440×84) + a loose `Group` logo + a fake search field (`Rectangle 110` +
`akar-icons:search` + `Search Soccernity`) + a fake nav-icon row (`Group 258`) + a fake
avatar / notification / message cluster (`Ellipse 30`, `ci:notification-outline-dot`,
`bx:message-dots`) — **not** a real Navbar component instance.

**Fix:** on each of the 3 existing frames, removed those **9 hand-drawn nodes** and
inserted one **`Navbar — header 4`** instance (of `2838:3502`, the standard logged-in web
nav — Create Post requires auth), 1440×90, at **z-index 0** (bottom of z-order) so it
renders under the modal scrim exactly as the hand-drawn bar did. The 2 new Part-1 frames
were cloned from the already-fixed `2008:655`, so they carry the same navbar from the start.

| Frame | Node | Nav |
|---|---|---|
| Create a post | `2008:655` | `Navbar — header 4`, idx 0, 1440×90 |
| Create a post - For Contest | `2009:2913` | `Navbar — header 4`, idx 0, 1440×90 |
| Create a post with attachment | `2009:5168` | `Navbar — header 4`, idx 0, 1440×90 |
| Create Post — Desktop — Active Contest | `6171:14797` | `Navbar — header 4`, idx 0, 1440×90 |
| Create Post — Desktop — No Active Contest | `6171:16994` | `Navbar — header 4`, idx 0, 1440×90 |

Z-order re-verified per frame: `Navbar — header 4` at index 0, scrim `Rectangle 134` at
index 92, modal `Group 304` at index 93 — identical layering to the hand-drawn bar it
replaced. Bound-paint parity is structural (component instance inherits the `header 4`
component's paints); screenshot-confirmed the green Soccernity mark, green-tint search
pill and navy icons render correctly.

---

## Part 3 — Wrong navbar on Login / Signup / Forgot Password / Reset Password (12 frames)

Confirmed live: all 12 frames still carried the full logged-out
`Web app Navbar — logged out (header 7)` (desktop) or `… (header 7 — mobile)` (mobile)
instance, even though the shipped app (`AuthChrome` / `AuthTopBar`, Decision Log #172,
PR #152) has rendered the simple **`Top Bar — Soccernity`** for exactly these routes since.

**Reference re-verified live:** there is **no `Top Bar — Soccernity` component** in the
file — each Verify Email frame carries its own copy as a plain `FRAME`
(desktop `5143:6636`, 1440×90; mobile `5531:7265`, 390×90 — Logo mark + "Soccernity"
wordmark only, subtle bottom hairline, no nav/search/auth cluster).

**Fix:** for each of the 12 frames, cloned the matching Verify Email `Top Bar — Soccernity`
frame, inserted it at z-index 0, positioned `0,0`, sized to the frame width, and removed
the old header-7 instance.

| Frame | Node | Old nav (removed) | New | Frame | Node | Old nav (removed) | New |
|---|---|---|---|---|---|---|---|
| Login desktop | `407:844` | header 7 (1440×90) | Top Bar 1440×90 | Login mobile | `1625:2303` | header 7 — mobile (390×64) | Top Bar 390×90 |
| Register desktop | `407:1051` | header 7 | Top Bar 1440×90 | Register mobile | `1625:2333` | header 7 — mobile | Top Bar 390×90 |
| Forgot Password desktop | `409:1264` | header 7 | Top Bar 1440×90 | Forgot Password mobile | `1625:2375` | header 7 — mobile | Top Bar 390×90 |
| Forgot Password — Link Sent desktop | `5474:7077` | header 7 | Top Bar 1440×90 | Forgot Password — Link Sent mobile | `5474:8375` | header 7 — mobile | Top Bar 390×90 |
| Reset Password desktop | `409:1463` | header 7 | Top Bar 1440×90 | Reset Password mobile | `1625:2404` | header 7 — mobile | Top Bar 390×90 |
| Reset Password — Success desktop | `5776:8405` | header 7 | Top Bar 1440×90 | Reset Password — Success mobile | `5777:8479` | header 7 — mobile | Top Bar 390×90 |

**Mobile height:** the Verify Email mobile reference uses a 90px `Top Bar — Soccernity`
(same as desktop; the shipped `AuthTopBar` is 90px on every viewport — see the
`sprint-2/auth-pages-topbar` "84px → 90px" correction). Mobile auth frames previously used
a 64px nav; the new 90px bar has clearance to all form content (nearest element is
`Group 103` at `y104` on Link Sent mobile → 14px gap; nothing overlaps).

**Deliberately NOT touched, re-verified live:**
- **Verify Email** — all 8 states already correct.
- **Guardian Consent** — intentionally mixed (`5108:6627` split-panel with no top bar;
  `5108:6631` uses a distinct "Top Bar — Minor Account (Active)" status bar) — confirmed
  correct as-is.

**Left in place, flagged (Decision Log #214):** every auth frame's form body still
contains a hidden (`visible = false`), inert secondary `Group 103` / `Logo` wordmark
lockup. The shipped `SignupSplitScreen` no longer renders these. They cause no
double-logo and no overlap (all hidden). Deleting the dead nodes from Figma is an
optional micro follow-up, not done here.

---

## Verification

- **Before/after screenshots** captured for a sample from each family:
  Create Post desktop (`2008:655`, `2009:5168`), both new frames, Login desktop/mobile,
  Register mobile, Forgot Password mobile, Forgot Password — Link Sent mobile,
  Reset Password desktop, Reset Password — Success desktop/mobile.
- **Final sweep (programmatic):**
  - 12 auth frames — `header 7` instance count = **0** on every frame; exactly **1**
    `Top Bar — Soccernity` per frame at z-index 0, correct size (1440×90 / 390×90).
  - 5 Create Post desktop frames — every one carries a `Navbar — header 4` **instance**
    (mainComponent confirmed = `Property 1=header 4`) at z-index 0, 1440×90; **zero**
    hand-drawn nav remnants; no stray top-band `Group` logo.
- Standing rules held: no new colour, no `brand/green-tint-28`, Light mode only. All
  navbars are component instances / frame clones of confirmed-correct references, so
  token/paint bindings are inherited unchanged.
- **No real browser / Playwright check available in this environment** — screenshot +
  structural audit is the verification ceiling, same as every prior Figma pass.

## Decision Log

- **#214** added (Build Plan Section 9, Table 6) — records (a)–(d) above and the two
  flagged items (No-Active-Contest desktop modal heading; hidden secondary lockups).
