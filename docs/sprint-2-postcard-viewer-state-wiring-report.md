# Sprint 2 — PostCard viewer-state wiring (Decision Log #153 frontend follow-up)

Branch: `sprint-2/postcard-viewer-state-wiring` (from `origin/main`).
Agent: `figma-to-code`. `apps/web` only.

Small wiring follow-up to Decision Log #153. `services/api` PR #136 (merged) added
real per-caller `isLiked` / `isSaved` / `author.isFollowing` to `GET /posts/feed`
and `GET /posts/:id`. `PostCard.tsx` still initialised those to `useState(false)`
on every mount — the documented session-local workaround PR #135 shipped before
#136 existed. This reads the real fields instead.

**No new UI, no new endpoints, no new API calls.** Only the *initial* state on
load changes, from always-false to the real server value. Toggle behaviour after
a user's own in-session action is unchanged.

---

## Changes

### `apps/web/src/api/feed.ts`

- `FeedPostAuthor` gains `isFollowing: boolean`.
- `FeedPost` gains `isLiked: boolean` and `isSaved: boolean`.
- `FeedComment` / `CommentPage` — **untouched** (comments never surface a follow
  button; confirmed in PR #135/#136).
- New `CreatedPost` type = `Omit<FeedPost, "isLiked" | "isSaved" | "author"> & {
  author: Omit<FeedPostAuthor, "isFollowing"> }`, and `createPost` now returns
  `Promise<CreatedPost>`. Reason: Decision Log #153 deliberately left `POST
  /posts` (and `GET /users/:id/saved-posts`) **unenriched** — the response
  genuinely doesn't carry those three fields, so typing `createPost` as returning
  a full `FeedPost` would be a lie. For a freshly created post the three values
  are deterministically `false` anyway (you haven't liked/saved your own new
  post; you can't follow yourself), and `CommunityPage` fills them in on prepend.
  This matches #153's scope exactly — it does not enrich `createPost`, it just
  stops the client type from over-claiming.

### `apps/web/src/pages/community/PostCard.tsx`

- `const [liked, setLiked] = useState(post.isLiked);`
- `const [saved, setSaved] = useState(post.isSaved);`
- `const [following, setFollowing] = useState(post.author.isFollowing);`
- Header comment: the old "KNOWN GAP" paragraph describing the default-false /
  session-local workaround is removed (no longer true) and replaced with a short
  note that the real fields are used directly, pointing to Decision Log #153.
- **Everything else is unchanged** — toggle handlers, idempotent-endpoint
  reasoning, the `isOwnPost` skip on the follow button. Not a refactor.

### `apps/web/src/pages/community/PostComposer.tsx`

- `onCreated` prop type changed `FeedPost` → `CreatedPost` (follows the
  `createPost` return-type change). No behavioural change.

### `apps/web/src/pages/CommunityPage.tsx`

- `onCreated` handler normalises the created post to a full `FeedPost` when
  prepending: `{ ...post, isLiked: false, isSaved: false, author: { ...post.author,
  isFollowing: false } }`. This is the one spot that constructs/augments a
  `FeedPost` shape. `getFeed`'s `page.items` already carry the real fields
  (returned by the enriched endpoint) and needed no change. No mock `FeedPost` is
  built anywhere else in this file (the side-rail sample data are their own local
  types, not `FeedPost`).

---

## Tests

`apps/web/src/pages/CommunityPage.test.tsx`:

- `post()` fixture factory updated to include `isLiked: false`, `isSaved: false`,
  and `author.isFollowing: false` (so every existing case keeps type-checking and
  keeps asserting the not-yet-acted default where it did before).
- Two inline `author: {...}` overrides updated to include `isFollowing`.
- **New case** — "renders like / save / follow in their already-acted state on
  initial load from the API's per-caller fields (Decision Log #153)": a feed of
  one post with `isLiked: true`, `isSaved: true`, `author.isFollowing: true`
  renders — *with no clicks* — the like button `aria-pressed="true"`, a "Saved"
  save button `aria-pressed="true"`, and a "Following" button (no "Follow"
  button), and asserts `likePost` was never called. This is the exact behaviour
  this PR changes, so it's proven directly, not incidentally.

### `npx vitest run` output (apps/web)

```
 ✓ src/pages/signup/ClubPickerStep.test.tsx  (7 tests) 473ms
 ✓ src/pages/VerifyEmailPage.test.tsx  (4 tests) 393ms
 ✓ src/pages/HomePage.test.tsx  (3 tests) 513ms
 ✓ src/pages/GuardianConsentPage.test.tsx  (7 tests) 533ms
 ✓ src/pages/GuardianConsentConfirmPage.test.tsx  (6 tests) 789ms
 ✓ src/pages/signup/AgeGateStep.test.tsx  (7 tests) 767ms
 ✓ src/pages/ProfilePage.test.tsx  (6 tests) 977ms
 ✓ src/pages/CommunityPage.test.tsx  (6 tests) 937ms
 ✓ src/pages/profile/EditProfileModal.test.tsx  (4 tests) 5934ms

 Test Files  9 passed (9)
      Tests  50 passed (50)
```

(Up from 9 files / 49 tests — one new `CommunityPage` case.)

`npx tsc --noEmit`, `npm run lint`, `npm run build` — all clean.

---

## Not changed (scope)

- No new API calls / endpoints / UI.
- Toggle behaviour after an in-session action — already correct (PR #135), left
  exactly as-is.
- `POST /posts` and `GET /users/:id/saved-posts` response shapes — still
  unenriched per Decision Log #153; nothing here touches them (the `CreatedPost`
  type just stops the client from claiming otherwise).
- Decision Log #153's Status cell gets a forward-pointer noting the frontend is
  now also wired; `CLAUDE.md` gets a dated bullet.
