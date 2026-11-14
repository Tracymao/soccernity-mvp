# backend/contest-release-timestamp: report

Branch from `origin/main` `3184de5`. Decision Log #483, #488, #495; register Section 95c(i) (PR #763's race test). Founder decision 2026-11-14: fix it, with a test. `services/api` only; no schema, no migration, no new copy.

## Cause, as read in the code

Both the vote and the removal read their clock BEFORE they wait for the cycle and round locks:

- `contest-voting.service.ts` `castVote(..., now = this.clock.now())` (line 51): the default argument is evaluated on entry. `withRoundLocked` (line 190) then takes the round row `FOR SHARE`. Inside, line 91 writes the vote row's `createdAt: now` and line 92 the `cast` event's `occurredAt: now`. The same `now`.
- `moderation.service.ts` lines 1059 and 1199 evaluate `this.clock.now()` as an argument, before `applyContentRemoval` / `restoreContentRemoval` call into `reconcile`, which takes the cycle row and then the round row `FOR UPDATE` (`contest-entry-removal.util.ts` lines 97 and 129). `releaseVotes` stamped each release event with that `now` (line 237 before the fix).

When the vote commits first, the removal that follows releases it. If that removal read its clock EARLIER than the vote did (it started first, then waited longer for the lock), its `now` is smaller than the vote's, so the release sorted before the cast it frees. `votesToRestore` (`contest-removal.rules.ts`) orders a voter's events by `occurredAt`; the latest then read as the `cast`, not a `release`, and the vote was not brought back on a restore.

Direction check: the only way to get this ordering is vote-commits-first with an earlier removal `now`. If the removal commits first the vote is refused (`stillThere === 0`, line 75) and no cast exists. A later `now` on the removal is harmless. In the pre-fix run all 4 occurrences were in the "removal started first" order, which matches.

## Places that write a release event: 1

`releaseVotes` in `contest-entry-removal.util.ts` (one `createMany`). The only other vote-event writers are `restoreFreedVotes` (a `restore` event), and `contest-voting.service.ts` (`cast`, line 92; `retract`, line 124). Grep of `contestVoteEvent.create*` in `src` finds no others.

## The fix

`releaseOccurredAt(now, voteCreatedAt)` in `contest-removal.rules.ts`: the LATER of the two. `releaseVotes` now selects `createdAt` on the votes it already reads and uses the function for every release. The vote row's `createdAt` is the cast time (a restored vote gets its original cast time back, so a second removal clamps against the same value). Equal milliseconds are fine: `compareEvents` orders a cast before a release at the same millisecond. Nothing else changed: cast stamping, lock order, `compareEvents`, `votesToRestore`, the restore rules, ranking.

## Tests

- Unit (`contest-removal.rules.spec.ts`): 5 new for `releaseOccurredAt` (later wins; cast time wins when the clock was earlier; equal; never earlier than the cast for any pair; inputs unchanged) and 3 new for `votesToRestore` (a clamped release is restored with the original cast time; the pre-fix shape, a release stamped before its cast, is NOT restored; control: a clamped release followed by a cast elsewhere is not restored, with or without the voter holding a vote).
- `contest-removal-race.e2e-spec.ts` tightened, existing invariants and iteration counts kept (25 + 25). New invariant 7: the release is never earlier than its cast. New invariant 8: in every iteration where the vote was accepted and then released, the real moderation path restores E's post (the author appeals, a second moderator overturns) and V's vote on E is back with its original `createdAt` (equal to the cast event) and V holds exactly one vote in the round. V then retracts that vote so the existing slot check still means what it did.

## Results (scratch database `soccernity_test_reltime`, Redis DB 14)

- `tsc --noEmit` clean. `eslint src/modules/contest` clean.
- Contest unit specs run (`contest-removal.rules`, `contest-voting.service`): 2 suites / 57 tests, 0 failures. There is no unit spec file for `contest-entry-removal.util.ts` (that name pattern matched nothing), so its logic is covered by the rules spec and the two e2e files.
- `contest-removal.e2e-spec.ts`: 1 suite / 6 tests, 0 failures.
- `contest-removal-race.e2e-spec.ts`, 5 runs in a row, 50 iterations each: **5 of 5 passed.**

| run | accepted, then released | refused (removal first) | release stamped AT the cast moment | release before cast | votes restored | deadlocks |
|---|---|---|---|---|---|---|
| 1 | 32 | 18 | 6 | 0 | 32 | 0 |
| 2 | 30 | 20 | 3 | 0 | 30 | 0 |
| 3 | 33 | 17 | 6 | 0 | 33 | 0 |
| 4 | 34 | 16 | 8 | 0 | 34 | 0 |
| 5 | 32 | 18 | 6 | 0 | 32 | 0 |

Every released vote was restored in all five runs (161 of 161).

Same spec against the PRE-FIX release write (a temporary revert of that one line, restored afterwards): FAILED. 31 released, **4 stamped 1 to 3 ms before their cast**, 27 restored, so 4 votes were not brought back ("after the restore V holds 0 vote(s) in the round, expected 1"). The "release at the cast moment" column counts iterations where the release and cast share a millisecond: that is the clamp acting, or a genuine tie, and I cannot tell the two apart without instrumenting the code, so it is an upper bound on how often the clamp acted. Pre-fix, the clamp was needed in at least 4 of 50 iterations.

## Second paths found, NOT fixed

Same root (a clock read before the locks), different events:

1. A `retract` event is stamped with a `now` taken before `withRoundLocked` (`retractVote`, line 113), so it can sort before the `cast` it follows. Not a release or restore, so left alone.
2. `restoreFreedVotes` stamps the `restore` event with the restore request's `now`. A second removal's release, clamped only to the cast time as briefed, could be stamped before that restore, so the voter's latest event would read as the `restore` and not the `release`. This needs remove, restore and a second remove close together from different requests; no test exercises it.
3. A `cast` elsewhere that read its clock before an earlier release committed can sort before that release, which could make a later retract of that vote leave the voter looking like an intact chain. Not exercised.

## Not run

The full API suite, the rest of the e2e suite, Playwright, `apps/*`. Before-figures for the contest unit specs were not taken on a clean `main`.
