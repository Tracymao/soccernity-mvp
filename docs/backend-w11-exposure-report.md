# Backend W11: the Week-4 finalist exposure engine (B-092)

Branch `backend/w11-exposure-engine`, from `origin/main` at `2d6e535`. `services/api` only. One additive migration (`20261027100000_add_contest_impressions`, rollback in its header, timestamp later than every existing migration), no new environment variable, no frontend, no Figma, no `.docx`, no legal copy, `docs/contest-spec.md`, `docs/sprint-1-dpia-outline-draft.md` and Log Book v2.14 unedited.

Sources read first: `docs/contest-spec.md` (sections 4, 4a, 5, 10, 10b, 14e, 14f, 14g), build-register rows B-091, B-092, B-097, Decision Log #388, #400, #402 item 6, #403 item 11, #404 items 6 and 15, #405 items 1 and 7, #406 items 5 and 6 (as quoted in the spec), `docs/backend-w7-contest-report.md`, and the W7 code (`contest-lifecycle.service.ts`, `contest.service.ts`, `feed.service.ts`, the Block helper `block.util.ts`).

## 1. What was built

The Community-feed "Final week" carousel's server side. **It is live by the clock**: from the reveal (00:00 on day 25, Europe/London) to the month end (00:00 on the 1st, exclusive). No status column opens or extends it, so a late lifecycle tick can neither delay nor stretch it.

| Endpoint | Guards | What |
|---|---|---|
| `GET /contest/final-week/carousel?limit=` (default 6, max 9) | `JwtAuthGuard` | `{ live, items[] }`. An item is `{ entryId, postId, finalist: { userId, publicName }, post: { id, contentText, mediaUrls, createdAt } }`. **No count of any kind.** Outside the window, or for a restricted viewer: `{ live: false, items: [] }` |
| `POST /contest/entries/:entryId/impression` body `{ eventId, visibleRatio, visibleMs }` | `JwtAuthGuard` + `GuardianConsentGuard` | the client's qualifying event. Always 200 `{ counted }`. 409 `contest_exposure_not_live` outside the window. 404 for an unknown, hidden, non-final, ineligible or blocked entry (one identical body) |
| `GET /admin/contest/cycles/:id/exposure` | `AdminJwtAuthGuard` (as its siblings) | aggregates per finalist, the mean, the tolerance band, the spread, which videos are outside it. **No per-viewer data** |

### The rotation (spec 10b)

Ordering is **never** by engagement, live rank, follower count or recency; the only inputs are impression counts (a balancing quantity no user ever sees) and a seed.

1. The pool is every live finalist video: a round-4 entry whose post is visible (`visibleFrom` reached) and whose author is still eligible (`CONTEST_ELIGIBLE_USER`: active, verified email, not restricted).
2. `mean` = mean impressions across that whole pool (not just this viewer's candidates: the tolerance is defined against the field). `width` = `exposureTolerancePercent` of the mean.
3. The viewer's candidates are the pool minus: their own entry, any blocked pair's entry (either direction), and any video they have already seen `exposureViewerDailyCap` times today.
4. Candidates are sorted by count and cut into bands: a band is everything within `width` of the lowest count still unplaced. **The band with the fewest impressions is served first**; a video well ahead is only reached after the ones behind it ("the fewest is served next, keeping counts within a tolerance of each other").
5. Inside each band the order is a **per-viewer shuffle seeded by `viewerId:cycleId:London day`** (deterministic Fisher-Yates over a seeded PRNG), so it is stable within a day for one viewer and different between viewers and days.
6. The first `limit` are returned. With more finalists than `limit` (9 finalists, 6 tiles) the balanced order decides which six.

### The event

`POST .../impression` validates, in this order: the window (409), the entry (404), the block rule (404, same body), the viewer is not the finalist (`counted: false`), then inside one transaction under a **per-(viewer, entry, London day) advisory lock**: replay of the same `eventId` (`counted: true`, no second row), the daily cap (`counted: false`), then the insert. The unique key is `(viewerId, entryId, eventId)`.

### Admin view

Per finalist: impressions, status against the tolerance (`within` / `above` / `below`), signed deviation percent; overall: mean, lower and upper bound, min, max, how many are outside, the cycle's two settings, whether the week is live / revealed, and `source`. Before the crown it counts the live rows; **after the crown it reads the folded `ContestEntry.impressionTotal`**. A finalist whose account is no longer eligible is listed as `inRotation: false` and left out of the mean (the carousel does the same).

### Retention (built, the spec is silent)

* At the crown (`ContestLifecycleService.complete`, inside its existing transaction) every entry's per-viewer rows are folded into one aggregate `impressionTotal` and the rows are **deleted**.
* Anonymising a viewer's account (`AccountDeletionSweepService.anonymizeUser`, which the admin delete also uses) deletes that viewer's rows at once.

### Files

New: `contest-exposure.util.ts` (+ spec, 20 tests), `contest-exposure.service.ts` (+ spec, 34 tests), `dto/carousel-query.dto.ts`, `dto/record-impression.dto.ts`, `test/contest-exposure.e2e-spec.ts` (27 tests), the migration. Changed: `schema.prisma` (model `ContestImpression`, `ContestEntry.impressionTotal`, one relation array on `User`), `contest.controller.ts`, `contest-admin.controller.ts`, `contest.module.ts`, `contest-lifecycle.service.ts` (fold and purge), `account-deletion-sweep.service.ts` (one `deleteMany`), `write-route-guards.spec.ts` (one table row), the two controller HTTP specs, `modules/contest/README.md`, `docs/build-register.md` (two status lines).

## 2. How the settings are enforced

`exposureTolerancePercent` and `exposureViewerDailyCap` are read from the cycle on every request, so a change (allowed until week 4 starts, W7) takes effect at once. E2E proves both: a cap of 1 stops the second event; tolerance 10 always starts a viewer on the least-seen video while tolerance 50 makes viewers start on different videos.

## 3. Verification (measured)

See section 8 for the exact before / after counts of the mocked and API e2e suites. `npx tsc --noEmit`, `npx eslint src test` and `npx nest build` are clean; `prisma migrate diff` against the migrated test database shows no drift.

The concurrency test was **checked by mutation**: with the advisory-lock line removed, six simultaneous events from one viewer stored six rows (cap 3) and the test failed; with the lock restored it passes.

## 4. What is stored about a viewer (for the DPIA drafter; no legal copy written)

Table `ContestImpression`, one row per counted carousel impression of a Week-4 final entry:

| Field | Content | Personal data? |
|---|---|---|
| `viewerId` | the viewing account's id (foreign key to `User`) | Yes: it links the row to an account (pseudonymous, no name) |
| `entryId` | which finalist video | No (a contest entry) |
| `eventId` | a random UUID the **client** generated for the event; the idempotency key | Not derived from any device or user attribute |
| `dayKey` | the Europe/London calendar day, `YYYY-MM-DD` | With `occurredAt`, behavioural |
| `occurredAt` | the instant the server counted it (millisecond) | Behavioural |
| `id` | random UUID | No |

**Deliberately not stored:** IP address, user agent, device or browser, dwell time, the claimed visible share or milliseconds (checked, then discarded), scroll position, the tile's position in the carousel, the viewer's follower or block state, anything about the viewer's profile.

**Derived and kept:** `ContestEntry.impressionTotal`, one integer per final entry, written at the crown. It contains no viewer data and lives as long as the entry.

**Retention:** per-viewer rows exist only while the final week is live (days 25 to the month end: 4 days in a 28-day February, up to 7 days in a 31-day month, per spec section 5) and are deleted in the same transaction as the crown. Anonymising the viewer's account deletes their rows immediately. **There is no independent purge job:** if the lifecycle sweep is down at the month end, the rows survive until it next runs (it runs every minute, and every step is idempotent). Database backups at the hosting provider may hold deleted rows for the provider's own retention period (not assessed here).

**Who can read the per-viewer rows:** database operators with direct access. In the application only `ContestExposureService` reads them, for exactly three purposes: this viewer's own cap check and carousel exclusion, the aggregate count per entry across viewers, and the crown fold. **No endpoint returns a `viewerId`, an `eventId` or a `dayKey`; no user-facing endpoint returns any impression count; the admin endpoint returns aggregates only** (asserted in the unit and e2e tests by searching the response for viewer ids).

**Who the processing covers:** every non-restricted signed-in account, **including minors whose guardian has confirmed consent** (spec 10b audience). Restricted accounts are never served and never counted. The viewer has no control, no notice and no opt-out in this PR (the transparency copy of spec 10b was displaced by #400 E10 and no replacement is decided).

**Trust:** the server cannot see the viewport. It checks that the event *claims* at least 50 percent for at least 1000 ms and trusts the client for the rest. A tampering client can inflate a finalist's count by at most `exposureViewerDailyCap` per account per day per video, and only from eligible accounts. It cannot see the counts it would be inflating.

## 5. OPEN points I decided, with the default I chose

Everything here is a founder-reviewable default; none is a legal conclusion.

1. **Reading of "tolerance".** The spec says counts stay "within 10% of the mean" and the video with the fewest impressions is served next. Built as: a band is everything within `tolerancePercent` of the mean *above the lowest count still unplaced*; the lowest band goes first, each band is shuffled. The *admin flag* uses the spec's literal wording: outside = differs from the mean by **more** than the tolerance percent of the mean (exactly on the edge is within; both directions are flagged; a mean of 0 flags nothing).
2. **Which videos form the mean.** All live finalist videos of eligible authors, independent of who is asking.
3. **Own entry.** Left out of the viewer's carousel; an impression the finalist sends for their own video returns `counted: false` and is not stored.
4. **Viewer eligibility.** A restricted viewer (a minor without confirmed guardian consent) gets `live: false` on the carousel (not a 403: the feed would make that read on every load) and a 403 on the impression. An **unverified-email** viewer is still served and counted: an impression is exposure balancing, not an engagement score (spec 9a's "never counts" rule is for tallies). Veto-able.
5. **Author eligibility.** `CONTEST_ELIGIBLE_USER` (active, verified email, not restricted), stricter than feed visibility: a restricted or deactivated finalist's video is not promoted. An ineligible finalist stays on the *post's* normal visibility rules.
6. **The seed** is `viewerId:cycleId:London day` (+ the band index). "Stable within a session" is read as stable within a day. If counts change during the day a video can move to another band, so the order can change; the shuffle inside an unchanged band does not.
7. **The cap window** is the Europe/London calendar day, per (viewer, finalist video). At the cap the video leaves that viewer's carousel for the rest of the day and further events return `counted: false`. A replay of an already-counted `eventId` still returns `counted: true`.
8. **Idempotency key.** The client supplies `eventId` (a UUID). Same viewer + entry + eventId is one impression; the same `eventId` on another entry is a different event.
9. **Carousel size.** Default 6, maximum 9 (Figma pass J draws two pages of three; a month has at most nine finalists).
10. **Out-of-window behaviour.** Carousel: 200 `live: false`. Impression: 409 `contest_exposure_not_live`, including before the reveal for *any* id (so it cannot be used to probe whether a hidden entry exists). Before the reveal the finalist videos are also invisible everywhere else (W7).
11. **One 404 for everything that must not be distinguishable**: unknown id, hidden entry, a weekly entry, an ineligible author, and a blocked pair (either direction). The body is identical; tested.
12. **Block rules** apply on the carousel (both directions, including between two finalists) and on the event. The block check on the event runs after the entry is found, so a blocked pair gets the same 404 an unknown id gets.
13. **What is recorded.** Only counted impressions, only while live, only for round-4 entries. The claimed ratio and milliseconds are validated (>= 0.5, >= 1000, <= 24 h as a sanity ceiling) and discarded. A claim below the threshold is a **400**, not `counted: false`: it is a client bug.
14. **Retention**: fold and delete at the crown; delete on anonymisation (section 4). The spec states no retention; this is the minimum that serves the purpose.
15. **Admin endpoint** `GET /admin/contest/cycles/:id/exposure`, `AdminJwtAuthGuard` only (the same as every other contest admin route; the contest module has no role gate). After the crown it serves the folded totals; a legacy (no `monthKey`) cycle returns an empty, not-live result. The mean and bounds are rounded to two decimals, deviation to one.
16. **No throttling** was added to the event route beyond the cap. Each ignored call costs a cycle read and an entry read. A global rate limit is a platform decision, not this PR's.
17. **"Followers get no extra push in the module"** needs no code: the carousel has no follower input at all.
18. **The pinned entry on a finalist's profile and the entry-is-not-also-a-feed-post rule** are W7's (`Post.communityFeedFrom`, `GET /contest/users/:userId/pinned-entry`); this PR relies on them and proves the second in e2e (a follower's `GET /posts/feed` does not carry the entries while the contest runs, and the carousel tile's post opens through `GET /posts/:id`).

## 6. Not done (other register rows)

* **Frontend**: the carousel component, the event sender (the 50 percent / one continuous second timer, the re-entry rule, the `eventId`), the "tiles open the entry" links, the pinned entry on the profile. `apps/web` is untouched.
* **`apps/admin`**: the impression-distribution screen (B-097). The endpoint exists.
* **Carousel views for the pinned-entry or profile page** do not count as impressions (only the carousel does), as the spec describes the carousel as the daily exposure.
* **Transparency copy** for viewers (spec 10b), consent / DPIA wording: not written, per the brief.
* **A purge that does not depend on the lifecycle sweep** (section 4).

## 7. Founder actions

None. No environment variable, no account, no key.

## 8. Verification counts

| Suite | Before | After | Notes |
|---|---|---|---|
| Mocked (`npx jest --maxWorkers=4`) | 165 suites / 2,910 tests, 0 failures | **167 suites / 2,973 tests, 0 failures** | Before **measured** on a clean `origin/main` tree (my changes stashed). +2 suites (`contest-exposure.util.spec.ts` 20 tests, `contest-exposure.service.spec.ts` 34 tests), +9 tests in the two existing controller HTTP specs; one existing spec (`account-deletion-sweep.service.spec.ts`) needed the new `contestImpression` mock and one new assertion. `--maxWorkers=4` as in W3 (default workers time out real-HTTP specs on this machine) |
| API e2e (`npm run test:e2e`, real Postgres + Redis, `--runInBand`) | 51 suites / 611 tests (**derived**: after minus the new file) | **52 suites / 638 tests, 0 failures** | +1 suite, `test/contest-exposure.e2e-spec.ts`, 27 tests. The before figure was not re-measured (about 25 minutes); every other e2e file ran unchanged and passed |
| `npx tsc --noEmit`, `npx eslint src test`, `npx nest build` | | clean | |
| `prisma migrate diff` (migrated test DB vs `schema.prisma`) | | no difference | |

The first full mocked run after the change had 12 failures, all in `account-deletion-sweep.service.spec.ts`: the sweep now calls `tx.contestImpression.deleteMany` and that spec's hand-built transaction mock did not have the model. Fixed in the spec; the re-run above is green. The e2e covers the real call.

## 9. Register status lines

Appended (original text unchanged) to the Spec-status cell of B-092 and B-097 in `docs/build-register.md`. No B-ID added, none removed.
