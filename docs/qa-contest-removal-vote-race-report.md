# QA: contest vote versus entry removal race (B-300)

Branch `qa/contest-removal-vote-race`, cut from `origin/main` `d05cc45`. Test only: no application code, schema, migration or existing spec changed. New file: `services/api/test/contest-removal-race.e2e-spec.ts`.

## What was tested

B-300 (Decision Log #488, #495; register Section 87) says a moderator-removed contest entry leaves the round: its votes are freed (the `ContestVote` row is deleted and a `release` event is written), it cannot be voted on, and a restore brings it back. The code relies on one lock order: the vote path takes the round row `FOR SHARE`; the removal path (inside the moderation transaction) takes the cycle row and then the round row `FOR UPDATE`. Section 87c recorded that nothing proved a vote and a removal arriving together are safe. This spec fires the two real HTTP requests together.

Setup (real API and real Postgres, same fake-clock approach as `contest-removal.e2e-spec.ts`): a cycle for October 2026, four base entries entered through the API in Phase 1 and qualified by the lifecycle tick at the end of Phase 1, three fixed voters holding votes on them (tallies 2, 1, 0, 0). The clock is then switched to run in real time from 2026-10-05T10:00:00Z (inside the voting window), so every request samples "now" when it starts, as in production.

Per iteration: a fresh entry E (a post and a qualified `ContestEntry`), a report about E's post filed by a reporter through `POST /reports`, then at the same moment voter V's `PUT /contest/entries/:E/vote` and the moderator's `PATCH /admin/moderation/reports/:id { action: content_removed }`. Between iterations only what the iteration created is removed (V's votes and events, E's post, which cascades the entry).

Invariants checked after both calls settle (all violations are collected and reported together):

1. The vote answered 200, 404 or 409 `contest_entry_not_votable` (never 5xx, never hung, 30 s limit); the removal answered 200.
2. No `ContestVote` row exists for E.
3. The `ContestVoteEvent` rows for (V, E) are none, or exactly one `cast` and one `release`; a 200 vote implies the cast exists, a refusal implies no cast.
4. V's slot is free: V then votes on a base entry (200, `voted: true`).
5. The base entries' tallies are unchanged (and E has none).
6. `pg_stat_database.deadlocks` is unchanged across the run, and no error was logged through Nest's logger.

## Iterations

50 per run: 25 with the vote started first, 25 with the removal started first. The second request starts after an offset that is cycled per iteration (vote first: 0 to 24 ms; removal first: 0 to 120 ms, because the removal is much longer than a vote and the vote has to land inside it). Only the start order and offset vary; nothing about timing is asserted.

The offsets were widened after the first run. With 0 to 8 ms offsets, all 50 votes were accepted and then released and the "removal committed first, vote refused" interleaving was never reached, even in the removal-first order. After the change both interleavings occur in every run (see below).

## Results

Final spec, five consecutive runs with `npx jest --config test/jest-e2e.config.js --runInBand test/contest-removal-race` (the project's own invocation): **5 of 5 passed**. A sixth run with `--forceExit` (the run that showed both interleavings for the first time) also passed. Per run:

| Run | Vote accepted, then released | Vote refused (removal first) | Release timestamp earlier than cast | Deadlocks before / after | Logged errors |
| --- | --- | --- | --- | --- | --- |
| 1 | 33 | 17 | 4 | 0 / 0 | 0 |
| 2 | 36 | 14 | 5 | 0 / 0 | 0 |
| 3 | 33 | 17 | 4 | 0 / 0 | 0 |
| 4 | 32 | 18 | 3 | 0 / 0 | 0 |
| 5 | 34 | 16 | 6 | 0 / 0 | 0 |

In the vote-first order all 25 votes were accepted and then released every run; in the removal-first order between 7 and 11 were accepted and 14 to 18 refused. No invariant failed in any run, no 5xx, no hung request, no leftover vote, no deadlock.

## Observation, not a failure of the stated invariants

In 3 to 6 of every 50 iterations the `release` event has an `occurredAt` earlier than its `cast`. Cause (read from the code, not changed): both services take "now" when the request starts (`castVote` takes it as a default parameter; the moderation request samples the clock at its start), and the removal then waits for the vote's `FOR SHARE` round lock, so the removal can have an earlier timestamp yet commit later. The data is consistent (one cast, one release, no vote left) and invariant 3 as written holds, so the spec does not assert the order of the two timestamps. It can matter for a later restore: `votesToRestore` (`contest-removal.rules.ts`) treats the voter's latest event by `occurredAt` and restores only if that is the `release`, so a vote freed in this way would not come back when the removal is overturned. That is a restore arriving after a race, which this PR does not test. Recorded for the founder to decide whether it is worth a follow-up.

## What was NOT tested

- The Week 4 (final) case: the final has no vote (a vote on a week-4 entry is a clean 409 whatever happens), so the same scenario does not exist there. `contest-removal.e2e-spec.ts` already covers week-4 removal on its own.
- A restore (overturned appeal) arriving while a vote is in flight, and the restore-after-race effect above.
- A removal arriving at the 00:00 / 20:00 lifecycle steps (the vote lock job and the removal at the lock instant), and Phase 1 close racing a vote or a removal.
- Two removals of different entries together, a removal together with the weekly lock job, and several voters on the same entry together.
- Entries entered through the API: E is seeded directly (only the top 10 of Phase 1 can qualify, so a slate of many entries is not reachable through the API). The base entries do come through the API.
- A fault-injection check that the spec fails when the lock order or the in-transaction removed-entry check is broken: not done (it needs an application code change, which this PR must not contain).
- The full API e2e suite and every other spec: not run.

## How it was run

Scratch Postgres database `soccernity_test_voterace` (created and migrated by the e2e global setup) on the shared Docker Postgres, Redis database 13; `DATABASE_URL`, `DIRECT_URL` and `REDIS_URL` set in the shell with `127.0.0.1` (`localhost` did not reach Postgres from this shell). Nothing else touched the shared `soccernity_test` database. `tsc --noEmit` passed on the first version of the file; the later change (stagger table, timer cleanup) was type-checked by ts-jest when the spec ran. `eslint` reports only the Jest globals as `no-undef`, as for every e2e file (`npm run lint` covers `src/` only). The spec repeats a few small helpers (user, admin, entry creation) from `contest-removal.e2e-spec.ts` because they are local to that file's `describe` block and that file must not change.
