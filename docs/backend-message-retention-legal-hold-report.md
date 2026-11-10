# Message retention: legal-hold exemption (backend/message-retention-legal-hold)

Founder decision of 2026-11-10, to be recorded as Decision Log #482 by a later docs PR. Follows B-287 / Decision Log
#478 (`backend/b287-message-retention`, `docs/backend-message-retention-report.md`).

## The rule

`MessageRetentionService.purgeExpired` never deletes a `Message` when an **active legal hold** exists for the message's
**sender** OR for **any other participant** of its conversation (`Conversation.participantIds`).

- "Active legal hold" = `AccountHold.type = 'legal_hold'` AND `liftedAt IS NULL` AND (`expiresAt IS NULL` OR
  `expiresAt > now`). That is `findActiveAccountHold`'s predicate in `account-hold.rules.ts`, the read
  `resolveAccountHold` uses (I read it and mirrored it; there is no second definition). `now` is the same injected
  instant the 12-month cutoff comes from, so a hold expiring exactly at the run instant is no longer active.
- The test is in the SELECT and repeated, in full, in the DELETE statement (with `now` bound again), exactly as the two
  report exemptions are, so a legal hold placed between the two statements still protects the message.
- The held person's old messages keep their conversation alive too; the empty-conversation step is unchanged (it only
  removes conversations left with no messages).
- **No catch-up logic.** Nothing is recorded about skipped messages. When the hold is lifted or expires, the next run
  deletes whatever is then past the retention.

## What is NOT exempt (stated on purpose)

- **`bad_faith` holds**: not added. The exemption names `legal_hold` only.
- **Report-derived holds** (open report, appeal window, post-closure): not added. A report-derived hold already protects
  the specific reported message through the existing `Report` guard (and any attached `ReportContextMessage`); the rest of
  that person's messages are not evidence and are deleted on schedule, as before.

## Files

- `services/api/src/modules/messaging/message-retention.service.ts` (SQL in both statements, comment block).
- `services/api/src/modules/messaging/message-retention.service.spec.ts`, `services/api/test/message-retention.e2e-spec.ts`.
- `services/api/src/modules/messaging/README.md` ("Retention", "Held accounts"), `services/api/src/modules/account-hold/README.md`
  (one sentence), `CLAUDE.md` (B-287 bullet marked superseded on this one point, new bullet),
  `docs/backend-message-retention-report.md` (its "Account-hold rule" section marked superseded in place, original kept).
- No schema change, no migration, no environment variable, no `apps/web`, no `apps/admin`, no `.docx`, no
  `docs/build-register.md`.

## Existing assertions changed (deliberately)

In `message-retention.service.spec.ts`: the DELETE's bound values are `[ids, cutoff, now]` (were `[ids, cutoff]`), and the
test that forbade the word `senderId` anywhere in the SELECT now forbids only `isMinor`, `deletedForEveryoneAt`, `editedAt`
and `originalContentText`, because the hold test joins on `m."senderId"`. Nothing else was weakened.

## Tests

Unit (mocked clock, SQL text and bound parameters pinned): both statements contain the full hold test; `now` is bound in
both; only `legal_hold` is mentioned (no `bad_faith`, no report columns); no state is written about skipped messages.
e2e (real Postgres, injected `now`): held sender; held other participant; an unheld thread still purges; hold lifted
(the next run deletes); `bad_faith` not exempt; report-derived hold not exempt; hold placed between the SELECT and the
DELETE protects the message; and the schema fact below.

**Expiry cannot be tested on a real `legal_hold` row.** `AccountHold_type_shape_check` forbids a legal hold with an
`expiresAt` (only a `bad_faith` hold has one), so a legal hold ends only by being lifted. I kept the `expiresAt IS NULL OR
expiresAt > now` half of the predicate anyway, because the brief says to mirror `resolveAccountHold`'s predicate exactly
and not to invent a second definition; it is pinned by the unit spec (text, and `now` bound in both statements) and the
e2e asserts the CHECK. If the schema ever allows an expiring legal hold, the clause already handles it.

## Results (measured)

- `tsc --noEmit` (services/api): clean.
- Unit, ONLY `message-retention.service.spec.ts` + `env-completeness.spec.ts`: 2 suites / 46 tests, 0 failures
  (41 before: +5 new hold tests; two existing assertions changed as listed above).
- API e2e (real Postgres + Redis from docker-compose, private database `soccernity_test_legalhold`, `--runInBand`), ONLY
  `test/message-retention.e2e-spec.ts`: 21 tests, 0 failures (13 existing + 8 new). The first run had 3 failures, all in my
  new tests (a lift must set `liftedAt`, `liftedByAdminId` and `liftReason` together; an expiring legal hold violates the
  CHECK); fixed and re-run clean.
- Not run: the full mocked suite, the full e2e suite, the other messaging / account-hold / moderation e2e files, Playwright,
  `apps/web`, `apps/admin`. Eslint was not run on the touched files separately. The unit suite was slow on this machine
  (about 80 s for two files) and the e2e run took many minutes (each `resetDatabase()` is slow here).

## Forward-pointer notes for the docs PR (not written here)

- Decision Log #482: a legal hold keeps the held person's messages, and the other participants' messages in their
  conversations, out of the retention sweep; `legal_hold` only.
- Dated notes on #478 (and on any entry saying a legal hold does not stop the sweep, e.g. the B-044 / B-287 status lines).
- Build register B-287 and B-044 status lines.
- Legal draft / DPIA: the messages retention row says 12 months; a legal hold now extends that for the people concerned.
  Any user-facing wording would be a separate, tagged change (none written here).

## Consequences worth knowing

- A legal hold can keep a thread alive indefinitely (no catch-up, no expiry on messages), until the hold is lifted or
  expires. A legal hold has no expiry in the schema (CHECK), so in practice until lifted.
- The exemption keys on participants, so a legal hold on one person also retains the *other* person's old messages in
  every conversation with them. That is the founder's rule (sender OR any other participant), not an accident.
- The anonymised-row purge is unaffected: `AccountHold.user` already blocks that purge for a held-once user.
