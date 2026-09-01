# Sprint 2 — Settings-desktop hidden-scaffolding sweep (consolidated)

**Intended branch:** `sprint-2/settings-desktop-scaffolding-sweep`
**Date:** 2026-09-01
**Figma file:** `weZWWqggy9j13eX8bhFgs6` ("Soccernity-MVP"), page "Soccernity" (`0:1`)
**Agent:** `figma-design-system` (no Bash / shell this session — same constraint as PRs #98 / #102 / #110 / #111 / #117 / #118)
**Stack:** branches off PR #118 (`sprint-2/settings-label-align-docx-dl123`, OPEN) → PR #117 (`sprint-2/component-hygiene-toggles-nav`, OPEN) → PR #116 (`sprint-2/mobile-settings-community-message-rebuild`, OPEN). **Not merged.**

## Why this pass exists

Three prior passes each turned up hidden, non-rendering duplicate content on Settings-desktop rows — leftovers from a row-duplication process:

- **PR #117** flagged 5 `visible:false` `Rectangle 352` squares, deferred them.
- **PR #118** deleted those 5, and found each parent `Frame 5914` row *also* carries a separate hidden `Frame 5926` / `Frame 5920` / `Frame 5928` scaffolding leftover — flagged for this pass.
- **DL #110** (Build Plan Table 6, PR #116's branch) recorded three specific content leaks on `2926:8764`, `2926:8996`, and the trio `2926:9721` / `2927:9954` / `2927:10205`.

This pass does one full sweep instead of continued piecemeal fixes. Settings **mobile** frames (`5695:8213`–`5696:8384`) are out of scope — desktop only.

## The 4-check gate (applied to every candidate before deletion)

1. `visible: false` confirmed.
2. **0 prototype reactions target it** — a file-wide traversal of every node's `reactions` on page `0:1` built the set of all `destinationId`s (49 targets across 321 reaction-bearing nodes); no deleted node's ID is in it.
3. Not inside a `COMPONENT` / `COMPONENT_SET` / `INSTANCE` — full parent chain to the frame is plain `FRAME` only.
4. Not a `componentPropertyReferences` target.

Every node deleted below passed all four. The delete script re-verified all four inline immediately before each `.remove()`.

---

## TASK 1 — Settings-desktop frames enumerated

18 user-facing Settings **desktop** frames on page `0:1`:

| # | Node | Name | Hidden scaffolding found |
|---|---|---|---|
| 1 | `2905:4798` | Settings — Overview | none (decor only) |
| 2 | `2922:6396` | Settings — Account Info (Confirm Password) | none |
| 3 | `2926:8056` | Settings — Security Overview | `Frame 5926` (Submit) |
| 4 | `2926:9230` | Settings — Notifications (Mute & Filter) | `Frame 5926` (Submit) |
| 5 | `2926:9721` | Settings — Notification Preferences | `Frame 5920`→`5933` (dup heading), `Frame 5926` (Submit) |
| 6 | `2927:9954` | Settings — Push Notifications | `Frame 5920`→`5933` (dup heading), `Frame 5928` (leak), `Frame 5926` (Submit) |
| 7 | `2927:10205` | Settings — Email Notifications | `Frame 5920`→`5933` (stray row), `Frame 5928` (leak), `Rectangle 352` (536×31), `Frame 5926` (Submit) |
| 8 | `2926:9482` | Settings — Mute New Accounts | `Frame 5926` (Submit) |
| 9 | `2926:8294` | Settings — Two-Factor Auth (SMS) | `Frame 5926` (Submit) |
| 10 | `2926:8764` | Settings — Direct Messages & Read Receipts | `Frame 5927` (Auth App leak), `Frame 5926` (Submit) — DL #110 |
| 11 | `2926:8996` | Settings — Sensitive Content & 2FA App → **renamed** | `Frame 5927` (Auth App leak), `Frame 5926` (Submit) — DL #110 |
| 12 | `2924:6870` | Settings — Change Password | none (hidden leftover *text* inside live rows — flagged) |
| 13 | `2924:7112` | Settings — Account Information (Edit) | none (hidden leftover *text* inside live rows — flagged) |
| 14 | `2924:7358` | Settings — Deactivate Account (Intro) | none (decor only) |
| 15 | `2922:5143` | Settings — Security & Account | none (decor only) |
| 16 | `2922:5382` | Settings — Privacy & Safety | none (decor only) |
| 17 | `2922:5602` | Settings — Notification Preferences (By Type) | none (decor only) |
| 18 | `2922:5832` | Settings — Display, Language & Region | none (decor only) |

(Admin-Panel `Settings` frames — `1658:2303`, `1658:2456`, `1658:2592`, `5403:7205` — are out of scope, tracked under Decision Log #52.)

### The duplication-leftover structure

Every Account-panel row lives in `… > Account > Frame 5918 > Frame 5915 > Frame 5914`. Rows were cloned from a common template, and the parts of the template a given row didn't need were set `visible:false` rather than deleted. The recurring hidden artifacts:

| Hidden node | Size | What it is |
|---|---|---|
| `Frame 5926` | 121×35 | A "Submit" button (each carries a dead `ON_CLICK → NAVIGATE 2924:6870` of its own). Never rendered. |
| `Frame 5920` → `Frame 5933` | 581×26 | A "Push notification" label + a 26×26 `Rectangle 352`. On the trio it sits at the *exact* coordinates of the visible labelled row — DL #110's "overlapping duplicate heading". |
| `Frame 5928` | 540×20 | A leaked "Email Notification" heading + a hidden 2FA "Help protect your account…" blurb. |
| `Frame 5927` | 539×67 | A leaked "Authentication App" heading + "Use your mobile authentication app…" description (content belongs on Two-Factor Auth). |
| `Rectangle 352` | 536×31 | An input-field background (identical geometry to the 5 PR #118 deleted). |

---

## TASK 1 + TASK 2 — full found / deleted / kept table

### Deleted — 17 nodes, all 4-check-clean

| Node ID | Name | Frame | Row / context | Task |
|---|---|---|---|---|
| `2926:8176` | Frame 5926 | `2926:8056` Security Overview | Account panel — "Submit" btn | T1 |
| `2926:9352` | Frame 5926 | `2926:9230` Notifications (Mute & Filter) | Account panel — "Submit" btn | T1 |
| `2926:9835` | Frame 5920 (→ `Frame 5933` `2926:9836`) | `2926:9721` Notification Preferences | dup "Push notification" heading over the visible "Push notifications" row | **T2.3** |
| `2926:9845` | Frame 5926 | `2926:9721` Notification Preferences | Account panel — "Submit" btn | T1 |
| `2927:10068` | Frame 5920 (→ `Frame 5933` `2927:10069`) | `2927:9954` Push Notifications | dup "Push notification" heading over the visible "Turn on push notifications" row | **T2.3** |
| `2927:10076` | Frame 5928 | `2927:9954` Push Notifications | leaked "Email Notification" + hidden 2FA blurb | T1 |
| `2927:10081` | Frame 5926 | `2927:9954` Push Notifications | Account panel — "Submit" btn | T1 |
| `2927:10319` | Frame 5920 (→ `Frame 5933` `2927:10320`) | `2927:10205` Email Notifications | stray "Push notification" row that doesn't belong (also overlaps the visible row) | **T2.3** |
| `2927:10328` | Frame 5928 | `2927:10205` Email Notifications | leaked "Email Notification" + hidden 2FA blurb | T1 |
| `2927:10332` | Rectangle 352 (536×31) | `2927:10205` Email Notifications | hidden input-field background — 6th of the PR #118 pattern | T1 |
| `2927:10333` | Frame 5926 | `2927:10205` Email Notifications | Account panel — "Submit" btn | T1 |
| `2926:9606` | Frame 5926 | `2926:9482` Mute New Accounts | Account panel — "Submit" btn | T1 |
| `2926:8416` | Frame 5926 | `2926:8294` Two-Factor Auth (SMS) | Account panel — "Submit" btn | T1 |
| `2926:8884` | Frame 5927 | `2926:8764` Direct Messages & Read Receipts | leaked "Authentication App" heading + description block | **T2.1** |
| `2926:8889` | Frame 5926 | `2926:8764` Direct Messages & Read Receipts | "Submit" btn (part of the leaked block per DL #110) | **T2.1** |
| `2926:9116` | Frame 5927 | `2926:8996` Your Posts (Sensitive Media) | leaked "Authentication App" heading + description block | **T2.2** |
| `2926:9121` | Frame 5926 | `2926:8996` Your Posts (Sensitive Media) | "Submit" btn (part of the leaked block per DL #110) | **T2.2** |

Deletion done in two `use_figma` calls (batch 1: the four DL #110 Auth-App nodes; batch 2: the other 13). Post-deletion re-scan of all 18 frames confirms **0 hidden scaffolding FRAMEs remain**.

### Were the overlapping headings actually rendering?

**No — every one was `visible:false`.** The `Frame 5920` wrapper and its `Frame 5933` child were both `visible:false` on all three trio frames; only the text/rect *inside* `Frame 5933` had `visible:true`, which never surfaces because two ancestors are hidden. So this was **cosmetic hygiene, not a live user-facing bug** — consistent with DL #110's own framing ("All hidden / non-rendering").

### No row emptied

Each affected `Frame 5914` retains its visible child row(s) after deletion:
- `2926:9721` — keeps visible `Frame 5927` ("Push notifications") + `Frame 5928` ("Email notifications") nav rows.
- `2927:9954` — keeps visible `Frame 5927` ("Turn on push notifications" + toggle).
- `2927:10205` — keeps visible `Frame 5927` ("Turn on email notifications" + toggle) + visible `Frame 5920` (`2927:10441`: New notifications / Direct messages / Posts emailed to you).
- `2926:8764` — keeps visible `Frame 5920` (`2926:8879`: "Read receipts" + toggle).
- `2926:8996` — keeps visible `Frame 5920` (`2926:9111`: "Mark media you post as having material that may be sensitive" + toggle).

### Kept, reported with reason

| Node(s) | Count | 4-check | Why kept |
|---|---|---|---|
| `ph:soccer-ball-fill` FRAME (e.g. `2905:4799`, `2905:4801`, `2922:6397`, …) | 36 (2 per frame, **including the 6 clean category screens**) | passes all 4 | **Out of scope.** A deliberately-hidden decorative-background layer (969×969 / 1550×1550 soccer-ball motifs), direct children of the top-level frame, present uniformly on every Settings frame incl. the ones with zero row scaffolding. Not a row-duplication artifact. |
| `See information about your account` TEXT — `2922:6504`, `2926:8166`, `2926:9340`, `2926:9831`, `2927:10064`, `2927:10315`, `2926:9592`, `2926:9107`, `2926:8404`, `2926:8875`, `2924:6980`, `2924:7222` | 12 | passes all 4 | Unused template subtitle in the `Frame 5919` heading block, identical string in every Account-panel frame. Hidden **TEXT**, not a "hidden sibling FRAME" — outside Task 1's stated mandate. Safe to remove in a follow-up (IDs listed). |
| `Help protect your account from unauthorized access…` TEXT (2FA blurb) leaked into notification nav rows — `2926:8292`, `2926:9350`, `2926:9843`, `2926:9953` | 4 | passes all 4 | Hidden text child of a **visible** notification row `Frame 5927`/`Frame 5928`. Semantically wrong copy (2FA blurb inside "Push/Email notifications" rows) = clear copy-paste artifact. Hidden TEXT, not a FRAME — follow-up. |
| `Choose to filter out content such as duplicate or automated posts…` TEXT leaked — `2926:9600`, `2927:10451` | 2 | passes all 4 | Same category — quality-filter blurb leaked as hidden text into other rows. Follow-up. |
| `information-circle-sharp` FRAME — `2922:6507`, `2924:7225` | 2 | passes all 4 | Hidden decorative info-icon (24×24) in `Frame 5915`, not row scaffolding. Follow-up if a clean-up is wanted. |
| Change Password (`2924:6870`): `Confirm your Password` `2924:6987` / `2924:7099` / `2924:7105`; `@mitch` `2924:7095`; `+2348104020224` `2924:7100`; `michaelschenider249@gmail.com` `2924:7106` | 6 | passes all 4 | **Frame is out of Task 2 scope.** These are hidden leftover label + sample-value text sitting *inside* the **live** Current/New/Confirm-password input rows (`Frame 5920` / `Frame 5927` / `Frame 5928`, all `visible:true`). Removing them is label/value hygiene inside live rows and should be done alongside a copy review, not bundled here. |
| Account Information (Edit) (`2924:7112`): `Confirm your Password` `2924:7231` / `2924:7236` / `2924:7241` / `2924:7246` | 4 | passes all 4 | Same — hidden leftover labels inside the four **live** account-info input rows. Flagged, not touched. |

---

## TASK 2 — DL #110 resolution detail

### 2.1 — `2926:8764` Direct Messages & Read Receipts

Deleted the hidden "Authentication App" block: `Frame 5927` (`2926:8884`, containing heading `2926:8886` + description `2926:8888` + a `Rectangle 352` chip `2926:8887`) and the sibling "Submit" `Frame 5926` (`2926:8889`, containing button text `2926:8890`). DL #110's approximate IDs (`~2926:8884` / `2926:8886` / `2926:8888` / `2926:8889`) reconciled to the real structure — `2926:8889` is the Submit **frame**, not a loose button. The live "Read receipts" row (`Frame 5920` `2926:8879`) is untouched; screenshot confirms it renders unchanged. Frame name is accurate — no rename.

### 2.2 — `2926:8996` Sensitive Content & 2FA App

Deleted the same hidden "Authentication App" block: `Frame 5927` (`2926:9116` — heading `2926:9118`, description `2926:9120`, chip `2926:9119`) and "Submit" `Frame 5926` (`2926:9121`).

**Visible content confirmed:** `Frame 5920` (`2926:9111`) — "Mark media you post as having material that may be sensitive" + a `Settings Toggle` + "When enabled, pictures and videos you post will be marked as sensitive…". This is the **sensitive-media-marking-on-your-posts** setting. The visible `Frame 5919` heading was **already** "Your posts" — accurate. The "2FA App" half of the frame name only ever referred to the now-deleted hidden leak.

**Rename applied:**
- Frame `2926:8996`: `Settings — Sensitive Content & 2FA App` → **`Settings — Your Posts (Sensitive Media)`** (matches the mobile sibling `5696:8261` "Settings — Your Posts (Sensitive Media) — Mobile").
- Heading TEXT `2926:9106`: `"Your posts"` → **`"Your Posts"`** (title-case, mobile-parity; font `Montserrat` loaded from `getStyledTextSegments` before the edit).

### 2.3 — trio `2926:9721` / `2927:9954` / `2927:10205`

On each, deleted the hidden `Frame 5920`→`Frame 5933` "Push notification" block that sits at the exact coordinates of the visible labelled row (`2926:9835`, `2927:10068`, `2927:10319`). **All `visible:false` — not rendering — cosmetic.**

On `2927:10205` (Email) specifically, the same hidden `Frame 5920` (`2927:10319`) *is* the "stray Push notification row that doesn't belong" (duplicating content that belongs on `2927:9954`) — one node, both parts of the DL #110 ask. Also removed on Email: the leaked `Frame 5928` (`2927:10328`) and the hidden 536×31 `Rectangle 352` (`2927:10332`).

Screenshots of all three trio `Frame 5914` panels post-deletion: visible rows render exactly as before.

---

## Verification

- **4-check traversal** — file-wide reaction-destination set rebuilt from every `reactions` array on page `0:1` before each delete batch; every deleted ID absent from it. `componentPropertyReferences` and ancestor-type checked inline per node.
- **Post-deletion re-scan** of all 18 frames — 0 hidden scaffolding FRAMEs remain; the kept/flagged list above is the complete residual hidden-node census.
- **Screenshots** — `2926:9834` / `2927:10067` / `2927:10318` (trio `Frame 5914`s), `2926:9102` (renamed "Your Posts" panel), `2926:8870` (Direct Messages panel): all render unchanged (everything removed was `visible:false`).
- **Verification ceiling:** Plugin-API reads + `node.screenshot()`. No real browser / prototype-runtime check available this session — the standing ceiling for every design-stage PR in this project.

---

## Decision Log — for the finalising shell session

Live docx Table 6 ends at **#126** (PR #118 added #125–#126). This pass:

### Mark **DL #110** — Status column, APPEND (do not replace)

> ` RESOLVED by sprint-2/settings-desktop-scaffolding-sweep — the three flagged "structural content leaks" (2926:8764 & 2926:8996 leaked "Authentication App" rows; the 2926:9721/2927:9954/2927:10205 trio's overlapping duplicate "Push notification" headings) were all confirmed to be visible:false scaffolding left over from row duplication, not live rows — so no product decision was needed. Deleted (2 × Frame 5927, 3 × Frame 5920→5933) along with 9 leftover "Submit" Frame 5926 buttons, 2 leaked Frame 5928 blocks and 1 hidden 536×31 Rectangle 352, all 4-check-clean. 2926:8996 renamed "Settings — Your Posts (Sensitive Media)"; its visible heading title-cased to "Your Posts". Desktop and mobile Settings no longer diverge on these three screens.`

### New row **#127**

**`#127` — Settings-desktop hidden row-duplication scaffolding swept (consolidated).**
Status text:
> `RESOLVED (Figma design) — sprint-2/settings-desktop-scaffolding-sweep. One consolidated sweep of hidden, non-rendering row-duplication leftovers across all 18 user-facing Settings desktop frames, replacing the piecemeal PR #117 / PR #118 / DL #110 passes. 17 hidden nodes deleted, each confirmed dead by 4 checks (visible:false; 0 file-wide prototype reactions target it; not inside any COMPONENT/COMPONENT_SET/INSTANCE; not a componentPropertyReferences target): 9 × hidden "Submit" Frame 5926 (each with a dead ON_CLICK → 2924:6870); 3 × hidden Frame 5920→Frame 5933 duplicate "Push notification" headings on the trio (all visible:false — never a live render bug); 2 × hidden Frame 5928 leaked "Email Notification"+2FA-blurb blocks; 2 × hidden Frame 5927 leaked "Authentication App" blocks (DL #110); 1 × hidden 536×31 Rectangle 352 input-field background on Email (a 6th instance of the leftover PR #118 deleted five of). No Frame 5914 row emptied; no live row touched; screenshots confirm zero visual change. Kept + flagged for a follow-up text-hygiene micro-pass (all 4-check-clean but hidden TEXT, not FRAMEs, so outside this pass's mandate): "See information about your account" template subtitle ×12; leaked "Help protect your account…" 2FA blurb ×4 and "Choose to filter out content…" blurb ×2 inside visible notification rows; hidden information-circle-sharp icon ×2; and hidden leftover "Confirm your Password" labels ×7 + sample values (@mitch, +2348104020224, an email) inside the LIVE input rows of Change Password (2924:6870) and Account Information (Edit) (2924:7112), both out of scope here. Kept, out of scope: ph:soccer-ball-fill decorative-background FRAMEs ×2 per frame (a deliberately-hidden decor layer, present on the clean category screens too — not duplication scaffolding).`

---

## Follow-up shell-session steps (no Bash available this session)

All Figma edits above are already live in the file. Remaining, for a session with shell access:

1. `git fetch origin`
2. `git switch sprint-2/settings-label-align-docx-dl123` (PR #118's branch — **not** `main`)
3. `git switch -c sprint-2/settings-desktop-scaffolding-sweep`
4. Apply the CLAUDE.md changes already made in this working tree (the new `sprint-2/settings-desktop-scaffolding-sweep` bullet + the DL #110 forward-pointer edit on the PR #116 bullet). Re-apply / cherry-pick if the branch base differs.
5. Add this report file (`docs/sprint-2-settings-desktop-scaffolding-sweep-report.md`).
6. `docs/Soccernity_MVP_Build_Plan_v1.7.docx` via `python-docx`: confirm Table 6's last row is **#126**, then (a) append the DL #110 Status text above to row #110's Status cell (append to the run carrying the content; do not reorder/duplicate runs), and (b) add new row **#127** as drafted. If the last row is not #126, use the real next free integer and note the shift.
7. Commit; push; open a PR **against `main`**, body noting it **stacks on PR #118 → PR #117 → PR #116** and must not merge before them. **Do not merge.**

## What's left for other agents

- **Follow-up text-hygiene micro-pass** (`figma-design-system`) — delete the 27 kept-and-flagged hidden TEXT nodes listed above (all IDs given, all 4-check-clean). Small, low-risk, mechanical.
- **Change Password / Account Information (Edit) live-row copy review** — those two frames carry hidden leftover `Confirm your Password` labels inside live input rows; a copy owner should confirm the correct visible labels before the hidden ones are removed.
- Nothing here is a `figma-screen-builder` or `figma-to-code` handoff — no new screen, no layout change.
