# Sprint 5 — Grassroots Record-Keeping in `apps/web`, PR 2 of 2: organiser flows

**Agent:** `figma-to-code` · **Date:** 2026-09-08 · **Branch:**
`sprint-5/grassroots-conversion-organiser` (off `sprint-5/grassroots-conversion-read`, PR 1) ·
**Scope:** `apps/web` only — no `services/api` code, no Figma writes. Not merged.

PR 1 (`sprint-5/grassroots-conversion-read`, Decision Log #270) shipped the read-only surfaces —
Browse Teams, the Public Team Page, the full 8-endpoint `api/grassroots.ts` client, the routes, and
the mobile-drawer nav entry. **This PR is the authenticated organiser half:** register a team,
schedule a fixture, and manage a fixture / log its result across the `scheduled → live → full_time`
status machine.

**Decision Log #271** added to Build Plan Section 9; a forward-pointer appended to **#270**'s Status.

---

## 1. What shipped

| File | Purpose |
|---|---|
| `src/pages/GrassrootsRegisterTeamPage.tsx` | **New.** Route `/grassroots/register` — Figma frame 1 (form) → frame 2 (confirmation), one route / internal step. `POST /teams`. |
| `src/pages/GrassrootsScheduleFixturePage.tsx` | **New.** Route `/grassroots/:teamId/fixtures/new` — Figma frames 3 / 4 (Opponent-TBD) / 5 (confirmation). `GET /teams/:id` + `POST /fixtures`. |
| `src/pages/GrassrootsFixturePage.tsx` | **New.** Route `/grassroots/fixtures/:fixtureId` — **one status-driven route** for Figma frames 6 (scheduled), 7 (live / score entry), 8 (full_time). `GET /fixtures/:id`, `PATCH /fixtures/:id/status`, `POST /fixtures/:id/result`. |
| `src/pages/grassroots/errors.ts` | **New.** `isAwaitingConsent(err)` — shared across the three write flows to tell a `GuardianConsentGuard` 403 apart from a `ForbiddenException` (not-your-team) 403. |
| `src/pages/grassroots/GrassrootsPage.css` | +form / segmented / callout / button / stepper / success / fixture-card styles (all `--sn-*` tokens, light theme). |
| `src/pages/GrassrootsTeamPage.tsx` | +organiser toolbar (see §3). |
| `src/app/router.tsx` | +3 routes, all `AppShell` children (no site footer), interleaved with the PR 1 grassroots routes. |
| `*.test.tsx` (3 new + `GrassrootsTeamPage.test.tsx` +2) | 20 new tests. |

**`api/grassroots.ts` is unchanged** — PR 1 shipped all 8 endpoints (`createTeam` / `createFixture`
/ `logResult` / `updateFixtureStatus` included) precisely so this PR adds no lines to it.

---

## 2. Routes

| Route | Screens | Backend |
|---|---|---|
| `/grassroots/register` | frames 1–2 | `POST /teams` |
| `/grassroots/:teamId/fixtures/new` | frames 3–5 | `GET /teams/:id`, `POST /fixtures` |
| `/grassroots/fixtures/:fixtureId` | frames 6–8 (status-driven) | `GET /fixtures/:id`, `PATCH /fixtures/:id/status`, `POST /fixtures/:id/result` |

**Why frames 6/7/8 collapse to one route:** they are the same screen at `fixture.status` =
`scheduled` / `live` / `full_time`. The page fetches the fixture and branches: `scheduled` → "Match
day" + "Start match"; `live` → "Match in play" + "Log the result"; a score-entry sub-view (reachable
from either `live`, or `scheduled` via "the match has already been played"); `full_time` → the
read-only "Final result" card. Splitting into `/…/result` would fight the backend's own single
status machine.

**Route ranking:** `register` and `fixtures` are static segments; React Router v8 ranks them above
the `:teamId` param, so `/grassroots/register` and `/grassroots/fixtures/:id` never resolve to
`GrassrootsTeamPage`. `/grassroots/:teamId/fixtures/new` (4 segments) and
`/grassroots/fixtures/:fixtureId` (3 segments) don't overlap.

---

## 3. Organiser toolbar on `GrassrootsTeamPage`

Decision Log #253 §6.7 flagged that the Figma team page "cannot conditionally show a 'Schedule a
fixture' CTA without a product decision" because "nothing in Section 4.5 tells the client whether
the current viewer is the organiser." **In code, the data now does:** `GET /teams/:id` returns
`createdById`, and the access token's `sub` claim *is* the user id (`decodeAccessToken`). So when
`team.createdById === decodeAccessToken(token)?.sub`, `GrassrootsTeamPage` renders:

- a **"Schedule a fixture"** link → `/grassroots/:teamId/fixtures/new`,
- a **"Manage"** link on each upcoming/live fixture row → `/grassroots/fixtures/:fixtureId`,
- an organiser-flavoured empty state ("Schedule one to start logging…").

This is **display-only** — every write is server-enforced (`POST /fixtures` is teamA-creator-only,
the result/status endpoints require either team's creator — Decision Log #255). `decodeAccessToken`
does no signature verification and is never a trust boundary, matching how `ProfilePage` /
`ClubFanPage` already use it.

---

## 4. The status machine and its error paths

### `PATCH /fixtures/:id/status` — legal moves only, illegal 409 shown verbatim

The UI only offers `scheduled → live` ("Start match"). `live → full_time` happens as a side effect
of logging the result. **Every other transition is a 409 from the server naming the current and
requested status** ("A fixture cannot move from `full_time` to `live`") — this is rendered
**verbatim as an alert**, not swallowed by a disabled button, and it triggers a `GET /fixtures/:id`
refetch so a stale page catches up to reality. (Decision Log #254.)

### `POST /fixtures/:id/result` — "first write is final"

`Result.fixtureId` is `@unique`; a second submission is a 409, race-tested in
`services/api`'s e2e layer (Decision Log #255). The UI treats that 409 as an **expected, explained
outcome**, not a failure: it shows the server's message as a `role="status"` notice (not a red
`role="alert"`), refetches the fixture, and the page flips to `full_time` showing **the score that
was actually recorded** by whoever won the race.

### 403 — two kinds, distinguished

| Server response | UI |
|---|---|
| `GuardianConsentGuard`: `{ message: "This account is awaiting guardian consent…" }` | inline "your account is awaiting guardian consent" + a link to `/guardian-consent` (mirrors `PostComposer.tsx`) |
| `ForbiddenException`: "You may only create/manage fixtures for a team you registered" | the server's own message, shown as an alert |

`isAwaitingConsent(err)` = `err.status === 403 && /guardian consent/i.test(err.message)`. The
message match is enough — `api/grassroots.ts`'s write functions already surface the server's
`message` via `errorMessageFrom`, so `code` doesn't need threading through.

---

## 5. Opponent selection (frames 3 + 4)

The backend away side is `teamBId` **XOR** `opponentName`, or neither — supplying both is a 400
(Decision Log #256/#260). The UI is a **3-way segmented choice** that makes the 400 unreachable:

- **Registered team** — a city search (`GET /teams?city=`, debounced, excluding the caller's own
  team) → pick one → `teamBId`. There is no team-name search in Section 4.5, so the field is a city
  filter, labelled as such.
- **Other team** — a free-text input → `opponentName` (frame 4's field, Decision Log #261).
- **Decide later** — neither; the fixture shows "Opponent TBC" (the frontend fallback PR 1 owns).

---

## 6. Judgment calls (flagged, not silent)

1. **`scheduledAt` uses native `<input type="date">` + `<input type="time">`**, combined
   client-side into one ISO value. The Figma reuses the shared "Calendar for scheduled task"
   component (Decision Log #257) — there is no React equivalent of it in this app (PR 1's pages and
   every other form here use plain HTML controls), so the native pickers are the honest equivalent.
2. **`GrassrootsFixturePage` renders the manage UI for any signed-in user.** `GET /fixtures/:id`
   returns no `createdById` (only `FIXTURE_TEAM_SELECT` = id/name/city/verified), so the page
   cannot client-side guard who the manager is. It surfaces the server's 403 instead. In practice
   the page is reached from the team-page organiser toolbar or the schedule confirmation, so the
   visitor is nearly always the organiser.
3. **`GrassrootsScheduleFixturePage` *can* guard** (`GET /teams/:id` has `createdById`), so a
   non-organiser gets "You can only schedule fixtures for a team you registered" instead of a dead
   form that 403s on submit.
4. **`semantic/alert` is still not a web token** (PR 1's flag) — the `LIVE` pill uses
   `--sn-brand-green` + a small `--sn-brand-navy` dot.
5. **On a `scheduled` fixture, "the match has already been played — log the result"** opens the
   score form directly. `POST /fixtures/:id/result` accepts `scheduled` *or* `live` status
   (grassroots.service.ts), and real grassroots organisers often log after the fact — the Figma's
   frame 6 only shows "Start match" but the backend explicitly supports this path.
6. **The `full_time` page shows "Result saved" (with a success tick) only when the result was just
   logged in-session**; a plain revisit shows a neutral "Full time" heading and the read-only card.
7. **A `full_time` fixture with no `Result` row** (reachable only if a future UI adds a bare `PATCH
   live → full_time`) renders "ended" instead of a score. This PR does not add that path — the only
   route to `full_time` here is logging a result.

---

## 7. Verification

- `npx tsc --noEmit` — clean.
- `npm run lint` — clean.
- `npm run build` — clean production bundle.
- `npx vitest run` — **32 files / 215 tests, 0 failures** (up from 29 / 195 at PR 1:
  `GrassrootsRegisterTeamPage.test.tsx` +5, `GrassrootsScheduleFixturePage.test.tsx` +6,
  `GrassrootsFixturePage.test.tsx` +7, `GrassrootsTeamPage.test.tsx` +2). The fixture-page tests
  explicitly cover the illegal-transition 409 shown verbatim, and the "first write is final" 409
  treated as a notice-not-error with a refetch.
- Dev-server smoke test (`npm run dev`): `/`, `/grassroots`, `/grassroots/register`,
  `/grassroots/:id`, `/grassroots/:id/fixtures/new`, `/grassroots/fixtures/:id`, `/community` all
  HTTP 200, clean dev-server log.
- **No real browser / Playwright check** — none is available in this environment, the same ceiling
  as every prior `apps/web` figma-to-code PR.

---

## 8. Handover

**The Grassroots feature is now fully wired into `apps/web`** — design (#253/#261/#265/#266) →
backend (#254/#255/#256/#259/#260) → read-only frontend (#270) → organiser frontend (#271).

Still open, unchanged:

- **#266** — the desktop icon-navbar Grassroots glyph (a `figma-design-system` shared-component
  task touching the `header 4` / `header 7` sets). Grassroots is reachable via the mobile drawer,
  direct URL, and the "← Teams" links; full desktop discoverability waits on this.
- **#257** — the Figma "Calendar for scheduled task" component's own debt (no mobile variant, a
  "January 2022" sample month). Not blocking — this PR uses native date/time inputs.
- **Result correction / dispute** — there is no amend path in MVP (`services/api` grassroots README
  flags it as a parked founder candidate). The score-entry callout ("Check it before you save")
  reflects that.
