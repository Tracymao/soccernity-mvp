# Email change (build register B-059, Decision Log #472 adopted default (f))

Backend only. Until this module, no code path changed `User.email`. It is a safeguarding-area change, so it is deliberately narrow: two routes, one table, two plain emails and one guardian-notice event.

## Routes

### `POST /users/me/email-change` (signed in; 202 `{ status: "verification_sent" }`)

Body `{ password, newEmail, twoFactorCode? }`. Guards: `JwtAuthGuard` + `GuardianConsentGuard` (a restricted-pending minor gets the guard's plain 403 `guardian_consent_pending`, read fresh from Postgres), then `TwoFactorLockInterceptor` (adds `Retry-After` on a locked code entry). Not behind the verified-email guard.

1. The failed-attempt budget is reserved first (`EmailChangeLimiter`, below). A spent budget is a 429 with `Retry-After` before any check runs.
2. The password is checked. Wrong: coded 403 `wrong_password`, and the slot stays spent. Right: the slot is given back.
3. If two-factor is on: no code is a coded 403 `two_factor_required`; a wrong, replayed or spent code is a coded 403 `two_factor_invalid`. The two-factor module's own per-account code lock still applies (429).
4. The new address is trimmed and lower-cased. If it is unusable for ANY reason the answer is ONE identical `400 email_change_not_accepted` with the same body: not a valid address, longer than 254 characters, the same as the current address, used by any account (case-insensitive), or, for a minor, the guardian's address. A not-accepted attempt spends one slot of the failed-attempt budget, so the route cannot be used to test addresses in bulk.
5. In one transaction, any earlier unused request of this user is deleted and a new one is created (one pending request per user). Only a SHA-256 hash of the secret is stored.
6. The verification link goes to the NEW address. If `WEB_APP_BASE_URL` is unusable no link can be built: the request is removed and the answer is `503 email_change_unavailable`.
7. A notice goes to the OLD address in the background, and never names the new address.

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

`POST /auth/change-password` has no wrong-password limiter, so none could be reused. This module adds `EmailChangeLimiter` on the existing `AuthLimitsStore` (no new environment variable): 5 failed attempts per 15 minutes per account, counted per account and hashed in the key, plus the shared bare `@AuthRateLimit()` per-IP limit on both routes (`AUTH_RATE_LIMIT_MAX`, 5 per 60 seconds by default; no figure of its own). The 5-per-15-minutes per-account budget is a DEFAULT, founder-veto-able. If Redis is down the store falls back to per-process counters, as the sign-in limits do.

## Defaults adopted (founder-veto-able)

- The notice to the old address is sent at REQUEST time (not at confirmation).
- A confirmed change ends every session of the account, not only the others.
- Identity-confirmation errors are 403, not 401: the web client treats a 401 as an expired access token and would refresh and replay, spending the limiter twice.
- A not-accepted address spends the same budget as a wrong password.
- The account becomes `verified` when the link is used.
- An account whose email is not yet verified may still change it (no verified-email guard).
- The link path `/email-change/confirm?token=` is a proposal; no page exists yet.

## Known residual

The request answers 202 for a usable address and 400 for any unusable one, so a signed-in person who has just proved their password could learn whether an address is registered. This is bounded by the failed-attempt budget above (the brief asked for the single identical `email_change_not_accepted` answer, which this follows). Removing it would need the answer to be 202 either way, with the "not accepted" outcome delivered by email instead.

## Not built

The Account Information and Change Email screens, the confirm landing page, and the Figma frames for them.
