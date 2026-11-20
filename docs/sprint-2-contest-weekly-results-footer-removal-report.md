# Sprint 2 — Contest — Weekly Results footer removal

**Branch:** `sprint-2/contest-weekly-results-footer-removal`
**Agent:** figma-design-system · **Date:** 2026-09-06
**Scope:** Figma design only. No app/backend code.
**Closes:** the gap PR #187 (`sprint-2/leaderboard-footer-removal-and-contest-rules-modal`,
Decision Log #227) flagged and left for founder confirmation.

---

## Background

PR #187 removed the canonical site footer from all 20 `Leaderboard —` prefixed Figma frames
(founder decision, Decision Log #227). It deliberately left `Contest — Weekly Results (Top 3)`
desktop (`5528:7260`) and mobile (`5545:7394`) untouched — their names begin with `Contest —`
rather than `Leaderboard —`, so they fell outside that PR's name-based filter — and flagged
them for the founder to confirm whether the reversal extends to them.

**Founder decision:** it does. These two frames are a Leaderboard Contest-tab display state
(the "weekly results, top 3 go through to the Week 4 final" view — the same family as the
`Leaderboard — Contest Tab · …` frames already cleared), not part of the standalone Contest
details / task-management page family. Treat them the same as the rest of Leaderboard.

## What changed

Confirmed live first: both frames still carried the full canonical footer subtree —

| Frame | Footer node | Footer geometry | Parent frame before → after |
|---|---|---|---|
| `5528:7260` (desktop) | `6143:1648` | y=637, 1440×314 | 951 → **637** (navbar 90 + body 547) |
| `5545:7394` (mobile) | `6143:1724` | y=1234, 390×418 | 1652 → **1234** (navbar 64 + body 1170) |

Both footer instances were the exact clone PR #187 removed elsewhere: `Footer (cloned from
Pass 1 5191:6735 — carries its dedupe/LinkedIn/ghost-text fixes)`, 106 descendant nodes total
across the two.

Both parent frames are `VERTICAL` auto-layout with `primaryAxisSizingMode = AUTO` (hug), so
removing the footer child let each frame's height shrink automatically to end exactly where
the footer used to start — no manual resize, no orphaned gap. Screenshot-verified on both
frames (before/after): the desktop frame now ends immediately below the
`View all entries › / View leaderboard ›` row; the mobile frame ends immediately below the
`View leaderboard ›` button.

A page-wide reaction scan (all ~110k nodes on page `0:1`) confirmed **no prototype reaction**
targeted any node inside either removed footer subtree.

`Table Footer — Pagination` (`5174:6734` / `5540:7480`) was **not** touched — same as PR #187,
it is the table's own pagination row, a name collision only.

## Final sweep

Swept all 26 Leaderboard/Contest-family frames on page `0:1` (`Leaderboard —` prefixed,
`Contest — Weekly Results`, and `Contest Tab` variants): **0 still carry a site footer.**

A raw sweep for any node file-wide named like the deleted footer template found 26 remaining
instances — all on the legitimate "carries the site footer" page set (Home Page canonical,
Sports / Livescores, Blog Page, Blog — Article Detail, Contact Us / Terms of Service / Privacy
Policy) — none in the Leaderboard/Contest family. Correct; left untouched.

## No code change

`LeaderboardPage.tsx` was already moved out of `FooterLayout` to a direct `AppShell` child by
PR #188 (`sprint-2/fix-footer-placement-and-contest-rules-modal`, Decision Log #228), so the
shipped Leaderboard page already renders no `<Footer/>`. No route in `apps/web` corresponds to
this specific Contest-tab display state. `LeaderboardPage.css`'s `.lb-contest__footer` class
is an unrelated local caption-link style (the "View this week's contest ›" line), confirmed by
direct code read — not the shared site `Footer` component.

## Decision Log

New entry **#229** (Build Plan Section 9). Forward-pointer appended to **#227**'s Status cell
recording the flagged gap as closed.

## Not merged — founder's call after review.
