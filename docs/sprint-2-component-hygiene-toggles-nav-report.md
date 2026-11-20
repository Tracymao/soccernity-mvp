# Sprint 2 — Component hygiene: Settings toggles, sidebar-nav typo, dead-component archival

**Branch:** `sprint-2/component-hygiene-toggles-nav` (stacks on PR #116 /
`sprint-2/mobile-settings-community-message-rebuild`)
**Agent:** `figma-design-system`
**Scope:** Figma design file only (`Soccernity-MVP`, key
`weZWWqggy9j13eX8bhFgs6`, page `0:1`). No app/backend code. Not merged.

All new/changed paints are bound to the one real collection **Soccernity
Theme** (`VariableCollectionId:5096:2`), Light mode. No new colour. No
`brand/green-tint-28`. No dark-mode work. The `Settings Toggle` component
carries its own token bindings, so every instance placed in this pass
inherits them — no per-instance paint editing was needed or done.

---

## 0. Summary table

| Task | Change | Key node IDs |
|---|---|---|
| 1 | 13 effectively-visible desktop Settings toggle controls (11 raw `Rectangle 352` squares + 2 `Component 22` sliders) swapped to `Settings Toggle` `State=Off` instances | new instances `5745:8387/8390/8393/8396`, `5748:8393/8396/8399/8402/8405/8408/8411/8414/8417` |
| 1 | Dead `Toggle Switch` component **deleted** (0 instances file-wide, confirmed). Its two nested component definitions `Component 22` (`2927:10191`) + `Component 23` (`2927:10192`) went with it — both had 0 external instances after the swaps. 0 broken instances file-wide afterwards. | `2927:10195` (deleted), `2927:10191` (deleted), `2927:10192` (deleted) |
| 2 | Variant value `Property 1=Disolay and language` → `Property 1=Display and language` on the Settings sidebar-nav component set `Frame 5904` | variant `2906:7226`, set `2906:7170` |
| 3 | Dead legacy chat-dropdown family archived → `Old — Mobile Drop Down Components` | set `1870:2753` (variants `1870:2745`–`1870:2752`) |
| 3 | **OPEN Decision Log item** flagged: Build Plan Section 6 Sprint-3 messaging bullet still cites "the existing Drop Down Components chat frames" as the DM source — superseded by PR #116's live Message pillar. Needs founder sign-off; action in a separate documentation pass. | — |
| 4 | Abandoned bottom-nav icon set archived → `Old — Mobile App Nav Icons` | set `2230:4328` (variants `2230:4321`–`2230:4327`) |

---

## 1. TASK 1 — desktop Settings toggle retrofit

### 1.1 What "raw toggle" actually meant in this file

The brief's premise ("desktop Settings screens use raw one-off rectangles
e.g. `Rectangle 352` for toggle switches") was **partly** right and needed
correcting against the live file:

- `Rectangle 352` is a heavily-reused generic name — it appears as 26×26
  checkbox-style squares, as 536×31 input-field backgrounds, and as other
  scaffolding. Only the **26×26, `brand/green-tint`-filled** instances that
  sit at the right edge of a settings row are the toggle controls. They
  render as a plain pale-green rounded square with no knob — a broken
  "raw" toggle. PR #116 already converted the mobile equivalents of these
  exact rows to `Settings Toggle`, which confirms they are toggles.
- Two rows (`Turn on push notifications`, `Turn on email notifications`)
  did **not** use a raw rectangle — they used an instance of a *different*
  local toggle component, **`Component 22`** (`2927:10191`), a thin
  green-tint track + navy knob. This is exactly the "mix of toggle
  implementations" the standardisation is meant to end, so it was folded
  into the same swap.
- The old `Toggle Switch` component `2927:10195` has **0 instances
  file-wide** (confirmed on page `0:1` and the `dump` page) — it is a
  92×87 demo artboard holding two stacked instances (`Component 22` off +
  `Component 23` on), not a variant set. It is genuinely dead and is NOT
  what desktop uses.

### 1.2 Screens enumerated (18 desktop user-facing Settings frames)

`2905:4798` Overview · `2922:6396` Account Info (Confirm Password) ·
`2926:8056` Security Overview · `2926:9230` Notifications (Mute & Filter) ·
`2926:9721` Notification Preferences · `2927:9954` Push Notifications ·
`2927:10205` Email Notifications · `2926:9482` Mute New Accounts ·
`2926:8294` Two-Factor Auth (SMS) · `2926:8764` Direct Messages & Read
Receipts · `2926:8996` Sensitive Content & 2FA App · `2924:6870` Change
Password · `2924:7112` Account Information (Edit) · `2924:7358` Deactivate
Account (Intro) · `2922:5143` Security & Account · `2922:5382` Privacy &
Safety · `2922:5602` Notification Preferences (By Type) · `2922:5832`
Display, Language & Region.

(The four hyphen-named 1024-tall `Settings` frames — `1658:2303`,
`1658:2456`, `1658:2592`, `5403:7205` — are **Admin Panel**, out of scope,
tracked under Decision Log #52.)

### 1.3 Toggle-control inventory (effective visibility computed through all ancestors)

**Effectively visible → swapped (13):**

| # | Frame | Row label | Old node | Kind | New instance |
|---|---|---|---|---|---|
| 1 | Notifications (Mute & Filter) | Quality filter | `2926:9459` | square | `5748:8393` |
| 2 | Email Notifications | New notifications | `2927:10450` | square | `5745:8387` |
| 3 | Email Notifications | Direct messages | `2927:10444` | square | `5745:8390` |
| 4 | Email Notifications | Posts emailed to you | `2927:10447` | square | `5745:8393` |
| 5 | Email Notifications | Turn on email notifications | `2927:10326` | `Component 22` | `5745:8396` |
| 6 | Push Notifications | Turn on push notifications | `2927:10202` | `Component 22` | `5748:8417` |
| 7 | Mute New Accounts | People you don't follow | `2926:9599` | square | `5748:8396` |
| 8 | Mute New Accounts | People who don't follow you | `2926:9713` | square | `5748:8399` |
| 9 | Mute New Accounts | People with a new account | `2926:9716` | square | `5748:8402` |
| 10 | Two-Factor Auth (SMS) | Text message | `2926:8415` | square | `5748:8405` |
| 11 | Two-Factor Auth (SMS) | Authentication app | `2926:8527` | square | `5748:8408` |
| 12 | Direct Messages & Read Receipts | Read receipts | `2926:8882` | square | `5748:8411` |
| 13 | Sensitive Content & 2FA App | Mark media you post as … sensitive | `2926:9114` | square | `5748:8414` |

All 13 were set to **`State=Off`** (`5694:8213`): the squares were empty
pale-green (= off); both `Component 22` sliders had the knob at the left
(= off).

**Before / after counts:**

- Raw `Rectangle 352` toggle squares, effectively visible, before: **11**;
  after: **0** (re-scanned all 18 frames).
- Old-component toggle sliders (`Component 22`), effectively visible,
  before: **2**; after: **0**.
- `Settings Toggle` instances file-wide, before: **13** (all mobile, from
  PR #116 — 5 Off / 8 On); after: **26** (13 mobile + 13 new desktop —
  **18 Off / 8 On**).

### 1.4 Placement method

Each `Settings Toggle` instance (44×24) was inserted into the same
auto-layout row frame the old control lived in, then set to
`layoutPositioning = 'ABSOLUTE'` and pinned so its **right edge matches the
replaced control's right edge** and it is **vertically centred** in the
row. This is a pixel-faithful swap, not a redesign. It uses absolute
positioning (rather than auto-layout flow) because these rows use a large
fixed gap between label and control; leaving the wider 44px toggle in flow
pushed it ~18px past the row's right edge. Absolute pinning reproduces the
original visual slot exactly.

Pre-existing quirk preserved, not fixed: the "Posts emailed to you" row
(`Frame 5934`, 566px wide vs its siblings' 543–544px) already placed its
control ~22px further right than the other Email rows. The new toggle
inherits that same misalignment. This is a layout inconsistency in the
source design, not a token issue — flagged, left for a future layout pass.

### 1.5 `Toggle Switch` / `Component 22` / `Component 23` disposition

- `Toggle Switch` `2927:10195`: pre-deletion instance count **0**
  (confirmed) → **deleted** per brief.
- `Component 22` `2927:10191` and `Component 23` `2927:10192` were **nested
  component definitions inside `Toggle Switch`** (not top-level page
  components, as their instance-mapping IDs first suggested). Deleting
  `Toggle Switch` removed them too. This is acceptable and in fact the
  cleaner outcome: after the two external `Component 22` instances were
  swapped in §1.3, both had **0 external instances**. A full-page
  post-deletion scan found **0 broken instances** — nothing else in the
  file referenced either component.
- Net result: **one** canonical toggle component in the file
  (`Settings Toggle` `5694:8219`), zero dead toggle components.

### 1.6 Residual — 5 effectively-hidden raw squares, left in place (flagged)

Five `Rectangle 352` 26×26 toggle-squares remain in the file but are
**effectively hidden** (an ancestor `Frame 5920` / `Frame 5933` /
`Frame 5927` is `visible:false` — abandoned template scaffolding rows,
superseded by the visible content):

| Frame | Node | Hidden ancestor |
|---|---|---|
| Notification Preferences (`2926:9721`) | `2926:9838` | `Frame 5920` (`2926:9835`) |
| Push Notifications (`2927:9954`) | `2927:10071` | `Frame 5920` (`2927:10068`) |
| Email Notifications (`2927:10205`) | `2927:10322` | `Frame 5920` (`2927:10319`) |
| Direct Messages (`2926:8764`) | `2926:8887` | `Frame 5927` (`2926:8884`) |
| Sensitive Content (`2926:8996`) | `2926:9119` | `Frame 5927` (`2926:9116`) |

They render on no screen. They were **not** swapped or deleted, to avoid
regression risk on a hidden/alternate prototype state that a future pass
might legitimately rely on. `Toggle Switch` was still deleted because it is
an independent, genuinely dead top-level component and these hidden rects
do not change that. Follow-up: a future Settings-desktop layout pass should
delete the abandoned `Frame 5920` / `Frame 5927` scaffolding wholesale.

---

## 2. TASK 2 — Settings sidebar-nav typo

**Component set:** `Frame 5904` `2906:7170`, single VARIANT property
`Property 1`. **Variant fixed:** `2906:7226`.

`Property 1=Disolay and language` → **`Property 1=Display and language`**.

### Why "Display and language" and NOT "Display, Language and Region"

The brief allowed matching the standardised visible label
("Display, Language and Region", per PR #114 / mobile frame `5649:8140`)
"for consistency". It was **deliberately not used** for the variant *value*:

1. **Comma parsing risk (decisive).** Figma parses a variant component's
   name by splitting `Property=Value` pairs on `", "`. A value containing
   `", "` ("Display**, **Language and Region") would be read as two
   properties on this single-property set and could corrupt
   instance→variant resolution across all 90 instances. `"Display and
   language"` has no comma.
2. **Convention.** Every sibling variant value on this set is lowercase and
   comma-free (`security and account access`, `privacy and safety`,
   `notification`). `"Display and language"` matches; it also just fixes
   the `Disolay` typo with the minimum change.
3. The *visible* nav label is a separate text node and is the thing users
   actually read — it is unaffected by the variant-value name and can be
   standardised independently.

### Before / after instance resolution

- Instances of `Frame 5904` file-wide: **90**, unchanged.
- Instances resolving to the old value before: **17**
  (`2906:7259`, `2922:6500`, `2926:8160`, `2926:9334`, `2926:9825`,
  `2927:10058`, `2927:10309`, `2926:9586`, `2926:8398`, `2926:8869`,
  `2926:9101`, `2924:6974`, `2924:7216`, `2924:7462`, `2922:5247`,
  `2922:5486`, `2922:5706`).
- Instances resolving to the new value after: **the same 17 IDs**
  (verbatim), auto-migrated by Figma.
- Unresolved / detached / "missing variant" instances after: **0**.
- `dump` page has 0 instances of this set — 17 is the full file-wide count.

### Flagged, not fixed

The visible nav label still reads **"Display, Languages And Region"**
(underlying text `display, languages and region`, rendered title-case by
the component's text styling). PR #114 standardised this string elsewhere
to **"Display, Language and Region"** (singular "Language"). Fixing the
component's internal label text would change the rendered label on all ~90
instances — out of scope for this typo-only task and worth its own small
pass. Recorded as a follow-up.

---

## 3. TASK 3 — dead legacy chat-dropdown family archived

**Component set `1870:2753` "Mobile Drop Down Components"**, 8 variants
(`1870:2745`–`1870:2752`): `Property 1=Frame 5`, `Chat Options` ×3,
`Messages Window` ×2, `Chat Window`, `Notifications`. (The set also has
duplicate variant-property values — it is a malformed set — but that is
moot for archival.)

- **0 instances file-wide** — confirmed on page `0:1` and the `dump` page.
- **Action:** set renamed `Mobile Drop Down Components` →
  **`Old — Mobile Drop Down Components`** (the `Old —` prefix convention
  the brief specifies for dead *components*, distinct from PR #116's
  `ARCHIVED —` + hidden convention for dead *frames*). Left in place at its
  current canvas position (`x 11579, y 10839`); not relocated — moving a
  2498×1611 set risks overlapping neighbouring content and the name prefix
  is the agreed signal. Variant child names left as-is (prefixing
  `Property 1=` values would be noise).

### Build Plan citation — OPEN Decision Log item for founder sign-off

Build Plan **Section 6, Sprint 3 messaging bullet** cites *"the existing
Drop Down Components chat frames"* as the intended source for the DM /
messaging UI. That is now stale: **PR #116 built the real, live Message
pillar** (`Message — Conversation Actions Menu` `5706:8270` + 6 new Message
frames, desktop + mobile) **without** using this dead family. The Section 6
citation needs a founder-approved correction to point at the PR #116
Message pillar instead. **This report does not edit the Build Plan.**
Recorded as an OPEN Decision Log entry (see §6) to be actioned in a
separate documentation pass.

---

## 4. TASK 4 — abandoned bottom-nav icon set archived

**Component set `2230:4328` "Mobile App Nav Icons"**, 7 variants
(`2230:4321`–`2230:4327`): `fixture`, `leaderboard`, `settings`, `home`,
`news`, `message`, `notification`. An abandoned alternate mobile bottom-tab
concept — every real mobile screen uses the top Navbar instead.

- **0 instances on page `0:1`** (the real content page).
- **2 instances on the `dump` scratch page** — both of the `home` variant
  (`2230:4324`): nodes `5233:35118` and `5233:36237`. Per CLAUDE.md the
  `dump` page is "unused scratch, ignore it". Not strictly 0 file-wide, but
  0 on any real screen.
- **Action:** set renamed `Mobile App Nav Icons` →
  **`Old — Mobile App Nav Icons`**. Left in place (`x 6668, y 11538`).
  The 2 dump instances are unaffected by a parent-set rename (they resolve
  by main-component ID + variant props, both intact).

---

## 5. Verification performed

- Every instance count in this report was obtained by
  `page.findAllWithCriteria({types:['INSTANCE']})` + `getMainComponentAsync`
  on each instance and matching against the target component / component-set
  IDs — no counts were assumed. Both page `0:1` and the `dump` page
  (`2155:1285`) were checked; the cover page has 0 children.
- Task 1: 6 swapped content frames screenshot-verified (Email, Push,
  Two-Factor, Mute & Filter, Mute New Accounts, Direct Messages, Sensitive
  Content) — all toggles render as correct Off-state switches, layout
  preserved. Post-swap re-scan of all 18 frames: **0** effectively-visible
  raw toggle rectangles remain.
- Task 1: post-deletion full-page scan → **0 broken instances**
  (null `mainComponent`).
- Task 2: 17 instance IDs captured before and after the rename — identical
  set, 0 unresolved.
- Tasks 3 & 4: 0-instance confirmation on `0:1`; 2 `dump`-only instances
  for Task 4 disclosed.

No real browser / prototype-runtime check is available in this environment
(the standing ceiling for every design-stage PR in this project).

---

## 6. Decision Log entries to add (Build Plan Section 9, Table 6)

Confirmed at finalisation: the live docx Table 6 ended at **#120** (PR #116
added #107–#120); these were transcribed as **#121–#124**.

- **#121 — Desktop Settings toggle retrofit + `Toggle Switch` deletion.**
  13 effectively-visible desktop Settings toggle controls (11 raw
  `Rectangle 352` squares + 2 `Component 22` sliders) replaced with
  `Settings Toggle` (`5694:8219`) `State=Off` instances, pixel-pinned to
  the original slot. Dead `Toggle Switch` `2927:10195` deleted (0 instances
  file-wide); its nested `Component 22` (`2927:10191`) / `Component 23`
  (`2927:10192`) definitions went with it (0 external instances after the
  swap; 0 broken instances file-wide afterwards). 5 effectively-hidden
  `Rectangle 352` squares inside `visible:false` template scaffolding left
  in place (non-rendering; a future Settings-desktop layout pass should
  remove the abandoned `Frame 5920` / `Frame 5927` scaffolding). Status:
  **Resolved (Figma design).**

- **#122 — Settings sidebar-nav variant typo.**
  `Frame 5904` (`2906:7170`) variant value `Property 1=Disolay and
  language` → `Property 1=Display and language`. Not renamed to the
  standardised visible label "Display, Language and Region" because a comma
  in a single-property Figma variant value is parsed as a property
  separator and would corrupt instance→variant resolution. All 17
  instances auto-migrated, 0 detached. Open sub-item: the component's
  internal visible label still reads "Display, Languages And Region"
  (plural) vs PR #114's standardised "Display, Language and Region" —
  a ~90-instance text change, deferred to its own pass. Status:
  **Resolved (variant value); label wording follow-up open.**

- **#123 — Dead legacy chat-dropdown component family archived + Build
  Plan Section 6 citation correction (OPEN, founder sign-off).**
  `Mobile Drop Down Components` set (`1870:2753`, 8 variants) has 0
  instances file-wide → renamed `Old — Mobile Drop Down Components`.
  **Open for founder sign-off:** Build Plan Section 6's Sprint 3 messaging
  bullet still cites "the existing Drop Down Components chat frames" as the
  DM source; PR #116 built the real Message pillar (`5706:8270` + 6 frames)
  without it. The Section 6 citation must be corrected to point at the
  PR #116 Message pillar — to be actioned in a separate documentation
  pass once approved. Status: **Component archived (Resolved); Section 6
  citation correction Open.**

- **#124 — Abandoned bottom-nav icon component set archived.**
  `Mobile App Nav Icons` set (`2230:4328`, 7 variants) has 0 instances on
  page `0:1` (2 `home`-variant instances exist only on the ignored `dump`
  scratch page) → renamed `Old — Mobile App Nav Icons`. The real mobile
  screens use the top Navbar; this bottom-tab concept was never adopted.
  Status: **Resolved (Figma design).**

---

## 7. Follow-up shell-session steps (no Bash available this session)

All Figma edits above are already live in the file. Remaining, for a
session with shell access:

1. `git fetch origin`
2. `git switch sprint-2/mobile-settings-community-message-rebuild`
   (the PR #116 branch — **not** `main`; the DL entries here follow #116's
   #107–#120 which exist only on that branch)
3. `git switch -c sprint-2/component-hygiene-toggles-nav`
4. Apply the CLAUDE.md "Where things stand right now" bullet (added in this
   working tree already — re-apply / cherry-pick if the branch base
   differs) directly above the "Community, Sports Hub, and Admin Console
   remain the strongest-designed pillars" line.
5. Add this report file (`docs/sprint-2-component-hygiene-toggles-nav-report.md`).
6. `docs/Soccernity_MVP_Build_Plan_v1.7.docx` via `python-docx`: read the
   last row of Section 9 / Table 6, confirm it is #120, then append
   #121–#124 exactly as drafted in §6 above. If the last row is not #120,
   use the real next free integer and note the shift.
7. Commit; push; open a PR **against `main`**, body noting it **stacks on
   PR #116** (`sprint-2/mobile-settings-community-message-rebuild`) and
   must not merge before it. **Do not merge.**

### CLAUDE.md bullet (for step 4)

> - **`sprint-2/component-hygiene-toggles-nav` — component hygiene pass
>   over the Settings toggles and dead component families** (Figma design
>   only, stacks on PR #116). Full detail:
>   `docs/sprint-2-component-hygiene-toggles-nav-report.md`. Decision Log
>   **#121–#124** (reconfirm numbering — #116's docx ended at #120).
>   - **Desktop Settings toggles standardised on `Settings Toggle`
>     (`5694:8219`).** 13 effectively-visible controls across 7 Settings
>     desktop frames — 11 raw `Rectangle 352` pale-green squares + 2
>     `Component 22` sliders — swapped to `State=Off` instances, pinned to
>     the exact original slot (component swap, not redesign). `Settings
>     Toggle` instances file-wide: 13 → 26 (18 Off / 8 On).
>   - **Dead `Toggle Switch` `2927:10195` deleted** (0 instances,
>     confirmed). Its nested `Component 22` (`2927:10191`) / `Component 23`
>     (`2927:10192`) definitions went with it — 0 external instances after
>     the swap, 0 broken instances file-wide afterwards. One canonical
>     toggle component now.
>   - **5 effectively-hidden `Rectangle 352` toggle-squares** inside
>     `visible:false` template scaffolding left in place (non-rendering);
>     a future Settings-desktop layout pass should delete the abandoned
>     `Frame 5920` / `Frame 5927` rows.
>   - **Settings sidebar-nav typo fixed:** `Frame 5904` (`2906:7170`)
>     variant value `Property 1=Disolay and language` →
>     `Property 1=Display and language` (NOT "Display, Language and Region"
>     — a comma in a single-property variant value is parsed as a property
>     separator). All 17 instances auto-migrated, 0 detached. The
>     component's internal visible label still reads "Display, Languages
>     And Region" (plural) — a ~90-instance text change deferred.
>   - **Dead component families archived (`Old —` prefix, not deleted):**
>     `Mobile Drop Down Components` (`1870:2753`, 8 variants, 0 instances
>     file-wide) → `Old — Mobile Drop Down Components`; `Mobile App Nav
>     Icons` (`2230:4328`, 7 variants, 0 instances on `0:1`, 2 on the
>     ignored `dump` page) → `Old — Mobile App Nav Icons`.
>   - **OPEN — founder sign-off:** Build Plan Section 6's Sprint 3
>     messaging bullet still cites "the existing Drop Down Components chat
>     frames" as the DM source; superseded by PR #116's live Message
>     pillar (`5706:8270` + 6 frames). Section 6 citation needs a
>     founder-approved correction in a separate documentation pass.
>   - Not merged — same standing instruction every design-stage PR follows.
