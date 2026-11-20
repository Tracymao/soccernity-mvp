# Sprint 2 — Light-Mode Token Retrofit: Auth Pages + Email Templates

**Branch:** `sprint-2/retrofit-light-mode-auth-email`
**Agent:** figma-design-system
**Date:** 2026-08-27
**Figma file:** `weZWWqggy9j13eX8bhFgs6` ("Soccernity-MVP"), page "Soccernity" (`0:1`)

Companion to PR #98 (`docs/sprint-2-retrofit-light-mode-tokens-report.md`) and PR #99
(`docs/sprint-2-retrofit-light-mode-tokens-round2-report.md`). Same standard: every fill/stroke
bound to a `Soccernity Theme` (collection `5096:2`) variable in **Light** mode (`5096:0`), no
hardcoded hex/rgba, no dark-mode variants added (that is a separate unified pass).

Reference frames for the token combination: **"Home Page Desktop — Premium Light (Sprint 2,
Pass 2)"** (`5204:6728`, now the canonical homepage — see Decision Log #46) and **"Leaderboard
Page Desktop"** (`5171:6633`).

---

## 0. Token vocabulary used

| Token (variable) | Light value | Role in this retrofit |
|---|---|---|
| `brand/off-white` (`5182:6655`) | `#F4F5FB` | Page background on every frame |
| `color/background/surface` (`5096:7`) | `#FFFFFF` | Email body background; illustration white highlights; calendar surface |
| `color/text/primary` (`5096:8`) | `#282E65` | Headings, field labels, wordmark, links |
| `color/text/secondary` (`5096:9`) | `#282E65` @ 70% | Body/subtitle copy, input placeholder text, muted illustration linework |
| `color/text/on-navy` (`5182:6654`) | `#FFFFFF` | Text/icons on navy surfaces (buttons, selected calendar day) |
| `color/text/on-green` (`5096:10`) | `#282E65` | Reserved — not used here (all buttons resolved to navy, see §1) |
| `brand/navy` (`5096:4`) | `#282E65` | Primary button fills, right-panel illustration ground, goal/figure structure, navbar CTAs |
| `brand/green` (`5096:3`) | `#7BB929` | Accent — logo mark, illustration pitch/foliage |
| `brand/green-tint` (`5096:5`) | `#7BB929` @ 12% | Input field fills, checkbox, avatar placeholder, calendar hover rows, navbar search pill |
| `color/icon/inactive` (`5097:2`) | `#282E65` @ 15% | Illustration hairlines, faint placeholder rectangles |

### Decisions made (flagged, not silently taken)

1. **Primary buttons resolve to `brand/navy` with `color/text/on-navy` text**, not `brand/green`.
   The brand guide names navy as the anchor and green as an accent; the existing email CTAs were
   already navy; keeping one button treatment across both sections (auth + email) is the most
   consistent reading and gives the safest contrast (`#FFFFFF` on `#282E65` ≈ 12.6:1 AA).
   `color/text/on-green` is therefore unused in this pass.
2. **Illustration human-figure skin tones left unbound.** The `undraw` goalkeeper illustration
   on the desktop auth frames contains ~9 skin/hair hexes (`#F7BBC3`, `#B77983`, `#D39999`,
   `#B45181`, `#74585E`, `#565171`, …). Re-binding these to brand navy/green would break the
   figure. They are decorative raster-equivalent artwork, treated the same way PR #97 treated
   reused club-crest trademark art — left as deliberate unbound zones and documented here.
   Everything structural in the illustration (pitch, goal frame, net, foliage, ground, linework)
   **is** bound.
3. **Illustration off-brand accents remapped:** the template's indigo/purple
   (`#6C63FF`, `#4F46E5`) → `brand/green`; near-black linework (`#000000`, `#535461`,
   `#E0E0E0`) → `color/text/primary` / `color/text/secondary` / `color/icon/inactive`;
   template deep-indigo background ellipses (`#323476` / `#312F80` / `#323080` / `#2F336E` /
   `#2B3267`) → `brand/navy`.
4. **`brand/green-tint-28` is not used anywhere in this delivery** — see Decision Log #47. All
   washes use the documented 12% `brand/green-tint`.

---

## 1. Auth Pages — before → after

All ten frames were a **pre-brand indigo template** (Tailwind-ish `#4F46E5` buttons/links,
`#6C63FF` illustration accents, `#000000` headings, `#F3F4F6` inputs) with **zero variable
bindings** and **no navbar**. After: 100 % bound (excluding the documented skin tones),
brand navy/green/off-white, correct navbar variant.

### 1.1 Desktop frames

| Frame | ID | Nav variant added | Notes |
|---|---|---|---|
| Login desktop | `407:844` | `header 7` (logged-out) | Split-screen; in-form wordmark hidden (redundant with navbar) |
| Register desktop | `407:1051` | `header 7` (logged-out) | **+ Date of Birth field + open date-picker** — see §3 |
| Forgot Password desktop | `409:1264` | `header 7` (logged-out) | |
| Reset Password desktop | `409:1463` | `header 7` (logged-out) | |
| Create Profile desktop | `1498:2303` | `header 4` (logged-in) | **Ambiguous** — see §4 |

### 1.2 Mobile frames

| Frame | ID | Nav variant | Notes |
|---|---|---|---|
| Login mobile | `1625:2303` | — (none) | See §4 — no mobile navbar variant exists |
| Register mobile | `1625:2333` | — | **+ Date of Birth field + date-picker panel** — see §3 |
| Forgot Password mobile | `1625:2375` | — | |
| Reset Password mobile | `1625:2404` | — | |
| Create Profile mobile | `1629:2449` | — | Already had a DOB field; typos fixed |

### 1.3 Representative fill mapping (applied uniformly across all 10 frames)

| Element | Before (hardcoded) | After (bound variable) |
|---|---|---|
| Frame background | `#FFFFFF` | `brand/off-white` |
| Page heading ("Welcome Back", "Register", …) | `#000000` | `color/text/primary` |
| Sub-copy / helper text | `#4B5563` | `color/text/secondary` |
| Field label ("Email", "Password", …) | `#000000` | `color/text/primary` |
| Input field fill | `#F3F4F6` | `brand/green-tint` |
| Input placeholder text | `#000000` (100 % / 50 %) | `color/text/secondary` |
| "Stay signed in" checkbox | `#F3F4F6` | `brand/green-tint` |
| Primary button fill | `#4F46E5` | `brand/navy` |
| Primary button label | `#FFFFFF` | `color/text/on-navy` |
| Inline links ("Forgot Password?", "Create one here", …) | `#4F46E5` | `color/text/primary` |
| Wordmark ("Soccernity" text) | `#7BB929` / `#000000` | `color/text/primary` |
| Logo mark vectors | `#7BB929` / `#282E65` | `brand/green` / `brand/navy` |
| Right-panel illustration ground | `#2B3267` / `#2F336E` + indigo ellipses | `brand/navy` |
| Illustration pitch / foliage | `#7BB929` / `#6C63FF` | `brand/green` |
| Illustration linework | `#535461` / `#E0E0E0` / `#000000` | `color/text/secondary` / `color/icon/inactive` / `color/text/primary` |
| Faint spacer rectangles (`opacity 0`) | `#FFF5D1` | `brand/off-white` |

**Post-retrofit audit:** `0` unbound solid paints across all 10 frames except the documented
skin-tone set. Verified by walking every node's `fills`/`strokes` and checking
`boundVariables.color`.

### 1.4 Navbar instances

Five new instances of **"Web app Navbar - Desktop and Mobile"** (`2824:4309`) were added to the
desktop frames at `(0,0)`, with the split/content shifted down 90 px and the redundant in-form
logo hidden. All five instances audited: **0 unbound paints**, search pill on `brand/green-tint`
(12 %, **not** `-28`), CTA on `brand/navy`, confirming PR #99's component-level fix carries into
fresh instances.

Variant choice per screen:

| Screen | State | Variant | Confidence |
|---|---|---|---|
| Login / Register / Forgot / Reset (desktop) | Unauthenticated | `header 7` (logged-out, carries "Login" button) | High |
| Create Profile (desktop) | **Ambiguous** | `header 4` (logged-in, carries avatar) | **Low — see §4** |

---

## 2. Email Templates — before → after

Five existing templates + one new. All were on greys (`#42505C` headings, `#404040` body,
`#000000` divider strokes) with a single already-bound paint (the logo mark's green vector).
After: fully bound, rewritten copy.

| Frame | ID | Heading before → after | Notes |
|---|---|---|---|
| Success email - account created | `1380:2274` | "Account created" → "Welcome to Soccernity" | Reframed as post-verification welcome |
| Password change confirmation | `1380:2297` → renamed **"password change requested"** | "Are you really sure?" → "Was this you?" | Repurposed — see §5 |
| Success email - password changed | `1380:2318` | "Password Changed" → "Your password was changed" | Plain confirmation, no CTA |
| Success email - admin account created | `1661:2724` | "Welcome to the Team" → "You're now a Soccernity admin" | |
| Success email - account created - other roles not admin | `1661:2741` | "Welcome to the Team" → "You're now a Soccernity moderator" | |
| **Success email - password reset link** | **`5372:7272` (NEW)** | — → "Reset your password" | New frame, cloned from `1380:2297`; matches backend `password-reset-email.service.ts` |

### 2.1 Email fill mapping (uniform)

| Element | Before | After |
|---|---|---|
| Body background | `#FFFFFF` | `color/background/surface` |
| Heading (Roboto Bold 40) | `#42505C` | `color/text/primary` |
| Body copy (Roboto Regular 14) | `#404040` / unset | `color/text/secondary` |
| Footer helper + legal (Roboto Regular 12) | `#404040` | `color/text/secondary` |
| Divider lines | `#000000` stroke | `color/icon/inactive` |
| CTA button fill | `#282E65` | `brand/navy` |
| CTA button label | `#FFFFFF` | `color/text/on-navy` |
| Logo "Soccernity" wordmark | `#7BB929` | `color/text/primary` (navy — per brand guide "navy anchors the wordmark") |
| Logo mark vectors | `#7BB929` / `#282E65` | `brand/green` / `brand/navy` |

**Post-retrofit audit:** `0` unbound solid paints across all 6 email frames.

### 2.2 New "Reset your password" email (`5372:7272`)

Placed in the Email Template section at `x 59741, y -564` (right of the last existing template).
Copy written to match the real backend send
(`services/api/src/modules/auth/password-reset/email/password-reset-email.service.ts`):

> **Subject:** Reset your Soccernity password
> **Heading:** Reset your password
> **Body:** Hi [First name], — We received a request to reset the password for your Soccernity
> account. Choose a new password using the button below. — This link expires in 60 minutes. If
> you didn't request a reset, you can safely ignore this email — your password won't change. —
> Thanks, The Soccernity Team
> **CTA:** Reset your password → `{WEB_APP_BASE_URL}/reset-password?token=…`

"60 minutes" matches `DEFAULT_RESET_TOKEN_TTL_MINUTES = 60`
(`password-reset/reset-token.constants.ts`).

### 2.3 Rewritten copy — all 6 templates

Consistent structure: clear heading · concise body · one CTA where relevant · sign-off
**"The Soccernity Team"** · footer helper ("Trouble viewing this email? View it in your
browser.") + one legal line.

| Template | New CTA | New sign-off |
|---|---|---|
| Account created | "Sign in to Soccernity" | "See you on the pitch, / The Soccernity Team" |
| Password change requested | "Reset your password" | "Thanks, / The Soccernity Team" |
| Password changed | *(none)* | "Thanks, / The Soccernity Team" |
| Admin account created | *(inline dashboard link)* | "Welcome to the team, / The Soccernity Team" |
| Moderator account created | *(inline dashboard link)* | "Welcome to the team, / The Soccernity Team" |
| Password reset link (new) | "Reset your password" | "Thanks, / The Soccernity Team" |

---

## 3. Date-of-birth field + date picker

Per brief, the existing-but-unused date picker **"Group 847"** (`5230:25115`, self-labelled
"Date picker for date of birth field") was retrofitted and integrated into both Register frames
rather than building a new one.

### 3.1 Group 847 retrofit

86 paints re-bound. Mapping: calendar surface `#FFFFFF` → `color/background/surface`; day numbers
`#000000` / `#19181A` / `#333333` → `color/text/primary`; muted dates `#3C3C43` @ 60 % / `#808080`
→ `color/text/secondary`; selected-day highlight `#323080` → `brand/navy`; text on selected day
`#FFFFFF` / `#F8F7FA` → `color/text/on-navy`; hover/active list rows `#F8F7FA` → `brand/green-tint`;
month-nav chevrons `#282E65` stroke → `brand/navy`. The instructional label text was retrofitted
to `color/text/secondary`.

### 3.2 Register **desktop** (`407:1051`)

- New "Date of Birth" `Form Group` (`5376:6186`) cloned from the Email field group, inserted
  between Password and the agreement text; placeholder "DD / MM / YYYY".
- The retrofitted **Calendar panel** (clone of `1557:2316`, node `5378:6186`) is placed directly
  below the field as an **open-state popover**. The 3-panel mega-widget was reduced to the
  calendar panel only so it fits the 720 px left column without clipping.
- Agreement text + Register button shifted below the open picker; `Form` / `Left Side` / frame
  heights extended (`1490` frame height).
- **Confirmed in place** — see §6 screenshots.

### 3.3 Register **mobile** (`1625:2333`)

- New "Date of Birth" `Form Group` (`5379:6186`) cloned from the mobile Email group;
  placeholder "DD / MM / YYYY".
- Calendar panel clone (`5379:6190`) rescaled to 350 px wide and placed below the field.
  Agreement / button / sign-in link shifted down 91 px; frame extended to `1080` px.
- **Confirmed in place** — see §6 screenshots.
- **Flagged:** the picker is desktop-proportioned; a production mobile DOB control would more
  likely be a native/bottom-sheet picker. `2824:4309` has no mobile variant and Group 847 has
  no mobile variant, so the rescaled panel is the best available reuse. Noted for a future
  mobile-picker component.

---

## 4. Navbar variant — ambiguous / blocked cases

| Case | Call made | Why it's flagged |
|---|---|---|
| **Create Profile desktop** (`1498:2303`) | `header 4` (logged-in) | After registration + email verification the user *has* a session (register returns tokens), so "logged-in" is defensible — but a user mid-onboarding, before their profile exists, seeing the full logged-in nav with an avatar is arguably wrong. Could equally be `header 7` or a stripped onboarding bar. **Founder call needed.** |
| **All 5 mobile auth frames** | **No navbar added** | The "Web app Navbar - Desktop and Mobile" component set (`2824:4309`) contains only two **1440 px desktop** variants (`header 4`, `header 7`). There is no mobile/375–390 px variant. Forcing a 1440 px bar into a 390 px frame would be broken. **A mobile navbar variant needs to be designed** (own follow-up) before the mobile auth frames can carry one. |
| **Should auth pages carry the app navbar at all?** | Added to desktop per brief | Login/register/reset pages conventionally omit the app chrome. The brief explicitly asked for it, so it was added to the desktop frames (and the in-form wordmark hidden to avoid a double logo), but this is worth a design review — a slimmer "logo + Login" auth header may read better than the full nav-icon row that `header 7` carries. |

---

## 5. Copy accuracy — flags against real product behaviour

Backend reality checked against `services/api/src/modules/auth/`:

1. **Only the new "Reset your password" email corresponds to a real backend send.** The backend
   sends exactly three transactional emails today: `verify-email` ("Verify your Soccernity
   email", carries a **code**), `guardian-consent`, and `password-reset` (the new frame).
   **The five pre-existing templates — account-created welcome, both password-change emails,
   and both admin/moderator emails — are not wired to any backend send.** They are legitimate
   future designs; flagged so nobody assumes they fire today.

2. **`1380:2297` "Password change confirmation" described a flow that does not exist.** Its
   original body ("follow the instructions below to reset your password", "click the button
   below", CTA "Change password") described an email-link-mediated password change. The real
   `POST /auth/change-password` (authenticated) changes the password immediately and revokes all
   other sessions — there is no email-link step. It also overlapped almost entirely with
   `1380:2318` "Password changed". **Resolution in this PR:** renamed to *"password change
   requested"* and rewritten as a security *notification* ("your password was just changed …
   if this wasn't you, reset it now") with a recovery CTA, so it is distinct from `1380:2318`'s
   plain confirmation. **Still flagged:** the two remain close in purpose — a product call on
   whether to keep both, or retire `1380:2297`, is open.

3. **"Account created" welcome email implied immediate access.** Original: "Thank you for signing
   up … we're excited to have you on board" + "Login now", with no mention that email
   verification is required first. Rewritten to open with "Your email is verified and your
   account is ready" — i.e. explicitly a **post-verification** welcome. If product wants this to
   send *before* verification, the copy needs to change again.

4. **Spelling / grammar fixed in every template:** "recive" → "receive" (removed — replaced with
   a cleaner legal line), "this emails" → grammatical, inconsistent sign-offs
   ("Best regards" / "Best Regards" / "Sincerely") → uniform "The Soccernity Team".

5. **Auth-screen copy fixes:** "eMail" → "email"; "Udah punya akun? Login!" (Indonesian
   placeholder) → "Already have an account? Log in"; "Enter your Locarion" → "Enter your
   location"; "DD/MM/YY" / "DD/MM/YYY" → "DD / MM / YYYY"; "Verify!" (forgot-password submit) →
   "Send reset link"; "Return to Login!" → "Back to log in"; "Reset Password" → "Reset your
   password"; "Complete Registration" → "Complete your profile"; button label case normalised.

---

## 6. Verification

- **Binding audit:** every touched frame walked node-by-node post-change; `0` unbound solid
  paints outside the documented skin-tone set (auth) and `0` unbound (email + Group 847 +
  navbar instances).
- **Screenshots** captured for Login desktop, Register desktop (with open picker), Forgot
  desktop, Reset desktop, Create Profile desktop, Login mobile, Register mobile, Create Profile
  mobile, and all 6 email frames.
- **No real browser / Playwright check** — not available in this environment, same ceiling as
  every prior Figma PR in this project. Figma canvas render + variable read-back is the
  verification ceiling here.
- **No code touched.** `services/api`, `apps/*`, `packages/*` unchanged. This is a Figma-only
  PR plus the two Decision Log entries and the CLAUDE.md / Build Plan updates.

---

## 7. `brand/green-tint-28` — resolved as a decision, deferred as a cleanup

Decision Log **#47** (added in this PR): the founder confirms `brand/green-tint-28` is **not** a
real design-system token; the only wash token is `brand/green-tint` (12 %).

- This delivery (auth + email + Group 847 + 5 navbar instances) uses **only** `brand/green-tint`
  and introduced **zero** new `-28` usages — confirmed by audit.
- A file-wide scan found **~133 pre-existing** `brand/green-tint-28` bound paints across the
  **Navbar component, Guardian Consent, Leaderboard, Club pages, Settings toggles, and the
  Premium Light homepage** (plus the "dump" page). Rebinding all of them and deleting the
  variable spans six screen families **outside this PR's auth + email scope** and carries real
  visual-regression risk on those screens.
- **Follow-up needed (named, not silent):** a dedicated `figma-design-system` cleanup PR to
  rebind the remaining ~133 `brand/green-tint-28` paints to `brand/green-tint` and retire the
  `brand/green-tint-28` variable (`VariableID:5098:7071`). Not done here.

---

## 8. Open items / follow-ups

1. **Mobile navbar variant** for `2824:4309` — needed before mobile auth frames can carry a nav.
2. **Create Profile desktop navbar** — `header 4` vs `header 7` vs onboarding bar: founder call.
3. **Should auth pages carry the full app navbar** — design review.
4. **`1380:2297` vs `1380:2318`** — keep both password emails or retire one.
5. **The five unwired email templates** — product decision on whether/when the account-created,
   password-change, and admin/moderator emails get a real backend send.
6. **File-wide `brand/green-tint-28` retirement** — §7.
7. **Required-field asterisks** on Create Profile are a small off-palette red (`*`) — left as a
   conventional required-marker; flag if the palette should absorb an error/required token.
8. **Mobile DOB picker** — a real mobile date control (bottom sheet / native) rather than the
   rescaled desktop panel.
9. Dark-mode pass — deliberately out of scope; all bindings are mode-ready for a single switch.
