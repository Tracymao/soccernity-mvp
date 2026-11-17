# Suspected illegal imagery on profile pictures and covers (B-206)

Branch `backend/suspected-illegal-profile-images`, cut from `origin/main` `8255229`. `services/api` only (plus one label in `apps/admin`). No migration, no new environment variable, no user-facing copy, no register / Build Plan docx / runbook / `docs/deployment.md` edit.

## What was read first

`suspected-illegal-media` (service, module, README), `admin-media-review` (profile-image-review service, item-id helpers, README), `post-media/rejected-media-evidence.util.ts` and `RejectedMediaSweepService.processDeferred`, `users/user-image-review.service.ts` (`rejectProfileImage`, `discardPrivateCopy`), `user-avatar.service.ts`, `user-cover.service.ts`, `profile-image-publish.service.ts`, `profile-image-check.service.ts`, `account-deletion-sweep.service.ts` (`anonymizeUser`, `minimiseHeldUser`), the `SuspectedIllegalMedia` model and the `User_avatar_coherent` CHECK in `schema.prisma`.

## What was built

- `POST /admin/media-review/:id/suspected-illegal` accepts `avatar:<user>:<file>` / `cover:<user>:<file>` ids. Same guards and vetting (non-vetted admin: 404 on a minor's picture, coded 403 `child_safety_vetting_required` on an adult's). One transaction: `rejectProfileImage` with the shown file as the expected key, create the record, write the audit row (target type `profile_image`, `targetId` = the person, no reason text). A re-uploaded picture makes the id a 404 and nothing is set aside. A published picture is withdrawn to `private-profile/` first (existing rejection path); if that fails the answer is 503 and **nothing is rejected, recorded or audited**.
- Reuses the generic rejection reason, the existing "not approved" notification and the existing guardian notice. No new notification, no account hold.
- `GET /admin/suspected-illegal-media` and `/:id` return the profile records (`kind` `profile_avatar` / `profile_cover`) with a signed view link under the post-media rule, signed from the record's `objectKey`. `GET /admin/media-review/:id` for a profile item carries `suspectedIllegalRecord`.
- The "recorded gap" comment and 404 branch in `setAside` are removed. `apps/admin` `kindLabel` shows "Profile picture" / "Cover photo".

## 2b DEFAULT decisions (founder-veto-able)

| Field | Value |
|---|---|
| `mediaId` | the profile item id (file-name based, so the same at the private and public key; `@unique`) |
| `kind` | `profile_avatar` / `profile_cover` |
| `postId` | null |
| `uploaderId` | the person |
| `objectKey` | the private key the file ended at |

No migration: `kind` is a free string with no CHECK, `postId` / `objectKey` were already nullable, `mediaId` is a free string.

## Every path that removes a stored profile object

| Path | How it is protected |
|---|---|
| Person uploads a replacement (`UserAvatarService`, `UserCoverService`) | row updated first; old file removed through `profileKeysToDeleteNow`; protected file kept and a deferral written |
| Person deletes picture (`DELETE /users/:id/avatar`, `/cover`) | same |
| Account anonymised (`AccountDeletionSweepService.anonymizeUser`) | key left out of `keysToRemove`; deferral written in the same transaction |
| Held account minimised (`minimiseHeldUser`) | same |
| Publish step's private-original delete (`ProfileImagePublishService.deletePrivateOriginal`) | skipped if the row's current key is that key again (moderator withdrew in between); deferred if a record protects it; kept if the check fails |
| Rejection's `discardPrivateCopy` | checks protection first; set-aside passes `keepWithdrawnCopyOnFailure` so a failed transaction does not discard the only copy |
| Orphan / quarantine sweep under `private-profile/` | **none exists** (the sweep lists `private-media/`, `post-media/`, `quarantine/`), nothing to protect |

All lookups fail closed (a failed check keeps the file). Deferrals are in `PostMediaDeferredDeletion` and finished by the existing `processDeferred`; no second mechanism.

## Tests

Unit (touched modules `suspected-illegal-media`, `users`, `admin-media-review`, `account-deletion`, `post-media` and the write-route-guard / env drift guards): 64 suites / 1,558 tests passed, 8 skipped. After the final test rename the `suspected-illegal-media` directory re-ran 4 suites / 36 tests, 0 failed. `tsc --noEmit` and eslint on changed files clean.

New e2e `test/suspected-illegal-profile-images.e2e-spec.ts`, 19 tests, real Postgres (scratch database `soccernity_test_sip`, Redis DB 10, `--runInBand`): set aside an approved minor's avatar and a pending cover; already-rejected picture; 503 when the withdraw copy fails; vetting matrix; stale id 404; 409 duplicate; `suspectedIllegalRecord`; list/detail endpoints and signed link; each protected path (replace, delete, anonymise, minimise, publish private original, the set-aside-vs-publish race) with a no-record control that deletes; `processDeferred` held while set aside, held before `preserveUntil`, deleted afterwards; a post-media id still routes to post media. 19 / 19 passed.

## Not run / could not be tested

- Neighbouring e2e (real Postgres, same scratch database, `--runInBand`): 12 suites / 385 tests passed, 0 failed: `post-media`, `profile-block`, `media-review`, `account-deletion-sweep`, `profile-image-review`, `suspected-illegal-media`, `report-retention`, `removed-post-media`, `profile-image-check`, `anonymized-row-purge`, `rejected-media-deletion`, `profile-image-rejection`.
- The full mocked and e2e suites, Playwright, `apps/web`, CI.
- The residual few-millisecond race between the publish step's check and its delete cannot be reproduced deterministically; the e2e test covers the ordering where the moderator withdrew first.
- No real R2: the object store is an in-memory double.

## Known limits, still unprotected or disclosed

- **Protection is file-level only.** It does not stop the person deleting their picture or their account; it keeps the stored file.
- A set-aside landing between the publish step's check and its delete leaves a short race; the withdrawn copy is at the same private key, which the publish step re-reads.
- `processDeferred` can delay a profile deferral while the uploader has an active admin hold (existing behaviour of that sweep).
- A stale `ConflictException` from the rejection path is mapped to 404.
- `suggestedBodies` depends on the uploader's declared country.
- Retention of the record itself after `preserveUntil` is still counsel's call.
