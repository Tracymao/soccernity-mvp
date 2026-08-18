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

## Status update — PR B4 (`password-reset/`)

Implements `POST /auth/forgot-password` and `POST /auth/reset-password`
(Section 4.1), built on top of B1's foundation above. Concurrent with
B2/B3/B6 in the same Sprint 1 parallel wave — see
`password-reset.module.ts`'s doc comment for how `app.module.ts`'s single
`// AuthModule` placeholder is being handled across all four PRs (each
wires itself in directly; a normal merge-order conflict is expected and
deliberately not architected around).

- `reset-token.store.ts` — Redis-backed, single-use, time-limited
  password-reset tokens. Same precedent as B1's `refresh-token.store.ts`:
  **no `PasswordResetToken` (or equivalent) Prisma model exists**, and
  Section 5.7 doesn't even mention a durable-table option for this token
  type the way it does for refresh tokens. Rather than add a migration
  unilaterally in this PR, this follows B1's Redis precedent.
  **Decision Log candidate**: if an audit/appeals-workflow trail of
  password-reset requests is ever needed (Section 8.4), a durable table
  is the swap point — same flag B1 raised for refresh tokens.
- `password-reset.service.ts` — anti-enumeration is enforced at the
  service boundary (`forgotPassword()` never throws or otherwise signals
  "not found"; the controller returns one fixed message regardless).
  Revokes all of a user's refresh-token sessions on successful reset via
  `TokenService.revokeAllSessionsForUser` (B1 already exposed this — no
  parallel revocation mechanism was built).
- `email/password-reset-email.service.ts` — "wired, not live," same
  honest pattern as `src/instrument.ts` (Sentry, PR #8):
  `EMAIL_PROVIDER_API_KEY` is still the `.env.example` placeholder, so
  sending is logged/simulated, not delivered. The real provider call is a
  single, clearly marked call site for whoever wires up the eventual
  live integration.
- **Decision Log candidate**: no password policy is specified anywhere in
  Section 5.7 or Section 3. This PR applies a conservative 8-character
  minimum to `/auth/reset-password` so the endpoint can't be used to set a
  trivially weak password. If B2's `/auth/register` lands with a
  different minimum, that mismatch needs reconciling at merge time — this
  PR can't see B2's code yet.
- **Small addition beyond spec**: `.env.example` gained `WEB_APP_BASE_URL`
  (needed to build a real reset link inside the emailed URL) and
  `RESET_TOKEN_TTL_MINUTES` is read with a 60-minute default — neither is
  named in Section 3/4/5.7, which only pins TTLs for the access/refresh
  token pair. Flagging both as Decision Log candidates rather than
  treating them as self-evidently correct defaults.
- No `class-validator`/`class-transformer` dependency was added, and no
  global `ValidationPipe` exists in `main.ts` yet — this PR's DTOs
  (`dto/forgot-password.dto.ts`, `dto/reset-password.dto.ts`) are plain
  interfaces with hand-rolled shape checks in the controller, matching
  B1's own preference for explicit code over a new dependency
  mid-infra-PR. Adding real validation-decorator DTOs is a reasonable
  follow-up, but `main.ts` is shared territory across B2/B3/B6 too.

## Update — DTO validation cleanup

The "reasonable follow-up" flagged above (and the equivalent note on
`dto/login.dto.ts`/`dto/logout.dto.ts`/`dto/refresh.dto.ts`) is done: all
five of `AuthController`'s and `PasswordResetController`'s DTOs
(`login`, `logout`, `refresh`, `forgot-password`, `reset-password`) are
now `class-validator` classes, matching `registration/dto/*`'s pattern,
and are validated by `main.ts`'s global `ValidationPipe` (added in B6)
like every other auth DTO. The hand-rolled `parseLoginDto`/
`parseLogoutDto`/`parseRefreshDto` functions and each controller's
manual `typeof`/regex checks are gone — the pipe is now the only
validation layer. `PasswordResetService.resetPassword`'s own
`MIN_PASSWORD_LENGTH` check was removed too, since `ResetPasswordDto`'s
`@MinLength(8)` now enforces it before the service is ever called.

One intentional behavior change: `LoginDto.email` is no longer
trimmed/lowercased before reaching `AuthService.login` (the old
`parseLoginDto` did this; plain `@IsEmail()` doesn't). This actually
makes `/auth/login` *consistent* with `/auth/register`, which never
normalized email case either (`RegistrationService.register` stores
`dto.email` as-is) — so this closes a pre-existing register/login
case-sensitivity mismatch rather than introducing a new one, but it's
worth knowing about if a case-insensitive-email decision is made later
(Decision Log candidate).

## Status update — PR B5 (`guardian-consent/`)

Implements `POST /auth/guardian-consent` (Section 4.1), the guardian-
facing confirmation step B2's `RegistrationService.register()` and
`registration/registration.controller.ts` both flagged as out of their
own scope. Self-contained module (`guardian-consent/`, exported as
`GuardianConsentModule`), following the same per-PR module boundary
B2/B3/B4 established — no `AuthFoundationModule` import needed since
this endpoint issues no tokens, just updates the `Guardian` row.

- No `JwtAuthGuard` on this route — the guardian confirming consent is
  not a Soccernity account holder; `Guardian.consentToken` (a
  server-issued, unguessable UUID, created by `RegistrationService`) is
  itself the credential, same trust model as `/auth/reset-password`'s
  token.
- Unlike `email-verification-token.store.ts`'s Redis-backed,
  delete-on-consume token, `Guardian.consentToken` is a persistent
  Prisma column (Section 3) — a guardian may legitimately click the
  same email link twice. `GuardianConsentService.confirmConsent()`
  mirrors the *single-use state transition* (pending → confirmed) but
  not the delete-the-token part: an already-confirmed token still
  resolves and returns 200 idempotently, without re-setting
  `consentTimestamp` or erroring.
- Invalid/unknown token → generic 400, matching
  `RegistrationService`'s own non-enumeration posture (doesn't
  distinguish "never existed" from "already used and since rotated").
- The confirm write uses `prisma.guardian.updateMany()` with a
  `consentStatus: { not: 'confirmed' }` guard in the `where` clause,
  not a plain `update()` — closes the read-then-write race between the
  existence check and the write, so two concurrent submissions of the
  same token can't both flip `consentTimestamp`.
- **Out of scope, same as B2 flagged this endpoint**: the guardian-
  facing web page (Section 8.3 step 4's plain-language explanation +
  "I consent" action) that would call this endpoint. That's a frontend
  concern for a separate PR — this is only the API contract it calls.
- Section 8.3 steps 5-6 (restricted-pending enforcement on other
  endpoints while consent is outstanding, and account activation) are
  B7, not this PR — `confirmConsent()` only flips `Guardian.consentStatus`;
  it doesn't touch the minor `User` row at all.

## Status update — PR B7 (`guards/guardian-consent.guard.ts`)

Section 8.3 step 5, verbatim from the Build Plan: "Until consent is
recorded, the minor's account exists but is restricted: no public
profile visibility, no DMs from unverified accounts, no participation
in Banter Rooms beyond read-only." `GuardianConsentGuard` is the
enforcement mechanism — composable alongside `JwtAuthGuard`, not a
replacement for it (always list `JwtAuthGuard` first in `@UseGuards()`
so `request.user` exists first). Registered as a provider/export on
`AuthFoundationModule`, same precedent as `JwtAuthGuard` itself (whose
own header comment already named "B7's enforcement pass" as an
intended consumer) — any future module protecting a route imports
`AuthFoundationModule` to get both guards via DI. Added `PrismaService`
to that module's providers too, since no other provider there needed
Prisma before now.

**On every request it protects**: re-reads `User.isMinor` fresh from
Postgres (never trusts the access token, which structurally can't
carry it — Section 5.7's non-negotiable). Non-minors pass through
untouched, without even querying `Guardian`. For a minor, reads
`Guardian.consentStatus` fresh (via `minorUserId`, `@unique`) and
blocks with **403** unless it's exactly `"confirmed"` — a minor with no
`Guardian` row at all (shouldn't happen given `RegistrationService`
always creates one, but not guaranteed by a DB constraint) fails
closed, not open. The 403 body carries a distinct `code:
"guardian_consent_pending"` field, not just a generic message, so the
frontend can render a "waiting on your guardian" state instead of
treating this as an auth failure.

**Explicitly NOT applied to `GET`/`PATCH /users/:id`** (B6) — Section
8.3's restriction is about *other* users seeing/contacting the minor,
not the minor managing their own account. A minor awaiting consent must
still be able to view/edit their own profile. See
`users/users.controller.http.spec.ts` for a dedicated regression test:
it deliberately never provides `GuardianConsentGuard` (or its
`PrismaService` dependency) to that controller's testing module at
all, so if the guard were ever added to `UsersController` without also
updating that test, module compilation itself fails, not just the
assertion.

**The central finding of this PR**: as of Sprint 1, none of Section
8.3 step 5's three restricted behaviors have a real route to attach
this guard to yet, so it isn't wired into `app.module.ts` or any
controller anywhere:

- **Public profile visibility** — `GET /users/:id/profile` (Section
  4.2, the public-facing view of *another* user) is explicitly flagged
  as out of scope in `users/users.controller.ts`'s own header comment;
  only self-view/self-edit (`GET`/`PATCH /users/:id`) exist today, and
  those are deliberately excluded above. Sprint 2's Follow work (Build
  Plan Section 6) is the more likely place a real "view someone else's
  profile" route lands.
- **DMs from unverified accounts** — `src/modules/messaging/` is a
  placeholder (`README.md` only, "Not yet implemented"), Sprint 3 per
  Build Plan Section 6. **Flagging the wording itself as ambiguous**,
  not just the missing implementation: Section 8.3 step 5 says "no DMs
  *from* unverified accounts" (restricting who can message an
  unverified/restricted-pending account), not "no DMs *sent by*" the
  minor — it's not fully clear from this sentence alone whether a
  pending minor should be blocked from *sending* DMs, *receiving* them,
  or both, and whether "unverified" here means email-unverified
  (`User.verificationStatus`) or restricted-pending specifically.
  Whoever builds messaging in Sprint 3 should re-read this line in
  context (and probably Log Book Section 10's fuller safeguarding
  language) before wiring this guard in, rather than assume the
  interpretation above.
- **Banter Rooms beyond read-only** — `src/modules/banter/` is also
  just a placeholder, Sprint 3.

Per this PR's brief: none of these three endpoints are built as part
of B7 — that would be scope creep into Sprint 2/3 work. The guard
itself is fully built and tested in isolation
(`guards/guardian-consent.guard.spec.ts`) so it's ready to attach the
moment any of these routes exist; whoever builds them should import
`AuthFoundationModule` and add `@UseGuards(JwtAuthGuard,
GuardianConsentGuard)`.
