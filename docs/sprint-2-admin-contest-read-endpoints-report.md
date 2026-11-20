# sprint-2/admin-contest-read-endpoints — report

**Branch:** `sprint-2/admin-contest-read-endpoints` (off `main`)
**Agent:** backend-api, 2026-09-06
**Scope:** `services/api` only. No Figma, no `apps/admin`, no `apps/web`.
**Decision Log:** adds **#241**; appends a forward-pointer to **#239**'s Status.

Task 1 of a 3-task sequence resolving **Decision Log #239** (the Contest
admin console in `apps/admin` currently ships as disclosed stubs built
against a stale Figma "task" model with no backend entity). Task 2
(`figma-screen-builder`) designs screens against the response shapes
below; Task 3 (`figma-to-code`) converts them.

---

## The gap closed

The 4 existing admin **write** endpoints —
`POST /admin/contest/cycles`, `.../cycles/:id/rounds/:week/results`,
`.../cycles/:id/final/open`, `.../cycles/:id/crown` — consume `entryId` /
`userId` arrays, but **nothing returned those ids**. There was no admin
read endpoint at all (`GET /contest/current` and `GET /contest/cycles/:id`
are user-JWT-only and never expose `entryId`). An admin could not see the
running cycle, its phase, who entered a round, or what each entrant
submitted — so judging a week from a UI was impossible.

## What shipped — 3 GETs on `ContestAdminController`

All inherit the class-level `@UseGuards(AdminJwtAuthGuard)` (the isolated
`ADMIN_JWT_SECRET` / `aud: "admin-console"` path — Decision Log #54). A
User access token is rejected (401). The 4 write endpoints and every
user-facing Contest endpoint are unchanged.

| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/contest/cycles` | Every cycle, newest first (by `createdAt`). "Cycle history" list. |
| GET | `/admin/contest/current` | The running cycle (`active`\|`final`), else the most-recently `completed` one. Hub screen. |
| GET | `/admin/contest/cycles/:id` | One cycle in full incl. every round's `entries[]`. 404 if unknown. |

### Pagination judgment call

`GET /admin/contest/cycles` is a **plain list, no pagination**. A monthly
cycle is ~12 rows/year; keyset paging would be premature complexity. If it
is ever needed, the `feed`/`contest` cursor conventions apply (documented
in `contest/README.md`), not a third scheme.

### `body` vs `contentText`

The task brief lists `post: { id, body, ... }`. The real `Post` model
field is **`contentText`** (see `feed`'s `POST_SELECT`). The endpoints and
types use `contentText` and match `POST_SELECT`'s narrow field set
exactly — flagged here per the brief's own "match the real select"
instruction.

### List = short summary, detail = full entries

`AdminContestCycleListItem` deliberately carries only a per-round
`entryCount` (a `_count`, no rows pulled) plus the existing
weekly-winner / standings summaries — **not** the per-entry `entries`
array. The full `entries` array (the only place `entryId` surfaces) is on
the two detail responses. This keeps the history list lean and gives the
screen designer a clear list-vs-detail split.

---

## Response type definitions (`contest.types.ts`)

```ts
// A ContestRoundSummary plus the count of entries submitted into it.
export interface AdminContestRoundSummary extends ContestRoundSummary {
  entryCount: number;
}

// GET /admin/contest/cycles — one item.
export interface AdminContestCycleListItem {
  cycle: ContestCycleSummary;
  phase: ContestPhase;
  rounds: AdminContestRoundSummary[];
  weeklyWinners: ContestWinnerSummary[];
  monthlyStandings: ContestStandingSummary[];
}

export interface AdminContestCycleListResponse {
  items: AdminContestCycleListItem[];
}

// One contest entry as an admin sees it for judging — the only place
// `entryId` becomes visible. `position` is this entry's
// ContestRoundWinner.position if it won its round, else null.
export interface AdminContestEntry {
  entryId: string;
  submittedAt: Date;             // ISO string over HTTP
  entrant: {
    userId: string;
    displayName: string;
  };
  post: {
    id: string;
    contentText: string;
    mediaUrls: string[];
    createdAt: Date;             // ISO string over HTTP
    likeCount: number;
    commentCount: number;
  };
  position: number | null;
}

// A round in the admin detail view — base summary + entryCount + entries.
export interface AdminContestRoundDetail extends ContestRoundSummary {
  entryCount: number;
  entries: AdminContestEntry[];
}

// GET /admin/contest/cycles/:id
export interface AdminContestCycleDetailResponse {
  cycle: ContestCycleSummary;
  phase: ContestPhase;
  rounds: AdminContestRoundDetail[];
  weeklyWinners: ContestWinnerSummary[];
  monthlyStandings: ContestStandingSummary[];
}

// GET /admin/contest/current — same detail shape; cycle/phase null and
// arrays empty ONLY when no ContestCycle has ever been created.
export interface AdminCurrentContestResponse {
  cycle: ContestCycleSummary | null;
  phase: ContestPhase | null;
  rounds: AdminContestRoundDetail[];
  weeklyWinners: ContestWinnerSummary[];
  monthlyStandings: ContestStandingSummary[];
}
```

Reused unchanged from the existing user-facing types: `ContestCycleSummary`
(`id, title, status, startsAt, endsAt, finalOpenedAt, crownedAt`),
`ContestPhase` (`vacant | week_1 | weeks_1_2 | weeks_1_3 | final_live |
crowned`), `ContestRoundSummary` (`id, weekNumber, status, opensAt,
closesAt, judgedAt`), `ContestWinnerSummary` (`weekNumber, position,
userId, displayName, entryId, postId`), `ContestStandingSummary`
(`position, userId, displayName`).

---

## Actual request / response examples

### `GET /admin/contest/cycles`

Request:

```
GET /admin/contest/cycles
Authorization: Bearer <admin access token>
```

Response `200` (two cycles, newest first; week 1 judged, weeks 2–3 open):

```json
{
  "items": [
    {
      "cycle": {
        "id": "6b1f5f2e-4b3a-4c9d-9e21-2f7c1a8d4e10",
        "title": "September 2026 Contest",
        "status": "active",
        "startsAt": "2026-09-01T00:00:00.000Z",
        "endsAt": "2026-11-30T00:00:00.000Z",
        "finalOpenedAt": null,
        "crownedAt": null
      },
      "phase": "week_1",
      "rounds": [
        {
          "id": "b0a1…-week1",
          "weekNumber": 1,
          "status": "judged",
          "opensAt": "2026-09-01T00:00:00.000Z",
          "closesAt": "2026-09-08T00:00:00.000Z",
          "judgedAt": "2026-09-08T10:04:00.000Z",
          "entryCount": 2
        },
        {
          "id": "b0a1…-week2",
          "weekNumber": 2,
          "status": "open",
          "opensAt": "2026-09-08T00:00:00.000Z",
          "closesAt": "2026-09-15T00:00:00.000Z",
          "judgedAt": null,
          "entryCount": 1
        },
        {
          "id": "b0a1…-week3",
          "weekNumber": 3,
          "status": "open",
          "opensAt": "2026-09-15T00:00:00.000Z",
          "closesAt": "2026-09-22T00:00:00.000Z",
          "judgedAt": null,
          "entryCount": 0
        }
      ],
      "weeklyWinners": [
        { "weekNumber": 1, "position": 1, "userId": "u-ada", "displayName": "Ada B.", "entryId": "e-ada-w1", "postId": "p-ada-w1" },
        { "weekNumber": 1, "position": 2, "userId": "u-ben", "displayName": "Ben C.", "entryId": "e-ben-w1", "postId": "p-ben-w1" }
      ],
      "monthlyStandings": []
    },
    {
      "cycle": {
        "id": "1a2b3c4d-0000-4000-8000-000000000001",
        "title": "August 2026 Contest",
        "status": "completed",
        "startsAt": "2026-08-01T00:00:00.000Z",
        "endsAt": "2026-08-31T00:00:00.000Z",
        "finalOpenedAt": "2026-08-25T09:00:00.000Z",
        "crownedAt": "2026-08-31T18:00:00.000Z"
      },
      "phase": "crowned",
      "rounds": [
        { "id": "…", "weekNumber": 1, "status": "judged", "opensAt": "…", "closesAt": "…", "judgedAt": "…", "entryCount": 5 },
        { "id": "…", "weekNumber": 2, "status": "judged", "opensAt": "…", "closesAt": "…", "judgedAt": "…", "entryCount": 4 },
        { "id": "…", "weekNumber": 3, "status": "judged", "opensAt": "…", "closesAt": "…", "judgedAt": "…", "entryCount": 6 }
      ],
      "weeklyWinners": [ /* … */ ],
      "monthlyStandings": [
        { "position": 1, "userId": "u-ada", "displayName": "Ada B." },
        { "position": 2, "userId": "u-ken", "displayName": "Ken O." },
        { "position": 3, "userId": "u-ben", "displayName": "Ben C." }
      ]
    }
  ]
}
```

`{ "items": [] }` when no cycle has ever been created.

### `GET /admin/contest/cycles/:id`

Request:

```
GET /admin/contest/cycles/6b1f5f2e-4b3a-4c9d-9e21-2f7c1a8d4e10
Authorization: Bearer <admin access token>
```

Response `200` (week 1 judged — note `position` on the two winning
entries and `null` on the also-ran):

```json
{
  "cycle": {
    "id": "6b1f5f2e-4b3a-4c9d-9e21-2f7c1a8d4e10",
    "title": "September 2026 Contest",
    "status": "active",
    "startsAt": "2026-09-01T00:00:00.000Z",
    "endsAt": "2026-11-30T00:00:00.000Z",
    "finalOpenedAt": null,
    "crownedAt": null
  },
  "phase": "week_1",
  "rounds": [
    {
      "id": "b0a1…-week1",
      "weekNumber": 1,
      "status": "judged",
      "opensAt": "2026-09-01T00:00:00.000Z",
      "closesAt": "2026-09-08T00:00:00.000Z",
      "judgedAt": "2026-09-08T10:04:00.000Z",
      "entryCount": 3,
      "entries": [
        {
          "entryId": "e-ada-w1",
          "submittedAt": "2026-09-03T09:12:00.000Z",
          "entrant": { "userId": "u-ada", "displayName": "Ada B." },
          "post": {
            "id": "p-ada-w1",
            "contentText": "week 1 — outside-of-the-boot volley, 3 takes",
            "mediaUrls": ["https://cdn.example/ada-w1.mp4"],
            "createdAt": "2026-09-03T09:10:00.000Z",
            "likeCount": 12,
            "commentCount": 3
          },
          "position": 1
        },
        {
          "entryId": "e-ben-w1",
          "submittedAt": "2026-09-04T14:40:00.000Z",
          "entrant": { "userId": "u-ben", "displayName": "Ben C." },
          "post": {
            "id": "p-ben-w1",
            "contentText": "my week 1 entry",
            "mediaUrls": ["https://cdn.example/ben-w1.mp4"],
            "createdAt": "2026-09-04T14:38:00.000Z",
            "likeCount": 4,
            "commentCount": 0
          },
          "position": 2
        },
        {
          "entryId": "e-cid-w1",
          "submittedAt": "2026-09-05T20:01:00.000Z",
          "entrant": { "userId": "u-cid", "displayName": "Cid D." },
          "post": {
            "id": "p-cid-w1",
            "contentText": "late entry, first attempt at this one",
            "mediaUrls": [],
            "createdAt": "2026-09-05T19:59:00.000Z",
            "likeCount": 1,
            "commentCount": 1
          },
          "position": null
        }
      ]
    },
    {
      "id": "b0a1…-week2",
      "weekNumber": 2,
      "status": "open",
      "opensAt": "2026-09-08T00:00:00.000Z",
      "closesAt": "2026-09-15T00:00:00.000Z",
      "judgedAt": null,
      "entryCount": 0,
      "entries": []
    },
    {
      "id": "b0a1…-week3",
      "weekNumber": 3,
      "status": "open",
      "opensAt": "2026-09-15T00:00:00.000Z",
      "closesAt": "2026-09-22T00:00:00.000Z",
      "judgedAt": null,
      "entryCount": 0,
      "entries": []
    }
  ],
  "weeklyWinners": [
    { "weekNumber": 1, "position": 1, "userId": "u-ada", "displayName": "Ada B.", "entryId": "e-ada-w1", "postId": "p-ada-w1" },
    { "weekNumber": 1, "position": 2, "userId": "u-ben", "displayName": "Ben C.", "entryId": "e-ben-w1", "postId": "p-ben-w1" }
  ],
  "monthlyStandings": []
}
```

Response `404` for an unknown id:

```json
{ "statusCode": 404, "message": "Contest cycle not found", "error": "Not Found" }
```

### `GET /admin/contest/current`

Same body shape as `GET /admin/contest/cycles/:id` when a cycle exists
(running cycle preferred, else most-recently `completed`).

Response `200` when **no** cycle has ever been created:

```json
{ "cycle": null, "phase": null, "rounds": [], "weeklyWinners": [], "monthlyStandings": [] }
```

### Auth failures

```
GET /admin/contest/cycles                       (no bearer)     → 401 "Missing bearer token"
GET /admin/contest/cycles  (Bearer <USER token>)                → 401 (signature fails ADMIN_JWT_SECRET)
```

---

## Safeguarding

Contest entries are `Post`s by real users. **Confirmed in code that a
restricted-pending minor can never reach these admin reads, so no minor
filter was added** (per the task brief's instruction not to add one
absent a real path):

- `ContestEntry.userId` is always the submitted `Post`'s `authorId`
  (`ContestService.submitEntry` sets `userId` to the caller and rejects a
  post the caller doesn't own).
- `POST /posts` is `GuardianConsentGuard`-gated, and `POST /contest/entries`
  is **also** `GuardianConsentGuard`-gated (defence-in-depth) — a
  restricted-pending minor can create neither a `Post` nor a
  `ContestEntry`.
- `Guardian.consentStatus` only ever transitions `pending → confirmed`
  (grep across `services/api/src`: the single write is
  `guardian-consent.service.ts` setting `'confirmed'`; there is no
  reversal path anywhere).
- `User.dateOfBirth` / `User.isMinor` are immutable after registration
  (`UpdateUserDto` allows `displayName` + `phone` only).

So an entry that was valid at submission cannot retroactively become a
restricted minor's, and a restricted minor cannot create one. The
`ContestRoundWinner` / `ContestStanding` rows these reads join through are
themselves derived from `ContestEntry`.

---

## Implementation notes

- `ADMIN_CYCLE_LIST_INCLUDE` and `ADMIN_CYCLE_DETAIL_INCLUDE` each **spread
  `CYCLE_GRAPH_INCLUDE`** and layer on `rounds._count.entries` /
  `rounds.entries` respectively — phase derivation (`derivePhase`) and
  summary shaping (`toCycleSummary` / `toRoundSummary` / `toWeeklyWinners`
  / `toStandings`) are reused verbatim, nothing reinvented.
- The winner-position join uses the `ContestEntry.winner`
  (`ContestRoundWinner?`) back-relation — `entry.winner?.position ?? null`.
- `getCurrentContestForAdmin` mirrors `getCurrentContest`'s exact
  two-step resolution (`status in [active, final]` by `createdAt desc`,
  then `status = completed` by `crownedAt desc`).
- Route order on the controller: `GET cycles` → `GET current` →
  `GET cycles/:id` (declared before the `POST` routes), so Nest never
  matches the literal `current` segment against `:id` — the same
  discipline `ContestController` documents for its own routes.

## Zero `schema.prisma` diff

`git diff --stat -- services/api/prisma/schema.prisma` is empty. Both
endpoints are plain reads — no migration. `User` / `Guardian`
safeguarding fields untouched.

## Verification

| Suite | Before | After |
|---|---|---|
| Mocked unit (`npx jest`) | 46 suites / 584 tests, 0 failures | **46 suites / 598 tests, 0 failures** (+14) |
| e2e (`npm run test:e2e`, real Postgres/Redis) | 11 suites / 81 tests, 0 failures | **11 suites / 83 tests, 0 failures** (+2) |

- `nest build` — clean.
- `npm run lint` — clean.
- **Unit** (`contest.service.spec.ts` +7, `contest-admin.controller.http.spec.ts`
  +7): the list newest-first + per-round `entryCount`, empty-list case; the
  detail 404, the full `entries` array with entrant / `POST_SELECT` post /
  winner-position join, empty-round; `current` prefers active/final,
  falls back to completed, all-null when none; all 3 GET routes return
  200 through the (overridden) guard and forward to the right service
  method with no `:id`/`current` collision; a 404 propagates; and — with
  the guard denied — all 3 GETs are **403 with the service never called**
  (the routes are genuinely guard-protected, not accidentally open).
- **e2e** (`test/contest.e2e-spec.ts` +2, extends the existing file — a
  genuinely novel Prisma relation graph, `test/README.md` category 3):
  create a cycle → two real users enter week 1 via the **real**
  `POST /contest/entries` → `GET /admin/contest/cycles/:id` surfaces the
  real `entryId`s (asserted equal to the real `ContestEntry` rows via a
  direct Prisma query) → judge week 1 using exactly those ids →
  `GET /admin/contest/cycles/:id` now shows `position: 1` / `2` (asserted
  against the real `ContestRoundWinner` rows) → `GET /admin/contest/current`
  reports `phase: "week_1"` and the running cycle → `GET /admin/contest/cycles`
  lists it with `entryCount` and **no** per-entry array. Plus: 404 for an
  unknown cycle id, the all-null `/current` shape when no cycle exists,
  and a User access token rejected (401) on the admin read surface.

## What this does NOT do (Tasks 2 & 3)

- No Figma screens — `figma-screen-builder` designs the cycle / round /
  judge / final / crown workflow screens against these shapes next.
- No `apps/admin` code — the Contest section there stays a disclosed stub
  until `figma-to-code` (Task 3) wires it to these endpoints (and the 4
  existing write endpoints).
- Decision Log #239 stays **Open** — Task 1 begins its resolution; the
  forward-pointer on #239 records that Tasks 2/3 follow.
