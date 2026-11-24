# Share image

`public/share-image.png` (1200 x 630) is the picture social apps show when a soccernity.com link is pasted.
`share-image.html` is its source: navy background, the logo mark on a white rounded tile, the wordmark and the line "Where the whole game lives".

Regenerate (only if the logo or the tagline changes):

1. Replace the SVG inside `.tile` with `src/assets/icons/soccernity-logo-mark.svg`, with its opening `<svg ...>` tag set to `<svg viewBox="0 0 31.9995 31.9997" fill="none" xmlns="http://www.w3.org/2000/svg" class="mark">`.
2. The font is the self-hosted Montserrat 800 (`node_modules/@fontsource/montserrat/files/montserrat-latin-800-normal.woff2`), referenced by relative path.
3. Open the HTML in headless Chrome at a viewport of exactly 1200 x 630, device scale factor 1, wait for `document.fonts.ready`, and screenshot to `public/share-image.png`. Keep it under 300 KB.

The tags that point at it are emitted only when the site is indexable and `VITE_SITE_URL` is set (`vite-plugins/documentBasics.ts`).
