# Home hero live-scores card, Today's Fixtures rules and ranked Sports Hub leagues

Branch `feat/home-hero-live-card`. Web and docs only. Decision Log #570, register Section 135.

## Handshake
- origin/main at start of the docs step: `635482c` (merge of PR #903).
- Backend PR #903 (league ranking, `GET /sports/leagues`, `GET /sports/results/recent`, `status` filter) confirmed merged. Figma PR #902 (hero card) confirmed merged.
- `gh pr list --state open`: none open.
- Next free numbers checked: register Section 135, Decision Log #570 (the docx ends at #569). The `HomePage.tsx` header comment already says #570, so it stands.

## What changed
- `apps/web/src/api/sports.ts`: `rank` and `country` on `league`; `listFixtures` takes `status` and `limit`; new `listRecentResults` and `listLeagues`.
- `apps/web/src/pages/HomeHeroCard.tsx` (new): the card. Title "Today’s matches", "{n} live now" pill only when a match is live, up to 3 league tabs plus a "More" link to /sports-hub, a single league shown as a plain line, tab labels cut near 22 characters with the full name as title and aria-label, default tab is the highest-ranked league with a live match, up to 3 rows per tab (live first, then finished most recent first), three-column rows linking to the match, footer caption and "View all scores →". Tablist, arrow keys, roving tabindex. Skeleton while loading.
- `apps/web/src/pages/HomePage.tsx` and `.css`: data comes from `GET /sports/live-scores` plus today's finished fixtures, in server order. If nothing live or finished today, or the request fails, the card is hidden and the hero copy goes full width. Refresh on mount, then every 60 seconds only while the page is visible and a live match is shown. Today's Fixtures shows scheduled matches only (first 4); if none, "LATEST RESULTS" from `GET /sports/results/recent`; if none either, the existing empty sentence; an error hides the strip; loading keeps 4 skeletons.
- `apps/web/src/pages/SportsHubPage.tsx` and `.css`: sidebar reads `GET /sports/leagues` in server order, keeps the search box and "All leagues"; ranked leagues under "Top competitions", the rest grouped by country A to Z (no country under "Other"). A failed league request leaves the sidebar empty while matches still load.
- Tests: `HomePage.test.tsx` rewritten (card, refresh, strip); `SportsHubPage.test.tsx` mocks `listLeagues` and adds `groupLeagues` cases.

## Adopted defaults (veto-able)
- Finished matches for the hero are read with `limit` 50 in one request, then grouped client-side.
- Live pill minute comes from `statusDetail`, else "Live".
- Active tab text is plain white on navy (no `--sn-text-on-navy` token in `apps/web`; the same disclosed exception used elsewhere).
- "Other" group label for leagues with no country, placed last.
- A failed `GET /sports/leagues` is swallowed silently rather than shown as an error.

## Deviations
- The page differs from canonical Figma frame 5204:6728 (Decision Log #46) as already recorded for #556; the new hero card follows the Figma pass in PR #902. No Figma file was edited.
- No new e2e spec; existing specs were not run.

## Verification
`tsc --noEmit` and eslint clean. Vitest HomePage and SportsHubPage 52 passed. Full web suite: 2,150 passed and 1 failed in one loaded run; rerun below.
