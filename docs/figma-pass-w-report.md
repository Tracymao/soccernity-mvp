# Figma pass W - suspension and reinstatement email frames reconciled to the built emails

Decision Log #494 (a), (b). Figma and docs only; no application code, schema, legal text, Build Plan docx, `docs/build-register.md` or `docs/pending-copy-manifest.md` changed. Routed to `figma-design-system` (existing frames).

The built emails are the source of truth. Pass U (`docs/figma-pass-u-report.md`) drew three email frames that drifted from them. Only those three frames were edited: `7046:63413` (suspension, generic reason), `7046:63427` (suspension, named category), `7046:63441` (reinstatement). Frames `7041` to `7045` and everything else were not touched.

Source file for every row below: `services/api/src/modules/auth/registration/email/registration-email.service.ts`.

## What changed (body text; node = the "Payments" text node of each frame)

| Frame / node | Old text | New text | Source line in the .ts file |
|---|---|---|---|
| `7046:63413` body `7046:63415` | `Hi [First name],` | `Hi,` | 915 (plain), 1281 (HTML): `Hi,` |
| same | `...suspended because of breaching our community rules.` | `...suspended for breaching our community rules.` | 916, 1282 (`suspended for ${data.reasonLine}`); generic line = `SUSPENSION_GENERIC_REASON_LINE`, 1522 |
| same | `You can no longer sign in, and all your signed-in sessions have been ended.` (joined to the previous sentence) | `You can't sign in while your account is suspended.` (own paragraph; no sentence about sessions) | 917, 1283 |
| same | `If you think this is a mistake, you can appeal. Use the Contact Us page and tell us which account you mean and why you are appealing: [link to Contact Us page]` | `If you think this is a mistake, you can appeal by contacting us through the Contact Us page.` ("Contact Us page" underlined as the link, as in the HTML body) | 918 (plain text, link appended after a colon), 1284-1286 (HTML: the words "Contact Us page" are the link). Link target `WEB_APP_BASE_URL/contact`, line 485 |
| same | `The Soccernity Team` sign-off | removed (the built body has no sign-off) | 915-918 and 1281-1286 end after the appeal sentence |
| `7046:63427` body `7046:63429` | same drift as above, reason `harassment or bullying` introduced by `because of` | same as above; reason line is the built `harassment_or_bullying` line: `harassing or bullying other people` | `SUSPENSION_REASON_LINES.harassment_or_bullying`, 1524; selected by `suspensionReasonLine`, 1531-1536 |
| `7046:63441` body `7046:63443` | `Hi [First name],\n\nYour Soccernity account has been reinstated. You can sign in again.\n\nThe Soccernity Team` | `Hi,\n\nThe suspension on your Soccernity account has been lifted. You can sign in again.` (no sign-off, nothing about points) | 921 (plain), 1289 (HTML) |

## Subject lines (title text of each frame; already matching, verified, unchanged)

| Frame / node | Text in frame | Source line |
|---|---|---|
| `7046:63413` title `7046:63414` | `Your Soccernity account has been suspended` | 488 |
| `7046:63427` title `7046:63428` | `Your Soccernity account has been suspended` | 488 |
| `7046:63441` title `7046:63442` | `Your Soccernity account has been reinstated` | 500 |

## Kept

- The `[COPY PENDING LEGAL REVIEW]` tag stays on every body (last paragraph, 10 px, as before). The suspension reason lines and both bodies are listed as OPEN in `docs/pending-copy-manifest.md`.
- Text styles (Roboto Regular 14 px, tag 10 px), text fill variable `5096:9` on every range, frame width 680.
- The Contact Us pointer sentence is shown as built in the HTML body (a link on "Contact Us page"). The plain-text body appends the full URL after a colon instead; a mockup cannot show both, the HTML body was chosen.

## Layout consequence

The frames use absolute layout. After the shorter text the body is 280 px tall (suspension) and 140 px tall (reinstatement); the footer group was moved up to keep its 40 px gap under the body, and the frame height reduced to keep the 56 px gap below the footer. Frame heights: `7046:63413` and `7046:63427` 657 to 629; `7046:63441` 545 to 489. Width, x and y of the frames are unchanged.

## Standing check (Decision Log #404 item 14)

- Top-level nodes on page `0:1`: 1,857 before, 1,857 after. djb2 hash of the top-level node id list: `2466419885` before and after (nodes added, removed or reordered: none).
- Node count inside each edited frame: 12 before, 12 after. Text nodes with changed characters: only the three body nodes above. No node deleted, no node created.
- Variable bindings: the fill binding of each body text range is `VariableID:5096:9` before and after (a before/after comparison of the fills JSON returned identical). 0 visible solid fills without a variable binding inside the three frames after the pass.
- Overlaps of the three frames with any other top-level node after the pass: 0.
- Not checked individually: the other 1,854 top-level nodes were not re-read; the unchanged id hash and the unchanged count are the evidence that none was added or removed. I did not take a per-node property snapshot of the whole canvas before the pass, so "no other node changed" rests on the fact that the only write operations I ran targeted these three frames and their children.

Screenshots: `docs/figma-pass-w-screens/` (`before-7046-63413-suspension-generic.png`, `after-7046-63427-suspension-named.png`, `after-7046-63441-reinstatement.png`). There is no after screenshot of `7046:63413`: it was verified by text read-back only, and it differs from `7046:63427` only in the reason line.

## Open, not decided

- The other six category reason lines (`hate_or_abusive_language`, `threats_or_violence`, `sexual_or_inappropriate_content`, `impersonation_or_fake_account`, `spam_or_scam`, `privacy_or_image_misuse`) are not drawn; only the generic and one named example are, as in pass U.
- Hard-coded `[First name]` greeting is gone; the built email never uses one for these two templates.
