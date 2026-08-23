# Sprint 1/2 — Verify Email (F7) and Club Picker Screens

Two brand-new screens designed in Figma file "Soccernity-MVP" (key
`weZWWqggy9j13eX8bhFgs6`), page "Soccernity" (`0:1`), by the
`figma-screen-builder` agent, branch `sprint-1/f7-club-picker-screens`.
This document is the git-side record of that Figma-only session — the
source of truth is the Figma frames themselves. No `apps/web` or other
repo code was touched; this is additive, design-only work.

Both screens had zero existing design anywhere in this file before this
session — confirmed by an exhaustive name search across the page
(Guardian/Consent/Verify/Reset Password/Auth/Club/Signup) before any
design work started, and both already have real, shipped, tested backend
endpoints (and, for the club picker, a real shipped React implementation
with no Figma design behind it — see §2). Designed from those exact
contracts; no invented fields or states.

Verified independently before treating this as complete: the
"Soccernity Theme" variable collection (`VariableCollectionId:5096:2`,
10 variables, Light/Dark modes) was confirmed live via a direct
`figma.variables.getLocalVariableCollectionsAsync()` query before any
design work began (not assumed from CLAUDE.md's own record of Sprint D).
Four frames were screenshotted and visually reviewed after the fact —
Verify Email states 1 and 2, Club Picker states 1 and 2 — all render
correctly, dark-mode-native, using only existing brand tokens plus one
new spinner primitive (see §3).

## 1. Patterns reused

Extracted from the existing Guardian Consent frames (`5108:*`) rather
than the legacy, unbranded template frames still on this page (e.g.
`407:844` "Login", `409:1463` "Reset Password" — confirmed these still
carry leftover template variables unrelated to Soccernity's brand and
are not part of the real design system). Reused directly: the 1440×90
top bar and logo lockup, the 88×88 green-circle success icon and
green-tick list row (cloned from Activation Confirmation, `5108:6631`),
the 316×64 primary/secondary button pair, and the full existing type
ramp. The file's own numbered-top-level-frame convention (e.g.
"Guardian Consent — N `<State Name>`") was matched exactly, including a
trailing "Design Notes & Open Decisions" frame per screen.

## 2. The two screens

### Screen 1 — Verify Email (F7)

Backend contract: `POST /auth/verify-email`, `{ token }` →
`{ verified: true, userId }` on success, a deliberately generic 400 on
failure (matches this codebase's non-enumeration posture elsewhere).
Token arrives via `?token=` on the emailed link, same shape as
`GuardianConsentConfirmPage`/`ResetPasswordPage`.

| # | Frame name | Node ID | What's new |
|---|---|---|---|
| 1 | Verify Email — 1 Verifying | `5143:6635` | A spinner primitive — genuinely new, no loading state existed anywhere in this system before this |
| 2 | Verify Email — 2 Verified | `5143:6648` | Success pattern reused from Activation Confirmation; CTA routes into the app per the contract's returned `userId` |
| 3 | Verify Email — 3 Link Invalid Or Expired | `5143:6661` | Generic non-enumerating message; recovery action is honest about there being no resend-verification endpoint (see §3) |
| 4 | Verify Email — 4 Missing Token | `5143:6674` | Distinct from state 3, matching `GuardianConsentConfirmPage`'s existing missing-token precedent |
| — | Verify Email — Design Notes & Open Decisions | `5150:6633` | Carries the same flagged items listed in §3 |

Section banner `5143:6633` / title `5143:6634`.

### Screen 2 — Club Picker

Backend contract: `GET /clubs?cursor&limit` → `{ items: ClubSummary[],
nextCursor }`; `POST`/`DELETE /clubs/:id/join`. This is a genuine
retrofit — `apps/web/src/pages/signup/ClubPickerStep.tsx` is real,
shipped, and tested, and was built with no Figma design to follow (its
own header comment says so directly), matching `SignupSplitScreen`'s
plain light theme instead. This session gives it its first real design,
in the dark Soccernity Theme system, while keeping every functional
element faithful to the shipped component — read directly before
designing, not assumed.

| # | Frame name | Node ID | What's new |
|---|---|---|---|
| 1 | Club Picker — 1 Loaded List | `5146:6635` | `ClubSummary` cards (logo/placeholder, name, league • country, member count), client-filter search input, "Load more" |
| 2 | Club Picker — 2 Club Joined | `5146:6648` | Terminal disabled "Joined" state — no leave affordance, matching the shipped code exactly (see §3) |
| 3 | Club Picker — 3 Join Failed (Inline Error) | `5146:6661` | Per-card inline error, doesn't block the rest of the list |
| 4 | Club Picker — 4 No Clubs Match Filter | `5146:6674` | Single shared empty-state string (see §3 — a known shipped-code ambiguity, not newly invented) |
| 5 | Club Picker — 5 Load More Loading | `5146:6687` | Disabled "Loading…" pagination state |
| — | Club Picker — Design Notes & Open Decisions | `5150:6656` | Carries the same flagged items listed in §3 |

Section banner `5146:6633` / title `5146:6634`. Footer is one button
with two label states ("Skip for now" / "Continue to Soccernity"),
matching the shipped component's single dynamic-label handler — not two
separate buttons.

## 3. Flagged — decisions that required interpretation, not resolved here

1. **No resend-verification-email endpoint exists.** Grepped
   `services/api/src` directly — the only resend endpoint is `POST
   /auth/guardian-consent/resend`, a different flow. Verify Email state 3
   therefore has no resend button; whether one should be specced is an
   open product/backend decision, not designed around here.
2. **No error/danger token exists in "Soccernity Theme."** Both screens
   need a non-success status treatment. Used `color/icon/inactive` for
   the neutral icon and `color/text/primary` for error copy rather than
   inventing a red — this is a token decision for `figma-design-system`,
   left open rather than resolved unilaterally (per CLAUDE.md
   non-negotiable #3, no new brand color without derivation/justification).
3. **Club picker's "Joined" state has no leave affordance, by design
   match, not omission.** `DELETE /clubs/:id/join` exists on the backend,
   but `ClubPickerStep.tsx` never calls it from this screen — confirmed by
   reading the component directly. Screen 2 designs a simple disabled
   completed state, not a toggle, so as not to design a capability the
   shipped code doesn't expose.
4. **Empty-state copy ambiguity is reproduced as-is, not fixed.** The
   shipped component shows the same "No clubs match that filter." string
   whether the API returns zero clubs total or the client-side filter
   matches nothing — a minor, pre-existing gap in the shipped copy, not a
   new message invented for this design.
5. **A verified minor with pending guardian consent isn't fully
   active** — `POST /auth/verify-email`'s response has no consent data.
   Verify Email state 2 discloses this honestly ("Under-18 accounts may
   still be waiting") rather than implying full access, but whether such
   a user should route to the existing restricted-pending screen instead
   of state 2 is a product decision, not made here.
6. **"Contact support" has no real destination** — no support route or
   address exists anywhere in the codebase today. Left as a flagged gap
   rather than a link wired to nothing concrete.
7. **New button size: 112×44** for the per-card Join/Joined/Joining
   action, derived from the existing 316×64 button's corner radius and
   label style — flagged as a new size within the existing button
   language, not a new component style.
8. **Existing Login/Register/Header screens are still not token-bound**
   (per Sprint D's own report, item 11) — unchanged by this session; the
   two new screen families are dark-mode-native and will look
   inconsistent next to those legacy frames until `figma-design-system`
   addresses them.

## 4. Verification

"Soccernity Theme" collection confirmed live before design work started
(§0). Four representative frames (Verify Email states 1–2, Club Picker
states 1–2) were screenshotted and visually reviewed: dark background,
brand-green/navy accents, Inter type, and the reused button/list-row/
success-icon patterns all render correctly. Every color in the new
frames resolves to a bound "Soccernity Theme" variable except the cloned
Soccernity logo mark/wordmark vectors, which carry the two raw brand hex
values as artwork — identical to every existing screen in this file, not
introduced by this session. No existing frame was modified.
