# sprint-2/club-fan-page-to-code — report

**Agent:** figma-to-code · **Date:** 2026-09-06
**Scope:** `apps/web` only — no `services/api` code.
**Figma source (read fresh after PR #176 + PR #177 landed):**
`Club — Fan Page — Desktop` (`5841:9365`) / `Mobile` (`5841:9431`).
**Backend:** `GET /clubs/:id/feed` + `GET /clubs/:id/members`
(`sprint-2/club-fan-page-backend` / PR #177).
**Build Plan Decision Log:** #157 flipped to **Resolved** (all three sides
— design #216, backend, frontend); forward-pointer appended. #224 added.

Extends `ClubFanPage.tsx` from its deliberately-sparse placeholder state
(badge / name / join button / back link + one scope note) into the real
page: a **club feed** and a **member roster**, both against the new PR #177
endpoints, matching the PR #176 design.

---

## What changed

### `src/api/clubs.ts`

- `getClubFeed(accessToken, clubId, cursor?)` → `FeedPage`. The route is
  `/clubs/:id/feed`, so it lives here — but the server delegates to
  `FeedService.getClubFeed`, so the response is the exact `FeedPage` shape
  `api/feed.ts` already models (per-caller `isLiked` / `isSaved` /
  `author.isFollowing`, Decision Log #153). `FeedPage` is imported from
  `./feed` (type-only, no runtime coupling — `feed.ts` imports nothing).
- `getClubMembers(accessToken, clubId, cursor?)` → `ClubMemberPage`
  (`{ items: { id, displayName }[], nextCursor }`). New `ClubMember` /
  `ClubMemberPage` types, mirroring `services/api`'s `ClubMember` exactly
  — **no `@handle` / avatar** (no such `User` column, Decision Log #58 —
  the Figma "@handle" is decorative) and **no per-caller `isFollowing`**
  (see the gap note below).

### `src/pages/clubs/ClubMemberRow.tsx` (new)

One roster row: initials avatar + display name + a Follow / Following
toggle wired to `POST`/`DELETE /users/:id/follow`. Same "act, then trust
the response" shape `ClubJoinButton` / `PostCard` use. The current user's
own row renders without a Follow button (self-follow → 400).

### `src/pages/ClubFanPage.tsx`

- Header block (back link, badge, name, `league • country`, member count,
  Join/Leave button) — **unchanged**.
- The **"Member posts and a full member list aren't part of club pages
  yet" scope note is removed** — both are now real.
- **Club feed section** — `GET /clubs/:id/feed`, rendered with the reused
  Community `PostCard` component (verbatim — the design explicitly clones
  the Community post card, and `PostCard` already wires real
  like/comment/save/follow). `import "./community/CommunityPage.css"`
  added for the `.post*` styles. Cursor "Load more posts". Empty state,
  soft error state.
- **Members section** — `GET /clubs/:id/members`, `ClubMemberRow` per
  entry. Header shows `Members` + the club's `memberCount`.
- Feed + roster load **independently** of the club header and of each
  other (`Promise.allSettled`) — a failure in one shows a soft in-section
  message, never breaks the page or the header.

### CSS

Added `.clubs-fan__section*`, `.clubs-fan__members-head`,
`.clubs-roster*` to `clubs/ClubsPage.css`. `--sn-*` tokens, light mode,
matching the existing Club Pages / Community styling. Removed the now-dead
`.clubs-fan__note`.

---

## Divergences from the Figma / known gaps (flagged)

1. **`GET /clubs/:id/members` has no per-caller `isFollowing`** — unlike
   `GET /posts/feed`'s author. So a roster Follow button always renders
   "Follow" on first paint regardless of the real relationship, and only
   self-corrects for in-session actions. Idempotent server-side, so
   harmless — the exact situation `PostCard` was in before Decision Log
   #153. **New Decision Log #224**; fix is the same pattern #153 used
   (batched follow-existence check on the members payload).
2. **"View all members →"** (Figma) has no destination screen — a
   dedicated full-roster route/screen isn't built (the design report
   flagged this: "Flagged, not wired"). Rendered here as an in-place
   **"Load more members"** cursor-pagination button — the honest
   functional equivalent of the same affordance.
3. **No club-post composer** — no club-scoped post-creation flow is
   designed, and the Community composer lives on Community. `CreatePostDto`
   accepts `clubPageId` but nothing in `apps/web` sends it.
4. **Roster rows show name only, no `@handle`** — the backend doesn't
   return one (`User` has no such column). Same discipline `ProfilePage`
   applies (shows email, flagged, instead of a fabricated handle).
5. The roster server-side already excludes restricted-pending minors and
   deactivated accounts (Decision Log #217/#221), so the visible list can
   be shorter than `club.memberCount`. Not reconciled in the UI —
   consistent with the backend's own "memberCount is not authoritative in
   isolation" note.

---

## Verification

- `npx tsc --noEmit` — clean.
- `npm run lint` — clean.
- `npm run build` — clean production bundle.
- `npx vitest run` — **20 files / 135 tests, 0 failures** (up from 20/132
  — `ClubFanPage.test.tsx` 7 → 10: club feed render, empty-feed, feed
  failure not breaking the page, roster + "Load more members" pagination,
  member Follow toggle, scope-note-is-gone; the old "reproduces the scope
  note verbatim" test removed).
- Dev-server smoke test: `/`, `/clubs`, `/clubs/:id`, `/community` all
  HTTP 200, clean dev-server log.
- No real browser / Playwright check available in this environment — same
  ceiling as every prior `apps/web` PR.
