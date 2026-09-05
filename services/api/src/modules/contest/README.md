# contest module

Build target: **sprint-2/contest-data-model-backend** — genuinely new
architecture, authorised by the founder for this task. Decision Log #188
confirmed there was **no** backend Contest/Competition data model at all
(not partial, not stubbed). Anticipated by Decision Log #61 (monthly
phases), #70 (weeks-1–3 progressive fill), #71 (Contest is its own board
tab), #130 (points model), and #188 (the active-contest check the Create
Post mode-tab needs).

Decision Log entries added by this branch: **#218** (schema + endpoint
additions) and **#219** (the scoring weights — see `../points/README.md`).

## Scope — and what's deliberately NOT here

**IN:** the *Contest* mechanic — the fixed, weekly video-skill-challenge
cycle with real designed screens and a real user flow today.

**OUT (still Build Plan Section 2.2-deferred):** the broader *Competition*
umbrella from Decision Log #72/#73 — admin-created Prediction / Commentary
types with per-type `SCORE` columns and the "Admin — Create Competition"
screen. `PointsLedgerEntry.source` reserves `competition_result` for it;
nothing writes that today. Also OUT: the `GET /leaderboard` endpoint and
the `LeaderboardEntry` rollup (Build Plan Section 4.9 — Sprint 6); this
branch builds only the `PointsLedgerEntry` primitive they will read.

## The data model (`schema.prisma`)

| Model | Role |
|---|---|
| `ContestCycle` | One monthly cycle. `status`: `active` → `final` → `completed`. |
| `ContestRound` | A weekly round (week 1/2/3). `status`: `open` → `judged`. |
| `ContestEntry` | A `Post` submitted AS an entry. `@@unique([roundId, userId])` — one entry per user per weekly round. `@unique(postId)` — one entry per post. |
| `ContestRoundWinner` | The weekly top-3 (`position` 1/2/3, ties allowed). |
| `ContestStanding` | The monthly crowned top-3. |
| `PointsLedgerEntry` | Append-only points ledger (`../points/`). |

All User FKs are `onDelete: Cascade` (Decision Log #44) so
`AccountDeletionSweepService`'s single `tx.user.delete()` keeps working
with no per-table handling.

### Schema judgment calls (Decision Log #218)

- **One entry per user per weekly round** (`@@unique([roundId, userId])`).
  "Entries per player" is a *Competition* field (Decision Log #73), not
  spec'd for Contest — but one entry per week is the natural reading of a
  weekly skill challenge and keeps "weekly winners: top 3" unambiguous.
- **`position` ties are allowed** — no `@@unique([roundId, position])`.
  Decision Log #61(c) renders a tie as two rows sharing an ordinal.
- **`PointsLedgerEntry.refId` / `.minorUserId`-style plain strings, not
  FKs** — the ledger is an audit trail that must outlive what it points
  at, same reasoning as `ConsentAuditRecord`.
- **At most one non-`completed` cycle at a time** — enforced in
  `ContestService.createCycle`, not a DB constraint (a partial unique
  index on a string literal isn't worth it).

## The phase state machine

`ContestService.derivePhase(status, judgedRoundCount)` — **pure**, never
reads the clock. "Which week are we in" is driven by admin actions, not
wall time, so the phase is deterministic and fully testable.

| Phase | Condition | Figma (DL #61/#70) |
|---|---|---|
| `vacant` | active, 0 rounds judged | #70 step 1 ("Week 1 Phase 1") |
| `week_1` | active, 1 judged | #70 step 2 (3 rows) |
| `weeks_1_2` | active, 2 judged | #70 step 3 (6 rows) |
| `weeks_1_3` | active, 3 judged | #70 step 4 (9 rows, count DYNAMIC) |
| `final_live` | status `final` | #61 state 2 ("LEVEL 1 FINAL · LIVE") |
| `crowned` | status `completed` | #61 state 3 (monthly top 3) |

**Sequential judging** is enforced: week N cannot be judged while an
earlier week is still open (matches #70's progressive 3 → 6 → 9 fill).

## Endpoints (all genuine additions — no Section 4 line exists)

### User-facing (`ContestController`)

- **`GET /contest/current`** — `JwtAuthGuard`. The single call the Create
  Post "For Contest" mode-tab (Decision Log #188) and the Leaderboard
  Contest tab (Decision Log #61/#70) both read. Returns the running cycle
  (or the most-recent completed one as a fallback, so "crowned" lingers),
  its derived `phase`, `isAcceptingEntries` (the #188 boolean —
  `status === 'active'` AND a round open within its window),
  `weeklyWinners` (fills progressively), `monthlyStandings` (crowned
  only), and `callerEntry` (the caller's entry in the open round, if any).
- **`GET /contest/cycles/:id`** — `JwtAuthGuard`. One cycle in full, for
  the Contest tab's "past months" view.
- **`POST /contest/entries`** `{ postId }` — `JwtAuthGuard` +
  `GuardianConsentGuard`. Submits an already-created `Post` as this
  cycle's entry (the composer creates the `Post` via `POST /posts`
  first, so that path stays the single post-creation flow). Consent-gated
  the same way `POST /posts` / `POST /posts/:id/comments` are (Decision
  Log #21's broad reading of Section 5.7 "posting") — also
  defence-in-depth, since the referenced `Post` was itself created
  through the consent-gated `POST /posts`. 201 on success (always creates
  one row). 409 no active cycle / no open round / already entered this
  round / post already entered; 404 post not found; 403 not your post.

### Admin (`ContestAdminController`, `AdminJwtAuthGuard`)

The state-machine transitions — a User access token cannot reach any of
these (the separate `ADMIN_JWT_SECRET` path, see `modules/admin/README.md`):

```
POST /admin/contest/cycles                        create → 'active', phase 'vacant'
POST /admin/contest/cycles/:id/rounds/:week/results   judge a week → next phase, awards weekly-win points
POST /admin/contest/cycles/:id/final/open         all 3 judged → 'final', phase 'final_live'
POST /admin/contest/cycles/:id/crown              'final' → 'completed', phase 'crowned', awards crown points
```

- `createCycle` — 409 if a cycle is already running; auto-generates three
  7-day rounds from `startsAt` if `rounds` is omitted.
- `recordRoundResults` — `winners` may be empty (a "thin week", DL
  #61(b)); each entry must belong to this round; awards
  `CONTEST_WEEKLY_WIN_POINTS[position]` per winner inside one transaction
  with the winner rows + the round's `status` flip.
- `crownCycle` — each crowned `userId` must be a weekly winner of this
  cycle (Decision Log #61: the finalists ARE the weekly winners); awards
  `CONTEST_MONTHLY_CROWN_POINTS[position]`.

## Points wiring

`ContestService` calls `awardPoints` (from `../points/points.util`, a
plain function — see `../points/README.md`). Weekly-win and monthly-crown
awards are cumulative: a monthly winner keeps whatever weekly-win points
they earned. Baseline engagement points (post / like / follow) are wired
separately, directly in `FeedService` / `UsersService`'s existing
transaction callbacks.

## Verification

- **Mocked unit** (`contest.service.spec.ts`, `points.util.spec.ts`, two
  `*.controller.http.spec.ts`): every `derivePhase` branch; every
  `submitEntry` / `recordRoundResults` / `openFinal` / `crownCycle` /
  `createCycle` guard path; points awarded at the right weight per
  position; HTTP routing / DTO validation / guard wiring (the
  `GuardianConsentGuard` on `POST /contest/entries` is left real/DI-resolved,
  so "consent-gated" is a genuine regression test).
- **Real Postgres e2e** (`test/contest.e2e-spec.ts`) — per the task's
  "test the full state machine" standard: one cycle driven through
  **every** phase (`vacant → week_1 → weeks_1_2 → weeks_1_3 → final_live
  → crowned`), asserting the derived phase and the exact points totals in
  the real `PointsLedgerEntry` table at each step; sequential-judging
  rejection; one-entry-per-round; entries refused once all rounds are
  judged; non-weekly-winner refused for crowning; re-judge idempotency; a
  user token rejected by the admin routes; and baseline engagement points
  through the **real** `POST /posts` / `/posts/:id/like` /
  `/users/:id/follow` endpoints (including that a like → unlike → re-like
  never re-awards).

## `apps/web` NOT touched

Wiring the Create Post mode-tab and the Leaderboard Contest tab to these
endpoints is the separate `figma-to-code` follow-up this unblocks
(`LeaderboardPage.tsx`'s Contest tab currently ships a single dummy
"weekly winners" table per Decision Log #211).
