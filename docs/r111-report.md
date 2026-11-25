# R111: e2e spec for `POST /admin/media/upload` (B-267 (e))

New spec: `e2e/tests/68-admin-media-upload.spec.ts` (9 tests, real API, Postgres, Redis, fake S3 store). No product code changed.

## Cases and what each asserts

| # | Case | Asserts (code) |
|---|------|----------------|
| 1 | Editor uploads a PNG through the admin UI | 201 `{ id, uploaderId, url, type, size, createdAt }`; `MediaAsset` row; object in the public fake bucket under `media/<uploaderId>/<uuid>-<name>`; the file shows in the Media library; "Back to Media" is a button |
| 2 | Superadmin uploads an mp4 | allowed by `AdminRolesGuard('editor','superadmin')`; `type` is `video` |
| 3 | Moderator, and no token | 403 and 401; no row, no object |
| 4 | Type not on the allow-list, and no file | 400 "Unsupported file type: application/pdf" and a 400 for a missing file; nothing created |
| 5 | FINDING: Bytes that do not match the declared image type | the service trusts the client `Content-Type` (no byte sniffing), so a mislabelled file is accepted with 201 |
| 6 | 50 MB + 1 byte | multer `limits.fileSize` gives 413; nothing stored |
| 7 | UI over-cap file | the page says "Exceeds the 50 MB limit." and sends no request |
| 8 | `MEDIA_UPLOADS_ENABLED` off (`restartApi({ mediaUploads: false })`) | staff upload still works (the switch is not consulted for staff upload) |
| 9 | No object store (`restartApi({ noObjectStore: true })`) | 503 "Media storage is not configured yet"; no row |

`afterAll` removes the rows and objects it made and restores the normal API, so the suite is order-independent.

## Not covered

- An unreachable (not just unconfigured) object store, and anything against real R2.
- Cross-bucket behaviour (staff uploads go to the public prefix only).

## Runs (alone, one worker)

1. 9 passed, 1.4 min
2. 9 passed, 1.4 min
3. 9 passed, 1.3 min

`tsc --noEmit -p e2e` is clean. The full suite was not run. Tracked screenshots the suite rewrote under `docs/` were restored with `git checkout`.

## Findings

- No byte sniffing: the MIME check trusts the client (test 5 pins this as current behaviour).
- `services/api/src/modules/media/README.md` is stale: it says there is no `GET /admin/media/:id` route and no e2e spec; the route exists and this spec now exists.

## Runbook

`docs/launch-gate-runbook.md` step 6.10: only the sentence saying no spec covers `POST /admin/media/upload` was changed.
