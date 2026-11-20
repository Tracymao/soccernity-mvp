# Withheld-notices recovery wording (Decision Log #480)

Branch `frontend/fc-withhold-recovery-wording`, `apps/admin` only.

## What changed

Two strings in `apps/admin/src/pages/users/guardianNoticesCopy.ts` described the old behaviour (a child with withheld guardian notices is "pointed to Contact us and staff help them"). Since the backend change for Decision Log #480 that child recovers two-factor through the adult route. Replaced exactly as briefed:

- `ALERT_BODY` (the "Guardian notices are being withheld" callout on the Admin user detail page): now ends "...the child recovers through the adult route (a link to their own email, their password and a 24-hour wait). Consent emails are not affected."
- `WITHHOLD_BULLET_RECOVERY` (the second bullet of the Withhold dialog): now "Guardian-assisted two-factor recovery is switched off. The child can still recover through the adult route: a link to their own email, their password and a 24-hour wait."

Nothing else was edited.

## Search for other copies of the old sentence

Searched `apps/admin/src` and `apps/web/src` for "pointed to Contact us", "staff help them" and "Guardian-assisted two-factor recovery". Only the two strings above matched. `apps/web/src/pages/twoFactor/TwoFactorRecoveryRequest.tsx` has a "Contact us" link for the minor-with-no-guardian case; that case is unchanged and was left alone. No other app code, test or manifest row quotes the old sentence.

## Tests and manifest

- No test asserts either string literally (checked `guardianNotices.test.tsx` and every other admin test); both are rendered via the copy constants, so no test needed editing.
- `docs/pending-copy-manifest.md` has no row for either string (the Guardian notices card is covered by its one Copy Tag chip row; neither string carries the literal tag). Nothing to update. The inventory test is unaffected.
- Neither new sentence carries `[COPY PENDING LEGAL REVIEW]`; the strings were not tagged before and the brief gave exact text without a tag.

## Not touched

`services/api`, `apps/web`, any `.docx`, `docs/build-register.md`.

## Forward-pointer notes for the docs PR (not written here)

- Build register: status line on B-282 (and B-280) that the Admin dialog and callout wording for a withheld minor's recovery now matches Decision Log #480 (adult route), replacing the "pointed to Contact us and staff help them" wording.
- Dated note on the `frontend/b282-guardian-notices-admin` register entry / the `backend/flagged-minor-recovery` bullet in CLAUDE.md that the stale-strings follow-up is done.
- The Figma frames of `docs/figma-guardian-notice-withhold-report.md` (PR #589) still draw the old sentences; a Figma follow-up should update the Withholding callout and the Set dialog bullet.

## Verification

See the PR description for the measured results.
