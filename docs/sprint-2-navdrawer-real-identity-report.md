# Sprint 2 — NavDrawer real identity block (Decision Log #168)

**Branch:** `sprint-2/navdrawer-real-identity` (from `origin/main`)
**Agent:** figma-to-code
**Scope:** `apps/web` only. No `services/api` changes.
**Date:** 2026-09-03

Closes **Decision Log #168** only. The mobile Navigation Drawer's
identity block was a generic "Signed in" row + plain circle because
nothing wired real user data into it. This PR wires it.

**Decision Log #166 and #167 are explicitly out of scope** — by founder
decision they are separate Sprint 3/6 feature builds (Messaging,
Notifications, Settings), not navbar follow-ups. Nothing here touches
them; their Decision Log Status cells got a light-touch "confirmed out of
scope" note.

---

## 1. Code changes

### `src/layout/Header.tsx`
- Captures the access token (`const accessToken = getStoredAccessToken()`)
  alongside the existing `hasSession` derivation.
- New `useEffect` keyed on `[accessToken]`: when a session exists, decode
  the token (`decodeAccessToken` → `sub`) and call
  `getUser(accessToken, sub)`, storing the result in `profile` state. A
  `cancelled` flag guards against a late `setState`. On no token / an
  undecodable token / a rejected fetch → `profile` stays `null`.
  - **Keyed on the token, not on drawer open/close** → one fetch per
    session. A plain navigation (same token string) does not refetch;
    login (new token) does; logout (no token) clears it.
- Passes `profile` to `<NavDrawer profile={profile} />`.

### `src/layout/NavDrawer.tsx`
- New optional prop `profile?: UserProfile | null`.
- Identity block: when `profile` is set, renders
  `initialsFor(profile.displayName)` in the avatar circle and
  `profile.displayName` as a **single line**. When `null` (pending or
  failed), renders the existing generic "Signed in" fallback unchanged.
- `initialsFor()` — a third small local copy of the
  `ProfilePage.tsx` / `PostCard.tsx` helper (extracting a shared util is
  a nice-to-have; two duplicates already exist, a third is consistent
  with current practice — the task brief says so explicitly).
- **No `@handle` / username row.** `UserProfile` has no such field and
  there is no backend column for one (Decision Log #58). The Figma
  frame's `@christine001` is decorative. Single-line name is a better
  match than an empty second line.
- Header comment updated to describe the wired state.

### `src/layout/NavDrawer.css`
- `.sn-drawer__avatar` now centers its content and carries the
  Montserrat 14/600 type so the initials render inside the circle.
- `.sn-drawer__name` shares the "Signed in" row's type.

---

## 2. States

| State | Identity block | Drawer nav |
|---|---|---|
| Fetch succeeded | initials avatar + real `displayName` (one line) | works |
| Fetch pending | generic circle + "Signed in" | works (open never blocked on the fetch) |
| Fetch failed / undecodable token | generic circle + "Signed in" | works |

---

## 3. Verification

```
$ npx tsc --noEmit
(clean, no output)

$ npm run lint
(clean, no output)

$ npm run build
✓ 175 modules transformed.
dist/assets/index-DXahCF48.css   51.35 kB
dist/assets/index-BHzZ6wIK.js   409.04 kB
✓ built in 1.88s
```

### `npx vitest run` — full `apps/web` suite

```
 ✓ src/pages/VerifyEmailPage.test.tsx  (4 tests)
 ✓ src/pages/ClubFanPage.test.tsx  (7 tests)
 ✓ src/pages/GuardianConsentPage.test.tsx  (7 tests)
 ✓ src/pages/ClubsPage.test.tsx  (8 tests)
 ✓ src/pages/signup/ClubPickerStep.test.tsx  (8 tests)
 ✓ src/pages/GuardianConsentConfirmPage.test.tsx  (6 tests)
 ✓ src/pages/signup/AgeGateStep.test.tsx  (7 tests)
 ✓ src/pages/ProfilePage.test.tsx  (6 tests)
 ✓ src/pages/CommunityPage.test.tsx  (6 tests)
 ✓ src/layout/Header.test.tsx  (18 tests)
 ✓ src/pages/HomePage.test.tsx  (3 tests)
 ✓ src/pages/profile/EditProfileModal.test.tsx  (4 tests)

 Test Files  12 passed (12)
      Tests  84 passed (84)
```

Up from 12 files / 79 tests. `Header.test.tsx` +5 tests, no existing test
changed. New cases (a `vi.mock("../api/users")` block with a real,
decodable `{ sub, role }` token — the other tests keep their
non-decodable string so the fetch never fires there):

- fetches the profile once, `getUser(token, "user-1")`, and does **not**
  refetch on a plain navigation.
- shows the real `displayName` + its initials ("AC") on success; no
  "Signed in".
- still opens and navigates (click "Clubs" → `/clubs`) while the fetch
  is an unresolved promise; "Signed in" shown, `displayName` absent.
- falls back to "Signed in" on a rejected fetch, and Log out still
  clears the session + navigates to `/`.
- never renders any text containing `@` inside the drawer (Decision Log
  #58 — no handle data).

### Dev-server smoke test

```
$ npm run dev
/          -> 200
/community -> 200
/clubs     -> 200
(no errors in the dev-server log)
```

No real browser or Playwright/Puppeteer check was available in this
environment — same verification ceiling as every prior `apps/web` PR.

---

## 4. Deliverables checklist

- [x] Header fetches the profile once per session, passes it to NavDrawer.
- [x] NavDrawer renders real `displayName` + initials avatar; generic
      fallback while pending / on failure; no handle row.
- [x] Tests — 5 new cases in `Header.test.tsx`, full suite passes.
- [x] CLAUDE.md — new dated bullet.
- [x] Build Plan Decision Log — #168 resolved (forward-pointer);
      #166 / #167 light-touch "out of scope by founder decision" note.
- [x] Branch from `origin/main`, commit, push, open PR. **Not merged.**
