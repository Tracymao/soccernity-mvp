# Blurred media: a minimum box size so the cover can always be pressed

Branch `frontend/blurred-media-min-size`, `apps/web` (CSS plus one attribute) and one Playwright spec. 2026-11-13.
Cause found by the QA launch-gate run (`docs/qa-launch-gate-full-run-report.md` section 4.3,
`e2e/tests/41-b061-blurred-media.spec.ts:203`). Founder decision 2026-11-13: fix the application.

## The defect

The blurred and revealed box (`.sensitive`) is `display: inline-block; max-width: 100%; overflow: hidden` and is sized
by its media. A very small picture or video (a 64 x 64 clip, a 40 x 40 picture) gives a box smaller than the cover
button (`.sensitive__cover`, `min-width: 162px`, 148 px at a viewport of 820 px or less). The box clips the button, and
the length chip (`.sensitive__duration`) sits on top of the part that is left, so a press never reaches the button.
The media stays hidden (the safe direction) but the viewer can never reveal it. The upload pipeline enforces no
minimum width or height, so production can produce such a card.

## Reproduction (before any edit)

* Real stack, original CSS, spec 41 test 2 (the video, 64 x 64 fixture): **failed**, Playwright "`<span class="sensitive__duration">`
  intercepts pointer events", then "`<article class="post">` intercepts pointer events", for the whole click timeout.
  Tests 3 to 10 were skipped by the serial describe.
* Real stack, original CSS, new test 8 (a 40 x 40 picture): **failed**, box height 40 against the 120 minimum.
* Static page (real `SensitiveMedia.css` and `MediaUpload.css`, Chrome, container `min(viewport - 40, 560)` px wide, the
  system sans font instead of Inter, so the cover is 162 x 59 / 148 x 55 here against 162 x 90 / 148 x 86 in the app;
  media given width and height attributes). Script: not committed (scratch). Numbers are `width x height`:

| Case | Viewport | Box before | Cover before | Cover inside box? | Chip overlaps cover? | Box after | Cover inside box? | Chip overlaps cover? |
|---|---|---|---|---|---|---|---|---|
| 64 x 64 video | 1280 | 64 x 64 | 162 x 59 | no (49 px outside on the left) | yes | 200 x 168 | yes | no |
| 64 x 64 video | 820 / 320 | 64 x 64 | 148 x 55 | no (42 px outside) | yes | 200 x 168 | yes | no |
| 40 x 40 picture | 1280 | 40 x 40 | 162 x 59 | no (61 px outside) | n/a | 200 x 120 | yes | n/a |
| 40 x 40 picture | 820 / 320 | 40 x 40 | 148 x 55 | no (54 px outside) | n/a | 200 x 120 | yes | n/a |
| 640 x 360 picture | 1280 / 820 | 560 x 360 | 162 x 59 / 148 x 55 | yes | n/a | 560 x 360 | yes | n/a |
| 640 x 360 picture | 320 | 280 x 360 | 148 x 55 | yes | n/a | 280 x 360 | yes | n/a |
| 1280 x 720 video | 1280 / 820 | 560 x 720 | 162 x 59 / 148 x 55 | yes | no | 560 x 720 | yes | no |
| 1280 x 720 video | 320 | 280 x 720 | 148 x 55 | yes | no | 280 x 720 | yes | no |

The normal-size boxes are identical before and after.

## The fix

`apps/web/src/pages/community/SensitiveMedia.css` (tokens only, no new colour) and one attribute in
`SensitiveMedia.tsx` (`data-kind={kind}` on the box, so the video rule needs no `:has()`).

* In the blurred and revealed states the box gets `min-width: min(100%, 200px)` and `min-height: 120px`, on the
  `--sn-green-tint-12` wash the loading and failed states already use. The media is centred in it at its natural size
  (the inner wrapper becomes a centring flex box with `min-height: inherit`); no upscaling, no stretching.
* A video box is `min-height: 168px`.
* The blur, `inert` and `aria-hidden` behaviour, the loading and failed states, all copy and accessible names are unchanged.

### The size, and why it is a default

**200 x 120 px** is the founder-given default for a picture, kept. **A video box is 168 px high, not 120: this is a
deviation from the stated 120 and a default of the Dev session, founder-veto-able.** Reason, measured in the real app
(spec 41 test 9, first attempt at 140 px): the cover is 162 x 90 px at desktop and 148 x 86 px at 820 px or less (icon
plus two text lines), it is centred, and the length chip is 43 x 20 px at `left: 12px; bottom: 12px`. The two do not
overlap only if the box is at least 90 + 2 x (12 + 20) = 154 px high; at 120 or 140 px the chip sits under the button
(7 px of overlap at 140). 168 px leaves a 7 to 9 px gap. The chip's own position (`left` and `bottom` 12 px, Figma G2)
was left alone on purpose. A picture has no chip, so it keeps the smaller box. The width is never larger than the
container (`min(100%, 200px)`).

Real-app rectangles after the fix (spec 41 annotations; the chip is in page coordinates):

| Case | Viewport | Box | Cover | Cover offset in box | Chip | Media (layout size) | Cover centre hits the button |
|---|---|---|---|---|---|---|---|
| 40 x 40 picture | 1280 | 200 x 120 | 162 x 90 | (19, 15) | none | 40 x 40 | yes |
| 40 x 40 picture | 820 / 320 | 200 x 120 | 148 x 86 | (26, 17) | none | 40 x 40 | yes |
| 64 x 64 video | 1280 | 200 x 168 | 162 x 90 | (19, 39) | 43 x 20 | 64 x 64 | yes |
| 64 x 64 video | 820 / 320 | 200 x 168 | 148 x 86 | (26, 41) | 43 x 20 | 64 x 64 | yes |
| 640 x 360 picture (normal) | 1280 | 640 x 360 | 162 x 90 | (239, 135) | none | 640 x 360 | yes |

After "Tap to view" the Hide chip lies wholly inside the box and receives a press, at 1280, 820 and 320 px (tests 8 and 9).

## Tests

* `e2e/tests/41-b061-blurred-media.spec.ts`: test 2 is untouched and now passes. New: test 8 (a 40 x 40 picture:
  box at least 200 x 120, cover inside the box and receiving a press at its centre, picture centred at its natural 40 px,
  Hide chip inside the box after reveal; at 1280, 820 and 320 px), test 9 (the small video: box at least 168 px high,
  cover inside, length chip inside the box and not touching the cover, Hide inside after reveal, player visible; same three
  widths), test 10 (a normal 640 x 360 picture: box exactly the picture, edge to edge, taller than 168 px). Supporting
  edits in the same file: `photo(w, h)` takes a size, `serveMedia` answers a `small` file with a 40 x 40 PNG, one more
  seeded post, a `geometry()` helper (the media size is read as layout size, because the blurred media is scaled by
  1.08). Tests 1, 3, 4, 5, 6 and 7 are unchanged and pass.
* Counts (own scratch Postgres on port 5544 and Redis on 6391, in throwaway Docker containers `blurmin-pg` and
  `blurmin-redis`; real Chrome, real API, one worker): **spec 41, 11 passed / 0 failed** (the old spec had 8 tests; one
  server check plus tests 1 to 7 plus the three new ones). Before the fix: test 2 failed (above) and test 8 failed.
  (An intermediate run at a 140 px video box failed test 9 on the chip overlap: that is what moved the video box to 168 px.)
* `apps/web` Vitest, folder `src/pages/community`: 206 tests, 0 failed. `npx tsc --noEmit` clean. `npm run lint` clean.

## Not run

* The full Playwright suite and every other spec (the QA reviewer runs them at the launch gate); the `apps/admin` and
  `services/api` suites; the whole `apps/web` Vitest suite outside `src/pages/community`; CI.
* No visual comparison with the Figma frames G1 to G3 beyond the screenshots in `docs/b061-blur-screens/` (new files for
  the small picture and the small video at 1280, 820 and 320 px). A small video box is now 200 x 168, which the frames do
  not draw (they draw one size).
* No change to the upload limits: the pipeline still enforces no minimum width or height.
* Not checked in Safari or Firefox; the CSS uses only `min()`, flex and attribute selectors.
