# Figma gaps A: G1, G3, G6 (design/figma-gaps-a)

Figma file `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Figma and docs only. No code, tests, strings, docx or register edited.

## G1 Verify Email, guardian approval pending (web)

Source: `apps/web/src/pages/VerifyEmailPage.tsx`, status `verified-pending-consent`.
Row at y 337700.

| Frame | Id | Position / size |
|---|---|---|
| Verify Email, guardian approval pending, desktop (G1-1) | 7114:68249 | x 0, 1440 x 844 |
| Verify Email, guardian approval pending, mobile (G1-2) | 7114:68291 | x 1600, 390 x 872 |
| Notes (G1) | 7115:68249 | x 3200, 408 wide |

Reuses: clones of "Verify Email, 2 Verified" 5143:6648 (desktop) and 5531:7284 (mobile); all fills, text styles and the Top Bar inherited.
Text: heading, subheading, card "What this means right now", three rows, button "Check my guardian consent status", copied from the code.
Links: the button opens Guardian Consent 5 Restricted Pending State, desktop 5108:6630, mobile 5531:7461. All other inherited reactions cleared.
Default: marked CONSERVATIVE INTERIM DESIGN (Decision Log #38), not founder-approved.
Screenshots: `docs/figma-gaps-a-screens/g1-1.png`, `g1-2.png` (mobile shows the top part only, 700 px cap).

## G3 — Admin: Banter room report, Reactivate Room card

Source: `apps/admin/src/pages/moderation/ReportedRoomCard.tsx`. Each frame is a clone of `7041:61631` (Report detail, Banter room target, 1440x1184) with reactions cleared and a new "Card — Bants room" inserted in Content. Names: "Admin — Report Detail — Banter room target — <state> (G3-k)". No prototype links.

| Frame | Id | x, y |
|---|---|---|
| G3-1 | 7115:68271 | 0, 339500 |
| G3-2 | 7115:68463 | 1540, 339500 |
| G3-3 | 7115:68655 | 3080, 339500 |
| G3-4 | 7115:68839 | 4620, 339500 |
| G3-5 | 7115:69025 | 6160, 339500 |
| G3-6 | 7115:69211 | 0, 340900 |
| G3-7 | 7115:69406 | 1540, 340900 |
| G3-8 | 7115:69601 | 3080, 340900 |
| G3-9 | 7115:69783 | 4620, 340900 |
| Notes | 7116:69255 | 7700, 339500 |

Strings copied from the code, curly apostrophes included: "Bants room", "Room status", "Active"/"Inactive", "Reactivate Room"/"Saving…", "Room reactivated.", "This room is already active.", "This room wasn’t deactivated by staff, so staff can’t reactivate it.", "Your role can’t reactivate a room.", "Couldn’t reactivate the room. Please try again.", "This room no longer exists." The vetting-restricted state reuses the existing restricted notice.

Fix during the build: the new card first collapsed to height 1 (auto-layout sizing); set to hug on all nine frames and re-checked by screenshot (G3-1, G3-9).

## G6 — Web: small report menu on a post card

Source: `apps/web` `ReportAction.tsx`, "menu" stage (role="menu"; items "Report post", "Report user", "Cancel"; trigger "Report"). Clones of the media-report frames 6849:29863 (desktop) and 6849:30022 (mobile), reactions cleared. The media-level "Report control" is hidden on both; the existing "Report menu" component part was moved under the card's top-right control and changed to the three items (the "Report this picture" item removed, "Report user" added by cloning "Report post").

| Frame | Id | x, y |
|---|---|---|
| G6-1 desktop "Web — Post card — Report menu open — Desktop (G6-1)" | 7116:69268 | 0, 342300 |
| G6-2 mobile "Web — Post card — Report menu open — Mobile (G6-2)" | 7116:69318 | 1000, 342300 |
| Notes | 7117:69267 | 2000, 342300 |

Prototype links (on frames, read back): "Report post" 7116:69294 and 7116:69344 to 6946:40232; "Report user" 7116:69316 and 7116:69366 to 6946:40440. "Cancel" has no link.

Defaults, veto-able: the menu is anchored under the top-right control and is 100 px wide (the original item width after removing the picture item); the media-level menu is not drawn.

## Verification (all groups)

- Top-level nodes on page `0:1`: 1,905 before, 1,921 after (16 new: G1 3, G3 10, G6 3). The original id list was not saved before the first write, so the "original ids unchanged" hash was NOT taken; only the count difference is verified.
- Reactions: 6 on the new nodes (G1 2, G6 4); every destination is in the G set or one of 5108:6630, 5531:7461, 6946:40232, 6946:40440.
- Overlaps between new frames and every other top-level node: 0. Unbound solid paints on new frames: 9, all the inherited Admin Shell `Rectangle 223` (Decision Log #199).
- Screenshots compared by eye for G1-1, G1-2, G3-1, G3-9, G6-1, G6-2 and the G3 and G6 notes; the other G3 frames come from the same builder code and were not individually viewed.

## Code comments made stale (not edited)

- `apps/web/src/pages/VerifyEmailPage.tsx` lines 37 to 41 and 219 (G1).
- `apps/admin/src/pages/moderation/ReportedRoomCard.tsx` line 5 (G3).
- `apps/web/src/pages/community/ReportAction.css` line 1 (G6).
