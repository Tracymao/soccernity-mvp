# Backend: social sign-in removed completely (Decision Log #479)

Branch `backend/social-removal`, 2026-11-09. `services/api`, `render.yaml`, `.env.example`, `docs/deployment.md`, `CLAUDE.md` and this report only. No `apps/web`, no `apps/admin`, no `.docx`, no `docs/build-register.md`, no Figma. The platform is not live.

Read first: `social-auth/README.md` (deleted by this change) and build-register rows B-084 and B-085. `apps/web` was already cleaned by PR #699.

## What was removed

| Area | Removed |
| --- | --- |
| Module | all of `src/modules/social-auth/` (controller, service, stores, provider client, constants, DTOs, test-support helper, README, 4 spec files); `test/social-auth.e2e-spec.ts` |
| `app.module.ts` | the import and the `SocialAuthModule` entry |
| `registration.service.ts` | the third `register()` argument and `SocialRegistrationContext`; the identity written in the same `user.create`; the P2002 mapping; `SOCIAL_SIGNUP_UNAVAILABLE_*`; the skipped verification email; the welcome-on-create `else` branch (B-069); the `Prisma` import |
| `registration.service.spec.ts` | the `register with a social context (B-084)` block (10 tests) and its unused imports |
| `registration.module.ts` / `registration.controller.ts` | `exports: [RegistrationService]` and the `export` on `toRegisterResponse` (their only importer was the social module) |
| Email | template `social-email-code`, `sendSocialEmailCodeEmail`, its quiet-set entry, both body cases, and its 2 spec tests |
| `write-route-guards.spec.ts` | the import, the controller in the list and the 5 `/auth/social/*` entries |
| Env | `GOOGLE_OAUTH_CLIENT_ID/SECRET`, `FACEBOOK_OAUTH_CLIENT_ID/SECRET` in `.env.example`, both `render.yaml` services, `test/env.ts`; the social paragraph in `docs/deployment.md` |
| Data model | model `SocialIdentity` and `User.socialIdentities` in `schema.prisma` |
| Account deletion | the `SocialIdentity.user` entry in `anonymized-row-purge.references.ts` (and its spec list) and `tx.socialIdentity.deleteMany` in `deleteBehaviouralRows` (and its spec mock and 2 assertions) |
| Comments | `account-email.service.ts` no longer mentions social sign-in |

## Kept on purpose

- `AuthService.signInVerifiedUser`: the password `login()` still calls it, so only its comment changed (it says it is now `login()`'s only caller).
- Normal registration is the pre-B-084 body, restored exactly. Every registration and auth spec that is not about social sign-in passes unmodified; the only edits to existing specs are deletions of social cases and one now-unused import.
- Unrelated uses of the words "social" (social writes, social graph), "Facebook" and Google (FCM push endpoints) are untouched.

## Migration `20261124090000_remove_social_identity`

Later than the latest existing migration (`20261123090000_add_report_context_message`). A `DO` block counts `"SocialIdentity"` rows and `RAISE EXCEPTION`s if there is any (the whole migration rolls back), then `DROP TABLE "SocialIdentity"`. Rollback notes are in the header (they restore only the empty table).

Proved on a private database (`soccernity_test_socialrm`, since dropped):

1. `prisma migrate deploy` applied all 85 migrations including this one (table empty); `prisma migrate diff` from the migrated database to `schema.prisma`: no difference.
2. Table recreated from the old migration, one `User` and one `SocialIdentity` row seeded, new migration SQL run in a transaction: it refused with `Refusing to drop "SocialIdentity": it still has 1 row(s). ...` and the row was still there.
3. Row deleted, SQL run again: `DROP TABLE`, and `to_regclass` returned null.

The table is expected to be empty everywhere (social sign-in needed OAuth keys nobody added). If a real environment has rows, stop and decide what to do with those accounts (a social-only account has no password it knows).

## Verification (measured)

Before-figures on a clean `origin/main` were not measured. After:

- `npx tsc --noEmit`: clean.
- `npx eslint "src/**/*.ts"`: clean (only the existing `/* eslint-env */` warning in `test-username-policy.ts`).
- `npx nest build`: clean. `npx prisma generate` ran.
- Full mocked suite (`jest --maxWorkers=4`): 304 suites, 303 passed, 1 skipped; 5,905 tests, 5,897 passed, 8 skipped (the real-ffmpeg ones), 0 failed.
- API e2e (real Postgres + Redis, private database, `--runInBand`): `account-deletion-sweep`, `anonymized-row-purge`, `auth`, `registration-club-join`, `email-verification`, `transactional-emails`, `w3-gates`: 7 suites / 110 tests, 0 failed.

## Suites not run

The rest of the API e2e suite (every other `test/*.e2e-spec.ts`), Playwright `e2e/`, and the `apps/web` and `apps/admin` suites (untouched). The pending-copy inventory test was not run separately (no `apps/*` string or manifest row changed).

## Forward-pointer notes (not edited here)

- `docs/build-register.md`: B-084 and B-085 status lines should say the backend code, `SocialIdentity` and its migration are removed (migration `20261124090000`); the Section 82 and 81b notes that "the built code is still on main" are now out of date.
- `docs/Soccernity_MVP_Build_Plan_v1.7.docx`: a dated forward-pointer on Decision Log #479 (implemented in `services/api`), #470 (withdrawn) and #468.
- `docs/legal-copy-draft-tos-privacy-policy.md` Part C row 41 (social sign-in processing) and any Privacy Policy sentence about Google/Facebook sign-in, for the safeguarding-drafter.
- `docs/figma-b085-social-sign-in.md` and the Figma frames of PR #639 are now orphaned design.
- `docs/sprint-2-auth-social-signin-report.md`, `docs/fc-social-removal-report.md`, `docs/docs-security-decisions-2026-11-08-report.md`: historical, not changed.

## Process notes

Built in its own worktree (`soccernity-social-be`) with its own `node_modules`, so `prisma generate` did not touch the shared client other worktrees use. My first background `npm ci` and a second one overlapped and left an incomplete tree; I deleted `node_modules` and ran one clean install.
