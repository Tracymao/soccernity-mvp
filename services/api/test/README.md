# services/api/test — real-Postgres e2e layer

## Why this exists

Reviewing PR #58 (`sprint-2/club-pages`) surfaced a real, systemic gap:
`ClubsService.joinClub`'s raw `$executeRaw` `INSERT ... ON CONFLICT DO
NOTHING` against the real `_ClubMembership` implicit join table had only
ever been exercised by a mock returning `0` or `1` on command. More
broadly — confirm this yourself by reading any `*.controller.http.spec.ts`
or `*.service.spec.ts` file in `src/`: every one of them either mocks
`PrismaService` (`{ provide: PrismaService, useValue: <mocked object> }`)
or constructs the service under test with a hand-built mock Prisma object.
**Nothing in this codebase, before this PR, ever connected to the real
docker-compose Postgres/Redis containers.** Several PR reports and module
READMEs this sprint described their own verification as "real HTTP
verification against Postgres/Redis via docker-compose, not mocked" — that
description was inaccurate. See the corrected claims in `CLAUDE.md` and
`src/modules/{feed,users,clubs}/README.md` for exactly what each of those
claims actually meant (real NestJS DI/guard/routing wiring and service
logic exercised against a **mocked** Prisma client) versus what this PR's
new layer, described below, genuinely covers for the first time.

## The two test layers — both stay, this is additive

| | `../jest.config.js` (existing) | `jest-e2e.config.js` (this PR) |
|---|---|---|
| File pattern | `*.spec.ts`, anywhere under `src/` | `*.e2e-spec.ts`, only under `test/` |
| Run with | `npm run test` | `npm run test:e2e` |
| Prisma | Always mocked | Real `PrismaClient`, real Postgres |
| Speed | Fast (the primary feedback loop) | Slow — real HTTP + real DB + real argon2id |
| Purpose | Ordinary logic, guard wiring, DTO validation, controller/service behavior | Raw SQL, transaction/isolation-level reasoning, genuinely novel Prisma relations/constraints |

**`npm run test:e2e` is a deliberately separate script, not folded into
`npm run test`.** The existing fast mocked-unit-test feedback loop is
unaffected by this PR — same file count, same pass count as before it (see
the PR report for the exact before/after numbers). `jest.config.js`'s
`testRegex` (`*.spec.ts`, `rootDir: 'src'`) and `jest-e2e.config.js`'s
(`test/*.e2e-spec.ts`, `rootDir: '..'`) are disjoint by both naming
convention and directory — a file can only ever match one of the two.

## Guiding principle for future PRs: not everything needs an e2e test

Mocked unit tests remain the fast, primary layer for ordinary logic — most
new code should keep getting `*.spec.ts` coverage exactly as it has been,
nothing about this PR changes that default. Add a real e2e test (alongside
the mocked unit tests, not instead of them) specifically when a code path
involves:

1. **Raw SQL** — anything using `$executeRaw`/`$queryRaw`/`$executeRawUnsafe`,
   the way `ClubsService.joinClub` does. A mock can't tell you whether the
   SQL is even syntactically valid against the real schema, let alone
   whether its `ON CONFLICT` behavior matches what the code assumes.
2. **Transaction/isolation-level reasoning** — anywhere the correctness
   argument depends on what two concurrent requests can or can't observe
   under Postgres's actual isolation level (READ COMMITTED by default).
   `clubs.service.ts`'s own comment on why a `findFirst`-then-conditionally-
   update pattern was rejected in favor of the raw-SQL approach is exactly
   this kind of reasoning — it can only be validated against a real engine.
3. **A genuinely novel Prisma relation or constraint** — a new
   `@@unique`, a new implicit many-to-many relation, a new `@relation`
   name, anything where Prisma's generated behavior isn't yet proven
   against a live database. `ClubPage.members`/`User.clubAffiliation`'s
   pre-existing relation-naming bug (schema.prisma's comment on
   `ClubPage.members`) is exactly the kind of thing a mock would never
   have caught — it was found by running the real Prisma client, not by a
   more careful mock.

These three are exactly what PR #58's `joinClub` needed and didn't have.
If none of the three apply, a mocked unit/HTTP-wiring test is almost
certainly the right (and much faster) choice.

## What's covered so far — and what isn't yet

This PR adds two spec files as an initial representative slice, **not**
retroactive e2e coverage of every endpoint:

- `auth.e2e-spec.ts` — register → login → fetch-own-profile, through a
  real NestJS app instance, real Postgres, real argon2id hashing, and a
  real unique-email constraint violation surfacing as a 409, not a 500.
  **Gap found while building this spec, not silently worked around:** the
  brief for this asked for a register → login → `GET /auth/me` round
  trip. `GET /auth/me` (Build Plan Section 4.1) does not exist anywhere in
  this codebase — confirmed by grep; every reference to it in
  `auth/README.md`/`users/README.md`/`users.controller.ts` is a note that
  it's a separate, not-yet-built endpoint. Building it here would be scope
  creep for an e2e-infrastructure PR, so this spec's third leg uses `GET
  /users/:id` (self-scoped, Section 4.2, genuinely built) instead — same
  bearer-token → `JwtAuthGuard` → `TokenService.verifyAccessToken` → fresh
  Prisma read chain `GET /auth/me` would exercise, just via an existing
  route. **Building `GET /auth/me` for real is a Decision Log/backlog
  candidate this PR surfaces, not resolves.**
- `clubs.e2e-spec.ts` — `POST /clubs/:id/join`, called twice for the same
  (user, club) pair, against the real `_ClubMembership` table: asserts
  exactly one row exists and `ClubPage.memberCount` is exactly one higher
  than its starting value, not two. Also covers two different users
  joining the same club, the real (unmocked) `JwtAuthGuard` 401 case, and
  a real 404 for a non-existent club id.

**Everything else remains e2e-uncovered — an intentionally deferred
backlog item, not a gap this PR claims to close.** In particular: every
other endpoint in `feed/`, `users/`, `clubs/`, `auth/` (refresh, logout,
forgot/reset-password, guardian-consent, verify-email) has mocked-Prisma
coverage only. Whoever next touches raw SQL, transaction reasoning, or a
novel Prisma relation/constraint in one of those modules should add a
sibling `*.e2e-spec.ts` here, per the guiding principle above — not treat
this PR as having already covered them.

## Running locally

1. `docker compose up -d` (repo root) — real local Postgres + Redis.
2. `cp .env.test.example .env.test` at the **repo root** (sibling of
   `.env.example`/`.env`), if `.env.test` doesn't already exist. Only
   `DATABASE_URL` needs a test-specific value (pointed at a separate
   `soccernity_test` database, not your dev `soccernity` one) — everything
   else (`JWT_SECRET`, `REDIS_URL`, etc.) is read from your existing root
   `.env`, same as the app in normal dev. See `test/env.ts`'s comment for
   exactly how the two files layer together.
3. `npm run test:e2e` (from `services/api/`, or `npm run test:e2e
   --workspace=services/api` from the repo root).

The first run creates the `soccernity_test` database and applies every
Prisma migration to it automatically (`test/global-setup.ts`) — no manual
`createdb` or `prisma migrate deploy` step required. This is genuinely
idempotent: running `npm run test:e2e` again does not error on "database
already exists," it just reuses it (verified directly — see the PR
report).

## How this resolves in CI vs. local dev, without any environment-specific
## branching in test code

`ci.yml`'s Postgres service container is created with `POSTGRES_DB:
soccernity_test` already, and `DATABASE_URL`/`REDIS_URL` are already
real job-level env vars before `npm run test:e2e` runs — no `.env.test`
file exists in CI at all (only the committed `.env.test.example`).
`test/global-setup.ts` and `test/load-env.ts` (via `test/env.ts`) run the
exact same code regardless: they always attempt to load `.env.test` from
the repo root via `dotenv`. In CI that load is a silent no-op (file
doesn't exist, and `DATABASE_URL` is already set — `dotenv.config()`
never overrides an existing `process.env` value by default); locally it's
the thing that actually sets `DATABASE_URL`. Same code path, two
different starting states — see `env.ts`'s own comment for the full
reasoning.

## `test/reset-database.ts`

Called in `beforeEach` of every e2e spec (not `beforeAll`), so each test
starts from a fully empty, isolated database — not just each spec file.
Truncates every real table in the `public` schema, discovered by querying
Postgres's own `pg_catalog` directly rather than trusting Prisma's DMMF or
a hand-maintained list. This is deliberate, not incidental: DMMF only
reflects `model`-declared entities in `schema.prisma` — it does **not**
include implicit many-to-many join tables like `_ClubMembership`, which
exist only in the real migration history. Since this whole PR exists
because `_ClubMembership` had never been exercised against a real
database, a reset helper that silently excluded it from truncation would
undermine the exact isolation this PR is trying to provide. Querying
`pg_catalog` stays correct automatically as new models/relations are
added later, with no update needed here.
