# Static-site hosting definitions (B-179, B-088) — report

Branch `infra/static-site-hosting-definitions`, 2026-11-14. Decision Log #409, #420, #422, #437, #449, #450, #462 (a).

**Scope.** Repo files only: `render.yaml`, `docs/deployment.md`, and two spec files. Nothing was imported to Render, no
account, domain, DNS or Cloudflare was touched, no secret or key value is in any file, no dependency was added, the API's
behaviour is unchanged, `check:pending-copy` is unchanged, and no existing test was weakened. Merging creates no Render
service.

## Changes, file by file

### `render.yaml`
- Four new static sites appended (`type: web`, `runtime: static`): `soccernity-web-staging`, `soccernity-admin-staging`
  (branch `staging`) and `soccernity-web`, `soccernity-admin` (branch `main`), matching the API services' branches.
- Each has: `buildCommand` (from the repo root), `staticPublishPath` (`./apps/<app>/dist`), `envVars` with
  `VITE_API_BASE_URL` as a plain value, a `routes` rewrite `/*` to `/index.html`, and a `headers` list.
- **No `region` and no `plan`** on the static sites: Render documents both as unsupported for static sites.
- The API services' `WEB_APP_BASE_URL` and `ADMIN_APP_BASE_URL` changed from `sync: false` to plain values equal to the final
  https origins (staging: `https://staging.soccernity.com`, `https://admin.staging.soccernity.com`; production:
  `https://soccernity.com`, `https://admin.soccernity.com`). They are no longer prompted for at import.
- Header comment updated to name the static sites; a banner explains that `domains:` is deliberately not listed.
- CRLF line endings kept.

### `services/api/src/env-completeness.spec.ts`
- `renderKeysPerService()` now skips chunks with `runtime: static` (a parser change of one `.filter` plus a comment). Every
  assertion is unchanged: it still expects exactly two API services with identical variable sets. No exemption was added.

### `services/api/src/render-static-sites.spec.ts` (new)
Text-based guard (no YAML dependency). For all four sites it checks: static runtime, branch equal to its environment's API
service, no `region`/`plan`/`startCommand`, `staticPublishPath`, build command (production `build:release`, staging the plain
workspace build with no pending-copy check), the `/*` to `/index.html` rewrite, `VITE_API_BASE_URL` equal to the decided API
origin **and** to the API origin in `connect-src`, the four always-on headers with their values, HSTS on production only, a
strict CSP (deny-by-default, no `unsafe-inline`/`unsafe-eval`, self-only style and font, no font CDN), web-specific Stripe,
`blob:`/`data:`, storage and `worker-src` entries plus `/sw.js` `Cache-Control: no-cache`, admin-specific absence of Stripe,
frames and `/sw.js`, and storage origins. It also checks that the API's two origin variables equal the sites' origins, that
only the two production sites use `build:release`, and that `S3_ENDPOINT`, `S3_PUBLIC_BASE_URL`, `WEB_APP_BASE_URL`,
`ADMIN_APP_BASE_URL` and `VITE_API_BASE_URL` appear in the `.env.example` files and in `docs/deployment.md`, and that the
doc has a section per site and a "NOT verified" statement. Mutation check: changing one publish path and removing HSTS made 4
tests fail; the file was restored.

### `docs/deployment.md`
Only insertions (164 added lines, 0 removed): a new section **4b. Static sites** (what is defined, build command, publish
directory, rewrite, headers and CSP, build-time variable, staging vs production, a subsection per site, manual steps that stay
human, inputs for the runbook, and a "What is NOT verified" list), plus three dated "Update 2026-11-14" notes where older text
is now out of date (step 3's "two services", the `WEB_APP_BASE_URL`/`ADMIN_APP_BASE_URL` bullets, and the `/sw.js`
subsection that said no static-site definition exists). CRLF kept.

## Settled choices (each a founder-veto-able DEFAULT)

1. **Pending-copy gate.** Production sites build with `npm run build:release` (both apps, then `check:pending-copy`);
   staging uses the plain workspace build. Why: the gate is a property of the release, so both production sites fail together
   while any `[COPY PENDING LEGAL REVIEW]` text would ship, while staging can be stood up and tested before counsel clears
   anything. Consequence: the production sites cannot deploy from `main` until counsel clears the 246 tagged places.
2. **Headers live in `render.yaml`**, movable to the Cloudflare proxy if B-251 is built (check for duplicates if both set one).
3. **R2 wildcards** (`https://*.r2.cloudflarestorage.com` for the S3 endpoint, `https://*.r2.dev` for the public bucket) stand in
   for `S3_ENDPOINT` and `S3_PUBLIC_BASE_URL` because Render cannot interpolate variables and neither exists yet. They are
   broader than intended; tighten to the exact hosts at the gate.
4. **HSTS on production only** (`max-age=31536000; includeSubDomains`); staging has none because HSTS is sticky.
5. **Permissions-Policy** `camera=(), microphone=(), geolocation=(), usb=()` (nothing in either app uses them).
6. **`Referrer-Policy: no-referrer`**, matching the API.
7. **The API's origin variables are single-sourced in `render.yaml`** (plain values), kept equal to the sites by the new spec.
8. **No `domains:` entries**: domains, DNS and the proxy are founder steps; until then the host-only same-site cookie does not
   work on the `onrender.com` addresses (B-249; item (a) of B-267).
9. **No `NODE_VERSION` pin.** The root `engines` is `>=22.22.0` with no upper bound; the runbook inputs list says to decide.
10. **Admin CSP allows both R2 hosts** in `img-src`/`media-src` (the review queue plays a signed link on the S3 endpoint);
    web allows the public bucket host for media and the S3 endpoint only in `connect-src` (the upload PUT).

## Findings from the CSP audit, re-checked against the code
Stripe loads only on the guardian card step (`@stripe/stripe-js/pure`), so it is allowed on web only; both apps self-host
their fonts (`@fontsource`), so no Google origin; `data:` and `blob:` are needed for web images; `worker-src 'self'` is needed
for `/sw.js`; React inline `style` props need no `unsafe-inline`; `frame-ancestors` must be a header, so it is in the header
list, not a meta tag.

## Verification (measured)
- `services/api`: `render-static-sites.spec.ts`, `env-completeness.spec.ts` and `write-route-guards.spec.ts`: 3 suites / 123
  tests passed, 0 failures; eslint on the two spec files, `tsc --noEmit` and `nest build` clean.
- `render.yaml` parsed with js-yaml: six services (two API with 120 env vars each, four static with one env var and 5, 4, 6
  and 5 headers).
- Staging build command (`npm run build --workspace=apps/web` and `--workspace=apps/admin`): both exit 0; `apps/web/dist`
  contains `index.html` and `sw.js`.
- `npm run build:release`: builds both apps, then exits 1 **only** on `check:pending-copy`: `FAIL: 246 place(s) where
  [COPY PENDING LEGAL REVIEW] would ship to users`.
- Not run, by instruction: Playwright, the full mocked suite, e2e, `apps/*` unit suites (no source change in them).

## NOT verified
No Render account exists and the Blueprint was **not imported**. Field names were checked against Render's documentation on
2026-11-14, not a live Render. Specifically unverified: that Render accepts the file; that multiple header rules for one path
all apply; that Render does not also add HSTS; that `/sw.js` is served as JavaScript; that user-set environment variables
reach the static build; that a root `npm install` (all workspaces, including `apps/mobile`) fits the static build's time and
memory; the Node version Render picks; the CSP against a real browser session of the card step, an upload and a signed-link
playback; and everything about domains, DNS, Cloudflare and the bucket (CORS rule, public prefix rule B-265).

## What stays human
Create or sync the services from the Blueprint; custom domains and DNS (kept "DNS only" until edge protection); the R2 bucket
CORS rule for browser PUT; making `S3_PUBLIC_BASE_URL` serve `post-media/` and `profile-media/` only and proving it; tightening
the two R2 wildcards to exact hosts; the Node pin; the Cloudflare proxy and origin lock; and clearing the pending-copy strings
with counsel so the production build can pass.

## Not done here
`docs/build-register.md` and the Build Plan docx were not edited (status lines for B-179 and B-088 and any Decision Log
pointer are for the next docs PR).
