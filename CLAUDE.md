# Soccernity — Claude Code project context

Read this before doing anything. It's the short version of two much longer documents that live in `docs/` — read those in full before making any decision this file doesn't cover.

- `docs/Soccernity_Inventors_Log_Book_v2.13.docx` — the strategic and product record. Vision, market, full feature catalogue, competitive positioning, safeguarding principles, Figma design audit.
- `docs/Soccernity_MVP_Build_Plan_v1.7.docx` — the tactical execution plan. MVP scope, data model, API contract, sprint backlog, infrastructure decisions, definition of done. **This is the one to work from day to day.**

## What Soccernity is

A platform giving unaffiliated grassroots football players — and the fans, coaches, and communities around them — an identity, a community, and (in a later phase) a safe path to being discovered. MVP v1 deliberately does **not** build the AI-scouting or careers pillars yet — see "What's explicitly out of scope" below before adding anything ambitious.

## Branch strategy

- `main` — production source of truth. Protected: nothing merges without CI passing and a review.
- `staging` — pre-production, for testing a batch of merged work before it goes live.
- Task branches — one per agent task or sprint deliverable, named `sprint-<id>/<short-description>` (e.g. `sprint-d/design-tokens`, `sprint-1/guardian-consent-api`) so the sprint dependency is visible in the branch name, not just in Build Plan Section 6. Delete after merge.

`.github/workflows/deploy.yml` deploys `staging` and `main` automatically once pushed to — but its actual deploy step is a deliberate placeholder that fails loudly (`exit 1`) rather than guessing a hosting platform. See "Where things stand right now" below: hosting is Decision Log item #9, still open.

## Keeping this file current

"Where things stand right now" (below) has gone stale after nearly every
PR merge in Sprint 1 — not from neglect, but because updating it was
never part of any single PR's own definition of done, so it kept
falling to a separate cleanup sweep instead. That sweep found the same
class of gap five separate times, including once finding that this
file's own bullet about a bug was itself describing the bug as unfixed
after the fix had already merged.

The fix: **any PR that changes something described in "Where things
stand right now" — a merge landing, a Decision Log resolution, a new
gap found, a follow-up closed — updates that section in the same PR,
not a later one.** This applies to:

- Any subagent (`backend-api`, `qa-reviewer`, etc.) whose PR resolves,
  implements, or newly discovers something that section already
  describes or should describe.
- Whoever is reviewing and merging a PR on Claude's behalf, before
  calling that PR fully done.

If updating this file in the same PR genuinely isn't practical, the PR
description must say so explicitly and name the exact follow-up needed
— e.g. "CLAUDE.md not updated here, needs a status bullet noting X is
now resolved" — so it's a visible, tracked debt rather than a silent
one a future sweep has to rediscover from scratch.

## Non-negotiables

1. **Never remove or weaken the safeguarding fields on `User` or `Guardian`** (`is_minor`, `guardian_id`, `consent_status`, `consent_token`, `consent_timestamp`) or the restricted-pending state they support. This isn't a style preference — see Build Plan Section 8 and Log Book Section 10.
2. **Never treat any `safeguarding-drafter` output as approved.** It is always a draft for human legal counsel to review. Say so if you're asked to skip that review.
3. **Never introduce a new brand color.** Soccernity's palette is exactly two colors — green `#7BB929` and navy `#282E65` — documented in Log Book Section 23.4. Every other color, including dark-mode values, must be derived from those two and justified. See `.claude/agents/figma-design-system.md`.
4. **Never build Discover-pillar or Careers-pillar features** (AI Combine, Talent Passport, Scout CRM, job board, Academy Marketplace) without an explicit go-ahead. They're real, documented, and deliberately deferred — see Build Plan Section 2.2 for why.

## Stack

- Backend: Node.js + TypeScript, NestJS, PostgreSQL (via Prisma — see `services/api/prisma/schema.prisma`), Redis.
- Web: React. Mobile: React Native. Admin: React.
- Repo: npm workspaces monorepo — `apps/web`, `apps/mobile`, `apps/admin`, `services/api`, `packages/shared`.
- Start as a modular monolith inside `services/api`. Don't split into separate services until load actually demands it.

Full reasoning for every choice above: Build Plan Section 5.

## Environment variables

- One root `.env` for now, not one per workspace. Every variable currently
  in use (`DATABASE_URL`, `JWT_SECRET`, `SENTRY_DSN`, etc.) is a
  backend-only concern, consumed only by `services/api` — splitting
  config across multiple `.env` files today would just create copies to
  keep in sync for no real benefit.
- `services/api` loads the root `.env` via an explicit path built from
  `__dirname`, not by relying on `process.cwd()`. Do not "simplify" this
  back to `ConfigModule.forRoot({ isGlobal: true })` with no
  `envFilePath` — that resolves relative to the working directory at
  process start, which changes depending on *how* the process is
  launched (`npm run dev:api` from the repo root actually runs with
  `cwd` set to `services/api/`, not root, because of how npm workspaces
  scripts work). This was a real, confirmed bug, not a hypothetical one
  — see PR #8's flagged gap and its fix.
- This pattern is deliberately backend-only for now, not a rule to
  extend by default. The first time `apps/web`, `apps/mobile`, or
  `apps/admin` needs its own environment variable (a public API base
  URL, for instance), *that* app gets its own workspace-local `.env` at
  that point — don't add one preemptively.
- Never commit `.env`. `.gitignore` already excludes it — confirmed via
  `git check-ignore -v .env` during PR #8's verification.

## The data model and API contract are fixed specs, not suggestions

`services/api/prisma/schema.prisma` implements Build Plan Section 3 exactly — 20 entities. If a task needs a field or entity that isn't there, that's a Decision Log candidate (Build Plan Section 9), not something to add silently. Same for endpoints: Build Plan Section 4 is the full list, grouped by service.

## Where things stand right now

- **Sprint D is complete.** Light/dark tokens derived from the two brand
  colours (no new palette), applied across Community/Sports Hub/Admin
  Console, all six guardian-consent screens designed and refined
  (PRs #4, #5, #6, #7).
- **Sprint 0 is complete.** Local Postgres/Redis via docker-compose, a
  real migration run and verified, Sentry wired (not live — needs a
  human-created Sentry project), a real `/health` check with confirmed
  graceful degradation (PRs #8, #9, #10).
- **Sprint 1 backend is fully merged and closed out.** S1, F1, B1
  (PRs #11–#13) were the first wave. B2/B3/B4/B6 and F2/F3/F4 are all
  merged (PRs #17–#22, #24). B5 (guardian-consent confirmation
  endpoint) and B7 (restricted-pending enforcement) are also merged
  (PRs #28, #29) — `GuardianConsentGuard` exists, is tested, and reads
  `isMinor`/`consentStatus` fresh from Postgres on every request, but
  as of B7 none of Section 8.3 step 5's three target routes (public
  profile view, DMs, Banter Rooms beyond read-only) exist yet to
  actually attach it to — that's Sprint 3 work, not a Sprint 1 gap.
  (The guard's first live attachment to a real route ended up being
  none of those three — see the Sprint 2 bullet below: `POST /posts`,
  justified by Section 5.7 rather than step 5's own list.) Three
  follow-up PRs closed out remaining Decision Log candidates: DTO
  validation (#25, Decision Log #11), email case normalization (#32,
  Decision Log #16), and wiring Postmark as the real email provider
  (#33, Decision Log #17 — still not *live*; the account itself doesn't
  exist yet, same as Sentry's DSN). Test baseline recorded at the time:
  25 suites / 158 tests, 0 failures. That number has since drifted
  (measured directly during the Sprint 2 feed-service-core branch's own
  verification: 25 suites / **173** tests, still 0 failures, before any
  Sprint 2 code) — later PRs added tests without updating this line,
  another instance of the drift this file's own "Keeping this file
  current" section describes. Treat any specific count here as
  approximate; `npx jest` in `services/api` is the source of truth.
- **Sprint 1 frontend has a real gap: F5, F6, and F7 are not started.**
  F1-F4 (app shell, login, signup, forgot/reset) are real, built
  screens. F5 (`GuardianConsentPage.tsx`, route `/guardian-consent`)
  and F6 (`ProfilePage.tsx`, route `/profile`) are route stubs only —
  wired into `router.tsx` but rendering `PlaceholderPage`, waiting on
  Figma-derived screens. **F7 (`VerifyEmailPage.tsx`, route
  `/verify-email`) didn't exist at all until a Sprint 1 cleanup review
  caught it** — `POST /auth/verify-email` (B2) and the email Postmark
  now actually sends (Decision Log #17) have had no frontend page to
  land on since Sprint 1 started. It's a stub now, same pattern as
  F5/F6, but still needs its real screen. None of F5/F6/F7 block
  backend work, but Sprint 1's own exit criterion (register, verify
  email, declare age, guardian-consent-gated access) isn't actually
  walkable by a real user until at least F7 (and arguably F5) are built.
- **Sprint 2 is in progress. Schema is ready; the Feed Service's
  Section 4.3 endpoints are fully built (two slices), Follow (Section
  4.2's remaining four endpoints) and notification-trigger wiring are
  merged, and club fan pages (Section 4.4's club subset) are now built
  — see below.** Section 6's Sprint 2 scope: Feed Service (Section 4.3 —
  post/view/like/comment/save), club fan pages with auto-join on
  signup (Section 4.4's club subset only — **not** `/banter-rooms*` in
  the same section, that's Sprint 3), Follow, and wiring
  follow/comment/like events into `Notification` (the full
  notification-center UI is still Sprint 3). `Post`, `Comment`,
  `SavedPost`, `Follow`, `ClubPage`, `Notification` were already
  scaffolded back in Sprint 0/D. Pre-planning found and fixed a real
  gap before any endpoint work started (PR #51): `Post.likeCount` was
  a bare denormalized counter with no per-user `Like` rows behind it,
  making `POST`/`DELETE /posts/:id/like` impossible to implement
  correctly (no way to prevent duplicate likes, no way to know which
  row to remove on unlike). A `Like` model now exists, mirroring
  `SavedPost`'s exact pattern (`@@unique([userId, postId])`).
  `Post.likeCount` stays as a cache — see the comment on it in
  `schema.prisma` for the consistency obligation whoever builds the
  like endpoints must honor. That PR was schema-only, on purpose.
  **Slice one (`POST /posts`, `GET /posts/feed`) is merged to `main`
  (PR #53).** `POST /posts` is gated by `GuardianConsentGuard` in
  addition to `JwtAuthGuard` — a judgment call, not a literal reading
  of Section 8.3 step 5 (whose own enumerated restricted-pending list
  doesn't name general feed posting), resting instead on Section 5.7's
  separate, broader instruction to re-check consent status on every
  "posting" action; flagged as a Decision Log candidate, see
  `modules/feed/README.md`. `GET /posts/feed` is `JwtAuthGuard`-only
  (reading isn't the safety-sensitive action posting is) and is scoped
  to the caller's own posts plus posts by users they follow (`Follow`
  model) — Section 4.3 doesn't define feed scope beyond the endpoint
  existing, so that scope is also a flagged judgment call, not an
  assumed spec. Cursor-based (keyset) pagination, default page size 20
  / max 50, per Section 5.5.
  **Slice two (the remaining seven Section 4.3 endpoints — `GET
  /posts/:id`, `POST`/`DELETE /posts/:id/like`,
  `POST`/`GET /posts/:id/comments`, `POST`/`DELETE /posts/:id/save`,
  `GET /users/:id/saved-posts`) is merged to `main` (PR #54)**, and two
  follow-ups fixed the same test (`rejects an expired access token`)
  unrelated to this feature work — in sequence, not in one pass. PR #55
  added a frozen clock (`jest.useFakeTimers()`), diagnosing the failure
  as wall-clock/second-boundary jitter under CI/full-suite load. That
  diagnosis was plausible but incomplete: PR #57 found and fixed the
  actual root cause, confirmed directly against
  `node_modules/@nestjs/config/dist/config.service.js` —
  `ConfigService.get()` checks `process.env` **before** the
  `internalConfig` object passed to `new ConfigService(configOverrides)`,
  so the test's `JWT_ACCESS_TTL_SECONDS: -1` override was silently
  ignored whenever something earlier in the same Jest worker (an e2e
  spec bootstrapping the full app via `ConfigModule.forRoot`, which
  loads the real root `.env`) had already populated
  `process.env.JWT_ACCESS_TTL_SECONDS=900`. The frozen clock from PR #55
  is still correct practice and was left in place; it just wasn't
  sufficient on its own, since a real 900-second TTL is never expired
  regardless of clock determinism. PR #57 fixed `buildTokenService()`
  itself (not just this one test) to clear overridden keys from
  `process.env` for the duration of `ConfigService`/`TokenService`
  construction, so every current and future test using that helper is
  protected, not only the expired-token one.
  `Section 4.3 is now complete end to end.` New
  guard/scope judgment calls this slice made (all argued in full in
  `modules/feed/README.md`, at the same depth as slice one's own two):
  liking and saving are **not** gated by `GuardianConsentGuard` (only
  `JwtAuthGuard`) — neither produces visible content the way posting
  does; **commenting IS gated by `GuardianConsentGuard`**, landing the
  same direction slice one argued for `POST /posts` and flagged as the
  same open Decision Log candidate (is Section 8.3 step 5's
  restricted-pending list exhaustive, or does Section 5.7's broader
  "posting" language control); `GET /posts/:id/comments` orders
  oldest-first (the opposite direction from the feed's own
  most-recent-first), a documented UX judgment call since Section 4.3
  is silent on comment-thread order; and `GET /users/:id/saved-posts`
  defaults to the same conservative self-only/403-on-mismatch reading
  `users/README.md` already established for `GET`/`PATCH /users/:id`,
  flagged as a genuine open Decision Log candidate since Section 4.3
  doesn't say whether saved posts are private or publicly viewable.
  Like/save actions are idempotent (double-like, double-save,
  unlike-when-not-liked, unsave-when-not-saved all return 200, not
  500/404), backed by `Like`/`SavedPost`'s `@@unique([userId, postId])`
  constraints and Prisma `P2002`/`P2025` handling; `Post.likeCount` and
  the newly-commented `Post.commentCount` (see `schema.prisma`) are
  kept consistent via Prisma **interactive transactions**
  (`$transaction(async (tx) => ...)`, not the array form) so a
  create/delete and its paired counter update can never land
  independently — **correction (`sprint-2/e2e-test-infrastructure`):**
  this was originally described as "verified live against real Postgres,"
  which was inaccurate; what actually ran was `feed.service.spec.ts`
  against a hand-built mock `PrismaService` whose `$transaction` simulates
  the interactive-callback form, not a real Postgres transaction. See
  `modules/feed/README.md`'s own corrected Verification section for the
  full story, including that this specific like/comment/save transactional
  scenario remains e2e-uncovered even after the new e2e layer (which
  covers `auth`/`clubs` only so far) — a flagged backlog item, not
  something fixed here. `Post.commentCount` has no decrement path yet by design —
  Section 4.3 has no `DELETE /posts/:id/comments/:commentId`, so
  nothing removes a `Comment` row; whoever adds comment deletion later
  must add that decrement then. **Still nothing in Section 4.4 is
  built**: `/clubs*` and `/banter-rooms*` remain unbuilt — Sprint 2's
  club-page work and Sprint 3's Banter Rooms are both separate,
  upcoming PRs, not implied by Section 4.3 now being complete. Test
  suite after slice two's changes: 29 suites / 262 tests, 0 failures
  (up from the 28/208 measured immediately before it, on top of slice
  one's own merge).
  **Follow (Section 4.2's remaining four endpoints —
  `POST`/`DELETE /users/:id/follow`, `GET /users/:id/followers`,
  `GET /users/:id/following`) and notification-trigger wiring for
  follow/like/comment into `Notification` are merged to `main`**
  (PR #56, `sprint-2/follow-and-notifications`; a follow-up PR #57 fixed
  an unrelated config-precedence bug in a shared test helper, described
  above). Follow endpoints are `JwtAuthGuard`-only (not
  `GuardianConsentGuard`) — a follow produces even less visible content
  than a like does (there's no follower/following count field anywhere
  in `schema.prisma`), so this reads as unambiguous, unlike the still-open
  Decision Log candidate on `POST /posts`/comments. `GET
  /users/:id/followers`/`following` are deliberately **not** self-scoped
  (a real departure from `GET /users/:id/saved-posts`'s self-only
  default under the same kind of spec silence) — followers/following are
  standard public social graph data on the platforms this product is
  modeled after; flagged as a Decision Log candidate the same way
  saved-posts' opposite default was. Self-follow/self-unfollow → 400;
  `:id` not referencing a real user → 404; follow/unfollow are idempotent
  (`Follow.@@unique([followerId, followeeId])` backing `P2002`/`P2025`
  handling, identical pattern to `Like`). `Follow.createdAt` was added
  to `schema.prisma` (migration `20260819160458_add_follow_created_at`)
  — a genuine addition beyond Section 3's literal `Follow` fields,
  flagged as a Decision Log candidate — because keyset pagination
  (Section 5.5) needs a real timestamp to order by and `Follow` had
  none, the same gap `Like.likedAt`/`SavedPost.savedAt` already closed
  on the other two join-table models. `Notification` creation was
  retrofitted into `FeedService.likePost`'s and `addComment`'s existing
  `$transaction` callbacks (closing the gap PR #54 correctly left open —
  that PR was never briefed to touch `Notification`) plus added fresh to
  the new `followUser`: recipient is always the person being
  followed/the post's author, never the actor; no self-notification
  (liking/commenting on your own post, or the already-rejected
  self-follow, create zero `Notification` rows); a duplicate/idempotent
  like or follow can never produce a duplicate `Notification`, because
  the notification write shares the same transaction as the row it's
  reporting on. A `payloadRefId` convention is established (and
  documented in `users/README.md`) for the first time: the follower's own
  `userId` for a `'follow'` notification, the `postId` for `'like'`/
  `'comment'`. `ClubPage`/`BanterRoom` (Section 4.4) remain entirely
  unbuilt — unchanged by this PR. Test suite after this branch's
  changes: 30 suites / 304 tests, 0 failures (up from the 29/262
  measured immediately before it).
  **Club fan pages (Section 4.4's club subset — `GET /clubs`,
  `GET /clubs/:id`, `POST /clubs/:id/join`) are now built** — merged to
  `main` via PR #58. **Correction (`sprint-2/e2e-test-infrastructure`):**
  this was originally described as "verified against real Postgres/Redis,"
  which was inaccurate — what actually ran was
  `clubs.controller.http.spec.ts` (mocked `ClubsService`) and
  `clubs.service.spec.ts` (mocked `PrismaService`); no real Postgres
  connection was ever made. That gap is exactly why
  `sprint-2/e2e-test-infrastructure` exists: `ClubsService.joinClub`'s raw
  `$executeRaw` INSERT against the real `_ClubMembership` table had never
  been run against a real database before it. It now has —
  `services/api/test/clubs.e2e-spec.ts`, genuinely passing against real
  Postgres (see `services/api/test/README.md`). `/banter-rooms*` (the
  other half of Section 4.4) remains entirely unbuilt, still Sprint 3.
  Pre-endpoint verification found and fixed a real, pre-existing schema
  bug, not just a schema addition: `ClubPage.members` and
  `User.clubAffiliation` had no explicit `@relation` names, so Prisma
  silently merged them into a single relation backed only by
  `clubAffiliationId` — no separate join table existed at all. Verified
  directly against a live Prisma client (not assumed): calling
  `clubPage.update({ data: { members: { connect: ... } } })` was
  actually writing to `User.clubAffiliationId`. Fixed via explicit
  `@relation("ClubMembership", ...)` / `@relation("ClubAffiliation",
  ...)` names (migration `20260819204443_fix_club_membership_relation`),
  which creates a genuine `_ClubMembership` join table for the first
  time and requires two new, purely mechanical relation array fields
  (`User.clubMemberships`, `ClubPage.affiliatedPlayers`) — flagged as a
  Decision Log candidate in `modules/clubs/README.md`, since it's a real
  addition beyond Section 3's literal field list even though it carries
  no new business data. `clubAffiliationId` itself is untouched — not
  read or written anywhere in this module, confirmed live. `POST
  /clubs/:id/join` uses `ClubPage.members` (now a genuine many-to-many),
  not `clubAffiliationId` (a narrower, single-club "declared identity"
  field with no Section 4.4 endpoint referencing it) — both mechanisms
  and the reasoning for choosing `members` are documented in full in
  `modules/clubs/README.md`. **Auto-join on signup (Build Plan Section
  6's Sprint 2 line) is explicitly NOT wired** — `RegisterDto`/
  `RegistrationService` have no club-selection field or trigger point,
  and neither was modified; flagged as an open Decision Log candidate,
  not silently treated as done because club pages themselves shipped.
  **Section 4.4 has no leave/unjoin endpoint** — unlike follow/like/save,
  club membership is join-only in the Build Plan as written; a
  symmetric `DELETE` was deliberately not invented, and this join-only
  gap is flagged as a Decision Log candidate. All three routes are
  `JwtAuthGuard`-only, each argued fresh for this resource rather than
  inherited from feed/follow's own guard conclusions — see
  `modules/clubs/README.md`. `GET /clubs` is paginated alphabetically by
  `name` (keyset, `id` tiebreaker) since `ClubPage` has no timestamp
  field to order most-recent-first by, unlike every other list endpoint
  in this codebase — a small, adapted (not third-scheme) cursor util
  mirrors `feed/cursor.util.ts`'s contract. `POST /clubs/:id/join`
  idempotency required directly verifying (not assuming) that Prisma's
  implicit-m2m `connect` does not throw on a duplicate pair — unlike
  `Like`/`Follow`'s own `P2002`-catch idempotency, this endpoint uses a
  raw, parameterized `INSERT ... ON CONFLICT DO NOTHING` against the
  `_ClubMembership` table inside the same transaction as the conditional
  `memberCount` increment — **correction
  (`sprint-2/e2e-test-infrastructure`):** double/triple-join being
  "verified live... confirmed by reading Postgres directly" was
  inaccurate; `clubs.service.spec.ts`'s stateful mock `PrismaService`
  tracked `memberCount` across calls in a way that *simulated* this, but
  no real Postgres connection was involved. This exact scenario is what
  `sprint-2/e2e-test-infrastructure`'s `clubs.e2e-spec.ts` now genuinely
  covers — see the new bullet immediately below. Test suite after this
  branch's changes: 32 suites / 327 tests, 0 failures (up from the
  30/304 measured immediately before it).
- **`sprint-2/e2e-test-infrastructure` adds a real, second Jest test
  layer for `services/api` — genuine, unmocked Postgres coverage,
  additive to (never replacing) the mocked-Prisma unit/HTTP-wiring suite
  above.** Motivated by reviewing PR #58: `ClubsService.joinClub`'s raw
  `$executeRaw` INSERT against `_ClubMembership` had only ever been
  exercised by a mock, and — confirmed directly by reading a representative
  sample of `*.controller.http.spec.ts`/`*.service.spec.ts` files — that
  was true of every single test in this codebase, not just that one method.
  Several PR reports and module READMEs this sprint (`feed/README.md`,
  `users/README.md`, `clubs/README.md`, and this file — see the
  corrections inline above at the club-pages and feed-transaction bullets)
  had claimed "real HTTP verification against Postgres/Redis via
  docker-compose, not mocked," which was not true for any of them; those
  are now corrected in place, not silently left standing. **What now
  actually exists:** `services/api/test/jest-e2e.config.js` (a completely
  separate Jest config from `services/api/jest.config.js` — `*.e2e-spec.ts`
  under `test/`, never overlapping `*.spec.ts` under `src/`), run via
  `npm run test:e2e` (a separate script from `npm run test`, so the fast
  mocked-unit feedback loop is untouched — confirmed identical before/after:
  32 suites / 327 tests, 0 failures, both times). A Jest `globalSetup`
  (`test/global-setup.ts`) creates and migrates a real `soccernity_test`
  database unattended on first use (confirmed genuinely idempotent —
  ran `npm run test:e2e` three times in a row locally: run 1 created the
  database, runs 2 and 3 both logged "already exists — reusing it" and
  passed identically, no error either time) — identical `DATABASE_URL`
  resolution in CI (`ci.yml`'s already-provisioned Postgres service, now
  actually used for the first time via a new "Run e2e tests" step) and
  local dev (`.env.test`, copied from the new root `.env.test.example`),
  with no environment-specific branching in any test code — see
  `test/env.ts`'s comment for exactly how. `test/reset-database.ts`
  truncates every real table (introspected live from `pg_catalog`, not
  hand-listed or taken from Prisma's DMMF — which would miss implicit
  join tables like `_ClubMembership` entirely) in `beforeEach` of every
  spec, for full test-to-test isolation. Two spec files exist so far —
  `test/auth.e2e-spec.ts` (register → login → `GET /users/:id`; **`GET
  /auth/me`, Section 4.1, does not exist anywhere in this codebase**,
  confirmed by grep — a real gap this PR surfaced rather than building
  around silently, flagged as its own Decision Log/backlog candidate) and
  `test/clubs.e2e-spec.ts` (the exact `_ClubMembership` double-join gap
  above) — both run and genuinely passed against a live local Postgres
  instance (2 suites / 6 tests, 0 failures). **Guiding principle for
  future PRs, per `services/api/test/README.md`:** mocked unit tests stay
  the fast, primary layer for ordinary logic; add a real e2e test
  alongside (not instead of) the mocked ones specifically when a code path
  involves raw SQL, transaction/isolation-level reasoning, or a genuinely
  novel Prisma relation/constraint — exactly the three things PR #58's
  `joinClub` needed and didn't have. **Everything else remains
  e2e-uncovered by design** — an intentionally deferred backlog item, not
  a gap this PR claims to close; see `test/README.md`'s own "What's
  covered so far" section before assuming any other endpoint has real
  database coverage.
- **Decision Log #1, #7, #8, #10, #11, #12, #16, #17, and #19 are
  resolved.** #16, #17, and #19 required real code changes beyond the
  doc entry — all three are merged (PRs #32, #33, #38). #19 (age-5
  signup floor) is `AgeGateStep.tsx`'s `MINIMUM_SIGNUP_AGE`, hard
  blocking regardless of guardian consent. #12 (DM restriction scope
  for pending-consent minors) has no code to attach to yet, same
  reason as B7 above — it's guidance for whichever PR builds messaging
  in Sprint 3, not a Sprint 1 deliverable.
- **`apps/web` has its first-ever test suite, added by PR #38.**
  Previously zero `.test.tsx`/`.spec.tsx` files existed anywhere in
  the frontend workspace. `vite.config.ts` now imports `defineConfig`
  from `vitest/config` (not plain `vite`) with a `test: { environment:
  "jsdom" }` block, and `@testing-library/react`/`jsdom` are
  devDependencies. `AgeGateStep.test.tsx` (7 cases) is the only test
  file so far — don't assume broader frontend test coverage exists
  just because the tooling now does.
- **Decision Log #18 is resolved.** No backfill migration needed for
  #16's email-normalization fix — Soccernity has never had production
  or shared user data, so no pre-existing mixed-case `User` row can
  exist. Closed without a migration.
- **DPIA finding R5 (consent token expiry) is implemented**, not just
  decided. PR #42 added `Guardian.consentTokenExpiresAt`, a
  `POST /auth/guardian-consent/resend` endpoint, and rate limiting on
  it. **This does not close R5** — the 72-hour TTL and the overall
  approach are explicitly still unreviewed by counsel; PR #42 gives
  counsel something concrete to review instead of an unmitigated gap.
  The DPIA draft (`docs/sprint-1-dpia-outline-draft.md`) was updated in
  PR #43 to reflect this distinction precisely — don't treat "code
  exists" as "counsel signed off," the draft itself is explicit that
  those are different things.
- **CI now verifies Prisma migrations apply cleanly (PR #45).** This
  was a real gap, found and closed within the same sweep: `ci.yml`
  provisions live Postgres/Redis containers, but every test mocks
  `PrismaService`, so nothing previously exercised them. A `prisma
  migrate deploy` step now runs against the live CI Postgres container
  before lint/test/build. `deploy.yml` still has no migrate step —
  correctly untouched, still gated on Decision Log #9 (hosting).
- **Decision Log #20 is resolved (triaged, not fully fixed).** A
  cleanup review split all 42 `npm audit` findings into three tiers by
  actual production exposure. Tier 1 (react-router/react-router-dom's
  `GHSA-jjmj-jmhj-qwj2` open-redirect/XSS advisory, non-breaking) is
  fixed — PR #47, verified by diffing `npm audit --json` before/after
  to confirm the specific advisory cleared, not just that the raw
  count moved (it didn't — `react-router-dom`'s entry now inherits
  from `react-router`'s own remaining advisories, so the top-line 42
  count is unchanged even though the fix is real). **Tier 2 is still
  open** — `multer`/`lodash`/`qs`/`body-parser`/`express`/the whole
  `@nestjs/*` family, plus `react-router`'s own remaining two
  advisories (`GHSA-337j-9hxr-rhxg`, `GHSA-wrjc-x8rr-h8h6`) — all
  require a major version bump (NestJS 10→11 or React Router 6→7) and
  are deliberately deferred to a scoped Sprint 2 ticket, not
  forgotten. `multer` and `lodash` are confirmed unused by any current
  application code, so Tier 2's real-world exposure is low today, not
  zero. **Tier 3 (the 1 critical — `vitest`, dev-only — and the ~12
  react-native/metro advisories) is untouched by design** — zero
  current exposure, `apps/mobile` has no application code yet.
- **Decision Log #6 (sports-data vendor) blocks Sprint 4 only** — not
  Sprint 1. Don't hold up auth/consent work on it.
- **Decision Log #9 (hosting platform) blocks `deploy.yml` specifically**
  — it fails on purpose until this is resolved. Don't fill in a
  provider by guessing.
- **Three Sprint 2 Decision Log candidates closed by the founder, no
  code changes required for any of them** (see Build Plan Section 9,
  entries #21–#23, for the full reasoning — this is the short version):
  - **#21 — `GuardianConsentGuard` scope on `POST /posts` and
    `POST /posts/:id/comments`.** The judgment call already implemented
    (Section 5.7's broad "posting" language controls, not narrowed to
    Section 8.3 step 5's literal enumerated list) is confirmed as
    final, not a placeholder pending a narrower reading. Future
    content-creation endpoints (Banter Room posts in Sprint 3, etc.)
    should default to this same broad reading unless there's a specific
    reason to diverge.
  - **#22 — Saved posts stay private.** `GET /users/:id/saved-posts`'s
    existing self-only/403-on-mismatch default is confirmed as final —
    a saved-posts list is closer to a personal bookmark list than to
    public activity like posts or likes, with no product benefit to
    exposing it.
  - **#23 — `GET /auth/me` is formally dropped from the spec.** It was
    never built (confirmed by PR #59's e2e layer), and `GET /users/:id`
    already covers "fetch my own profile" — the same precedent Decision
    Log #15 already established for rejecting a `/users/me` alias.
    **Section 4.1's API Contract Sketch should have its `GET /auth/me`
    line removed** — this CLAUDE.md entry doesn't do that edit itself;
    it's a note for whoever next edits Section 4 in the live Build Plan
    document to also make that removal, so the endpoint list matches
    what entry #23 records as decided.
- **The `POST /auth/register` vs. `POST /auth/login` response-shape
  inconsistency PR #59's e2e layer surfaced is resolved** (branch
  `sprint-2/auth-response-shape-reconciliation`). Both endpoints now
  return the identical flat shape — `accessToken: string`,
  `accessTokenExpiresIn: number`, `refreshToken: string`,
  `refreshTokenExpiresAt: string`, plus `user: AuthUserSummary` (`id,
  email, phone, displayName, dateOfBirth, isMinor, role,
  verificationStatus, createdAt`) — via new shared
  `toAuthUserSummary()`/`AuthResponse` in
  `services/api/src/modules/auth/auth-response.mapper.ts`. Register's
  old nested `accessToken: { token, expiresIn }` is gone; login gained
  a `user` object it previously lacked. `isMinor`/`verificationStatus`
  are deliberately present in `user` on both — that's a fresh HTTP
  response reading a user's own state back to them, not the JWT
  payload the Section 5.7 non-negotiable actually governs (`{ sub,
  role }` only, unchanged, still enforced by `TokenService` and tested
  directly). `TokenPairResponse` (used by `POST /auth/refresh`) stays
  narrow and `user`-free on purpose. `apps/web/src/api/auth.ts`'s
  `LoginResponse`/`RegisterResponse` interfaces — previously explicit
  pre-B2/B3 scaffolding, never reconciled against a real DTO — are
  updated to match; `LoginPage.tsx`/`RegisterStep.tsx` needed no call-
  site changes. See `services/api/src/modules/auth/README.md`'s
  "response shape reconciliation" entry for the full detail. Mocked
  suite after this branch: 32 suites / 328 tests, 0 failures (one net
  new test over the 32/327 baseline recorded above at PR #59 merge).
  e2e suite: 2 suites / 6 tests, 0 failures, unchanged in count from
  PR #59 (existing assertions updated to the new shape, not added to).
- **Community, Sports Hub, and Admin Console remain the
  strongest-designed pillars** (Log Book Section 23.1). Discover and
  Careers still have zero screens — unchanged, still Phase 2.
- Before trusting any of the above, check Build Plan Section 9 (Decision
  Log) directly rather than this summary if something looks off — this
  section has gone stale before.

## Figma notes

- File: "Soccernity-MVP", key `weZWWqggy9j13eX8bhFgs6`. It has three pages: **"soccernity Cover page"** (`1860:2500`, cover only — logo and background, nothing else; originally named "soccernity"), **"Soccernity"** (`0:1`, this is where every real screen lives — Community, Sports Hub, Admin Console, Auth, Banter Rooms, ~263 nodes; originally named "Page 1"), and **"dump"** (`2155:1285`, unused scratch, ignore it). Page IDs are stable across the rename — if referencing a page, prefer the ID over the name where possible.
- `get_metadata`'s default, un-scoped page listing is unreliable on this file — it only ever surfaces the cover page (`1860:2500`), not the real content page (`0:1`). Don't trust it to enumerate pages. Fetch page `0:1` directly instead, or use `use_figma` to run `figma.root.children` directly if you need to confirm what pages exist.
- `use_figma` operates on whatever the Figma desktop app currently has open locally — a completely separate connection from key-based reads like `get_metadata`. If a read via file key returns real content but `use_figma` doesn't match, the desktop app almost certainly has the wrong file or page active, not a permissions or data problem. Confirm the correct file is open and frontmost before trusting any `use_figma` result.

## The eight agents, and the order they run in

All eight live in `.claude/agents/`. Three are sequence-dependent — running them out of order produces work built on an unfinished system:

1. **`figma-design-system`** — derives light/dark tokens from the two brand colors, retouches already-built screens, fixes Figma housekeeping. Runs first, always.
2. **`figma-screen-builder`** — designs screens that don't exist yet (guardian-consent flow is the priority). Only starts once (1) is finished.
3. **`figma-to-code`** — converts whatever (1) or (2) finished into real code. Only runs on screens already marked complete.
4. **`backend-api`** — builds the API/database layer against Sections 3–4. Independent of the Figma sequence; can run in parallel with (1)–(3).
5. **`qa-reviewer`** — read-only. Reviews PRs and test runs against Build Plan Section 7. Never fixes code itself.
6. **`competitive-scanner`** — quarterly market re-scan, independent of sprint cycles.
7. **`content-ops`** — drafts blog content once the Admin Console is live. Never publishes directly.
8. **`safeguarding-drafter`** — drafts DPIA/policy/consent-copy language. Every output is explicitly unapproved until legal counsel signs off.

Full agent map to sprints: Build Plan Section 11.

## Sprint order

Sprint D → Sprint 0 (parallel) → Sprint 1 → Sprint 2 → Sprint 3 → Sprint 4 → Sprint 5 → Sprint 6. Each sprint's tasks and its "done when" criterion are in Build Plan Section 6. Don't build a later sprint's screens or endpoints early just because they happen to be convenient — the sequencing exists for real dependency reasons, not arbitrary ordering.

## Definition of done

Build Plan Section 7. The safeguarding items in it (age-gate enforcement, DPIA review, guardian-consent flow) are hard blockers on calling MVP v1 complete — not soft goals.

## When you're unsure

Check the Consolidated Decision Log (Build Plan Section 9) before guessing. If the thing you need isn't resolved there either, surface it — don't invent an answer and move on quietly. That's how this project ended up needing a full gap-analysis pass before (Log Book Section 25); the goal from here is to not repeat that.
