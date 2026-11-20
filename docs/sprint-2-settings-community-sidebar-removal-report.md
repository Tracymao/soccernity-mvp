# Sprint 2 — Settings: Community sidebar removal — PR 5 of 6

**Agent:** figma-design-system
**Date:** 2026-09-07
**Scope:** Executes **founder decision #4 only** (Settings-family consolidation, Decision Log #230) — remove the Community-style left sidebar from every surviving Settings frame — plus the **coupled mobile inline-hub-list strip** from the 2 mobile frames that still carried it, plus the **optional D9/D15 arrow-back fix**.
**Figma design only** — no app code, no backend code, no merge.
**Branch (not yet created — see §7):** `sprint-2/settings-community-sidebar-removal` off `main` (finaliser stacks it on the Phase A + PR 4 branches).

Figma desktop app reconfirmed on **"Soccernity-MVP" page `0:1`** before any write (`figma.root.children` = the 3 documented pages).

---

## 1. Summary tables

### 1a. Community sidebar removed — 18 live desktop Settings frames

The sidebar was **36 loose absolute-positioned children** per frame (identical name-set across all 18 hand-copies), not a container: `Rectangle 111`, `Rectangle 124`, `08/08/2022` ×3, `bx:time` ×3, `Rectangle 120`, `Ellipse 33` (the avatar), `Adeniyi Christiana`, `@christine001`, `Line 43`–`Line 47`, `Fine Girl, Hard Arsenal Stan!`, `Group 259`–`263`/`260`, `View profile`, `Trending News`, `ci:refresh`, `Intersect` ×3, `Kane joins 250 club…` ×3, `Harry Kane scored his 250th goal…` ×3, `Group 293`.

Deletion driven by name-set match, **guarded per frame**: proceed only if `childCount === 43` AND exactly `36` matched AND exactly `1` non-keeper FRAME (the content panel) remains. Every frame passed. Frames are absolute-layout → deletion leaves empty space, **no reflow**. The 7 keepers: `ph:soccer-ball-fill` ×2 (the deliberately-hidden decorative watermark layer, per CLAUDE.md), `Web app Navbar` instance, `Frame 5910` (nav rail), the content panel FRAME, `Line 106` + `Line 107` (the two canonical column dividers). **Nav rail kept at `x 344`, content panel at `x 688`** — no re-balance (PR 6).

| # | Frame (post-PR-4 name) | Node | Before → After children | Sidebar nodes removed | Post-removal text-sweep | Screenshot |
|---|---|---|---|---|---|---|
| D1 | Settings — Account | `2905:4798` | 43 → 7 | 36 | **0 hits** | ✅ verified |
| D2 | Settings — Account Info (Confirm Password) | `2922:6396` | 43 → 7 | 36 | **0 hits** | — |
| D3 | Settings — Account Information (Edit) | `2924:7112` | 43 → 7 | 36 | **0 hits** | — |
| D4 | Settings — Change Password | `2924:6870` | 43 → 7 | 36 | **0 hits** | — |
| D5 | Settings — Deactivate Account (Intro) | `2924:7358` | 43 → 7 | 36 | **0 hits** | — |
| D6 | Settings — Deactivate Account (Confirm) | `6213:15640` | 43 → 7 | 36 | **0 hits** | — |
| D7 | Settings — Delete Account (Confirm) | `6225:14789` | 43 → 7 | 36 | **0 hits** | — |
| D9 | Settings — Security & Account Settings | `2926:8056` | 43 → 7 | 36 | **0 hits** | ✅ verified |
| D10 | Settings — Two-Factor Auth (SMS) | `2926:8294` | 43 → 7 | 36 | **0 hits** | — |
| D11 | Settings — Privacy | `6178:14437` | 43 → 7 | 36 | **0 hits** | ✅ verified |
| D12 | Settings — Direct Messages & Read Receipts | `2926:8764` | 43 → 7 | 36 | **0 hits** | — |
| D13 | Settings — Your Posts (Sensitive Media) | `2926:8996` | 43 → 7 | 36 | **0 hits** | — |
| D15 | Settings — Notification Preferences | `2926:9721` | 43 → 7 | 36 | **0 hits** | ✅ verified |
| D16 | Settings — Filters | `2926:9230` | 43 → 7 | 36 | **0 hits** | — |
| D17 | Settings — Push Notifications | `2927:9954` | 43 → 7 | 36 | **0 hits** | — |
| D18 | Settings — Email Notifications | `2927:10205` | 43 → 7 | 36 | **0 hits** | — |
| D19 | Settings — Muted accounts | `2926:9482` | 43 → 7 | 36 | **0 hits** | — |
| D20 | Settings — Display, Language & Region | `2922:5832` | 43 → 7 | 36 | **0 hits** | ✅ verified |

**Total: 18 frames, 648 sidebar nodes deleted, 0 sweep hits anywhere** (regex: `@christine001|Adeniyi|Trending News|Suggested|Followers|Following|View profile|Arsenal Stan|Port Harcourt|Kane joins|Harry Kane`).

### 1b. Mobile — checked, **0 Community sidebars found**

All 18 live mobile Settings section frames (`5607:7813`, `5695:8213`, `5649:8176`, `5695:8234`, `5695:8262`, `6213:15617`, `6225:15024`, `5695:8279`, `5696:8213`, `6185:14547`, `5696:8241`, `5696:8261`, `5696:8340`, `5696:8281`, `5696:8364`, `5696:8384`, `5696:8307`, `5649:8140`) have `childCount === 2` (Top Bar + Content) and **0 sidebar-content text hits**. The Community sidebar was a desktop-only problem — stated explicitly rather than assumed.

### 1c. Excluded frames — verified sidebar-free, left untouched

| Frame | Node | Sidebar content | Action |
|---|---|---|---|
| Settings — Overview (PR 2 desktop landing) | `6295:15068` | **"Adeniyi Christiana" only** — the deliberate PR 2 "Signed In As" identity-row sample (`displayName`, a real `User` column; PR 2 §2/§7.4). **No** Trending News / Suggested / follower counts / bio / location / "View profile". **Not** the Community sidebar. | Left untouched (excluded by brief) |
| Settings — Overview — Mobile (PR 2 mobile landing) | `6297:15173` | Same — "Adeniyi Christiana" only, the identity snapshot | Left untouched |
| Settings — Accessibility / Display / Language / Data Usage (PR 3 desktop leaves) | `6304:15181` / `6304:15329` / `6304:15471` / `6304:15615` | **0 hits** | Left untouched |
| Settings — Menu — Mobile (PR 1) | `6289:15068` | **0 hits** | Left untouched |
| Settings — Accessibility / Display / Language / Data Usage — Mobile (PR 3) | `6303:15173` / `6303:15221` / `6303:15262` / `6303:15307` | **0 hits** | Left untouched |
| Archived: D8/M8/D14/M14 + pre-archived Privacy & Safety | `2922:5143` / `5649:8074` / `2922:5602` / `5649:8116` / `2922:5382` / `5649:8092` | — | Not processed (archived) |

### 1d. Task 2 — inline 5-row hub list stripped from the 2 mobile frames that still carried it

`Settings — Account — Mobile` (`5607:7813`) and `Settings — Privacy — Mobile` (`6185:14547`) each bolted the full 5-row `Category Nav` list on top of their section content (audit §2, M1/M11). Now that `Settings — Menu — Mobile` (`6289:15068`, PR 1) serves that navigation:

| Frame | Removed | Also removed | Added | Content children after |
|---|---|---|---|---|
| `5607:7813` Settings — Account — Mobile | `Category Nav` `5607:7820` (5-row hub list — **disposes of the invisible white-bound `Category Nav` chevron bug** on this frame) | standalone `Settings` title `5607:7819` (redundant — the `Account Section` carries its own "Account" heading) | `Back to Settings` bar (`‹` + "Settings", cloned from `5695:8285`), inserted first in `Content`, `FILL` width, wired `ON_CLICK → NAVIGATE → 6289:15068` | `[Back to Settings, Account Section]` |
| `6185:14547` Settings — Privacy — Mobile | `Category Nav` `6185:14554` (+ same chevron bug) | standalone `Settings` title `6185:14553` (`Privacy Section` carries its own "Privacy" heading) | `Back to Settings` bar, same as above, wired → `6289:15068` | `[Back to Settings, Privacy Section]` |

Both frames now match the `‹ Settings` back-bar + section-content convention every other mobile section frame uses. **Judgment call, disclosed:** the file's existing `Back to Settings` bars carry **no reaction** (checked M9 `5695:8285` and M10 — both `[]`); the two added here are wired to `6289:15068` (the correct parent), a small, strictly-better divergence, matching what PR 3 did for its Display-leaf mobile back bars.

### 1e. Task 3 — D9 / D15 action-less arrow-backs wired to the desktop Settings landing

PR 4 left these two `arrow-back` nodes with no reaction (their old self-referential targets to the archived twins were removed). Both now point at the desktop Settings landing:

| Frame | arrow-back node | New reaction |
|---|---|---|
| `2926:8056` Settings — Security & Account Settings | `2926:8162` | `ON_CLICK → NAVIGATE → 6295:15068` (Settings — Overview) |
| `2926:9721` Settings — Notification Preferences | `2926:9827` | `ON_CLICK → NAVIGATE → 6295:15068` |

Clean, so done rather than deferred.

---

## 2. Verification

- **All 18 desktop frames re-read from fresh handles after removal:** `childCount === 7` on every one; **0 sidebar text hits** on every one.
- **Geometry unchanged (sampled D1 / D11 / D15):** nav rail `x 344`, content panel `x 688` — no re-balancing, no shift. Deletion of absolute-positioned nodes cannot create overlaps; `0` overlaps.
- **Screenshots** — D1 (Account), D9 (Security), D11 (Privacy), D15 (Notifications), D20 (Display): all render as nav rail + content panel with an empty left band where the sidebar was; navbar, both column dividers, and content intact; no clipping/collision. M1 + M11: `‹ Settings` back bar → section heading → rows, no hub list.
- **No authored paint** — every change is a deletion or a clone of an already-bound node (`Back to Settings` from the clean `5695:8285`). 0 unbound / 0 off-palette / 0 `brand/green-tint-28` / 0 new colours introduced.
- No clash with the parked Admin Shell zone.

---

## 3. What this PR did NOT touch (per brief)

- **Shell componentization** — PR 6. The 18 desktop frames are still independent 7-child FRAME copies.
- **Nav-rail label text** ("Security and account access" / "Notifications" / "Display, languages and region") and the Phase-A instance-override labels on PR 2/PR 3 frames — PR 6, at the `Frame 5904` (`2906:7170`) component level.
- **Section banner width** — PR 6.
- **Layout re-balance / left-gutter reclaim** — PR 6. The empty `x 0–344` band is the intended interim state (matches what PR 2's landing and PR 3's leaves already look like).
- **Display-merge question** — unresolved; Display stays a 4th leaf.
- **The two `ph:soccer-ball-fill` decorative watermark frames** — kept (deliberately-hidden decorative layer, not sidebar).
- App / backend code — untouched.

---

## 4. Flagged, not fixed

1. **PR 2's landings (`6295:15068` / `6297:15173`) contain the sample name "Adeniyi Christiana"** — the intentional identity row PR 2 built (`displayName` is a real backed field), *not* the Community sidebar. PR 2's own report claimed "zero hits" for `@christine001`/`Adeniyi`; the `Adeniyi` term does in fact match its identity-row sample. Noted so a future scan doesn't treat it as a regression. Left untouched (excluded by brief; it is not sidebar content).
2. **Empty left band on all 18 desktop frames** — intended; PR 6 re-balances all frames at once when it componentizes.
3. **`Settings — Account — Mobile` section subtitle still reads "See information about your account"** (flagged template junk) — pre-existing, out of scope for this PR (text-hygiene / PR 6).
4. **D9/D15 desktop headings still "Security" / "Preferences"** and the ~24 frames' rail *labels* still stale — carried over from PR 4, still PR 6.

---

## 5. Draft Decision Log entry — #248

> **#248 — The Community-style left sidebar is removed from every surviving Settings frame; the inline hub list is stripped from the last 2 mobile frames carrying it.**
> `sprint-2/settings-community-sidebar-removal`, 2026-09-07. Executes **founder decision #4** of the Settings-family consolidation set (Decision Log #230). **PR 5 of 6.**
> **Desktop:** the Community sidebar (profile card "Adeniyi Christiana / @christine001" + follower/following/post counts + "View profile", "Trending News", "Suggested" follows) — **36 loose absolute-positioned children per frame**, rendering on every desktop Settings screen (audit §4) — was **deleted from all 18 live desktop Settings frames** (D1–D7, D9–D13, D15–D20, post-PR-4 names). 648 nodes total. Each frame went 43 → 7 children (kept: navbar instance, `Frame 5910` nav rail, content panel, `Line 106`/`Line 107` dividers, 2 `ph:soccer-ball-fill` decorative watermarks). Deletion was **guarded per frame** (require `childCount 43`, exactly 36 name-matched, exactly 1 leftover content-panel FRAME) — all 18 passed. **Post-removal text-sweep: 0 hits on every frame.** Nav rail kept at `x 344`, content panel at `x 688` — **no layout re-balance** (PR 6's call, applied to all frames at once when it componentizes).
> **Excluded and verified sidebar-free, left untouched:** PR 2's `Settings — Overview` desktop (`6295:15068`) + mobile (`6297:15173`) landings — these carry the sample name "Adeniyi Christiana" only, PR 2's deliberate `displayName` identity-row (not the sidebar; no counts/bio/Trending/Suggested/View-profile); PR 3's 4 Display desktop leaves; PR 1/PR 3's 6 Phase-A mobile frames.
> **Mobile:** checked all 18 live mobile Settings section frames — **0 Community sidebars found** (all `childCount 2`); the sidebar was a desktop-only problem, stated rather than assumed.
> **Coupled mobile inline-hub-list strip (audit §2, M1/M11):** `Settings — Account — Mobile` (`5607:7813`) and `Settings — Privacy — Mobile` (`6185:14547`) each bolted the full 5-row `Category Nav` list on top of their section content. Both had `Category Nav` **removed** (this also **disposes of the invisible white-bound `Category Nav` chevron bug** on those 2 frames), the now-redundant standalone "Settings" title removed (each section carries its own heading), and a wired `‹ Settings` back bar added (`ON_CLICK → NAVIGATE → 6289:15068`, the PR 1 mobile menu hub) — matching the convention every other mobile section frame uses. Now that `Settings — Menu — Mobile` (PR 1) serves that navigation, the inline list was pure duplication.
> **D9/D15 arrow-backs (PR 4 left them action-less):** `Settings — Security & Account Settings` (`2926:8162`) and `Settings — Notification Preferences` (`2926:9827`) `arrow-back` nodes wired `ON_CLICK → NAVIGATE → 6295:15068` (the desktop Settings landing).
> **Audit:** 0 authored paint (all changes are deletions or clones of already-bound nodes), 0 unbound / 0 off-palette / 0 `brand/green-tint-28` / 0 new colours, 0 overlaps, no Admin-zone clash. Screenshot-verified D1/D9/D11/D15/D20 + M1/M11.
> **Flagged, not fixed:** the empty left band on all 18 desktop frames (intended interim state, PR 6 re-balances); PR 2's landings' identity-row sample name (not a regression); `Settings — Account — Mobile`'s "See information about your account" subtitle junk (pre-existing); rail labels + headings still stale (PR 6).
> Full detail: `docs/sprint-2-settings-community-sidebar-removal-report.md`. **Decision Log #230 stays Open** — after this PR **only the structural #11 (componentize the shell) remains, i.e. PR 6**.

---

## 6. Draft CLAUDE.md status bullet

> - **`sprint-2/settings-community-sidebar-removal` (figma-design-system,
>   2026-09-07) is PR 5 of 6 in the Settings-family consolidation (Decision Log
>   #230) and executes founder decision #4 — remove the Community-style left
>   sidebar from every surviving Settings frame — plus the coupled mobile
>   inline-hub-list strip and the D9/D15 arrow-back fix. Figma design only, no
>   app/backend code.** Report:
>   `docs/sprint-2-settings-community-sidebar-removal-report.md`. Decision Log
>   **#248** added; forward-pointer on **#230**, which **stays Open** — after this
>   PR **only structural #11 (componentize the shell), i.e. PR 6, remains**.
>   - **Community sidebar deleted from all 18 live desktop Settings frames**
>     (D1–D7, D9–D13, D15–D20, post-PR-4 names) — the profile card ("Adeniyi
>     Christiana / @christine001", follower/following/post counts, "View
>     profile"), "Trending News" and "Suggested" follows, which were **36 loose
>     absolute-positioned children per frame** (not a container). **648 nodes
>     total**; each frame 43 → 7 children; **guarded per frame** (require
>     `childCount 43` / exactly 36 name-matched / exactly 1 leftover content
>     panel) — all 18 passed; **post-removal text-sweep 0 hits on every frame**.
>     Nav rail kept at `x 344`, content panel at `x 688` — **no re-balance** (PR
>     6).
>   - **Mobile: checked all 18 live mobile section frames — 0 Community sidebars**
>     (all `childCount 2`); desktop-only problem, stated not assumed.
>   - **Excluded and verified sidebar-free, untouched:** PR 2's `Settings —
>     Overview` desktop (`6295:15068`) + mobile (`6297:15173`) landings — they
>     carry the sample name "Adeniyi Christiana" only (PR 2's deliberate
>     `displayName` identity row, **not** the sidebar — no counts/bio/Trending/
>     Suggested/View-profile); PR 3's 4 Display desktop leaves; PR 1/PR 3's 6
>     Phase-A mobile frames.
>   - **Coupled: inline 5-row `Category Nav` hub list stripped from
>     `Settings — Account — Mobile` (`5607:7813`) and `Settings — Privacy —
>     Mobile` (`6185:14547`)** (audit §2 M1/M11) — plus their now-redundant
>     standalone "Settings" title; a wired `‹ Settings` back bar added
>     (`→ 6289:15068`, PR 1's mobile menu hub) matching every other mobile
>     section frame. **This also disposes of the invisible white-bound
>     `Category Nav` chevron bug on those 2 frames** (list is gone).
>   - **D9/D15 arrow-backs (PR 4 left them action-less)** wired
>     `ON_CLICK → NAVIGATE → 6295:15068` (desktop Settings landing).
>   - **Audit:** 0 authored paint (deletions + clones of already-bound nodes),
>     0 unbound / 0 off-palette / 0 `brand/green-tint-28` / 0 new colours, 0
>     overlaps. Screenshot-verified D1/D9/D11/D15/D20 + M1/M11.
>   - **Flagged, not fixed:** empty left band on all 18 desktop frames (intended
>     interim state — PR 6 re-balances all at once); PR 2's landings' identity-row
>     sample name matched the sweep regex but is not a regression; `Settings —
>     Account — Mobile`'s "See information about your account" subtitle junk
>     (pre-existing); rail labels + D9/D15/D15-hub headings still stale (PR 6).
>   - Figma writes by the agent (no shell that session); branch, commit, docx
>     Decision Log transcription (#248) and PR finalised in a follow-up session —
>     same pattern as PRs 1–4 of this set.

---

## 7. No shell in this session

No Bash/shell tool. To be finalised in a follow-up session:

- create branch `sprint-2/settings-community-sidebar-removal` off `main` (finaliser stacks it on the Phase A + PR 4 branches)
- commit this report
- transcribe §5 into the Build Plan's live docx (Section 9) as **#248**, append a forward-pointer to **#230**'s Status cell (**#230 stays Open** — only PR 6 / structural #11 remains)
- open the PR

---

## 8. Nodes touched

**Deleted (650):** 648 sidebar nodes across the 18 desktop frames (36 each); `Category Nav` `5607:7820`; `Category Nav` `6185:14554`. Plus the standalone `Settings` titles `5607:7819` / `6185:14553` (2). *(652 total deletions.)*
**Created (2):** `Back to Settings` bar clones inserted into `5607:7818` (M1 Content) and `6185:14552` (M11 Content).
**Reactions set (4):** the 2 new back bars → `6289:15068`; `2926:8162` (D9 arrow-back) → `6295:15068`; `2926:9827` (D15 arrow-back) → `6295:15068`.
