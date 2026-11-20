# sprint-2/privacy-settings-design — report

**Agent:** figma-design-system / figma-screen-builder · **Date:** 2026-09-05
**Scope:** Figma design only — no `apps/web` / `services/api` code.
**File:** Soccernity-MVP (`weZWWqggy9j13eX8bhFgs6`), page `Soccernity` (`0:1`).
**Decision Log:** #215 added (Build Plan Section 9).

A new Privacy Settings page, desktop + mobile, following the existing Settings family's
visual pattern.

---

## Live verification before building

- **No Privacy Settings page existed.** Confirmed: "Privacy Settings" appears only as
  `Footer › Legal Links › Link — Privacy Settings` on the live screens (`Sports Page`
  logged-in / logged-out) with **no destination**; every other occurrence is inside an
  ARCHIVED frame. This new page is that link's destination.
- **A separate `Settings — Privacy & Safety` screen exists** (`2922:5382` desktop /
  `5649:8092` mobile) — but it's the *interaction* privacy screen ("who can see your
  posts", "who can DM you"), a different concern from this data/rights page. Their
  relationship is flagged as an open IA question (see below), **not** silently merged.
- **Marketing email — confirmed live:** `services/api` sends **only transactional**
  email — `RegistrationEmailService` (verify email, guardian-consent) and
  `PasswordResetEmailService` (password reset), both via Postmark. There is **no**
  marketing / newsletter / promotional email service anywhere. → the opt-out is a
  disabled "Coming soon" row, not a working toggle.
- **Data export — confirmed live:** no data-export / DSAR endpoint in `services/api`.
  → "Download my data" is a request-style action ("we'll email you a link when it's
  ready"), not an instant download.

---

## What was built

| Frame | Node | Cloned from |
|---|---|---|
| **Settings — Privacy** (desktop) | `6178:14437` | `Settings — Overview` (`2905:4798`) |
| **Settings — Privacy — Mobile** | `6185:14547` | `Settings — Overview — Mobile` (`5607:7813`) |
| **Privacy Settings — Design Notes** (canvas annotation) | `6191:15563` | — |

Cloning the Overview frames inherits the shared chrome (navbar / Top Bar, left profile
column on desktop, nav rail, vertical rules) and every variable binding. Only the
content panel / section was rebuilt.

**Nav rail / category nav:** "Privacy and safety" set active (`Property 1=clicked privacy`
variant on desktop; navy fill + white text on the mobile nav row), "Account" reset to
resting — matching how every other Settings frame marks its own active category.

### Content rows (both viewports)

| Row | Control | Reused component | Notes |
|---|---|---|---|
| **Public profile** | `Settings Toggle` (State=On) | `5694:8219` | "When this is off, only people who follow you can see your profile, posts, and activity." |
| **Download my data** | chevron | family row pattern | request-style — no export endpoint yet |
| **Account status** | chevron → **Deactivate flow** | family row pattern | `ON_CLICK NAVIGATE` → `2924:7358` (desktop) / `5695:8262` (mobile) |
| **Guardian approval** *(under-18 only)* | green **"Approved"** pill + "Change guardian email ›" link | family row pattern + new pill | link `ON_CLICK NAVIGATE` → `5498:7164` (desktop) / `5501:8536` (mobile); copy states it's only shown for accounts under 18 |
| **Marketing emails** | **disabled** `Settings Toggle` (State=Off, 40% opacity) + green-tint **"Coming soon"** pill | `5694:8219` | capability doesn't exist — see verification above |

Row list-rows, section header, icons (`people-sharp`, `document-lock-sharp`,
`close-circle`, `information-circle-sharp`) and the toggle are all **reused from the
Settings family**, not redrawn. The only new primitives are the two status pills
(small rounded auto-layout chips: `brand/green` / `brand/green-tint` bg, bound tokens).

---

## The two scope judgment calls (Decision Log #215)

1. **Cookie / local-storage preferences — deferred, deliberately not shown.**
   The counsel-review risk register (item #15, `docs/legal-copy-draft-tos-privacy-policy.md`)
   records that the cookie / local-storage audit hasn't happened. A cookie-preferences
   toggle would assert control over something unaudited — misrepresenting what's
   actually true. Flagged in the on-canvas design note **and** the Decision Log — a
   visible, tracked gap, not a silent omission. Add the control once the audit exists.

2. **Marketing / email opt-out — disabled "Coming soon" row.**
   No non-transactional email is sent (verified against `services/api`). A functioning
   toggle would imply a capability that doesn't exist. Built as a visibly-disabled row
   with an explanation; becomes a real toggle if/when marketing email is introduced.

**Also open (flagged, not resolved):** the relationship between this new "Privacy" page
and the existing `Settings — Privacy & Safety` screen — merge into one, nest one under
the other, or keep separate (data/rights vs. interaction controls). Founder IA call.

---

## Verification

- **Screenshot-verified against `Settings — Overview` (desktop) and
  `Settings — Overview — Mobile`** — same navbar/Top Bar, same nav rail, same
  list-row / section-header treatment, same type ramp (Montserrat SemiBold 18 title /
  Regular 14 subtitle desktop; 20 / 15 mobile), same toggle component.
- **Token discipline:** no new colour, **no `brand/green-tint-28`**, Light mode only.
  Paint audit — mobile: **0 unbound**; desktop: **1 unbound** (`Rectangle 120`,
  `#d9d9d9` — the left profile card's cover-photo placeholder plate, inherited
  identically by every Settings desktop frame, not authored here).
- Prototype `ON_CLICK` links wired for Account status → Deactivate and Change
  guardian email → Guardian Consent 11, on both viewports.
- No real browser / Playwright check available — screenshot + structural audit is the
  ceiling, same as every prior Figma pass.

## Decision Log

- **#215** added (Build Plan Section 9) — records the page, both scope judgment calls
  (cookie deferral, marketing disabled state), and the open `Privacy` vs.
  `Privacy & Safety` IA question.
