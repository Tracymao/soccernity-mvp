# Figma: profile pictures and cover photos in the admin Media review queue (B-037 design half)

Decision Log #468. Figma file `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Figma and docs only: no application code, schema, legal copy, Build Plan docx or `docs/build-register.md`.

## What was drawn

Seven new 1440 x 1184 desktop frames and one notes frame, in a clear band below the whole canvas (`y 207600`; notes at `x -1200`, matching pass Q). Each is a clone of a pass Q frame, so the Admin Shell, F2 Pill, Button, Callout, Banner and Field components and all their bindings are reused. No new colour; Reject stays navy. The pass Q originals were not edited or moved.

| New frame | Id | Cloned from |
|---|---|---|
| Queue — Mixed (profile images) | `6972:46142` | queue `6851:29675` |
| Item — Profile picture | `6972:46346` | item `6852:30003` |
| Item — Cover photo | `6972:46516` | item `6852:30003` |
| Item — Already decided — Profile picture | `6972:46686` | already decided `6852:30658` |
| Reject dialog — Profile picture — Reason required (empty) | `6972:46863` | `6852:30985` |
| Reject dialog — Profile picture — Reason entered | `6972:47057` | `6852:31327` |
| Reject dialog — Cover photo — Reason entered | `6972:47248` | `6852:31327` |
| Notes — B-037 (SCOPE OPEN) | `6973:47059` | notes `6853:30622` |

Changes against the originals:

1. **Queue.** Five rows: User report / Video, Automatic check / **Profile picture**, Automatic check / **Cover photo**, User report / Picture, Automatic check / **Profile picture** with AGE **“—”** (upload time unknown). The pending pill (“27 pending”), the statistics card and the footer are unchanged.
2. **Item view, profile picture** (`6972:46346`): title “Review profile picture”, tag and TYPE “Profile picture”, “Used in” = “Profile”, a square 380 x 380 preview (the avatar already in the file’s Admin Shell, reused). **Cover photo** (`6972:46516`): “Review cover photo”, a wide 620 x 150 preview (about 796:192). In both, the “Automatic check” heading, the Suggestive / Violence / Nudity percentage rows and their helper line are removed and replaced by one Callout (`Tone=Info, Bar=Full`): “The automatic check was unsure about this picture, or could not run. Look at the picture and decide.” Approve and Reject are as drawn.
3. **Already decided** (`6972:46686`): the Banner reads “Another moderator approved this profile picture 3 minutes ago. There is nothing more to do here.” Buttons disabled as in pass Q.
4. **Reject dialogs:** title “Reject this profile picture?” / “Reject this cover photo?”, body “Say why this profile picture is being rejected. The uploader sees this reason.”, confirm button “Reject profile picture” / “Reject cover photo”. The reason field, error state and entered state are as in pass Q.

## Wording and tags

- The reject dialog body names who sees the reason, so it keeps the `[COPY PENDING LEGAL REVIEW]` layer-name tag pass Q gave the picture version.
- The Callout line and every other new label (TYPE values, “Review profile picture”, “Review cover photo”, the dialog titles and buttons) are plain functional wording and are not tagged (Decision Log #412 item 5). No consent text was invented.
- `docs/pending-copy-manifest.md` is not changed: these are Figma frames, and the manifest covers strings in code.

## SCOPE OPEN (also on the canvas notes frame)

- Whether “—” in AGE sorts first or last.
- Whether the statistics card should ever split post media from profile images.
- Whether, if the automatic check later stores category labels for profile images, the percentage box should return.
- Whether the reviewer should see the circle crop of an avatar and the cropped cover (the frames show the raw upload; the sample avatar is an image already in the file).
- The already-decided state for a cover photo is not drawn separately (identical but for the noun).
- The child-safety-vetting rule for a minor’s item (B-258) applies to profile items too; no restricted state is drawn.
- How the reason reaches the uploader (the existing rejected-image notification, pass M) is not redrawn here.

## Standing check

- Top-level nodes on `0:1`: 1,308 before, 1,316 after (the 8 new frames). The 1,308 original nodes are unchanged; a hash of their ids after the pass is `2067615236` (no before-hash was taken, so this is by count only).
- Paints: each cloned frame has the same single unbound solid as its pass Q original (the inherited Admin Shell `Rectangle 223`, Decision Log #199); the notes frame has 0. Nothing newly authored is unbound.
- Overlaps against every other top-level node: 0.
- Nothing deleted or archived outside the new clones (the percentage rows were removed from the clones only).
- Each new frame was screenshot-compared with the original it extends (queue `6851:29675`, item `6852:30003`, dialog `6852:31327`); layout, spacing and tokens match, and only the intended text and the preview size changed.

Not done: the code (`apps/admin` media review does not yet draw profile items); no prototype links were added.
