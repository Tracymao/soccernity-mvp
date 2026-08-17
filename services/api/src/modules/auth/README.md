# auth module

Build target: Sprint 1 — Section 4.1 of the MVP Build Plan.
Endpoints for this module: see the matching subsection of Build Plan Section 4.

## Status

**PR B1 (infrastructure) — done.** This module exports the pieces the
register/login/refresh/logout endpoints consume, per Section 5.7's
concrete auth spec:

- `password/password.service.ts` — argon2id hash/verify (via the `argon2`
  package).
- `token/token.service.ts` — short-lived access JWT (15 min, `{ sub, role
  }` payload only — see the non-negotiable note in `token/token.types.ts`)
  + rotating, revocable refresh token.
- `token/refresh-token.store.ts` — Redis-backed refresh-token persistence.
  **No `RefreshToken` (or equivalent) Prisma model exists in
  `prisma/schema.prisma`.** Section 5.7 allows either "a RefreshToken
  table or Redis set" — this PR used Redis rather than adding a migration
  unilaterally in an infra PR. If a durable table is later decided (e.g.
  for audit/appeals-workflow querying per Section 8.4), that's a Decision
  Log / schema-change candidate, and `refresh-token.store.ts` is the one
  place the swap needs to happen.
- `rate-limit/` — `AuthThrottlerGuard` + `@AuthRateLimit()` decorator
  (via `@nestjs/throttler`), ready to attach to the `/auth/login` and
  `/auth/register` handlers once they exist:

  ```ts
  @AuthRateLimit()
  @Post('login')
  login(@Body() dto: LoginDto) { ... }
  ```

- `auth-foundation.module.ts` — the module B2-B4's real `AuthModule`(s)
  should import to get all of the above via DI.

No controllers, no DTOs, no wiring into `app.module.ts` yet — that's what
makes this infra-only.

## Update — Sprint 1 / PR B6 (users/profile) added the shared route guard

`guards/jwt-auth.guard.ts` — `JwtAuthGuard`, the reusable "must have a
valid access token" guard for every protected route in the app. Built in
B6 because that's the first PR needing to protect a route (B2-B4 are all
public/unauthenticated: register, login, forgot/reset-password). Later
PRs (B5's guardian-consent endpoints, B7's enforcement pass, and every
Sprint 2+ endpoint) should reuse this rather than re-implementing
bearer-token parsing — see `guards/jwt-auth.guard.ts`'s doc comment and
`services/api/src/modules/users/README.md` for the exact usage pattern.

Registered as a provider + export on `AuthFoundationModule` alongside
`PasswordService`/`TokenService`/`RefreshTokenStore` — any module that
needs it imports `AuthFoundationModule`, the same way `UsersModule` does.
Also added: `guards/current-user.decorator.ts` (`@CurrentUser()`, pulls
the guard-verified `{ sub, role }` off the request) and
`guards/authenticated-request.ts` (the `Request & { user: ... }` type).

**PR B2 — `POST /auth/register`, `POST /auth/verify-email` — done.** See
`registration/`. Deliberately its own module
(`registration/registration.module.ts`, exported as
`AuthRegistrationModule`) rather than a single shared `AuthModule`, so
this PR didn't collide with B3/B4/B6 building the rest of Section 4.1's
endpoints in parallel — see `registration/registration.module.ts`'s
comment. `POST /auth/login`, `POST /auth/forgot-password`,
`POST /auth/reset-password`, `POST /auth/guardian-consent`, `GET /auth/me`
(also Section 4.1) are separate PRs, not covered here.

Notable implementation notes for whoever builds those:

- `registration/age.util.ts` computes `isMinor` as "not yet 18," per
  Decision Log #8/#10 (the resolved under-18 threshold, not UK GDPR's
  bare 13). Reuse this rather than reimplementing age math elsewhere.
- `registration/email-verification/email-verification-token.store.ts` is
  Redis-backed, following B1's `RefreshTokenStore` precedent, because no
  email-verification-token field/model exists on `User` in
  `prisma/schema.prisma` (Section 3 only lists `verification_status`).
  Flagged as a Decision Log candidate in PR B2's report — durable/
  audit-queryable storage would need a schema change.
- `registration/email/registration-email.service.ts` is "wired, not
  live" for both the verify-email and guardian-consent emails — same
  honest pattern as Sentry's `src/instrument.ts`. `EMAIL_PROVIDER_API_KEY`
  is still the `.env.example` placeholder, so sends are logged (with the
  token, for dev/manual verification) rather than actually delivered.
  Which real provider to wire is also a Decision Log candidate — none is
  chosen anywhere in Sections 3/4/5/9.
