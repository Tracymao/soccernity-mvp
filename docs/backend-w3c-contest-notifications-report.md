# Backend W3c: Contest notifications (B-122)

Agent: backend-api. Branch `backend/w3c-contest-notifications`, from `origin/main` `3a1238f`. `services/api` and docs only. No `.docx`, Figma, `apps/web` or legal copy changed. Decisions: #404 item 16, #290, #279, `docs/contest-spec.md` section 14e. Build register: B-122.

## 1. The brief's premise did not hold, and what I did about it

The brief said to "follow the contest calendar already in the code (do not change it)". There is no such calendar. Checked on `origin/main`:

- `ContestCycle` / `ContestRound` carry **admin-set** windows (`opensAt`, `closesAt`; the default is three 7-day windows from `startsAt`). Nothing in the code mentions Europe/London, 08:00, 20:00, day 7/14/21, a reveal or a deadline.
- There is no vote model, no finalist concept, no final-entry flag, no forfeit or no-winner state. Winners come from an admin POST (`recordRoundResults`) and the crown from another. That is build register **B-091**, which is not built.

B-122 depends on B-091, so I stopped and asked. The answer was: build the notification layer on the **spec calendar** (`docs/contest-spec.md` section 5), with the calendar computed by this module, events that are defined by the clock keyed off it, events that depend on contest state keyed off the state that exists today, and the "not voted" filter behind a minimal vote table nothing writes yet. That is what is built. It does not change how a contest runs.

## 2. What was built

| Piece | File |
|---|---|
| Europe/London calendar (pure, DST-safe through `Intl`, no dependency) | `contest-notifications/contest-calendar.util.ts` |
| Planner: which events are due at `now`, for whom (pure) | `contest-notifications/contest-notification-plan.ts` |
| `@Cron(EVERY_5_MINUTES)` sweep and `runOnce(now)` | `contest-notifications/contest-notification-sweep.service.ts` |
| Seam for "has this finalist uploaded?" (empty until B-091) | `contest-notifications/contest-notification-facts.service.ts` |
| Module, registered in `app.module.ts` | `contest-notifications/contest-notifications.module.ts` |
| Read side: seven new types resolved into structured data | `notifications/notifications.service.ts` |
| Module README (events, eligibility, windows, B-091 seams) | `contest-notifications/README.md` |

### Events

| Event (spec 14e) | `Notification.type` | `payloadRefId` | When (Europe/London) | Audience |
|---|---|---|---|---|
| a. Week opens | `contest_week_opens` | `<cycleId>:<week>` | 08:00, days 1, 8, 15, 22 | Every eligible account (week 4 only if finalists are known) |
| b. Votes closing | `contest_votes_closing` | `<cycleId>:<week>` | 19:00, days 7, 14, 21 | Eligible accounts with no vote in that round; expires at the 20:00 lock; not sent once the round is judged |
| c. Week result | `contest_week_result` | `<cycleId>:<week>` | At the 20:00 lock (later of lock and judging) | Every eligible account; none for a forfeited week |
| c. Personal winner | `contest_win` (existing, unchanged) | `<cycleId>` | At judging | Each winner |
| d. Final qualification | `contest_finalist` | `<cycleId>` | At the week-3 result (ASSUMED, spec row d) | Each distinct weekly winner |
| e. Reveal | `contest_reveal` | `<cycleId>` | 00:00, day 25 | Every eligible account; none if there are no finalists |
| f. Final result | `contest_final_result` | `<cycleId>` | Later of the crowning and 00:00 on the 1st of the next month (ASSUMED, spec row f) | Every eligible account |
| g. Forfeit | none | | | Pop-up only |
| h. Upload reminder | `contest_upload_reminder` | `<cycleId>` | 12:00, day 24, until 23:59:59 | Eligible finalists without a final entry |

The personal winner notification (c) is **not duplicated**: judging already writes one `contest_win` per winner in its own transaction (Decision Log #278), so the sweep only adds the broadcast. A winner therefore receives both, which matches "winners announced to everyone, plus a personal notification".

### Eligibility ("non-restricted accounts under the existing Contest age rules")

`accountStatus = 'active'`, verified email, and either not a minor or a minor with `Guardian.consentStatus = 'confirmed'` (the same test `GuardianConsentGuard` applies). Pending, declined and withdrawn minors, deactivated, suspended and anonymised accounts are excluded. Contest entry has no under-16 restriction (`POST /contest/entries` carries no `Under16RestrictionGuard`), so an under-16 with confirmed consent is included.

### Idempotency

`Notification.dedupeKey` (nullable, `UNIQUE`) = `<type>|<cycleId>|<week or ->|<userId>`, written with `createMany({ skipDuplicates: true })`. A re-run, a catch-up tick, or two instances sweeping together cannot write one event to one account twice (proved in e2e with two concurrent sweeps). A read notification is not recreated. NULL keys never collide, so every pre-existing notification is unaffected.

### Catch-up windows

An event may be sent for a bounded time after its moment, so downtime or a late-created cycle does not lose it and a stale "week 1 is open" is never sent days later. Week opens 12 h; week result 24 h (from the later of lock and judging); finalist 24 h; reveal 12 h; final result 24 h. The votes-closing reminder expires at the lock and the upload reminder at the deadline.

## 3. Migration (additive, listed as asked)

`20261017160000_add_contest_notification_dedupe_and_vote`:

1. `ALTER TABLE "Notification" ADD COLUMN "dedupeKey" TEXT` and `CREATE UNIQUE INDEX "Notification_dedupeKey_key"`. This is the "uniqueness key" the spec said might need a schema addition. It is unavoidable for a race-safe scheduled fan-out (the natural `(userId, type, payloadRefId)` cannot be unique, because many people can like one post).
2. `CREATE TABLE "ContestVote"` (`roundId`, `voterId`, `entryId`, `createdAt`; unique `(roundId, voterId)`; FKs to round and entry `CASCADE`, to user `RESTRICT` per Decision Log #341). **Nothing writes it.** It exists only because the "has not voted" filter needs somewhere to read. B-091 owns the voting model and may extend or replace it.

`prisma migrate diff` against the migrated test database reports no drift. `User` / `Guardian` safeguarding fields untouched.

## 4. Copy strings

**No English is generated by the API** (Decision Log #290: structured data, copy is a frontend concern, B-123). The strings below are the ones drawn in Figma pass J2 (`docs/figma-pass-j2-report.md` section 2), which B-123 should render. All are functional wording tagged `[COPY PENDING LEGAL REVIEW]`, because every one reaches minors.

| Type | Row text in Figma |
|---|---|
| `contest_week_opens` | Contest - week 1 is now open for entries |
| `contest_votes_closing` | Contest - voting for week 1 closes at 20:00 today |
| `contest_week_result` | Contest - week 1 results are in |
| `contest_finalist` | Contest - you are a finalist; your entry stays hidden until the reveal |
| `contest_reveal` | Contest - The final is live |
| `contest_final_result` (winners) | Contest - final result: the winners are announced |
| `contest_final_result` (no winner) | Contest - No winner this month |
| `contest_upload_reminder` | Contest - upload your final entry before the window closes |

Resolved shape for the frontend: `data = { cycle: { id, title }, week, outcome? }`, `week` is `null` for cycle-level types, `outcome` is `'winners' | 'no_winner'` on `contest_final_result` only (derived from whether the cycle has any `ContestStanding` when the row is read), and `data` is `null` if the cycle is gone.

## 5. Verification (measured)

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx eslint src test` | clean |
| `npx nest build` | clean |
| Mocked unit suite, before | 136 suites / 2,135 tests (last recorded figure on `main`, PR #416; not re-run) |
| Mocked unit suite, after (`jest --maxWorkers=4`) | **139 suites / 2,210 tests, 0 failures** (+3 suites, +75 tests: calendar 13, planner 35, sweep 17, `notifications.service.spec.ts` +10) |
| e2e (real Postgres), before | 44 suites / 455 tests (last recorded figure, PR #416; not re-run) |
| e2e (real Postgres), after (`npm run test:e2e`) | **45 suites / 478 tests, 0 failures** (+1 suite, +23 tests) |
| `prisma migrate diff` | no drift |

Coverage, by event:

- **Every event** has a planner test at its exact instant, one second before, and (where it has one) at its expiry, plus a sweep test and a real-Postgres test: a, b, c (including the forfeited week and the late-judged week), d (a user who won two weeks is notified once), e, f, h.
- **Not-voted filter:** a voter in this round is skipped; a vote in another round does not exempt; real `ContestVote` rows.
- **Restricted and under-age exclusion:** pending and declined minors, unverified, deactivated and suspended accounts get nothing; a confirmed-consent minor does; a restricted finalist is not notified.
- **Idempotency:** same instant twice, later ticks, the whole reminder hour, two concurrent sweeps, and a read notification not resurrected.
- **DST (clocks changing on a calendar day):** 25 Oct 2026 (the day is 25 hours; the reveal is 00:00 BST = 23:00Z on the 24th, and the previous second sends nothing), 25 Mar 2029 (the day is 23 hours; the reveal is 00:00 GMT because the change is at 01:00), 29 Mar 2026, 19:00 BST = 18:00Z for the October reminder, 00:00 GMT on 1 Nov for the final result, `startsAt` at 23:30Z on 30 Sep taken as October, and a round trip of every contest wall-clock time on every day of 2026 to 2029.

## 6. Judgment calls and assumptions (veto-able, all in code as one place each)

1. **The calendar is computed here, not read from existing code** (section 1).
2. **Unverified-email accounts are excluded.** The spec says it is "not stated". They cannot vote or enter, so a prompt would be a dead end. Change `ELIGIBLE_RECIPIENT` in the sweep to include them.
3. **Week-4 "opens" (a) is sent only when finalists are known.** The spec lists day 22 for everyone, but with no finalists there is no final ("none means no final"), so the message would mislead.
4. **A forfeited week is approximated as "judged with no winners"**, because no forfeit state exists. It sends no result (spec row g).
5. **Finalists = distinct weekly winners, known once week 3 is judged** (row d, ASSUMED timing taken literally).
6. **(f) fires at the later of the crowning and the month end** (row f, ASSUMED). Today a crown requires at least one winner, so `no_winner` is only reachable once B-091 can complete a cycle with none; the read-side path is tested with a completed cycle with no standings.
7. **The upload reminder (h) reaches every finalist** until B-091 stores final entries (`ContestNotificationFacts.getFinalEntryUserIds` returns the empty set). Harmless today: nobody can upload yet.
8. **(c) and (d) key off the admin's judging time**, so a week judged late is announced late rather than at 20:00. That disappears when B-091 locks at 20:00 itself.
9. **Cadence is every 5 minutes**, so an event can be up to ~5 minutes after its moment. A 00:00 reveal is therefore sent between 00:00 and 00:05.
10. **A `ContestVote` table was added** that nothing writes (section 3).

## 7. Not done / still open

- `apps/web` renders none of the seven types (B-123); until then they show the generic "no longer available" row.
- No push, no email (B-090).
- Figma: B-121 is only partly done (no read/unread pair per event, no per-type icon disc, Design Notes frame not updated).
- B-091 seams are listed in `contest-notifications/README.md` (votes, final entries, forfeit state, no-winner state, calendar-driven locking).
- Counsel wording for the strings in section 4.
- The `Notification.type` comment in `schema.prisma` and `CLAUDE.md` are updated; no `.docx` was edited, so Decision Log #404's Status cell and B-122 in the docx have no forward-pointer yet.

## 8. Register status lines

Appended to the Spec-status cell in `docs/build-register.md` (original text unchanged), plus a new Section 18:

- **B-122: BUILT (backend only; in-app only).** Idempotency key resolved (`Notification.dedupeKey`). See section 2 for the assumptions.
- **B-091: NOT built by this PR.** Only the notification layer was added; seams listed in the module README.
- **B-123: API half exists** (resolved shape above); the frontend renders none of the types yet.

No B-ID added or removed: 123 B-IDs, 146 gap frames unchanged.
