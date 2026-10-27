# FC8: the Final week carousel, the pinned final entry, the admin impression view, rounded points and the view heartbeat (2026-10-27)

Branch `fc8/final-week-carousel-pinned-impressions`, from `origin/main` at `640ac94` (after W11 #464, W12 #465 and Figma pass O #463). `apps/web` and `apps/admin` only, plus `docs/pending-copy-manifest.md`, `e2e/` and build-register Section 47. `services/api`, Figma, the Decision Log `.docx`, `docs/contest-spec.md`, legal copy, the DPIA and the Log Book are untouched. Sources read first: `docs/backend-w11-exposure-report.md`, `docs/backend-w12-points-report.md`, `docs/figma-pass-o-report.md` (the "K11" frames: the brief's name for the pass O frames, which are the latest merged Figma pass), the pass C impression frames (`6646:22745` to `6646:24345`) and the code of both APIs.

## 1. What was built

### apps/web

| Brief item | Built | Where |
|---|---|---|
| (1) Community-feed "Final week" carousel | A module at the top of the feed: heading, arrows, the "shown to everyone equally" lines, three tiles per page (the pass J / pass O design), pager footer and dots, hover / focus outline, single-page and last-page states. The order is exactly the server's rotation, never re-sorted. No count of any kind is on the screen or in the API answer. Renders nothing outside a live final week (the server answers `live: false`, also for a restricted viewer) | `pages/community/FinalWeekCarousel.tsx` (+ `.css`), mounted in `CommunityPage.tsx` |
| (1) Tiles open the entry itself | Every tile is a link to `/posts/:postId`, a new standalone post page (Figma `6836:29397` / `6836:29312`): back bar, the ordinary `PostCard` with comments open, the video played inline | `pages/PostPage.tsx`, route `posts/:postId` |
| (1) Impressions: at least 50% of a tile in view for at least 1 second | One event per stay, sent only when the tile has been at least half in view for one continuous second (cancelled when it drops below half or the tab hides); the claimed ratio is the smallest share seen in that second; a fresh `eventId` per event is the idempotency key; re-entry after leaving view sends another event (#406 item 6; the daily cap is the server's). Only the tiles of the page showing are mounted, so a tile on another page is never observed. A failure is silent; a 409 `contest_exposure_not_live` hides the module | `lib/useQualifiedImpression.ts`, `api/contest.ts` (`recordImpression`) |
| (2) Pinned final entry on the finalist's profile, locked engagement | `GET /contest/users/:id/pinned-entry` then `GET /posts/:id`, rendered above the Posts tab with a "Pinned" label and the "Contest post" label. Before the reveal (the current contest is in `final_upload`) every control is disabled, counts are hidden and the frame's note shows; from the reveal it is an ordinary card. If the contest cannot be read, the author's own entry is drawn locked (safe default). A weekly entry is never locked. Shown on the owner's own profile and on `/users/:id` (the server decides whether a viewer may see it: nothing before the reveal, nothing after a Block, nothing after the pin is removed) | `pages/community/PinnedEntry.tsx`, `PostCard.tsx` (`engagementLocked`), `ProfilePage.tsx`, `OtherProfilePage.tsx` |
| (4) Fractional points rounded | Every points figure on the Overall board, the Competition board and the Contest final ranking goes through one formatter (whole number, thousands separator, never a fraction). Two players who show the same points keep their own ranks (the server ranks on the exact total); the note from Figma pass O sits under the Overall table | `lib/points.ts`, `LeaderboardPage.tsx`, `leaderboard/ContestBoard.tsx` |
| (5) W12 front-end leg: the view heartbeat | While another person's post is at least half on screen, the client sends `POST /posts/:id/view-heartbeat` every 3 seconds: `{ sessionId, active, positionSeconds?, durationSeconds? }`, never "seconds watched" (the server keeps the clock). `active` needs the post on screen, the tab in the foreground and, for a video, a playing `<video>`; a post with a linked video and no player reports nothing. One session per stay, a new one on return, stops when the server says `done` or a beat fails, nothing is shown to the person. Not sent for the viewer's own post or a locked entry | `lib/useViewHeartbeat.ts`, `PostCard.tsx`, `api/feed.ts` (`recordViewHeartbeat`) |

The Notification Centre's "The final is live" row already opens `/community`; its comment now says the carousel is there.

### apps/admin

| Brief item | Built | Where |
|---|---|---|
| (3) Impression-distribution view | The Finalist impressions screen is rebuilt on `GET /admin/contest/cycles/:id/exposure`, covering every pass C and pass O state: the live list (mean, tolerance band, outside-tolerance count, a row per finalist with impressions, a distribution bar, deviation from the mean and "Within / Outside tolerance", the outside one in navy), fewer than nine finalists, before the reveal (counts shown as dashes with the reason and the reveal time), no finalists, "Final totals" after the crown, a finalist no longer in the rotation ("Not in rotation"), a load error with Try again, and the settings card (read-only values; "Edit settings" while editable, "locked" with the day-22 note once week 4 has started). Aggregates only: the page cannot show a viewer, an event or a time because the endpoint returns none | `pages/contest/ContestImpressionsPage.tsx`, `api/contest.ts` (`getContestExposure`) |

## 2. Judgment calls (all open to veto)

1. **"K11" is pass O.** No frame set is named K11 in the repo; the merged Figma pass for these four items is pass O (`docs/figma-pass-o-report.md`), so that is what the screens follow.
2. **The tag follows #412 item 5.** Two strings are tagged `[COPY PENDING LEGAL REVIEW]`, each with a manifest row, both exactly as the frames draw them: the carousel's sentence on how the order is decided, and the locked entry's "Only you can see this entry until then" note. Everything else (headings, pager text, the admin screen's text, the rounding note, the locked-settings line) describes no child, guardian, image or personal data and is untagged. `npm run check:pending-copy` still fails by design.
3. **The admin settings are edited on the Edit screen, not inline.** The Figma frames draw an inline "Save settings" form; the page shows the values and links to the existing Edit screen, so tolerance (1 to 50) and the daily cap (1 to 50) keep one validation and one locking path. After week 4 starts the card is read-only with the pass O line.
4. **The footer count is the number of tiles the server returned** ("Showing 1 to 3 of 6 finalists"), as drawn. With nine finalists the default `limit` of 6 means the viewer's balanced order decides which six; the page does not ask for more.
5. **A tile's name is the finalist's public name only.** The frames also show a club line ("Yaba Athletic"); no club is returned by the carousel endpoint, so it is not drawn. The thumbnail is the video's first frame (the same approach as the "Videos from Leaderboard" carousel), with the play disc always drawn.
6. **The pinned entry's lock is read from the current contest's calendar** (`final_upload` means locked), not from the post, because the post carries no reveal flag. The server enforces the lock regardless (`403 contest_final_locked`).
7. **Carousel views are impressions only on the carousel.** Opening a tile, the entry page or the profile does not count one (spec 10b); the entry page does send the ordinary view heartbeat like any post.
8. **The heartbeat is sent from every `PostCard`** (feed, club and room feeds, saved posts, the entry page, the pinned entry), not only on contest entries, because the baseline view point (B-093) applies to any post. The server decides what counts; the client never shows whether anything did.
9. **`PostCard` plays a video inline only on the entry page and the pinned entry** (`playVideo`); in the feeds it still renders a link, as before, so a feed video is never reported as being watched.

## 3. Not built / still open

- **Comment content screening**, the retention period for ledger and `ContestEngagement` rows, and the DPIA and legal copy for minors' view and dwell processing (W12 sections 4 and 5): not front-end work, unchanged.
- **B-094** (follow and post points are still awarded by the server) stays on its own backend row.
- **Video upload** for posts and final entries: no endpoint exists; the final-week composer still takes a link.
- The **carousel's club line** and the **"Your fans right now" / points boards** on the Voting page (no data), as in FC5.
- No **Playwright test can run the pre-reveal lock live**, because the final week is driven by the real clock; the lock is covered by unit tests (`PinnedEntry.test.tsx`, `PostCard.test.tsx`).
- The pass O Figma notes list open questions (where Back returns to, whether the author name opens the profile): built as Back = browser back and the author name = a link to the profile, as every other `PostCard` does.

## 4. Verification (measured)

| Suite | Before (clean `origin/main` `640ac94`, my changes stashed) | After |
|---|---|---|
| `apps/web` vitest | 85 files / 836 tests, 0 failures | **91 files / 897 tests, 0 failures** (+6 files: `points`, `useQualifiedImpression`, `useViewHeartbeat`, `FinalWeekCarousel`, `PinnedEntry`, `PostPage`; +61 tests, including new cases in `PostCard`, `CommunityPage`, `LeaderboardPage`, `ProfilePage`, `OtherProfilePage`, `router`) |
| `apps/admin` vitest | 20 files / 220 tests, 0 failures | **20 files / 230 tests, 0 failures** (the one stub test replaced by 11) |
| Playwright `e2e/` (real Chrome, real API, Postgres, Redis; one uninterrupted `npx playwright test`) | 221 tests (derived: after minus the new spec) | **229 passed, 1 skipped, 0 failed (230 tests, 6.9 min)**. New `tests/16-fc8-final-week.spec.ts`, 9 tests, all passed. The 1 skip is the pre-existing "exactly 5 attempts ... (fresh API process only)" test in spec 15 |
| `npx tsc --noEmit`, `npm run lint`, `npm run build` in both apps | | clean |
| `npm run test` pending-copy inventory (`pendingCopyManifest.test.ts`) | | passes with the two new rows |

The new Playwright spec **depends on the real clock**: the final week is live from 00:00 on day 25 (Europe/London) to the month end, so its eight live tests seed a cycle for the current London month and **skip outside that window** (they ran today, 27 October). They prove, in a real browser against the real API and database: three tiles per page in the server's order and no count in the module or the API answer; a tile opens the entry page; exactly the visible tiles send an impression, with the event id, a ratio of 0.5 or more and 1000 ms or more, the server answers `{ counted: true }` and stores exactly the six columns it documents; a finalist's own entry is not in their carousel; a heartbeat carries only activity (never watched seconds) and the response is only `{ done }`; the pinned entry shows unlocked after the reveal on the owner's profile and on another person's view of it; the admin screen shows four finalists, a mean and a band, and nowhere names the viewer. The rounded-points test does not depend on the date: two seeded rows of 13,273 and 13,271 quarter-points both show 3,318 with ranks 1 and 2, no fraction anywhere, and the note.

Screenshots from the real run: `docs/fc8-final-week-screens/`.

Not verified: a real-browser look at the mobile (390 px) carousel layout (no mobile Playwright project exists); the video thumbnails (the seeded URLs are not real videos, so the tiles show the green placeholder with the play disc).

## 5. Files

New: `lib/points.ts`, `lib/useQualifiedImpression.ts`, `lib/useViewHeartbeat.ts`, `pages/PostPage.tsx` (+ css), `pages/community/FinalWeekCarousel.tsx` (+ css), `pages/community/PinnedEntry.tsx` (+ css), their tests, `e2e/tests/16-fc8-final-week.spec.ts`. Changed: `api/contest.ts` and `api/feed.ts` (web), `app/router.tsx`, `CommunityPage.tsx`, `ProfilePage.tsx`, `OtherProfilePage.tsx`, `PostCard.tsx`, `CommunityPage.css`, `LeaderboardPage.tsx`, `leaderboard/ContestBoard.tsx`, `NotificationCentrePage.tsx` (a comment), `api/contest.ts`, `ContestImpressionsPage.tsx` and `contest.css` (admin), `docs/pending-copy-manifest.md`, `docs/build-register.md`.
