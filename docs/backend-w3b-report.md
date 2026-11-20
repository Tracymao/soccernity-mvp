# Backend W3b report: decline cap, DOB correction, admin user detail (B-110, B-102, B-103, B-109)

Branch `backend/w3b-decline-cap-dob-correction`, from fresh `origin/main` (`949f56b`). `services/api` plus docs only. No frontend, no Figma, no `.docx` edited. Decisions: #337-#340, #365, #372, #374, #375, #389, #390, #395, #398, #402, #403.

## 1. What was built

### B-110 + B-102: the guardian decline cap

- **`Guardian.declineCount`**: internal counter, `Int NOT NULL DEFAULT 0`. No API returns it (the status response gained no field; the admin read does not select it).
- **Declines 1 and 2** (`GuardianConsentService.recordNonFinalDecline`): the row becomes `declined` (`consentDeclineSource = guardian_explicit`), the counter goes up by one, and nothing else happens: the account stays `active`, sessions stay valid, login works, no deletion clock, no email. The write pins the counter value it read, so two concurrent clicks count once; a repeat click on the same link is a no-op.
- **Reopening**: `POST /auth/guardian-consent/resend` and `POST /auth/guardian-consent/change-guardian-email` accept a `declined` row only if it is an explicit decline with fewer than three recorded (`isReopenableDecline`) and the account is an `active` minor's. They reopen it as `pending` with a fresh token and expiry and clear `consentDeclineSource`. A withdrawal row, an expiry row and the third decline are never reopenable. `canResend` in the status response is true for a reopenable row.
- **Decline 3**, any time (three in one day included): `refuseConsentAndScheduleDeletion` (unchanged apart from incrementing the counter for the `declined` reason). Login is blocked at once, sessions revoked, `pending_deletion` with the existing 30-day grace, and the minor gets one email (`sendConsentDeclinedEmail`, wording rewritten for the cap, `[COPY PENDING LEGAL REVIEW]`).
- **Does not count**: expiry, the second lapse, post-approval withdrawal. **Not reset**: changing the guardian email. **Reset**: only a B-103 restart. No per-day cap, no do-not-contact option.

### B-103: `POST /admin/users/:id/dob-correction`

Moderator and superadmin. Body `dateOfBirth`, `reason` (10-500 chars, required), optional `guardian` (name, email, relationship). One transaction:

1. `isPlausibleDateOfBirth` (the registration check); `isMinor` / `isUnder16` recomputed with the registration functions; card-verification policy re-run against the user's derived country.
2. Age tier before/after (`under_13`, `under_16`, `under_18`, `adult`, new `age-tier.util.ts`). If it changed: to adult, an open request is cancelled (token replaced and expired, row and history kept); to a minor tier, the request is restarted (fresh token and expiry, `pending`, decline counter reset, card progress wiped, `cardVerificationRequired` re-decided, consent email sent). An adult account becoming a minor needs `guardian` in the body (nobody to ask otherwise) and gets a new Guardian row.
3. The incorrect-details flag is cleared on every correction.
4. Audit row `user.dob_corrected` written in the same transaction: admin, target, reason, old tier, new tier, timestamp (`createdAt`), plus outcome categories. Never a DOB value; the response does not echo either date.
5. Optimistic lock on the stored ciphertext, so two concurrent corrections cannot both win.

### B-109: `GET /admin/users/:id`

Moderator and superadmin. Returns the user, age tier, safeguarding country and a guardian summary, with the DOB decrypted server-side only. A `user.dob_viewed` row (admin, target, no notes) is written for every response that contains a DOB, repeat reads included; the DOB is decrypted first, the audit row second, the response last, so a failed audit write fails the request and no DOB leaves the server. Explicit `select`: no password hash, consent/withdrawal token, Stripe reference or decline counter can appear. Declared after the literal-path GETs so it does not shadow them.

## 2. Migrations (additive only)

`20261017140000_add_guardian_decline_count`: one `ALTER TABLE "Guardian" ADD COLUMN "declineCount" INTEGER NOT NULL DEFAULT 0`, one `CHECK ("declineCount" >= 0)`, and a data backfill setting 1 where `consentStatus = 'declined' AND consentDeclineSource = 'guardian_explicit'` (those rows were declined once under the old terminal rule). No column dropped or altered. `prisma migrate diff` against the migrated test database: no difference.

## 3. Tests

| Layer | Before | After |
|---|---|---|
| Mocked unit | 132 suites / 2,059 tests, 0 failures | 136 suites / 2,135 tests, 0 failures |
| e2e (real Postgres, `npm run test:e2e`) | 42 suites / 431 tests (last recorded figure on `main`, not re-run before the change) | 44 suites / 455 tests, 0 failures |

Unit baseline measured on clean `main` with my work stashed: 131 suites passed plus `clubs.controller.http.spec.ts`, whose worker ran out of memory under full-suite load and passes alone (21 tests). New: `age-tier.util.spec.ts` (+8 cases), `guardian-consent-decline-cap.service.spec.ts` (27), `admin-user-detail.service.spec.ts` (8), `admin-user-dob-correction.service.spec.ts` (20, including the audit-content checks), +13 controller cases in `admin-users.controller.http.spec.ts`. New e2e: `guardian-decline-cap.e2e-spec.ts` (10), `admin-user-detail-dob-correction.e2e-spec.ts` (14). Run with `--maxWorkers=4` as in the W1-W3 reports. `tsc --noEmit`, `eslint "src/**/*.ts"`, `nest build`: clean.

Rules and their proof: sessions survive decline 1 (real refresh token still refreshes, real login works); third decline revokes the session, blocks a real login and the existing sweep then respects the 30-day grace; three declines in one day; concurrent double decline counts once; expiry and withdrawal do not count; change-guardian-email does not reset the counter; no response contains the counter; DOB audit row per response and fail-closed; correction is atomic (a refused restart leaves user, guardian and audit log untouched); the age-reclassification sweep finds nothing to fix afterwards.

Existing tests changed (the old behaviour was encoded in them, no product bug): `guardian-consent-refusal.service.spec.ts` harness (default `declineCount: 2`, `{ increment }` support), `guardian-consent-refusal.e2e-spec.ts` first test (seeds two earlier declines), `admin-users.controller.http.spec.ts` (new providers).

## 4. Files

New: `guardian-decline-cap.constants.ts`, `age-tier.util.ts` (+spec), `admin-user-detail.service.ts`, `admin-user-dob-correction.service.ts`, `dto/correct-dob.dto.ts`, migration, three specs and two e2e specs. Changed: `guardian-consent.service.ts`, `registration-email.service.ts` (template copy), `admin-users.controller.ts` / `.module.ts`, `admin-action-log.constants.ts` (two actions), `schema.prisma`, module READMEs, `docs/build-register.md`, `CLAUDE.md`.

## 5. Judgment calls (adopted defaults, all veto-able)

1. **No email on declines 1 and 2.** The brief specifies an email only for the third. The minor sees the decline page in the account.
2. **Confirmed consent is kept on a minor-to-minor correction** unless the account was an adult or the corrected age newly needs the card step the guardian never completed. #395 B4 speaks only of an "in-flight" request.
3. **An account on the deletion path** gets its DOB corrected but no request is cancelled or restarted.
4. **Moderator and superadmin** may read and correct a DOB (the register left the role open).
5. **Resend stays the existing email-keyed route**, not JWT: #402 says "existing authenticated resend", but the only resend route is unauthenticated by email. Behaviour unchanged for pending rows.
6. **Restart wipes the earlier consent evidence** (timestamp, screen version, device, method) because it was given on wrong age facts.
7. The safeguarding country is shown to support in the user detail (it decides card verification for under-13s).
8. The `reason` field can hold anything an admin types; the form must tell admins not to enter either date.

## 6. Open / not built

- **Frontend**: `GuardianConsentPage` still treats `declined` as pending (audit s5 item 5), the in-account decline page and frames 5491:8241 / 5501:8453 are not wired; the User Detail screen and DOB form in `apps/admin` (B-104) are not built.
- **A row declined at 1 or 2 that the minor never resends has no expiry** and nothing reminds them. Same class as the existing open item about restricted-pending accounts with no retention rule.
- Legal copy and DPIA do not yet mention the cap or the DOB correction (Part C row 44, row 22). The rewritten decline email is functional wording, not counsel-reviewed.
- An unrefunded card charge blocks a restart (409), as it does for change-guardian-email; support must retry later.

## 7. Decision Log forward-pointer notes (docx NOT edited)

- **#389**: backend built (B-102): counter, declines 1-2 non-final, third final.
- **#395 B1/B2/B4**: built in backend; B1's login-result design stays withdrawn (#402); B4 built as B-103 (cancel/restart, counter reset).
- **#402 items 1 and 2**: built in backend (sessions valid between declines; third decline blocks login at once with the 30-day grace).
- **#403 items 2 and 15**: counter internal and never returned (item 2); a DOB-correction restart resets it with an audit entry (item 15).
- **#390**: built (B-103). **#398 D4**: `GET /admin/users/:id` built (B-109).
- **#337-#340 / #365**: a decline is no longer terminal for declines 1 and 2; change-guardian-email now also accepts a reopenable declined row.
- **#372**: the incorrect-details flag is also cleared by a DOB correction.
- **#375**: unchanged; the third decline reuses the 30-day grace.
- **#344/#375-style open item** to add: declined-at-1-or-2 rows have no expiry.

## 8. Register status lines

Appended to the Spec-status cell of B-110, B-102, B-103 and B-109 in `docs/build-register.md` (original text unchanged), plus a short Section 17. 123 B-IDs and 146 gap frames unchanged.
