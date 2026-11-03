# username-review (B-139 part (c), Decision Log #467)

The review route for a revoked username. Founder decision 2026-11-03. An admin can remove a user's username
(`POST /admin/users/:id/username-revoke`, B-033). This module is how that user asks for a **review** of the removal
and how a **different** admin decides it.

## The flow

1. An admin revokes a username. The revoke writes a `RevokedUsername` record (handle, user, 30-day hold, permanent bar
   on that user) and, from this PR, **the id of the admin who revoked** (`revokedByAdminId`). The username-removed email
   now also tells the person they can ask for a review, how, and until which day.
2. The user, signed in with no username, asks: `POST /users/me/username-review { message? }`.
3. Another moderator or superadmin sees it in `GET /admin/username-reviews` and decides:
   `POST /admin/username-reviews/:id/decide { decision: 'reinstate' | 'decline', reason }`.
4. The user is told by an in-app notification (`username_review_decided`, outcome only) and by the status on
   `GET /users/me/username-review`. A minor's confirmed guardian gets a kind-of-action notice. **No email.**

## Routes

| Route | Guards | What it does |
|---|---|---|
| `GET /users/me/username-review` | `JwtAuthGuard` | `{ state, requestableUntil }`. States: `none`, `can_request`, `pending`, `declined` (and `reinstated`, declared but see below). `requestableUntil` is non-null only for `can_request`. |
| `POST /users/me/username-review` | `JwtAuthGuard`, `@AuthRateLimit()` | Creates the request; `201 { state: 'pending' }`. |
| `GET /admin/username-reviews` | admin JWT, `moderator` / `superadmin` | Newest first, keyset cursor (`cursor`, `limit` 1..50 default 20, `status`). |
| `POST /admin/username-reviews/:id/decide` | admin JWT, `moderator` / `superadmin` | `200 { id, status, decidedAt }`. |

### Why the POST has no consent / email / profile-complete guard

The asker has **no username**, so `ProfileCompleteGuard` would refuse them (that guard exists to stop a username-less
account posting). A restricted-pending minor or an unverified account must still be able to ask, exactly as report and
appeal stay open (#370). The route is listed in `write-route-guards.spec.ts`'s `OPEN_ROUTES` with that reason, and a
unit test pins that the controller carries `JwtAuthGuard` and none of the three.

### Errors (branch on `code`, never on the English)

User: `403 username_review_not_available` (has a username, never revoked, or the account is not active: one code, so it
does not say which), `403 username_review_window_closed`, `409 username_review_already_requested` (any status, and the
loser of a simultaneous pair), `400 username_review_message_invalid` (over 500 characters after trimming).

Admin: `400 username_review_reason_invalid`, `404 username_review_not_found` (a missing id **and** a minor's request this
admin may not see: the same body), `403 username_review_own_revocation` (the revoking admin), `409
username_review_not_pending` (already decided, or lost a race), `409 username_review_user_has_username`, `409
username_review_handle_unavailable`, `409 username_review_user_unavailable` (anonymised), `400
username_review_cursor_invalid`.

## Rules

- **One request per revocation** (`UsernameReviewRequest.revokedUsernameId` is unique). A user revoked twice has two
  records; the routes use the **latest** (by `revokedAt`).
- **The window.** The user can ask until the **end of the UTC calendar day** that falls 30 days after `revokedAt`
  (`username-review-window.util.ts`). The route and the email call the same two functions with the same `revokedAt`, so
  the date the email names is exactly the last day it works. Adopted default: it can be up to 24 hours more than a strict
  30 days; the alternative (an instant) would let someone asking late on the emailed date be refused.
- **Who revoked** (`revoker.sql.ts`, one SQL expression used by the list and the decide lookup): `RevokedUsername.
  revokedByAdminId`; else, for rows written before that column existed, the `user.username_revoked` audit row for that
  user and handle written at or before the record's `revokedAt` (+1 minute); else unknown (NULL), which excludes
  nobody. The revoker does not see the request in the list and gets `403 username_review_own_revocation` on decide.
- **Minors.** A request from a user with `isMinor` is **absent** from the list for an admin who is not child-safety
  vetted, and a decide on it is the same `404` as a missing id. Uses `isAdminChildSafetyVetted` (a fresh read, whatever
  the role). The audit row about a minor is hidden from an unvetted admin by the audit-log reader's existing rule
  (`targetType 'user'` + a minor), proven in the e2e.
- **Reinstate** (one transaction): claims the request (`status = 'pending'` in the WHERE, so two admins leave one
  winner); refuses if another user's **running hold** names the handle; restores `User.username` **only if the user
  still has none** (and the unique index refuses a handle someone else took: both are `409`); writes the audit row;
  deletes the `RevokedUsername` record (its request goes by cascade). `usernameChangedAt` is left NULL: the revoke
  cleared it, so a reinstatement **neither grants nor burns** a username change (the first change is free, as after any
  first pick). A user who has already chosen a new username can no longer be reinstated; the admin can still decline.
- **Decline** (one transaction): claims the request, writes the audit row. The record and the permanent bar stay.
  Final: no second review.
- **The audit row** is `user.username_review_decided` (`targetType 'user'`), notes
  `decision=<reinstate|decline>; username=<handle>; reason=<reason>`, written in the same transaction as the decision.
  If the audit write fails the whole decision rolls back (proved against Postgres with a trigger).
- **After the commit, best effort, never undoing the decision:** an in-app `Notification` (`username_review_decided`,
  `payloadRefId` `reinstated` | `declined`, resolved to `data: { usernameReview: { outcome } }`) and, for a minor, a
  guardian notice `username_restored` / `username_review_declined` through `GuardianSecurityNoticeService` (its
  withhold-guardian-notices rule and throttle apply). **The admin's reason is internal: it reaches neither.**
- **Retention.** The request is deleted with its `RevokedUsername` record on every path that deletes it: reinstatement,
  the anonymisation-plus-hold-over path (`anonymizeUser`, `cleanupRevokedUsernames`, `purgeOne`), by cascade. It is also
  deleted explicitly at anonymisation even while the hold still keeps the record, because the message is the user's own
  free text. `UsernameReviewRequest.userId` is classified `'content'` in `anonymized-row-purge.references.ts` (a surviving
  request would block a purge instead of being silently dropped).

## Adopted defaults (all veto-able; the founder did not state them)

30-day window tied to `USERNAME_REVOKE_HOLD_DAYS` and extended to the end of the UTC day; 500-character message (the Report
description limit); reason 10 to 500 characters, required for **both** outcomes; page size the admin-list default (20/50);
the shared `@AuthRateLimit()` (5 per 60 s per IP) on the POST; an unknown revoker excludes nobody; the latest revocation
is the one a user can ask about; the path `users/me/username-review`; the notification type name
`username_review_decided`; the new guardian-notice wording; error codes.

## Known edges, not fixed

- `reinstated` is in the declared state set but the API **cannot return it**: reinstating gives the user a username (so
  the state reads `none`) and deletes the record the state is computed from.
- A pending request whose user later chooses a new username stays pending; it can only be declined (reinstating is a
  `409`). The list does not flag it.
- With few eligible admins a request can wait; no alert or fallback exists (decided: it waits).
- The decline reason is not shown to the user (decided: internal). What the user sees on a declined request is new web
  wording, not built here.
- The list returns the user's `displayName` (admin-facing). No date of birth, email or phone is ever selected.

## Tests

`username-review-window.util.spec.ts` (hand-derived dates, leap day, year edge, the window edge),
`username-review.service.spec.ts`, `admin-username-reviews.service.spec.ts` (list SQL, every decide branch, atomicity),
the two controller HTTP specs, and `test/username-review.e2e-spec.ts` (real Postgres and Redis: the full flow through a
real revoke, the list and its rules, decide, races, a trigger-forced rollback, notifications, guardian notices, the audit
log, retention and cascade, the migration replayed over existing rows, and the real rate limit).
