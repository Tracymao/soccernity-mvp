# Docs report: founder security decisions of 2026-11-08 (Decision Log #476 to #481)

Branch `docs/security-decisions-2026-11-08`, cut from `origin/main` `cb0dc31` (PR #695 merged). Docs only. Written for the founder, who verifies and merges.

## 1. What this PR does

- Adds Decision Log rows #476 to #481 to the Build Plan docx (`docs/Soccernity_MVP_Build_Plan_v1.7.docx`, table 6), deep-copied from the last row (#475).
- Adds register rows B-286, B-287 and B-288 and a new Section 82 to `docs/build-register.md`.
- Appends dated notes to nine register rows (B-059, B-067, B-084, B-085, B-253, B-274, B-278, B-280, B-282) and dated pointers to eight Decision Log rows (#378, #468, #470, #474, #475, #458, #455, #440). Old text is never changed, only appended.
- Updates `CLAUDE.md` with one status bullet and corrects the merge status of the previous docs PR (#695, confirmed MERGED).

Not touched: the legal draft, the DPIA, the incident plan, the Log Book, `docs/pending-copy-manifest.md`, any application code, schema or Figma.

## 2. The six decisions, with what I checked against the code

| # | Decision | Stated by the founder | Adopted by me (veto-able) | Checked on main |
|---|---|---|---|---|
| 476 | Email change: 202 for every well-formed request; unusable address gets an email; nothing for malformed, current or guardian address; old-address notice always; a not-accepted address no longer spends a failed-attempt slot | the approach | 5 requests per hour per account; 3 emails per 24 hours per recipient | Built route answers 202 or 400 `email_change_not_accepted` and counts it against 5 failed attempts per 15 minutes (`email-change.constants.ts`) |
| 477 | Message report context (B-286): up to 10 before and 10 after | the idea | the 10 and the 20 | `POST /reports` has no context field; admin read returns only the reported message |
| 478 | Message retention (B-287): delete 12 months after sent, everyone including minors, configurable; reported messages held under the report's retention | the whole rule | nothing | No job deletes a message; legal draft line 981 already has 12 months as a `[PROPOSAL]` starting figure |
| 479 | Social sign-in removed completely | the whole rule | nothing | All of it is still on main (see 3.2) |
| 480 | Withheld minor uses the adult recovery path; no staff reset tool | the whole rule | nothing | Code answers `no_guardian` (`two-factor-recovery.service.ts` lines 203 to 208) |
| 481 | Action-log reader hides the three guardian-notice audit rows from unvetted admins | the requirement | nothing | Already met (see 3.1) |

## 3. Things the brief did not match, and what I did

1. **#481: the reader is not future.** `GET /admin/action-log` exists (PR #607, screen PR #609). `ADMIN_ACTION_LOG_CHILD_SAFETY_ACTIONS` in `admin-action-log-read.constants.ts` already lists `user.guardian_notices_withheld`, `_cleared` and `_reviewed`; the exclusion is in the SQL; the unit spec pins the list and the e2e covers an unvetted reader (including paging with no gaps). I recorded #481 as stated and B-288 as a guard row, "requirement MET in code", rather than as "not built". Not verified: that the e2e names each of the three actions (the e2e seeds `user.guardian_notices_withheld`).
2. **#479: removal has no owner row.** The brief said B-084 and B-085 become "removed, superseded by #479" and added no row for deleting the code. The code is still on main (social-auth module, `SocialIdentity` and its migration, web flow, env variables in `render.yaml`/`.env.example`/`docs/deployment.md`, Playwright spec 33, Figma frames). I recorded this in #479, B-084/B-085 notes and Section 82b item 2, and did not add a B-ID.
3. **#480 makes shipped copy stale.** `apps/admin/src/pages/users/guardianNoticesCopy.ts` (tagged strings) and the Figma frames of PR #589 say recovery is switched off and staff help the child. Named in #480's Status and Section 82c; not edited.
4. **#476 leaves gaps the founder's wording does not cover** (what the route answers for malformed, current and guardian addresses; wording of the new email). Recorded as not decided. Known consequence: it lets a signed-in person trigger an email to a registered address; the two new limits bound that.
5. **Waves for the new rows are my choice:** B-286 W8, B-287 W6, B-288 W8.
6. **Moderator removal of a reported message** (Section 81b item 2) is still undecided and untouched, as instructed.

## 4. Verification

- Handshake: `gh pr list --state open` returned no open PR before any edit; `git fetch origin` first; next free numbers confirmed (Decision Log last #475, register last B-285, Section 81 last).
- Register: compared positionally with `git show origin/main:docs/build-register.md` using `difflib` (index is LF and the working tree CRLF because of `core.autocrlf`, so the base was normalised). Exactly nine rows changed, one cell each (Spec status), old text a prefix of the new. Other changes: the header `Updated` paragraph, the `Register size` paragraph, three Section 1 table lines, the W6 and W8 lists, the Section 7 heading, and inserted blocks (three rows after B-285, six Section 7 rows, Section 82). 288 main-table rows, 288 unique B-IDs, every row 12 cells, every B-ID in exactly one wave list, wave lists sum to 288.
- Docx: python-docx cell-by-cell and paragraph-by-paragraph against the committed file. Changed existing cells: the Status cells of #378, #455, #458, #440, #468, #470, #474, #475 only, each by appended text. Six rows added (4 cells each). Decision Log 479 data rows (was 473), highest #481, no duplicates, #293 and #294 still absent. `word/document.xml` is the only zip part that differs; `testzip` is clean.
- `docs/check_version_consistency.py` does not exist in the repository, so it was not run. No tests run (docs PR).
