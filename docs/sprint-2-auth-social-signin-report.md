# Sprint 2 — Auth Social Sign-In UI

**Branch:** `sprint-2/auth-social-signin`
**Date:** 2026-08-28
**Agent:** figma-design-system (additive UI on already-existing frames — same
category as the Register Date-of-Birth field added in PR #100, not a new screen)
**Figma file:** `weZWWqggy9j13eX8bhFgs6` ("Soccernity-MVP"), page "Soccernity" (`0:1`)

Adds Google / Apple / Facebook third-party sign-in options to the four auth
frames that were missing them. **Visual / UI only — no backend, no OAuth, no
click behaviour.** The wiring is a separate future push once the backend side
is ready.

---

## 1. Scope — exactly four frames

| Frame | Node | Before | After (frame height) |
|---|---|---|---|
| Login desktop | `407:844` | 1440 × 990 | 1440 × **1204** |
| Login mobile | `1625:2303` | 390 × 908 | 390 × **965** |
| Register desktop | `407:1051` | 1440 × 1490 | 1440 × **1770** |
| Register mobile | `1625:2333` | 390 × 1144 | 390 × **1331** |

Nothing else in the file was touched. The `Web app Navbar` component set, the
other Auth Pages frames (Forgot Password, Reset Password, Create Profile), the
Guardian Consent / Club Picker / Verify Email families, and the Email Template
section are all unchanged.

---

## 2. Layout / placement decision

The social options sit **below the primary email/password form and its submit
button**, introduced by an **"Or continue with"** divider, followed by three
full-width provider buttons stacked vertically.

```
 …form fields…
 [ Log in / Create account ]      ← solid brand/navy — unchanged primary CTA
 ──────  Or continue with  ──────  ← divider (new)
 [  G   Continue with Google   ]   ← white surface, 1px navy-tint border (new)
 [     Continue with Apple     ]
 [  f   Continue with Facebook ]
 Don't have an account? … / Already have an account? …   ← existing link, moved down
```

**Why below, not above:** email/password is Soccernity's established primary
auth path and every one of these frames is already built around it. Placing the
social buttons after the primary CTA, and styling them as outline/secondary
buttons against the solid-navy primary, keeps that hierarchy unambiguous. See
Decision Log #55 below — this is a recorded decision, not an assumed default.

**Consistency:** Login and Register use the identical block. Desktop and mobile
use the same layout language scaled down — desktop block is 440 wide (matches
the form), 52 px buttons, 16 px label, 16 px vertical rhythm; mobile block is
350 wide, 46 px buttons, 14 px label, 14 px rhythm. Same divider, same order,
same button chrome.

**Register mobile — one frame-specific nudge, disclosed:** on `1625:2333` the
Date-of-Birth picker is shown in its **open** state (`5379:6190`, a detached
group) and already visually overlaps the "Create account" button and the
"Already have an account?" link — a pre-existing condition from PR #100, not
introduced here. To keep the new block from landing under that open overlay,
it is positioned just below the picker's visual bottom rather than immediately
below the (visually-covered) primary button. In flow terms it is still "right
after the primary action"; in the other three frames the primary button is not
covered, so the block sits directly beneath it. When the picker is collapsed
(real usage) the block reads normally.

---

## 3. Token binding

Every non-brand-mark element is bound to the **Soccernity Theme** collection
(`VariableCollectionId:5096:2`), Light mode (`5096:0`) — no hardcoded hex, no
black, consistent with the PR #100 Auth Pages retrofit.

| Element | Variable | Value |
|---|---|---|
| Provider button background | `color/background/surface` (`5096:7`) | `#FFFFFF` |
| Provider button border (1px) | `color/icon/inactive` (`5097:2`) | navy @ ~15% |
| Provider button label | `color/text/primary` (`5096:8`) | `#282E65` |
| Divider rule (1px) | `color/icon/inactive` (`5097:2`) | navy @ ~15% |
| "Or continue with" text | `color/text/secondary` (`5096:9`) | navy @ 70% |

Frame backgrounds remain `brand/off-white` (`5182:6655`), untouched.

A full unbound-paint audit of all four placed blocks was run
(`use_figma`, walking every descendant). Result: **the only unbound solid fills
are the provider brand marks** — 4 Google colours, 1 Apple black, 1 Facebook
blue, per block. Everything else is variable-bound.

### Contrast

- `color/text/primary` `#282E65` on `#FFFFFF` = **12.6:1** — passes AAA.
- `color/text/secondary` navy @ 70% on `brand/off-white` ≈ **5.0:1** — passes AA
  (same alpha the Sprint D brand guide already validated for metadata text).

---

## 4. Provider logo assets — reused vs newly added

| Provider | Asset | Source |
|---|---|---|
| **Google** | `FRAME "Google logo" #355:188` (4-colour G: `#4285F4` / `#34A853` / `#FBBC02` / `#EA4335`) | **Reused as-is.** Existing in-file asset (Brand Guide social-icon demo area, `Group 98` `#355:219`). Cloned into each button, rescaled 30→20 px (desktop) / 30→18 px (mobile). |
| **Facebook** | `FRAME "Facebook logo" #355:174` (blue `#3C5A9A` + white "f") | **Reused as-is.** Same source group. Cloned + rescaled. See note below. |
| **Apple** | `FRAME "Apple logo"` (single black `#000000` silhouette) | **Newly created.** No Apple mark existed anywhere in the file (confirmed by name search for `apple` — zero hits). Built from the standard Apple logo silhouette via `figma.createNodeFromSvg`, one instance cloned into each of the four blocks; the white SVG-wrapper artefact fill was cleared so only the black glyph remains. |

**Facebook colour note:** the in-file asset uses `#3C5A9A`, Facebook's older
brand blue (current guideline blue is `#1877F2`). The brief said to check for a
reusable asset first and reuse it — so it was reused unchanged rather than
recoloured. If the OAuth-wiring pass wants the current blue, swapping the one
`Vector` fill inside `#355:174`-derived clones is a trivial follow-up.

**Brand-guideline exception (disclosed):** the provider marks follow each
provider's own trademark guidelines, **not** Soccernity's two-colour palette.
The Google G stays multicolour and the Apple mark stays black `#000000` — the
same category of documented exception already established for the undraw
illustration's skin/hair tones (PR #100) and the club-crest artwork (PR #97).
They are deliberately **not** rebound to navy/green and **not** flagged by the
token audit as debt.

---

## 5. What was NOT touched — explicit confirmation

- **No backend / OAuth / API code.** This PR contains no changes under
  `services/api/`, `apps/`, or anywhere outside Figma + these two docs. The
  buttons have no interaction, no variant, no prototype link, no `onClick`
  anywhere. They are static rectangles with a logo and a label.
- **No dark-mode variant or logic** — Light mode only, per brief.
- **No new brand colour** — non-negotiable #3 respected; the only non-palette
  colours are third-party trademarks (exception above).
- **No new Figma variables** — the five tokens used already exist.
- **No changes to the primary email/password form** on any frame — same
  fields, same primary button, same styling.

---

## 6. Pre-existing issues found (flagged, NOT fixed here)

1. **Register desktop `407:1051`** — the "Already have an account? Log in" link
   (`407:1091`) and its spacer (`407:1090`) were positioned at Left-Side y≈901,
   i.e. floating in the middle of the form, visually overlapped by the open
   date picker — stale coordinates left behind when PR #100 grew the form for
   the DOB field. Because this PR moves that link down to sit below the new
   social block (its obvious intended position, mirroring Login), the overlap
   is incidentally resolved. No other repair was attempted.
2. **Register mobile `1625:2333`** — the open Date-of-Birth picker
   (`5379:6190`) overlaps the "Create account" button (`1625:2359`) and the
   trailing link. Pre-existing (PR #100). Not fixed; the new block is placed to
   clear it (§2 above).
3. **Register mobile** still uses a single "Username" field where Register
   desktop uses "First Name / Last Name" — a pre-existing desktop/mobile
   divergence, unrelated to this task, untouched.

---

## 7. Decision Log entry — #55

**Added to `docs/Soccernity_MVP_Build_Plan_v1.7.docx` Section 9 (table 6) in
this PR** via `python-docx` (available this session, unlike PR #102's). Full
text below for convenience; the `.docx` row is the source of truth.

> **#55 — Third-party sign-in (Google / Apple / Facebook) on Login & Register:
> placement, hierarchy, provider order.**
> **Status: Resolved (design). Backend/OAuth wiring is a separate future task.**
> - Social sign-in is placed **below** the email/password form and its primary
>   submit button, under an "Or continue with" divider. Email/password remains
>   the visually primary auth path (solid `brand/navy` CTA); the three provider
>   buttons are secondary-style (white `color/background/surface` fill, 1px
>   `color/icon/inactive` border). Rejected alternative: social options above
>   the form / as the visually dominant choice.
> - **Provider order: Google, Apple, Facebook** — top to bottom, identical on
>   all four frames. No weighting implied beyond display order; Apple is placed
>   second partly because App Store review requires "Sign in with Apple" to be
>   offered wherever other third-party sign-in is offered, so it should not be
>   buried.
> - Provider marks follow each provider's own brand guidelines (multicolour
>   Google G, black Apple mark, Facebook blue), a documented exception to
>   brand non-negotiable #3, same category as the undraw illustration and club
>   crests.
> - The reused in-file Facebook asset uses the older `#3C5A9A` blue; left as-is
>   pending the OAuth pass.
> - **For the OAuth-wiring task:** "Sign in with Apple" has specific button
>   styling/sizing/localisation requirements in Apple's Human Interface
>   Guidelines for production. This mock uses a single unified Soccernity
>   button treatment for all three providers; whether the production Apple
>   button needs to diverge to satisfy Apple's review is an open question for
>   that task, not this one.

If nothing else in this PR rises to Decision-Log level — and nothing does — this
single entry covers it.

---

## 8. Node reference (created content)

| Frame | Social block node |
|---|---|
| Login desktop `407:844` | `Social Sign-In` `#5418:7075` (child of `Left Side` `407:846`) |
| Register desktop `407:1051` | `Social Sign-In` `#5418:7097` (child of `Left Side` `407:1053`) |
| Login mobile `1625:2303` | `Social Sign-In` `#5418:7141` |
| Register mobile `1625:2333` | `Social Sign-In` `#5418:7163` |

Each block: `Divider` (rule + "Or continue with" + rule) then
`Continue with Google` / `Continue with Apple` / `Continue with Facebook`
auto-layout buttons. Scratch template frames and the parked Apple original were
deleted before finishing.

---

## 9. Verification

- All four frames screenshotted after placement; layouts consistent
  Login↔Register and desktop↔mobile.
- Unbound-paint audit: clean except the six provider-mark colours per block
  (expected, disclosed).
- Contrast hand-checked for the two text tokens used (§3).
- No repo code paths changed — `git status` on this branch shows only
  `docs/sprint-2-auth-social-signin-report.md` and `CLAUDE.md`.
- No real browser / Playwright check — none available in this environment,
  same ceiling as every prior Figma PR in this project.

**Not merged** — Temi's call after independent verification, per the standing
instruction for every design-stage PR.
