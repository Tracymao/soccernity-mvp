# CH-H14: page loader (web only)

Decision Log #581, build register B-335 and Section 151. Code-only. No API, backend, data fetching, caching or route path change. No library added. `apps/admin` untouched.

## What changed

| Piece | Where |
|---|---|
| Static first paint (brand mark and spinner inside `#root`) | `apps/web/index.html`, `apps/web/public/splash.css` |
| Branded splash while the session is restored (replaces the bare "Loading…" paragraph) | `components/loading/SplashLoader.tsx`, `lib/AuthContext.tsx` |
| In-flight request counter, a second thin `window.fetch` wrapper installed after silent refresh | `components/loading/activity.ts`, `main.tsx` |
| Top progress bar (3px, brand green, above the header) | `components/loading/RouteProgressBar.tsx` |
| Spinner and skeleton components | `components/loading/LoadingState.tsx`, `Skeleton.tsx`, `loading.css` |
| Page arrival fade, restarted by a class on pathname change (no remount) | `components/loading/usePageArrival.ts`, `layout/AppShell.tsx`, `layout/AuthChrome.tsx` |

**Where the bar is mounted:** once, in a new root route element `layout/RootLayout.tsx`, wrapped around every route in `app/router.tsx`. It therefore covers AppShell, the auth layout and anything added later.

## How background polling is excluded

A navigation window opens on the first load and when the pathname or search changes. The bar counts only requests that started after the window opened, and the window closes after 150ms with none of them in flight, or after 10 seconds. A request that starts outside a window is never counted. Hash-only changes do nothing. The bar appears only if a request is still in flight about 120ms into the window.

Two limits of this rule:

- A background request that happens to start while a window is open is counted like any other until the window closes.
- A page that waits more than 150ms between one response and its next request closes the window early; the section spinner still shows.

## Loading text migration

68 loading branches in 49 files now render `LoadingState` or `SkeletonList`, with the exact old wording as visually hidden text: 22 page, 42 section, 1 inline, 2 skeleton rows (Leaderboard, Sports Hub) and 1 skeleton cards (Community feed).

| Left as it was | Why |
|---|---|
| "Loading…" on Load more buttons (about 22 places) | Button labels that change while an action runs |
| "Checking…", "Please wait…", "Downloading…", "Saving…", "Uploading… N%" | Same: action progress on a control |
| "Checking your data export…" (DataExportPage) | A status the person asked for |
| AddTopicsSheet, DirectMessagesSettingsPage, YourPostsSettingsPage, PublicProfileRow, HomePage, HomeHeroCard | Already have their own skeletons |
| `community/SensitiveMedia.tsx` "Loading…" | Overlay on a media tile, part of that control's own states |
| "Verifying your email…" | The person is waiting on it after clicking a link; left alone |
| `apps/admin` | Out of scope |

## CSP

The built `dist` was served with the web static site's Content-Security-Policy from `render.yaml` (`style-src 'self'`, `script-src 'self'`; the local API origin `http://localhost:3000` added to `connect-src`). **Zero CSP violations.** The static splash needs no inline style or script, and the policy is unchanged.

## Verification

- `apps/web`: `npx tsc --noEmit` clean, eslint on touched files clean, full vitest **169 files / 2,250 tests, 0 failures**.
- One existing test was updated: the empty-state case in `SavedPostsTab.test.tsx` took the first `role="status"`, which is now also the loader. It now finds the empty text and checks it sits inside a status.
- Repo root `npm run build:release`: passed, including the pending-copy check. (The test-only edit above came after it.)
- Real Chrome (Playwright, the Windows install of Chrome, API intercepted): **25 of 25 checks passed**: styled splash before any script at 1280 and 390px; reload with the refresh delayed 1.5s showed the splash at 0, 300 and 800ms with no bare "Loading…"; with an 800ms API the bar loaded, completed and faded from Home to Leaderboard to Sports Hub and the page never went blank; with an instant API no bar and no visible spinner in 16ms sampling; a refetch of live scores did not move the bar; reduced motion was static; at 390px the bar was full width with no overflow; no page errors.
- Polling was proven in Chrome with the live-scores refetch. The view heartbeat and media polling were not triggered separately; they are excluded by the same rule, which the unit tests cover.
- The run was on Windows, so screenshots went to the session scratchpad rather than `/tmp`. None is committed.
- Not run: the `e2e/` Playwright suite, `apps/admin` and `services/api` tests (no change there), CI.

## Decided here, not spelled out in the request

- Bar z-index 2000, height 3px; while loading it eases to 85% over 8s.
- A new `RootLayout` route element, so the exported `routes` array is now one root with the old routes as its children.
- `SkeletonList` (rows or cards) as a small helper beside `Skeleton`.
- Reduced motion: spinner and skeletons are fully static (no opacity pulse).
- The splash colours use the theme variables with the same value as a CSS fallback, because the variables are set by JavaScript and do not exist at first paint. No new colour.
- The inner `fetch` promise is returned unchanged; the counter is decremented from a side chain.

## Records

Decision Log #581 (#579 and #580 are already cited by register Sections 149 and 150, which have no docx row, so they were not reused), B-335 (wave W9, now 66; total 335), register Section 151. The Waves table total read 333 while its rows summed to 334; it now reads 335.
