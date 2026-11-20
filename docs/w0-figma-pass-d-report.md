# W0 Figma pass D — report

Branch `figma/w0-pass-d-user-screens`, 2026-10-15. Agent scope: `figma-screen-builder` (NEW user-facing screens only; no retouch of existing frames). Figma file "Soccernity-MVP" (`weZWWqggy9j13eX8bhFgs6`), page `0:1`. Figma only: no application code, schema, legal copy, DPIA or Decision Log row changed.

Source rows: `docs/build-register.md` B-013, B-015, B-007, B-006. Decisions applied: #367, #371, #372, #378, #379 (item 16), #389, #393. Code read for B-013: `services/api/src/modules/auth/guardian-consent/guardian-consent.controller.ts`, `dto/request-consent-withdrawal.dto.ts`, `dto/withdraw-guardian-consent.dto.ts`, `guardian-consent.service.ts` (`requestWithdrawal`, `withdrawConsent`), `registration-email.service.ts` (withdrawal email).

## 1. Audit numbers

| Check | Result |
|---|---|
| Whole-canvas metadata (page `0:1`, depth full) before / after | 38,845 / 39,887 node ids. **0 nodes missing**, 1,042 new. Both pulls saved to the scratchpad and diffed by id. |
| New top-level nodes | 30 (24 frames + 6 note texts). Nothing else on the canvas changed: no existing node was edited, moved, hidden or renamed. |
| Deleted | **Nothing deleted from the baseline canvas.** One disclosure: my first attempt at the six mobile withdrawal frames used the wrong top-bar node (726px tall); those six frames were created in this session, were not part of any baseline, and were removed and rebuilt (ids `6654:172`…`6654:411` are gone; the final ids are in §2). |
| Unbound fills / strokes on authored nodes | **0** across 418 authored solid paints (all withdrawal frames incl. cloned top bar, the setup/on content of all ten 2FA frames, the dialog + scrim + chip of both block frames, the six notes). The first audit found 62 default white fills on auto-layout containers; they were cleared to no fill and the audit re-run to 0. Cloned shells (Settings Shell, profile pages) keep their existing, already-disclosed debt (e.g. navbar avatar image fill) and were not touched. |
| Overlaps (new frames and notes vs every other visible top-level node, fresh pull) | **0**. |
| Variables | Light mode only. Tokens used: `brand/green`, `brand/navy`, `brand/green-tint`, `color/background/page`, `color/background/surface`, `color/text/primary`, `color/text/secondary`, `color/text/on-green`, `color/text/on-navy`, `color/icon/inactive`, `color/overlay/scrim`, `semantic/alert` (non-text bar only, wrong-code callout). No new colour, no hex, no `brand/green-tint-28`, no black. |
| Mobile width | 390 on every mobile frame. |
| Placement note | Frames were first created on the cover page by mistake (page context resets each call), then moved to `0:1` with positions preserved; the overlap check above is against the real `0:1` canvas. |

## 2. Per B-ID — node IDs (all new; nothing existed before)

### B-013 — Guardian-facing consent withdrawal page (new)

Designed exactly from the two endpoints: step 1 `POST /auth/guardian-consent/withdraw/request` takes the **minor's registered email** and returns a deliberately generic message; step 2 `POST /auth/guardian-consent/withdraw` takes a single-use `withdrawalToken` and returns `Invalid or expired withdrawal token` (400, generic) or a rate-limit 429. Neither response carries the minor's name, so no name appears on any frame. Look reused from the guardian web-consent frames (`Top Bar — Soccernity` clone, 760-style centred column, green primary / navy-outline buttons, 65px inputs, neutral recorded-decision icon from `5533:7277`).

| # | State | Desktop 1440×844 (909 for #3) at y 3450 | Mobile 390 at y 4750 |
|---|---|---|---|
| 1 | Request (minor's email) | `6654:2` | `6654:26727` |
| 2 | Request sent (generic reply) | `6654:30` | `6654:26755` |
| 3 | Confirm (withdrawal code) | `6654:57` | `6654:26782` |
| 4 | Success | `6654:91` | `6654:26816` |
| 5 | Link invalid or expired | `6654:118` | `6654:26843` |
| 6 | Too many attempts (429) | `6654:146` | `6654:26871` |

Desktop x = 17504 + 1620·(n−1); mobile x = 17504 + 500·(n−1). Band is directly below the existing Guardian Consent section. Notes: `6655:29789` (desktop), `6655:29790` (mobile).

### B-015 — Two-factor setup with an authenticator app (continues `2926:8294` / `5696:8213`)

Each frame is a clone of the retouched Two-Factor frame (so the Settings Shell, back arrow and title are inherited); the old row group is hidden, not deleted, and the new content is appended.

| # | State | Desktop 1440×2517 at y 3700 | Mobile 390 at y 6800 |
|---|---|---|---|
| 1 | Scan the QR code (QR is a labelled placeholder) | `6655:2` | `6655:27159` |
| 2 | Enter the 6-digit code | `6655:41` | `6655:27196` |
| 3 | Wrong code (alert-bar callout, code boxes filled) | `6655:85` | `6655:27238` |
| 4 | Success | `6655:137` | `6655:27288` |
| 5 | "2FA is on" (existing row, `Settings Toggle` swapped to State=On, plus info panel) | `6655:173` | `6655:27322` |

Desktop x = −17100 + 1620·(n−1); mobile x = −17100 + 500·(n−1). Notes: `6655:29791` (desktop), `6655:29792` (mobile). No backup-code or recovery flow was drawn (see §4).

### B-007 — Block confirmation dialog on the other-user profile

| Frame | Id | Base |
|---|---|---|
| Profile — Block Confirmation Dialog — Desktop (1440×900, clip) | `6655:27355` at (−45403, −5300) | clone of `1455:4362` behind a `color/overlay/scrim` rectangle; dialog is a clone of the existing Confirm Dialog `5404:7370` (elevation/overlay style, 460px) |
| Profile — Block Confirmation Dialog — Mobile (390×844, clip) | `6655:29600` at (−43763, −5300) | clone of `5702:8250`; same dialog at 350px |

The title uses the username already shown in the existing menu row ("Block nelson_iheagwam"). Block is navy, not red (existing destructive-button convention). Notes: `6655:29793` (desktop), `6655:29794` (mobile). No owner-variant profile was built.

### B-006 — Create Profile for a restricted-pending minor: nothing built

**OPEN in Decision Log #367.** PROPOSAL, founder to confirm: no new screen is needed, because a restricted-pending minor is routed to the existing Restricted Pending page on every login (Guardian Consent frames 5 and 5-mobile, `5108:6630` / `5531:7461`), so Create Profile is never reachable in that state. If the founder instead wants Create Profile reachable-but-blocked, a design is needed and the options (blocked banner on the Create Profile frames, or a dedicated state) must be decided first. No frame was created and no existing frame was touched.

## 3. "[COPY PENDING LEGAL REVIEW]" tags

Every frame below carries a visible chip "[COPY PENDING LEGAL REVIEW]" at the top of its content column (frame level, because all wording on these frames is new). The two dialogs carry it inside the dialog. Complete wording list:

**B-013 (same text desktop and mobile).**
1. Request: "Withdraw your consent" · "Enter the email address of the Soccernity account you gave consent for. We will send a withdrawal link to the guardian email on that account." · "Email address of the Soccernity account" · placeholder "account email address" · "This is the email the account was registered with, not your own." · button "Send withdrawal link".
2. Request sent: "Check the guardian’s inbox" · "If that account has confirmed guardian consent, a withdrawal link has been sent to the guardian. The link can be used once." (first sentence is the API's own message) · "Nothing has changed yet. Consent is only withdrawn when the guardian confirms from the link." · "Enter a withdrawal code" · "Done".
3. Confirm: "Confirm withdrawing consent" · "Withdrawing consent closes the account straight away. This cannot be undone from this page." · "Withdrawal code" · "paste your withdrawal code" · "From the email we sent to the guardian. It can only be used once." · "What happens next" · "The account is closed and the person can no longer sign in." · "The details they entered are deleted after 30 days." (the 30-day figure is the one already on the web-consent frame) · "Withdraw consent" · "Cancel".
4. Success: "Consent withdrawn" · "Your withdrawal has been recorded and the account has been closed." · "What happens next" · "The details they entered are deleted after 30 days." · "We have emailed the account holder to tell them." (the backend sends `guardian-consent-withdrawn` to the minor) · "Done".
5. Link invalid or expired: "This withdrawal link can’t be used" · "The link may already have been used, or it may have expired. Nothing has been changed." · "You can ask for a new withdrawal link at any time." · "Request a new link" · "Done".
6. Too many attempts: "Too many attempts" · "You have tried too many times in a short while. Please wait a little and try again." (no figure on purpose, the throttle window is configuration) · "Nothing has been changed." · "Try again".

**B-015 (same text desktop and mobile).** "Step 1 of 2" · "Scan the QR code" · "Open your authenticator app and scan this code to add Soccernity." · "QR code appears here" · "Continue" · "Cancel" · "Step 2 of 2" · "Enter the 6-digit code" · "Enter the code shown in your authenticator app for Soccernity." · "Turn on two-factor authentication" · "Back" · "That code didn’t work. Check your authenticator app and try again." · "Two-factor authentication is on" · "You will be asked for a code from your authenticator app when you log in." · "Done" · panel "Two-factor authentication is on. You will be asked for a code from your authenticator app when you log in." (the "Authenticator app" row and its description are the already-retouched pass B text.)

**B-007.** "Block nelson_iheagwam?" · dashed placeholder "[PLACEHOLDER — what blocking does is not decided (SCOPE OPEN)]" · buttons "Block" and "Cancel" (the latter inherited from the existing dialog). The body is intentionally a placeholder rather than invented consequence wording.

## 4. "SCOPE OPEN" notes (each is an on-canvas note, not a decision)

| Note | Open point |
|---|---|
| B-013 desktop/mobile `6655:29789`, `6655:29790` | (1) The withdrawal email carries a **code, not a link** (`registration-email.service.ts`: "Your withdrawal code is …"); frame 3 shows code entry, and whether the email gains a link that pre-fills the code is undecided. (2) Neither endpoint returns the minor's name, so no name is shown. (3) Frame 2 must read the same whether or not an account matched. (4) The wait time and where "Try again" returns to are undefined; no countdown is drawn. (5) Whether "Request a new link" returns to frame 1 is not decided. (6) All wording is new and tagged. |
| B-015 desktop/mobile `6655:29791`, `6655:29792` | (1) **Recovery (backup codes, lost device, admin help) is UNDECIDED and deliberately not drawn.** (2) Manual-key entry when a QR cannot be scanned is not decided. (3) How to turn 2FA off, and whether that needs password re-entry, is not decided. (4) The login-time code prompt is not drawn. (5) The QR is a placeholder. (6) Wording tagged. |
| B-007 desktop `6655:29793` | (1) What blocking does (hide posts, stop messages, remove follows) is not decided; the body is a placeholder. (2) No block model or endpoint exists in `schema.prisma`, so this is design only. (3) Reason field, undo, and a blocked-users list are undecided. (4) Wording tagged. |
| B-007 mobile `6655:29794` | The mobile profile frames show the **owner** variant (Edit Profile) and no viewer "…" menu, so the trigger for this dialog on mobile is not drawn; owner-vs-viewer remains undecided (pass B). |

## 5. Decision Log candidates (none written)

1. Withdrawal email: keep a bare code, or add a link that pre-fills the code (and then which URL)? Affects B-013, B-080 and the email template (B-009 family).
2. Where does a guardian find the withdrawal page (a footer link on the consent email, on the approved screen, a public URL)? No entry point is defined, and the guardian screens only say "contact us" in placeholder wording.
3. Authenticator-app recovery: backup codes, lost-device flow, who may reset (carried forward from pass B candidate 8).
4. 2FA turn-off flow, password re-entry for enrolment, and manual-key fallback for the QR step.
5. Block semantics: effects, reason, undo, blocked list, and the data model (none exists). Also the mobile entry point (owner-vs-viewer, audit Q4).
6. Create Profile for a restricted-pending minor (#367): confirm the PROPOSAL in §2 (no new screen; the minor is routed to Restricted Pending on every login).
7. Rate-limit user message: whether to show a wait time, and whether the 429 applies per step or per page.

## 6. Self-review (screenshot by screenshot)

- Withdrawal desktop 1 (Request) and 3 (Confirm): top bar, tag chip, icon, heading, field with hint, action buttons read cleanly; frame 3 is 909px because the card pushes the buttons down (all content inside the frame). Frame 2 (Request sent) and 5 (Invalid) checked; frame 5 initially showed a collapsed alert icon pill, fixed to an 88px circle and re-rendered.
- Withdrawal mobile 3 (Confirm), 4 (Success) and 5 (Invalid): 350px column at x 20, full-width stacked buttons, no clipping. Frames 1, 2 and 6 were checked by structure (same builder, same sizes), not individually re-rendered after the final copy edit to frame 6.
- 2FA desktop 1, 3, 4, 5: content column sits inside the Settings Shell panel next to the rail ("Security & Account Settings" active); initial render showed narrow text because the content frame hugged, fixed to 533 and re-rendered (frames 1–4 re-checked via frame 4). Frame 2 is the same layout as 3 without the callout and with empty boxes.
- 2FA mobile 1, 3, 4, 5: back bar, title, tag chip, content; code boxes (48px) fit the 350px column; toggle shows On in frame 5.
- Block dialog desktop and mobile: scrim over the profile, dialog centred, Block navy, Cancel outline; the open "…" menu on desktop is hidden behind the dialog (by position, not by edit).
- Not re-rendered after creation: the six notes (text only, checked by overlap query and bounds).

## 7. Observed, not changed

- The desktop 2FA frames inherit the family's 2517px height, so most of each frame is empty.
- The Settings Shell and the cloned profile pages carry existing token debt (avatar image fill on the navbar); untouched.
- `Guardian Consent` frame 4 still has the placeholder "withdraw consent at any time" sentence from pass A; it should point at the new page once the entry point (candidate 2) is decided.
- Build-register rows B-080 (withdrawal page code) and B-087 (2FA screens code) still cite "no Figma" or an older frame status in their own cells; I only wrote the status lines on B-013, B-015, B-007, B-006 as instructed.
