# Backend W12: the leaderboard points engine (B-093)

Branch `backend/w12-points-engine`, from `origin/main` at `e3818e2` (W11, PR #464, merged). `services/api` only, plus `render.yaml`, `.env.example` and docs. One migration (`20261028090000_points_engine_quarter_units`, rollback in its header), two new environment variables, no frontend, no Figma, no Decision Log `.docx`, no `docs/sprint-1-dpia-outline-draft.md`, no Log Book, `docs/contest-spec.md` unedited, no legal copy.

Sources read first: `docs/contest-spec.md` sections 9a to 9e and 13 (and 14 to 14g for later confirmations), Decision Log #382 to #385 as quoted there, `docs/backend-w7-contest-report.md` (the seams W7 left: `recordQualifiedView`, the comment-screening seam), `docs/backend-w11-exposure-report.md`, and the code of `points`, `leaderboard`, `feed`, `contest` and `contest-engagement.util.ts`.

## 1. What was built

| Brief item | Built |
|---|---|
| (1) Quarter-point ledger, rounded display | `PointsLedgerEntry.points` and `LeaderboardEntry.points` become `quarterPoints` (1 point = 4 units). The API shows the value rounded to the nearest whole point, a half rounding up (`quartersToDisplayPoints`); ranking uses the exact stored value |
| (2) Giver / receiver, daily caps, revocation, self-exemption, verified email, screening | `points/engagement-points.util.ts` |
| (3) Server-validated view heartbeats, `recordQualifiedView` wired | New module `view-qualification`, `POST /posts/:id/view-heartbeat` |
| (4) Placement awards per 9d from the admin settings W7 stored | `ContestLifecycleService` now writes the admin's whole-point prizes x 4 |
| (5) B-094 intact | Confirmed: no engagement kind for posts or follows exists; `ENGAGEMENT_POINTS` is gone; tests assert it |

### Ledger shape (migration `20261028090000_points_engine_quarter_units`)

`PointsLedgerEntry` gains `postId`, `counterpartId` (the account whose engagement earned a received row) and `revokedAt`, and `points` becomes `quarterPoints` (all existing values multiplied by 4, so one point stays one point). `LeaderboardEntry.points` becomes `quarterPoints` (x4; it is a rollup recomputed every 15 minutes anyway). The old source `engagement_like` becomes `engagement_like_given`. Sources: `engagement_{view,like,comment}_{given,received}`, `contest_weekly_win`, `contest_monthly_crown`, `competition_result` (reserved). A CHECK keeps `quarterPoints >= 0`. A received row is keyed `<postId>:<giverId>` so the existing `@@unique([source, refId, userId])` gives "one quarter point per unique account per post". The ledger stays append-only: a revoked row is **marked**, never deleted or made negative.

### Engine rules (`engagement-points.util.ts`)

- **Giver** 1 point (4 units) and **creator** 0.25 (1 unit) per qualifying view / like / comment per unique post. One comment point per account per post however many comments.
- **Self-engagement** exempt (nothing is even read).
- **Eligibility** is read when the point is awarded and reuses the contest's test: active account, verified email, adult or a minor whose guardian has confirmed consent. Same rules for minors.
- **Daily caps**, Europe/London calendar day (the day is the London midnight-to-midnight window of the instant, DST-safe: 23 and 25 hour days are tested): 40 points for giving, 20 for receiving, from `POINTS_DAILY_CAP_GIVEN` / `POINTS_DAILY_CAP_RECEIVED` (whole points; a bad or blank value falls back to the default, never to "no cap"). The cap check is read-then-write, so it is serialised per (side, account, London day) by a transaction-scoped Postgres advisory lock (taken in sorted order; proven by a concurrent-likes e2e).
- **Revocation** marks `revokedAt`: unlike; the account's last visible comment deleted or hidden; a removed post (every baseline row for it); an account later restricted (what it earned, and what it earned others). A revoked row counts for nothing, **including the cap**, so revoking frees that day's cap. **Restore**: a re-like or an unhide clears the mark, re-dates the row to now, re-snapshots the represented club and re-checks the cap; the engagement earns its point once (like, unlike, like, unlike, like still nets one).
- **Content screening**: comments pass through the existing `commentCountsForContest` seam, still always true (no comment screening exists). It remains a seam.
- The rollup sums `quarterPoints` of unrevoked rows. **The old weekly cap of 100 on the rollup is removed** (section 3, item 9).

### View heartbeats (`modules/view-qualification`)

`POST /posts/:id/view-heartbeat { sessionId, active, positionSeconds?, durationSeconds? }`, `JwtAuthGuard` only. The server keeps the clock (the client never says "seconds watched"): it credits the gap between two beats only if both said `active`, the gap is at most 6 s, and for a video the playhead advanced (a pause, a rewind or loop, or a skip faster than 2x earn nothing). When credited time meets a threshold the outcome fires once per session: the baseline point (points engine) and, for a weeks-1-3 contest entry inside its counting window, `recordQualifiedView` (a `ContestEngagement` kind `view` row), so Phase 1 ranking now uses views + likes + comments. Thresholds (spec 9c): baseline photo / text 3 s, video full length if under 60 s else 60 s; contest video min(length, the round's `viewWatchLimitSeconds`), photo 5 s, no views in the final. Details, limits and the data list: `modules/view-qualification/README.md`.

### Placement points

Unchanged in behaviour, now in quarter units: the admin's `weeklyPoints1..3` / `monthlyPoints1..3` (W7 stored and validated them) x 4 at the 20:00 lock and at the crown. Forfeited weeks and "No winner this month" award nothing (unchanged). Never capped, never touched by a revocation.

## 2. Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit`, `npx eslint src test`, `npx nest build` | clean |
| Migration | applied to `soccernity_test` by the e2e global setup; rollback in the header |
| Mocked unit suite (`npx jest --maxWorkers=4`) | W11 recorded 167 suites / 2,973 tests -> **174 suites / 3,077 tests, 0 failures** |
| API e2e (`npm run test:e2e`, real Postgres + Redis, `--runInBand`) | W11 recorded 52 suites / 638 tests -> **53 suites / 676 tests, 0 failures** (one uninterrupted `npm run test:e2e` run). +1 suite (`test/points-engine.e2e-spec.ts`, 36 tests) and +2 net tests in `test/leaderboard.e2e-spec.ts`. The before figure is the W11 report's, not re-measured |

The mocked "before" is the W11 report's recorded figure on `origin/main`, **not re-measured**. +7 suites (`quarter-points.util.spec.ts`, `points-config.service.spec.ts`, `engagement-points.util.spec.ts`, `view-thresholds.util.spec.ts`, `view-session.util.spec.ts`, `view-qualification.service.spec.ts`, `view-qualification.controller.http.spec.ts`). Existing specs updated for the new column and the removed cap: the leaderboard unit and e2e specs, `contest.e2e-spec.ts` (prizes assert `quarterPoints`), `feed.service.spec.ts` (the engine is mocked there and +8 tests assert when it is called), `admin-users.service.spec.ts`, `guardian-consent-refusal.service.spec.ts` (+3), `points.util.spec.ts`, `write-route-guards.spec.ts` (one open-route row). New e2e `test/points-engine.e2e-spec.ts` (36 tests, real Postgres and Redis, injectable clock): given / received rows with every field, idempotency, self-exemption, unique accounts, revoke and restore, comment rules, hide / unhide, a removed post, the giver cap with revocation freeing it and a London-day reset, the receive cap, the London-day boundary in BST, 6 concurrent likes cannot overshoot, unverified / restricted / confirmed minors, a guardian withdrawal and an admin suspension revoking, photo / text / short video / long video heartbeats, burst, silence, inactive, pause, skip, loop, a block, no dwell data in Postgres and a Redis TTL, contest views with the contest threshold, the entrant's own view, and Phase 1 ranking, and the leaderboard sum with a revoked row.

## 3. OPEN points, with the default I adopted (all veto-able)

1. **Column rename.** `points` becomes `quarterPoints` on both tables (a rename, so a unit can never be read as a point). Existing values x4. Legacy rows from a removed source (`engagement_post`, `engagement_follow`) are left as they are (nothing is live; B-094 says no handling).
2. **Revocation is a mark, not a delete.** The ledger stays append-only.
3. **Caps are independent and all-or-nothing per direction.** A capped giver still earns the creator their quarter point and the other way round. A capped engagement leaves no row and is **not queued**: freeing the cap later does not pay it out. A giver award is 4 units, so it either fits the cap or does not.
4. **Eligibility.** An engagement from an ineligible account counts for nobody (giver and creator earn nothing); an ineligible **creator** does not stop the **giver** earning.
5. **Baseline also applies to engagement on contest entries.** The like is still a like; the contest tally is a separate record.
6. **A restored engagement** is re-dated to the restore time, so it counts for that day's cap and that week's board.
7. **Hiding a comment counts as removing it** for points (the same rule the contest uses); unhiding restores.
8. **"Account later restricted"** is wired to the two real paths: a guardian consent refusal / withdrawal / expiry (`GuardianConsentService.refuseConsentAndScheduleDeletion`) and an admin suspension (`AdminUsersService`). **Not** undone when a restriction lifts (engagement simply earns again from then). **Not** triggered by a self-service deactivation (reversible, and `GET /leaderboard` already hides inactive accounts) nor by anonymisation (the rows hold opaque ids and the account is off the board).
9. **The weekly cap of 100 on the rollup is removed.** It was a read-time stand-in for a missing write-side cap, and 100 a week contradicts the spec's "about 1,800 per month". The two daily caps replace it.
10. **Text-only contest entries** use the photo rule (5 s); the spec names only video and photo.
11. **Video length is client-reported and unverifiable.** Bounded: a view never qualifies in under 1 s, a missing length means 60 s (baseline) or L (contest), the last 0.5 s of a "full length" video is forgiven (a playhead cannot pass the end). Residual risk is in the module README.
12. **Heartbeat constants** (not in the spec): beat every 3 s, a gap over 6 s earns nothing, playback faster than 2x is a seek, 1 s position tolerance, session expires 120 s after the last beat, 240 beats a viewer a minute (429 above). The response is `{ done }` only and never says whether a point was awarded.
13. **A creator's own view of their contest entry counts in the contest tally** (self-engagement counts in contests) but earns no everyday points.
14. **Caps are environment configuration**, not a database settings table or an admin screen ("held in configuration"). A change needs an environment update and a restart. `render.yaml` carries both values for both services.
15. **Hidden final entries**: a heartbeat on one is a 404 for everyone but the author (the same visibility rule as every post read).
16. **No notification** is sent for points.

## 4. For the DPIA drafter: the exact view / dwell data per viewer

Written from the code, not from a summary. **I did not edit the DPIA or the legal copy.**

| Where | Exactly what | Retention | Who / what can read it |
|---|---|---|---|
| Redis `viewhb:s:<viewerId>:<postId>:<sessionId>` | last beat time (epoch ms), last `active` flag, last playhead position (video, seconds), credited seconds, two "done" flags | expires **120 s** after the last beat | the API process only |
| Redis `viewhb:rate:<viewerId>` | a beat counter | 60 s window | the API process only |
| Redis `viewhb:lock:...` | a lock | 5 s | the API process only |
| Postgres `PointsLedgerEntry`, only when a threshold is met | for the viewer a `engagement_view_given` row; for the creator a `engagement_view_received` row: user, post, counterpart (the viewer, on the creator's row), quarter points, time, the user's represented-club snapshot, `revokedAt` | append-only; **no retention period is defined** (open) | database operators; no endpoint returns ledger rows; `GET /leaderboard` returns per-user totals only |
| Postgres `ContestEngagement`, only for a weeks-1-3 contest entry when the contest threshold is met | entry, viewer, kind `view`, whether the viewer followed the creator at that moment, time | lives with the entry; **no retention period is defined** (open) | database operators; contest endpoints return tallies, never the log |

**Never stored anywhere:** dwell seconds, playhead, session id, IP address, user agent, device, mute state, scroll position, viewport. **Minors:** the same pipeline applies to minors (the founder: "same rules for minors"); this is new processing of children's data and counsel has not reviewed it (`docs/contest-spec.md` open item 8). A view by a restricted or unverified account is processed (the beats reach Redis) but writes nothing to Postgres.

## 5. Not done / flagged

- **`apps/web` does not send heartbeats.** The client sender (every 3 s while a post is on screen; `active` = visible + foreground + playing) is the frontend half of B-093 / B-098.
- **Comment content screening** is still the always-true seam.
- **Retention** of ledger and `ContestEngagement` view rows is undefined.
- **Placement-prize "revoke if the account is later restricted"** is not done: prizes are not baseline rows (the spec's revocation list is about engagement).
- **Unverifiable client claims** (video length, "active") as described in section 3, item 11.
- **Account-level cap counter** is computed from the ledger on every award (indexed by user and time) rather than stored; fine at MVP volume.
- Working-tree note: several files in this repo have mixed line endings; edits kept each file's existing endings.

## 6. Founder actions

None needed for this PR. Set `POINTS_DAILY_CAP_GIVEN` / `POINTS_DAILY_CAP_RECEIVED` in Render only if the founder wants figures other than 40 / 20 (they are declared in `render.yaml` with those defaults). "Revisit after two weeks of live data" (spec 9b) is a calendar item, not a code one.

## 7. Register status lines

Appended to the Spec-status cell of B-091, B-093, B-094 and recorded in `docs/build-register.md` section 46. No B-ID added or removed (231).
