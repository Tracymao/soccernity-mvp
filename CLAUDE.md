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
- **The same rule applies to the Build Plan's Decision Log**: any PR whose
  own text says it "resolves," "closes," or "supersedes" an earlier
  Decision Log entry must also append a one-line forward-pointer to that
  earlier entry's own Status column — not just add a new row. A sweep
  found four entries (#9, #20, #24, #25) that had gone silently stale
  this exact way: each one's original Status text kept describing an
  already-resolved question as open, because the entry that resolved it
  only ever pointed forward in its own text, never backward into the
  entry it superseded.

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
- **`sprint-1/f5-f6-missing-endpoints` closes two confirmed backend gaps
  F5/F6's real screens will need once built: a minor's own
  guardian-consent status was not exposed by any endpoint, and there was
  no change-password/deactivate/delete-account capability anywhere in
  this codebase** (re-verified directly via `grep -r
  "change-password\|deactivate\|delete-account\|accountStatus"
  services/api/src` before any code was written — zero matches for
  either, confirming the task brief's own claim rather than trusting it).
  Backend-only — `apps/web` untouched, a separate frontend PR follows
  later to actually build F5/F6 against these endpoints.
  - **Part 1 — `GET /auth/guardian-consent/status`.** Two real shape
    choices existed (extend `GET /users/:id` with a nested `guardian`
    object for a minor viewing their own profile, vs. a dedicated
    endpoint); chose the **dedicated endpoint**
    (`guardian-consent.controller.ts`), confirming rather than assuming
    the reasoning: `GET /users/:id` is general-purpose and used by every
    caller regardless of `isMinor`, so bolting safeguarding-specific
    nested data onto it would bloat the response for the vast majority of
    non-minor callers; a dedicated route keeps single responsibility and
    groups naturally with the two existing `POST /auth/guardian-consent*`
    routes on the same controller. **Guard: `JwtAuthGuard` ONLY,
    deliberately NOT `GuardianConsentGuard`** — a hard requirement, not a
    style choice: a restricted-pending minor must be able to check their
    own restricted status by definition, and gating this behind the same
    guard that enforces the restriction would make that impossible.
    Response carries `consentStatus`, `guardianEmail` (for a future
    "change guardian email" UI action this PR doesn't build), `canResend`
    (computed with the exact same condition `resendConsent()` already
    gates a real resend on, so the frontend never re-derives that
    business rule), and `consentTimestamp` (`null` until confirmed). "No
    `Guardian` row for this caller" (not a minor, or a data-invariant
    violation — indistinguishable from the caller's side, and both
    handled identically) is a real 404, never a silent null 200, matching
    this codebase's established convention
    (`ClubsService.assertClubExists`, `UsersService.assertUserExists`).
    Reads fresh from Postgres on every call, proven directly by a test
    that mutates the underlying row between two calls and confirms the
    second reflects the change.
  - **Part 2 — `POST /auth/change-password`, `POST
    /auth/deactivate-account`, `POST /auth/delete-account`, `POST
    /auth/reactivate-account`**, all added to the existing
    `AuthController`/`AuthService` rather than a new module (same `User`
    row `login`/`refresh`/`logout` already operate on; `AuthFoundationModule`
    was already imported, so `JwtAuthGuard` needed no new wiring).
    `change-password` reuses `PasswordService.verify`/`.hash` (never
    reimplements argon2), applies `RegisterDto.password`'s identical
    `@IsString() @MinLength(8)` rule to `newPassword`, and **revokes every
    other active session on success** (`tokenService.revokeAllSessionsForUser`
    — a deliberate decision, reusing the exact mechanism
    `logout(allSessions=true)`/`PasswordResetService.resetPassword`
    already use for "credential changed, kill other sessions").
    `deactivate-account`/`delete-account` both **require password
    re-entry as a confirmation step** (a hard requirement — a bare POST
    with no re-auth must never deactivate or delete an account) and both
    revoke every existing session on success (deactivation blocking
    future logins is meaningless if current tokens keep working).
    `reactivate-account` is deliberately **unauthenticated**
    (`{email, password}`, same credential-verification/timing-safety
    posture and dummy-hash comparison as `login()`) since a deactivated
    account's tokens are already revoked and there's no JWT to gate it
    behind; only a genuinely `"deactivated"` account is flipped back to
    `"active"` (an already-`"active"` account with correct credentials is
    treated as a plain login, not an error); a `"pending_deletion"`
    account is explicitly **not** reactivated, rejected with the same
    generic "Invalid credentials" a wrong password gets. `AuthService.login()`
    now rejects any non-`"active"` account, checked **after** password
    verification succeeds so the distinct "deactivated" message is only
    ever revealed to someone who already proved they know the correct
    password (preserving the existing non-enumeration posture for
    everyone else); `"pending_deletion"` gets the same generic message a
    wrong password would, not a distinct one.
  - **`User.accountStatus String @default("active")`** (migration
    `20260823011617_add_user_account_status`) is a genuine schema
    addition beyond Section 3's literal field list — flagged, not added
    silently. Mirrors the existing `consentStatus`/`verificationStatus`
    string-enum convention already used twice in this schema:
    `"active"` | `"deactivated"` (self-service reversible) |
    `"pending_deletion"` (self-service, **not** reversible by any
    endpoint in this PR — no hard delete of the `User` row happens
    anywhere yet).
  - **Deactivation-vs-deletion retention/erasure policy is an open
    Decision Log candidate, deliberately not resolved here** — this is a
    minors' data platform with real GDPR/NDPA implications (this
    project's own DPIA history, CLAUDE.md's safeguarding non-negotiables).
    Open questions for real founder/legal input: the actual retention
    window for a `"pending_deletion"` account before any further action;
    whether erasure ever becomes a true hard delete of the `User` row
    (and what happens to rows referencing it — `Post`, `Comment`, `Like`,
    `Follow`, etc. — none of which `ON DELETE CASCADE` today); whether a
    minor's `Guardian` row needs its own separate erasure handling;
    whether `"pending_deletion"` should ever have a self-service undo
    window at all (this PR's `reactivateAccount()` refuses to provide
    one, but that's an implementation choice pending the real policy
    decision, not the decision itself).
  - **Verification, real and directly measured**: mocked suite — baseline
    confirmed by stashing this branch's changes and re-running against a
    clean checkout, **34 suites / 356 tests, 0 failures**; after this
    branch, **34 suites / 386 tests, 0 failures** (30 new tests, no new
    suite). e2e suite — before: **6 suites / 37 tests, 0 failures**;
    after: **7 suites / 39 tests, 0 failures** (`test/account-lifecycle.e2e-spec.ts`,
    new — covers the required deactivate → login-fails → reactivate →
    login-succeeds round trip against real Postgres, a real
    session-revocation proof, a real change-password argon2id round trip,
    and the delete-account/`pending_deletion`-exclusion path; two
    `describe` blocks, each with its own app instance/own in-memory
    `AuthThrottlerGuard` bucket, to stay under the shared `'auth'`
    named-throttler's default 5-requests/60s limit across
    `login`/`reactivate-account` calls — see the file's own header
    comment). `GET /auth/guardian-consent/status` deliberately has no e2e
    coverage — a plain Prisma read, none of `test/README.md`'s own
    e2e-worthy categories (raw SQL, transaction reasoning, novel
    relation/constraint) apply, so the mocked unit layer is the right one.
    Full detail in `services/api/src/modules/auth/README.md`'s matching
    "Status update" entry and `services/api/test/README.md`.
- **F5 and F6 are now real, built screens (`sprint-1/f5-f6-real-screens`,
  branched from `origin/main` after `sprint-1/f5-f6-missing-endpoints`
  merged the endpoints below) — no longer route stubs.** F7
  (`VerifyEmailPage.tsx`, route `/verify-email`) was untouched by this PR
  and remained a stub at the time — see its own paragraph below for that
  status as it stood then. **F7 is now also real, built by
  `sprint-1/f7-club-picker-code` — see the dedicated bullet later in this
  Sprint 2 section for the full detail**; this paragraph is left as-is for
  the historical record of what this specific PR did and didn't ship.
  - **F5 routing decision**: the pre-existing `/guardian-consent` route
    covered two structurally different audiences that don't belong behind
    one component — an unauthenticated guardian confirming via an emailed
    token, and the authenticated minor checking their own status. Split
    into `/guardian-consent` (unchanged path, stays the minor's own
    authenticated status view — `GuardianConsentPage.tsx`, `GET
    /auth/guardian-consent/status`, renders Screen 5 "Restricted Pending"
    or Screen 6 "Activation Confirmation" depending on the real
    `consentStatus`) and a new `/guardian-consent/confirm`
    (`GuardianConsentConfirmPage.tsx`, public/unauthenticated, `POST
    /auth/guardian-consent`, reached via the emailed link's `?token=`).
    This mirrors the backend's own status/confirm split exactly, and a
    dedicated test proves the confirm route is genuinely public (renders
    and calls the endpoint correctly with both `sessionStorage` and
    `localStorage` cleared beforehand). Only Section 8.3 step 5's three
    named restrictions (no public profile visibility, no DMs from
    unverified accounts, no participation in Banter Rooms beyond
    read-only) are rendered on Screen 5 — the Figma frame's own "SCOPE
    OPEN" annotation about Grassroots/Sports Hub is left exactly as open
    as the frame left it, nothing invented. **Figma-vs-spec conflict,
    flagged rather than silently resolved**: the confirm screen's Figma
    frame renders a personalized "Request Summary" panel (minor's name,
    DOB, guardian's relationship, request date) that would need a
    GET-by-consent-token lookup endpoint; no such endpoint exists in
    Section 4.1 or in `sprint-1/f5-f6-missing-endpoints` — `POST
    /auth/guardian-consent` returns only `{ message }`. That panel is
    omitted rather than fabricated; the real, generic safeguarding
    education content elsewhere on the frame is kept. The frame's "I do
    not consent" button also has no matching backend action (no
    decline/reject endpoint, only confirm) — modeled as "take no action,
    with an explicit acknowledgement message," not a silent no-op.
  - **F6 (`ProfilePage.tsx`, route `/profile`) is a real profile view +
    edit flow.** The view screen ("Profile 1", node 1455:4362) is wired to
    `GET /users/:id` (self-only, id from the access token's own `sub`
    claim decoded client-side — `src/lib/session.ts`, display-convenience
    only, never a trust boundary) plus genuinely paginated
    Followers/Following lists (`GET /users/:id/followers`/`following`,
    lazy-loaded on click, Section 5.5 discipline). **Deliberately NOT
    reproduced**: the Figma frame's trending-news/suggested-follows/
    fixtures sidebars and its mock "Comments and Replies" feed — all
    static lorem-ipsum content with no backing Section 4 endpoint;
    reproducing it as if functional would misrepresent placeholder
    content as a built feature, the same discipline already applied to
    Bio/Location below. The edit screen ("Edit Profile" modal, node
    1466:18196) is wired to `PATCH /users/:id` for the two fields the
    backend actually accepts (`displayName`, split into
    first/last-name inputs and rejoined on save; `phone`, a real
    functional field the Figma frame doesn't happen to include, added
    anyway and flagged). **Bio, Location, Preferred Club, and Date of
    Birth are rendered visibly but disabled**, each with its own `// no
    backend field/endpoint yet` comment — Bio/Location have no column on
    `User` at all; Date of Birth is deliberately excluded server-side
    (could flip `isMinor`); Preferred Club's `clubAffiliationId` exists on
    the schema but no endpoint writes it (club membership goes through
    `ClubPage.members`/`POST /clubs/:id/join` instead). "Manage Account"
    (Change Password → `POST /auth/change-password`; a "Forgotten
    Password?" link to the existing `/forgot-password` route; Deactivate →
    `POST /auth/deactivate-account`; Delete → `POST /auth/delete-account`)
    has no Figma screen anywhere in the file — built plain, same
    "no dedicated screen exists, flagged rather than invented" precedent
    `ClubPickerStep.tsx` already established for its own step. Deactivate
    and Delete are two distinct actions (not one), and both require
    re-entering the password inline before the call fires — the UI cannot
    reach either endpoint without it. Delete's success copy says "your
    request has been received... processed for deletion," never implying
    instant/permanent deletion, matching what `POST /auth/delete-account`
    actually does server-side (`pending_deletion` status, not a hard
    delete).
  - **"Create Profile" (node 1498:2303) investigated, not built.** Its
    field list — Full Name, Username, Date of Birth, Location, Bio,
    Preferred Club, profile picture — was compared against
    `RegisterStep.tsx`'s real registration payload and `ClubPickerStep.tsx`'s
    post-registration club join. Full Name, Date of Birth, and Preferred
    Club are already collected by Age Gate/Register/ClubPicker
    respectively — building them again here would be duplicate, confusing
    UX. Username and profile picture are the only genuinely new fields,
    but neither has any backing column anywhere on `User`
    (`prisma/schema.prisma`'s `User` model has no `username`/avatar field
    at all) or any endpoint — worse than the already-flagged Bio/Location
    gap, since there isn't even a partial `PATCH` field to attach to.
    Conclusion: this screen is a superseded/alternate design, not a real
    gap in the current signup flow — not built. Whether Soccernity wants a
    username/avatar concept at all is a real product decision for a human,
    not something to invent a frontend for unilaterally.
  - **Verification**: `apps/web`'s vitest suite went from the pre-existing
    2 suites / 14 tests, 0 failures (`AgeGateStep.test.tsx`,
    `ClubPickerStep.test.tsx`) to **5 suites / 32 tests, 0 failures** —
    three new files (`GuardianConsentPage.test.tsx`,
    `GuardianConsentConfirmPage.test.tsx`, `ProfilePage.test.tsx`),
    including the public-with-no-session test above. `npx tsc --noEmit`,
    `npm run lint`, and `npm run build` are all clean. A temporary Vitest
    spec (deleted before the final commit, never reaching `main`) mounted
    the real route tree end to end: registered-as-minor's guardian
    confirming via `/guardian-consent/confirm`, then the minor's own
    `/guardian-consent` view genuinely reflecting `pending` and then
    `confirmed` across two fresh mounts (simulating a real refetch after
    the guardian approves) — passed. The real dev server was also started
    and all 15 real paths (14 routes plus the wildcard 404, including both
    new/changed guardian-consent paths and `/profile`) were `curl`'d
    directly, all returning real HTTP 200s, matching the same verification
    standard the last three infra PRs (React 19, Router 8,
    club-picker-ui) used.
  - **Sprint 1's own exit criterion was, at the time this PR merged,
    closer to walkable but still not fully walkable end to end by a real
    user — stated plainly, not rounded up.** Register → declare age →
    guardian-consent-gated access was real: a minor could register, their
    guardian could confirm consent via a real emailed-link page, and the
    minor could check their own restricted/confirmed status on a real
    page. **Email verification was still the missing link at that time**:
    F7 (`VerifyEmailPage.tsx`, route `/verify-email`) was untouched by
    this PR and remained exactly the stub it was — `POST
    /auth/verify-email` (B2) and the email Postmark now actually sends
    (Decision Log #17) still had no real frontend page to land on.
    **This is now resolved — see `sprint-1/f7-club-picker-code` below.
    Sprint 1's own exit criterion ("register, verify email, declare age,
    guardian-consent-gated access") is now fully walkable end to end by a
    real user, with all four steps real** — this paragraph is left as-is
    for the historical record of what this specific PR did and didn't
    ship.
  - **Two small, real, self-flagged bugs found during independent review
    of this PR are now fixed (`sprint-1/f5-f6-bugfixes`), both UX-only, no
    backend/data-integrity issue in either case.** Bug 1:
    `GuardianConsentPage.tsx`'s "you can resend once every 24 hours"
    footnote was dead code — its condition (`!status.canResend`) can never
    be true inside the `consentStatus === 'pending'` branch it lived in,
    since `getConsentStatus()` defines `canResend` as exactly
    `consentStatus === 'pending'`. **Fixed via option (a) — the footnote
    text is removed, not reworded** — a real 24-hour cooldown was never
    actually implemented anywhere server-side (`resendConsent()` has no
    such check, confirmed by reading it directly), so leaving text
    describing a rule that doesn't exist would have been actively
    misleading, not just inert; option (b) (building a genuine
    `lastResendAt`-backed cooldown) is real new scope, left as an
    unbuilt, unresolved candidate, not silently started. Bug 2:
    `EditProfileModal.tsx`'s `handleDeactivate()` showed a success message
    on a successful `POST /auth/deactivate-account` but never cleared the
    still-valid access token from storage or redirected away, leaving the
    UI looking like a normal logged-in session for up to the token's
    ~15-minute natural expiry even though the backend's own `login()`
    already rejects a deactivated account and sessions are already
    server-side revoked. **Fixed**: a new `clearStoredSession()` helper in
    `apps/web/src/lib/session.ts` (genuinely new — no clear/logout helper
    existed anywhere in `apps/web` before this fix, confirmed by grep;
    `LoginPage.tsx` only ever *writes* a session) clears both the access
    and refresh token keys from both `sessionStorage`/`localStorage`,
    called synchronously right on success — not delayed — so the stale
    credential is gone immediately; a 2.5s delay (no existing
    toast/timed-banner precedent in this app to match, a judgment call)
    then redirects to `/login` via `useNavigate`, giving the person a
    moment to actually read the success message first. **`deleteAccount()`'s
    handler was checked, not assumed fine — it had the exact same gap,
    confirmed by reading it directly, and got the identical fix**, not a
    different one. Real tests added for both (`GuardianConsentPage.test.tsx`,
    a new `EditProfileModal.test.tsx`), including the redirect firing only
    after real storage-clearing is observed, and both failure paths (wrong
    password) leaving the session untouched. `apps/web` vitest suite: 6
    suites / 37 tests, 0 failures (up from 5/32). `tsc --noEmit`,
    `npm run build`, `npm run lint` all clean.
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
  6's Sprint 2 line) was left unwired by this PR** — `RegisterDto`/
  `RegistrationService` had no club-selection field or trigger point at
  the time, flagged as an open Decision Log candidate rather than
  silently treated as done. **Resolved by
  `sprint-2/auto-join-on-signup`** — see the dedicated bullet below for
  the full detail; this bullet is left in place for the historical
  record of what PR #58 itself did and didn't ship.
  **Section 4.4 originally had no leave/unjoin endpoint** — unlike
  follow/like/save, club membership was join-only in the Build Plan as
  written; a symmetric `DELETE` was deliberately not invented at the
  time, and this join-only gap was flagged as a Decision Log candidate.
  **Resolved by `sprint-2/club-leave`** — see the dedicated bullet near
  the end of this Sprint 2 section for the full detail; this note is
  left in place for the historical record of what PR #58 itself did and
  didn't ship. All three original routes are `JwtAuthGuard`-only, each
  argued fresh for this resource rather than inherited from
  feed/follow's own guard conclusions — see `modules/clubs/README.md`. `GET /clubs` is paginated alphabetically by
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
  count is unchanged even though the fix is real). **Tier 2 is now
  mostly closed, with one explicit follow-up remaining — not fully
  done, do not round this up.** The `@nestjs/*` sub-item is closed —
  see the NestJS 11 bullet immediately below (Decision Log #24). The
  `react-router`/`apps/web` sub-item is also closed for its `GHSA-337j-
  9hxr-rhxg`/`GHSA-wrjc-x8rr-h8h6` advisories, but via an *interim*
  step, not the originally-scoped major bump: `apps/web` now runs
  React Router 7 (`7.18.2`), not React Router 8 — see Decision Log
  #25 immediately below. `apps/web` runs React 18, and React Router 8
  has a hard peer-dependency floor of React `>=19.2.7` (confirmed via
  real npm registry metadata and a reproduced `npm install --dry-run`
  ERESOLVE error — see #25), so landing v8 now was not possible without
  also bundling an unscoped React 19 upgrade. **React Router 8 remains
  open, tracked as a follow-up, explicitly blocked on that separate,
  not-yet-scoped React 19 upgrade** — the same "blocked on purpose, not
  guessed around" pattern Decision Log #9 uses for `deploy.yml`. The
  remainder of Tier 2 — `multer`/`lodash`/`qs`/`body-parser`/`express`
  — is still open, deliberately deferred, not forgotten. `multer` and
  `lodash` are confirmed unused by any current application code, so
  Tier 2's remaining real-world exposure is low today, not zero.
  **Tier 3 (the 1 critical — `vitest`, dev-only — and the ~12
  react-native/metro advisories) is untouched by design** — zero
  current exposure, `apps/mobile` has no application code yet.
- **Decision Log #24: `services/api` is upgraded from NestJS 10 to
  NestJS 11 (11.2.1), closing Decision Log #20's Tier 2 `@nestjs/*`
  sub-item.** `sprint-2/nestjs-11-upgrade`, 2026-08-20. Bumped
  `@nestjs/common`/`@nestjs/core`/`@nestjs/platform-express`/
  `@nestjs/testing`/`@nestjs/cli` to `^11.0.0` and `@nestjs/config` to
  `^4.0.0` (v3 does not run on Nest 11); `@nestjs/throttler`'s existing
  `^6.5.0` pin and `@nestjs/jwt`'s existing `^11.0.2` pin already
  supported Nest 11 and needed no change. NestJS 12 deliberately not
  targeted — alpha-only as of this entry, a separate and much larger
  migration (full ESM, Jest→Vitest, ESLint→oxlint). A full, clean
  `node_modules`/lockfile reinstall (not just `npm install` on top of
  the existing tree) was required to actually fix the version bump —
  an incremental install left a real pre-existing split, `@nestjs/core`/
  `@nestjs/common` resolving to two different copies (11.2.1 nested
  under `services/api/node_modules`, a stale 10.4.22 still hoisted at
  the repo root and used by `@nestjs/throttler`/`@nestjs/jwt`/
  `@sentry/nestjs`'s own `require()` calls) — confirmed via `npm ls`
  before and after; the clean reinstall dedupes the whole workspace to
  a single `@nestjs/common@11.2.1`/`@nestjs/core@11.2.1`. **The
  highest-risk item — `@nestjs/config` v4 inverting `ConfigService.get()`'s
  resolution order (internal configuration now wins over `process.env`,
  the opposite of v3, which PR #57 already root-caused the v3-losing
  side of in `token.service.spec.ts`'s `withClearedProcessEnv` helper)
  — was proven empirically, not assumed.** Confirmed via grep that this
  codebase has zero `ConfigModule` `load: [...]`/`registerAs()` custom
  config factories anywhere, so there is no internal-configuration layer
  for a real env var to lose to; a new regression test
  (`services/api/src/config-precedence.spec.ts`) constructs
  `ConfigService` the exact way `AppModule` does (`ConfigModule.forRoot`
  with a real `envFilePath` on disk, not a hand-built config object) and
  confirms it still reads a real, distinctive env var correctly, both
  with and without a supplied default. Separately confirmed — by reading
  v4's own `config.service.js` directly and by a live empirical check —
  that `new ConfigService(overrides)` (`buildTokenService()`'s own
  pattern) now has `overrides` win over `process.env` unconditionally,
  the exact inversion of the v3 bug PR #57 fixed.
  `withClearedProcessEnv` is left in place, now redundant-but-harmless
  rather than load-bearing — its own comment in `token.service.spec.ts`
  is updated to say so explicitly rather than leaving that undocumented.
  Other CONFIRMED-LOW-RISK areas, verified empirically rather than
  assumed: zero wildcard routes anywhere in `services/api/src` (Express
  v5/`path-to-regexp` changes are a non-issue); zero direct `Reflector`
  usage in this codebase's own code (the one `new Reflector()`
  construction is inside `auth-throttler.guard.spec.ts`, exercising
  `@nestjs/throttler`'s own internals, already Nest-11-compatible per
  its peer range); `tsconfig.json`'s existing `target`/`module`/
  (unset, defaulting) `moduleResolution` needed no change — confirmed by
  a full `nest build`, both real test suites, and a manual `start:dev`
  boot all succeeding with zero DI/module-resolution errors. Mocked
  suite: 34 suites / 334 tests, 0 failures (up from the pre-upgrade
  33/330 baseline by the one new `config-precedence.spec.ts` file — no
  other test file needed a genuine code change, only the dependency
  bump itself and one `prisma generate` step the reinstall had wiped).
  e2e suite (real Postgres/Redis via `docker compose up -d`): 5 suites /
  22 tests, 0 failures, unchanged in count — the real regression-safety
  net (PR #59/#63) this upgrade was deliberately timed to have available
  actually held. `npm run start:dev` boots cleanly with the full,
  correct route table (confirmed via its own startup log, not assumed),
  and `GET /health` returns `200 {"status":"ok","database":"connected"}`.
  One side effect worth flagging, not silently bundled in: the clean
  reinstall surfaced this npm environment's own install-script
  allowlisting gate (a `package.json` `allowScripts` block, absent
  before this PR) blocking `argon2`'s native build and `prisma
  generate`'s own postinstall step; `npm approve-scripts --all` was run
  once for the same five packages (`@prisma/client`, `@prisma/engines`,
  `argon2`, `esbuild`, `prisma`) that already had install scripts before
  this PR — nothing new was added to the trusted set, only formally
  recorded — and the resulting root `package.json` diff is committed
  alongside the version bumps themselves.
- **Decision Log #25: `apps/web` is upgraded from `react-router-dom` 6
  to React Router 7 (`7.18.2`) — explicitly not React Router 8, and v8
  is not to be described as reached anywhere.** `sprint-2/react-
  router-8-upgrade`, 2026-08-20 (branch name predates this correction;
  renaming it mid-flight wasn't worth the churn, but the actual work
  targets v7). React Router 8.3.0 is the current npm `latest`, but its
  `package.json` declares a hard `peerDependencies` floor of
  `react`/`react-dom` `>=19.2.7` — confirmed via real npm registry
  metadata, and reproduced directly: a real `npm install react-router@8
  --dry-run` against a scratch `"react": "^18.2.0"` project fails with
  `npm error code ERESOLVE` / `peer react@">=19.2.7" from
  react-router@8.3.0` / `Found: react@18.3.1`. Bundling an unscoped
  React 19 upgrade into this PR, or force-installing past that conflict
  (`--force`/`--legacy-peer-deps`), were both explicitly ruled out —
  neither is a real fix, and a React 19 bump is its own unscoped body of
  work. **This PR lands React Router 7 (`7.18.2`) instead, confirmed
  React-18-compatible the same rigorous way**: its `package.json`
  declares `peerDependencies` `react`/`react-dom` `>=18`, and a real
  `npm install react-router@7.18.2 --dry-run` against the same scratch
  project succeeds cleanly (8 packages added, no ERESOLVE, no force
  flags). `react-router-dom` itself is not carried forward as a v7
  release — npm registry metadata confirms it has never published an
  `8.x` and its own `latest` dist-tag is frozen at `7.18.2`, a dead-end
  package going forward — so all 12 import lines across the 12 files
  that referenced it (`App.tsx`, `app/router.tsx`, `layout/AppShell.tsx`,
  `layout/Header.tsx`, `pages/ForgotPasswordPage.tsx`,
  `pages/LoginPage.tsx`, `pages/NotFoundPage.tsx`,
  `pages/ResetPasswordPage.tsx`, `pages/signup/AgeGateStep.tsx`,
  `pages/signup/AgeGateStep.test.tsx`, `pages/signup/RegisterStep.tsx`,
  `pages/signup/SignupSplitScreen.tsx`) now import directly from the
  unified `react-router` package instead, avoiding a second import
  rewrite whenever React Router 8 is eventually taken. The
  `react-router/dom` subpath (v7's home for `RouterProvider`/
  `HydratedRouter` in framework-mode SSR hydration) is deliberately not
  used — `apps/web` renders via plain `ReactDOM.createRoot`
  (`src/main.tsx`), not `hydrateRoot`/SSR, so `createBrowserRouter`/
  `RouterProvider`/`Outlet`/`Link`/`NavLink`/`useNavigate`/
  `useSearchParams`/`MemoryRouter` all still come from the main
  `react-router` entry point, confirmed directly against v7.18.2's own
  published type definitions rather than assumed. **Node engine did
  *not* need a bump for v7 specifically** — its `package.json` declares
  `engines.node: ">=20.0.0"` (v8 requires `>=22.22.0`), and the root
  `package.json`'s existing `"node": ">=20"` already satisfies that, so
  `engines` is untouched. Verified after a full clean reinstall (root
  `node_modules`/`package-lock.json` removed, `npm install` from repo
  root): `apps/web`'s test suite passes (1 suite / 7 tests, 0 failures,
  unchanged from the pre-migration baseline), `npx tsc --noEmit` passes
  with zero type errors, `npm run build` produces a clean production
  bundle with zero errors. Every real route in `src/app/router.tsx` (`/`,
  `/sports-hub`, `/news`, `/leaderboard`, `/community`, `/banter`,
  `/login`, `/signup`, `/forgot-password`, `/reset-password`,
  `/guardian-consent`, `/profile`, `/verify-email`, plus the wildcard
  404) was checked two ways, both stated precisely rather than
  overclaimed: **HTTP-level** (the Vite dev server returns 200 for every
  path — confirms no server-side crash, not that client-side routing
  actually resolved), and a **genuine JS-execution smoke test** (a
  temporary Vitest spec, deleted before commit, that mounted v7's
  `createMemoryRouter`/`RouterProvider`/`Outlet` against the real route
  tree and every real page component for all 14 paths in jsdom — all 14
  rendered without throwing). **No real browser/visual check was done**
  — no Playwright/Puppeteer or other browser-automation tool is
  available in this environment; don't read the above as a manual
  browser confirmation. **React Router 8 remains open, explicitly
  tracked as a follow-up, blocked on a separate, not-yet-scoped React 19
  upgrade for `apps/web`** — same "blocked on purpose, not guessed
  around" pattern as Decision Log #9's `deploy.yml`/hosting gate. Full
  detail, including the exact reproduced ERESOLVE output, is in Build
  Plan Section 9's Decision Log #25 entry.
- **Decision Log #6 (sports-data vendor) blocks Sprint 4 only** — not
  Sprint 1. Don't hold up auth/consent work on it.
- **Decision Log #9 (hosting platform) is resolved — see Decision Log
  #26.** `deploy.yml` no longer fails on purpose; see the dedicated
  bullet below for what actually changed.
- **Decision Log #26: hosting is Render (API) + Neon (Postgres) + Upstash
  (Redis), unbundled rather than a single all-in-one platform — resolving
  Decision Log #9.** Chosen for cost alignment with a pre-launch MVP's
  near-zero traffic: Neon and Upstash both have genuinely permanent free
  tiers that scale to zero, and Render's $7/month Starter tier (used for
  production only, not staging) avoids cold-start delay specifically on
  safety-critical flows like the guardian-consent email link (Build Plan
  Section 8.3). This was also chosen to avoid a specific reliability
  concern with Railway (an alternative platform) for Node.js/Prisma/
  Postgres production workloads — **that specific concern was given by
  the founder/task requester, not independently verified or sourced by
  the agent that implemented this decision**, and should not be read as
  an independently confirmed citation. See the `sprint-2/deployment-setup`
  bullet immediately below for exactly what was built to prepare for this
  stack, and `docs/deployment.md` for the human setup steps this decision
  still requires.
- **Decision Log #27: `apps/web` is upgraded from React 18 to React 19
  (`19.2.8`), closing the blocker Decision Log #25 recorded against React
  Router 8.** `sprint-2/react-19-upgrade`, 2026-08-22. `apps/admin` is
  untouched — stays on React 18 and React Router 6, the same
  leave-it-alone treatment it got during the Router 6→7 migration.
  **Re-confirmed, not just trusted, that this was a low-risk version bump
  rather than a rewrite**: a fresh grep across `apps/web/src` for every
  React 19 removed/breaking legacy API (`propTypes`, `defaultProps` on
  function components, `forwardRef`, `findDOMNode`, `ReactDOM.render`,
  `ReactDOM.hydrate`, `unmountComponentAtNode`, `contextTypes`/
  `getChildContext`, string refs, `React.createFactory`) found zero
  matches, and the official codemod registry's `react-19-migration-recipe`
  (five bundled codemods — `react-19-replace-reactdom-render`,
  `react-19-replace-string-ref`, `react-19-replace-act-import`,
  `react-19-replace-use-form-state`, `react-prop-types-typescript`) was
  actually run against `apps/web` (`npx codemod@latest run
  react-19-migration-recipe --target apps/web`, non-interactive) and
  **modified 0 of 169 files** — confirming the grep's finding rather than
  replacing it. `src/main.tsx` already used `ReactDOM.createRoot` plus
  `<React.StrictMode>`; neither needed a change. Version bumps in
  `apps/web/package.json`: `react`/`react-dom` `^18.2.0` → `^19.2.8`,
  `@types/react` `^18.2.0` → `^19.2.18`, `@types/react-dom` `^18.2.0` →
  `^19.2.4`, `@testing-library/react` `^14.2.0` → `^16.3.2` (v16 is the
  first major with real React 19 support; v14 produces a peer-dependency
  ERESOLVE against `react@19`), plus a new explicit devDependency,
  `@testing-library/dom` `^10.4.1` — `@testing-library/react@16` moved it
  from a transitive dependency to a required peer, confirmed via its own
  published `peerDependencies` (`@testing-library/dom: ^10.0.0`) rather
  than guessed. A full clean reinstall (root `node_modules`/
  `package-lock.json` removed, `npm install` from the repo root) was done
  per the same standing practice PR #65 (NestJS 11) established for major
  dependency bumps in this workspace. **That reinstall surfaced a real,
  confirmed regression, not just a version bump**: npm's own hoisting
  resolved `react-router`/`@testing-library/react`'s internal React peer
  to the root-hoisted React 18.3.1 (from `apps/admin`/`apps/mobile`)
  instead of `apps/web`'s own nested React 19.2.8, producing two live
  React copies in one app and a real, reproduced test failure. Fixed via
  scoped npm `overrides` keyed to the `@soccernity/web` workspace only —
  full detail, including how `apps/admin` was verified to be unaffected,
  is in the dedicated `sprint-2/react-19-upgrade` status bullet further
  down this Sprint 2 section. **Verified, not assumed**:
  `apps/web`'s vitest suite passes cleanly under React 19 +
  `@testing-library/react` v16; `npx tsc --noEmit` passes with zero type
  errors under the stricter `@types/react` v19 types; `npm run build`
  produces a clean production bundle. `<React.StrictMode>` was specifically
  re-checked for new double-invocation warnings under React 19 and found
  none. **This unblocks Decision Log #25's own React Router 8 follow-up**
  — `react-router`/`react-router-dom` versions were deliberately untouched
  in this PR (out of scope by design), so React Router 8 (needing
  `react`/`react-dom` `>=19.2.7`, now satisfied) is ready to run as its own
  separate follow-up PR, not bundled in here. See the dedicated
  `sprint-2/react-19-upgrade` bullet further down this Sprint 2 section
  for the full verification detail, including the manual page-load smoke
  test.
- **Decision Log #28: `apps/web` is upgraded from React Router 7
  (`7.18.2`) to React Router 8 (`8.3.0`), closing Decision Log #25's
  originally-recorded blocker now that Decision Log #27 (React 19) has
  landed.** `sprint-2/react-router-8-upgrade`, 2026-08-22. `apps/admin` is
  untouched — stays on `react-router-dom ^6.22.0`/React 18, the same
  leave-it-alone treatment it got during both the v6→v7 migration and the
  React 19 upgrade, confirmed by a clean `git diff` scoped to
  `apps/admin/`. **What the real v7→v8 changelog actually required was
  read from the upstream `CHANGELOG.md` directly (`remix-run/react-router`
  repo), not assumed from the version number alone.** The headline
  baseline-support bump: Node `22.22.0+` (previously `20.0.0+`), React
  `19.2.7+` (previously `18+`, already satisfied by Decision Log #27), and
  Vite `7+`; the package is now published ESM-only. The `react-router-dom`
  package — kept in v7 purely as a convenience re-export for apps that
  hadn't finished the v6→v7 import swap — is fully removed in v8, not just
  deprecated further. Every `future.v8_*` flag (`v8_middleware`,
  `v8_passThroughRequests`, `v8_trailingSlashAwareDataRequests`,
  `v8_viteEnvironmentApi`; `v8_splitRouteModules` moved to a top-level
  config option) is removed, with its behavior now the unconditional
  default. Remaining changes — the internal `hasErrorBoundary` route field,
  the deprecated `data` param on route-module `meta` functions, the
  Cloudflare Vite dev proxy, `@react-router/architect`'s
  `useRequestContextDomainName` option — are all `@react-router/dev`
  framework-mode or SSR-specific surfaces this app never uses. **Grepped
  `apps/web/src` for every one of the above, real results, zero assumed**:
  `react-router-dom` matched only inside a single explanatory code comment
  in `router.tsx` (now updated) — no actual import anywhere, confirming
  the v7 migration's own "unified `react-router` package" import already
  made this app immune to the package's removal, unlike `apps/admin`,
  which still genuinely depends on it and was correctly left alone.
  `hasErrorBoundary`, `MiddlewareEnabled`, `AppLoadContext`,
  `future.v8_*`/`v8_middleware`/`v8_passThroughRequests`/
  `v8_trailingSlashAwareDataRequests`/`v8_splitRouteModules`/
  `v8_viteEnvironmentApi`, `unstable_previewServerPrerendering`,
  `MetaArgs`/`MetaMatch`/`UIMatch`, and any `loader`/`action`/route-`meta`
  usage: zero matches, all zero, confirmed by grep, not inferred from "this
  app doesn't use framework mode." `router.tsx`'s own
  `createBrowserRouter([...])` call passes no `future` options object at
  all — there were no `future.v7_*` flags opted into during the v6→v7
  migration to begin with — so v8's wholesale removal of the `future.v8_*`
  flag set required literally zero code changes here. **The Node-engine gap
  originally flagged here as a follow-up (see the superseded paragraph this
  replaces, preserved in git history on this same branch) has since been
  folded into this same PR by the founder, not left open.**
  `react-router@8.3.0`'s own published `engines.node` is `>=22.22.0`
  (confirmed via real npm registry metadata, not assumed), and this repo's
  root `package.json` and `.github/workflows/ci.yml` had both still been
  pinned to Node `20` — meaning CI had never actually run `react-router@8.3.0`'s
  own build/runtime code on a Node floor that satisfies its real
  requirement; the only reason `npm install`/`npm run build` ever worked at
  all is that this development environment's actual Node (`v24.16.0`) and
  every prior CI run happened to exceed the stated `>=20` floor anyway. Once
  flagging this as a "repo-wide decision touching `services/api`'s and
  `apps/admin`'s own CI runs too" was raised, the founder decided the
  correct move was to fold the bump into this PR rather than defer it: root
  `package.json`'s `engines.node` is now `>=22.22.0`, and
  `.github/workflows/ci.yml`'s single `actions/setup-node@v4` step (shared
  by every job in this monorepo's one CI workflow — `services/api` and
  `apps/admin` included, there is no per-workspace Node matrix) now pins
  `node-version: "22.22.0"`. No other Node-version reference exists
  anywhere else in the repo to reconcile — confirmed by checking
  `.github/workflows/deploy.yml` (no `setup-node` step at all; it only
  curls an already-deployed `/health` endpoint), `render.yaml` (no explicit
  Node version pin; Render resolves its Node version from the deployed
  service's own `package.json` `engines.node`, so it now inherits
  `>=22.22.0` automatically with no edit needed there), every other
  workspace's own `package.json` (`apps/web`, `apps/admin`, `apps/mobile`,
  `services/api`, `packages/shared` — none declare their own `engines.node`
  field, so there was no conflicting/lower floor to fix), the root
  `README.md` and `docs/deployment.md` (no Node-version mention in either),
  and the repo for any `.nvmrc`/`Dockerfile` (neither exists anywhere in
  this codebase). This is a CI/engines-only change — no dependency version
  changed, `npm ls react-router` at the repo root resolves identically to
  before this fix-up. **CI was actually observed running green on this
  floor, not just assumed from the YAML edit** — the real GitHub Actions
  run this push triggered on `sprint-2/react-router-8-upgrade` (PR #75),
  `https://github.com/Tracymao/soccernity-mvp/actions/runs/32594356564`,
  completed with conclusion `success` in 1m45s, and its own "Run
  actions/setup-node@v4" step log was read directly to confirm the real
  Node version the job ran with — `Attempting to download 22.22.0...`,
  `Acquiring 22.22.0 - x64 from
  .../node-22.22.0-linux-x64.tar.gz`, `Environment details` / `node:
  v22.22.0` — genuinely downloaded and installed, not inferred from the
  workflow file's own text. (A separate, unrelated annotation on that
  run — "Node.js 20 is deprecated... forced to run on Node.js 24" — is
  GitHub Actions' own runtime for the `actions/checkout@v4`/
  `actions/setup-node@v4` action code itself, not this job's Node
  version; not to be confused with the `node: v22.22.0` line above,
  which is the actual job environment.) **The
  mandatory hoisting check (per PR #74's own precedent that this exact
  kind of major bump can silently duplicate React across workspaces) was
  run for real, not skipped as a formality**: a full clean reinstall
  (root `node_modules`/`package-lock.json` removed, `npm install` from the
  repo root), then `npm ls react-router`/`react-router-dom`/`react`/
  `react-dom` at the root. Result: clean, no regression found.
  `@soccernity/web` fully deduped to `react-router@8.3.0` on top of its own
  `react@19.2.8`/`react-dom@19.2.8`; `@soccernity/admin` fully deduped to
  its own `react-router-dom@6.30.6` → internal `react-router@6.30.6` on
  top of `react@18.3.1`/`react-dom@18.3.1`, completely untouched;
  `@soccernity/mobile`'s own `react@18.2.0` tree unaffected. The existing
  PR #74 override (`overrides.@soccernity/web.react-router.{react,
  react-dom}`, scoped by *importing workspace*, not by package version)
  already targets `react-router` by name inside the `@soccernity/web`
  workspace, so it applied automatically to the new v8 resolution with no
  edit needed — no new override was required. **Real verification, all
  re-run after the bump, none estimated**: `apps/web` vitest suite — 1
  suite / 7 tests, 0 failures, identical to the pre-upgrade baseline;
  `npx tsc --noEmit` in `apps/web` — zero errors; `npm run build` — clean
  production bundle, zero errors. **A genuine JS-execution smoke test was
  run, the same standard Decision Log #25/#27 both used**: a temporary
  Vitest spec (deleted before commit, never reaching `main`) took
  `router.routes` directly off the real `createBrowserRouter` instance
  exported by `router.tsx` and mounted it via v8's real
  `createMemoryRouter`/`RouterProvider`, under `<React.StrictMode>`
  matching `main.tsx` exactly, for all 14 real paths (the 13 routes
  defined in `router.tsx` plus the wildcard 404) — all 14 rendered with
  zero `console.error`/`console.warn` calls, confirming no new
  double-invocation or router-deprecation warnings under v8. The dev
  server was also actually started and all 14 real paths were `curl`'d
  against it directly, all returning real HTTP 200s with a clean
  dev-server log. **Stated plainly, matching Decision Log #25/#27's own
  honesty about this**: no real browser or Playwright/Puppeteer-style
  visual check was available in this environment, so the jsdom-based
  StrictMode/console-error smoke test plus the real dev-server HTTP check
  above is the actual verification ceiling here, same as both prior
  upgrades. `RouterProvider` (along with `createBrowserRouter`, `Outlet`,
  `Link`, `NavLink`, `useNavigate`, `useSearchParams`, `MemoryRouter`) was
  confirmed still exported from the main `react-router` entry point in
  v8.3.0 directly against its own published `.d.ts` — the `react-router/
  dom` subpath remains needed only for framework-mode SSR hydration
  (`HydratedRouter`), which this plain-`ReactDOM.createRoot` app still
  does not use, so no import paths changed. **React Router 8 is now
  genuinely landed, not just unblocked** — both halves of Decision Log
  #25's originally-recorded blocker (React 19, then Router 8 itself) are
  closed.
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
- **`sprint-2/e2e-coverage-expansion` closes the specific e2e backlog
  PR #59 flagged: feed like/comment/save, follow/notification wiring, and
  the counter-increment logic behind all of them.** Three new spec files,
  all genuinely passing against real Postgres — `test/
  feed-reactions.e2e-spec.ts` (like/unlike/comment/save/unsave
  transactional counter behavior, plus `Notification` recipient-direction
  and no-self-notification proof for both `like` and `comment`, verified
  by querying the real `Notification` table directly, never inferred from
  the HTTP response), `test/follow.e2e-spec.ts` (self-follow rejection,
  follow/unfollow idempotency, `Notification` recipient direction for
  `type: 'follow'`, and `GET /users/:id/followers`/`/following` checked
  against `Follow` rows seeded directly via Prisma), and `test/
  counters.e2e-spec.ts` (the direct, step-by-step proof that
  `Post.likeCount`/`commentCount` never drift from real `Like`/`Comment`
  row counts through a full like/like/unlike/unlike/comment/comment
  sequence, not just checked once at the end). e2e suite after this PR: 5
  suites / 22 tests, 0 failures (up from PR #59's 2/6). Mocked suite
  unaffected: 32 suites / 328 tests, 0 failures — identical before and
  after. **A real, discovered gap — flagged, not fixed here (coverage-
  only PR, no production changes):** writing these three files against
  real `POST /auth/register` (the same pattern `auth.e2e-spec.ts`/
  `clubs.e2e-spec.ts` use) hit real `AuthThrottlerGuard` 429s well before
  their own tests finished, because each file's coverage genuinely needs
  more than 5 distinct users across one spec file's real HTTP traffic.
  Investigating found `AUTH_RATE_LIMIT_MAX`/`AUTH_RATE_LIMIT_WINDOW_MS`
  (`rate-limit.module.ts`'s env-driven module-level throttler config) are
  **not actually consulted by any of the four routes currently decorated
  with `@AuthRateLimit()`** (`register`, `login`, `forgot-password`,
  `guardian-consent/resend`) — every call site invokes the decorator with
  no arguments, so its own hardcoded imported defaults
  (`DEFAULT_AUTH_RATE_LIMIT = 5`, `DEFAULT_AUTH_RATE_LIMIT_WINDOW_MS =
  60_000`) win at the route level regardless of what the env-driven
  module config says. That env var currently has zero real effect on any
  decorated route — a genuine config-wiring gap, worth its own follow-up
  ticket, not something this PR touches. The workaround is scoped
  entirely to test setup: these three files seed their `User` rows
  directly via Prisma and mint a real access token via the real, unmocked
  `TokenService` pulled from the test's own DI container
  (`app.get(TokenService)`) instead of calling `POST /auth/register` —
  every downstream request still exercises the real `JwtAuthGuard` →
  `TokenService.verifyAccessToken` chain end to end; only register's own
  HTTP/rate-limiter/argon2id path is bypassed, and that path is already
  fully covered by `auth.e2e-spec.ts`. See `test/README.md`'s matching
  entry and each file's own `createUser()` helper comment. **No other
  real bug was surfaced** — every recipient-direction and idempotency
  assumption the mocked unit suite already made (`feed.service.spec.ts`,
  `users.service.spec.ts`) held up unchanged against a real database;
  this layer earned its keep specifically by catching the rate-limiter
  config gap above, not by finding an error in the transactional/
  notification logic itself. Remaining e2e-uncovered by design, same as
  before: `GET /posts/feed`/`GET /posts/:id/comments`/`GET /clubs`
  pagination and field-shape coverage (mocked unit suite's job), `GET
  /posts/:id`, and `auth/`'s refresh/logout/forgot-reset-password/
  guardian-consent/verify-email routes.
- **The `AUTH_RATE_LIMIT_MAX`/`AUTH_RATE_LIMIT_WINDOW_MS` config-wiring
  gap `sprint-2/e2e-coverage-expansion` flagged (above) is fixed**
  (branch `sprint-2/fix-auth-rate-limit-config-wiring`). Root cause:
  `AuthRateLimit()` applied `DEFAULT_AUTH_RATE_LIMIT`/
  `DEFAULT_AUTH_RATE_LIMIT_WINDOW_MS` as its own default parameters and
  always emitted a per-route `@Throttle()` override — since a route-level
  `@Throttle()` wins over `AuthRateLimitModule`'s module-level, env-driven
  config, every real call site (`register`, `login`, `forgot-password`,
  `guardian-consent/resend`, all invoked as bare `@AuthRateLimit()`)
  silently ignored the env vars regardless of what was configured. Fixed
  by making the override opt-in: `AuthRateLimit(override?: { limit,
  windowMs })` — bare `@AuthRateLimit()` now applies only the guard, with
  no `@Throttle()` metadata, so it genuinely falls through to the
  module-level config. Proven behaviorally (not just "it compiles") by a
  new `rate-limit/auth-rate-limit.decorator.spec.ts`, which wires the real
  guard through the real `AuthRateLimitModule` and confirmed directly
  against the pre-fix code that the same assertion (`AUTH_RATE_LIMIT_MAX
  =2` genuinely producing a 429 on the 3rd request) fails there
  (`expected 429, got 200`) and passes post-fix. `DEFAULT_AUTH_RATE_LIMIT`/
  `DEFAULT_AUTH_RATE_LIMIT_WINDOW_MS` are untouched — `rate-limit.module.ts`'s
  `|| DEFAULT_...` fallback still needs them. **The three e2e spec files
  the original gap-finding PR added were deliberately left on their
  existing Prisma-seeding/`TokenService`-minting workaround, not switched
  to real HTTP registration** — the fix doesn't make that switch free
  (`.env.test` still has no `AUTH_RATE_LIMIT_MAX` override, and the three
  files' `createUser()` helpers are called 37 times total across real HTTP
  traffic within each file's own throttler window); judged a larger,
  separate change than this fix PR's own scope, and each file's stale
  "the bug is why we do this" comment (plus `test/README.md`'s matching
  entry) is corrected in place to say the bug is fixed but the workaround
  is being kept deliberately, not because it's still needed for the same
  reason. Mocked suite after this branch: 33 suites / 330 tests, 0
  failures (up from 32/328 — one new spec file, two new tests). e2e
  suite: unchanged, 5 suites / 22 tests, 0 failures (comment-only changes
  to the three affected spec files, no test-count change). See
  `services/api/src/modules/auth/README.md`'s matching "Status update"
  entry for the full writeup.
- **`sprint-2/auto-join-on-signup` closes the auto-join-on-signup gap
  flagged above** (the club-pages bullet's "explicitly NOT wired" note)
  — Build Plan Section 6's Sprint 2 line, left unbuilt because
  `RegisterDto` had no club-selection field when club pages themselves
  shipped in PR #58. `RegisterDto.clubId?: string` (optional,
  `@IsUUID()`, matching `ClubPage.id`'s real UUID type) is the only DTO
  change — omitting it entirely is the "no club for now" path, not a
  sentinel value. `ClubsModule` now exports `ClubsService` (previously
  providers-only) so `AuthRegistrationModule` can inject it via DI;
  `RegistrationService.register()` calls the same `ClubsService.joinClub`
  the standalone `POST /clubs/:id/join` endpoint uses, no join logic
  reinvented. **A real ordering bug was found and fixed, not just
  reasoned about**: tracing `register()`'s actual step order confirmed
  that validating the club only as part of `joinClub` itself (which, by
  construction, could only run after user/guardian creation) would let a
  bad `clubId` 404 while leaving an already-committed, orphaned `User`
  row behind — permanently blocking that email from ever registering
  again, since the pre-existing duplicate-email check would then reject
  retries. Fixed by making `ClubsService.assertClubExists` public
  (previously private) and calling it *before* `prisma.user.create()`
  runs. Proven, not just asserted: `test/registration-club-join.e2e-
  spec.ts` (new) registers with a bad `clubId` against real Postgres,
  confirms the 404, confirms directly via Prisma that no `User` row was
  created for that email, and confirms the same email can genuinely
  register afterward — plus the real-clubId (membership + `memberCount`
  +1) and no-clubId (zero side effects on any club) paths. No
  `Notification` wiring (joining a club was never on Section 6's
  notification-trigger list) and no new field on
  `AuthResponse`/`RegisterResponse` (a 201 with no error already implies
  success; `GET /clubs/:id` covers confirming membership). **Explicitly
  NOT built here, flagged as a follow-up candidate**: a club-picker UI
  anywhere in the signup flow — `apps/web`'s `SignupPage`/`RegisterStep`
  have no club-selection UI today, this PR is backend-capability-only.
  See `services/api/src/modules/auth/README.md`'s and
  `services/api/src/modules/clubs/README.md`'s matching "Status update"
  entries for the full writeup. Mocked suite after this branch: 34
  suites / 338 tests, 0 failures (up from a freshly re-verified 34
  suites / 334 tests immediately before it on this same `main` — not the
  33/330 figure recorded two bullets above, which had already gone stale
  by the time this branch was cut, per this file's own "Keeping this
  file current" caveat; four new tests, no new suite). e2e suite: 6
  suites / 25 tests, 0 failures (up from 5 suites / 22 tests — one new
  spec file, three new tests).
- **`sprint-2/club-leave` closes the join-only, no-leave gap flagged
  above and in `modules/clubs/README.md` since PR #58.** `DELETE
  /clubs/:id/join` (`ClubsService.leaveClub`) is now built, mirroring
  `joinClub`'s exact structure: `assertClubExists` first (same 404 for a
  non-existent `clubId`), a raw parameterized `DELETE FROM
  "_ClubMembership" WHERE "A" = ... AND "B" = ...` via `tx.$executeRaw`
  inside the same interactive transaction as a conditional `memberCount`
  decrement, and idempotent success (never a 404) when leaving a club
  you're not a member of — the same reasoning `unlikePost`/
  `unfollowUser`/`unsavePost` already established for their own DELETE
  endpoints. `memberCount`'s decrement is guarded two ways: the raw
  `DELETE`'s own affected-row count gates whether the decrement is
  attempted at all (mirroring `joinClub`'s own insert-affected-rows
  discipline), and the decrement itself uses `updateMany` with a
  `memberCount: { gt: 0 }` where-clause guard, reusing
  `FeedService.unlikePost`'s exact floor-guard pattern so `memberCount`
  can never go negative. `JoinState.joined` changed from a `true` literal
  to `boolean` (mirroring `FeedService.LikeState`'s own `liked: boolean`
  precedent, shared by both likePost and unlikePost) so one interface
  serves both `joinClub` and `leaveClub` rather than inventing a parallel
  `LeaveState` type. **Guard reasoning for the new route is a short
  confirmation of `POST :id/join`'s own conclusion, not a fresh
  argument** — explicitly stated as such in `modules/clubs/README.md`:
  every reason join gave for staying `JwtAuthGuard`-only (a `ClubPage`
  fan-page membership is neither "a Banter Room" nor "a Community Group"
  under Section 5.7's literal list, and produces no visible content)
  applies at least as strongly to leaving. Real e2e coverage
  (`test/clubs.e2e-spec.ts`'s new `DELETE /clubs/:id/join (leaveClub)`
  describe block, extending the existing file rather than adding a new
  one) proves, against real Postgres: a genuine leave removes the real
  `_ClubMembership` row and decrements `memberCount` by exactly 1;
  leaving a club you're not a member of is an idempotent 200 with
  `memberCount` unchanged, confirmed never negative across three repeated
  calls on a club already at 0; a non-existent `clubId` still 404s; and a
  full `join -> leave -> join -> leave` cycle lands both `memberCount`
  and the real `_ClubMembership` row count back at their exact starting
  values after each complete cycle — the same "no drift across a real
  operation sequence" proof `counters.e2e-spec.ts` established for
  likes/comments, applied here for the first time to club membership.
  Four of these five new e2e scenarios needed their own distinct user,
  which would have pushed this file's total real `POST /auth/register`
  calls past `AuthThrottlerGuard`'s hardcoded 5-requests/60s limit when
  combined with the file's existing `registerAndLogin()`-based tests —
  the same real, already-documented gap
  `feed-reactions.e2e-spec.ts`/`follow.e2e-spec.ts`/`counters.e2e-spec.ts`
  hit; this file's new tests use their own `createUser()` helper (seed a
  `User` row directly via Prisma, mint a real token via the real,
  unmocked `TokenService`) instead, leaving the pre-existing
  `registerAndLogin()` tests untouched since their own 4 calls stay
  comfortably under the limit on their own. Mocked suite after this
  branch: 34 suites / 344 tests, 0 failures (up from 34/338 immediately
  before it — 6 new tests, no new suite). e2e suite: 6 suites / 30 tests,
  0 failures (up from 6/25 — 5 new tests, no new spec file, this branch
  extends `test/clubs.e2e-spec.ts` rather than adding a sibling file).
- **`sprint-2/comment-delete` builds `DELETE
  /posts/:id/comments/:commentId`, closing the comment-deletion gap
  `schema.prisma`'s own comment on `Post.commentCount` has flagged since
  PR #54 ("whoever eventually adds comment deletion... must add the
  matching decrement then").** This is a genuine addition beyond Section
  4.3's originally-written nine-endpoint list, not a literal spec line
  item — **flagged as a Decision Log candidate** in `modules/feed/
  README.md`'s new dedicated section: Section 4.3 arguably should have
  paired every POST/DELETE-capable Section-3 entity symmetrically from
  the start (it does for `Like`/`SavedPost`/`Follow`/`ClubPage`
  membership already), and `Comment` was the one remaining exception.
  **Authorization is comment-author OR post-author**, not
  comment-author-only — there's no moderator/admin role anywhere in this
  codebase's guards yet, and this matches how comment moderation works on
  comparable platforms; neither role → 403, the same "authenticated but
  not authorized" convention `UsersController.assertSelf()` already
  established. **Existence-and-belongs-to-this-post is checked BEFORE
  authorization, and a `commentId` that exists but references a
  DIFFERENT post than the URL is a 404, not a 403** — a resource-identity
  mismatch, not an authorization question; proven directly by an e2e case
  where the requester genuinely authored the comment in question and
  still gets 404 via the wrong post's URL, confirming this isn't an
  authorization shortcut in disguise. **This endpoint is deliberately NOT
  idempotent, unlike every other DELETE in this module/its siblings**
  (`unlikePost`/`unsavePost`/`unfollowUser`/`leaveClub`, all backed by a
  many-to-many toggle relationship where "absent" is a normal,
  repeatedly-reachable resting state): a `Comment` has its own
  single-row primary-key identity, so a second delete of the same real
  `commentId` is a genuine 404, not a synthesized 200/204 — proven by an
  explicit delete-twice test at both the mocked-unit and real-Postgres
  layers. **Guard choice (`JwtAuthGuard` only, NOT `GuardianConsentGuard`)
  is argued fresh, not inherited from `POST /posts/:id/comments`'s own
  Decision-Log-#21-confirmed guard**: removing your own content, or
  moderating content on your own post, produces no new visible content —
  the same category `unlikePost`/`unsavePost` already sit in, not the
  category comment *creation* is in. **Response is a default `204 No
  Content`**, not the `200`-with-resulting-state pattern
  like/save/follow/join/leave use — a delete has nothing meaningful left
  to report about the now-gone resource. The `Comment` row's deletion and
  `Post.commentCount`'s decrement happen inside one interactive
  `$transaction`, using the same `updateMany`-with-a-`commentCount: {
  gt: 0 }`-floor-guard pattern `unlikePost`/`leaveClub` already
  established, as a second line of defense on top of `Comment`'s own
  primary-key-backed existence check. `schema.prisma`'s comment on
  `Post.commentCount` is updated in this same PR to say the decrement
  path now exists, rather than being left describing a gap that's
  already closed. No `Notification` wiring — there's no existing
  precedent anywhere in this codebase for notifying someone their content
  was removed, and nothing in Section 4/Section 6 calls for one here.
  Real e2e coverage (`test/feed-reactions.e2e-spec.ts`'s new "comment
  deletion" describe block, extending the existing file rather than
  adding a sibling one) proves, against real Postgres: comment-author and
  post-author deletion both genuinely remove the `Comment` row and
  decrement `Post.commentCount` by exactly 1; a third user gets 403 with
  the row and counter both provably unchanged; a non-existent `commentId`
  is 404; the cross-post-mismatch case above is 404 not 403; delete-twice
  is 204 then 404; and a comment/comment/delete/comment sequence lands
  `Post.commentCount` at exactly 2, matching `Comment.count()` at every
  step — the same "no drift across a real operation sequence" proof
  `counters.e2e-spec.ts` established for likes, applied here for the
  first time to comment deletion. This file's new tests reuse the
  existing `createUser()`-via-Prisma-plus-real-`TokenService` helper (not
  `POST /auth/register`), the same already-documented
  `AuthThrottlerGuard` rate-limit workaround every other describe block
  in this file uses — `feed-reactions.e2e-spec.ts` now calls
  `createUser()` 32 times (up from 21), and `test/README.md`'s own
  running tally of `createUser()` call counts across all three
  rate-limit-workaround files is corrected in the same PR to a freshly
  re-counted 46 total (32 + 12 + 2), not the previously-stated 37 (which
  was already stale before this PR, an instance of the same drift
  CLAUDE.md's own "Keeping this file current" section describes — not
  something this PR introduced). **Real, directly re-measured before/after
  test counts, not estimated**: mocked suite went from a freshly
  re-verified 34 suites / 344 tests with 1 pre-existing failure
  (`auth-rate-limit.decorator.spec.ts`'s `AUTH_RATE_LIMIT_MAX` test,
  confirmed to fail on clean `main` before any edit in this branch and
  pass cleanly on every run once this branch's changes were in place — a
  flake, not a regression this PR caused or is responsible for fixing) to
  **34 suites / 356 tests, 0 failures**. e2e suite went from a freshly
  re-verified 6 suites / 30 tests, 0 failures to **6 suites / 37 tests, 0
  failures**.
- **`sprint-2/fix-rate-limit-test-timeout` fixed the
  `auth-rate-limit.decorator.spec.ts` flake noted in the bullet just
  above.** That test's two real-app, real-HTTP tests had failed twice
  under full-suite parallel CPU contention — once flagged during PR #67,
  once reproduced and confirmed live during PR #69's own verification,
  both times with `Exceeded timeout of 5000ms for a test`, and both
  times passing cleanly on an unchanged re-run. Not a logic bug: PR #64's
  original mutation-testing-style proof (revert the fix, confirm the
  test fails; restore it, confirm it passes) had already established the
  underlying rate-limiting behavior was correct — this was purely a
  timeout-budget problem, a real-HTTP/real-app-bootstrap test occasionally
  not finishing inside Jest's default 5000ms window under heavy parallel
  load. Fix: both tests given a 20000ms per-test override (Jest's
  third-argument form), with real headroom rather than a bare-minimum
  bump, plus a comment citing PR #67 and PR #69 as the two prior
  sightings. **Verified, not assumed**: 5 consecutive normal full-suite
  runs, 0 failures each time; a genuine CPU-load simulation (8
  CPU-saturating background processes on a 12-core machine, run twice)
  reproduced conditions close to the original failures and the fixed
  file passed both times, while a then-untouched, out-of-scope file
  (`auth.service.spec.ts`, a plain mocked test with no real HTTP calls)
  hit the *old* default 5000ms timeout under the same simulated load —
  confirming the load simulation was genuinely reproducing the failure
  conditions, and surfacing that the underlying problem was broader than
  this one file. That broader finding is what `sprint-2/global-jest-timeout`
  (next bullet) went on to fix properly. This branch's own merge went
  undocumented here for one PR cycle — the exact "drift" this file's own
  "Keeping this file current" section warns about, and the gap the next
  bullet's own note flags; this bullet closes it, inserted in its correct
  chronological place rather than appended out of order.
- **`sprint-2/global-jest-timeout` raises `jest.config.js`'s
  `testTimeout` from Jest's implicit 5000ms default to a measured
  30000ms for the whole mocked unit suite**, replacing the per-test-file
  patch pattern `sprint-2/fix-rate-limit-test-timeout` (merged just
  before this branch was cut, fixing `auth-rate-limit.decorator.spec.ts`'s
  two flaky real-HTTP tests with a 20000ms per-test override) started —
  now documented in its own bullet directly above, added after the fact
  to close the exact gap this note originally flagged. That branch's own
  load-simulation found the deeper issue: even a plain mocked-Prisma test
  with zero real HTTP calls (`auth.service.spec.ts`, which exercises real
  argon2id
  hashing via `PasswordService`) can also exceed 5000ms under heavy CPU
  contention, so file-by-file timeout patches aren't sustainable.
  **Measured, not guessed** (12-logical-core local dev machine, full
  34-suite run, CPU-saturating Node busy-loop background processes
  spawned alongside `npx jest` as a local approximation of CI-style
  contention — not a real CI measurement): 8 extra busy processes →
  worst single test ~4.4-5.1s (right at the old 5000ms edge, and the
  level that reproduced an actual "Exceeded timeout of 5000ms" failure);
  16 extra busy processes, 2 runs → worst single test 8724ms / 9588ms;
  24 extra busy processes, 2 runs → worst single test 12736ms / 13841ms
  — the figure this decision is anchored on, as "heavy but still
  plausible" contention; 32 extra busy processes → worst single test
  27440ms, recorded but treated as an outlier/extreme rather than the
  basis for this number, since the jump from 24→32 processes (~13s→~27s)
  is disproportionately larger than 16→24 was, suggesting
  memory-pressure/GC thrashing rather than proportional CPU-sharing at
  that level. **30000ms is ~2.2x the ~13841ms worst-case figure it's
  based on** (over the "at least 2x" floor), while staying well under
  the 32-process outlier. Full reasoning and the raw numbers live in
  `jest.config.js`'s own comment, not just here. **Explicit trade-off**:
  a genuinely broken test (real infinite loop/unresolved promise, not
  contention) now takes up to 30s instead of 5s to fail loudly — judged
  the right trade against the alternative of intermittent false-negative
  CI failures on healthy code. **`auth-rate-limit.decorator.spec.ts`'s
  two 20000ms per-test overrides are removed** (30000ms >= 20000ms, so
  they were redundant) and that file's comment is rewritten to explain
  the global default now covers it, cross-referencing this entry, rather
  than leaving reasoning written against the old 5000ms baseline
  standing. **Verified, not assumed**: 5 consecutive normal (no
  simulated load) full-suite runs, all 34 suites / 356 tests, 0 failures,
  wall-clock times of 30.975s / 32.789s / 24.659s / 24.902s / 27.732s —
  consistent with the pre-change baseline (31.273s), confirming
  `testTimeout` only changes the ceiling before a hung/slow test fails,
  not normal run time. Two further load-simulated full-suite runs with
  the new 30000ms default actually in place (16 extra processes, then 24
  extra processes — the exact level the 30000ms figure is anchored on)
  both passed 0 failures, the real proof the fix holds under the same
  conditions that caused failures before.
- **`sprint-2/deployment-setup` prepares `services/api` for the newly
  resolved hosting stack (Decision Log #26) — configuration and
  documentation only, no application code changed, and live deployment is
  entirely unverified pending real Neon/Upstash/Render accounts.**
  `prisma/schema.prisma`'s `datasource` block now has a `directUrl` field
  alongside `url` — `DATABASE_URL` (pooled, via Neon's PgBouncer) for
  normal runtime queries, `DIRECT_URL` (unpooled) for `prisma migrate
  deploy`/`dev`, since PgBouncer's transaction-pooling mode can interfere
  with the advisory locks and prepared statements Prisma Migrate relies
  on. Locally (docker-compose's plain Postgres, no pooler), both point at
  the identical value — verified genuinely locally, not assumed: with
  `DIRECT_URL` added to `.env`/`.env.test` (and `.env.example`/
  `.env.test.example`), `npm run prisma:generate` and `npm run test:e2e`
  both still pass, e2e suite unchanged at 6 suites / 37 tests, 0 failures,
  before and after. `.env.example` also gains a note that `REDIS_URL`
  will be a `rediss://` (TLS) URL once Upstash is real — confirmed this
  needs zero code changes by reading `RedisService`
  (`services/api/src/redis/redis.service.ts`, which passes the full URL
  straight into ioredis's constructor) and `node_modules/ioredis`'s own
  `Redis.js`/README directly, both confirming ioredis auto-detects
  `rediss://` and enables TLS from the URL scheme alone. A new
  `render.yaml` at the repo root defines two Render web services as
  Blueprint IaC — `soccernity-api-staging` (branch `staging`, Free plan)
  and `soccernity-api` (branch `main`, Starter plan, for the cold-start
  reason in Decision Log #26) — each with a `buildCommand` mirroring
  `ci.yml`'s own install/generate/build steps (scoped to
  `--workspace=services/api` only, a deliberate narrowing from `ci.yml`'s
  unscoped `npm run build` since Render only ever needs to ship the API),
  a `preDeployCommand` running `prisma migrate deploy` against
  `DIRECT_URL` (never `migrate dev`), `healthCheckPath: /health`, and
  every real env var from `.env.example` listed with `sync: false` (set
  manually in Render's dashboard, nothing provisioned or guessed here).
  **Explicitly flagged, not presented as verified fact**: the exact
  Blueprint field names `preDeployCommand` and `branch` are used at
  reasonable but not full confidence (no live access to re-verify
  Render's current docs) — `render.yaml`'s own comments say so directly,
  and real validation needs a human with a real Render account importing
  it. `.github/workflows/deploy.yml`'s old deliberate-failure placeholder
  (`exit 1`, blocking on Decision Log #9) is replaced with a
  `workflow_dispatch`-triggered smoke test that curls the real deployed
  `GET /health` and fails loudly if it isn't
  `{"status":"ok","database":"connected"}` — manually triggered rather
  than automatic-on-push, a deliberate, flagged trade-off: reliably
  timing "after Render's deploy actually finished" would need Render's
  own deploy-status API plus an API-key secret, judged a bigger dependency
  than this PR's scope; Temi runs it herself from GitHub Actions after
  confirming a deploy finished in Render's dashboard. `RENDER_STAGING_URL`
  /`RENDER_PRODUCTION_URL` are secrets Temi must still set manually — no
  real deploy exists yet for either. **One real, discovered conflict with
  this PR's own brief, flagged rather than silently resolved either way**:
  the brief asked for `.github/workflows/ci.yml` to be left completely
  untouched, but adding `directUrl` to the schema means anywhere `prisma
  migrate deploy` runs against a live datasource now needs `DIRECT_URL`
  resolvable — including `ci.yml`'s own existing "Run database migrations"
  step, whose job-level `env` block only had `DATABASE_URL`/`REDIS_URL`/
  `JWT_SECRET`. Confirmed by literally reproducing it locally (`npx prisma
  migrate deploy` with that exact env shape fails with P1012,
  "Environment variable not found: DIRECT_URL") before deciding: leaving
  `ci.yml` untouched would have broken CI on the next push, which
  conflicts with this repo's own non-negotiable that nothing merges
  without CI passing — so one additive line (`DIRECT_URL`, same value as
  the existing `DATABASE_URL` line, same reasoning as local dev) was added
  to `ci.yml`'s env block, and is called out here and in the PR itself
  rather than left as an unflagged deviation. **A separate real,
  pre-existing gap was found and left unfixed by design (out of this PR's
  scope, not something this PR's own changes caused)**: `prisma migrate
  deploy`/`generate` invoked via this repo's own documented npm scripts
  (`npm run prisma:migrate`/`prisma:generate`, real npm-workspace cwd
  = `services/api`, confirmed against CLAUDE.md's own already-documented
  cwd gotcha) never actually find the root `.env` file via Prisma CLI's
  own independent dotenv auto-discovery — confirmed by reproducing this
  against the pre-existing schema too (git-stashing this PR's own schema
  change and rerunning the identical npm script still failed the same
  way, with `DATABASE_URL not found`), so this is not new. It doesn't
  affect this PR's own deliverables: `services/api/test/global-setup.ts`
  already does its own explicit dotenv loading of `.env.test` before
  spawning `prisma migrate deploy` as a child process (confirmed this is
  why `test:e2e` already worked), and both CI and Render inject real
  env vars directly into the process environment rather than relying on a
  `.env` file at all. Left as a flagged, out-of-scope finding for whoever
  next touches local Prisma CLI ergonomics, not fixed here. Mocked suite
  unaffected by this entire PR, confirmed by a real run: 34 suites / 356
  tests, 0 failures, identical to the pre-existing baseline recorded two
  bullets above.
- **`sprint-2/react-19-upgrade` upgrades `apps/web` from React 18 to
  React 19 (`19.2.8`), closing Decision Log #25's own recorded blocker on
  React Router 8.** See the dedicated Decision Log #27 entry above for the
  version-bump/codemod detail; this bullet covers what verification
  actually found, including a real bug the upgrade itself surfaced.
  **A genuine, confirmed regression was found and fixed mid-task, not
  just a clean version bump**: after bumping `apps/web/package.json` and
  doing the standard clean root reinstall, `npm ls react react-dom`
  showed `react-router@7.18.2` and `@testing-library/react@16.3.2` —
  both hoisted to the *root* `node_modules` because only `apps/web`
  depends on them — resolving their own internal `react`/`react-dom`
  peers to the root-hoisted React **18.3.1** (pulled in by
  `apps/admin`/`apps/mobile`, both still genuinely on React 18 by
  design), while `apps/web`'s own application code resolved to its
  locally-nested React **19.2.8** — two live copies of React inside the
  same app. This is not a hypothetical: it broke `apps/web`'s real test
  suite immediately, with the actual failure being `Error: Objects are
  not valid as a React child (found: object with keys {$$typeof, type,
  key, props, _owner, _store})` — the textbook duplicate-React-instance
  symptom, and confirmed by tracing the physical `node_modules` layout,
  not guessed from the error message alone. **Fixed via scoped npm
  `overrides`** in the root `package.json`, nested under `@soccernity/web`
  so it only affects that workspace's own dependency edges — forces
  `react-router` and `@testing-library/react`, but only the copies of
  each that `@soccernity/web` itself pulls in, to resolve `react`/
  `react-dom` to `^19.2.8` rather than whatever the root happens to have
  hoisted. **Verified this doesn't leak into `apps/admin`**: `npm ls
  react react-dom` after the fix shows `@soccernity/admin`'s entire tree
  (including its own separate `react-router-dom@6.30.6` → internal
  `react-router@6.30.6`) still fully deduped to React `18.3.1`, untouched
  — the override is keyed by the *importing* workspace
  (`@soccernity/web`), not by package name alone, so admin's identically-
  named-but-different-major `react-router@6.30.6` dependency edge was
  never in scope. This is the same category of hoisting-related
  staleness PR #65 (NestJS 11) flagged for `@nestjs/core`/`@nestjs/common`,
  but sharper here because it wasn't stale-cache staleness — it was a
  legitimate, repeatable outcome of mixing React 18 and React 19 across
  workspaces in one npm workspaces tree, and would recur on any future
  clean reinstall without the override in place. **Real verification
  results, all re-run after the override fix, none estimated**: `apps/web`
  vitest suite — 1 suite / 7 tests, 0 failures (`AgeGateStep.test.tsx`,
  the same suite and count as the pre-upgrade baseline); `npx tsc
  --noEmit` in `apps/web` — zero errors under the new `@types/react`
  v19 types; `npm run build` — clean production bundle, zero errors.
  **A genuine JS-execution smoke test was run, the same standard Decision
  Log #25 set for the Router 7 migration** — a temporary Vitest spec
  (deleted before commit, never reaching `main`), mounting
  `<React.StrictMode>` (matching `main.tsx` exactly) around v7's real
  `createMemoryRouter`/`RouterProvider` against the real route tree and
  every real page component, for all 14 real paths in
  `src/app/router.tsx`, asserting not just "renders without throwing" but
  also zero `console.error`/`console.warn` calls per route — all 14
  passed clean, which is what re-confirmed `<React.StrictMode>` produces
  no new double-invocation warnings or lifecycle errors under React 19.
  **The dev server was actually started and real pages were actually
  requested** (`npm run dev`, then `curl` against `/`, `/login`,
  `/signup`, `/sports-hub`, `/community` on the running server) — all
  five returned real HTTP 200s with a clean dev-server log (no stack
  traces, no Vite error overlay triggers). **Stated plainly, matching
  Decision Log #25's own honesty about this**: no real browser or
  Playwright/Puppeteer-style visual check was available in this
  environment either, so "real pages requested against a live dev
  server" plus the jsdom-based StrictMode/console-error smoke test above
  is the actual verification ceiling here, same as it was for the Router
  6→7 migration — this is not a substitute for an actual human browser
  check. **`apps/admin` was not touched at all** — not its `package.json`,
  not its React version, not its React Router version — confirmed by a
  clean `git diff` scoped to `apps/admin/` showing zero changes.
  **React Router 8 is now genuinely unblocked**, not just declared
  unblocked: its own peer-dependency floor (`react`/`react-dom`
  `>=19.2.7`) is satisfied by this branch's `19.2.8`, confirmed against
  the same real npm registry metadata Decision Log #25 used originally —
  but `react-router`/`react-router-dom` versions were deliberately left
  untouched in this PR (explicitly out of scope), so that upgrade is
  still its own separate, not-yet-started follow-up PR, not bundled here.
- **`sprint-2/react-router-8-upgrade` upgrades `apps/web` from React
  Router 7 (`7.18.2`) to React Router 8 (`8.3.0`), closing Decision Log
  #25's originally-recorded blocker now that both halves it named —
  React 19 (Decision Log #27) and Router 8 itself — are landed.** See the
  dedicated Decision Log #28 entry above for the full detail: the real
  upstream changelog findings (Node `22.22.0+`, React `19.2.7+` baseline,
  ESM-only, full `react-router-dom` package removal, every `future.v8_*`
  flag now default-on), the real `apps/web/src` grep results (zero
  matches for every changed/removed API the changelog calls out, and zero
  `future` flags were ever opted into in `router.tsx` to begin with), the
  Node-engine gap this same PR folded in and fixed, not left as a
  follow-up (`react-router@8.3.0` declares `>=22.22.0`; root
  `package.json`'s `engines.node` and `.github/workflows/ci.yml`'s single
  `actions/setup-node@v4` step — shared by every job, `services/api` and
  `apps/admin` included — are both now `22.22.0`, with CI itself proven
  green on that floor, not just the YAML edited), and the mandatory hoisting
  check (clean — `apps/admin`'s React 18/`react-router-dom@6.30.6` tree is
  fully deduped and untouched, `apps/web` resolves cleanly to
  `react-router@8.3.0` on React `19.2.8`, and PR #74's existing scoped
  `@soccernity/web` override already covered `react-router` by name with
  no edit needed). Verification: `apps/web` vitest 1 suite / 7 tests, 0
  failures (unchanged); `npx tsc --noEmit` clean; `npm run build` clean;
  a temporary Vitest spec (deleted before commit) mounted the real
  `router.routes` via v8's `createMemoryRouter`/`RouterProvider` under
  `<React.StrictMode>` for all 14 real paths, zero
  `console.error`/`console.warn`; the dev server was started and all 14
  paths were `curl`'d directly, all real HTTP 200s. Same honesty as
  Decision Log #25/#27: no real browser/Playwright check was available in
  this environment, so this jsdom smoke test plus the live dev-server HTTP
  check is the actual verification ceiling. `router.tsx`'s own header
  comment is updated in place to describe the v8 state rather than left
  describing the now-resolved v7-blocked-on-Router-8 history.
- **`sprint-2/club-picker-ui` builds the club-picker step in `apps/web`'s
  signup flow (Build Plan Section 6's Sprint 2 line), closing the gap
  `sprint-2/auto-join-on-signup` (PR #67) explicitly left open — a
  frontend-only PR, no backend code touched.** Before writing any code,
  the real blocker this task was briefed to surface was confirmed, not
  assumed: `GET /clubs` (`services/api/src/modules/clubs/
  clubs.controller.ts`) is `@UseGuards(JwtAuthGuard)`-only, deliberately
  (see that file's own guard-reasoning comment), and `apps/web`'s
  `SignupFlow.tsx` step machine (age-gate → guardian-details → register)
  runs entirely before any account — and therefore any JWT — exists.
  There is no existing authenticated-fetch pattern anywhere else in
  `apps/web` either (only `LoginPage.tsx` handles a token at all, by
  stashing it post-login). **Direction chosen: (b), club selection moved
  to *after* account creation, not (a) loosening `GET /clubs`'s guard or
  adding a new public endpoint** — a real, deliberate choice, not a
  default. `ClubPickerStep.tsx` is a new, skippable step rendered from
  `RegisterStep.tsx`'s existing success view (previously just a
  "Continue to Soccernity" link, now replaced by this step, whose own
  final action carries that same copy/destination once at least one club
  has been joined, or "Skip for now" until then — one action, not two
  redundant buttons). It uses the `accessToken` `RegisterResponse`
  already returns (`apps/web/src/api/auth.ts`) to call a new
  `apps/web/src/api/clubs.ts` client (`listClubs`/`joinClub`, `Bearer`
  header, mirroring `services/api`'s real `ClubPageResult`/`JoinState`
  shapes exactly). **A direct, practical consequence of choosing (b):
  `RegisterDto.clubId` — the auto-join-on-signup field
  `sprint-2/auto-join-on-signup` added specifically for this — goes
  unused by the web client.** It's still real, tested backend capability
  (mobile or a future direct-API caller can still use it); the web
  client instead calls the already-public-to-authenticated-users `POST
  /clubs/:id/join` itself, after registration, which is the more natural
  fit once the picker is a post-account step rather than a field on the
  registration payload. No guard was changed anywhere, so this closes
  with no new Decision Log candidate of its own — seeing (a) was the
  branch that would have needed one. A simple client-side substring
  filter over already-loaded clubs (not a real cross-catalog search — 
  `GET /clubs` has no text-search parameter, only `league`/`country`
  equality filters) plus cursor-based "Load more" cover the "searchable/
  browsable list" ask; no dedicated Figma screen exists for this step,
  flagged as a real design gap rather than invented design language —
  built plain, matching `SignupSplitScreen`'s existing light-theme
  tokens/spacing. A failed join attempt shows an inline per-club error
  but never blocks the step's own continue/skip action. Verified:
  `npx tsc --noEmit` and `npm run build` in `apps/web` both clean;
  `ClubPickerStep.test.tsx` (new, 7 cases — initial load, join success,
  failed join not blocking continue, skip-without-joining, continue
  label changing once a club is joined, cursor-based load-more, load
  error) passes, `apps/web`'s full suite now 2 suites / 14 tests, 0
  failures (up from 1/7). Same standard as the React 19/Router 8 PRs: a
  temporary Vitest spec (deleted before commit) mounted the real
  `SignupFlow` end to end — age gate → register → club picker, mocking
  only the API calls — and confirmed zero `console.error`/`console.warn`
  through the whole walk; the dev server was also started for real and
  `GET /signup` returned a real HTTP 200 with a clean log. Same honesty
  as those prior PRs: no real browser/Playwright check was available in
  this environment, so this is the actual verification ceiling, not a
  substitute for a human browser check. See
  `services/api/src/modules/auth/README.md`'s and
  `services/api/src/modules/clubs/README.md`'s matching "explicitly not
  built here" bullets, now updated to point here instead of describing
  an open gap.
- **`sprint-1/f7-club-picker-code` converts the two Figma screen families
  from `sprint-1/f7-club-picker-screens` (PR #81, merged) into real
  `apps/web` code: F7 is now a real screen, and `ClubPickerStep.tsx` gets
  a visual-only dark-theme retrofit.** Two distinct tasks, same PR.
  **F7 (`VerifyEmailPage.tsx`, route `/verify-email`) replaces its
  `PlaceholderPage` stub entirely** — a new `verifyEmail(token)` client
  added to `apps/web/src/api/auth.ts`, modeled directly on
  `confirmGuardianConsent`'s same unauthenticated/non-enumerating
  pattern. Token read from `?token=` via `useSearchParams`, mirroring
  `GuardianConsentConfirmPage.tsx` exactly: no token present renders the
  Missing Token state and the API call never fires (proven by a test,
  same as that page's own precedent); a token present auto-fires on
  mount, showing Verifying while in flight, then Verified or the generic
  Link Invalid Or Expired message on a 400 (no invalid-vs-expired
  distinction leaked, matching the backend). **This closes Sprint 1's own
  exit criterion end to end** — see the updated note earlier in this
  Sprint 2 section. Two decisions were deliberately left open rather than
  resolved here: (1) the Verified state's CTA routes to `/profile`, not
  `/` — confirmed `HomePage.tsx` is still a `PlaceholderPage` stub today,
  `ProfilePage.tsx` is the one real authenticated destination that
  exists; (2) a verified minor with pending guardian consent still lands
  on the standard Verified state (a disclosure row only, no redirect) —
  `{ verified, userId }` carries no consent-status field to branch on,
  and the merged design PR's own report already left open whether such a
  user should route to the restricted-pending view instead, so this PR
  repeats that question rather than picking a side. The Figma frames'
  "Contact support" affordance on the error/missing-token states is
  rendered as a visibly present but disabled button (no dead link) —
  confirmed by grep that no resend-verification endpoint and no support/
  contact destination (mailto, `/contact` route) exist anywhere in this
  codebase.
  **`ClubPickerStep.tsx`'s visual theme is retrofitted from
  `SignupSplitScreen`'s light theme (used only because no Figma design
  existed at the time it was built) to the real dark Soccernity Theme
  design — behavior is unchanged.** All 7 pre-existing
  `ClubPickerStep.test.tsx` tests pass completely unchanged (same names,
  same assertions) — the retrofit is purely markup/CSS-class driven, as
  it needed to be. **A real shell/architecture decision was required and
  is documented, not silently made**: the Figma club-picker frames are
  full-bleed, single-column, dark — structurally incompatible with being
  nested inside `SignupSplitScreen`'s light two-panel shell the way it
  used to be. `ClubPickerStep` now owns its own self-contained full-bleed
  dark shell (the same negative-margin-cancels-`AppShell`-padding
  technique `GuardianConsent.css`/`SignupSplitScreen.css` already
  established, so as not to duplicate a second logo/top bar under the
  real site `Header`), and `RegisterStep.tsx`'s success branch now
  renders it as a full replacement rather than a child of
  `SignupSplitScreen`. The former "Account created"/guardian-email
  confirmation text moved into a new, optional, additive
  `confirmationMessage?: ReactNode` prop — no existing caller/test passes
  it, so this is backward compatible by construction. Two Figma-vs-
  shipped-code conflicts were deliberately kept, not fixed: the "Load
  more clubs" button label (Figma says "Load more") stays exactly as
  shipped since `ClubPickerStep.test.tsx` asserts on that exact text; and
  the single "No clubs match that filter." string still covers both
  "zero clubs total" and "filter matched nothing" — a known, reproduced-
  as-is ambiguity in both the merged design and the code, not a
  drive-by fix. New route-scoped theme-vars files
  (`verify-email/verifyEmailThemeVars.ts`, `signup/clubPickerThemeVars.ts`)
  follow `consentThemeVars.ts`'s established convention exactly: each
  distinct route/flow gets its own scoped file sourced from
  `packages/shared`'s `colors.dark`, even when the underlying values are
  identical to another flow's. Verified: `npx tsc --noEmit`, `npm run
  build`, and `npm run lint` all clean; `apps/web`'s full vitest suite —
  **7 suites / 41 tests, 0 failures** (up from 5 suites / 32 tests before
  this PR — one new `VerifyEmailPage.test.tsx`, 4 cases, following
  `GuardianConsentConfirmPage.test.tsx`'s conventions). A real dev-server
  smoke test (`/verify-email?token=...`, `/verify-email` with no token,
  and `/signup`'s club-picker step) returned clean HTTP 200s with no
  console errors — same verification ceiling as every prior frontend PR
  in this project (no real browser/Playwright available in this
  environment).
- **`sprint-2/followers-scope-fix` revisits Decision Log #31, not
  overrides it: `GET /users/:id/followers` and `GET
  /users/:id/following` for a restricted-pending minor as the TARGET
  (`:id`) now 404 for every caller, matching a non-existent user.**
  #31's original public-scope reasoning still stands for non-restricted
  users — this closes one specific gap it never checked (its own
  reasoning only tested whether Section 8.3 step 5's *enumerated*
  restricted-pending list named these two routes, not the broader
  principle that a minor's profile shouldn't be visible pre-consent).
  `UsersService.assertFollowGraphVisible` is a new service-level check
  reading the target `:id`'s `isMinor`/`Guardian.consentStatus` —
  deliberately not `GuardianConsentGuard`, which only ever gates the
  *caller's* own restricted status, not another user's. Verified:
  `npx tsc --noEmit`, `npm run build`, `npm run lint` all clean; mocked
  suite 34 suites / 394 tests, 0 failures (8 new); e2e suite unchanged,
  7 suites / 39 tests, 0 failures (this fix is unit-testable, no e2e
  spec needed). See `users/README.md`'s "followers/following
  restricted-pending gap" section and Decision Log #31/#41.
- **`sprint-2/account-deletion-sweep` implements Decision Log #42's
  retention policy for real: a `pending_deletion` account
  (`AuthService.deleteAccount`) now gets an actual hard `User` DELETE
  30 days after `pendingDeletionAt` (new field — `accountStatus` alone
  never recorded when the state began), via a daily `@Cron` job, not a
  manually-triggered endpoint.** Guardian/consent records survive that
  hard-delete on purpose: a new, deliberately decoupled
  `ConsentAuditRecord` (`minorUserId` as a plain string, not an FK —
  the whole point is surviving the `User` row it describes) snapshots
  `consentStatus`/`consentConfirmedAt`, then the real `Guardian` row is
  deleted, then the `User` row — all in one transaction, so a blocked
  delete can't leave Guardian gone with User still there.
  `ConsentAuditRecord` gets its own independent 6-month purge timer,
  matching Decision Log #42's "~7 months total" math.
  **Investigation found every FK from Post/Comment/Follow/Like/
  SavedPost/Notification/Report/Message/LeaderboardEntry/
  GrassrootsTeam/Result to `User` is `ON DELETE RESTRICT`** — meaning,
  as shipped here, **a hard-delete failed for any account with real
  activity.** Flagged then as a new Decision Log #44 candidate — since
  resolved by the founder as option (a), cascade, applied to those
  eleven tables (not Guardian, which stays on #42's separate
  snapshot-then-delete mechanism); implementation is a follow-up PR
  (`sprint-2/account-deletion-cascade`), not yet merged as of this
  bullet. Verified for this PR specifically: `npx tsc --noEmit`,
  `npm run build`, `npm run lint` all clean; mocked suite 35 suites /
  407 tests, 0 failures; e2e suite (real Postgres, real `RESTRICT`
  constraint exercised, not mocked) 8 suites / 51 tests, 0 failures. A
  real bug caught mid-PR by the e2e suite itself: `Date.setMonth`
  drifted the 6-month cutoff by an hour across a DST boundary — fixed
  to `setUTCMonth`.
- **`sprint-2/account-deletion-cascade` implements Decision Log #44 (cascade,
  resolved by the founder): all eleven User-referencing FKs are now
  `ON DELETE CASCADE`, not `RESTRICT`.** A hard-delete on any account —
  including one with real activity — now succeeds. Second-order discovery
  made while implementing, not a new policy question: `Comment.postId`,
  `SavedPost.postId`, and `Like.postId` were *also* `RESTRICT` (against
  `Post`, not `User`), which would have silently blocked the cross-user
  cascade the founder's own resolution describes — flipped those three
  to `CASCADE` too. `Guardian.minorUserId` stays `RESTRICT`, unchanged —
  confirmed directly against `information_schema.referential_constraints`,
  not assumed — Decision Log #42's separate snapshot-then-delete
  mechanism still depends on it. **The core cross-user consequence is
  proven by a real Postgres e2e test**: hard-deleting User A also deletes
  User B's own `Comment`/`Like`/`SavedPost` on User A's post, while User
  B's own account is explicitly asserted untouched.
  `AccountDeletionSweepService`'s `P2003` catch was reworked, not deleted
  — kept as a defensive fallback for schema drift, recharacterized from
  an expected/routine path to an investigate-this signal, since
  `blockedUserIds` should now stay empty in normal operation. One piece
  deliberately left alone: `Fixture.teamAId`/`teamBId` and
  `Result.fixtureId` (GrassrootsTeam's own children) remain `RESTRICT`
  — `GrassrootsModule` isn't wired into the app yet, so this chain is
  unreachable today; flagged for whoever builds it. Verified:
  `npx tsc --noEmit`, `npm run build`, `npm run lint` all clean; mocked
  suite 35 suites / 408 tests, 0 failures (1 new); e2e suite (real
  Postgres, real cascade fired, not mocked) 8 suites / 54 tests, 0
  failures (the 2 stale "blocked" tests from PR #88 replaced with 5 new
  ones, including the cross-user cascade proof and the raw-SQL schema
  checks).
- **`sprint-2/leaderboard-design-new` designs a brand-new "Leaderboard Page
  Desktop" frame (`5171:6633`) in Figma — no leaderboard screen existed
  anywhere in the file before this.** Routing note: this task was dispatched
  labelled "Agent: figma-design-system," but was new-screen design work
  ("no existing frame to revise"), so it was routed to `figma-screen-builder`
  instead, per that agent's own documented boundary — flagged rather than
  silently followed or silently overridden. Ranked by a plain integer, no
  reward iconography (Phase 2), real display names including minors per
  Decision Log #45, restricted-pending minors simply absent from the data.
  Global/Per-Club/Per-Competition/Per-Time-Period are one combinable filter
  bar, not four screens; "Competition" (umbrella) vs. "Contest" (one
  video-skill-challenge type, eventually fed by `2072:5584`, not wired in
  this pass) follows this project's taxonomy, with the competition selector
  designed to accept future types generically. Full detail in
  `docs/sprint-2-leaderboard-page-design-report.md`. **This design surfaces
  three new open Decision Log candidates, none resolved here**: (1) no
  points model exists anywhere in the schema or API — this board ranks by
  an integer the platform doesn't yet store; (2) the schema has two
  different "club" mechanisms (`ClubPage` membership vs.
  `User.clubAffiliationId`) plus an unbuilt grassroots-team concept, and
  which one the club-filter axis means isn't decided; (3) whether the board
  is visible to logged-out visitors (relevant given minors' real names are
  shown for scout/club visibility, and scouts may not have accounts) is
  unresolved. `figma-to-code` should not build this screen until at least
  the points-model question is settled.
- **`sprint-2/brand-guide-light-mode-tokens` documents a new "Brand Guide —
  Light Mode Tokens (Sprint 2)" frame (`5182:6652`) in Figma, pairing with
  Sprint D's existing dark-mode frame (`5100:2`, untouched), and fixes one
  confirmed off-brand colour bug.** Five tokens, all traceable to the two
  brand hex values: `brand/navy` `#282E65` and `brand/green` `#7BB929`
  (existing, unchanged); `brand/green-tint 12%` (reused as-is from Sprint
  D's own variable, not re-derived); `color/text/on-navy` `#FFFFFF` (a new
  variable formalising an already-correct pairing — Frame 397's social
  labels already render white on navy); and `brand/off-white` `#F4F5FB`
  (**newly derived** this session — same hue/saturation as navy, HSL
  `234.1°, 43.3%`, but lightness raised to 97% rather than lowered to 9%,
  the light-mode mirror of how Sprint D derived `bg/page-dark`; disclosed
  finding: the *existing* `color/background/page` Light value is flat
  `#FFFFFF`, not derived this way, so `brand/off-white` is a genuinely new,
  additional token, not a replacement — whether it should become one is an
  open question). Both new tokens are real Figma Variables in the existing
  `Soccernity Theme` collection (`VariableCollectionId:5096:2`), matching
  Sprint D's own convention, not just documented swatches. **One contrast
  failure found and disclosed, not silently patched**: `brand/green` on
  `brand/off-white` measures 2.19:1, failing AA — resolved by scoping
  green's usage note to icon/accent fills only, never text on a light
  background, consistent with how the file already treats green elsewhere;
  no new colour was introduced. **Bug fix**: Frame 396's wordmark
  (`2286:1364`) was rendering `#040404` (near-black, off-palette) — fixed
  to `brand/navy` `#282E65`, bound to the real variable. Full detail,
  including the hand-computed contrast ratios and the two disclosed
  placeholder decisions (`brand/off-white`'s Dark-mode value is inherited
  from `color/background/page`'s existing dark value, not independently
  derived — light-mode-only scope), in
  `docs/sprint-2-brand-guide-light-mode-tokens-report.md`. Icon library
  standardisation and the club-crest-licensing question remain open,
  untouched, same as Sprint D and the leaderboard design left them.
- **`sprint-2/homepage-rebuild` rebuilds the homepage from scratch in Figma as a
  new frame, "Home Page Desktop — Light Mode Rebuild (Sprint 2)" (`5191:6652`),
  replacing the hero-only patch of PR #94 (`sprint-2/homepage-hero-rework`),
  which the founder rejected as insufficient.** Routing note: dispatched
  labelled "Agent: figma-screen-builder", but the target frame (`2631:3951`)
  **already exists**, which normally makes it `figma-design-system`'s domain —
  the brief's scope (full reconstruction/reassembly of the whole page, not a
  token retouch of an existing layout) is why it was routed to
  `figma-screen-builder` instead. Flagged rather than silently followed; this is
  the mirror of the Leaderboard bullet's own routing flag, running the opposite
  direction. **The original `2631:3951` was deliberately preserved, not
  overwritten** (2,191 nodes, non-reproducible raster placement, and the founder
  needs a side-by-side) — whether it should now be archived or replaced is an
  open call, not made there. Full-page assembly of reused pieces only: Header
  re-instanced as the same `header 7` variant, and all hero / fixture-crest /
  About-icon / Talents / Trending imagery cloned from the original rather than
  re-sourced. Everything is auto-layout, explicit **Light** mode, and **the body
  of the page has zero unbound paints** (the two remaining unbound zones are
  deliberate: reused club-crest trademark art, and the shared `Header`
  instance). **Before/after colour audit, measured not estimated**: the original
  had 2,006 solid paints with only **27 bound (1.3%), all 27 inside the `Header`
  instance**, and carried real off-palette black — `#1E1E1E` (the footer's own
  background), `#232323` ×18, `#000000` ×59, `#0E0E0E` ×2, `#000000` @35%/@50% —
  all fixed in the rebuild, same disclosure discipline as PR #96's `#040404`
  wordmark. Non-colour defects found and fixed: two duplicate footer social
  bars, a `visible = false` LinkedIn icon, a 4.97px ghost "Soccernity" text
  node, a duplicated "Terms of Service" link, a 2022 copyright, an orphan
  "Address" label, the hero's supporting paragraph being copy-paste leakage of
  the Zaha news blurb, ×3 duplicated Trending cards, the "Scounting" typo ×4,
  and three cards positioned off-canvas outside their own parents. **One real
  contrast failure caught by measurement, not by eye**: white hero text over the
  reused pitch photo at the initially-built 62% navy scrim measures 3.98:1
  worst-case (fails AA); raised to 72%, it measures 5.32:1. Separately confirmed
  that **white on `brand/green` is 2.38:1 and fails AA** — the green Trending
  band uses `color/text/on-green` (navy, 5.28:1) instead, the mirror of PR #96's
  green-on-light finding. Full detail in
  `docs/sprint-2-homepage-rebuild-report.md`. **This rebuild surfaces new open
  Decision Log candidates, none resolved there**: (1) **the big one — is `/` the
  logged-out marketing landing page or the authenticated home feed?** The brief
  named a create-a-post card, suggested follows and feed posts as things to
  reuse "from the current Home Page Desktop frame"; they are not on it and it
  has no variants — they live in the **Community** pillar (`1306:7149` and the
  four `Create a post` frames), and the homepage's own Header is `header 7`, the
  logged-out variant, so a signed-in composer can't coexist with it; `apps/web`'s
  `/` is still a `PlaceholderPage` stub, so the code settles nothing either;
  rebuilt as the marketing page it demonstrably is, with the merge question
  flagged rather than assumed; (2) a **club-picker entry point was deliberately
  not built** — no component exists for it, and adding one to a logged-out page
  would contradict `sprint-2/club-picker-ui`'s already-resolved direction (b)
  (club selection happens *after* account creation, because `GET /clubs` is
  `JwtAuthGuard`-only); (3) **Trending Topics and Today's Fixture have no data
  source** — both are placeholder, blocked on the still-unresolved **Decision Log
  #6** (sports-data vendor), and Section 4 defines no news or fixtures endpoint,
  so `figma-to-code` must not wire either; (4) the shared **`Header` component
  still carries `#000000` ×12, `#0E0E0E` ×2, `#000000` @35% and a green-tint
  search pill** — deliberately not overridden from inside a screen-design task,
  so this is a real open retrofit item for `figma-design-system` affecting
  **every** screen in the file, not just this one; (5) whether `brand/off-white`
  should replace `color/background/page`'s flat `#FFFFFF` Light value — PR #96's
  own open question, now with a concrete screen depending on the answer. Also
  worth knowing for anyone writing Figma variables in this file:
  `setBoundVariableForPaint()` keeps the literal colour you pass it underneath
  the binding, and a genuinely-bound paint can still **render as that literal**
  (black icons that read back as correctly bound to `brand/green`) — pass the
  variable's resolved value, not a `{0,0,0}` placeholder.
- **A second pass on the same `sprint-2/homepage-rebuild` branch/PR (#97, still
  unmerged) added a third homepage frame, `5204:6728` — "Home Page Desktop —
  Premium Light (Sprint 2, Pass 2)".** This was a fix-up commit, not a new
  branch or PR. **The founder's brief for this pass asserted, incorrectly, that
  the file had no Figma variables at all and asked for a new collection to be
  created** — the agent verified live before acting rather than trusting the
  brief, found the existing `Soccernity Theme` collection (see "Figma notes"
  above) fully intact, and did **not** create a duplicate. Every colour value
  the brief asked for already existed at the exact same value under a
  different name (`brand/green-tint-12`→`brand/green-tint`,
  `surface/neutral`→`brand/off-white`, `text/on-dark`→`color/text/on-navy`);
  existing names were kept, per the brief's own "no naming drift" instruction.
  Pass 1's binding claims were also independently re-audited, not just
  trusted, and held up. **Build directive for this pass was looser than Pass
  1's**: reuse only the header and footer (footer cloned from Pass 1's
  already-fixed version, not the raw original — flagged, since the brief said
  to pull from the original), invent everything else. Result: 269 bound / 0
  unbound paints across the entire authored page body (Pass 1's fixture strip
  still carried 1,760 unbound club-crest trademark paints; this pass replaced
  crest cells with typographic fixture cards specifically to drop that
  dependency — a real product/legal-facing decision, not just cleanup, see the
  report's Decision Log candidate #2). One real AA contrast failure was caught
  by measurement and fixed (a green eyebrow label on a 28%-tint chip over navy
  measured 3.34:1; fixed by setting the label to `color/text/on-navy` and
  keeping green only as a small non-text dot). Two real bugs were found and
  fixed: three cloned thumbnails resized against a stale pre-reflow width
  (showing cropped, wrong-aspect images), and `figma.createVector()` silently
  adding unbound black strokes to new nodes. Full detail, including the
  complete token-mapping table and six new open Decision Log candidates (which
  homepage frame is now canonical given three exist; whether fixtures should
  ever show licensed club crests; a naming asymmetry between
  `brand/green-tint` and `brand/green-tint-28`; `color/background/page` going
  unused for a second frame running; no elevation/shadow token convention yet;
  and that this pass's "season record" hero card implies a per-player stats
  model with no schema backing, the same class of gap the Leaderboard design
  flagged for its own points model), in
  `docs/sprint-2-homepage-rebuild-variables-report.md`. **All three homepage
  frames — `2631:3951` (original), `5191:6652` (Pass 1), `5204:6728` (Pass
  2) — currently coexist; picking a canonical one is the founder's call, not
  made by either pass.**
- **`sprint-2/retrofit-light-mode-tokens` (PR #98, merged) retrofitted 16
  existing screens — Leaderboard, all six Guardian Consent screens, all
  five Club Picker screens, all four Verify Email screens — to light-mode
  tokens.** Flagging a real gap, not silently fixing it after the fact:
  **that PR never added a status bullet to this file**, the exact drift
  this file's own "Keeping this file current" section exists to prevent —
  the agent that did that work had no shell/Bash tool available and
  couldn't commit or edit this file at all (see that PR's own report,
  `docs/sprint-2-retrofit-light-mode-tokens-report.md`, §10), and
  whoever merged the PR on Temi's behalf didn't add the bullet either.
  Full detail lives only in that report; the short version: it found all
  16 frames were already variable-bound but pinned to Dark mode, fixed a
  real invisible-footer-text bug, and left open Decision Log candidates
  including "should the shared `Header` component's off-palette black and
  `green-tint-28` search pill be fixed file-wide" — see the next bullet.
- **`sprint-2/retrofit-light-mode-tokens-round2` (PR #99) retrofits the
  remaining 11 named sections — Blog, Sports/Livescores, Bants, Message,
  Contest, Community, Create Post, Settings, Components, and both mobile
  Community/Message sections — 80 frames total, to the same light-mode
  token standard used by the Premium Light homepage (PR #97/#98) and
  Leaderboard (PR #98).** Admin Panel, Auth Pages, and Email Template are
  explicitly deferred to a separate push. Full detail, including a
  per-section breakdown and 12 open Decision Log candidates, is in
  `docs/sprint-2-retrofit-light-mode-tokens-round2-report.md`. Headlines:
  **this closes the prior bullet's own open item** — the shared Navbar's
  off-palette black and its `brand/green-tint-28` search pill (flagged
  three times before this: CLAUDE.md, PR #96, PR #97) are now fixed at
  the component level, not just one instance. Also root-caused and
  eliminated `brand/green-tint-28` everywhere else it had spread (Bants,
  Settings' live and an orphaned toggle-switch component). Found and
  corrected a **documentation error in this PR's own first batch**: the
  Navbar's `header 4`/`header 7` variant labels were reported backwards
  in that batch's own summary (its detailed content description was
  actually correct) — independently re-verified via live screenshot +
  metadata before it could propagate: `header 4` is logged-in, `header 7`
  is logged-out. Found and fixed a recurring copy-paste bug (`#034694`, a
  club-crest blue) used by accident as real UI color — footer copyright
  text, a CTA button background, dividers, tab labels — across Community,
  Create Post, and Community (Mobile). Confirmed, not merely assumed, that
  a recurring "muted metadata text fails AA" finding reported across five
  separate sections (Bants, Message, Message Mobile, Contest-adjacent,
  Create Post) is a real, unresolved design decision (deliberately
  low-opacity, already-on-brand navy text) and not a tooling bug, by
  distinguishing it from a superficially similar but structurally
  different black-text case in Community/Settings/Community Mobile that
  *was* correctly fixed. Surfaced that `1306:7149`/`1308:11643` (the
  Community Home Page Template referenced by name in this task's own
  brief) are both `visible: false` and render nothing anywhere in the
  file — not fixed, flagged for whoever owns that content next. Also
  surfaced: a text-node fill rebind can silently trigger a Figma
  text-wrap regression on tightly-boxed nodes (found and fixed in the
  final batch, **not retroactively checked across the other 8 batches**
  — a real follow-up gap, not closed by this PR). Merged as PR #99.
- **`sprint-2/retrofit-light-mode-auth-email` retrofits the two sections
  PR #99 explicitly deferred — AUTH PAGES (10 frames) and EMAIL TEMPLATE
  (5 existing + 1 new) — to the same light-mode token standard, plus a
  Date-of-Birth field, the reset-password email, and per-screen navbar
  variants.** ADMIN PANEL is still deferred to its own later push; the
  Guardian Consent / Club Picker / Verify Email frames were already done
  (PRs #98/#99/#82) and were left untouched. Full detail in
  `docs/sprint-2-retrofit-light-mode-auth-email-report.md`. Headlines:
  - **The 10 auth frames were a pre-brand indigo template** (`#4F46E5`
    buttons/links, `#6C63FF` illustration accents, `#000000` headings,
    `#F3F4F6` inputs, **zero** variable bindings, **no navbar**). Now
    100% bound (frame bg → `brand/off-white`; headings/labels/links →
    `color/text/primary`; sub-copy/placeholders → `color/text/secondary`;
    inputs/checkbox/avatar-placeholder → `brand/green-tint` 12%; primary
    buttons → `brand/navy` + `color/text/on-navy`; illustration ground →
    `brand/navy`, pitch/foliage → `brand/green`, linework →
    secondary/`color/icon/inactive`). **Deliberately left unbound and
    documented:** the `undraw` goalkeeper illustration's ~9 skin/hair
    hexes — re-binding them would break the figure, same precedent as
    PR #97's club-crest trademark art.
  - **Primary buttons resolved to `brand/navy` (not `brand/green`)** for
    a single consistent treatment across auth + email; `color/text/on-green`
    is unused in this delivery. Flagged as a judgment call, not a spec.
  - **Date of Birth field added to Register desktop + mobile**, reusing
    the existing-but-unwired date picker **"Group 847"** (`5230:25115`,
    self-labelled "Date picker for date of birth field") — retrofitted
    (86 paints re-bound) and integrated as an open-state picker below the
    new field on both frames, rather than building a new one.
  - **New "Reset your password" email frame** (`5372:7272`, cloned from
    `1380:2297`) — the forgot-password reset-link email, distinct from
    the existing after-the-fact "password changed" confirmation. Copy
    matches the real backend send
    (`password-reset/email/password-reset-email.service.ts`: subject
    "Reset your Soccernity password", 60-min TTL per
    `DEFAULT_RESET_TOKEN_TTL_MINUTES`).
  - **All 6 email templates re-copied** to a consistent standard (clear
    heading, concise body, one CTA where relevant, uniform "The Soccernity
    Team" sign-off). **Copy-accuracy flags (no code changed):** only the
    new reset-password email maps to a real backend send — the other 5
    templates (account-created welcome, both password-change emails, both
    admin/mod emails) are **not wired to any backend send** today;
    `1380:2297` originally described an email-link password-change flow
    that does not exist (real `POST /auth/change-password` is immediate +
    revokes sessions, no email step) and overlapped `1380:2318` — renamed
    + rewritten as a security *notification*, overlap still flagged;
    "recive" → "receive" and inconsistent sign-offs fixed everywhere.
  - **Navbar variants:** `header 7` (logged-out) added to Login/Register/
    Forgot/Reset desktop; `header 4` (logged-in) added to Create Profile
    desktop — **flagged ambiguous** (post-registration the user has a
    session, but a mid-onboarding full logged-in nav is arguable).
    **Mobile auth frames got no navbar** — `2824:4309` had only 1440px
    desktop variants, no mobile variant existed; flagged as a named
    follow-up. **Now closed — see `sprint-2/mobile-navbar-variant`
    below.** Whether auth pages should carry the full app nav at all is
    still flagged for design review.
  - **Decision Log #46 added** (Build Plan Section 9): the founder
    confirms **`5204:6728` "Home Page Desktop — Premium Light (Sprint 2,
    Pass 2)" is the canonical homepage**; `2631:3951` and `5191:6652` are
    preserved but non-canonical. Closes the open question from PR #97's
    report / `sprint-2-homepage-rebuild-variables-report.md` §10.
  - **Decision Log #47 added**: the founder confirms **`brand/green-tint-28`
    is NOT a real design-system token** — the only wash token is
    `brand/green-tint` (12%). This delivery uses only `brand/green-tint`
    and introduced zero new `-28` usages, but a file-wide scan found
    **~133 pre-existing `-28` bound paints** across Navbar/Guardian-Consent/
    Leaderboard/Club/Settings/Homepage frames. **Rebinding all 133 +
    deleting the variable (`5098:7071`) is a named follow-up
    `figma-design-system` cleanup PR** — deliberately not bundled into
    this scoped auth/email retrofit (six out-of-scope screen families,
    real regression risk). PR #99's claim that it "eliminated
    `brand/green-tint-28` everywhere else it had spread" was
    over-stated — the component was fixed (fresh navbar instances are
    clean) but old instances and other frames still carry it.
  - **Numbering note (now closed):** `docs/sprint-2-leaderboard-page-design-report.md`
    references a "Decision Log #45" (real display names incl. minors on
    the leaderboard) that was never actually written into Build Plan
    Section 9's table when this PR was merged — a drift gap; this PR left
    #45 free for that entry and used #46/#47. **That gap is now closed**
    — #45 has been transcribed retroactively into Section 9, between #44
    and #46, recording the founder's contemporaneous decision (real
    display names for all users including minors; restricted-pending
    minors simply absent from the data, per the platform-wide
    restricted-pending rule).
  - Merged as PR #100.
- **`sprint-2/mobile-navbar-variant` designs the mobile navbar variant
  PR #100 flagged as missing, and applies it to the five Auth Pages
  mobile frames.** Two variants added **inside the existing set
  `2824:4309`** (not a standalone frame): `Property 1=header 7 — mobile`
  (`5386:6575`, logged-out) and `Property 1=header 4 — mobile`
  (`5386:6576`, logged-in) — single-property naming so they stay paired
  with the desktop `header 4`/`header 7` in the variant picker (a second
  "Breakpoint" property was rejected — would have meant renaming the
  existing desktop variants). Built at **428px** (the mobile-screen
  convention already in this file — `community mobile 1–5` /
  `Messages mobile window 2/4` are all 428 wide), **64px** tall,
  `color/background/surface` bg, `SPACE_BETWEEN` auto-layout. Every
  element cloned from the desktop variants so both breakpoints share
  sub-components + tokens: logo (mark → `brand/green` + navy, wordmark →
  `color/text/primary`), a standalone search icon (`brand/navy` stroke,
  collapsed from the desktop search pill), and the right-side action —
  Login button (`brand/navy` + `color/text/on-navy`) for logged-out,
  messages glyph + avatar for logged-in. **The 6-icon nav row + full
  search pill are dropped on mobile** — that nav lives in the separate
  bottom tab bar (`Mobile App Nav Icons`, `2230:4328`), and an auth
  screen needs neither. **0 unbound paints** in either variant; only
  Light-mode Soccernity Theme tokens, **no `brand/green-tint-28`**
  (Decision Log #47), no new colour, no dark-mode. **Applied to all five
  Auth mobile frames** — `header 7 — mobile` on Login (`1625:2303`) /
  Register (`1625:2333`) / Forgot (`1625:2375`) / Reset (`1625:2404`),
  `header 4 — mobile` on Create Profile (`1629:2449`) — same
  logged-in/out judgment (and same flagged Create-Profile ambiguity) as
  PR #100's desktop counterparts. The frames are 390px wide so each
  instance is resized to 390 on placement (auto-layout reflows);
  in-frame "Group 103" logo lockups hidden, content shifted down 64px
  (Create Profile mobile, being VERTICAL auto-layout, gets an
  `ABSOLUTE`-positioned navbar + `paddingTop` 40 → 104 instead).
  **Decision Log #48 added** (Build Plan Section 9), formally closing
  PR #100's "mobile auth navbar" follow-up. Full detail:
  `docs/sprint-2-mobile-navbar-variant-report.md`. Merged as PR #101.
- **`sprint-2/admin-panel-shell-unification` unifies the Admin Panel
  shell across all 15 existing Admin screens and adds 9 new Admin
  screens — a deliberate ONE-TIME combined-scope PR** (existing-frame
  retouch, normally `figma-design-system`, + brand-new screens, normally
  `figma-screen-builder`, run together this once to save a round trip;
  **the normal split resumes after this PR**). Full detail:
  `docs/sprint-2-admin-panel-shell-unification-report.md`.
  - **Phase 1:** added a **"Categories"** sidebar item (2×2-grid icon
    `u:apps`, above "Contest", Settings still pinned bottom) to both
    Contest tab frames (`2363:2244`, `2363:3446`). Plus a disclosed
    "Phase 1b" token-cleanup of both Contest shells — sidebar wash →
    `brand/navy` @ 12%, all nav labels/icons → `color/text/primary` /
    `color/text/on-navy`, search placeholder → `color/text/secondary`,
    and the **recurring logo-wordmark-in-green bug fixed** (→
    `color/text/primary`) + the 6.7 px ghost "Soccernity" text hidden.
  - **Phase 2:** the 13 other Admin screens (Dashboard, Articles,
    Articles-Create Post, Categories, Categories-Add Category, Media,
    Media Upload 1/2, Media Preview, Users-team members, Settings,
    Settings-Add/Edit role) had their old sidebar (`Group 65`) + top bar
    (`Group 64`) + standalone action buttons **removed wholesale** and
    replaced with a clone of the cleaned Contest shell, grouped "Admin
    Shell". Per-screen active nav item set; top-bar primary button
    relabelled per screen ("Create Article", "Add Media", "Add Role",
    "Save Changes", …) and **removed** on Dashboard + Media Preview (no
    primary action). Shell placed at y 95 (not Contest's y 186) and nav
    list set `SPACE_BETWEEN` to pin Settings to the bottom on the
    1024-tall frames. Content areas untouched. Shell paint audit: **0
    unbound / 0 black / 0 `brand/green-tint-28`** on all 15 shells.
    **Fix-up commit on the same PR** additionally rebound the **button**
    subset of the content-area colour debt: all **12** in-content
    submit/upload buttons across 9 screens (Articles-Create Post,
    Categories, Categories-Add Category ×2, Media Upload 1/2, Settings,
    Settings-Add/Edit role ×2, Settings-Delete Role) were `#3539df`
    indigo pills — rebound to `brand/navy` with `color/text/on-navy`
    labels. Only `#3539df` was found (no `#4F46E5`/`#034694`); the
    `#3539df` action-**icon** strokes (Media/Media Preview/Users/Dashboard
    chart) were left as Decision Log #52 follow-ups.
  - **Phase 3 (9 new frames, page `0:1`, row at y 4706):** the 7 named
    screens — **Contest - Create Task** (`5403:6640`), **Contest -
    Schedule Task** (`5403:6753`, **reuses the existing calendar
    component `2365:2033`, `calendar 2` variant** — no calendar built
    from scratch), **Contest - Edit Task** (`5403:6866`), **Contest -
    Search Task** (`5403:6979`), **Contest - Delete Task** (`5403:7092`,
    scrim + confirm dialog), **Settings - Delete Role** (`5403:7205`,
    scrim + confirm dialog), **Admin - Admin Profile** (`5403:7327`,
    all nav inactive) — plus 2 audit-pass screens built beyond the named
    list: **Contest - Empty State** (`5405:8277`) and **Contest - Task
    Scheduled (Success)** (`5405:8390`). All authored paints token-bound;
    residual unbound = the reused calendar's own un-retrofitted
    internals + scrim-covered cloned table content. Delete buttons are
    **navy**, not red — no destructive token exists and non-negotiable
    #3 forbids inventing one.
  - **Six Decision Log candidates surfaced and added to Build Plan
    Section 9 in this PR (#49–#54):** #49 (Categories icon + shell-as-
    clones-vs-component + Admin sidebar icon-library mix), #50 (shell
    y-placement on 1024-tall frames), #51 (per-screen primary-action
    labels + 2 removals), #52 (**Admin Panel content areas still not
    light-mode-retrofitted** — the **button** subset now fixed by the
    fix-up commit above [12 `#3539df` pills → `brand/navy`]; still open:
    `#3539df` action-icon strokes, `#1E1E1E`, reds, black table text,
    unbound content titles + the standing "no
    `color/action/destructive` token" question), #53 (**calendar
    component `2365:2033` is not token-bound**), #54 (**"Admin Profile"
    implies an admin-account data model that doesn't exist** in Section
    3/4 — founder/backend call).
  - The Figma work and the report were produced by the
    `figma-design-system` agent (no Bash tool that session); the branch,
    commit, `.docx` Decision Log transcription and PR (#102) were
    finalised in a follow-up session with shell access. A **later fix-up
    commit on PR #102** (see the Phase-2 sub-bullet + report §11)
    rebound the 12 `#3539df` in-content button pills to `brand/navy` and
    amended Decision Log #52's Status to "Partially resolved". Not
    merged — Temi's call after independent verification.
- **`sprint-2/auth-social-signin` adds Google / Apple / Facebook
  third-party sign-in UI to Login and Register (desktop + mobile — 4
  frames: `407:844`, `1625:2303`, `407:1051`, `1625:2333`).**
  Visual/UI only — **no backend, no OAuth, no click behaviour**; the
  wiring is a separate future push once the backend side is ready. Same
  category of additive-UI-on-existing-frames work as PR #100's Register
  Date-of-Birth field. Each frame gets an identical "Or continue with"
  divider below the primary email/password submit button, then three
  full-width provider buttons (white `color/background/surface` fill,
  1px `color/icon/inactive` border, `color/text/primary` label) —
  email/password stays the visually primary path (solid `brand/navy`
  CTA). Provider order Google → Apple → Facebook, consistent across all
  four frames; desktop 440px / mobile 350px, same layout language
  scaled. All chrome bound to Soccernity Theme Light-mode tokens
  (collection `5096:2`); the **only** unbound fills are the provider
  brand marks themselves — multicolour Google G, black Apple silhouette,
  Facebook blue — a disclosed brand-non-negotiable-#3 exception in the
  same category as the undraw illustration tones and club-crest artwork.
  **Logo assets:** Google (`FRAME #355:188`) and Facebook (`FRAME
  #355:174`) reused as-is from the in-file Brand Guide social-icon demo
  (Facebook's is the older `#3C5A9A` blue, left as-is); **no Apple mark
  existed anywhere in the file** — created new from the standard Apple
  silhouette via `createNodeFromSvg`. Register-mobile note: the new
  block is placed clear of the pre-existing open-Date-of-Birth-picker
  overlap (`5379:6190`, from PR #100), not directly under the
  visually-covered primary button. **Decision Log #55** proposed
  (placement / hierarchy / provider order / Apple-button-guidelines flag
  for the OAuth pass) — written into Build Plan Section 9 (table 6) in
  this PR via `python-docx`, full text also in
  `docs/sprint-2-auth-social-signin-report.md` §7. Merged as PR #103.
- **`sprint-2/retrofit-screen-build-auth-email` is a combined
  audit-and-build pass over the Auth Pages + Email Template sections and
  the flows they belong to** (registration, login, verify-email,
  forgot/reset password, guardian consent, account deletion) — the same
  "find the gaps AND build the fix in one PR" model the Admin Panel
  unification pass used, not a report-only audit. Full detail:
  `docs/sprint-2-retrofit-screen-build-auth-email-report.md`. Backend
  contract checked directly against every DTO in
  `services/api/src/modules/auth/`, both email services,
  `guardian-relationship.constants.ts`, and the shipped
  `apps/web/src/pages/signup/`. **Built:**
  - **New "Verify your email" email** (`5439:7053`) + title head
    (`5435:8132`). The registration flow's first transactional email
    (`RegistrationEmailService.sendVerificationEmail`, subject "Verify
    your Soccernity email") had no design, even though its landing
    screens and the sibling password-reset / guardian-consent emails all
    exist. Designed **link-based** (CTA → `/verify-email?token=…` +
    fallback) to match the shipped `VerifyEmailPage.tsx` and Section
    8.3's "link" model — the backend placeholder body currently renders a
    "verification code" and needs reconciling when Postmark goes live
    (explicitly non-final). Copy states the real 48h TTL
    (`DEFAULT_EMAIL_VERIFICATION_TTL_MS`). **Decision Log #56.**
  - **New "Account deletion requested" email** (`5439:7074`) + title head
    (`5435:8134`). Decision Log #42's 30-day grace period exists to allow
    recovery from an accidental/coerced deletion — which requires
    notifying the user. States the window + "sign back in to cancel". No
    backend send wired yet (same status as the 5 other unwired
    templates). **Decision Log #59.**
  - **New "Forgot Password — Link Sent" screen** — desktop (`5474:7077`)
    + mobile (`5474:8375`). The shipped `ForgotPasswordPage.tsx` has an
    enumeration-safe `submitted` state; the Figma frame stopped at the
    form. "Check your email" + enumeration-safe copy + 60-min TTL.
  - **New age-gate rejection screen** — `Guardian Consent — 1a Age Gate —
    Below Minimum Age` (`5464:7077`), the below-age-5 hard block
    (Decision Log #19) that Sprint D's guardian-consent report item 6
    deferred to figma-design-system pending a colour call. Built as a
    **calm navy/white informational state, NOT an error/denial colour**
    — no new colour, the two-colour palette rule holds. Navy button, not
    the green "go" CTA. **Decision Log #57.** (In the Guardian Consent
    section — adjacent to Auth Pages, built here because the brief names
    the guardian-consent flow as in-scope for the audit.)
  - **New "Password reset link title head"** (`5435:8130`) — the one
    email in the section that lacked a title-head frame (added by PR
    #100). The 5 existing title heads had **hardcoded black text** and 2
    stale captions — all now bound (text → `color/text/primary`, bg →
    `color/background/surface`) and synced.
  - **Register mobile (`1625:2333`): "Username" field → "Full Name"
    First/Last row**, matching desktop and `RegisterDto.displayName`
    (`RegisterStep.tsx` collects first+last → displayName; `username` has
    no `User` column). Also fixed the mobile frame's vertical stacking —
    Terms text, Create-account button and the social block had been
    overlapping the always-open date picker.
  - **Reset Password desktop + mobile:** "Use at least 8 characters."
    helper added under the Password field (Decision Log #14, previously
    stated nowhere in the UI).
  - **Guardian Details Capture (`5108:6627`):** the relationship select's
    "OPTIONS PENDING PRODUCT DECISION" note replaced with the resolved
    list — `GUARDIAN_RELATIONSHIPS = ['Parent', 'Legal Guardian',
    'Grandparent', 'Other']` (defined in code, shipped in
    `GuardianDetailsStep.tsx`). The Guardian Consent **Design Notes
    frame** (`5116:6633`) items 3, 6, 7, 9, 11, 12 updated from open to
    RESOLVED.
  - Section banners for Auth Pages + Email Template + Guardian Consent
    widened to cover the new frames.
  **Flagged, NOT built (founder-blocked):** the **"Create Profile"
  screen** (`1498:2303` / `1629:2449`) is almost entirely unbacked —
  username, avatar, bio, location have no `User` column; DOB is
  server-excluded; Full Name / Preferred Club duplicate Register /
  Club Picker. CLAUDE.md already concluded it's "a superseded/alternate
  design… not built." Whether Soccernity adopts a username/avatar/bio/
  location profile model, or formally deprecates the screen, is a
  founder product + data-model decision. **Decision Log #58** — not
  redesigned in this pass. **Also carried forward, not resolved:** the 5
  unwired email templates (PR #100 §5), the consent-declined screen
  (Decision Log #34), resend-verification (Decision Log #37), the
  `1380:2297`/`1380:2318` near-duplicate password-change emails (PR #100
  §8.4), and the fact that the whole Guardian Consent section is
  desktop-only. **Missing-mobile check for Auth Pages + Email Template:
  clean** — every auth screen family has both widths; emails are single
  fluid-width. No application code touched. Merged as PR #104.
- **`sprint-2/retrofit-screen-build-guardian-consent` builds the 7
  guardian-consent-flow screens/emails PR #104's audit flagged as
  missing** — Figma design only, no backend/DTO/endpoint changes (that
  waits until backend work resumes). Full detail:
  `docs/sprint-2-retrofit-screen-build-guardian-consent-report.md`.
  Reference pattern: the existing Activation Confirmation screen
  (`5108:6631`) and verify-email email (`5439:7053`). All 14 new frames
  bound to Soccernity Theme Light; icon/panel washes use
  `brand/green-tint` (12%), **not** `brand/green-tint-28` (Decision Log
  #47) — 12 paints that carried `-28` from the clone sources were
  rebound. The 7 items, **desktop + mobile for the 5 screens, fluid for
  the 2 emails**:
  1. **Consent Approved (Guardian)** — `5488:7164` / mobile `5501:8225`.
     Green check, "What happens next" card, outline "Done" (guardian has
     no session to navigate into).
  2. **Consent Declined (Guardian)** — `5488:7206` / `5501:8289`.
     **Neutral grey icon + navy check, no red** — a recorded decision,
     not an error. "What this means" card.
  3. **Consent Declined — Minor Notice** — `5491:8241` / `5501:8453`.
     The minor's counterpart to Activation Confirmation: neutral icon,
     "Still switched off" card with OFF pills (mirroring Activation's ON
     pills), green "What you can do now" panel, and the required
     **"Resend approval request"** button (green primary) +
     "Change guardian email" (outline).
  4. **Approval Request Resent (Minor)** — `5488:7248` / `5501:8342`.
     "New request sent" confirmation, green "Back to my account".
  5. **"Guardian approved your account" email** (to the minor) —
     `5501:8584` + title head `5501:8582`. Cloned from the verify-email
     template.
  6. **"Guardian declined your account" email** (to the minor) —
     `5501:8607` + title head `5501:8605`.
  7. **Change Guardian Email (Minor)** — `5498:7164` / `5501:8536`.
     Standalone settings-style screen, available while consent is
     pending: current guardian email (read-only) + new-email input + a
     **prominent green-tint notice that submitting restarts the consent
     flow from scratch** (account back to pending, old approval link
     invalidated, fresh request to the new address). → **Decision Log
     #60.**
  The Guardian Consent section had **no mobile frames at all** before
  this (flagged in PR #104) — these 10 mobile frames are the first;
  each has a fresh 64px logo top bar, a 350px content column, full-width
  stacked buttons. Guardian Consent Design Notes frame (`5116:6633`)
  updated (item 2, item 5, new item 13). **0 frame overlaps**, **0
  green-tint-28** in any new frame (verified node-by-node). **Backend
  still needs, whenever it resumes:** a guardian decline endpoint
  (Decision Log #34), a change-guardian-email endpoint implementing the
  Decision Log #60 restart behaviour, and real sends for the two new
  emails (same status as PR #104's 5 unwired templates). Merged as PR #105.
- **`sprint-2/close-decision-log-58` closes Decision Log #58 (the
  "Create Profile" screen's `username` / `avatar` / `bio` / `location`
  fields) — documentation only, no Figma frames and no application code
  touched.** Founder resolution: **all four fields stay on the Create
  Profile screen exactly as designed** (option (b), not (a) — the screen
  is NOT deprecated). `username` is confirmed **distinct from
  `displayName`** (the schema's only name field, used as "full name"
  everywhere) and is not duplicative. Each of the four is now logged as
  an open **backend requirement** for when backend work resumes — new
  `User` columns for `username`, `avatar` (plus image storage), `bio`,
  `location`, and endpoint support to write them. This supersedes
  CLAUDE.md's earlier **"Create Profile investigated, not built"**
  analysis (in the `sprint-1/f5-f6-real-screens` bullet) and PR #104's
  **"flagged, NOT built (founder-blocked)"** note on the same screen —
  both of which had left the screen's future open; it is now settled as
  keep-and-back-with-real-columns. Build Plan Decision Log #58 moved from
  Open to Resolved in the same PR. Tracked going forward in the
  "Backend requirements parked until backend work resumes" list below.
  Merged as PR #106.
- **Backend requirements parked until backend work resumes.** Backend is
  currently paused; design/frontend-doc PRs during this stretch have
  logged real backend work here so it isn't lost on resume. Check each
  item against the live schema/API before acting — some may have been
  picked up already.
  - **`User.username`** — new column. Distinct from `displayName`.
    Needed by the Create Profile screen. (Decision Log #58)
  - **`User` avatar** — new column + image upload/storage. Create
    Profile screen. (Decision Log #58)
  - **`User.bio`** — new column. Create Profile screen; also the
    disabled Bio field on the Edit Profile modal. (Decision Log #58)
  - **`User.location`** — new column. Create Profile screen; also the
    disabled Location field on the Edit Profile modal. (Decision Log #58)
  - **Endpoint support to write the four fields above** — extend
    `PATCH /users/:id` (or a dedicated create-profile endpoint) once the
    columns exist. (Decision Log #58)
  - **Guardian decline endpoint** — no decline/reject route exists, only
    confirm. Needed by the Consent Declined screens. (Decision Log #34)
  - **Change-guardian-email endpoint** — must implement the Decision Log
    #60 "restart the consent flow from scratch" behaviour. (PR #105)
  - **Real Postmark sends for the new email templates** — verify-email
    body reconcile ("code" → link), account-deletion-requested,
    guardian-approved / guardian-declined notices, plus PR #100's 5
    still-unwired templates. (Decision Log #17, #56, #59)
  - **`AUTH_RATE_LIMIT_MAX` / `AUTH_RATE_LIMIT_WINDOW_MS` follow-through**
    — the wiring bug is fixed (`sprint-2/fix-auth-rate-limit-config-wiring`),
    but `.env.test` still has no override and the three e2e
    rate-limit-workaround files still seed users via Prisma rather than
    real `POST /auth/register`. (`sprint-2/e2e-coverage-expansion`)
  - **`GET /auth/me`** — formally dropped from the spec (Decision Log
    #23); listed here only so a resume sweep doesn't re-add it by
    reflex. No action needed.
  - **Represented-club field + endpoint** — persist the one club a user
    "represents" for points/leaderboard (the "Which club do I represent"
    selector, `5570:7813`). Distinct from `ClubPage` membership; arguably
    what `User.clubAffiliationId` was always for (nothing writes it
    today) — or a decision that `clubAffiliationId` IS this. Ties to the
    open Leaderboard club-axis question. (Decision Log #74)
  - **Competition / Contest data model** — competition entities (name,
    type, scoring mechanism, entry window), entries, votes, weekly
    rounds, Level-1 field, points ledger. Needed before `figma-to-code`
    can build any Leaderboard board (Overall / Contest / Competition) or
    the Admin Create Competition screen (`5566:8033`). (Decision Log
    #70–#73; still founder-blocked)
- **`sprint-2/retrofit-screen-build-guardian-email-home-contest` is a
  combined audit-and-build pass over four sections — Guardian Consent,
  Email Verification, Homepage/Leaderboard, and Contest** (Figma design
  only, no app/backend code). Full detail:
  `docs/sprint-2-retrofit-screen-build-guardian-email-home-contest-report.md`.
  Headlines:
  - **Leaderboard Contest-type tab — all 3 monthly-phase states built**
    (Decision Log #61): `5524:7188` **Pending (Weeks 1–3)** — empty-state
    card + week-progress chips + "View this week's contest ›" CTA;
    `5524:7512` **Live — Level 1 Final (Week 4)** — "LEVEL 1 FINAL · LIVE"
    banner + all weekly winners listed + "live order" note; `5524:7836`
    **Crowned — Monthly Winners** — text pill "1st · Monthly winner" (no
    trophy/medal iconography, Leaderboard rule). Cloned from `5171:6633`;
    COMPETITION filter = "Contest", TIME PERIOD relabelled This month /
    Past months; `brand/green-tint-28` rebound to `brand/green-tint`
    (Decision Log #47). **Judgment calls (Decision Log #61):** the
    brief's "no particular order" live state is rendered as a genuinely
    *ranked* list + persistent LIVE banner (an unordered RANK column
    reads as a bug); finalist count treated as *dynamic*, never
    hard-coded "9"; ties render as two rows sharing an ordinal text pill.
  - **Contest → Leaderboard monthly connectors — both built.**
    **Contest → Leaderboard:** "View leaderboard ›" CTA on the new
    **Contest — Weekly Results (Top 3)** frame (`5528:7260`, light-token
    standard). **Leaderboard → Contest:** "View this contest ›" on all 3
    Contest-tab states. A `Leaderboard — Contest Tab & Monthly Mechanic —
    Design Notes` frame documents the mechanic in-file.
  - **Email Verification mobile — all 4 built** (`5531:7264` / `:7284` /
    `:7356` / `:7412`); the section had zero mobile frames before.
  - **Guardian Consent mobile for screens 4, 5, 6 built** (`5531:7626` /
    `5531:7461` / `5531:7544`), completing the mobile set alongside
    PR #105's 7–11. **New screen: `Guardian Consent — 12 Approval Link
    Unusable (Guardian)`** desktop `5533:7264` + mobile `5533:7306` (the
    guardian clicks an expired/used consent link) — Decision Log #64.
  - **Guardian Consent field-accuracy fixes:** GC2 guardian name
    collapsed from First/Last to one "Guardian's full name" input
    (matches `Guardian.name` single column — **Decision Log #63**);
    consent-link lifetime copy changed from "7 days" to "3 days" in ~6
    places to match `DEFAULT_CONSENT_TOKEN_TTL_HOURS = 72` (still
    provisional per DPIA R5 — **Decision Log #62**); the unimplemented
    "resend once every 24 hours" cooldown claim removed from GC5
    desktop+mobile; GC4's unbacked "Request Summary" panel annotated as
    reference-only.
  - **Founder-blocked (flagged, not built):** guardian decline endpoint +
    `consentStatus="declined"` (DL #34); GET-by-consent-token endpoint
    (GC4 panel); `POST /auth/resend-verification` + its screen; the
    Verify-Email "minor verified, consent pending" variant (product
    decision); `/` marketing-page-vs-home-feed (product decision);
    homepage fixtures/news/season-record data (DL #6 + no stats model);
    Leaderboard/Contest points model + club axis + public visibility
    (unchanged); the entire Contest data model + monthly handoff mechanic.
  - **Scoped follow-ups (design, deliberately not bundled):** Guardian
    Consent mobile for screens 1/1a/2 (auth-mobile `header 7 — mobile`
    pattern); mobile homepage (5298px canonical, just settled DL #46);
    mobile leaderboard; a coordinated Contest user-facing section pass
    (retrofit + mobile + a "Week N of 4 / Level 1 Final" phase
    indicator); retrofitting `2072:5584` to light tokens.
  - Merged as PR #107.
- **`sprint-2/mobile-leaderboard-homepage-contest-audit` builds the
  mobile screens the previous pass flagged as follow-ups, plus a full
  leaderboard + Contest audit** (Figma design only, no app/backend
  code). Full detail:
  `docs/sprint-2-mobile-leaderboard-homepage-contest-audit-report.md`.
  Headlines:
  - **Guardian Consent mobile 1 / 1a / 2 built** (`5539:7264` / `:7314`
    / `:7354`) — the whole GC mobile set (1–12) is now complete. Used
    the GC-family 64px top bar, **not** the `header 7 — mobile` auth
    navbar, to keep the section uniform (**Decision Log #67**, closes
    PR #107's open "auth-mobile pattern" question).
  - **Leaderboard mobile built** (`5540:7264`) — the 5-column table
    becomes a card-style row list (rank + avatar + "name / @handle ·
    Club" left, points + delta right); filter bar stacks; header →
    `header 4 — mobile`. **Decision Log #65.**
  - **All 3 Contest-tab mobile states built** (`5541:7304` Pending /
    `5541:7527` Live Level-1 / `5541:7750` Crowned) — same content
    decisions as the desktop states (DL #61), "View this contest ›"
    connectors preserved.
  - **Leaderboard empty state built** (desktop `5542:7344` + mobile
    `5542:7695`) — a filter combo with 0 ranked players shows one card,
    not a blank table or an error. Also serves as the concrete
    SCOPE = "By club" artifact. **Decision Log #66.**
  - **Leaderboard filter matrix confirmed against real artifacts**, not
    assumed — a `Leaderboard — Filter Matrix (worked combinations)`
    annotation frame maps every axis of the locked global × club ×
    competition × time-period spec to a built screen/state. The only
    real gaps were the empty state and a concrete By-club artifact
    (both now built); the matrix otherwise needs no per-combination
    frame (any state = a different pill set + re-queried table).
  - **Homepage mobile built** (`5543:7407`) — the canonical `5204:6728`
    (DL #46) reflowed to 390px: all horizontal card rows stack, hero
    goes vertical, footer wraps. Token bindings inherited unchanged
    (layout-only). ~6750px.
  - **Contest audit:** `2155:1062` "How Contest works" / "Task for this
    week" lorem-ipsum replaced with real monthly-mechanic copy;
    **Contest — Weekly Results mobile built** (`5545:7394`). The 3
    legacy user-facing Contest frames' full mobile + phase-indicator
    work is flagged as the Contest section's own coordinated pass (they
    are 100% unbound legacy frames).
  - **`2072:5584` green-tint retrofit done** (Item 6, targeted single
    frame): 8 unbound `#d9d9d9` fills → `brand/green-tint` (12%); 3
    off-palette trophy vectors (`#e9c400`/`#bcb5b5`/`#cd7f32`) →
    `brand/navy` (**Decision Log #68**). The shared Header instance and
    `brand/green-tint-28` were deliberately NOT touched (that's the
    separate file-wide cleanup).
  - **Founder-blocked (flagged, not built):** Leaderboard/Contest points
    model, club-axis definition, public visibility; Prediction &
    Commentary competition type; the entire Contest data model + monthly
    handoff mechanic; Contest "already voted" / "between weeks" states;
    homepage fixtures/news/season-record data.
  - Merged as PR #108.
- **`sprint-2/leaderboard-competition-split-admin-homepage` is a
  consolidated fix-and-build pass over six founder decisions** (Figma
  design only, no app/backend code). Full detail:
  `docs/sprint-2-leaderboard-competition-split-admin-homepage-report.md`.
  Decision Log **#69–#75** added; forward-pointers appended to #61, #68,
  #46. Routing flagged: Items 1/2/5 are `figma-design-system` retouches,
  Items 3/4/6 are new screens (normally `figma-screen-builder`) — run
  together this once, the same one-time model PR #102 used. Headlines:
  - **Top-3 medals (Item 1, Decision Log #69) — founder override of the
    original "no rank iconography" rule.** New `Leaderboard Rank Medal`
    component set `5551:7420`, palette-only (rank 1 solid `brand/green`,
    rank 2 solid `brand/navy`, rank 3 `brand/green-tint` + navy outline —
    **no gold/silver/bronze**, non-negotiable #3). The numeral stays
    inside the disc (rank number restyled, not removed); the points value
    and points ordering are untouched — additive. Placed on `5171:6633`,
    `5540:7264`, Contest Crowned `5524:7836` / `5541:7750`, and the new
    Competition boards — desktop + mobile. **NOT** on the Contest Level-1
    Final, the weekly-fill states, the empty states, or State Study A
    (all live/unsettled). Base frame's "DECIDED — No badge" note
    (`5177:6676`/`5177:6677`) rewritten in place.
  - **Contest weekly-fill progression (Item 2, Decision Log #70) —
    corrects PR #108.** The single static "pending" state is replaced by
    a 4-step sequence, desktop + mobile: Vacant (Week 1 Phase 1,
    `5524:7188` / `5541:7304` — the **old pending frames converted in
    place, no orphaned duplicate**) → Week 1 winners in, 3 rows
    (`5556:7426` / `5561:7483`) → Weeks 1–2, 6 rows (`5556:7529` /
    `5561:7608`) → Weeks 1–3, **9 rows, count DYNAMIC** (`5556:7632` /
    `5561:7733`). Weekly-fill rows carry **no medal** (weekly winners are
    equal, not a settled 1/2/3 — each row shows "Week N · 1st/2nd/3rd" as
    plain text). Week 4 → the existing Live state, unchanged. Contest
    Design-Notes frame `5534:7264` rewritten.
  - **Contest / Competition split into two board tabs (Item 3, Decision
    Log #71–#72).** Judgment call, flagged: the brief's five-name list
    ("Global / Per-Club / Contest / Competition / Per-Time-Period") is
    read as the **union of dimensions**, not five literal tabs.
    Global/Per-Club = the SCOPE control; Per-Time-Period = the TIME
    control (both unchanged, combinable); Contest/Competition (+ implicit
    **Overall**) = a **new board-tab row** (`Leaderboard — Board Tabs`
    component `5563:7573`, underline style, above the filter bar). The
    **COMPETITION dropdown is removed** from the Overall and Contest
    boards (Contest's mechanic is fixed — no selector); it survives only
    on the Competition board, relabelled **COMPETITION TYPE**. Board tabs
    applied to base `5171:6633` / `5540:7264`, all six Contest-tab
    desktop states + six mobiles, and the empty states. **New Competition
    frames:** Prediction desktop `5564:7561`, Commentary desktop
    `5564:7832`, Prediction mobile `5565:7623`, Commentary mobile
    `5565:7864` — one **generic** `RANK / PLAYER / CLUB / <metric> /
    SCORE` shell (middle metric column is competition-supplied: Accuracy
    vs Votes — **not** hardcoded), ranking always by the SCORE integer.
    State Study B (`5176:6652`) rewritten as the COMPETITION TYPE
    selector.
  - **Admin — Create Competition (Item 4, Decision Log #73).** New admin
    screen `5566:8033` + success `5569:7813` on the unified Admin shell.
    New **"Competitions" sidebar nav item** (3-bar podium glyph),
    inserted after Contest, active — **propagating it to the other 15
    Admin shells is a flagged follow-up** (same pattern as "Categories").
    Form: name · type · scoring mechanism (Accuracy-scored /
    Community-voted / Custom) · custom method · entry brief · entry
    window · entries per player · Leaderboard-visibility toggle (helper
    text surfaces the still-open public-visibility question).
  - **Homepage "Your season record" card removed (Item 5, Decision Log
    #75).** `5206:6823` removed from the canonical homepage hero
    (`5204:6728`, DL #46) — the hero already centres its card cluster, so
    the single remaining fixture card reads as intentional. Mobile
    homepage's own copy (`5543:7445`) removed too. Resolves the flagged
    per-player-stats-model concern for the homepage.
  - **"Which club do I represent" selector (Item 6, Decision Log #74).**
    New standalone screen `5570:7813` (desktop) / `5570:7887` (mobile),
    placed next to the Club Picker family. A user in multiple
    `clubMemberships` radio-picks **one** represented club for
    points/leaderboard; a banner states joining/leaving other club pages
    doesn't change it. **Backend requirement parked:** persisting the
    represented club needs a real field/endpoint — distinct from
    `ClubPage` membership, arguably what `User.clubAffiliationId` was
    always for (nothing writes it today). This is the concrete artifact
    the open Leaderboard "which club does the club axis mean?" question
    now depends on.
  - **Cleanup:** deleted orphan frame `5542:7694` (empty 100×100 "Empty
    State" at origin, a stray `createFrame()` default).
  - **Founder-blocked (unchanged):** points model, club axis, public
    visibility, the entire Contest + Competition data model. `figma-to-code`
    must not build any of these boards until a scoring model is specced.
    **RESOLVED** — points model, club axis, and public visibility are no
    longer founder-blocked; see Decision Log #128–#130 (club axis =
    User.clubMemberships + the represented-club selector from #74; login
    required, no logged-out access; points = Contest/Competition results +
    baseline engagement). Exact per-action point weights remain a real,
    parked backend-api task, but the design/screen-building blocker is
    cleared. The Contest + Competition *data model* itself (schema,
    endpoints) is still unbuilt — backend is still paused — so
    `figma-to-code` still can't wire these boards to real data, but
    `figma-design-system`/`figma-screen-builder` may now build and finish
    any remaining Leaderboard/Contest/Competition screens without waiting
    on a scoring answer.
  - Merged as PR #109.
- **`sprint-2/admin-competitions-nav-settings-club-rep` — three scoped
  Figma fixes** (Figma design only, no app/backend code). Full detail:
  `docs/sprint-2-admin-competitions-nav-settings-club-rep-report.md`.
  Decision Log **#76–#79** added to Build Plan Section 9, with a
  forward-pointer appended to #73's Status. The Figma work and report
  were produced by the `figma-design-system` agent (no Bash that
  session, same constraint PR #98/#102 hit); the branch, commit,
  `.docx` transcription and PR (#110) were finalised in a follow-up
  session with shell access.
  - **Task 1 — "Competitions" sidebar nav item replicated across all 24
    remaining Admin Panel screens** (the 2 original Contest-tab frames +
    22 unified Admin-shell screens). Each gets an **inactive** `Nav —
    Competitions` row (icon `u:chat-bubble-user`, text "Competitions")
    inserted directly below "Contest" and above "Media" inside
    `Frame 5744`, cloned from that screen's own Contest row then forced
    to the inactive token set — row fill `color/background/surface`
    (`5096:7`), icon + label `color/text/primary` (`5096:8`). Matches
    the already-correct reference at `5566:8141` (inside Admin — Create
    Competition). **This closes Decision Log #73's flagged follow-up**
    ("propagating it to the other 15 Admin shells") — count reconciled:
    #73 estimated 15, actual scope was **24** (more Admin screens exist
    than #73 assumed, plus the 2 legacy Contest-tab frames).
    `5566:8033`/`5566:8067` and `5569:7813`/`5569:7847` already had the
    item and were left alone. All 24 verified: 7 nav rows, Competitions
    at index 5, no page-bounds clipping (short 655px sidebars are
    `SPACE_BETWEEN` so Settings stays pinned; tall 806px sidebars have
    49px headroom). **Decision Log #76.**
  - **Task 2 — clipped sidebar on Admin — Competition Created (Success)
    (`5569:7813`) fixed** by growing the page frame 900 → **1184**
    (not shrinking the 806px sidebar component, not matching the
    sibling's outlier 1530). 1184 is the standard tall-Admin-frame
    height in this file (the whole Contest screen family), giving the
    same 49px sidebar-bottom margin. The two visible full-bleed
    backgrounds (`5569:7817` bg photo, `5569:7846` sidebar rectangle)
    resized to match; sidebar row order/content untouched. **Decision
    Log #77.**
  - **Task 3 — "Club Representation" entry point added to the
    user-facing Settings screen** (Settings — Overview, `2905:4798`),
    opening the standalone club-representation selector (`5570:7813`
    desktop / `5570:7887` mobile, from PR #108 / Decision Log #74). New
    row in the **Account** panel (`Frame 5918`), placed between "Account
    Information" and "Change Password" — grouped with identity/profile
    settings, above the security/danger items. Icon = `fi:A_users`
    (people glyph, rebound to `brand/navy` to match sibling icons),
    subtitle "Set your represented club". **Decision Log #78.**
  - **Task 3 (cont.) — mobile Settings — Overview built** (`5607:7813`,
    390px, next to the club-rep mobile family), with the same Club
    Representation entry point. **One-off routing override authorised by
    the founder for this pass only** — `figma-design-system` built a
    brand-new screen, which is normally `figma-screen-builder`'s job.
    **This does NOT change the standing agent-sequencing rule.**
    Adaptation calls: 390px / 350px content column / 64px top bar
    (matching `5570:7887`); dropped the desktop's left profile /
    trending-news / suggested-follows column (not settings content);
    stacked the desktop settings-nav menu + Account panel vertically in
    one column; category-nav and account rows rebuilt fresh at mobile
    scale (16/12 type) rather than forcing the desktop's rigid 331px /
    390px frames into a narrow column. 0 visible unbound paints, 0
    `brand/green-tint-28`, Light-mode tokens only. **Decision Log #79.**
  - Merged as PR #110.
- **`sprint-2/token-verify-clubpicker-cta` — small Figma verification + fix pass over the
  8 user-facing sections (Blog, Sports, Club Picker, Bants, Message, Community home feed,
  Create Post, user-facing Settings).** Figma-only, no app/backend code; no new
  screens/states/mobile (that stays `figma-screen-builder`'s job). Confirmed PR #98/#99's
  Layer-1 light-mode retrofit holds: Message, Community, Create Post, and all 19
  user-facing Settings frames are fully clean; user-facing Blog and Sports are token-clean
  (Sports' remaining unbound paints are the disclosed flag/crest/jersey art). **22 nodes
  fixed, all in scope:** Club Picker's 14 never-migrated `brand/green-tint-28` fills →
  `brand/green-tint`, its 5 hidden black ghost-wordmark fills → `brand/navy`, 2 stale Bants
  navbar Header **instance** `-28` overrides → `brand/green-tint`, 1 black Bants add-icon →
  `brand/navy`. **Club Picker CTA contrast (the trigger for this pass) was already
  compliant** — labels bound to `color/text/on-green` (navy) on `brand/green` = 5.29:1
  AA-pass; deliberately not rebound to a navy fill (unrequested visible redesign). Flagged,
  not fixed (out of scope): `123:56` "Articles" / `124:313` "Articles - Create Post" are
  **Admin Panel** shell screens, not user-facing Blog — their unbound black content titles
  fold into Decision Log #52 (an accidental edit to `124:313` this pass was reverted);
  shared "Navigation" component set `1078:3761` renders unbound black icon glyphs (`1102:*`)
  across 5 Bants frames — needs its own shared-component pass; `1620:13390` "Settingd" node
  does not exist anywhere on page `0:1` (already fixed or stale ticket ref) and no "22
  duplicate Settings frames" exist in user-facing Settings (all 19 uniquely named; bare
  "Settings" `1658:2303` is Admin Panel). Report:
  `docs/sprint-2-clubpicker-cta-token-verify-report.md`. **Decision Log #80–#83** — now
  transcribed into Build Plan Section 9 by the `sprint-2/screen-builds-notification-centre`
  PR below (its own report couldn't see this one, since that branch predates PR #111's
  merge; harmless — #80–#83 are this pass's, #84+ are that one's). Merged as PR #111.
- **`sprint-2/screen-builds-notification-centre` builds the full-page Notification Centre
  (net-new, Sprint 3 scope) plus the missing mobile equivalents across Sports, Club Picker,
  Bants, Message and Settings** — 25 new frames, Figma design only, no app/backend code.
  Full detail: `docs/sprint-2-screen-builds-notification-centre-report.md`. **Decision Log
  #80–#92** transcribed into Build Plan Section 9 in this PR (both this pass's #84–#92 and
  the merged PR #111's #80–#83, which had never been transcribed). `#45` remains a real
  un-written gap.
  - **Notification Centre built desktop + mobile** — feed with read/unread row states
    (`5640:7815` / `5643:8003`) and empty states (`5642:7898` / `5642:7997`), plus a Design
    Notes frame (`5644:8023`). Unread rows = `brand/green-tint` + white avatar disc +
    `brand/green` dot; read rows = white `surface`, on a `brand/off-white` page. **Only
    follow / like / comment rows are designed** — the three types the shipped backend (PR
    #56) can actually produce; no mention/Banter/club types were invented (**Decision Log
    #87**, which also records the no-self-notification and idempotent-no-double-notify rules
    already true in code).
  - **Four brief premises were wrong and were caught by checking live, not trusting:**
    (1) the shared Navbar has **NO bell** — verified across all four variants of `2824:4309`
    (action cluster is a messages glyph + avatar); the bell + navy unread badge is therefore
    an `ABSOLUTE` overlay on each Notification Centre frame's own Navbar instance, and the
    badge reuses the navy count-pill from `Dropdown menu/notification on`, **not** the
    off-palette red `#fa0606` dot on `Notification Bell Icon/notification` (**Decision Log
    #88**); (2) `Articles Page mobile` (`87:80`) **already exists**, so no Blog mobile was
    built (**#84**); (3) the Create Post section already holds **five** user-facing "Create
    a post" frames, so no Community composer was built (**#91**); (4) only **three** of the
    four legacy `Messages mobile window` frames are superseded — **window 3 (`1762:2833`) is
    a unique Mark-as-Read / View-Profile / Block / Delete-Chat context menu with no
    replacement**, left live while windows 1/2/4 were hidden + renamed `ARCHIVED —` and
    moved to an archive strip (**#89**).
  - **Mobile built:** Sports logged-out/logged-in (`5647:8023` / `5647:8169` — desktop
    sidebar reflowed to a league chip row, typographic club marks not licensed crests,
    **#85**); all 5 Club Picker states (`5645:8023` / `8082` / `8141`, `5646:8023` / `8044`
    — carrying the desktop's own open-decision note across verbatim); 7 Bants states
    (`5650:8074` / `8161` / `8221` / `8314`, `5651:8166` / `8207` / `8253` — reusing the
    existing `Filter Tabs (All / My Bants)` component as real instances); a Message empty
    state (`5648:8054`); and 5 Settings category screens (`5649:8074` / `8092` / `8116` /
    `8140` / `8176`) — the **12 deeper Settings leaf screens are a flagged, deliberately
    unbundled follow-up** (**#92**).
  - **Canonical mobile width proposed as 390** (**#86**) — the file currently holds
    390/428/375/360/311. **`community mobile 1–5` were deliberately NOT resized** (**#90**):
    all five are absolute-layout with 13–31 fixed-position children, so a 428→390 resize
    overflows rather than reflows; a proper 390 rebuild is its own scoped task.
    Re-confirmed `1306:7149` / `1308:11643` are still `visible: false` and render nothing —
    left as found, not silently "fixed".
  - **Audit, measured:** **0 `brand/green-tint-28`** across all 25 new frames; **23 of 25
    frames 0 unbound paints**; the 2 Sports frames' single unbound paint (a cloned legacy
    `uil:calender`) was found and fixed in-pass. The only residual unbound paints (2 each on
    the two Notification Centre desktop frames) are `Rectangle 348` / `Polygon 6` **inside
    the shared `header 4` Navbar instance** — pre-existing component debt, not editable from
    an instance.
  - **Flagged, not fixed (scope lock — these are `figma-design-system`'s):** the red
    `#fa0606` bell dot; both "Notification Bell Icon" components being near-empty and
    rendering nothing; Bants' off-palette orange status dot; the shared `header 4`'s 2
    unbound paints; and **six real Settings desktop copy bugs** (incl. a leftover "how **X**
    content is displayed to you" from a Twitter/X template and an "Accessibilty" typo) —
    corrected on the new mobile frames only, so desktop and mobile copy currently disagree
    on purpose (**#92**).
  - **Founder-blocked (flagged, not built):** Sports fixtures/news have no data source
    (Decision Log #6 still open, no Section 4 endpoint); Bants has no backend
    (`/banter-rooms*` is unbuilt Sprint 3 work); `Settings — Account Information (Edit)`'s
    Username and Country have no `User` column (Decision Log #58). `figma-to-code` must not
    wire any of these.
  - Merged as PR #112.
- **`sprint-2/notification-bell-navbar-slot` — shipped Tasks 4/5/6 + a
  file-wide off-palette-red audit; the notification-bell slot work
  (Tasks 1–3, DL #88's follow-up) is BLOCKED and deliberately not
  built.** Figma design only, no app/backend code. Full detail:
  `docs/sprint-2-notification-bell-navbar-slot-report.md`.
  - **The blocker:** `Notification Bell Icon/no notification`
    (`2819:4090`) and `.../notification` (`2819:4089`) are **not**
    empty unbuilt bell components — `2819:4090` is the **live
    user-avatar component** (`IMAGE`-filled `Ellipse 33`, **~85
    instances** across every Navbar in the file; the "Avatar" instance
    in `header 4 — mobile` points at it), and `2819:4089` is avatar +
    the `#fa0606` status dot (0 instances). Building bell artwork into
    those node IDs would turn ~85 avatars file-wide into
    bells-behind-photos. Also: `Dropdown menu/no notification`
    (`2841:5361`) and `Dropdown menu/notification on` (`2841:5363`)
    have **0 instances and no prototype wiring** — there is no
    existing bell-dropdown pattern to mirror, and both are account
    menus, not notification lists. PR #112's own DL #88 notes made the
    same misread. **DL #88 is NOT marked resolved** — a forward-pointer
    was appended noting the follow-up is blocked; new **DL #93–#98**
    record the finding, a corrected build plan (rename the avatar
    components, build the bell as a NEW `Notification Bell` component
    set with a `Has Unread` variant), and the judgment calls (bell on
    logged-in variants only; "See all notifications" → Notification
    Centre `5640:7815` desktop / `5643:8003` mobile).
    **SUPERSEDED:** the founder has since overridden this — NO new bell
    component; the existing avatar IS the indicator. **DL #93–#96 are
    superseded, DL #97 is resolved**, by
    `sprint-2/avatar-notification-dropdown-wiring` (see two bullets down).
  - **Shipped (verified Figma writes):** **Task 6** — shared `header 4`
    Navbar messages-glyph's 2 unbound `#d9d9d9` paints (`Rectangle
    348` `2841:4245`, `Polygon 6` `2841:4246`) bound to `brand/navy`,
    matching `header 4 — mobile` which was already correct. **Task 5**
    — Bants desktop room-row status dot (`Ellipse 67` in `Group 403` /
    `2353:1610`, **102 instances**) was off-palette amber `#DBA111`,
    now `brand/green` (giving desktop rows a real active/inactive
    variant to match mobile is out of scope — **DL #98**). **Task 4** —
    9 Settings desktop copy fixes on `2922:5832` / `2922:5602` /
    `2922:5382` (title "display and languages and region" → "Display,
    Language and Region"; "Manage how **X** content…" → "…Soccernity
    content…"; "Accessibilty" → "Accessibility"; three
    verbatim-reused sub-labels on `2922:5832` given distinct copy from
    the mobile frame `5649:8140`; "Choose the notification you like to
    see_and those you don't" fixed to "Choose the notifications you'd
    like to see and those you don't" on `2922:5602` — its correct
    context; "Manage Information associated with you post" → "Manage
    information associated with your post"). **Deviation flagged:** on
    `2922:5832` the stray-underscore string is the *Accessibility*
    row's description (a copy-paste bug), so it got the mobile frame's
    Accessibility copy ("Adjust contrast, motion and text size")
    instead of the notification-filter string. This closes CLAUDE.md's
    prior note that desktop/mobile Settings copy "currently disagree
    on purpose (#92)".
  - **Flagged, not touched (DL #97):** off-palette `#fa0606` also
    appears in Sports Hub H2H/Standings win-loss form dots
    (`Rectangle 99` ×~36), Admin table-cell blocks (`Rectangle 43`
    ×3), and "Block User" labels (×4) — needs its own sweep +
    a destructive-token decision (non-negotiable #3).
    **RESOLVED by `sprint-2/avatar-notification-dropdown-wiring`** (next
    bullet): founder authorised a `semantic/alert` token (`#FA0606`),
    now bound across 110 paints.
  - Merged as PR #113.
- **`sprint-2/avatar-notification-dropdown-wiring` — corrects PR #113's
  approach per a founder override, and closes the `#fa0606` sweep.**
  Figma design only, no app/backend code. Stacks on the PR #113 branch
  (`sprint-2/notification-bell-navbar-slot`), because it must mark that
  branch's DL #93–#98 as superseded. Full detail:
  `docs/sprint-2-avatar-notification-dropdown-wiring-report.md`.
  - **Founder override:** NO new Notification Bell component is built.
    The existing round **avatar** component IS the notification
    indicator — clicking it opens the account dropdown (Profile /
    Notification / Settings / Log out); the Notification row carries the
    unread counter and links to the Notification Centre. PR #113's
    **DL #93, #94, #95, #96 are SUPERSEDED** (forward-pointers appended);
    **DL #97 (the `#fa0606` sweep) is RESOLVED** here; DL #98 (Bants
    desktop active/inactive) is unrelated and unchanged.
  - **Task 1 — avatar components renamed** (name only, 0 appearance
    change, verified on sample instances): `2819:4090` "Notification Bell
    Icon/no notification" → **"Avatar/no notification"** (~85 instances);
    `2819:4089` "Notification Bell Icon/notification" → **"Avatar/notification"**
    (0 instances; adds the unread dot `Ellipse 98` `2819:4084`).
  - **Task 2 — new semantic token `semantic/alert`** (`VariableID:5670:8226`)
    in the `Soccernity Theme` collection. **`#FA0606`** (kept, not
    normalised — it is the value already in ~110 places) in **both**
    Light and Dark modes (small non-text indicator; the hue reads on
    white and on near-black alike). `Ellipse 98` bound to it.
    **Founder-authorised deliberate exception to non-negotiable #3**
    (two-colour palette) — red is retained as a semantic
    loss/destructive/alert colour only. New Decision Log entry added.
  - **Task 3 — avatar → account-dropdown overlay wired at the navbar
    instance level** (not on the shared component — the other ~85
    avatars, e.g. post authors, must not open *my* account menu):
    `ON_CLICK → OPEN_OVERLAY` on `2838:3579` (header 4 desktop) and
    `5387:7675` (header 4 — mobile) → `Dropdown menu/no notification`
    (`2841:5361`). The `Avatar/notification` component's own stale
    overlay target was corrected `2841:5361` → `2841:5363` (0 instances,
    so harmless; makes a future instance-swap inherit the right
    dropdown). **All 4 Navbar variants checked:** `header 4` (`2838:3502`)
    logged-in desktop — wired; `header 4 — mobile` (`5386:6576`)
    logged-in mobile — wired; `header 7 — mobile` (`5386:6575`)
    logged-out mobile — no avatar, correct; `header 7` (`2841:4104`)
    logged-out desktop — **carries a stray avatar instance (`2841:4177`),
    flagged, left unwired (0 reactions), recommended for removal**
    (new DL entry).
  - **Task 4 — Notification row → Notification Centre.** `ON_CLICK →
    NAVIGATE` on the Notification row in both dropdowns (`2841:5368` in
    "notification on", `2819:4077` in "no notification") → **desktop**
    Notification Centre `5640:7815`. Limitation: the dropdown components
    are shared desktop/mobile and a reaction carries one target;
    routing mobile → `5643:8003` needs a mobile dropdown variant
    (follow-up, new DL entry).
  - **Task 5 — `#fa0606` sweep completed.** `semantic/alert` bound to
    **110** paints: Sports Hub H2H/Standing loss dots (`Rectangle 99`
    ×29 + `Rectangle 101` ×1), Admin table-cell blocks (`Rectangle 43`
    ×3), "Block User" labels (×4) + their block icons (×3), and — newly
    found in the same audit and in the same destructive-semantic bucket
    — 70 `ant-design:delete-outlined` trash-icon vectors across Admin
    Categories / Settings / Media / Users. **Excluded: 1** — the
    `#fa0606` fill inside the "YouTube logo" vector (`761:13`), an
    external brand mark (same class as club-crest artwork). Final rescan:
    0 unbound `#fa0606` paints remain except that one.
  - **Judgment calls / follow-ups (new Decision Log entries):** the two
    avatar components + the two dropdowns should be combined into
    variant sets (`Has Unread` boolean) so one instance swap flips both,
    instead of the current two-loose-components + manual-reaction-retarget
    dance; mobile dropdown variant for Task 4's mobile route; removal of
    the `header 7` desktop stray avatar.
  - **Decision Log:** PR #113's **#93–#96 marked SUPERSEDED**, **#97
    RESOLVED** (forward-pointers appended); new **#99** (`semantic/alert`
    token, `#FA0606`, Light=Dark, founder-authorised exception to
    non-negotiable #3), **#100** (avatar→dropdown wired per Navbar
    instance, not on the shared component), **#101** (Notification row
    routes to desktop Notification Centre only; mobile needs a dropdown
    variant), **#102** (`header 7` desktop stray avatar `2841:4177` —
    recommend removal), **#103** (combine `Avatar/*` + `Dropdown menu/*`
    into `Has Unread` variant sets; click-outside-dismiss follow-up).
    **#101, #102, #103 are now RESOLVED by
    `sprint-2/avatar-dropdown-variant-sets` (next bullet) — forward-pointers
    appended to each.**
  - Merged as PR #114.
- **`sprint-2/avatar-dropdown-variant-sets` closes DL #101, #102, #103**
  (raised by PR #114). Figma design only, no app/backend code. **Stacks on
  the PR #114 branch (`sprint-2/avatar-notification-dropdown-wiring`) →
  PR #113 (`sprint-2/notification-bell-navbar-slot`)** — those rows exist
  only on PR #114's branch, so this branched from it, not `main`. Reviewer
  merges the stack in order (or merges this, which contains all three).
  Full detail: `docs/sprint-2-avatar-dropdown-variant-sets-report.md`.
  - **DL #101 — mobile Notification row now routes to the MOBILE
    Notification Centre.** The two account dropdowns were cloned to a
    four-member slash-named family: `Dropdown menu/no notification`
    (`2841:5361`) + `Dropdown menu/notification on` (`2841:5363`) keep the
    Notification-row `NAVIGATE → 5640:7815` (desktop); new
    `Dropdown menu/mobile - no notification` (`5685:9300`) +
    `Dropdown menu/mobile - notification on` (`5685:9312`) target
    `5643:8003` (mobile). The `header 4 — mobile` avatar instance
    (`5387:7675`) overlay was re-pointed `2841:5361 → 5685:9300`; the
    desktop avatar (`2838:3579`) and the `Avatar` "Has Unread=true"
    variant (`2819:4089`) still open `2841:5361` / `2841:5363`.
    **Dropdown sizing decision: no mobile-resized variant needed** — the
    menu is a compact 146×142 anchored dropdown that fits inside the
    390/428px mobile navbar; only the nav target differs.
  - **DL #102 — stray logged-out-desktop avatar removed.** `header 7`
    (`2841:4104`) carried an absolutely-positioned, z-order-hidden avatar
    instance (`2841:4177`, 0 reactions) sitting behind the Login button
    (`Frame 5805`/`2631:3972`). Removed. Zero visual change (screenshot
    diff clean on `header 7` + Login/Register/Home/Forgot-Password-Sent);
    Login button and nav icons unmoved (both absolute-positioned).
  - **DL #103 — `Avatar/*` combined into a variant set; `Dropdown menu/*`
    deliberately NOT.** `Avatar/no notification` (`2819:4090`) +
    `Avatar/notification` (`2819:4089`) are now the **`Avatar`
    COMPONENT_SET** (`5685:9241`), property **`Has Unread`** (boolean
    false/true; default false). All 78 live instances on page `0:1` re-point
    cleanly to the variant IDs (unchanged — `combineAsVariants` preserves
    component IDs); appearance and the per-instance overlay reactions
    unchanged. **The two dropdowns were tried as a set and reverted**:
    Figma rejects a COMPONENT that is a variant inside a COMPONENT_SET as
    an `OPEN_OVERLAY` **destination** (`"destination … was rejected … not
    reachable from this source"`), which broke every avatar→dropdown
    overlay. They stay a slash-named family instead. A "Breakpoint"
    variant axis was therefore not viable — hence the four-member family
    above.
  - **Click-outside-dismiss (DL #103 tail): cannot be set from the plugin
    API.** `overlayBackgroundInteraction` is declared `readonly` in the
    `use_figma` API surface on **every** node type (verified on COMPONENT
    and FRAME; `.d.ts` confirms) — PR #114's "settable only on instances"
    is inaccurate for this environment. It IS a one-checkbox job in the
    Figma desktop UI ("Close when clicking outside" on each avatar's Open
    Overlay interaction — `2838:3579`, `5387:7675`, `2819:4089`), and it
    is a non-issue for `figma-to-code` (standard backdrop/`useOnClickOutside`).
    Documented, not silently skipped.
  - **Decision Log:** #101/#102/#103 marked **RESOLVED** with
    forward-pointers; new entries added for the mobile-dropdown-family
    decision (vs. a Breakpoint variant), the variant-can't-be-overlay-
    destination finding, and the click-outside-dismiss API limitation.
  - Merged as PR #115.
- **`sprint-2/mobile-settings-community-message-rebuild` builds the 12 deeper
  Settings leaf mobile screens PR #112 deferred, rebuilds all 5 Community
  mobile frames at 390px with real auto-layout, and rebuilds the entire
  Message pillar desktop + mobile** — 23 new frames + 2 new components, Figma
  design only, no app/backend code. Full detail:
  `docs/sprint-2-mobile-settings-community-message-rebuild-report.md`.
  Decision Log **#107–#120** added in this PR (the report drafts these as
  #104–#117 — a stale guess from CLAUDE.md; the live docx ended at #106).
  - **Settings (12 new 390px frames, `5695:8213`–`5696:8384`)** follow PR
    #112's mobile pattern exactly. New **`Settings Toggle`** component set
    (`5694:8219`, `State=On`/`State=Off`); the pre-existing `Toggle Switch`
    (`2927:10195`) was **not** reused — it is a broken orphan (92×87, two
    stacked instances not variants, a child outside its own bounds, 0
    instances file-wide) and is recommended for deletion. **24 desktop copy
    bugs fixed on the 12 source frames and mirrored on mobile** — incl. a
    three-fragment unreadable list on Mute New Accounts, "Soccernity **page**"
    → "sessions", lowercase "soccernity.com", and five
    singular/plural/casing errors. **Deactivate Account uses a navy button,
    not red**: white on `semantic/alert` measures **4.12:1** and fails AA;
    alert is used only as a non-text accent bar.
  - **Community: all 5 legacy 428px absolute-layout frames rebuilt at 390px**
    (`5701:8239`, `5703:8250`, `5701:8328`, `5702:8250`, `5702:8317`) and the
    originals **archived, not deleted** (hidden, `ARCHIVED —` prefix, moved to
    an archive strip). **Corrects PR #112's finding that
    `1306:7149` "renders nothing"** — the COMPONENT_SET is hidden, but both
    variants are fully populated (100/102 children, 111 text nodes each), so
    no fallback was needed. Sidebars (Trends/Fixtures/Trending News/Suggested)
    were deliberately not reflowed — placeholder content blocked on Decision
    Log #6 with no Section 4 endpoint.
  - **Message pillar rebuilt: 3 desktop + 3 mobile frames**, 4 legacy frames
    archived, and **`Messages mobile window 3` converted to a real component**
    (`Message — Conversation Actions Menu`, `5706:8270`) instanced onto the
    mobile chat screen — **closing Decision Log #89's open item**. The
    original desktop "no message page" conflated "no conversation selected"
    with "empty inbox" (it showed 8 conversations beside empty-inbox copy);
    now three distinct states. PR #112's `5648:8054` empty state was
    **retained, not rebuilt** (already 390px, already 31/31 bound).
  - **Colour audit, measured**: Message pillar went from 385 paints / 368
    bound (95.6%) with real off-palette `#1e1e1e`, `#a1584a`, `#d9d9d9` ×13,
    to **470 paints / 466 bound (99.1%) and zero off-palette hexes**. Across
    the whole delivery: **945 paints, 939 bound (99.4%)**; the only 6 unbound
    are the shared Navbar's avatar `[IMAGE]` fill (component debt, not
    editable from an instance). **0 `brand/green-tint-28`**, **0 new colours**,
    **0 frame overlaps**.
  - **New file-wide authoring gotcha (belongs in Figma notes): a
    variable-bound paint takes its alpha from the variable, not from the
    paint's own `opacity`** — binding `brand/navy` to a paint set at 30%
    yields a fully opaque paint (it produced two solid scrims here). Use a
    token that carries its own alpha (`brand/green-tint` 12%,
    `color/icon/inactive` 15%), or re-apply opacity to a copy of the paint
    *after* binding. A "0 unbound paints" audit can pass while a paint still
    renders at the wrong alpha.
  - **Flagged, not fixed** (→ **DL #110 RESOLVED by
    `sprint-2/settings-desktop-scaffolding-sweep`**, see that bullet below):
    three Settings desktop leaves
    (`2926:8764`, `2926:8996`, and the `2926:9721`/`2927:9954`/`2927:10205`
    trio) carried *structural* content leakage — leaked "Authentication App"
    rows, "Submit" buttons and overlapping duplicate "Push notification"
    headings. **All of it turned out to be `visible:false` scaffolding
    left over from row duplication (not live rows), so no product decision
    was needed** — the sweep deleted it. `2926:8996` renamed
    `Settings — Your Posts (Sensitive Media)`.
  - **Founder calls open**: which Message frames are canonical (nothing was
    deleted, same shape as the homepage's Decision Log #46 situation), and
    whether the archived Community/Message frames should now be deleted
    outright.
  - Merged as PR #116.
- **`sprint-2/component-hygiene-toggles-nav` — component hygiene pass over
  the Settings toggles and dead component families** (Figma design only,
  stacks on PR #116 / `sprint-2/mobile-settings-community-message-rebuild`).
  Full detail: `docs/sprint-2-component-hygiene-toggles-nav-report.md`.
  Decision Log **#121–#124** drafted in the report (reconfirm numbering —
  #116's docx ended at #120; docx not editable this session, follow-up
  shell step listed in the report §7).
  - **Desktop Settings toggles standardised on `Settings Toggle`
    (`5694:8219`).** 13 effectively-visible controls across 7 Settings
    desktop frames — 11 raw `Rectangle 352` pale-green squares + 2
    `Component 22` sliders — swapped to `State=Off` instances,
    absolute-pinned to the exact original slot (component swap, not
    redesign). `Settings Toggle` instances file-wide: 13 → 26 (18 Off /
    8 On). The premise "desktop uses raw rectangles, not a component" was
    only partly right — two rows used a *second* local component
    (`Component 22`); folded into the same swap so one canonical toggle
    component remains.
  - **Dead `Toggle Switch` `2927:10195` deleted** (0 instances file-wide,
    confirmed). Its nested `Component 22` (`2927:10191`) / `Component 23`
    (`2927:10192`) definitions went with it — 0 external instances after
    the swap, 0 broken instances file-wide afterwards.
  - **5 effectively-hidden `Rectangle 352` toggle-squares** inside
    `visible:false` template scaffolding (`Frame 5920` / `Frame 5927`)
    left in place — non-rendering; flagged for a future Settings-desktop
    layout pass to delete the abandoned scaffolding wholesale.
    **Deleted by `sprint-2/settings-label-align-docx-dl123`** (which also
    found they are input-background rects sitting in *visible* `Frame
    5914` rows, not toggle-squares in hidden scaffolding).
  - **Settings sidebar-nav typo fixed:** `Frame 5904` (`2906:7170`)
    variant value `Property 1=Disolay and language` →
    `Property 1=Display and language`. **Not** renamed to the standardised
    visible label "Display, Language and Region" — a comma in a
    single-property Figma variant value is parsed as a property separator
    and would corrupt instance→variant resolution. All 17 instances
    auto-migrated (same IDs), 0 detached, set total unchanged at 90. The
    component's internal visible label still renders "Display, Languages
    And Region" (plural) vs PR #114's "Display, Language and Region" — a
    ~90-instance text change, deferred. **Done by
    `sprint-2/settings-label-align-docx-dl123`** — label `characters` set
    to "Display, Language and Region" on all three Display-row states,
    90 instances intact, 0 detachments.
  - **Dead component families archived (`Old —` prefix, not deleted):**
    `Mobile Drop Down Components` (`1870:2753`, 8 variants, 0 instances
    file-wide) → `Old — Mobile Drop Down Components`; `Mobile App Nav
    Icons` (`2230:4328`, 7 variants, 0 instances on `0:1`, 2 `home`-variant
    instances only on the ignored `dump` scratch page) → `Old — Mobile App
    Nav Icons`.
  - **OPEN — founder sign-off:** Build Plan Section 6's Sprint 3 messaging
    bullet still cites "the existing Drop Down Components chat frames" as
    the DM source; superseded by PR #116's live Message pillar
    (`5706:8270` + 6 frames). Section 6 citation needs a founder-approved
    correction in a separate documentation pass (Decision Log #123).
    **DL #123 correction spec'd by `sprint-2/settings-label-align-docx-dl123`**
    (that pass had no shell either — the finalising session applies it).
  - Merged as PR #117.
- **`sprint-2/settings-label-align-docx-dl123` — 3 small hygiene items,
  stacks on PR #117 (`sprint-2/component-hygiene-toggles-nav`) → PR #116**
  (Figma design only, no app/backend code). Full detail:
  `docs/sprint-2-settings-label-align-docx-dl123-report.md`.
  - **Settings sidebar-nav visible label aligned to singular.** The
    `Frame 5904` set (`2906:7170`), Display row, rendered "Display,
    Languages And Region" (plural) — PR #117 fixed only the variant-value
    typo and deferred the label. The label TEXT nodes for all three
    Display-row states — `2906:7227` (`Property 1=Display and language`),
    `2906:7232` (`Display hover`), `2922:6352` (`clicked display`) — had
    underlying `characters` "display, languages and region" rendered
    title-cased by a pre-existing `textCase: TITLE`. `characters` set to
    "Display, Language and Region" (singular); the `textCase: TITLE`
    transform left in place, so the render is "Display, Language And
    Region" (capital "And"), matching how page heading `2922:5832` was
    handled earlier. Component-level edit: **90 set instances before = 90
    after**, all resolving to real variants, 0 detachments, 0 stale
    overrides. Other nav rows untouched. All three Display states edited
    (not just the resting state) for within-row consistency — flagged as
    a judgment call.
  - **5 dead hidden `Rectangle 352` rectangles deleted** — `2926:8175`,
    `2926:9351`, `2926:9844`, `2927:10080`, `2926:9605`. PR #117 flagged
    these and left them for a later pass. Confirmed genuinely dead:
    `visible:false`, fill bound to `brand/green-tint`, no
    `componentPropertyReferences`, no prototype reactions (file-wide scan:
    0 reactions target these IDs), not overlay/scroll targets, not inside
    any component; sibling `Frame 5920` text blocks are the live rendered
    row content. They are leftover **form-input background rectangles**
    from row duplication (this file names input backgrounds `Rectangle
    352`, 536×31 — identical geometry), sitting as direct children of a
    **visible** `Frame 5914` — not "toggle-squares inside `visible:false`
    scaffolding" as PR #117 described (count and hidden state matched
    exactly; the characterisation didn't). Parent `Frame 5914` rows
    remain live and were **not** removed; each still carries a separate
    hidden `Frame 5926` scaffolding leftover, flagged for a future
    Settings-desktop layout pass.
  - **DL #123 docx correction spec'd, not applied** (no shell this
    session). The finalising session must: (Edit 1) replace Section 6's
    Sprint 3 messaging bullet ("…from the existing Drop Down Components
    chat frames.") with wording citing the PR #116 Message pillar
    (`5706:8270`); (Edit 2) **append** a "RESOLVED (founder-approved)"
    forward-note to Decision Log Table 6 row #123's Status; (Edit 3) add
    new rows **#125** (Task 1) and **#126** (Task 2). Exact text for all
    three in the report §"TASK 3". Live docx Decision Log ends at #124.
  - Merged as PR #118. The DL #123 correction and the #125/#126 rows this
    bullet spec'd were applied in the finalising session and are now live
    in the docx — see the `sprint-2/settings-desktop-scaffolding-sweep`
    bullet below and Build Plan Section 9 directly.
- **`sprint-2/settings-desktop-scaffolding-sweep` — one consolidated sweep
  of hidden row-duplication scaffolding across all 18 user-facing Settings
  desktop frames, replacing the three prior piecemeal passes (PR #117,
  PR #118, the DL #110 audit)** (Figma design only, no app/backend code).
  Stacks on PR #118 (`sprint-2/settings-label-align-docx-dl123`) → PR #117
  → PR #116. Full detail:
  `docs/sprint-2-settings-desktop-scaffolding-sweep-report.md`. Decision Log
  **#127** drafted in the report (live docx ends at #126); **DL #110 marked
  RESOLVED** with the Task 2 detail appended to its Status.
  - **17 hidden scaffolding nodes deleted**, each confirmed dead by all
    four checks (`visible:false`; 0 file-wide prototype reactions target
    it; not inside any COMPONENT/COMPONENT_SET/INSTANCE; not a
    `componentPropertyReferences` target):
    - **9 × hidden `Frame 5926`** — a 121×35 "Submit" button (each with a
      dead `ON_CLICK → 2924:6870` of its own) left in the Account panel of
      Security Overview, Notifications (Mute & Filter), Notification
      Preferences, Push, Email, Mute New Accounts, Two-Factor Auth (SMS),
      Direct Messages, Your Posts.
    - **3 × hidden `Frame 5920`→`Frame 5933`** — a duplicate/stray "Push
      notification" heading sitting at the exact coordinates of the visible
      labelled row on the trio (`2926:9721`, `2927:9954`, `2927:10205`).
      **All `visible:false` — cosmetic, never a live render bug** (DL #110's
      "overlapping duplicate headings").
    - **2 × hidden `Frame 5928`** — a leaked "Email Notification" +
      hidden 2FA blurb block on Push and Email.
    - **2 × hidden `Frame 5927`** — a leaked "Authentication App" heading +
      description block (belongs on Two-Factor Auth) on Direct Messages
      (`2926:8764`) and Your Posts (`2926:8996`) — DL #110's Task 2.1/2.2.
    - **1 × hidden `Rectangle 352`** (536×31 input-field background) on
      Email — a sixth instance of the exact leftover PR #118 deleted five
      of.
  - **`2926:8996` renamed** `Settings — Sensitive Content & 2FA App` →
    `Settings — Your Posts (Sensitive Media)` (matching its mobile sibling
    `5696:8261`); its visible `Frame 5919` heading was already accurate
    ("Your posts" → title-cased to "Your Posts"). The visible content is
    the sensitive-media-marking-on-your-posts toggle — the "2FA App" in
    the old name was only ever the now-deleted hidden leak.
  - **No `Frame 5914` row became empty; no live row touched.** Screenshots
    of all three trio panels + the two renamed/de-leaked panels confirm
    zero visual change (everything removed was already `visible:false`).
  - **Kept + flagged, not deleted this pass** (all pass the 4 checks but
    are outside the "hidden FRAME" mandate — a follow-up text-hygiene
    micro-pass can remove them with the IDs in the report):
    `See information about your account` (unused template subtitle, ×12,
    one per Account-panel frame); the 2FA "Help protect your account…"
    blurb leaked as hidden text into notification nav rows (×4); the
    "Choose to filter out content…" blurb leaked (×2); hidden
    `information-circle-sharp` icon (×2); and — inside **live** input rows
    on Change Password (`2924:6870`) and Account Information (Edit)
    (`2924:7112`), both out of scope — hidden leftover `Confirm your
    Password` labels (×7) and sample values (`@mitch`, `+2348104020224`,
    `michaelschenider249@gmail.com`).
  - **Kept, out of scope:** `ph:soccer-ball-fill` decorative background
    FRAMEs (×2 on every Settings frame including the clean category
    screens) — a deliberately-hidden decorative layer, not row-duplication
    scaffolding.
  - Merged as PR #119.
- **`sprint-2/all-sections-followup-mobile-field-audit` is a founder-authorised
  audit-AND-build sweep of all 20 sections (missing follow-up screens,
  missing mobile screens, field accuracy vs. Build Plan §3/§4 and the
  shipped `services/api` DTOs) — same one-time combined-scope override as
  PR #102 / #110, wider.** Figma design only, no app/backend code. Full
  detail: `docs/sprint-2-all-sections-followup-mobile-field-audit-report.md`.
  **Honest scope:** a true 20-section build is multi-PR; this pass did the
  full structural audit, built the highest-value clearly-in-scope gaps
  (Community — the current sprint — mobile parity, plus the one
  backend-implied Auth flow-completion screen), and flagged the rest as
  Decision Log candidates #131–#137 with the reason each was deferred
  (Sprint 4/5 sections not started; absent Contest/Competition and
  Report/moderation data models; work already earmarked in a prior PR as
  its own coordinated pass). Field-accuracy was a spot-check confirming
  prior passes' reconciliations still hold — no screen was found showing
  a *fake* field; the mismatches that exist are all
  backend-owes-a-column cases already logged (Decision Log #58/#74).
  - **Built (7 frames, 0 unbound paints except inherited illustration
    tones; 0 `brand/green-tint-28`; 0 new colour):**
    - **Reset Password — Success desktop (`5776:8405`) + mobile
      (`5777:8479`)** — the reset flow had a screen for every step except
      the success state, even though `POST /auth/reset-password` succeeds
      and `PasswordResetService.resetPassword` revokes every other
      session. Cloned from Reset Password desktop/mobile so the
      split-screen shell + navbar + token bindings are inherited. Copy
      states the change landed AND all other sessions signed out; single
      navy "Continue to log in" button → `/login` (the app's `/` is still
      a `PlaceholderPage`). **Decision Log #131.**
    - **Community mobile parity — 5 frames**, cloned from the real PR #116
      mobile frames: **Post View (`5779:8490`)** (back app-bar + expanded
      post + comment thread + pinned composer — covers both `1620:20139`
      and `949:73`), **Profile · Media (`5778:8490`)** and **Profile ·
      Saved (`5778:8567`)** (built as Profile tab-STATES, not standalone
      routes — active tab → `brand/green` underline; Media = 3-col
      `brand/green-tint` grid; Saved = save glyph re-bound to
      `brand/green`), **Search & Trending (`5780:8581`)** (composer row →
      `brand/green-tint` search field + For you / Trending / News chip
      row, mirroring desktop `2876:4628` minus "Bant"), **Inactive
      Account (`5780:8679`)** (mirrors desktop `1662:2782` —
      Activate/Delete, matching shipped `POST /auth/reactivate-account` /
      `delete-account`). **Decision Log #132.**
  - **Flagged, NOT built (new Decision Log candidates):** Sports Hub
    match-centre mobile — 7 screens, 0 mobile (**#133**, deferred to
    Sprint 4, blocked with Decision Log #6); Contest user-facing mobile +
    legacy light-token retrofit + Bants missing mobile variants/empty
    states (**#134**, deferred to a dedicated Sprint 3 Contest/Bants pass,
    already flagged PR #108, data model absent); Admin moderation-queue
    screens + moderation-outcome/appeal-decision email templates —
    §4.8/§8.4 workflow has zero screens (**#135**, deferred to Sprint 5,
    needs founder input on the §8.4 appeal-routing model; Admin Panel
    colour/token treatment was NOT touched — hard constraint); Message
    "new conversation / recipient picker" screen — `POST /conversations`
    has no starting-a-DM screen (**#136**, deferred to Sprint 3,
    recipient-picker source unresolved); Club Picker "no clubs match
    filter" vs "no clubs exist at all" still one conflated state
    (**#137**, minor, conservative single-state kept).
  - Build Plan Decision Log **#131–#137** added (Section 9, Table 6),
    continuing from #130, via python-docx deep-copying the last row's XML.
  - Merged as PR #124.
  - **Follow-up resolution (post-merge):** two of the five deferrals
    above depended on real founder decisions, not just build work —
    resolved now so the #133–#137 follow-up pass can build instead of
    re-flagging. **Decision Log #138** resolves #135's appeal-routing
    question: an appeal is reviewed by a SECOND admin/moderator, never
    the original reviewer. **Decision Log #139** resolves #136's
    recipient-picker question: both a search bar (by username/name) and
    a default follow-list section, combined. #133 (Sports Hub mobile,
    still blocked on Decision Log #6) and #137 (Club Picker empty-state
    wording, minor) needed no decision and are unchanged. #134 (Contest
    mobile/retrofit/Bants) has no data-model blocker on the *design*
    side now that #128–#130 unblocked Leaderboard/Contest board-level
    design work — dummy data is the established convention, same as the
    rest of the Leaderboard/Contest boards.
- **`sprint-2/decision-log-133-137-followup` closes out four of the five #131–#137
  deferrals PR #124 raised, now that #133/#137 stayed unblocked and #135/#136 got
  real docx rows for the first time.** Figma design only, no app/backend code. Full
  detail: `docs/sprint-2-decision-log-133-137-followup-report.md`.
  - **Docx catch-up done first, verified before any Figma work**: #138 and #139 —
    already live in this file's own text above — were transcribed into the Build
    Plan's live docx Decision Log (Section 9) for the first time, with forward-
    pointers appended to #135/#136's own Status cells. Table now runs **#1–#144**
    contiguously, zero gaps, zero duplicates.
  - **Contest (#134) — retrofit + mobile + 2 new states, mostly built.** The "100%
    unbound" characterisation of the 3 legacy Contest frames was stale — a live
    audit found them mostly bound already (PR #107/#108's prior partial work);
    fixed the real remaining debt instead: 24× `brand/green-tint-28` →
    `brand/green-tint` (Decision Log #47) + 10× unbound `#d9d9d9` fan-avatar
    placeholders → `brand/green-tint`, across `2155:1062`/`2072:5584`/`2094:994`.
    All 3 now 0 unbound, 0 `-tint-28`. Built mobile (390px) for all 3: Contest —
    Details, Entries & Ranking, Voting. Built the two flagged-missing states —
    Contest — Already Voted, Contest — Between Weeks — **desktop only**; mobile
    for these two deferred (**Decision Log #140**) since the legacy frames'
    absolute-position internals made even the desktop edits need several
    overlap-correction passes. Bants gained a pre-categories Search Filter mobile
    screen + a No Results empty state; one further Bants mobile gap (a second
    categories-view state) stays open (**Decision Log #144**).
  - **Admin Moderation (#135, resolved by #138) — 3 new screens built** on fresh
    clones of the existing unified Admin shell, with a new "Moderation" sidebar
    row (reusing the file's own `el:ban-circle` icon): **Admin — Moderation
    Queue** (Report-entity table + an Open Reports/Appeals tab pair + a callout
    stating the #138 appeal-routing rule in plain language, making it legible in
    the design itself), **Admin — Report Detail & Action** (reported-content +
    report-details cards, four navy action buttons — no destructive-red token
    invented — and a §8.4 both-parties-notified note), **Admin — Appeal Review**
    (routing banner naming the original reviewer, read-only original decision,
    appeal reason, Uphold/Overturn actions). Admin Panel colour/token treatment
    left untouched everywhere (hard constraint honoured) — new screens reuse the
    shell's own existing, unedited fills. **Correction to PR #124's own report**
    (**Decision Log #142**): `917:218` ("Users – team members") was flagged there
    as admin-role management, distinct from a real user list — re-checked directly
    and that flag was wrong; it's already a real `GET/PATCH /admin/users` list
    (Username/Date Joined/Status + block/delete actions), so no redundant user-
    list screen was built. **New "Moderation" nav item exists only on these 3
    screens' own shells**, not propagated to the other 26 existing Admin shells —
    same "new item on new screens only, propagation is its own pass" precedent as
    Categories (DL #49) / Competitions (DL #76) (**Decision Log #141**).
    Moderation-outcome/appeal-decision email templates remain unbuilt, consistent
    with the 5-other-unwired-template precedent (**Decision Log #143**).
  - **Message recipient picker (#136, resolved by #139) — built**: Message — New
    Conversation (Recipient Picker), desktop + mobile, cloned from the real
    Message pillar shell (PR #116). Combines a search bar ("by username or
    display name") with a default "PEOPLE YOU FOLLOW" list shown before any
    search term, per #139. Search bar is a real, present UI element despite no
    people-search endpoint existing yet — the same backend-pending-field
    convention Decision Log #58 already established. Restricted-pending exclusion
    is shown by the sample people simply never including one — no invented copy.
  - **Sports Hub mobile (#133) — re-confirmed still blocked, untouched.**
    Decision Log #6 (sports-data vendor) checked directly: still "Open — blocks
    Sprint 4". Left alone, as instructed.
  - **Club Picker empty-state wording (#137) — built**: Club Picker — 6 No Clubs
    Available Yet, desktop + mobile, cloned from the "No Clubs Match Filter"
    frame with the filter value cleared, new "clubs still being added" copy, and
    the (now-meaningless) Load More button removed — a real, distinct
    catalogue-empty state alongside the existing filter-empty state.
  - **Two reusable Figma-authoring bugs found and fixed mid-pass, worth folding
    into this file's own Figma notes later**: (1) `setBoundVariableForPaint`
    keeps whatever literal colour you pass in — building several nav rows with a
    generic grey `{0.5,0.5,0.5}` placeholder rendered as visibly grey, unreadable
    boxes even though the variable binding underneath was genuinely correct;
    fixed by resolving each token's real Light-mode RGB once and using that as
    the literal before binding. (2) `figma.createFrame()` + setting `.layoutMode`
    alone does NOT make a frame hug its own content — it silently keeps Figma's
    default 100×100 size unless `primaryAxisSizingMode`/`counterAxisSizingMode`
    are set explicitly; produced literal 100px-tall rows with invisible content
    on the first Admin build. Fixed by setting both axis modes explicitly, and by
    preferring `figma.createAutoLayout()` (hugs both axes by default) for every
    frame built afterward — zero sizing-mode corrections needed from that point
    on. Neither bug reached the final, verified state of anything in this PR.
  - Build Plan Decision Log **#140–#144** added (Section 9), continuing from
    #139, via python-docx deep-copying the last row's XML; forward-pointers
    appended to #133–#137's own Status cells.
  - Merged as PR #128.
- **`sprint-2/create-post-sports-contest-mobile-admin-notif-fix` is a
  founder-authorised audit-AND-build Figma pass (routing override this
  pass only: the design-system agent built the wholly-new screens itself)
  covering five confirmed gaps/bugs** — Figma design only, no app/backend
  code. Full detail:
  `docs/sprint-2-create-post-sports-contest-mobile-admin-notif-fix-report.md`.
  - **Create Post mobile parity (Item 1)** — base `5701:8328` extended
    with a "Create a Post / Contest" mode-tab row; three new 390px
    frames: **With Attachment** (`5818:8962`), **Contest Mode**
    (`5818:8997` — count badge "1" verbatim from desktop `2009:2913`,
    reusing the Notification Centre "Unread Count Badge" pattern
    `5640:7915`, not a new badge), **Feed Context / Pinned Post**
    (`5818:9031`, cloned from the real Home Feed mobile). **Sub-finding:**
    desktop `2496:4462` and `2565:3951` have identical composers —
    differ only in the feed pin badge ("Contest post" vs "post") — so
    one mobile frame covers both, not two.
  - **Sports/Livescores match-centre mobile (Item 2, Decision Log #145)**
    — 8 new 390px frames: Match Details (`5820:8976`), Match Statistics
    (`5822:9075`), First Half Stats (`5823:9108`), Second Half Stats
    (`5823:9317`), Lineups (`5825:9207`), H2H (`5824:9174`), Standing
    (`5821:9068`), Video (`5821:9009`), plus a new `Match Centre Header —
    Mobile` component (`5819:8976`). Built with **dummy match data copied
    verbatim from the desktop frames** (Liverpool 1–3 Chelsea) ahead of
    the still-open Decision Log #6 sports-data vendor blocker — same
    convention as the Contest/Leaderboard boards. Typographic club marks
    only (Decision Log #85); real-crest licensing untouched.
    `figma-to-code` must not wire these to data until #6 resolves. H2H /
    Standing use a palette-compliant W/D/L + promotion/relegation colour
    scheme (green / navy / `semantic/alert`), deliberately not
    reproducing the desktop's off-palette amber for draws/mid-table —
    flagged as Decision Log #149.
  - **Contest mobile (Item 3)** — **closes Decision Log #140**: Contest —
    Already Voted — Mobile (`5815:8916`) and Contest — Between Weeks —
    Mobile (`5815:8948`), 390px, matching the three existing Contest
    mobile screens.
  - **Admin Panel sidebar (Item 4)** — Bug A: fixed the broken Moderation
    nav item on the 3 Moderation screens (`5794:8635`, `5796:8635`,
    `5796:8753`) — flattened the triple-nested icon to a single
    `el:ban-circle`, corrected the stale "Categories" layer name (the
    render was already "Moderation"). Bug B: propagated a correct
    **inactive** "Nav — Moderation" row (nav index 3, between Users and
    Categories) to the **26** other Admin Panel screens — **29/29** now
    carry it, no clipping. Hard constraint honoured: **zero Admin Panel
    colour/token/rebind changes**. Flagged (Decision Log #146): the
    active-row Moderation icon is invisible (navy-on-navy) on the 3
    Moderation screens because it binds `color/text/primary` where every
    sibling active-row icon binds `color/text/on-navy` — a one-line
    rebind left for founder sign-off, not done here (would violate the
    Item 4 constraint). Also flagged (Decision Log #147): the
    `fi:A_users` "Users" nav icon renders nothing file-wide (empty
    fills) — pre-existing, folds into the DL #52 Admin retrofit family.
  - **Notification Centre icon (Item 5)** — removed the orphaned floating
    bell + unread-badge overlay nodes from all 4 Notification Centre
    frames (`5640:7815`, `5643:8003`, `5642:7898`, `5642:7997`).
    Verified the underlying `header 4` / `header 4 — mobile` navbar
    instances already show the correct avatar-notification treatment
    (PR #113/#114) — no blank navbar left behind.
  - 0 unbound paints on every frame built fresh (excludes the shared
    navbar instance's avatar `[IMAGE]` fill). 0 `brand/green-tint-28`,
    0 new colours, 0 frame overlaps. Build Plan Decision Log **#145–#149**
  - Merged as PR #130.
- **`sprint-2/admin-sidebar-competitions-icon-fix` corrects a mass
  copy-paste defect in the Admin Panel sidebar that PR #130 (and PR #110
  before it) missed** — Figma design only, no app/backend code. Stacks on
  the PR #130 branch (`sprint-2/create-post-sports-contest-mobile-admin-notif-fix`)
  because it references that branch's DL #146/#149 and its "29/29" claim.
  Full detail: `docs/sprint-2-admin-sidebar-competitions-icon-fix-report.md`.
  - **The bug:** on 27 of the 29 Admin Panel screens the "Competitions"
    sidebar nav item's icon was an exact duplicate of the "Contest" row
    icon (badge glyph) instead of the intended three-bar chart. Only
    `5566:8033` (Admin — Create Competition) and `5569:7813` (Competition
    Created — Success) had it right. Layer names were no help — the icon
    frame is named `u:chat-bubble-user` on every screen; the real
    discriminator is icon-frame child geometry (3 `RECTANGLE`s = correct
    vs 1 `VECTOR` = broken, the latter the same node shape as the Contest
    icon).
  - **The fix (founder's explicit instruction):** replaced the **entire**
    sidebar nav block (`Frame 5745` — the 8-item list + pinned Settings)
    on all 27 non-reference screens with a fresh clone of `5566:8067`,
    then re-applied each screen's own active-nav highlighting using the
    established binding pattern (active = `brand/navy` +
    `color/text/on-navy`; inactive = `color/background/surface` +
    `color/text/primary`). Each target's own outer block geometry
    (655px/`SPACE_BETWEEN` for the 16 "Admin Shell" GROUP screens,
    806px/`MIN` for the 10 Contest/Profile FRAME screens) was preserved
    so nothing moved and Settings stays bottom-pinned.
  - **Coverage:** 29 Admin screens total (re-verified: `u:create-dashboard`
    instances = 29, `Frame 5745` blocks = 29). **29/29 now carry the
    correct bar-chart Competitions icon** (post-swap structure audit of
    all 29 + before/after screenshots on the reference, both known-broken
    samples `917:218`/`5794:8635`, and spot checks). 0 unbound paints on
    every block touched; no other colour/token/binding changed anywhere;
    no prototype reactions existed on any old block. Every screen swapped
    cleanly — including the 2 legacy hand-built Contest-tab shells and the
    3 dialog/scrim screens.
  - **Closes Decision Log #146** (PR #130's flagged navy-on-navy
    invisible active Moderation-row icon) as a side effect of re-binding
    the active state correctly — the 3 Moderation screens' active-row icon
    is now `color/text/on-navy` white (verified on `5835:9240` /
    `5835:9283` / `5835:9326`). **Decision Log #147** (`fi:A_users`
    empty-fill Users icon) unchanged — the reference block carries the
    identical nodes; still DL #52 family. New Decision Log **#150** (the
    fix) and **#151** (whether Admin sidebars should be unified to one
    height) added; forward-pointer appended to #146.
  - **This corrects the icon-fidelity gap PR #130's "29/29 carry it"
    claim missed** — PR #130's coverage of the *Moderation* nav item was
    complete, but it propagated the pre-existing broken *Competitions*
    icon forward unchanged and did not catch it.
  - Merged as PR #131.
- **Sprint 2 sweep (no PR — a status review, not a build pass) found the
  project is materially behind where the PR volume suggests.** Build Plan
  Section 6's actual Sprint 2 done-when criterion ("a user can post,
  follow another user or club, like/comment, and save a post, all
  reflected correctly on refresh") is **not met**: the Feed/Clubs/Follow
  backend is genuinely complete and tested, but `apps/web`'s `HomePage.tsx`
  and `CommunityPage.tsx` are still literal 5-line `PlaceholderPage`
  stubs — **zero `figma-to-code` conversion has ever run** on any of the
  6 target pages, across the entire `sprint-2/*` PR history. Most of that
  PR history is real, high-quality work, but a lot of it is Sprint 3–6
  content (Notification Centre, Message, Sports Hub, Admin moderation,
  Leaderboard) built early under the `sprint-2/*` branch prefix via the
  dummy-data-ahead-of-blockers convention — legitimate, but it means the
  branch prefix doesn't track Build Plan Sprint 2 scope. The actual
  bottleneck to closing Sprint 2 is running `figma-to-code` on Home and
  Community and wiring them to the already-complete backend, not more
  design work. Decision Log audited in full: 151 entries at sweep time,
  28 genuinely open (correctly scoped to later sprints or explicitly
  non-MVP-blocking — none block converting Home/Community), 11 more still
  read "Open" as their first word despite a resolution appended later in
  the same cell (cosmetic debt, not a real blocker, worth a cleanup pass
  sometime). Community's canonical frame (`1306:7149`) was re-confirmed
  fully populated (100+ children, 111 text nodes per variant) — an
  earlier "renders nothing" finding (PR #112) was already corrected by a
  later pass; it's just `hidden: true`, which doesn't block `get_metadata`/
  `get_design_context` reads.
  - **Found and fixed:** Homepage's canonical frame (`5204:6728`) carried
    a stale "BLOCKER, carried forward unresolved from Pass 1: is '/' the
    marketing landing page or the authenticated home feed?" annotation
    directly in its own annotation zone (`5214:6833`) — contradicting a
    decision that had already been made in practice (Community owns all
    authenticated feed content; Homepage's Header instance is the
    logged-out `header 7` variant) but was never actually written into
    the Decision Log. Founder confirmed final: "/" is exclusively the
    logged-out marketing page; logged-in users route to Community
    (`1306:7149`) instead. **Decision Log #152** added recording this.
    The stale annotation text was corrected in place via `use_figma`
    (canonical text-edit recipe: load current fonts → mutate → return
    IDs) to read "RESOLVED" instead of "BLOCKER," so a future
    `figma-to-code` pass reading this frame's own notes doesn't get
    misled. The Pass 1 predecessor frame referenced in the old annotation
    (`5191:6652`) no longer exists in the file — nothing to fix there.
- **`sprint-2/home-community-conversion` (figma-to-code, 2026-09-02)
  converts the two Figma screens Sprint 2 actually needs into real,
  working `apps/web` code — `HomePage.tsx` and `CommunityPage.tsx` were
  literal 5-line `PlaceholderPage` stubs until this PR. No `services/api`
  code touched.** Report:
  `docs/sprint-2-home-community-conversion-report.md`.
  - **Build Plan Section 6's Sprint 2 done-when criterion ("a user can
    post, follow another user or club, like/comment, and save a post,
    all reflected correctly on refresh") is now met** — with one honest
    caveat (see Decision Log #153 below). Post → `POST /posts`;
    like/comment → `POST /posts/:id/like` + `/comments`; save → `POST
    /posts/:id/save` (+ `GET /users/:id/saved-posts` persists it);
    follow a user → `POST /users/:id/follow`; follow a club → the
    already-shipped `POST /clubs/:id/join` (`sprint-2/club-picker-ui`,
    not re-built here — no club surface in the Community template frame).
    All four actions persist server-side and survive a reload; the
    denormalized `likeCount`/`commentCount` come back on `GET
    /posts/feed`.
  - **New `apps/web/src/api/feed.ts`** — Feed Service client (Section
    4.3), mirroring `api/clubs.ts`/`api/users.ts` conventions exactly
    (own fetch wrapper, own `FeedApiError`, `VITE_API_BASE_URL`, Bearer
    auth, cursor pagination). `followUser`/`unfollowUser` were added to
    `api/users.ts` (not `feed.ts`) since follow is a Section 4.2 User
    Service endpoint.
  - **HomePage** = the logged-out marketing page only (Figma `5204:6728`,
    Decision Log #46/#152). If `getStoredAccessToken()` returns a token
    it renders `<Navigate to="/community" replace />` — no separate
    authenticated-homepage design exists or was built. Everything below
    the navbar (hero live-fixture card, Today's Fixtures, Talents clips,
    Trending stories) is **hardcoded dummy content** matching the frame —
    no fixtures/news/points data source exists (Decision Log #6). Club
    crests rendered typographically. CTAs → `/signup`.
  - **CommunityPage** (Figma `1306:7148`) — three-column social layout;
    **only the centre column (composer + feed) is wired to real data.**
    Composer built against the dedicated Create Post frame (`2008:655`),
    not the template's embedded mock. No-session → "Log in to see your
    feed" prompt, zero API calls (mirrors `ProfilePage.tsx`).
    Restricted-pending minors get the real 403 from `POST
    /posts`/`/comments` (`GuardianConsentGuard`) surfaced inline with a
    `/guardian-consent` link. The left "Trends" rail and right "Who to
    follow" / "Trending News" rails are **static sample content, visibly
    captioned "Sample"** — Section 4.2 defines follow/followers/following
    only, there is **no suggested-users endpoint** and inventing a
    suggestion algorithm was out of scope. Composer photo/video/poll
    icons rendered disabled (no media-upload endpoint) — same discipline
    as `EditProfileModal.tsx`'s disabled fields.
  - **Decision Log #153 added** (Build Plan Section 9, appended via
    python-docx): `GET /posts/feed`'s `FeedPost` payload exposes **no
    per-current-user `isLiked`/`isSaved`** flag, and the embedded author
    has no `isFollowing`. So on first load and after every hard refresh,
    every like/save/follow control renders in its default
    (not-yet-acted) state regardless of the real relationship — it
    self-corrects only for actions taken in the current session (via the
    idempotent toggle-endpoint responses + local state). **No fake
    client-side flag was added.** Safe in practice (like/save are
    idempotent; `likeCount` always taken fresh from the server), but a
    real backend gap — candidate for the next `backend-api` Feed pass:
    add caller-scoped `isLiked`/`isSaved` to the feed + single-post
    payloads and `isFollowing` to the post author.
  - **Verification**: `npx tsc --noEmit`, `npm run lint`, `npm run build`
    all clean; `npx vitest run` — **9 suites / 49 tests, 0 failures** (up
    from 7/41 — `HomePage.test.tsx` +3, `CommunityPage.test.tsx` +5, no
    existing test changed); dev-server smoke test `/`, `/community`,
    `/signup`, `/login` all HTTP 200. No real browser/Playwright check
    available in this environment — same ceiling as every prior
    `apps/web` PR.
- **`sprint-2/feed-per-user-flags` (backend-api, 2026-09-02) resolves
  Decision Log #153 — `services/api` only, `apps/web` untouched.** Report:
  `docs/sprint-2-feed-per-user-flags-report.md`.
  - **`GET /posts/feed` and `GET /posts/:id` now return per-caller
    `isLiked` / `isSaved` and `author.isFollowing`** — all computed per
    request from the caller's own `Like` / `SavedPost` / `Follow` rows,
    **none stored**. New exported type `FeedPostWithViewerState` =
    `FeedPost & { isLiked; isSaved; author: … & { isFollowing } }` — the
    raw `FeedPost` / `POST_SELECT` are unchanged (the fields are an
    intersection on top, not columns).
  - **No N+1.** `getFeed` enriches a whole page via a new private
    `attachViewerState()` doing **three batched `findMany({ where: { …: {
    in: [...] } } })` queries** in `Promise.all` (like by `postId`, saved
    by `postId`, follow by deduped author id) — a zero-post page issues
    zero lookups; `isFollowing` is a hard `false` for the caller's own
    posts with nothing queried (self-follow rows can't exist), and the
    follow query is skipped entirely if the whole page is the caller's
    own posts. `getPostById` uses three unique-key `findUnique` checks
    for the single row, same own-post skip.
  - **`feed.controller.ts` `getById` gained `@CurrentUser() user` →
    `getPostById(id, user.sub)`** — a handler-signature change (the route
    was `@Param('id')`-only before); `JwtAuthGuard` already attaches
    `request.user`, no new guard wiring.
  - **Deliberately not enriched (flagged in-code + report):** `POST
    /posts` (`createPost`) and `GET /users/:id/saved-posts`
    (`getSavedPosts`) still return the raw `FeedPost` shape. For a
    freshly created post all three are trivially `false`; for saved
    posts `isSaved` is trivially `true` and the screen isn't built yet —
    both left as small follow-ups, out of #153's Feed-read scope.
  - **`apps/web` NOT touched.** Dropping `PostCard.tsx`'s documented
    session-local workaround (and consuming the new fields) is the
    separate frontend follow-up this PR unblocks.
  - **New Decision Log candidate raised in the report, NOT fixed:** `GET
    /clubs` (`ClubsService.listClubs` → `ClubSummary`) has the identical
    gap — no per-user `joined` / `isMember` field, only the join/leave
    action responses carry membership state. Same fix pattern would
    apply (batched `_ClubMembership` existence check on the list
    payload). Out of scope here (Clubs isn't part of #153).
  - **Verification**: `nest build` + `npm run lint` clean; `npx jest`
    (full unit suite) **35 suites / 415 tests, 0 failures** (up from
    34/356 at `sprint-2/comment-delete` — `feed.service.spec.ts` +~10
    for the viewer-state cases, plus the drift since that measurement);
    `npm run test:e2e` unchanged (no e2e touches `GET /posts/feed` or
    `GET /posts/:id`, and the change is plain `findMany`/`findUnique` —
    none of `test/README.md`'s add-an-e2e triggers apply). Decision Log
    #153's Status cell got a `RESOLVED` forward-pointer in the same PR.
- **`sprint-2/postcard-viewer-state-wiring` (figma-to-code, 2026-09-02)
  is the frontend follow-up `sprint-2/feed-per-user-flags` unblocked —
  `apps/web` only, Decision Log #153 now fully closed on both sides.**
  Report: `docs/sprint-2-postcard-viewer-state-wiring-report.md`.
  - `apps/web/src/api/feed.ts`: `FeedPostAuthor` gains
    `isFollowing: boolean`; `FeedPost` gains `isLiked` / `isSaved`.
    `FeedComment`/`CommentPage` untouched (comments never show a follow
    button). New `CreatedPost` type (= `FeedPost` minus the three viewer
    fields) is what `createPost` now returns — `POST /posts` genuinely
    stays unenriched per #153, so the client type stops over-claiming;
    the values are deterministically `false` for a brand-new post.
  - `PostCard.tsx`: `useState(post.isLiked)` / `useState(post.isSaved)` /
    `useState(post.author.isFollowing)` instead of the hardcoded
    `useState(false)` + session-local workaround PR #135 shipped. The
    old "KNOWN GAP" header paragraph is replaced with a note pointing at
    #153. Toggle handlers / `isOwnPost` follow-skip / idempotency
    reasoning all unchanged — targeted initial-state fix, not a refactor.
  - `CommunityPage.tsx` `onCreated` normalises the created post to a full
    `FeedPost` (`isLiked:false, isSaved:false, author.isFollowing:false`)
    on prepend — the one spot that augments a `FeedPost` shape.
    `PostComposer.tsx` `onCreated` prop type follows to `CreatedPost`.
  - **Verification**: `npx tsc --noEmit`, `npm run lint`, `npm run build`
    clean; `npx vitest run` — **9 files / 50 tests, 0 failures** (up from
    9/49 — one new `CommunityPage` case proving an already
    liked/saved/followed post renders its three controls in the acted
    state on first paint, no clicks). Decision Log #153 Status cell got a
    second forward-pointer noting the frontend is now wired too.
- **`sprint-2/clubs-joined-flag` (backend-api, 2026-09-02) closes
  Decision Log #154 — the sibling gap PR #136's report flagged off #153.
  `services/api` only, `apps/web` untouched.** Report:
  `docs/sprint-2-clubs-joined-flag-report.md`.
  - **`GET /clubs` and `GET /clubs/:id` now return a per-caller `joined`
    boolean** — `true` iff a `ClubPage.members` row exists for `(club,
    caller)`. Computed per request, not stored. New exported type
    `ClubSummaryWithViewerState = ClubSummary & { joined: boolean }`;
    `CLUB_SELECT` / `ClubSummary` unchanged (intersection on top).
  - **No N+1.** `listClubs(query, userId)` resolves a whole page with
    **one** batched `clubPage.findMany({ where: { id: { in: [...] },
    members: { some: { id: userId } } } })` (a zero-club page issues
    none); `getClubById(clubId, userId)` uses one `findFirst`. A **plain
    Prisma relation filter**, not the raw `$executeRaw` against
    `_ClubMembership` that `joinClub`/`leaveClub` need for write
    atomicity — a read has no such need. 404 for a missing club still
    thrown before the membership lookup.
  - **`clubs.controller.ts` `list` AND `getById` both gained
    `@CurrentUser()`** — mirroring PR #136's `feed.controller.ts`
    change. `JwtAuthGuard` already attaches `request.user`; signature
    change only.
  - `joinClub`/`leaveClub`'s `JoinState` already carries `joined` —
    unchanged. No other Clubs endpoint returns `ClubSummary`.
  - **`apps/web` NOT touched** — updating `api/clubs.ts`'s `ClubSummary`
    type + any local joined-state tracking (`ClubPickerStep.tsx`) is a
    separate follow-up, same two-PR split #153/#137 used.
  - **Decision Log #154 added** to Build Plan Section 9 (references back
    to #153's own status text where the candidate was raised); #153's
    Status cell got a forward-pointer to #154.
  - **Verification**: `nest build` + `npm run lint` clean; `npx jest`
    (full unit suite) **35 suites / 419 tests, 0 failures** (up from
    35/415 — new `clubs.service.spec.ts` viewer-state cases); `npm run
    test:e2e` — new describe block in `test/clubs.e2e-spec.ts` proving
    `joined` against real Postgres/`_ClubMembership`, including that the
    flag is scoped to the calling user (user B joining doesn't flip it
    for user A).
- **`sprint-2/clubpicker-joined-wiring` (figma-to-code, 2026-09-02) is
  the frontend follow-up to Decision Log #154 — `apps/web` only. Closes a
  type/correctness gap, NOT a live user-facing bug** (unlike PR #137's
  `PostCard.tsx` fix). Report:
  `docs/sprint-2-clubpicker-joined-wiring-report.md`.
  - `apps/web/src/api/clubs.ts`: `ClubSummary` gains `joined: boolean`
    (from `GET /clubs` / `GET /clubs/:id`). `JoinClubResult`'s own
    `joined` untouched.
  - `ClubPickerStep.tsx`: one line — each club's join-button state now
    falls back to `club.joined ? "joined" : "idle"` instead of always
    `"idle"` (the in-session `joinState` map still wins once the user
    acts). Same "seed from the API" shape as `PostCard.tsx`. Nothing
    else touched — state shape / filtering / pagination / error handling
    / the continue button all unchanged (`hasJoinedAny`, i.e. the
    continue-button label, still reflects only in-session joins —
    deliberately left, cosmetic, reachable only in a hypothetical
    reuse).
  - **No live symptom today:** `ClubPickerStep` is rendered only once,
    from `RegisterStep`'s post-registration success view — a brand-new
    account has joined nothing, so `club.joined` is always `false`
    there. `router.tsx` has no standalone Clubs route. The new test
    (a `joined: true` club renders "Joined" disabled on first paint, no
    click) is a regression guard for a hypothetical reuse.
  - **Decision Log #155 added, then CORRECTED**: no persistent "my clubs" /
    club-browsing page exists in `apps/web` — the reason `joined` (#154)
    and `DELETE /clubs/:id/join` (`leaveClub`) have no live frontend
    consumer. **The entry originally called this "Sprint 3+ territory" —
    that was wrong and has been struck.** Build Plan Section 6 names
    "Club Pages" directly in **Sprint 2's own heading** ("Sprint 2 —
    Feed, Club Pages, Follow") and task line ("Build club fan pages with
    auto-join on signup") — no other sprint mentions a club-viewing page
    anywhere. This is an **incomplete Sprint 2 deliverable**, not
    forward-looking scope: Sprint 2 shipped the join-picker
    (`ClubPickerStep.tsx`) but never a page to view a club, its fan-page
    feed, or your own membership. Still needs `figma-screen-builder`/
    `figma-design-system` (new screen) plus a `leaveClub()` client (none
    exists in `api/clubs.ts`). #154's Status cell got a frontend-wired
    forward-pointer.
  - **Verification**: `npx tsc --noEmit`, `npm run lint`, `npm run
    build` clean; `npx vitest run` — **9 files / 51 tests, 0 failures**
    (up from 9/50 — one new `ClubPickerStep` case).
- **`sprint-2/club-pages-design` (figma-screen-builder, 2026-09-02)
  designs the persistent Club Pages surface — closing the DESIGN HALF of
  Decision Log #155 (an incomplete Sprint 2 "Club Pages" deliverable, not
  later-sprint scope). Figma design only — no app/backend code; frontend
  code conversion is a separate figma-to-code follow-up per this project's
  agent-sequencing rule.** Report:
  `docs/sprint-2-club-pages-design-report.md`.
  - **5 frames on page `0:1`, cloned from the existing Club Picker family
    (`5146:6635` desktop / `5645:8023` mobile)** so every card / badge /
    button / search / load-more / empty-state pattern AND every variable
    binding is inherited, not reinvented: **Clubs — Browse — Desktop
    (`5841:9240`) / Mobile (`5841:9306`)**, **Club — Fan Page — Desktop
    (`5841:9365`) / Mobile (`5841:9431`)**, and a **Design Notes frame
    (`5853:9240`)**.
  - **Clubs — Browse** = the persistent, always-reachable version of what
    `ClubPickerStep` does, minus onboarding framing: the "Skip for now" /
    "Continue" dynamic-label footer and the confirmation-message slot are
    removed; header is "Clubs" not "Join a club". Real `ClubSummary`
    fields only (badge, name, `league • country`, member count). **New:
    a "Leave" affordance** — one sample card shows the joined →
    `joined: true` state (Decision Log #154) as a white / navy-15%-outline
    button, de-emphasised against the green "Join"; `ClubPickerStep` never
    needed this since a fresh signup has nothing to leave. Client-side
    name filter over loaded pages only (`GET /clubs` has no text-search
    param — placeholder stays "Filter loaded clubs by name"); cursor
    "Load more"; every club card carries a prototype `ON_CLICK → NAVIGATE`
    to its Fan Page.
  - **Club — Fan Page** = view one club: "← Clubs" back link, badge, name,
    `league • country`, member count, one Join/Leave button, one thin
    divider + one muted scope note ("Member posts and a full member list
    aren't part of club pages yet."). That is the **entire** real-data
    content — deliberately sparse, an honest reflection of what
    `ClubSummary`/`JoinClubResult` expose, same discipline
    `ProfilePage.tsx` applies to its unbacked tabs. Not padded with dummy
    content.
  - **HARD CONSTRAINT confirmed honoured — no club feed, no posts, no
    member list, no composer** was designed on either screen.
    `GET /posts/feed` never reads `Post.clubPageId`, so a club feed has no
    backend to bind to; flagged as **Decision Log #157** (a genuinely
    missing endpoint, not vendor-blocked content — not faked with dummy
    data).
  - **Standing rules verified**: `brand/navy` / `brand/green` /
    `brand/green-tint` (12%) only — **no `brand/green-tint-28`, no new
    colours**; **Light mode only**; **0 unbound / 0 off-palette paints**
    across all 5 frame subtrees (audited node-by-node — cloned frames
    inherit `Soccernity Theme` bindings, every fresh node bound on
    creation). Frame grounds use `color/background/page`.
  - **New Decision Log candidates (#156–#158, transcribed into Build Plan
    Section 9 in this PR; forward-pointer appended to #155's Status):**
    **#156** — no nav-bar entry point for "Clubs — Browse" (conservative
    meanwhile: both new screens use the simple "Top Bar — Soccernity"
    logo bar matching the club-picker family / `5570:7813` selector, not
    the full logged-in `header 4`; where Clubs lives in nav is deferred).
    **#157** — club fan-page feed / club-scoped posts endpoint doesn't
    exist. **#158** — `apps/web` has no `leaveClub()` client for the
    already-shipped `DELETE /clubs/:id/join` (`sprint-2/club-leave`); the
    "Leave" button is the first surface to need it — `figma-to-code` must
    add it during conversion.
- **`sprint-2/club-pages-conversion` (figma-to-code, 2026-09-02) converts
  PR #142's Club Pages designs into real, working React — `apps/web`
  only, `services/api` untouched. Closes the CODE HALF of Decision Log
  #155 (#155 now fully closed, design + code) and Decision Log #158
  (`leaveClub()` client).** Report:
  `docs/sprint-2-club-pages-conversion-report.md`.
  - **`api/clubs.ts` — two new clients**: `getClubById(accessToken,
    clubId)` (`GET /clubs/:id`; a 404 surfaces as `ClubsApiError` with
    `status: 404`, not a distinct type — the caller decides how to render
    it) and `leaveClub(accessToken, clubId)` (`DELETE /clubs/:id/join`,
    mirrors `joinClub` exactly — **closes #158**).
  - **`ClubsPage.tsx`** (route `/clubs`, new) — "Clubs — Browse". `GET
    /clubs` + cursor "Load more"; client-side name filter over loaded
    pages only (`GET /clubs` has no text-search param — field labelled
    "Filter loaded clubs by name"); per-club **Join / Leave** button
    driven by that club's real `joined` (Decision Log #154), toggling the
    row + member count from the endpoint's own response; each card
    `<Link>`s to `/clubs/:id`. No-session → "Log in to browse clubs",
    API never called (mirrors `ProfilePage`/`CommunityPage`).
  - **`ClubFanPage.tsx`** (route `/clubs/:id`, new) — "Club — Fan Page".
    `useParams` → `getClubById`; badge, name, `league • country`, member
    count, one Join/Leave button, "← Clubs" back link, and the scope note
    **reproduced verbatim** ("Member posts and a full member list aren't
    part of club pages yet."). A **404 renders an honest "Club not found"
    state** with a link back to `/clubs`, never a crash; a non-404
    failure renders a generic error (distinguished by `err.status`).
  - **`ClubJoinButton.tsx`** (new, shared by both pages) — same
    "act, then trust the real response" shape `PostCard.tsx` uses for
    like/save. **`ClubsPage.css`** references the app-wide `--sn-*`
    tokens (light mode, `CommunityPage.css` convention); the design's
    "Top Bar — Soccernity" is NOT reproduced (AppShell renders the shared
    Header). **`router.tsx`** gains both routes.
  - **NOT done, by design**: **Decision Log #156** (Navbar entry point)
    stays open — no Navbar link was added; adding one is shared-component
    work touching every screen, out of scope. These pages are reachable
    by direct URL and via the Club Picker → Fan Page `<Link>` path; full
    in-app discoverability waits on #156. **Decision Log #157**
    (club-scoped posts endpoint) stays open — no feed / composer / member
    list was added to the Fan Page.
  - **Verification**: `npx tsc --noEmit`, `npm run lint`, `npm run build`
    all clean; `npx vitest run` — **11 files / 66 tests, 0 failures** (up
    from 9/51 — `ClubsPage.test.tsx` +8, `ClubFanPage.test.tsx` +7, no
    existing test changed); dev-server smoke test `/clubs`,
    `/clubs/:id`, `/`, `/community` all HTTP 200. No real
    browser/Playwright check available — same ceiling as every prior
    `apps/web` PR.
- **`sprint-2/navbar-icon-set-complete` (figma-design-system, 2026-09-02)
  is PHASE 1 of a founder-directed correction: `apps/web`'s shipped
  navbar (`Header.tsx` / `navigation.ts`) is a text-label nav built
  without instruction, off-canon from the Figma icon navbars (`header 4`
  / `header 7`). Phase 1 makes the Figma icon navbars complete — Figma
  design only, `apps/web` NOT touched.** Report:
  `docs/sprint-2-navbar-icon-set-complete-report.md`. Decision Log
  **#159–#161** added.
  - **Desktop — Clubs icon added to `header 4` (`2838:3502`, 48
    instances) and `header 7` (`2841:4104`, 9 instances)**, appended to
    the shared content-nav row (`Frame 5858`), kept in sync. Glyph: a
    **shield / club-crest** outline (Decision Log #159 — no Clubs icon
    existed to reuse; the 5 existing nav icons are bespoke hand-drawn
    navy line-art on a `brand/green-tint` 12% square, and the new one
    matches that treatment exactly — `brand/navy` 1.5px stroke, round
    caps, 31×31 r3 green-tint square). Route target `/clubs`.
  - **Mobile — new standalone `Bottom Navigation — Mobile` component
    (`5863:9505`)**: 428×64, `color/background/surface` ground, 1px
    `color/icon/inactive` top divider, `SPACE_BETWEEN` row of the **same
    6 glyphs as desktop** (5 cloned verbatim from `header 4`'s nav row +
    `clubs`), icon-only. `header 4 — mobile` / `header 7 — mobile` are
    64px bars with no room for the content nav inline (confirmed). The
    file's only existing mobile primary-nav is a **one-off text-label
    Navigation Drawer** (`5703:8320`) — not a component, no Clubs entry;
    a bottom bar was chosen over extending it or cramming the top bar
    (Decision Log #160). Two reference example frames (`5864:9505` /
    `5864:9592`) show the top-navbar + bottom-nav pairing per auth state.
  - **Auth cluster — confirmed correct on all four variants, nothing
    fixed.** The brief's premise (that `Component 20` / `2838:3579` on
    `header 4` is "a bare, unstyled ellipse placeholder") was **stale**:
    it's a real instance of the `Avatar` `COMPONENT_SET` (`5685:9241`,
    `Has Unread=false`, photo image fill), established by PR #113–#115 /
    Decision Log #99–#103 (109 live instances file-wide). `header 4` /
    `header 4 — mobile` show messages-glyph + `Avatar`; `header 7` /
    `header 7 — mobile` show the `Login` button. Runtime `header 4` ↔
    `header 7` switching is a **Phase 2 code task**, not a design gap.
  - **`Old — Mobile App Nav Icons` (`2230:4328`) dead-check**: 2 live
    instances, **both on the `dump` scratch page**, zero on page `0:1` —
    treated as fully dead; its older 7-icon set was **not** reused (mobile
    nav matches the *current* 6-icon desktop set).
  - **Standing rules**: `brand/navy` / `brand/green` / `brand/green-tint`
    12% / `color/background/surface` / `color/icon/inactive` only — no
    `brand/green-tint-28`, no new colours; Light mode only; **0 unbound /
    0 off-palette paints** on every authored node (the shield's
    `createNodeFromSvg` output was explicitly re-bound during
    construction, per the known unbound-black-stroke gotcha).
  - **PHASE 2 (separate `figma-to-code` follow-up, `apps/web`)**: replace
    `Header.tsx` / `navigation.ts` with the icon navbar, wire the mobile
    nav (see the next bullet — it's the drawer, not the bottom bar), add
    `/clubs` to the nav (Decision Log #156), and implement runtime
    auth-state switching.
- **`sprint-2/mobile-nav-drawer-canonical` (figma-design-system,
  2026-09-02) redirects Decision Log #160's mobile-nav answer** — Figma
  design only, `apps/web` NOT touched. Report:
  `docs/sprint-2-mobile-nav-drawer-canonical-report.md`. Decision Log
  **#162–#163** added; forward-pointer on **#160**.
  - **PR #144's `Bottom Navigation — Mobile` icon-row (`5863:9505`) is
    RETAGGED, not deleted** → `Bottom Navigation — Mobile App Nav
    (Reserved — Native iOS/Android)`; its two pairing frames renamed
    `Reserved (Native App) — …`. **Artwork/layout untouched.** It's the
    right pattern for a future native app, not the current mobile *web*
    build.
  - **The mobile-web answer: the slide-in Navigation Drawer, promoted to
    a real reusable COMPONENT `Navigation Drawer — Mobile` (`5870:10689`)**
    — it had existed only as a one-off FRAME (`5703:8320`) inside one
    Community screen. 390×844, a full-bleed `Scrim` (`ON_CLICK → CLOSE`)
    + the 268px `Panel` cloned verbatim from `5703:8320` (identity block,
    nav list, divider, Log out). The one-off screen `5703:8250` now
    renders an instance of it. Instance this on any mobile screen that
    needs full nav, the same way `header 4 — mobile` is instanced.
  - **"Clubs" added to the drawer** (`Nav — Clubs`, `5870:10735`, cloned
    from `Nav — Sports Hub` — identical marker-dot + text-row structure),
    positioned at the end of the content-pillar group: Home · Community ·
    Sports Hub · Bants · Leaderboard · **Clubs** · Messages ·
    Notifications · Profile · Settings — Log out.
  - **Trigger wired: `header 4 — mobile`'s avatar (`5387:7675`)
    `ON_CLICK → OPEN_OVERLAY → 5870:10689`** (set on the component node,
    inherited by all ~46 instances). **This supersedes Decision Log
    #100/#101 (avatar → mobile account dropdown) FOR MOBILE ONLY** — the
    desktop avatar (`2838:3579` → `2841:5361`) is unchanged. The two
    mobile account-dropdown variants (`5685:9300` / `5685:9312`) are now
    redundant (the drawer is a strict superset) — **recommended for
    retirement, not deleted here**. Plugin-API limits: the
    slide-in-from-left transition and `overlayPositionType=TOP_LEFT` must
    be set once by hand in the Figma UI (`setReactionsAsync` rejects a
    `DirectionalTransition`; overlay props readonly — same class of limit
    PR #115 hit).
  - **Scrim fill**: a variable-bound `brand/navy` paint at paint-level
    `opacity` renders **solid** on instances (this file's documented
    "bound paint takes alpha from the variable" gotcha), so the scrim
    uses **two stacked `color/icon/inactive` fills** (navy 15% each →
    ~28%, alpha travels with the token). **No `overlay/scrim` token
    exists** — flagged as Decision Log #163, along with the drawer's nav
    list diverging from the desktop set (no "News" item; "Bants" vs
    "banter").
  - **Standing rules**: palette-only, no `brand/green-tint-28`, no new
    colours, Light mode only, **0 unbound / 0 off-palette paints** across
    the whole `Navigation Drawer — Mobile` subtree (audited node-by-node).
- **`sprint-2/desktop-icon-nav-and-header-fix` (figma-design-system,
  2026-09-02) — three founder-directed corrections, Figma only,
  `apps/web` NOT touched.** Report:
  `docs/sprint-2-desktop-icon-nav-and-header-fix-report.md`. Decision Log
  **#164–#165** added; forward-pointer on **#163**.
  - **Finding 1 — 11 text-label-nav screens → icon nav.** `Header/header
    5` (`2839:3583`, a LIVE SCORE / NEWS / LEADERBOARD / BANTER /
    COMMUNITY text nav) had exactly 11 live instances, all on
    Leaderboard/Contest-family screens. All 11 `swapComponent`'d to
    `header 4` (`2838:3502`), each now 1440×90 `FILL`, renamed `Navbar —
    header 4`. `Header/header 5` confirmed at **0 instances** and
    **archived** (renamed `ARCHIVED — …`, not deleted).
  - **Finding 2 — header 4 width bug: the brief's premise was INVERTED
    (Decision Log #164).** Briefed as "PR #144 correctly grew the master
    1440→1474; stale 1440 instances need raising to 1474." Investigation
    found: (a) the 1474 was PR #144's **accident** — a nested
    `appendChild` bumped the master's FIXED width, with ~13px dead
    whitespace; header 4 fits cleanly at 1440. (b) 1474 was **breaking 42
    screens** — a 1474 navbar in a 1440 `clipsContent` frame clipped the
    account avatar ~2/3 (confirmed on `Settings — Overview`). (c) the "7
    stale overrides" weren't overrides — 6 are `FILL` (correctly filling
    1440); only Create Profile was a real 1474 overhang. **Fix: master
    resized 1474 → 1440** + auto-layout `CENTER` → `SPACE_BETWEEN`
    (stale `itemSpacing: 419` cleared) so logo/nav pins left, messages +
    avatar pins right at the 20px padding. **All 59 `header 4` instances
    (48 + 11 swapped) now 1440; 0 at 1474; clipped-avatar bug fixed on 42
    screens.** No screen-frame widths changed. `header 7` untouched
    (already 1440).
  - **Finding 3 — `Nav — Blog` added to `Navigation Drawer — Mobile`**
    (`5870:10689`), after `Nav — Sports Hub`, cloned from an existing
    item. **Label "Blog"** — the drawer uses section names not routes
    ("Bants" not `banter`), and the Figma file consistently calls this
    pillar "Blog" (the `blog` icon, `Blog Page Desktop`). `apps/web`'s
    `navigation.ts` calls it "News" (`/news`) — **flagged as Decision Log
    #165**, not silently resolved (same treatment #163 gave
    Bants-vs-banter). Closes #163's Blog/News gap. Drawer order now:
    Home · Community · Sports Hub · Blog · Bants · Leaderboard · Clubs ·
    Messages · Notifications · Profile · Settings — Log out.
  - **Standing rules**: palette-only, no `brand/green-tint-28`, no new
    colours, Light mode only; **0 unbound / 0 off-palette paints** across
    the `header 4` master subtree, `Navigation Drawer — Mobile`, and the
    new `Nav — Blog` item.
- **`sprint-2/navbar-phase-2-icon-nav-and-auth-state` (figma-to-code,
  2026-09-03) — PHASE 2 of the founder-directed navbar correction
  (Decision Log #161), `apps/web` only, `services/api` NOT touched.**
  Report: `docs/sprint-2-navbar-phase-2-report.md`. Replaces the
  unrequested text-label nav (`Header.tsx` / `navigation.ts`) with the
  real Figma icon navbars (PRs #144–#146), fixes the auth-state
  switching that never actually worked, wires the canonical mobile
  drawer, adds Clubs to the working nav, and resolves Decision Log #165.
  - **Icon nav**: 6 SVG assets exported from Figma `header 4` (2838:3502)
    — `nav-sports-hub`, `nav-blog`, `nav-community`, `nav-leaderboard`,
    `nav-bants`, `nav-clubs` in `src/assets/icons/` (+ `messages.svg`).
    Canonical order (from `header 4` / `header 7`): Sports Hub (`/sports-hub`)
    → Blog (`/news`) → Community (`/community`) → Leaderboard
    (`/leaderboard`) → Bants (`/banter`) → Clubs (`/clubs`). `navigation.ts`
    rewritten; `NavItem` now carries `icon` + `tinted` (Sports Hub / Clubs
    sit on a CSS green-tint tile — the other four bake it into the SVG,
    matching the frame).
  - **Auth-state switching** (`Header.tsx`, the actual bug this phase
    fixes): session read via `getStoredAccessToken()` (no `AuthContext`
    built — same call as every other converted page), re-derived on every
    navigation via `useLocation().key`. No session → icon nav + Login
    button (`header 7`). Session → icon nav + messages icon + avatar
    (`header 4`). Avatar opens the **desktop account dropdown**
    (Profile / Notification / Settings / Log out, from 2841:5363) on
    desktop viewports and the **canonical mobile Navigation Drawer**
    (5870:10689, Decision Log #162) on mobile — two different real
    overlays by design, picked by `useIsMobile()` (reads
    `window.innerWidth` at the 820px breakpoint; no `matchMedia`, so
    jsdom-testable). `Log out` (both overlays) calls
    `clearStoredSession()` + `navigate("/")`.
  - **Decision Log #165 RESOLVED**: `"Blog"` is the canonical label
    everywhere in `apps/web` code (nav label, drawer text, icon
    aria-label). The `/news` route path and `NewsPage.tsx` filename were
    left as internal identifiers by this PR — a fuller rename flagged as
    a larger separate change. **That rename is now done — see
    `sprint-2/blog-news-rename` below: `/news` → `/blog`, `NewsPage.tsx`
    → `BlogPage.tsx`, nothing named "news" remains for this pillar.**
  - **New judgment calls flagged (Build Plan Decision Log #166–#168, no
    code fix here)**: **#166** — `/messages`, `/notifications`,
    `/settings` have no route in `router.tsx`; those nav items (and the
    header messages icon) render non-navigating + visibly disabled
    (`aria-disabled`, "Not available yet") rather than linking to the 404
    page, per the brief. **#167** — the Figma dropdown's unread-count
    badge has no data source (no notifications API client); the
    Notification row renders with no number rather than a fake one.
    **#168** — the drawer/dropdown identity block (name, `@handle`,
    avatar photo) has no client-side source (token is `{ sub, role }`
    only); rendered as a generic "Signed in" row + plain avatar circle.
  - **New files**: `src/layout/{AccountDropdown,NavDrawer,useIsMobile}`
    (+ their CSS), `src/layout/Header.test.tsx` (Header / `navigation.ts`
    were genuinely untested before this — 13 new tests). **Verification**:
    `npx tsc --noEmit`, `npm run lint`, `npm run build` all clean;
    `npx vitest run` — **12 files / 79 tests, 0 failures** (up from 11/66
    — Header.test.tsx +13, no existing test changed); dev-server smoke
    test `/`, `/community`, `/clubs`, `/news`, `/login` all HTTP 200, no
    console errors. No real browser/Playwright check available — same
    ceiling as every prior `apps/web` PR.
- **`sprint-2/navdrawer-real-identity` (figma-to-code, 2026-09-03) closes
  Decision Log #168 — the mobile Navigation Drawer's identity block is
  now wired to real data. `apps/web` only.** Report:
  `docs/sprint-2-navdrawer-real-identity-report.md`.
  - `Header.tsx` fetches the signed-in user's profile **once per session**
    via `getUser(accessToken, decodeAccessToken(token).sub)` (the same
    real endpoint `ProfilePage.tsx` uses), keyed on the access token so a
    plain navigation does not refetch, and passes the result to
    `NavDrawer` as a `profile` prop. `NavDrawer` renders the real
    `displayName` + an initials avatar (`initialsFor`, a third small local
    copy of the `ProfilePage`/`PostCard` pattern).
  - **No `@handle`/username row** — `UserProfile` has no such field and
    there is no backend column (Decision Log #58); the Figma
    `@christine001` is decorative. Name renders as a single line.
  - **Pending fetch** → drawer opens immediately showing the existing
    generic "Signed in" fallback (fetch never blocks opening). **Failed
    fetch** → same fallback; navigation is never broken.
  - **Decision Log #166 / #167 explicitly NOT touched** — confirmed out
    of scope by founder decision (they are separate Sprint 3/6 Messaging /
    Notifications / Settings builds, not navbar follow-ups); their Status
    cells got a light-touch note saying so.
  - **New file**: none. `Header.test.tsx` +5 tests (real displayName on
    success; drawer opens + navigates while pending; generic fallback on
    fetch failure without breaking nav; fetch-once-per-token; never
    renders an `@` handle). **Verification**: `npx tsc --noEmit`,
    `npm run lint`, `npm run build` clean; `npx vitest run` — **12 files
    / 84 tests, 0 failures** (up from 12/79, no existing test changed);
    dev-server smoke test `/`, `/community`, `/clubs` all HTTP 200. No
    real browser/Playwright check available.
- **`sprint-2/blog-news-rename` (figma-to-code, 2026-09-03) completes
  Decision Log #165 — `apps/web` only, `services/api` NOT touched.**
  The founder's final call: "Blog" is the label AND the internal
  identifier for this content pillar, because the page is not
  news-specific — it's the general write-up section covering every
  content type, including sponsored articles for revenue. The
  user-facing "Blog" label (nav item + drawer item) was already correct
  from `sprint-2/navbar-phase-2-icon-nav-and-auth-state`; this PR renames
  the internal `/news` route path → `/blog` and `apps/web/src/pages/NewsPage.tsx`
  → `BlogPage.tsx` (`git mv`, component `NewsPage` → `BlogPage`, still a
  `PlaceholderPage` stub — not converted to a real screen). Updated:
  `router.tsx` (import + path + element), `navigation.ts` (both `to:`
  values + the DL #165 header comment), `Header.test.tsx` (three `/news`
  assertions). Grep confirms zero `NewsPage` / `/news` references remain
  in `apps/web/src` for this pillar (the unrelated "Trending News"
  sample sidebar in `CommunityPage.tsx` and `CommunityPage.css`, and the
  `content-ops` agent's generic "blog/news articles" phrasing, are
  different concepts and were left). `services/api` has no route/CORS/
  redirect reference to `/news`. Build Plan Decision Log #165 Status cell
  rewritten to start with "Resolved by the founder:". **Verification**:
  `npx tsc --noEmit` exit 0; `npx vitest run` — 12 files / 84 tests, 0
  failures; `npx vite build` exit 0.
- **`sprint-2/blog-sports-navbar-retrofit` (figma-design-system,
  2026-09-03) brings four legacy pre-redesign frames onto the canonical
  navbar and documents the Create Post overlay context — Figma design
  only, no app code (`BlogPage.tsx` / `SportsHubPage.tsx` are still
  `PlaceholderPage` stubs, so there is nothing to convert).** Full
  detail: `docs/sprint-2-blog-sports-navbar-retrofit-report.md`.
  - **Blog Page Desktop (`1009:128`)** — hand-built header hidden;
    instances `header 4` (visible, `5932:10661`) + `header 7` (hidden,
    `5932:10752`) added. **Blog Page Mobile (`41:4`)** — stale hamburger
    (`43:8`) + old logo (`359:493`) hidden; `header 4 — mobile` (visible,
    resized 428→375, `5932:10832`) + `header 7 — mobile` (hidden,
    `5932:10853`) added. Blog has one frame per breakpoint (unlike
    Sports' frame-per-auth-state), so each Blog frame carries both
    variants, logged-out hidden — Decision Log #169.
  - **Sports Page desktop** — confirmed `205:2` (logged-out) and
    `1009:673` (logged-in) are the **canonical** desktop
    Sports/Livescores frames (no newer replacement; the match-centre
    detail frames `632:943`/`640:3737`/`667:1952`/`756:11`/`756:6433`
    are a separate legacy set, out of scope). Old header chrome hidden;
    `205:2` → `header 7` (`5931:10492`), `1009:673` → `header 4`
    (`5931:10572`).
  - **Create Post compose frames (`5701:8328`, `5818:8962`,
    `5818:8997`)** — the brief's premise that `5818:9031` layers a sheet
    over a feed background was inaccurate: `5818:9031` is a standalone
    post-creation feed-state frame (mobile equivalent of desktop
    `2496:4462`) with a real `header 4 — mobile` navbar. The 3 compose
    frames correctly follow the file's `App Bar — Create Post` sub-view
    convention (same as `Community — Post View / Profile — Mobile`) and
    take no site navbar. Added canvas caption notes (`5933:10771/2/3`)
    above each naming the background screen (`5701:8239`) + navbar
    (`5386:6576`). `5818:9031` itself untouched. Decision Log #170.
  - 0 unbound / 0 off-palette / 0 `brand/green-tint-28` on every
    authored node (the 3 avatar `IMAGE` fills inside `header 4` /
    `header 4 — mobile` are pre-existing shared-component debt). New
    Decision Log candidates **#169–#171** (#171 = `Blog Page Mobile` is
    375px wide, non-canonical).
  - The Figma writes were produced by the `figma-design-system` agent
    (no shell that session); the branch, commit, docx Decision Log
    transcription (#169–#171, now live in Build Plan Section 9) and PR
    were finalised in a follow-up session with shell access (same
    pattern as PRs #98 / #102 / #110 / #130). No `apps/web` or
    `services/api` code touched. Not merged — founder's call after
    review.
- **`sprint-2/auth-pages-topbar` (figma-to-code, 2026-09-03) — the four
  core auth routes (`/login`, `/signup`, `/forgot-password`,
  `/reset-password`) now render under a logo-only "Top Bar — Soccernity"
  instead of the full site `Header`. `apps/web` only.** This resolves a
  long-standing Figma-vs-shipped-code conflict `LoginPage.tsx` /
  `AuthLayout.tsx` / `SignupSplitScreen.tsx` had each flagged since
  Sprint 1 as "pending human confirmation" — the founder confirmed these
  four screens get the same simple logo bar the Figma Guardian Consent /
  Verify Email / Club Picker frames already draw (spec pulled from the
  "Top Bar — Soccernity" component, Figma node `5146:6636`: 90px tall,
  `color/background/surface` fill, 1px `color/icon/inactive` bottom
  border, logo mark + "Soccernity" wordmark only). **Decision Log #172.**
  - **Approach: a pathless layout route, not a conditional inside
    AppShell.** New `apps/web/src/layout/AuthChrome.tsx` (renders
    `<AuthTopBar/>` + `<Outlet/>`) + `AuthTopBar.tsx`; `router.tsx` moves
    the four routes out of the `path: "/"` / `<AppShell>` tree into a
    sibling `element: <AuthChrome/>` route. Cleaner than a
    route-sniffing branch in AppShell (no `useLocation` string matching,
    the two chromes stay separate components) and avoids the negative-
    margin shell hack `ClubPickerStep.tsx` uses.
  - **`AuthChrome.__content` deliberately keeps AppShell's 32px content
    padding**, so `LoginPage.css` / `SignupSplitScreen.css` /
    `ClubPickerStep.css`'s existing `margin: -32px` full-bleed technique
    is untouched — only the chrome height changed (stale `84px` header-
    height math in those two files corrected to the real `90px`).
    `SignupSplitScreen.tsx` no longer draws its own wordmark lockup (it
    would double up under the Top Bar); `AuthLayout.tsx`'s "start below
    the Header as a stopgap" reasoning is rewritten as the now-intended
    layout. `/guardian-consent`, `/guardian-consent/confirm`,
    `/verify-email`, `/profile` are deliberately NOT changed — they stay
    under AppShell; their CSS cross-references to the old "AuthLayout /
    SignupSplitScreen already flag this" precedent were updated so no
    stale "still an open question" comment remains.
  - `LoginPage.tsx`'s "flag for human review" layout comment is rewritten
    to record the decision (matching `navigation.ts`'s `DECISION LOG
    #165` pattern). The separate *design-token* flag in `LoginPage.tsx`
    (indigo `#4F46E5` → navy/green mapping) is a different open question
    and was left.
  - **Verification**: `npx tsc --noEmit` exit 0; `npx vitest run` — **13
    files / 86 tests, 0 failures** (up from 12/84 — new
    `AuthChrome.test.tsx`, 2 tests; no existing test changed); `npx vite
    build` exit 0. Dev-server smoke test: `/login`, `/signup`,
    `/forgot-password`, `/reset-password` all HTTP 200. A temporary
    vitest spec (deleted before commit) mounted the real router at all
    four paths and confirmed each renders the Top Bar, no `Primary` nav,
    and zero `console.error`. No real browser/Playwright check available
    — same ceiling as every prior `apps/web` PR.
- **`sprint-2/blog-split-and-pinned-post-mobile` (figma-screen-builder,
  2026-09-04) splits the Blog section into one frame per auth state and
  builds the missing mobile "normal pinned post" feed screen — Figma
  design only, no app code (`BlogPage.tsx` is still a `PlaceholderPage`
  stub, so there is nothing to convert).** Figma writes by the
  `figma-screen-builder` agent (no shell that session); branch, commit,
  docx Decision Log transcription (#169–#171 forward-pointers + new
  #173–#176) and PR finalised in a follow-up session with shell access.
  Full detail: `docs/sprint-2-blog-split-and-pinned-post-mobile-report.md`.
  **Resolves Decision Log #169 and #171, closes #170's follow-up.**
  - **Task 1 — Blog split (DL #169).** `Blog Page Desktop` (`1009:128`)
    and `Blog Page Mobile` (`41:4`) each carried BOTH navbar variants
    (`header 4` visible + `header 7` hidden) on one frame — PR #151's
    compromise. Now one frame per auth state, matching Sports:
    **Blog Page Desktop — Logged In (`5953:10771`, `header 4`)**,
    **— Logged Out (`5953:11364`, `header 7`)**,
    **Blog Page Mobile — Logged In (`5956:10960`, `header 4 — mobile`)**,
    **— Logged Out (`5956:11331`, `header 7 — mobile`)**. Each carries
    exactly one navbar instance, visible; the opposite variant is
    **removed, not hidden** (Sports' convention). The dead already-hidden
    legacy header chrome PR #151 left in place was also dropped from the
    new frames (kept intact in the archived originals). Originals
    `1009:128` / `41:4` **archived** — hidden + `ARCHIVED — ` prefix
    (em-dash, the file's own 12-precedent convention, not the brief's
    hyphen — flagged). Blog section banner `5942:12065` widened to cover
    the new frames.
  - **Task 1 — 375→390 mobile reflow (DL #171).** Both new Blog mobile
    frames are **390px** (canonical), the 375px original archived.
    **Content column kept at 335px and re-centred (margins 28/27), NOT
    stretched to 350px** — widening the six legacy absolute-layout groups
    would distort the hero photos ~4.5% horizontally and re-wrap text; a
    true 350px column is a deliberate rebuild, flagged if wanted (report
    candidate G). Two real `use_figma` bugs hit and fixed mid-task, worth
    folding into the Figma-notes gotchas: (1) `frame.resize()` applies
    child **constraints** even on absolute-layout frames — GROUPs have no
    `constraints` property (their leaves do), so a widen silently drifts
    children; (2) a leaf's `.x` inside a GROUP is *frame*-relative, not
    group-relative. Both bad clones were deleted and rebuilt with exact
    geometry restoration.
  - **Task 2 — Community — Home Feed with Normal Pinned Post — Mobile
    (`5956:12797`)**, closing DL #170's follow-up. Desktop had two
    pinned-post feed-context variants (`2496:4462` contest / `2565:3951`
    normal); mobile had only the contest one (`5818:9031`). Built from
    `5818:9031` verbatim — same 390px, same navbar: **instance
    `5956:12798` → component `5386:6576` (`header 4 — mobile`), in set
    `2824:4309`, identical to `5818:9031`'s** (a feed *state*, not a
    compose sub-view, so it takes the site navbar). The only real
    difference between the desktop normal and contest feed variants is
    the pin-badge label (confirmed by walking both subtrees, not assumed)
    — the badge went `Contest post` → **`Pinned post`** (leading-space
    `" post"` on desktop `2565:3951` is a truncated-looking label; used
    the clean string on the new frame, left desktop alone — DL #173,
    same shape as DL #92). **0 unbound / 0 off-palette** on this frame.
  - **Paint audit:** 0 `brand/green-tint-28`, 0 new colours, 0 overlaps
    everywhere. The pinned-post frame is fully clean; the four Blog
    frames carry 40 (desktop) / 6 (mobile) inherited `#d9d9d9` paints —
    **cloned, not authored**, deliberately left. This surfaced that
    PR #111's "Blog is token-clean" was incomplete (**DL #174**),
    including one *visible* defect: an unlabelled 294×67 grey pill in the
    desktop Blog footer (`5953:11228` / `5953:11821`), where mobile has a
    "Soccernity." wordmark — likely a missing wordmark placeholder.
  - **New Decision Log candidates #173–#176** (transcribed to Build Plan
    Section 9 in this PR): #173 (badge copy divergence desktop vs mobile),
    #174 (Blog-section `#d9d9d9` debt + the visible footer pill), #175
    (pre-existing 7px headline/body collision in Blog mobile article
    cards — proven inherited, byte-identical geometry to the archived
    375px original), #176 (`Articles Page Desktop` `54:434` / `Articles
    Page mobile` `87:80` — same Blog section, never navbar-retrofitted,
    mobile still 375px — need the same split treatment).
  - Not merged — founder's call after review.
- **`sprint-2/admin-panel-structural-pass` (figma-design-system,
  2026-09-04) was briefed as a coordinated 6-item Admin Panel structural
  pass (Decision Log #49/#50/#51/#53/#146/#147/#151); it landed **Item 6
  only** and delivered a full executable plan + 29-screen inventory for
  the rest. Figma design only, no app code.** Report:
  `docs/sprint-2-admin-panel-structural-pass-report.md`. Figma writes by
  the agent (no shell); branch/commit/docx/PR finalised in a follow-up
  session.
  - **Item 6 — Calendar token retrofit (DONE, DL #53 partially
    resolved).** The `calendar 2` variant (`2365:2034`) of `Calendar for
    scheduled task` (`2365:2033`) — the *only* variant instanced anywhere
    in the file, on `Contest - Schedule Task` (`5403:6753`) — is fully
    token-bound: 66 paints rebound to `Soccernity Theme` Light tokens
    (`color/text/primary` / `secondary` / `on-navy`, `brand/navy`,
    `color/icon/inactive`, `color/background/surface`), audit after
    **103 bound / 0 unbound-visible**. 5 paints deliberately left unbound
    and disclosed: 4 `opacity:0` adjacent-month day numerals + 1 frosted
    90%-white panel — a bound paint takes the *token's* alpha, which made
    the invisible days visible; reverted to exact originals. Verified via
    isolated + in-context screenshots, no layout shift. The un-instanced
    `calendar 1` variant (`2363:2242`) is still unbound — **DL #178**.
  - **Items 1–5 — planned, NOT executed.** The agent judged the Admin
    Shell componentization (Item 2) a ~45–55-call structural refactor
    across 29 heterogeneous screens (2 shell topologies, 4 frame heights)
    with real content-clipping risk, and Items 1/3/4/5 all depend on it —
    the same reason PRs #102/#110/#130/#131 were each their own focused
    pass. **Founder confirmed: dispatch Item 2 as its own dedicated
    session, then 1/3/4/5 + #178 as its fast-follow (DL #180).** The
    executable build+swap plan (component model: 10-variant `Active` set +
    `Show Action Button` boolean + `Action Label` text prop) and the full
    29-screen inventory are in the report §2 / §7.
  - **Founder picks made so the #180 session doesn't re-stall:** icons
    (**DL #179**) — Moderation `el:ban-circle` → **`carbon:gavel`**,
    Contest pennant → **`carbon:trophy`**, Users `fi:A_users` →
    **`carbon:user--multiple`** (also closes **DL #147**), Articles →
    `carbon:document`, rest per report §1.2. Frame-height rule
    (**DL #177**) — **1184px is a FLOOR, not a hard clamp**: grow the 16
    screens at 1024 up to 1184; `Admin — Appeal Review` (1234) and
    `Admin — Create Competition` (1530) stay at their content-driven
    heights, nothing forced shorter.
  - **New Decision Log candidates #177–#180** (transcribed to Build Plan
    Section 9; forward-pointers appended to #49/#50/#51/#53/#147/#151).
    #146 unchanged (already resolved by PR #131).
  - Not merged — founder's call after review.
- **`sprint-2/design-cleanup-tokens-renames` (figma-design-system,
  2026-09-04) — housekeeping: legacy-frame deletion, the first
  shadow/elevation token, a nav rename, and a Decision Log status-word
  sweep. Figma design only, no app code.** Figma writes by the agent (no
  shell); branch/commit/docx/PR finalised in a follow-up session. Report:
  `docs/sprint-2-design-cleanup-tokens-renames-report.md`.
  - **Archived Message frames deleted (DL #114, now Resolved).** The 4
    `ARCHIVED —` legacy Message frames (`1871:2762`, `2025:8112`,
    `2067:3006`, `2067:3176`) were reference-checked across all ~110k
    nodes on page `0:1` (prototype reactions, derived instances,
    overlay/scroll targets) and deleted. Only inbound reference was an
    archived→archived prototype link, deleted with them. The 6 canonical
    Message frames are untouched. The 5 archived Community mobile frames
    are still archived (out of scope here).
  - **First shadow/elevation token (DL #118, now Resolved).** New COLOR
    variable **`color/shadow/elevated`** (`Soccernity Theme`,
    `VariableID:5973:2` — Light `brand/navy` #282E65 @ 14%, Dark
    `#0D0F21` @ 45% = the existing `color/background/page` Dark value,
    scope `EFFECT_COLOR`) + effect style **`elevation/menu`**
    (`DROP_SHADOW` x0 y4 blur16 spread0, colour bound to the variable).
    A true FLOAT/EFFECT variable for the geometry was rejected — only
    blur/offset/spread bind to FLOAT vars, which the COLOR-only
    collection doesn't have. **The `Soccernity Theme` collection is now
    14 COLOR variables** (13 → 14). Applied to: Message Actions Menu
    (`5706:8270`, the fake 1px `color/icon/inactive` shadow-border
    removed); the 4 account-dropdown menu components (`2841:5361`,
    `2841:5363`, `5685:9300`, `5685:9312` — 20 per-row `DROP_SHADOW`s
    rebound off `#000000` @ 25%); `Banter post menu setting`
    (`2459:10077`); the Competition-selector study menu (`5176:6659`).
    Left intact + flagged: the date-picker 4-layer `#130A2E` panel
    shadows (a single bound colour would flatten the ramp — **DL #182**);
    the drawer panel `5870:10692` (no elevation at all — **DL #183**);
    the account-dropdown per-row (vs container) shadow structure
    (**DL #181**); the `calendar 2` `#969696` shadow (folded into the
    **DL #178** calendar-retrofit session).
  - **Bants/Banter nav rename (DL #163 remaining half, now fully
    Resolved).** Nav chrome only: `banter` → **`Bants`** (`2838:3560`,
    `header 4`, propagates to ~60 instances) and `Group 831` → **`Bants`**
    (`2841:4158`, `header 7`). Drawer already read "Bants"; mobile
    navbars carry no content-nav row. Content-section "Banter…" frames
    (Banter homepage, Banter Rooms, the `Filter Tabs (All / My Bants)`
    component, etc.) deliberately untouched — same scoping precedent as
    the Blog/News rename (**DL #165**). `header 7`'s other generically
    named nav items (`Group 833` Sports Hub, `Group 830` Blog) flagged
    as **DL #184**.
  - **Decision Log status-word sweep.** 16 rows whose Status still began
    "Open" despite carrying full resolution/supersession text later in
    the cell had the leading word corrected to **Resolved** (#97, #102,
    #103, #110, #114, #118, #137, #146, #153, #155, #156, #158, #168) or
    **Superseded** (#93, #96, #160) — same stale-prefix bug #165 had
    before it was fixed; only the leading word changed, resolution text
    untouched. **#155/#156** (persistent Clubs page + navbar entry point)
    corrected the same way from earlier navbar work. **#163** reworded to
    close both halves. **Two founder confirmations written fresh:**
    **#159** — the shield/club-crest Clubs navbar glyph is final, no
    further glyph exploration (the shared-icon-library question stays
    open under DL #49/#179); **#149** — the mobile H2H/Standing
    navy-for-draw / green / `semantic/alert` scheme is canonical, desktop's
    off-palette amber is now the flagged deviation.
  - **New Decision Log candidates #181–#184** (transcribed to Build Plan
    Section 9); forward-pointers appended to #114/#118/#163/#178.
  - Not merged — founder's call after review.
- **`sprint-2/bants-mobile-categories-view` (figma-screen-builder,
  2026-09-04) builds the one net-new screen that closes Decision Log
  #144 — the second Bants mobile categories-view state. Figma design
  only, no app code (Bants has no backend; `/banter-rooms*` is unbuilt
  Sprint 3 work — `figma-to-code` must not wire this screen to data).**
  Report: `docs/sprint-2-bants-mobile-categories-view-report.md`.
  - **New frame: `Bants — Search Filter (Categories) — My Bants —
    Mobile` (`5980:10881`)**, 390×758, in the Bants mobile row. Navbar
    instance **`5980:10882` → component `5386:6576` (`header 4 —
    mobile`)** — matches `5650:8221`'s and `5650:8161`'s own navbar
    (logged-in variant; "My Bants" is authenticated by definition).
  - **Built by cloning `5650:8221`** (mobile Search Filter Categories)
    and swapping to the My Bants state: the `Filter Tabs` instance
    (`5980:10912`) moved via `setProperties` to variant `2459:4839`
    (My Bants active — the same variant `5650:8161` uses), and the list
    replaced with clones of the two canonical user's-own rows from
    `5650:8161`. Desktop reference `2459:12447` was investigated —
    it renders near-blank because a full-bleed 100%-opaque white
    rectangle occludes the page under the Filter dialog; diffing it
    against sibling `2459:10083` showed **the only real delta is which
    Categories pill is selected**, so the mobile delta is
    correspondingly narrow. No copy / label / count / empty state
    invented. Not reproduced: the modal presentation (`5650:8221`
    already flattens the identical dialog inline), Date/Tag fields (they
    live on `5803:8876` — mobile splits the desktop modal into a filter
    *panel* and a *results* screen, **DL #187**), and the desktop's 12
    lorem placeholder rows.
  - **Paint audit:** 62 paints / 61 bound / **1 unbound** (the shared
    navbar-instance avatar `IMAGE` fill, known-acceptable) / 0
    off-palette / 0 `brand/green-tint-28` / 0 new colours. 0 overlaps.
  - **DL #144 fully closed on the design side** — every desktop Bants
    frame now has a mobile counterpart (full mapping in the report §6).
    Still open, not closed by this: Bants *desktop* debt — **DL #185**
    (both desktop "search filter — categories" frames occlude their own
    page with an opaque white scrim), **DL #186** (the desktop filter
    dialog's divider `2459:14472` still carries unbound `#034694`
    club-crest blue — outside PR #99's sweep), plus pre-existing #98.
    Both #185/#186 recommended for a scoped `figma-design-system` pass.
  - **New Decision Log candidates #185–#187** (transcribed to Build Plan
    Section 9); forward-pointer appended to #144.
  - Not merged — founder's call after review.
- **`sprint-2/create-post-contest-tab-states` (figma-design-system,
  2026-09-04) designs both visibility states of the Create Post
  mode-tab row, closing Decision Log #148. Figma design only, no app
  code (the runtime condition depends on the Contest data model, which
  doesn't exist yet — nothing here is buildable in code today).** Report:
  `docs/sprint-2-create-post-contest-tab-states-report.md`.
  - **The founder's decision (#148): the tab row's visibility is driven
    by whether an ACTIVE CONTEST currently exists** — not by which
    composer mode the user has selected. Not a user-controlled toggle.
  - **Active-contest state: `Community — Create Post — Mobile — Active
    Contest` (`5982:10905`)** — clone of base `5701:8328`, no visible
    content change (tab row present, "Create a Post" active, exactly as
    already built), given its own independent identity as "what renders
    when a contest is active."
  - **No-active-contest state: `Community — Create Post — Mobile — No
    Active Contest` (`5982:10932`)** — clone of `5701:8328` with the
    Mode Tabs row **genuinely removed** (real deletion, not hidden or
    disabled); the frame's own VERTICAL auto-layout reflowed Content up
    with zero dead gap, hugging the frame from 457px down to 402px —
    verified via before/after screenshots.
  - **Caption note per frame** (`5982:10959` on the active-contest frame,
    `5982:10960` on the no-active-contest frame), matching the exact
    style of the Create Post overlay-context notes from
    `sprint-2/blog-sports-navbar-retrofit` (`5933:10771–3`) — both state
    plainly that "is there an active contest right now?" has no backend
    to run against (no Contest/Competition entities/endpoints exist in
    `services/api`) and is **NOT YET BUILDABLE**.
  - **Paint audit**: active-contest subtree 23/23 bound; no-active-contest
    subtree 18/18 bound; both caption notes 1/1 bound. **0 unbound, 0
    off-palette, 0 `brand/green-tint-28`, 0 new colours** across
    everything authored.
  - **New Decision Log candidate #188**: the active-contest check itself
    has no data source — same category of gap as #157/#70–#73/#134,
    flagged as its own line item so `figma-to-code` has one canonical
    entry to check before ever attempting to wire this condition. Open,
    blocked on the Contest/Competition data model.
  - Forward-pointer appended to **#148**'s Status cell in Build Plan
    Section 9; new row **#188** added.
  - Not merged — founder's call after review.
- **`sprint-2/admin-console-account-entity` (backend-api, 2026-09-04)
  gives the Admin Console a genuinely separate account/auth/profile data
  model, resolving Decision Log #54 — `services/api` only, no Figma/
  `apps/web` code touched.** Report: `services/api/src/modules/admin/README.md`.
  - **A real finding, not assumed: `AdminUser` already existed.** #54's
    own framing ("an admin-account data model that does not exist") was
    not quite accurate — `AdminUser` was already one of Section 3's
    original 20 entities (`Article.authorAdmin`'s target), but only
    carried `{id, email, role, articles}`, nowhere near enough to log an
    admin in or back the real "Full name / Email / Role / Phone" Admin
    Profile screen. **Decision: extend `AdminUser` in place** (new
    `passwordHash`, `fullName`, `phone`, `accountStatus` — mirroring
    `User.accountStatus`'s `"active"`/`"deactivated"` string-enum
    convention — `createdAt`, `updatedAt`), rather than inventing a
    second, competing `AdminAccount` model — `Article.authorAdmin`
    already points at this name and Section 3 already spec'd it under
    this name. Migration: `20260904175008_extend_admin_user_for_admin_console`,
    applied cleanly to both dev and test databases.
  - **Genuinely separate login/session path, not `User`+role** — the
    task's own hard requirement. New `AdminTokenService`/
    `AdminRefreshTokenStore`/`AdminJwtAuthGuard` mirror
    `TokenService`/`RefreshTokenStore`/`JwtAuthGuard`'s shape and Section
    5.7's security posture, but never share an instance, a signing
    secret, or a Redis key namespace with the User-facing versions: own
    `JwtService` keyed on `ADMIN_JWT_SECRET` (never `JWT_SECRET` — the
    actual cryptographic proof of isolation), an `aud: "admin-console"`
    discriminator claim as defense-in-depth, and a disjoint
    `admin:refresh:*` Redis namespace (vs. `auth:refresh:*`). Only
    genuinely generic, stateless pieces are reused: `PasswordService`
    (its own separate provider instance), the plain-`Error`
    refresh-token-failure classes, `RedisModule`/`AuthRateLimitModule`
    (both already multiply-imported infra), and the DTO shapes
    (re-exported under `Admin*` names). **The motivating reason this
    matters, not a hypothetical**: `schema.prisma`'s own comment on
    `User.role` has always listed `"admin"` as a theoretical value, even
    though no endpoint has ever set it (confirmed by grep) — a shared
    signing secret would have meant a future bug ever setting
    `User.role = "admin"` could forge a valid-looking admin session
    purely by role string, with nothing structurally preventing it. The
    separate secret closes that off completely.
  - **Endpoints**: `POST /admin/auth/login` (no guard, `@AuthRateLimit()`,
    same non-enumeration/dummy-hash posture as `POST /auth/login`),
    `POST /admin/auth/refresh` (no guard), `POST /admin/auth/logout` (no
    guard, optional bearer for `allSessions`), `POST
    /admin/auth/change-password` (`AdminJwtAuthGuard`, requires current
    password, revokes every other session on success), `GET
    /admin/profile` / `PATCH /admin/profile` (`AdminJwtAuthGuard` — PATCH
    edits `fullName`/`phone` only, `role`/`email`/`accountStatus` are
    never self-editable, rejected outright by the global
    `ValidationPipe`'s `forbidNonWhitelisted`).
  - **Cross-authentication proven impossible in both directions, not
    just argued** — new `test/admin-auth-isolation.e2e-spec.ts` boots the
    real, unmocked `AppModule` against real Postgres/Redis and confirms:
    a real User access token is rejected by every
    `AdminJwtAuthGuard`-protected route; a real admin access token is
    rejected by `JwtAuthGuard`-protected User routes; a real User refresh
    token is rejected at `/admin/auth/refresh`; a real admin refresh
    token is rejected at `/auth/refresh`.
  - **Verified, all re-measured directly, not estimated**: mocked suite
    **35 → 42 suites / 419 → 481 tests, 0 failures**; e2e suite
    **8 → 9 suites / 58 → 65 tests, 0 failures**; `nest build` and
    `npm run lint` both clean. **`User`'s safeguarding fields
    (`isMinor`/`guardianId`/`consentStatus`/`consentToken`/
    `consentTimestamp`) confirmed untouched** — the schema diff touches
    only `AdminUser`.
  - **Still unbuilt, unchanged by this PR**: Section 4.8's
    moderation-queue endpoints (Report review, appeal handling — Decision
    Log #138's "a second admin/moderator reviews an appeal" rule still
    has no code to attach to) remain Sprint 5 scope.
  - **New Decision Log candidates #189–#193** (all in
    `modules/admin/README.md`, transcribed to Build Plan Section 9 in
    this finalising session): **#189** Section 4.8's moderation-queue
    endpoints still unbuilt (unchanged scope, tracked so it isn't
    rediscovered); **#190** no admin-specific rate limit beyond the
    shared `'auth'` bucket; **#191** no self-service admin/moderator
    registration endpoint — accounts are provisioned via direct DB
    insert by design, bootstrapping the first admin is a real, unresolved
    access-control question; **#192** email is read-only via `PATCH
    /admin/profile` (judgment call, mirrors `UpdateUserDto`'s precedent);
    **#193** `AdminUser.accountStatus` has no endpoint that writes it yet
    (parked for future admin-management work).
  - Forward-pointer appended to **#54**'s Status cell in Build Plan
    Section 9.
  - Not merged — founder's call after review.
- **`sprint-2/verify-email-consent-status-field` (backend-api,
  2026-09-04) adds `guardianConsentStatus` to `POST /auth/verify-email`'s
  response, resolving the backend half of Decision Log #38 — `services/api`
  only, `apps/web` untouched.** Report: `services/api/src/modules/auth/README.md`'s
  matching status-update entry.
  - **New response shape, additive**: `{ verified: true, userId,
    guardianConsentStatus }` — `guardianConsentStatus` is `'not_applicable'`
    (not a minor, or a minor with a missing `Guardian` row — a
    data-invariant case, not a real product state), `'pending'`, or
    `'confirmed'`. `verified`/`userId` unchanged.
  - **Reused, not reinvented**: sourced from
    `GuardianConsentService.getConsentStatusForUser()` — extracted out of
    the exact method `GET /auth/guardian-consent/status` itself already
    used internally (made `public`, not duplicated), so there is exactly
    one place in the codebase that queries `Guardian`-by-`minorUserId` and
    shapes the result. `GuardianConsentModule` now `exports:
    [GuardianConsentService]`; `AuthRegistrationModule` imports it —
    cross-module DI, no circularity (neither module imports the other,
    confirmed in both modules' own comments). Typed as a plain `string`,
    mirroring `GuardianConsentStatusResponse.consentStatus`'s own existing
    convention, so a future value (e.g. a Decision Log #34 `'declined'`
    state) doesn't need a type change here too.
  - **Verified, re-run independently in this session**: mocked suite
    **42 suites / 481 tests → 42 suites / 489 tests, 0 failures** (8 new);
    e2e suite **not re-run** (no files under `test/` touched — a plain
    `findUnique`-backed enrichment, no raw SQL/transaction/novel relation,
    matching the existing no-e2e precedent already set for `GET
    /auth/guardian-consent/status` itself); `nest build` and `npm run
    lint` both clean. **`User`/`Guardian` safeguarding fields
    (`isMinor`/`consentStatus`/`consentToken`/`consentTimestamp`)
    confirmed untouched — zero `schema.prisma` diff.**
  - **NOT resolved by this PR**: the frontend half.
    `VerifyEmailPage.tsx` does not yet branch on this new field — #38's
    "should a pending-consent minor see a different post-verification
    view" question is now unblocked, not closed. A future `'declined'`
    `consentStatus` value's display here (pass through vs. collapse into
    `'pending'`) is also left open, flagged in
    `registration.service.ts`'s own comment.
  - Forward-pointer appended to **#38**'s Status cell in Build Plan
    Section 9.
  - Not merged — founder's call after review.
- **`sprint-2/verify-email-support-and-consent-view` (figma-to-code,
  2026-09-04) closes out three related, previously-open Verify Email /
  auth-flow items — Decision Log #37, the frontend half of #38, and #40
  — `apps/web` only.** Depended on `sprint-2/verify-email-consent-status-field`
  (merged first).
  - **#37 — real support destination.** The founder confirmed
    `support@soccernity.com`. "Contact support" on both the Link Invalid
    Or Expired and Missing Token states is now a real, enabled
    `mailto:support@soccernity.com?subject=Email%20verification%20help`
    link (plain subject prefill only, no body, per the task's own "keep
    it simple" brief) — replacing the disabled placeholder button and its
    explanatory tooltip. Test coverage confirms the link is real and
    enabled on both states.
  - **#38 (frontend half) — distinct pending-consent-minor view.**
    `VerifyEmailPage.tsx` now branches on the real, additive
    `guardianConsentStatus` field: a minor whose status is `'pending'`
    renders a genuinely distinct `verified-pending-consent` state — own
    heading ("Email verified — approval still pending"), own three-item
    explanation list, CTA linking to `/guardian-consent` — never the
    ordinary Verified state's "you're all set" framing or its `/profile`
    CTA. **Figma checked directly before building anything**
    (`get_design_context` on "Verify Email — 2 Verified", `5143:6648`):
    confirmed it renders one single generic Verified layout with no
    consent-status branch anywhere — no dedicated frame exists for this
    state (matching PR #107's own prior finding that this was left
    founder-blocked/never-designed). **Built as a CONSERVATIVE INTERIM
    DESIGN, explicitly flagged as such in a code comment** — reuses the
    ordinary Verified state's icon/card/button CSS scaffolding (the email
    genuinely was verified) but with entirely distinct copy, never
    claiming full access. Should be replaced wholesale, not patched, if a
    real Figma frame for this state is ever designed.
    `apps/web/src/api/auth.ts`'s `VerifyEmailResponse` gained
    `guardianConsentStatus: string`, mirroring the backend's
    `VerifyEmailResult` type exactly.
  - **#40 — ClubPickerStep text fixes.** Button: `"Load more clubs"` →
    **`"Load more"`**, matching Figma. Empty-state message split into two
    real, distinct cases: catalogue-genuinely-empty (`clubs.length ===
    0`, regardless of filter) now reads **`"No clubs available yet."`**
    — sourced verbatim from the real Figma "Club Picker — 6 No Clubs
    Available Yet" frame built for Decision Log #137
    (`sprint-2/decision-log-133-137-followup`), quoted directly from that
    PR's own report since no node ID was recorded there for a fresh
    Figma re-read — and the original **`"No clubs match that filter."`**
    kept for the genuine filter-matched-nothing case
    (`visibleClubs.length === 0` but `clubs.length > 0`).
    `ClubPickerStep.test.tsx` updated with no stale assertions left on
    either the old button text or the old single empty-state message.
  - **Verified, re-run independently in this session**: `npx tsc
    --noEmit` exit 0; `npx vitest run` **13 files / 86 → 92 tests, 0
    failures**, exit 0; `npx vite build` exit 0, clean bundle; `npm run
    lint` exit 0.
  - Forward-pointers appended to **#37**, **#38**, and **#40**'s Status
    cells in Build Plan Section 9.
  - Not merged — founder's call after review.
- **`sprint-2/blog-badge-token-collision-fixes` (figma-design-system,
  2026-09-04) fixes three issues on the four existing Blog frames from
  `sprint-2/blog-split-and-pinned-post-mobile` — `5953:10771` (Desktop,
  Logged In), `5953:11364` (Desktop, Logged Out), `5956:10960` (Mobile,
  Logged In), `5956:11331` (Mobile, Logged Out). Figma design only, no
  app code.**
  - **#173 — pinned-post badge copy, resolved.** Desktop node
    `2565:4178` (inside `2565:3951`) confirmed to read `" post"` (leading
    space, verified before editing) and fixed to **`"Pinned post"`**,
    matching the sibling `"Contest post"` badge and the mobile frame
    `5956:12797`'s own already-correct label. Independently re-verified
    via screenshot in this finalising session.
  - **#174 — Blog-section `#d9d9d9` token debt, resolved for the 4 named
    Blog Page frames only.** Re-audited directly: **92** `#d9d9d9` paints
    found (not the ~46 estimated in the brief); **90** are image-backing
    placeholder plates, rebound to `brand/green-tint` (resolving the
    token's real RGB/alpha before binding, per this file's own gotcha) —
    the PR #128 precedent. The remaining **2** are the visible 294×67
    footer pill (one in each desktop frame's own footer group) —
    confirmed by the founder to be a missing wordmark, not decoration —
    **deleted and replaced with a real "Soccernity." text node**, styled
    from the mobile footer's own wordmark (Montserrat ExtraBold, bound to
    `color/text/on-navy`), scaled 15px → 30px matching this page's
    established 2x mobile→desktop type-scale ratio. **Final re-audit: 0
    unbound/off-palette paints remain in any of the 4 frames** —
    independently re-confirmed via screenshot (clean white-on-navy
    "Soccernity." wordmark, correctly centered) in this finalising
    session. **Still open, out of this PR's scope**: the 5 `#d9d9d9`
    paints on Articles Page Desktop (`54:434`) and 4 on Articles Page
    mobile (`87:80`) that #174's own Decision-needed text also named —
    only the 4 Blog Page frames were in scope here.
  - **#175 — text collision fix, resolved.** Fixed on all **36** affected
    article-row instances across both mobile frames (18 per frame — 6
    sections × 3 secondary cards each), found systematically rather than
    just the first instance. Confirmed each headline/body pair's parent
    is a plain `GROUP` (not auto-layout) before choosing a fix, per this
    file's own gotcha about auto-layout children silently overriding
    manual `y` edits. Fix: each instance's body-copy `y` set to exactly
    `headline.y + headline.height` — every instance had exactly a 7px
    overlap before and 0px after. Available vertical space in this legacy
    layout is tight, so headline/body now sit flush rather than with
    extra breathing room — a bigger layout change was judged out of
    scope. Independently re-verified via screenshot (three visible
    article cards, no overlap) in this finalising session.
  - Forward-pointers appended to **#173**, **#174**, and **#175**'s
    Status cells in Build Plan Section 9.
  - Not merged — founder's call after review.
- **`sprint-2/articles-page-split-and-navbar` (figma-screen-builder,
  2026-09-04) gives Articles Page the identical treatment
  `sprint-2/blog-split-and-pinned-post-mobile` gave Blog Page, resolving
  Decision Log #176 — net-new frame creation, correctly routed to
  `figma-screen-builder`, Figma design only.**
  - **Four new frames, one navbar instance each, visible**: `Articles
    Page Desktop — Logged In` (`5997:10905`, `header 4` /
    `2838:3502`) and `— Logged Out` (`5997:11224`, `header 7` /
    `2841:4104`), both 1440×4657; `Articles Page Mobile — Logged In`
    (`6000:11346`, `header 4 — mobile` / `5386:6576`) and `— Logged Out`
    (`6000:11377`, `header 7 — mobile` / `5386:6575`), both genuinely
    **390px** (Decision Log #86). Placed continuing the Blog row at the
    same y baseline with the row's established 200px gap, zero overlaps.
    **Independently re-verified via screenshot in this finalising
    session** — `header 4`/`header 7` render the correct logged-in
    (messages icon + avatar) / logged-out (Login button) chrome on
    desktop, and `header 4 — mobile`/`header 7 — mobile` do the same on
    mobile.
  - **Mobile reflow deliberately used a different method than Blog's own
    pass, for a stated, evidence-based reason**: a throwaway drift test
    proved Blog's `frame.resize()` approach would corrupt this specific
    content (188/278 nodes drifted, one SCALE-constrained vector nested
    in a top-level GROUP actually stretched) — so content was
    **reparented into a fresh 390px shell** instead (cloning preserves
    internal geometry exactly; cross-frame `appendChild` doesn't trigger
    constraint resolution), verified with zero geometry mismatches. The
    reflow *result* still matches Blog's own approach: content column
    kept at 335px, shifted uniformly +8px (margins 28 left / 27 right).
  - **A real brief-premise error was caught, not followed blindly** —
    logged as **Decision Log #194**. The task brief described mobile's
    legacy chrome as "a legacy `Group 103` logo lockup"; this was wrong.
    The real logo lockup is `Group 102` (`359:503`); the nodes actually
    named `Group 103` are **content** (`384:3`, the Login-via
    social-icon row; `437:3022`, the footer Soccernity wordmark
    instance) that must not be deleted. Following the brief literally
    would have deleted the footer wordmark. **Independently re-verified
    via raw node metadata in this finalising session**: both real
    content nodes survive on the new mobile frames (`437:3022`'s
    equivalent instance correctly repositioned +8px), and only the
    actual logo lockup was removed.
  - **Legacy chrome removed (not hidden), matching Blog**: desktop
    `Group 7` (a live, still-visible "Home / Community / Livescores /
    About Us" text nav, flagged as **Decision Log #196** — distinct from
    `Header/header 5`, already archived in PR #147, meaning this frame
    was live-rendering off-canon navigation right up until this PR) plus
    its own logo lockup; mobile `bx:menu` hamburger plus `Group 102`.
  - **`54:434` and `87:80` archived, not deleted** — hidden +
    `ARCHIVED — ` (em-dash) prefix, all children intact. **Independently
    re-verified via raw node metadata in this finalising session.**
    Reference check before archiving: scanned all ~110k nodes on page
    `0:1` for prototype reactions or derived instances targeting either
    node — zero found for both.
  - **New Decision Log candidates #195, #197, #198** (all flagged, none
    fixed, out of this task's scope): #195 — the Blog/Articles section
    banner (`5942:12065`) doesn't yet cover the four new frames (~5,620px
    short); #197 — naming question, whether these should be renamed
    `Blog — Article Detail — Logged In/Out` rather than `Articles
    Page ...`, since Blog Page is the section's index/listing and these
    are single-article detail pages; #198 — desktop top whitespace
    (221px navbar-to-content gap, inherited unchanged from the original,
    vs. Blog Desktop's own 81px).
  - Forward-pointer appended to **#176**'s Status cell; new rows
    **#194–#198** added, in Build Plan Section 9.
  - Not merged — founder's call after review.
- **`sprint-2/admin-shell-componentization` (figma-design-system,
  2026-09-04) does Item 2 ONLY of the coordinated Admin Panel structural
  pass, dispatched as its own dedicated session per Decision Log #180 and
  the prior `sprint-2/admin-panel-structural-pass` report's explicit
  recommendation. Figma design only, no app code.** Report:
  `docs/sprint-2-admin-shell-componentization-report.md`. Figma writes by
  the agent (no shell); branch/commit/docx/PR finalised in a follow-up
  session.
  - **Admin Shell componentization is DONE.** One `COMPONENT_SET` named
    "Admin Shell" (`6014:12948`), parked off-canvas, replaces the old
    7-loose-node shell (2 topologies — 17 GROUP-wrapped screens at
    655px nav block / SPACE_BETWEEN, 12 loose-FRAME screens at 806px nav
    block / MIN) across **all 29** Admin Panel screens. 10-value `Active`
    variant property (Dashboard / Articles / Users / Moderation /
    Categories / Contest / Competitions / Media / Settings / None), plus
    `Show Action Button` (boolean) and `Action Label` (text) component
    properties. Internal constraints (sidebar wash STRETCH, nav block
    STRETCH + internal SPACE_BETWEEN so the nav list stays top-anchored
    and Settings stays bottom-pinned, everything else MIN) tested at
    1024px and 1530px before the swap — confirmed to support all 4 real
    frame heights in use (1024/1184/1234/1530) with no per-screen rework.
  - **Every one of the 29 screens' content geometry verified
    byte-identical before vs. after the swap, with zero deviation** — no
    screen needed a fix. A separate final structural audit confirmed
    exactly one clean instance and zero stray old-shell nodes on every
    screen. Each instance faithfully replicates that screen's own
    pre-existing `Active`/button state (live-read at swap time, not taken
    from the prior report's Item 5 KEEP/LOSE *recommendations*, which
    describe a not-yet-executed future state) — **no button
    visibility/label was changed anywhere in this pass**, and **no
    screen's height was changed** (Item 3 remains a separate follow-up).
    Icon glyphs and labels were not touched, including the reference
    screen's own pre-existing empty/invisible icon bugs (`fi:A_users`,
    `el:ban-circle` — Decision Log #147/#179 territory, correctly left
    for Item 1).
  - **A new, previously-undocumented Figma rendering bug was found and
    fixed mid-build (Decision Log #199).** A paint bound to a variable
    that does not itself carry alpha (`brand/navy`, a plain opaque RGB)
    combined with a separate fractional paint-level opacity silently
    resets to `opacity: 1` specifically at `createInstance()` time — a
    sharper, new finding than this project's existing "a bound paint
    takes its alpha from the variable" gotcha, which only described
    `setBoundVariableForPaint()`-time behavior. Found on the sidebar wash
    (`Rectangle 223`, originally a 12%-opacity `brand/navy` tint,
    rendering solid navy on every instance); fixed on all 10 variants by
    using a literal unbound paint at the same resolved value/opacity —
    same visual result, no new colour. Alpha-carrying tokens
    (`brand/green-tint`, `color/text/secondary`) were confirmed
    unaffected by the same bug. File-wide audit for other occurrences of
    this pattern is flagged, not attempted.
  - **Two discrepancies against the prior report/brief found and
    flagged, not silently resolved**: `5569:7813` (Admin — Competition
    Created (Success)) was listed as one of "4 scrim screens" but has no
    `Scrim` node at all — swapped with the generic (non-scrim) procedure,
    passed normally. The 3 Moderation screens (`5794:8635`, `5796:8635`,
    `5796:8753`) currently show their action button as visible, labelled
    "Add Member" (leftover from whatever screen they were originally
    cloned from) — contradicting the prior report's "no primary action
    today" description; preserved exactly as found per this pass's
    explicit no-button-changes instruction, flagged for whoever picks up
    Item 5 next.
  - Forward-pointer appended to **#180**'s Status cell; new row **#199**
    added, in Build Plan Section 9.
  - **Items 1 (icon standardization), 3 (height normalization), 4
    (sidebar geometry unification beyond what Item 2's own SPACE_BETWEEN
    fix already gives for free), 5 (top-bar action button KEEP/LOSE), and
    Decision Log #178 (the un-instanced `calendar 1` variant) remain
    open** — each now a much smaller, focused operation (per-instance
    property edits or one edit on the shared component) once dispatched,
    per Decision Log #180's own reasoning. **All five are now DONE — see
    the next bullet.**
  - Not merged — founder's call after review.
- **`sprint-2/admin-panel-fast-follow` (figma-design-system, 2026-09-05)
  is the fast-follow to `sprint-2/admin-shell-componentization` (merged)
  — Items 1/3/4/5 from the original structural-pass report, plus
  Decision Log #178. Figma design only, no app code.** Report:
  `docs/sprint-2-admin-panel-fast-follow-report.md`. Figma writes by the
  agent (no shell); branch/commit/docx/PR finalised in a follow-up
  session. **Decision Log #180 is now fully closed** — all of Items
  1/3/4/5 plus #178 are done, not just planned.
  - **Precondition re-verified live first** (per the task's own mandatory
    first step): the `Admin Shell` COMPONENT_SET (`6014:12948`) and its
    29 instances confirmed to actually exist before any work began.
  - **Item 1 — icon standardization on Carbon (Decision Log #49/#147/
    #179), DONE.** All 9 sidebar nav icons redrawn once on the shared
    component and inherited by all 29 screens: Dashboard → `carbon:
    dashboard`, Articles → `carbon:document`, Users → `carbon:user--
    multiple` (**closes Decision Log #147** — the old `fi:A_users`
    rendered as empty/invisible fills; the new glyph has real solid
    fills), Moderation → `carbon:gavel` (founder-approved), Categories →
    `carbon:categories`, Contest → `carbon:trophy` (founder-approved),
    Competitions → renamed only to `carbon:chart-column` (geometry was
    already correct per PR #131), Media → `carbon:image`, Settings →
    `carbon:settings`. Applied across all 9 nav-row slots × 10 `Active`
    variants (90 icon-row edits), active/inactive coloring read live per
    row, not assumed. **A real Figma bug was found and fixed**:
    `figma.union()`/`figma.subtract()` discard input shapes' own fills,
    resetting the result to default gray — fixed by re-setting `.fills`
    on the resulting boolean node itself (Decision Log #201, a new
    Figma-authoring gotcha for the standing notes).
  - **Item 3 — frame height (Decision Log #50, via #177's "1184 is a
    floor" resolution), DONE.** 16 screens grown 1024→1184 (15 plain +
    1 scrim/modal screen — `Settings - Delete Role`, `5403:7205` — whose
    scrim and confirm dialog were explicitly resized/recentered to
    match), all confirmed zero content-geometry drift. `Admin — Appeal
    Review` (1234) and `Admin — Create Competition` (1530) confirmed
    left untouched, not shrunk.
  - **Item 4 — sidebar geometry unification (Decision Log #151),
    CONFIRMED, not redone.** Settings correctly pins to the sidebar's
    bottom on all 3 required height variants (already-1184, just-grown
    1024→1184, and the 1530 screen) via the componentized shell's own
    `SPACE_BETWEEN` nav-block constraint from `sprint-2/admin-shell-
    componentization` — no component-level fix was needed.
  - **Item 5 — top-bar action button KEEP/LOSE (Decision Log #51),
    DONE.** Applied to all 29 screens: 10 KEEP (9 original list items +
    Moderation Queue's founder-resolved two-button special case), 16
    LOSE (every claimed in-content submit button — e.g. "Submit Post",
    "Save Changes", the 3 Moderation action buttons — verified to
    genuinely exist before its top-bar button was removed; none needed
    the leave-alone fallback), 3 already-removed (Dashboard, Media
    Preview, Admin Profile) unchanged. **Admin — Moderation Queue**
    (`5794:8635`) got its founder-resolved two-button treatment: `Show
    Action Button=true`/`Action Label="Filter"` on the shared component
    slot, plus a new standalone `Button — Export Queue` (`6073:14056`)
    added directly into the screen's own `Content > Top Row`. **A real,
    pre-existing layout defect was found and flagged, not fixed**
    (Decision Log #200): this screen's own `Content`/`Table` frames
    (`y=45`–`424`) fully overlap and render on top of the shared shell's
    persistent top-bar row (`y=186`–`227`), so the correctly-configured
    "Filter" button is structurally invisible — pre-existing, unrelated
    to this session's own edits, and not fixed here since repositioning
    a screen's content is layout redesign beyond this task's "toggle the
    shared component" scope. The same root-cause structure exists on
    `Admin — Report Detail & Action`/`Admin — Appeal Review` but produces
    no visible defect there since both are `Show Action Button=false`.
  - **Decision Log #178 — `calendar 1` retrofit, DONE**, closing it out
    fully alongside `calendar 2`'s earlier retrofit (Decision Log #53).
    `calendar 1` (`2363:2242`) reconciled node-by-node against `calendar
    2`'s already-completed treatment (its structure differs slightly, not
    a literal clone) and bound to the same `Soccernity Theme` Light
    tokens. Final count: **100 bound / 4 unbound-visible (disclosed) / 1
    unbound-hidden (disclosed)** — the same 4+1 disclosed shape as
    `calendar 2`'s own precedent (opacity-0 trailing-day numerals + one
    frosted panel that a bound paint would force to full opacity). One
    disclosed judgment call: the time-picker's neutral-grey text (no
    matching neutral token in this file) was bound to `color/text/
    secondary` as the closest real semantic match, a small visible hue
    shift disclosed rather than silently made.
  - Forward-pointers appended to **#49, #50, #51, #53, #147, #151, #179,
    #180**'s Status cells; new rows **#200, #201** added, in Build Plan
    Section 9.
  - Not merged — founder's call after review.
- **`sprint-2/articles-cleanup-moderation-fix-hygiene` (figma-design-
  system, 2026-09-05) is a mixed cleanup pass — three Articles/Blog-
  section findings (Decision Log #195/#196/#198) plus the real
  Moderation Queue layout bug (Decision Log #200), plus a docx
  status-word correction sweep. Figma design only, no app code.** Report:
  `docs/sprint-2-articles-cleanup-moderation-fix-report.md`. Figma writes
  by the agent (no shell); branch/commit/docx/PR finalised in a
  follow-up session. **Two of the four Figma items turned out to have
  stale premises, caught by verifying live rather than trusting the
  brief** — the same discipline this project's sessions have
  consistently applied.
  - **Decision Log #195 (section banner coverage) — RESOLVED, no action
    needed.** Live measurement found the Blog/Articles banner
    (`5942:12065`) already covers all 4 Article Detail frames with
    ~1,687px to spare on each side, a symmetric strip around the whole
    section — the original "~5,620px short" estimate didn't match the
    live file. No resize performed.
  - **Decision Log #196 (legacy text nav sweep) — RESOLVED for the 2
    named frames, new candidate raised for what the sweep actually
    found.** The two "Blog — Article Detail Desktop" frames had nothing
    to hide — their own `Group 7` legacy nav was already removed (not
    hidden) by the prior `sprint-2/articles-page-split-and-navbar`
    session. A genuine file-wide sweep (14,419 text nodes scanned) found
    the real gap instead: **3 live, never-retrofitted legacy text-nav
    instances** — Contact Us Desktop (`87:158`), Terms of Service Desktop
    (`102:340`), Privacy Policy Desktop (`104:444`), each still carrying
    the exact pre-redesign `Group 7` nav + old-style logo lockup, plus
    their 3 mobile counterparts using an old `bx:menu` hamburger instead
    of the canonical mobile navbar. None of these 6 frames has ever been
    touched by any navbar-retrofit pass in this project's history —
    flagged as **Decision Log #202**, a scoped follow-up to give them the
    same `header 4`/`header 7` treatment every other section already has.
    Nothing on these 3 pages was fixed in this pass — find-and-report
    only, per the task's own instruction.
  - **Decision Log #198 (desktop top whitespace) — RESOLVED.** Both
    "Blog — Article Detail Desktop" frames' gap (navbar bottom to real
    content) tightened from 221px to 81px, matching Blog Page Desktop's
    own measured convention exactly (verified live, not assumed).
    Content shifted up 140px; each frame's height was also reduced by
    the same 140px — a disclosed judgment call beyond the literal ask —
    to keep the footer flush at the bottom rather than leaving a new
    empty band. Verified: no overlap, footer flush, both auth states
    clean.
  - **Decision Log #200 (Moderation Queue button/table overlap) —
    RESOLVED, a real bug, not just documentation.** Live coordinates were
    re-derived against the componentized shell instance (`6044:14064`),
    not trusted from the older fast-follow report. The Table
    (`5794:8718`) was repositioned to sit 9px below the shared shell's
    top-bar row, matching the measured Articles/Categories convention.
    **A new Figma-authoring gotcha was found and worked around**:
    manually setting `.y` on an `AUTO`-positioned child of an auto-layout
    frame is silently discarded by Figma's own layout engine (no error
    thrown) — fixed by switching the affected children (`Table`, a
    spacer, the "Callout — Appeal Routing" panel) to `ABSOLUTE`
    positioning first. Verified: the Table no longer overlaps the
    "Filter" or "Export Queue" buttons, both now clearly visible.
    `Admin — Report Detail & Action`/`Admin — Appeal Review` share the
    identical root cause but were deliberately left untouched — both have
    `Show Action Button = false`, so there's no visible defect there
    today.
  - **Docx status-word correction sweep, done alongside the Figma work**:
    leading "Open" flipped to "Resolved" on **#49, #50, #51, #147, #151**
    (each already carried a full resolution block appended by the prior
    `sprint-2/admin-panel-fast-follow` PR, but the leading word was still
    stale) and on **#195, #196, #198, #200** (resolved by this pass's own
    Figma work, above). **#197 rewritten in full**: the founder resolved
    the naming question herself by renaming the 4 Article Detail frames
    directly in Figma to "Blog — Article Detail Desktop/Mobile — Logged
    In/Logged Out" (confirmed live) — the docx now records that
    resolution instead of the stale "naming-only question... no
    functional impact" text. New row **#202** added for the 6
    never-retrofitted legacy-nav frames found above.
  - **New Figma-authoring gotcha for the standing notes**: a manually-set
    `.y` on a normal (`AUTO`-positioned) child of an auto-layout frame is
    silently discarded/recomputed by Figma's own layout engine — work
    around it by setting `layoutPositioning = 'ABSOLUTE'` on that child
    first (re-asserting size via `.resize()`, since `STRETCH`/
    `layoutAlign` no longer applies once a child goes absolute), then
    setting `x`/`y`. Distinct from the already-documented "bound paint
    takes its alpha from the variable" (Decision Log #199) and "boolean
    operations discard input fills" (Decision Log #201) gotchas.
  - Not merged — founder's call after review.
- **`sprint-2/legal-pages-navbar-retrofit` (figma-screen-builder,
  2026-09-05) closes Decision Log #202 — Contact Us, Terms of Service,
  and Privacy Policy each get the same navbar-variant split Blog and
  Articles already had. Net-new frame creation, correctly routed to
  `figma-screen-builder`. Figma design only, no app code.** Report:
  `docs/sprint-2-legal-pages-navbar-retrofit-report.md`. **This session
  was interrupted mid-task by a session rate limit** right after the 6
  desktop frames were built; on resume, live state was re-verified before
  any further writes (8 frames confirmed correct, 4 mobile frames
  confirmed genuinely missing, zero broken/orphaned intermediate state)
  rather than trusting the pre-interruption summary — nothing was
  rebuilt or duplicated.
  - **12 new frames** (not 18 — the original task brief's own summary
    line double-counted the archived frames; built to the brief's literal
    step-by-step spec instead, which matches the Blog/Articles precedent
    exactly): Desktop — Logged In/Out (1440px, `header 4`/`header 7`) and
    Mobile — Logged In/Out (rebuilt at the canonical **390px**, not the
    original 375px, `header 4 — mobile`/`header 7 — mobile`) for each of
    the 3 pages. **6 old originals archived** (hidden + `ARCHIVED — `
    em-dash prefix, not deleted), each reference-checked first (0 inbound
    reactions, 0 outbound, 0 nested components, not a flow start on any
    of the 6 — nothing was broken).
  - **Confirmed, not assumed, that these pages need the full
    content-icon navbar, not the auth Top Bar**: the footer links to all
    three (`Link — Terms of Service`/`Privacy Policy`/`Contact Us`) live
    on the canonical logged-out homepage (Decision Log #46/#152) AND
    recur on multiple logged-in surfaces (Sports Page logged-in, Community
    post view, Search page) — both auth states are genuinely reachable,
    matching Blog/Sports Hub's own justification, not the narrow
    Decision Log #172 auth-flow scope.
  - **The mobile 375→390 reflow method was tested before being committed
    to, not assumed**: a throwaway `frame.resize()` on a clone drifted 5
    of 18 children by four different amounts and stretched one (Figma
    resolves each `GROUP` leaf's own constraints independently during a
    parent resize) — rejected. Used the same reparent-into-a-fresh-shell
    approach the Articles session used, re-derived independently on this
    content rather than inherited, with zero drift anomalies confirmed
    across all 6 mobile frames afterward (full subtree, node-by-node).
  - **Desktop needed zero content repositioning** — all three legal
    desktop frames already had content starting at exactly the y that
    yields the canonical 81px navbar gap. **Mobile gap: 80px**, matching
    Blog/Articles on both breakpoints.
  - **Paint audit: 770 bound / 6 unbound / 0 off-palette-besides-the-6 /
    0 `brand/green-tint-28` / 0 new colours / 0 overlaps.** The 6
    unbound paints are all the same node in the same place across the 6
    desktop frames — the exact 294×67 `#D9D9D9` missing-"Soccernity."-
    wordmark pill Decision Log #174 already found and fixed on Blog Page
    Desktop (and left open on Articles) — **deliberately not
    force-bound to hit a "0 unbound" count**, since that would disguise
    a missing wordmark as a deliberate grey block. Flagged as **Decision
    Log #204** for one scoped follow-up covering all remaining families
    at once.
  - **Five more Decision Log candidates raised, none fixed here**: **#203
    — the Terms of Service/Privacy Policy body copy is Lorem ipsum**,
    flagged as the one that matters most (a real DPIA/GDPR/NDPA
    safeguarding item per non-negotiable #2, blocking `figma-to-code`
    conversion of these two screens until real, counsel-reviewed copy
    exists via `safeguarding-drafter`) — **see the dedicated
    `sprint-2/legal-copy-draft-tos-privacy` bullet immediately below for
    what unblocks it; #203 itself is still open, pending counsel**;
    **#205** — an orphaned page-level
    `Contact Dropdown` group (`87:250`) sitting outside any frame,
    needing a rebuild-or-delete decision; **#206** — no section banner
    exists over this row, unlike Blog/Articles; **#207** — stale
    "Copyright © 2022" text on both footers, the same defect class the
    homepage rebuild already fixed elsewhere; **#208** — no prototype
    wiring on the new navbars (consistent with the rest of the file, not
    a regression, but now newly possible since the link targets exist).
  - Forward-pointer appended to **#202**'s Status cell; new rows
    **#203–#208** added, in Build Plan Section 9.
  - **New Figma-authoring gotcha for the standing notes, corroborating
    the Articles session's independent finding on different content**:
    `frame.resize()` applies each leaf's own constraints even on a
    `layoutMode: NONE` (absolute-layout) frame, and `GROUP`s have no
    constraints of their own, so their leaves resolve independently and
    drift by differing amounts. Reparenting children into a fresh,
    correctly-sized shell (then re-asserting each child's snapshotted
    `x`/`y`) is the safe way to change a frame's width without corrupting
    absolute-positioned legacy content.
  - Not merged — founder's call after review.
- **`sprint-2/legal-copy-draft-tos-privacy` (safeguarding-drafter,
  2026-09-05) drafts real Terms of Service and Privacy Policy copy for
  the two placeholder-Lorem-ipsum screens Decision Log #203 flagged —
  `docs/legal-copy-draft-tos-privacy-policy.md`. This PR does NOT close
  #203 and does not touch Figma or application code — it is a
  first-pass draft only, per `CLAUDE.md` non-negotiable #2, and #203
  remains open until Soccernity's legal counsel actually signs off.**
  Grounded directly in Build Plan Section 8 (8.1 DPIA outline, 8.2
  retention skeleton, 8.3 guardian-consent flow, 8.4 moderation/appeals),
  Section 3's data model, and the live Decision Log (#4, #8, #10, #19,
  #21, #31, #34, #37, #38, #40, #41, #42, #44, #45, #55, #58, #60, #128–
  #130, #138, #153–#155) — not a generic legal template. Both documents
  accurately reflect what the product actually does as of Sprint 2: the
  under-18 guardian-consent flow with its 72-hour token TTL and
  guardian-email-change-restarts-the-flow behaviour; the restricted-pending
  state's real scope (no public profile, no DMs from unverified accounts,
  read-only Banter Rooms, no posting/commenting per Decision Log #21, no
  followers/following visibility per #41, absence from the Leaderboard
  per #45); the age-5 hard signup floor (#19); the 30-day-grace-then-hard-
  delete-cascade account-deletion mechanism, including the deliberate
  exception that keeps a separate `ConsentAuditRecord` for a further 6
  months (#42, #44); the real named processors (Postmark, S3-compatible
  storage, Sentry — wired but not live, Render/Neon/Upstash hosting);
  and the Leaderboard's real-display-names-for-minors decision (#45),
  disclosed as a planned feature since the Leaderboard has no backend
  yet. **Every retention period, age threshold, and factual policy
  claim is marked `[PROPOSAL]` or `[OPEN — Decision Log #N]`, per the
  agent's standing draft-only boundary** — matching the convention
  `docs/sprint-1-dpia-outline-draft.md` already established. **Decision
  Log #4 (jurisdictional scope beyond UK GDPR/NDPA 2023) is explicitly
  NOT resolved by this draft** — both documents are written against UK
  GDPR + Nigeria NDPA 2023 as a working baseline (matching Decision Log
  #10's own grounding and the Phase 1 Nigeria/England launch markets),
  flagged throughout as not a finding that no broader regime applies.
  **A genuine sizing problem was found and flagged, not silently
  absorbed by cutting content**: at a rough capacity estimate (method
  disclosed in the document's own Section 0), the desktop body text box
  (`6114:14250`, ~1059×1084px) holds roughly 1,000–1,150 words without
  scrolling, and the mobile box (`6116:14616`, ~335×2865px) roughly
  900–1,050 words — the draft ToS runs ~2,400 words and the draft
  Privacy Policy ~3,600 words, both realistically necessary given the
  guardian-consent, retention, and public-visibility disclosures a
  minors' platform actually has to make. Flagged for whoever inserts
  this into Figma: the safe fix is a scrollable body region or a resized
  frame, not compressing the legal text to fit — a new Decision Log
  candidate for a future `figma-design-system` pass once counsel-approved
  copy exists. **New Decision Log candidates raised, all in the
  document's own Part C, none resolved there**: no guardian
  decline/withdrawal endpoint exists (ties to #34); no retention rule
  for an account left restricted-pending indefinitely; no non-user
  reporting route for content depicting non-users; cross-border
  data-location assessment for the named processors still open; whether
  the Leaderboard's real-names-for-minors decision needs its own
  dedicated safeguarding review before that feature launches; who
  exercises a minor's data-subject rights and how a minor/guardian
  disagreement is handled; NDPA 2023 cross-check on the 6-month
  consent-record retention window (UK-GDPR-derived reasoning, not yet
  Nigeria-confirmed). Not merged — founder's call, and this specific
  document additionally requires actual legal counsel sign-off (the
  blank sign-off block at the end of the file) before any of its content
  can be treated as final, per the agent's standing boundary.
- **`sprint-2/decision-log-204-208-cleanup` (figma-design-system, 2026-09-05)
  closes Decision Log #204, #205, #207, #208, and folds #199/#201 into a
  new standing Figma-authoring gotchas section — a scoped edit pass on
  existing frames, no new screens. #206 was investigated and found to
  already be resolved, not left open by this pass.** Full detail:
  `docs/sprint-2-decision-log-204-208-cleanup-report.md`.
  - **#204 — missing "Soccernity." footer wordmark pill, RESOLVED.** The
    same defect Decision Log #174 fixed on the 4 Blog Page desktop frames
    (a 294×67 `#D9D9D9` grey pill that should be a real "Soccernity." text
    node) was found and fixed identically on **8 live frames**: all 6 new
    Legal page desktop frames (Contact Us / Terms of Service / Privacy
    Policy × Logged In/Out) plus **2 live frames the task brief's own node
    IDs (`54:434`/`87:80`) were stale for** — those IDs are now the
    archived, hidden originals (superseded by `sprint-2/articles-page-
    split-and-navbar`); the real live equivalent needing the fix was
    **`Blog — Article Detail Desktop — Logged In/Out`** (`5997:10905` /
    `5997:11224`), confirmed by checking live rather than trusting the
    brief. File-wide paint audit after the fix: **0 remaining live/visible**
    294×67 `#D9D9D9` wordmark-pill instances — the 5 that do still exist
    (`1009:603`, `85:63`, `87:214`, `102:374`, `104:460`) all sit inside
    already-archived, hidden top-level frames and were deliberately left
    untouched, matching this project's established archived-content
    precedent.
  - **#205 — rebuild the orphaned Contact Dropdown as a real connected
    open-state, RESOLVED with one disclosed plugin-API limitation.** The
    orphaned `87:250` (415×330, sized for a since-replaced narrower field)
    was rebuilt as two new standalone components — **`Contact Category
    Dropdown — Desktop`** (`6130:14653`, widened to 1030px to match the
    real field on `Contact Us Desktop — Logged In/Out`) and **`— Mobile`**
    (`6130:14664`, 318px, 2x-scaled down to match the mobile field's own
    12px label size) — preserving the exact 5 options verbatim (Technical
    issues / Editorial Complaints / Data / Livescores Issues / Suggestions
    / Enquiries/Feedback), same fills/opacity/divider treatment as the
    original, screenshot-verified clean. Wired via `ON_CLICK` →
    `OPEN_OVERLAY` (`setReactionsAsync`) from all 4 frames' chevron
    triggers, confirmed persisted on a fresh read. **Disclosed limitation**:
    `overlayPositionType` is read-only on a `COMPONENT` node via the plugin
    API (confirmed by direct attempt — `"read-only property on COMPONENT
    node"`), and `overlayRelativePosition` (the offset that would anchor the
    dropdown directly under the field, the same mechanism the avatar→
    account-dropdown wiring uses) only takes effect when the destination's
    `overlayPositionType` is `MANUAL` — so the reaction is real and
    functional, but the dropdown currently opens at its default `CENTER`
    position rather than anchored under the field. **Flagged as a new
    Decision Log candidate**: whoever has Figma desktop UI access needs to
    flip both dropdown components' Prototype-tab "Overlay position type" to
    Manual (a one-checkbox job, the same class of API gap Decision Log #103
    already found for `overlayBackgroundInteraction`), after which the
    already-computed relative-offset math in the report can be applied. The
    orphan `87:250` was reference-checked (0 inbound reactions/instances
    file-wide) and then deleted, not archived — it was never a real screen.
  - **#206 — section banner over the Legal pages row: investigated, ALREADY
    RESOLVED, no action taken.** The task brief's premise ("never had one")
    did not hold up against direct verification: **`Rectangle 194`
    (`1869:2735`)** already exists, is visible, is bound to the same
    `color/text/on-green` variable (which resolves to navy in Light mode)
    Blog's own banner uses, and already spans the live Legal Pages row
    (`-19926` to `-5946`) with margin on both sides — paired with the
    pre-existing **"Company pages"** text label (`1870:2736`) sitting
    directly within its band. Screenshot-confirmed. No duplicate banner was
    built. This closes #206 as a stale/incorrect premise, not as new work.
  - **#207 — stale "Copyright © 2022" footer text, RESOLVED for all live
    content.** File-wide sweep found **32 total instances** (not scoped
    per-page); **22 live, visible instances** updated to 2026 (Sports Page
    ×2, Blog Page Desktop/Mobile ×4, Blog — Article Detail Desktop/Mobile
    ×4, all 12 Legal page frames), verified via the canonical
    load-font→mutate→return recipe. **10 instances inside already-archived,
    hidden frames deliberately left untouched**, matching the same
    archived-content precedent #204 used — a disclosed judgment call, not
    an oversight. A broader safety sweep for any other stray "2022"
    confirmed every other hit is an unrelated sample date (article publish
    dates, match dates, admin dashboard placeholder data) — correctly out
    of this year-correction's scope, left untouched. Only the year digits
    changed; entity name and rights-reserved language untouched.
  - **#208 — footer link wiring, RESOLVED for all live content.** A fresh
    file-wide scan found **263 occurrences** of the 3 exact strings (not
    the 203 the task brief carried over from #202's older scan — re-verified
    live rather than trusted, consistent with this project's standing
    practice). Of those: **189 wired** to the correct new Legal page frame,
    branching by breakpoint (desktop/mobile, by frame width) and auth state
    (Logged In/Logged Out, by explicit frame name where available — Sports
    Page, Blog, Article Detail, and all 12 Legal frames — or by direct
    Decision Log cross-reference where the name doesn't say so explicitly:
    Leaderboard/Contest/Competition family → Logged In per **Decision Log
    #129**; the canonical Home Page frames → Logged Out per **Decision Log
    #46/#152**; Community/Bants family screens → Logged In per the
    site-wide login-gating **Decision Log #152** establishes); **46 skipped**
    (the 10 archived frames, left untouched per precedent); **28 correctly
    left unwired** — same-type self-references (a "Contact Us" link, or in
    several cases the page's own H1 heading that happens to literally say
    "Contact Us", sitting on the Contact Us page itself) that Figma's own
    `NAVIGATE` action correctly rejects (`"for NAVIGATE actions,
    destinations must be a different top-level frame"`) — confirmed this is
    the right outcome, not a bug to work around. Wired via `ON_CLICK` →
    `NAVIGATE` (matching this file's own existing Notification-row-to-
    Notification-Centre pattern, not `OPEN_OVERLAY` — a full page
    navigation, not a dropdown). Spot-checked across breakpoints/auth
    states/sections (Sports Page logged-out/in, Leaderboard Mobile, Bants
    homepage) via fresh reads confirming exact destination IDs.
  - **Documentation**: #199 and #201 folded into a new **"Figma-authoring
    gotchas"** subsection under CLAUDE.md's own "Figma notes" section — that
    section did not actually exist before this session, despite at least
    five prior sessions each saying a gotcha "belongs in the file's standing
    Figma notes." Only #199, #201, and the `frame.resize()`-on-GROUPs
    gotcha this cleanup task's own brief pointed at (which also did not
    actually live in a real standing-notes section yet) are consolidated;
    several other scattered gotchas named inline elsewhere in this file
    remain a real, disclosed follow-up sweep, not done here.
  - Not merged — founder's call after review.
- **`sprint-2/footer-standardization` (figma-design-system, 2026-09-05)
  replaces every non-canonical footer file-wide with the canonical footer
  established on the Home Page rebuild (Decision Log #46) — a scoped edit
  pass on existing frames, no new screens, no app code.** Report:
  `docs/sprint-2-footer-standardization-report.md`. New Decision Log
  **#209**.
  - **24 footer instances replaced**: 22 "Footer — Soccernity Global"
    instances on Leaderboard/Contest/Competition-tab frames (desktop +
    mobile) — confirmed live to carry a structurally older pattern
    (plain-text social labels with no icons, an extra "Cookie Policy"
    link the canonical set doesn't have, no hairline rule, no logo mark
    in the wordmark) — plus **2 compact 96px-tall "Footer" stubs** on
    Sports/Livescores mobile (Logged Out `5647:8166`, Logged In
    `5647:8315`), confirmed to be genuinely missing the social bar and
    full legal-links row entirely.
  - **"Footer Action" nodes (unrelated button bars) and Admin Panel
    frames were checked live and confirmed to need no exclusion** — none
    carried the old pattern to begin with.
  - **Method note, a real adaptation of this file's own precedent**: all
    24 target parent frames are genuine `VERTICAL` auto-layout
    (`primaryAxisSizingMode: AUTO`), unlike the absolute-layout/GROUP
    content the `frame.resize()`-on-GROUPs gotcha (see "Figma-authoring
    gotchas" above) was found on — so no manual resize/reposition math
    or reparent-into-a-fresh-shell trick was needed. Cloning the
    canonical footer, `insertChild`-ing it at the old footer's exact
    index, then removing the old footer let each frame's own height grow
    automatically via its own hug sizing (desktop +85px, mobile +86px,
    the two Sports Hub mobile frames +322px — the largest single growth,
    since their old footer was the compact stub). `5171:6633`'s 4th
    child (`ANNOTATIONS — design documentation, not shipped UI`, sitting
    after the footer) was confirmed to keep its position after the swap.
  - **Verified**: every new footer's bound-variable set (`brand/green`,
    `color/text/on-navy`, `color/icon/inactive`, `brand/navy`) matches
    the canonical footer's own bindings exactly; screenshots clean on a
    sample from every family (Leaderboard desktop + mobile, Contest,
    Empty State, both full Sports Hub mobile states); a file-wide sweep
    for any remaining `"Footer — Soccernity Global"` or bare `"Footer"`
    (non-Action) instance returned **zero matches**.
  - Not merged — founder's call after review.
- **`sprint-2/legacy-footer-template-replacement` (figma-design-system,
  2026-09-05) replaces a SECOND, previously-undiscovered legacy footer
  template — internally named `Group 47` (desktop) / `Group 55` (mobile),
  never wrapped in a node literally named "Footer" — found live on Blog,
  Blog Article Detail, all 3 Legal pages, and Sports Hub desktop (22
  frames total). Missed by every earlier "Footer"-named sweep (#174,
  #204, #209) precisely because of that naming gap.** Report:
  `docs/sprint-2-legacy-footer-template-replacement-report.md`. New
  Decision Log **#210**, explicitly not a duplicate of #204/#209.
  - **Confirmed defects**: 0 hairline divider anywhere; 0 of 6 social
    icons on desktop instances, only 3 of 6 (Facebook/Instagram/Twitter)
    on mobile; every single instance had a **duplicated "Terms of
    Service" label** in the Legal Links row's 4th slot — strong
    circumstantial evidence (matching the sibling "Footer — Soccernity
    Global" template's identical 5-slot order, whose 4th slot is
    "Cookie Policy") that this was meant to say "Cookie Policy" before a
    copy-paste error, though moot since the canonical 4-link footer has
    no 5th slot at all; bare "Soccernity." wordmark text with no logo
    icon on 10 of 12 desktop instances.
  - **Sports Page's `Group 103` wordmark investigated against Decision
    Log #194 and confirmed NOT a recurrence** — `437:3011` is a
    genuinely correct logo+text lockup, a different, coincidentally
    same-named node from the one #194 flagged elsewhere.
  - **A real dangling-wordmark risk was found and fixed**: on the two
    Article Detail Mobile frames, the old footer's wordmark was a
    separate sibling instance sitting outside the `Group 55` boundary
    (not embedded inside it, unlike every other instance) — identified
    and deleted alongside the old footer so it didn't float on top of
    the new canonical footer.
  - **Method note, a disclosed deviation from the brief's suggested
    reparent-into-fresh-shell approach, backed by a direct empirical
    test**: all 22 parents are `layoutMode: NONE` (absolute layout), but
    the known `frame.resize()`-on-GROUPs drift bug (see "Figma-authoring
    gotchas" above) was specifically reproduced on **width**-axis
    resizes in prior sessions — this task only needed a **height**
    change. Before touching any real target, a height-only resize was
    tested on two representative frames (one simple, one with 556 total
    descendant nodes) with a full before/after/revert deep-snapshot —
    **zero drift in every node checked**, since every relevant node here
    already carries `vertical: "MIN"` constraints. Proceeded with a
    direct per-frame resize using an exact computed delta (new footer
    height − old footer height) rather than the heavier reparent
    technique or a hardcoded height assumption — the latter correctly
    handled two Article Detail Mobile frames whose old footer wasn't
    flush against the frame's bottom edge (139px of trailing content
    existed below it).
  - **Verified**: bound-paint set on every new footer matches canonical
    exactly; screenshots clean across every family including both
    Article Detail Mobile frames re-checked specifically for the
    dangling-wordmark risk; a file-wide sweep found 10 remaining
    "Group 47"/"Group 55" matches, all confirmed inside already-archived,
    hidden frames — zero live instances remain.
  - Not merged — founder's call after review.
- **`sprint-2/leaderboard-banter-sportshub-to-code` (figma-to-code,
  2026-09-05) converts LeaderboardPage.tsx, BanterPage.tsx, and
  SportsHubPage.tsx from `PlaceholderPage` stubs to real, working
  `apps/web` code — the last three stubs on the main nav.** No
  `services/api` code touched. Sequencing rule honoured: all three Figma
  frames (Leaderboard `5171:6633`, Bants homepage `2256:6802` + search
  result `2448:2179`, Sports Page `1009:673`) were confirmed live before
  writing any code, not assumed from memory of past design sessions.
  - **Backend state, confirmed live before building, not assumed**: the
    `leaderboard`, `banter`, and `sports` backend modules are each still
    a bare `README.md` placeholder ("Not yet implemented") — Sprint 6,
    Sprint 3, and Sprint 4 respectively. No `GET /leaderboard`,
    Contest/Competition, room, or fixtures endpoint exists anywhere;
    `LeaderboardEntry`/`BanterRoom`/`MatchData` are schema-only models
    with zero live reads or writes. Per the standing paused-backend rule,
    none of these three pages' domain content (rankings, rooms, scores)
    is wired to a real endpoint — all of it is illustrative dummy data in
    a co-located `*Data.ts` file per page, the exact same disclosed
    convention `HomePage.tsx`'s own `FIXTURES`/`TALENT_CLIPS` constants
    already use, for the identical reason.
  - **LeaderboardPage — login required, no logged-out view** (Decision
    Log #129): a `no-session` state prompts to log in and calls nothing,
    matching `ClubsPage.tsx`. Board Tabs (Overall / Contest / Competition,
    Decision Log #71–72), a 4-dimension filter bar (SCOPE Global/By club,
    CLUB, COMPETITION TYPE — Competition tab only, TIME PERIOD
    Weekly/All-time), a ranked table with palette-only rank medals for
    top 3 (Decision Log #69: green/navy/green-tint+navy-outline, no
    gold/silver/bronze) and a "You" tag row, and a generic
    RANK/PLAYER/CLUB/&lt;metric&gt;/SCORE Competition-tab shell (metric =
    Accuracy for Prediction, Votes for Commentary, Decision Log #72) are
    all built and filter/tab-interactive. **One piece of real data**: the
    CLUB filter's dropdown options come from the caller's actual `GET
    /clubs` response filtered to `joined: true` (Decision Log #154) —
    genuine live membership data, not dummy content. **Two disclosed
    judgment calls, new Decision Log #211**: (1) the single
    explicitly-selected "represented club" Decision Log #74/#128
    describes has no live schema field or endpoint yet — wired as a
    typed local-state stub (defaults to the first real joined club,
    changeable in the UI, never persisted) rather than blocking the page,
    per this task's own explicit instruction; (2) the real Contest
    mechanic's four phases (Vacant → three weekly-fill states → Live
    Level-1 Final → Crowned, Decision Log #70) are **not** all
    reproduced — a materially larger scope than this first conversion
    pass — the Contest tab ships as one illustrative representative
    state instead, flagged in-code and in the Decision Log rather than
    silently cut.
  - **BanterPage — login required** (Decision Log #152's site-wide
    login-gating for the Community/Bants family): mirrors
    `CommunityPage.tsx`'s no-session handling exactly. Real data: the
    caller's own display name via `GET /users/:id` (same pattern
    `CommunityPage.tsx`'s composer uses). Illustrative dummy data: the
    Banter Rooms list, Trending News, Fixtures, and Suggested-follows
    rails — same "Sample" disclosure discipline as `CommunityPage.tsx`'s
    own side rails. A client-side-only search filters the dummy room
    list (matching the "Bants - search result" frame's "Result showing
    for X" pattern, real matching against illustrative data rather than a
    real query). Includes the mobile categories-view pattern already
    built in Figma (Decision Log #144) as an All / My Bants tab — "My
    Bants" has no real room-membership data to filter by, so it shows the
    same illustrative list with an explicit disclosure note rather than
    fabricating a membership computation.
  - **SportsHubPage — no login gate**, unlike the other two: Figma has
    both a Logged In (`1009:673`) and Logged Out (`205:2`) canonical
    frame with identical content, and the shared `Header` already renders
    the correct chrome either way (same precedent as `BlogPage`). League
    sidebar (client-side filter + search), a match list (client-side
    filtered by league) with live/HT/FT status pills, and a "Most Recent
    Stories" aside are all built against dummy data (Decision Log #6
    still open, blocks Sprint 4) — an explicit on-page disclosure note
    says so.
  - **Verified**: `npx tsc --noEmit` clean; `npm run lint` clean;
    `npx vitest run` — **16 files / 110 tests, 0 failures** (up from
    13/92 — `LeaderboardPage.test.tsx` +8, `BanterPage.test.tsx` +5,
    `SportsHubPage.test.tsx` +5, no existing test changed); `npx vite
    build` clean production bundle. Dev-server smoke test: `/`,
    `/leaderboard`, `/banter`, `/sports-hub`, `/community`, `/clubs` all
    HTTP 200. No real browser/Playwright check available in this
    environment — same verification ceiling as every prior `apps/web`
    PR.
  - Not merged — founder's call after review.
- **`sprint-2/blog-articles-to-code` (figma-to-code, 2026-09-05)
  converts `BlogPage.tsx` from a `PlaceholderPage` stub to a real
  listing page and adds a new `ArticleDetailPage.tsx` (route
  `/blog/:articleId`) — `apps/web` only, `services/api` untouched. This
  is the last main-nav pillar left as a stub.** Report:
  `docs/sprint-2-blog-articles-to-code-report.md`.
  - **Backend state, confirmed live first, not assumed**: there is NO
    blog / article / content module anywhere in
    `services/api/src/modules` (unlike `sports`/`banter`, which at least
    have placeholder READMEs), and Build Plan Section 4 defines no blog
    endpoint. The `Article` entity exists in `schema.prisma` (one of
    Section 3's original 20) but has zero reads/writes. So every article,
    category, comment and date is illustrative dummy content
    (`apps/web/src/pages/blog/blogData.ts`) — the same convention
    `SportsHubPage.tsx` / `CommunityPage.tsx` already use, with an
    on-page disclosure note. The two Figma exemplars (the "Zaha
    double..." featured card, the "Kane joins 250 club..." secondary
    card) are kept verbatim; the rest are illustrative in the same
    register so the category tabs and per-category sections render.
  - **Source of truth**: the 4-frame auth-state × device split —
    `Blog Page Desktop — Logged In` (`5953:10771`) / `— Logged Out`
    (`5953:11364`), `Blog Page Mobile — Logged In` (`5956:10960`) /
    `— Logged Out` (`5956:11331`); `Blog — Article Detail Desktop —
    Logged In` (`5997:10905`) / `— Logged Out` (`5997:11224`),
    `Blog — Article Detail Mobile — Logged In` (`6000:11346`) /
    `— Logged Out` (`6000:11377`). Frame names confirmed against the
    founder's live Figma rename (Decision Log #197 — they are "Blog —
    Article Detail ...", so the component is `ArticleDetailPage`, not
    `ArticlesPage`).
  - **NO login gate on either page** — both Blog and Article Detail have
    a Logged In and a Logged Out canonical frame with identical body
    content; only the navbar variant differs, and the shared `Header`
    already renders the right chrome. Same precedent as `SportsHubPage`
    / `BlogPage`'s own same-content-both-states reasoning.
  - **BlogPage**: navy hero banner ("Feel The Passion, Enjoy the
    Game."), "Search Topics" box, category tab row (All / Premier League
    / La Liga / Champions League / NPFL / More). "All" renders a
    "Trending Topics" featured section plus one section per league; a
    specific tab renders just that league's section. Each section = a
    featured card (image-left, category badge, navy title, excerpt,
    date) + a responsive grid of secondary cards + a "See More" toggle.
    The search box filters the dummy list client-side (title/excerpt
    substring) with an empty state — there is no real query. Every card
    `<Link>`s to `/blog/:articleId`. No site footer rendered (same as
    `SportsHubPage` / `LeaderboardPage` — the Figma frame carries one,
    but the shared chrome is Header-only).
  - **ArticleDetailPage** (`/blog/:articleId`): back link, title, meta
    ("Posted by Admin · date · time"), a static "Share via:" row
    (non-interactive — sharing a dummy article is meaningless), a hero
    image placeholder, the article body paragraphs, a "Join the
    discussion" section, and a "More Trending News" strip of 3 other
    articles (never itself). **The comment composer is rendered but
    fully disabled** (Name / Comment / Comment button) with an
    explanatory note — there is no comments endpoint and no social
    sign-in flow; the sample thread is captioned "Sample — not real
    comments". Same "render it, visibly disabled, never faked as
    working" discipline `EditProfileModal.tsx` applies. An unknown
    `:articleId` renders an honest "Article not found" state with a link
    back to `/blog`, never a crash (mirrors `ClubFanPage.tsx`'s 404
    handling).
  - **Decision Log #212 added** (Build Plan Section 9): the task brief's
    instruction to preserve a **"Pinned post" badge (Decision Log
    #173)** on Blog does not apply — that badge lives on the *Community*
    home-feed frames (`2565:3951` / `5956:12797`), **not on any Blog
    Page frame**, and has never been converted to code (it's a
    Figma-only detail for a future `CommunityPage` pass). The Blog
    frames use a "Trending Topics" featured card with a *category* badge
    ("Premier League"), which is what was built. `CommunityPage.tsx` was
    not touched. Also flagged there: the same "no blog backend" gap
    (`Article` entity, no module/endpoint) that blocks wiring any of
    this to real data, and the deliberate no-footer choice.
  - **Judgment calls**: route `/blog/:articleId` (added to `router.tsx`
    as a child of `AppShell`); a "← Blog" back link on the detail page
    (not in Figma, matches `ClubFanPage.tsx`'s "← Clubs" precedent); the
    5 identical per-category sections in the Figma frame are rendered
    from distinct-enough dummy data rather than literally duplicated 5×.
  - **Verified**: `npx tsc --noEmit` clean; `npm run lint` clean;
    `npx vitest run` — **18 files / 119 tests, 0 failures** (up from
    16/110 — `BlogPage.test.tsx` +5, `ArticleDetailPage.test.tsx` +4, no
    existing test changed); `npm run build` clean production bundle.
    Dev-server smoke test: `/`, `/blog`, `/blog/zaha-double-crystal-palace`,
    `/blog/does-not-exist`, `/community` all HTTP 200, no console errors.
    No real browser/Playwright check available in this environment —
    same verification ceiling as every prior `apps/web` PR.
  - Not merged — founder's call after review.
- **`sprint-2/shared-footer-layout` (figma-to-code, 2026-09-05) extracts
  the site footer into a shared component and wires it via a new layout
  route — `apps/web` only, `services/api` untouched. Decision Log #213.**
  Report: `docs/sprint-2-shared-footer-layout-report.md`.
  - **`apps/web` now has THREE layout wrappers, not two. New pages pick
    one:**
    - **`AuthChrome`** (`src/layout/AuthChrome.tsx`) — logo-only Top Bar,
      no site Header. The four core auth routes only (Decision Log #172).
    - **`AppShell` direct child** (`src/layout/AppShell.tsx`) — site
      `Header` + routed content, **no footer**. Community, Clubs,
      ClubFanPage, Banter, and the guardian-consent / profile /
      verify-email flows (their Figma frames have no footer — confirmed
      live).
    - **`FooterLayout`** (`src/layout/FooterLayout.tsx`, a pathless
      layout route nested under `AppShell`) — `Header` + content +
      shared `<Footer />`. Home, Sports Hub, Leaderboard, Blog, Article
      Detail (their canonical Figma frames carry the standardized footer
      — Decision Log #209/#210). This is the `AuthChrome` split's mirror,
      one layer deeper.
  - **The founder decided the footer belongs in a shared component, not
    copy-pasted per page.** A live audit found this wasn't just cleanup:
    only `HomePage.tsx` had a footer (written inline), yet Sports Hub /
    Leaderboard / Blog / Article Detail all have the same canonical
    footer in their own Figma frame and never got one when they were
    converted from stubs (PR #171/#172) — their PRs disclosed the
    omission as "matching convention," but the convention was incomplete
    for those four.
  - **`Footer.tsx` is built to the CANONICAL Figma footer (desktop
    `5213:6816` / mobile `5543:7662`), NOT a copy of HomePage's inline
    one — which had drifted.** Re-verified live before extracting: the
    inline version was missing the logo mark, the entire 6-icon social
    bar (facebook / instagram / twitter / Tik Tok / YouTube / LinkedIn),
    the green bullet separators on the legal links, and the horizontal
    rule. The shared component adds all of them. Social icon SVGs
    downloaded from Figma into `src/assets/icons/social-*.svg` (green
    fill baked in, same convention as `nav-blog.svg`); the logo mark
    reuses the existing `soccernity-logo-mark.svg` (same asset `Header` /
    `AuthTopBar` use). Legal links and social icons render as
    non-interactive `<span>`s — there are no `/terms`, `/privacy`,
    `/contact` routes yet (legal pages unconverted, blocked on Decision
    Log #203) and Soccernity has no published social accounts; they
    become real links when those targets exist. The Figma 1px rule binds
    `--sn-icon-inactive` (navy @ 15%, invisible on a navy ground) — the
    shared component uses white @ 15% to preserve the intent, flagged in
    Decision Log #213.
  - **HomePage.tsx's inline `<footer>` JSX and its `.home-footer*` CSS
    are removed** — `FooterLayout` now renders it once, wrapping the
    page. `HomePage`'s `.home { margin: -32px }` full-bleed is untouched;
    `Footer.css` breaks out of `AppShell`'s 32px padding with its own
    negative margins (same technique), so the navy ground still runs
    edge-to-edge and, on HomePage, the small margin collapse against the
    navy closing section is seamless.
  - **Legal pages (Contact Us / ToS / Privacy Policy) have no React
    implementation yet** (blocked on Decision Log #203). When that
    conversion runs, adding those routes as `FooterLayout` children is
    all that's needed for them to pick up the shared footer — their
    Figma frames carry it (Decision Log #202 retrofit).
  - **Verified**: `npx tsc --noEmit` clean; `npm run lint` clean;
    `npm run build` clean; `npx vitest run` — **19 files / 123 tests, 0
    failures** (up from 18/119 — new `src/layout/Footer.test.tsx`, 4
    tests; **no existing test changed** — the footer moved but its
    content didn't, and no page test asserted on footer content). A
    throwaway spec (deleted before commit) rendered the **real**
    `src/app/router.tsx` at all 12 routes and confirmed exactly one
    `<footer>` on the five `FooterLayout` pages and zero on Community /
    Clubs / ClubFanPage / Banter / profile / verify-email / 404.
    Dev-server smoke test: `/`, `/sports-hub`, `/leaderboard`, `/blog`,
    `/blog/:id`, `/community`, `/clubs`, `/banter` all HTTP 200. No real
    browser/Playwright check available — same ceiling as every prior
    `apps/web` PR.
  - Not merged — founder's call after review.
- **`sprint-2/create-post-desktop-and-auth-navbar-fixes`
  (figma-design-system, 2026-09-05) — scoped edit + 2 new frames within
  the existing Create Post desktop family; navbar catch-up on Create
  Post desktop and the core auth pages. Figma design only, no app code.**
  Report: `docs/sprint-2-create-post-desktop-and-auth-navbar-fixes-report.md`.
  Decision Log **#214** added.
  - **Part 1 — Create Post desktop parity.** Built the 2 states desktop
    was missing vs. mobile, cloned from the (now-fixed) `2008:655` in the
    page-with-modal-overlay pattern (not a 390-wide modal): **Create
    Post — Desktop — Active Contest** (`6171:14797` — "Create a Post |
    Contest ①" tabs present, matching mobile `5982:10905`) and **—
    No Active Contest** (`6171:16994` — Contest tab + count badge
    removed, matching mobile `5982:10932`). Judgment call, flagged (DL
    #214d): on No-Active-Contest the "Create a Post" label + its
    tab-style accent underline is kept as the modal heading — a desktop
    modal needs a title; mobile's header-less composer doesn't translate
    1:1.
  - **Part 2 — Create Post desktop navbar.** All 5 desktop Create Post
    frames (`2008:655`, `2009:2913`, `2009:5168` + the 2 new) now carry a
    real **`Navbar — header 4`** instance (of `2838:3502`, logged-in web
    nav — Create Post requires auth), 1440×90, at z-index 0 so it sits
    under the modal scrim exactly as the hand-drawn bar did. On the 3
    existing frames, 9 hand-drawn nav nodes each (`Rectangle 109` bar +
    loose `Group` logo + fake search + fake `Group 258` icon row + fake
    avatar/notification/message cluster) were removed. Z-order
    re-verified: nav idx 0, scrim idx 92, modal idx 93 — identical
    layering to before.
  - **Part 3 — auth-page navbar.** All 12 Login / Register / Forgot
    Password / Forgot Password — Link Sent / Reset Password / Reset
    Password — Success frames (desktop + mobile) had the full logged-out
    `header 7` / `header 7 — mobile` instance replaced with a clone of
    the Verify Email `Top Bar — Soccernity` frame (**there is no
    `Top Bar — Soccernity` component** — each Verify Email frame carries
    its own copy; desktop `5143:6636` 1440×90, mobile `5531:7265`
    390×90). Figma was simply behind the shipped app —
    `AuthChrome`/`AuthTopBar` (Decision Log #172, PR #152) has rendered
    the logo-only Top Bar for exactly these routes for months. Mobile
    keeps the **90px** Top Bar height (matching Verify Email mobile and
    the shipped 90px `AuthTopBar`, not the old 64px mobile nav); content
    has clearance, nothing overlaps. Final sweep: **zero `header 7`
    instances remain on any of the 12**. **Verify Email (all 8 states)
    and Guardian Consent (intentionally mixed — split-panel + distinct
    "Minor Account" status bar) re-verified live and deliberately left
    untouched.**
  - **Left in place, flagged (DL #214):** every auth frame's form body
    still contains a hidden (`visible = false`), inert secondary
    `Group 103` / `Logo` wordmark lockup — the shipped `SignupSplitScreen`
    no longer renders these. They cause no double-logo and no overlap
    (all hidden). Deleting the dead nodes from Figma is an optional micro
    follow-up, not done here.
  - Merged as PR #174.
- **`sprint-2/privacy-settings-design` (figma-design-system /
  figma-screen-builder, 2026-09-05) designs a new Privacy Settings page,
  desktop + mobile — the destination for the currently-unlinked
  "Privacy Settings" footer legal link. Figma design only, no app code.**
  Report: `docs/sprint-2-privacy-settings-design-report.md`. Decision
  Log **#215** added.
  - **New frames**: `Settings — Privacy` (`6178:14437`, cloned from
    `Settings — Overview` `2905:4798`) and `Settings — Privacy — Mobile`
    (`6185:14547`, cloned from `Settings — Overview — Mobile`
    `5607:7813`), reusing the family's nav-rail, list-row,
    `Settings Toggle` component (`5694:8219`) and section-header
    patterns; nav rail shows "Privacy and safety" active. Plus an
    on-canvas `Privacy Settings — Design Notes` annotation (`6191:15563`).
  - **Rows** (both viewports): Public profile (toggle On) · Download my
    data (chevron, request-style — no export/DSAR endpoint exists yet) ·
    Account status (chevron → `ON_CLICK NAVIGATE` to Settings —
    Deactivate Account (Intro) `2924:7358` / `5695:8262`) · Guardian
    approval — **under-18 only**, read-only "Approved" pill + "Change
    guardian email ›" link → Guardian Consent 11 (`5498:7164` /
    `5501:8536`) · Marketing emails — **disabled "Coming soon" row**.
  - **Two scope judgment calls, both flagged in the design note + DL
    #215, not silent omissions:**
    - **Cookie / local-storage preferences — deferred, NOT built.** The
      counsel-review risk register (item #15,
      `docs/legal-copy-draft-tos-privacy-policy.md`) records the
      cookie/local-storage audit hasn't happened; a toggle for something
      unaudited would misrepresent what's true. Add once the audit
      exists.
    - **Marketing / email opt-out — disabled "Coming soon" row, not a
      working toggle.** Verified live: `services/api` sends only
      transactional email (verification, guardian-consent,
      password-reset via Postmark); no marketing/newsletter capability
      exists anywhere. Becomes a real toggle if/when marketing email is
      introduced.
  - **OPEN, not resolved:** relationship between this new "Privacy" page
    and the existing `Settings — Privacy & Safety` screen (`2922:5382` /
    `5649:8092` — who-can-see-your-posts / who-can-DM-you interaction
    controls). Merge / nest / keep-separate is a founder IA call.
  - Token discipline: no new colour, no `brand/green-tint-28`, Light
    mode only. Paint audit — mobile 0 unbound; desktop 1 (pre-existing
    `#d9d9d9` shell cover-plate, inherited by every Settings frame).
  - Not merged — founder's call after review.
- **`sprint-2/club-fan-page-design` (figma-design-system /
  figma-screen-builder, 2026-09-05) extends `Club — Fan Page` desktop
  (`5841:9365`) + mobile (`5841:9431`) from their minimal placeholder
  state into the real page — a club feed + a member roster. Figma
  design only, no app code. Advances (does not close) Decision Log
  #157.** Report: `docs/sprint-2-club-fan-page-design-report.md`.
  Decision Log **#216** added; forward-pointer on **#157**.
  - **Header section carried forward UNCHANGED** on both frames — back
    link, club badge / name / `league • country` / member-count, and
    the Join button. Only the stale "Member posts and a full member
    list aren't part of club pages yet" scope note is removed (both are
    now designed).
  - **Club feed** — a "Club feed" section with post cards **cloned from
    the Community — Home Feed post-card pattern**
    (`Community — Home Feed — Mobile` `5701:8239`); illustrative member
    social posts (dummy data, same convention as every other
    pre-backend screen). **This closes the DESIGN side of Decision Log
    #157** — the club-scoped-posts endpoint still does not exist
    (`GET /posts/feed` never reads `Post.clubPageId`); `figma-to-code`
    must NOT wire the feed to real data until it does. **No composer**
    designed (no club-post-creation endpoint).
  - **Member roster** — a "Members" section: rows adapted from the
    post-card author-identity block (avatar + display name + `@handle`)
    + a secondary "Follow" button (`POST /users/:id/follow` is real).
    The roster is conceptually "users whose represented club is this
    club" — that field/endpoint doesn't exist yet either (Decision Log
    #74). Dummy members. **"View all members →" has no destination
    screen** (a dedicated full-roster screen isn't built) — flagged,
    not wired. The Admin `Users - team members` table (`917:218`) was
    checked and rejected as the base (moderation table — ban/delete
    actions, no avatars).
  - **Out of scope, founder-confirmed:** club announcements, fixtures,
    any other content — no data source, none designed.
  - Token discipline: no new colour, no `brand/green-tint-28`, Light
    mode only; both frames **0 unbound paints**. Post cards carry
    Montserrat (Community feed convention); new chrome uses Inter
    (Club Fan Page header type). On-canvas
    `Club — Fan Page — Design Notes` annotation added.
  - Not merged — founder's call after review.
- **`sprint-2/club-fan-page-backend` (backend-api, 2026-09-05) builds the
  backend the Club — Fan Page design (PR #176 / `sprint-2/club-fan-page-design`)
  needs — `services/api` only, no `apps/web`. Closes the backend half of
  Decision Log #157; adds Decision Log #217.** Report:
  `services/api/src/modules/clubs/README.md`'s "Club fan-page feed +
  roster" section.
  - **`GET /clubs/:id/feed` — the club fan-page feed.** Every `Post`
    whose `clubPageId` matches, newest-first, keyset-paginated. **Not**
    `GET /posts/feed` (Section 4.3), which is scoped to the caller's own
    posts + follows and deliberately never reads `Post.clubPageId`
    (`feed/README.md` point 2) — `getFeed`'s scope is unchanged, this is
    a separate route. Route lives on `ClubsController` but **delegates to
    a new `FeedService.getClubFeed`** — `ClubsModule` now imports
    `FeedModule` (which now `exports: [FeedService]`; no import cycle),
    so the response shape is **identical to `GET /posts/feed`**:
    `{ items: FeedPostWithViewerState[], nextCursor }`, per-caller
    `isLiked`/`isSaved`/`author.isFollowing` (Decision Log #153)
    included. `getFeed` and `getClubFeed` now share a private
    `paginatePostsWithViewerState` helper (they differ only in the WHERE
    clause). `JwtAuthGuard` only (reading, same as `GET /clubs` /
    `GET /posts/feed`); `ClubsService.assertClubExists(id)` runs first so
    a non-existent club is a 404. No restricted-pending-minor content
    filter needed — `POST /posts` is `GuardianConsentGuard`-gated
    (Decision Log #21), so a restricted-pending minor has no posts in any
    feed. Scope is `clubPageId` alone, not intersected with membership (a
    club page shows its posts to anyone who can open it).
  - **`GET /clubs/:id/members` — the club roster (Decision Log #217).**
    Keyset-paginated, `{ id, displayName }` per entry (the same narrow
    select `FOLLOW_USER_SELECT` uses; no `@handle`/avatar — no such
    `User` column, Decision Log #58). **Two real judgment calls, both
    flagged as Decision Log #217, not silently resolved:**
    - **Roster = `ClubPage.members`, NOT a "represented club" field.**
      The design captions it "users whose represented club is this
      club," but confirmed live: there is no represented-club field or
      endpoint (Decision Log #74's selector is designed, not built;
      `User.clubAffiliationId` is written by nothing). `ClubPage.members`
      (the `_ClubMembership` m2m `POST /clubs/:id/join` populates and
      `memberCount` caches) is the only populated club-membership
      mechanism — and what the Fan Page header's count already shows —
      so the roster is fan-page membership. When represented-club lands,
      whether the roster shows fans vs. representers is a genuine open
      question, not pre-decided.
    - **Restricted-pending minors are excluded from the roster** (filter:
      non-minor OR `guardian.consentStatus === 'confirmed'`), per
      CLAUDE.md non-negotiable #1 / Build Plan Section 8.3 and the same
      intent as `UsersService.assertFollowGraphVisible` (Decision Log
      #31/#41) — a restricted-pending minor *can* join a club (`POST
      /clubs/:id/join` is `JwtAuthGuard`-only), so without this their
      `displayName` would surface to any authenticated caller.
      Consequence, accepted: the visible roster can be shorter than
      `ClubPage.memberCount` (raw row count) — `memberCount` is "not
      authoritative in isolation" per its own schema comment. **Known
      inconsistency, flagged not fixed:** `GET /users/:id/followers` /
      `/following` do NOT filter restricted-pending minors from their
      *list entries* (only hide the whole graph when the profile owner
      `:id` is one) — whether those should match this roster's behavior
      is open.
    - Alphabetical keyset pagination by `displayName` (`id` tiebreaker) —
      `User` has no per-club "joined at" timestamp (the implicit
      `_ClubMembership` table has only its `A`/`B` id columns), same
      "no timestamp, order by name" approach `GET /clubs` uses; reuses
      `clubs/cursor.util.ts`'s `{ name, id }` cursor verbatim.
      `JwtAuthGuard` only.
  - **Verification** — all re-measured, not estimated. Mocked suite:
    **42 suites / 508 tests, 0 failures** (up from 489 — `feed.service.spec.ts`
    +6 for `getClubFeed`, `clubs.service.spec.ts` +6 for `getClubMembers`,
    `clubs.controller.http.spec.ts` +7 for the two new routes, which now
    also provides a mocked `FeedService`). e2e suite (real Postgres via
    docker-compose): **9 suites / 71 tests, 0 failures**
    (`test/clubs.e2e-spec.ts` went 13 → 19 tests, no new spec file; the
    prior documented full-e2e total had drifted, so treat 71 as the
    directly-measured current figure — the new block exercises
    the club feed's `clubPageId` filter + real viewer state, and the
    roster against a genuinely-seeded restricted-pending minor member,
    a confirmed-consent minor member, and real keyset pagination —
    category 3 of `test/README.md`'s guiding principle, a Prisma relation
    filter over the implicit `_ClubMembership` join table). `nest build`
    + `npm run lint` clean. `User`/`Guardian` safeguarding fields
    untouched — **zero `schema.prisma` diff** (no migration; both
    endpoints are plain reads).
  - `apps/web` NOT touched — wiring the Club — Fan Page screen's feed +
    roster to these endpoints is the separate `figma-to-code` follow-up
    this unblocks (`ClubFanPage.tsx` currently renders neither; its scope
    note "Member posts and a full member list aren't part of club pages
    yet" in the code will need updating then).
  - Not merged — founder's call after review.
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
- This file has one real Figma variable collection: **`Soccernity Theme`**
  (`VariableCollectionId:5096:2`), modes **Light** (`5096:0`, default) /
  **Dark** (`5096:1`), **14** COLOR variables — Sprint D created the original
  ten, PR #96 added `color/text/on-navy` and `brand/off-white`, PR #114
  added `semantic/alert` (`VariableID:5670:8226`, `#FA0606`, Light=Dark,
  Decision Log #99), and `sprint-2/design-cleanup-tokens-renames` added
  `color/shadow/elevated` (`VariableID:5973:2`, Light `brand/navy` @ 14% /
  Dark `#0D0F21` @ 45%, scope `EFFECT_COLOR`, Decision Log #118) — the
  file's first shadow token, paired with a new **effect style**
  `elevation/menu` (`DROP_SHADOW` x0 y4 blur16 spread0) that binds its
  colour to that variable. Confirm this
  directly (`get_variable_defs` / `figma.variables.getLocalVariableCollectionsAsync()`)
  before assuming any brief's claim about whether variables exist in this file
  — one already has gotten this wrong (`sprint-2/homepage-rebuild`'s second
  pass, which asserted the file had no variables at all; it didn't, and the
  agent caught it by checking live rather than trusting the brief). Full
  variable/value table in `docs/sprint-2-homepage-rebuild-report.md` §0.1 and
  `docs/sprint-2-homepage-rebuild-variables-report.md` §2.

### Figma-authoring gotchas

**This subsection did not exist before `sprint-2/decision-log-204-208-cleanup`,
despite at least five prior sessions each independently finding a gotcha and
writing "belongs in the file's standing Figma notes" or "recommend folding
into the file-wide Figma-notes gotcha list" — the exact drift this project's
own "Keeping this file current" section exists to prevent.** Decision Log
#199 and #201 were the two most recently flagged as explicitly still open
pending this fold-in; both are closed by their entry here. The other
scattered gotchas named inline in individual session bullets throughout
"Where things stand" (the variable-bound-paint-takes-its-alpha-from-the-
variable rule, the manually-set-`.y`-on-an-`AUTO`-positioned-auto-layout-
child rule, etc.) were **not** swept into this list by this pass — only
#199, #201, and the `frame.resize()`-on-GROUPs gotcha this same cleanup
session's own task text pointed at (which, on inspection, also did not
actually live in a real standing-notes section yet) are consolidated here.
A full sweep of the remaining scattered gotchas into this section is a
real, still-open follow-up, not done by this entry.

- **`frame.resize()` on a `layoutMode: NONE` (absolute-layout) frame applies
  each leaf's own constraints, and `GROUP`s have no constraints of their
  own** — their leaves resolve independently and drift by differing amounts
  when the parent frame is resized. Reparenting children into a fresh,
  correctly-sized shell (then re-asserting each child's snapshotted `x`/`y`)
  is the safe way to change a frame's width without corrupting
  absolute-positioned legacy content. Found independently by both the
  Articles Page split and `sprint-2/legal-pages-navbar-retrofit` sessions on
  different content, corroborating each other.
- **A paint bound to a variable that does not itself carry alpha (e.g.
  `brand/navy`, a plain opaque RGB), combined with a separate fractional
  paint-level `opacity`, silently resets to `opacity: 1` specifically at
  `createInstance()` time** — not only at `setBoundVariableForPaint()`
  construction time, which is the only timing this file's notes previously
  covered. Variables that carry their own alpha (`brand/green-tint`,
  `color/text/secondary`) are unaffected. Fix: use a literal, unbound paint
  at the same resolved value/opacity instead of a bound one for that specific
  paint — same visual result, no new colour introduced, immune to the bug.
  Found on the Admin Shell sidebar wash (Decision Log #199,
  `sprint-2/admin-shell-componentization`). No exhaustive file-wide audit
  for other occurrences of this exact pattern has been done.
- **`figma.union()` / `figma.subtract()` (and presumably
  `figma.intersect()`/`figma.exclude()`) discard the input shapes' own
  fills**, resetting the resulting `BOOLEAN_OPERATION` node to Figma's own
  default gray (`#D9D9D9`) regardless of what colour the input primitives
  were filled with. The fix must be applied to the resulting boolean node
  itself, not its now-irrelevant, consumed input primitives — always
  re-verify with a screenshot after any boolean operation, since this
  produces no error, only a silently wrong colour. Found while building the
  8 new Admin Shell nav icons (Decision Log #201,
  `sprint-2/admin-panel-fast-follow`) — all 8 initially rendered pale gray
  before this was caught.

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
