# Two-bucket media storage (B-265) - report

Branch `backend/two-bucket-media-storage`, from `origin/main`. Backend-api agent. Not merged: Temi verifies and merges.
No Decision Log, register, Build Plan docx, manifest, Figma, schema or migration change. No new customer-facing wording.

## What was built

- **`S3_PRIVATE_BUCKET` (new, optional).** When it is set, `S3_BUCKET` is the PUBLIC bucket (served at
  `https://media.soccernity.com` through `S3_PUBLIC_BASE_URL`) and `S3_PRIVATE_BUCKET` is a private bucket with no public
  address. Same endpoint, region and key pair for both.
- **Routing inside `S3StorageService` by key prefix** (new leaf file `services/api/src/storage/storage-prefixes.ts`, one
  explicit public allow-list: `post-media/`, `profile-media/`, `media/`; everything else is private by default, so a new
  prefix nobody classified can never be served publicly by accident). Matching is on a whole path segment (`private-media/`
  is not `media/`). Callers are unchanged: they still pass a key.
- `publicUrlFor(key)` throws for a private key in two-bucket mode. `upload()` / `uploadFile()` return `''` for a private key
  (there is no public URL to give).
- **Copy between buckets** (`copyObject`): S3 CopyObject with the destination bucket in `Bucket` and `<srcBucket>/<key>` in
  `CopySource`. If the store refuses, the service falls back to downloading the object to a temp file and uploading it to
  the destination (temp file always removed). Same-bucket copies are unchanged.
- **Listing** (`listObjects`, used by the B-283 stray sweep) is routed by prefix; a 403 names the bucket that refused.
- **Without `S3_PRIVATE_BUCKET`**: the old single-bucket behaviour, plus a start-up warning. This is for development, Jest
  and the QA harness only.
- **Production fails closed** (`assertProductionEnv`, new `privateBucketProblem`): with `NODE_ENV=production` and a bucket
  configured, the API refuses to start unless `S3_PRIVATE_BUCKET` is set, not blank, not `replace-me` and different from
  `S3_BUCKET`. With no bucket configured at all, nothing is refused (uploads answer 503 as before).
- **Render staging**: `render.yaml` states that Render sets `NODE_ENV=production` at runtime on staging too, so staging IS
  covered by the refusal. (Not run against a real Render.)
- `.env.example` (S3_BUCKET documented as public, new `S3_PRIVATE_BUCKET`, token comment, `S3_PUBLIC_BASE_URL` points at the
  custom domain), `render.yaml` (`S3_PRIVATE_BUCKET`, `sync: false`, both API services; CSP host in the four static-site
  entries `https://*.r2.dev` -> `https://media.soccernity.com`; the `https://*.r2.cloudflarestorage.com` wildcard stays until
  the account id exists), module READMEs for `post-media`, `users`, `media`, `data-export`.

## R2 cross-bucket copy: what is and is not known

Cloudflare's S3 API compatibility page (https://developers.cloudflare.com/r2/api/s3/api/, last updated 10 Nov 2026 when read)
lists **CopyObject** and the **`x-amz-copy-source`** header as supported. It is **silent on whether the source may be in a
different bucket**. Nothing here was run against real R2. Therefore: the cross-bucket CopyObject path is written to the S3
standard, and the fallback (copy through the API) exists so a refusal from R2 does not break approval. Both are unproven
against the real service; the first real approval on staging will show which path R2 takes.

## Every caller checked, and its prefix

| Caller | Prefix | Bucket |
| --- | --- | --- |
| `post-media-objects.service.ts` (approved copy, public) | `post-media/` | public |
| same (pending, held, rejected original) | `private-media/` | private |
| `post-media.service.ts` (browser upload link) | `quarantine/` | private (the presigned PUT is signed against the private bucket, so the CORS rule goes there) |
| `profile-image.util.ts` (approved avatar/cover) | `profile-media/` | public |
| same (pending, rejected) | `private-profile/` | private |
| legacy avatar/cover keys | `avatars/`, `covers/` | classified private; nothing migrated (platform not live) |
| `media.service.ts` (admin media library) | `media/` | public |
| `data-export` | `data-export/` | private |
| `rejected-media-sweep.service.ts` (stray listing) | lists all of the above | both buckets, one token |

Nothing was found that writes to a prefix not on this table. The `post-media` and `profile` code now import the allow-list
constants instead of repeating the strings; `storage-prefixes.spec.ts` imports the callers' own constants so renaming one
without the allow-list fails the build.

## Tests

Run (all passed):
- Unit/HTTP: `src/storage`, `src/validate-runtime-env.spec.ts`, `src/env-completeness.spec.ts`,
  `src/render-static-sites.spec.ts`, `src/modules/post-media`, `src/modules/users/profile-image*`, `src/modules/media`,
  `src/modules/data-export`: 34 suites passed (1 skipped, the real-ffmpeg one) / 682 tests passed (8 skipped), 0 failed.
  An earlier, wider run of the touched modules was 67 suites / 1,551 tests, 0 failed. `tsc --noEmit` clean; eslint clean on
  the touched files.
- Jest e2e (real Postgres), `key-isolation` + `profile-block`: 2 suites / 60 tests, 0 failed, with
  `S3_PRIVATE_BUCKET: 'replace-me'` added to the inert e2e environment (`test/env.ts`). Own scratch database
  `soccernity_test_twobucket`, Redis DB 11 (not the `soccernity` dev database).
- Playwright (real Chrome, real API, one worker), specs 18, 34, 49, 19, 59, 62, 63: **44 passed, 0 failed.** The fake S3
  store in the QA harness now holds two buckets (`qa-media`, `qa-media-private`), does a real cross-bucket CopyObject, and
  spec 18 has a new test, "2b. B-265", asserting each file is in the bucket its prefix says and in exactly one. Database
  `soccernity_qa`, Redis DB 5.

NOT run (and this is NOT a whole-suite run): the full Jest unit suite, the full Jest e2e suite, the rest of the Playwright
suite (including specs 14, 15, 16, 17 and every other spec that mentions uploads or restarts the API), `apps/web`,
`apps/admin`, CI. Not run against real R2 or any real bucket.

## Test-support changes worth knowing

- `render-static-sites.spec.ts` pins CSP text; its media-host lines changed from `https://*.r2.dev` to
  `https://media.soccernity.com` to match `render.yaml`.
- `test/env.ts`: `S3_PRIVATE_BUCKET: 'replace-me'` joins the inert external-service values.
- `e2e/support/fake-media-services.ts`, `stack.ts`, `api-process.ts` and specs 18 and 34 changed as described above;
  `S3_PRIVATE_BUCKET` is `replace-me` for the no-object-store run (spec 19).

## Docs changed (step 3b, after R79 / PR #785 merged)

- `docs/deployment.md` (storage text only): the step 4 bucket variables (two buckets, one token, production refusal,
  staging covered, `S3_PUBLIC_BASE_URL` = custom domain on the public bucket only), the post-media paragraph (uploads go to
  the private bucket, CORS on the private bucket, the private bucket has no public access, the R2 cross-bucket-copy
  caveat), the static-site CSP bullets (host `media.soccernity.com`; one wildcard remains), launch-checklist steps 3 and 4,
  and the "Inputs for the runbook" bullet.
- `docs/launch-gate-runbook.md`: step 1.4, step 6.8 (points 1 to 3 and 5; point 4, the lifecycle rule, is unchanged),
  checklist rows 1.4 and 6.8, and Appendix A (`S3_BUCKET` is the public bucket, new `S3_PRIVATE_BUCKET` row,
  `S3_PUBLIC_BASE_URL` row). **Not edited, as instructed:** the founder-questions list (F10 still reads "r2.dev or a custom
  domain" and is now answered by this change; it needs a pointer from the runbook owner), the "no vendor account exists"
  sentence, and the runbook line "7. If uploads are on ... a private-prefix address is refused (step 6.8)", whose wording
  says "private-prefix" and is now slightly stale.

## Launch-gate steps this changes (plain list for the founder)

1. Create TWO R2 buckets, one public and one private, and ONE API token covering both (read, write, list). Name them in
   `S3_BUCKET` (public) and `S3_PRIVATE_BUCKET` (private).
2. The private bucket gets no public access of any kind: no `r2.dev`, no custom domain.
3. Attach the custom domain `media.soccernity.com` to the PUBLIC bucket only; set `S3_PUBLIC_BASE_URL` to it.
4. The browser-upload CORS rule goes on the PRIVATE bucket (the public bucket needs none).
5. Prove it: an object that lives in the private bucket requested through `media.soccernity.com` must be refused.
6. After the account id is known, tighten the one remaining CSP wildcard `https://*.r2.cloudflarestorage.com` in
   `render.yaml`.
7. The first real approval on staging also settles whether R2 accepts the cross-bucket CopyObject.

## Disclosures

- Several shell heredocs failed (quoting and an unquoted heredoc that expanded a backtick) and one Python write truncated
  my own docs-edit script, so the docs edits were redone with a new script; no repo file was damaged (checked by diff).
- A relative path in one shell call was wrong and the file was not found; no effect.
- My first Playwright launch failed in global setup (`prisma generate` could not replace the Prisma engine DLL) because my
  own background Jest e2e run held it; I waited for Jest to finish and re-ran. No other process was killed.
- The suite rewrites tracked screenshots under `docs/`; they were restored with `git checkout` and are not in the PR.
