# Backend W3d report: stale-decline lapse, resend verification, status fields, User Detail without DOB (B-126, B-128, B-131, B-129)

Branch `backend/w3d-decline-lapse-resend-summary`, from fresh `origin/main` (`34bb895`). `services/api` plus `render.yaml`, `.env.example` and docs. No frontend, no Figma, no `.docx` edited. Decisions: #406 (items 1, 3, 4, 11), #389, #395, #402, #403, #405. Read first: the #406 row, `docs/build-register.md` Section 22, `docs/backend-w3b-report.md`, `docs/backend-w4-username-report.md`, `docs/fc2-gates-routing-report.md`.

## 1. What was built

### (a) B-126: the stale-decline lapse

**What I found in the code (the brief asked me to confirm the mechanics).**

| Question | Finding |
|---|---|
| Does anything act on a row declined at decline 1 or 2? | No. `GuardianConsentExpirySweepService` selects `consentStatus = 'pending'` only; the 30-day deletion path starts only at the third decline, the second lapse or a withdrawal. Confirmed by reading both sweeps and `refuseConsentAndScheduleDeletion`. |
| Where do the 14 days start? | There was **no decline timestamp anywhere**: `consentTimestamp` is the approval time, `consentTokenExpiresAt` is the link expiry, `declineCount` is a counter. So the clock needed a column: `Guardian.consentDeclinedAt`. |
| Does the one automatic re-send and warning come first, or does the row go straight to the second-lapse outcome? | **The re-send comes first.** The unanswered-request path is staged so that no account is closed without the minor having been warned, and a declined row has had no email at all (the minor only saw the decline page inside the account). Going straight to closure would be the one route to deletion with no warning. So the row enters the existing path at its first stage. |
| Does an expiry count among the three declines? | No, and it still does not: only `reason === 'declined'` increments `declineCount` (`refuseConsentAndScheduleDeletion`), and the new sweep never touches the counter. Proven in the e2e chain test (counter 1 before the chase, 1 after the account closes). |

**What the new `GuardianStaleDeclineSweepService` does** (hourly, like the expiry sweep, because the stages chain). A row is selected when it is `declined`, `consentDeclineSource = guardian_explicit`, `declineCount < 3`, `consentDeclinedAt <= now - GUARDIAN_DECLINE_LAPSE_DAYS` (default 14), and its user is a minor with `accountStatus = 'active'`. For each:

1. `GuardianConsentService.reissueConsentToken({ reopenDeclined: true, markAutoResent: true })`: the same reopen the minor's own resend performs (so token rotation and the email to the guardian are not copied), plus `consentAutoResentAt` stamped so the chase is spent. The status becomes `pending` with a fresh token and expiry.
2. The minor is emailed `sendConsentDeclineLapseReminderEmail` (below).
3. When that new request lapses, the **existing** expiry sweep sees `consentAutoResentAt` set and goes straight to `refuseConsentAndScheduleDeletion('expired')`: `pending_deletion` with the ordinary 30-day grace. About 14 days + 72 hours + the grace; no new account state is invented.

`reissueConsentToken` now returns `boolean` (false = the reopen lost a race and nothing was sent) so the sweep never warns about an email that did not go. Its reopen branch now honours `markAutoResent` (it did not before, because the minor's own reopen never spends the chase).

**New email template** `guardian-consent-decline-lapse-reminder`, `[COPY PENDING LEGAL REVIEW]`, plain functional wording. I did **not** reuse `guardian-consent-reminder`: it says "the first request has now expired", which would be untrue here (the guardian answered). No decline count appears. Listed in `docs/pending-copy-manifest.md` as an OPEN `services/api` bullet (B-124's scope stays web and admin).

**Config:** `GUARDIAN_DECLINE_LAPSE_DAYS`, default 14; a missing, non-numeric or non-positive value falls back to 14. Added to `.env.example` and to both services in `render.yaml` (the `env-completeness` spec fails the build otherwise).

### (b) B-128: resend verification email

`POST /auth/resend-verification-email` `{ email }`, in `RegistrationController`; logic in `ResendVerificationService`.

- **Unauthenticated and keyed by email**, like forgot-password and the guardian resend. That serves a signed-in unverified user on `/verify-email/prompt` and one who lost the session; it is also the only shape for which "non-enumerating" is meaningful. Who may call it was open in the register; this is the answer, flagged in section 5.
- **ONE response for every outcome:** `200 { message }` with the same body whether the address is unknown, already verified, closed (deactivated, suspended, `pending_deletion`, `deleted`), over the cap, or sent. Proven by comparing bodies across all four at the HTTP layer and against real Postgres/Redis.
- **Rate limiting, two layers:** `@AuthRateLimit()` (5 per 60 s per IP) and a per-account cap of **3 per hour** (`ResendVerificationLimiter`, Redis `INCR` + `EXPIRE`, fixed window). Over the cap the endpoint stays **silent**, not 429: a 429 only an existing unverified account could trigger would reveal that account.
- **It sends** a fresh single-use link through the existing `sendVerificationEmail` (B-016 link, existing template). The e2e test takes the token the real store issued and posts it to `/auth/verify-email`: the account becomes verified, and replaying it is a 400.
- **Earlier links are not revoked.** The token store is keyed by token and has no per-user index; the cap bounds how many are live (3 per hour, each valid 48 h). Revoking would need a store change, not done here.
- **Timing:** the sending path does a Redis write and a token issue the no-match path does not. Not padded, consistent with forgot-password and Decision Log #350.

### (c) B-131: the status response

`GET /auth/guardian-consent/status` (the minor's, JWT) adds:

- `guardianFirstName`: the first whitespace-separated word of `Guardian.name`. `Guardian.name` is a single full-name field (Option A, #393), so this is an approximation: "Dr Mary Smith" gives "Dr". `null` only for a blank name, which registration does not allow.
- `lastDecisionAt`: the later of `consentTimestamp` and the new `consentDeclinedAt`, so approval, decline and withdrawal are all covered. `null` while undecided. After a reopen it still names the last decision (the decline) until a new one is made.

The decline count is not returned, directly or by any key (asserted by key list, by serialised-JSON search, and at the HTTP layer against real rows). The shared `getConsentStatusForUser` is also what `POST /auth/verify-email` reads, which only uses `consentStatus`, so that response is unchanged. Which response the founder meant was not stated; I chose the minor's status response (the register's own reading).

### (d) B-129: `GET /admin/users/:id/summary`

User Detail without the date of birth and **without the age tier** (it is derived from the DOB; `isMinor` and `isUnder16` stay, as the existing response already carried them). The DOB column is **never selected**, so nothing is decrypted and **no `user.dob_viewed` row is written**, however many times it is read. Same class-level guards as the controller (moderator, superadmin). `GET /admin/users/:id` is unchanged and stays for the correction form, still audited. The open question "how does the form get the current DOB, and is that read audited" is answered: from the existing endpoint, audited like `user.dob_viewed`.

Both reads share one explicit `select` allow-list and one field-by-field mapper (`toSummary`), so a column added later cannot reach the payload by accident and the DOB ciphertext on the detail row cannot ride along.

### (e) B-129: the reason check

`POST /admin/users/:id/dob-correction` rejects a `reason` containing a date-shaped string with `400 { code: "reason_contains_date", message }`, **before any database work** (a refused call reads and writes nothing; proven by `$transaction` not being called, and in e2e by the DOB, flags and audit log being untouched).

What it catches (`reason-date-check.util.ts`): numeric dates with separators (`2010-03-04`, `2010/3/4`, `04/03/2010`, `4.3.10`, with an ISO time suffix), eight-digit dates (`20100304`, `04032010`), month names beside a day (`4 March`, `4th of March`, `March 4`, `Mar 4th`) or a year (`March 2010`, `2010 March`). Case and spacing do not matter.

What it **does not** catch, stated plainly (also in the util and the module README): a bare four-digit year ("born in 2010"), a date spelled out in words, a date in another script, a deliberately obfuscated date. Free text cannot be proven free of every date form; this is a floor. It errs towards false positives (a version number such as `1.2.34`, or "it may 10 ..."): the cost is rewording a sentence, the cost of a miss is a DOB in a long-lived audit log. Rejecting every 19xx/20xx was considered and rejected (ticket numbers, years of incidents).

## 2. Migrations (additive only)

`20261018120000_add_guardian_consent_declined_at`:

1. `ALTER TABLE "Guardian" ADD COLUMN "consentDeclinedAt" TIMESTAMP(3)` (nullable, no default).
2. `CREATE INDEX "Guardian_consentStatus_consentDeclinedAt_idx" ON "Guardian"("consentStatus", "consentDeclinedAt")`.
3. A data backfill (not a schema change): rows that are still **reopenable** (explicit decline, fewer than three recorded) are stamped `NOW()`, because their original decline time is not recoverable and a NULL would mean the window never starts. Every other declined row (withdrawal, expiry, third decline) is on the deletion path and stays NULL. Effect on live behaviour at deploy: such a row (an account moved back to `active` after a decline) gets the full 14 days from deploy.

No column is dropped or altered. `prisma migrate diff` against the migrated test database: no drift (the e2e `global-setup` applied it to `soccernity_test`).

Writers of `consentDeclinedAt`: `recordNonFinalDecline` (decline 1, 2) and `refuseConsentAndScheduleDeletion` (decline 3, withdrawal, expiry). Kept when a row is reopened (so `lastDecisionAt` stays meaningful); overwritten by the next decline; **cleared by a DOB-correction restart** (the request it described no longer exists, matching the evidence already wiped there).

## 3. Tests

| Layer | Before | After |
|---|---|---|
| Mocked unit (`npx jest --maxWorkers=4`) | 143 suites / 2,321 tests (the last recorded figure, from `docs/backend-w4-username-report.md`; **not re-measured** on clean `main`, derived: 2,321 + the 112 tests added here = 2,433, and 143 + 4 new suites = 147, which matches the measured after-figure exactly) | 147 suites / 2,433 tests, 0 failures |
| e2e (real Postgres/Redis, `npm run test:e2e`) | 46 suites / 507 tests (last recorded figure, `docs/backend-w4-username-report.md`; **not re-measured**; 46 + 2 new suites = 48 and 507 + 16 new tests = 523, matching the after-figure) | 48 suites / 523 tests, 0 failures (run in band, one pass) |

`tsc --noEmit`, `eslint "src/**/*.ts"`, `nest build`: clean.

New unit suites: `guardian-consent-w3d.service.spec.ts` (first-name rule, `lastDecisionAt` for approve / decline / withdraw / reopen / approve-after-decline, counter never exposed, `consentDeclinedAt` stamped on decline 1, 3, withdrawal and expiry, reopen mode spends the chase and returns false on a lost race), `guardian-stale-decline-sweep.service.spec.ts` (the window boundary at exactly 14 days and one day short, configurable window and junk fallback, which rows are selected and which never are, what is done to a stale row, a lost race sends no warning, a failed email does not undo the reopen, one bad row does not stop the rest, a second run finds nothing), `resend-verification.service.spec.ts` (service and limiter), `reason-date-check.util.spec.ts` (30 date forms rejected, 12 ordinary reasons accepted). Extended: `admin-user-detail.service.spec.ts` (summary), `admin-user-dob-correction.service.spec.ts` (date reasons), `admin-users.controller.http.spec.ts` (route, role gate, the two reads never cross), `registration.controller.spec.ts` (route, byte-identical responses, whitelist, rate-limit guard present), `registration-email.service.spec.ts` (the new template).

New e2e: `guardian-stale-decline.e2e-spec.ts` (5 tests: the whole chain decline -> +14 days -> chased -> old link dead -> new request lapses -> existing expiry sweep closes the account with the counter still 1; which rows a real engine selects out of eleven kinds of row, with every other row byte-identical afterwards; a minor who reopens in time is left alone and that reopen does not spend the chase; `lastDecisionAt` for approved / withdrawn / undecided; the column and index exist), `resend-verification.e2e-spec.ts` (3 tests: a real token verifies the account and is single-use; the 3-per-hour cap with an identical fourth response; one body for an unverified, unknown, verified and closing account, sending only for the first). Extended: `admin-user-detail-dob-correction.e2e-spec.ts` (summary: no DOB, no tier, no ciphertext, no tokens, zero audit rows, editor refused; date reasons refused with nothing changed; an ordinary reason still succeeds and the audit row holds no DOB).

Rules and their proof: window boundary (unit, exactly 14 days vs one day short); expiry never counts (e2e chain); third-decline / withdrawal / expiry rows never chased (unit and e2e); adult and non-active accounts never chased (unit; in e2e the reopen's own WHERE also refuses them, so the sweep's filter and the reopen guard are two independent layers, checked by removing the sweep's filter and observing the e2e still passing for that reason); no decline count in any response; summary writes no audit row; reason refused before any read.

## 4. Files

New: migration, `guardian-stale-decline-sweep.service.ts`, `registration/email-verification/resend-verification.{service,limiter}.ts`, `registration/dto/resend-verification.dto.ts`, `admin-users/reason-date-check.util.ts`, four new unit spec files and two e2e files. Changed: `schema.prisma`, `guardian-consent.service.ts` (+ module, constants), `registration-email.service.ts`, `registration.controller.ts` / `.module.ts`, `admin-user-detail.service.ts`, `admin-user-dob-correction.service.ts`, `admin-users.controller.ts`, three module READMEs, `render.yaml`, `.env.example`, `docs/pending-copy-manifest.md`, `docs/build-register.md`, `CLAUDE.md`. Existing specs changed only for the new response fields and the new constructor argument (no behaviour encoded in them was wrong).

## 5. Judgment calls (adopted defaults, all veto-able)

1. **The lapse enters the unanswered path at stage 1** (re-send and warning first), not at the closure stage. Consequence to know: a guardian who actively declined receives a new consent request from the platform. The minor can already trigger exactly that by pressing resend, and the cap of three declines bounds it, but the platform now does it unprompted. If the founder prefers that a guardian who said no is never contacted again, the alternative is to warn the minor and close at the end of a further window without re-sending; that is a change in one place (`GuardianStaleDeclineSweepService`).
2. **The window is measured from the decline**, not from the last time the minor logged in or visited the decline page. A minor who looks at the page daily but does nothing is still lapsed.
3. **`GUARDIAN_DECLINE_LAPSE_DAYS` is read on every sweep** and applies to all rows from then on; changing it mid-flight moves every open row's deadline.
4. **Resend verification is email-keyed and unauthenticated** (not JWT), silent over the cap, and does not revoke earlier links.
5. **The per-account cap is 3 per hour**, a judgment call (the founder gave no number).
6. **The summary omits the age tier**, not only the DOB, because the tier is a coarse function of it.
7. **First name = first word** of the single full-name field.
8. **`lastDecisionAt` keeps the decline after a reopen**, rather than going `null` when a request is pending again.
9. **A DOB-correction restart clears `consentDeclinedAt`**, with the other wiped evidence.
10. **The reason check errs towards false positives** and does not reject a bare year.

## 6. Open / not built

- **Frontend, all of it:** the resend button on `/verify-email/prompt`; `apps/admin` switching User Detail to `/summary` and loading the DOB only on the correction form (and showing the `reason_contains_date` error); the screens that show `guardianFirstName` and `lastDecisionAt`; the `GuardianConsentPage` decline copy.
- **The new email's wording is functional, not counsel-reviewed.** Also the existing `guardian-consent-expired` email says "did not respond to either approval request"; after a decline-then-lapse the guardian did respond to the first. Left as is (flagged here, not in scope).
- **Legal copy v0.8 Part 4.4 and the DPIA are not edited**; the cap, the DOB correction and now the 14-day lapse are all still unmentioned there. Counsel to review.
- **Earlier verification links stay live** (see section 1b).
- **A row declined at 1 or 2 whose minor account is not `active`** (deactivated, suspended) is never chased; it is not on the deletion path either. Same class as the original gap, much smaller; not addressed.
- The `verify-email` response does not carry the new status fields.

## 7. Decision Log forward-pointer notes (docx NOT edited)

- **#406 item 1**: built (B-126). Mechanics confirmed: the 14 days start at the new `Guardian.consentDeclinedAt`; the automatic re-send and the minor's warning come first; an expiry does not count among the three declines. Legal copy v0.8 Part 4.4 not edited, counsel still to review.
- **#406 item 3**: built (B-128). Unauthenticated, email-keyed, 5 / 60 s per IP plus 3 per hour per account, silent over the cap, one response for every outcome.
- **#406 item 4**: built (B-129). `GET /admin/users/:id/summary` without the DOB and without an audit row; the correction form reads the DOB from the existing audited endpoint; the server rejects a reason containing a date-shaped string.
- **#406 item 11**: built (B-131). `guardianFirstName` and `lastDecisionAt` on the minor's status response; a column was needed (`consentDeclinedAt`); the count is never returned.
- **#389 / #395 / #402**: a row declined at 1 or 2 and not reopened within 14 days is now chased and may end in closure; closure by this route is an expiry, so it is not a fourth decline.
- **#405 item 5** (amended by #406 item 4): User Detail no longer needs to show the DOB; `dob_viewed` is written only by the full read.
- **#337-#340**: the unanswered-request path now has a second entry (a stale decline).
- **Section 9 numbering:** #293 and #294 remain absent, as before.

## 8. Register status lines

Appended to the Spec-status cell of **B-126**, **B-128**, **B-129** and **B-131** in `docs/build-register.md` (original text unchanged), plus a short Section 23. 139 B-IDs and 146 gap frames unchanged.
