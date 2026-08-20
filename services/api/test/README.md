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

The original PR (#59) added two spec files as an initial representative
slice. `sprint-2/e2e-coverage-expansion` (this PR) adds three more,
closing the specific backlog items #59 itself flagged (feed like/comment/
save, follow/notification wiring, and the counter-increment logic behind
all of them) — **still not retroactive e2e coverage of every endpoint**,
see the remaining gaps listed below.

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
- `feed-reactions.e2e-spec.ts` (added by sprint-2/e2e-coverage-expansion)
  — `FeedService.likePost`/`unlikePost`/`addComment`/`savePost`/
  `unsavePost` against real Postgres: the `Like` row + `Post.likeCount`
  increment landing in the same transaction, double-like idempotency
  (exactly one `Like` row, `likeCount` +1 not +2), unlike idempotency at
  the "already unliked" boundary (never negative), two distinct `Comment`
  rows from the same user producing `commentCount = 2`, and save/unsave
  idempotency. Also directly queries the real `Notification` table (not
  the HTTP response) to prove recipient direction — liking/commenting
  creates a `Notification` addressed to the **post's author**, never the
  actor — the no-self-notification case for both (author acting on their
  own post → zero `Notification` rows), and that a double-like produces
  exactly one `Notification` row, not two.
- `follow.e2e-spec.ts` (added by sprint-2/e2e-coverage-expansion) —
  `UsersService.followUser`/`unfollowUser`/`getFollowers`/`getFollowing`
  against real Postgres: self-follow rejected with 400 and no `Follow` row
  created, follow/unfollow idempotency (exactly one `Follow` row and
  exactly one `Notification` row on a double-follow, recipient direction
  verified directly — the followed user's `userId`, `payloadRefId` the
  follower's own id), and `GET /users/:id/followers`/`/following` checked
  against `Follow` rows seeded directly via Prisma (not via the follow
  endpoint's own write path, which is already covered separately).
- `counters.e2e-spec.ts` (added by sprint-2/e2e-coverage-expansion) — the
  direct, real-Postgres proof of the "denormalized cache must never
  drift" comment on `Post.likeCount`/`commentCount` in `schema.prisma`:
  asserts, at every step of a real like → like (idempotent) → unlike →
  unlike (idempotent) → comment → comment sequence, that the cached
  counters read back from Postgres equal `Like.count()`/`Comment.count()`
  for that post, not just once at the end.

**A real, discovered gap, not a production bug — flagged, not fixed
here:** writing `feed-reactions.e2e-spec.ts`/`follow.e2e-spec.ts`/
`counters.e2e-spec.ts` against real `POST /auth/register` (the same
`registerAndLogin()` pattern `auth.e2e-spec.ts`/`clubs.e2e-spec.ts` use)
hit real 429s from `AuthThrottlerGuard` well before those files' own tests
finished — each of these three files' coverage genuinely needs more than
5 distinct users across one spec file's real HTTP traffic. Investigating
found that `AUTH_RATE_LIMIT_MAX`/`AUTH_RATE_LIMIT_WINDOW_MS`
(`rate-limit.module.ts`'s env-driven module-level throttler config) are
**not actually consulted** by any of the four routes that currently apply
`@AuthRateLimit()` (`register`, `login`, `forgot-password`,
`guardian-consent/resend`): every call site invokes the decorator with no
arguments, so its own hardcoded imported defaults
(`DEFAULT_AUTH_RATE_LIMIT = 5`, `DEFAULT_AUTH_RATE_LIMIT_WINDOW_MS =
60_000`) win at the route level regardless of what the module-level
config says — an env var that looks configurable but currently has zero
effect on any decorated route. This is a real config-wiring gap worth a
follow-up ticket, not something this PR fixes (coverage-only, no
production changes, per this PR's own brief). The workaround used instead
is scoped entirely to test setup: these three files seed their `User`
rows directly via Prisma (the same "seed directly via Prisma" precedent
`clubs.e2e-spec.ts` already set for `ClubPage`) and mint a real access
token via the real, unmocked `TokenService` pulled from the test's own
NestJS DI container (`app.get(TokenService)`) rather than going through
`POST /auth/register` — every downstream request in these files still
exercises the real `JwtAuthGuard` → `TokenService.verifyAccessToken`
chain end to end; only register's own HTTP/rate-limiter/argon2id path is
bypassed, and that path is already fully covered by `auth.e2e-spec.ts`.
See each file's own `createUser()` helper comment for the full writeup.

**Everything else remains e2e-uncovered — an intentionally deferred
backlog item, not a gap this PR claims to close.** In particular:
pagination/field-shape coverage for `GET /posts/feed`, `GET
/posts/:id/comments`, and `GET /clubs` remains deliberately out of scope
here (ordinary list/read logic is the mocked unit suite's job, per the
guiding principle above); `GET /posts/:id` itself; and every other
endpoint in `auth/` (refresh, logout, forgot/reset-password,
guardian-consent, verify-email) still has mocked-Prisma coverage only.
Whoever next touches raw SQL, transaction reasoning, or a novel Prisma
relation/constraint in one of those areas should add a sibling
`*.e2e-spec.ts` here, per the guiding principle above — not treat this PR
as having already covered them.

## Running locally

1. `docker compose up -d` (repo root) — real local Postgres + Redis.
2. `cp .env.test.example .env.test` at the **repo root** (sibling of
   `.env.example`/`.env`), if `.env.test` doesn't already exist.
   `.env.test.example` now ships both `DATABASE_URL` (pointed at a
   separate `soccernity_test` database, not your dev `soccernity` one) and
   `JWT_SECRET` (an obviously-fake test value) — see its own comment for
   why `JWT_SECRET` is there explicitly rather than assumed. Everything
   else the app reads (`REDIS_URL`, `EMAIL_PROVIDER_API_KEY`, `SENTRY_DSN`,
   the various `*_TTL_*` overrides) is genuinely safe to omit and falls
   back to your existing root `.env` / code-level defaults, same as normal
   dev. See `test/env.ts`'s comment for exactly how the two files layer
   together.
3. `npm run test:e2e` (from `services/api/`, or `npm run test:e2e
   --workspace=services/api` from the repo root).

### A real bug this layer's own first CI run caught (and fixed)

The paragraph above used to read "only `DATABASE_URL` needs a
test-specific value — everything else, including `JWT_SECRET`, is safe to
share with local dev." That was **wrong**, not just imprecise: it was only
ever true on a machine that already happened to have a real `JWT_SECRET`
sitting in a long-lived local root `.env`, left over from early dev-server
setup. `services/api/src/modules/auth/auth-foundation.module.ts`'s
`JwtModule.registerAsync` reads `JWT_SECRET` via `ConfigService` with no
fallback; as long as nothing ever called a real `jwtService.sign()`/
`.verify()` through a genuinely bootstrapped `AppModule`, that gap was
invisible — every pre-existing test in `src/**/*.spec.ts` mocks
`PrismaService` and, more importantly, most also mock or never exercise
`TokenService` end to end. This e2e layer was the first thing in the repo
to actually do that, and PR #59's own first real GitHub Actions run of
"Run e2e tests" failed immediately with:

```
Error: secretOrPrivateKey must have a value
    at TokenService.signAccessToken (...)
```

`ci.yml` only ever set `DATABASE_URL`/`REDIS_URL` as job-level env vars,
no `.env.test` file exists in CI (gitignored, never committed, never
generated by any CI step), and `.env.test.example` at the time only
declared `DATABASE_URL` — so `ConfigService.get('JWT_SECRET')` resolved to
`undefined` the moment CI ran this suite for real, something no local run
had ever surfaced because of the developer's pre-existing `.env`.

**Fix:** `JWT_SECRET` is now a job-level env var in `ci.yml` (an
obviously-fake, test-only value — never a real deployment secret) and is
also in `.env.test.example`, so a fresh clone with no pre-existing local
`.env` gets a working, genuinely self-contained e2e layer too. Nothing in
`token.service.ts` or `auth-foundation.module.ts` changed — a real
deployment missing `JWT_SECRET` still fails loudly exactly as before; the
fix is entirely test/CI configuration, not a weakening of real signing
logic. See `.env.test.example`'s and `test/env.ts`'s own comments for the
corrected, permanent framing of which config keys are genuinely optional
(code-level default, or an explicit graceful "not configured" no-op — see
`src/instrument.ts` and the two Postmark email services for that pattern)
versus required with no fallback (currently just `JWT_SECRET`).

The first run creates the `soccernity_test` database and applies every
Prisma migration to it automatically (`test/global-setup.ts`) — no manual
`createdb` or `prisma migrate deploy` step required. This is genuinely
idempotent: running `npm run test:e2e` again does not error on "database
already exists," it just reuses it (verified directly — see the PR
report).

## How this resolves in CI vs. local dev, without any environment-specific
## branching in test code

`ci.yml`'s Postgres service container is created with `POSTGRES_DB:
soccernity_test` already, and `DATABASE_URL`/`REDIS_URL`/`JWT_SECRET` are
already real job-level env vars before `npm run test:e2e` runs (the
`JWT_SECRET` entry was added by the PR #59 CI-failure fix documented
above — it was missing here for this PR's own first real CI run) — no
`.env.test` file exists in CI at all (only the committed
`.env.test.example`, which now also declares a test-only `JWT_SECRET`).
`test/global-setup.ts` and `test/load-env.ts` (via `test/env.ts`) run the
exact same code regardless: they always attempt to load `.env.test` from
the repo root via `dotenv`. In CI that load is a silent no-op (file
doesn't exist, and `DATABASE_URL`/`JWT_SECRET` are already set —
`dotenv.config()` never overrides an existing `process.env` value by
default); locally it's the thing that actually sets both, once a
developer has run `cp .env.test.example .env.test`. Same code path, two
different starting states — see `env.ts`'s own comment for the full
reasoning. Every other config key the app reads is unaffected by any of
this: it either has a code-level default or degrades to an explicit
"not configured" no-op regardless of which environment is running, so it
never needed to be listed as a job-level env var or a `.env.test.example`
entry in the first place.

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
