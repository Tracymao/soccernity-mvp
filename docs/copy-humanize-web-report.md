# Copy humanize: apps/web (CH-A)

Branch `copy/humanize-web`, cut from `origin/main` 88f89fa. Scope: rendered text in `apps/web/src`, the tests that assert it, and the exact wording of two tagged manifest rows. No behaviour, prop, id, route, role or style changed.

## What changed

80 string edits in 46 source files (all 80 lines replaced one for one). Every change is a dash or contrast fix, meaning kept:

- Em dash, en dash and ` -- ` in rendered text replaced by a period, comma, colon or "to" (ranges such as "days 22 to 24", "5 to 6", "Showing 1 to 3 of 9").
- Score separators (en dash) became a plain hyphen ("2 - 1"), and notification text "2-1, result logged".
- Staged "X, Y" pairs split into two sentences where the dash introduced a second thought ("Hidden. Only you and the commenter can see this.").
- The long "More notification types ..." line lost its two dashes: "More notification types, such as mentions and deeper Bants and Contest activity, are on the way."

Per-area counts (edited lines): Settings pages 15, Community and post components 11, Grassroots 6, Leaderboard 6, Notification Centre 6, Contest 6, Sign-up and verify 6, Messages 2, Sports Hub 4, others 18.

## Tagged strings

Two tagged sentences changed (tag kept in the same place, no tag added or removed):

- `GuardianConsentConfirmPage.tsx`: "Please read this before you decide. It explains what the account can do and what we collect."
- `signup/AgeGateStep.tsx`: "around age 5 to 6 ... as a player yet, so we keep signups closed ..."

Matching manifest rows updated to the exact new text (rows for those two files). Counts: tagged places in the built output 200 before and after; manifest web rows 93 before and after. `pendingCopyManifest.test.ts` passes.

## Left unchanged on purpose

- Lone placeholder glyphs (a single "—" or "–" standing for "no value"): `rankChange.ts`, stat cells, `HomePage` score placeholder.
- Functional glyphs and emoji (arrows, check marks, play, ellipsis "…") and curly apostrophes and quotes (changing them is a typography decision, not copy).
- Code comments and test names (the brief says not to edit them to match).
- Strings code matches on: `GENERIC_CONSENT_REJECTION` and the other consent rejection strings in `api/auth.ts`; `isAwaitingConsent` and the guardian message matching in `pages/grassroots/errors.ts` and `pages/community/writeRefusal.tsx`; two-factor error codes (matched by `code`, not text). None of these contain dashes, so none needed edits. The ` -- ` string at `api/auth.ts` ("yet. Try again shortly.") is a user message, not a matched constant (checked with grep).
- No broader AI-pattern rewrite (contrast constructions, hedges) was applied beyond the lines above: the remaining copy was already short and plain, and rewording it risked meaning changes.

## Tests changed (text only)

Unit: Grassroots fixture and team pages, Guardian consent confirm, Notification Centre, banter filters, Final week carousel, PostCard (two files), PostMedia, ReportAction, CommunityMessages, messageActions. Playwright specs (text only, not run): 14, 16, 17, 18, 29, 32, 47, 50.

## Verification

- apps/web: `tsc --noEmit` clean, eslint clean, `npm run build` clean.
- vitest: 158 files / 2,050 tests, 2,049 passed on the final full run. One test (`ChangePasswordPage.test.tsx`) failed under load and passed alone (23/23); `noDeveloperNotes.test.ts` timed out once at 5 s under load in an earlier run and passed in the last.
- `npm run check:pending-copy` still fails by design (200 places).
- `docs/counsel-pack-check.py` passes checks (a) to (d). Manifest versus strings-sheet differences are expected for the two reworded rows and were not touched.
- `counsel-pack-check.py` is not run by any workflow under `.github`.
- Playwright: not run.
