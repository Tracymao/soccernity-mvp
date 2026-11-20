# W9: activation and guardian pages (B-077, B-078, B-079, B-169, B-176)

Branch `frontend/w9-activation-guardian-pages`. Date 2026-11-05. `apps/web`, one pair of `services/api` consent-version files (as the brief requires), `docs/pending-copy-manifest.md`, one Playwright spec. Figma, `apps/admin`, the Build Plan docx and `docs/build-register.md` untouched.

Prerequisites checked first: Decision Log #468 (PR #630) and the Figma W9 pass (`docs/figma-w9-header-initials-activation.md`, PR #631) are on `origin/main`.

## 1. What was built, by row

| Row | Frame(s) | Result |
|---|---|---|
| B-077 | `5108:6631` / `5531:7544` | The "Continue registration" button already read correctly (FC3a, and it goes to `/continue`, which asks the server for the next step, rather than hard-coding Create Profile, B-125). **"Review privacy settings" was a disabled "Coming soon" button; it is now an enabled link to `/settings/privacy`**, as the updated frames draw. |
| B-078 / B-176 | `5108:6629` / `5531:7626` | The request-time page is **one centred bordered card**: eyebrow, heading **personalised with the account holder's first name** ("Do you give permission for Ade to use Soccernity?"), intro, summary panel, "What {name} will be able to do", the **new "What we collect" list (four rows)**, "What stays switched off" (personalised), the checkbox, actions and footnote. The route moved under `AuthChrome` (the logo-only Top Bar), like the guardian withdrawal page: a guardian has no account, and the frame draws no site navigation. |
| B-079 | `5488:7164` / `5501:8225` | The guardian's approved screen is rebuilt: icon, **"Thank you — {name} can continue"**, "Recorded on {date}. {name} can now continue registration, with under-18 protections in place.", a "What happens next" card (three rows; the second links "guardian withdrawal page" to `/guardian-consent/withdraw`), and a **Done** button (to `/`). |
| B-079 | `5488:7248` / `5501:8342` | The minor's **"New request sent" is a screen** (heading, the guardian's email, the "What happens next" card with a "Change guardian email" link, "Back to my account"), replacing the old inline footnote. It also appears after a resend from the decline view (once the reopened, pending status is read). |
| B-169 | confirm page, post-decline state | **Already built by FC4 (PR #435)**: the clause "so it stays switched off" is tagged, has its manifest row, and the version was bumped then. Verified in the code and the manifest; nothing more to do. |

## 2. One consent-version bump

`CONSENT_SCREEN_VERSION` **v7 -> v8**, `CONSENT_SCREEN_TEXT_HASH` updated once (`39c309d6...`), as #348 requires. Text that changed on `GuardianConsentConfirmPage.tsx` (all of it guardian-visible):

- the heading and intro are personalised (new wording, tagged);
- new "What we collect" section, four rows (tagged);
- "What {name} will be able to do" and the two personalised "stays switched off" rows;
- the approved screen: heading, "Recorded on" sentence, three "What happens next" rows, Done (all but the heading and the row titles are tagged).

The minor's "New request sent" screen lives in `GuardianConsentPage.tsx`, which the tripwire does not hash; it carries its own tags and manifest rows.

**A real catch by the tripwire's design (and my first draft got it wrong):** the hash extractor reads only JSX text and strings in *top-level* `const`s. My first cut put the new lists inside functions, which would have silently dropped that wording from the hash. They are top-level constants now (with `{name}` / `{possessive}` placeholders filled at render time), and the tripwire spec gained assertions that the new wording is inside the hash. Its old assertion for the heading ("whattheaccountholderwillbeabletodo") no longer applies because the heading is personalised; it now checks the fixed words.

## 3. Tags and manifest

Every new guardian- or minor-facing **sentence** carries `[COPY PENDING LEGAL REVIEW]` in source and has a row in `docs/pending-copy-manifest.md`: 13 rows added, 1 removed (the old "Your approval has been recorded..." sentence). Short titles and button labels are not tagged (the convention since FC3a). The frames tag only some of these sentences; per the brief, all new ones are tagged here. The pending-copy inventory test passes (15/15). `npm run check:pending-copy` still fails by design (B-124).

## 4. Where a frame and the server differ (not built around)

1. **"The new link is valid for 3 days"** (frame `5488:7248`, second sentence of the "New request sent" sub-heading). The resend response is `{ message }` and the status carries no expiry; the lifetime is server configuration. The sentence is **left out**, not hard-coded. If wanted, the backend must return the lifetime (or the new `expiresAt`).
2. **Guardian's first name for the heading.** The request summary already returns `minorName`, so no server change was needed; the heading uses its first word. Without a summary (invalid link, lookup failed) it falls back to "this account" / "the account holder".
3. **"Recorded on {date}"** (approved screen): the confirm response carries no date, so the date of the successful call (the browser's date) is shown.
4. **The frame's Done button** has no destination (the guardian has no account). It goes to `/`. Flagged for design: it could also be "close this window", which a page cannot reliably do.
5. **"Back to my account"** (resent screen) has no frame destination. It returns to the status page. Whether it should go elsewhere is open.
6. **"Your email on their profile" section** is not in frame `5108:6629` as a section (the frame shows the same fact as one line in the summary panel). The page keeps it: it widens what a guardian consents to (`safeguarding/guardian-contact-public-visibility`, legal copy Part C row 32), and removing it would be a loss of disclosure that the founder did not ask for.
7. **The activation page names the guardian by first name** ("Sarah approved..."), the frame draws "Sarah Bello". Decision Log #406 item 11 / B-131 chose first name (the single full-name field is split by first word). Not changed.
8. **Counsel tension to read:** the new "Kept only to record that you gave consent, and to contact you about it" row sits beside "Your email on their profile", which says the guardian's email appears on the account holder's profile. Both are in the frames. Recorded in the manifest row.

## 5. Tests

- `GuardianConsentConfirmPage.test.tsx`: +9 (layout, personalised heading and fallback, section order and the four tagged rows, labelled regions, the approved screen, its links and tags, no-summary fallback); one test rewritten.
- `GuardianConsentPage.test.tsx`: +6 (the enabled privacy link, the resent screen, its link and "Back to my account", resend after decline, a failed resend keeps the status page).
- `router.test.tsx`: +2 (the confirm route sits under the logo-only Top Bar; `/guardian-consent` still sits under the site Header).
- `consent-screen-version.spec.ts` (services/api): version `v8`, plus assertions that the new wording is inside the hash.
- Playwright: new `e2e/tests/32-w9-activation-guardian-pages.spec.ts` (real Chrome, real API, Postgres, Redis): **8 passed / 0 failed** (the guardian request page at desktop and 390 px, keyboard order, consent and the approved screen, the minor's resend screen, and the activation links; the consent version `v8` is read back from the database); `04-guardian-decline-x3.spec.ts` was edited (not run): its D-03 test asserted the old inline "sent a new approval email" line and the pending test id after a resend, both of which the new screen replaces.

## 6. Follow-ups, fixed nothing outside the brief

- Figma: the mobile twins (`5531:7626`, `5501:8225`, `5501:8342`, `5531:7544`) were not read; the page reuses the desktop structure and a 390 px check is in the new Playwright spec.
- Figma: the activation frame draws a "Top Bar — Minor Account (Active)"; the page sits under the site Header.
- Backend: the resend response could carry the link lifetime (point 1).
- `e2e/tests/02`, `05`, `09` assert the heading name `Thank you` (substring match), which the new heading still satisfies; they were not run.

## 7. Verification (measured; baseline taken with my changes stashed)

| Check | Before (clean `origin/main`) | After |
|---|---|---|
| `apps/web` `tsc --noEmit` | clean | clean |
| `apps/web` `npm run lint` | clean | clean |
| `apps/web` `npm run build` | not taken | clean |
| `apps/web` vitest | 114 files / 1,310 tests | 114 files / 1,327 tests, 0 failures |
| pending-copy inventory test | 15/15 (inside the full run) | 15/15 |
| `services/api` `consent-screen-version.spec.ts` | not taken | 7/7 at v8 |
| Playwright spec 32 | did not exist | 8/8 |

**Not run:** all other Playwright specs (including `04`, `02`, `05`, `09`, which touch these pages), `apps/admin`, the other `services/api` suites.
