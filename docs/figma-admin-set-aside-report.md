# Figma: Suspected illegal imagery set-aside action and dialog (B-206)

Figma and docs only. No code, tests, strings, Build Plan docx, legal draft or Decision Log changed. The feature is already built (backend PR #800/#806, admin screens PR #803, Figma family PR #858); this pass draws the action and its confirmation dialog on the Media review item page. File `weZWWqggy9j13eX8bhFgs6`, page `0:1`.

## Wording
Every string is copied exactly from `SetAsideDialog.tsx`, `MediaReviewItemPage.tsx` and `apps/admin/src/api/suspectedIllegal.ts`. No new string was invented. Nothing is tagged `[COPY PENDING LEGAL REVIEW]` (founder cleared it 2026-11-22, R108).

## Edited in place
Third button "Suspended illegal imagery" label is "Suspected illegal imagery" on the four item frames: Picture `6852:30003` (button `7090:67164`), Video `6852:30323` (`7090:67166`), Profile picture `6972:46346` (`7090:67168`), Cover `6972:46516` (`7090:67170`). The decision frames `6852:30318`, `6852:30653`, `6972:46388`, `6972:46558` are now 376x90: the action row wraps and the third button sits on a second line (checked on all four).

## New frames (1440x1184, Admin Shell Active = Moderation)
- SA-1 `7092:67168` dialog, reason required (empty, validation line)
- SA-2 `7094:67304` reason entered
- SA-3 `7094:67493` submitting ("Setting aside…")
- SA-4 `7094:67685` error ("Couldn’t set this aside. Nothing was changed. Please try again.")
- SA-5 `7097:67707` dialog for a profile picture
- SA-6 `7099:67843` picture set aside (record status shown)
- SA-7 `7099:68023` profile picture set aside
- SA-8 `7101:68108` restricted notice (callout `7101:68281`), the existing child-safety-vetting-required notice
- Notes frame `7102:68239` (7 notes)

## Prototype links (9, read back)
Picture third button to SA-1; Profile third button to SA-5; Cancel `7092:67225`, `7094:67363`, `7094:67552`, `7094:67744` to Picture; Cancel `7097:67883` to Profile; Confirm `7094:67364` to SA-6; Confirm `7097:67884` to SA-7. Reactions are on instances only.

## Standing check (Decision Log #404 item 14)
Top-level nodes 1,894 to 1,903 (+9: 8 SA frames and the notes frame). Hash of the original ids unchanged (`1105885003`). 0 overlaps. 8 unbound fills, all the inherited Admin Shell `Rectangle 223` (Decision Log #199). Nothing deleted.

## Defaults and disclosures (veto-able)
- SA-2 to SA-4 use illustrative reason text "Looks like a child in an unsafe image. Kept for the set-aside record."
- The disabled Cancel in SA-3 uses opacity 0.4: no Neutral+Disabled Button variant exists.
- The not-vetted case (button hidden for an admin known not to be vetted) is described in the notes frame only, not drawn.
- The Video and Cover third buttons are not linked (no dialog frame for them; the dialog differs only by the noun).
- Stale code comments that still say "NO Figma frame exists", not edited: `MediaReviewItemPage.tsx` line 24, `SetAsideDialog.tsx` line 2, `suspectedIllegal.css` line 1.

## Not done
No code, no tests run, no CI. Screenshots are in `docs/figma-admin-set-aside-screens/` (13 PNGs). Not every frame was re-compared pixel by pixel after the final link pass.
