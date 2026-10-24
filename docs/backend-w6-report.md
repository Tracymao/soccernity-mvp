# Backend W6 report - username allow-list, cover photo, Block guards and notifications

Branch `backend/w6-username-cover-block` (from fresh `origin/main` `947d0a7`). `services/api` only; one additive migration; no new environment variable. **No frontend, no Figma, no `.docx` edited.** Rows: B-181, B-196, B-197 (and status lines on B-035, B-039, B-026). Decisions: #410 (item 2), #411 (items 4, 5, 9), #396, #402 (item 4), #404 (items 8, 11), #406 (item 12), #370, #371, #394 (A2).

Rule followed: build exactly what the register rows and the newest Decision Log rows decide; where a point is not decided, stop on it, list it OPEN (section 4) and build the rest.

## 1. What was built

| Brief item | Built | Where |
|---|---|---|
| (a) B-181 username allow-list | The handle **as typed**, compared case-insensitively, is `nazif`, `nazifa` or `nazifah`, **or** one of them followed only by digits with at most one underscore between (`^(nazif\|nazifa\|nazifah)_?[0-9]+$`). **No underscore removal.** It exempts only the guarded `nazi` CONTAINS rule; every other rule still runs. Accepted: `nazif`, `Nazifa`, `NAZIFAH`, `nazifa2`, `nazif_10`, `Nazifah_2024`, `nazif7`. Refused: `nazifan`, `nazifan_10`, `nazif_an`, `nazi_f`, `nazif_a`, `naz_ifa`, `_nazif_`, `xnazifa`, `nazifax`, `nazif__10`, `10nazif`, `n4zif`, and `nazifhitler` / `nazif_porn` (other rules). | `users/username-rules.util.ts` (`isAllowedNameHandle`), `username-rules.constants.ts`, `username-rules.util.spec.ts` |
| (b) cover photo | `User.coverUrl` / `coverKey` / `coverStatus` (migration `20261024120000_add_user_cover_photo`: additive, all-NULL-or-all-set CHECK, status CHECK, **rollback noted in its header**). `POST` / `DELETE /users/:id/cover` on the **same `StorageService`** as the avatar and the admin upload: **the same 503 with no object store and nothing written**, proven by a unit test against the real `S3StorageService`, a parity test (cover vs avatar, identical outcome for eight file cases and identical 503 body) and an e2e test that calls the cover, avatar and admin routes and asserts identical bodies. Same file rules (new shared `profile-image.util.ts`, which the avatar now uses too, so the two cannot drift): JPEG/PNG/WebP, 5 MB, magic bytes. Same guards as the avatar (Consent on both forms, EmailVerified on the creating form, not ProfileComplete). Same **pending-and-invisible** rule: `GET /users/:id/public-profile` returns `coverUrl` for `approved` only (so `null` today); `GET /users/:id` returns `cover: { url, status }` to the owner. Replace, delete and anonymization remove the stored object (best effort); anonymization clears all three columns. | `users/user-cover.*`, `users/profile-image.util.ts`, `users/users.service.ts`, `account-deletion/account-deletion-sweep.service.ts`, `prisma/schema.prisma` |
| (c) Block guards | `POST /users/:id/block`, `DELETE /users/:id/block` and `GET /users/:id/blocks` need **authentication only**: `GuardianConsentGuard` and `EmailVerifiedGuard` removed. `write-route-guards.spec.ts`: both writes moved to `OPEN_ROUTES` (which asserts they carry no consent / email / profile guard), plus a dedicated test that `JwtAuthGuard` stays on the class and no handler (block, unblock, list) carries any of the three guards; the two new cover routes pinned `CE` / `C`. The **target** rules are unchanged (a restricted-pending or non-active target is still the plain 404). | `block/block.controller.ts`, `write-route-guards.spec.ts` |
| (c) no new Notification rows | `hasBlockBetween(tx, actor, recipient)` (in `block/block.util.ts`) is checked inside the transaction of each of the six actor-based triggers: `follow`, `like`, `comment`, `message`, `fixture_scheduled`, `result_logged`. The action itself still succeeds; only the notification is skipped. | `users.service.ts`, `feed.service.ts`, `messaging.service.ts`, `grassroots.service.ts` |
| (c) hide existing rows from both sides | `notificationBlockHiddenFilter` (new, `notifications/block-visibility.util.ts`) is applied to `GET /notifications`, the unread count (one shared Block read per list call), `PATCH /notifications/read-all` (hidden rows stay unread and are not counted) and `PATCH /notifications/:id/read` (a hidden row is the same 404 as a missing one). "Between the pair" is derived per type: `follow` from the follower id, `message` from the shared Conversation, `fixture_scheduled` / `result_logged` from a Fixture whose two teams the pair manages. Hidden at read time, never deleted: the rows reappear on unblock. A user with no Block on either side pays one extra read and gets an empty fragment. | `notifications/notifications.service.ts`, `notifications/block-visibility.util.ts` |
| (c) everything else as built | Unchanged: Bants listing, blocked thread readable and sending stopped, contest winners lists and leaderboard unaffected, a tap on a blocker's name is the generic not-found. | - |

## 2. Migration (one, additive)

`20261024120000_add_user_cover_photo`: three nullable columns on `"User"` and two CHECK constraints, the avatar's exact shape. Rollback (manual, in the file header) drops the constraints and columns; a cover object already uploaded stays in the bucket. Applied to the dev and test databases by `prisma migrate deploy` / the e2e `globalSetup`; `prisma migrate diff` shows no drift.

## 3. Judgment calls (adopted defaults, all veto-able)

1. **Digit form of the allow-list** uses the reading already recorded in register row B-181: any number of digits, at most one underscore between name and digits. The decision's examples are `nazifa2` and `nazif_10`.
2. **Digits before the name** (`10nazif`) and **a cap on the number of digits** are not decided: the first stays refused, the second is unlimited.
3. **`coverUrl` on the other-user public profile.** The brief says "same pending-and-invisible rule as the avatar", so the public profile carries `coverUrl` exactly as it carries `avatarUrl` (approved only, null today). No frame draws it yet.
4. **A hidden notification cannot be marked read by id**: it is the same 404 as a missing row, and read-all leaves it unread and uncounted, so unblocking brings it back exactly as it was.
5. **Hiding is at read time** (the register's adopted default); deleting the rows instead is not decided.
6. The cover upload rejects the same non-image inputs as the avatar with the **same message**; a shared helper (`validateProfileImage`) is the single definition.
7. `GET /search` and the other surfaces W5 covered are untouched.

## 4. Stopped on (OPEN, not decided, not invented)

- **Existing `like` and `comment` notification rows between a blocked pair cannot be hidden.** A `Notification` stores no actor for those two types (`payloadRefId` is the post), so a row cannot be attributed to a person; hiding every like / comment row on a post a blocked user touched would hide other people's. The fix is an `actorId` column on `Notification` written by the like / comment triggers, which is a schema addition that is not in the register or the Decision Log. Those rows render as "Someone" (no identity is exposed). *New* like / comment rows are suppressed (write side).
- **System notifications with no user actor** (`moderation_decision`, `contest_*`, `age_milestone`, `match_kickoff`) are not filtered. Whether a blocked reporter / reported pair should still receive the outcome of an admin decision is not decided.
- Cover **dimensions and aspect ratio** (a frontend concern until a frame draws it), **EXIF stripping** (B-205), and the **image check / review queue** (B-036, B-037), which still decide when any avatar or cover can go live.
- Whether hidden notification rows should be deleted instead of hidden.

## 5. Verification (measured in this session)

- `npx tsc --noEmit`, `npx eslint src test`, `npx nest build`: clean. `prisma migrate deploy` applied the new migration to the test database.
- **Mocked suite** (`npx jest --maxWorkers=4`, run alone on a quiet machine): **158 suites / 2,770 tests, 0 failures** (W5 report: 155 / 2,710; the three new suites are the cover service, the cover controller and the notification block-visibility util; the before figure was not re-measured on a clean checkout, so no delta is claimed beyond the suite count). An earlier full run, made while other jobs were running, showed 3 failures in `sports.controller.http.spec.ts` and `auth.controller.http.spec.ts` (650-737 s wall clock each, real-HTTP bootstrap under CPU contention); both suites pass alone (46 tests) and the quiet re-run was fully green. They have no connection to this change.
- **API e2e** (real Postgres, `npm run test:e2e`, `--runInBand`): **49 suites / 577 tests, 0 failures** (W5: 49 / 560). `test/profile-block.e2e-spec.ts` grew from 37 to 54 tests: Block exempt from the consent and email guards (restricted-pending minor, unverified account, authentication still required, target rules still apply), notifications between a blocked pair (follow and message rows hidden from both sides, unread count, read-all leaves them unread, mark-by-id 404, reappear on unblock, no new fixture_scheduled / result_logged rows while an unblocked control pair still gets both, unrelated users unaffected), the cover 503 parity with the avatar and the admin upload, the cover lifecycle against a fake object store (pending / approved / rejected visibility, independence from the avatar, replace, delete, outage, guards, anonymization removing the object), and the cover DB CHECK constraints.
- **Playwright `e2e/` suite**: **180 passed, 0 failed** (5.4 min; unchanged count, this PR touches no `apps/web` or `apps/admin` code).
- Unit coverage added: allow-list cases in `username-rules.util.spec.ts` (moved as decided), `user-cover.service.spec.ts` (incl. avatar parity), `user-cover.controller.http.spec.ts`, `block-visibility.util.spec.ts`, notifications service block cases, a blocked-pair case at each of the six trigger sites, public-profile cover visibility, sweep cover removal, and the guard table.

## 6. Decision Log forward-pointers to append by hand (`.docx` not edited)

- **#410 (item 2) / #411 (item 9)**: "B-181 built by backend/w6-username-cover-block (docs/backend-w6-report.md): the allow-list is an exact match on the handle as typed (no underscore removal) plus the name followed only by digits."
- **#411 (item 4)**: "Cover photo built (B-196) on the avatar pipeline with the same pending-and-invisible rule; cover dimensions and EXIF re-encode (B-205) still open."
- **#411 (item 5)**: "B-197 built: Block, unblock and the blocked list are authentication only; no new notification rows between a blocked pair and existing ones hidden at read time. Existing like / comment rows cannot be hidden without an actorId column (not decided)."
- **#370**: "Block routes are the one built exception to the uniform write block (#411 item 5); the cover routes follow the avatar's rule (CE / C)."
- **#396**: "Guard exemption and notifications decided and built (B-197); the like / comment rows remain OPEN."

## 7. Register status lines

Appended to `docs/build-register.md` (original text unchanged) on B-181, B-196, B-197, B-035, B-039, B-026; Section 33 summarises them. No B-ID added or removed (208).
