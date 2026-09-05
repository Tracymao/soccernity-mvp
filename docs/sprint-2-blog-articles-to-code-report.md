# sprint-2/blog-articles-to-code — figma-to-code report

**Agent:** figma-to-code · **Date:** 2026-09-05 · **Scope:** `apps/web` only, `services/api` untouched.

Converts `BlogPage.tsx` from a `PlaceholderPage` stub to a real listing page, and adds a
new `ArticleDetailPage.tsx` (route `/blog/:articleId`). Blog was the last main-nav pillar
still rendering the placeholder stub.

## Sequencing / dependency check

The task noted a dependency on "PR A" — the "Soccernity." footer-wordmark fix. Confirmed
merged before this Figma read:

- PR #161 (`sprint-2/blog-badge-token-collision-fixes`) — wordmark pill → real wordmark on
  the 4 Blog Page frames.
- PR #168 (`sprint-2/decision-log-204-208-cleanup`) — same fix extended.
- PR #169 / #170 (`sprint-2/footer-standardization`, `sprint-2/legacy-footer-template-replacement`) —
  canonical footer across Blog / Article Detail.

All in `main` at `3612ee6`. This branch is cut from that commit. (The footer is not
reproduced in code anyway — see below.)

## Source frames (confirmed live via `get_metadata` / `get_screenshot`)

| Screen | Desktop — Logged In | Desktop — Logged Out | Mobile — Logged In | Mobile — Logged Out |
|---|---|---|---|---|
| Blog listing | `5953:10771` | `5953:11364` | `5956:10960` | `5956:11331` |
| Article Detail | `5997:10905` | `5997:11224` | `6000:11346` | `6000:11377` |

Article Detail frame names confirmed against the founder's live Figma rename
(Decision Log #197) — they read "Blog — Article Detail …", so the component is
`ArticleDetailPage`, **not** `ArticlesPage`.

The Logged In / Logged Out frames carry **identical body content** — only the navbar
variant (`header 4` vs `header 7`) differs, and the shared `Header` already renders the
right chrome. So neither page has a login gate (same reasoning `SportsHubPage` uses).

## Backend state — confirmed live, not assumed

- `services/api/src/modules/` has **no** `blog` / `article` / `content` module (contrast:
  `sports`, `banter` at least have placeholder READMEs).
- `grep -ri "blog\|article" services/api/src --include="*.ts"` → **zero** matches.
- Build Plan Section 4 defines **no** blog/news/article endpoint.
- `Article` and `AdminUser` entities exist in `prisma/schema.prisma` (Section 3's original
  20) but have zero reads/writes.

So every article, category, comment, author and date is illustrative dummy content in
`apps/web/src/pages/blog/blogData.ts`, with an on-page disclosure note — the same convention
`SportsHubPage.tsx` / `CommunityPage.tsx` use. The two Figma exemplars (the "Zaha
double…" featured card and the "Kane joins 250 club…" secondary card) are kept verbatim;
the rest are illustrative in the same register so the category tabs and per-category
sections have something to render.

## What was built

### `BlogPage.tsx` (replaces the stub) + `blog/BlogPage.css`

- Navy hero banner: "Feel The Passion, Enjoy the Game."
- "Search Topics" box — filters the dummy article list client-side (title/excerpt
  substring) with an empty state. No real query (`GET /blog` doesn't exist).
- Category tab row: All / Premier League / La Liga / Champions League / NPFL / More.
  - "All" → a "Trending Topics" featured section + one section per league.
  - A specific tab → just that league's section.
- Each section = a **featured card** (image-left, navy category badge, navy title, excerpt,
  date) + a responsive **grid of secondary cards** + a "See More" toggle (expand/collapse).
- Every card `<Link>`s to `/blog/:articleId`.
- **No site footer** — the Figma frame carries one, but the shared chrome is Header-only,
  matching `SportsHubPage` / `LeaderboardPage`.

### `blog/ArticleDetailPage.tsx` (new) + `blog/ArticleDetailPage.css`

Route `/blog/:articleId` (added to `router.tsx` as an `AppShell` child).

- "← Blog" back link (not in Figma — matches `ClubFanPage.tsx`'s "← Clubs" precedent).
- Title, meta ("Posted by Admin · date · time"), a static "Share via:" row
  (non-interactive — sharing a dummy article is meaningless).
- Hero image placeholder, then the article body paragraphs.
- **"Join the discussion"** — the Name / Comment / Comment-button composer is rendered but
  **fully disabled**, with an explanatory note ("Comments aren't available yet — the blog
  has no backend"). The sample thread (Alexis5 / Jadend / Amadi3) is captioned
  "Sample — not real comments". Same "render it, visibly disabled, never faked as working"
  discipline `EditProfileModal.tsx` applies.
- "More Trending News" — 3 other articles as cards, never the current one.
- An unknown `:articleId` → an honest "Article not found" state with a link back to
  `/blog`, never a crash (mirrors `ClubFanPage.tsx`'s 404 handling).

### `blog/blogData.ts` (new)

`CATEGORIES`, `ARTICLES` (12 illustrative articles across the 5 leagues + a "More"
bucket), `articlesByCategory()`, `findArticle()`, `SAMPLE_COMMENTS`.

## Judgment calls → Decision Log #212

1. **The "Pinned post" badge (Decision Log #173) does not apply to Blog.** The task brief
   said to preserve it; that badge lives on the **Community** home-feed frames
   (`2565:3951` / `5956:12797`), not on any Blog Page frame, and has never been converted
   to code (it's a Figma-only detail for a future `CommunityPage` pass). The Blog frames
   use a "Trending Topics" featured card with a **category** badge ("Premier League"),
   which is what was built. `CommunityPage.tsx` was **not** touched.
2. **No blog backend** — all content dummy, composer disabled, disclosure note. `figma-to-code`
   must not wire Blog to real data until an `Article` endpoint exists.
3. **No site footer rendered** — deliberate, matches the most recent conversions.
4. Route `/blog/:articleId`; "← Blog" back link; the 5 identical per-category sections in
   the Figma frame are rendered from distinct-enough dummy data rather than literally
   duplicated 5×.

Decision Log #212 transcribed into Build Plan Section 9 (Table 6) in this PR.

## Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm run lint` | clean |
| `npx vitest run` | **18 files / 119 tests, 0 failures** (up from 16/110 — `BlogPage.test.tsx` +5, `ArticleDetailPage.test.tsx` +4; no existing test changed) |
| `npm run build` | clean production bundle |
| Dev-server smoke test | `/`, `/blog`, `/blog/zaha-double-crystal-palace`, `/blog/does-not-exist`, `/community` → all HTTP 200, no console errors |

No real browser / Playwright check is available in this environment — same verification
ceiling as every prior `apps/web` PR. The vitest suite does the real route-resolution
check (`MemoryRouter` + `Routes` with the `:articleId` param).

## Not done / follow-ups

- A real blog backend (`Article` CRUD, comments, admin-authored content via the Admin
  Console / `content-ops` pipeline) — later-sprint.
- Site-wide footer decision — open, affects every converted page.
- The Community "Pinned post" badge conversion — a separate `CommunityPage` pass.
