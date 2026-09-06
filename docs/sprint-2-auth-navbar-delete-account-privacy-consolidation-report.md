# sprint-2/auth-navbar-delete-account-privacy-consolidation

**Agent:** figma-design-system
**Date:** 2026-09-06
**Scope:** Figma design only — no application code, no `figma-to-code` conversion (explicitly blocked until this merges, per founder instruction).
**Decision Log:** #222 added to Build Plan Section 9; forward-pointers appended to #214 and #215.

Four founder-directed changes across the Auth Pages and Settings sections, plus a
file-wide footer sweep.

---

## Part 1 — Create Profile navbar fix

`Create Profile desktop` (`1498:2303`) and `Create Profile mobile` (`1629:2449`)
were the last two Auth Pages screens still carrying the full logged-in web nav
(`Web app Navbar — logged in (header 4)` / `header 4 — mobile`) — the wrong chrome
for a pre-session onboarding screen, and out of step with every other Auth Pages
frame after PR #174 (Decision Log #214). This was the ambiguity #214 flagged as
still open for Create Profile specifically.

**Done:**
- **Desktop:** the `header 4` instance (`5379:6551`) was removed and replaced with a
  clone of Login desktop's `Top Bar — Soccernity` (`6172:14977`, 1440×90). Content
  (`Flex` at y=90) is unchanged — old navbar and new Top Bar are both 90px.
- **Mobile:** the `header 4 — mobile` instance (`5387:7725`, 390×64) was removed and
  replaced with a clone of Login mobile's `Top Bar — Soccernity` (`6172:15043`,
  390×**90** — the auth-page mobile Top Bar height established by PR #174, not the
  64px Settings-page one). All 12 content children were shifted **+26px** (90−64) to
  preserve the original 40px navbar-to-heading gap; the frame grew 1398→1424.

Both new Top Bar clones are named `Top Bar — Soccernity`, matching the Login
reference and the rest of the section. Screenshot-verified — content sits cleanly
below the bar on both breakpoints.

---

## Part 2 — Direct "Delete Account" flow (new, parallel to Deactivate)

The backend has a working, tested `deleteAccount()` endpoint
(`services/api/src/modules/auth`) with nothing in Figma pointing at it. Settings
Overview's Account section only had a "Deactivate Account" row.

### 2.1 — New "Delete Account" row

Added to the Account section of both:
- **Settings — Overview** desktop (`2905:4798`) — cloned from the "Deactivate
  Account" row (`2910:7298`), inserted directly below it in the auto-layout
  container (`Frame 5918`, `2910:7303`). Title "Delete Account", supporting line
  "Permanently delete your account and data", `close-circle` icon (same as
  Deactivate — no destructive/trash icon was invented). Reaction → new confirm
  screen `6225:14789`.
- **Settings — Overview — Mobile** (`5607:7813`) — cloned from the mobile
  "Deactivate Account Row" (`5608:7845`), same copy. Reaction → `6225:15024`.
  *(The mobile Deactivate row itself has no reaction — a pre-existing gap left
  untouched; the new Delete row is wired.)*

### 2.2 — New standalone "Settings — Delete Account (Confirm)" screen

- **Desktop `6225:14789`** and **Mobile `6225:15024`** — cloned from `Settings —
  Deactivate Account (Confirm)` (`6213:15640` / `6213:15617`) for the Settings
  chrome (profile sidebar + settings nav on desktop; Top Bar + "Back to Settings"
  on mobile), then restructured to the **Inactive Account "Delete (Confirm)"**
  content pattern:
  - Heading "Delete your account?"
  - Body — the exact 30-day-grace copy from `6215:14657`: *"Deleting starts a
    30-day grace period. Sign back in within 30 days to cancel and keep your
    account. After 30 days, your account and everything in it are permanently
    deleted and can't be recovered."*
  - Password re-entry field
  - Cancel / **Delete account** buttons (the "What happens" card from the
    deactivate-confirm template was removed — the Inactive Account delete pattern
    has no separate card, the explanation lives in the body).
  - Cancel → Settings — Overview (`2905:4798` / `5607:7813`, inherited from the
    clone). Delete account → no reaction (no success screen exists; matches the
    Inactive Account delete-confirm treatment).
- **Genuinely distinct frames**, not a variant of `Settings — Deactivate Account
  (Intro)`. Cloning the deactivate *Confirm* (not Intro) gave the closest
  structural match while producing a separate, independently-named frame.
- Reached **directly** from Part 2.1's rows and Part 3's Account-status link —
  **not** gated behind deactivating first. The two flows are independent parallel
  paths.

---

## Part 3 — Consolidate "Privacy" and "Privacy & Safety" into one "Privacy" page

`Settings — Privacy` (`6178:14437` / `6185:14547`, PR #175) and `Settings —
Privacy & Safety` (`2922:5382` / `5649:8092`) were two separate real pages with
non-overlapping content. **Founder decision: merge into one, named "Privacy",
keeping the newer page's frame identity.**

**Done:**
- **Merged in the two `Privacy & Safety` rows** as additional rows on the Privacy
  page, inserted after "Public profile":
  - **Your Post** → `Settings — Your Posts (Sensitive Media)` (`2926:8996`
    desktop / `5696:8261` mobile)
  - **Direct Message** → `Settings — Direct Messages & Read Receipts` (`2926:8764`
    desktop / `5696:8241` mobile)

    Built by cloning the Privacy page's own "Download My Data Row" (icon + text +
    chevron pattern) and repointing the chevron navigation — the two destination
    sub-pages were **not** rebuilt.
- **"Account status" row** now shows a status line ("Active") plus **two inline
  links** (matching the "Change guardian email ›" link precedent already on the
  page): **"Deactivate account ›"** → Deactivate Intro (`2924:7358` / `5695:8262`)
  and **"Delete account ›"** → the new Delete Confirm (`6225:14789` / `6225:15024`).
  The single row-level chevron + reaction were removed. Both deactivate and delete
  are now reachable from here.
- **Archived** `Settings — Privacy & Safety` (desktop + mobile) — `ARCHIVED —`
  prefix, hidden, not deleted (project convention).
- **Reference-check + repoint:** 22 nodes referenced the old desktop P&S frame
  (`2922:5382`) — every "Privacy and safety" left-nav item across the Settings
  family, plus the two destination sub-pages' `arrow-back` buttons. **21 repointed
  to `6178:14437`** (the consolidated desktop Privacy page); **1 removed** (the
  Privacy page's own nav item — a self-navigation, now a no-op). The mobile P&S
  frame (`5649:8092`) had **zero** inbound references (mobile Settings nav rows are
  unwired — pre-existing). Final scan: **zero live references to either P&S frame.**
- The `Privacy Settings — Design Notes` annotation frame (`6191:15563`, PR #175)
  had its "OPEN — P&S relationship UNRESOLVED" and "Account status → Deactivate
  Intro" notes rewritten to record the resolution.

---

## Part 4 — Remove the "Privacy Settings" footer link entirely

Founder decision: **remove, don't relink.** PR #208 had only wired the other three
legal links; "Privacy Settings" was never wired to anything.

**Done:** file-wide sweep of every `Legal Links` frame in a canonical footer —
**48 frames** (24 desktop no-wrap, 24 mobile wrapping; up from the 46 this task's
brief estimated — 2 more Blog/Article footers converted since PR #210). In each,
the `Link — Privacy Settings` child (its bullet dot + text together) was removed.
Desktop Legal Links auto-shrank 668→473px and were re-centered on the footer;
mobile stay at their FIXED 350px width and reflow.

**Result everywhere:** `Terms of Service · Privacy Policy · Contact Us` (3 items).
Verified: 0 of 48 Legal Links frames retain a `Privacy Settings` child; all 48 have
exactly 3 children; 0 `Privacy Settings` text nodes remain inside any `Legal Links`
frame. Screenshot-verified on the canonical Home Page desktop + mobile footers.

**Deliberately left (out of scope, flagged):**
- ~15 legacy `Group 358` footers on never-retrofitted screens (Bants homepages,
  Community feed screens, Search, Edit Profile) still carry a plain (unwired)
  "Privacy Settings" text link. These screens have never had the canonical footer
  applied — removing one link from an otherwise-untouched legacy footer would be
  inconsistent partial work. Belongs with the broader legacy-footer-retrofit
  backlog.
- 10 `Privacy Settings` text nodes inside already-archived frames (old Blog /
  Articles / Legal page originals) — left per the archived-content precedent.

---

## Verification

- **Screenshots:** Create Profile desktop + mobile (Top Bar, spacing); Settings
  Overview Account section desktop + mobile (new Delete row); Delete Account
  (Confirm) desktop + mobile; consolidated Privacy desktop + mobile (all 7 rows +
  dual Account-status links); canonical footer desktop + mobile (3-item Legal
  Links). All clean.
- **Reactions:** all 10 new rows/links point at existing destination frames
  (programmatically confirmed).
- **Token discipline:** no new colour, no `brand/green-tint-28`, Light mode only.
  All new nodes were clones of existing bound elements, so bindings are inherited.
- **Paint audit:** no new unbound paints introduced (clone-only for every new
  element; text edits only change `characters`).

---

## Flagged follow-ups (not done here)

1. **Nav-label mismatch:** the left-nav item still reads **"Privacy and safety"**
   while the page it opens is now named **"Privacy"**. The nav items are shared
   component instances (`Frame 5905`–`5909`, ~40 instances across the Settings
   family) — a label change is its own focused component pass, not bundled here.
2. **Mobile Settings nav → Privacy is unwired.** The mobile "Nav — Privacy and
   safety" rows (`5607:7830` etc.) have no reactions — pre-existing, not
   introduced here. A future pass should wire them to `6185:14547`.
3. **Legacy `Group 358` footers** (Part 4 above) — ~15 screens still show a
   "Privacy Settings" footer text link; folds into the legacy-footer-retrofit
   backlog.
4. **`figma-to-code` for PR H2** (Privacy Settings → code, queued) must build
   against the **consolidated** Privacy page (`6178:14437` / `6185:14547`) — which
   now includes the Your Post / Direct Message rows and the dual Account-status
   links — **not** the narrower PR #175 scope, and must not expect a separate
   `Settings — Privacy & Safety` screen (archived).
