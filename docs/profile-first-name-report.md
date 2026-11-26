# CH-H12: own profile shows the first name; email moves to Edit Profile

Decision Log #576, register B-333 (W9), Section 146. Web only, code-only (no Figma change).

## What changed
- `apps/web/src/pages/ProfilePage.tsx`: the email line under the username is gone. The same `profile-header__meta` paragraph now shows the first name (`splitDisplayName(profile.displayName).firstName`), and renders nothing when the first name is empty. "Member since" is unchanged. The stale comment is replaced by one citing Decision Log #576.
- `apps/web/src/pages/profile/EditProfileModal.tsx`: new read-only Email field between Username and Phone, same pattern as Date of Birth (`id="edit-profile-email"`, `readOnly`, `aria-readonly="true"`, value `user.email`), with a hint that it can't be edited here and a "Change email" link to `/settings/account/information/change-email`. Email is never in the PATCH body (the payload is built only from the editable fields).

## Files touched
ProfilePage.tsx, ProfilePage.test.tsx, EditProfileModal.tsx, EditProfileModal.test.tsx, docs/Soccernity_MVP_Build_Plan_v1.7.docx (one new row), docs/build-register.md, this report.

## Tests
- ProfilePage: first name shown, email text absent, no empty meta line for an empty display name.
- EditProfileModal: Email field present, read-only, shows the email, link href correct, PATCH body has no email.
- Existing tests unchanged in intent.

## Results (measured)
- eslint on touched files and `tsc --noEmit`: clean.
- apps/web full vitest: 166 files / 2,228 tests, 0 failures.
- `npm run build:release` from the repo root: exit 0, `check:pending-copy` OK.
- Real Chrome (Playwright, built dist served with SPA fallback, API answered by route interception, unsigned JWT-shaped token from refresh), screenshots kept outside the repo:
  - desktop 1280: meta lines "Adeniyi", "Member since January 2026"; email text not in the page; no horizontal overflow.
  - 390 px: same, no horizontal overflow.
  - one-word display name ("Pele"): shows "Pele". Empty display name: only "Member since", no empty line.
  - Edit Profile: Email field visible, readonly, aria-readonly true, shows the email; "Change email" navigates to /settings/account/information/change-email.

## Decisions not spelled out
- Decision Log number: the docx table's highest was #573 and register Section 7 ended at #573, but #574 and #575 already appear in register prose (Sections 142 and 145), so this is #576. Please confirm.
- The hint text wording ("This address can't be edited here.") and the first name being taken from `displayName` (not the username-based public name) are my choices.
- Not run: Playwright e2e suite, apps/admin and services/api suites, CI.
