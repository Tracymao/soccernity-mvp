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
| `contest-engagement.util.ts` | The contest side of a like / comment (called by `FeedService` in its own transaction); the final-entry lock; the B-093 view seam |
| `contest-lifecycle.service.ts` | The scheduler (`@Cron` every minute): Phase 1 close, forfeit, lock, finalists, reveal, crown, pin removal |
| `contest-voting.service.ts` | `PUT` / `DELETE /contest/entries/:entryId/vote` |
| `contest.service.ts` | `GET /contest/current`, `/cycles/:id`, `/rounds/:roundId/entries`, `/users/:userId/pinned-entry`; `POST /contest/entries`, `/contest/final-entry` |
| `contest-admin.service.ts` | `POST` / `PATCH /admin/contest/cycles`, the admin reads |
| `contest-read-model.service.ts` | The part of every response that is the same for users and admins |

## Rules worth knowing

* **Engagement** (spec 9a): one point per account per kind (a like, a comment, a qualified view), however many that account makes. Self engagement counts. An account that is not eligible (deactivated, unverified email, restricted minor) never counts - evaluated **when the tally is taken**, so an account restricted later stops counting.
* **Engagement log**: `ContestEngagement`, one row per (entry, giver, kind), written by `FeedService` in the same transaction as the Like / Comment and removed with it. Only engagement **inside the entry's counting window** is recorded (weeks 1-3: from the submission to the end of Phase 1; final: from the reveal to the end of the month). This is also where the **follow status is frozen** at the moment of engagement.
* **Tie-breaks**: Phase 1 - total, then who reached it earliest, then the earlier submission. Vote - count, then whose tally first reached it. Final - points, then comments, then earliest upload; then the minimum tally. All total orders, so exactly one user is 10th.
* **The final entry** (`Post.visibleFrom` / `Post.communityFeedFrom`): a 404 to everyone but its author until the reveal; engagement on it is refused (even the author's) with `403 contest_final_locked`; not in `GET /posts/feed` until the pin is removed. The post is created *inside* `POST /contest/final-entry`, so there is no window in which it is public.
* **Idempotency**: every lifecycle step is a *claim* (a guarded `updateMany` on the status inside the transaction that does the work). Two sweeps, or a sweep and a late retry, cannot double-award. A late tick computes the same result as an on-time one: boundaries are calendar instants, never "now".
* **Vote / entry vs the lock-time job**: both take a `FOR SHARE` lock on the round row; the job claims the round with an `UPDATE`, so it waits for in-flight writes and then sees them.
* **Legacy cycles** (`monthKey` NULL, from the admin-judged model) are never touched by the lifecycle and cannot be edited.

## Admin form (spec 4, 4a)

Create: `month` ("YYYY-MM", not yet started), `title` (<= 80), `description`, `weeks[1..3]` (`task` text + required `viewWatchLimitSeconds` 3-120), `finalTask`, **`minimumTally` (required, >= 1, admin-only)**, `placementPoints` (defaults 500/300/150 and 2000/1200/600), and the week-4 settings `followersExcludedWeek4`, `exposureTolerancePercent` (1-50), `exposureViewerDailyCap` (1-50). Dates are derived and never editable. Edit: locked from the instant week 1 opens (title, minimum tally, points, the watch limit of any started week); the week-4 settings lock when week 4 starts; the description and the tasks of weeks not yet started stay editable. A locked field posted unchanged is not an edit. Every create / edit is written to `AdminActionLog` (field names only).

## Not built here (flagged)

* **View qualification** (B-093): no heartbeat endpoint exists, so no view is ever recorded; Phase 1 effectively ranks on likes + comments. `recordQualifiedView` is the one call B-093 makes.
* **The exposure engine** (B-092): the tolerance and per-viewer cap are stored and validated but nothing serves a balanced rotation yet.
* **The quarter-point ledger** (B-093). The follow / post point awards were removed by B-094.
* **`apps/admin`** still calls the removed judging endpoints (B-097) and `apps/web` does not render the new states (B-098, B-099).
* Open questions and every judgment call: `docs/backend-w7-contest-report.md`.
