# Sprint 2 — Admin Panel Shell Unification (Phases 1–3, single PR)

**Branch (intended):** `sprint-2/admin-panel-shell-unification`
**Figma file:** `weZWWqggy9j13eX8bhFgs6` ("Soccernity-MVP"), page "Soccernity" (`0:1`)
**Date:** 2026-08-28

---

## 0. One-time combined-scope exception (read first)

This project normally splits design work: **existing-frame retouch → `figma-design-system`**,
**brand-new screens → `figma-screen-builder`**, run as separate sessions/PRs. Temi chose to
combine both scopes into **one PR this time** to save a round trip. Phases 1–2 (retouch/
unification of 15 existing Admin Panel screens) are `figma-design-system` work; Phase 3
(7 named brand-new screens + 2 audit-pass screens) is `figma-screen-builder` work. They are
bundled here deliberately and **this is not the new default** — the normal split resumes
after this PR.

---

## 1. Blockers hit this session (must be actioned by whoever finalises the PR)

1. **No shell / Bash tool.** This session had `Read`/`Write`/`Edit`/`Grep`/`Glob` + the Figma
   MCP tools only — same limitation `docs/sprint-2-retrofit-light-mode-tokens-report.md` §10
   hit. Consequences:
   - The branch `sprint-2/admin-panel-shell-unification` was **not created**, nothing was
     committed, no PR was opened. Exact commands in §9.
   - `docs/Soccernity_MVP_Build_Plan_v1.7.docx` (Section 9 Decision Log) **could not be
     edited** (binary; needs python-docx via a script). The new Decision Log entries are
     recorded in full in §8 below for transcription into the .docx by whoever has a shell.
2. **The Figma work itself is fully live in the file** — all Phase 1/2/3 changes described
   below are done on the canvas right now. Only the git/doc plumbing is outstanding.

---

## 2. Token standard applied (all three phases)

Every shell fill/stroke bound to the existing `Soccernity Theme` collection
(`VariableCollectionId:5096:2`), **Light** mode (`5096:0`). Confirmed live before first write:
12 variables, matching CLAUDE.md's record.

| Variable | ID | Role in the unified shell |
|---|---|---|
| `brand/navy` | `5096:4` | Active nav item bg; primary buttons ("Create …"/"Log Out"/form submit); sidebar wash (@ 12%); modal scrim (@ 45%); Cancel-button border |
| `brand/green` | `5096:3` | Logo icon-mark green half; success indicator dot |
| `brand/green-tint` (12%) | `5096:5` | Top-bar search pill; form input fields; avatar placeholder |
| `color/background/surface` | `5096:7` | Inactive nav item bg; form/modal card bg |
| `color/text/primary` | `5096:8` | Logo wordmark, nav labels (inactive), page titles, form labels, avatar name |
| `color/text/secondary` | `5096:9` | Search placeholder, form placeholder/helper text, modal body copy |
| `color/text/on-navy` | `5182:6654` | Text/icons on navy (active nav item, primary buttons, Log Out) |
| `color/icon/inactive` | `5097:2` | (not needed in the shell) |

- **No `brand/green-tint-28`** anywhere in the unified shell or the 9 new screens (Decision
  Log #47) — audited, 0 instances.
- **No new brand colour** (CLAUDE.md non-negotiable #3). Every colour traces to navy or green.
- **Light mode only** — no dark-mode variant or logic added.
- Known tooling gotcha re-confirmed (already in `sprint-2-retrofit-light-mode-tokens-round2`
  §1.4): `setBoundVariableForPaint()` resets a paint's `opacity` to 1; the navy sidebar wash
  (12%), the modal scrim (45%) and the calendar-in-form each needed a **second, separate
  opacity re-assert pass** before it stuck.

---

## 3. PHASE 1 — Categories sidebar item on the Contest tab pair

**"Contest - Contest Task tab" (`2363:2244`) and "Contest - scheduled contest task tab"
(`2363:3446`)**: added a **"Categories"** nav item directly above "Contest".

- Final sidebar order (both frames): Dashboard → Articles → Users → **Categories** → Contest
  → Media, with **Settings still pinned at the bottom** (unchanged).
- Method: cloned the existing inactive "Media" nav item frame (so bg fill, auto-layout,
  padding, item height 44, 12 px icon gap, Montserrat Medium 20 label all match exactly),
  inserted at index 3 of the nav auto-layout group, relabelled "Categories".
- **Icon:** a new 2×2 grid vector (the conventional "categories / apps" glyph), drawn in the
  same 18×18 space the other sidebar icons use, fill bound to `color/text/primary` — matching
  the icon treatment of the other items. Icon-name convention followed (`u:apps`, mirroring
  the file's existing `u:create-dashboard` / `u:document-layout-left` / `u:images` etc.). See
  Decision Log **#49**.
- New nodes: `5392:6640` (item, frame 1), `5392:6645` (item, frame 2).

### 3b. Shell token cleanup on the Contest pair (disclosed deviation)

Phase 1's brief says "the ONLY change to these two screens … Do not touch anything else."
But the **Token standard section applies to all three phases** ("fix any off-palette/black/
unbound fills you encounter in the shell") **and** Phase 2 requires the Contest pair to be a
clean reference to copy from. The Contest shell as found carried a pile of unbound/off-palette
paints. Resolution: Phase 1 proper = Categories item only; then a **separate, disclosed
"Phase 1b" token-cleanup pass** on both Contest shells. Fixed:

| Element | Before | After |
|---|---|---|
| Sidebar bg (`Rectangle 223`) | `#282E65` @ 12%, **unbound** | `brand/navy` @ 12% (bound) |
| Nav labels (inactive) ×5 | `#000000` unbound | `color/text/primary` |
| Nav icons (inactive) — fills & strokes | `#000000` unbound | `color/text/primary` |
| Nav label + icon (active "Contest") | `#FFFFFF` unbound | `color/text/on-navy` |
| Search icon stroke + "Search Soccernity" | `#000000` @ 35% unbound | `color/text/secondary` |
| "Create Task" button label, "Log Out" label | `#FFFFFF` unbound | `color/text/on-navy` |
| "Kuponiyi Abraham Admin", hidden "adminator" | `#000000` unbound | `color/text/primary` |
| **Logo wordmark "Soccernity"** | bound to **`brand/green`** (the recurring wordmark bug — see round-1 §3.2, round-2 §4) | `color/text/primary` (navy) |
| Ghost 6.7 px "Soccernity" text inside the icon lockup | visible, `#000000` unbound | `visible = false` + bound (same ghost-node bug as round-1 §3.3 / homepage rebuild) |

Post-cleanup shell audit (both Contest frames): **0 unbound solid paints** in the shell
(after the follow-up stray-fix pass in §5). Screenshots confirmed: lavender sidebar, navy
wordmark, navy active pill, green-tint search pill — visually identical intent to the
original, fully token-bound.

---

## 4. PHASE 2 — 13 screens re-shelled to match the Phase-1 Contest pair

For each screen: the existing sidebar (`Group 65`) and top bar (`Group 64`) plus any
standalone top-bar action button were **removed wholesale** and replaced with a clone of the
6-piece cleaned Contest shell (sidebar wash rect, logo lockup, avatar+name block, nav list
with Categories, "Log Out" button, top-bar search+primary-button), grouped as **"Admin
Shell"**. Each screen's **main-content area is untouched** except for the removed old chrome.

Shell adaptations for the 1024-tall frames (Contest is 1184): sidebar wash rect resized to
frame height; nav list set to `SPACE_BETWEEN` so **Settings always pins to the bottom**
regardless of frame height; top bar placed at **y 95** (vs Contest's y 186) so it clears
content that starts at y ~135 on these shorter frames. See Decision Log **#50**.

| # | Screen | Frame ID | Active nav item | Top-bar primary-action label | Note |
|---|---|---|---|---|---|
| 1 | Dashboard | `110:5` | Dashboard | **(button removed)** | Overview screen, no primary action — Decision Log #51 |
| 2 | Articles | `123:56` | Articles | **Create Article** | was "Create Post" — terminology unified to "Article" |
| 3 | Articles - Create Post | `124:313` | Articles | **Publish Post** | in-content "Submit Post" button preserved |
| 4 | Categories | `128:488` | Categories | **Add Category** | |
| 5 | Categories - Add Category | `138:93` | Categories | **Save Category** | form screen; in-content "Submit" preserved |
| 6 | Media | `361:553` | Media | **Add Media** | |
| 7 | Media - Media Upload - step 1 | `916:2362` | Media | **Upload Media** | |
| 8 | Media - Media Upload - step 2 | `917:24` | Media | **Upload Media** | |
| 9 | Media - Media Preview | `396:442` | Media | **(button removed)** | preview/lightbox view, no primary action — Decision Log #51 |
| 10 | Users - team members | `917:218` | Users | **Add Member** | screen had no top-bar action before; gains one from the shell |
| 11 | Settings | `1658:2303` | Settings | **Add Role** | |
| 12 | Settings - Add new role | `1658:2456` | Settings | **Save Role** | form; in-content "Submit" preserved |
| 13 | Settings - Edit role | `1658:2592` | Settings | **Save Changes** | form; in-content "Submit" preserved |

Sub-screen / form-screen labels (#3, #5, #12, #13) and the two button removals (#1, #9) are
judgment calls — Decision Log **#51**.

### 4.1 Phase 2 shell paint audit (measured)

Per-screen shell scope ("Admin Shell" group), after the §5 stray-fix pass:

| Screen | bound | unbound | black | green-tint-28 |
|---|---|---|---|---|
| Contest tab (ref) | 38 | 0* | 0* | 0 |
| Contest scheduled (ref) | 39 | 0* | 0* | 0 |
| Dashboard | 36 | 0* | 0* | 0 |
| Articles → Edit Role (11 more) | ~38 each | 0* | 0* | 0 |

\* Before the §5 pass, every shell carried exactly **2** residual unbound black paints: the
hidden 6.7 px ghost "Soccernity" text (paint visible, node hidden) and the hidden
`fi:chevron-down` vector stroke inside the collapsed "adminator ▾" dropdown. Both are
**inside hidden parents** (invisible on canvas). The §5 pass bound both across all 15 shells
→ **0 unbound, 0 black, 0 `green-tint-28`** in every unified shell.

### 4.2 Content-area issues found, NOT fixed (out of shell scope — flagged per brief)

The Admin Panel content areas were **never light-mode-retrofitted** (round-2 retrofit, PR #99,
explicitly deferred Admin Panel). Left as found, noted here:

- **Off-palette indigo buttons** in content: `#4F46E5` / `#3539DF` on the in-content
  "Submit Post" / "Submit" buttons (Categories, Create Post, Settings, Add/Edit Role).
- **`#1E1E1E`** near-black card fill on the Settings roles table (`Rectangle 35`).
- **Red** (`#FF0000` / `#FF0808`) trash icons and **red "Inactive" / blue "Active"** status
  pills on Categories, Users.
- **`#000000`** table body text and column headers across Articles / Categories / Media /
  Users / Settings tables.
- Page-title texts ("Articles", "Roles", "Uploaded Media", …) are unbound `#000000` in the
  content layer. The **Phase 3 new screens' titles were bound** to `color/text/primary`; the
  13 Phase 2 screens' existing titles were left (content scope).
- Dashboard: the shell search pill sits ~1 px above the "Dashboard" page title on the 1024-tall
  frame — tight but both readable. Same tight spacing on the other list screens.

These are a genuine **"Admin Panel content light-mode retrofit"** follow-up — Decision Log **#52**.

---

## 5. Stray-paint fix pass (applied across all 15 shells + 9 new frames)

One consolidated pass bound: the ghost "Soccernity" text fill (kept `visible = false`), the
hidden "adminator" label fill, and the hidden `fi:chevron-down` stroke — everywhere they
appeared in a shell. Also bound the 9 new screens' page-title texts and cleared 19 unbound
default-white auto-layout wrapper fills that `figma.createAutoLayout()` adds silently
(Phase 3 form field-group wrappers). Result: the shell + all newly-authored content on the 9
new frames is fully bound (see §6.2 for the residual pre-existing-content counts).

---

## 6. PHASE 3 — new screens

All new frames created on page `0:1`, in a row **below the Contest pair** at **y 4706**,
1440×1024, each carrying the unified shell.

### 6.1 The 7 named screens

| Screen | Frame ID | Base | What was built | Primary bindings |
|---|---|---|---|---|
| **Contest - Create Task** | `5403:6640` | clone of Contest tab | table/tabs removed; title → "Create Task"; white form card (surface) with 4 fields — Task Name, Hashtag, Description (textarea), Target Entry Count — green-tint inputs, navy labels, secondary placeholders; navy "Create Task" submit | surface / green-tint / navy / on-navy / text-primary / text-secondary |
| **Contest - Schedule Task** | `5403:6753` | clone of Contest tab | title → "Schedule Task"; form card with a "Contest Task" field + **an instance of the reused calendar component** (see §6.3); redundant time/submit fields removed (the calendar carries its own "Set time" + Cancel/Schedule) | surface / green-tint / navy / text-primary + reused component |
| **Contest - Edit Task** | `5403:6866` | clone of Contest tab | same form as Create, **pre-filled** (Sportkings / #arsenalforlife / …); submit → "Save Changes"; top-bar button relabelled "Save Changes" | as Create Task |
| **Contest - Search Task** | `5403:6979` | clone of Contest tab | shell search field shows an **entered query** ("arsenalforlife", bound `text/primary`); results caption "Search results for … — 3 contest tasks" (`text/secondary`); table trimmed to 3 visible rows | text-primary / text-secondary |
| **Contest - Delete Task** | `5403:7092` | clone of Contest tab | table dimmed behind a **navy @ 45% scrim**; centred confirmation card (surface, r12): "Delete this task?" (SemiBold 22, primary) + body (Regular 15, secondary) + **[Cancel] outline / [Delete Task] navy** | navy(scrim/btn) / surface / text-primary / text-secondary / on-navy |
| **Settings - Delete Role** | `5403:7205` | clone of Settings | same confirmation pattern over the Settings roles table: "Delete this role?" + [Cancel] / [Delete Role] | as Delete Task |
| **Admin - Admin Profile** | `5403:7327` | clone of Contest tab | **all nav items set inactive** (profile isn't a sidebar destination); title → "Admin Profile"; top-bar button removed; profile card — avatar circle, name/role header, 4 read-style fields (Full name / Email / Role / Phone), **[Edit Profile] navy / [Change Password] outline** | surface / green-tint / navy / on-navy / text-primary / text-secondary |

### 6.2 Audit-pass screens (built beyond the named list — flagged so they are not mistaken for a direct ask)

The brief asks for a self-audit for missing follow-up states and to "build those too". Built
**two** genuinely-needed ones; the rest are recommendations in §7.

| Screen | Frame ID | What / why |
|---|---|---|
| **Contest - Empty State** | `5405:8277` | The Contest task list has no zero-state. Centred surface card: green-tint circle, "No contest tasks yet", body copy, navy "Create Task" button. |
| **Contest - Task Scheduled (Success)** | `5405:8390` | No post-action confirmation exists for scheduling. Scrim + centred card: green success dot, "Task scheduled", summary line, **[View schedule] outline / [Done] navy**. |

### 6.3 Reused calendar component — CONFIRMED

**"Contest - Schedule Task" (`5403:6753`) is the screen that uses the reused calendar
component.** An instance of `2365:2034` — the **`Property 1=calendar 2`** variant (the fuller
monthly view, 687×423) of the component set **"Calendar for scheduled task"
(`2365:2033`)** — was placed inside the Schedule Task form. **No calendar was built from
scratch.** The instance is named
`Calendar (reused: Calendar for scheduled task / calendar 2)` on the canvas.

### 6.4 Phase 3 paint audit (measured, after §5)

| Screen | bound | unbound | of which pre-existing cloned content | newly-authored unbound |
|---|---|---|---|---|
| Create Task | 64 | 2 | 2 (logo-mark inner vector, near-invisible) | 0 |
| Edit Task | 64 | 2 | 2 | 0 |
| Admin Profile | 69 | 2 | 2 | 0 |
| Empty State | 55 | 2 | 2 | 0 |
| Schedule Task | 70 | 54 | **54 — all inside the reused calendar instance** (`January 2022`, weekday labels, day numbers, grid lines) | 0 |
| Search Task | 53 | 29 | 29 — the cloned Contest **table** content (`27/03/23`, `Sportkings`, header row) | 0 |
| Delete Task | 61 | 92 | 92 — full cloned Contest table (all 12 rows) **behind the 45% scrim** | 0 |
| Task Scheduled | 62 | 92 | 92 — same, behind scrim | 0 |
| Delete Role | 54 | 32 | 32 — cloned Settings roles table + `#3539DF` button + red trash, **behind the scrim** | 0 |

**Reading:** every paint I *authored* (shell + new form/modal content) is bound. The unbound
counts are (a) the **reused calendar component's own un-retrofitted internals** — a real
follow-up, Decision Log **#53**, and (b) **pre-existing Admin Panel table content** cloned in
as the backdrop for the search/delete/success states, which is the same content-layer debt as
§4.2 (Decision Log #52) and is mostly hidden behind a scrim anyway.

---

## 7. Self-audit — other follow-up screens a real flow needs (recommendations, NOT built)

Built: Contest Empty State + Task Scheduled success (§6.2). **Not** built, recommended for a
`figma-screen-builder` follow-up (building all of these now would be speculative scope creep):

1. **Task Created** / **Task Updated** success confirmations (siblings of Task Scheduled).
2. **Role Created** / **Role Updated** / **Role Deleted** confirmations (Settings).
3. **Media upload — error state** (file too large / wrong type) and **upload success**.
4. **Empty states** for Articles, Categories, Media, Users, Roles (only Contest has one now).
5. **Delete confirmations** for Article, Category, Media item, User (Users has a "ban" icon
   with no confirmation screen; Media/Articles/Categories have trash icons with none).
6. **Admin Profile — Edit** and **Change Password** screens (the buttons exist, the
   destinations don't).
7. **Search — no results** state for Contest Search Task (and a search affordance / results
   state for the other list screens, whose shell search field is currently decorative).
8. **Session / auth**: an admin **login** screen — the shell has a "Log Out" button but no
   corresponding logged-out entry point anywhere in the Admin Panel section.

---

## 8. Decision Log entries (Build Plan Section 9) — RECORD ONLY, .docx not editable this session

Next free number verified against prior reports: #45 was left free for a Leaderboard entry,
#46/#47/#48 are used → these start at **#49**. Transcribe into
`docs/Soccernity_MVP_Build_Plan_v1.7.docx` Section 9.

- **#49 — "Categories" sidebar icon + the shell as loose clones vs. a component.**
  (a) The new Categories sidebar item uses a hand-drawn 2×2-grid glyph named `u:apps`, chosen
  to match the file's Unicons-ish sidebar icon naming and the "apps/grid = categories"
  convention. The Admin Panel's sidebar icons are otherwise a mix (`u:*`, `fi:*`, `carbon:*`,
  `ic:*`, `clarity:*`, `akar-icons:*`) — **icon-library standardisation across the Admin
  Panel is still open** (flagged by every prior retrofit round). (b) The unified shell was
  applied as a **cloned + grouped "Admin Shell"** per screen, not as a single Figma
  component with instances. Rationale: per-screen active-nav-item state and per-screen
  primary-action label are simplest as direct edits; a component would need 7 variants or
  per-instance overrides. **Open:** should the Admin Shell become a real component/instance
  set in a follow-up? Recommended yes, but deferred.
- **#50 — Unified shell vertical placement on 1024-tall frames.** Contest (the reference) is
  1184 tall with the top-bar search at y 186; the 13 Phase 2 screens are 1024 tall with
  content starting at y ~135. The shell top bar was placed at **y 95** on the shorter frames
  (not y 186) so it clears content without shifting each screen's content down or growing
  every frame. Consequence: slightly tighter top-bar-to-title spacing than Contest.
  **Open:** normalise the Admin Panel frames to 1184 and shift content, or accept the y-95
  adaptation as canon?
- **#51 — Per-screen top-bar primary-action labels + two removals.** List screens got
  obvious "Create/Add X" labels. Form/sub-screens got: "Publish Post" (Create Post), "Save
  Category", "Save Role", "Save Changes" (Edit role), "Save Changes" (Edit Task), "Schedule
  Task". **Dashboard** and **Media Preview** had their top-bar button **removed** (no
  primary action on an overview / a lightbox). **Users** *gained* an "Add Member" button it
  didn't have. **Open:** confirm these labels, and confirm form screens should carry a
  top-bar action at all when they already have an in-content submit button.
- **#52 — Admin Panel content areas are not light-mode-retrofitted.** Round-2 retrofit
  (PR #99) explicitly deferred the Admin Panel. This PR unified the **shell** only; the
  content layers still carry `#4F46E5`/`#3539DF` indigo buttons, `#1E1E1E`, `#FF0000` reds,
  `#000000` table text and unbound page titles. A dedicated **"Admin Panel content
  light-mode retrofit"** task is needed (all 15 + the 9 new screens' inherited table
  content). This also re-surfaces the standing **"no `color/action/destructive` token"**
  question (3 distinct reds file-wide) — the Phase 3 delete confirmations use **navy**
  "Delete" buttons because no destructive token exists and non-negotiable #3 forbids
  inventing a red.
- **#53 — The "Calendar for scheduled task" component (`2365:2033`) is not token-bound.**
  Reused as instructed on Schedule Task; its ~54 internal paints (`January 2022`, weekday
  labels, day numbers, `#E4E5E7` grid lines, `#7E818C` muted text, a `#0F2552` heading) are
  unbound / off-palette. Needs its own retrofit pass; until then any screen instancing it
  inherits those paints.
- **#54 — "Admin Profile" implies an admin-account data model that doesn't exist.** There is
  no admin-profile/account entity or endpoint in Build Plan Section 3/4 (the closest is
  `User` + the just-built `POST /auth/change-password` / account-lifecycle routes, which are
  member-facing, not an admin console concept). The Admin Profile screen shows Full name /
  Email / Role / Phone and "Edit Profile" / "Change Password" affordances. **Open:** does the
  Admin Console get its own account model, or does it reuse `User` with a role check? Not a
  design-token question — flagged for founder/backend.

If nothing here needed a Decision Log entry it would be stated explicitly — but **six real
open decisions surfaced** (#49–#54) and are recorded above.

---

## 9. Git / PR steps for whoever has a shell (not runnable this session)

Run from `d:\Projects\soccernity-mvp` (working tree currently on
`sprint-2/mobile-navbar-variant`; all file edits from this session are uncommitted there):

```
git stash                     # if needed to move the report + CLAUDE.md edits cleanly
git checkout main && git pull
git checkout -b sprint-2/admin-panel-shell-unification
git stash pop                  # or re-apply: docs/sprint-2-admin-panel-shell-unification-report.md + CLAUDE.md
# transcribe §8's Decision Log entries #49-#54 into docs/Soccernity_MVP_Build_Plan_v1.7.docx Section 9
git add docs/sprint-2-admin-panel-shell-unification-report.md CLAUDE.md docs/Soccernity_MVP_Build_Plan_v1.7.docx
git commit -m "Admin Panel shell unification (Phases 1-3): Categories sidebar item, 13 screens re-shelled, 9 new screens"
git push -u origin sprint-2/admin-panel-shell-unification
gh pr create --base main --head sprint-2/admin-panel-shell-unification \
  --title "Admin Panel shell unification + new Admin screens (Sprint 2, combined-scope one-off)" \
  --body-file docs/sprint-2-admin-panel-shell-unification-report.md
```

**Do NOT merge** — Temi's call after independent verification (standing instruction for every
design-stage PR in this project). The PR description must state the one-time combined-scope
exception (§0), that CLAUDE.md was updated in-PR, and that the Build Plan .docx Decision Log
entries still need transcribing from §8 if the finalising session also lacks python-docx.

---

## 10. Verification summary (measured, not estimated)

- **Variable collection** confirmed live before first write: `Soccernity Theme`
  (`5096:2`), Light `5096:0` / Dark `5096:1`, 12 variables.
- **Phase 1:** both Contest frames screenshotted before/after; sidebar order confirmed
  `[Dashboard, Articles, Users, Categories, Contest, Media]` + Settings pinned, both frames.
- **Phase 1b:** shell paint audit both Contest frames → 0 unbound after the §5 pass; wordmark
  now navy, ghost hidden, sidebar wash bound navy @ 12% (opacity re-asserted in a 2nd pass).
- **Phase 2:** all 13 frames screenshotted after re-shelling; per-screen active nav item
  visually confirmed (Dashboard/Articles/Categories/Media/Users/Settings respectively);
  shell audit → 0 unbound / 0 black / 0 `green-tint-28` after §5.
- **Phase 3:** all 9 new frames screenshotted; the reused calendar instance confirmed as the
  `calendar 2` variant of `2365:2033` on Schedule Task; authored paints 100% bound; residual
  unbound = reused-component internals (#53) + scrim-covered cloned table content (#52).
- **No browser / Playwright check** — not available in this environment, same ceiling as
  every prior Figma PR in this project. Figma canvas render + variable read-back is the
  verification ceiling.
- **No application code touched.** `apps/`, `services/`, `packages/` unchanged. Figma-only
  plus this report + the CLAUDE.md status bullet.

---

## 11. Fix-up: off-navy blue button fills → `brand/navy`

**Context:** §9's git steps are superseded — the coordinator created branch
`sprint-2/admin-panel-shell-unification` (PR #102, base `main` @ `ca0db73`) and committed
Phases 1–3 + CLAUDE.md + report + Build Plan Decision Log #49–#54. This section documents a
**follow-up commit on the same branch/PR** (no new branch/PR).

**Task:** rebind every **button** fill that is a blue other than `brand/navy` `#282E65` across
all 24 Admin frames (15 unified + 9 new).

### 11.1 Scan result

A full scan of all 24 frames for blue SOLID paints (`b` is the max channel, `b > 0.33`,
`b − r > 0.10`, excluding `#282E65 ± 0.045`) found exactly **one** off-navy blue in use:
**`#3539df`** (rgb 53, 57, 223 — an indigo). **No `#4F46E5` and no `#034694`** are present on
any Admin frame today — the original §4.2 / Decision Log #52 text listed `#4F46E5` alongside
`#3539DF`; the actual value on every affected button is `#3539df`. `#3539df` also appears on
**non-button** elements (left untouched per brief — Decision Log #52 follow-ups):

- Dashboard: the "Visitor statistics" chart line stroke (`114:324`).
- Media / Media Upload 1 / Media Upload 2 / Media Preview: the row action-icon strokes
  (download / view / edit), ~16 vectors per frame inside `Group`.
- Users: the ban/unban action icon (`917:378` stroke + `917:385` `Subtract` fill inside
  `Group 254`).

### 11.2 Buttons rebound — before / after (measured)

All 12 are in-content primary/submit buttons: a rounded-pill `RECTANGLE`
(`Rectangle 34`, r30, 225×50 — "Submit Post"; or `Rectangle 47`, r27, 196×50 — "Submit" /
"Upload") behind a white label. Fill → `brand/navy` (`VariableID:5096:4`, Light `5096:0`,
resolved `#282E65`). Label → `color/text/on-navy` (`VariableID:5182:6654`).

| # | Frame | Button node | Label | Fill before | Fill after | Label fix |
|---|---|---|---|---|---|---|
| 1 | Articles - Create Post | `124:478` | Submit Post | `#3539df` | `brand/navy` | → `color/text/on-navy` |
| 2 | Categories | `128:559` | Submit Post | `#3539df` | `brand/navy` | → `color/text/on-navy` |
| 3 | Categories - Add Category | `138:151` | Submit Post | `#3539df` | `brand/navy` | → `color/text/on-navy` |
| 4 | Categories - Add Category | `359:491` | Submit | `#3539df` | `brand/navy` | → `color/text/on-navy` |
| 5 | Media - Media Upload - step 1 | `917:13` | Upload | `#3539df` | `brand/navy` | → `color/text/on-navy` |
| 6 | Media - Media Upload - step 2 | `917:209` | Upload | `#3539df` | `brand/navy` | → `color/text/on-navy` |
| 7 | Settings | `1658:2371` | Submit Post | `#3539df` | `brand/navy` | → `color/text/on-navy` |
| 8 | Settings - Add new role | `1658:2523` | Submit Post | `#3539df` | `brand/navy` | → `color/text/on-navy` |
| 9 | Settings - Add new role | `1658:2580` | Submit | `#3539df` | `brand/navy` | → `color/text/on-navy` |
| 10 | Settings - Edit role | `1658:2659` | Submit Post | `#3539df` | `brand/navy` | → `color/text/on-navy` |
| 11 | Settings - Edit role | `1658:2716` | Submit | `#3539df` | `brand/navy` | → `color/text/on-navy` |
| 12 | Settings - Delete Role | `5403:7210` | Submit Post | `#3539df` | `brand/navy` | → `color/text/on-navy` |

**Per-frame count of off-navy blue button fills found → fixed:**

| Frame | found | fixed | remaining |
|---|---|---|---|
| Articles - Create Post | 1 | 1 | 0 |
| Categories | 1 | 1 | 0 |
| Categories - Add Category | 2 | 2 | 0 |
| Media - Media Upload - step 1 | 1 | 1 | 0 |
| Media - Media Upload - step 2 | 1 | 1 | 0 |
| Settings | 1 | 1 | 0 |
| Settings - Add new role | 2 | 2 | 0 |
| Settings - Edit role | 2 | 2 | 0 |
| Settings - Delete Role | 1 | 1 | 0 |
| **Total (9 frames touched)** | **12** | **12** | **0** |

The other 15 frames (both Contest frames, Dashboard, Articles, Media, Media Preview, Users,
and 8 of the 9 Phase 3 frames) had **no off-navy blue button fills** — confirmed by the same
scan. Phase 3's own form-submit and delete/confirm buttons were already `brand/navy`
(unchanged — non-negotiable #3, no red on the delete buttons).

### 11.3 Ambiguous cases

**None.** Every hit was an unambiguous rounded-pill rectangle sitting directly behind a
"Submit" / "Submit Post" / "Upload" label. `Settings - Delete Role`'s button (`5403:7210`)
sits behind the 45% scrim (dimmed) but is a real button node and was rebound for
consistency. No blue "chips", tabs, or links were in scope; the `#3539df` icon strokes and
the Users ban-icon `Subtract` fill were left as flagged Decision Log #52 follow-ups.

### 11.4 Verification

- Post-fix re-scan of all 9 touched frames: **0 off-navy blue button fills remain.**
- Screenshots captured for Articles - Create Post, Categories, Settings - Add new role,
  Media - Media Upload - step 2, Settings - Delete Role — all in-content buttons now render
  navy with white labels.
- No non-button element changed. No new colour introduced (traces to `brand/navy` /
  `color/text/on-navy`). Light mode only.

### 11.5 Decision Log #52 — status update

**Applied** to `docs/Soccernity_MVP_Build_Plan_v1.7.docx` Section 9 (row where cell[0] == "52")
in the finalising session that made the fix-up commit. The `figma-design-system` agent that
did the rebinding had no Bash / python-docx; the coordinator applied this and committed.
Decision Log #52's Status text was amended to:

> **Partially resolved (fix-up commit on PR #102):** the **button** subset of the off-navy /
> indigo problem is fixed — all 12 in-content submit/upload buttons across 9 Admin screens
> (`#3539df` pills) rebound to `brand/navy` with `color/text/on-navy` labels. **Still open:**
> the rest of the Admin Panel content retrofit — `#3539df` action-icon strokes (Media /
> Media Preview / Users / Dashboard chart line), `#1E1E1E` card fill, `#FF0000`/`#FF0808`
> reds, `#000000` table body text, and unbound content page-titles — plus the standing
> "no `color/action/destructive` token" question.

### 11.6 Git

**Done** by the finalising session: Decision Log #52 status applied via python-docx, then
committed on `sprint-2/admin-panel-shell-unification` and pushed to PR #102 (not merged, no
new branch/PR) as `Fix-up: rebind off-navy blue button fills to brand/navy across Admin Panel
screens`.
