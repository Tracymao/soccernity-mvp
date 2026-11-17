# R97: clear the 56 admin two-factor pending-copy strings

Branch `frontend/clear-admin-two-factor-pending-copy`, cut from `origin/main` `014afcd` (PR #808 merged; Decision Log #531 exists in the Build Plan docx: "The founder clears the 56 admin two-factor strings himself, without counsel; counsel reads the other tagged strings"). No open PR touched the manifest, `apps/admin/src/pages/two-factor/` or the runbook.

## What was done

- **56 strings read, all cleared.** Every `twoFactorCopy.ts` row (manifest rows for sign-in notice, enrolment, backup codes, code prompt, profile card, regenerate, turn off, staff reset, Edit admin lines and the control labels) is an instruction to staff about their own authenticator app, backup codes or resetting another admin. A search of the file for child, guardian, minor, under 18, image, photo, picture, parent, young found nothing. **No string was held back.** The tag was removed from each in `apps/admin/src/pages/two-factor/twoFactorCopy.ts`; the file's header comment now says why and that a string must be tagged again if it ever describes a child, guardian, images or non-staff personal data.
- **56 manifest rows deleted** from `docs/pending-copy-manifest.md`, and one sentence added under "Clearing a string when counsel approves it": "The admin two-factor strings were cleared by the founder, not counsel (Decision Log #531)." The allow-list `scripts/pending-copy/dist-allowlist.json` is still `[]`.
- **Tests changed: none.** No test asserted the tag text on these strings (the two-factor pages, sign-in, profile and Roles tests all passed unmodified).
- **Figma not touched.** The two-factor frames still carry their frame-level tag; that is Figma-side and out of scope.
- **Runbook** `docs/launch-gate-runbook.md`: only step 7.1 (heading and body), the one-page checklist line for 7.1, and the "Do not start until ..." sentence. 246 became 196 and step 7.1 now says counsel reads the public strings and the admin strings about children, guardians, holds, suspensions and media, and that the 56 two-factor strings were cleared by the founder (Decision Log #531).

## Counts: what each number measures

`npm run check:pending-copy` counts **places in the built output** (every occurrence of the literal tag in `apps/web/dist` and `apps/admin/dist`, after a fresh `npm run build:release`). The manifest counts **rows**, one per tagged string in source. They differ because one string can reach the bundle more than once.

| | Check (places) | Manifest (rows) |
|---|---|---|
| Before | 252 (web 145, admin 107) | 206 (web 99, admin 107) |
| After | **196** (web 145, admin 51) | **150** (web 99, admin 51) |

Evidence: the check output grouped by file, and `grep -c` of the manifest rows by app, before and after. The runbook's old figure "246 (web 145, admin 101)" was already out of date on `origin/main`: admin had grown to 107 places by the time of this change (web unchanged at 145). The check still exits 1 by design (196 remaining). The inventory test `apps/web/src/pendingCopyManifest.test.ts` passes (15/15).

## Verification

- `apps/admin`: `tsc --noEmit` clean; eslint on `twoFactorCopy.ts` clean; the 10 two-factor/sign-in/settings test files 151 tests, 0 failures; the full admin Vitest suite 64 files / 1,030 tests, 0 failures on the final run. **One earlier full run showed 1 failing test in 1 file and an immediate rerun passed 1,030 of 1,030; I did not identify which test (load flake suspected, not proven).**
- Not run: Playwright (not asked), `apps/web` tests other than the inventory test, `services/api`, CI.

## Other files that state 246 (or the 145/101 split), NOT changed

- `docs/launch-gate-runbook.md` lines 33, 49 (the build-gate paragraph), 436 (open items) and 541 (row list; 246 appears elsewhere on those lines as a row id): left as the brief asked.
- `docs/deployment.md` line 491 ("246 tagged places").
- `docs/build-register.md` lines 4984 (QA report table "246 places (apps/web 145, apps/admin 101)"), 5271 and 5523 (a note that runbook step 7.1 "still says 246 strings").
- `CLAUDE.md` older bullets (the QA launch-gate runs, B-301, the static-site hosting bullet and others).
- Reports: `docs/qa-launch-gate-full-run-report.md`, `docs/qa-full-run-after-b310-report.md`, `docs/launch-gate-runbook-report.md`, `docs/infra-static-site-hosting-report.md`, `docs/b206-rollforward-*-report.md` and similar (history).

No register or docx edit was made.
