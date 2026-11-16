# Suspected illegal imagery path (build-register B-206, backend)

Branch `backend/suspected-illegal-imagery-path`, cut from `origin/main` `59016bc`. `services/api`, `.env.example`, `render.yaml` and this report only. No frontend, Figma, register, Build Plan docx, runbook or `docs/deployment.md` change. The platform is not live.

**What this is.** A way for a child-safety-vetted admin to set a file aside as suspected illegal imagery, keep it as evidence, and later record whether it was filed with a receiving body. **It records and protects; it never contacts an authority, never calls a vendor and never acts on a Rekognition label.** Filing is a human act done outside the system.

## What was built

| Part | Where |
|---|---|
| Table `SuspectedIllegalMedia` (no foreign keys, CHECK on status and on decision shape), additive migration `20261202090000_add_suspected_illegal_media`, rollback `DROP TABLE` in its header | `prisma/schema.prisma`, `prisma/migrations/` |
| `POST /admin/media-review/:id/suspected-illegal` `{ reason, reportId? }` | `modules/suspected-illegal-media/` |
| Filing routes: `GET /admin/suspected-illegal-media`, `GET .../:id` (with `suggestedBodies` and a signed view link), `POST .../:id/filed`, `POST .../:id/not-filed` | same module |
| Receiving-bodies table (all `pendingCounsel: true`, no URLs) | `receiving-bodies.constants.ts` |
| One evidence rule extended: a file is protected while its record is `set_aside` OR `now < preserveUntil` | `post-media/rejected-media-evidence.util.ts` |
| `GET /admin/media-review/:id` returns `suspectedIllegalRecord` (id, status), read-only | `admin-media-review.service.ts` |
| `SUSPECTED_MEDIA_PRESERVE_DAYS` (default 365) | `.env.example`, both API services in `render.yaml`, `env-completeness.spec.ts`, `post-media.config.ts` |
| Audit actions `media.suspected_illegal_set_aside`, `_filed`, `_not_filed` | `admin-action-log` constants |

## Set-aside, step by step

Moderator or superadmin, plus a child-safety-vetted admin (read fresh from the database). A non-vetted admin on a **minor's** item gets the same 404 as an unknown id; on an **adult's** item a coded 403 `child_safety_vetting_required`. One transaction: reject the file through the existing decision path with the existing generic reason ("This file didn't meet our rules"), create the record with `preserveUntil = now + SUSPECTED_MEDIA_PRESERVE_DAYS`, write the audit row (no reason text in the notes). 404 for an unknown media id or report id, 409 if already set aside (one record per file).

**What the uploader and others see: only what a generic rejection already does.** Status `rejected` with the generic reason, the public copy of an approved file withdrawn, and the guardian notice and uploader notification the existing rejection already sends. **No extra notification, no account hold, no change to the account.** This means the uploader is told their file "didn't meet our rules" exactly as for any rejection, and a minor's guardian gets the same rejection notice as for any rejection (subject to the existing withhold flag). Nothing tells them the file was set aside.

## Protection (the one rule)

A file is protected while its record has `status = 'set_aside'` or `now < preserveUntil` (counted from the set-aside time). Matching is by `mediaId` / `objectKey` on the record, so it holds after the `PostMedia` row is deleted. Every path that deletes a private object goes through the rule: post deleted, upload deleted, quarantine purge, unattached purge, account anonymised, account purged, B-290 removed-post closure, stray-object sweep. A held-back deletion is written to `PostMediaDeferredDeletion` and finished by the daily `processDeferred` once protection ends. The report-retention sweep skips a report that is a record's `reportId`, or that is on a post whose media has an active record (a `filed` or `not_filed` record keeps protecting until `preserveUntil` passes).

## Filing routes

Vetted admin only (coded 403 otherwise). 409 if the record is already decided. `filed` takes `bodyKey` (a known key or `other` with `bodyOther`), a `reference`, optional `filedAt` and `note`; `not-filed` takes a reason of at least 10 characters. Audit rows `media.suspected_illegal_filed` / `_not_filed` never contain the reference or the reason. A second decision loses on a guarded `updateMany` and gets the 409. No network call is made anywhere.

## Receiving bodies — PENDING COUNSEL

GB: IWF and NCA. US: NCMEC. EU member states: the national hotline in the INHOPE network. NG: none. **Every entry is `pendingCounsel: true`, and no URL is stored because none was verified.** The table only orders suggestions (`suggestedBodies` on the detail route); the admin may pick any key or `other`. Which body, if any, a case goes to is counsel's decision. The uploader country is a snapshot taken at set-aside: derived country, else declared country, else null.

## Gaps and things to know

- **Profile pictures and covers are out of scope.** Their ids (`avatar:<user>:<file>`) are not accepted by the set-aside route (404 `media_not_found`). A suspected illegal profile image has no path yet.
- **The record itself has no retention rule.** What happens to the record and the file after `preserveUntil`, and whether evidence is ever released, is counsel's call (B-206). After `preserveUntil` passes the ordinary deletion rules resume on the next sweep.
- **Report retention** keeps the report only while the record is active or within `preserveUntil`; it does not protect the report forever.
- **A new table beyond Section 3** (flag as a Decision Log candidate; not transcribed here).
- The unit failures found late (a mock lacking `suspectedIllegalMedia`, the route-guard inventory not listing the new admin-only module) were test-side and are fixed; no application behaviour changed for them.

## Adopted defaults (founder-veto-able, none stated by the founder)

Text limits: reason 1 to 1000, reference 1 to 200, note up to 1000, `bodyOther` 1 to 200, not-filed reason 10 to 1000; list page size 20 (max 50); 365 days as the default (the brief gave it); the 404-for-a-minor / 403-for-an-adult split (the brief gave it); a `filed` or `not_filed` record keeps protecting until `preserveUntil`; one record per file; guarded-update loser gets 409, not 404.

## Verification (measured)

- **Database and Redis used:** scratch Postgres database `soccernity_test_b206` and Redis DB 11 (own, so as not to collide with other sessions), `--runInBand`, `--testTimeout=900000`. The new migration applied cleanly from zero.
- `tsc --noEmit` exit 0; eslint on every touched directory exit 0; `nest build` exit 0.
- Unit: the new module (service, controller HTTP, receiving-bodies and evidence-rule specs) plus every touched module: `post-media`, `moderation`, `account-deletion`, `feed`, `admin-action-log`, `media`: 56 suites passed (1 skipped) / 1,415 tests passed (8 skipped, the real-ffmpeg ones), 0 failed; `write-route-guards`, `env-completeness`, `admin-media-review`, `suspected-illegal-media`: 10 suites / 195 tests, 0 failed.
- e2e (real Postgres and Redis): new `test/suspected-illegal-media.e2e-spec.ts` **24 tests, 0 failures** (vetting matrix incl. the minor-404 and adult-403 split, the one-transaction set-aside with the generic rejection and no extra notification or hold, duplicate 409, protection on every private-object deletion path with the row deleted, deferral then release after `preserveUntil`, report-retention skip, filing routes and their 409s, audit rows with no reference or reason text).
- Neighbouring e2e (same scratch DB and Redis, `--runInBand`): `post-media`, `rejected-media-deletion`, `removed-post-media`, `report-retention`, `media-review` plus the new file: **6 suites / 198 tests, 0 failures**.

**Not run:** the full mocked suite, the full e2e suite, Playwright, `apps/*` suites, CI. Two full-suite Jest runs timed out earlier on load flakes in `admin-action-log-read.controller.http.spec.ts` and `post-media.controller.http.spec.ts`; both pass in the targeted runs above. Nothing was exercised against real R2 or any real authority.
