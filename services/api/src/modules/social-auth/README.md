# social-auth: Google and Facebook sign-in (B-084)

Build-register row B-084; Decision Log #378, #468 (founder decisions of 2026-11-04). **Backend only.** Apple is out of scope. No screen exists (that is B-085).

**Built behind configuration.** A provider is enabled only when BOTH its OAuth client id and secret are set to real values AND `WEB_APP_BASE_URL` is usable. Until then its endpoints answer `404 { code: "social_provider_unavailable" }`, `GET /auth/social/providers` leaves it out, nothing is written to Redis or Postgres, and nothing else in the API changes. The founder switches a provider on by adding its keys (`docs/deployment.md`).

## Endpoints (all under `/auth/social`, all public, none a `JwtAuthGuard` route)

| Route | What it does |
| --- | --- |
| `GET /providers` | `{ providers: ["google", "facebook"] }`: the enabled ones. The web shows a button for each and none for the rest. |
| `POST /:provider/start` `{ staySignedIn? }` | Creates a single-use OAuth `state` plus a PKCE (S256) verifier in Redis (10 minutes) and returns `{ authorizationUrl }`. |
| `POST /:provider/callback` `{ code, state }` | The web app's redirect page posts what the provider sent back. Returns one of the three outcomes below. |
| `POST /email-code` `{ socialRegistrationToken, email }` | The provider gave no email: sends a 6-digit code to the address typed. Always `{ sent: true }`. |
| `POST /email-code/verify` `{ socialRegistrationToken, code }` | On success the SAME token now carries a verified email. |
| `POST /register` | Completes the account. Same body as `POST /auth/register` minus `email` and `password`, plus the token. `201`, same response as `POST /auth/register`. |

`:provider` is `google` or `facebook`; anything else (`apple`, ...) is the same 404 as a provider that is off.

The redirect URI to register with each provider is `<WEB_APP_BASE_URL>/auth/social/<provider>/callback`. The web app owns that page (B-085), reads `code` and `state` from its query string and POSTs them to the callback endpoint.

**Contract for the web page (B-085), not enforceable here:** the API makes `state` single-use and server-held, but it cannot know which *browser* started the flow. To stop login CSRF (an attacker starts a flow, then gets a victim's browser to finish it, signing the victim in as the attacker), the web app must keep the `state` it received from `start` (for example in `sessionStorage`) and refuse to call the callback unless the `state` in the provider's redirect equals it.
### Callback outcomes (`status`)

- `signed_in`: the account is signed in with the same body as `POST /auth/login` (session cookie in cookie mode, the refresh token not in the body).
- `two_factor_required`: the account has two-factor on. The body is the challenge (`challengeToken`, ...), **no tokens and no cookie**. It is finished with `POST /auth/login/two-factor`, exactly as after a password.
- `registration_required`: a new person (or an email that could not be linked, see below). `{ socialRegistrationToken, profile: { displayName, email | null, emailVerified, needsEmail } }`. **No account exists yet.**

## The rules

1. **Existing identity** (a `SocialIdentity` row for `(provider, providerAccountId)`): signs the linked account in through `AuthService.signInVerifiedUser`, the code that the password login runs after the password check, so the status refusals (deactivated, suspended, pending deletion), the two-factor challenge and the session are not copied.
2. **A new person never gets an account at the callback** (default a). They get a short-lived registration token and finish the normal registration through `RegistrationService.register`: date of birth from the Age Gate, guardian details and the pending Guardian + consent email for a minor, country derivation, club join. The only differences are that there is no password and that an already-proven email skips the verification email. **The provider's date of birth is never requested** (the scopes are identity only: `openid email profile` / `public_profile,email`; a test pins that) **and never trusted.**
3. **Email verification** (default b). Google: the email counts as verified only if Google says `email_verified`. Facebook: its email is always treated as UNVERIFIED and goes through Soccernity's own verification email like any other account. **If the provider gave no email** (Facebook can return none) the person enters one and verifies it with a one-time code **before any account exists**; registration is refused until the token carries an email.
4. **Linking to an existing account** (default c). Only for **Google**, with a **provider-verified** email, to an existing account whose own email is **verified** and whose status is **active**. **Facebook never links automatically.** Anything else is *indistinguishable from a new person* at the callback (same `registration_required` shape) and ends, at the last step, in one generic `409 { code: "social_signup_unavailable" }` ("... If you already have a Soccernity account, sign in with your email and password."), which names no cause. Linking never skips two-factor.
5. **Two-factor, lockout, rate limits** (default d). The callback carries `@AuthLimit('login')`, the SAME limiter as the password login (the per-IP ceiling of 60 per 10 minutes applies; a refused sign-in counts toward it). The per-account failed-attempt budget is keyed on an email in the request body; there is none here and nothing to guess. The second factor is finished by the existing two-factor endpoints with their own account lock. `start`, `email-code` and `email-code/verify` each use the shared `@AuthRateLimit()` (5 per 60 s per IP, one bucket per route, `AUTH_RATE_LIMIT_MAX`); `register` uses `@AuthLimit('signup')`. Each also carries `@SkipGlobalWriteLimit()` (required by `global-rate-limit.coverage.spec.ts`).

## Social-only accounts and passwords (default e)

`User.passwordHash` is not nullable and was not made so. A social account gets an **argon2id hash of a random 48-byte value nobody ever sees** (`register()` hashes it exactly as it hashes a real password), so no login or reset path changes and no password login can succeed.

**What this means for password reset:** `POST /auth/forgot-password` is keyed on email and works on such an account. Completing a reset sets a real password, after which the account can sign in both ways. This is the only way a social-only person gets a password. Consequences worth knowing:

- `POST /auth/change-password`, `deactivate-account`, `delete-account` and `reactivate-account` ask for the current password, which a social-only person does not have. They must first set one through forgot-password. A deactivated social-only account therefore cannot self-reactivate until it has done so.
- Control of the account's mailbox is enough to take it over through forgot-password, as for any account. For a Facebook account whose email was never verified, that is the person who typed it at sign-up; the usual verification email is the control.

## What is stored

- **`SocialIdentity`** (new model, migration `20261111090000_add_social_identity`): `provider`, `providerAccountId`, `userId`, `createdAt`. Unique on `(provider, providerAccountId)`. **Nothing else**: no email, name, picture or token from the provider. Cascades with the `User` row and is deleted by anonymisation and by held-account minimisation (`deleteBehaviouralRows`, next to the backup codes), because it is a sign-in credential.
- **Redis (short-lived, keys hashed, never the raw secret):** the OAuth state + PKCE verifier (10 minutes, single use); the registration token with display name and email (30 minutes, discarded when the account exists); the email code hash (10 minutes, 5 guesses, 3 sends per token).
- **Not stored anywhere:** the provider's access token, the profile after the callback, any date of birth. A provider failure's response body is never logged.

## Tokens: opaque, not JWT

The brief asked for a "short-lived, signed, single-purpose" registration token. This is an opaque 256-bit server-held token (the repo's existing pattern for the two-factor challenge and the email-verification link), not a JWT: it cannot be forged, is single purpose by construction (no guard accepts it as a session), can be revoked, and cannot be replayed once the account exists. It is spent only **after** the account is created, so a validation slip (a mistyped date of birth) does not burn it; a replay or a race cannot create a second account because the email and the provider identity are both unique (`409 social_signup_unavailable`).

## Not verified against a real provider

No Google or Facebook OAuth app exists, so **none of the HTTP client has run against a live endpoint.** The URLs, parameters and field names come from the providers' public documentation. Specifically unverified: Facebook's token endpoint accepting `code_verifier` (PKCE); the Facebook Graph version in `social-auth.constants.ts` (versions expire after about two years); Google's `email_verified` as a boolean (a `"true"` string is tolerated). The unit tests drive the client with a recorded `fetch`; the service and e2e tests use a fake `SocialAuthClient` and never reach the network.

## Not built (out of scope)

- Any screen (B-085), including the "enter your email" step, the redirect page and the buttons.
- Apple. A "link account" screen in Settings, or any way to unlink or add a second provider.
- A notification to the account owner when Google is auto-linked, and a guardian notice for a minor's account when a sign-in method is linked.
- Reading the provider's profile picture (none is requested, none is stored).

## Tests

- Unit: `social-auth.service.spec.ts`, `social-auth.controller.http.spec.ts`, `social-auth.stores.spec.ts`, `http-social-auth.client.spec.ts`, plus the social cases in `registration.service.spec.ts` and `registration-email.service.spec.ts`.
- e2e (real Postgres + Redis): `test/social-auth.e2e-spec.ts`.
