# Sprint 2 — Guardian-consent flow: 7 missing screens/emails

**Branch:** `sprint-2/retrofit-screen-build-guardian-consent`
**Agent:** figma-design-system
**Date:** 2026-08-28
**Figma file:** `weZWWqggy9j13eX8bhFgs6` ("Soccernity-MVP"), page "Soccernity" (`0:1`)

Follows the audit-and-build pass `sprint-2/retrofit-screen-build-auth-email` (PR #104,
`docs/sprint-2-retrofit-screen-build-auth-email-report.md`), which flagged the
guardian-consent flow's decline path and settings actions as having no screen
coverage. This pass **builds the 7 specific missing items** — screens and emails
only, no backend/DTO/endpoint changes.

Reference pattern: the existing **Activation Confirmation** screen (`5108:6631`)
and the **verify-email** email (`5439:7053`). Light-mode Soccernity Theme
variables (collection `5096:2`), no hardcoded hex. Per Decision Log #47, icon/panel
washes use **`brand/green-tint` (12%)**, not `brand/green-tint-28` — 12 paints that
would otherwise have carried `-28` from the cloned source frames were rebound.

---

## The 7 items

| # | Item | Audience | Desktop | Mobile / fluid |
|---|---|---|---|---|
| 1 | **Consent Approved** — confirms the guardian's "I consent" was recorded | Guardian | `5488:7164` | `5501:8225` |
| 2 | **Consent Declined** — confirms the guardian's "I do not consent" was recorded | Guardian | `5488:7206` | `5501:8289` |
| 3 | **Consent Declined — Minor Notice** — counterpart to Activation Confirmation; has a **Resend approval request** button + a **Change guardian email** button | Minor | `5491:8241` | `5501:8453` |
| 4 | **Approval Request Resent** — confirms a fresh request went to the guardian | Minor | `5488:7248` | `5501:8342` |
| 5 | **"Guardian approved your account" email** + title head `5501:8582` | Minor | — | `5501:8584` (fluid) |
| 6 | **"Guardian declined your account" email** + title head `5501:8605` | Minor | — | `5501:8607` (fluid) |
| 7 | **Change Guardian Email** — standalone settings-style screen, available while consent is pending; carries an explicit notice that submitting restarts the consent flow | Minor | `5498:7164` | `5501:8536` |

All frames are named `Guardian Consent — N …` (screens) / `Success email - …`
(emails), matching the file's existing conventions, and sit below the existing
Guardian Consent & Age Verification section (x 17504–24590, y −4700 to +2300;
emails in the Email Template section at x 95527 / 96347). **0 overlaps** with any
existing frame (verified node-by-node).

### Desktop / mobile coverage

- **Items 1, 2, 3, 4, 7:** desktop **and** mobile, confirmed above. The mobile
  frames are 390 px wide — the existing Guardian Consent section had no mobile
  frames at all (flagged in PR #104), so these are the first. Each mobile frame:
  a fresh 64 px logo top bar (cloned from the Verify Email desktop logo group, not
  scaled), a 350 px content column, full-width cards, and vertically-stacked
  full-width buttons. Hero icons reduced 88 → 72 px.
- **Items 5, 6:** single fluid-width (680 px) email frames — the established
  standard for this section; no separate mobile version needed.

---

## Per-item design notes

### 1 — Consent Approved (Guardian)
Green check, "Thank you — Ade's account is approved", a "What happens next" card
(account active / you stay in control / nothing else needed), single **outline
"Done"** button (a guardian has no Soccernity session to navigate into — the copy
says it's safe to close the window).

### 2 — Consent Declined (Guardian)
**Neutral grey icon circle + navy check** — a recorded decision, not an error, and
**no red** (two-colour palette rule). "Your decision has been recorded", a "What
this means" card (account locked / Ade can ask again / nothing published), outline
"Done".

### 3 — Consent Declined — Minor Notice
Clone of Activation Confirmation, flipped to the declined state. Neutral hero icon.
"Still switched off" card with the three restrictions and **OFF** pills (mirroring
Activation's ON pills). A green-tint "What you can do now" panel (send a new
request / change guardian email / keep exploring). Actions: **"Resend approval
request"** (green primary, the required button) + **"Change guardian email"**
(outline).

### 4 — Approval Request Resent (Minor)
Green check, "New request sent", "What happens next" card (guardian gets a new
email / account stays restricted / wrong address?), green primary **"Back to my
account"**.

### 5 — "Guardian approved your account" email (to minor)
Cloned from the verify-email template. "Your account is approved" + what's now
switched on + a note that under-18 protections stay on. CTA "Go to Soccernity".

### 6 — "Guardian declined your account" email (to minor)
"Your account wasn't approved" + account stays locked + you can resend or change
the guardian email from your account + ask your guardian why. CTA "Open my
account".

### 7 — Change Guardian Email (Minor)
Standalone settings-style screen (top bar + centred column, no hero icon). A
"Guardian email" card: current address (read-only) + a "New guardian email" input
+ a "double-check this" helper. Then a **prominent green-tint notice panel**:
*"Sending a new email restarts approval from scratch — your account goes back to
pending, the current approval link stops working, and a fresh request is sent to
the new address."* Actions: "Send new request" (green primary) + "Cancel"
(outline). → **Decision Log #60.**

---

## Decision Log

**Decision Log #60 added** (Build Plan Section 9): submitting a new guardian email
address (screen 11 / item 7) **restarts the guardian-consent flow from scratch** —
the account returns to `pending`, the existing approval token is invalidated, and a
new request is sent to the new address. The screen states this explicitly before
the user submits. This is the safe reading: a consent record is tied to a specific
guardian at a specific email, so changing the email means the recorded consent (or
pending request) no longer corresponds to who was asked — it must be re-obtained,
not silently transferred.

**Numbering:** PR #104 (`sprint-2/retrofit-screen-build-auth-email`) merged to
`main` and added Decision Log **#56–#59**; this branch is cut after that, so **#60**
is the next free number. `#45` remains reserved for the never-transcribed
Leaderboard real-names entry.

No other item in this pass required a Decision Log entry — items 1–6 are
straightforward screen/email builds against the existing pattern, not judgment
calls.

---

## Verification

- Every new frame walked node-by-node: **0 unbound solid paints** outside the
  Soccernity logo mark/wordmark artwork (inherited unchanged from the cloned source
  frames) — the same exception every prior Figma PR in this project documents.
- **0 `brand/green-tint-28` (`VariableID:5098:7071`)** in any of the 14 new frames —
  confirmed by walking every fill; the 12 paints that carried `-28` from the clone
  sources were rebound to `brand/green-tint` (`5096:5`). Note: the *un-retrofitted*
  sibling screens (Activation, Verify Email 1–4) still carry `-28` until the
  file-wide cleanup PR lands — so the new screens' icon washes are slightly lighter
  than those siblings' until then.
- **0 frame overlaps** across the whole Guardian Consent region and against every
  other page element (checked programmatically after all placements + the Design
  Notes frame resize).
- Screenshots captured for all 5 screens (desktop + mobile) and both emails.
- Guardian Consent Design Notes frame (`5116:6633`) updated: item 2 (placeholder
  copy) extended to cover the new screens, item 5 rewritten (decline path now
  designed), new item 13 added documenting all 7 items + Decision Log #60.
- Section banners widened: Guardian Consent (`5108:6624`) already covered the new x
  range; Email Template (`1870:2743`) widened to x 97200.
- **No real browser / Playwright check** — not available in this environment, same
  ceiling as every prior Figma PR.
- **No application code, DTOs, endpoints or backend touched.** Figma-only, plus
  this report, the CLAUDE.md status update, and Decision Log #60.

---

## What backend work these screens will need later (not done here)

Flagged for whenever backend work resumes — the screens are designed to not
over-assert:

- A **guardian decline/reject endpoint** — Decision Log #34 notes the backend has
  only a confirm path; screens 2/3/6 model "decision recorded" without asserting a
  specific endpoint.
- A **change-guardian-email endpoint** that implements the Decision Log #60
  restart-from-scratch behaviour (invalidate old token, set `consentStatus` back to
  pending, send a fresh request).
- The **approval and decline notification emails** (items 5, 6) have no backend
  send — same status as the five other unwired templates flagged in PR #104 §1G.
