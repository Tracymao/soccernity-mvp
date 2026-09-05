# Sprint 2 — Account Deactivation / Deletion flow design report

**Branch:** `sprint-2/account-deactivation-design`
**Agent:** figma-design-system
**Date:** 2026-09-06
**Scope:** Figma design only. No `apps/web` or `services/api` code touched.
**Decision Log:** #220 (Build Plan Section 9).

---

## 1. What the brief asked

Verify *live* whether the existing Figma groundwork is complete for the
account deactivation / reactivation / deletion flow, and build whatever is
missing. Frames named in the brief:

- **Settings — Deactivate Account (Intro):** desktop `2924:7358`, mobile `5695:8262`
- **Inactive Account** (post-login, reactivate-or-delete): desktop `1662:2782`,
  mobile `Community — Inactive Account — Mobile` `5780:8679`

Founder's confirmed flow, against which everything was checked:

> Deactivate → the account stays inactive **indefinitely** until the user
> reactivates **or** explicitly chooses delete, at which point the existing
> **30-day-then-cascade** delete clock starts (unchanged from the current
> deletion flow).

This matches the shipped backend: `POST /auth/deactivate-account` sets
`accountStatus = "deactivated"` (reversible, no timer); `POST /auth/reactivate-account`
flips it back with no time limit; only `POST /auth/delete-account`
(`"pending_deletion"` + `pendingDeletionAt`) starts the 30-day
hard-delete-then-cascade clock (`AccountDeletionSweepService`, Decision Log
#42/#44).

---

## 2. What was found — complete vs. missing

### ✅ Complete — left alone

| Brief question | Finding |
|---|---|
| **Item 2** — does "Inactive Account" present both paths (reactivate instantly vs. proceed to delete) as genuinely separate, distinct actions? | **Yes, on both breakpoints.** Desktop `1662:2782`: "Activate Account" (green primary) + "Delete Account" (secondary), side by side. Mobile `5780:8679`: "Activate account" (green primary) + "Delete account" (outline secondary), stacked. Both actions present, visually distinct, correctly ranked. No change to layout or wording. |

### ⚠️ Incomplete — built

| Brief question | Finding | What was built |
|---|---|---|
| **Item 1** — does "Deactivate Account (Intro)" lead to a real confirmation step, or is it just an informational intro with no confirm/cancel action? | **Just an informational intro.** A single "Deactivate" button, no cancel, no password field — despite the backend requiring password re-entry to deactivate. Worse, the **"What to know" copy was factually wrong**: *"You can restore your Soccernity account if it was accidentally or wrongfully deactivated for up to 30 days after deactivation."* — implies deactivation itself has a 30-day expiry. It does not. | (a) Corrected the "What to know" copy on **both** Intro frames to state deactivation is recoverable with **no time limit**, and that the 30-day countdown only applies to a *separate* delete choice. (b) Relabelled the Intro button **"Deactivate" → "Continue"** (it now advances to a confirm step; it no longer performs the action). (c) Built **`Settings — Deactivate Account (Confirm)`** — desktop `6213:15640` + mobile `6213:15617`. |
| **Item 3** — if choosing delete from the Inactive Account screen, does anything show that the existing 30-day grace period then applies? | **Nothing.** "Delete Account" on the Inactive screen led nowhere, and the screen's own copy said *"permanently delete the account"* with no mention of the grace window — a user would reasonably assume delete-from-inactive is instant and irreversible. | Built **`Inactive Account — Delete (Confirm)`** — desktop `6217:14677` + mobile `6215:14657` — a pre-action confirmation state that states the 30-day grace period explicitly. |

---

## 3. New frames built (4)

All cloned from the file's existing patterns so every token binding, font,
input style, and card treatment is inherited, not reinvented.

### 3.1 `Settings — Deactivate Account (Confirm)` — desktop `6213:15640`

- Cloned from `Settings — Account Info (Confirm Password)` `2922:6396` — the
  file's established "(Confirm Password)" gate pattern for sensitive Settings
  actions. Placed at `x -8793, y 100` (directly below the Intro, clear space,
  no overlap).
- **Header:** "Deactivate your account" + "Your account will be hidden until
  you reactivate it. Enter your password to confirm."
- **"What happens" card:** "Your profile and posts stay hidden while your
  account is deactivated. It stays this way with no time limit — sign back in
  any time to reactivate. Deleting your account is a separate choice."
- **Password field:** "Password" label + `Enter your password` placeholder
  in a real bordered input (the source frame had only a bare rectangle — a
  labelled input frame was substituted, still using existing tokens).
- **Actions row:** `Cancel` (outline) + `Deactivate account` (`brand/navy`),
  side by side — matching the Inactive screen's own two-button language.

### 3.2 `Settings — Deactivate Account (Confirm) — Mobile` — `6213:15617`

- Cloned from `Settings — Account Info (Confirm Password) — Mobile` `5695:8213`.
  Placed at `x -751, y -7200` (below the mobile Settings row, no overlap).
- Same copy as desktop. Field label "Password", placeholder "Enter your
  password". Stacked buttons: `Deactivate account` (navy) then `Cancel`
  (outline) — matching the file's own "primary first, secondary second"
  mobile stacking (Activate → Delete on the Inactive mobile frame).

### 3.3 `Inactive Account — Delete (Confirm)` — desktop `6217:14677`

- Cloned from `Inactive Account` `1662:2782` itself, so the full-bleed
  centred layout, navbar instance, and soccer-ball watermark carry over.
  Placed at `x -47554, y -5337` (immediately right of the original, no
  overlap).
- Centred confirm card: heading **"Delete your account?"**, body:
  *"Deleting starts a 30-day grace period. Sign back in within 30 days to
  cancel and keep your account. After 30 days, your account and everything
  in it are permanently deleted and can't be recovered."*
- Password field ("Enter your password to confirm" label + input).
- Actions row: `Cancel` (outline) + `Delete account` (`brand/navy`).

### 3.4 `Community — Inactive Account — Delete (Confirm) — Mobile` — `6215:14657`

- Cloned from `Community — Inactive Account — Mobile` `5780:8679`. Placed at
  `x 11531, y 24700` (below the Community mobile row — the adjacent slot
  `x 12031` was taken by `Community — Create Post — With Attachment — Mobile`,
  so it went below the row instead).
- Same "Delete your account?" + 30-day-grace copy as desktop. Password
  field. Buttons: `Delete account` (navy) then `Cancel` (outline).

---

## 4. Existing frames edited (housekeeping, in-scope because being touched anyway)

| Frame | Change |
|---|---|
| `Settings — Deactivate Account (Intro)` `2924:7358` (desktop) | "What to know" copy corrected. Button "Deactivate" → "Continue". Button fill: **raw unbound red `#ED1C24` → `brand/navy`**; button text → `color/text/on-navy`. (The mobile Intro's button was already navy — the desktop was the anomaly. Neither was `semantic/alert` `#FA0606`; it was a stale hardcoded red.) |
| `Settings — Deactivate Account (Intro) — Mobile` `5695:8262` | "What to know" copy corrected. Button "Deactivate" → "Continue" (already navy). |
| `Inactive Account` `1662:2782` (desktop) | "Delete Account" button: **raw unbound grey `#D9D9D9` fill + raw unbound red `#ED1C24` text → `color/background/surface` fill + `color/icon/inactive` outline + `color/text/primary` text** — matching the already-clean mobile treatment. Destructive buttons stay **navy, not red** per the established Settings-mobile decision (white on `semantic/alert` measures 4.12:1 and fails AA; alert is a non-text accent only). |
| `Community — Inactive Account — Mobile` `5780:8679` | No change — already token-clean and palette-compliant. |

---

## 5. Prototype wiring

`ON_CLICK → NAVIGATE` reactions added for the forward path and the Cancel
escapes (the file wires flows selectively — e.g. the notification-row →
Notification Centre precedent — rather than never; a multi-step destructive
flow warrants it):

| From | To |
|---|---|
| Intro "Continue" (desktop `2924:7494` / mobile `5695:8277`) | Deactivate Confirm (`6213:15640` / `6213:15617`) |
| Deactivate Confirm "Cancel" | Settings Overview (`2905:4798` desktop / `5607:7813` mobile) |
| Inactive "Delete account" (desktop `1662:5049` / mobile `5780:8773`) | Delete Confirm (`6217:14677` / `6215:14657`) |
| Delete Confirm "Cancel" | Inactive Account (`1662:2782` / `5780:8679`) |

The Inactive screen's "Activate / Reactivate" button is left unwired — it
triggers the reactivation action, not a navigation.

---

## 6. Token / palette audit

- **New authored content:** 0 unbound paints, 0 off-palette hexes, 0
  `brand/green-tint-28`, 0 new colours. Everything bound to `Soccernity
  Theme` Light-mode tokens (`brand/navy`, `color/background/surface`,
  `color/icon/inactive`, `color/text/primary`, `color/text/secondary`,
  `color/text/on-navy`).
- **Residual unbound paints (2), both pre-existing / inherited from clone
  sources, deliberately not touched:**
  - `6213:15640` → `Rectangle 120` `#d9d9d9` — the profile-card cover-plate
    inherited by every Settings-family frame (known pre-existing debt,
    Decision Log #52 territory).
  - `6217:14677` → `Users` group wrapper `#ffffff` — the soccer-ball
    watermark container inherited from `Inactive Account`.
- Light mode only. No dark-mode work.

---

## 7. Verified end to end

Screenshot-verified each screen and the logical flow:

`Settings Overview → Deactivate Intro (corrected copy, "Continue") →
Deactivate Confirm (password + Cancel / Deactivate account) → [account now
inactive] → … → Inactive Account (Activate vs. Delete, both distinct) →
Delete Confirm (30-day grace explicit + password + Cancel / Delete account)`

Both breakpoints checked. No real browser / Playwright available in this
environment — Figma render + `use_figma` screenshot is the verification
ceiling, consistent with every prior frontend/design PR in this project.

---

## 8. Not built — flagged for follow-up

- **Post-action success / status states.** There is no "Your account has
  been deactivated" screen, and no "Deletion scheduled — 30 days remaining"
  status surface (e.g. a banner the user sees if they *do* sign back in
  during the grace window, or on the Inactive screen after they've chosen
  delete). The pre-action confirm screens satisfy the brief's "don't let a
  user think it's instant" requirement; the post-action surfaces are
  additive scope. The "Account deletion requested" **email** template
  already exists (`5439:7074`) but is not wired to a real send.
- **Guardian / minor variant of deactivation.** A restricted-pending or
  guardian-managed minor account deactivating/deleting may need different
  copy or a guardian-notification step — not designed here, not in the
  brief.
- **Reactivation confirmation.** "Activate account" on the Inactive screen
  is a one-tap action with no confirm — left as-is (reactivation is
  non-destructive; the brief did not flag it).
