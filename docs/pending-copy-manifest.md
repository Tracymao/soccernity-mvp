# Pending-copy manifest

Every user-visible string in `apps/web` and `apps/admin` that carries the tag `[COPY PENDING LEGAL REVIEW]`: wording that describes a child, a guardian, images or personal data and that counsel has not approved. Decision Log #405, build register B-124. Founder instruction 2026-10-17.

**Nothing in this list is approved.** The tag is shown to the person using the screen, on purpose, so draft wording cannot be mistaken for final wording. A string stays here until counsel signs off its exact wording.

## How the guard works

1. **Inventory test** (`apps/web/src/pendingCopyManifest.test.ts`, runs with `npm test`, so it runs in CI). It parses the source of both apps with the TypeScript AST and finds every tagged JSX text, string literal and template literal (comments are ignored). It fails when:
   - a tagged string exists in a file but has no row below, or
   - a row below no longer matches any string in its file (usually: counsel approved it and the tag was removed, or the wording changed).
2. **Release check** (`npm run check:pending-copy`, `scripts/check-pending-copy-dist.mjs`). Run after the production builds (`npm run build:release` does both). It fails when the literal tag text would ship in a built file of either app. **It fails today, and is meant to**: every row below is a place where draft wording would reach a user. It is a release gate, not a pull-request gate, so it is not part of `npm run build` or the normal CI run. Wire it into the production deploy (B-090).
   - Its allow-list, `scripts/pending-copy/dist-allowlist.json`, **stays empty**. It exists so the mechanism is visible, not as somewhere to park strings.

## Clearing a string when counsel approves it

In one pull request: reword the string in source if counsel changed it, **remove the tag from the string**, and **delete its row from this table**. Do not add it to the allow-list. When the table is empty, `npm run check:pending-copy` passes.

## Adding a tagged string

Add the tag to the string in source and add a row here (file, the string exactly as rendered, the Figma frame it comes from or "no frame"). In the string column, `{…}` stands for a value inserted by the code, and line breaks collapse to single spaces. The inventory test tells you if the row does not match.

| File | String | Frame |
|---|---|---|
| `apps/admin/src/pages/users/CorrectDobPage.tsx` | Correcting the date of birth re-runs the age-tier checks and can start the guardian flow. You confirm the consequences before anything changes. [COPY PENDING LEGAL REVIEW] | Admin Correct Date of Birth, form `6649:24980` (note `6649:25211`) |
| `apps/admin/src/pages/users/CorrectDobPage.tsx` | The age-tier checks have been re-run and the correction is in the audit log. If the correction turned an adult account into a minor account, the guardian flow was started. [COPY PENDING LEGAL REVIEW] | Admin Correct Date of Birth, success `6649:25721` (note `6649:25951`) |
| `apps/admin/src/pages/users/CorrectDobPage.tsx` | The age-tier checks re-run: under-13, under-16 and under-18 flags, the card-verification policy and restrictions. [COPY PENDING LEGAL REVIEW] | Admin Correct Date of Birth, confirm dialog `6649:25463` (line 1, `6649:25717`) |
| `apps/admin/src/pages/users/CorrectDobPage.tsx` | If this makes an adult account that has never gone through the guardian flow a minor account, the guardian flow starts. [COPY PENDING LEGAL REVIEW] | Admin Correct Date of Birth, confirm dialog `6649:25463` (line 2, `6649:25718`) |
| `apps/admin/src/pages/users/CorrectDobPage.tsx` | The correction is recorded in the audit log together with your reason. [COPY PENDING LEGAL REVIEW] | Admin Correct Date of Birth, confirm dialog `6649:25463` (line 3, `6649:25719`) |
| `apps/web/src/pages/GuardianConsentConfirmPage.tsx` | Your email address appears on {…}’s profile as their line of contact. [COPY PENDING LEGAL REVIEW] | Guardian Consent 4 Web Consent Confirmation `5108:6629`, request summary notice |
| `apps/web/src/pages/GuardianConsentConfirmPage.tsx` | {…}’s photo and username are visible to other Soccernity members. [COPY PENDING LEGAL REVIEW] | Guardian Consent 4 Web Consent Confirmation `5108:6629`, request summary notice |
| `apps/web/src/pages/GuardianConsentConfirmPage.tsx` | Report incorrect details [COPY PENDING LEGAL REVIEW] | Guardian Consent 4 `5108:6629`, "Report incorrect details" link |
| `apps/web/src/pages/GuardianConsentConfirmPage.tsx` | You told us some of these details are incorrect. Support will review them and contact you, and you can approve once that is done. You can still decline this request below. [COPY PENDING LEGAL REVIEW] | No frame draws the approval-on-hold state; wording is this PR's (B-029, Decision Log #372) |
| `apps/web/src/pages/GuardianConsentConfirmPage.tsx` | I confirm I am this account holder’s parent or legal guardian, and I give permission for this account to be activated. [COPY PENDING LEGAL REVIEW] | Guardian Consent 4 `5108:6629`, consent checkbox label |
| `apps/web/src/pages/GuardianConsentConfirmPage.tsx` | Declining closes the account and schedules it for deletion. [COPY PENDING LEGAL REVIEW -- expiry/deletion/withdrawal copy from the Figma frame is not reproduced here since it isn't backed by a real policy yet.] Read our Privacy Policy. | Guardian Consent 4 `5108:6629`, footnote (the shipped sentence differs from the frame's) |
| `apps/web/src/pages/GuardianConsentPage.tsx` | {…} Continue registration to finish setting up your profile. [COPY PENDING LEGAL REVIEW] | Guardian Consent 6 Activation Confirmation `5108:6631`, sub-heading |
| `apps/web/src/pages/GuardianConsentPage.tsx` | A guardian can decline up to 3 times. Changing your guardian’s email does not reset the count. After the third decline your account is scheduled for deletion. [COPY PENDING LEGAL REVIEW] | Guardian Consent decline page `5491:8241` (desktop) / `5501:8453` (mobile), static cap sentence |
| `apps/web/src/pages/signup/AgeGateStep.tsx` | Thanks for your interest. You need to be at least {…} years old to have a Soccernity account. [COPY PENDING LEGAL REVIEW] | Age Gate below-minimum-age `5464:7077` (mobile `5539:7314`), sub-heading |
| `apps/web/src/pages/signup/AgeGateStep.tsx` | Soccernity is built around real grassroots football. In the UK, youth football starts at around age 5–6. Below that, a profile wouldn’t reflect anything about you as a player yet — so we keep signups closed until then, no matter what a parent or guardian agrees to. [COPY PENDING LEGAL REVIEW] | Age Gate below-minimum-age `5464:7077` (mobile `5539:7314`), "Why there's an age limit" panel |
| `apps/web/src/pages/signup/AgeGateStep.tsx` | We ask everyone this when they join. Your date of birth is never shown on your profile. [COPY PENDING LEGAL REVIEW] | Age Gate `5108:6626` (mobile `5539:7264`), sub-heading (chip `6669:27179`) |
| `apps/web/src/pages/signup/AgeGateStep.tsx` | Some countries ask for an extra check when a guardian approves an account for a younger child. [COPY PENDING LEGAL REVIEW] | Age Gate `5108:6626` (mobile `5539:7264`), country hint |
| `apps/web/src/pages/signup/GuardianDetailsStep.tsx` | We only use this email address to request and record consent. [COPY PENDING LEGAL REVIEW] | Guardian Details Capture `5108:6627` (mobile `5539:7354`), fineprint `5111:6669` |
| `apps/web/src/pages/signup/RegisterStep.tsx` | Set when you signed up and cannot be changed here. [COPY PENDING LEGAL REVIEW] | Register `407:1051`, date of birth note `6627:22258` |
