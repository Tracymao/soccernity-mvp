# Social sign-in removed from apps/web (Decision Log #479)

Branch `frontend/fc-social-removal`, from `origin/main` `bbaddce`. `apps/web`, the pending-copy manifest, one e2e spec and this report only. `services/api`, `apps/admin`, Figma, every `.docx` and `docs/build-register.md` are untouched.

## Removed
- `apps/web/src/pages/social/` (SocialButtons, SocialCallbackPage, SocialSignupFlow, SocialScreen, social.css and their tests, incl. `LoginRegisterSocial.test.tsx`).
- `api/socialAuth.ts` + test, `lib/socialSignIn.ts` + test, `assets/social/{google,facebook}-logo.svg` (used only by SocialButtons).
- The `auth/social/:provider/callback` route and its `router.test.tsx` case.
- `<SocialButtons />` from `LoginPage.tsx` and `signup/RegisterStep.tsx` (header comments updated). Login and Register show only the platform's own forms.
- The `SocialSignupFlow` row in `docs/pending-copy-manifest.md`.
- `e2e/tests/33-b085-social-sign-in.spec.ts` (the only Playwright reference; specs 06/09/15 only use "social" in the sense of social writes, unchanged).

## Deliberately kept
- Footer social icons, blog share buttons, community "social" text, the GuardianConsent "Google" wording (search-engine indexing) and the font comments mentioning Google Fonts: unrelated.
- `LoginPage.css` one-column layout below 900px: it was added with B-085 but matches Figma Login mobile on its own; only the comment was reworded.
- The age gate, guardian details, register and verify-email flow: unchanged. No existing LoginPage/RegisterStep/SignupFlow test needed editing (none asserted social buttons).

## Verification (measured, `apps/web`)
- `tsc --noEmit`, `npm run lint`, `npm run build`: clean.
- vitest: 149 files / 1,884 tests, 0 failures (a first full run had one failure in a file-scanning test under load; the next two full runs and a solo re-run of it passed). Before-figure not re-measured on a clean main.
- Playwright not run (only the deleted spec 33 touched this feature).

## Not done (backend and docs still carry social, by scope)
`services/api/src/modules/social-auth`, `SocialIdentity` + migration `20261111090000`, the env variables, `docs/figma-b085-social-sign-in.md`, `docs/sprint-2-auth-social-signin-report.md` and the Figma frames of PR #639 remain; no register row owns their removal.

## Forward-pointer notes for the next docs PR (not edited here)
- B-085: web leg removed by this PR (Decision Log #479); mark "removed, superseded by #479".
- B-084: the web side no longer exists; backend removal still open.
- `docs/pending-copy-manifest.md` social row gone; register Section 32d/B-208 pending-copy collation should drop it.
- CLAUDE.md bullet for `frontend/b085-social-sign-in`: add a dated note that it is removed.
- Decision Log #470 / #479: note the web removal landed.
