# Figma pass H - Block states, 2FA recovery states, pinned final entry

Date: 2026-10-17. Agent: figma-screen-builder. Figma file `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Figma and docs only: no application code, schema, legal copy, DPIA or `.docx` was changed.

Source of the decisions: Decision Log #396 and #402 (Block), #397 and #402 (2FA), #400 E10 / #403 items 11 and 12 (pinned final entry), docs/contest-spec.md sections 7 and 10b. Register rows touched (status lines added): B-007, B-015, B-082, B-087, B-096, B-107, B-108, B-111. No new B-ID.

All new frames are Light mode, bound to the `Soccernity Theme` variables, 390px canonical mobile, Montserrat. Mobile frames that are an overlay or a viewport state use 844px height (Unblock confirmation, Block confirmation). The new frames sit in a fresh band below the existing canvas (y 66,070 to 74,800), clear of everything else.

Session note: this pass was interrupted by a session limit and resumed. On resume the canvas was re-read before any further write; the frames from the first part were verified in place (screenshots) and nothing was rebuilt or duplicated.

## 1. What was built

### (1) Block

| Item | Frames |
|---|---|
| Settings > Blocked users, desktop | list `6705:26172`, empty `6705:26427`, unblock confirmation `6705:26659` |
| Settings > Blocked users, mobile | list `6706:26580`, empty `6706:26650`, unblock confirmation `6706:26697` (390 x 844) |
| Blocked-profile state (blocker's view) | mobile `6706:26750`, desktop `6707:26595` |
| Block confirmation REBASED | existing `6655:29600` (mobile) |

- The Blocked users pages are leaves of Privacy: desktop is a clone of the Privacy page shell (`6178:14437`, Active = Privacy) with its content replaced; mobile is a clone of the 2FA mobile frame `6655:27196` (back bar returns to the Settings hub, like every other mobile section frame). Rows show only what the Block model stores (#396): the blocked person and an optional reason. People and reason are SAMPLE data.
- Unblock confirmation says only what #402 decides: unblock is possible and does NOT restore follows. The blocked person is not told.
- Blocked-profile state: Unblock replaces Follow; the message icon, stats, tabs and posts are removed (posts, comments, likes hidden; messages stop: #396 / #402); a notice panel states it. Mobile is built on the other-user variant `6669:27188`. Desktop is a NEW auto-layout profile (navbar header 4, 796px column), not a clone of the legacy absolute-layout frames (1455:4362 etc.), so none of their unbound paints came with it. Their placeholder sidebars (Trends, News, Fixtures) are omitted.
- Block confirmation `6655:29600` rebased: the old own-profile background (`Profile (cloned, menu open)`) is hidden and renamed `ARCHIVED - own-profile background ...`; a clone of the other-user variant `6669:27188` sits behind the scrim with its menu hidden (the menu is closed after tapping Block); the dashed placeholder body is hidden and renamed `ARCHIVED - Placeholder ...`; the title now reads "Block christine001?" (it said `nelson_iheagwam`, which matched neither the profile nor the menu); the body lists the consequences decided in #396 / #402; an optional "Reason (optional)" field was added (#396). The `...` trigger is the existing "..." menu pattern (#403 item 12).
- NOT touched: the desktop Block confirmation `6655:27355`. It already sits on the other-user desktop frame (`1455:4362` clone), so no rebase was needed, but its body is still the old placeholder. It is outside this brief; syncing its body to the mobile dialog is a one-step follow-up.

### (2) 2FA recovery states (authenticator app)

Nine states, each desktop and mobile. Three live in Settings (built on the 2FA frames `6655:41` / `6655:27196`, Active = Security); six live on the sign-in side (logo-only Top Bar, auth chrome, Decision Log #172), because lost-device recovery and the code prompt happen before a session exists.

| State | Desktop | Mobile |
|---|---|---|
| Manual setup key (step 1 alternative) | `6711:26922` | `6712:27330` |
| Backup codes, shown once (10 single-use) | `6711:27117` | `6712:27387` |
| Turn off with password re-entry | `6711:27333` | `6712:27465` |
| Login-time code prompt | `6711:27530` | `6712:27524` |
| Recovery: choose method (backup code, OR email plus password) | `6711:27559` | `6712:27553` |
| Recovery: enter a backup code | `6711:27590` | `6712:27584` |
| Recovery: backup code not accepted | `6711:27617` | `6712:27611` |
| Recovery: email and password | `6711:27646` | `6712:27640` |
| Recovery: check your email | `6711:27673` | `6712:27667` |

- Backup codes are drawn as ten dashed placeholder cells labelled Code 1 to Code 10: the format is not decided (#402) and nothing implies one. The setup key is a dashed placeholder too (the real key comes from the server).
- The login-time prompt reuses the existing line "Enter the code shown in your authenticator app for Soccernity." and the existing Wrong Code callout pattern (alert bar). Every other string is new.
- Prototype links added: Manual key to Scan QR and Enter Code; Backup codes "I've saved my codes" to "2FA is on"; Turn off Cancel to "2FA is on"; prompt link to choose; choose to backup-code and email paths; email to sent; every Back returns up one step. The existing frames `6655:2`, `6655:137`, `6655:173` and their mobile twins were NOT rewired.

### (3) Pinned final entry on the finalist's own profile (#400 E10)

| State | Desktop | Mobile |
|---|---|---|
| Before the reveal | `6707:26727` | `6709:26922` |
| After the reveal | `6707:26938` | `6709:27056` |

- Own-profile variant (Edit Profile, Posts / Media / Saved tabs). The entry is pinned first with the existing "Contest post" label (the Phase 1 pattern) and a video placeholder.
- Before the reveal: all engagement locked. The four engagement icons use the inactive token (disabled), counts are hidden, and a lock notice (new wording, tagged) says only the owner can see the entry until the reveal. Impression counts appear nowhere.
- After the reveal: icons use the active tokens and counts are shown. Counts are SAMPLE numbers and start low on purpose: only engagement made after the reveal counts (contest-spec).
- Desktop is a new auto-layout own-profile frame (same reasoning as the blocked-profile desktop frame); mobile is a clone of the own-profile variant `5702:8250`.

### Notes
Every frame group carries an on-canvas `NOTE - Pass H ...` text with its SCOPE OPEN points (section 4). Their positions are above each row, clear of all frames.

## 2. Canvas deltas

The brief asks for a whole-canvas `get_metadata` (page `0:1`, depth 4 or more) before and after. That call is too large to return on this file (about 137,000 nodes; earlier passes hit the same limit), so the delta was measured with a `use_figma` walk of the same page instead.

| Measure | Before | After |
|---|---|---|
| Top-level nodes on `0:1` | 779 | 832 (+53) |
| Total nodes on `0:1` | 136,738 | 139,202 (+2,464) |
| ID hash of the first 779 top-level nodes, in order | 1474511440 | 1474511440 (identical) |

- No original top-level node was removed, moved or reordered; the 53 new ones are appended (frames and notes).
- Nodes added inside an existing frame: only inside `6655:29600` (the rebase: a background clone, a body text, a field). Hidden, not deleted: the old own-profile background and the placeholder body. Nothing existing was deleted.
- The 53 new top-level nodes are 30 frames (Blocked users 6, blocked profile 2, pinned entry 4, 2FA 18) and 23 notes (Blocked users 3 desktop + 5 mobile, desktop profile 3, mobile pinned 2, 2FA 9 desktop + 1 mobile). The rebase of `6655:29600` adds no top-level node.

## 3. Audit

Measured by node walk over every new top-level node plus the rebased `6655:29600` (visible solid paints only):

| Check | Result |
|---|---|
| Visible solid paints audited | 1,843 |
| Unbound solid paints | 0 |
| `brand/green-tint-28` | 0 |
| New colours | 0 (only `Soccernity Theme` Light variables; red `semantic/alert` only as the Wrong Code alert bar) |
| Overlaps, new frames and notes vs every top-level node | 0 |
| Image fills | 9, all the avatar `IMAGE` fill inside the shared navbar instance (header 4): pre-existing component debt, not editable from an instance, not force-bound |
| Destructive actions | navy, never red (no destructive token; #99) |

Screenshots were checked for: Blocked users list and unblock confirmation (desktop), mobile list, blocked profile and rebased dialog, both desktop pinned states, mobile pinned (before), 2FA backup codes, choose and prompt (desktop and mobile).

## 4. Wording and open points

### New wording, tagged [COPY PENDING LEGAL REVIEW]
Every frame that carries new minor-facing or data-processing wording has the tag in the frame itself: the Blocked users pages (intro line, empty state), both unblock confirmations, the blocked-profile notice, the Block confirmation body and reason field, the pinned-entry lock notice, and all 2FA screens (manual key, backup codes, turn off, prompt link, recovery). Strings that come from an existing source: "Blocked users" (#396), "Unblock", "Reason (optional)" (#396), "Enter the 6-digit code" and "Enter the code shown in your authenticator app for Soccernity." (existing frame), "Contest post" (existing badge), the Wrong Code alert pattern.

### SCOPE OPEN (on canvas, one note per frame group)
- Blocked users has no entry row on Settings > Privacy (`6178:14437` / `6185:14547`); those frames were not touched, so the page is not reachable in the prototype yet.
- Whether the list shows the date blocked; whether the reason can be edited later; who can see the reason; any length limit.
- What the BLOCKED user sees on the blocker's profile (#402 says they are not told, so no "blocked" state can be shown to them); whether bio, country and follower counts stay visible to the blocker. #402 still open: Bants rooms, like mechanics, #346 / #347 interaction.
- 2FA: backup-code format, regeneration and download; where the codes appear in the existing success flow (assumed: after the 6-digit code is accepted, before `6655:137`); entry points for the manual key and for Turn off (frames outside this pass); whether turning off invalidates the codes; attempt limits; wrong versus already-used code; whether the password is asked again after login; link lifetime, resend, and whether the "check your email" page must read identically for unknown accounts; secret and backup-code storage (counsel, Part C row 44). For the founder's veto (#402): email plus password makes recovery only as strong as the email account.
- Pinned entry: what other people see on a finalist's profile before the reveal (assumed: nothing); how others reach the entry after the reveal (#400 / #403 open); whether the entry stays pinned after the month ends.

### Decision Log candidates
1. Add a "Blocked users" row to Settings > Privacy (desktop and mobile), and decide whether it also appears elsewhere.
2. Sync the desktop Block confirmation `6655:27355` body to the mobile dialog.
3. The blocked user's view and the blocker's view of identity fields (see above).
4. Backup-code format, regeneration and download.
5. 2FA recovery details: password re-ask, wrong vs used code, attempt limits, resend, link lifetime, enumeration.
6. Entry points for the manual key (a "Can't scan?" link on `6655:2`) and for Turn off (a control on `6655:173` / `6655:27322`).
7. Where the backup codes sit in the existing enrolment flow.
8. Pinned entry: non-owner view before the reveal, pin duration, post-reveal access.
9. The label on the pinned entry is "Contest post" (the existing badge); contest-spec section on auto-pinning says a "Contest" label. Confirm which wording is canonical.
10. The two desktop profile frames (blocked, pinned) are new auto-layout frames rather than edits of the legacy absolute-layout profile frames; confirm this is the direction for desktop profile design.

## 5. Other fixes made in this pass

- Doubled layer names ("NOTE - NOTE - ...") on 11 notes written in the first part of the session were corrected to a single prefix.
- Desktop recovery option cards (`6711:27559`): the option descriptions wrapped at a fixed 200px; they now fill the card width. The mobile twin was built with the fix.
- Nothing that was already on the canvas was found broken.

## 6. Not done

- No Block frames beyond the list requested: no "blocked you" view for the other party (not drawn on purpose, see SCOPE OPEN), no Bants-room block state.
- No success state after Turn off, no "2FA reset" state after recovery.
- The existing 2FA frames, Privacy frames and the desktop Block confirmation were not edited.
- The Figma-side Settings entry points and prototype links into the new frames from existing frames are not added (outside this pass).
