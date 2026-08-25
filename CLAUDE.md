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
