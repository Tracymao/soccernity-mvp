# Admin backend spec deviations — Decision Log #295–#310

**Status of this document:** reference snapshot. Written as documentation only; Part B was updated on 2026-09-27 to record the #309 fix.

**Source of truth:** `docs/Soccernity_MVP_Build_Plan_v1.7.docx`, Section 9 (Decision Log), the table read as `d.tables[6]`. The Status text below was read from each row on `origin/main` at `8479706` (2026-09-26), not summarised from memory. If the docx changes, the docx wins and this file is stale.

**Why these exist:** CLAUDE.md says the data model (Build Plan Section 3) and API contract (Section 4) are fixed specs, and that anything needed beyond them is flagged as a Decision Log candidate, not added silently. #295–#310 are the entries Sprint 5's admin, moderation, content and media backend work raised under that rule. Almost all of them were built anyway and flagged; that is the point of the log, not a defect.

> **Read Part B separately.** #309 (`multer` resolving to a vulnerable version) is **not** a spec deviation. It was a dependency hazard that sits alongside them in the Decision Log, and is now **Resolved** (see Part B). It is deliberately kept out of Part A so it does not read as routine paperwork.

## Status at a glance

The statuses are not uniform. 4 of the 16 are Resolved; 12 are Open (one of those, #302, is a mixed re-verification).

| # | Area | Kind | Status |
|---|------|------|--------|
| 295 | Moderation | Route additions beyond Section 4 | Open |
| 296 | Moderation | Schema addition beyond Section 3 | Open |
| 297 | Admin content | Route additions beyond Section 4 | Open |
| 298 | Admin content | Schema additions beyond Section 3 | Open |
| 299 | Admin content | Role-gating decision | **Resolved** |
| 300 | Moderation | Missing endpoint, worked around | Open |
| 301 | Moderation | No Figma design, built plainly | Open |
| 302 | Moderation | Re-verification of #250 | Open (item 1 resolved; items 2–4 still open) |
| 303 | Admin users | Data-model value beyond Section 3 | Open |
| 304 | Admin users | Delete semantics decision | **Resolved** |
| 305 | Admin dashboard | Role-gating decision | **Resolved** |
| 306 | Admin dashboard | Unbuilt feature (visit tracking) | Open |
| 307 | Media | Storage provider decision | **Resolved** (decision only, storage not live) |
| 308 | Media | Schema addition beyond Section 3 | Open |
| 309 | Media | **Dependency hazard, see Part B** | **Resolved** (lockfile bump, 2026-09-27) |
| 310 | Media | Missing endpoint, worked around | Open |

Note on #307: it is Resolved, not Open. It was Open when Sprint 5 shipped and was resolved on 2026-09-26 by `sprint-4/media-storage-r2-decision` (PR #317). The Resolved set is therefore #299, #304, #305, #307 and #309 (#309 resolved 2026-09-27, see Part B).

"Open" on the schema and route rows means "built and working, awaiting founder confirmation that the addition should be written into Section 3/4". It does not mean broken.

---

# Part A — Disclosed spec deviations and gaps

## A1. Moderation and reports (#295, #296, #300, #301, #302)

Source: [`services/api/src/modules/moderation/README.md`](../services/api/src/modules/moderation/README.md) (PR #244 backend, PR #245 frontend). Sections: "Two Decision Log candidates: the spec-gap endpoints", "A third Decision Log candidate: the `Report` schema addition", "Guard reasoning for the two user-facing routes".

- **#295 — Open.** `POST /reports`, `POST /reports/:id/appeal` and `PATCH /admin/moderation/reports/:id/appeal` are not literal Section 4 lines (Section 4.8 names only `GET`/`PATCH /admin/moderation/reports`). Built anyway: without `POST /reports` nothing can create a `Report`, and Section 8.4 assumes a submission and appeal path. The two user-facing routes are deliberately `JwtAuthGuard`-only, not `GuardianConsentGuard`-gated, so a restricted-pending minor can still report abuse and appeal a decision. Pending confirmation that the three routes belong in Section 4.
- **#296 — Open.** `Report` gained `reviewedByAdminId`, `reviewedAt`, `actionTaken`, `appealStatus`, `appealReason`, `appealedAt`, `appealReviewedByAdminId` and `appealReviewedAt` (plus the two `AdminUser` relations), beyond Section 3's six-field `Report`. Migration `20260915003318_add_report_moderation_fields`. Open question: formalise these in Section 3, or replace them with an append-only audit-log entity (a `Report` row currently holds only the latest action/appeal cycle, with no history across cycles).
- **#300 — Open.** No `GET /reports/:id` exists. `apps/admin` reaches Report Detail / Appeal Review through a router-state handoff from the queue, with a bounded (5-page) `findReportById` fallback for direct visits and refreshes. Worked around rather than adding a backend endpoint from a frontend-only PR. Real fix: add the endpoint.
- **#301 — Open.** No report/flag UI was ever designed in Figma. A minimal `ReportAction` component was built plainly and wired into `PostCard.tsx` (report post, user, comment; hidden on your own content). Appeal-submission UI is deliberately not built, and `NotificationsService` does not resolve `moderation_decision` notifications into displayable data. Both are named follow-ups.
- **#302 — Open (mixed).** Re-verification of #250 after PRs #244/#245. Item 1 (admin Moderation screens) is resolved. Items still open: Users/Roles admin screens were still stubs when written (Users was later built, see A3; roles is still unbuilt), DPIA R8 (`Report.reporterId` is a required FK to `User`, so a non-user such as a parent has no route to report), DPIA R9 (flat `AdminUser.role`, no child-report restriction or escalation path), and item 4 (no severity field, no audit-trail entity). R8/R9 are counsel matters as much as code.

## A2. Admin content — Articles and Categories (#297, #298, #299)

Source: [`services/api/src/modules/admin-content/README.md`](../services/api/src/modules/admin-content/README.md) (PR #246). Sections: "Three Decision Log candidates: the spec-gap endpoints", "A fourth Decision Log candidate: the … schema additions", "Who may view: the GET role-gating decision".

- **#297 — Open.** `GET /admin/articles`, `GET /admin/categories` and `PATCH /admin/categories/:id` are not literal Section 4 lines. Built because a screen that can create but never list, or a status toggle with nothing behind it, is a bigger gap. `PATCH /admin/categories/:id` is also the deliberate substitute for a category-delete route (none defined; `Article.categoryId` has no `ON DELETE CASCADE`, so a hard delete would orphan articles).
- **#298 — Open.** `Article.createdAt`, `Category.createdAt` and `Category.status` (`'active' | 'inactive'`, default `'active'`) are beyond Section 3. Migration `20260915135512_add_article_category_admin_fields`. They back the Articles "Date" column, keyset pagination, and the Categories status toggle.
- **#299 — Resolved.** `GET /admin/articles` and `GET /admin/categories` are role-gated `editor`/`superadmin` at class level, GET included. This mirrors `AdminModerationController`, which has no view-vs-mutate split, only a per-job split. Checked against the real code, not assumed.

## A3. Admin users (#303, #304)

Source: [`services/api/src/modules/admin-users/README.md`](../services/api/src/modules/admin-users/README.md) (PR #248). Sections: "Decision Log candidate #1", "Decision Log candidate #2", "Who may act: role-gating".

- **#303 — Open.** `User.accountStatus` gains a fourth value, `"suspended"`: admin-imposed and not reversible by the user, unlike self-service `"deactivated"`. No migration (plain `String`). Tracing every `accountStatus` branch found two real escape routes, both fixed before shipping: `reactivateAccount()` would have let a suspended user reactivate, and `deactivateAccount()`/`deleteAccount()` did not check the caller's status. Open sub-question: whether a suspended user should ever see a distinct "contact support" message once a support channel exists.
- **#304 — Resolved.** Admin-triggered delete (`PATCH /admin/users/:id { status: "deleted" }`) deletes immediately with no 30-day grace, reusing `AccountDeletionSweepService.hardDeleteUser` (made public). Sessions are revoked first. The value is `"deleted"`, not `"pending_deletion"`, so it does not imply a window that does not apply.

## A4. Admin dashboard (#305, #306)

Source: [`services/api/src/modules/admin-dashboard/README.md`](../services/api/src/modules/admin-dashboard/README.md) (PR #248). Sections: "Decision Log candidate: `totalVisits` …", "Who may view: reachable by every admin role".

- **#305 — Resolved.** `GET /admin/dashboard/stats` is `AdminJwtAuthGuard` only, with no role gate: a stated divergence from every other Section 4.8 controller. It is every role's landing screen and its stats straddle the Users and Articles jobs.
- **#306 — Open.** The Figma "Total Visits" stat and visitor chart have no backing: no page-view model or tracking middleware exists. `totalVisits` is returned as an explicit `null` (never a faked `0`). "New users by league" and "Latest posts" also stay sample data.

## A5. Media (#307, #308, #310)

Source: [`services/api/src/modules/media/README.md`](../services/api/src/modules/media/README.md) (PR #249, PR #317 for #307). Sections: "The storage abstraction", "`MediaAsset.key` — a genuine schema addition, flagged", "What this PR does NOT do". (#309 is in the same README but is covered in Part B.)

- **#307 — Resolved (decision only).** Storage provider is Cloudflare R2 (zero egress fees; S3-compatible, so no code change). **This does not make storage live**: the Cloudflare account, bucket and API token are a human action, and until real `S3_*` values are set `POST /admin/media/upload` still returns 503. Flagged and not fixed: `MediaAsset.url` is built as `<endpoint>/<bucket>/<key>`, which on R2 is the authenticated endpoint and not publicly readable, so a public-base-URL setting is needed before uploaded media can be displayed.
- **#308 — Open.** `MediaAsset.key` (the durable, config-independent storage key) is beyond Section 3's `url`-only model. Migration `20260915162308_add_media_asset_key`. Stored on every row but not yet read by anything.
- **#310 — Open.** No `GET /admin/media/:id` exists; `MediaPreviewPage` uses the same router-state handoff plus bounded fallback as #300. It is also the natural companion to an unbuilt `DELETE /admin/media/:id` (`StorageService.delete()` is implemented and tested).

---

# Part B — Dependency hazard: #309 (not a spec deviation) — RESOLVED 2026-09-27

**Resolved.** `sprint`-independent fix branch `fix/platform-express-multer-cve` moved the lockfile from `@nestjs/platform-express@11.2.1` to `11.2.6`. The upload path now loads `multer@2.4.0`. The text below is kept as the record of the hazard and the fix.

**The hazard (as disclosed when Sprint 5 shipped).** `services/api` declares `"multer": "^2.3.0"` and got a nested `multer@2.3.0`. But `FileInterceptor` does its own `require('multer')` from inside `@nestjs/platform-express`, which resolves to the hoisted **root** copy, `multer@2.2.0`, because `@nestjs/platform-express@11.2.1` pinned an exact `multer: "2.2.0"`. The project's own version range therefore did not protect the upload path. Source: media README, "A real, disclosed dependency-chain finding: `multer`".

**Advisories against `multer@2.2.0`** (from `npm audit`, 2026-09-26): three high (`GHSA-wc9g-mqfw-jrwm` crafted field names; `GHSA-qfvm-cv95-jqjf` file-descriptor leak on aborted uploads; `GHSA-535w-7cp7-47q4` oversized array index in field names) and one low (`GHSA-qvfw-j98x-7q72` async `fileFilter` race). The original entry named only `GHSA-qfvm-cv95-jqjf`. Exposure was probably limited to authenticated editor/superadmin admins, since `@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)` runs before the interceptor (reading, not tested), but that lowered the risk without removing it.

**The stated remedy was stale.** The entry said the only fix was a `@nestjs/platform-express` 12.x major. Registry check on 2026-09-27: `@nestjs/platform-express@11.2.6` (the latest 11.x; 11.2.1 depends on `multer@2.2.0`, 11.2.6 on `multer@2.4.0`) is within the existing `^11.0.0` range, so no major bump and no `package.json` change was needed.

**The fix.** `npm update @nestjs/platform-express --workspace=services/api`. Only `package-lock.json` changed.

| | Before | After |
|---|---|---|
| `@nestjs/platform-express` | 11.2.1 | 11.2.6 |
| root `node_modules/multer` (what `FileInterceptor` loads) | 2.2.0 | **2.4.0** |
| `services/api/node_modules/multer` (nested) | 2.3.0 | removed; deduped to root 2.4.0 |
| `multer` in `npm audit` | 4 advisories | none |

Verified against the installed tree, not the declared range: `node -p "require('./node_modules/multer/package.json').version"` prints `2.4.0`, and `npm ls multer @nestjs/platform-express` shows `@nestjs/platform-express@11.2.6 -> multer@2.4.0 deduped` plus the direct `multer@2.4.0`. Also removed from the lockfile as no longer needed: `concat-stream`, `typedarray`, and nested `media-typer`/`type-is` (multer 2.4.0 no longer depends on them).

**Tests.** `jest src/modules/media src/modules/admin`: 18 suites / 162 tests, 0 failures (includes `admin-media.controller.http.spec.ts`). `npx tsc --noEmit` and `nest build` clean. The full mocked and e2e suites were not re-run.

**Still open, not part of this fix.** `npm audit` still reports other findings (e.g. `fast-xml-parser`, `image-size`, `js-yaml`), none about `multer`.

---

## Related open items outside #295–#310

Not in scope for this doc, listed only so nobody assumes they are covered:

- Decision Log #293 and #294 are referenced by number in CLAUDE.md but were never transcribed into the docx table (flagged in an earlier doc-hygiene pass).
- #250's DPIA items R8/R9 (see #302) need counsel input, not only code.
