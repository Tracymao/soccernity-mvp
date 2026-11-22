# Copy humanize: apps/admin (CH-B)

Branch `copy/humanize-admin`, cut from `origin/main` 5b63cfe. No open PR touched `apps/admin/src`. Scope: rendered text in `apps/admin/src`, the tests and Playwright specs that assert it, and one web string.

## Counts

- Source files read (non-test .ts/.tsx under `apps/admin/src`): 106. Searched all of them for em/en dashes, " -- ", contrast and filler phrasing (not just, rather than, crucial, robust, seamless, leverage, simply, actually and similar), and decorative arrows or emoji.
- Prose strings changed: 41 edits in 25 source files (dash replaced by a period, comma, colon or "to"; "Matchday Predictions, August"; range "1,102 to 1,346.89"; "Success screen (also a stub)" lost a trailing arrow).
- Already plain: everything else found by those searches. The only remaining dashes in source are lone "—" placeholders standing for "no value" (about 55 places, kept), and two code comments.
- No filler or contrast constructions were found in rendered text ("just now" and "There is nothing more to do here." are plain and were kept).

## Tagged strings

None of the 51 admin tagged places or their manifest rows contained a changed string, so no tag moved and no manifest row changed. Tagged places in the built output: 200 before and after (web 149, admin 51). `pendingCopyManifest.test.ts` 15/15. `npm run check:pending-copy` still fails by design.

## Left unchanged on purpose

- Lone "—" placeholders (empty cells, "no value").
- Back-link and range arrows (`← Contest`, `A → B` for dates and age tiers) and the "Settings › Roles" path: functional, as in CH-A.
- Curly apostrophes and quotes.
- Strings matched by code: none of the changed strings is compared in source. Matches only in tests (updated). API error codes are used, not wording. API copy shown in admin (for example "Entry withdrawn, guardian consent revoked") was not touched.
- Code comments (two comments still contain a dash).

## Web leftover

`GuardianConsentPage.tsx`: "Join the conversation in both, not just read it." became "Join the conversation in both and post your own messages." Untagged, no test or manifest row referenced it.

## Tests changed (text only)

Admin unit: articlesCategories, mediaReview, profileImageReview, contactEnquiries, holdControlsRestricted, holds, moderation, roomReactivation, suspensionAppealContext, guardianNotices, contest. Playwright specs (text only, not run): 22, 25, 54, 55.

## Verification

- apps/admin: `tsc --noEmit`, eslint, `npm run build` clean; vitest 64 files / 1,030 tests, all passing after two assertion fixes (first run 2 failed, both text).
- apps/web: `tsc --noEmit`, eslint, build clean; `GuardianConsentPage.test.tsx` 23/23.
- `docs/counsel-pack-check.py`: checks (a) to (d) PASS (248 items).
- Playwright: not run.
