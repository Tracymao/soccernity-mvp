# Web document basics (CH-H2)

Branch `feat/web-document-basics`. Decision Log #556, register Section 123, B-325.

## What was built
- `apps/web/vite-plugins/documentBasics.ts` (+ unit test): rewrites `index.html` and emits `robots.txt` (no `robots.txt` in `public/`).
- Default and every dev run: `<meta name="robots" content="noindex, nofollow">`, robots.txt `User-agent: *` / `Disallow: /`, no canonical, no og:url.
- `VITE_SITE_INDEXABLE` exactly `true`: no noindex, robots.txt `Allow: /`, canonical link and og:url from `VITE_SITE_URL` (origin plus `/`). Missing or non-https-origin (path, query, hash, credentials) makes the build fail.
- `index.html`: title unchanged, meta description, Open Graph (type, site_name, title, description), `twitter:card` summary, SVG favicon, 32px PNG, 180px apple-touch-icon, `theme-color` `#282E65` (brand navy; my choice).
- `render.yaml`: `VITE_SITE_INDEXABLE` ("false") and `VITE_SITE_URL` (`sync: false`) on the two web static sites only, with a comment that the founder sets both at the launch gate and a rebuild is needed.
- Records: Decision Log #556 (docx, earlier rows verified text-identical), register Section 123 and B-325, runbook one-page checklist line 8.10.

## Favicon artwork
The full header logo mark (`src/assets/icons/soccernity-logo-mark.svg`, green ball over navy bubble), copied to `public/favicon.svg` with sizing attributes removed. PNGs rendered with sharp. Judged readable at 32px.

## Builds
(a) default: exit 0, noindex, Disallow, no canonical. (b) indexable with `https://example.com`: exit 0, canonical and og:url `https://example.com/`, Allow. (c) indexable without a URL: exit 1 with a message naming `VITE_SITE_URL`. Serving build (a): `/robots.txt`, `/favicon.svg`, `/favicon-32.png`, `/apple-touch-icon.png` all 200 with correct types.

## Checks
- `sw.js` has no fetch handler or cache (push and notificationclick only), so it does not touch the new files.
- CSP `img-src 'self' data: blob:` plus the media host already allows same-origin icons; no change.
- lint, `tsc --noEmit`, `build:release`, `check:pending-copy` pass. `render-static-sites` and `env-completeness` specs pass (70). Full vitest: 2,090 of 2,091 passed; the one failure (`PostMedia.test.tsx` daily-limit focus) failed in two full runs under load and passes alone, with and without this change.

## Not matching / follow-ups
- No `og:image`: needs a design.
- A non-existent path still returns `index.html` with status 200 (SPA fallback); not changed.
- CH-H1 had not merged when this was written, so numbers are #556 / Section 123 / B-325; renumber if it lands first.
