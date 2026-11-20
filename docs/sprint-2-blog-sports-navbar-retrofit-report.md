# Sprint 2 — Blog / Sports desktop + Create Post navbar consistency fixes

**Branch (to be created in a follow-up session with shell access):** `sprint-2/blog-sports-navbar-retrofit` (off `main`)
**Agent:** figma-design-system
**Date:** 2026-09-03
**Figma file:** `Soccernity-MVP` (`weZWWqggy9j13eX8bhFgs6`), page `Soccernity` (`0:1`)
**Scope:** Figma design only. **No application code exists for any of these screens** (`BlogPage.tsx` / `SportsHubPage.tsx` are still `PlaceholderPage` stubs) — there is nothing to touch in `apps/web` or `services/api`.

Figma-only navbar-consistency pass on the frames that missed the Phase 1/2
navbar correction (Decision Log #161–#163). Brings four legacy pre-redesign
frames onto the canonical navbar component set, and documents the overlay
context of the three Create Post mobile compose frames.

---

## 0. Shell-access limitation (read first)

> **FINALISED 2026-09-03** in a follow-up session with shell access: branch
> `sprint-2/blog-sports-navbar-retrofit` created off `main`, this report +
> the CLAUDE.md bullet committed, Decision Log rows **#169–#171** transcribed
> into `docs/Soccernity_MVP_Build_Plan_v1.7.docx` §9 Table 6 (now live), and
> a PR opened against `main` (not merged). The checklist items below marked
> "blocked on shell access" are done.

This session had **no Bash/shell tool**. The following steps could **not** be
performed here and must be done in a finalising session (same pattern as
PRs #98 / #102 / #110 / #130):

1. `git fetch` + create branch `sprint-2/blog-sports-navbar-retrofit` off `main`.
2. Commit this report + the CLAUDE.md bullet (below) + the Build Plan Decision
   Log rows (§7). Commit message trailer:
   `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`
3. Push, open a PR against `main` titled
   **"Blog/Sports desktop + Create Post navbar consistency fixes"**, body
   trailer `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
   **Do not merge** — leave for the founder.
4. Transcribe Decision Log rows **#169–#171** (§7) into
   `docs/Soccernity_MVP_Build_Plan_v1.7.docx` Section 9, Table 6, via
   python-docx deep-copying the last row's XML.

The Figma writes themselves are **already applied and verified** (screenshots
below). Only the git/docx bookkeeping is outstanding.

---

## 1. Canonical navbar reference (from PRs #144–#146)

One component set: **`Web app Navbar - Desktop and Mobile`** (`2824:4309`),
four variants:

| Variant | Node | Context |
|---|---|---|
| `header 4` | `2838:3502` | logged-in, desktop (1440 × 90) |
| `header 7` | `2841:4104` | logged-out, desktop (1440 × 90) |
| `header 4 — mobile` | `5386:6576` | logged-in, mobile (428 × 64) |
| `header 7 — mobile` | `5386:6575` | logged-out, mobile (428 × 64) |

Confirmed against the file: **no existing screen carries more than one navbar
instance** — every screen instances exactly one variant, chosen by its auth
context (auth pages → `header 7`; every other content screen → `header 4`).
The already-correct mobile Sports frames `5647:8023` (logged-out →
`header 7 — mobile`) and `5647:8169` (logged-in → `header 4 — mobile`) were
used as the mobile reference.

---

## 2. Item 1 — Blog Page Desktop (`1009:128`) + Blog Page Mobile (`41:4`)

Both were pre-redesign frames: unnamed `Group NN` layers, **no navbar
instance**, a hand-built header, and (mobile) an old hamburger-menu icon.

### 2.1 Blog Page Desktop (`1009:128`, 1440 × 11756, absolute layout)

**Hidden** (hand-built header chrome — `visible = false`, not deleted):

| Node | What it was |
|---|---|
| `1009:632` | `Rectangle 109` — white header bar |
| `1009:633` | `Group` — logo mark |
| `1009:641` | `Rectangle 110` — green-tint search pill |
| `1009:642` | `akar-icons:search` |
| `1009:644` | `Search Soccernity` (text) |
| `1009:645` | `Group 258` — old icon-nav row |
| `1009:658` | `Ellipse 30` — avatar |
| `1009:659` | `ci:notification-outline-dot` |
| `1009:661` | `bx:message-dots` |

**Added** (both auth-state variants — see Decision Log #169):

| Instance | Node | State |
|---|---|---|
| `Navbar — header 4 (logged-in — default visible)` | `5932:10661` | visible, `x0 y0`, 1440 × 90 |
| `Navbar — header 7 (logged-out state — toggle visible, hide header 4)` | `5932:10752` | **hidden**, `x0 y0` |

Content (`Group 36` at `y 171`, footer `Group 47` at `y 11427`) untouched.

### 2.2 Blog Page Mobile (`41:4`, **375** × 5753, absolute layout)

**Hidden:**

| Node | What it was |
|---|---|
| `43:8` | `bx:menu` — **the stale hamburger-menu icon** (task asked to remove it; hidden + retained, per this file's archive-don't-delete convention) |
| `359:493` | `Group 102` — old "Soccernity" header logo (would duplicate the navbar's own logo) |

**Added:**

| Instance | Node | State |
|---|---|---|
| `Navbar — header 4 — mobile (logged-in — default visible)` | `5932:10832` | visible, `x0 y0`, **resized 428 → 375** |
| `Navbar — header 7 — mobile (logged-out state — toggle visible, hide header 4 — mobile)` | `5932:10853` | **hidden**, resized to 375 |

The mobile navbar is `HORIZONTAL` / `SPACE_BETWEEN` auto-layout and reflows
cleanly at 375 (logo left, search + messages + avatar right — verified by
screenshot). Content (`Group 36` at `y 144`) untouched.

**Note:** Blog Page Mobile is **375 px** wide — neither the 390 px
Community/Auth-mobile convention nor the 428 px navbar-canon width
(Decision Log #86). Left as-is (widening the frame is a content change, out
of scope); the navbar instance was resized to match. Flagged for a future
mobile-width normalisation pass.

### 2.3 Why "both variants" on Blog but one per frame on Sports

Sports has a **dedicated frame per auth state** (`205:2` logged-out /
`1009:673` logged-in) — same as the mobile Sports frames — so each gets one
navbar. Blog has **only one desktop frame and one mobile frame**. Creating a
second (logged-out) Blog frame is new-screen work (screen-builder's lane, and
the brief said "not a Blog refresh"). So each Blog frame instead carries both
variants, the logged-out one hidden, so figma-to-code has both references for
the Phase-2 runtime `header 4 ↔ header 7` switch that `Header.tsx` already
implements. **Decision Log #169.**

---

## 3. Item 2 — Sports Page desktop (`205:2` + `1009:673`)

### 3.1 Canonical check — done first, as the brief required

`205:2` "Sports Page  - when user is not logged in" and `1009:673` "Sports
Page - when user is logged in" **are the canonical desktop Sports/Livescores
landing frames.** No differently-named replacement exists:

- Every other Sports frame on `0:1` is either a **mobile** frame
  (`5647:8023`, `5647:8169`, `5820:8976`, …, all built in PR #130) or an old
  **match-centre detail** desktop frame (`632:943` Match Details, `640:3737`
  Match Statistics, `667:1952` Lineups, `756:11` H2H, `756:6433` Standing) —
  a separate set, also legacy, also navbar-less, **not in scope for this
  task**.
- The mobile pair `5647:8023` / `5647:8169` is literally named "Sports /
  Livescores — Logged Out / Logged In — Mobile" — the mobile counterparts of
  exactly these two desktop frames.

So `205:2` / `1009:673` were retrofitted, not flagged as dead.

### 3.2 `205:2` (logged-out) → `header 7`

**Hidden** (old floating header chrome): `638:21` `Rectangle 80`,
`638:23` `Rectangle 82`, `638:24` `Login` (text), `638:25` `Scores` (text),
`638:26` `News` (text), `638:27` `fontisto:night-clear` (dark-mode toggle),
`638:29` `bx:link-external`. (`Group 103` / `360:543` — old logo + nav pill —
was **already** `visible = false`; left hidden.)

**Added:** `Navbar — header 7` (`5931:10492`), `x0 y0`, 1440 × 90.
Content starts at `y 214`; footer (`Group 47` / `205:34`) untouched.

### 3.3 `1009:673` (logged-in) → `header 4`

**Hidden** (hand-built header, identical structure to Blog Desktop's):
`1009:4398` `Rectangle 109`, `1009:4399` `Group` (logo), `1009:4407`
`Rectangle 110`, `1009:4408` `akar-icons:search`, `1009:4410` `Search
Soccernity`, `1009:4411` `Group 258` (icon nav), `1009:4423` `Ellipse 30`
(avatar), `1009:4424` `ci:notification-outline-dot`, `1009:4426`
`bx:message-dots`.

**Added:** `Navbar — header 4` (`5931:10572`), `x0 y0`, 1440 × 90.
Content (`y 214`) and footer untouched.

Both frames `clipsContent: true`, 1440 wide, navbar 1440 wide — no clipping
(the `header 4` master is now 1440 with `SPACE_BETWEEN`, per Decision Log
#164, so the avatar is not clipped).

---

## 4. Item 3 — Create Post compose frames (`5701:8328`, `5818:8962`, `5818:8997`)

### 4.1 What `5818:9031` actually is — the brief's premise was slightly off

The brief describes `5818:9031` ("… Feed Context (Pinned Post) — Mobile") as a
compose **sheet layered over a feed background** and asks which convention it
uses (scrim? background layer? annotation? frame-name?).

Direct inspection: **`5818:9031` is not a sheet-over-background at all.** It is
a standalone, full 390-wide Community frame — `Navbar — header 4 — mobile`
instance (`5818:9032`) + a `Content` frame holding a collapsed "Create a post"
row and two feed posts, one pinned with a "Contest post" badge. It shows the
**resulting feed state after a contest post is created** (the mobile
equivalent of desktop `2496:4462` "Create a post - feeds with pinned contest
post"). No scrim, no modal, no annotation. Its only "convention" is:
(a) the `Community — … — Mobile` **frame-name pattern**, and (b) it carries a
real **`Navbar — header 4 — mobile`** instance because it *is* a top-level
Community screen.

### 4.2 What the 3 compose frames actually are

`5701:8328` / `5818:8962` / `5818:8997` are **full-screen compose sub-views**:
`App Bar — Create Post` (back · "Create Post" · POST) + `Mode Tabs` +
`Content`. This is the **same established pattern** the file already uses for
`Community — Post View — Mobile` (`5779:8490`) and `Community — Profile —
Mobile` (`5702:8250`) — an `App Bar` sub-view reached by navigation, which
correctly carries **no site navbar** (the app bar is its chrome). They are
NOT bottom-sheets and NOT modals-over-a-dimmed-background. (The **desktop**
Create Post frames `2008:655` etc. *are* modal-over-scrimmed-homepage — a
different, desktop-only treatment — but those are out of scope.)

So the 3 frames are already consistent with the file's sub-view convention.
The only thing they lack, versus `5818:9031`, is any pointer to the screen
they open from.

### 4.3 What was done — annotation captions

Per the brief's own "(or annotated with a note pointing to)" option, a
**canvas caption `TEXT` node** was placed directly above each of the 3 frames
(page-level sibling, not inside the frame — the frames `clipsContent: true`,
so an in-frame note outside the content box would be invisible):

| Caption node | Above frame |
|---|---|
| `5933:10771` | `5701:8328` — Community — Create Post — Mobile |
| `5933:10772` | `5818:8962` — … With Attachment — Mobile |
| `5933:10773` | `5818:8997` — … Contest Mode — Mobile |

Caption text (identical body, per-frame heading):

> **NOTE — Community — Create Post — …— Mobile**
> Presentation context — this is a full-screen compose sub-view launched from
> the "Create a post" row on Community — Home Feed — Mobile (5701:8239). It
> deliberately carries NO site navbar: its chrome is the App Bar — Create Post
> (back · title · POST), the same sub-view pattern as Community — Post View —
> Mobile (5779:8490) and Community — Profile — Mobile (5702:8250). Opens on top
> of: Community — Home Feed — Mobile (5701:8239) — navbar Navbar — header 4 —
> mobile (5386:6576). See Community — Create Post — Feed Context (Pinned Post)
> — Mobile (5818:9031) for the resulting feed state after posting.

Inter Regular 11 / 150% line-height, 360 px wide, fill bound to
`color/text/secondary` (`VariableID:5096:9`). `5818:9031` itself was **not
touched**. **Decision Log #170.**

---

## 5. Standing rules — verification

- **Palette:** only `brand/navy`, `brand/green`, `brand/green-tint` (12%),
  `color/background/*`, `color/text/*`, `color/icon/inactive` appear on
  authored/edited nodes. **No `brand/green-tint-28`. No new colours. Light
  mode only.**
- **Paint audit (node-by-node) of everything authored or edited:**

  | Node | SOLID paints | unbound | off-palette | green-tint-28 | IMAGE fills |
  |---|---|---|---|---|---|
  | `5931:10492` Sports `205:2` header 7 | 40 | 0 | 0 | 0 | 0 |
  | `5931:10572` Sports `1009:673` header 4 | 45 | 0 | 0 | 0 | 1 (avatar) |
  | `5932:10661` Blog desktop header 4 | 45 | 0 | 0 | 0 | 1 (avatar) |
  | `5932:10752` Blog desktop header 7 (hidden) | 1 | 0 | 0 | 0 | 0 |
  | `5932:10832` Blog mobile header 4 — mobile | 12 | 0 | 0 | 0 | 1 (avatar) |
  | `5932:10853` Blog mobile header 7 — mobile (hidden) | 1 | 0 | 0 | 0 | 0 |
  | `5933:10771/2/3` captions | 1 each | 0 | 0 | 0 | 0 |

  The three `IMAGE` fills are the avatar placeholder inside `header 4` /
  `header 4 — mobile` — **pre-existing shared-component debt**, not editable
  from an instance, excluded on the same basis as every prior mobile PR.
- **Reuse:** every navbar added is an instance of the existing canonical
  component set `2824:4309` — nothing redrawn. Hidden chrome is retained
  (`visible = false`), not deleted.
- **Header band re-scan of all 4 retrofitted frames:** the only visible node
  in the header band of each is the new navbar instance — no stray old chrome
  peeking through.
- **No frame widths or content changed.** Extra whitespace between the navbar
  (ends `y 90` desktop / `y 64` mobile) and the pre-existing content start
  (`y 171` Blog desktop, `y 214` Sports, `y 144` Blog mobile) is left as-is —
  scoped to navbar consistency, not a layout redesign.
- **No real browser / Playwright check** — not available in this environment;
  same verification ceiling as every prior Figma PR in this project. Figma
  screenshots were used throughout.

---

## 6. What each retrofitted frame now uses

| Frame | ID | Navbar instance(s) |
|---|---|---|
| Blog Page Desktop | `1009:128` | `header 4` visible (`5932:10661`) + `header 7` hidden (`5932:10752`) |
| Blog Page Mobile | `41:4` | `header 4 — mobile` visible @375 (`5932:10832`) + `header 7 — mobile` hidden @375 (`5932:10853`) |
| Sports Page — not logged in | `205:2` | `header 7` (`5931:10492`) |
| Sports Page — logged in | `1009:673` | `header 4` (`5931:10572`) |
| Create Post — Mobile | `5701:8328` | none (compose sub-view) — caption `5933:10771` names bg = `5701:8239` / `header 4 — mobile` |
| Create Post — With Attachment — Mobile | `5818:8962` | none — caption `5933:10772` |
| Create Post — Contest Mode — Mobile | `5818:8997` | none — caption `5933:10773` |

`205:2` / `1009:673` are **confirmed canonical** — not superseded by any other
frame.

---

## 7. Decision Log candidates (for the finalising session — Section 9, Table 6)

Numbering continues from the live docx (last row ≈ #168). Verify the true max
before inserting.

| # | Decision needed | Raised in | Status |
|---|---|---|---|
| 169 | Blog has only one desktop frame (`1009:128`) and one mobile frame (`41:4`) — unlike Sports, which has a dedicated frame per auth state. This pass put **both** navbar variants on each Blog frame (`header 4` visible, `header 7` hidden) rather than creating a second logged-out Blog frame (screen-builder's lane). Confirm this is acceptable, or have `figma-screen-builder` add dedicated logged-out Blog Desktop + Mobile frames so each carries a single navbar like every other screen. Also: the **default visible** variant was set to logged-in (`header 4`), matching the frames' pre-existing logged-in chrome — but the canonical homepage (`5204:6728`) defaults to logged-out (`header 7`) as a marketing page; is Blog a logged-out-first content page (→ flip the default) or logged-in-first? | `sprint-2/blog-sports-navbar-retrofit` | Open — dual-variant + logged-in default chosen meanwhile; trivially reversible |
| 170 | The brief for Item 3 described `Community — Create Post — Feed Context (Pinned Post) — Mobile` (`5818:9031`) as a compose sheet layered over a feed background. It is not — it is a standalone post-creation **feed-state** frame with a real `Navbar — header 4 — mobile` instance (mobile equivalent of desktop `2496:4462`). The 3 Create Post compose frames correctly follow the file's **other** established convention — a full-screen `App Bar — Create Post` sub-view, identical to `Community — Post View — Mobile` (`5779:8490`) and `Community — Profile — Mobile` (`5702:8250`), which correctly carry no site navbar. Resolved by adding canvas caption `TEXT` notes above the 3 frames naming the background screen (`5701:8239`) and its navbar (`header 4 — mobile`, `5386:6576`). Confirm captions are the right mechanism, vs. a dedicated "Community — Design Notes & Open Decisions" frame (none exists yet for the Community section). | `sprint-2/blog-sports-navbar-retrofit` | Open — captions added meanwhile |
| 171 | `Blog Page Mobile` (`41:4`) is **375 px** wide — neither the 390 px Community/Auth-mobile convention nor the 428 px navbar canon (Decision Log #86). The added navbar instance was resized to 375; the frame width was left unchanged (a content change is out of this pass's scope). Fold into a mobile-width normalisation pass. | `sprint-2/blog-sports-navbar-retrofit` | Open — deferred, minor |

---

## 8. CLAUDE.md "Where things stand right now" bullet (for the finalising session)

> - **`sprint-2/blog-sports-navbar-retrofit` (figma-design-system, 2026-09-03)
>   brings four legacy pre-redesign frames onto the canonical navbar and
>   documents the Create Post overlay context — Figma design only, no app code
>   (`BlogPage.tsx` / `SportsHubPage.tsx` are still `PlaceholderPage` stubs, so
>   there is nothing to convert).** Full detail:
>   `docs/sprint-2-blog-sports-navbar-retrofit-report.md`.
>   - **Blog Page Desktop (`1009:128`)** — hand-built header hidden; instances
>     `header 4` (visible) + `header 7` (hidden) added. **Blog Page Mobile
>     (`41:4`)** — stale hamburger (`43:8`) + old logo hidden; `header 4 —
>     mobile` (visible, resized 428→375) + `header 7 — mobile` (hidden) added.
>     Blog has one frame per breakpoint (unlike Sports' frame-per-auth-state),
>     so each Blog frame carries both variants — Decision Log #169.
>   - **Sports Page desktop** — confirmed `205:2` (logged-out) and `1009:673`
>     (logged-in) are the **canonical** desktop Sports/Livescores frames (no
>     newer replacement; the match-centre detail frames `632:943` etc. are a
>     separate legacy set, out of scope). Old header chrome hidden; `205:2` →
>     `header 7` (`5931:10492`), `1009:673` → `header 4` (`5931:10572`).
>   - **Create Post compose frames (`5701:8328`, `5818:8962`, `5818:8997`)** —
>     the brief's premise that `5818:9031` layers a sheet over a feed
>     background was inaccurate: `5818:9031` is a standalone post-creation
>     feed-state frame with a real `header 4 — mobile` navbar. The 3 compose
>     frames correctly follow the file's `App Bar` sub-view convention (same
>     as Post View / Profile mobile) and take no site navbar. Added canvas
>     caption notes (`5933:10771/2/3`) above each naming the background screen
>     (`5701:8239`) + navbar (`5386:6576`). Decision Log #170.
>   - 0 unbound / 0 off-palette / 0 `green-tint-28` on every authored node
>     (the 3 avatar `IMAGE` fills inside `header 4`/`header 4 — mobile` are
>     pre-existing shared-component debt). New Decision Log candidates
>     **#169–#171**.
>   - **Not committed / not a PR yet** — this session had no shell access;
>     branch creation, commit, push, PR, and the docx Decision Log
>     transcription are outstanding for a finalising session (same as PRs
>     #98 / #102 / #110). Figma writes are applied and verified.

---

## 9. Deliverables checklist

- [x] Blog Page Desktop + Mobile — canonical navbar instances added, hand-built
      header + hamburger hidden.
- [x] Sports `205:2` / `1009:673` — confirmed canonical, retrofitted
      (`header 7` / `header 4`).
- [x] Create Post 3 compose frames — annotation captions added naming the
      background screen + navbar; `5818:9031`'s real nature documented.
- [x] Paint audit — 0 unbound / 0 off-palette / 0 green-tint-28.
- [x] Screenshots captured for all 4 retrofitted frames + captions.
- [x] This report.
- [ ] **Branch / commit / push / PR** — blocked on shell access (finalising
      session).
- [ ] **CLAUDE.md bullet** (drafted in §8) — apply in the finalising session
      (or here if a later tool call can edit it — see below).
- [ ] **Build Plan Decision Log #169–#171** — transcribe via python-docx
      (finalising session).
