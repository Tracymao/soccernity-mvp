# Figma gaps E: VerifyEmail pending-consent wording

Figma and docs only. No code, tests, schema, Build Plan docx or register changed. File `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Date 2026-11-24. Decision Log #38.

## What changed

Text edited in place on three existing frames. Every frame and node id is unchanged. Text styles are unchanged (one font segment per node before and after).

| Frame | Node | Old | New |
|---|---|---|---|
| G1-1 desktop `7114:68249` | Subheading `7114:68266` | Your email address is confirmed, but your account is still waiting on your guardian’s approval. It stays restricted until they approve it. | Your email address is confirmed. Your account stays restricted until your guardian approves it. |
| G1-1 | Row 1 body `7114:68275` | You will not be asked to verify this address again. | You won’t be asked to verify it again. |
| G1-1 | Row 2 body `7114:68281` | Your guardian has not yet approved your account. Some features stay switched off until they do. | Profile, direct messages and posting stay switched off until your guardian approves. |
| G1-2 mobile `7114:68291` | Subheading `7114:68308` | (same old text as G1-1) | (same new text) |
| G1-2 | Row 1 body `7114:68317` | (same) | (same) |
| G1-2 | Row 2 body `7114:68323` | (same) | (same) |
| G1 Notes `7115:68249` | First note body `I7115:68250;6671:27526` | CONSERVATIVE INTERIM DESIGN (Decision Log #38). Built as the code ships it in VerifyEmailPage.tsx, status verified-pending-consent. Not founder-approved; replace wholesale if a real design is drawn. | Approved by the founder on 2026-11-24 with these wording changes (Decision Log #38); the wording matches VerifyEmailPage.tsx after the matching code change merges. |

Not touched: the heading, card title, row titles, row 3 and its body, the button label, the button's prototype link, the other three notes (including the one about stale code comments), and all other frames.

## Checks

- Re-read after the edit: all seven strings equal the brief's text exactly (curly apostrophes).
- Standing check: top-level nodes 1,951 before and after; djb2 hash of the ordered top-level ids `1748077461` before and after; nothing created or deleted.
- 0 overlapping text boxes and 0 text outside the frame on G1-1 and G1-2; 0 unbound solid fills on all three frames.
- Screenshots (maxDimension 700), one per frame: `docs/figma-gaps-e-screens/G1-1-desktop.png`, `docs/figma-gaps-e-screens/G1-2-mobile.png`. Subheading and row 2 fit without clipping; on mobile the subheading wraps to three lines and row 2 to three lines inside the card.

## Not verified and open

- The Notes frame was not screenshotted; its text was read back and its auto-layout height was unchanged (64 px body).
- On mobile the `Content Column` of G1-2 extends 20 px below the frame bottom (clipping is on). I changed no geometry, so this predates the pass; the button is visible in the screenshot but sits at the very bottom edge. Not fixed here.
- The code change that makes `VerifyEmailPage.tsx` match this wording is a separate PR; until it merges the frames and the page differ.
