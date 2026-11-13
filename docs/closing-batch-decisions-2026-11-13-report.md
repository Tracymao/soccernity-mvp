# Closing batch decisions 2026-11-13: report

Written for: the founder (Temi), to verify and merge. Docs only.

Branch `docs/closing-batch-decisions-2026-11-13`, cut from `origin/main` `bcc2f96` in a separate worktree (`D:\Projects\soccernity-closing`).

## 1. Handshake

- `git fetch origin`: `origin/main` is `bcc2f96` (PR #753), the head named in the brief; nothing newer.
- `gh pr list --state open`: none, so no open PR edits `docs/build-register.md`, `CLAUDE.md` or the Build Plan docx.
- Confirmed from the files: last Decision Log number #499, last B-ID B-304, last register section 91, last Playwright spec `57-b304-users-list-block-and-under16.spec.ts`.
- This PR touches the docx, so it merges alone and first.

## 2. What changed

- **Build Plan docx (Decision Log, `Document.tables[6]`):** new rows #500 (sessions end at once), #501 (user uploads switchable, `MEDIA_UPLOADS_ENABLED`), #502 (two admin-screen fixes), #503 (suspension email stays at the address on file). Dated built-by lines appended to the Status cells of #485, #486 and #487. Nothing else.
- **`docs/build-register.md`:** rows B-305 to B-309 (all W8, 0 gap frames); dated lines on B-206, B-267 (new item (l)), B-282, B-289, B-290, B-304; Section 7 extended to #503 with four rows; counters (line 3, Register size, Waves table, W8 list); Section 92.
- **`CLAUDE.md`:** one status bullet. Nothing else corrected.

## 3. Things in the brief that did not match the repo (reported, not followed)

1. **B-304 builder.** The brief says "BUILT by PRs #752 and #753". `gh pr view`: #752 only added the register row (Section 91); #753 is the build. The B-304 line says so.
2. **B-249 and B-251 in the "built and confirmed in code" range B-243 to B-252.** B-249 (custom same-site domains) is a human step and `render.yaml` has no soccernity.com domain; B-251 (Cloudflare) is a draft for counsel, and Cloudflare appears in `render.yaml` and `.github` only as the R2 storage vendor. Section 92b (i) lists them as NOT built, not as built.
3. **#485 to #487 already carried a "BUILT" bracket** (PR #722, PR #721, PR #725 respectively). The new lines add what was missing (B-292, B-295, B-297, B-302 for #485; B-297, B-302, B-295, B-301 for #486; B-299 and the figures for #487) instead of repeating it.
4. **"Block" in #500** is read as the admin Users-list Block (a suspension, `admin-users.service.ts` line 269). The user-to-user Block calls no session revocation. Recorded as a reading, not a founder statement.
5. **Access-token issued-at time.** `TokenService.verifyAccessToken` returns only `sub` and `role`, so the guards cannot compare a token's issue time to the marker today. Recorded as build detail in #500 and B-305.

## 4. Checks made against code (no tests run)

- Guards verify signature and expiry only: `modules/auth/token/token.service.ts` (`verifyAccessToken`, `revokeAllSessionsForUser`), `modules/admin/token/admin-token.service.ts` (`revokeAllSessionsForAdmin`). Callers of the two revoke methods were listed with grep (account suspension, Users-list Block, change password, reset, email change, two-factor recovery, admin role/status and two-factor reset).
- No `MEDIA_UPLOADS_ENABLED` or `media_uploads_disabled` anywhere in `services/api`, `render.yaml` or `.env.example`. Upload routes carry consent, email and profile guards only.
- Hold controls: `ReportDetailPage.tsx` renders `HoldStatus` and the case-level hold buttons to any admin. Audit-log notes: `AuditLogPage.tsx` prints `item.notes` as stored.
- `report-retention.service.ts` still has `BlockReason` `contest_entry`; #493 (c) and #495 (g) read from the docx.
- B-282: `guardianNoticesCopy.ts` (`ALERT_BODY`, `WITHHOLD_BULLET_RECOVERY`) already says the adult route; commit `db85ede`. Figma frames not checked.
- PR states (`gh pr view`): #714, #715, #716, #719, #721, #722, #725, #730, #731, #735, #740, #742, #749, #752, #753 all MERGED.
- Production dependency audit on `bcc2f96`, run for real: `services/api` 1 low (`deepmerge`); `apps/web`, `apps/admin`, `packages/shared` 0; `apps/mobile` (report-only) 12 findings, one high (`image-size`).
- Probable cause of the CI failure on `6cc1522` (read from code, not reproduced): `EmailChangeService.confirm` fires `guardianNotices.notifyInBackground` for a minor (line 248); the spec's `idle()` waits only on `EmailChangeService.whenIdle()`.

## 5. Verification

**Register**, positional `difflib.SequenceMatcher` against `git show origin/main:docs/build-register.md` (LF/CRLF normalised; the working file has no bare LF):

| Change | Result |
|---|---|
| line 3 (Updated paragraph) | appended text, old text a prefix |
| line 27 (Register size) | counters 304 to 309, 263 to 268, "was 304" clause inserted (not a prefix, by design) |
| lines 41 and 46 (Waves table) | W8 51 to 56, Total 304 to 309 |
| line 415 (W8 list) | count 51 to 56 and five names appended |
| B-206, B-267, B-282, B-289, B-290, B-304 | cell 5 (Spec status) only, old cell a prefix of new, 12 cells each |
| B-305 to B-309 | inserted after B-304, 12 cells each |
| Section 7 heading | `#367-#499` to `#367-#503`; rows #500 to #503 inserted after #499 |
| Section 92 | inserted at end |

No other line differs. Main table: 309 rows, 309 unique B-IDs, no row with other than 12 cells. The wave lists in Section 3 contain 309 names (61 + 13 + 3 + 16 + 7 + 21 + 9 + 3 + 56 + 57 + 16 + 26 + 21) and equal the main-table set.

**Arithmetic:** B-IDs 304 + 5 = 309 (41 with gap frames + 268 without); gap frames 146 unchanged (71 + 34 + 35 + 6); 146 + 196 = 342; 342 + 65 + 36 = 443; Decision Log 497 + 4 = 501 data rows.

**Docx:** Decision Log table 498 rows (header + 497) to 502 (header + 501); rows #500 to #503 added; Status cells of #485, #486, #487 differ by appended text only (old text a prefix); every other cell and table, and all 246 paragraphs, are text-equal; 501 data rows, no duplicate number, #293 and #294 still absent; only `word/document.xml` differs inside the zip; `testzip` clean; Build Plan stays v1.7.

## 6. Not run / not verified

No test suite, `tsc`, `eslint`, build, Playwright or browser check (docs PR). The 143-test Playwright result is quoted from `docs/qa-b304-playwright-specs-report.md`, not re-run. CI cannot be read for the new head. The "built and confirmed in code" list rests on file and symbol searches, not on running the code. Figma frames were not read. `docs/check_version_consistency.py` does not exist in the repo, so it was not run.

## 7. Stale and named, not edited

`docs/sprint-1-dpia-outline-draft.md` v0.7 lines 87, 1448 to 1449 and 1603 (hold routes "gated on `concernsMinor` only"); Sections 85c, 88c, 89c, 90b and 91b items answered by the new decisions (listed in Section 92c).
