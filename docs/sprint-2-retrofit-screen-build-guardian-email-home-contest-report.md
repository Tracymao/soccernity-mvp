# Sprint 2 — Audit-and-build pass: Guardian Consent, Email Verification, Homepage/Leaderboard, Contest

**Branch:** `sprint-2/retrofit-screen-build-guardian-email-home-contest`
**Agent:** figma-design-system
**Date:** 2026-08-28
**Figma file:** `weZWWqggy9j13eX8bhFgs6` ("Soccernity-MVP"), page "Soccernity" (`0:1`)

Combined audit-and-build pass over four sections. For each section: (1) follow-up
screens check, (2) missing-mobile check, (3) field-accuracy check against the MVP
Build Plan / shipped code, (4) build the fix. Light-mode Soccernity Theme
variables (collection `5096:2`), no hardcoded hex. Matches the canonical homepage
(`5204:6728`) and the existing Auth / Guardian-Consent / Verify-Email screens.

No application/backend code touched — backend remains paused. Founder-blocked
items are listed explicitly per section and are **not** guessed at.

---

## Headline deliverables (explicitly confirmed)

- **All 3 Leaderboard Contest-tab states built:**
  - `5524:7188` — **Contest Tab · 1 Pending (Weeks 1–3)** — empty/pending state
  - `5524:7512` — **Contest Tab · 2 Live — Level 1 Final (Week 4)** — live state
  - `5524:7836` — **Contest Tab · 3 Crowned — Monthly Winners** — final state
- **Both navigational connectors built:**
  - **Contest → Leaderboard:** "View leaderboard ›" CTA on **Contest — Weekly
    Results (Top 3)** (`5528:7260`, new frame)
  - **Leaderboard → Contest:** "View this contest ›" on all 3 Contest-tab
    states — the pending state's primary CTA, and the table-footer link on the
    live and crowned states
- Design-notes frame documenting the mechanic:
  **`Leaderboard — Contest Tab & Monthly Mechanic — Design Notes`** (near the 3
  state frames).

---

## SECTION 1 — GUARDIAN CONSENT (second pass)

### Step 1 — follow-up screens

| Finding | Resolution |
|---|---|
| No screen for a guardian who clicks a consent link that has **expired** (`consentTokenExpiresAt` is enforced on confirm) or has **already been used**. | **BUILT** — `Guardian Consent — 12 Approval Link Unusable (Guardian)`, desktop `5533:7264` + mobile `5533:7306`. Neutral treatment (no red), covers both cases (indistinguishable from the guardian's side), routes to "Ade can send a fresh request from their account". Deliberately does not assert a specific backend error contract → **Decision Log #64**. |
| GC10 "Approval Request Resent" copy assumes the request went to the *same* guardian; after GC11 "Change Guardian Email" the request goes to a *new* address. | Minor — GC11's own notice panel already states the flow restarts and a fresh request goes to the new address (Decision Log #60). GC10's copy left generic; not a separate screen. |
| Guardian decline path — screens 8/9 + decline emails exist, but there is **no decline endpoint** and `Guardian.consentStatus` has no `"declined"` value (`pending | confirmed` only). | **Founder-blocked** (Decision Log #34, backend paused). Screens model "decision recorded" without asserting an endpoint — unchanged. |
| Post-`GuardianDetailsStep` "request sent" confirmation for the minor. | Not needed — GC5 "Restricted Pending" ("We emailed …") already serves this. |

### Step 2 — missing mobile

Guardian Consent had **no** mobile frames for screens 1, 1a, 2, 4, 5, 6 (screens
7–11 got mobile in PR #105).

| Screen | Resolution |
|---|---|
| **4 Web Consent Confirmation** | **BUILT** — `5531:7626` |
| **5 Restricted Pending State** | **BUILT** — `5531:7461` |
| **6 Activation Confirmation** | **BUILT** — `5531:7544` |
| **1 Age Gate**, **1a Age Gate — Below Minimum Age**, **2 Guardian Details Capture** | **NOT built — scoped follow-up.** These three are split-screen *auth-flow* screens (Right Panel + Left Panel, same shell as Login/Register). Their mobile counterparts belong to the **auth-mobile pattern** established by PR #100/#101 (`header 7 — mobile` navbar + single form panel), not the centred status-screen recipe used for 4/5/6. Building them here would either duplicate that pattern inconsistently or pull the whole auth-mobile navbar work into this PR. Flagged for the next auth-mobile pass. |

### Step 3 — field accuracy

| Finding | Resolution |
|---|---|
| **GC2 collects guardian name as First Name + Last Name (two inputs).** `GuardianDetailsDto.name` is a single `String`; `Guardian.name` is a single column. | **FIXED** — collapsed to one "Guardian's full name" input on `5108:6627`. → **Decision Log #63**. |
| **Consent-link lifetime stated as "7 days"** in ~6 places. Code: `DEFAULT_CONSENT_TOKEN_TTL_HOURS = 72` (3 days). | **FIXED** — all copy → "3 days" / "18 August 2026" (GC2, GC3 reference email, GC4 desktop+mobile, GC10 desktop+mobile). `consent-token.constants.ts` itself flags 72h as provisional (DPIA R5, unreviewed) → **Decision Log #62**. |
| **GC5 "you can resend once every 24 hours"** — no resend cooldown is implemented in `resendConsent()` (same class as the already-fixed `GuardianConsentPage.tsx` dead-code bug). | **FIXED** — copy on GC5 desktop + mobile now says to check spam / send again, with no cooldown claim. |
| **GC4 "Request Summary" panel** (minor name / DOB / relationship / request date) needs a GET-by-consent-token endpoint that does not exist; `POST /auth/guardian-consent` returns `{ message }` only. The shipped `GuardianConsentConfirmPage` omits the panel. | **Annotated** (not deleted) on GC4 desktop + mobile: "REFERENCE ONLY — no GET-by-consent-token endpoint … Founder-blocked (Decision Log #34 / token-lookup endpoint)". |
| GC2 relationship options. | Already correct — `Parent · Legal Guardian · Grandparent · Other` (matches `GUARDIAN_RELATIONSHIPS`), fixed in PR #104. Confirmed. |

---

## SECTION 2 — EMAIL VERIFICATION (first pass of this type)

### Step 1 — follow-up screens

| Finding | Resolution |
|---|---|
| No **"resend verification email"** screen/action. The section's own Design-Notes frame flags this as an OPEN PRODUCT DECISION — there is no `POST /auth/resend-verification` endpoint (only guardian-consent has a resend path). | **Founder-blocked.** Recovery is currently support-led. Not designed here — needs the endpoint specced into Build Plan Section 4.1 first. |
| The "Verified" state (screen 2) may need a **minor variant** — a verified under-18 whose guardian consent is still pending. Screen 2 currently handles this with one disclosure row ("Under-18 accounts may still be waiting"). | **Founder-blocked** (VE Design-Notes item 4, verbatim: "the real product decision — should a pending-consent minor be routed to the existing Restricted Pending State screen instead of into the app? — belongs to product"). Not resolved here. |
| Failure state does not distinguish expired from invalid (screen 3). | Deliberate (VE Design-Notes item 2) — matches the backend's single non-enumerating 400. Confirmed, no change. |

### Step 2 — missing mobile

Email Verification had **zero** mobile frames. **All four built:**

| Screen | Frame |
|---|---|
| 1 Verifying | `5531:7264` |
| 2 Verified | `5531:7284` |
| 3 Link Invalid Or Expired | `5531:7356` |
| 4 Missing Token | `5531:7412` |

390 px wide, cloned from desktop; top bar → 90 px logo bar with a fresh logo
clone (the desktop logo group has SCALE constraints and cannot survive a frame
resize — replaced, not scaled); content column → 342 px; hero icon 88 → 72 px;
button rows stacked full-width.

### Step 3 — field accuracy

Verify-Email screens are status screens that read `?token=` and reflect
`POST /auth/verify-email`'s four outcomes (verifying / verified / invalid /
missing token). No form fields, nothing to reconcile against a DTO. `verificationStatus`
transitions (`unverified` → `verified`) are backend-only. **No findings.**

---

## SECTION 3 — HOMEPAGE (including Leaderboard Page Desktop)

### Homepage (`5204:6728`, canonical per Decision Log #46)

**Step 1 — follow-up screens.** The one real open question is whether `/` is the
logged-out **marketing** page or the authenticated **home feed** — flagged in the
homepage-rebuild report (§10 candidate #1) and unchanged. The canonical frame is
the marketing page; the authenticated feed is a Community-pillar concept with no
frame and no `apps/web` route (`/` is still a `PlaceholderPage`). **Founder-blocked
— no new screen built.**

**Step 2 — missing mobile.** There is **no mobile homepage**. **NOT built —
scoped follow-up.** The canonical desktop page is 5298 px tall and was only just
settled (Decision Log #46, this same sprint, after three passes); a mobile
rebuild is a substantial standalone effort that should get its own pass rather
than be rushed into a four-section sweep. Flagged.

**Step 3 — field accuracy.** The homepage is marketing content; most of it has no
Section 4 backing and is already flagged:
- "Matches happening right now" / "Today's fixture" — no fixtures endpoint
  (**Decision Log #6**, sports-data vendor). Placeholder; figma-to-code must not
  wire it.
- "What football is talking about" (news) — no news endpoint. Same.
- "Season record" hero card (matches / goals / assists) — implies a per-player
  stats model absent from Section 3 (homepage-rebuild-variables report already
  flags this). Placeholder.
- Hero CTAs ("Create your profile" → signup, "Explore fixtures" → Sports Hub) —
  fine.

All confirmed still-open / founder-blocked; **no new build.**

### Leaderboard Page Desktop (`5171:6633`)

**Step 1 — follow-up screens + taxonomy check.** The locked
Global + per-club + per-competition + per-time-period requirement is **already
satisfied** by the existing filter bar (`5172:6659`) — four combinable controls
on one frame, plus an active-filter summary row. Confirmed, no change to the base
frame.

The **Contest-type competition tab** needed its three phase states — **all built**
(see headline deliverables and Decision Log #61):

| State | Frame | What it shows |
|---|---|---|
| **Pending (Weeks 1–3)** | `5524:7188` | Centred empty-state card, week-progress chips (Week 1 done / Week 2 done / Week 3 in play), "9 weekly winners so far — this number varies month to month", primary CTA **"View this week's contest ›"**. |
| **Live — Level 1 Final (Week 4)** | `5524:7512` | Persistent "LEVEL 1 FINAL · LIVE" banner; every weekly winner listed (9 shown, count described as variable) with a "WEEKLY ROUND" column (Won Week 1/2/3); "Live order — positions move…" note; table-footer link **"View this contest ›"**. |
| **Crowned — Monthly Winners** | `5524:7836` | "AUGUST · MONTHLY WINNERS DECIDED" banner; top 3 carry a text pill ("1st · Monthly winner" — no trophy/medal iconography, Leaderboard rule); table-footer link **"View this contest ›"**; "Next month's weekly rounds start Monday" note. |

Common to all three: COMPETITION filter set to "Contest"; TIME PERIOD segmented
relabelled **This month / Past months**; `brand/green-tint-28` paints inherited
from the clone source rebound to `brand/green-tint` (12%) per Decision Log #47
(13 paints each).

**Step 2 — missing mobile.** No mobile leaderboard. **NOT built — scoped
follow-up** (same reasoning as homepage mobile; the leaderboard is a wide data
table and warrants its own mobile pass).

**Step 3 — field accuracy.** Unchanged from the Leaderboard design report:
- **Points model** — no `User` points field, no Section 4 endpoint. The board
  (and now the Contest tab) rank by placeholder integers. **Founder-blocked** —
  figma-to-code must not build until a scoring model is specced.
- **Club axis** — `ClubPage` membership vs `User.clubAffiliationId` vs unbuilt
  grassroots teams. **Founder-blocked.**
- **Public visibility to logged-out visitors.** **Founder-blocked** (safeguarding-adjacent).

---

## SECTION 4 — CONTEST (newly added)

Scope taken as the **user-facing** Contest section (`2072:5584` entries+ranking,
`2155:1062` details, `2094:994` voting). The admin-side Contest task frames
(`2363:*`, `5403:*`) are part of the Admin Panel (PR #102) and out of scope.

### Step 1 — follow-up screens

| Finding | Resolution |
|---|---|
| No **contest results screen** (a concluded week's top 3) — needed for the monthly mechanic and for the "View leaderboard" connector. | **BUILT** — `Contest — Weekly Results (Top 3)` (`5528:7260`), light-token standard, 3 winner cards + "These three go through to the Week 4 final" + **"View leaderboard ›"** connector + "View all entries ›". |
| The user-facing Contest pages have no **phase indicator** — nothing distinguishes a weekly round (weeks 1–3) from the Week 4 Level 1 final. | **Flagged — Contest section's own build pass.** The three existing frames are old-style, fully unbound, and pre-date the monthly mechanic; retrofitting them + adding a "Week N of 4 / Level 1 Final" state is a section-sized job, not a connector add-on. The mechanic itself is documented in the new design-notes frame and Decision Log #61. |
| "View leaderboard" CTA was **not** added to the existing `2072:5584` "Contest Leaderboard" panel. | Deliberate — `2072:5584` is 100% hardcoded/unbound and slated for its own retrofit; injecting one token-bound node there would be inconsistent. The connector lives on the new light-standard results frame. Noted for whoever retrofits `2072:5584`. |

### Step 2 — missing mobile

Contest has **no mobile frames at all**. **NOT built — scoped follow-up.** The
whole user-facing Contest section needs a coordinated design + mobile pass once
the mechanic and a Contest scoring model are settled; Contest backend is Sprint 4+.

### Step 3 — field accuracy

The entire Contest feature is **design-ahead-of-backend** — Section 4 defines no
contest endpoints, `schema.prisma` has no contest/entry/vote models, and
Contest/predictions is `figma-screen-builder`'s deferred remit. "Vote once per
contest", vote counts, entry lists, weekly/Level-1 standings — **all unbacked,
founder-blocked for wiring.** figma-to-code must not build any Contest surface
(including the new results frame and the Leaderboard Contest tab) until a Contest
data model + handoff mechanic is specced.

---

## CONTEST → LEADERBOARD MONTHLY MECHANIC — full confirmation

- **Weeks 1–3:** Leaderboard Contest tab = **PENDING** (`5524:7188`). ✔ built
- **Week 4:** the (dynamic-count) weekly winners enter the **Level 1 final**;
  Leaderboard Contest tab = **LIVE** (`5524:7512`), all competitors listed,
  live reordering, nothing crowned. ✔ built
- **End of week 4:** Leaderboard Contest tab = **CROWNED** (`5524:7836`),
  month's overall top 3. ✔ built
- **"View leaderboard" CTA** on the Contest results screen (`5528:7260`). ✔ built
- **"View this contest" link** from the Leaderboard Contest tab back to the
  Contest page — on all 3 states. ✔ built
- Dynamic finalist count, live-state ordering, and tie handling → **Decision Log #61**.

---

## Decision Log

Added to Build Plan Section 9 (this PR, via `python-docx`):

- **#61** — Leaderboard Contest tab: three-phase states; "no particular order"
  live state rendered as a ranked list + LIVE banner; dynamic finalist count;
  ties as shared text pills, no podium/iconography.
- **#62** — Guardian-consent link lifetime in UI copy tracks the code value
  (3 days / 72h) rather than a settled product number; "24-hour resend cooldown"
  copy removed (unimplemented).
- **#63** — Guardian-Details-Capture uses one "Guardian's full name" field
  (matches `Guardian.name` single column).
- **#64** — New "Approval Link Unusable (Guardian)" screen; asserts "account
  status unchanged" without naming a backend error contract.

`#45` remains reserved for the never-transcribed Leaderboard real-names entry.

---

## Founder-blocked items (not guessed — listed for when backend resumes / product decides)

1. **Guardian decline endpoint** + `Guardian.consentStatus = "declined"` value (Decision Log #34).
2. **GET-by-consent-token lookup endpoint** for GC4's Request Summary panel.
3. **`POST /auth/resend-verification`** endpoint + its screen/action (Email Verification).
4. **Verify-Email "minor verified, consent pending" variant** — route into app vs into Restricted Pending (product decision).
5. **Homepage: marketing page vs authenticated home feed** at `/` (product decision).
6. **Homepage data**: fixtures, news, per-player season record (Decision Log #6 + no stats model).
7. **Leaderboard/Contest points model, club axis, public visibility** (unchanged).
8. **Contest data model + monthly handoff mechanic** — entire Contest section is unbacked.

## Scoped follow-ups (design work, deliberately not bundled here)

1. **Guardian Consent mobile for screens 1 / 1a / 2** — auth-mobile pattern (`header 7 — mobile`).
2. **Mobile homepage** — dedicated pass (5298 px canonical page, only just settled DL #46).
3. **Mobile leaderboard** — dedicated pass.
4. **Contest user-facing section** — coordinated design + mobile + phase-indicator pass.
5. **`2072:5584` retrofit** to light tokens, then add the "View leaderboard" CTA there too.

---

## Verification

- Every new frame built with Soccernity Theme Light variables; no hardcoded hex
  in authored content. `brand/green-tint-28` rebound to `brand/green-tint` in the
  3 cloned Contest-tab frames.
- No frame overlaps among the new Leaderboard clones + design-notes frame
  (checked programmatically).
- Screenshots captured for all 3 Contest-tab states, the Contest results frame,
  all 4 Verify-Email mobiles, GC 4/5/6 mobile, GC 12 desktop+mobile, and GC 2.
- **No real browser / Playwright check** — not available in this environment,
  same ceiling as every prior Figma PR in this project.
- **No application code, DTOs, endpoints or backend touched.**
