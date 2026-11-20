# Figma W9 pass: header avatar initials (B-230) and Activation confirmation (B-077)

Figma file `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Figma and docs only: no application code, schema, legal copy, Build Plan docx or `docs/build-register.md`. Decision Log #417 item 2, #394, #367, #468 (founder decisions 2026-11-04). Date: 2026-11-04.

## 1. What changed in Figma

### A. Header avatar initials (B-230)

| What | Node | Notes |
|---|---|---|
| New component set `Avatar - Initials` | `6959:46000` (at x 0, y 204000) | Variants `Has Unread=false` `6959:45993` (31 x 31) and `Has Unread=true` `6959:45996` (35 x 31, dot cloned from the existing Avatar set). TEXT component property `Initials` (default `AC`, key `Initials#6959:0`). |
| New navbar variant (desktop) | `6961:45993` `Property 1=header 4 — initials` | Added to the existing set `2824:4309`, at x 20, y 1330. Clone of `header 4` (`2838:3502`) with the photo avatar swapped for `Avatar - Initials` (instance `6961:46101`, 31 x 31). |
| New navbar variant (mobile) | `6961:46102` `Property 1=header 4 — mobile — initials` | At x 20, y 1440. Clone of `header 4 — mobile` (`5386:6576`); avatar instance `6961:46121` set to 31 x 31 (the photo instance was 32; the code draws 31 on both). |
| States and rule frame | `6962:45997` (x 300, y 204000) | Rule text, seven examples (photo, `AC`, `A`, `AB`, `WM`, `?`, unread dot) and instances of both new navbar variants in context. |
| Note | `6962:46177` `NOTE — B-230 header initials (W9)` | Decisions and SCOPE OPEN points (section 4). |

Set `2824:4309` now has seven values of `Property 1`: header 4, header 7, header 7 — mobile, header 4 — mobile, header 7 — mobile — menu, **header 4 — initials**, **header 4 — mobile — initials**. The five existing variants kept their ids, x and y (read back). Their instances are untouched, so the approved-picture header stays exactly as it was.

Overlay reactions were not carried by the clone, so they were set again and read back: desktop avatar `6961:46101` `ON_CLICK` -> `OPEN_OVERLAY` `2841:5361` (offset -111, 31, same as the original); mobile avatar `6961:46121` `ON_CLICK` -> `OPEN_OVERLAY` `5870:10689`.

**The account dropdown and the mobile drawer identity block were not changed** (#468).

**Initials rule drawn** (copied from `initialsFor` in `apps/web/src/layout/NavDrawer.tsx`, which the drawer already uses):
- split the name on whitespace, drop empty parts;
- no word: `?`; one word: its first letter; two or more words: first letter of the first word plus first letter of the last word;
- upper-case, never more than 2 characters, middle names ignored.

Drawn from existing tokens, no new colour, no new text style: circle fill `brand/green-tint` (`VariableID:5096:5`, bound; the circle is a clone of the drawer's initials avatar), letters `color/text/primary` (`5096:8`) in Montserrat SemiBold 12 set directly, as the drawer's letters are (that text has no text style). Montserrat SemiBold at 12 px: `AC` 18 px, `AB` 19, `WM` 26, `A` 9, `?` 7, and the widest pair `WW` 28 px inside the 31 px circle (tight: about 1.5 px each side).

### B. Activation confirmation (B-077) — the brief was partly stale

Read live before editing (frames `5108:6631` desktop and `5531:7544` mobile):
- "Go to my profile" is **already** "Continue registration" (W0 pass A, pass F1 A5; the subheading also says "Continue registration to finish setting up your profile" and keeps `[COPY PENDING LEGAL REVIEW]`).
- "Review privacy settings" is **already** drawn as an enabled outline button (opacity 1, no disabled treatment, no "Coming soon" text anywhere on either frame). The register row B-077 is stale on both points. The `SOON` pills on the three rows are a different thing (what switches on when registration finishes) and were left alone.

What was changed: **prototype links only** (read back from fresh handles). No line of text was changed, nothing was tagged or untagged.

| Button | Desktop | Mobile |
|---|---|---|
| Continue registration | `5114:6772` -> Create Profile desktop `1498:2303` | `5531:7612` -> Create Profile mobile `1629:2449` |
| Review privacy settings | `5114:6774` -> Settings — Privacy `6178:14437` (`/settings/privacy` exists in code) | `5531:7614` -> Settings — Privacy — Mobile `6185:14547` |

Note `6962:46178` `NOTE — B-077 Activation (W9)` records this next to the frames.

## 2. Checks

- Top-level nodes on page `0:1`: 1,296 before, 1,300 after (the component set, the states frame and two notes). The hash of the 1,296 original ids is unchanged (`4138406382`), so nothing was deleted or reordered.
- Paint audit on the new nodes: the component set and states frame carry one unbound solid paint, the unread-dot ring stroke cloned from the existing Avatar set (near-white `#FFFDFD`); it is now bound to `color/background/surface` (pure white), a negligible change in the new component only. The two new navbar variants have **0** unbound solid paints (the originals have 0 too; the only difference is the photo image fill, which the initials variants do not have). No `brand/green-tint-28`, no new colour, light mode only.
- 0 overlaps of the four new top-level nodes against the rest of the page; the two notes were moved to clear space and re-checked after their height was fixed.
- Fonts on new nodes: Montserrat only (the navbar instances' "Soccernity" wordmark is the existing Inter Bold).
- Screenshots (inline) of the new components, both navbar variants and the states frame were checked by eye.

## 3. Wording

No new wording. Nothing is newly tagged `[COPY PENDING LEGAL REVIEW]`; the existing tag on the activation subheading is untouched.

## 4. SCOPE OPEN (recorded, not decided)

1. **Which name the letters come from.** Register B-230 and #417 say the display name; since B-027 the public name is the username or "Soccernity member". #468 leaves this open. The frame draws the rule, not a source.
2. **Emoji and non-BMP characters.** The code takes the first UTF-16 unit of a word, so a name that starts with an emoji or a character outside the Basic Multilingual Plane would render a broken half-character. Not drawn.
3. **Pending or rejected picture.** The owner then sees initials, not the pending photo; B-036/B-037 decide.
4. **Picture versus initials is a code state.** The two states are separate values of `Property 1`; no "Has picture" property was added to the existing variants, so existing instances keep working. A future refactor could merge them.
5. **Logged-out header variants** have no avatar and need no initials variant.
6. **Privacy settings link at activation.** `/settings/privacy` is reachable at this point (before Create Profile) but several of its controls are disabled today; whether the link should appear only after Create Profile is not decided.

## 5. Follow-ups, fixed nothing outside the brief

- `apps/web` `Header.tsx` still draws an empty circle; the frontend leg of B-230 builds from the new variants (and must not use the drawer or dropdown, which are unchanged).
- Register rows B-230 (Figma leg done) and B-077 (wording and link already in Figma; the register text says otherwise) need a status line in the next docs PR. Not edited here, as briefed.
- Existing frames that embed `header 4` or `header 4 — mobile` still show the photo avatar; only the set got the new variants, and no frame was swapped.
- A flaky Figma/MCP connection rejected about nine of my calls (read-only reads and some screenshots) with "Invalid content from server"; each was repeated in a smaller form. No call changed the file before failing: I verified the top-level count and hash after the failures. One probe text node created in a failed call was confirmed removed (count unchanged).
