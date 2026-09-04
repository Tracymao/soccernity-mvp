# admin module

## Status

**Sprint 2 / `sprint-2/admin-console-account-entity` (Decision Log #54) —
Admin Console account/auth/profile slice is now built.** This closes the
"Admin Profile" gap `sprint-2/admin-panel-shell-unification` flagged (an
Admin Profile screen implying an admin-account data model that didn't
have the fields or auth path to back it) and resolves Decision Log #54.

**Still Sprint 5 scope, unbuilt**: Build Plan Section 4.8's
moderation-queue endpoints (Report review, appeal handling — Decision Log
#138's "a second admin/moderator reviews an appeal" rule has no code to
attach to yet). This module will grow to cover that when Sprint 5 starts;
nothing in Section 4.8 beyond account/auth/profile is built here.

## A real finding, not assumed: `AdminUser` already existed

Decision Log #54 was originally framed as "an admin-account data model
that doesn't exist in Section 3/4." That framing was not quite
accurate — `AdminUser` already existed in `prisma/schema.prisma` as one
of Section 3's original 20 entities (Admin & Operations Console pillar,
`Article.authorAdmin`'s target), but only carried `{ id, email, role,
articles }` — enough to attribute an `Article`, nowhere near enough to
log an admin in or back a real "Full name / Email / Role / Phone" profile
screen. The real gap this PR closes is that `AdminUser` was never fleshed
out or given its own auth path, not that no entity existed at all.

**Decision: extend `AdminUser` in place, do not introduce a second,
competing `AdminAccount` model.** `Article.authorAdmin` already points at
this model by name, and Section 3 already spec'd this entity under this
name — renaming it would be unrelated churn to an existing spec'd entity
that this PR's brief didn't ask for. New fields added: `passwordHash`,
`fullName`, `phone`, `accountStatus` (`"active"` | `"deactivated"` —
mirrors `User.accountStatus`'s existing string-enum convention; no
self-service deactivate/reactivate endpoint exists for `AdminUser` in
this PR, this field exists for a future superadmin-facing "suspend this
admin/moderator" action or a manual DB flip), `createdAt`, `updatedAt`.
Migration: `20260904175008_extend_admin_user_for_admin_console`. `role`
(`editor | moderator | superadmin`) is unchanged from Section 3's
original definition — no new roles invented.

## Why a genuinely separate login/session path, not a reuse of `AuthService`/`TokenService`

This was the task's own hard requirement, not a stylistic preference. The
full reasoning lives in `token/admin-token.service.ts`'s header comment —
short version:

- **`AdminTokenService`/`AdminRefreshTokenStore`/`AdminJwtAuthGuard`
  are separate classes**, mirroring `TokenService`/`RefreshTokenStore`/
  `JwtAuthGuard`'s shape and Build Plan Section 5.7 security posture
  closely (none of that spec is User-specific), but never sharing an
  instance, a signing secret, or a Redis key namespace with the
  User-facing versions.
- **Two independent signing secrets**: `AdminAuthFoundationModule`
  registers its own `JwtModule.registerAsync()` from `ADMIN_JWT_SECRET`,
  never `JWT_SECRET`. A token signed by one `JwtService` instance fails
  signature verification outright against the other's secret — this is
  the actual cryptographic proof of isolation.
- **A second, defense-in-depth layer on top of that**:
  `AdminAccessTokenPayload` carries an `aud: "admin-console"`
  discriminator claim, checked explicitly by
  `AdminTokenService.verifyAccessToken()`, in case the two secrets were
  ever accidentally set to the same value in some future misconfigured
  environment.
- **Two disjoint Redis key namespaces**: every key
  `AdminRefreshTokenStore` touches is prefixed `admin:refresh:*`, never
  `auth:refresh:*` — so an admin session and a User session can never
  collide or be confused for one another even at the storage layer.
- **A real, motivating reason this matters, not a hypothetical**:
  `schema.prisma`'s own comment on `User.role` has always listed
  `"admin"` as a theoretically possible value (`fan | player | admin`),
  even though no endpoint in this codebase has ever set it (confirmed by
  grep). If `AdminTokenService` reused the User-facing `TokenService`'s
  signing secret, a future bug that ever let a `User.role` be set to the
  literal string `"admin"` would let that User's ordinary access token
  forge a valid-looking admin session purely by having a matching role
  string, with nothing structurally preventing it. The separate secret
  closes that off completely, regardless of what `User.role` ever
  contains.

**What IS reused**, because both are pure, generic, stateless utility
classes with zero User-specific assumptions — reusing the class
definition is safe; reusing an instance or its underlying store would not
be:

- `PasswordService` (argon2id wrapper, no dependencies) — registered as
  its own separate provider instance in `AdminAuthFoundationModule`.
- `InvalidRefreshTokenError` / `RefreshTokenReuseDetectedError` (plain
  `Error` subclasses) and the `RefreshTokenRedisClient` interface (a
  narrow Redis client contract) — imported directly from
  `modules/auth/token/`.
- `RedisModule` and `AuthRateLimitModule` — both already-generic, already
  multiply-imported infrastructure modules in this codebase (see
  `admin-auth-foundation.module.ts`'s and `admin.module.ts`'s own
  comments for the exact precedents).
- `LoginDto` / `RefreshDto` / `LogoutDto` / `ChangePasswordDto` — pure
  request-shape validators with zero User-specific typing, re-exported
  under `Admin*` names in `dto/` for discoverability.

**Proven, not just argued**: `test/admin-auth-isolation.e2e-spec.ts`
boots the real, unmocked `AppModule` and confirms, against real
Postgres/Redis: a real User access token is rejected by every
`AdminJwtAuthGuard`-protected route; a real admin access token is
rejected by `JwtAuthGuard`-protected User routes; a real User refresh
token is rejected at `/admin/auth/refresh`; and a real admin refresh
token is rejected at `/auth/refresh`.

## Endpoints

| Method | Path | Guard | Purpose |
|---|---|---|---|
| POST | `/admin/auth/login` | none (`@AuthRateLimit()`) | Admin/moderator login. Same non-enumeration / constant-time-dummy-hash posture as `POST /auth/login`. |
| POST | `/admin/auth/refresh` | none | Rotates a refresh token, Section 5.7-style. |
| POST | `/admin/auth/logout` | none (optional bearer header for `allSessions`) | Single-session logout; `allSessions: true` + a valid access token revokes every session. |
| POST | `/admin/auth/change-password` | `AdminJwtAuthGuard` | Requires current password; revokes every other session on success. |
| GET | `/admin/profile` | `AdminJwtAuthGuard` | Own profile — Full name, Email, Role, Phone, accountStatus, createdAt, updatedAt. |
| PATCH | `/admin/profile` | `AdminJwtAuthGuard` | Edits `fullName`/`phone` only — `role`/`email`/`accountStatus` are never self-editable (rejected outright by the global `ValidationPipe`'s `forbidNonWhitelisted`). |

`@AuthRateLimit()` on `/admin/auth/login` is reused as-is from the
User-facing auth module (see `admin-auth.controller.ts`'s own comment) —
it's generic, IP-based rate-limiting infrastructure with zero User-typed
internals, and it gets its own independent per-route counter (keyed by
controller class + handler + throttler name + IP) even though it shares
the same `'auth'` named-throttler config/limits as `/auth/login`.

## Decision Log candidates this PR surfaces (not resolved here)

1. **`AdminUser` field-list correction to Decision Log #54** — see "A real
   finding, not assumed" above. #54 should be updated to reflect that a
   minimal `AdminUser` already existed; this PR extended it rather than
   building a net-new entity.
2. **No dedicated rate-limiting was added for `/admin/auth/login` beyond
   reusing the shared `'auth'` bucket** — reusing `@AuthRateLimit()`
   (see above) was judged sufficient and safe for this PR, but a
   stricter, admin-specific limit (lower max attempts, given admin
   accounts are a smaller, higher-value target set) was considered and
   deliberately not built, to keep this PR's verification scope to
   schema + auth-isolation + CRUD. A real follow-up candidate, not a
   permanent decision.
3. **No self-service admin registration endpoint exists, by design.**
   Admin/moderator accounts must currently be provisioned via direct
   database insert (see `test/admin-auth-isolation.e2e-spec.ts`'s own
   `seedAdmin()` helpers for the exact shape). A "create admin" endpoint
   raises its own access-control question — who is allowed to call it,
   a real bootstrapping problem for the very first admin account — that
   is out of this PR's scope. A future superadmin-only "invite
   admin/moderator" endpoint, or a one-off seed script, is a real,
   named follow-up candidate.
4. **Email is treated as read-only via `PATCH /admin/profile`** — a
   judgment call, not a literal spec requirement (Section 4.8 has no
   pre-existing spec line for this endpoint at all; it's a genuine
   addition). Mirrors `UpdateUserDto`'s own precedent of excluding email
   from self-edit. Whether admin email should ever be self-service
   editable (and what re-verification that would need) is left open.
5. **`AdminUser.accountStatus` has no endpoint that writes it in this
   PR** — it exists so a future superadmin-facing "suspend this
   admin/moderator" action can instantly block login, but nothing here
   builds that action. A real, named follow-up for whenever
   admin-management (as opposed to self-service profile) endpoints are
   built.

## Testing

Mocked unit/HTTP-wiring suite (`src/modules/admin/**/*.spec.ts`) covers
ordinary logic — `AdminTokenService`/`AdminRefreshTokenStore` token
issuance/rotation/revocation/isolation, `AdminJwtAuthGuard` bearer-token
handling, `AdminAuthService`/`AdminProfileService` business logic, and
both controllers' HTTP-layer/DTO-validation behavior — per
`test/README.md`'s own "mocked unit tests stay the fast, primary layer"
principle. A real e2e spec
(`test/admin-auth-isolation.e2e-spec.ts`) was added specifically for the
one thing a mock cannot prove: that the two independently-configured
`JwtService`/refresh-token-store registrations in the real, single
`AppModule` DI graph cannot validate/consume each other's tokens — see
that file's own header comment for the full reasoning, matching
`test/README.md`'s "add a real e2e test when a security property depends
on the whole, really-bootstrapped app" spirit (a genuinely novel Prisma
model extension, `AdminUser`'s new unique-email-backed columns, is also
exercised against real Postgres for the first time here).
