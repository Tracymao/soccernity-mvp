# Sprint 2 — Home + Community conversion (figma-to-code)

Branch: `sprint-2/home-community-conversion` (from `origin/main`, commit `3405d85`).
Agent: `figma-to-code`. No backend code touched — `services/api` is untouched.

This closes Build Plan Section 6's Sprint 2 **done-when** criterion for real:
"a user can post, follow another user or club, like/comment, and save a post,
all reflected correctly on refresh." Until this PR, `apps/web/src/pages/HomePage.tsx`
and `CommunityPage.tsx` were literal 5-line `PlaceholderPage` stubs.

---

## What was built

| File | Status | Notes |
|---|---|---|
| `apps/web/src/api/feed.ts` | **new** | Feed Service client (Section 4.3). Mirrors `api/clubs.ts` / `api/users.ts` conventions exactly — own fetch wrapper, own `FeedApiError`, `VITE_API_BASE_URL` constant, Bearer auth, cursor pagination. |
| `apps/web/src/api/users.ts` | edited | Added `followUser` / `unfollowUser` (`POST`/`DELETE /users/:id/follow`). Placed here, not in `feed.ts`, because follow is a Section 4.2 User Service endpoint. |
| `apps/web/src/pages/HomePage.tsx` + `HomePage.css` | **rewritten** | Logged-out marketing page (Figma `5204:6728`). |
| `apps/web/src/pages/CommunityPage.tsx` | **rewritten** | Authenticated feed (Figma `1306:7148`). |
| `apps/web/src/pages/community/PostComposer.tsx` | **new** | Create-post composer (Figma `2008:655`). |
| `apps/web/src/pages/community/PostCard.tsx` | **new** | One post + its like/comment/save/follow actions. |
| `apps/web/src/pages/community/CommunityPage.css` | **new** | File-per-page CSS, `--sn-*` tokens only. |
| `apps/web/src/app/router.tsx` | edited | Comment-only — both routes already pointed at these component files by name; the redirect logic lives inside `HomePage`. |
| `apps/web/src/pages/HomePage.test.tsx` | **new** | 3 cases. |
| `apps/web/src/pages/CommunityPage.test.tsx` | **new** | 5 cases. |
| `docs/Soccernity_MVP_Build_Plan_v1.7.docx` | edited | Decision Log **#153** appended (see below). |

---

## Part 1 — Homepage: real vs. dummy

**Everything below the shared navbar is static.** Per the frame's own annotation
zone (`5214:6805`) and Decision Log #6, no fixtures / news / points data source
exists anywhere in Section 4.

| Element | Treatment |
|---|---|
| Session check → `<Navigate to="/community" replace />` when `getStoredAccessToken()` returns a token | **Real.** Decision Log #152. Uses the same direct `lib/session.ts` read every other converted page uses; no AuthContext introduced. |
| Hero copy, three pillars, closing CTA, footer | Static marketing copy (hardcoded, matches the frame). |
| Hero "live fixture" card, "Today's Fixtures" strip (4 cards), "Clips from this weekend" (3 cards), "What football is talking about" (featured + 3 story rows) | **Dummy.** Hardcoded to the frame's own content. Club crests rendered typographically (club-initial badges), matching the frame — crest-licensing question sidestepped by design. Thumbnails are navy placeholders. |
| CTAs ("Create your profile", "Explore fixtures", "Browse grassroots teams") | All `<Link to="/signup">`. "Explore fixtures" / "Browse grassroots teams" have no dedicated destination — a marketing page funnels to signup. Flagged, minor. |

No API call is made on this page beyond the synchronous session check.

## Part 2 — Community: real vs. dummy

The Figma template (`1306:7148`) is a three-column social layout. **Only the
centre column is wired.**

| Element | Treatment | Endpoint |
|---|---|---|
| No-session state | **Real** — "Log in to see your Community feed" + link, no API call. Mirrors `ProfilePage.tsx`. | — |
| Feed list, most-recent-first, "Load more posts" | **Real**, cursor-paginated | `GET /posts/feed` |
| Composer → new post prepended to feed | **Real** | `POST /posts` |
| Per-post like / unlike (count from server response) | **Real**, idempotent | `POST`/`DELETE /posts/:id/like` |
| Per-post save / unsave | **Real**, idempotent | `POST`/`DELETE /posts/:id/save` |
| Per-post comment thread (expand, "Load more comments", oldest-first) | **Real** | `GET /posts/:id/comments` |
| Add a comment | **Real** | `POST /posts/:id/comments` |
| Follow / unfollow a post's author (hidden on your own posts) | **Real**, idempotent | `POST`/`DELETE /users/:id/follow` |
| Composer avatar / display name | **Real** — `GET /users/:id` (self), non-fatal if it fails | `GET /users/:id` |
| Restricted-pending minor: `POST /posts` and `POST /posts/:id/comments` return 403 (`GuardianConsentGuard`) | **Real** — surfaced inline with a link to `/guardian-consent`, not a silent failure | — |
| Left rail "Trends for you" | **Dummy**, captioned "Sample — not yet personalised". No trending endpoint in Section 4. | — |
| Right rail "Who to follow" | **Dummy**, captioned "Sample — no suggestions endpoint yet". Section 4.2 defines follow / followers / following only — **no suggested-users endpoint exists**, and inventing a suggestion algorithm was explicitly out of scope. | — |
| Right rail "Trending News" | **Dummy**, captioned "Sample — no news endpoint yet". | — |
| Composer photo / video / poll icons | Rendered **disabled** with explanatory `title=` + a note — no media-upload endpoint exists in Section 4. Same discipline as `EditProfileModal.tsx`'s disabled Bio/Location fields. | — |

Composer sends `contentText` only. `CreatePostDto` also accepts `mediaUrls`
(max 10 URLs) / `clubPageId` / `banterRoomId`, all typed in `feed.ts` for
completeness but unused by this UI.

---

## The `isLiked` / `isSaved` / `isFollowing` gap — Decision Log #153 (new)

`GET /posts/feed`'s `FeedPost` payload (`feed.service.ts` `POST_SELECT`) has
**no per-current-user flag** for whether the caller has already liked or saved a
post, and the embedded `author` object has no `isFollowing` flag.

Consequence, stated plainly: on first load **and on every hard refresh**, every
like / save / follow control renders in its default (not-yet-acted) state
regardless of the real relationship. Once the user acts *in the current
session*, the toggle endpoint's response (`LikeState.liked` / `LikeState.likeCount`
/ `SaveState.saved`) — or, for follow, the known `{ following }` result — drives
local component state for the rest of that session. A reload resets it.

This was **not guessed around** and **no fake client-side flag was added**. The
`PostCard` header comment documents it in full. It is safe in practice because
the like/save endpoints are idempotent (`feed.service.ts`) — a redundant
"re-like" of an already-liked post is a harmless 200 — and `likeCount` is always
taken fresh from the server response, never re-derived client-side.

**This is real, not-yet-done backend work, not a frontend bug.** Decision Log
**#153** records it: add `isLiked` / `isSaved` to the feed + single-post
payloads (a caller-scoped `Like` / `SavedPost` existence check), and
`isFollowing` to the post author. Candidate for the next `backend-api` Feed pass.

---

## Is the Sprint 2 done-when criterion now testable end-to-end?

**Yes**, with one honest caveat.

- **Post** → composer → `POST /posts`, appears in the feed immediately, and is
  returned by `GET /posts/feed` on reload (the backend feed scope includes the
  caller's own posts). ✅
- **Follow another user** → per-post Follow button → `POST /users/:id/follow`. ✅
  **Follow a club** → the club-join path already shipped in
  `sprint-2/club-picker-ui` (`POST /clubs/:id/join`, `api/clubs.ts`); this PR
  does not add a second club-follow affordance to the feed (no club surface in
  the Community template frame), but the capability exists and is wired
  elsewhere. Noted, not re-built.
- **Like / comment** → `POST /posts/:id/like`, `POST /posts/:id/comments`. Both
  reflected on reload: `likeCount` / `commentCount` are real denormalized
  columns returned by `GET /posts/feed`. ✅
- **Save a post** → `POST /posts/:id/save`, and `GET /users/:id/saved-posts`
  persists it server-side. ✅

**Caveat (Decision Log #153):** after a refresh the *like/save/follow button
state* does not show as already-acted (the counts are correct, the toggle
state is not), because the read API doesn't expose it yet. The underlying data
is persisted correctly on the server in every case; only the button's
initial visual state is affected.

---

## Verification

- `npx tsc --noEmit` — clean.
- `npm run lint` — clean.
- `npm run build` — clean production bundle (159 modules).
- `npx vitest run` — **9 suites / 49 tests, 0 failures** (up from 7 / 41 —
  `HomePage.test.tsx` +3, `CommunityPage.test.tsx` +5; no existing test changed).
- Dev server smoke test: `/`, `/community`, `/signup`, `/login` all return
  HTTP 200 with a clean Vite log.
- **No real browser / Playwright check was available in this environment** —
  same verification ceiling as every prior `apps/web` PR in this project. The
  jsdom test suite plus the live dev-server HTTP check is the actual ceiling
  here, not a substitute for a human browser pass.

## Deliberately not done

- No AuthContext (`lib/session.ts`'s header comment already flags that as a
  separate refactor — not started here).
- No dark mode (app runs light-only).
- No second club-follow UI in the feed (no club surface in the source frame;
  club join already shipped elsewhere).
- The `docs/` Build Plan prose Decision Log entry #153 was appended via
  `python-docx`; CLAUDE.md's "Where things stand" got its dated bullet in this
  same PR.
