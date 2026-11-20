# Figma pass N — Block labels, mobile cover crop, Guardian Withdrawal check

Date: 2026-10-25. Figma file `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Figma and docs only: no application code, schema, legal copy, DPIA or Decision Log `.docx` changed. Nothing archived, nothing deleted. Before/after screenshots are in `docs/figma-pass-n-screens/`.

Built wording was read from `apps/web/src/pages/OtherProfilePage.tsx` and `apps/web/src/pages/settings/BlockedUsersPage.tsx` on `origin/main` (be8c593).

## 1. Counts

| Check | Before | After |
|---|---|---|
| Top-level nodes on `0:1` | 924 | 927 (3 new: two frames, one note) |
| Hash of the original 924 top-level ids (djb2, in order) | 4154553198 | 4154553198 (unchanged) |
| All nodes on `0:1` (`findAll`) | 143,785 | 143,854 (+69 = 2 x 34 + 1) |
| Archived nodes added | n/a | 0 |
| Unbound solid paints on new frames and on the changed crop and notice frames | n/a | 0 |
| Overlaps of touched or new frames with other top-level nodes | n/a | 0 |

Per-frame node counts before and after: Block confirmation desktop 2354 to 2354, blocked profile mobile 24 to 24, blocked profile desktop 127 to 127, crop mobile 36 to 36. Frame sizes that changed: blocked profile mobile 390x510 to 390x526 (the body text now wraps to three lines; auto-layout), cover crop mobile 390x602 to 390x584, crop note 900x131 to 900x176.

## 2. (a) B-218 Block labels

Every Block label was read off the frames and compared with the built text.

| Label | Built wording | Figma before | Result |
|---|---|---|---|
| "..." menu item | `Block {name}` | `Block christine001` (6669:27267, 6782:30037, 6706:26919); `Block nelson_iheagwam` (6655:29578) | desktop fixed |
| Dialog title | `Block {name}?` | `Block christine001?` (6655:29670); `Block nelson_iheagwam?` (6655:29590) | desktop fixed |
| Dialog body | `Blocking {name}:` + 3 bullets + `You can undo it at any time in Settings; unblocking does not restore follows. They are not told.` | same text on mobile (6706:26926); desktop 6714:28449 said `nelson_iheagwam` | desktop fixed |
| Reason field | `Reason (optional)`, placeholder `Add a note for yourself` | same | matches |
| Buttons | `Cancel`, `Block` | same | matches |
| Blocked-profile title | `You blocked {name}` | `You've blocked christine001` | fixed (both) |
| Blocked-profile body | `You can’t follow or message them, and you won’t see their posts. Unblocking does not restore follows.` | `Their posts, comments and likes are hidden from you, and yours from them. They are not told.` | fixed (both) |
| Blocked-profile button | `Unblock {name}` | `Unblock` | fixed (both) |
| Blocked users list | title `Blocked users`, lead, `No blocked users`, empty body, `Reason: {reason}`, `Unblock` | same | matches |
| Unblock confirmation | title `Unblock {name}?`, body, `Cancel`, `Unblock` | same | matches |

### Every change, with old values

| Node | Frame | Old | New |
|---|---|---|---|
| 6655:29359 | 6655:27355 Block confirmation, desktop (header handle) | `@nelson_iheagwam` | `@christine001` |
| 6655:29578 | 6655:27355 (menu item under the dialog) | `Block nelson_iheagwam` | `Block christine001` |
| 6655:29590 | 6655:27355 (dialog title) | `Block nelson_iheagwam?` | `Block christine001?` |
| 6714:28449 | 6655:27355 (dialog body, first line) | `Blocking nelson_iheagwam:` | `Blocking christine001:` |
| 6706:26836 | 6706:26750 blocked profile, mobile (title) | `You've blocked christine001` | `You blocked christine001` |
| 6706:26837 | 6706:26750 (body) | `Their posts, comments and likes are hidden from you, and yours from them. They are not told.` | `You can’t follow or message them, and you won’t see their posts. Unblocking does not restore follows.` |
| 6706:26767 | 6706:26750 (button) | `Unblock` | `Unblock christine001` |
| 6707:26723 | 6707:26595 blocked profile, desktop (title) | `You've blocked christine001` | `You blocked christine001` |
| 6707:26724 | 6707:26595 (body) | same old body as above | same new body as above |
| 6707:26716 | 6707:26595 (button) | `Unblock` | `Unblock christine001` |
| 6655:29793 | desktop Block note | pass D text, now stale | pass N update sentence appended (original text kept) |

`nelson_iheagwam` now appears only on own-profile frames, where it is correct. No other-user frame names it.

### Left open (not changed)

- The `[COPY PENDING LEGAL REVIEW]` tag on the blocked-profile notice stays. The built blocked notice carries no tag and has no row in `docs/pending-copy-manifest.md`; removing a tag is a legal-copy call.
- The desktop Block confirmation 6655:27355 is still built on the legacy own-profile layout (1455:4362, archived) with `@mekusa` post authors. It was not rebased on the desktop other-user frame 6747:28894. Only the names were fixed, as asked.
- Blocked users rows draw a display name plus `@handle` ("Adeniyi Christiana", `@christine001`); the built row shows the public name once. Structural, not wording; not changed.
- Mobile Unblock button now reads `Unblock christine001` (hugs, fits at 390).

## 3. (b) Mobile cover crop, one crop at 796:192

Decision Log #414 item 2: ONE saved crop at 796:192 for both breakpoints. Frame 6812:29396:

| Node | Old | New |
|---|---|---|
| Crop window 6812:29421 (renamed from `...390:120` to `...796:192`) | 350 x 108 at y 40 | 350 x 84 at y 52 (centred in the 188 stage) |
| Dim above 6812:29419 / below 6812:29420 | 40 / 40 high | 52 / 52 high |
| Grid v 6812:29422, 29423 | 108 high at y 40 | 84 high at y 52 |
| Grid h 6812:29424, 29425 | y 76, y 112 | y 80, y 108 |
| Handles 6812:29426 to 29429 | y 40 / 136 | y 52 / 124 |
| Drag hint 6812:29430 | y 81 | y 80.5 |
| Preview banner 6812:29437 | 280 x 86 | 280 x 67.54 |
| Frame | 390 x 602 | 390 x 584 (hug) |

Desktop 6812:29354 was already 796:192 (520 x 125) and was not touched. Note 6812:29488 was rewritten (see the screenshot): it now says one crop for both breakpoints and records the decided points (browser crop before upload, original not stored, zoom 1x to 3x, minimum width 796 px).

Open, written into the note: the zoom slider fill and thumb are carried over from pass M and are not scaled to a 1x to 3x range ("140%" is a sample); on mobile the profile cover frame is 390:120, so cover-fit clips the sides of the 796:192 result, and the preview caption "how your cover will look on your profile" is not exact there; a minimum-width message is not drawn.

## 4. (c) Guardian Withdrawal frames against the built API

Compared with `guardian-consent.controller.ts`, `guardian-consent.service.ts`, the two DTOs and `registration-email.service.ts`.

| Frame | Built behaviour | Match |
|---|---|---|
| 1 Request (6654:2 / 6654:26727) | `POST /auth/guardian-consent/withdraw/request {email}`; the email is the MINOR's account email (`IsEmail`) | matches: label "Email address of the Soccernity account", hint "not your own" |
| 2 Request Sent (6654:30 / 6654:26755) | always 200, message `If that account has confirmed guardian consent, a withdrawal link has been sent to the guardian.`; link single use | matches word for word; "Enter a withdrawal code" leads to frame 3 |
| 3 Confirm (6654:57 / 6654:26782) | `POST /auth/guardian-consent/withdraw {withdrawalToken}`; account login blocked at once, deletion scheduled | matches (field "Withdrawal code", "closes the account straight away") |
| 4 Success (6654:91 / 6654:26816) | 200 `Guardian consent withdrawn.`; email sent to the minor (`sendConsentWithdrawnEmail`) | matches ("We have emailed the account holder") |
| 5 Link invalid or expired (6654:118 / 6654:26843) | 400 `Invalid or expired withdrawal token` for unknown, expired, used or non-confirmed; token TTL 72 h | matches (generic; no TTL stated) |
| 6 Too many attempts (6654:146 / 6654:26871) | 429 from the shared auth throttle | matches (no numbers shown) |

**Pre-fill (the point asked for).** The withdrawal email links to `/guardian-consent/withdraw?token=<withdrawalToken>` and also prints the code in the body. Frame 3 only showed the empty state, so two frames were added by cloning 6654:57 and 6654:26782 (nothing existing edited):

- Desktop `6820:29312` "Guardian Withdrawal — 3 Confirm — code pre-filled from link" at x 27224, y 3450.
- Mobile `6820:29346` "... — Mobile — code pre-filled from link" at x 20504, y 4750.
- Only the field differs: the placeholder text is replaced by a sample UUID (`7c1d4e9a-3b52-4f0e-9a6d-2e8f1b5c0a47`, made up; the real token is a random UUID) in `color/text/primary` (bound variable 5096:8) instead of the 70% placeholder; mobile text is 14 px so it fits the 350 px field.
- The original frames remain the state reached from "Enter a withdrawal code", where the guardian pastes the code. Note `6820:29380` records this.

**Differences between the frames and the build, none changed:**

- No frame draws the 400 returned for a blank or malformed field (blank code, invalid email).
- Throttle: #414 decides 5 attempts per 15 minutes held in configuration; the built routes use the bare shared `@AuthRateLimit()` (5 per 60 seconds). The frames state no number, so they match either.
- The withdrawal web page is not built (FC6, B-080/B-112); the email link path `/guardian-consent/withdraw` is the build's assumption.
- Success frames say the details are deleted after 30 days; the Decision Log #411 item 7 counsel inconsistency about that sentence is unchanged (B-200).
- No prototype links on the withdrawal frames (none were drawn by pass D; not asked).
- The consent email carries no withdrawal link (checked in code); the Approved screens' sentence about the withdrawal page is unchanged.

## 5. Not done

- No rebase of the desktop Block confirmation onto 6747:28894.
- No tag removal, no archive, no deletion.
- Register: status lines appended to B-080, B-112, B-210, B-218 only.
