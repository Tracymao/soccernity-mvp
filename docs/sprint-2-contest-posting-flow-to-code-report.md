# sprint-2/contest-posting-flow-to-code — report

**Agent:** figma-to-code · **Date:** 2026-09-06
**Scope:** `apps/web` only — no `services/api` code touched.
**Depends on (both merged):** PR G `sprint-2/create-post-desktop-and-auth-navbar-fixes` (#174);
PR J1 `sprint-2/contest-data-model-backend` (#178).
**Decision Log:** frontend half of **#148** and **#188** resolved; **#211** updated;
forward-pointers appended to all three in Build Plan Section 9.

---

## What this PR does

Wires the "Create a Post — For Contest" flow to the real Contest endpoints from PR J1,
builds the `/contest` page the Figma design and the Leaderboard connectors reference, and
replaces the Leaderboard Contest tab's single dummy state with real `GET /contest/current`
data.

## Backend contract (confirmed live, not assumed)

`services/api/src/modules/contest` (PR #178):

| Endpoint | Guard | Used here for |
|---|---|---|
| `GET /contest/current` | `JwtAuthGuard` | composer mode-tab visibility, ContestPage, Leaderboard Contest tab |
| `POST /contest/entries` `{ postId }` | `JwtAuthGuard` + `GuardianConsentGuard` | contest-mode submit (after `POST /posts`) |
| `GET /contest/cycles/:id` | `JwtAuthGuard` | client added for completeness; no UI consumes it yet |

`GET /contest/current` returns `{ cycle, phase, isAcceptingEntries, activeRound, rounds,
weeklyWinners, monthlyStandings, callerEntry }`. `phase` is the derived state machine
(`vacant → week_1 → weeks_1_2 → weeks_1_3 → final_live → crowned`). `isAcceptingEntries`
is Decision Log #188's exact flag: cycle `active` AND a round open within its window.

`POST /contest/entries` deliberately references an **already-created** `Post` — the
composer calls `POST /posts` first, so that stays the single post-creation path (its
`GuardianConsentGuard` / validation / notification wiring is not duplicated).

## New files

- **`apps/web/src/api/contest.ts`** — client mirroring `contest.types.ts` exactly, with
  `Date` fields typed as the ISO strings JSON serialises them to. Own `ContestApiError`
  (with `status`), Bearer auth, `VITE_API_BASE_URL` — same convention as `api/feed.ts` /
  `api/clubs.ts`.
- **`apps/web/src/pages/ContestPage.tsx`** + **`pages/contest/ContestPage.css`** — route
  `/contest`.
- **`apps/web/src/pages/ContestPage.test.tsx`**, **`pages/contest/ContestFlow.test.tsx`**.

## The composer (`PostComposer.tsx`)

- **Mode-tab row** ("Create a Post | Contest 1") shown **iff**
  `contest.isAcceptingEntries` (Decision Log #148, resolved: visibility is driven by
  whether a contest exists, not by which mode the user picked). No contest accepting
  entries → the composer renders exactly the plain post form with no tabs (Figma
  "No Active Contest", `5982:10932`).
- **Contest mode**: caption → `createPost({ contentText })` → `submitContestEntry(post.id)`.
  On success: prepend the post to the feed (it *is* a real post — `GET /posts/feed`
  returns it), flip to a "your entry is in for this week" note, and fire
  `onContestSubmitted` so `CommunityPage` refetches `GET /contest/current` (populating
  `callerEntry`).
- `callerEntry` set → a "you've already entered this week (week N)" panel replaces the
  form (Figma badge concept).
- **403** on either call → the existing restricted-pending message linking to
  `/guardian-consent`. If `POST /posts` succeeds but the entry submission fails (409
  race, etc.), the post is still shown in the feed with an honest "your post was
  published, but …" note rather than being silently lost.
- `/community?compose=contest` deep-links contest mode. `GET /contest/current` resolves
  *after* mount, so the deep-link is applied via a `useEffect` on `contestOpen`, not at
  `useState` init.

## Attachment restriction — scoped exactly as asked

The task: *"video files only for contest-tagged posts specifically — confirm this does
not affect the attachment restriction (or current lack thereof) on any other post type."*

- **Contest mode**: a single disabled **"Upload a video"** affordance (contest entries
  are video-skill challenges — Figma `5818:9020` shows a video icon + "Upload file").
- **Plain post mode**: the existing disabled photo / video / poll row ("Attach photos or
  videos", Figma `5701:8345`).
- **This is a UI-affordance difference only.** There is **no media-upload endpoint
  anywhere in Section 4** and this PR adds none. `CreatePostDto`'s `mediaUrls` allowlist
  is unchanged (any URL, max 10, no type check); `POST /contest/entries` takes only
  `{ postId }`. Confirmed by grep that `PostComposer` is the **only** composer in
  `apps/web`, used **only** by `CommunityPage`. Club posts, banter posts, and the feed
  read-side (`PostCard`'s `mediaUrls` link rendering) are untouched. When a real upload
  arrives, the video-only rule for contest entries would need enforcing server-side
  then — flagged, not built.

## `/contest` page (Figma `2155:1062`)

Login-gated (Decision Log #129). Wired to `GET /contest/current`:

- "This month's Contest" eyebrow + `cycle.title`.
- Static "How Contest works" copy (from the frame — monthly, four rounds, weeks 1–3
  weekly video challenges → weekly top 3s → Week 4 Level 1 final → month's overall top 3
  on the Leaderboard).
- A phase-derived "this week" section: `activeRound.weekNumber` + `closesAt` when
  accepting entries; `final_live` / `crowned` / no-cycle copy otherwise.
- The caller's own `callerEntry` status, **or** an "Enter this week's contest" →
  `/community?compose=contest` CTA (only while `isAcceptingEntries` and not already
  entered).
- The real `weeklyWinners` and `monthlyStandings` (crowned) as simple lists.
- "View the Contest leaderboard →" → `/leaderboard?tab=contest`.

Under `FooterLayout` (Leaderboard-adjacent; the Figma frame carries the site footer).
**Not added to nav** — reached via the composer's contest-mode success message and the
Leaderboard connector, matching how the frame is reached in the design.

`GET /contest/current` has **no** endpoint that lists a round's entries, so this page
shows the caller's own entry + judged winners only — not a gallery of every entry.
Flagged, not faked.

## Leaderboard Contest tab (updates Decision Log #211)

`LeaderboardPage.tsx`'s Contest tab was `CONTEST_ROWS` — a single dummy "weekly winners"
table (Decision Log #211's disclosed "one representative state" simplification). Now:

- `CONTEST_ROWS` **deleted** from `leaderboardData.ts`.
- New `ContestBoard` component wired to `GET /contest/current`: a phase banner
  (one line per `phase`), then either the real `weeklyWinners` table (WEEKLY ROUND |
  WINNER), the real `monthlyStandings` table (RANK medal | PLAYER, `crowned` only), or a
  vacant status card — plus the "View this week's contest ›" connector → `/contest`
  (Decision Log #61/#70/#71).
- **Winner rows carry no club or points field from the endpoint**, so the Figma
  "CLUB" / "WEEKLY POINTS" columns are **omitted, not filled with dummy data** — the
  same honesty `ProfilePage.tsx` applies to its unbacked fields.
- `?tab=contest` deep-links the tab (used by the ContestPage connector).
- A failed `GET /contest/current` degrades to a soft in-tab message and never blocks the
  Overall board.
- **Overall + Competition boards unchanged** — still illustrative (Sprint 6 / Decision
  Log #72/#73). A one-line note now says so on the Competition board; the header meta
  line is tab-aware ("Contest board — live data" vs the illustrative-data note).

## Verification

- `npx tsc --noEmit` — clean.
- `npm run lint` — clean.
- `npm run build` — clean production bundle.
- `npx vitest run` — **22 files / 146 tests, 0 failures** (up from 20 / 132):
  - `contest/ContestFlow.test.tsx` (**+1**) — the full path: submit a contest entry on
    Community (mocked `createPost` + `submitContestEntry`), assert `submitContestEntry`
    was called with the created post's id, then render ContestPage with `GET
    /contest/current` reflecting `callerEntry` and assert the entry shows, then render
    `LeaderboardPage?tab=contest` with that entry now a `weeklyWinner` and assert it
    shows. One post id threaded through all three.
  - `ContestPage.test.tsx` (**+4**) — login prompt / no API call; current cycle + task +
    "enter" CTA while open; `callerEntry` replaces the CTA; crowned monthly winners.
  - `CommunityPage.test.tsx` (**+3**) — no Contest tab when no contest; `POST /posts`
    then `POST /contest/entries` with the new post's id + feed prepend + success note;
    "already entered" state from `callerEntry`.
  - `LeaderboardPage.test.tsx` (**net +3**) — the stale dummy-`CONTEST_ROWS` test
    replaced with real-weekly-winners; `?tab=contest` deep-link; crowned standings;
    vacant state.
- Dev-server smoke test: `/`, `/community`, `/contest`, `/leaderboard`,
  `/leaderboard?tab=contest`, `/community?compose=contest` all HTTP 200.
- **No real browser / Playwright check available in this environment** — same ceiling as
  every prior `apps/web` PR.

## Not wired (flagged — no endpoint)

- An actual video upload (no media-upload endpoint in Section 4).
- A gallery of a round's entries (`GET /contest/current` exposes `callerEntry` +
  judged winners only, no list-round-entries route).
- The "past months" view — `getContestCycle` client exists in `api/contest.ts` but no
  UI consumes it yet.
