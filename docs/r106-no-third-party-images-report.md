# R106: no third-party images at launch, and the R2 wildcards tightened

Branch `r106-no-third-party-images`. Decision Log #547 and #548, register Section 111, new row B-324 (NOT BUILT). No legal draft, Figma file or counsel pack edited. No secret printed.

## 1. What changed

- `apps/web/src/lib/safeImageUrl.ts` (new): returns an image URL only when its origin is the page's own, it is a `data:image/` or `blob:` URL, or its origin equals `VITE_MEDIA_BASE_URL` (build config, not hard-coded). Empty, malformed, protocol-relative (`//host`, `\host`), non-http(s) and every other host give `null`, so the existing initials or monogram fallback shows and the browser never makes the request. The CSP is not loosened. The API response shape and the sports sync are unchanged.
- `render.yaml`: all four static sites name the exact host `https://fa6d2be1dc1616bdc010c197e51376f2.eu.r2.cloudflarestorage.com`; both R2 wildcards are gone (the non-EU one entirely). The four sites also get `VITE_MEDIA_BASE_URL` (staging `https://media.staging.soccernity.com`, production `https://media.soccernity.com`). Every other directive is kept.
- Presign style checked first: the API's S3 client uses path-style URLs whenever an endpoint is set (`forcePathStyle`), so every bucket is reached on the one account host and no bucket host is needed.
- `services/api/src/render-static-sites.spec.ts`: pins the exact host, the absence of any R2 wildcard, and that `VITE_MEDIA_BASE_URL` equals the CSP media host.
- Docs: runbook 6.8 part 6 marked done with the host; `docs/deployment.md` CSP bullets and the inputs list updated; docx rows #547 and #548; register B-324 and Section 111.

## 2. Audit: every place that renders an API-supplied image URL

| Place | Source of the URL | Verdict |
|---|---|---|
| `SportsHubPage` TeamCrest | match `homeTeam.logo` / `awayTeam.logo` (provider) | guarded |
| `search/FixturesPanel` Crest | same (provider) | guarded |
| `MatchCentrePage` TeamCrest | same (provider) | guarded |
| `MatchCentrePage` video grid thumbnail | `thumbnailUrl` (provider) | guarded |
| `ClubsPage`, `ClubFanPage`, `SearchTrendingPage`, `signup/ClubPickerStep` | `ClubPage.logoUrl` | guarded (admin/seed data, could be any host) |
| Avatars, covers, post media, contest media, `CoverMedia`, `FinalWeekCarousel`, `VideosCarousel`, `PostMedia`, admin media and review views, previews | our own media host or a signed link on the S3 endpoint | NOT guarded, by decision (veto-able). The CSP already allows them, and guarding them would break the Playwright specs, which use a fake store on localhost. |
| `MatchCentrePage` video card link (`embedUrl ?? url`, `target=_blank`) | provider | unchanged: it is navigation to the provider's page, not a load, so the CSP does not apply. |

## 3. Tests

- New `apps/web/src/lib/safeImageUrl.test.ts` (6 tests): own origin allowed; media host allowed and a lookalike or the staging host refused; no media host configured; empty, malformed, `//host`, `\host`, `javascript:`, `ftp:` refused; `data:image/` and `blob:` pass and `data:text/html` is refused; highlightly.net refused. One backslash literal in that file lost a backslash while editing, so it tests `\highlightly.netx.png`; the intent (a leading backslash is refused) still holds.
- New component test in `SidePanels.test.tsx`: a fixture crest on highlightly.net renders the monogram and no `img.fixtures-card__crest`.
- Results: `apps/web` `tsc --noEmit` clean, eslint clean, `npm run build` clean; vitest 160 files, 2,076 of 2,077 passed in the full run; the one failure (`ReportAction.test.tsx`, a close-note test) passed 44/44 when run alone three times, including on the stashed baseline, so it is a load flake and not caused by this change. `render-static-sites` and `env-completeness` specs: 70 passed. NOT run: `apps/admin` and the rest of the API suites (no code there changed), Playwright, CI.
- Cosmetic: in the four club files and one thumbnail the new import sits above the existing imports (eslint passes).

## 4. Legal-draft note (drafts not edited)

The web app contacts no third-party image host at launch. The only external origins in the static sites' CSP, from `render.yaml`:

- Web (staging and production): Stripe `https://js.stripe.com`, `https://*.js.stripe.com` (script and frames), `https://hooks.stripe.com` (frames), `https://api.stripe.com` (connect); our API host (`https://api.staging.soccernity.com` / `https://api.soccernity.com`); the R2 account host `https://fa6d2be1dc1616bdc010c197e51376f2.eu.r2.cloudflarestorage.com` (browser uploads); our media host (`https://media.staging.soccernity.com` / `https://media.soccernity.com`).
- Admin: our API host, the R2 account host (review signed links) and our media host. No Stripe, no frames.

## 5. Other external origins loaded at runtime (item 5)

Searched `apps/web/src` and `index.html` for absolute URLs, `<script>`, `<iframe>`, `@import`, `url(http`, fonts and videos.

- Fonts: self-hosted `@fontsource` (no Google). Scripts: only `/src/main.tsx`; Stripe via `@stripe/stripe-js/pure` loads only in the guardian card step (allowed in the CSP). No iframes. No external CSS.
- Fetches: every API client defaults `VITE_API_BASE_URL` to `http://localhost:3000` when the build value is missing. The static sites set it, so no fix is needed; a build without it would be blocked by the CSP, which is the safe failure.
- Videos: `<video src>` in `PostMedia`, `MediaElement`, `FinalWeekCarousel` and `VideosCarousel` use post media on our own media host or signed links. Allowed.
- Nothing else found that the CSP does not allow.

## 6. Found, not fixed

- Match Centre video highlights open the provider's page in a new tab (`embedUrl ?? url`). Not a CSP matter; whether to keep sending visitors to a third party is a product call.
- A real browser upload and an admin signed-link view must show no CSP error after the first deploy (not verified).
- B-324 (crests from our own storage after launch) must first confirm Highlightly's terms allow storing and re-serving; not read here.
- The C: drive of this machine was at 0 MB free during this session (Claude's temp directory is on it); shell output was cut once. Nothing was deleted to make room.
