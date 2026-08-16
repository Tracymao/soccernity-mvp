# auth module

Build target: Sprint 1 — Section 4.1 of the MVP Build Plan.
Endpoints for this module: see the matching subsection of Build Plan Section 4.

## Status

**PR B1 (infrastructure) — done.** `/auth/register`, `/auth/login`,
`/auth/refresh`, `/auth/logout` etc. (Section 4.1) are NOT implemented yet
— those are PRs B2-B4. This module currently exports only the pieces those
endpoints will consume, per Section 5.7's concrete auth spec:

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

- `auth-foundation.module.ts` — the module B2-B4's real `AuthModule`
  should import to get all of the above via DI.

No controllers, no DTOs, no wiring into `app.module.ts` yet — that's what
makes this infra-only.

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
