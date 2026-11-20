# Email change (build register B-059, Decision Log #472 adopted default (f))

Backend only. Until this module, no code path changed `User.email`. It is a safeguarding-area change, so it is deliberately narrow: two routes, one table, two plain emails and one guardian-notice event.

## Routes

### `POST /users/me/email-change` (signed in; 202 `{ status: "verification_sent" }`)

Body `{ password, newEmail, twoFactorCode? }`. Guards: `JwtAuthGuard` + `GuardianConsentGuard` (a restricted-pending minor gets the guard's plain 403 `guardian_consent_pending`, read fresh from Postgres), then `TwoFactorLockInterceptor` (adds `Retry-After` on a locked code entry). Not behind the verified-email guard.

**Decision Log #476: once the password and any second factor have passed, the answer is ALWAYS the same `202 { status: "verification_sent" }`, whatever the new address is.** The status, the body and the headers are byte-identical for a usable address, one that belongs to an account, a malformed one (including blank), one longer than 254 characters, the same as the current address, and, for a minor, the guardian's address. A request whose body is not a string pair is still the global validator's 400, as for every route; that does not depend on the address's state.

1. Configuration first: if `WEB_APP_BASE_URL` cannot build a link (`RegistrationEmailService.isWebAppBaseUrlUsable()`), the answer is `503 email_change_unavailable` before anything else. Decided by configuration alone, so it is the same for every address and happens before any lookup, limiter slot or password check.
2. The wrong-password budget is reserved (`EmailChangeLimiter.reserve`, below). A spent budget is a 429 with `Retry-After`.
3. The password is checked. Wrong: coded 403 `wrong_password`, and the slot stays spent. Right: the slot is given back.
4. If two-factor is on: no code is a coded 403 `two_factor_required`; a wrong, replayed or spent code is a coded 403 `two_factor_invalid`. The two-factor module's own per-account code lock still applies (429).
5. The request cap (`reserveRequest`, below) counts the request on EVERY outcome. Over it: 429 with `Retry-After`.
6. The response is sent. Everything that depends on the address then runs in the BACKGROUND (`runInBackground`, `processRequest`), so neither the response nor its timing differs by address. A failure there is logged (no address, no token) and never reaches the caller.

What the background step does (the new address is trimmed and lower-cased):

| Address | Sent | Stored |
| --- | --- | --- |
| usable | the confirm link to it | a hashed single-use request; any earlier unused request of this user is deleted in the same transaction |
| belongs to any account (case-insensitive) | a plain "cannot be used for that change because it already belongs to a Soccernity account" email to the address as registered: no link, no token, nothing about who asked, nothing the owner has to do | nothing |
| malformed, blank, longer than 254 characters | nothing | nothing |
| the same as the current address | nothing | nothing |
| a minor's guardian address (checked BEFORE the lookup, so it is never emailed even when it belongs to an account) | nothing | nothing |

In every case the CURRENT address gets the notice that a request was made (it never names the new address), in the same background step.

### `POST /auth/email-change/confirm` (no sign-in; 204)

Body `{ token }`. The secret in the link is the credential, so there is no sign-in guard (in `OPEN_ROUTES` of `write-route-guards.spec.ts`, with a reason). An unknown, expired, used, superseded or otherwise unusable token is ONE `400 email_change_link_invalid`.

One transaction: a guarded `updateMany` claims the request (unused, not expired), then the account must still be active and, for a minor, still have a CONFIRMED guardian whose email differs from the new address; then `User.email` is set and `verificationStatus` becomes `verified` (the link proved the person controls the address). A unique violation at that moment is the same generic 400. After commit: every session of the account is ended (`revokeAllSessionsForUser`, as for a password change) and, for a minor, the guardian is told in the background through the new `email_changed` event.

## Rules and where they live

| Rule | Where |
| --- | --- |
| Token stored hashed, single use, 48 hours (the email-verification constant) | service, `DEFAULT_EMAIL_VERIFICATION_TTL_MS` |
| Restricted-pending minors cannot change email | `GuardianConsentGuard` on the request route, re-checked in the confirm transaction |
| A minor's own address never equals the guardian's (#365) | request check and confirm transaction |
| Guardian told for a minor, not an adult | `GuardianSecurityNoticeService.notifyInBackground(userId, 'email_changed')` (its own rules: confirmed guardian only, withhold flag #458, never delays or changes the response) |
| Cleared with the account | `EmailChangeRequest` cascades with `User`, is deleted by the anonymiser (`deleteBehaviouralRows`, so also held-account minimisation) and is classified in `anonymized-row-purge.references.ts` |

## Limits

All on the existing `AuthLimitsStore` (no new environment variable); keys are SHA-256 digests, never a raw id or address. If Redis is down the store falls back to per-process counters, as the sign-in limits do (never fail-closed; a broken limiter does not stop a real user).

| Limit | Default (founder-veto-able) | Counts | Over it |
| --- | --- | --- | --- |
| Wrong passwords per account | 5 per 15 minutes (`EMAIL_CHANGE_FAILED_ATTEMPTS_*`) | a wrong password only; a not-accepted address no longer counts (the answer no longer depends on the address) | 429 + `Retry-After` |
| Requests per account | 5 per hour (`EMAIL_CHANGE_REQUESTS_MAX`, `EMAIL_CHANGE_REQUESTS_WINDOW_SECONDS`) | EVERY request that passed the password and any second factor, whatever the address is; never released | 429 + `Retry-After` |
| Emails per recipient address | 3 per 24 hours (`EMAIL_CHANGE_RECIPIENT_EMAILS_*`) | every email of this feature to that address: the confirm link, the "cannot be used" email and the old-address notice | the email is skipped silently, the response is still 202; a skipped confirm link creates no request row, so an earlier pending request is not replaced by a dead one |
| Per IP | the shared bare `@AuthRateLimit()` (`AUTH_RATE_LIMIT_MAX`, 5 per 60 s) | both routes | 429 |

`POST /auth/change-password` still has no wrong-password limiter of its own.

## Defaults adopted (founder-veto-able)

- The notice to the old address is sent at REQUEST time (not at confirmation).
- A confirmed change ends every session of the account, not only the others.
- The three #476 figures above (5 requests per hour, 3 emails per recipient per 24 hours, and that the old-address notice shares the recipient cap) are the drafter's, not the founder's.
- Identity-confirmation errors are 403, not 401: the web client treats a 401 as an expired access token and would refresh and replay, spending the limiter twice.
- (Superseded by #476) A not-accepted address used to spend the wrong-password budget; it now spends only the request cap.
- The account becomes `verified` when the link is used.
- An account whose email is not yet verified may still change it (no verified-email guard).
- The link path `/email-change/confirm?token=` is a proposal; no page exists yet.

## What a signed-in person can still do (replaces the old "Known residual")

They can no longer learn from the response whether an address is registered: the answer and its timing are the same for every address. What remains is that they can cause an email to be sent to an address that belongs to an account (the "cannot be used" email). That email carries no link and says nothing about who asked, and the three caps above bound it: 5 requests per hour per account, 3 emails per day to any one recipient. The shared per-recipient share also means that a determined person cannot use the route to mail-bomb one mailbox.

## Not built

The Account Information and Change Email screens, the confirm landing page, and the Figma frames for them.
