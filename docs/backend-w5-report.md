# Backend W5 report - profile content, avatar, Block, other-user profile

Branch `backend/w5-profile-block` (from fresh `origin/main` `b25261c`). `services/api` plus one optional environment variable in `render.yaml` / `.env.example` / `docs/deployment.md`. **No frontend, no Figma, no `.docx` edited.** Rows: B-035, B-038, B-039, and the backend legs of B-007, B-081, B-082, B-108. Decisions: #371, #394 (A2, A3), #396, #402 (item 4), #403 (items 16, 17), #404 (items 8, 11), #405, #406 (item 12), #307.

Rule followed: build exactly what the rows and Decision Log decide; where a point is not decided, stop on it, list it OPEN (section 4) and build the rest.

## 1. What was built

| Brief item | Built | Where |
|---|---|---|
| (a) profile country | `User.profileCountry` (ISO 3166-1 alpha-2, upper-case, nullable, CHECK `^[A-Z]{2}$`). Full list = all 249 assigned codes; `ZZ`/`XX`/unassigned refused (`400 invalid_profile_country`). Written by `PATCH /users/:id`, returned by `GET /users/:id`, **shown to other users only if filled in**. It never reads or writes `declaredCountry` / `derivedCountry` (the safeguarding country): a minor's country is visible only if the minor entered it, proved by unit and e2e tests. | `users/profile-country.constants.ts`, `users.service.ts`, `update-user.dto.ts` |
| (b) bio, preferred club | `User.bio` (<= 160) and `User.preferredClub` (<= 80, free text, **not** `clubAffiliationId`), CHECK-constrained, trimmed, `null`/blank clears. Both pass the sensitive-content screen (#366/#394 A3): a flagged value is `422 sensitive_content_rephrase_required` naming the field and categories (never the text), nothing saved (the whole request is refused). Bio is shown to every viewer including for a minor (#371); preferred club is **not** exposed to other users (not in the #371 list, OPEN). | same |
| (c) avatar upload | `User.avatarUrl` / `avatarKey` / `avatarStatus` (all NULL or all set, CHECK). `POST /users/:id/avatar` (multipart `file`, self only, JPEG/PNG/WebP, 5 MB via multer, magic bytes checked) and `DELETE /users/:id/avatar`, on the **same `StorageService`** the admin media route uses. With no object store configured it is **the same 503** as `POST /admin/media/upload` and nothing is written: proven by a unit test against the real `S3StorageService` and by an e2e test that calls both routes and asserts identical status and body. A new upload is `pending`; replacing/deleting removes the old object best-effort. Optional `S3_PUBLIC_BASE_URL` (B-035 "R2 public URL") added. | `users/user-avatar.*`, `storage/s3-storage.service.ts` |
| (d) Block | `Block` model, `POST/DELETE /users/:id/block`, `GET /users/:id/blocks`, and the enforcement listed in `block/README.md`. All of #396 C2, #402 item 4, #403 item 16, #404 items 8 and 11, #406 item 12 as written. | `modules/block/` and the services it touches |
| (e) other-user public profile | `GET /users/:id/public-profile` gains `bio`, `country`, `avatarUrl` (approved only), `isFollowing`, `viewerHasBlocked`; a user the target has blocked gets the same 404 as a non-existent profile; restricted-pending and non-active stay the plain 404 (decided first). **Pinned entry not built** (B-091). | `users.service.ts` |
| (f) other B-081 backend needs | read-only DOB (already true), username (W4), gate for restricted-pending (already true), the optional country / bio / preferred club / avatar (above). Nothing else in B-081 needs backend. | - |

Also: `AccountDeletionSweepService.anonymizeUser` now clears the new columns, deletes every Block row the user is part of (both directions) and removes the avatar object after the commit (best effort; a storage failure never undoes the anonymization).

### Block enforcement table (full detail in `services/api/src/modules/block/README.md`)

Feeds (own, club, Banter room), single post, like / comment / save / view, comment list, saved posts, `GET /search` (users and posts; the route now reads the token **optionally** and stays public), club and Community Group rosters, followers / following, suggested users: hidden **both ways**, counts unchanged. Follow and DMs stop both ways; the **blocked** user gets the same 404 a missing user gets, only the **blocker** gets a coded 403 (`you_blocked_this_user`). Decided after the age rules. Leaderboard unaffected.

## 2. Migration (one, additive, rollback noted in its header)

`20261020151920_add_profile_fields_avatar_and_block`: six nullable columns on `User`, table `Block` (unique `(blockerId, blockedId)`, unique `sequence`, index `blockedId`, FKs RESTRICT like `Follow`), CHECK constraints (avatar coherence, avatar status values, country shape, bio / club / reason lengths, no self-block). Nothing altered or dropped; `User` / `Guardian` safeguarding fields untouched. Applied to the dev and e2e databases; `prisma migrate diff` against the migrated database: no difference. Rollback (manual, in the migration comment): drop the table, the five constraints and six columns.

## 3. Judgment calls (adopted defaults, all veto-able)

1. **Avatar stays `pending` and invisible to everyone but its owner** until something sets `approved`. The automatic image check (B-036) does not exist and #371 says flagged images must not go live; serving an unchecked picture of a child is the unsafe default. Consequence: no avatar is visible to other users in this build. Changing it is one line in `getPublicProfile`.
2. **Avatar file rules**: JPEG/PNG/WebP only (no GIF, no video), 5 MB, magic bytes must match the declared type.
3. **Lengths**: bio 160, preferred club 80, block reason 500 (the Decision Log fixes none).
4. **"Please rephrase" is a refusal**: no "share anyway", no auto-logged Report (unlike Grassroots).
5. **Block guards are the literal pinned rule** (Consent on both forms, EmailVerified on the creating form); pinned in `write-route-guards.spec.ts`.
6. **Blocking a hidden profile (non-active, restricted-pending, missing) is a 404**, so the endpoint cannot be used to learn an account exists.
7. **Unblock of a user who was not blocked is a 200 no-op**; blocking twice is a 200 that keeps the first reason.
8. **The blocker gets a coded 403, not a 404**, when following / messaging someone they blocked.
9. **`isFollowing` and `viewerHasBlocked` on the public profile** (first-paint state the page needs; the #153 / #224 precedent). Safe: the blocked user never reaches that response.
10. **`GET /search` reads the bearer token optionally** so a logged-in caller's blocks apply; anonymous behaviour unchanged.
11. **Block list ordering and cursor use only `sequence`**: no date is shown and none leaks through a cursor.
12. **A blocked thread keeps its history readable**; sending stops (404 for the blocked sender, 403 for the blocker).

## 4. Stopped on (OPEN, not decided, not invented)

- Whether an unchecked avatar may be served before B-036 (judgment call 1).
- Whether a flagged bio / preferred club can be confirmed anyway, and whether it should log a moderation Report.
- Whether the profile shows the preferred club to other users.
- **Cover photo**: not built (the instruction named the avatar; B-035's title lists cover columns). Trivial to add on the same pipeline once decided.
- Block: Bants room listing / membership, existing `Notification` rows between a pair, whether a blocked thread should disappear from either inbox, Contest winners lists, and whether Block is exempt from the consent / email guards.
- Image check (B-036), EXIF-stripping re-encode, flagged-image queue (B-037), CSAM path: not built, not decided.
- The `S3_PUBLIC_BASE_URL` value (r2.dev or custom domain) and the Cloudflare account / bucket are human actions; until then nothing stored is publicly readable.

## 5. Verification (measured in this session)

- `npx tsc --noEmit`, `npm run lint`, `npx nest build`: clean. `prisma migrate diff`: no difference.
- **Mocked suite** (`npx jest --maxWorkers=4`): **155 suites / 2,710 tests, 0 failures.** Seven new suites (block util / service / controller, avatar service / controller, profile country, users W5) account for the +7 over the last recorded 148 suites; the before figure was **not re-measured** on a clean checkout, so no test-count delta is claimed. Existing specs changed because behaviour changed: feed (block clause in post, comment, saved-post and feed queries), messaging (third read in the parity set, block cases), users (public profile, follower lists, suggested users, controller arguments), search controller (optional guard), clubs and community-groups rosters, account-deletion sweep (new mock members and update data), `write-route-guards.spec.ts` (four new routes).
- **API e2e** (real Postgres, `npm run test:e2e`, `--runInBand`): **49 suites / 560 tests, 0 failures** (last recorded 48 / 523; the one new file is `test/profile-block.e2e-spec.ts`, 37 tests). It covers every Block rule listed above, the profile fields, the DB CHECK constraints, the avatar 503 parity with the admin route, and the avatar lifecycle against a fake object store.
- **Playwright `e2e/` suite**: **180 passed, 0 failed** (5.3 min; last recorded 180, unchanged: this PR touches no `apps/web` or `apps/admin` code). The suite does not exercise Block, the avatar or the new profile fields, which are proven by the API e2e above.

## 6. Notes for whoever builds the frontend

- Edit Profile / Create Profile: PATCH accepts `bio`, `preferredClub`, `profileCountry`; show the coded 422 as the inline "please rephrase" state; `GET /users/:id` returns `avatar: { url, status }`.
- Other-user profile: use `public-profile` (`bio`, `country`, `avatarUrl`, `isFollowing`, `viewerHasBlocked`); a 404 for a blocked viewer is the generic not-found page.
- Blocked users list: `GET /users/:id/blocks`; handle `403 you_blocked_this_user` on follow / message.

## 7. Decision Log forward-pointers to append by hand (`.docx` not edited)

- **#371**: "B-035/B-038 built by backend/w5-profile-block (docs/backend-w5-report.md): bio, avatar, profile country as columns; avatar upload on the admin media pipeline; avatars stay invisible to other users until the image check (B-036) sets approved. Cover photo not built."
- **#396**: "B-039 built: Block model and endpoints with the #402 / #404 / #406 rules; see services/api/src/modules/block/README.md. Still open: Bants rooms, existing notifications, blocked-thread inbox visibility, guard exemption."
- **#403 (item 17)**: "Profile country built as its own column; never the safeguarding country."
- **#394 (A3)**: "Inline 'please rephrase' is a coded 422 on PATCH /users/:id, no override (adopted default)."
- **#307**: "S3_PUBLIC_BASE_URL added (B-035); a human must still set it."

## 8. Register status lines

Appended to `docs/build-register.md` (original text unchanged) on B-007, B-035, B-038, B-039, B-081, B-082, B-108; Section 31 summarises them.
