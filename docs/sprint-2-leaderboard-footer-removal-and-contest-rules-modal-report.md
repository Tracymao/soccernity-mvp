# Sprint 2 — Leaderboard footer removal + Contest Rules modal

**Branch:** `sprint-2/leaderboard-footer-removal-and-contest-rules-modal`
**Agent:** figma-design-system · **Date:** 2026-09-06
**Scope:** Figma design only. No `apps/web` / `services/api` code touched. Scoped edit + 2
new modal-state frames — no new full-page screens.
**Figma file:** `Soccernity-MVP` (`weZWWqggy9j13eX8bhFgs6`), page `Soccernity` (`0:1`).

---

## Part 1 — Remove the site footer from Leaderboard

**Founder decision:** the Leaderboard should not carry the site footer, reversing its earlier
inclusion under Decision Log #209 (footer standardization) / #213 (`apps/web` FooterLayout).

### What was found live

The canonical footer clone (`Footer (cloned from Pass 1 5191:6735 — carries its
dedupe/LinkedIn/ghost-text fixes)`) was present on **22** frames, not just the 2 canonical
Leaderboard frames. Every parent frame is `VERTICAL` auto-layout with
`primaryAxisSizingMode = AUTO` (hug), so deleting the footer child lets the frame's own
height shrink automatically — no manual resize, no orphaned gap. Confirmed via a page-wide
reaction scan that **no prototype reaction targets any node inside any of the 20 removed
footer subtrees** (1,060 descendant nodes checked), so nothing broke.

### Removed (20 frames — every `Leaderboard —` prefixed frame)

| Frame | id | footer id | height before → after |
|---|---|---|---|
| Leaderboard Page Desktop | `5171:6633` | `6143:93` | 3456 → 3142 |
| Leaderboard — Mobile | `5540:7264` | `6143:170` | 2278 → 1860 |
| Leaderboard — Contest Tab · Weekly Fill — Vacant | `5524:7188` | `6143:316` | 1397 → 1083 |
| Leaderboard — Contest Tab · Live — Level 1 Final | `5524:7512` | `6143:1204` | 1871 → 1557 |
| Leaderboard — Contest Tab · Crowned | `5524:7836` | `6143:1426` | 1871 → 1557 |
| …· Weekly Fill — Vacant — Mobile | `5541:7304` | `6143:392` | 1744 → 1326 |
| …· Live — Level 1 Final — Mobile | `5541:7527` | `6143:1280` | 2334 → 1916 |
| …· Crowned — Mobile | `5541:7750` | `6143:1502` | 2332 → 1914 |
| Leaderboard — Empty State (Filtered) | `5542:7344` | `6143:1870` | 1275 → 961 |
| Leaderboard — Empty State (Filtered) — Mobile | `5542:7695` | `6143:1946` | 1607 → 1189 |
| …· Weekly Fill — Week 1 Winners In (3) | `5556:7426` | `6143:538` | 1393 → 1079 |
| …· Weeks 1–2 Winners In (6) | `5556:7529` | `6143:760` | 1579 → 1265 |
| …· Weeks 1–3 Winners In (9 · dynamic) | `5556:7632` | `6143:982` | 1765 → 1451 |
| …· Week 1 — Mobile | `5561:7483` | `6143:614` | 1811 → 1393 |
| …· Weeks 1–2 — Mobile | `5561:7608` | `6143:836` | 1985 → 1567 |
| …· Weeks 1–3 — Mobile | `5561:7733` | `6143:1058` | 2152 → 1734 |
| Leaderboard — Competition Tab · Prediction | `5564:7561` | `6143:2092` | 1843 → 1529 |
| Leaderboard — Competition Tab · Commentary | `5564:7832` | `6143:2314` | 1843 → 1529 |
| …· Prediction — Mobile | `5565:7623` | `6143:2168` | 2508 → 2090 |
| …· Commentary — Mobile | `5565:7864` | `6143:2390` | 2513 → 2095 |

In every case the frame's new last child is `Leaderboard Body`, and the frame height now
equals the body's bottom edge — zero trailing gap. `Table Footer — Pagination`
(`5174:6734` / `5540:7480`) was **not** touched — despite the name collision it is the
table's own pagination row, not the site footer (the same "Footer Action" vs. real site
`Footer` distinction this project has drawn before).

Verified by screenshot: Leaderboard Page Desktop, Leaderboard — Mobile, Contest Tab ·
Crowned (desktop), Empty State (Filtered) — Mobile — all end cleanly at the body's bottom
with no footer and no orphaned band. (Desktop `5171:6633` keeps its
`ANNOTATIONS — design documentation, not shipped UI` frame, which now sits directly below
the body where the footer used to be — that frame is documentation, not shipped UI, and
was left as-is.)

### FLAGGED — not removed (2 frames)

`Contest — Weekly Results (Top 3)` (`5528:7260`, footer `6143:1648`) and its mobile
counterpart (`5545:7394`, footer `6143:1724`) carry the **byte-identical** footer clone,
added by the same Decision Log #209 sweep. They were **left in place** because they are
`Contest —` prefixed, Contest-section frames — not `Leaderboard —` frames — and the
founder decision as stated is scoped to "Leaderboard". Every *other* Contest-section frame
(Contest Details, Entries & Ranking, Voting, Already Voted, Between Weeks — desktop and
mobile) is already footer-free, so these two are the lone Contest-section outliers.
Recommendation: founder to confirm whether the reversal should extend to these two so the
whole Contest section stays consistent — a one-line follow-up either way. Recorded as part
of Decision Log #227.

### `apps/web` consequence — flagged, out of scope here

Decision Log #213 put `LeaderboardPage.tsx` under the `FooterLayout` route specifically
*because its canonical Figma frame carried the footer*. That is now false. A
`figma-to-code` follow-up must move `LeaderboardPage` out of `FooterLayout` to a direct
`AppShell` child (same treatment Community / Clubs / Banter already have) so the shipped
Leaderboard page stops rendering `<Footer/>`. Not done here — this PR is Figma-only.

---

## Part 2 — "Contest rules ›" link + rules modal

### The chevron link

Added a `Contest rules ›` text link matching the existing chevron-link convention already
used on these frames (`View leaderboard ›`, mobile node `5801:8666` — Inter Semi Bold 13,
fill bound to `brand/navy` `5096:4`):

- **Contest — Details — Mobile** (`5801:8635`) — new node `6245:14768`, inserted into the
  `Content` column directly **after** `View leaderboard ›`, `FILL` width, Inter Semi Bold
  13, `brand/navy`. Frame auto-reflowed 586 → 618.
- **Contest - contest details page** (desktop, `2155:1062`) — new node `6245:14767`. The
  desktop content column (`Frame 358`, `2220:1206`) has **no** `View leaderboard ›` link to
  sit beside (a pre-existing desktop/mobile inconsistency — flagged, not fixed). Placed as
  an `ABSOLUTE` child of `Frame 358`, left-aligned to the text column (`x = 0`), just below
  the `ABSOLUTE`-positioned `Join Contest` button — Montserrat SemiBold 16 (matching the
  desktop screen's type family), `brand/navy`.

### The modal — 2 new frames

Built as full-frame scrim+dialog compositions, matching the file's existing modal
convention (`Contest - Delete Task`, `Settings - Delete Role`): a clone of the Contest
Details screen behind a dimmed scrim, with the dialog centred on top.

| Frame | id | position |
|---|---|---|
| `Contest — Rules — Modal — Desktop` | `6241:14657` | `27044, 11300` (1440×1184) |
| `Contest — Rules — Modal — Mobile` | `6241:14677` | `28700, 11300` (390×618) |

Each dialog (`Rules Dialog`) contains:
- **Header** — `Contest rules` title + a `Close` control (`×` glyph, `color/text/primary`).
- **Divider** — 1px, `color/icon/inactive`.
- **Body (scrollable)** — `clipsContent: true`, `overflowDirection: VERTICAL`, fixed
  height (desktop 236 / mobile 196). Contains one clearly-labelled placeholder block:
  - a dashed-border (`brand/navy`, 1.5px, `[6,4]` dash) frame on `brand/green-tint` (12%),
    styled distinctly so it can't be mistaken for real content (the lesson from Decision
    Log #203's Lorem ipsum):
    > **[PLACEHOLDER — founder to supply final Contest Rules copy before this ships]**
    > This modal is a structural shell only. The Contest Rules copy is written and owned by
    > the founder directly — there is no legal-counsel review track for this content
    > (unlike the Terms of Service / Privacy Policy).
  - a caption noting the body scrolls when the real copy exceeds the modal height.

**Scrim:** two stacked `color/icon/inactive` fills (navy @ 15% each → ~28% effective) —
the nav-drawer-established pattern, since a single variable-bound navy paint at a fractional
`opacity` renders solid (the documented "bound paint takes its alpha from the variable"
gotcha). No new colour, no `brand/green-tint-28`.

**Effect:** `Rules Dialog` uses the existing `elevation/menu` effect style
(`color/shadow/elevated`, Decision Log #118).

### Prototype wiring

| From | Trigger → Action | To |
|---|---|---|
| desktop `Contest rules ›` (`6245:14767`) | ON_CLICK → NAVIGATE (dissolve 0.2s) | `Contest — Rules — Modal — Desktop` |
| mobile `Contest rules ›` (`6245:14768`) | ON_CLICK → NAVIGATE | `Contest — Rules — Modal — Mobile` |
| desktop modal `Close` (`6242:14771`) + `Scrim` (`6242:14767`) | ON_CLICK → NAVIGATE | `Contest - contest details page` (`2155:1062`) |
| mobile modal `Close` (`6244:14771`) + `Scrim` (`6244:14767`) | ON_CLICK → NAVIGATE | `Contest — Details — Mobile` (`5801:8635`) |

The chevron link was also added into each modal clone's *dimmed backdrop* so the modal's
context matches the live Contest Details screen exactly.

### Paint audit

All authored nodes (both modal dialogs + both chevron links): **0 unbound, 0 off-palette,
0 `brand/green-tint-28`, 0 new colours.** Light mode only. The modal clones' backdrops
carry the same pre-existing decorative image / soccer-ball paints as the source Contest
Details frames (not authored here, unchanged).

---

## Verification

- **Part 1:** screenshot-verified Leaderboard Page Desktop, Leaderboard — Mobile,
  Contest Tab · Crowned, Empty State (Filtered) — Mobile — all footer-free, body ends
  flush, no orphaned gap. All 20 frame heights confirmed to equal `Leaderboard Body`'s
  bottom edge.
- **Part 2:** screenshot-verified the `Contest rules ›` link renders on both Contest
  Details frames, and both modals render with the scrim, centred dialog, title, `×` close,
  divider, scroll caption, and the dashed placeholder block clearly visible.

## Decision Log

New entry **#227** (Build Plan Section 9, Table 6) covering both parts. Forward-pointers
appended to **#209** and **#213**'s Status cells.

## Not merged — founder's call after review.
