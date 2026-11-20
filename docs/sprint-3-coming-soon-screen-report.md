# Coming Soon screen (Scouting + Academy) — session report

`sprint-3/coming-soon-screen-scouting-academy` (figma-screen-builder,
2026-09-13). Figma design only — no app/backend code. Net-new screen family,
so this is `figma-screen-builder`'s task, not a `figma-design-system` retouch.
Decision Log #285.

## Task

Scouting and Academy got real navbar icons (Decision Log #284) with nothing
behind them yet (Decision Log #3 — Phase 2, not MVP-blocking). Rather than
two bespoke "not built yet" screens, design **one generic, reusable Coming
Soon template** — desktop + mobile — that takes a feature name as its only
variable content, so every future Phase 2 pillar that eventually gets a
navbar slot can reuse it with zero new design work.

## What was built

Five new frames, parked in a fresh row at `y ≥ 40000` on page `0:1` (clear of
the Community Groups mobile row, the prior bottommost content):

- **`Coming Soon — Desktop — Logged In`** (`1440×1005`) — `header 4` navbar
  instance.
- **`Coming Soon — Desktop — Logged Out`** (`1440×1005`) — cloned from the
  above, navbar swapped to `header 7`.
- **`Coming Soon — Mobile — Logged In`** (`390×980`) — `header 4 — mobile`
  navbar instance, built fresh at mobile type scale (not a resize of the
  desktop content).
- **`Coming Soon — Mobile — Logged Out`** (`390×980`) — cloned from the
  above, navbar swapped to `header 7 — mobile`.
- **`Coming Soon — Design Notes`** — an on-canvas annotation frame
  documenting the template, exempt from the token-binding audit per this
  file's own established precedent for design-documentation frames.

**Why four screens, not two**: the task's own literal ask was "desktop +
mobile," but Scouting/Academy's navbar icons exist on **both** `header 4`
and `header 7` (Decision Log #284 added them to both variants), and every
other page in this file reachable from both navbar states — Blog, Article
Detail, Sports Hub, all three Legal pages — gets the full auth-state ×
breakpoint split. Building only two frames would have made this the one
inconsistent page in the file for no real reason, so the full split was
built instead. Flagged in this report and in the Design Notes frame, not
silently decided.

## Content (identical across all four screens — the reusability is real)

- A neutral clock-glyph icon (tinted style: green-tint disc + navy stroke
  glyph, matching the navbar icon construction — not a feature illustration).
- A `COMING SOON` badge pill (navy fill, white label) — fixed, generic.
- **The one variable slot** — a text layer named `Feature Name`, set to
  `"Scouting"` as the worked example.
- A fixed, generic sub-line: *"This feature is part of our Phase 2 roadmap
  and isn't built yet. Check back soon."* — no feature-specific claims, no
  fabricated previews.
- A generic CTA button, `"Back to Soccernity"` (navy fill, white label) —
  not a feature-specific action.

No fake screenshots or mocked feature previews were designed for either
pillar — there is nothing to show. This satisfies the task's own scope
boundary (item 3): nothing Scouting- or Academy-specific was designed
beyond the one example name.

## Chrome

Real shared site chrome — `Navbar header 4`/`header 7` (desktop) and
`header 4 — mobile`/`header 7 — mobile`, plus the canonical Footer
(`5213:6816` desktop / `5543:7662` mobile, cloned) — **not** the logo-only
provisional Top Bar Grassroots/Community Groups used before their nav
placement was decided (Decision Log #258/#282). This screen is reachable
from the real, current navbar, so it was built to read as a real page.

## A real bug found and fixed during the build, not inherited

The mobile Navbar component (`header 4 — mobile` / `header 7 — mobile`,
`5386:6576` / `5386:6575`) is **natively 428px wide, not the canonical
390px** this file otherwise standardized on (Decision Log #86). Both mobile
frames initially overflowed — the Login button and the avatar/messages
cluster were clipped past the 390px frame edge — caught by screenshot, not
missed. Fixed by explicitly resizing each navbar instance to `390×64` after
creation; both mobile frames now render correctly, confirmed via a full
re-screenshot. This is called out explicitly in the Design Notes frame as a
step any future page cloning this navbar must not skip.

## Not wired — and why that's correct, not a gap

Neither navbar icon has a prototype `NAVIGATE` reaction pointing at this
screen. The `scouting`/`academy` icon groups added in Decision Log #284
live **inside** the `header 4`/`header 7` master components, not as
instances — and this file's own standing gotcha (Decision Log #249) is that
Figma rejects `NAVIGATE` reactions set on `COMPONENT` descendants. This
matches how every other navbar icon already works in this file: the actual
icon-to-route mapping is code-side (`apps/web/src/layout/navigation.ts`),
not Figma prototyping. Noted explicitly in the Design Notes frame so it
isn't mistaken for an oversight.

## Verification

- **Zero overlaps**: checked via a strict pairwise AABB test against every
  one of the 559 existing top-level nodes on page `0:1`, and among the 5 new
  frames themselves (a first pass found the Design Notes frame overlapping
  `Coming Soon — Desktop — Logged Out`; moved and re-verified clean).
- **Paint audit**: **0 unbound, 0 off-palette SOLID paints** across the 4
  shipped screens (the Design Notes frame's own 10 unbound paints are
  expected and out of scope — annotation content, not shipped UI, per this
  file's established precedent). **0 `brand/green-tint-28`** anywhere. Light
  mode only, no new colour.
- **Visual**: full-frame and close-up screenshots taken at every step,
  including after the mobile-navbar-width fix, confirming clean rendering
  with no clipping or overlap.

## Explicitly not done

- No destination/`NAVIGATE` wiring from the navbar icons (see above — code-
  side, not a Figma task).
- No feature-specific content, screenshots, or previews for either Scouting
  or Academy beyond the one example name.
- No app/backend code touched.
