# Figma gaps F (2026-11-24)

Figma and docs only. No code, tests, schema, register, Build Plan docx or CLAUDE.md were edited (CLAUDE.md deliberately not edited, per the brief; a status bullet is for a later docs PR). Figma file `weZWWqggy9j13eX8bhFgs6`, page `0:1`. Screenshots in `docs/figma-gaps-f-screens/`.

## Part 1: D13 body redrawn to match the code

Frame D13 `7080:68021` (admin Suspected illegal imagery, restricted state). Node `I7080:68195;6671:27492`, edited in place, node id and text style kept.

Old body:
> This record involves a child. Only child-safety-vetted admins can open it.

New body, copied from `VettingRestrictedNotice` in `apps/admin/src/pages/moderation/moderationShared.tsx` (› is U+203A, apostrophe is U+2019):
> This action requires a child-safety-vetted admin (Settings › Roles). The server rejected it. Nothing was changed. You don’t currently have that clearance; ask a superadmin to review your vetting status if you believe this is wrong.

Notes frame `7080:68387`: only the sentence about D13's wording was changed (node `I7080:68393;6671:27526`). It no longer says the body is my wording or unverified; it says the body matches the code. Screenshot: `d13-restricted.png`.

## Part 2: 404 page proposal (drawn, NOT built, NOT approved)

Four frames on page `0:1`, built from the canonical footer and navbar variants (instances), Montserrat and tokens only, no new colour:

| Frame | Id |
|---|---|
| Desktop, logged in (F-1) | `7141:70207` |
| Mobile, logged in (F-2) | `7141:70548` |
| Desktop, logged out (F-3) | `7141:70383` |
| Mobile, logged out (F-4) | `7141:70635` |
| Notes — 404 page (F) | `7142:70445` |

Content: "404", heading "We can’t find that page", a short line ("The link may be wrong, or the page may have moved. Here are some places to go instead."), a "Back to home" button, and Sports Hub and Contact us links. Prototype links: Sports Hub and Contact us are linked to their frames; "Back to home" is NOT linked (the home destination differs by login state and is a founder call; the brief allows leaving it).

Screenshots: `404-desktop-in.png`, `404-desktop-out.png`, `404-mobile-in.png`, `404-mobile-out.png`.

### Is NotFoundPage reused?
Today `apps/web/src/pages/NotFoundPage.tsx` shows "Page not found" with a "Back to home" link under the site footer. If this proposal is approved, `NotFoundPage.tsx` would change and the copy is new. The existing profile and post not-found frames (`6738:30391`, `6738:30526`, `7015:58735`, `7015:58744`) were NOT edited. Whether the code keeps reusing `NotFoundPage` for those states (they must stay identical to a missing page) is OPEN for the founder.

## Standing check
Top-level nodes on `0:1`: 1,951 before, 1,956 after (4 frames + 1 Notes frame). Hash (djb2 over ordered top-level ids) of the original 1,951 ids: `2265530953` before and after, unchanged. Nothing deleted. 0 overlaps. The only unbound paint is the inherited Admin Shell `Rectangle 223` (Decision Log #199).

## Not verified
- Layout was checked on screenshots of desktop logged in and mobile logged out only; the other two frames were generated the same way but not compared by eye.
- Footer links inside the cloned footers were cleared, not rewired.
- Contrast was not measured.
- Nothing was run (no tests, build or CI); no Decision Log row or register line was added.
