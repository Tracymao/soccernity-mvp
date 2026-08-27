# Sprint 2 — Mobile Navbar Variant

**Branch:** `sprint-2/mobile-navbar-variant`
**Date:** 2026-08-28
**Figma file:** `weZWWqggy9j13eX8bhFgs6` ("Soccernity-MVP"), page "Soccernity" (`0:1`)

Closes the **"Mobile auth navbar"** follow-up flagged by PR #100
(`docs/sprint-2-retrofit-light-mode-auth-email-report.md` §4): the
"Web app Navbar - Desktop and Mobile" component set (`2824:4309`) had only
1440 px desktop variants, so PR #100 shipped the five Auth Pages **mobile**
frames with no navbar at all.

## Routing note

Task suggested **figma-screen-builder** (a variant that doesn't exist yet is
that agent's domain, not figma-design-system's retouch domain — the same call
PR #97's homepage rebuild and the Leaderboard design each flagged). This work
was done in the main session; the routing suggestion is noted and not
contested — designing a genuinely new component variant is screen-builder
territory, and the pairing to the existing token system is design-system
territory, so it straddles both. Flagged per the project's disclosure pattern.

---

## 1. What was added

Two new variants **inside the existing component set `2824:4309`** (not a
standalone frame):

| Variant name | State | Node | Size |
|---|---|---|---|
| `Property 1=header 7 — mobile` | Logged-out | `5386:6575` | 428 × 64 |
| `Property 1=header 4 — mobile` | Logged-in | `5386:6576` | 428 × 64 |

`Property 1` now has four values: `header 4`, `header 7`, `header 7 — mobile`,
`header 4 — mobile` — the single-property naming the task asked for, so the
mobile variants stay obviously paired with their desktop counterparts in the
variant picker. (A second "Breakpoint" property was considered and rejected —
it would have required renaming the two existing desktop variants, a larger
and riskier change than the brief intends.)

### Width

Built at **428 px** — the mobile-screen convention already established in this
file (`community mobile 1–5` and `Messages mobile window 2/4` are all 428 ×
926; the `community mobile 1` top bar is a 428 × 60 white bar with a
`brand/green-tint` search pill, which this variant mirrors). The five Auth
Pages mobile frames are **390 px** wide, so each instance is resized to 390 px
on placement — the navbar is auto-layout with `SPACE_BETWEEN`, so it reflows
cleanly. See Decision Log #48.

### Height

**64 px** (desktop variants are 90 px). Matches the compact mobile app-bar
height and is close to the file's existing 60 px `community mobile` top bar.

---

## 2. Structure & token bindings

Both variants: `color/background/surface` fill, `HORIZONTAL` auto-layout,
`SPACE_BETWEEN`, 16 px left/right padding, children vertically centred. Every
element cloned from the **desktop** variants so the two breakpoints share
identical sub-components and identical tokens.

### `header 7 — mobile` (logged-out)

| Element | Source (desktop) | Token bindings |
|---|---|---|
| Logo (`Frame 5871`: mark + "Soccernity" wordmark) | `2841:4105` | mark → `brand/green` + `color/text/primary`; wordmark (Inter Bold 24) → `color/text/primary` |
| Search icon (magnifier, standalone — collapsed from the desktop search pill) | `2841:4112` | stroke → `brand/navy` (2 px) |
| Login button (`Frame 5805`, r6) | `2631:3972` | fill → `brand/navy`; "Login" (Montserrat SemiBold 16) → `color/text/on-navy` |

Nav-icon row (home/football/blog/community/leaderboard/banter) and the full
search *pill* are **dropped** on mobile — on this platform those live in the
separate bottom tab bar (`Mobile App Nav Icons`, `2230:4328`), and a
logged-out auth screen needs neither. The search *icon* is kept so the
affordance still visibly pairs with the desktop variant.

### `header 4 — mobile` (logged-in)

| Element | Source (desktop) | Token bindings |
|---|---|---|
| Logo | `2841:4105` | as above |
| Search icon | `2841:4112` | stroke → `brand/navy` |
| Messages glyph (`Group 835` — the desktop `header 4` right-side icon) | `2841:4251` | strokes/fills → `brand/navy`; two inner `#D9D9D9` placeholder fills re-bound → `brand/navy` |
| Avatar (`Component 20` instance) | `2838:3579` | frame → `color/background/surface`; image fill unchanged |

**Audit:** both variants — `0` unbound solid paints. Tokens used:
`color/background/surface`, `brand/green`, `color/text/primary`, `brand/navy`,
`color/text/on-navy`, `brand/green-tint`. **No `brand/green-tint-28`** (per
Decision Log #47) and **no new colour**. No dark-mode variant or logic.

---

## 3. Applied to the five Auth Pages mobile frames

| Frame | ID | Variant applied | Instance width |
|---|---|---|---|
| Login mobile | `1625:2303` | `header 7 — mobile` (logged-out) | 390 |
| Register mobile | `1625:2333` | `header 7 — mobile` (logged-out) | 390 |
| Forgot Password mobile | `1625:2375` | `header 7 — mobile` (logged-out) | 390 |
| Reset Password mobile | `1625:2404` | `header 7 — mobile` (logged-out) | 390 |
| Create Profile mobile | `1629:2449` | `header 4 — mobile` (logged-in) | 390 |

Same logged-in/out judgment PR #100 applied to the desktop counterparts.
**No different call for mobile** — the same reasoning holds: after
registration + email verification the user has a session, so Create Profile
is "logged-in". The same ambiguity PR #100 flagged carries over (a
mid-onboarding user seeing a full logged-in bar with avatar is arguable — a
stripped onboarding bar is a valid alternative). Founder call, unchanged from
PR #100.

Placement per frame:

- **Login / Register / Forgot / Reset mobile** (absolute layout): instance
  inserted at `(0,0)`, every existing child shifted **+64 px** in Y, the
  redundant in-frame "Group 103" logo lockup hidden, frame height **+64 px**.
- **Create Profile mobile** (VERTICAL auto-layout, 40/20/40/20 padding):
  instance set to `layoutPositioning = ABSOLUTE` at `(0,0)` so it sits
  full-bleed over the frame; frame `paddingTop` raised `40 → 104` so the form
  clears the navbar; in-frame logo hidden; frame height **+64 px**.

Instance audit (all 5): `0` unbound solid paints; all resized to 390 px and
reflowed correctly.

---

## 4. Verification

- Component-set variant parsing confirmed: `componentPropertyDefinitions`
  shows `Property 1` with the four expected values.
- Both new variants + all 5 applied instances audited node-by-node: `0`
  unbound solid paints.
- Screenshots captured for both variants, the full component set, and Login /
  Register / Create Profile mobile with the navbar in place.
- **No real browser / Playwright check** — not available in this environment,
  same ceiling as every prior Figma PR in this project.
- **No code touched** — Figma-only, plus CLAUDE.md + the Build Plan Decision
  Log entry + this report.

---

## 5. Open items / follow-ups

1. **Create Profile mobile navbar state** — `header 4 — mobile` vs a stripped
   onboarding bar: founder call, carried over unchanged from PR #100.
2. The five Auth mobile frames are **390 px**; the mobile navbar canon is
   **428 px** (Decision Log #48). If the Auth mobile frames are ever
   normalised to 428 px, the instances can drop their per-instance resize.
3. A mobile **bottom** tab bar for logged-in screens already exists as a
   separate component (`Mobile App Nav Icons`, `2230:4328`) — out of scope
   here, noted so nobody rebuilds it.
4. Dark-mode pass — out of scope; all bindings are mode-ready.
