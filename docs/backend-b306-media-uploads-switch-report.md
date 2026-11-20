# Backend B-306: the MEDIA_UPLOADS_ENABLED switch

Branch `backend/b306-media-uploads-switch`, cut from `origin/main` `b7fbede` (the docs PR #754 for Decision Log #500 to #503 and B-305..B-309 was merged). Decision Log #501, build-register row B-306, #462 (g). `services/api`, `render.yaml`, `.env.example`, `docs/deployment.md` and docs only. No schema change, no migration, no `apps/*`, no Figma, no `docs/build-register.md`, no manifest, no `.docx`.

## What was built

One switch decides whether users may upload images and video. Rule (founder, #501):

- `NODE_ENV=production` (Render sets it on staging too): OFF unless `MEDIA_UPLOADS_ENABLED` is exactly `true`. Unset, empty, `TRUE`, `1`, `yes`, `false` all leave it off.
- Any other `NODE_ENV` (development, test, unset): ON unless the value is exactly `false`.

One implementation, read by every gate:

| File | Role |
|---|---|
| `src/media-uploads/media-uploads.switch.ts` | `isMediaUploadsEnabled(value, nodeEnv)`, the only place the rule exists; the env name and the code constant |
| `src/media-uploads/media-uploads-switch.service.ts` | reads both values through `ConfigService` on every call (never cached); logs ONE warning at start-up while off; never refuses to boot |
| `src/media-uploads/media-uploads-enabled.guard.ts` | the gate: throws `403 { statusCode, error, code: 'media_uploads_disabled', message }` |
| `src/media-uploads/media-uploads.module.ts` | imported by `PostMediaModule` and `UsersModule` |

`assertProductionEnv` is untouched (off is a safe state; refusing to boot was explicitly not wanted).

## Routes

**Gated** (the guard is FIRST in each route's guard list, so it runs before consent, email and profile checks, before multipart parsing, before any storage call or database write):

1. `POST /media/uploads` (`PostMediaController.create`)
2. `POST /media/uploads/:id/confirm` (`PostMediaController.confirm`)
3. `POST /users/:id/avatar` (`UserAvatarController.upload`)
4. `POST /users/:id/cover` (`UserCoverController.upload`)

An anonymous caller still gets 401 first (class-level `JwtAuthGuard`).

**Not gated, on purpose:** `GET /media/uploads/:id`, `DELETE /media/uploads/:id`, `POST /media/:id/report`, the staff route `POST /admin/media/upload`, `DELETE /users/:id/avatar` and `/cover`, every read of existing media, post creation without media.

**Contest routes, checked and not gated.** `POST /contest/final-entry` takes a `mediaId` (`submit-final-entry.dto.ts`, "the id of a video the caller uploaded through POST /media/uploads"). With the switch off no new upload can be created, so the final entry can only use media uploaded earlier; a new entry that needs a new video is blocked by gate 1. `POST /posts` and Bants posts take `mediaIds` the same way. A grep of `services/api/src` for `FileInterceptor` and presigned URLs finds no other upload entry point (the remaining one is the staff route).

## Configuration

`render.yaml`: `MEDIA_UPLOADS_ENABLED` in BOTH services, `sync: false` with a comment in the style of `ADMIN_2FA_ENFORCED` (set by hand at the launch gate, only after counsel answers B-206). `.env.example`: documented, `MEDIA_UPLOADS_ENABLED=true` for local development. `docs/deployment.md`: a paragraph next to the `ADMIN_2FA_ENFORCED` one. `src/env-completeness.spec.ts` gained a case that the name is read in code, declared `sync: false` in both services and documented. READMEs of `post-media` and `users` have a new "Uploads switch" section.

## What a person sees in `apps/web` (observed by reading; NOT changed; Temi decides the copy)

- **Post and Contest media (the composer):** `useMediaUploads.ts` only recognises the code `uploads_unavailable` (503). `media_uploads_disabled` is an unknown code, so the card goes to the generic error branch: heading "Upload failed", body **"Check your connection and try again."** (the server message is ignored for unknown codes, `MediaUploadTray.tsx` `errorBody`), with **Try again** and **Remove** buttons. That is misleading: it is not a connection problem and Try again can never work. Contests cannot take a final-entry video while the switch is off, and the person sees this message.
- **Profile picture and cover (`ProfileImageControl.tsx`):** shows the server's own sentence, **"Uploads are not available right now."**, with Try again. Readable and honest enough.

Not fixed here, as instructed. Suggested for a web follow-up: treat `media_uploads_disabled` like `uploads_unavailable` (disable the attach controls and say uploads are off) in `useMediaUploads` and `MediaUploadTray`.

## Tests

Measured on this branch (Windows, 12 cores).

- New unit: `src/media-uploads/media-uploads.switch.spec.ts` (the whole default table per NODE_ENV and value, 25 cases incl. typos and exact comparison) and `media-uploads-switch.http.spec.ts` (REAL guard and REAL switch service over a fake ConfigService, mounted on the three real controllers): off -> each of the four routes 403 with the code and the service never called (including an invalid body and a wrong user id: the gate answers first), ungated routes still work when off, on -> unchanged, production defaults, the start-up warning logged exactly once and never throwing. 30 tests.
- Existing HTTP specs for the three controllers gained a pass-through `overrideGuard(MediaUploadsEnabledGuard)` (setup only; no assertion changed).
- New e2e (real Postgres, in-memory storage doubles): `test/media-uploads-switch.e2e-spec.ts`, 10 tests: off -> link and confirm and avatar and cover each 403 with no `PostMedia` row, no upload link, no storage object and no change to the user's avatar or cover columns; confirm refused even for an upload created while on, leaving the row byte-identical; 401 first for anonymous; GET and DELETE of an existing upload, DELETE avatar and cover, and a post without media still work; on -> link issued, row written, avatar and cover accepted; production default read per request (unset off, `TRUE` off, `true` on).
- Passing: `media-uploads` 2 suites / 30 tests; with `env-completeness`, `write-route-guards`, the three controller HTTP specs and the avatar and cover service specs: 9 suites, 180 tests, 0 failures (the run that showed 12 failures was my new HTTP spec reading `env` before `beforeEach` set it; fixed). `tsc --noEmit` clean.
- Neighbouring e2e (real Postgres, private database, `--runInBand`): `post-media`, `profile-block`, `profile-image-rejection`, `profile-image-check`: 4 suites / 176 tests, 0 failures. eslint on the touched files: no findings.

**Not run:** the full mocked suite, the full e2e suite, the other e2e files, Playwright `e2e/`, `apps/web` and `apps/admin` suites (untouched). The QA reviewer runs the full suites at the launch gate. **Known consequence for QA (B-309):** the Playwright stack runs the API with whatever `NODE_ENV` its launcher sets; if that is `production`, the upload specs (18, 17) need `MEDIA_UPLOADS_ENABLED=true` in `e2e/support/api-process.ts`. I did not check or change it. **I cannot read CI** from here.

## Defaults I chose (veto-able)

- The gate is first in the guard list (an account that is restricted or unverified still gets the switch answer, not a consent answer).
- The response message is a plain developer-facing sentence ("Uploads are not available right now."); the code is what a client should branch on.
- No `Retry-After` or other header; no metric.

Forward-pointers for the next docs PR (not edited here): a BUILT line on B-306 and B-309's note about `api-process.ts`.
