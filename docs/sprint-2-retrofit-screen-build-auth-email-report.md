# Sprint 2 — Auth Pages + Email Template: combined audit-and-build pass

**Branch:** `sprint-2/retrofit-screen-build-auth-email`
**Agent:** figma-design-system
**Date:** 2026-08-28
**Figma file:** `weZWWqggy9j13eX8bhFgs6` ("Soccernity-MVP"), page "Soccernity" (`0:1`)

Follows PR #100 (`sprint-2-retrofit-light-mode-auth-email-report.md`, token retrofit +
DOB field + reset-password email) and PR #101 (`sprint-2-mobile-navbar-variant-report.md`,
mobile navbar). Those were token/component passes; **this pass audits the auth and
email *flows* for missing screens, missing mobile counterparts and field accuracy
against the MVP Build Plan, and builds the fixes in the same PR** — the same
audit-and-build model the Admin Panel unification pass used.

Reference standard: light-mode Soccernity Theme variables (collection `5096:2`),
"Home Page Desktop — Premium Light" (`5204:6728`) and the existing Auth Pages
frames. No hardcoded hex. No `brand/green-tint-28` (Decision Log #47).

---

## 0. Scope

**Built in:** the "Auth Pages" section (Login / Register / Forgot / Reset / Create
Profile, desktop + mobile) and the "Email Template" section. Plus two fixes in the
adjacent **"Guardian Consent & Age Verification"** section that are squarely part of
the registration flow this audit covers (the age-gate rejection screen and the
guardian-relationship field) — flagged as cross-section, built here because the
task brief explicitly names the guardian-consent flow as in scope for the
audit-and-fix.

**Not touched:** every other section (Blog, Sports, Bants, Message, Contest,
Community, Create Post, Settings, Components, Admin Panel, Homepage, mobile
Community/Message).

Backend contract cross-referenced directly against `services/api/src/modules/auth/`
(all DTOs, `registration-email.service.ts`, `password-reset-email.service.ts`,
`guardian-relationship.constants.ts`, `email-verification-token.store.ts`) and the
shipped `apps/web/src/pages/signup/` + `ForgotPasswordPage.tsx`.

---

## 1. FINDINGS — Step 1: follow-up screens / flow completeness

| # | Finding | Resolution |
|---|---|---|
| **1A** | **No "Verify your email" email template.** `RegistrationEmailService.sendVerificationEmail` really sends one (subject *"Verify your Soccernity email"*), the Verify Email landing screens (`5143:*`) exist, and the sibling password-reset and guardian-consent emails both have designs — but the verify-email email itself had none. | **BUILT** — `Success email - verify email` (`5439:7053`) + title head (`5435:8132`). Link-based (CTA + fallback), matching `VerifyEmailPage.tsx` (`?token=`), the landing screens, and Section 8.3's "link" model for the analogous guardian email. Copy states the real 48-hour TTL (`DEFAULT_EMAIL_VERIFICATION_TTL_MS`). See Decision Log **#56**. |
| **1B** | **No age-gate rejection / below-minimum-age screen.** Decision Log #19 hard-blocks signup below age 5 (`AgeGateStep.tsx` `MINIMUM_SIGNUP_AGE`); Sprint D's guardian-consent report item 6 explicitly deferred the screen to figma-design-system pending a colour decision. | **BUILT** — `Guardian Consent — 1a Age Gate — Below Minimum Age` (`5464:7077`), cloned from the Age Gate split-shell. Calm navy/white informational treatment ("Soccernity isn't for you just yet… come back when you're older"), **not** an error/denial colour — the two-colour palette rule holds. Navy button, not the green "go" CTA. See Decision Log **#57**. |
| **1C** | **Guardian-relationship select still says "OPTIONS PENDING PRODUCT DECISION".** The option list is now defined in code — `GUARDIAN_RELATIONSHIPS = ['Parent', 'Legal Guardian', 'Grandparent', 'Other']` — and shipped in `GuardianDetailsStep.tsx`. | **BUILT** — `Guardian Consent — 2 Guardian Details Capture` (`5108:6627`): the pending note is replaced with the resolved option list ("Options: Parent · Legal Guardian · Grandparent · Other — matches `GUARDIAN_RELATIONSHIPS`"). Design Notes frame item 3 updated to RESOLVED. |
| **1D** | **No "reset link sent" confirmation screen** for the forgot-password flow. The shipped `ForgotPasswordPage.tsx` has an enumeration-safe `submitted` state ("If an account exists for that email, we've sent instructions…"); the Figma "Forgot Password" frame stops at the form. | **BUILT** — `Forgot Password — Link Sent` desktop (`5474:7077`) + mobile (`5474:8375`). "Check your email" + enumeration-safe copy + 60-minute TTL + a "didn't get it?" panel + "Back to log in". |
| **1E** | **No account-deletion / deactivation email.** Decision Log #42 built a 30-day grace period on `POST /auth/delete-account` *specifically to allow recovery from an accidental or coerced deletion request* — which requires notifying the user. No template existed. | **BUILT** — `Success email - account deletion requested` (`5439:7074`) + title head (`5435:8134`). States the 30-day window and "sign back in to cancel". See Decision Log **#59**. No backend send wired yet (same status as the five other unwired templates — 1G). |
| **1F** | **verify-email backend placeholder copy is code-based, frontend is link-based.** `registration-email.service.ts` currently renders a "verification code"; `VerifyEmailPage.tsx` + the landing screens read a `?token=` link. | **FLAGGED** — the email was designed link-based (1A). The backend body is explicitly marked *"Minimal, functional inline bodies — not final"*; it needs reconciling to a link when Postmark goes live. Decision Log **#56**. |
| **1G** | **5 of 8 email templates aren't wired to a backend send** (account-created welcome, both password-change, both admin/moderator). Only verify-email, password-reset and guardian-consent are real sends today. | **CARRIED FORWARD** — PR #100 §5.1 already flagged this; it's a backend/product gap, not a design gap. The new deletion-requested and verify-email templates are noted with the same status. |
| **1H** | **No "consent declined" screen / the "I do not consent" button has no backend action** (Decision Log #34, pending founder). | **CARRIED FORWARD** — not built; still pending founder confirmation on whether a decline endpoint + screen should exist. |
| **1I** | **No resend-verification-email endpoint or affordance** (Decision Log #37, open). Verify Email state 3 ("Link Invalid Or Expired") shows a disabled "Contact support". | **CARRIED FORWARD** — not built; still pending backend/product. |

---

## 2. FINDINGS — Step 2: missing mobile screens (Auth Pages + Email Template only)

**None.** Every Auth Pages screen family — Login, Register, Forgot Password, Reset
Password, Create Profile — has both a desktop and a mobile frame, and each mobile
frame now carries the correct mobile navbar variant (PR #101). The new
`Forgot Password — Link Sent` screen was built in both widths (1A/1D) so it doesn't
introduce a gap. Email templates are single fluid-width artifacts; a separate
"mobile" frame does not apply.

*(Broader observation, out of this step's scope: the entire "Guardian Consent &
Age Verification" section is desktop-only — no mobile frames exist for any of the
six consent screens or the new rejection screen. That's a whole-section gap for a
future pass, not built here.)*

---

## 3. FINDINGS — Step 3: field accuracy vs. the Build Plan

Backend register contract (`RegisterDto`): `email` (req), `password` (req, ≥8),
`displayName` (req), `phone` (optional), `dateOfBirth` (req, ISO), `guardian`
(req if minor: `{name, email, relationship}`), `clubId` (optional UUID).

| # | Finding | Resolution |
|---|---|---|
| **3A** | **Register mobile (`1625:2333`) used a "Username" field; Register desktop uses "Full Name" (First/Last).** `RegisterDto` has `displayName`, no `username`; `User` has no `username` column (confirmed — CLAUDE.md's own "Create Profile investigated, not built" analysis); the shipped `RegisterStep.tsx` collects First + Last → `displayName`. | **FIXED** — mobile "Username / Enter Username" replaced with a "Full Name" First Name / Last Name row matching desktop. While there, fixed the mobile frame's vertical stacking (Terms text, Create-account button and the social block were overlapping the always-open date picker). |
| **3B** | **"Create Profile" desktop (`1498:2303`) + mobile (`1629:2449`) is almost entirely unbacked.** Every field is either duplicative or has no column/endpoint: Username (no column), Add a Profile Picture (no avatar column, no profile-MediaAsset wiring), Date of Birth (excluded from `PATCH /users/:id` server-side per Decision Log #35; already captured at Age Gate / Register), Full Name (duplicate of Register), Location (no column), Bio (no column), Preferred Club (`clubAffiliationId` exists but no endpoint writes it — club join goes through the Club Picker step / `POST /clubs/:id/join`). CLAUDE.md already concluded this screen is "a superseded/alternate design… not built." | **FLAGGED — FOUNDER-BLOCKED, not redesigned.** Whether Soccernity adopts a username / avatar / bio / location profile model is a product + data-model decision only the founder can make. Recommendation: either formally mark the Create Profile screen non-canonical (real signup = Age Gate → Guardian Details → Register → Verify Email → Club Picker), or commit to the Section 3 additions and rebuild it against a real spec. See Decision Log **#58**. |
| **3C** | **`RegisterDto.phone` is optional and is collected by no signup screen** (Register desktop has no phone field; `RegisterStep.tsx` omits it). It *is* editable post-signup in `ProfilePage.tsx`. | **NON-FINDING, noted.** `phone` is deliberately forward-looking (SMS 2FA — there's a Settings screen for it) and optional. Not added to signup — adding UI the shipped flow deliberately skips would be drift in the other direction. |
| **3D** | **The 8-character password minimum (Decision Log #14) is stated nowhere in the UI.** | **FIXED** on the two screens where a password is *created* — Reset Password desktop + mobile now show a "Use at least 8 characters." helper under the Password field. (Register's password field left as-is to avoid disturbing the open-calendar layout; noted for figma-to-code.) |
| **3E** | **Email "title head" frames carry hardcoded black text** (`{0,0,0}`, unbound) and 2 of 5 captions were stale against PR #100's redesigned email headings. | **FIXED** — all 5 title heads bound (text → `color/text/primary`, frame bg → `color/background/surface`), captions synced. |
| **3F** | **The password-reset-link email (`5372:7272`, added in PR #100) had no title-head frame** — every other email has one. | **FIXED** — `Password reset link title head` (`5435:8130`) created. |

Login / Forgot Password / Reset Password field sets otherwise match their DTOs
exactly (`LoginDto` = email + password; `ForgotPasswordDto` = email;
`ResetPasswordDto` = token from URL + newPassword). "Stay signed in" on Login maps
to the refresh-token lifetime (Section 5.7) — legitimate, no backing field needed.

---

## 4. What was built — index

### Email Template section
| Node | Name | Notes |
|---|---|---|
| `5439:7053` | Success email - verify email | NEW. Link-based, 48h TTL. Cloned from `5372:7272`, all bindings inherited. |
| `5435:8132` | Verify email title head | NEW. |
| `5439:7074` | Success email - account deletion requested | NEW. 30-day grace, "sign back in to cancel". |
| `5435:8134` | Account deletion requested title head | NEW. |
| `5435:8130` | Password reset link title head | NEW — closes the one missing title head (3F). |
| `1661:2763/2765/2767/2769/2779` | 5 existing title heads | Bound (text→primary, bg→surface); 4 captions synced (3E). |
| `1870:2743` | Email Template section banner | Widened to cover the 3 new columns. |

### Auth Pages section
| Node | Name | Notes |
|---|---|---|
| `1625:2333` | Register mobile | "Username" → "Full Name" First/Last row (3A). Vertical stacking fixed (terms / button / social had overlapped the open calendar). |
| `409:1463` / `1625:2404` | Reset Password desktop / mobile | "Use at least 8 characters." hint added (3D). |
| `5474:7077` | Forgot Password — Link Sent desktop | NEW (1D). Enumeration-safe. |
| `5474:8375` | Forgot Password — Link Sent mobile | NEW (1D). |
| `1870:2741` | Auth Pages section banner | Widened to cover the 2 new "Link Sent" frames. |

### Guardian Consent & Age Verification section (cross-section, registration flow)
| Node | Name | Notes |
|---|---|---|
| `5464:7077` | Guardian Consent — 1a Age Gate — Below Minimum Age | NEW (1B). Navy/calm, no error colour. |
| `5108:6627` | Guardian Consent — 2 Guardian Details Capture | Relationship "OPTIONS PENDING" note → resolved 4-option list (1C). |
| `5116:6633` | Guardian Consent — Design Notes & Open Decisions | Items 3, 6, 7, 9, 11, 12 updated to RESOLVED. |
| `5108:6624` | Section banner | Widened to cover the new `1a` frame. |

---

## 5. Deliberately left unresolved (and why)

| Item | Why not resolved here |
|---|---|
| **3B — Create Profile screen** | Founder product + data-model decision (adopt a username/avatar/bio/location model, or deprecate the screen). Not something design can decide unilaterally. Decision Log **#58**. |
| **1F — verify-email backend copy (code vs link)** | Backend + safeguarding-drafter change. The email is designed link-based; the backend placeholder body needs updating when Postmark goes live. Flagged in Decision Log **#56**. |
| **1G — 5 unwired email templates** | Backend/product: whether/when the account-created, password-change and admin/moderator emails get a real backend send. Carried forward from PR #100 §5. |
| **1H — consent-declined screen / decline endpoint** | Decision Log #34, pending founder — whether a decline endpoint (and screen) should exist at all. |
| **1I — resend-verification-email** | Decision Log #37, pending backend/product. |
| **Guardian Consent section has no mobile frames** | Whole-section scope, out of this pass's Auth-Pages/Email focus. Flagged for a future figma-screen-builder pass. |
| **`1380:2297` vs `1380:2318` (two near-duplicate password-change emails)** | PR #100 §8.4 open item — product call on keeping both or retiring one. Not touched. |
| **Register password field 8-char hint** | Left off to avoid disturbing the open-calendar layout on that frame; noted for figma-to-code. |

---

## 6. Verification

- Every new / touched frame walked node-by-node: **0 unbound solid paints** outside
  the documented `undraw` illustration skin tones (inherited unchanged from the
  cloned Age Gate / Forgot Password frames) and the Soccernity logo mark/wordmark
  artwork — identical exceptions to every prior Figma PR in this project.
- New email frames use only tokens inherited from the `5372:7272` clone
  (`color/background/surface`, `color/text/primary`, `color/text/secondary`,
  `brand/navy`, `color/text/on-navy`). New title heads bound to
  `color/text/primary` + `color/background/surface`.
- Age-gate rejection + Forgot Password — Link Sent frames use only tokens inherited
  from their clone sources; the rejection button was re-bound green→navy +
  label→on-navy.
- Screenshots captured for: Register desktop + mobile, Reset Password desktop +
  mobile, the two new email frames, the age-gate rejection screen, both
  Forgot-Password-Link-Sent screens, Guardian Details Capture.
- Overlap check run across the whole Auth Pages + Guardian Consent zones after all
  moves — **0 frame overlaps**.
- **No real browser / Playwright check** — not available in this environment, same
  ceiling as every prior Figma PR in this project.
- **No application code touched** — Figma-only, plus this report, the CLAUDE.md
  status update, and Decision Log entries #56–#59.

---

## 7. Decision Log entries added (Build Plan Section 9)

`#45` is left free (reserved for the never-transcribed Leaderboard real-names entry,
per PR #100's numbering note). This pass uses **#56–#59**.

- **#56** — Email-verification email: magic-link, not code. The email is designed
  link-based (CTA → `/verify-email?token=…` + fallback URL), matching the shipped
  `VerifyEmailPage.tsx`, the Verify Email landing screens, and Section 8.3's "link"
  model for the analogous guardian email. `registration-email.service.ts`'s
  placeholder body currently renders a "verification code" — explicitly marked
  non-final; to be reconciled to a link when Postmark is wired.
- **#57** — Age-gate rejection screen visual treatment. Below-age-5 hard block
  (Decision Log #19) needed a screen; the colour was deferred pending a palette
  call. Resolved: a calm navy/white *informational* state, not an error/denial
  colour — no new colour, the two-colour palette rule holds. Screen
  `Guardian Consent — 1a Age Gate — Below Minimum Age` built.
- **#58** — "Create Profile" screen (`1498:2303` / `1629:2449`) status. Every field
  is unbacked or duplicative (username / avatar / bio / location have no `User`
  column; DOB is server-excluded; Full Name / Preferred Club duplicate Register /
  Club Picker). Founder-blocked: formally deprecate the screen, or commit to the
  Section 3 data-model additions and rebuild against a real spec. Not redesigned.
- **#59** — "Account deletion requested" email. Decision Log #42's 30-day grace
  period exists to allow recovery from accidental/coerced deletion, which requires
  notifying the user. Template built (`5439:7074`); no backend send wired yet
  (same status as the five other unwired templates).
