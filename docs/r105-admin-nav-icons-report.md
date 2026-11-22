# R105: admin sidebar icons rendered as solid squares on staging

Decision Log #546, register Section 110. Branch `r105-admin-nav-icons`.

## Result
Every nav glyph except Competitions (CSS bars) rendered as a solid filled square on the staging admin site. Cause found and fixed in `apps/admin/src/layout/AdminShell.tsx`. No header or CSP change.

## Reproduction
Built `apps/admin` as `render.yaml` does (`npm run build --workspace=apps/admin`, `VITE_API_BASE_URL=https://api.staging.soccernity.com`, Node 24.16 locally; the staging pin is 22.22.0, not available here, so the Node version is not shown to matter). Served `dist` with the staging CSP (copied from `soccernity-admin-staging`), `nosniff` and the SPA fallback, and loaded `/settings/roles` in real Chrome (system Chrome via Playwright, 1280x800, scale 1) with the API answered in the browser (a mocked session). Screenshots: `docs/r105-screens/before-with-csp.png`, `before-no-csp.png`, `after-with-csp.png`.

- With the staging CSP: squares reproduced. Computed `mask-image` on the icon span was `none`.
- WITHOUT the CSP header: squares reproduced identically. So the policy is not the cause.

## Candidates tested
- (a) data: URI plus style-src/img-src: not the cause (CSP off gives the same result; img-src already allows `data:`).
- (b) mask fetch mode and asset headers: not applicable, the icons are not fetched as files.
- (c) SPA rewrite answering asset paths with index.html: not applicable, same reason.
- (d) SVG markup (preserveAspectRatio, overflow, style): not the cause; the same SVGs work as masks once the declaration is valid.
- (e) build output: THE CAUSE. Vite inlines these small SVGs as `data:image/svg+xml,%3csvg%20...style='display:%20block;'...'` (single quotes and parentheses). `AdminShell` wrote it as `url(${item.icon})` with no quotes. An unquoted `url()` may not contain quotes, spaces or parentheses, so the declaration is invalid and the browser drops it; the span keeps only `background-color: currentColor`, a solid square. Dev serves a plain file path, which parses, which is why it only shows in a build.

## Fix
New `maskUrl(icon)` returns `url(` + `JSON.stringify(icon)` + `)` (double-quoted); both `maskImage` and `WebkitMaskImage` use it. Colours (navy inactive, white active), the Competitions bars and the a11y (`aria-hidden` glyph, label text) are unchanged. After the fix, the same build under the same CSP shows the real glyphs (`after-with-csp.png`).

Test: `apps/admin/src/layout/maskUrl.test.ts` (quotes a data URI with quotes and parentheses, the declaration is accepted by the CSS parser, plain paths are quoted).

## Other mask-image uses
Searched `apps/admin/src` and `apps/web/src` (tsx, ts, css) for `mask` and `url(${`: the only use is this one. `apps/web` has none.

## Not verified
Staging itself was not loaded (no access); the Node 22.22.0 build was not run. The reproduction used a mocked session in a local server with the same headers. Deploying the fix to staging is the final proof.
