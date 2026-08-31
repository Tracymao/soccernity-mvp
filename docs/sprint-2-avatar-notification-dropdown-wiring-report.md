# Sprint 2 — Avatar Notification Dropdown Wiring

**Branch (to be created in a follow-up shell session):** `sprint-2/avatar-notification-dropdown-wiring`
**Stacks on:** `sprint-2/notification-bell-navbar-slot` (PR #113, still open, NOT merged) — this pass must mark that branch's Decision Log #93–#98 as superseded/resolved, and those entries exist only on that branch.
**Agent:** figma-design-system
**Scope:** Figma design only. No application or backend code touched.
**Status:** All Figma writes are live in the file `Soccernity-MVP` (`weZWWqggy9j13eX8bhFgs6`), page `0:1`. Git branch/commit/PR and the Build Plan `.docx` Decision Log edits are **not done this session — no shell access** — and must be finalised in a follow-up shell session, same as PRs #98 / #102 / #110. Not to be merged.

---

## 0. Why this pass exists — founder override of PR #113

PR #113 discovered that the two nodes everyone had been treating as empty "Notification Bell Icon" components are actually the **user-avatar** component:

- `2819:4090` "Notification Bell Icon/no notification" — an `IMAGE`-filled ellipse (the profile photo), **~85 instances** across the file.
- `2819:4089` "Notification Bell Icon/notification" — the same photo **plus** a small `#fa0606` unread-indicator dot (`Ellipse 98`, `2819:4084`). **0 instances.**

PR #113 proposed (Decision Log #93–#98) building a **new** `Notification Bell` component set with a `Has Unread` variant, wiring it into a navbar slot, etc.

**The founder has overridden that.** There is to be **no new bell component and no new artwork**. The existing round avatar **is** the intended notification indicator:

- Clicking the avatar opens a dropdown with rows **Profile / Message / Notification / Settings / Log out**.
- The **Notification** row carries the unread counter and links to the full Notification Centre (built in PR #112).

Everything needed already exists as components. This pass **wires them together**.

Consequently:

| PR #113 Decision Log entry | New status |
|---|---|
| #93 (build a new Notification Bell component set) | **SUPERSEDED** — no new bell component; the avatar is the indicator |
| #94 (bell on logged-in navbar variants only) | **SUPERSEDED** — folded into the avatar/dropdown wiring here |
| #95 (`Has Unread` variant on the new bell) | **SUPERSEDED** — replaced by DL #103 below (combine the *existing* avatar + dropdown pairs into variant sets) |
| #96 (bell dropdown → Notification Centre routing) | **SUPERSEDED** — replaced by the concrete Task 4 wiring here |
| #97 (`#fa0606` off-palette sweep deferred) | **RESOLVED** — Task 5, `semantic/alert` token now bound across 110 paints |
| #98 (Bants desktop active/inactive dot variant) | **Unchanged** — unrelated to this pass |

---

## 1. What shipped

| Task | Change | Key node IDs |
|---|---|---|
| 1 | Renamed `2819:4090` → **`Avatar/no notification`**; `2819:4089` → **`Avatar/notification`**. Name + `description` only. Zero appearance change — verified on 4 instances (main-component link + fills intact). | `2819:4090`, `2819:4089` |
| 2 | Created COLOR variable **`semantic/alert`** in the `Soccernity Theme` collection (`VariableCollectionId:5096:2`). `#FA0606` in **both** Light (`5096:0`) and Dark (`5096:1`) modes. Scopes: `FRAME_FILL, SHAPE_FILL, TEXT_FILL, STROKE_COLOR`. Bound `Ellipse 98` (the unread dot) to it. | var `VariableID:5670:8226`; `2819:4084` |
| 3 | `ON_CLICK → OPEN_OVERLAY` from the navbar avatar instance to `Dropdown menu/no notification` (`2841:5361`), `overlayRelativePosition {x:-111,y:31}` (mirrors the existing pattern). Wired on the two logged-in navbar variants' avatar instances. Also corrected `Avatar/notification`'s own stale overlay target `2841:5361` → `2841:5363` (0 instances, harmless). | `2838:3579` (header 4 desktop), `5387:7675` (header 4 — mobile), `2819:4089` |
| 4 | `ON_CLICK → NAVIGATE` from the **Notification** row of both dropdowns to the **desktop** Notification Centre `5640:7815`. | `2841:5368` ("notification on"), `2819:4077` ("no notification") |
| 5 | Bound **110** hardcoded `#fa0606` paints to `semantic/alert`. Excluded **1** (external brand mark). Final rescan: 0 unbound `#fa0606` remain except that one exclusion. | see §6 |

---

## 2. Semantic-red token decision

| Field | Value |
|---|---|
| Name | `semantic/alert` |
| Variable ID | `VariableID:5670:8226` |
| Collection | `Soccernity Theme` (`VariableCollectionId:5096:2`) |
| Type | COLOR |
| Light mode (`5096:0`) | **`#FA0606`** (`rgb(250, 6, 6)`) |
| Dark mode (`5096:1`) | **`#FA0606`** — identical |
| Scopes | `FRAME_FILL`, `SHAPE_FILL`, `TEXT_FILL`, `STROKE_COLOR` |

**Hex choice:** kept `#FA0606` exactly rather than normalising to a "cleaner" red. It is the value already in use across ~110 nodes; keeping it makes the sweep a pure hex→token rebind with zero visual change, and avoids a second judgment call over which arbitrary red to substitute.

**Light == Dark:** every use is a small, non-text indicator (an unread dot ~8px, win-loss form dots, small delete/block icons, a short "Block User" label). At `#FA0606` saturation the colour has adequate separation from both a white surface and the near-black `color/background/page` dark value (`#0D0F21`), and a distinct dark-mode red would risk drifting toward pink/maroon and reading as a *different* state. If a future dark-mode contrast pass finds a specific failure on a text use, adjust the Dark value's lightness only and disclose it then.

**Palette exception — disclosed:** this is a **founder-authorised, deliberate exception to non-negotiable #3** (Soccernity's palette is exactly two colours — green `#7BB929`, navy `#282E65`). Red is retained as a *semantic* colour for **loss / destructive / alert** contexts only — never as a brand or decorative colour. It is now a single bound token, not scattered loose hexes, so its usage is auditable.

---

## 3. All 4 Navbar variants — checked

Component set: **`Web app Navbar - Desktop and Mobile`** (`2824:4309`), 4 variants.

| Variant | ID | Logged-in / out | Avatar present? | Dropdown wired? |
|---|---|---|---|---|
| `Property 1=header 4` | `2838:3502` | **Logged-in, desktop** | Yes — `Component 20` instance `2838:3579` (main `2819:4090`) in `Frame 5880` | **Wired** → `2841:5361` overlay |
| `Property 1=header 4 — mobile` | `5386:6576` | **Logged-in, mobile** | Yes — `Avatar` instance `5387:7675` (main `2819:4090`) in `Actions` | **Wired** → `2841:5361` overlay |
| `Property 1=header 7 — mobile` | `5386:6575` | **Logged-out, mobile** | **No avatar** — correct | n/a (correct) |
| `Property 1=header 7` | `2841:4104` | **Logged-out, desktop** | **Yes — a stray `Component 20` avatar instance `2841:4177`** sits directly on the variant. This contradicts the founder model (logged-out = no avatar / no account menu). | **Not wired** — its reactions are empty `[]`, so it does nothing. **Flagged for removal — DL #102.** |

Instance-swap sanity check: screen-level nested instances of `header 4` (e.g. `I2841:6321;2838:3579`) correctly **inherit** the new avatar reaction from the variant's own avatar instance.

---

## 4. Task 3 — why the interaction is on the navbar *instances*, not the shared component

The avatar component `2819:4090` has **~85 instances** file-wide: post authors, comment authors, followers lists, profile headers, etc. Putting `ON_CLICK → open account dropdown` on the **component** would make every one of those open *the current user's* Profile/Settings/Log-out menu — wrong.

So the overlay trigger is wired **per navbar instance** (`2838:3579`, `5387:7675`) — the only two places the avatar means "me, the logged-in user". The other ~85 instances are untouched.

`Avatar/notification` (`2819:4089`, 0 instances) had a pre-existing reaction pointing at the wrong dropdown (`2841:5361`, the no-notification menu). Corrected to `2841:5363` ("Dropdown menu/notification on"). Harmless now (0 instances); makes a future instance-swap Just Work.

### How to show a navbar in the "has unread" state today

1. Select the navbar's avatar instance (`2838:3579` for header 4 desktop, `5387:7675` for header 4 mobile, or the equivalent nested instance on a specific screen).
2. Swap its main component from **`Avatar/no notification`** to **`Avatar/notification`** (instance swap).
3. Manually change that instance's `ON_CLICK` overlay target from `2841:5361` to `2841:5363` (`Dropdown menu/notification on`, which has the unread counter row). *An instance swap does not auto-retarget an already-overridden reaction.*
4. Set the unread count on `Frame 5882` (`2841:5376`) inside the dropdown.

**Figma limitation:** because the two avatar states are **two separate loose components** (not a variant set) and the two dropdowns likewise, there is no single toggle and an instance cannot carry a conditional "if unread, open dropdown B" reaction — it is one static reaction. The clean fix is DL #103 (combine each pair into a variant set with a `Has Unread` boolean).

---

## 5. Task 4 — Notification row → Notification Centre, and its limitation

Wired `ON_CLICK → NAVIGATE → 5640:7815` (desktop Notification Centre, PR #112) on:

- `2841:5368` — the Notification row (text `2841:5369` + counter badge `2841:5376`) inside `Dropdown menu/notification on` (`2841:5363`).
- `2819:4077` — the equivalent Notification row inside `Dropdown menu/no notification` (`2841:5361`), so the link works whether or not there are unread items.

**Limitation (DL #101):** `Dropdown menu/*` are single components opened as overlays from **both** the desktop and the mobile navbar. A reaction carries one destination, so both currently route to the **desktop** Notification Centre `5640:7815`. Routing the mobile navbar's dropdown to the **mobile** Notification Centre `5643:8003` requires a separate mobile dropdown component/variant — a follow-up, deliberately not built here (it is new-component work, adjacent to DL #103).

---

## 6. Task 5 — the `#fa0606` sweep, completed

A tight scan (exact `#fa0606`: `r>0.955, g<0.07, b<0.07`) found **112** paints. `Ellipse 98` was bound in Task 2. Of the remaining 111:

| Bucket | Count | Node names | Action |
|---|---|---|---|
| Sports Hub H2H / Standing loss dots | 30 | `Rectangle 99` ×29, `Rectangle 101` ×1 | Bound to `semantic/alert` |
| Admin table-cell blocks | 3 | `Rectangle 43` (Categories `138:29`, Users-team-members `917:358`, Categories-Add-Category `138:223`) | Bound |
| "Block User" labels | 4 | `Block User` TEXT (`1300:53`, `1304:235`, `1301:214` — component-internal in set `1870:2753`; `1762:2837` in Messages mobile window 3) | Bound (fonts loaded first) |
| Block-user icons | 3 | `material-symbols:block` vectors (`1304:222`, `1304:240`, `1762:2842`) | Bound |
| Delete / trash icons | 70 | `ant-design:delete-outlined` vectors across Admin Categories, Settings, Settings-Edit/Add role, Settings-Delete Role, Media (×4 screens), Users-team-members | Bound — **newly found in this audit**, same destructive-semantic bucket, so completed here rather than left as a second deferred ticket |
| **YouTube logo** | **1** | `Vector` `761:13` inside "YouTube logo" (Sports Hub Video screen) | **Excluded** — external brand mark, same class as club-crest artwork (non-negotiable #3's disclosed art exception) |

**Total bound in Task 5: 110.** Final full-page rescan for unbound exact-`#fa0606`: only `761:13` remains, as intended.

Counts vs the prior audit: `Rectangle 99` was estimated "~36", actual exact-`#fa0606` count is 29 (+1 `Rectangle 101`) = 30 (the green *win* dots were never in scope). `Rectangle 43` ~3 → exactly 3. "Block User" ~4 → exactly 4. The 70 delete icons were not in PR #113's flagged list.

Nodes with a mix of `#ED1C24`-family red (`rgb(237,28,36)` etc.) — club crests, illustration artwork, news imagery — were **not** touched; they are decorative/photographic content, not UI state.

---

## 7. New Decision Log entries (for Build Plan Section 9, Table 6 — transcription pending shell session)

Next free number after PR #113's #93–#98 is **#99**.

- **#99 — `semantic/alert` token; founder-authorised palette exception.** A third colour, `#FA0606`, now exists as the bound variable `semantic/alert` (Light == Dark). Deliberate, founder-authorised exception to non-negotiable #3 (two-colour palette). Scoped to loss / destructive / alert UI only (unread-notification dot, Sports Hub win-loss dots, delete/block icons, "Block User" labels). Not a brand or decorative colour. Status: **Resolved** (token created, 111 paints bound).

- **#100 — Avatar → account-dropdown interaction is wired per-navbar-instance, not on the shared avatar component.** The avatar component has ~85 instances (post authors, comment authors, etc.); wiring the account menu onto the component would make every avatar open the current user's menu. Interaction lives only on the two logged-in navbar variants' avatar instances (`2838:3579`, `5387:7675`). Status: **Resolved.**

- **#101 — Dropdown → Notification Centre routes to desktop only.** `Dropdown menu/*` are shared desktop/mobile components; a reaction carries one target, so both route to desktop `5640:7815`. Mobile route to `5643:8003` needs a mobile dropdown variant. Status: **Open follow-up** (design).

- **#102 — `header 7` (logged-out desktop) navbar carries a stray avatar instance (`2841:4177`).** Contradicts the founder model (logged-out = no avatar / no account menu). Left unwired (empty reactions) this pass; recommended for removal. Status: **Open** — needs founder confirmation before deleting shared-component content.

- **#103 — Combine the two `Avatar/*` components and the two `Dropdown menu/*` components into variant sets** with a `Has Unread` boolean property, so a single instance swap flips both the dot and the dropdown, and the reaction can be variant-scoped. Supersedes PR #113's DL #95 (which proposed the variant on a *new* bell component). Status: **Open follow-up** (design/component work).

- **Supersede/resolve on the PR #113 entries:** append forward-pointers to **#93, #94, #95, #96** ("Superseded by `sprint-2/avatar-notification-dropdown-wiring` — founder override: no new bell component, the avatar is the indicator") and mark **#97** "Resolved by `sprint-2/avatar-notification-dropdown-wiring` — `semantic/alert` token, 110 paints bound."

---

## 8. Verification done

- Variable collection read live before creating: `Soccernity Theme` (`VariableCollectionId:5096:2`), modes Light `5096:0` / Dark `5096:1`, confirmed no pre-existing red/alert/destructive token.
- Rename: 4 sample instances (`I2841:6321;2838:3579`, `I2841:6063;2838:3579`, `2838:3579`, `5387:7675`) re-checked after rename — all still linked to `2819:4090` "Avatar/no notification", fills unchanged, reactions as expected.
- Reactions: read back after `setReactionsAsync` on every wired node — confirmed `ON_CLICK` / `OVERLAY` / `NAVIGATE` with correct `destinationId`.
- Screenshots taken of `header 4` desktop navbar and both dropdown components — render correctly, "notification on" shows the `2` counter badge.
- `#fa0606` sweep: full-page rescan after binding — 0 unbound exact-`#fa0606` paints except the deliberately-excluded YouTube logo vector `761:13`.
- `overlayBackgroundInteraction = CLOSE_ON_CLICK_OUTSIDE` was attempted on the dropdown components but the property is **read-only on `COMPONENT` nodes** — not applied. Click-outside-to-dismiss is a follow-up (would need the dropdowns as frames, or a transparent backdrop, or setting it on instances at overlay-open sites).

---

## 9. Follow-up work for a shell session

1. `git checkout sprint-2/notification-bell-navbar-slot && git checkout -b sprint-2/avatar-notification-dropdown-wiring`
2. Commit this report + the CLAUDE.md changes (already written to the working tree).
3. Transcribe the §7 Decision Log entries into `docs/Soccernity_MVP_Build_Plan_v1.7.docx` Section 9 (Table 6) via `python-docx` — add #99–#103, and append the forward-pointers to #93–#97.
4. Push, open PR against `main`. PR body must note it **stacks on PR #113** (reviewer merges #113 first, or merges this PR which includes #113's commits).
5. Do **not** merge.
