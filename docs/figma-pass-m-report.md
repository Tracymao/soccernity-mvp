# Figma pass M — Block label, cover crop step, rejected-image notification rows, K6 tag review

Date 2026-10-25. Branch `figma/pass-m-block-label-cover-crop-rejected-notif`. Figma and docs only: no application code, schema, legal copy, DPIA or `.docx`; `docs/build-register.md` not edited (status lines in section 7). File `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Decisions applied: #412 items 2, 3, 5, #413; register B-210, B-211, B-212, B-218 (part).

Nothing was archived and nothing was deleted. Screenshots (before and after, taken in the same session) are in `docs/figma-pass-m-screens/`.

## 1. (a) Block label on `6747:28894` (other-user profile, desktop)

The menu item read `Block nelson_iheagwam` (`6782:30037`) and the header handle read `@nelson_iheagwam` (`6782:29565`). `nelson_iheagwam` is the signed-in owner (the own-profile frames, K5/K6/B-201). The other-user mobile frame `6669:27188` and its Block frames name the viewed person `christine001`. So the label told the viewer to block themselves.

Changed: `6782:30037` -> `Block christine001`; `6782:29565` -> `@christine001`. Both were changed because a label that names `christine001` under a header that says `@nelson_iheagwam` would contradict itself. Old values are above, so this reverts in one step. The built code is `Block {publicName}` (`OtherProfilePage.tsx`), i.e. the username without `@`, which the new label matches.

Judgment call to confirm: I read "name the viewed user" as the viewed user of the other-user variant (`christine001`, as on `6669:27188`). The post cards on this frame still show other people's handles (`@mekusa`, kept on purpose, #411 item 8), and the display name `Adeniyi Christiana` is also the owner's name on the own-profile frames. That sample-data mix is older than this pass and is not touched here.

Other Block labels that still name `nelson_iheagwam` and were NOT changed (outside the instruction, listed for B-218): desktop Block confirmation `6655:29578` (menu item) and `6655:29590` (`Block nelson_iheagwam?`); legacy frames `1455:6617`, `1460:11195`, `1466:18189` (archived/legacy). The mobile Block frames (`6669:27267`, `6706:26919`, `6655:29670`) already say `christine001`.

## 2. (b) B-210: cover crop step

New frames, below the canvas (y 95800), auto-layout, Light mode, built from the K6 cover remove-confirm frames so every binding is inherited:

| Frame | Id | Size |
|---|---|---|
| Cover Photo — Crop — Desktop (B-210, #412 item 3) | `6812:29354` | 560 x 655 |
| Cover Photo — Crop — Mobile (B-210, #412 item 3) | `6812:29396` | 390 x 602 |

Drawn: title, instruction, a crop stage with a stand-in picture, the dimmed area outside the window, the crop window at the cover aspect ratio (desktop 796:192, the Edit Profile cover; mobile 390:120), thirds grid, four corner handles and a Drag to move hint; a zoom control (minus, slider, plus, value); a cropped preview at the cover shape; Save cover photo and Cancel; and the existing tagged cover hint (kept, see section 5). The step sits between choosing a file and the Uploading state; no prototype links drawn.

The stand-in picture is `brand/green` because the dimming token (`color/overlay/scrim`, navy 27.75%) is invisible on navy, which is what K6 uses for a chosen picture. It is not a colour decision.

NOT DECIDED (SCOPE OPEN, on-canvas note `6812:29488`): one saved crop or one per breakpoint (796:192 and 390:120 differ); zoom range and step; crop before upload or on the stored original; minimum picture size.

## 3. (c) B-211: Notification Centre row for a rejected image

One unread and one read row appended to each list of the existing feed frames (rows cloned from the Contest rows, so fills, spacing and the dot are inherited):

| Breakpoint | Feed frame | Unread row | Read row |
|---|---|---|---|
| Desktop | `5640:7815` | `6812:29438` | `6812:29451` |
| Mobile | `5643:8003` | `6812:29463` | `6812:29476` |

Wording (functional, untagged): `Your picture wasn’t approved — see why in Edit Profile`; times `2 hours ago` (unread) and `1 week ago` (read), the same samples as the donor rows. The disc reuses the existing `bx:image-add` glyph (Create Profile) on the standard icon disc, vectors bound to `color/text/primary`. Each row has one `ON_CLICK` -> `NAVIGATE` to Edit Profile (`1466:15934` desktop, `5702:8317` mobile), read back from each node. One row serves both the profile picture and the cover photo. The Unread badge on both feed frames changed from 14 to 15 (`5640:7916`, `5643:8036`). Lists: unread 14 -> 15, read 13 -> 14 on both frames.

OPEN (note `6812:29490`): the backend has no such notification type (B-214); rows are appended at the end like the Contest rows; the row does not say which image or give the reason (the reason is on Edit Profile); the Design Notes frame `5644:8023` was not edited.

## 4. (d) B-212: K6 tags reviewed against #412 item 5

Rule: keep `[COPY PENDING LEGAL REVIEW]` where a string makes a legal or safety promise; remove it from purely functional strings.

| # | String (K6 report section 6) | Decision | Why |
|---|---|---|---|
| 1 | `Only you can see this picture until it has been checked.` | **kept** | promise about who can see an image |
| 2 | `This picture wasn’t approved.` | tag removed | status of an outcome |
| 3 | `Reason: {reason from the reviewer}` | tag removed | shows the reviewer's text |
| 4 | `This picture is visible on your profile.` | tag removed | approved status (judgment call: it says the picture is visible, no promise) |
| 5 | `Cover photos are checked automatically before they appear on your profile.` | **kept** | promise about an automatic check |
| 6 | `Only you can see this cover photo until it has been checked.` | **kept** | promise about who can see an image |
| 7 | `This cover photo wasn’t approved.` | tag removed | status |
| 8 | `Reason: {reason from the reviewer}` | tag removed | as 3 |
| 9 | `This cover photo is visible on your profile.` | tag removed | as 4 |

The tag was removed from 12 nodes (6 strings, desktop and mobile): `6799:29397`, `6799:29398`, `6799:29413`, `6799:29414`, `6799:29456`, `6799:29471`, `6800:29378`, `6800:29379`, `6800:29393`, `6800:29394`, `6800:29432`, `6800:29445`. The 8 frames affected are `6799:29386`, `6799:29402`, `6799:29448`, `6799:29463`, `6800:29368`, `6800:29383`, `6800:29426`, `6800:29439`. Kept tags are untouched in the under-review frames and in every `Pictures (or Cover photos) are checked automatically...` hint. K6 notes updated: `6801:29313` (reason delivery now drawn as page plus notification; new tag sentence), `6801:29315`, `6801:29317` (crop drawn, upload dimensions still not decided). Note `6801:29316` moved up 15 px so its taller text does not overlap the frame below. The manifest (`docs/pending-copy-manifest.md`) is app strings only and was not touched; whether Figma-only tagged strings ever go there is not decided.

## 5. Strings to confirm

New tagged: none. The cover crop frames reuse the already tagged cover hint (kept under rule item 5). Untagged and functional, for a reviewer: `Crop your cover photo`, `Drag the picture to choose what shows. Your cover is cropped to the shape of the frame.`, `Drag to move`, `Zoom`, `Cropped preview`, `This is how your cover will look on your profile.`, `Save cover photo`, `Cancel`, and the notification row text above.

## 6. Standing audit (page `0:1`)

| | before | after |
|---|---|---|
| top-level nodes | 920 | 924 (+2 frames, +2 notes) |
| djb2 hash of the 920 original ids in order | 471247343 | 471247343 (unchanged) |
| `findAll` `6747:28894` | 773 | 773 |
| `findAll` `6799:29386` / `6800:29368` (text edits only) | 15 / 14 | 15 / 14 |
| `findAll` feed frames `5640:7815` / `5643:8003` | 354 / 268 (derived: after minus the two rows added) | 373 / 287 |
| new frames `6812:29354` / `6812:29396` | n/a | 36 / 36 descendants |

Paints: 39 + 39 on the crop frames, 7 + 6 + 7 + 6 on the notification rows, 1 + 1 on the notes; **0 unbound, 0 image fills**, 0 `brand/green-tint-28`, no new colours. 0 overlaps of any new top-level frame with any visible top-level node (strict bounding-box test against all 924). Screenshots: block label before and after; both crop frames; all four rows; before and after for the K6 frames except `6800:29439` before (that capture did not return); the "before" shots of the three cover frames `6800:29383`, `6800:29426` were reproduced by temporarily restoring the tag and removing it again (the final state has no tag; read back). Archived nodes: unchanged (nothing archived).

Two gotchas: a cloned frame's child that was moved into the clone and then its old container removed deletes the moved child with the container (move it out first); `node.screenshot()` inline returns at most about 5 images per call.

## 7. Register status lines (to route; `docs/build-register.md` not edited)

- B-218: `Figma pass M 2026-10-25 (figma-pass-m-report.md): 6747:28894 menu item set to 'Block christine001' and its header handle to '@christine001' (the viewed user, as on 6669:27188); the desktop Block confirmation 6655:27355 (6655:29578, 6655:29590) still names nelson_iheagwam, not changed; the rest of the register row's label list was not compared.`
- B-210: `Figma pass M: crop step drawn desktop 6812:29354 and mobile 6812:29396 (cover aspect ratio 796:192 / 390:120, zoom, preview, Save and Cancel); one crop vs one per breakpoint, zoom range and crop timing are OPEN (note 6812:29488).`
- B-211: `Figma pass M: rejected-image row drawn, unread and read, desktop (6812:29438, 6812:29451) and mobile (6812:29463, 6812:29476), linked to Edit Profile; badge 15; backend notification type is B-214.`
- B-212: `Figma pass M: K6 tags reviewed per #412 item 5: kept on 'Only you can see...' (picture, cover) and the automatic-check hints; removed from 'wasn't approved', 'Reason:' and 'is visible on your profile' (12 nodes, 8 frames).`
