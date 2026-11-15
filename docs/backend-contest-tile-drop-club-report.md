# Contest tile: the finalist's club is removed (backend/contest-tile-drop-club)

Date: 2026-11-15. Founder decision of 2026-11-14: no one's club appears on a Final week / contest tile, for any person.
This removal is the direct consequence of that decision and is a **default, founder-veto-able: if Temi vetoes it, the PR is simply not merged.**

## What was removed

`GET /contest/final-week/carousel` no longer returns `club` on a tile. A tile is now exactly
`{ entryId, postId, finalist: { userId, publicName }, post }`.

- `services/api/src/modules/contest/contest-exposure.service.ts`
  - `FinalWeekCarouselItem.club` (type) removed, with its B-234 comment; a short comment states the rule instead.
  - `LIVE_ENTRY_SELECT.user` is now `PUBLIC_NAME_SELECT` only. The `representedClub` join is gone. `isMinor` was also dropped from that select: it was selected only to null the club for a minor, and nothing else reads it from that select (the viewer's own `isMinor` check at `findUnique` is a separate query and is untouched).
  - The mapping line that built `club` is gone.
- `apps/web/src/api/contest.ts`: `club` removed from `FinalWeekCarouselItem`, comment replaced.
- Test fixtures: `FinalWeekCarousel.test.tsx` and `CommunityPage.test.tsx` no longer set `club: null`.

Nothing else about the carousel changed (order, rotation, impressions, names, avatars, caching, the 9-finalist limit).

## Consumers searched

Repo-wide search for the finalist `club` field (grep of `final-week/carousel`, `FinalWeekCarouselItem`, `FinalWeekCarousel`, `representedClub`, `club:` in the contest module, and `club` in `apps/admin`, the leaderboard and pinned-entry code):

- Only the carousel endpoint and its web client read it. `FinalWeekCarousel.tsx` never read `.club` (the web did not draw it).
- `apps/admin`: no consumer (admin exposure uses `GET /admin/contest/cycles/:id/exposure`, a different shape that never carried a club).
- Pinned impressions / pinned entry (`GET /contest/users/:userId/pinned-entry`): no club field.
- `services/api/src/modules/contest/README.md`: no mention of the club.
- `services/api/test/post-media.e2e-spec.ts` calls the carousel but does not assert on `club`.
- **Left alone on purpose:** the leaderboard's own per-row `club` (B-053, `leaderboard.service.ts`) is a different endpoint and a different decision; the profile "represented club" feature (Decision Log #74); club pages. The brief said not to touch any other endpoint. Worth knowing: the leaderboard still returns a club per row (null for a minor), so the founder's rule "no one's club appears on a contest tile" is met, but if the intent also covers the leaderboard that is a separate change.

## Tests

- `contest-exposure.service.spec.ts`: the `club (B-234)` block is replaced by one asserting no tile has a `club` key for an adult who represents a club, an adult who does not, and a minor, and that the read no longer selects `representedClub` or `isMinor`. The tile key-list assertion no longer expects `club`.
- `test/contest-exposure.e2e-spec.ts`: the tile key-list assertion no longer expects `club`; the B-234 e2e now seeds the same three finalists (adult with a club, adult without, minor with a club) plus an anonymised one and asserts no tile has `club`, the response is otherwise `entryId/finalist/post/postId`, and neither the club name nor its id appears anywhere in the body.

## Playwright

Not run (not asked). Specs that mention the carousel: `e2e/tests/16-fc8-final-week.spec.ts` and `17-contest-phases-test-clock.spec.ts`. I read both: **neither contains the word "club" at all**, so neither asserts on it. QA does not need to run them for this change.

## Verification

See the PR description for the measured results and what was not run.
