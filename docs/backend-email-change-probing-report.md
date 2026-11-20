# Backend: email change no longer reveals whether an address is registered (Decision Log #476)

Branch `backend/email-change-probing`, from `origin/main` `be679cd`. `services/api` only. No schema change, no migration, no new environment variable, no `apps/web`, `apps/admin`, Figma, `.docx` or `docs/build-register.md`.

Source: Decision Log #476 as recorded in `docs/build-register.md` Section 82 (item 7 and open point 3) and Section 81b item 10 (the "known residual"). The brief's figures (5 requests per hour, 3 emails per day per recipient) are the drafter's defaults and are founder-veto-able.

## What changed

### The answer

`POST /users/me/email-change` answers `202 { status: "verification_sent" }` for every request that passes the password and any second factor. The status, body and headers are byte-identical for:

- a usable address
- an address that belongs to an account (any case)
- a malformed or blank address
- an address longer than 254 characters
- the same address as the current one
- for a minor, the guardian's address

The old `400 email_change_not_accepted` is gone, and with it the "Known residual" section of the module README.

Nothing that depends on the address runs before the response. The lookup, the row and the sending are done by `runInBackground` / `processRequest`, so timing does not tell either. The request path does the same fixed set of steps for every address: the configuration check, the account read, the wrong-password slot, the password check, the optional two-factor check and the request-cap slot.

### What each address causes (all after the response)

| Address | Emailed | Stored |
| --- | --- | --- |
| usable | the confirm link to it | a hashed single-use request (earlier unused one deleted in the same transaction) |
| belongs to an account | a plain "cannot be used for that change because it already belongs to a Soccernity account" email to the address as registered; no link, no token, nothing about who asked | nothing |
| malformed, blank, over 254 | nothing | nothing |
| same as current | nothing | nothing |
| a minor's guardian address | nothing, even when it also belongs to an account (the guardian rule is checked before the lookup) | nothing |

The notice to the CURRENT address goes for every request that got this far, in the same background step, and never names the new address.

### Limits

All on the existing `AuthLimitsStore`; keys are hashed.

| Limit | Default | Over it |
| --- | --- | --- |
| Wrong passwords per account | 5 per 15 minutes (unchanged) | 429 + `Retry-After` |
| Requests per account, every outcome | 5 per hour (`EMAIL_CHANGE_REQUESTS_MAX`, `EMAIL_CHANGE_REQUESTS_WINDOW_SECONDS`) | 429 + `Retry-After` |
| Emails per recipient address | 3 per 24 hours (`EMAIL_CHANGE_RECIPIENT_EMAILS_MAX`, `EMAIL_CHANGE_RECIPIENT_EMAILS_WINDOW_SECONDS`) | skipped silently, response still 202 |

The second `limiter.reserve()` after a not-accepted address is removed: a not-accepted address no longer spends the wrong-password budget. The wrong-password budget itself is unchanged.

### 503

`503 email_change_unavailable` is decided by configuration alone (`RegistrationEmailService.isWebAppBaseUrlUsable()`, the same `buildWebAppLink` rule the link builders use), and it is the FIRST check: before the account read, the password, any limiter slot or any address lookup. The old behaviour (create the row, fail to build the link, delete the row, 503) is gone; if the link cannot be built after all (the base URL changed between the check and the send), the row is discarded and logged, and the caller still has their 202.

### Unchanged

`POST /auth/email-change/confirm`, the `email_changed` guardian event, the consent guard, the two-factor flow and the `EmailChangeRequest` table.

## Files

- `email-change.service.ts`: the flow above; `whenIdle()` for tests and graceful shutdown.
- `email-change.limiter.ts`: `reserveRequest`, `claimRecipientSlot`.
- `email-change.constants.ts`: the two new pairs of constants; the `NOT_ACCEPTED` constants removed.
- `registration-email.service.ts`: `isWebAppBaseUrlUsable()`, `sendEmailChangeUnavailableEmail()` and the new `email-change-unavailable` template (HTML and text). It is in the quiet set (recipient and content are not logged).
- `dto/request-email-change.dto.ts`: comment only.
- `README.md`: rewritten routes, limits and residual sections.

## The new email

Subject: `A request to use your email address on Soccernity`.

> Someone asked to use this email address to change the email on a Soccernity account.
>
> It cannot be used for that change because it already belongs to a Soccernity account. Nothing has changed on your account and you do not need to do anything.

Plain and functional, no link, nothing about the requester, no promise about safety, data or who is told. Not tagged `[COPY PENDING LEGAL REVIEW]`, as instructed.

## Defaults I chose, all founder-veto-able

1. 5 requests per hour per account, and 3 emails per day per recipient (the brief's figures; the founder did not state them).
2. The request cap is taken AFTER the password and any second factor, not before. A wrong password is bounded by its own budget, not the request cap.
3. The recipient share covers all three emails of the feature, including the notice to the account's own old address. Consequence: after 3 requests in 24 hours from one account, the 4th request's notice to that old address is skipped. The alternative (exempt the account's own address) would leave the notice uncapped; say if you want it.
4. The recipient claim is taken before the request row is created, so a skipped link never replaces an earlier pending request with a dead one.
5. Fail-open: if Redis and the in-memory fallback both fail, the recipient claim answers "send" (like every limiter on this store).
6. The "cannot be used" email is sent to the address as it is stored (`User.email`), not as typed.
7. A body whose `newEmail` is over 512 characters (`@MaxLength(512)` on the DTO) is still the global validator's 400. That 400 depends only on the request body, not on any account, so it reveals nothing.
8. The two-factor, password and consent behaviour is unchanged, including the plain 403s.

## Known limits

- A signed-in, password-confirmed person can still cause an email to be sent to an address that belongs to an account. It carries nothing about who asked, and the caps bound it (5 per hour per account, 3 per day per recipient). The answer no longer tells them whether it did.
- Background steps are in-process promises, not a queue: a process stop between the 202 and the send loses that email. The person can ask again. Same trade-off as the guardian-notice background sends.
- Not touched: `apps/web` (`ChangeEmailPage` and the Figma "Email not accepted" step describe the old 400) and Playwright spec 38. They will keep expecting `email_change_not_accepted` and need a follow-up.

## Verification

Measured on this branch (before-figures for these specs were not taken on a clean `main`):

- `tsc --noEmit` and eslint on `src/modules/email-change` and `src/modules/auth/registration/email`: clean.
- Unit (`email-change`, `auth/registration/email`, `write-route-guards.spec.ts`, `env-completeness.spec.ts`): 12 suites / 283 tests, 0 failures. New: `email-change.identical-answer.http.spec.ts` (the real controller and service over HTTP: byte-identical status, body and headers for usable, taken, malformed, blank, too long, same-as-current and guardian addresses; only the emails differ) and `registration-email.email-change.spec.ts` (the new template and `isWebAppBaseUrlUsable`). Rewritten for the new behaviour: the service, limiter and controller specs.
- API e2e (real Postgres and Redis, private database `soccernity_test_probe`, `--runInBand`), only `test/email-change.e2e-spec.ts`: 35 tests, 0 failures. It proves the identical 202 against the real app, that the work happens after the response, the 5-per-hour request cap, the 3-per-day recipient share (confirm link, "cannot be used" email and old-address notice), hashed Redis keys, and the 503 for every address alike. The first run had 4 failures, all in the tests (three asserted on rows before the background step finished; one compared `x-ratelimit-remaining-auth`, the shared per-IP counter, which counts down on every request whatever the address is, so the comparison now leaves it out).
- Not run: the full mocked suite, the full e2e suite, every other e2e file, Playwright (`e2e/tests/38-*` will fail until the web follow-up), `apps/web`, `apps/admin`.

## Forward-pointer notes for the next docs PR (not edited here)

- `docs/build-register.md`: B-059 status line (backend answer and caps reworked by #476); Section 81b item 10 and the Section 82 "known residual" lines are now resolved; B-059's frontend leg (`ChangeEmailPage`, the Figma "Email not accepted" step, spec 38) needs a follow-up.
- Decision Log #476 Status: built by this PR; dated note on #474 (the email-change answer).
- `docs/pending-copy-manifest.md`: no row (the new email is untagged; `services/api` email wording is not covered by the inventory test).
