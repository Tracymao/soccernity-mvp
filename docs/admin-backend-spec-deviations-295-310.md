# Admin backend spec deviations — Decision Log #295–#310

**Status of this document:** reference snapshot, documentation only. It changes no code and resolves no decision.

**Source of truth:** `docs/Soccernity_MVP_Build_Plan_v1.7.docx`, Section 9 (Decision Log), the table read as `d.tables[6]`. The Status text below was read from each row on `origin/main` at `8479706` (2026-09-26), not summarised from memory. If the docx changes, the docx wins and this file is stale.

**Why these exist:** CLAUDE.md says the data model (Build Plan Section 3) and API contract (Section 4) are fixed specs, and that anything needed beyond them is flagged as a Decision Log candidate, not added silently. #295–#310 are the entries Sprint 5's admin, moderation, content and media backend work raised under that rule. Almost all of them were built anyway and flagged; that is the point of the log, not a defect.

> **Read Part B separately.** #309 (`multer` resolving to a vulnerable version) is **not** a spec deviation. It is an unaddressed dependency hazard that sits alongside them in the Decision Log. It is deliberately kept out of Part A so it does not read as routine paperwork.

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
| 309 | Media | **Dependency hazard, see Part B** | **Open** |
| 310 | Media | Missing endpoint, worked around | Open |

Note on #307: it is Resolved, not Open. It was Open when Sprint 5 shipped and was resolved on 2026-09-26 by `sprint-4/media-storage-r2-decision` (PR #317). The Resolved set is therefore #299, #304, #305 and #307.

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

# Part B — Dependency hazard: #309 (not a spec deviation)

**WARNING: unaddressed and open.** The `POST /admin/media/upload` upload path runs on a `multer` version with known high-severity advisories. It was disclosed when Sprint 5 shipped and has not been fixed. It is included in the Decision Log alongside the deviations above, but it is a different kind of thing.

**What the Decision Log entry says (Open).** `services/api` declares `"multer": "^2.3.0"` and gets a nested `multer@2.3.0`. But `FileInterceptor` does its own `require('multer')` from inside `@nestjs/platform-express`, which resolves to the hoisted **root** copy, `multer@2.2.0`, because `@nestjs/platform-express@11.2.1` pins an exact `multer: "2.2.0"`. The project's own version range therefore does not protect the upload path. Not fixed in PR #249. Source: media README, "A real, disclosed dependency-chain finding: `multer`".

**Re-checked in this checkout on 2026-09-26 (not taken from the entry):**

- `npm ls multer @nestjs/platform-express` still shows `@nestjs/platform-express@11.2.1` depending on `multer@2.2.0`, alongside the direct `multer@2.3.0`. `node_modules/multer` at the repo root is `2.2.0`; `services/api/node_modules/multer` is `2.3.0`. The hazard is unchanged.
- `npm audit` (in `services/api`) reports four advisories against the resolved `multer@2.2.0`: three high (`GHSA-wc9g-mqfw-jrwm` crafted field names; `GHSA-qfvm-cv95-jqjf` file-descriptor leak on aborted uploads; `GHSA-535w-7cp7-47q4` oversized array index in field names) and one low (`GHSA-qvfw-j98x-7q72` async `fileFilter` race). The Decision Log entry names only `GHSA-qfvm-cv95-jqjf`.
- **Probable exposure, my reading and untested:** the route is `@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)` at class level, and Nest runs guards before interceptors, so the multer code should only be reachable with a valid editor/superadmin admin token, not anonymously. That lowers the practical risk. It does not remove the hazard.

**The entry's stated remedy looks stale.** It says the only fix is a `@nestjs/platform-express` **12.x major**. Registry metadata queried today says otherwise:

- `@nestjs/platform-express@11.2.6` depends on `multer@2.4.0`. Its peer dependencies (`@nestjs/core`/`@nestjs/common` `^11.0.0`) are satisfied by the installed 11.2.1.
- `npm audit` reports `@nestjs/platform-express` vulnerable for `<=11.2.5` with `fixAvailable: true`, and the registry `legacy` dist-tag points at `11.2.6` (`latest` is `12.1.0`).

So a same-major bump to `^11.2.6` appears sufficient and may make the v12 migration unnecessary for this issue. **This was not tried.** No install, upgrade or test run was performed for this document. Whoever picks it up should confirm with a real bump plus the existing media tests before relying on it.

**Not fixed here, by design.** This PR is documentation-only. The dependency change belongs in its own PR, in line with the "flag it, don't fix it inside an unrelated PR" precedent from Decision Log #20.

---

## Related open items outside #295–#310

Not in scope for this doc, listed only so nobody assumes they are covered:

- Decision Log #293 and #294 are referenced by number in CLAUDE.md but were never transcribed into the docx table (flagged in an earlier doc-hygiene pass).
- #250's DPIA items R8/R9 (see #302) need counsel input, not only code.
