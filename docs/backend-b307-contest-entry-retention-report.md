# B-307: lifting the Contest-entry block in the report-retention sweep

Branch `backend/b307-contest-entry-retention-lift`. `services/api` and docs only. No schema change, no migration, no new environment variable, no `apps/*`, Figma, Build Plan docx, `docs/build-register.md` or `docs/pending-copy-manifest.md`.

## What changed

`ReportRetentionService` (B-294, periods 6 / 7 years from B-299) kept forever any report whose removed post is a Contest entry, because `Post -> ContestEntry` is `ON DELETE CASCADE`. That exceeds the 6 / 7-year retention period counsel approved. Decision Log #493 (c) kept the block only until B-300 (PR #742) landed.

Now step 5 of `evaluate()` blocks only when `contestEntryStillCounts(db, plan.postIds)` is true (`contest-entry-retention.util.ts`):

* the entry's cycle is not `completed`, or
* the entry still holds a `ContestRoundWinner` row.

Everything else about the sweep is unchanged: the closure predicate (`reportClosedAt`), the 6 / 7-year clocks, the hold / escalation / open-appeal / other-open-report skips, the `context_of_other_report` block, the cap, the detach step. `BlockReason` and the `blockedContestEntry` counter are kept, and so is the log line shape (`blocked(contestEntry=… contextOfOtherReport=…)`); the contest count is now normally 0. The header comment and the moderation README are updated.

## Cascade analysis

The Prisma schema is the source of truth. A spec (`contest-entry-retention.util.spec.ts`) reads `Prisma.dmmf` and fails if the set of models that reference `ContestEntry`, or their `onDelete`, ever differs from the table below, so a new relation has to be analysed before the purge can touch it.

Deleting the post deletes the `ContestEntry` row, and from there exactly these four tables (all `ON DELETE CASCADE`):

| Table deleted by the cascade | Does it still count after B-300, for a removed entry in a completed cycle? |
|---|---|
| `ContestRoundWinner` | No. B-300 deleted the removed entry's winner row when the post was removed (promotion in place) and revoked the placement points. A restore cannot happen after the report is closed. |
| `ContestVote` | No. Every ranking, tally and "my vote" read filters `post: { is: POST_NOT_REMOVED }`; the weekly podium is derived from non-removed entries only. Before the lock the votes were released (the voter's slot freed). |
| `ContestEngagement` | No. The Phase 1 and monthly rankings take non-removed entries only. Baseline points live in `PointsLedgerEntry`, which has no foreign key to any of this. |
| `ContestImpression` | No. Folded into `impressionTotal` and deleted at the crown (completed cycle); the exposure view and the admin distribution filter removed entries. |
| the `ContestEntry` row | No. Its stored tally / rank are read only through the same non-removed filters. |

Not touched by the cascade (no foreign key to `ContestEntry`; the spec asserts it): `PointsLedgerEntry`, `ContestVoteEvent`, `Notification`, `LeaderboardEntry`, `ContestStanding`, `ContestFinalist`. Finalists are keyed by cycle and user, not by entry.

## Cases kept blocked, and why

Two cases, because there the cascade WOULD remove something that counts. No other rule was invented.

1. **The cycle is not `completed`.** Its votes and tallies are still inputs to the lifecycle. With the shipped 6 / 7-year periods this is unreachable (a report cannot be due before closure + 6 years); it guards a mis-set period or a stuck cycle.
2. **The entry still has a `ContestRoundWinner` row.** B-300 deletes a removed entry's winner row, so one that remains means a LEGACY admin-judged cycle (`monthKey` NULL, which B-300 leaves alone) or an unreconciled state. A winner row is a placed result; the cascade would delete it.

Question for Temi (not decided here): should a legacy cycle's winner be kept forever, handled by a separate rule, or does the legacy path need its own migration? I built nothing for it.

## Restored entry and pending appeal

The candidate scan takes only reports with a non-null `reportClosedAt`. A pending appeal gives `null`; an overturned appeal reopens the report (`status: 'open'`) and also gives `null`. So neither can reach the Contest check. Proved by test (below), with a 2040 purge date.

## Before / after proof (real Postgres, real moderation path)

`test/contest-entry-retention.e2e-spec.ts` runs the real path (`POST /reports`, `PATCH /admin/moderation/reports/:id`, appeal, second-admin overturn) on the fake clock of `contest-removal.e2e-spec.ts`, plays the month to `completed`, snapshots, calls `purgeDue(2040-01-01)`, snapshots again and requires equality. The snapshot covers: cycle, rounds, winners, standings, finalists, every non-removed entry (tallies, ranks), their votes and engagements, the whole `ContestVoteEvent` table, the whole `PointsLedgerEntry` table, `LeaderboardEntry` after `rollupPeriod` for 2026-W40..W44 and `all-time`, all notifications except the post-scoped like / comment / media ones (those go with the post by design), and the HTTP responses of `GET /contest/current`, `GET /contest/rounds/:id/entries` and `GET /leaderboard?period=all-time`.

| Test | Result |
|---|---|
| revoked weekly entry (removed before Phase 1 closed): report, post and entry deleted; snapshot identical; admin cycle detail differs only by the removed entry's row and the round's `entryCount` (one lower) | pass |
| revoked winner after the lock (podium promoted in place to B, C, D): snapshot identical; prize points A none / B 2000 / C 1200 / D 600 quarter-points | pass |
| Week-4 final entry removed after the crown: standings, finalists and crown points identical | pass |
| 6- and 7-year clocks: ordinary report not purged at 6y minus a day, purged at 6y plus a day; child-safety (`concernsMinor`) report kept at 6y plus a day and 7y minus a day, purged at 7y plus a day | pass |
| pending appeal never purged; overturned (restored) entry never purged; snapshot unchanged, entry and post intact | pass |
| skips still win: legal hold (`skippedHold` 1), escalation (`skippedEscalated` 1), open appeal (not due), another open report on the post (`skippedOtherReportOpen` 1); the one control report is purged; `blockedContestEntry` 0 | pass |
| still blocked: a non-completed cycle and a legacy completed cycle with a winner row (`blockedContestEntry` 2), nothing deleted; a completed cycle with no winner row (control) is purged | pass |

The first run of the first test failed on my own comparison helper (it stripped `entryCount` from the "before" side only). That is a test bug, fixed; the production code was not changed in response.

Not done: I did not run a mutation check (for example forcing `contestEntryStillCounts` to return `false` or `true` and confirming which tests fail). The failure of the first run did show the snapshot comparison detects a real difference.

## Commands and counts

All with a private database (`soccernity_test_b307`) and `--runInBand` for e2e.

* `npx tsc --noEmit` clean; `npx eslint src/modules/moderation` clean.
* Unit: `report-retention.service.spec.ts` 44 tests pass (8 new in "removed Contest entries (B-307)"); `contest-entry-retention.util.spec.ts` 9 tests pass (new). Wider run, `src/modules/moderation src/modules/contest src/modules/leaderboard` plus `env-completeness.spec.ts` and `write-route-guards.spec.ts`: 43 suites / 1,048 tests, 0 failures. I did not measure the same set on a clean `origin/main` first, so I give no before figure.
* e2e: new `contest-entry-retention.e2e-spec.ts` 7 tests pass. With the neighbours `report-retention`, `contest-removal`, `contest`, `leaderboard`, `content-removal`, `moderation`: 7 suites / 94 tests, 0 failures. The one existing assertion that expected `blockedContestEntry: 1` (an `active` cycle) still holds and was only relabelled in a comment.

## NOT run

The QA reviewer runs the full suites at the launch gate. I did NOT run: the full mocked suite, the full e2e suite, the other moderation e2e files (`message-report`, `message-report-context`, `removed-post-media`, `b291`, `b292`, `moderation-holds`, `account-hold`, `anonymized-row-purge`, `admin-search`), `apps/web`, `apps/admin`, Playwright.

I cannot read CI from here, so I do not know whether GitHub Actions is green for this branch.

## Stale statements elsewhere (named, not edited)

`docs/build-register.md` (B-294, B-299 status lines and Section 87c, which say the `contest_entry` block still stands), Decision Log #493 (c), and the CLAUDE.md B-299 / B-300 bullets still describe the block as in force. The docs PR should append a B-307 line to those; I was told not to edit the register or the docx.
