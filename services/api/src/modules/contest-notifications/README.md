# contest-notifications

Build register **B-122**, Decision Log **#404 item 16**, `docs/contest-spec.md` section 14e.
The scheduled, **in-app only** fan-out of the Contest notification events. No push, no email
(deferred to launch gate B-090). No controller: the module exists to register one `@Cron` job
(every 5 minutes) and the read side lives in `NotificationsService`.

## Status update: B-091 has landed (backend/w7-contest)

The text below was written when the Contest was still admin-judged; it is kept as the record of what
this module assumed. The seams it lists are now filled, and **this module did not change** except for
one file:

1. **Votes** - `ContestVotingService` writes `ContestVote`; the `not_voted` filter is unchanged and the
   e2e (`test/contest.e2e-spec.ts`) proves a voter is skipped and a non-voter (or one who retracted) is
   reminded.
2. **Final entries** - `ContestNotificationFacts.getFinalEntryUserIds` now reads the cycle's week-4
   `ContestEntry` rows (the one file changed here).
3. **Forfeit** - a forfeited week is stored (`ContestRound.forfeited`) AND is `judged` with no winners,
   so the planner's approximation ("judged with no winners sends no result and no reminder") still
   gives exactly the right behaviour; `planCycle` was not changed.
4. **No winner this month** - reachable: the lifecycle completes a cycle with no standings
   (`ContestCycle.noWinner`).
5. **Calendar-driven state** - the lifecycle stamps `judgedAt` with the lock INSTANT (20:00), so
   `later(lock, judgedAt)` is the lock itself and (c) / (d) fire at 20:00 as the spec says.

Round 4 (the final) now exists as a `ContestRound` with no winners; the planner only loops weeks 1-3
and takes finalists from weekly winners, so it is unaffected.

## What this module is, and what it is not

The Contest backend on `main` is still the **admin-judged model** (Decision Log #218/#241):
admin-set round windows, an admin POST to record winners, an admin POST to crown. The
Europe/London calendar of spec section 5, the votes, the finalists' upload portal, the reveal and
the forfeit/no-winner states are **B-091 and are not built**. So this module is a notification
layer that:

- **computes the spec calendar itself** (`contest-calendar.util.ts`, pure date arithmetic; it
  changes nothing about how a contest runs) for the events the *clock* defines, and
- **keys the events that depend on contest state off the state that exists today** (judged rounds,
  their winners, crowned standings).

When B-091 lands, the planner reads its state instead; the seams are listed at the end.

## Files

| File | Role |
|---|---|
| `contest-calendar.util.ts` | `buildContestMonthCalendar(year, month)`: opening, reminder, lock, reveal, deadline and month-end instants for one London calendar month. DST-safe via `Intl`, no dependency. |
| `contest-notification-plan.ts` | `planContestNotifications(cycles, now)`: pure. Which events are due *now* and for which audience. Every event, window and DST case is unit-tested here. |
| `contest-notification-sweep.service.ts` | The `@Cron` job and `runOnce(now)`. Resolves the audience in id-ordered pages and writes `Notification` rows. |
| `contest-notification-facts.service.ts` | The one fact with no storage yet: which finalists already uploaded a final entry. Returns the empty set until B-091. |

## Events

| Event | Type | `payloadRefId` | When (Europe/London) | Audience |
|---|---|---|---|---|
| a. Week opens | `contest_week_opens` | `<cycleId>:<week>` | 08:00 on days 1, 8, 15, 22 | Every eligible account. Week 4 only if finalists are known. |
| b. Votes closing | `contest_votes_closing` | `<cycleId>:<week>` | 19:00 on days 7, 14, 21 | Eligible accounts with **no `ContestVote` in that round**. Not sent once the round is judged. |
| c. Week result | `contest_week_result` | `<cycleId>:<week>` | At the 20:00 lock (the later of the lock and the judging) | Every eligible account. **Not sent for a forfeited week** (judged, no winners). |
| c. Personal winner | `contest_win` (existing) | `<cycleId>` | When the round is judged | Each winner. Already written by `ContestService.recordRoundResults`; not duplicated here. |
| d. Final qualification | `contest_finalist` | `<cycleId>` | At the week-3 result (**ASSUMED**, spec row d) | Each distinct weekly winner. |
| e. Reveal | `contest_reveal` | `<cycleId>` | 00:00 on day 25 | Every eligible account. Not sent if there are no finalists. |
| f. Final result | `contest_final_result` | `<cycleId>` | The later of the crowning and 00:00 on the 1st of the next month (**ASSUMED**, spec row f) | Every eligible account. |
| g. Forfeit | none | | | The Contest-page pop-up covers it. |
| h. Upload reminder | `contest_upload_reminder` | `<cycleId>` | 12:00 on day 24, until the 23:59:59 deadline (default added by Claude, veto-able) | Eligible finalists without a final entry. |

A cycle's calendar month is the London month of its `startsAt`.

## Eligibility

An account receives a Contest notification if it is `accountStatus = 'active'`, has a **verified
email**, and is not restricted: not a minor, or a minor whose `Guardian.consentStatus` is
`confirmed` (the test `GuardianConsentGuard` applies). Declined, withdrawn and pending minors are
excluded. The under-16 tier is not a Contest restriction (`POST /contest/entries` has no
`Under16RestrictionGuard`), so under-16 accounts with confirmed consent are included.

Whether an unverified-email account should receive them is **not stated by the spec**. It is
excluded here because it cannot vote or enter (EmailVerifiedGuard, spec section 9a), so a "vote
now" prompt would be a dead end. One filter constant (`ELIGIBLE_RECIPIENT`) changes that.

## Idempotency

`Notification.dedupeKey` (nullable, `UNIQUE`) holds `<type>|<cycleId>|<week or ->|<userId>`. The
fan-out uses `createMany({ skipDuplicates: true })`, so a re-run, a catch-up tick, or two app
instances sweeping at once cannot write the same event to the same account twice. NULL keys (every
pre-existing notification) never collide. A read notification is never re-created: the unique row
still exists.

## Windows (catch-up)

Each event may be sent for a bounded time after its moment, so a restart or a late-created cycle
does not lose it, and a stale "week 1 is open" is never sent days later: week opens 12 h, week
result 24 h (from the later of lock and judging), finalist 24 h, reveal 12 h, final result 24 h.
The votes-closing reminder expires at the 20:00 lock and the upload reminder at the 23:59:59
deadline.

## Read side

`NotificationsService` resolves the seven new types into structured data (no pre-rendered English,
Decision Log #290): `{ cycle: { id, title }, week }`, where `week` is `null` for cycle-level
events. `contest_final_result` adds `outcome: 'winners' | 'no_winner'`, derived from whether the
cycle has any `ContestStanding` when the row is read. `contest_win` is unchanged.

## Schema (migration `20261017160000_add_contest_notification_dedupe_and_vote`, additive)

- `Notification.dedupeKey String? @unique`
- `ContestVote` (`roundId`, `voterId`, `entryId`, `createdAt`; `@@unique([roundId, voterId])`).
  **Nothing writes it yet.** It holds the single fact the reminder needs. B-091 owns the voting
  model (retract/event log, tie-break timestamps, restricted block) and may extend or replace it.

## Seams B-091 must fill

1. **Votes:** write `ContestVote`, or change the `not_voted` audience filter in
   `ContestNotificationSweepService.audienceWhere` to the real model.
2. **Final entries:** implement `ContestNotificationFacts.getFinalEntryUserIds`.
3. **Forfeit:** today a forfeited week is approximated as "judged with no winners". Replace with
   the real forfeit state in `planCycle`.
4. **No winner this month:** crowning requires a winner today, so the `no_winner` outcome is only
   reachable once B-091 can complete a cycle without standings.
5. **Calendar-driven state:** when rounds follow the spec calendar, (c) and (d) can key off the lock
   itself rather than the admin's judging time.
