# B-303: Audit log labels for two action keys (apps/admin)

Branch `frontend/b303-audit-log-action-labels`, from `origin/main` `472b3c4` (after docs PR #747 merged: Decision Log #498/#499, register B-302/B-303, Section 89).

## The defect

The admin Audit log / My activity screen labels each action from `ACTION_KINDS` in `apps/admin/src/api/adminActionLog.ts`, a hand-kept copy of `ADMIN_ACTION_LOG_ACTIONS` in `services/api/src/modules/admin-action-log/admin-action-log.constants.ts`. Two keys of the API list had no entry, so a row for them showed the raw key and the Action filter could not select them:

- `report.appeal_recorded` (B-292, PR #731)
- `user.username_review_decided` (B-139 part (c), PR #626)

I re-checked all keys of the API list against the app: exactly these two were missing.

## What changed

- `ACTION_KINDS` gains both entries, in the position matching the API list order (the appeal one after `report.appeal_decided`, the username one after `user.username_revoked`):
  - `report.appeal_recorded` -> "Appeal recorded"
  - `user.username_review_decided` -> "Username review decided"
- New `apps/admin/src/api/actionLogKinds.test.ts` reads the API constants file by path (same technique as `contactCategories.test.ts`) and fails, naming the missing keys, when a key of `ADMIN_ACTION_LOG_ACTIONS` has no entry in `ACTION_KINDS`. It also checks order, that the app offers no key the API does not know, and the two labels. Mutation check: deleting the `report.appeal_recorded` entry made 3 of its 5 tests fail with "Add these action keys to ACTION_KINDS ...: report.appeal_recorded"; file restored.
- `auditLog.test.tsx` gains two tests (row text and links for both actions; the Action filter offers both and sends the key). No existing assertion was changed or weakened; no existing test counted the filter options.
- No tag and no manifest row (admin wording, no legal or safety statement).

## Wording and Figma

Labels follow the neighbouring entries ("Report actioned", "Appeal decided", "Username revoked"). I searched the repo's Figma reports (`docs/figma-*.md`) for these two actions in the Audit log frames: none names them (the frames draw sample rows only). I did not read the live Figma file, so I cannot say a frame does not use other wording; "Appeal recorded" does match the wording the Pass U frames use for the same event on Report detail.

## What an admin sees for each row today (unchanged, as asked)

Row cells: time, actor, action label, target type label, target link, notes exactly as stored.

- `report.appeal_recorded`: action "Appeal recorded"; target type "Report"; target "Report #<first 8>" linking to `/moderation/reports/<id>`; notes `pending` (the API writes the appeal status only, never the reason). Nothing shows who the appeal was for, or that staff recorded it on someone's behalf beyond the label.
- `user.username_review_decided`: action "Username review decided"; target type "User"; target "User #<first 8>" linking to `/users/<id>`; notes `decision=<reinstate|decline>; username=<handle>; reason=<internal reason>`, shown raw.

## Display problems found, not fixed

1. The username-review notes are a raw `key=value; ...` string, not readable prose, and they carry the revoked handle and the internal reason. Those are shown to every admin who can see the row (the reader already hides rows about a minor from an admin who is not child-safety vetted; that rule is untouched).
2. The `report.appeal_recorded` note `pending` is not informative on its own.
3. The username-review target is the user, not the review request, so there is no link to the review.

## Run, and not run

Run in `apps/admin`: `tsc --noEmit` (clean), `npm run lint`, `npm run build`, full vitest suite (final run: 59 files / 928 tests passed; an earlier full run had 1 failing test in an unidentified file under load, which passed on rerun). The two touched test files: 34 tests passed.

Not run: `apps/web`, `services/api`, Playwright, any real-browser check, CI.
