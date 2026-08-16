# users module

Build target: Sprint 1 — Section 4.2 of the MVP Build Plan.

## Status

**PR B6 (self-profile view/edit) — done.**

### Spec discrepancy flagged, not silently resolved

This PR's task brief described the target as `GET /users/me` /
`PATCH /users/me`. Build Plan Section 4.2 (User Service) does not actually
list a `/me` route — it lists:

```
GET    /users/:id
PATCH  /users/:id
GET    /users/:id/profile
POST   /users/:id/follow
DELETE /users/:id/follow
GET    /users/:id/followers
GET    /users/:id/following
```

(There is a `GET /auth/me` in Section 4.1 — Auth Service — but that's a
separate endpoint owned by B2-B4, not this module.)

This PR implements the literal spec routes, `GET /users/:id` and
`PATCH /users/:id`, scoped to **self only**: both handlers return 403 if
the `:id` path param doesn't match the authenticated user's own id (from
the verified JWT, not the path param). This satisfies the PR's actual
brief — "view/edit my own profile" — without inventing an undocumented
`/users/me` endpoint. If a `/me` convenience alias is wanted in addition
to the spec'd `:id` routes, that's a genuine addition beyond Section 4.2
and belongs on the Decision Log, not something to add unilaterally here.

### What's implemented

- `GET /users/:id` — requires a valid access token (`JwtAuthGuard`).
  Returns the caller's own profile, always via a fresh Prisma read
  (never assembled from the JWT). Fields returned: `id`, `email`,
  `phone`, `displayName`, `dateOfBirth`, `isMinor`, `role`,
  `verificationStatus`, `createdAt`, `clubAffiliationId`.
  `passwordHash` is excluded via Prisma `select` (not a post-hoc delete),
  so there's no code path where it ever leaves the database query.
- `PATCH /users/:id` — requires a valid access token. Accepts only
  `displayName` and `phone` (see `dto/update-user.dto.ts`). Any other
  field in the request body — in particular `isMinor`, `role`,
  `verificationStatus`, `email`, `dateOfBirth`, or anything
  guardian/consent-related — is rejected by the global `ValidationPipe`
  (`forbidNonWhitelisted: true`, added to `main.ts` in this PR) AND is
  structurally impossible to reach Prisma even if validation were ever
  loosened, because `UsersService`'s `toUpdateData()` only ever reads
  `displayName`/`phone` off the DTO — it never spreads the request body.

### Deliberately out of scope for this PR

- `GET /users/:id/profile` — the public-facing view of *another* user.
  Needs its own field curation (what a non-owner should see) rather than
  just an auth check, and pagination isn't relevant to a single-user
  fetch but the surrounding "who can see what" logic is a bigger piece
  of work than this PR's brief covers.
- `POST/DELETE /users/:id/follow`, `GET /users/:id/followers`,
  `GET /users/:id/following` — social graph, and per Build Plan
  Section 5.5 these are list endpoints that must be paginated. Natural
  fit for the same sprint as Follow/Feed work (Sprint 2), not this PR.

### The shared auth guard (for B5/B7 and everything after)

`JwtAuthGuard` (`../auth/guards/jwt-auth.guard.ts`) is the shared "must
have a valid access token" guard, built in this PR because it's the first
PR that needs one. Any future protected route should reuse it rather than
reimplementing bearer-token parsing:

```ts
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '<path>/modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from '<path>/modules/auth/guards/current-user.decorator';
import { AccessTokenPayload } from '<path>/modules/auth/token/token.types';

@UseGuards(JwtAuthGuard)
@Get('some-protected-route')
handler(@CurrentUser() user: AccessTokenPayload) {
  // user is exactly { sub, role } — never isMinor/consentStatus/etc.
  // Re-query Prisma for anything safety-sensitive; see UsersService.
}
```

It's registered as a provider/export on `AuthFoundationModule` (not a new
standalone module), so any module needing it just adds
`AuthFoundationModule` to its own `imports`, the same way `UsersModule`
does — see `users.module.ts`.

### Verification

Real HTTP verification (Postgres/Redis via docker-compose, real Nest
server, real users inserted directly via Prisma, tokens minted with the
`jsonwebtoken` library using the exact same payload shape and secret
`TokenService.signAccessToken` produces — no `/auth/register` or
`/auth/login` endpoint exists yet to get a real one from) is documented
in the PR report, not duplicated here.
