# Return to the search after logging in (CH-H9)

Decision Log #571, build-register B-332, Section 136. `apps/web` and docs only. Code-only: no Figma frame was drawn or changed.

## What changed

- `apps/web/src/lib/returnTo.ts` (new): `safeReturnTo(raw)` and `buildLoginLink(returnTo)`.
- `SearchTrendingPage.tsx`: the logged-out prompt's "Log in" link is now `buildLoginLink(location.pathname + location.search)`, for example `/login?returnTo=%2Fsearch%3Fq%3Dsalah`. No search call is made while logged out (unchanged).
- `LoginPage.tsx`: reads `returnTo` with `useSearchParams` and `safeReturnTo`. In `finishSignIn`, `base = routeForNextStep(nextStep)`; the visitor goes to the return-to only if it is non-null AND `base` is the home route (`/community`), otherwise to `base`. The password path and the two-factor code path both end in `finishSignIn`. The deactivated-account branch is unchanged.
- The value is not stored in session storage, local storage or router state, and no other link carries it.

## Allow-list rules (`safeReturnTo`)

Returns `null` unless all of these hold:

1. a string of 1 to 300 characters;
2. no control characters, spaces or backslashes;
3. starts with exactly one `/` (not `//`);
4. the part before `?` or `#` is exactly `/search`;
5. `new URL(raw, "http://return.invalid")` keeps the same origin and the pathname is exactly `/search` (this catches encoded tricks such as `/%2e%2e/search`).

The result is pathname plus query; a hash is dropped. `buildLoginLink` returns plain `/login` when the value is not safe.

## Verification

1. `apps/web`: `eslint`, `tsc --noEmit` and the full vitest run were clean (the one `Header.test.tsx` failure in the first full run was a load flake that passes alone and passed on rerun).
2. Repo root: `npm run build:release` built both apps; `npm run check:pending-copy` still fails by design (tagged legal-draft strings), unchanged by this work.
3. Real Chrome (Playwright, `channel: "chrome"`) against the built `apps/web/dist` served with an SPA fallback, API answered with fixture JSON (refresh 401 until login, then a JWT-shaped token):

| Scenario | Login URL | Final URL | GET /search calls |
|---|---|---|---|
| Type "salah" in the header box, Enter, prompt, Log in, sign in (next step none) | `/login?returnTo=%2Fsearch%3Fq%3Dsalah` | `/search?q=salah`, field pre-filled `salah` | exactly 1 (`/search?q=salah`) |
| Start on `/login?returnTo=https%3A%2F%2Fevil.example`, sign in | same | `/community` | 0 |
| Start on `/login?returnTo=%2Fsearch%3Fq%3Dsalah`, next step `verify_email` | same | `/verify-email/prompt` | 0 |

Screenshots were taken in the session scratchpad only and are not committed.

Note on the walk-through itself: my first runs failed because of my own harness (a Windows path check that made the static server serve `index.html` for every asset, and a fixture token that was not a decodable JWT, so the search page treated the visitor as logged out). Neither was an application defect.

## Privacy check

The static sites send `Referrer-Policy: no-referrer` (stricter than strict-origin-when-cross-origin), and `apps/web` has no Sentry, so the search text in the address is not sent in a referrer or an error report. Nothing was changed.

## Records and numbering

The task assumed Decision Log #568 and #569 and register Section 133. Main already holds #569 and #570 and Sections 133 to 135, so this is Decision Log **#571**, register row **B-332** and **Section 136**. Register counters: 332 B-IDs, 146 gap frames, W9 63, Section 7 extended to #571.
