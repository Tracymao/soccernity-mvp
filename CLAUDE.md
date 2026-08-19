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
  Three follow-up PRs closed out remaining Decision Log candidates:
  DTO validation (#25, Decision Log #11), email case normalization
  (#32, Decision Log #16), and wiring Postmark as the real email
  provider (#33, Decision Log #17 — still not *live*; the account
  itself doesn't exist yet, same as Sentry's DSN). Current test
  baseline: **25 suites / 158 tests, 0 failures** in `services/api`.
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
- **Sprint 2 has started. Schema is ready; no feature endpoints are
  built yet.** Section 6's Sprint 2 scope: Feed Service (Section 4.3 —
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
  like endpoints must honor. **Nothing in Section 4.3 or 4.4 is built
  yet** — this PR was schema-only, on purpose.
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
