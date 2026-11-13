# B-308: hold controls and audit-log notes (apps/admin)

Built 2026-11-13 from `origin/main` `fd5c66a` (docs PR #754, Decision Log #502 and register row B-308, was merged). `apps/admin` only. No Figma change (founder-accepted). I cannot read CI from here.

## 1. Hold controls on a child-involved message report

**What changed.** On Report detail, for a message report whose thread involves a child, an admin who is not child-safety vetted no longer sees the three hold controls: "Reporter acted in bad faith", "Legal hold" and "Lift hold". A line is shown instead. Viewing the report is unchanged (Decision Log #486): the message, the "Context hidden: this involves a child." callout, and the hold-active row (the hold's marker, "Active since", "Ends") are all still there. A vetted admin, an adults-only message report and every non-message report are unchanged.

**The signal.** `report.contextHidden === true` on the single-report read (B-293). The backend sets it exactly when the admin is not vetted and the thread involves a child (`moderation.service.ts` lines 942 to 957; `contextHidden: false` for a vetted admin, line 991). The page applies no age rule and makes no extra call. The same flag is already read by `ContextMessagesCard` for the "Context hidden" line. The report row handed over from the queue carries no flag, so the page waits for its existing single-report read (the one that already fetches the message and holds) before drawing the controls on a message report. This avoids showing the controls and then withdrawing them. If that read fails, the controls are drawn and the server's 403 (`onRestricted`, the existing restricted card) is the safety net, as before.

**Files.**

- `apps/admin/src/pages/moderation/ReportDetailPage.tsx`: computes `holdControlsRestricted` / `holdControlsPending` / `showHoldControls`. Hides `CaseLevelHoldButtons` and `CaseLevelHoldCallout` in both the "Case-level actions" card and the "Take action" card, and passes `canLift` to `HoldStatus`. Shows the line in both cards when restricted.
- `apps/admin/src/pages/moderation/holdActions.tsx`: new `HoldControlsRestrictedLine` and `HOLD_CONTROLS_RESTRICTED_MESSAGE`; `HoldStatus` gains an optional `canLift` (default true; false hides only the Lift hold button).
- `docs/pending-copy-manifest.md`: one new row for the line.

**New wording (tagged).** "Holds on this report need a child-safety-vetted admin (Settings › Roles). [COPY PENDING LEGAL REVIEW]". No existing restricted string fitted: `VettingRestrictedNotice` says "The server rejected it — nothing was changed", which would be untrue when shown up front, and the "This report concerns a minor — acting on it requires..." note is conditional on `concernsMinor`. The line is tagged and has a manifest row as B-301 required; the pending-copy inventory test (`apps/web`, 15 tests) passes with it.

**Not done, on purpose.**

- **Appeal Review** (`AppealReviewPage.tsx`) renders the same `CaseLevelHoldButtons` and `HoldStatus` and has the same gap for a message report that involves a child. The brief named the Report detail page only, and that page's handed-over report copies only `holds` from the single-report read (no `contextHidden`), so a fix there needs a small change to how it merges the read. Not done; the server still refuses with the existing restricted card. Say if you want it.
- The other report actions on a child-involved message report (Dismiss, Remove Content, Warn, Suspend) are still shown to an unvetted admin and refused by the server (B-297). Out of scope for B-308.

## 2. Audit log notes

**What changed.** `AuditLogPage` (Audit log and My activity share the row component) now shows:

- `user.username_review_decided`: "Reinstated the username “nazif”. Reason: ..." or "Declined the request to restore the username “nazif”. Reason: ...", in the order decision, username, reason. The reason is everything after `reason=` (it is free text and may contain `;` or `=`). An empty reason leaves the sentence without a Reason part.
- `report.appeal_recorded` with the note `pending`: "Appeal recorded, decision pending".
- Anything that does not parse (a different action, an unknown decision value, a different appeal note, a null note) is shown exactly as stored, or a dash for null. Profile-picture rows keep their existing formatting.

Display only: nothing is shown that the note does not already say, no raw `key=value` string or action key appears for these two kinds, and no backend change. Staff wording, plain, not tagged.

**Files.** `apps/admin/src/api/adminActionLog.ts` (new `readableNotes`), `apps/admin/src/pages/activity/AuditLogPage.tsx` (one call). The B-303 drift test `actionLogKinds.test.ts` is untouched and green.

## 3. Tests (Vitest)

New: `src/pages/moderation/holdControlsRestricted.test.tsx` (9 tests: unvetted on an open child-involved message report, an actioned one, an active hold with no Lift control; vetted admin; adults-only message report; non-message report; handed-over report waiting for the read then showing the controls, showing the line, and the failed-read fallback ending at the existing restricted card) and 7 tests added to `src/pages/activity/auditLog.test.tsx` (both note formats, a reason with `;` and `=`, an empty reason, a non-parsing note, a null note, My activity).

One existing assertion changed on purpose: in `auditLog.test.tsx` the B-303 label test pinned the notes of the same two kinds as stored (`pending`, `decision=decline; ...`); it now expects the readable text (title adjusted).

## 4. Commands and counts

- `apps/admin`: `npx tsc --noEmit` clean; `npx eslint "src/**/*.{ts,tsx}"` clean; `npm run build` clean.
- `apps/admin` vitest, full run (`--maxWorkers=3`): 60 files / 944 tests, 0 failures. Before: 59 files / 928 tests, derived (after minus the 16 added; it is also the figure PR #748 recorded), not re-measured on a clean `main`.
- `apps/web` `src/pendingCopyManifest.test.ts`: 15 tests, 0 failures.

**Not run:** `services/api` (untouched), `apps/web` suites other than the inventory test, all Playwright (`e2e/`), any real-browser check, CI.

## 5. Expected Playwright drift (e2e/ NOT edited)

- `e2e/tests/55-b304-hidden-context-and-vetting.spec.ts` lines 135 to 152, test "B-302: placing a bad-faith or legal hold is refused for the admin who is not vetted (coded 403, UI panel)...". Line 138 `page.getByRole('button', { name: 'Legal hold', exact: true }).click()` will no longer find a button for the unvetted admin on `childReport`, so lines 138 to 142 (dialog, fill, Place legal hold, restricted heading) fail. The API assertions at lines 144 to 150 are unaffected. The spec should instead assert both hold buttons are absent and `[data-testid="hold-controls-restricted"]` (text above) is visible.
- `e2e/tests/56-b304-audit-log-labels.spec.ts` line 99, `await expect(table.getByRole('cell', { name: label })).toHaveCount(1);` for `label = 'Appeal recorded'`: the new notes cell "Appeal recorded, decision pending" also matches the name `Appeal recorded` (substring), so the count becomes 2. Line 78 uses `.first()` and is unaffected. Use `exact: true` or assert the notes text.
- Checked and not expected to drift: `20-held-investigations-holds.spec.ts` (post reports), `22-contact-enquiries-escalate.spec.ts` line 213 (asserts the buttons are absent on an enquiry report), `54-b304-record-appeal.spec.ts`, `55` lines 100 to 133 (B-297) and 154 to 182 (API-only lift), `56` lines 61 to 66 and 71 to 86.

## 6. Defaults I chose (veto-able)

1. Controls are held back (no line, no buttons) on a message report until its single-report read answers.
2. The restricted line is tagged `[COPY PENDING LEGAL REVIEW]` with a manifest row, because no existing string fits.
3. The hold-active row stays visible without its Lift button (reporting a hold is viewing, not acting).
4. A username-review sentence uses curly quotes around the handle.
