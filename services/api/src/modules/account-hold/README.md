# account-hold

`backend/w6-hold-rule-extension` — build register B-044, Decision Log #376 (extends #341 / #345), #398 D1, #403
item 8. **Service and rules only; the HTTP endpoints and the notifications are B-045.** The platform is not live.

## What is held, and why

Erasure of a `pending_deletion` account is paused while any of these is true. `resolveAccountHold`
(`account-hold.rules.ts`) is the ONE read the daily sweep, `listStalledHolds` and the admin immediate-delete check go
through.

| `holdType` | Comes from | Applies to | Ends |
|---|---|---|---|
| `legal_hold` | an `AccountHold` row | the reporter and the reported user (one row each) | an admin lifts it |
| `bad_faith` | an `AccountHold` row | the REPORTER of a report found to be in bad faith | `BAD_FAITH_HOLD_MONTHS` after it was placed, or an admin lifts it |
| `open_report` | derived from `Report` | reported person, authors of reported content, and the reporter | the report leaves `open` (an overturned appeal puts it back) |
| `appeal_window` | derived from `Report` | reported person / authors (and the reporter while an appeal is pending) | the window lapses or the appeal is decided |
| `post_closure` | derived from `Report` | reported person / authors only | `ACCOUNT_HOLD_POST_CLOSURE_MONTHS` after closure |

An account held by several things reports the strongest, in the order above.

### The closure moment (one predicate: `reportClosedAt`)

| Report | Closed at |
|---|---|
| dismissed (`status: reviewed`) | `reviewedAt` |
| actioned, no appeal | `reviewedAt` + `REPORT_APPEAL_WINDOW_DAYS` |
| actioned, appeal `upheld` | `appealReviewedAt` |
| `open` (including reopened by an overturned appeal), or actioned with an appeal still `pending` | not closed |

A closed state missing its timestamp, or an unknown status, counts as NOT closed (held): it fails safe. Boundaries:
the window is lapsed from the deadline instant itself; an account is held while `now < closure + months`, so the
release instant is free.

The REPORTER is held only while the report is open or its appeal is pending, never after closure (unless a
`bad_faith` hold was placed).

## Two kinds of hold, two behaviours

* **Admin hold** (`legal_hold`, `bad_faith`): the account is held **in full**. The sweep skips it and clears
  nothing. `AdminUsersService.updateUserStatus('deleted')` refuses it with `409 account_hold_active` (body carries
  `holdType`) — a veto-able default; report-based holds still do not block that route (explicit admin choice, as before).
* **Report hold**: at the end of the grace period the sweep **minimises** the account
  (`AccountDeletionSweepService.minimiseHeldUser`) instead of leaving it untouched. Evidence is kept; non-evidence
  data is cleared. See the field table in that method's comment and in the PR.

When the last hold ends, the next sweep run anonymises the account normally (B-043 later purges it). An account whose
hold ends while it is still `active` is simply no longer held — there is nothing to release.

## HoldService (this module)

* `placeBadFaith(reportId, adminId, reason, now?)` — holds the reporter account. Coded `409` for: no reporter
  account (`reporter_has_no_account`), already anonymised (`account_already_deleted`), an active bad-faith hold for the
  same reporter and report (`hold_already_active`).
* `placeLegalHold(reportId, adminId, reason, now?)` — one hold per party that has an account (reporter, and the
  reported user resolved by `moderation/report-target.util.ts`). Anonymised parties are skipped; a party already under an
  active legal hold for this report is skipped; if nothing was created, `409 no_party_to_hold` / `hold_already_active`.
* `liftHold(holdId, adminId, reason, now?)` — works for BOTH types. `404` unknown, `409 hold_already_lifted`,
  `409 hold_expired`. Optimistic: two admins racing leaves one winner.
* Reason: 10 to 500 characters after trimming (`400 hold_reason_invalid`), the same bound as the username-revoke reason.
* Every action writes its `AdminActionLog` row **in the same transaction** (`account_hold.bad_faith_placed`,
  `account_hold.legal_hold_placed`, `account_hold.lifted`; `targetType: user`, notes carry hold id, report id, reason).
* **Nobody is notified** — not the held user, not the other party (#403 item 8). There is no notification dependency.

## Configuration — NOT counsel-sourced

| Variable | Default | Basis |
|---|---|---|
| `REPORT_APPEAL_WINDOW_DAYS` | 30 | **PLACEHOLDER, veto-able.** Matches the 30-day deletion grace period; no other basis. |
| `ACCOUNT_HOLD_POST_CLOSURE_MONTHS` | 6 | **PLACEHOLDER** from #376 ("6 months after closure"). |
| `BAD_FAITH_HOLD_MONTHS` | 6 | **PLACEHOLDER** from #376 ("held IN FULL for 6 months"). |

Positive whole numbers; anything else falls back to the default (`account-hold.config.ts`). Months are calendar months
via `setUTCMonth`, like the consent-record purge. **None of these numbers appears in user-facing text** (the appeal
refusal says only "The time allowed for appealing this report has passed.", code `appeal_window_closed`).

## `AccountHold` table

A genuine new model, flagged as a Decision Log candidate (the data model is a fixed spec). `userId` is a real RESTRICT
FK to `User`; `reportId` is nullable only for a legal hold with no report (the service has no such path yet). CHECK
constraints (migration `20261102090000_add_account_hold`): type in (`legal_hold`, `bad_faith`); the three lifted
columns all set or all null; a bad-faith hold has an expiry and a report; a legal hold has no expiry. The row is audit
evidence and **blocks the B-043 purge** of the user row (`AccountHold.user` is classed as content in
`anonymized-row-purge.references.ts`; veto-able).

## Not built / open

* HTTP endpoints, the notification and the "held" marker on the admin screen: **B-045**.
* Report subjects of type `banter_room`, `grassroots_team`, `fixture` do not create a report hold on their creator
  (unchanged from the old `hasOpenInvestigation`); `placeLegalHold` does resolve them.
* Counsel's 6–7 year retention reconciliation (OPEN), B-139.
* A post_closure hold lasts months by design, so it can appear in `GET /admin/users/held-investigations` without
  anything being wrong; `holdType` is how a reader tells it from an open report. The marker is B-045.
* `User.representedClubId` is cleared by minimisation but not by `anonymizeUser` (pre-existing gap, not changed here).
