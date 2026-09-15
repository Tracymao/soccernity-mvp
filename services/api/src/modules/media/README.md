# media module

Build target: **Sprint 5** — Section 4.8 (Admin Service), the Media
library half. Built by `sprint-5/admin-media-storage-backend`
(backend-api, 2026-09-15).

Backs `apps/admin/src/pages/media/{MediaLibraryPage,MediaUploadPage,MediaPreviewPage}.tsx`
— previously self-documented STUBS ("`GET /admin/media`/`POST
/admin/media/upload` are not built, AND no file storage is configured
anywhere"). This PR converts all three to real data, and builds the
first real file storage this codebase has ever had.

---

## The storage abstraction (stated back before building, per the task
## brief's own instruction)

`src/storage/storage.service.ts` is a small **abstract class**
(`StorageService`, `upload(buffer, key, contentType) → url` /
`delete(key)`), not a plain TS `interface` + string/Symbol injection
token. NestJS resolves an abstract class as a real DI token on its own
(`storage.module.ts`'s `{ provide: StorageService, useClass:
S3StorageService }` just works), and a unit test can construct
`MediaService` directly with any object satisfying the shape, cast `as
StorageService` — no Nest `TestingModule` needed, matching this
codebase's existing `new AdminContentService(prisma)`-style
constructor-injection unit-test convention (`media.service.spec.ts`).

`S3StorageService` (`src/storage/s3-storage.service.ts`) is the real
implementation — **configured entirely through env vars**
(`S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`,
`S3_SECRET_KEY`), against the standard AWS S3 SDK v3 client
(`@aws-sdk/client-s3`), so it runs **unmodified** against real AWS S3,
Cloudflare R2, Backblaze B2, or DigitalOcean Spaces — no vendor-specific
SDK quirk is hardcoded anywhere in it.

**Decision Log candidate: the actual storage provider is still
unresolved**, mirroring Decision Log #26's own "unbundled, cost-aligned
for a pre-launch MVP" reasoning for hosting generally — the founder
should pick one (and provision real credentials) once launch-scale
storage/bandwidth costs matter; nothing in this PR forces that choice.
`S3_ENDPOINT` is the one env var that changes *behaviour*, not just a
value: leaving it unset targets real AWS S3 (virtual-hosted-style URLs
— `https://<bucket>.s3.<region>.amazonaws.com/<key>` — the AWS SDK v3's
own default addressing style); setting it targets any other
S3-compatible provider (path-style URLs — `<endpoint>/<bucket>/<key>`,
the more universally-supported addressing style across R2/B2/Spaces/a
self-hosted MinIO instance) and also flips `forcePathStyle: true` on the
`S3Client` — both keyed off the exact same "is a custom endpoint set"
check, so they can never disagree with each other.

**"Wired but inactive" until real credentials exist** — the exact same
`isConfigured` pattern this codebase already uses for
`EMAIL_PROVIDER_API_KEY` (`registration-email.service.ts`) and
`SENTRY_DSN` (`instrument.ts`): if `S3_BUCKET`/`S3_ACCESS_KEY`/
`S3_SECRET_KEY` are unset or still the literal `.env.example`
`"replace-me"` placeholder, `upload()`/`delete()` throw a clear
`ServiceUnavailableException` (503) rather than attempting a doomed real
network call against fake credentials. **Deliberately a harder failure
than Postmark/Sentry's own graceful no-op** — file upload is the actual
feature here, not an optional side-channel (fire-and-forget email,
optional error monitoring), so silently pretending an upload succeeded
would be actively misleading; a clear, immediate 503 is the honest
outcome when there's genuinely nowhere to put the file yet.

---

## Endpoints

| Method & path | Guards | Purpose |
|---|---|---|
| `GET /admin/media` | `AdminJwtAuthGuard` + `AdminRolesGuard('editor', 'superadmin')` | The media list, keyset-paginated, optional `?type=image\|video` filter. |
| `POST /admin/media/upload` | same | Single-file multipart upload (field name `file`), max 50MB. Creates one `MediaAsset` row. |

Both routes are **not** literal Section 4.8 lines — the section names
`GET`/`POST /admin/media/upload` only in passing, with no defined
query/response shape. `GET /admin/media` in particular is a genuine
addition, same pattern as `AdminContentModule`'s own `GET
/admin/articles`/`GET /admin/categories` — without it, an admin could
upload media but never see what they'd already uploaded.

---

## Who may act: role-gating (mirrors Articles/Categories, not
## Moderation/Users)

`AdminRolesGuard('editor', 'superadmin')` on the **entire** controller —
GET included, no view-vs-mutate split, mirroring
`AdminArticlesController`/`AdminCategoriesController`'s exact shape
rather than `AdminModerationController`/`AdminUsersController`'s
(`'moderator', 'superadmin'`). Media is an authoring tool — image/video
attachments for Articles (see "What this PR does NOT do" below for the
deferred follow-up that actually wires this) — the same job
`AdminUser`'s own schema comment already frames as "authors Articles,"
not "actions Reports." Reuses the exact `AdminRolesGuard`/
`@AdminRoles(...)` infrastructure `modules/admin/guards/` already
exports — no new guard class.

---

## `MediaAsset.key` — a genuine schema addition, flagged

Section 3's original `MediaAsset` had `url` but no separate
object-storage key. `url` is built from the provider config
(endpoint/bucket/region) at upload time and would break
`StorageService.delete()`'s ability to locate the object again if that
config ever changes (a moved bucket, a CDN domain swapped in later — the
same class of change Decision Log #26 already anticipates for hosting
generally); `key` is the durable, provider-config-independent identifier
the object actually lives under. Migration:
`20260915162308_add_media_asset_key`, applied cleanly to both the dev
and test databases (the table was empty — no endpoint had ever written
to `MediaAsset` before this PR).

**`key` is stored on every new row but read/written by nothing else in
this PR** — see "What this PR does NOT do" below. It's there now so a
future delete endpoint doesn't need a backfill migration or a fragile
parse-the-key-back-out-of-the-URL workaround.

---

## Key naming, MIME-type validation, and the "5 files" copy

- **Key**: `media/<uploaderId>/<uuid>-<sanitized-original-filename>` —
  the leading `randomUUID()` is the actual collision-avoidance
  mechanism; the sanitized trailing filename segment exists purely so an
  object key stays human-recognizable in a bucket browser, not for
  uniqueness. `sanitizeFileNameSegment()` strips any path components a
  crafted `originalname` might carry (multer never guarantees this is a
  bare filename) and any character outside `[a-zA-Z0-9.\-_]`, then bounds
  the length — a `../../etc/passwd.jpg`-style `originalname` degrades to
  a harmless trailing `passwd.jpg` segment, proven directly in
  `media.service.spec.ts`.
- **`type` is always server-derived** from the file's own reported
  `mimetype` (`image/*` → `"image"`, else `"video"`), checked against an
  explicit allow-list (`MEDIA_ALLOWED_MIME_TYPES` — JPEG/PNG/GIF/WEBP
  images, MP4/MOV/WEBM video) **before** ever calling `storage.upload()`,
  so a rejected file never reaches a real (or real-503) network call.
  The MIME type is client-reported (multer/busboy read it from the
  multipart part's own `Content-Type`, not by sniffing magic bytes) and
  therefore spoofable — acceptable for this MVP; no magic-byte-sniffing
  library is installed, and adding one is out of this PR's scope.
- **`MediaUploadPage.tsx`'s own pre-existing stub copy** ("Select up to 5
  media files (each no larger than 50 MB)") describes a **client-side
  selection convenience**, not a batch-upload endpoint. `POST
  /admin/media/upload` is deliberately **single-file** — Section 4.8's
  own literal line is singular, and this PR's own task brief says
  "creates a `MediaAsset` row" (singular). `MediaLibraryPage.tsx` (the
  frontend half of this same PR) lets an admin pick up to 5 files and
  loops sequentially over `POST /admin/media/upload`, one call per file,
  showing per-file progress/results — a disclosed judgment call, not an
  invented batch response shape.
- **File-size enforcement happens inside multer itself**
  (`FileInterceptor`'s own `limits.fileSize: MEDIA_MAX_FILE_SIZE_BYTES`,
  50MB) — NestJS's own `transformException` (`@nestjs/platform-express`)
  already converts multer's `LIMIT_FILE_SIZE` error into a clean 413
  `PayloadTooLargeException` before this module's own code ever runs, so
  no redundant size check is repeated in `MediaService`.

---

## Testing without real credentials (per the task brief's own item 4)

`StorageService` is injected, not constructed inline — every mocked test
(`media.service.spec.ts`, `admin-media.controller.http.spec.ts`) uses a
fake/in-memory implementation (a plain object matching the abstract
class's shape, or a fully-mocked `MediaService` at the HTTP layer), never
a real `S3StorageService`. `s3-storage.service.spec.ts` is the one file
that constructs a real `S3StorageService` — it mocks
`@aws-sdk/client-s3` itself (`jest.mock('@aws-sdk/client-s3')`, an
auto-mock configured via plain runtime `mockImplementation` calls, not a
factory function — sidesteps ts-jest's mock-hoisting rules around
mock-prefixed variable names entirely) so `S3Client.send()` never
actually reaches a real network.

**Stated plainly: real upload-to-a-real-bucket is NOT verified
end-to-end in this PR, pending real provider credentials.** This mirrors
this codebase's own established "confirmed-in-principle,
unverified-in-practice" precedent (e.g. a hand-written migration before
its first real `prisma migrate dev` run) — the `isConfigured`-gated 503
path, the URL-construction math for both addressing styles, and the
`PutObjectCommand`/`DeleteObjectCommand` call shapes are all covered by
`s3-storage.service.spec.ts` against a mocked SDK; nothing here proves a
byte actually lands in a real S3-compatible bucket. That proof needs a
real provider account — the still-open Decision Log candidate above.

**No e2e spec added** — every `MediaService` method is a plain
`create`/`findMany` Prisma call against a model with **zero relations**
(`MediaAsset.uploaderId` is a bare `String`, like `BanterRoom.createdBy`
— not a `User` FK), no raw SQL, no `$transaction`, and no genuinely
novel Prisma relation/constraint. None of `test/README.md`'s three
e2e-add triggers apply — the same conclusion `admin-content/README.md`
already reached for its own analogous (Prisma-only, no-real-provider)
module.

**Verification, all re-measured directly**: mocked suite **72 suites /
982 tests, 0 failures → 75 suites / 1005 tests, 0 failures** (3 new
suites — `media.service.spec.ts`, `admin-media.controller.http.spec.ts`,
`s3-storage.service.spec.ts` — 23 new tests). e2e suite (real
Postgres/Redis via docker-compose) re-run unchanged as a pure regression
check after applying the new migration — no e2e file added or modified
by this PR. `nest build` + `npm run lint` + `npx tsc --noEmit` all clean.

---

## A real, disclosed dependency-chain finding: `multer`

`multer@2.4.0` is the latest release on the public npm registry as of
this PR, but `npm install multer@^2.0.0`/`@2.4.0`/`@2.3.0` (tried in
that order, plus a forced cache-clean reinstall) all resolved to
`2.2.0` at the workspace root — traced to `@nestjs/platform-express@11.2.1`'s
own **exact, unranged** dependency pin on `multer: "2.2.0"`, which npm's
workspace hoisting placed at the top-level `node_modules/multer`. This
project's own explicit dependency (`services/api/package.json`'s
`"multer": "^2.3.0"`) resolves correctly to a genuinely separate, nested
copy at `services/api/node_modules/multer@2.3.0` (verified directly —
Node's module resolution finds this nested copy before the hoisted root
one for any `require('multer')` inside `services/api`'s own code, e.g.
`multer.memoryStorage()` if a future caller needs it directly).

**The real, disclosed consequence**: `FileInterceptor`'s own internal
`require('multer')` call (inside `@nestjs/platform-express`'s own module
directory) resolves to the hoisted **root** copy — `multer@2.2.0` — since
that's the nearest `node_modules/multer` from that file's own location,
regardless of this module's own package.json range. `2.2.0` carries a
`npm audit`-flagged high-severity DoS advisory
(`GHSA-qfvm-cv95-jqjf`, file-descriptor leak on an aborted upload) that
`2.3.0`+ fixes. **Not fixed in this PR** — the only real fix is bumping
`@nestjs/platform-express` itself (currently pinned `^11.0.0`; the
lowest version depending on a patched `multer` is a `12.x` major, per
`npm audit`'s own `fixAvailable` hint), an unrelated, unscoped major
version bump this media-storage ticket should not silently bundle in —
the exact same "flag it, don't fix it as part of an unrelated PR"
precedent Decision Log #20's own Tier 2/3 `npm audit` triage already
established for `multer`/`lodash`/`qs`/`body-parser`/`express`. Flagged
here as a new Decision Log candidate for a future, dedicated
`@nestjs/platform-express` v12 upgrade PR.

---

## Frontend (`apps/admin`, same PR)

`MediaLibraryPage.tsx`, `MediaUploadPage.tsx`, `MediaPreviewPage.tsx` —
previously disclosed `AdminStubScreen` stubs — are now real, backed by a
new `api/adminMedia.ts` client (mirrors `api/adminContent.ts`'s
conventions exactly: `adminFetch`, `AdminApiError`, the isolated admin
auth path).

- **Library** (`GET /admin/media`): All/Images/Videos tabs, keyset
  "Load more", each row linking to its own preview.
- **Upload** (`POST /admin/media/upload`): up to 5 files picked at once,
  uploaded via up to 5 **sequential** calls (one per file, each with its
  own inline pending/uploading/done/failed row) — a client-side
  convenience over a single-file endpoint, not a batch API (see "Key
  naming, MIME-type validation, and the '5 files' copy" above). A
  client-side pre-check rejects an obviously-oversized file (>50MB)
  before ever calling the API.
- **Preview** (`/media/preview/:id`, a genuine route-shape change from
  the old stub's bare `/media/preview`): renders `<img>` for
  `type: "image"`, `<video controls>` for `type: "video"`. **There is no
  `GET /admin/media/:id` anywhere in `services/api`** — this screen is
  reached from the Library's own row `<Link state={{ media }}>`, the
  exact same router-state-handoff pattern `ReportDetailPage.tsx` already
  established for its own missing single-resource GET. A direct
  visit/refresh falls back to `api/adminMedia.ts`'s `findMediaById` (a
  bounded, 5-page re-list-and-search, same shape as `api/moderation.ts`'s
  `findReportById`). **New Decision Log candidate**: a real `GET
  /admin/media/:id` would remove this workaround entirely — not built in
  this PR (out of its own explicit upload+list scope), flagged for a
  founder call the same way `api/moderation.ts`'s own comment already
  flags its analogous gap.
- `adminClient.ts`'s `rawRequest` gained one small, disclosed extension —
  a `FormData` request body skips both `JSON.stringify` and the
  `Content-Type: application/json` header (the browser computes the real
  multipart boundary itself), the one thing this codebase's admin client
  had never needed before this PR's real multipart upload.
- Real upload progress isn't available through plain `fetch` — a true
  byte-level progress bar would need `XMLHttpRequest` instead;
  `MediaUploadPage.tsx`'s coarser per-file pending/uploading/done/failed
  states are a disclosed substitute, not a real progress readout.

**Verification**: `apps/admin` vitest **16 suites / 100 tests, 0
failures → 16 suites / 110 tests, 0 failures** (`media.test.tsx`
rewritten from 3 stub-disclosure tests to 13 real-data tests — no new
test file); `npx tsc --noEmit`, `npm run lint`, `npm run build` all
clean; a real Vite dev server was started and `/`, `/media`,
`/media/upload`, `/media/preview/:id` were `curl`'d directly, all real
HTTP 200s (Vite's SPA fallback — confirms no server-side crash, not a
real browser render; no Playwright/Puppeteer-style tool is available in
this environment, the same disclosed verification ceiling every prior
`apps/admin`/`apps/web` PR in this project states).

---

## What this PR does NOT do

- **Does not wire Article's image upload to this.** `CreateArticlePage.tsx`'s
  own "Upload Images" button stays disabled with its existing disclosed
  note — per this PR's own explicit scope, wiring it is a small,
  separate follow-up now that the Media library backend exists: `Article`
  needs an images relation to `MediaAsset` added then (a schema change
  this PR deliberately does not make), not a change to this module.
- **No `DELETE /admin/media/:id` route.** `StorageService.delete()` is
  implemented and unit-tested (this PR's own task brief explicitly asked
  for the interface to be complete), and `MediaAsset.key` is stored
  specifically so a future delete endpoint is trivial to add — but
  Section 4.8 names no delete route and neither does this PR's own scope
  list (upload + list only), so none was added.
- **No `GET /admin/media/:id` route.** `MediaPreviewPage.tsx` works
  around this via a router-state handoff plus a bounded fallback list
  (see "Frontend" above) — the same workaround `ReportDetailPage.tsx`/
  `api/moderation.ts` already established for their own identical gap.
  Flagged as a Decision Log candidate, not built here.
- **No live-bucket verification.** See "Testing without real
  credentials" above — this is a confirmed-in-principle,
  unverified-in-practice implementation until a real provider account
  exists.
- **No magic-byte file-type sniffing.** MIME-type validation trusts the
  client-reported `Content-Type` on the multipart part (multer/busboy's
  own parsing) — spoofable, acceptable for this MVP, no sniffing library
  added.
- **Does not fix the `multer@2.2.0` transitive vulnerability** — see the
  dedicated section above; needs its own `@nestjs/platform-express` v12
  upgrade PR, not bundled here.

---

## Files

```
media.module.ts             — wires AdminAuthFoundationModule + StorageModule
media.service.ts            — MediaService, all business logic
media.constants.ts          — MEDIA_MAX_FILE_SIZE_BYTES, MEDIA_ALLOWED_MIME_TYPES, page sizes
cursor.util.ts               — this module's own (createdAt, id) keyset cursor
admin-media.controller.ts    — GET/POST /admin/media*
dto/list-media-query.dto.ts

../../storage/storage.service.ts      — the StorageService abstraction (abstract class)
../../storage/s3-storage.service.ts   — the real S3-compatible implementation
../../storage/storage.module.ts       — DI wiring (useClass: S3StorageService)
```

`apps/admin/src`:
```
api/adminMedia.ts                     — client for GET/POST /admin/media*, plus findMediaById
pages/media/MediaLibraryPage.tsx
pages/media/MediaUploadPage.tsx
pages/media/MediaPreviewPage.tsx
pages/media/mediaShared.tsx           — formatDate/formatBytes/displayNameFromUrl/useAsyncData
pages/media/media.css
pages/media/media.test.tsx
```
