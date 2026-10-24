# Backend W7: the Contest backend (B-091)

Branch `backend/w7-contest`, from `origin/main` at `ab043c7`. `services/api` only. One additive migration, no new environment variable, no frontend, no Figma, no `.docx`, `docs/contest-spec.md` unedited.

Sources read first: `docs/contest-spec.md` (including 14e and 14f), build-register row B-091 and the rows it points to, Decision Log #381 to #393, #404 items 4 to 16, #405, #406, `docs/backend-w3c-contest-notifications-report.md`, the contest-calendar util and the notification sweep.

## 1. What was built

The admin-judged contest (#218, #241) is replaced by a month that runs itself on the fixed Europe/London calendar. An admin creates a month (a **cycle**); after that no admin action is needed.

| Instant (Europe/London) | What happens |
|---|---|
| 08:00 on days 1, 8, 15 | Weeks 1 to 3 open for entries |
| 00:00 on days 5, 12, 19 | Phase 1 ends. Entries are ranked by engagement; the top 10 qualify. Fewer than 3 entries: the week is **forfeited** |
| 20:00 on days 7, 14, 21 | Votes lock. Votes alone decide the top 3 (the weekly winners); placement points are awarded; `contest_win` notification |
| 08:00 on day 22 | Week 4 opens (only when finalists are known) |
| days 22 to 24 | Finalists upload their entries; the entry is hidden |
| 00:00 on day 25 | Reveal: entries become visible, engagement opens |
| 00:00 on the 1st | The month closes: final ranking, podium, monthly standings and points (or "No winner this month"), pins removed, final entries become ordinary posts (label "Contest post") |

All "end" instants are exclusive to the millisecond. Every lifecycle step is a **claim**: a guarded `updateMany` on the status inside the transaction. Every step uses the calendar instant, never "now", so a sweep that ran a month late decides exactly what an on-time one would (proved in e2e).

### Modules (`src/modules/contest`)

- `contest-schedule.util.ts`: the calendar and `deriveCalendarState`. Reuses `contest-notifications/contest-calendar.util.ts`.
- `contest-ranking.util.ts`: Phase 1, vote and final ranking and tie-breaks, podium.
- `contest-editability.util.ts`: spec 4a (the title locks at launch; the week-4 settings lock when week 4 starts).
- `contest-eligibility.ts`: who counts (active, verified email, adult or consent-confirmed minor).
- `contest-engagement.util.ts`: engagement rows (like, comment) inside the entry's counting window; the final-entry lock (403 `contest_final_locked`); the B-093 view seam.
- `contest-lifecycle.service.ts`: the `@Cron(EVERY_MINUTE)` sweep, `runOnce(now)`, and `ensurePhase1Closed` (called from the vote path, so the first vote after Phase 1 ranks Phase 1 itself).
- `contest-voting.service.ts`: `castVote` / `retractVote`, a one-vote-per-account-per-round toggle with an event log.
- `contest.service.ts`: `GET current`, `cycles/:id`, `submitEntry`, `submitFinalEntry`, `listRoundEntries`, `getPinnedEntry`.
- `contest-admin.service.ts`: create, update (with post-launch locking), list, detail.
- `contest-read-model.service.ts`: the response shapes, withdrawn-consent redaction, the hidden task rule.

### Endpoints

User: `GET /contest/current`, `GET /contest/cycles/:id`, `GET /contest/rounds/:roundId/entries`, `GET /contest/users/:userId/pinned-entry`, `POST /contest/entries`, `POST /contest/final-entry`, `PUT` and `DELETE /contest/entries/:entryId/vote`.
Admin: `GET /admin/contest/cycles`, `/current`, `/cycles/:id`; `POST /admin/contest/cycles`; `PATCH /admin/contest/cycles/:id`.
Removed: the admin judging endpoints (`rounds/:week/results`, `final/open`, `crown`) and their DTOs.

### Feed integration

`FeedService` now: records the contest engagement row in the same transaction as the Like or Comment; refuses a like or comment on a final entry before the reveal; creates the final entry hidden (`Post.visibleFrom`) and out of the community feed (`Post.communityFeedFrom`); exposes `contest: { entryId, kind, weekNumber, pinned, label: 'Contest post' } | null` on every post. Hidden final entries are also excluded from search, anonymous view and comments.

### Migration `20261025090000_contest_self_running_lifecycle`

Additive. New columns on `ContestCycle`, `ContestRound`, `ContestEntry` and `Post`; new tables `ContestVoteEvent` and `ContestEngagement`; two CHECK constraints; one index. **Rollback** is in the migration header (drop the new tables, constraints, index and columns, in reverse order). Applied to `soccernity_test`; `prisma migrate diff` against the schema reports no difference.

## 2. How the rows satisfy the notification sweep

The W3c sweep reads `ContestVote` by `(roundId, userId)` for the votes-closing reminder. `castVote` writes exactly those rows and `retractVote` deletes them, so a voter who has voted is excluded and one who retracted gets the reminder again. The facts service now reads real week-4 entries; the planner and sweep are unchanged.

## 3. Verification (measured)

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx eslint src test` | clean |
| `npx nest build` | clean |
| `prisma migrate diff` (test DB vs schema) | no difference |
| Mocked unit suite (`--maxWorkers=4`) | 158 suites / 2,770 tests (last recorded on `main`) -> **163 suites / 2,875 tests, 0 failures** |
| `test/contest.e2e-spec.ts` (real Postgres, fake clock) | **9 tests, 0 failures** |
| Full e2e (`--runInBand`) | W6 recorded 49 suites / 577 tests -> **49 suites / 578 tests, 0 failures** (the full run showed 48 suites / 555 passing plus one suite that did not compile, `contest-notifications.e2e-spec.ts`, because it called the removed `recordRoundResults`; it was changed to drive the real lock job and then passed 23/23 on its own re-run, 555 + 23 = 578). The spec is the only e2e file that referenced the removed judging path |

Calendar edges covered: October 2026 (BST to GMT) and a November month on the whole-month e2e; February 2027 (28 days) on the followers-excluded test; the 00:00 to 08:00 between-weeks window and the exact-millisecond ends in the schedule spec; week 4 existing only when finalists are known (three forfeited weeks mean no final at all); a sweep that never ran until a month later.

## 4. Bug found and fixed on the way

`awardPoints` used `create`, and a duplicate insert (the `@@unique` on the ledger) inside the surrounding transaction aborted the whole Postgres transaction, so a re-like silently rolled the Like back (COMMIT of an aborted transaction rolls back without an error). It now uses `createMany` with `skipDuplicates`; the unit specs that mocked `create` were updated. This affects every caller of `awardPoints`, not only the contest.

## 5. OPEN, with the proposed default that is built

1. **Vote ties.** Equal count: earliest-reached, then (default) Phase 1 rank, then submission. Zero-vote entries use the same fallback.
2. **Views (B-093).** No view is recorded yet; Phase 1 ranks on likes and comments only. `recordQualifiedView` is the seam.
3. **Exposure engine (B-092).** Tolerance and per-viewer cap are stored and validated only.
4. **B-094 not done.** Follow and post point awards are still in place.
5. **Comment content screening** is an always-true seam.
6. **Entry eligibility.** An entry needs only to be the user's own post; there is no "created after the week opened" rule.
7. **Pinned entry.** All entries are pinned until month end; the profile endpoint returns the latest only. No server-side pinned ordering in the keyset feed.
8. **Final entry.** Needs at least one media URL; the video type is not verified server-side. `finalTask` is optional at creation.
9. **Title** locks at launch.
10. **Ineligible entrants** are excluded from ranking and from the forfeit count.
11. **Hashtags** of a hidden final entry are recorded at upload (a small trending-count leak until the reveal).
12. **Unhide** re-records a comment point; a surviving comment keeps its original timestamp and snapshot.
13. **Daily cap / impressions** are not built.
14. **Anonymised users.** `AccountDeletionSweep` does not remove an anonymised user's votes or engagement; they become ineligible and stop counting.
15. **Forfeit reason** wording and the contest API messages are listed OPEN in `docs/pending-copy-manifest.md`.
16. **Baseline.** The e2e baseline was not re-measured on a clean `main`; the W6 figures (49 suites / 577 tests) are cited.
17. **Whole-suite run.** The 578 figure is the sum of two runs (full run, then the one rewritten spec alone), not one uninterrupted run.

## 6. Not done (other register rows)

`apps/admin` still calls the removed judging endpoints (B-097). `apps/web` renders none of the new states (B-098, B-099, B-123).

## 7. Founder actions

None needed for this PR. Production still needs the usual launch-gate items (B-090).

## 8. Register status lines

Appended to the Spec-status cell of B-091, B-092, B-093, B-094, B-097, B-098, B-099, B-122, B-123, and recorded in `docs/build-register.md` section 34. No B-ID added or removed.
