# Sprint 2 — Desktop icon nav + header-width fix report

**Branch:** `sprint-2/desktop-icon-nav-and-header-fix` (from `origin/main`)
**Agent:** figma-design-system
**Date:** 2026-09-02
**Figma file:** `Soccernity-MVP` (`weZWWqggy9j13eX8bhFgs6`), page `Soccernity` (`0:1`)

Three founder-directed corrections. **`apps/web` was NOT touched** — Figma
only, same as PR #144 / #145.

---

## Finding 1 — 11 text-label nav screens → icon nav ✅ as directed

**`Header/header 5` (`2839:3583`)** — a text-label desktop nav (LIVE SCORE
/ NEWS / LEADERBOARD / BANTER / COMMUNITY) — had exactly **11 live
instances**, all on Leaderboard/Contest-family screens (all logged-in-only
contexts per Decision Log #129).

**Done:** every one of the 11 instances was **`swapComponent`'d to
`header 4` (`2838:3502`)** — the logged-in icon navbar — preserving each
screen's position. Each swapped instance is now `header 4`, **1440 × 90,
`layoutSizingHorizontal: FILL`** (all 11 host frames are VERTICAL
auto-layout, so the navbar fills the 1440 screen and the +14px height
change [76 → 90] is absorbed cleanly by the stack). Instances renamed
`Navbar — header 4`.

| Screen | Instance | Verified |
|---|---|---|
| Leaderboard Page Desktop (`5171:6633`) | `5171:6634` | ✅ screenshot |
| Leaderboard — Contest Tab · Weekly Fill — Vacant (`5524:7188`) | `5524:7189` | ✅ |
| Leaderboard — Contest Tab · 2 Live — Level 1 Final (`5524:7512`) | `5524:7513` | ✅ |
| Leaderboard — Contest Tab · 3 Crowned (`5524:7836`) | `5524:7837` | ✅ |
| Contest — Weekly Results (Top 3) (`5528:7260`) | `5528:7261` | ✅ |
| Leaderboard — Empty State (Filtered) (`5542:7344`) | `5542:7345` | ✅ screenshot |
| Contest Tab · Weekly Fill — Week 1 Winners In (`5556:7426`) | `5556:7427` | ✅ |
| Contest Tab · Weekly Fill — Weeks 1–2 (`5556:7529`) | `5556:7530` | ✅ |
| Contest Tab · Weekly Fill — Weeks 1–3 (`5556:7632`) | `5556:7633` | ✅ |
| Leaderboard — Competition Tab · Prediction (`5564:7561`) | `5564:7562` | ✅ screenshot |
| Leaderboard — Competition Tab · Commentary (`5564:7832`) | `5564:7833` | ✅ |

**`Header/header 5` confirmed at 0 live instances** and **archived**
(renamed `ARCHIVED — Header/header 5 (text-label desktop nav — superseded
by header 4 icon nav, sprint-2/desktop-icon-nav-and-header-fix)` +
description, not deleted, per this file's convention).

---

## Finding 2 — header 4 width bug: the premise was inverted

**Finding 2 as briefed:** header 4's master "correctly" grew from 1440 →
1474 when PR #144 added the Clubs icon; 7 instances are "stale 1440
overrides" that need resizing to 1474.

**What direct investigation actually found:**

1. **The 1474 was PR #144's accident, not a correction.** header 4's
   master has a **`FIXED` width**; PR #144's deeply-nested `appendChild`
   of the Clubs icon triggered a re-layout that bumped the FIXED width to
   1474 — with ~13px of dead whitespace on the right. header 4 fits
   **cleanly at 1440** (verified directly: at 1440 the avatar's right
   edge lands at 1420, exactly the 20px right padding).

2. **1474 was actively breaking 42 screens.** A 1474 navbar sits inside a
   1440-wide, `clipsContent: true` screen frame → the right ~34px is
   clipped → **the account avatar was ~2/3 clipped on all 42 screens
   that use `header 4` at the master width** (Settings ×~18, Banter,
   Contest, Community-feed variants, Search, Create-a-post, etc.).
   Confirmed by screenshot on `Settings — Overview` (`2905:4798`) — a
   sliver of avatar at the frame edge.

3. **The "7 stale overrides" weren't overrides at all.** 6 of the 7
   (Notification Centre ×2, Message pillar ×4) are
   `layoutSizingHorizontal: FILL` inside 1440 screens — they were 1440
   because they *correctly fill their container*, not because of a pinned
   override. The 7th (`5379:6551`, Create Profile) was 1474, overhanging
   its 1440 frame.

**The fix — one master change, no screen surgery:**

- **`header 4` master resized 1474 → 1440.** All 42 previously-1474
  instances (which tracked the master, no real overrides) followed
  automatically to 1440. Zero instances remain at 1474.
- **`header 4` master auto-layout changed `CENTER` → `SPACE_BETWEEN`**
  (and the stale `itemSpacing: 419` cleared) so the logo/search/nav block
  pins left at the 20px padding and the messages+avatar cluster pins
  right at the 20px padding — properly inset within 1440 regardless of
  instance width.
- **Verified:** `Settings — Overview` and `Message — Conversation` now
  show the **full avatar**, un-clipped. All 59 `header 4` instances
  (48 original + 11 swapped) are now **1440** — 42 `FIXED`, 17 `FILL`,
  **0 at 1474**.

**The 11 Finding-1 screens land at 1440 from the start** — because the
master is 1440, the swap can't reintroduce the bug.

`header 7` was **not touched** (already 1440, unaffected — confirmed).

Flagged as **Decision Log #164** — a real divergence from Finding 2's
literal instruction, with the reasoning above. If the founder does want
1474 everywhere, the master width + `SPACE_BETWEEN` change are each one
property and trivially reversible, but that path also requires widening
~50 screen frames.

---

## Finding 3 — Blog/News item added to the mobile Navigation Drawer

**Decision Log #163** flagged that `Navigation Drawer — Mobile`
(`5870:10689`) had no equivalent of the desktop nav's "blog" pillar.

**Done:** a **`Nav — Blog`** item (`5898:2`) was cloned from `Nav —
Sports Hub` — identical structure: 6px `Marker` ellipse bound to
`color/icon/inactive`, "Blog" text (Montserrat Medium 14) bound to
`color/text/primary`, 228 × 44 row, `cornerRadius: 8`.

**Label — "Blog", not "News":** the drawer's items use **display /
section names, not route names** ("Sports Hub" not `sports-hub`, "Bants"
not `banter`). Within that convention, this project's **Figma section
vocabulary** consistently calls this pillar **"Blog"** — the `blog` nav
icon, the `Blog Page Desktop` frame, the "Blog" section banner —
whereas `apps/web`'s `navigation.ts` (code) calls it **"News"** (route
`/news`). "Blog" is the choice most consistent with the drawer's own
siblings. **The Blog-vs-News inconsistency is flagged as Decision Log
#165**, not silently resolved — same treatment #163 gave Bants-vs-banter.

**Position:** after `Nav — Sports Hub`, mirroring the desktop icon nav's
Sports-Hub → Blog adjacency and keeping content-consumption pillars
together. Final drawer order:

Home · Community · Sports Hub · **Blog** · Bants · Leaderboard · Clubs ·
Messages · Notifications · Profile · Settings — Log out.

---

## Standing rules — verification

- **Palette:** `brand/navy` / `brand/green` / `brand/green-tint` 12% /
  `color/background/surface` / `color/text/primary` / `color/icon/inactive`
  only. **No `brand/green-tint-28`. No new colours.**
- **Light mode only.**
- **0 unbound / 0 off-palette / 0 `green-tint-28` paints** — audited
  node-by-node across the `header 4` master subtree, the
  `Navigation Drawer — Mobile` component, and the new `Nav — Blog` item.
  The `header 4` change was a resize + auto-layout property change only
  (no fills touched); the swaps and the drawer item inherit already-bound
  styles.
- **Reuse:** the 11 swaps use the existing `header 4` component; the
  drawer item is cloned from an existing drawer item.

---

## `apps/web` was NOT touched

Confirmed — this PR changes only Figma (via the plugin API), this report,
`CLAUDE.md`, and the Build Plan Decision Log. The code conversion
(replacing `Header.tsx` / `navigation.ts` with the icon navbar, wiring
the drawer, runtime auth-state switching, and reconciling the Blog/News
label) is Phase 2 — a separate `figma-to-code` follow-up (Decision Log
#161).

---

## Deliverables checklist

- [x] All 11 `header 5` screens converted to `header 4`, at 1440px
- [x] `header 4` width bug fixed file-wide (the 7 named + ~35 more) —
      master normalized to 1440, all 59 instances now 1440, 0 at 1474;
      clipped-avatar bug fixed on 42 screens; visual spot-checks clean
- [x] `Nav — Blog` added to `Navigation Drawer — Mobile`; Blog-vs-News
      inconsistency flagged (Decision Log #165)
- [x] `Header/header 5` confirmed at 0 instances and archived (renamed)
- [x] This report
- [x] CLAUDE.md updated in the same PR (new dated bullet)
- [x] Build Plan Decision Log — new rows #164 (header-width fix / Finding
      2 premise inversion) and #165 (Blog-vs-News naming); forward-pointer
      on #163
- [x] Branch from `origin/main` → commit → push → open PR against
      `main`, **do not merge**
