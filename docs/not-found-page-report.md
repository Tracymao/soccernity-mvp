# 404 page: built from the founder-approved design (Decision Log #565)

Branch `feat/not-found-page`, from `origin/main` a41aec9. apps/web only, plus Decision Log #565, register Section 129 and two e2e assertions.

## Strings
Old: heading "Page not found", link "Back to home" (always `/`); PostPage: "Post not found. Back to Community".
New (Figma F-1 to F-4, character for character, curly apostrophe): "404" label (`<p aria-hidden="true">`), the only h1 "We can’t find that page", "The link may be wrong, or the page may have moved. Here are some places to go instead.", button link "Back to home", text links "Sports Hub" (/sports-hub) and "Contact us" (/contact). Nothing is tagged for legal review; the humanizer was not run. `pendingCopyManifest.test.ts` needs nothing (no tagged strings), and the counsel pack check is unaffected.

## Behaviour
"Back to home" is `/community` when `useAuth().accessToken` exists and `/` otherwise, from the in-memory session on render (no API call, no flash).

## Files
- `apps/web/src/pages/NotFoundPage.tsx` (rebuilt), `NotFoundPage.css` (new, 560px column, full-width button at 820px or less, existing tokens and fonts only), `NotFoundPage.test.tsx` (new, 5 tests).
- `PostPage.tsx`: the "not-found" branch renders `<NotFoundPage />`; "removed" and "error" unchanged.
- Tests updated for the new wording: `OtherProfilePage.test.tsx`, `OtherProfilePage.private.test.tsx`, `PostPage.test.tsx`, `removedContent.test.tsx`, `router.test.tsx`, `SettingsShell.test.tsx`; e2e `49-b060-public-profile.spec.ts` and `51-b289-content-removal-web.spec.ts` (assertions only, not run).
- `docs/Soccernity_MVP_Build_Plan_v1.7.docx` (row #565, dated note on #562), `docs/build-register.md` (Section 129, dated note on the #562 row).
- `router.tsx` unchanged.

## Layout finding
`AppShell` has no footer (header + padded `<main>` only). The splat route sits under `FooterLayout`, which adds the footer; `OtherProfilePage` and `PostPage` render inside `AppShell`, so they get no footer and none was added. The page is a single flex column with its own vertical padding and no height or overflow rules, so it adds no scroll area. Not looked at in a browser.

## Checks
`tsc --noEmit` clean; eslint clean; vitest 163 files / 2,113 tests, 0 failures (first run had 3 failures: two stale "Page not found" assertions fixed, one that did not recur); production build clean. Not run: Playwright, `apps/admin`, `services/api`, CI.

## Founder should look at on staging
Signed in and signed out, desktop and mobile, on an unknown URL (with footer); a missing or blocked profile (`/users/<unknown id>`); a post that does not exist (`/posts/<unknown id>`). Check the button target (/community vs /), spacing under the navbar, and that the page matches F-1 to F-4. Typography and spacing were built from the repo's tokens, not pixel-compared with the frames (Figma was not read in this session).
