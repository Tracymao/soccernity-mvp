# Figma: withhold-card recovery wording aligned to Decision Log #480

Figma file `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Figma and docs only. No application code, legal text, docx or `docs/build-register.md` was changed.

## Why

Decision Log #480 (`backend/flagged-minor-recovery`, merged) means a minor whose guardian notices are withheld recovers two-factor through the ADULT route (link to their own email, password, 24-hour wait), not "pointed to Contact us and staff help them". Two sentences on the withhold card in `docs/figma-guardian-notice-withhold-report.md` were wrong.

## What changed (text only)

A page-wide search of all 38,256 text nodes for "pointed to Contact us" / "staff help them" found 7 nodes; 6 were edited.

| Frame | Node id | Was | Now |
| --- | --- | --- | --- |
| 2 Set dialog `6921:34878` | `6921:35064` | bullet 2 ended "The child is pointed to Contact us and staff help them." | "Guardian-assisted two-factor recovery is switched off. The child can still recover through the adult route: a link to their own email, their password and a 24-hour wait." |
| 3 Set dialog, reason required `6921:35065` | `6921:35251` | same | same new bullet |
| 4 ON `6921:35255` | `I6921:35303;6671:27492` | callout body "...recovery is off: the child is pointed to Contact us and staff help them. Consent emails are not affected." | "Guardian security and safety-action notices for this account are skipped silently. Guardian-assisted two-factor recovery is off: the child recovers through the adult route (a link to their own email, their password and a 24-hour wait). Consent emails are not affected." |
| 5 ON, review due `6921:35449` | `I6921:35497;6671:27492` | same | same new callout body |
| 6 Record review dialog `6921:35655` | `I6921:35703;6671:27492` | same (callout behind the dialog) | same new callout body |
| 7 Clear dialog `6921:35894` | `I6921:35942;6671:27492` | same (callout behind the dialog) | same new callout body |

Only the one sentence was replaced in each node (delete and insert at the sentence's own character range), so the rest of each string, including the trailing `[COPY PENDING LEGAL REVIEW]` in the dialog bullets, is byte-identical and the single text segment, font, size and fill are unchanged. The `[COPY PENDING LEGAL REVIEW]` chips (`Copy Tag`) on the cards and the inline tags in the dialogs and banner were not touched.

## Left alone, on purpose

- `6916:34767` (SECTION description, user 2FA recovery pass): its line "a minor with no confirmed guardian email is pointed to Contact Us" is about an unflagged minor with no confirmed guardian, which is still true under #480 (`no_guardian`). Not edited.
- The card line "While this is on, those notices are skipped silently and guardian-assisted two-factor recovery is switched off." (e.g. `6921:34928`) is still true; not edited.
- `docs/figma-guardian-notice-withhold-report.md` still quotes the old sentences (section 3 row 2, section 4). It is the historical report of the earlier pass and was not edited here; read it with this file.

## Layout effect

The longer sentences wrap onto one more line in the Set dialog (bullet text 96 to 112 px, dialog hugs 338 to 354 px on frame 2, 370 to 386 px on frame 3). The callout body stays at two lines (32 px) on frames 4 to 7. No node extends past a frame's bottom edge (0 overflow nodes on all six frames), and the screenshots show no clipping or overlap.

## Standing checks (Decision Log #404 item 14)

| Check | Before | After |
| --- | --- | --- |
| Top-level nodes on page `0:1` | 1,767 | 1,767 |
| Hash of top-level node ids | 2557224655 | 2557224655 |
| `findAll` count per affected frame (`6921:34878`, `35065`, `35255`, `35449`, `35655`, `35894`) | 192, 195, 187, 193, 212, 206 | 192, 195, 187, 193, 212, 206 |
| Visible solid paints / unbound (per frame) | 137/1, 139/1, 131/1, 136/1, 150/1, 145/1 | identical |

The one unbound paint per frame is the inherited Admin Shell `Rectangle 223` (Decision Log #199), unchanged. No text style, variable or colour was changed; nothing was added, archived or deleted.

## Screenshots

`docs/figma-withhold-recovery-wording-screens/`: `before-2-set-dialog.png`, `after-2-set-dialog.png`, `before-4-on.png`, `after-4-on.png`. Frames 3, 5, 6 and 7 carry the same two edits and were verified by reading back their text and counts, not by separate screenshots.

## Follow-ups (not done here)

- `apps/admin` `guardianNoticesCopy.ts` (`ALERT_BODY`, `WITHHOLD_BULLET_RECOVERY`) and its tests still carry the old sentences (noted in the `backend/flagged-minor-recovery` bullet); a `figma-to-code` pass should copy these new strings.
- The new sentences remain `[COPY PENDING LEGAL REVIEW]`.
