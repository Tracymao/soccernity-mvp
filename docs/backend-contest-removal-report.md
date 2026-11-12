# Contest entry removal (B-300, Decision Log #488)

Branch `backend/b300-contest-entry-removal`. `services/api` and docs only. One additive migration, `20261130090000_contest_entry_removal` (rollback in its header). No `apps/*`, no Figma, no `.docx`, no `docs/build-register.md`, no new environment variable. The platform is not live.

Extends #483 / B-289 (moderator `content_removed` is enforced for a post) to the CONTEST: when the post of a contest entry is removed by moderation, the contest treats the entry as removed. An overturned appeal restores everything.

## What was built

* **One seam, same transaction.** `applyContentRemoval` / `restoreContentRemoval` (`moderation/content-removal.util.ts`) call `onContestEntryPostRemoved` / `onContestEntryPostRestored` (`contest/contest-entry-removal.util.ts`) right after the post claim or clear. The seam DERIVES the desired contest state with the same loaders the lifecycle uses (`contest/contest-derivation.ts`) and writes only the difference, so it is idempotent and a lifecycle tick, a removal and a restore always agree. Lock order everywhere: cycle row, then a round row (`FOR UPDATE`). The vote path takes the round `FOR SHARE` and refuses a removed entry inside that locked transaction.
* **Pure rules** in `contest/contest-removal.rules.ts` (no database, no clock): `entriesToQualify`, `weekHasTooFewEntries`, `votesToRestore`, `planPodium`, `planPlacementPoints`, `resolveFinalistUserIds`.
* **Before Phase 1 closes:** nothing stored; the closing ranking leaves the entry out (it counts neither toward the 10 nor toward the "fewer than 3" test).
* **During voting:** re-rank and backfill the slate to 10 (`qualified` is monotone: removal never clears it, a restore never clears another entry's); free the entry's votes (rows deleted, a `release` event); forfeit the week if fewer than 3 eligible, non-removed entries remain.
* **After the lock:** no forfeiture. The weekly podium is recomputed from the frozen tally; `ContestRoundWinner` and placement points are rewritten; everyone is paid for the place they end up in; the `contest_win` notice goes only to a first-time winner of that round. Same for the monthly crown (`ContestStanding`, `contest_monthly_crown`, `noWinner`; no notices).
* **Restore:** freed votes return (original `createdAt`) only for a voter whose latest event in the round is that `release` and who holds no vote now; a forfeited week is reinstated only before its lock instant; later podiums and prizes are recomputed.
* **Points:** the baseline engagement points a removed post earned are revoked (givers and author) and stamped `PointsLedgerEntry.revokedForRemovalAt`; a restore brings back exactly the rows carrying the marker (a row revoked for another reason is never restored; a row whose giver or author is no longer eligible stays revoked). Placement prizes are never deleted, only revoked, un-revoked or changed.
* **Finalists freeze** from `schedule.final.opensAt` (`ContestFinalist`, `ContestCycle.finalistsFrozenAt`), taken once under a cycle lock by whichever comes first: the lifecycle tick, a final-entry submission or a removal that is about to change a podium. All readers (read model, `POST /contest/final-entry`, the notification planner) use the stored set once frozen.
* **Reads** exclude removed entries (vote counts, `callerVote`, entry lists, carousel, exposure). Admin cycle detail still lists the entry with an additive `removedByModeration: true` and a vote count of 0.
* **Hard delete changes nothing further.** An author may still `DELETE /posts/:id` on a removed entry's post. The cascade drops the entry's own rows: `ContestEntry` and through it `ContestVote`, `ContestEngagement`, `ContestImpression` and `ContestRoundWinner`. The removal's effects were already applied. The report-retention sweep is UNCHANGED and still keeps (blocks) a post that is a contest entry, so retention deletion of such a post remains a separate, founder-visible gap: the post can be deleted by its author, not by the sweep.

## Schema (flag for the Decision Log; beyond Section 3's field lists)

`ContestCycle.finalistsFrozenAt`, new model `ContestFinalist` (CASCADE to the cycle and to the user; classified in `anonymized-row-purge.references.ts`), `PointsLedgerEntry.revokedForRemovalAt`. No backfill: the platform is not live.

## DEFAULTS, founder-veto-able

1. A forfeit caused by a removal sets `judgedAt` to the real instant of the removal, not the round's lock instant.
2. Restored baseline points keep their original `occurredAt` and skip the daily-cap re-check.
3. Admin exposure numbers exclude a removed final entry.
4. `finalRank` / `finalTally` are rewritten for the remaining entries after a crown-time removal.
5. The slate backfill also covers authors who became ineligible.
6. The votes of other entries stay when a week is forfeited by a removal.
7. `finalistsFrozenAt` is stamped with `final.opensAt`, not the wall clock.
8. The marker design (`revokedForRemovalAt`) rather than re-deriving which rows to restore.
9. `ModerationService` now injects the optional `APP_CLOCK` and passes `clock.now()` to the seam, so a test clock is honoured.
10. Nothing of this touches the retention sweep.

## Tests

* Unit: new `contest-removal.rules.spec.ts`, `points/engagement-points.removal.spec.ts`; updated `contest-voting.service.spec.ts`, `moderation/content-removal.util.spec.ts` (plus seam tests), `moderation.service.spec.ts`, `moderation-guardian-notice.spec.ts`, `moderation.content-removal.spec.ts` (added `contestEntry` mocks only).
* e2e (real Postgres): new `test/contest-removal.e2e-spec.ts` driving the real moderation path (`PATCH /admin/moderation/reports/:id`, appeal overturn) with the fake clock. See the PR description for the measured counts.

## Not run

See the PR description (full mocked suite, the rest of the e2e suite, Playwright, `apps/*`). The older contest/notification/moderation e2e files were run only where stated there.

## Forward-pointers for the docs PR (not edited here)

* `docs/build-register.md`: a status line on B-300 (BUILT) and dated notes on B-289, B-290 and B-294 (retention still blocks contest-entry posts).
* Decision Log #488: a Status note (built by this PR); dated note on #483.
* `modules/contest/README.md`, `modules/moderation/README.md` and `docs/backend-content-removal-report.md` section 3 are updated in this PR.
