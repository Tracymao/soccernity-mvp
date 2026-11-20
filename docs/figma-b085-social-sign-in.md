# B-085 design half: social sign-in states (Figma)

Decision Log #378 (Apple removed, Google and Facebook kept) and #468 (social sign-in built behind configuration, off until the founder adds the OAuth keys; a Facebook account with no email enters and verifies one before the account is created; the Age Gate and guardian flow always apply after a social sign-in; the provider's date of birth is never trusted). Build register rows B-084 and B-085.

Figma file `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Light mode, 390 px mobile. Figma and docs only: no application code, schema, legal text, Build Plan docx or `docs/build-register.md` changed. No suite run.

## 1. Apple removal: already done, checked, not redone

The four login and register frames already had Apple hidden and renamed `ARCHIVED — Continue with Apple (#378)` (W0 pass A). Read back this pass:

| Frame | Frame id | Apple node (hidden) | Social block |
|---|---|---|---|
| Login desktop | `407:844` | `5418:7088` | `5418:7075` |
| Login mobile | `1625:2303` | `5418:7154` | `5418:7141` |
| Register desktop | `407:1051` | `5418:7110` | `5418:7097` |
| Register mobile | `1625:2333` | `5418:7176` | `5418:7163` |

Each block now lists Divider, Google and Facebook visible and Apple hidden; Facebook sits directly under Google (auto-layout closed up). Screenshots of both mobile frames show Google and Facebook only. A page-wide text search found "Apple" only in these four hidden buttons, the eight Terms and Privacy frames (legal text) and the pass A notes. Nothing was deleted and no existing frame was edited.

## 2. New frames (7 frames and 1 note, below the canvas, y 206000, x 0 to 3390)

| State | Frame | Node id | x |
|---|---|---|---|
| A. Login, buttons hidden (no provider enabled) | Login — Social buttons hidden (no provider enabled) — Mobile | `6965:46142` | 0 |
| A. Register, buttons hidden | Register — Social buttons hidden (no provider enabled) — Mobile | `6965:46204` | 500 |
| B. Enter your email (Facebook sent none) | Social sign-in — Enter your email (Facebook, no email) — Mobile | `6966:46142` | 1000 |
| B. Same, invalid email | Social sign-in — Enter your email — Invalid email — Mobile | `6966:46212` | 1500 |
| C. Person cancelled | Social sign-in — Cancelled (Facebook) — Mobile | `6966:46289` | 2000 |
| D. Provider refused or failed | Social sign-in — Provider refused or failed (Facebook) — Mobile | `6966:46362` | 2500 |
| E. Hand-off to the Age Gate | Social sign-in — Next step: confirm your age (hand-off to Age Gate) — Mobile | `6966:46438` | 3000 |
| Note | NOTE — B-085 social sign-in states | `6968:46142` | 0, y 205652 |

All are clones of Login mobile (`1625:2303`) or Register mobile (`1625:2333`), so the Top Bar, tokens, fonts and buttons are inherited. The error callout is built from the existing tokens: `semantic/alert` accent bar and field border (Decision Log #408 item 4), `color/text/primary` text, `color/background/surface` fill. No new colour.

## 3. Reuse and prototype links (read back from the file)

Existing frames are reused, not redrawn. Links set on the new frames only:

- B Continue (both frames) goes to the existing Verify Email — Prompt — Mobile `6750:29531`.
- E Continue goes to the existing Age Gate — Mobile `5539:7264`.
- B "Use a different sign-in method", C and D "Back to log in", E "Cancel" go to Login mobile `1625:2303`.

## 4. Wording

Plain and functional. One line makes a data statement and is tagged `[COPY PENDING LEGAL REVIEW]` inline (the file's existing convention), in frame E: "Next you'll enter your date of birth and country. We don't use a date of birth from Google or Facebook." No consent text was written. The sample provider is Facebook; a Google version uses the same layout with the name swapped.

## 5. Standing check (Decision Log #404 item 14)

Top-level nodes 1,300 to 1,308 (7 frames and 1 note). Hash of the original 1,300 ids unchanged (`2178416965` before and after). Paint audit: 215 solid paints on the 7 frames, all variable-bound except 7 inherited unbound text paints on a hidden `Layer_3` descendant of the Top Bar logo (same node is unbound in the source frame, not visible). 0 overlaps with any existing top-level node. Nothing deleted or archived this pass.

## 6. SCOPE OPEN (also on the note frame)

1. Whether the email step sits before or after the Age Gate for Facebook is not decided; frames follow the #468 order (email, verify, Age Gate).
2. How the verification message is delivered (code or link) is not decided; the existing prompt is reused.
3. An existing person signing in by social goes straight in: no frame.
4. Desktop hidden-state frames are not drawn (the brief said mobile).
5. "No provider enabled" is a configuration switch, so frame A is simply what the person sees; it is not a screen of its own.
6. The hand-off frame E is a judgment call: the brief named a hand-off into the Age Gate but drew no screen for it, so a short interstitial was added; it can be dropped if the Age Gate should open directly.
