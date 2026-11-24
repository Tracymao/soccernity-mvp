# Social share image report (CH-H4)

Branch `feat/share-image`. Decision Log #564, build-register B-328 (Section 127). Built, awaiting founder verification.

## What was built
- `apps/web/public/share-image.png`: 1200 x 630, 41,876 bytes (limit 300 KB). Navy #282E65 background, the real logo mark on a white rounded tile, white "Soccernity" wordmark, and "Where the whole game lives" with "game lives" in brand green #7BB929. Viewed after rendering: nothing clipped.
- `apps/web/design/share-image.html` (source, logo SVG inlined) and `apps/web/design/README.md` (regeneration steps). Rendered in headless Chrome at scale 1; no new dependency.
- `apps/web/vite-plugins/documentBasics.ts`: when the site is indexable and VITE_SITE_URL is valid it emits og:image, og:image:type, og:image:width, og:image:height, og:image:alt, twitter:image, twitter:image:alt and twitter:card `summary_large_image`, with the absolute URL `<origin>/share-image.png`. Otherwise no image tags and twitter:card `summary`. The static twitter:card tag was removed from `index.html`.
- Test extended, including the PNG signature, 1200 x 630 and size check.

## Verification
- Plugin tests 7 passed; `tsc` and eslint clean; full web vitest 162 files / 2,108 tests passed.
- `npm run build:release`: exit 0, pending-copy check OK.
- Default build: noindex, twitter:card summary, no og:image or canonical, robots.txt `Disallow: /`, `dist/share-image.png` identical to `public/`.
- Indexable build with `VITE_SITE_URL=https://soccernity.com`: og:image and twitter:image are `https://soccernity.com/share-image.png`, 1200 x 630, alt set, canonical `https://soccernity.com/`.
- Indexable build without a URL: fails with the existing "VITE_SITE_URL is missing" message.
- `vite preview` of the default build served `/share-image.png`: 200, image/png, 41,876 bytes, identical to the source file.
- Decision Log docx: 563 rows before, 564 after; all earlier rows text-identical (python-docx).

## Records
Decision Log #564; register Section 127 and row B-328 (328 B-IDs = 41 + 287, 146 gap frames, W11 33); runbook step 8.10 notes the share image tags switch on with VITE_SITE_INDEXABLE and VITE_SITE_URL.

## Not done / notes
- Takes effect only at the launch gate; nothing is visible on staging while indexing is off.
- Real link previews (WhatsApp, X, LinkedIn) were not tested; they need the live URL.
- Register Section 7 has no row for #564 (same as #557 and #558).
- Playwright and CI not run.
