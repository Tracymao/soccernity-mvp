# Security headers and static-site CSP audit

Branch `security/api-security-headers`, 2026-10-28. Decision Log "API security headers" (#420) and build-register row B-243, as found on `origin/main` `4163f6f`.

**Part 1 (API headers) is built. Part 2 (static-site CSP) is a report, with one founder-approved frontend change: Stripe.js now loads only on the card step (finding 2).** Everything else in Part 2 is report only. The requirement for the static sites is recorded on B-179; the headers for the two static sites are applied at the host at the launch gate (B-090), not in this PR.

## 1. What was built (services/api)

- `helmet@8.3.0` added to `services/api` (the lockfile gains only that package).
- `src/security-headers.ts` builds the config; `src/main.ts` registers it **before** `enableCors`, so CORS pre-flights and 404s carry the headers too.
- Config: CSP `default-src 'none'; frame-ancestors 'none'`; HSTS `max-age=31536000; includeSubDomains` **only when `NODE_ENV=production`**; `Referrer-Policy: no-referrer`; `X-Powered-By` removed; helmet's other defaults left on (`X-Content-Type-Options: nosniff`, `X-Frame-Options`, COOP, ...). Note for later editors: in helmet, `xPoweredBy: false` means "do not remove the header"; the default (on) removes it.
- **`Cross-Origin-Resource-Policy` is left at helmet's default (`same-origin`).** Checked: no API route serves media bytes (no `StreamableFile`, `res.send/sendFile/end`, byte responses via `@Res()`, `ServeStatic` or `express.static`; the `@Res({ passthrough: true })` uses only set a status). User media is served from the bucket's public origin (`S3_PUBLIC_BASE_URL`); the admin review view link is a 5-minute signed link on the S3 endpoint. Neither goes through the API. CORP only affects `no-cors` loads, so JSON read through CORS by the two apps is unaffected. If a route ever serves media bytes, that route (not the whole API) needs `cross-origin`.
- CORS allow-list untouched (B-245 adds credentials later).
- `src/security-headers.spec.ts` (5 tests): headers on `/health` and on a 404 in production; HSTS absent outside production; an allowed origin is still echoed, an unlisted origin still gets no `Access-Control-Allow-Origin`, and no `Allow-Credentials`; headers present on a CORS pre-flight. The spec registers helmet then CORS in the same order as `main.ts`.
- Verified: `security-headers`, `cors-options`, `trust-proxy`, `validate-runtime-env`, `env-completeness` and `write-route-guards` specs: 6 suites / 151 tests, 0 failures. `tsc --noEmit`, eslint on the touched files and `nest build` clean. The full mocked and e2e suites were not re-run (only `main.ts` changed among existing files, and no test loads `main.ts`).

## 2. Static-site CSP audit (apps/web, apps/admin)

Target (Decision Log #420): `script-src 'self'`; `connect-src` the API origin and the object-store S3 endpoint origin; `img-src` / `media-src` the public bucket origin (`S3_PUBLIC_BASE_URL`) for apps/web, and for apps/admin also the S3 endpoint origin; no `unsafe-inline`.

**Method.**

- (a) Source and built-output search (`apps/*/src`, `apps/*/dist` from the current lockfile build) for inline scripts, `style` attributes, `eval`/`new Function`, `innerHTML`, `<style>`, external origins, `data:`/`blob:`, iframes, workers and sockets.
- (b) Empirical: both `dist` folders were served from a throwaway static server with the target CSP as a response header and loaded in real Chrome (`channel: chrome`), collecting `securitypolicyviolation` events. Routes: web `/`, `/login`, `/signup`, `/blog`, `/sports-hub`, `/terms`, `/privacy`, `/contest`, `/guardian-consent/confirm?token=x`, `/settings/privacy`; admin `/login`, `/`.
- The API was not running, so API calls failed as network errors, not CSP errors. Pages that need a session or a live API (composer, review queue, the Stripe Payment Element) were audited from source only, not exercised. The script lived in the session scratchpad and is not committed.

### Findings

**1. Stripe.js was requested on every page load, not only on the card step (web) -- before finding 2's fix.** `CardVerificationPanel.tsx` imports `loadStripe` from `@stripe/stripe-js`; that package injects `https://js.stripe.com/dahlia/stripe.js` as soon as the module is imported, and the app ships one bundle (about 926 KB, no route splitting). Observed on all 10 web routes. `script-src 'self'` **blocks it on every page** (violation `script-src-elem` for `https://js.stripe.com/dahlia/stripe.js`), and the guardian card verification step would not work.
Needed (Stripe's CSP guide, fetched 2026-10-28): `script-src` `https://js.stripe.com` `https://*.js.stripe.com`; `frame-src` the same two plus `https://hooks.stripe.com`; `connect-src` `https://api.stripe.com`. With these allowed there were 0 violations on all 10 routes. The origins are still needed for the card step after finding 2; they are no longer needed for other pages to load.

**2. Stripe.js now loads only on the card step (web). FIXED, founder-approved 2026-10-28.** `CardVerificationPanel.tsx` imports `loadStripe` from `@stripe/stripe-js/pure` (loads Stripe.js only when `loadStripe()` is called, which `start()` does after the guardian chooses to start the card step) instead of the default entry. The `Stripe` type is a type-only import from the default entry (erased at build time; `/pure` exports only `loadStripe`). `CardVerificationPanel.test.tsx` mocks the new path. Re-verified in Chrome after rebuilding: with **no** Stripe origin in the CSP, all 10 web routes show 0 violations (the loader string remains in the bundle but nothing runs it). The card step itself was not exercised in a browser (it needs a live API and Stripe keys); the Stripe origins in finding 1 are still required for it.

**3. Admin loads Google Fonts (admin).** `index.html` has `<link href="https://fonts.googleapis.com/css2?family=Montserrat...">` plus preconnects to `fonts.googleapis.com` and `fonts.gstatic.com`. The web build loads no web fonts. Without an allowance the stylesheet is blocked (`style-src-elem` violation observed on both admin routes) and the console falls back to system fonts. Needed: `style-src` `https://fonts.googleapis.com`; `font-src` `https://fonts.gstatic.com`. With these, 0 violations. Alternative: self-host the font and need neither.

**4. `data:` image URIs (web, admin).** Vite inlines small imported SVGs: 29 `data:image/svg+xml` strings in the web bundle and 10 in admin (the admin build is one JS and one CSS file, so all its icons are inlined). Admin uses them for CSS `mask-image: url(...)` on the sidebar icons, which is governed by `img-src`. Needed: `img-src` `data:` (or `build.assetsInlineLimit: 0`, not changed here). No script risk.

**5. `blob:` image URLs (web).** `CoverCropDialog.tsx` and `useMediaUploads.ts` create `URL.createObjectURL(file)` previews shown in `<img>` (image previews only; no `blob:` video). Needed: `img-src` `blob:`.

**6. Upload progress (web).** `postMedia.ts` `putFile()` uses `XMLHttpRequest` and PUTs to the signed link the API returns, which is on the S3 endpoint. `connect-src` covers XHR, but neither `'self'` nor the API origin includes the S3 endpoint. Needed: `connect-src` the **S3 endpoint origin** (the host of `S3_ENDPOINT`; the client signs path-style when it is set, so that origin hosts the bucket). The R2 bucket CORS rule allowing `PUT` from the web origin is a documented human step in `docs/deployment.md` (the post-media paragraph) and is a separate control from CSP; both are needed.

**7. Progress bar and other `style` props are fine (web, admin).** `MediaUploadTray.tsx` sets `style={{ width: \`${percent}%\` }}`; there are 35 style props in web, 6 in admin, plus `root.style.setProperty` for theme variables. React applies these through the CSS object model. Confirmed in Chrome under the target CSP: `el.style.width = '37%'`, `style.setProperty` and `style.maskImage = url(data:...)` were applied with no violation, whereas `setAttribute('style', ...)` was blocked (the width stayed `auto`). No app code uses the attribute form: no `setAttribute('style')`, `cssText`, `innerHTML`, `dangerouslySetInnerHTML`, `<style>` element or `adoptedStyleSheets` in either `src`. The one `createElement("style")` in the web bundle is React 19's own `<style precedence>` resource hoisting, which no app code uses. Nothing needed.

**8. Images and video from storage.**
- web: avatars, cover, post images and videos (`PostMedia.tsx`, `FinalWeekCarousel.tsx`, `ContestVotingPage.tsx`, `VideosCarousel.tsx`), blog cover (`CoverMedia.tsx`).
- admin: `MediaReviewItemPage.tsx` `<img>` / `<video>` on the 5-minute signed link (`viewUrl`) on the S3 endpoint, and `MediaPreviewPage.tsx` `<video src={media.url}>` for the media library.
- Needed: web `img-src` / `media-src` the `S3_PUBLIC_BASE_URL` origin; **admin needs the S3 endpoint origin as well**, because the review link is on the endpoint, not the public base.

**9. The public base is not set yet.** Until `S3_PUBLIC_BASE_URL` is set, stored URLs are `<endpoint>/<bucket>/<key>`, which on R2 is the authenticated endpoint and not publicly readable (existing note in `.env.example`). `MediaAsset.url` rows written before it is set keep that form. If the CSP is built from `S3_PUBLIC_BASE_URL` only, such a URL is both unreadable and CSP-blocked. Set `S3_PUBLIC_BASE_URL` at the launch gate before the first upload, and give the static-site build both origins.

**10. Legacy media URLs on any host (web).** `Post.mediaUrls` accepted any URL before W14 (Decision Log #419). Any such post would be blocked by a bucket-only `img-src` / `media-src`. None is live; recheck if old posts are ever imported.

**11. Default API origin (web, admin).** Each `api/*.ts` falls back to `http://localhost:3000` when `VITE_API_BASE_URL` is unset. A build without it would need `connect-src http://localhost:3000` (and would not work anyway). `connect-src` must name the https API origin from `VITE_API_BASE_URL` at build time.

**12. No inline scripts, no `eval`, no other external origin (web, admin).** Source and built `index.html` contain only `<script type="module" src="/assets/...">` and a `<link rel="stylesheet">`. No `eval`, `new Function`, string `setTimeout`, iframe, embed, worker, WebSocket, `EventSource`, `sendBeacon`, form `action`, `window.open` or `location.href =` in `src`. The other `https://` strings in the bundles are documentation or XML-namespace constants in libraries (`w3.org`, `react.dev`, `reactrouter.com`, Stripe docs), not loaded. There is no `url(...)` or `@font-face` in the built CSS. Nothing needed.

**13. `frame-ancestors` cannot be set by a `<meta>` tag.** Browsers ignore it there, so CSP and `frame-ancestors 'none'` must be response headers from the static host on both Render static sites.

### Recommended static-site policies (to apply as response headers at the launch gate)

apps/web (the Stripe origins are for the card step only):

```
default-src 'none'; base-uri 'none'; object-src 'none'; form-action 'self'; frame-ancestors 'none';
script-src 'self' https://js.stripe.com https://*.js.stripe.com;
style-src 'self';
img-src 'self' data: blob: <S3_PUBLIC_BASE_URL origin>;
media-src 'self' <S3_PUBLIC_BASE_URL origin>;
font-src 'self';
connect-src 'self' <API origin> <S3 endpoint origin> https://api.stripe.com;
frame-src https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com
```

apps/admin:

```
default-src 'none'; base-uri 'none'; object-src 'none'; form-action 'self'; frame-ancestors 'none';
script-src 'self';
style-src 'self' https://fonts.googleapis.com;
img-src 'self' data: <S3_PUBLIC_BASE_URL origin> <S3 endpoint origin>;
media-src 'self' <S3_PUBLIC_BASE_URL origin> <S3 endpoint origin>;
font-src 'self' https://fonts.gstatic.com;
connect-src 'self' <API origin>;
frame-src 'none'
```

`'self'` is the static site itself. Admin uploads go through the API (`POST /admin/media/upload`), not straight to storage, so admin `connect-src` does not need the S3 endpoint; admin `img-src` / `media-src` do (finding 8).

### What this audit did not cover

- Pages that need a signed-in session or a running API (composer upload, review queue, the Stripe Payment Element mounted inside the guardian card step) were audited from source and Stripe's documented origins, not exercised in a browser. The Payment Element renders in Stripe's own iframe; Stripe's guide lists no `style-src` allowance for plain Stripe.js / Elements (the SHA in the guide is for Connect embedded components, which the app does not use).
- Stripe's origins are as fetched on 2026-10-28; recheck them at the launch gate.
- This is not an XSS review of the app, and it does not cover any future analytics or browser Sentry SDK (neither is in the web or admin bundles today; `SENTRY_DSN` is API-only).
- The Vite dev server injects an inline preamble and is not covered; the policy is for the production build.

### Open points for the founder (not decided here)

1. ~~Load Stripe.js only on the card step~~ Decided yes and done (finding 2).
2. Self-host the admin Montserrat font and drop the two Google origins, or allow them.
3. `assetsInlineLimit: 0` (drops `data:` from `img-src`) or keep `data:`. Recommendation: keep `data:`; it carries no script risk.
