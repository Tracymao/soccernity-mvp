# Backend W4 report - username rules, admin revoke, revoked-handle hold, name-keyset cursors, required countryCode

Branch `backend/w4-username-revoke`. `services/api` only (plus docs). **No frontend change, no Figma, no `.docx` edited.** Rows: B-031, B-032, B-033, B-034, plus the `RegisterDto.countryCode` change the founder asked for in the same instruction. Decisions: #364, #369, #398 (D3), #402 (item 3), #403 (item 15), #404.

No new environment variable, key or account is needed, so `render.yaml` and `.env.example` are unchanged (`env-completeness.spec.ts` is green).

## 1. What was built, per row

| Row | Built | Where |
|---|---|---|
| **B-031** username required | A user can no longer **clear** their own username: `PATCH /users/:id` with `username: null` is a `400 username_required` (nothing read, nothing written). No account exists without a username once it has chosen one (#369); the only road back to "none" is an admin revoke (B-033). Sending the handle the account already has is a no-op (no rules, no cooldown). Setting a username is still what completes the profile (B-027 gate unchanged). | `users.service.ts` `updateOwnProfile`, `dto/update-user.dto.ts` |
| **B-032** rules | Written here, because #369 left them "specified in the build PR". **Pure rules** (`username-rules.util.ts`, lists in `username-rules.constants.ts`): at least one letter; reserved words (admin, moderator, support, staff, official, system, null, member, ...) matched after normalisation, so `adm1n`, `4dmin`, `admin2024`, `a_d_m_i_n`, `realadmin`, `supportteam` are caught but `badminton_pro` is not; the platform name anywhere in the handle; profanity (a CONTAINS list of long terms, an EXACT list of short ambiguous ones so `dickson_fc9` / `nazir_10` / `torpedo_7` pass); contact details and off-platform handles (`snapchat_tom`, `tom_gmail_com`); personal data (6+ digit run or 8+ digits, the user's own full name in either order, the local part of their own email, their own birth year or ddmmyy read from the **encrypted** DOB). **Database rules** (`username-policy.service.ts`): a handle that equals a **club name** (raw SQL over `ClubPage`, punctuation and a leading/trailing fc/official ignored); a handle revoked from **this user**; a handle under another user's **30-day hold**; the **change cooldown** (30 days). Refusals: `400 username_not_allowed` with one generic message that does not say which rule (so the lists cannot be probed), except the personal-data case, which says so because it is about the user's own details; a held handle is a `409 "already taken"`; the cooldown is `429 username_change_cooldown` with `availableAt`. Plain uniqueness is still the unique index (`P2002` -> 409). | `users/username-*.ts`, `schema.prisma` |
| **B-032/B-033** hold + permanent bar (#398 D3, #402 item 3) | New table `RevokedUsername` (`username`, `userId`, `revokedAt`, `holdUntil`; unique on `(username, userId)`). For 30 days nobody can take the handle; **for ever** the revoked user cannot re-pick it (the row is never deleted; only `holdUntil` expires). `userId` is a plain string, not a foreign key, on purpose (a moderation record must survive anonymisation and must not add another RESTRICT reference to `User`, #341). | migration `20261017180000_...` |
| **B-033** admin revoke | `POST /admin/users/:id/username-revoke { reason }` (moderator / superadmin, same class-level gate as the rest of `admin/users`). ONE transaction: clears `User.username` and `usernameChangedAt` (optimistic lock on the handle, so two admins or a racing user leave one winner), upserts the `RevokedUsername` row, writes the `AdminActionLog` row `user.username_revoked` with admin, target, handle, hold end and the **reason**. After commit, best effort: the user is emailed (`username-revoked`, wording `[COPY PENDING LEGAL REVIEW]`). The account is back in the incomplete-profile gate with no extra state: other users see `Soccernity member`, it cannot post, and `nextStep` is `create_profile` - **on its existing access token**, because the guard reads the column fresh (proved by e2e). It can then pick a new handle with no cooldown. `GET /admin/users/:id` gains `usernameRevocations` (handle, when, hold end; never the reason) so the User Detail screen can show it. | `admin-users/admin-user-username-revoke.service.ts`, controller, detail service |
| **B-034** cursors and ordering | The club roster, Community Group roster and people search no longer order by `displayName` or put it in the cursor. New shared util `users/user-name-keyset.util.ts`: order `username asc NULLS LAST, id asc`; the cursor is `{ username, id }` (the public identifier or `null`, never a real name); the "after" filter names the NULL group explicitly because SQL comparisons never match NULL. The old per-module member/user cursor functions are deleted. | `clubs`, `community-groups`, `search` services |
| **countryCode** | `RegisterDto.countryCode` is required (`@Matches(/^[A-Za-z]{2}$/)`, no `@IsOptional`): a missing or malformed value is a 400 before any user or guardian row exists. It remains audit-only (`User.declaredCountry`); the derived country still decides card verification, so nothing that was safe becomes less safe. | `register.dto.ts` |

## 2. Migration (one, additive, listed as asked)

`20261017180000_add_username_change_cooldown_and_revoked_username`:
- `ALTER TABLE "User" ADD COLUMN "usernameChangedAt" TIMESTAMP(3);` (nullable, no backfill: nobody is in a cooldown on the day it ships)
- `CREATE TABLE "RevokedUsername" (...)` with a unique index on `("username","userId")` and an index on `("username","holdUntil")`.

No column or table is altered or dropped. Applied to the dev and e2e databases; `prisma migrate diff` against the migrated database: no drift. `User` / `Guardian` safeguarding fields untouched.

## 3. Behaviour changes other people will notice

1. **The web Edit Profile modal still sends `username: null` when the field is blanked** (`apps/web/.../EditProfileModal.tsx`, line ~142, and its test). It now gets a 400 and shows the server message. Frontend follow-up: do not send `null`, and show `code` messages (`username_not_allowed`, `username_change_cooldown`, `username_required`). Not changed here (backend-only brief).
2. **Pagination cursors from before this change stop working** on the three lists (a 400 "Invalid pagination cursor"); a client simply restarts the list. Nothing persists them.
3. **Roster / search order changes** for everyone: by username, accounts without a username last. A roster is no longer in real-name order.
4. **Any existing username is not re-screened.** The rules apply when a handle is set or changed. A handle chosen before this change that breaks a rule is dealt with by the admin revoke.
5. `RegisterDto.countryCode` required: any client that omits it (none known: apps/web always sends it) now gets a 400.

## 4. Judgment calls (adopted defaults, all veto-able)

1. **One free correction.** The first choice does not start the cooldown, and neither does the pick after an admin revoke; only a change from one handle to another does. So a typo at Create Profile can be fixed once, then 30 days apply.
2. **30-day change cooldown, 30-day hold** - both named constants (`username-rules.constants.ts`), not environment variables. The hold is decided (#398); the cooldown length is mine.
3. **No hold on a handle released by the user** (a normal change) or by anonymisation. #398 D3 decided the hold for a REVOKED handle only; extending it is one line if wanted.
4. **The reason is internal.** It goes to the audit record only. The email and `RevokedUsername` carry no free text; the email states the rule categories and the consequences.
5. **The error message is generic** for every rule except personal data, so the blocklists cannot be mapped by trial.
6. **Club-name check only covers `ClubPage`.** Grassroots team names, Community Group names and Banter room names are not compared.
7. **Reserved/profanity/contact lists are short, English-only and low-precision**, like the pre-publication sensitive-content screen. They are a first line; the revoke is the real moderation tool.
8. **Birth-year check only uses the user's own DOB** (so `striker2010` is fine for someone not born in 2010). A generic "contains a plausible birth year" rule would over-block ordinary handles; not built.
9. **Moderator and superadmin may revoke** (same as the rest of `admin/users`); editors may not.

## 5. Not built / still open

- **`apps/admin` User Detail screen and revoke dialog** (B-104/B-109 frontend leg, B-033's design follow-up): no frame, no code. The endpoint and the detail data exist.
- **`apps/web`**: Edit Profile must stop sending `null` and handle the new error codes (Section 3, item 1); Create Profile (B-081) will be the real first-choice screen.
- **Counsel-pending:** the revoke email wording, and the on-screen consequences once a screen exists (Part C row 33 still gates this row).
- **No retention rule for `RevokedUsername`** (it is the permanent record that a user cannot re-pick a handle) and no appeal path for a revoke; both are founder/counsel calls. The audit row holds the handle and the reason, which may name other people: same retention question as every `AdminActionLog` row.
- **Personal-data screening is partial** (Section 4, items 6-8): no guardian name, no school or town names, no birth year other than the user's own.
- **A revoke does not touch content, the account status or any open report**, and does not notify a reporter; those are separate moderation actions.
- **The 429 on cooldown shares the status code with the rate limiter**; clients should branch on `code`.

## 6. Verification

- `npx tsc --noEmit`, `npx eslint src test`, `npx nest build`: clean.
- **Mocked suite** (`npx jest --maxWorkers=4`): **143 suites / 2,321 tests, 0 failures.** The figure on clean `main` before this change was **not re-measured** (the last recorded figure, 139 suites / 2,210 tests, predates several merged PRs), so no before/after delta is claimed. New spec files (4 suites, 79 tests): `username-rules.util` (43), `username-policy.service` (13), `user-name-keyset.util` (13), `admin-user-username-revoke.service` (10). Extended spec files, test count now: `users.service` 73 (username write path rewritten), admin-users controller 40 (revoke route cases added), `admin-user-detail` 10, registration controller 21 (required `countryCode` cases), registration email 27 (revoked-username email), clubs service 32, community-groups service 22, search service 25 (cursor cases rewritten). Existing tests that encoded the old behaviour were changed, not deleted: the "null clears the username" tests (now assert the 400), the cursor tests on the three lists (now assert username keyset, no real name, legacy cursors refused), and every spec that constructs `UsersService` / `AdminUsersController` (new dependency).
- **e2e** (real Postgres, `npm run test:e2e`, `--runInBand`): **46 suites / 507 tests, 0 failures** (the whole suite, run once after all changes; the last recorded figure, 45 suites / 478 tests, predates several merged PRs, so no delta is claimed). The one new spec file is `test/username-rules-revoke.e2e-spec.ts`.
- New e2e `test/username-rules-revoke.e2e-spec.ts` (28 tests): every rule through the real endpoint with nothing stored on refusal; the club-name raw SQL against real `ClubPage` rows; own-name / email / birth-year (from the encrypted DOB) checks; cooldown (free first choice, one free correction, 429 with the exact `availableAt`, opens after 30 days, concurrent changes yield one winner); the revoke as one transaction (user cleared, `RevokedUsername` row with a hold of exactly 30 days, one audit row with the reason, email called once); the existing token loses the right to post at once; the new handle is free of cooldown; the hold for everyone else and its expiry; the permanent bar on the revoked user even after the hold ends; revoke twice keeps both handles barred; editor 403, missing/short reason 400, unknown user 404, no username / anonymised 409, a user token 401; the detail endpoint lists revocations without the reason; and the three paged lists walked end to end (usernames ascending, then the no-username group by id, no gaps or repeats, cursors contain only `username` and `id`, never a real name; legacy cursors 400). `username.e2e-spec.ts` updated (null is now a 400); `country-derivation.e2e-spec.ts` updated (missing and malformed `countryCode` are 400s, `registerBody` defaults to `GB`); the other registering e2e specs now send `countryCode`.

## 7. Decision Log forward-pointers to append by hand (`.docx` not edited)

- **#369**: "Rules specified and built by B-032 (docs/backend-w4-username-report.md): reserved words, impersonation (club names), profanity, contact details, personal data, 30-day change cooldown, revoked-handle hold. A user can no longer clear their own username (B-031)."
- **#398 (D3)**: "Built by B-033: POST /admin/users/:id/username-revoke (moderator, superadmin), reason required and stored in the audit record, user emailed [COPY PENDING LEGAL REVIEW], account back in the incomplete-profile gate, handle held 30 days for everyone and barred for ever for that user. The User Detail screen in apps/admin is not built."
- **#402 (item 3)**: "Built: RevokedUsername (30-day hold for everyone, permanent bar for the revoked user)."
- **#364**: "Open items (1) ordering by displayName and (2) username moderation are closed by B-034 and B-032."
- **#404 (item 12 / B-034)**: "Cursor and ordering leak closed: lists order by username, cursors carry username and id only."
- **#367/#368** (country): "RegisterDto.countryCode is required (apps/web sends it since B-073)."

## 8. Register status lines

Appended to `docs/build-register.md` (original text unchanged) on B-031, B-032, B-033, B-034 (Section 20 summarises them).
