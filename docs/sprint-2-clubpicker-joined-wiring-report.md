# Sprint 2 — ClubPicker `joined` wiring (Decision Log #154 frontend follow-up)

Branch: `sprint-2/clubpicker-joined-wiring` (from `origin/main`).
Agent: `figma-to-code`. `apps/web` only.

**Honest framing:** this closes a **type / correctness gap, not a live
user-facing bug.** Unlike PR #137 (which fixed a visible wrong-initial-state on
`PostCard.tsx`), there is currently no user-visible symptom here — see
"Why there's no live symptom" below. The wiring is still worth doing for the
same reasons PR #137's `CreatedPost` change was: the client type shouldn't
silently omit a field the server sends, and the component should be correct by
construction, not by coincidence of how it's used today.

`services/api` PR #138 (merged) added a real per-caller `joined` boolean to
`GET /clubs` and `GET /clubs/:id`. This makes `apps/web` aware of it.

---

## Changes

### `apps/web/src/api/clubs.ts`

- `ClubSummary` gains `joined: boolean` (returned by `GET /clubs` and
  `GET /clubs/:id`).
- `JoinClubResult` (from `POST`/`DELETE /clubs/:id/join`) already carries its
  own `joined` — **untouched**, unrelated response shape.
- Header comment updated: shape now mirrors
  `clubs.service.ts`'s `ClubSummaryWithViewerState`, not `CLUB_SELECT`.

### `apps/web/src/pages/signup/ClubPickerStep.tsx`

One line:

```
-  const state = joinState[club.id] ?? "idle";
+  const state = joinState[club.id] ?? (club.joined ? "joined" : "idle");
```

`joinState` (the in-session click-through map: `"idle" | "joining" | "joined" |
"error"`) still takes precedence once the user acts — this only changes the
**fallback** when the user hasn't touched a given club yet, from always `"idle"`
to the server-reported membership. Same shape as `PostCard.tsx` seeding its
`useState` from the feed response.

**Not changed:** state shape, filtering, load-more pagination, error handling,
the continue/skip button. The continue-button label (`hasJoinedAny`) still
reflects only *in-session* joins — deliberately left, since it's cosmetic and
only reachable in a hypothetical reuse (a returning user with pre-joined clubs
would see "Skip for now" instead of "Continue"). Flagged here, not fixed, to
keep this a one-line targeted change per the brief.

---

## Why there's no live symptom

`ClubPickerStep.tsx` is rendered **only** from `RegisterStep.tsx`'s success view,
immediately after a brand-new account is created. `router.tsx` has no standalone
"Clubs" route anywhere. A freshly-registered user has joined **zero** clubs by
definition — so `club.joined` comes back `false` for every club in the one place
this component is used today. The new test below is therefore honestly a test of
code that the app's current usage never exercises; it's still the right thing to
prove given the type change, and it's a regression guard if the component is
ever reached a second time or reused.

---

## New Decision Log candidate — flagged, NOT built (#155)

**There is no persistent "my clubs" / club-browsing page in `apps/web`.** The
only club-list surface is this one-time signup step. This is the actual reason
the `joined` field (Decision Log #154) and the `DELETE /clubs/:id/join`
(`leaveClub`) backend endpoint have no live frontend consumer. When a real Clubs
page is built (Sprint 3+, a new-screen task for `figma-screen-builder` /
`figma-design-system` — **not** this wiring follow-up), that's where `joined`
genuinely matters for a returning user, and where `apps/web` would need a
`leaveClub()` client function alongside `joinClub()` (`api/clubs.ts` has none
today). Recorded as Build Plan Decision Log **#155**.

---

## What this does NOT do (per brief)

- No persistent Clubs-browsing page (out of scope — new-screen work).
- No `leaveClub` affordance / client function — `api/clubs.ts` has no
  `leaveClub` at all, and this onboarding step has never needed one.

---

## Tests

`ClubPickerStep.test.tsx`:

- `CLUB_A` / `CLUB_B` fixtures gained `joined: false` (type-check).
- **New case** — "renders a club the caller already belongs to (`joined: true`
  from `GET /clubs`) in the Joined state on first paint, no click": the mocked
  `listClubs` returns one club with `joined: true` and one with `joined: false`;
  asserts the first renders a disabled "Joined" button and the second a live
  "Join" button, with `joinClub` never called. Mirrors PR #137's `PostCard.tsx`
  initial-state test.

### `npx vitest run` output (apps/web)

```
 ✓ src/pages/signup/ClubPickerStep.test.tsx  (8 tests) 558ms
 ✓ src/pages/VerifyEmailPage.test.tsx  (4 tests) 346ms
 ✓ src/pages/HomePage.test.tsx  (3 tests) 452ms
 ✓ src/pages/GuardianConsentPage.test.tsx  (7 tests) 499ms
 ✓ src/pages/GuardianConsentConfirmPage.test.tsx  (6 tests) 694ms
 ✓ src/pages/signup/AgeGateStep.test.tsx  (7 tests) 704ms
 ✓ src/pages/ProfilePage.test.tsx  (6 tests) 853ms
 ✓ src/pages/CommunityPage.test.tsx  (6 tests) 836ms
 ✓ src/pages/profile/EditProfileModal.test.tsx  (4 tests) 5798ms

 Test Files  9 passed (9)
      Tests  51 passed (51)
```

(up from 9 files / 50 tests — one new `ClubPickerStep` case)

`npx tsc --noEmit`, `npm run lint`, `npm run build` — all clean.

---

## Docs updated in this PR

- `docs/Soccernity_MVP_Build_Plan_v1.7.docx` — Decision Log #154 Status cell
  gets a frontend-wired forward-pointer; new #155 row for the missing
  Clubs-page gap.
- `CLAUDE.md` — dated Sprint 2 status bullet.
