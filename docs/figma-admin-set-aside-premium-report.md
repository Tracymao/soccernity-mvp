# Admin Media review: "Set aside as suspected illegal imagery" frames, premium restyle

Figma file `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Figma and docs only. No code or CSS was changed.
Source of truth: `SetAsideDialog.tsx`, `MediaReviewItemPage.tsx`, `api/suspectedIllegal.ts`, `moderationShared.tsx` on `origin/main` (`6a24f92`).

## Frames (ids kept, all 1440x1184)

| Frame | Id | Shows |
|---|---|---|
| SA-1 | `7092:67168` | Dialog on a picture item, reason required (alert border, "Enter a reason to continue.") |
| SA-2 | `7094:67304` | Dialog, reason entered |
| SA-3 | `7094:67493` | Dialog, "Setting aside…", both buttons Disabled variants |
| SA-4 | `7094:67685` | Dialog, error callout at the top of the body, typed reason kept |
| SA-5 | `7097:67707` | Dialog on a profile picture item, reason required (the state the old frame showed) |
| SA-6 | `7099:67843` | Picture item after set aside: "Already decided." and record callouts, Approve and Reject disabled, no third button |
| SA-7 | `7099:68023` | Profile picture item "set aside just now": both callouts, Approve and Reject disabled, no third button |
| SA-8 | `7101:68108` | Picture item, restricted card, no dialog, Approve and Reject enabled, no third button |

Page content was cloned from the restyled item frames `6852:30003`, `6972:46346` and `6972:46686`. The dialog was cloned from the Moderation shell on `6672:27349` (560 wide, radius 16), the scrim from the same frame. Dialogs are centred in the frame. The noun is "picture" (SA-1 to SA-4) and "profile picture" (SA-5, SA-7), which is what the code passes (`itemTypeLabel(item).toLowerCase()`).

## Archived layers (hidden, prefixed "ARCHIVED ", moved below the frame, not deleted)

- SA-1: `7092:67169`, `7092:67170`, `7092:67214`, `7092:67215`
- SA-2: `7094:67305`, `7094:67306`, `7094:67350`, `7094:67351`
- SA-3: `7094:67494`, `7094:67495`, `7094:67539`, `7094:67540`
- SA-4: `7094:67686`, `7094:67687`, `7094:67731`, `7094:67732`
- SA-5: `7097:67708`, `7097:67709`, `7097:67870`, `7097:67871`
- SA-6: `7099:67844`, `7099:67845`
- SA-7: `7099:68024`, `7099:68025`
- SA-8: `7101:68109`, `7101:68110`

The cloned base frames carried their own hidden archived layers. Those duplicate copies (made by this pass) were removed from the clones; the originals on the base frames are untouched. One SA-5 dialog built by this pass was also replaced and removed.

## Removed tags

- Notes frame `7102:68239`, last note (`7102:68246`): its kind was "Copy pending legal review" although it only describes prototype links. Changed to "Scope open". This was the only such tag. No frame carried a `[COPY PENDING LEGAL REVIEW]` tag (founder review of 2026-11-22, R108).

## Notes updated

`7102:68241` (sample reason and date), `7102:68242` (Disabled variants replace the 0.4 opacity), `7102:68243` (picture action row no longer wraps), `7102:68244` (noun is "profile picture" or "cover photo", not "picture or cover"), `7102:68245` (the code comments are no longer stale), `7102:68246` (kind and prototype wording). `7102:68240` unchanged.

## In the old frames, not rendered by the code

- Picture items were drawn as a two-column page with a header "Back to queue" button. The code renders one column with a "← Back to queue" link.
- The old Details cards listed the automatic-check labels as rows with a red dot, and the note used a dash. Replaced by the restyled item frame's pills and wording.
- The old SA-6 had no "Already decided." callout. The code re-reads the item after set-aside, so it renders one, with the stored reason "This file didn't meet our rules".

## Assumptions (defaults, veto-able)

- Sample data: reason "The picture appears to show a child in an unsafe situation."; SA-6 rejection date "28 Nov 2026, 10:42"; record status "Not filed".
- SA-3 Cancel uses Secondary Disabled, as there is no Neutral Disabled variant.
- Cancel in the dialog keeps the shell's outline look.
- SA-8 hides "Suspected illegal imagery": after the 403 the page re-reads the admin profile, and this assumes it then reports the admin as not vetted.
- The picture item "Source" reads "Automatic check", as the old frames did. The base frame `6852:30003` reads "User report" with no "Reported by" callout, which the code would show for a reported item. The base frame was not edited; worth a follow-up.
- The SA-5 Confirm link to SA-7 is kept for the prototype even though SA-5 shows the invalid state.
- The profile viewer shows the base frame's placeholder rectangle.

## Standing check

- Top-level count 2004; id hash (djb2-xor, ids joined with no separator, excluding `7230:71662`) 2327422288.
- Queue content `5794:8710` 1100x620; Report Detail `5796:8635` content 1098x1282; Appeal Review `5796:8753` content 1098x1455.
- No overlaps between the eight frames or the notes frame and other top-level nodes.
- All 8 frames: no text under 12px, no uppercase text case, no `[COPY PENDING` text, one search bar, no unbound solid fills outside the Admin Shell.
- Contrast: dialog and page-state text is at least 4.5:1 except the labels on shipped Disabled buttons (4.14 to 4.35 on SA-3, SA-6, SA-7). Disabled controls are exempt from WCAG contrast. Text dimmed under the scrim was not measured.
