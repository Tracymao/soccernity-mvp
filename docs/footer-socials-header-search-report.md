# Footer social links and live header search (CH-H8)

Decision Log #567 (footer socials, B-330) and #568 (header search live, B-331). `apps/web` and docs only. Code-only: no Figma change.

## Footer
- facebook, twitter, Tik Tok and YouTube are real links to https://www.facebook.com/soccernity, https://x.com/soccernity, https://www.tiktok.com/@soccernity and https://www.youtube.com/@soccernity.
- Each opens in a new tab with rel="noopener noreferrer"; the accessible name starts with the visible label ("<label> (opens in a new tab)"). Visible labels unchanged.
- Instagram and LinkedIn are not rendered. Hover and focus-visible states added.
- Footer test: exactly 4 social links, 8 links in total.

## Header search (desktop only)
- Enter with 2 or more trimmed characters goes to `/search?q=<encoded>`, signed in or out. Under 2 does nothing.
- The box shows q only while on `/search`.
- `/search` reads q, re-searches when it changes, writes back with replace, drops q when empty or under 2 characters. A logged-out visitor sees the log-in prompt and no search call is made (this gate was added after a first test run showed a logged-out call).
- Mobile header, mobile search icon, `GET /search` and `api/search.ts` untouched.
- Note: signed in, the page rewrites q through URLSearchParams, so spaces appear as `+`. Same meaning.

## Records
Decision Log #567 and #568 added to the docx (earlier rows unchanged). Register: rows B-330 and B-331, Section 7 to #568, counters 331 B-IDs (41 + 290), 146 gap frames, W9 62, Section 132.

## Verification
Run in `apps/web`: eslint, `tsc --noEmit`, full vitest, plus `npm run build:release` and `npm run check:pending-copy` at the root; real-Chrome check at 1440 and 390 against the built dist, compared with an origin/main build. Exact outputs are in the PR description. Screenshots were kept outside the repo and are not committed.
