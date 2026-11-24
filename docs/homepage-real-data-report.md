# Homepage reads real data (CH-H1)

Branch `feat/homepage-real-data`, base `origin/main` 736f2c1. Apps/web plus docs only. Founder decisions of 2026-11-24, recorded as Decision Log #556 (register Section 123, row B-325).

## What changed

- `apps/web/src/pages/HomePage.tsx` rewritten. `HomePage` keeps the token check and the redirect to `/community` (Decision Log #152). Otherwise it renders `MarketingHome`, which owns the reads, so a signed-in visitor makes no API request.
- One `listFixtures(todayIso())` call feeds both the hero card and the "Today's Fixtures" strip. One `listArticles()` call feeds the "Latest" section.
- Removed: the hard-coded fixtures, the talent clips section, the invented trending stories (rank badges, reading time, view counts) and the Grassroots half of the hero card. The homepage now shows no grassroots data.
- `apps/web/src/pages/HomePage.css`: removed the styles for the removed parts; added skeleton, empty-line, link and no-hero-match (`home-hero--solo`) styles.
- New `apps/web/src/lib/formatDate.ts`; `BlogPage.tsx` imports it instead of its private copy (same output).
- `HomePage.test.tsx` rewritten (21 tests).
- Unchanged: pillar copy, closing call to action ("Register your team" to `/signup`), footer.

## Selection and state rules

- Sort order: live, then scheduled by kickoff ascending, then finished by kickoff descending, then postponed or cancelled.
- Strip: first 4 matches. Hero card: the first live, scheduled or finished match, linking to `/sports-hub/matches/:id`. With no such match the hero copy takes the full width.
- Fixtures: 4 skeleton cards while loading (`aria-busy`); empty day shows "No matches today. See all fixtures on Sports Hub." with a link; on error the section is hidden.
- Latest: a featured story plus the next 3 in a side list; skeletons while loading; hidden on empty or error.
- New copy contains no em or en dashes and no `[COPY PENDING LEGAL REVIEW]` tag.

## Figma divergence (disclosed)

The page now differs from the canonical homepage frame 5204:6728 (Decision Log #46). Per the founder decision there was no Figma redesign first and Figma was not touched. A later Figma pass would have to follow the code.

## Verification

- `tsc --noEmit` exit 0; eslint clean; full vitest 161 files / 2,100 tests, 0 failures (legal copy tests included).
- `npm run build:release` exit 0; `npm run check:pending-copy` passes in this worktree (this change adds no tag).
- Real Chrome against the production build with the API answered in the browser: fixtures and articles each in data, empty, error and loading states, at 1440 and 390 px. No horizontal overflow in any of the 16 captures. I viewed the screenshots; no layout problems found, no fixes needed.
- Signed-in visit: redirected to `/community`; zero requests to `/sports/fixtures` or `/articles`. The community page itself makes its own requests (auth refresh, unread count, carousel); those are not from the homepage.
- Grep of `apps/web/src` for Ikoyi, Surulere, Chelsea, Liverpool, Zaha, Kane, Lagos, TALENT_CLIPS, TOP_STORIES: no hits in `HomePage.tsx` or `HomePage.css`. `HomePage.test.tsx` uses Liverpool and Chelsea only as mock team names. The other hits are in unrelated features and were not touched: Banter sample data (`banter/banterData.ts`), Community side rail (`CommunityPage.tsx`), Grassroots and Community Groups placeholder text (`GrassrootsRegisterTeamPage.tsx`, `CreateCommunityGroupPage.tsx`), leaderboard sample rows (`leaderboard/leaderboardData.ts`), and tests of those features.

## Screenshots

Not committed. Scratch location: `D:\claude-tmp\claude\ef2bae2a31dfc4c6\48944718-92c0-4002-b530-cdd29fe92c3c\scratchpad\shots\` (files `fix-<state>_art-<state>_<1440|390>.png`).

## Not done / notes

- Not verified against the live API or on staging; the browser run used mocked responses. Founder verification is pending.
- Other pages (Banter, Community, leaderboard) still show sample content; out of scope here.
