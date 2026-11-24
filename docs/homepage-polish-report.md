# Homepage polish report (CH-H3)

Branch `fix/homepage-polish`. Decision Log #563, register Section 126, B-327 (built, awaiting founder verification).

## Changes (apps/web)
- Featured Latest article with no cover: wrapper gets `home-featured__mediawrap--no-cover`; placeholder height 120px desktop, 96px at 600px and below. Cover case (300px), tag pill, card layout, CoverMedia.tsx, BlogPage and ArticleDetailPage unchanged.
- Pillar 1 body: "Much of the game is played outside any official record. Soccernity starts with the Sunday leagues, school pitches and informal teams that rarely get one."
- Amendment: section headline is now "So much of football happens where no one keeps the record." The forced line break is removed; same element, class and level.
- Tests: headline assertions updated, old headline and old pillar phrases asserted absent, new no-cover class test (present for null cover, absent with a cover).

## Verification
- `tsc --noEmit` 0; eslint clean; Vitest 162 files / 2,107 tests passed.
- `npm run build:release` exit 0; check:pending-copy: OK, no tagged text in the production builds.
- Screenshots (taken in real Chrome with the API intercepted during the PR; not committed to the repo): no cover media 120px at 1440, 96px at 390; cover 300px at both widths, same look as before; error case renders no featured block; no horizontal overflow (scrollWidth equals viewport). Headline wraps to three balanced lines at 390.
- Grep: old phrases appear only in the test absence assertions.

## Records and count fix
- Decision Log row #563 added; earlier rows text-identical (561 to 562 data rows checked).
- Register count was wrong: B-326 (W11) was never counted. Corrected to 327 B-IDs (41 with gap frames + 286 without): W9 59 (+B-327), W11 32 (+B-326), total 327. 146 gap frames unchanged.

## Notes
- A cover image that fails to load still shows the full-size tinted box (the class follows the data, not the load).
- Nothing differed from the prompt except the Decision Log and register numbers (latest were #562 and Section 125, not the numbers the prompt expected).
