# Sprint 2 — Admin Competitions Nav, Success-Screen Clip Fix, Settings Club-Representation Entry Point

**Branch:** `sprint-2/admin-competitions-nav-settings-club-rep` (to be created — see §8)
**Date:** 2026-08-30
**Agent:** `figma-design-system`
**Figma file:** `weZWWqggy9j13eX8bhFgs6` ("Soccernity-MVP"), page "Soccernity" (`0:1`)
**Scope:** Figma design only. No application or backend code touched.
**Merge status:** Not merged — standing instruction for every design-stage PR.

Three scoped fixes:

1. Replicate the "Competitions" sidebar nav item across the 24 remaining Admin Panel screens.
2. Fix the clipped sidebar on Admin — Competition Created (Success).
3. Add a "Which club do I represent" entry point to the user-facing Settings screen, and build the missing mobile Settings — Overview screen to carry the same entry point.

---

## Tooling / process constraint (disclosed)

This session had **no shell / Bash tool** — the same constraint the PR #98 and
PR #102 design sessions hit. Consequently this pass delivers:

- All Figma work (done, verified live).
- This report file.
- The `CLAUDE.md` "Where things stand right now" status bullet (staged in the
  working tree).

It does **not** deliver: the git branch, commit, push, PR, or the `python-docx`
transcription of Decision Log #76–#79 into `Soccernity_MVP_Build_Plan_v1.7.docx`
Section 9. Those need a follow-up session with shell access. Decision Log text is
written out in full in §7 below so the transcription is mechanical.

> **Follow-up session update (2026-08-30):** completed. Branch
> `sprint-2/admin-competitions-nav-settings-club-rep` cut from `main`,
> Decision Log #76–#79 transcribed into Build Plan Section 9 table 6 with a
> forward-pointer appended to #73's Status, `CLAUDE.md` status bullet
> committed, PR #110 opened against `main` (not merged). §8 checklist below
> is done.

---

## 1. What shipped

### Task 1 — "Competitions" nav item on all 24 remaining Admin Panel screens

Each screen's sidebar (`Frame 5745` → `Frame 5744` nav group) gets one new
**inactive** `Nav — Competitions` row, cloned from that same screen's own
"Contest" row (`Frame 5742`), inserted at index 5 — directly **below Contest,
above Media** — matching the already-correct reference `5566:8141` inside
Admin — Create Competition (`5566:8033`).

Forced to the inactive token set on every screen (none of these *is* the
Competitions screen):

| Element | Bound variable | Name |
|---|---|---|
| Row background fill | `VariableID:5096:7` | `color/background/surface` |
| Icon (`u:chat-bubble-user`) vector(s) | `VariableID:5096:8` | `color/text/primary` |
| Label text ("Competitions", Montserrat Medium 20) | `VariableID:5096:8` | `color/text/primary` |

| # | Screen (parent frame) | Sidebar `Frame 5745` | New `Nav — Competitions` row |
|---|---|---|---|
| 1 | Contest - Contest Task tab (`2363:2244`) | `2363:2279` | `5587:7813` |
| 2 | Contest - scheduled contest task tab (`2363:3446`) | `2363:3484` | `5587:7817` |
| 3 | Dashboard (`110:5`) | `5400:6659` | `5587:7821` |
| 4 | Articles (`123:56`) | `5402:6659` | `5587:7825` |
| 5 | Articles - Create Post (`124:313`) | `5402:6723` | `5587:7829` |
| 6 | Categories (`128:488`) | `5402:6787` | `5587:7833` |
| 7 | Settings (`1658:2303`) | `5402:7235` | `5587:7837` |
| 8 | Settings - Edit role (`1658:2592`) | `5402:7363` | `5587:7841` |
| 9 | Settings - Add new role (`1658:2456`) | `5402:7299` | `5587:7845` |
| 10 | Users - team members (`917:218`) | `5402:7171` | `5587:8926` |
| 11 | Media (`361:553`) | `5402:6915` | `5587:8930` |
| 12 | Media - Media Upload - step 1 (`916:2362`) | `5402:6979` | `5587:8934` |
| 13 | Media - Media Upload - step 2 (`917:24`) | `5402:7043` | `5587:8938` |
| 14 | Media - Media Preview (`396:442`) | `5402:7107` | `5587:8942` |
| 15 | Categories - Add Category (`138:93`) | `5402:6851` | `5587:8946` |
| 16 | Contest - Create Task (`5403:6640`) | `5403:6674` | `5587:8950` |
| 17 | Contest - Schedule Task (`5403:6753`) | `5403:6787` | `5587:8954` |
| 18 | Contest - Edit Task (`5403:6866`) | `5403:6900` | `5587:8958` |
| 19 | Contest - Search Task (`5403:6979`) | `5403:7013` | `5587:8962` |
| 20 | Contest - Delete Task (`5403:7092`) | `5403:7126` | `5587:8966` |
| 21 | Settings - Delete Role (`5403:7205`) | `5403:7283` | `5587:8970` |
| 22 | Admin - Admin Profile (`5403:7327`) | `5403:7361` | `5587:8974` |
| 23 | Contest - Empty State (`5405:8277`) | `5405:8311` | `5587:8978` |
| 24 | Contest - Task Scheduled (Success) (`5405:8390`) | `5405:8424` | `5587:8982` |

**Left untouched** (already have the item): `5566:8033` / `5566:8067`
(Admin — Create Competition) and `5569:7813` / `5569:7847`
(Admin — Competition Created (Success) — Task 2 fixes a separate bug there).

#### Count reconciliation

CLAUDE.md's Decision Log #73 bullet flagged "propagating it to the other **15**
Admin shells is a flagged follow-up." Actual scope was **24**:

- 22 screens on the unified Admin shell (Phase 2 of PR #102 replaced 13
  screens' shells, plus Contest tabs, plus the Phase-3 screens added by
  PR #102, plus the Settings sub-screens) — more than #73's estimate of 15.
- 2 legacy Contest-tab frames (`2363:2244`, `2363:3446`) that share the
  identical `Frame 5745` sidebar structure.

This pass covers all of them. Decision Log #73's follow-up is **closed**.

### Task 2 — Clipped sidebar on Admin — Competition Created (Success)

`5569:7813` (page, was 900 tall) contains the 806-tall sidebar `5569:7847`
starting at y = 329, so its "Settings" and "Competitions" rows landed at an
absolute y of ~1055–1099 — below the 900px canvas, rendering off-screen.

**Fix:** grew the **page frame** 900 → **1184** (chosen over shrinking the
fixed-height sidebar component or matching the sibling's 1530 — see Decision
Log #77). Also resized the two **visible** full-bleed backgrounds to match:

| Node | Name | Change |
|---|---|---|
| `5569:7813` | Admin — Competition Created (Success) | height 900 → 1184 |
| `5569:7817` | `md-mahdi-lQpFRPrepQ8-unsplash 1` (bg photo) | height 900 → 1184 |
| `5569:7846` | `Rectangle 223` (sidebar background) | height 900 → 1184 |
| `5569:7816` | `7448202 1` (hidden bg rect) | height 900 → 1184 (kept in sync; not visible) |

Sidebar row order and content untouched. Post-fix: sidebar bottom = 1135,
"Settings" row bottom = 1099, both inside the 1184 canvas — a 49px bottom
margin, identical to every other tall Admin frame in the file.

### Task 3 — "Club Representation" entry point on Settings (desktop)

Settings — Overview desktop (`2905:4798`) — new row in the **Account** panel
(`Account` frame `2910:7305` → `Frame 5918` `2910:7303`), inserted at index 1:

`Account Information` → **`Club Representation`** → `Change Password` → `Deactivate Account`

| Property | Value |
|---|---|
| New row node | `5601:7813` ("Club Representation Row") |
| Cloned from | `2910:7300` (the "Account Information" row) |
| Icon | `5601:7822` — `fi:A_users` people glyph cloned from `5566:8078`, strokes rebound `color/text/primary` → `brand/navy` (`5096:4`) to match the panel's other icons |
| Title | "Club Representation" — Montserrat SemiBold 18, `color/text/secondary` (`5096:9`) |
| Subtitle | "Set your represented club" — Montserrat Regular 14, `5096:9` |
| Chevron | inherited from the cloned row (`chevron-forward`, stroke `5096:4`) |
| Row width | 388px (siblings are 386–390); inner frame gap tuned to 141 so the chevron aligns with the other rows |
| Opens | `5570:7813` (club-representation selector, desktop) |

### Task 3 — Mobile Settings — Overview (new screen)

**New frame `5607:7813` — "Settings — Overview — Mobile"**, 390 × 752, placed
at canvas `(72200, -9371)` immediately right of the club-rep mobile family
(`5570:7887`).

Built as a **one-off routing override** authorised by the founder for this
pass only (see §6). Structure:

| Section | Node | Notes |
|---|---|---|
| Frame | `5607:7813` | 390px, fill `color/background/page` (`5096:6`), VERTICAL auto-layout, hugs height |
| Top bar | `5607:7814` | cloned from `5570:7888` (Soccernity logo, 390 × 64, `color/background/surface`) |
| Content column | `5607:7818` | 350px inner (20px side padding), VERTICAL, gap 28 |
| "Settings" heading | — | Montserrat Bold 28, `color/text/secondary` (`5096:9`) — matches desktop |
| Category Nav | `5607:7820` | 5 rows (below) |
| — Account (active) | `5607:7822` | navy pill (`brand/navy`), label `color/text/on-navy` (`5182:6654`) |
| — Security and account access | `5607:7826` | no fill, label `color/text/primary` |
| — Privacy and safety | `5607:7830` | " |
| — Notifications | `5607:7834` | " |
| — Display, languages and region | `5607:7838` | " |
| Account Section | `5607:7821` | header + 4 rows |
| — Account Header | `5608:7813` | "Account" Bold 18 + "See information about your account" Regular 14, both `5096:9` |
| — Account Information Row | `5608:7817` | icon `information-circle-sharp` (from `2910:7290`) |
| — **Club Representation Row** | `5608:7825` | icon `fi:A_users` rebound to `brand/navy` — **the mobile entry point** |
| — Change Password Row | `5608:7836` | icon `document-lock-sharp` (from `2910:7294`) |
| — Deactivate Account Row | `5608:7845` | icon `close-circle` (from `2910:7292`) |

Mobile row type scale: title Montserrat SemiBold 16, subtitle Montserrat
Regular 12, all `color/text/secondary` (`5096:9`); chevrons `chevron-forward`
cloned from `2910:7334` (stroke `brand/navy`). Club Representation Row
(`5608:7825`) opens `5570:7887` (club-representation selector, mobile).

**Audit:** 0 visible unbound paints, 0 `brand/green-tint-28`, Light-mode
Soccernity Theme tokens only, no new colour, no dark mode, no frame overlaps.
(Invisible icon-container frame fills — unbound white — were left as-is: that is
the file's own universal icon convention, matched by every existing icon frame
including the Task 1 reference.)

---

## 2. Structural findings (verified live before editing)

- All 24 target sidebars are byte-identical in structure: `Frame 5745`
  (VERTICAL, `itemSpacing` 358) → `[Frame 5744` (nav group, HUG height, 6 rows:
  Dashboard, Articles, Users, Categories, Contest, Media)`, Frame 5738`
  (Settings row)`]`.
- Two sidebar heights exist: **655px** (on 1024-tall pages, `primaryAxisAlignItems
  = SPACE_BETWEEN` — Settings pinned to the bottom) and **806px** (on 1184-tall
  pages, `primaryAxisAlignItems = MIN` — Settings at `Frame 5744` end + 358).
- Adding a 7th nav row grows `Frame 5744` 314 → 368 (matching Create
  Competition's own 368). On `SPACE_BETWEEN` sidebars Settings does not move; on
  `MIN` sidebars Settings shifts down 54px to y = 726, bottom 770, still inside
  the 806 sidebar and the 1184 page. **No screen is clipped by the change** —
  verified for all 24.
- The `u:chat-bubble-user` icon in the Contest rows is a single 18×20 `Vector`
  (not the 3-rectangle variant seen in the reference's *active* Competitions
  icon) — cloning the Contest row and rebinding that Vector to `5096:8` produces
  the correct inactive icon.

---

## 3. Verification

| Check | Result |
|---|---|
| Task 1 — all 24 sidebars: 7 rows, `Nav — Competitions` at index 5 | Pass |
| Task 1 — row order `…,Contest,Nav — Competitions,Media` on all 24 | Pass |
| Task 1 — no page-bounds clipping on any of the 24 | Pass (Settings bottom ≤ page height everywhere) |
| Task 1 — token bindings (`5096:7` fill, `5096:8` icon+label) | Pass (spot-checked `2363:2280`, `5400:6660`, sample row `5587:7813`) |
| Task 1 — active Contest row on Contest screens untouched | Pass (`2363:2244` screenshot: Contest active, Competitions inactive below) |
| Task 2 — full sidebar incl. Settings visible in 1184 canvas | Pass (screenshot) |
| Task 2 — sidebar row order/content unchanged | Pass |
| Task 3 desktop — 4 Account rows aligned, chevrons flush right | Pass (screenshot) |
| Task 3 mobile — 0 visible unbound paints, 0 green-tint-28 | Pass |
| Task 3 mobile — no overlap with `5570:7887` or other frames | Pass (x 72200–72590, clear) |

Verification ceiling is the same as every prior figma-design-system pass in this
project — live `use_figma` reads + inline screenshots. No browser/Playwright.

---

## 4. Judgment calls

| # | Call | Reasoning |
|---|---|---|
| a | Task 1 row inserted **between Contest and Media**, not appended | Matches the reference `5566:8141` order exactly (Contest → Competitions → Media) |
| b | Task 1 rows cloned from **each screen's own Contest row**, then forced inactive | Guarantees per-screen structural/token consistency regardless of whether that screen's Contest row was active or inactive |
| c | Task 1 label = "Competitions" (no trailing space), text node renamed `Competitions` | Matches the reference label `5566:8144`; Contest labels carry a stray trailing space, not copied |
| d | Task 2 page height = **1184**, not 1530 (the sibling) | 1184 is the standard tall-Admin-frame height across the whole Contest screen family, giving the same 49px sidebar-bottom margin; 1530 is an outlier driven only by Create Competition's 1121px form |
| e | Task 2 fixed by growing the page, not shrinking the sidebar | The sidebar is a fixed-height shared component; shrinking it would desync it from the other 25 Admin screens |
| f | Task 3 row placed **between Account Information and Change Password** | Club representation is an identity/profile setting — grouped with profile settings, above the security/danger items (Change Password, Deactivate) |
| g | Task 3 icon = `fi:A_users` (people), not the cloned info-circle | An info "i" for "club representation" reads as wrong; the people glyph already exists in-file (Admin sidebar) and rebinds cleanly to `brand/navy` |
| h | Task 3 subtitle = "Set your represented club" (concise) | Keeps the row width in line with siblings; the desktop Account rows use a rigid fixed-gap layout that overflows with long subtitles |
| i | Mobile Settings — Overview: dropped the desktop's left profile / trending-news / suggested-follows column | That column is profile-page content, not settings content — irrelevant on a focused mobile settings screen |
| j | Mobile: category-nav + account rows **rebuilt fresh** at mobile scale, not cloned from desktop | The desktop rows are 331px / 390px fixed-width with rigid internal gaps that fight a 350px column; fresh FILL-based rows are the established mobile pattern (matches `5570:7887`) |
| k | Mobile width 390 / content 350 / top bar 64 | Matches the club-rep mobile family (`5570:7887`) this screen links into and sits beside — the most consistent local convention |

---

## 5. What's left for `figma-screen-builder` / others

Nothing is blocked on `figma-screen-builder` by this pass. Carry-forward items,
all pre-existing and unchanged:

- **Backend requirement (parked):** persisting the represented club needs a real
  field/endpoint — distinct from `ClubPage` membership, arguably what
  `User.clubAffiliationId` was always for. Decision Log #74. Both the
  club-representation selector screens and now two Settings entry points depend
  on it.
- **Decision Log #73's "Competitions" active-state propagation** — the active
  Competitions nav item still needs to be authored on any *future* Competitions
  list/detail screen when one is designed. This pass only handles the inactive
  state on the 24 existing screens.
- **Admin Panel content-area light-mode retrofit** (Decision Log #52) — still
  open; untouched here (sidebar shells only).
- **Icon-library standardisation** across the Admin sidebar (`u:*` / `fi:*` /
  `bx:*` mix) — still open, untouched.
- Real-club-crest licensing on Match Details — still a separate legal/business
  issue, not a design-token problem.

---

## 6. Routing override (one-off, disclosed)

The task authorised a **one-off override** of the standard
`figma-design-system` → `figma-screen-builder` sequencing: `figma-design-system`
built a brand-new screen (mobile Settings — Overview, `5607:7813`) in this pass,
because the desktop reference already exists and the founder explicitly wanted
the entry point on both breakpoints in one pass rather than a round trip.

**This is NOT a change to the standing agent-sequencing rule.** New screens
without an existing reference remain `figma-screen-builder`'s domain. This is the
same one-off model PR #102 used for the Admin Panel unification.

---

## 7. Decision Log entries (proposed #76–#79 — transcribe into Build Plan Section 9)

> Numbering follows PR #108 (last used #75). If Section 9 has advanced, renumber
> and keep the forward-pointers. Note: `docs/sprint-2-leaderboard-page-design-report.md`'s
> "#45" was never transcribed — that gap is unrelated and untouched here.

**#76 — "Competitions" Admin sidebar nav item propagated to all remaining Admin
screens.**
*Context:* Decision Log #73 added the item to Admin — Create Competition and
flagged "propagating it to the other 15 Admin shells" as a follow-up.
*Resolution:* The inactive `Nav — Competitions` row (icon `u:chat-bubble-user`,
label "Competitions", tokens `color/background/surface` / `color/text/primary`)
is now on all **24** remaining Admin Panel screens — 22 unified-shell screens +
the 2 legacy Contest-tab frames — inserted directly below "Contest". Count
reconciled: #73 estimated 15; actual scope was 24. `sprint-2/admin-competitions-nav-settings-club-rep`.
*Status:* Resolved. Closes the #73 follow-up (append a forward-pointer to #73's
Status).

**#77 — Admin — Competition Created (Success) page height.**
*Context:* The 806px sidebar component starting at y = 329 was clipped by the
900px `5569:7813` canvas; "Settings" rendered off-screen.
*Resolution:* Page grown to **1184** (the standard tall-Admin-frame height in
this file), not the sibling Create Competition's outlier 1530, and not by
shrinking the shared sidebar component. Visible full-bleed backgrounds resized
to match. `sprint-2/admin-competitions-nav-settings-club-rep`.
*Status:* Resolved.

**#78 — "Club Representation" placement on the user-facing Settings screen.**
*Context:* The club-representation selector (`5570:7813` / `5570:7887`, Decision
Log #74) said "you can change this any time from Settings" but had no Settings
entry point.
*Resolution:* New row in the **Account** panel, between "Account Information" and
"Change Password" — grouped with identity/profile settings, above
security/danger items. Icon = `fi:A_users` (people) rebound to `brand/navy`;
subtitle "Set your represented club". `sprint-2/admin-competitions-nav-settings-club-rep`.
*Status:* Resolved.

**#79 — Mobile Settings — Overview screen + one-off routing override.**
*Context:* No mobile Settings — Overview existed; the founder authorised
`figma-design-system` to build it in this pass so the club-representation entry
point lands on both breakpoints together.
*Resolution:* New frame `5607:7813` (390 × 752), built from the desktop
`2905:4798` as content reference, adapted to the club-rep mobile family's
conventions (390 / 350 / 64). Desktop's profile/trending/suggested column
dropped (not settings content); settings-nav + Account panel stacked vertically;
rows rebuilt fresh at mobile type scale (16 / 12). Club Representation entry
point included (`5608:7825`). **This is a one-off override for this pass only —
the standing `figma-design-system` → `figma-screen-builder` sequencing rule is
unchanged.** `sprint-2/admin-competitions-nav-settings-club-rep`.
*Status:* Resolved.

---

## 8. Follow-up session checklist (needs shell access)

1. `git checkout main && git pull --ff-only`
2. `git checkout -b sprint-2/admin-competitions-nav-settings-club-rep`
3. Stage `CLAUDE.md` (status bullet already written) + this report.
4. Transcribe Decision Log #76–#79 into
   `docs/Soccernity_MVP_Build_Plan_v1.7.docx` Section 9 via `python-docx`;
   append forward-pointer to #73's Status column.
5. Commit, push, open PR against `main`. **Do not merge.**

No application/backend files change in this PR — Figma edits are already live in
the file, and the doc changes are the only tracked-file deltas.
