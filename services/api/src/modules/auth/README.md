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

## Status update — Decision Log #16 (email case normalization)

`registration.service.ts`'s `register()` and `auth.service.ts`'s
`login()` both now normalize email to lowercase before touching
Postgres — `register()` once, at the top (`const email =
dto.email.toLowerCase()`), reused for both the duplicate-email check
and the `User` row it creates; `login()` lowercases its `email`
parameter before the `findUnique` call. Deliberately done at the
service layer, not the DTO layer — `LoginDto`/`RegisterDto` stay plain
`@IsEmail()` classes, so normalization applies the same way regardless
of which controller path builds the DTO, rather than being tied to one
call site's validation step. `Guardian.email` (the guardian's own
address, a separate entity/field) is untouched — this decision item is
about `User.email` matching, not guardian contact details.

**Pre-existing rows caveat, not silently assumed away**: this is a
write-time normalization, not a migration. Any `User` row created
*before* this change that has a mixed-case email stays exactly as
stored — Postgres's default `citext`-less text comparison is
case-sensitive, so a pre-existing `"Temi@x.com"` row will not match a
post-fix, lowercased `login()` lookup for `"temi@x.com"` unless that
row is separately backfilled. This only matters if such rows actually
exist in a real database; nothing in this codebase confirms or rules
that out one way or the other. **Whether a backfill migration
(`UPDATE "User" SET email = LOWER(email)`, plus checking for
resulting duplicate-key collisions first) is worth a follow-up is
flagged here, not built** — out of scope for this ticket per its own
brief.

## Status update — Decision Log #17 (Postmark wired, still not live)

`registration/email/registration-email.service.ts` and
`password-reset/email/password-reset-email.service.ts`'s live-send
branches (previously `throw new Error('...no email provider
integration exists yet...')`) now call Postmark's real Node client
(`new ServerClient(apiKey)`, `.sendEmail(...)`) instead. The existing
`isConfigured`/`isLive` gate — both booleans, checked against
`EMAIL_PROVIDER_API_KEY` being unset or the literal `"replace-me"`
placeholder — is untouched; this PR only replaces what happens once
that gate is already true.

- **Still not live as of this PR** — same as `src/instrument.ts`'s
  Sentry DSN: `EMAIL_PROVIDER_API_KEY` is still the `.env.example`
  placeholder, so `isConfigured`/`isLive` are still `false` in every
  dev/test run and the code path that actually calls Postmark has
  never executed against a real account. Creating the Postmark account
  and swapping in a real server token is a human action (billing,
  domain/DKIM verification) — this PR makes that swap the *only*
  remaining step, it doesn't perform it.
- Added `POSTMARK_FROM_EMAIL` to `.env.example` — Postmark requires the
  sending address to belong to a domain verified (SPF/DKIM) in the
  account, so this can't reuse an arbitrary address; it's a second
  placeholder that needs a real, verified value alongside the API key.
- No Postmark message templates exist yet (also account-side setup),
  so both services build minimal inline HTML/text bodies rather than
  calling `sendEmailWithTemplate`. The copy itself is functional, not
  final consent-flow language — Section 8.3 step 4's actual
  guardian-facing wording is safeguarding-drafter / legal-review
  territory (CLAUDE.md non-negotiable #2), same as the DPIA.
- A thrown/rejected Postmark call is caught and logged at the call
  site itself, never propagated — both `RegistrationService` and
  `PasswordResetService` already treat email sending as
  fire-and-forget-with-logging (see their own `.catch()` sites), so a
  Postmark outage must not fail registration or a password reset.
- The live branch logs only send success/failure and Postmark's
  `MessageID` — never the token, reset link, or other email content.
  (The not-live branch keeps logging the raw token/link, unchanged —
  that's deliberate dev/test-only behavior, not something this PR
  weakens.)
- `verify-email` and `guardian-consent` emails mention their token as
  plain text, not a clickable link — unlike password-reset's real,
  built `ResetPasswordPage` (`apps/web`), there is no real frontend
  page yet for either (email verification has none at all;
  `GuardianConsentPage.tsx` is an explicit route stub, "PR F5 replaces
  this file's contents with the real, Figma-derived screen(s)"), so
  this PR doesn't fabricate links to pages that don't exist.

## Status update — DPIA finding R5 (consent token expiry + resend)

`docs/sprint-1-dpia-outline-draft.md`'s R5 finding: `Guardian.consentToken`
had no expiry and no single-use marker — a permanent credential granting
the power to activate a child's account, sitting in an email inbox
indefinitely. R5's own proposal (explicitly "not a decision," "no
security analysis behind it") is a 72-hour token lifetime, invalidated
on use where "use" means the window closing, with a resend path.
Implemented as proposed, not re-litigated.

- `Guardian.consentTokenExpiresAt` (new, `DateTime`, non-nullable) —
  set at issuance (`RegistrationService.register()`) and re-issuance
  (`resendConsent()` below) to now + 72 hours via
  `guardian-consent/consent-token.constants.ts`'s
  `computeConsentTokenExpiresAt()`. No separate `used`/`consumed`
  boolean — `consentStatus` already distinguishes pending/confirmed,
  and expiry is a distinct concern that applies *regardless* of
  confirmation state (a confirmed guardian's token becomes unfindable
  after the window too, since it's never needed again once confirmed).
- `confirmConsent()`: expiry is checked **before** the
  already-confirmed check, deliberately — the existing "a guardian may
  legitimately click the same link twice" idempotency (unchanged, still
  correct) only applies to a still-valid token being re-clicked, not an
  aged-out one. An expired token gets the same generic `BadRequestException`
  as a nonexistent one, whether or not it was ever confirmed.
- `resendConsent(email)`: takes the **minor's** registered email, not
  the guardian's — avoids a second lookup-by-guardian-email surface,
  and the minor is who'd know to ask "did my guardian get the email."
  Issues a genuinely **new** `consentToken` (not an extension of the
  old one's expiry) — `consentToken` is `@unique`, so this overwrites
  the only copy and the old token stops resolving entirely. No-ops
  silently (same generic response either way, at the controller) for:
  unknown email, a non-minor account, a minor with no `Guardian` row,
  or a `Guardian` whose `consentStatus` is already `"confirmed"` — none
  of these are distinguishable from the caller's side. Reuses
  `RegistrationEmailService.sendGuardianConsentEmail` (PR #33's Postmark
  wiring) rather than duplicating email-sending logic.
- `POST /auth/guardian-consent/resend` carries `@AuthRateLimit()`
  (same guard/decorator as `/auth/forgot-password`) — an unrated resend
  endpoint targeting an arbitrary email is a spam vector against a
  guardian's inbox. `GuardianConsentModule` now imports
  `AuthFoundationModule` for that guard's DI graph, and declares its
  own local `RegistrationEmailService` provider (not exported from
  `AuthRegistrationModule`) — matching this codebase's existing
  convention of each module declaring its own local `PrismaService`
  rather than importing one via cross-module export.
- `GUARDIAN_CONSENT_TOKEN_TTL_HOURS` (`.env.example`, default `72`) —
  made configurable via env rather than a hardcoded constant, same
  pattern as `RESET_TOKEN_TTL_MINUTES`. This wasn't explicitly asked
  for; flagged as a deliberate call in this PR's report rather than
  silently deviating from "implement 72 hours as specified."
- **A Prisma migration was required and applied for real** —
  `consentTokenExpiresAt` is `NOT NULL`, and the local dev database
  (Decision Log #18: no production data, but this dev DB did have one
  manual/test `Guardian` row) can't take a `NOT NULL` column with no
  default in one step. Split into three statements: add nullable,
  backfill existing rows to now + 72h (treated as freshly issued, not
  deleted), then enforce `NOT NULL` — see
  `prisma/migrations/20260818235411_add_guardian_consent_token_expiry/migration.sql`.
- **This PR does not close R5 in the DPIA.** It gives counsel something
  concrete to review — a real 72-hour window and a real resend path —
  instead of an unmitigated gap. The 72-hour number itself, and
  whether "single-use, invalidated on use" as implemented here actually
  satisfies whatever counsel decides is needed, are still open per the
  DPIA's own disclaimer on R5 and its Section 5 open-questions table
  (item 9: "Consent token expiry and single-use (R5) — 72h proposed as
  a starting number only — Counsel + backend-api").

## Status update — response shape reconciliation (`POST /auth/register` vs `POST /auth/login`)

PR #59's real-Postgres e2e layer (`test/auth.e2e-spec.ts`,
`test/clubs.e2e-spec.ts`) surfaced and flagged, rather than silently
fixed, a genuine API-contract inconsistency between the two endpoints:
`POST /auth/register` nested its token pair as
`accessToken: { token, expiresIn }` while `POST /auth/login` returned a
flat `accessToken: string` + `accessTokenExpiresIn: number` (via
`auth-response.mapper.ts`'s `toTokenPairResponse`), and only
`/auth/register` returned a `user` object at all. Resolved on branch
`sprint-2/auth-response-shape-reconciliation`:

- **Both endpoints now return the identical, flat shape.** `AuthResponse`
  (`auth-response.mapper.ts`) is `TokenPairResponse`'s four token fields
  (`accessToken`, `accessTokenExpiresIn`, `refreshToken`,
  `refreshTokenExpiresAt`) plus `user: AuthUserSummary`. Register's old
  nested `accessToken: { token, expiresIn }` is gone — it now calls the
  same `toTokenPairResponse()` login uses.
- **`POST /auth/login` now returns a `user` object too** — no new query;
  `AuthService.login` already loads the full `User` row for password
  verification, this is response-shaping only.
- **`AuthUserSummary`** (also new, in `auth-response.mapper.ts`) is the
  single shared shape for `user` on both endpoints: `id, email, phone,
  displayName, dateOfBirth, isMinor, role, verificationStatus,
  createdAt`. It replaces what used to be an inline object literal
  duplicated only in `registration.controller.ts`'s own
  `toRegisterResponse` — both endpoints now call the same
  `toAuthUserSummary(user)` function, so they can't drift again by one
  of them being edited and the other forgotten.
- **`isMinor`/`verificationStatus` are deliberately present in `user`,
  on both endpoints.** This does not weaken the non-negotiable in
  `TokenPairResponse`'s own doc comment (Build Plan Section 5.7): that
  rule is specifically about what `TokenService` puts *inside the JWT
  access token payload* (`{ sub, role }` only, still enforced,
  untouched by this change, still tested by
  `token/token.service.spec.ts` and a dedicated `auth.service.spec.ts`
  case that decodes the token and asserts on its payload directly) —
  not about a fresh, one-time HTTP response body reading a user's own
  current state back to them. `Guardian.consentStatus` is a separate
  entity's field and never appears in `AuthUserSummary` at all, on
  either endpoint.
- **`TokenPairResponse` itself stays narrow, unchanged, and `user`-free.**
  `POST /auth/refresh` still returns bare `TokenPairResponse` — a
  background token-renewal call has no re-verified `User` row to attach
  a `user` snapshot to (only a refresh token). `AuthResponse` is a
  separate, wider type used only by `/auth/login` and `/auth/register`.
- Downstream call sites fixed in the same PR: `test/auth.e2e-spec.ts`,
  `test/clubs.e2e-spec.ts`, `registration/registration.controller.spec.ts`,
  `auth.controller.http.spec.ts`, `auth.service.spec.ts`, and
  `apps/web/src/api/auth.ts`'s `LoginResponse`/`RegisterResponse`
  interfaces (previously explicitly marked as pre-B2/B3 speculative
  scaffolding — now reconciled against the real DTOs for real).
  `LoginPage.tsx`/`RegisterStep.tsx` needed no changes — both already
  only read the flat `result.accessToken`/`result.refreshToken` strings.

## Status update — `AUTH_RATE_LIMIT_MAX`/`AUTH_RATE_LIMIT_WINDOW_MS` config-wiring fix (`sprint-2/fix-auth-rate-limit-config-wiring`)

`sprint-2/e2e-coverage-expansion` (PR #63) surfaced a real, confirmed
config-wiring bug: `AUTH_RATE_LIMIT_MAX`/`AUTH_RATE_LIMIT_WINDOW_MS`
(`rate-limit.module.ts`'s env-driven module-level throttler config) had
zero real effect on any of the four routes decorated with
`@AuthRateLimit()` (`register`, `login`, `forgot-password`,
`guardian-consent/resend`).

- **Root cause:** `AuthRateLimit(limit = DEFAULT_AUTH_RATE_LIMIT, windowMs
  = DEFAULT_AUTH_RATE_LIMIT_WINDOW_MS)` applied those default parameters
  as a per-route `Throttle({ auth: { limit, ttl: windowMs } })` override
  on every call, unconditionally — including on bare `@AuthRateLimit()`,
  which every real call site used. NestJS's Throttler gives a route-level
  `@Throttle()` override priority over the module-level named-throttler
  config `AuthRateLimitModule` builds from `AUTH_RATE_LIMIT_MAX`/
  `AUTH_RATE_LIMIT_WINDOW_MS`, so the env-driven config was being read
  correctly but never actually reached any route — it was always silently
  overridden by the same hardcoded numbers (5 requests / 60s) regardless
  of what was configured.
- **Fix:** `AuthRateLimit()` now takes an optional `{ limit, windowMs }`
  override. Bare `@AuthRateLimit()` (every current call site) applies
  *only* `UseGuards(AuthThrottlerGuard)`, with no `@Throttle()` metadata
  at all — the route now genuinely falls through to
  `AuthRateLimitModule`'s module-level, env-driven config. An explicit
  override is opt-in, for a future route that specifically needs a
  different limit than the shared auth default; none currently do.
  `DEFAULT_AUTH_RATE_LIMIT`/`DEFAULT_AUTH_RATE_LIMIT_WINDOW_MS`
  (`rate-limit.constants.ts`) are untouched — `rate-limit.module.ts`'s own
  `|| DEFAULT_...` fallback still needs them for when the env vars
  themselves aren't set.
- **Proven behaviorally, not just compiled:**
  `rate-limit/auth-rate-limit.decorator.spec.ts` wires the *real*
  `AuthThrottlerGuard` through the *real* `AuthRateLimitModule` (same
  pattern this file's own guardian-consent "real rate limiting" spec
  already used for one route) against a throwaway controller carrying a
  bare `@AuthRateLimit()`. One case sets `AUTH_RATE_LIMIT_MAX=2` (a value
  deliberately different from the hardcoded default of 5) and confirms
  the third request in a window now genuinely gets `429`, not `200` —
  confirmed directly against the pre-fix decorator that this exact
  assertion fails there (`expected 429, got 200`), so this is a real
  regression-proof, not a test that would pass either way. A second case
  confirms the fallback to `DEFAULT_AUTH_RATE_LIMIT` (5) still works when
  the env vars are unset.
- **The three e2e spec files PR #63 added
  (`feed-reactions.e2e-spec.ts`, `follow.e2e-spec.ts`,
  `counters.e2e-spec.ts`) were deliberately left on their existing
  Prisma-seeding/`TokenService`-minting workaround, not switched to real
  HTTP registration.** The fix alone doesn't make that switch free —
  `.env.test` still has no `AUTH_RATE_LIMIT_MAX` override, so the
  effective default stays 5/60s, and these three files' `createUser()`
  helpers are called 37 times total (21 + 13 + 3) across real HTTP
  traffic within each file's own throttler window. Doing this properly
  would mean adding a test-specific rate-limit override plus converting
  all 37 call sites to real register/login HTTP calls, each paying real
  argon2id hashing cost — judged out of scope for this fix PR; each
  file's own `createUser()` comment (and `test/README.md`) is updated to
  say so explicitly rather than leave a stale "the bug is why we do this"
  explanation standing after the bug itself is fixed.

## Status update — auto-join on signup (`sprint-2/auto-join-on-signup`)

Closes the specific gap `clubs/README.md` flagged when club pages
themselves shipped (PR #58): "auto-join on signup" (Build Plan Section
6's Sprint 2 line) was left unbuilt because `RegisterDto` had no
club-selection field at all.

- `RegisterDto.clubId?: string` — new, `@IsOptional() @IsUUID()`,
  matching `ClubPage.id`'s real UUID type (`schema.prisma`). Omitting
  the field entirely is the "no club for now" path — not a special
  sentinel value, just the natural absence of the field. No other
  `RegisterDto` field changed.
- `AuthRegistrationModule` now imports `ClubsModule` (which now exports
  `ClubsService` for the first time — previously providers-only, no
  `exports` array) so `RegistrationService` can inject `ClubsService`
  via DI. No circular-dependency risk: `ClubsModule` imports
  `AuthFoundationModule`, not `AuthRegistrationModule`.
- `RegistrationService.register()`: when `dto.clubId` is provided, calls
  `this.clubsService.joinClub(user.id, dto.clubId)` after user (and, for
  a minor, guardian) creation — following the method's existing
  sequential-steps pattern, not forced into the same `$transaction` as
  user creation (`joinClub` is already internally transactional for its
  own membership-row + `memberCount` pairing, per `clubs.service.ts`).
- **Critical ordering fix, found and handled directly, not assumed
  correct**: tracing `register()`'s actual step order confirmed that a
  club-existence check that only happened as part of `joinClub` itself
  (which, by construction, could only run after user/guardian creation)
  would let a bad `clubId` 404 while leaving an already-committed,
  orphaned `User` row behind (the pre-existing duplicate-email check
  would then permanently block that address from registering again).
  Fixed by calling `ClubsService.assertClubExists(dto.clubId)` (made
  public — previously private, internal to `ClubsService` only)
  *before* `prisma.user.create()` runs, not after. See
  `test/registration-club-join.e2e-spec.ts` for the real-Postgres
  regression proof: a nonexistent `clubId` produces a 404 and zero
  `User` rows for that email (confirmed by querying directly), and the
  same email can genuinely register afterward.
- No `Notification` wiring — joining a club was never on Section 6's
  notification-trigger list (follow/comment/like only) and that doesn't
  change because the join now also happens during registration.
- `AuthResponse`/`RegisterResponse` (`auth-response.mapper.ts`) gained no
  new field for this — a successful club join is implied by a 201 with
  no error; a caller wanting to confirm membership can already call
  `GET /clubs/:id`.
- **This gap is now closed by `sprint-2/club-picker-ui`** — not by
  wiring `RegisterDto.clubId` into `apps/web` as this bullet originally
  implied would happen, but by a deliberate direction change: `GET
  /clubs` (`clubs.controller.ts`) is `JwtAuthGuard`-only, and
  `SignupFlow.tsx`'s age-gate → guardian-details → register step
  machine runs entirely before any account (and therefore any JWT)
  exists — there is no point in that pre-account flow where a
  club-picker step could actually call `GET /clubs`. Rather than
  loosening that guard (a real, undesirable security/product change to
  an endpoint whose `JwtAuthGuard`-only reasoning was deliberate — see
  `clubs.controller.ts`'s own comment), the club-picker step was built
  *after* account creation instead: `ClubPickerStep.tsx`, rendered from
  `RegisterStep.tsx`'s existing success view, using the `accessToken`
  `RegisterResponse` already returns to call `GET /clubs` and `POST
  /clubs/:id/join` directly. **This means `RegisterDto.clubId`'s
  auto-join-on-signup capability remains unused by the web client** —
  it's still real, tested backend capability usable by mobile or a
  future direct-API caller, just not exercised by this path. See
  `clubs/README.md`'s matching update and CLAUDE.md's Sprint 2 status
  section for the full reasoning.
- Verification: `registration.service.spec.ts` gained four new cases
  (join called with a real clubId, no ClubsService calls at all when
  clubId is omitted, `NotFoundException` propagates for a bad clubId
  with `prisma.user.create` never called, and an explicit call-order
  assertion proving `assertClubExists` runs before `user.create`).
  `test/registration-club-join.e2e-spec.ts` (new) covers the same three
  scenarios against real Postgres. Full mocked suite after this branch:
  34 suites / 338 tests, 0 failures (up from 34 suites / 334 tests
  immediately before it, verified directly by stashing this branch's
  changes and re-running — no new suite, four new tests in the existing
  `registration.service.spec.ts`; one pre-existing, timing-sensitive
  test, `auth-rate-limit.decorator.spec.ts`'s "respects
  AUTH_RATE_LIMIT_MAX/..." case, flaked once under full-suite load and
  passed cleanly on an isolated re-run, unrelated to this change and not
  fixed here). e2e suite: 6 suites / 25 tests, 0 failures (up from 5
  suites / 22 tests — one new spec file, three new tests).

## Status update — guardian-consent-status, change-password, deactivate/delete/reactivate-account (`sprint-1/f5-f6-missing-endpoints`)

Closes two confirmed gaps (re-verified directly by `grep -r
"change-password\|deactivate\|delete-account\|accountStatus"
services/api/src` before writing any code — zero matches for either, same
as the task brief's own claim): no endpoint exposed a minor's own
guardian-consent status, and there was no change-password/deactivate/
delete-account capability anywhere in this codebase.

### Part 1 — `GET /auth/guardian-consent/status`

Two real shape choices existed, per this PR's own brief: extend `GET
/users/:id`'s response to nest a `guardian` object for a minor viewing
their own profile, or build a dedicated `GET /auth/guardian-consent/status`
endpoint. **Chose the dedicated endpoint**, confirming (not just assuming)
the brief's own recommendation was right after reading `users/README.md`
and `users.service.ts` directly: `GET /users/:id` is a general-purpose
profile endpoint already used by every caller regardless of `isMinor`, and
bolting safeguarding-specific nested data onto it would mix concerns and
bloat the response shape for the vast majority of non-minor callers who'd
always get `guardian: null`. A dedicated endpoint keeps single
responsibility, groups naturally with the two existing
`POST /auth/guardian-consent*` routes (same controller,
`guardian-consent.controller.ts`, same safeguarding domain), and its guard
requirement is cleaner to state and enforce in isolation from whatever
`GET /users/:id` might ever need to do.

- **Guard: `JwtAuthGuard` ONLY, deliberately NOT `GuardianConsentGuard`.**
  This is a hard requirement, not a style choice, restated from the task
  brief: a restricted-pending minor must be able to check their own
  restricted status by definition — gating this behind the same guard
  that enforces the restriction would make it impossible for a restricted
  user to ever see why they're restricted. `GuardianConsentModule` already
  imported `AuthFoundationModule` (for `AuthThrottlerGuard`'s DI graph on
  the existing `resend` route) — no new module import was needed for
  `JwtAuthGuard`'s own DI graph.
- **Response shape** (`GuardianConsentStatusResponse`,
  `guardian-consent.service.ts`): `consentStatus` (`"pending" |
  "confirmed"`, straight off the `Guardian` row), `guardianEmail` (for a
  future "change guardian email" UI action this PR doesn't build),
  `canResend` (a `boolean`, computed with the exact same condition
  `resendConsent()` already gates a real resend on —
  `consentStatus === 'pending'` — so the frontend never has to re-derive
  that business rule), and `consentTimestamp` (`null` until confirmed).
- **"Caller has no `Guardian` row" → a real 404**, never a silent null
  200 — matches this codebase's own established convention
  (`ClubsService.assertClubExists`, `UsersService.assertUserExists`).
  This one query (`prisma.guardian.findUnique({ where: { minorUserId } })`
  returning `null`) covers two cases the caller's side genuinely cannot
  distinguish and doesn't need to: the caller isn't a minor at all, or a
  data-invariant violation (a minor with no `Guardian` row, which
  `RegistrationService` should never produce but isn't guaranteed by a DB
  constraint).
- **Reads fresh from Postgres on every call** — `GuardianConsentService.getConsentStatus`
  does a plain `findUnique`, never caches or trusts anything off the JWT
  (which structurally can't carry `consentStatus` anyway — `token.types.ts`).
  Proven directly by a dedicated unit test that mutates the underlying row
  between two calls and confirms the second call reflects the change.
- `:sub` (the caller's own id, off the verified JWT via `@CurrentUser()`)
  is always what's looked up — there is no path param on this route at
  all, so it can never be used to read another user's guardian-consent
  state, unlike `GET /users/:id`'s ownership-check pattern.

### Part 2 — change-password, deactivate/delete/reactivate-account

All four new routes live on the existing `AuthController`/`AuthService`
(`auth.controller.ts`/`auth.service.ts`) rather than a new module — they're
account-lifecycle actions on the same `User` row `login`/`refresh`/`logout`
already operate on, and `AuthModule` already imports `AuthFoundationModule`
(so `JwtAuthGuard` was already available via DI with no new import).

- **`POST /auth/change-password`** — `JwtAuthGuard`. `userId` comes from
  the verified JWT (`@CurrentUser()`), never a request-body field — a
  caller can only ever change their own password via this endpoint.
  Fetches the real, current `passwordHash` fresh from Postgres and reuses
  `PasswordService.verify` (the exact call `login()` uses), never
  reimplementing argon2 logic. `newPassword` validation is exactly
  `@IsString() @MinLength(8)` — the identical rule `RegisterDto.password`
  uses, deliberately not stricter or looser, per the brief. Error posture
  is deliberately distinct from `login()`'s generic message: this is an
  authenticated user who already proved identity via a valid JWT, so
  there's no enumeration concern the way login's generic error protects
  against (there's nothing to enumerate — the caller already knows their
  own account exists); "Current password is incorrect" is fine here and
  still never leaks hash internals. **Revokes every other active session
  on success** (`tokenService.revokeAllSessionsForUser`) — a considered
  decision, not skipped: this is a one-line reuse of the exact mechanism
  `logout(allSessions=true)` and `PasswordResetService.resetPassword`
  already use for the identical "credential changed, kill other sessions"
  scenario, and a changed password that leaves old sessions valid defeats
  much of the point of changing it.
- **`POST /auth/deactivate-account`** — `JwtAuthGuard`. Requires `password`
  re-entry as a confirmation step (a hard requirement from the brief, not
  optional scope: a bare POST with no re-auth must never be able to
  deactivate an account), verified fresh against Postgres via
  `PasswordService.verify`. On success: `accountStatus` →
  `"deactivated"`, and **revokes every existing session** — deactivation
  blocking *future* logins is meaningless if the caller's current
  still-valid access/refresh tokens keep working, so this is a required
  consequence, not scope creep (proven by a dedicated e2e assertion: the
  refresh token minted just before deactivation is confirmed unusable
  immediately after).
- **`POST /auth/delete-account`** — same shape/guard/re-auth requirement
  as deactivate. Sets `accountStatus` → `"pending_deletion"` —
  **deliberately does NOT hard-delete the `User` row** (a hard requirement
  from the brief), proven directly by an e2e assertion that the row still
  exists and is still findable by email immediately after. This is a
  minors' data platform with real GDPR/NDPA implications (CLAUDE.md's
  safeguarding non-negotiables, this project's DPIA history) and
  retention/erasure policy is **explicitly not decided here** — see the
  Decision Log candidate below. Revokes every session, same reasoning as
  deactivation.
- **`POST /auth/reactivate-account`** — deliberately **unauthenticated**
  (`{ email, password }` body, no `JwtAuthGuard`): a deactivated account's
  existing tokens are already revoked by `deactivateAccount()`, so there
  is no JWT to gate this behind. Same credential-verification trust level
  and timing-safety posture as `login()` itself, including the identical
  fixed dummy-hash comparison so an unknown email takes the same real
  argon2id work as a known one. Carries `@AuthRateLimit()` — same
  brute-force-protection reasoning as `login`/`register`, on the same
  shared `'auth'` named-throttler bucket (see the config-wiring-fix entry
  above). **Only a genuinely `"deactivated"` account is flipped back to
  `"active"`** and issued a fresh token pair — "log in, but first
  un-deactivate." An already-`"active"` account with correct credentials
  is treated as a plain, no-state-change login (this endpoint is a strict
  superset of `login()` for that case) rather than rejected — there's no
  reason to punish a caller who didn't realize reactivation wasn't
  necessary. **A `"pending_deletion"` account is explicitly NOT
  reactivated** — rejected with the same generic `"Invalid credentials"`
  an unknown email/wrong password gets, deliberately not a distinct
  message, since this PR builds no self-service undo path for a deletion
  request and doesn't want to even confirm to an unauthenticated caller
  that the account exists in that state.
- **`AuthService.login()`** now rejects a non-`"active"` account —
  checked **after** password verification succeeds, deliberately: this
  distinct message is only ever revealed to someone who already proved
  they know the correct password, so it doesn't weaken the existing
  non-enumeration posture (an attacker without the real password still
  only ever sees the generic `"Invalid credentials"`). A `"deactivated"`
  account gets a specific, actionable message pointing at
  `reactivate-account`; `"pending_deletion"` (and any future non-`"active"`
  state) deliberately gets the same generic message a wrong password
  would, for the same "don't confirm this state to anyone" reasoning as
  `reactivateAccount()` above.

### `User.accountStatus` — a genuine schema addition, Decision Log candidate

`accountStatus String @default("active")` (`prisma/schema.prisma`,
migration `20260823011617_add_user_account_status`) is a real addition
beyond Section 3's literal `User` field list — flagged here, not added
silently, per CLAUDE.md's "the data model is a fixed spec" rule. Mirrors
the existing `consentStatus`/`verificationStatus` string-enum convention
already used twice in this same schema (rather than a `Boolean` plus a
separate deletion flag): `"active"` (default) | `"deactivated"`
(self-service reversible, via `reactivate-account`) | `"pending_deletion"`
(self-service, **not** reversible via any endpoint in this PR).

**RESOLVED (Decision Log #42, Build Plan Section 9) and implemented
(`sprint-2/account-deletion-sweep`) — see
`modules/account-deletion/README.md` for the full architecture.** Short
version: a 30-day grace period from a new `User.pendingDeletionAt`
timestamp, then a real hard `DELETE` of the `User` row (not
anonymization) via a scheduled `AccountDeletionSweepService`, with a
decoupled `ConsentAuditRecord` snapshotting the minimum needed to prove
guardian consent occurred before the `Guardian` row (which would
otherwise block the hard-delete outright — `Guardian.minorUserId` is a
real `ON DELETE RESTRICT` foreign key, confirmed against the live
migration SQL) is itself deleted; that record gets its own independent
6-month purge timer. What was still genuinely undecided at the time this
paragraph was originally written, resolved as of Decision Log #42:

**This PR deliberately does not decide retention/erasure policy — that's
an open Decision Log candidate for real founder/legal input**, not
resolved unilaterally here, per the brief's own explicit instruction:

- What the actual retention window for a `"pending_deletion"` account
  should be before any further action (if any) is taken.
- Whether erasure ever becomes a true hard delete of the `User` row (and,
  if so, what happens to rows that reference it — `Post`, `Comment`,
  `Like`, `Follow`, etc. — none of which `ON DELETE CASCADE` today).
  **RESOLVED on direction (Decision Log #42): yes, a real hard `DELETE`,
  not anonymization. The parenthetical's own question — what happens to
  referencing `Post`/`Comment`/`Like`/`Follow`/etc. rows — is still open**,
  now tracked as its own Decision Log #44 candidate (see
  `modules/account-deletion/README.md`): every one of those foreign keys
  is `ON DELETE RESTRICT`, confirmed directly against the real migration
  SQL, so a hard-delete attempt on any account with real activity fails
  outright rather than cascading or silently orphaning. Left genuinely
  unresolved, not guessed at, by `sprint-2/account-deletion-sweep` —
  such an account is simply left in `pending_deletion`, reported as
  blocked, and re-attempted on every future sweep run.
- Whether a minor's `Guardian` row needs its own, separate erasure
  handling distinct from the minor's own `User` row. **RESOLVED
  (Decision Log #42) and implemented**: yes — see
  `modules/account-deletion/README.md`'s `ConsentAuditRecord` design.
- Whether `"pending_deletion"` should ever have a self-service undo
  window at all — this PR's `reactivateAccount()` explicitly refuses to
  provide one, but that's an implementation choice pending the real
  policy decision, not the policy decision itself. **Still open** —
  Decision Log #42 resolved the grace-period *duration* (30 days) and
  what happens at the end of it, not whether that window is ever
  self-service-undoable; `sprint-2/account-deletion-sweep` does not
  change `reactivateAccount()`'s existing refusal.
- Whether `AuthUserSummary`/`AuthResponse` (`auth-response.mapper.ts`)
  should ever expose `accountStatus` to the caller directly, the way
  `isMinor`/`verificationStatus` already are — this PR deliberately did
  **not** add it there (out of scope; the existing four endpoints
  communicate account state via HTTP status/response body shape, not a
  new field on every login/register response), but a future
  account-settings UI may want it.

### Verification

**Real, directly measured — not estimated**, per this PR's own brief and
this file's own established standard for that:

- Mocked unit suite (`npx jest`, `services/api`) — confirmed baseline by
  stashing this branch's own changes and re-running against a clean
  checkout: **34 suites / 356 tests, 0 failures**. After this branch:
  **34 suites / 386 tests, 0 failures** (30 new tests, no new suite — new
  `describe` blocks added to `auth.service.spec.ts`,
  `auth.controller.http.spec.ts`,
  `guardian-consent/guardian-consent.service.spec.ts`, and
  `guardian-consent/guardian-consent.controller.spec.ts`).
  `auth.controller.http.spec.ts` and `guardian-consent.controller.spec.ts`
  both needed a new `.overrideGuard(JwtAuthGuard)` in their
  `TestingModule` setup (same pattern
  `users/users.controller.http.spec.ts` already established) — both
  controllers now have at least one real `JwtAuthGuard`-protected route,
  and neither test file's `TestingModule` provides a real
  `TokenService`/`PrismaService` for the real guard to depend on.
- e2e suite (`npm run test:e2e`, real Postgres/Redis via `docker compose
  up -d`) — before this branch: **6 suites / 37 tests, 0 failures**. After:
  **7 suites / 39 tests, 0 failures** — one new file,
  `test/account-lifecycle.e2e-spec.ts`, two new `describe` blocks (each
  with its own app instance/own in-memory `AuthThrottlerGuard` bucket,
  deliberately, so the file's real HTTP calls to `login`/
  `reactivate-account` — both `@AuthRateLimit()`-decorated, sharing one
  `'auth'` named-throttler bucket — stay under the default 5-requests/60s
  limit per block; full reasoning in the file's own header comment,
  following the same already-documented constraint
  `feed-reactions.e2e-spec.ts`/`follow.e2e-spec.ts`/`clubs.e2e-spec.ts`
  hit for `POST /auth/register`). Covers, against real Postgres: the
  brief's required minimum (deactivate → login fails with a distinct
  message → reactivate → login succeeds), a real session-revocation proof
  (the refresh token minted just before deactivation is confirmed
  unusable immediately after), a real change-password argon2id round trip
  (old password stops working, new one — freshly hashed and stored in
  Postgres, confirmed via a direct row read — works), and the
  delete-account/`pending_deletion` exclusion (row provably still exists
  post-delete, `reactivate-account` provably refuses to undo it, a normal
  login stays rejected). `GET /auth/guardian-consent/status` was
  deliberately **not** given its own e2e file — per `test/README.md`'s own
  guiding principle, it's a plain Prisma read with no raw SQL, no
  transaction/isolation-level reasoning, and no novel relation/constraint,
  so the mocked unit coverage in
  `guardian-consent.service.spec.ts`/`guardian-consent.controller.spec.ts`
  is the right (and much faster) layer for it, matching how this codebase
  has treated comparable plain-read endpoints elsewhere.
- Migration: `prisma/migrations/20260823011617_add_user_account_status/migration.sql`
  — a single `ALTER TABLE "User" ADD COLUMN "accountStatus" TEXT NOT NULL
  DEFAULT 'active'`, applied and verified against both the local dev
  database and (via `test/global-setup.ts`, automatically) the
  `soccernity_test` e2e database.

## Status update — `guardianConsentStatus` on `POST /auth/verify-email` (`sprint-2/verify-email-consent-status-field`, Decision Log #38)

`POST /auth/verify-email`'s response gained a third field,
`guardianConsentStatus`, alongside the pre-existing `verified`/`userId` —
additive, neither existing field renamed or removed. This closes the
specific gap `sprint-1/f7-club-picker-code`'s report flagged and left open:
`{ verified, userId }` carried no way for `apps/web`'s `VerifyEmailPage.tsx`
to tell a fully-verified user apart from a verified-but-still-restricted-
pending minor, so every verified user landed on the same generic "Verified"
state regardless of guardian-consent status.

**Values**: `'not_applicable'` (non-minor, or — treated identically, since
this is a data-invariant question unrelated to the token being verified —
a minor with no `Guardian` row at all) | `'pending'` | `'confirmed'`, the
latter two being `Guardian.consentStatus`'s own real, current value,
untouched. Typed as a plain `string` on `RegistrationService.VerifyEmailResult`
(not a narrower union), deliberately mirroring
`GuardianConsentStatusResponse.consentStatus`'s own established convention
in `guardian-consent.service.ts` — see that type's comment for why (a
future value, e.g. Decision Log #34's still-unbuilt guardian-decline flow
adding `'declined'`, shouldn't require a type change here to pass through).

**Reused, not reinvented**: `GuardianConsentService.getConsentStatusForUser`
(`guardian-consent/guardian-consent.service.ts`) — previously `private`,
already the method `getConsentStatus()` (the `GET
/auth/guardian-consent/status` handler) itself calls — was made `public`
and is now injected directly into `RegistrationService` via
`GuardianConsentModule`'s new `exports: [GuardianConsentService]`. There is
exactly one place in this codebase that queries `Guardian` by
`minorUserId` and shapes the result; `RegistrationService.verifyEmail`
calls it and maps its `null` return (no `Guardian` row) to the
`'not_applicable'` sentinel — it does not re-query `Guardian` itself, and a
test in `registration.service.spec.ts` proves this directly (the mocked
`PrismaService` fake has no `guardian.findUnique` wired up at all; a direct
query would throw rather than silently pass).

**No circularity**: `GuardianConsentModule` importing into
`AuthRegistrationModule` (`registration.module.ts`) follows the exact same
shape as the pre-existing `ClubsModule` import for `sprint-2/auto-join-on-signup`
— neither module imports anything that imports `AuthRegistrationModule`
back.

**Verification**: mocked suite before this change (measured directly, by
stashing this branch's changes and re-running against a clean checkout of
`sprint-2/verify-email-consent-status-field`'s base) — **42 suites / 481
tests, 0 failures**; after — **42 suites / 489 tests, 0 failures** (8 new:
2 in `guardian-consent.service.spec.ts`, 4 in `registration.service.spec.ts`,
2 net-new in `registration.controller.spec.ts`, whose existing
`verify-email` success test was also extended in place to assert the new
field rather than only adding new cases). `npm run test:e2e` was not
re-run — this change is a plain `findUnique`-backed enrichment with no raw
SQL, no transaction/isolation-level reasoning, and no novel Prisma relation
or constraint (`test/README.md`'s own three e2e triggers), matching the
precedent already established for `GET /auth/guardian-consent/status`
itself, which has no e2e coverage for the identical reason (see this
file's own "Status update" note on `test/account-lifecycle.e2e-spec.ts`
above). `nest build` and `npm run lint` both clean.

**Safeguarding fields untouched**: `User.isMinor`, `User.guardianId`
(n/a — this schema links `Guardian.minorUserId` → `User`, not the reverse;
no `User.guardianId` column exists to touch),
`Guardian.consentStatus`/`consentToken`/`consentTimestamp` are read-only in
every line this change touches — nothing here writes to any of them.

**Decision Log candidate, not resolved here**: `Guardian.consentStatus`'s
only two real values today are `'pending'`/`'confirmed'` — if Decision Log
#34's guardian-decline endpoint ever ships and adds a `'declined'` value,
someone needs to decide what `guardianConsentStatus` on this endpoint
should show for that case (pass it through as-is, matching this field's
current "mirror the raw column" design, or collapse it into `'pending'`
for the frontend's purposes). Not decided or guessed at in this PR.
