# Admin screens for suspected illegal imagery (B-206) - report

Branch `frontend/admin-suspected-illegal-imagery`, cut from `origin/main` `ba18257` after the backend PR #800 merged.
`apps/admin` only (plus one Playwright spec, the pending-copy manifest, this report and one CLAUDE.md bullet).
No backend, Figma, register or Build Plan docx change; no new API route; Approve and Reject are unchanged.

## No Figma frame exists

There is no Figma frame for any of these screens. Nothing was drawn. They reuse existing admin patterns: the Reject
dialog shell and the neighbouring dialog classes (item page), the Username reviews list pattern (status filter with
Apply, table, Load more, empty / loading / error states), and the Held investigations / Report detail cards (detail
page). **All wording below is DEFAULT, founder-veto-able.** A Figma pass can replace any of it.

## What changed

- **Item page** (`/moderation/media/:id`): a "Suspected illegal imagery" button beside Approve and Reject. It opens a
  confirmation dialog: the file is withdrawn from public view and rejected (the uploader sees the standard rejection),
  kept for the set-aside period, not deleted with the uploader's account, and nothing is reported to anyone. Reason
  required, trimmed, 10 to 500 characters (the server allows 1 to 1000; the client is stricter on purpose). After
  success the page shows the record status with a link to the record, and the button is gone.
  - Visibility: hidden when a record already exists, and hidden for a profile picture or cover (the API covers post and
    contest media only). The page cannot tell from the item answer whether the admin is vetted, so it reads the admin's
    own `childSafetyVetted` from the existing session: hidden when that is known not to be true, shown when no profile
    is available (the server's coded 403 then decides). A coded 403 `child_safety_vetting_required` closes the dialog,
    shows the existing restricted notice and re-reads the profile so the button goes away.
- **List page** (`/moderation/suspected-illegal`, linked from Media review): columns Flagged, Kind, Status, Kept until,
  Open. Status filter (All / Not filed / Filed / Decided not to file) with Apply, Load more, empty, loading and error
  states. A record still needing a filing decision ("Not filed") has the strong pill and a navy bar on its left edge.
  The "Suspected illegal imagery" link on the queue page is hidden for an admin known not to be vetted.
- **Record detail** (`/moderation/suspected-illegal/:id`): the facts (no file content; a signed view link only if the
  API returns one), suggested receiving bodies for the uploader's country each marked "Pending counsel", a plain
  statement that the report is made with the receiving body outside Soccernity and the page only records it, and two
  forms: "Record that this was filed" (body incl. Other with a name, reference, optional date and time, optional note)
  and "Record a decision not to file" (reason, 10 to 1000). Once decided the forms are replaced by a read-only
  "Decision" section.
- **Errors**, chosen by the server's `code`, never by its wording: 409 already recorded / already decided (the page
  re-reads the record), coded vetting 403 (existing restricted notice), any other 403 (role: "You don't have access"),
  400 body-other-required and filed-at-invalid (shown on the field), 404 not found, anything else a fixed retry line.

## Tagged wording

Six strings carry the literal `[COPY PENDING LEGAL REVIEW]` in the rendered text, each with a row in
`docs/pending-copy-manifest.md` (four in the dialog, two on the detail page). They describe what is withdrawn, kept and
not deleted, who sees what, and the pending-counsel suggestions. `npm run check:pending-copy` still fails by design.
The inventory test (`pendingCopyManifest.test.ts`) passes, 15 of 15.

## Found

- If the server rejects "Other" for a missing `bodyOther` while a named body is selected, the field does not exist on
  screen; the page now shows that message at the top of the form instead of hiding it (unit-tested).
- The client reason limit (10 to 500) is narrower than the server's (1 to 1000). Deliberate; a Figma or product call.
- A non-vetted admin cannot tell vetted from non-vetted on a fresh load of the item page except through their own
  profile; the server remains the only real gate.

## Verification (measured)

- `apps/admin` `tsc --noEmit` clean; `npm run lint` clean; `npm run build` clean.
- `apps/admin` Vitest: **1,004 tests passed, 0 failed** (full run, `--maxWorkers=3`). New: `api/suspectedIllegal.test.ts`
  (validation, request body, code-based messages, labels, a drift guard against the backend receiving-bodies table) and
  `pages/suspected-illegal/suspectedIllegal.test.tsx` (39 tests in the two files: visibility rules, dialog and form
  validation, every error message, list and detail states).
- Pending-copy inventory test (`apps/web`): 15 of 15.
- Playwright, **only** spec 65 and spec 34, run alone on idle ports with Docker Postgres/Redis healthy: **11 passed,
  0 failed** (34: 7 tests; 65: 4 tests). Spec 65 seeds a pending post picture in Postgres, uses a minted vetted
  moderator and a minted non-vetted moderator, and checks: reason required then set-aside, the record in the list as
  Not filed, a filing with body / reference / date shown as Filed (database row read back), and the non-vetted
  moderator getting no action plus the real API's coded 403 and nothing created. Screenshots: `docs/b206-admin-screens/`.
  The suite rewrote nine tracked screenshots under `docs/b037-admin-screens/`; they were reverted.

## Not run

The rest of the Playwright suite, the `apps/web` and `services/api` test suites (other than the inventory test), CI
(cannot be read from here), any real-browser check beyond the two specs above, and the unit test of the dialog against
Figma (none exists).
