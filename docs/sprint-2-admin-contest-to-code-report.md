# sprint-2/admin-contest-to-code — report

**Branch:** `sprint-2/admin-contest-to-code` (off `main`)
**Agent:** figma-to-code, 2026-09-06
**Scope:** `apps/admin` only. No `services/api`, no `apps/web`.
**Decision Log:** adds **#243**; flips **#239** from Open to **Resolved** with a
forward-pointer to the full `#241 + #242 + #243` arc. **This closes Decision
Log #239.**

Task 3 of 3. Task 1 (`#241`, PR #202) shipped the admin read endpoints; Task 2
(`#242`, PR #203) designed 16 real Figma screens. This pass converts them.

---

## What changed

### Added

| File | Purpose |
|---|---|
| `apps/admin/src/api/contest.ts` | Client for `/admin/contest/*` — mirrors `services/api/src/modules/contest/contest.types.ts`'s `Admin*` shapes exactly, all via `adminFetch` (isolated admin auth, transparent 401→refresh). 3 reads + 4 writes. |
| `apps/admin/src/pages/contest/contest.css` | All screen styling. `--sn-*` tokens only, light mode. Blocked / destructive actions are navy, not red (no destructive token — non-negotiable #3). |
| `apps/admin/src/pages/contest/contestShared.tsx` | `formatDate` / `formatDateTime` / `ordinal`, `PhaseStrip`, `StatusPill`, `PositionChips` (1st/2nd/3rd/None selector, shared by Judge Week + Crown), `dedupeFinalists`, and `useAsyncData` (per-page `useEffect`+`useState` loader with `error` / `errorStatus`). |
| `apps/admin/src/pages/contest/CycleOverview.tsx` | The cycle-card + weekly-rounds table + weekly-winners/monthly-standings panels block, shared by the hub (live, phase-contextual primary action) and the read-only cycle-detail page. |
| `apps/admin/src/pages/contest/ContestConsolePage.tsx` | The hub. Route `/contest`. |
| `apps/admin/src/pages/contest/ContestStartCyclePage.tsx` | Route `/contest/cycles/new`. |
| `apps/admin/src/pages/contest/ContestJudgeWeekPage.tsx` | Route `/contest/cycles/:id/rounds/:week`. |
| `apps/admin/src/pages/contest/ContestOpenFinalPage.tsx` | Route `/contest/cycles/:id/final/open`. |
| `apps/admin/src/pages/contest/ContestCrownWinnersPage.tsx` | Route `/contest/cycles/:id/crown`. |
| `apps/admin/src/pages/contest/ContestHistoryPage.tsx` | Route `/contest/history`. |
| `apps/admin/src/pages/contest/ContestCycleDetailPage.tsx` | Route `/contest/cycles/:id` — read-only past-cycle view. |
| `apps/admin/src/pages/contest/contest.test.tsx` | New — replaces the deleted stub test. 14 tests. |

### Deleted (the stub family — the replacement is now real)

- `apps/admin/src/pages/contest/ContestTasksPage.tsx`
- `apps/admin/src/pages/contest/ContestTaskFormPages.tsx`
- `apps/admin/src/pages/contest/contestBackendNote.tsx`
- `apps/admin/src/pages/contest/contest.test.tsx` (old — replaced)

### Changed

- `apps/admin/src/app/routes.tsx` — the 7 `/contest/tasks/*` stub routes replaced
  with the 7 real routes above. The `contest` nav item's `path` stays `/contest`
  (`adminNav.ts` untouched).

---

## Per-screen endpoint wiring

| Screen | Route | Reads | Writes |
|---|---|---|---|
| Contest Console (hub, 6 phase branches) | `/contest` | `GET /admin/contest/current` | — (routes onward to the write screens) |
| Start a Cycle (auto / explicit `rounds[]` / real 409) | `/contest/cycles/new` | — | `POST /admin/contest/cycles` |
| Judge Week (open / already-judged / thin-week / out-of-sequence) | `/contest/cycles/:id/rounds/:week` | `GET /admin/contest/cycles/:id` | `POST /admin/contest/cycles/:id/rounds/:week/results` |
| Open the Final (confirm) | `/contest/cycles/:id/final/open` | `GET /admin/contest/cycles/:id` | `POST /admin/contest/cycles/:id/final/open` |
| Crown Winners (finalist pool deduped by `userId`) | `/contest/cycles/:id/crown` | `GET /admin/contest/cycles/:id` | `POST /admin/contest/cycles/:id/crown` |
| Cycle History | `/contest/history` | `GET /admin/contest/cycles` | — |
| Cycle Detail (read-only past cycle) | `/contest/cycles/:id` | `GET /admin/contest/cycles/:id` | — |

**The hub is the only entry point to every write action.** Its phase-contextual
primary routes to Judge week N (`vacant` / `week_1` / `weeks_1_2`, next unjudged
week derived from the judged count) / Open the final (`weeks_1_3`) / Crown
winners (`final_live`) / Start a new cycle (`crowned`). The sequential-judging
rule is enforced by the UI's shape before the backend ever returns a 409 — the
weekly-rounds table only offers "Judge week N" on the next unjudged week; later
open weeks show a muted "Judge week N−1 first".

### Which Judge Week state renders is driven by the round's real state, not a param

- `status === 'judged'` → read-only entry list showing each entry's recorded
  `position` as a static badge.
- `status === 'open'` and an earlier week is still unjudged → the out-of-sequence
  block (alert-bar banner with the real earliest-unjudged week; entries dimmed,
  no Save).
- `status === 'open'`, next in sequence, 0 entries → the "thin week" empty state
  with a real "Close week N with no winners" action that submits `winners: []`.
- `status === 'open'`, next, has entries → the position selector + "Save week N
  results".

### Write behaviour

- Every write, on success, navigates back to `/contest`, which refetches
  `GET /admin/contest/current` and re-renders the hub from the new phase.
- `AdminApiError` from a write is surfaced inline with its real backend message
  string (409 / 400 / 404). Start-a-Cycle's 409 specifically renders as a
  dedicated blocked state with a "Go to Contest Console" forward action, matching
  the Figma frame.
- Crown Winners' "Crown and close the cycle" is disabled until at least one
  standing is set (`CrownCycleDto` requires min 1). The finalist pool is
  `weeklyWinners` deduplicated by `userId` (`dedupeFinalists`) — `CrownCycleDto`
  rejects a repeated `userId`, so one row per weekly placing would be a screen
  that cannot submit. Each row summarises that user's `Week N · Pos` placings.

---

## Judgment calls

1. **Open the Final and Crown Winners are dedicated routes, not in-page modals
   on the hub.** Crown Winners is a full picker screen in Figma (finalist list +
   per-finalist standing selectors); a modal would be cramped. Open the Final is
   a confirm dialog in Figma but is rendered here as a centred confirm card on
   its own route for uniformity and testability. Both are still reached only from
   the hub's phase-contextual primary, so the "hub is the only entry point"
   property holds.
2. **`ContestCycleDetailPage` is a read-only reuse of `CycleOverview`, not a new
   layout.** The Figma report describes the past-cycle view as "a read-only
   variant of the hub"; `CycleOverview` takes a `readOnly` prop that drops the
   primary-action row and the "Judge week N" links (judged weeks still link to
   their read-only results).
3. **Date inputs are native `<input type="date">`** (producing `YYYY-MM-DD`),
   converted to full ISO with `new Date(value).toISOString()` before send. The
   Figma "Custom Weekly Windows" frame reuses the shared Figma calendar
   component; a native date picker is the faithful code equivalent and needs no
   new dependency.
4. **`GET /admin/contest/current` falling back to the most-recently completed
   cycle** is why the `crowned` hub state is a real, reachable screen and is
   where the next cycle is started from — the console does not go blank after a
   crown.
5. **The auto-windows preview** (three 7-day windows from the start date) is
   computed client-side purely as a preview; when "Generate automatically" is
   selected the request omits `rounds` entirely and the server generates the
   real windows.
6. **No "delete cycle" screen** — there is no endpoint and a cycle cannot be
   deleted or re-judged. This is the single biggest departure from the archived
   stub family, which had a "Delete Task" screen.
7. **`errorStatus` on `useAsyncData`** — the hook surfaces `AdminApiError.status`
   alongside the message so the cycle-detail page can render an honest
   "Cycle not found" state on a real 404 rather than a generic error.

---

## No "task"-model reference remains

```
$ grep -rEi 'ContestTask|contestBackendNote|Target entry count|Hashtag|/contest/tasks|Task name|ContestTasksPage|ContestTaskFormPages' apps/admin/src
(no matches)
```

`routes.test.tsx` still asserts on `/settings`, `/moderation`, `/does-not-exist`
(not contest) and passes unchanged.

---

## Verification

| Check | Result |
|---|---|
| `apps/admin` vitest (`npx vitest run`) — before | 16 files / **55** tests, 0 failures |
| `apps/admin` vitest — after | **16 files / 66 tests, 0 failures** (`contest.test.tsx` 3 → 14; net +11) |
| `npx tsc --noEmit` (`apps/admin`) | clean |
| `npm run lint` (`apps/admin`) | clean |
| `npm run build --workspace=@soccernity/admin` | clean production bundle |
| Dev-server smoke test | `/contest`, `/contest/history`, `/contest/cycles/new`, `/contest/cycles/:id`, `/contest/cycles/:id/rounds/:week`, `/contest/cycles/:id/final/open`, `/contest/cycles/:id/crown` — all HTTP 200, clean Vite log |

**New tests cover:** every hub phase branch (no-cycle → Start a cycle;
vacant → Judge week 1; weeks_1_2 → Judge week 3; weeks_1_3 → Open the final;
final_live → Crown winners + routes there; crowned → Start a new cycle + monthly
standings rendered); Start a Cycle submitting title + dates with `rounds`
omitted then navigating to the hub, and its real 409 rendering as a blocked
state with the forward action; Judge Week assigning a position and submitting
`winners[]`, the empty "thin week" submitting `winners: []`, the out-of-sequence
block hiding Save, and the already-judged read-only state showing recorded
positions; Crown Winners deduplicating 4 weekly placings to 2 finalist rows,
disabling the crown button until a standing is set, and submitting `standings`;
and the cycle-detail 404 not-found state. `adminFetch` is not mocked directly —
the `contest.ts` client functions are (`vi.mock` with `importOriginal` spread so
types/constants stay real).

No real browser / Playwright check is available in this environment — the
jsdom test suite plus the live dev-server HTTP check is the verification ceiling,
the same as every prior `apps/admin` / `apps/web` figma-to-code PR.

---

## Decision Log

- **#243** added (Section 9) — this pass. **Status: Resolved — CLOSES #239.**
- **#239** flipped Open → Resolved, with a forward-pointer recording the full
  `#241 + #242 + #243` arc.
