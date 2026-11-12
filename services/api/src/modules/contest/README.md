# contest

The self-running weekly video-skill Contest (`docs/contest-spec.md`, Decision Log #381-#406, build register B-091).

> **Supersedes** the admin-judged design of Decision Log #218 / #241 / #243 that earlier versions of this README described. Contests are **not** admin-judged (spec section 3). The endpoints `POST /admin/contest/cycles/:id/rounds/:week/results`, `.../final/open` and `.../crown` no longer exist.

## What it does

A contest is one **London calendar month**. An admin creates it (and edits it within locking rules); from there it runs itself on the clock.

| Moment (Europe/London) | What happens |
|---|---|
| 08:00 on day 1 / 8 / 15 | Week 1 / 2 / 3 opens. Entries accepted (Phase 1) |
| 00:00 on day 5 / 12 / 19 | Phase 1 ends. Entries are ranked by engagement; the **top 10 qualify**. **Fewer than 3 entries: the week is forfeited** (nobody placed, no points, reason recorded) |
| day 5-7 (to the lock) | Phase 2: a **vote** (one per account, self-vote allowed, toggle on/off) |
| 20:00 on day 7 / 14 / 21 | **Lock.** Tally frozen; top 3 by votes win; weekly placement points awarded; `contest_win` notification per winner |
| 08:00 on day 22 | Week 4 opens. **Finalists** (the distinct weekly winners) upload a NEW video (`POST /contest/final-entry`). Hidden from everyone but the author |
| 00:00 on day 25 | **Reveal.** Cycle becomes `final`; finalist videos become visible; likes + comments start counting |
| 00:00 on the 1st | **Crown.** Final entries ranked (likes + comments, minimum tally); top 3 crowned or "No winner this month"; monthly points; **pins removed**; final entries become ordinary posts |

Every boundary is **exclusive at its end, to the millisecond** (`contest-schedule.util.ts`): an entry at 23:59:59.999 on day 4 is in time, one at 00:00:00.000 on day 5 is not; a vote at 19:59:59.999 counts, one at 20:00:00.000 is refused. BST/GMT is handled by `contest-notifications/contest-calendar.util.ts` (Intl, no dependency); October 2026's clock change is tested.

## Files

| File | Role |
|---|---|
| `contest-schedule.util.ts` | The month as exact UTC instants; `deriveCalendarState`; the window predicates. Pure |
| `contest-ranking.util.ts` | Engagement tally, Phase 1 / vote / final rankings and every tie-break. Pure |
| `contest-editability.util.ts` | What an admin may still edit (spec 4a). Pure |
| `contest-eligibility.ts` | Who counts: active, verified email, not restricted |
| `contest-engagement.util.ts` | The contest side of a like / comment (called by `FeedService` in its own transaction); the final-entry lock; `recordQualifiedView`, called by `ViewQualificationService` (B-093) |
| `contest-lifecycle.service.ts` | The scheduler (`@Cron` every minute): Phase 1 close, forfeit, lock, finalists, reveal, crown, pin removal |
| `contest-voting.service.ts` | `PUT` / `DELETE /contest/entries/:entryId/vote` |
| `contest.service.ts` | `GET /contest/current`, `/cycles/:id`, `/rounds/:roundId/entries`, `/users/:userId/pinned-entry`; `POST /contest/entries`, `/contest/final-entry` |
| `contest-admin.service.ts` | `POST` / `PATCH /admin/contest/cycles`, the admin reads |
| `contest-exposure.util.ts` | B-092: the impression thresholds, the London-day key, the seeded shuffle, the balanced-rotation ordering and the admin spread. Pure |
| `contest-exposure.service.ts` | B-092: the Final-week carousel, the impression event, the admin distribution view |
| `contest-read-model.service.ts` | The part of every response that is the same for users and admins |
| `contest-derivation.ts` | B-300: THE ONE DERIVATION. The loaders that turn rows into the Phase 1 ranking, the weekly podium and the monthly crown; the lifecycle and the removal reconcile both call them, and every ranking leaves out an entry whose post a moderator removed |
| `contest-removal.rules.ts` | B-300: the pure rules of a removal (backfill, forfeiture, returning freed votes, podium and prize diffs, the finalist set). No database, no clock |
| `contest-entry-removal.util.ts` | B-300: the reconcile seam `content-removal.util.ts` calls in the removal's own transaction |
| `contest-finalists.util.ts` | B-300: the finalist freeze (`ContestFinalist`, `ContestCycle.finalistsFrozenAt`) |

## Rules worth knowing

* **Engagement** (spec 9a): one point per account per kind (a like, a comment, a qualified view), however many that account makes. Self engagement counts. An account that is not eligible (deactivated, unverified email, restricted minor) never counts - evaluated **when the tally is taken**, so an account restricted later stops counting.
* **Engagement log**: `ContestEngagement`, one row per (entry, giver, kind), written by `FeedService` in the same transaction as the Like / Comment and removed with it. Only engagement **inside the entry's counting window** is recorded (weeks 1-3: from the submission to the end of Phase 1; final: from the reveal to the end of the month). This is also where the **follow status is frozen** at the moment of engagement.
* **Tie-breaks**: Phase 1 - total, then who reached it earliest, then the earlier submission. Vote - count, then whose tally first reached it. Final - points, then comments, then earliest upload; then the minimum tally. All total orders, so exactly one user is 10th.
* **The final entry** (`Post.visibleFrom` / `Post.communityFeedFrom`): a 404 to everyone but its author until the reveal; engagement on it is refused (even the author's) with `403 contest_final_locked`; not in `GET /posts/feed` until the pin is removed. The post is created *inside* `POST /contest/final-entry`, so there is no window in which it is public.
* **Idempotency**: every lifecycle step is a *claim* (a guarded `updateMany` on the status inside the transaction that does the work). Two sweeps, or a sweep and a late retry, cannot double-award. A late tick computes the same result as an on-time one: boundaries are calendar instants, never "now".
* **Vote / entry vs the lock-time job**: both take a `FOR SHARE` lock on the round row; the job claims the round with an `UPDATE`, so it waits for in-flight writes and then sees them.
* **A removed entry** (B-300) is out of every ranking and tally; see "Removed entries" below.
* **Legacy cycles** (`monthKey` NULL, from the admin-judged model) are never touched by the lifecycle and cannot be edited.

## Removed entries (B-300; Decision Log #488, extending #483)

A moderator's `content_removed` on the post of a contest entry (soft, `Post.removedByModerationAt`) makes the contest treat the entry as removed. It is ONE seam: `applyContentRemoval` / `restoreContentRemoval` (modules/moderation) call `onContestEntryPostRemoved` / `onContestEntryPostRestored` in the SAME transaction, which DERIVES the desired state with the same loaders the lifecycle uses (removed entries filtered out) and writes only the difference, so the effect is idempotent and a lifecycle tick, a removal and a restore always agree. Lock order everywhere: the cycle row, then a round row (`FOR UPDATE`); the vote path takes the round `FOR SHARE` and refuses a removed entry inside that locked transaction, so a vote and a removal can never both win.

| When the post is removed | What happens |
|---|---|
| Phase 1 still open | Nothing is stored yet. The end-of-Phase-1 ranking leaves the entry out: it counts toward neither the 10 nor the "fewer than 3 entries" test |
| Voting, before the lock | The Phase 1 ranking is re-run over the remaining entries and the slate is **backfilled** to 10 (`qualified` is MONOTONE: removal never clears it, a restore never clears another entry's, so after a restore the slate can hold 11 or more). The entry's votes are **freed** (rows deleted, a `release` event in `ContestVoteEvent`), so those voters may vote again. If fewer than 3 eligible, non-removed entries remain the week is **forfeited** (`judgedAt` = the real instant of the removal) |
| After the lock instant, lock job not yet run | Nothing is changed; the job derives the podium with removed entries left out |
| After the lock (`judged`) | **No forfeiture.** The weekly podium is recomputed from the frozen tally without the entry; `ContestRoundWinner` rows and the placement points are rewritten. Everyone is paid for the place they end up in (a person who moves up gets the higher prize, one who no longer places has the ledger row revoked, never deleted). The `contest_win` notice goes only to a person who becomes a winner of that round for the first time (no placement-ledger row had ever existed for them) |
| After the crown | The monthly podium is recomputed the same way: `ContestStanding`, `contest_monthly_crown` points, `ContestEntry.finalRank` / `finalTally` for the remaining entries, and `ContestCycle.noWinner` (true when nobody places). No notices |

An **overturned appeal** (`restoreContentRemoval`) reverses all of it: the entry is ranked again; before the lock freed votes return (original `createdAt`) only for a voter whose latest event in the round is that `release` AND who holds no vote now, and a week forfeited by the removal is reinstated only before its lock instant; after the lock the podiums and prizes are recomputed again. The points the post earned (baseline engagement: the givers' and the author's) are revoked with it, stamped `PointsLedgerEntry.revokedForRemovalAt`, and a restore brings back exactly those rows (a row revoked for another reason is never restored; a row whose giver or author is no longer eligible stays revoked).

**Finalists freeze.** From the instant Week 4 opens (`schedule.final.opensAt`) the finalist set is stored once (`ContestFinalist`, `ContestCycle.finalistsFrozenAt`, stamped with that calendar instant) under a lock on the cycle row, by whichever comes first: the lifecycle tick, a final-entry submission or a removal that is about to change a podium. From then on every reader (`ContestReadModel`, `POST /contest/final-entry`, the notification planner) uses the stored set: a person promoted to weekly winner afterwards gets the weekly points and notice but cannot enter the final, and a weekly winner who loses the win afterwards stays a finalist. Before the freeze the finalists are still derived from the weekly winners, so a changed podium corrects them by itself.

**Reads.** `callerVote`, vote counts and the entry lists ignore removed entries; the admin cycle detail still lists the entry with `removedByModeration: true` and a vote count of 0; the admin exposure view excludes a removed final entry.

**Hard delete changes nothing further.** The author may still `DELETE /posts/:id` on a removed entry's post: the removal's effects were already applied, and the cascade only drops the entry's own rows (`ContestEntry`, and through it `ContestVote`, `ContestEngagement`, `ContestImpression`, `ContestRoundWinner`). The report-retention sweep still keeps such a post (blocked, counted) and is unchanged.

## Admin form (spec 4, 4a)

Create: `month` ("YYYY-MM", not yet started), `title` (<= 80), `description`, `weeks[1..3]` (`task` text + required `viewWatchLimitSeconds` 3-120), `finalTask`, **`minimumTally` (required, >= 1, admin-only)**, `placementPoints` (defaults 500/300/150 and 2000/1200/600), and the week-4 settings `followersExcludedWeek4`, `exposureTolerancePercent` (1-50), `exposureViewerDailyCap` (1-50). Dates are derived and never editable. Edit: locked from the instant week 1 opens (title, minimum tally, points, the watch limit of any started week); the week-4 settings lock when week 4 starts; the description and the tasks of weeks not yet started stay editable. A locked field posted unchanged is not an edit. Every create / edit is written to `AdminActionLog` (field names only).

## The Week-4 finalist exposure engine (B-092; Decision Log #388, #400, #403 item 11, #404 items 6 and 15, #405 item 7, #406 item 6; spec section 10b)

Goal: every finalist gets comparable community exposure, independent of follower count, prior engagement or upload time. **Live = by the clock**, from the reveal (00:00 on day 25) to the month end (00:00 on the 1st, exclusive); no status column opens or extends it. Full detail and every adopted default: `docs/backend-w11-exposure-report.md`.

| Endpoint | Who | What |
|---|---|---|
| `GET /contest/final-week/carousel?limit=` (default 6, max 9) | any signed-in account (`JwtAuthGuard`); a **restricted** viewer gets `live: false` | `{ live, items[] }`: entry id, post id, finalist public name, narrow post. **No count of any kind**, ever |
| `POST /contest/entries/:entryId/impression` `{ eventId, visibleRatio, visibleMs }` | `JwtAuthGuard` + `GuardianConsentGuard` | the client's qualifying event (>= 50% of the tile in view for one uninterrupted second). Always 200 `{ counted }`; 409 `contest_exposure_not_live` outside the window; 404 for an unknown, hidden, non-final, ineligible or **blocked** entry (all the same body) |
| `GET /admin/contest/cycles/:id/exposure` | `AdminJwtAuthGuard` | aggregate impressions per finalist, the mean, the tolerance band, the spread and which videos are outside it. **No per-viewer data** |

* **Ordering** is the balanced-impression rotation, never engagement, rank, follower count or recency: videos are grouped into bands (a video is in the lowest remaining band when its count is within `tolerancePercent` of the **mean across all live finalist videos** of that band's lowest count), the band with the fewest impressions is served first, and each band is shuffled by a per-viewer, per-London-day seeded shuffle. Stable within a day for one viewer; different between viewers and days.
* **Left out of a viewer's carousel**: their own entry, a blocked pair's entries (either direction), a video they have already seen `exposureViewerDailyCap` times today, a finalist whose account is no longer eligible. The mean ignores the viewer's own exclusions (the tolerance is against the whole field).
* **Settings enforced** from the cycle: `exposureTolerancePercent` and `exposureViewerDailyCap` (week 4 only, locked once week 4 starts - W7).
* **Idempotent and race-safe**: unique `(viewerId, entryId, eventId)`; a per-(viewer, entry, London day) advisory lock makes the cap exact under concurrency.
* **Stored about a viewer** (`ContestImpression`): `viewerId`, `eventId`, `dayKey`, `occurredAt`, and the entry. Nothing else (no IP, user agent, dwell time, device). **Retention**: deleted at the crown (folded into `ContestEntry.impressionTotal`, one aggregate per entry) and deleted at once when the viewer's account is anonymised.
* The carousel entries are **not** normal feed posts: `Post.communityFeedFrom` (W7) keeps them out of `GET /posts/feed` until the pin is removed.

## Not built here (flagged)

* **View qualification** (B-093, built by `backend/w12-points`): `POST /posts/:id/view-heartbeat` (`modules/view-qualification`) records a `ContestEngagement` row of kind `view` once the server-credited watch time meets the contest threshold (video: min(length, the round's `viewWatchLimitSeconds`); photo and text: 5 s; never in the week-4 final), so Phase 1 now ranks on views + likes + comments. The follow snapshot and the counting window are applied by the same `recordEntryEngagement` a like uses.
* ~~The exposure engine~~ is built (B-092): see "The Week-4 finalist exposure engine" below.
* **The quarter-point ledger** (B-093, built): placement prizes are written in quarter-point units (the admin's whole-point figures x 4) by `ContestLifecycleService`; everyday giver / receiver points, caps and revocation are in `modules/points`. The follow / post point awards were removed by B-094.
* **`apps/admin`** still calls the removed judging endpoints (B-097) and `apps/web` does not render the new states (B-098, B-099).
* Open questions and every judgment call: `docs/backend-w7-contest-report.md`.

## Final-entry media and the media gate (backend/w14-post-media-pipeline; Decision Log #419 item 7)

`POST /contest/final-entry` takes `{ contentText, mediaId }`: exactly one VIDEO the caller uploaded through `POST /media/uploads`
(owned, unattached, not rejected). The pasted-link field (`mediaUrls`) is gone and refused. A final entry whose video is not
APPROVED is not shown however the reveal clock stands: the entry list, the pinned entry, the Final-week carousel and the
impression endpoint all apply the post-media gate, and the lifecycle leaves such an entry out of the weekly Phase 1 ranking
(`closePhase1`) and out of the final ranking (`complete`), so it can never win. A contest entry's file cannot be removed by its
owner (409 `media_in_contest_entry`). OPEN: the upload deadline (23:59:59 on day 24) leaves no time for a moderator to review a
file the automatic check held, so such an entry is simply not shown (recorded in the W14 report).
