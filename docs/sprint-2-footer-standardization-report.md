# Sprint 2 — Footer Standardization (Decision Log #209)

**Branch:** `sprint-2/footer-standardization`
**Agent:** `figma-design-system`
**Scope:** Figma design only, scoped edit pass on existing frames — no new screens, no app/backend code.

## Summary

24 non-canonical footer instances, file-wide (excluding Admin Panel, which carries none), were replaced with clones of the canonical footer already established on the Home Page rebuild (Decision Log #46).

## Canonical reference (unmodified)

- Desktop: `5213:6816` (1440×314, on Home Page Desktop `5204:6728`)
- Mobile: `5543:7662` (390×418, on Home Page Mobile `5543:7407`)
- Structure: Footer Wordmark (logo + "Soccernity") → 6-icon Social Bar → Legal Links row (4 links, bullet dots) → Footer Rule (hairline) → Copyright text block.
- Bound to: `brand/green`, `color/text/on-navy`, `color/icon/inactive`, `brand/navy` (Soccernity Theme Light).

## What was found, live (not trusted from the brief)

- **22 "Footer — Soccernity Global" instances** on Leaderboard/Contest/Competition-tab frames (desktop + mobile), confirmed to use an older, structurally different pattern: plain-text social labels with no icons, an extra "Cookie Policy" link not present in the canonical 4-link set, no hairline rule, and a different text-only wordmark treatment (no logo mark).
- **2 compact "Footer" instances** (390×96) on Sports/Livescores mobile (Logged Out `5647:8166`, Logged In `5647:8315`) — confirmed genuinely missing the social bar and full legal-links row, just a wordmark line + one condensed link string.
- **"Footer Action" nodes checked and confirmed unrelated** — button bars (e.g. "Skip for now"), not footers, correctly excluded.
- **No Admin Panel frame carries a footer** — confirmed, nothing excluded there needed excluding.
- **All 24 parent frames use `layoutMode: VERTICAL` auto-layout with `primaryAxisSizingMode: AUTO`** (hug content) — this is genuinely different from the absolute-layout/GROUP content the `frame.resize()`-on-GROUPs gotcha (CLAUDE.md's Figma-authoring gotchas) was found on. Because these are true auto-layout containers, no manual resize/reposition math was needed and no drift risk applied: cloning the canonical footer, inserting it at the old footer's child index, and removing the old footer let each frame's own height grow automatically to fit.
- One frame (`5171:6633`, Leaderboard Page Desktop) has a 4th child, `ANNOTATIONS — design documentation, not shipped UI`, after the footer — confirmed the insert correctly landed at the footer's original index (2), ahead of the annotations frame, so ordering was preserved.

## Method

For each of the 24 targets: cloned the correct canonical footer (desktop source for 1440-wide parents, mobile source for 390-wide parents), `insertChild`'d the clone at the old footer's exact index, then removed the old footer. Fonts (`Montserrat SemiBold`, `Montserrat Regular`) were loaded first per the canonical text-edit recipe, since `insertChild` on a subtree containing text nodes falls under the "any operation on nodes with unloaded fonts" rule.

Each parent frame's height grew automatically via its own auto-layout hug sizing — no `frame.resize()` call was made on any target frame. Desktop frames grew +85.002px (229→314.002); mobile Leaderboard/Contest/Competition frames grew +86.002px (332→418.002); the two Sports Hub mobile frames grew the most, +322.002px (96→418.002), since their old footer was the compact stub.

## Verification

- **Paint bindings**: every new footer's variable set (`brand/green`, `color/text/on-navy`, `color/icon/inactive`, `brand/navy`) matches the canonical footer's own bindings exactly — confirmed via `get_variable_defs` on samples including the largest-growth case (Sports Hub mobile).
- **Screenshots, before/after by family**: Leaderboard Page Desktop, Leaderboard Mobile, Contest — Weekly Results (Top 3), Leaderboard — Empty State (Filtered), and full-frame renders of both Sports/Livescores mobile states (Logged Out and Logged In) — all clean, no overlap, no visual regression, content above the footer unaffected by the frame's growth.
- **File-wide sweep**: a `findAll` across page `0:1` for any frame named `"Footer — Soccernity Global"` or bare `"Footer"` (excluding any name containing "Action") returned **zero matches** — confirming no non-canonical footer remains anywhere outside archived/hidden frames (none of the 24 targets were archived/hidden to begin with, so this sweep result means the replacement is complete, not that anything was left alone under an exclusion).
- **Node IDs of all 24 new footers**: `6143:93`, `6143:170`, `6143:316`, `6143:392`, `6143:538`, `6143:614`, `6143:760`, `6143:836`, `6143:982`, `6143:1058`, `6143:1204`, `6143:1280`, `6143:1426`, `6143:1502`, `6143:1648`, `6143:1724`, `6143:1870`, `6143:1946`, `6143:2092`, `6143:2168`, `6143:2314`, `6143:2390`, `6143:2457`, `6143:2533`.

## Not touched

- The canonical footers themselves (`5213:6816`, `5543:7662`).
- Any "Footer Action" node.
- Any Admin Panel frame (none carried a footer).
- The pre-existing placeholder date bug ("32/10/2022") visible in the Sports Hub mobile screenshots — unrelated, out of scope.

## Decision Log

New entry **#209** added to Build Plan Section 9, recording this as a real design-consistency fix not tied to an existing numbered item.

Not merged — founder's call after review.
