# search module

Build Plan Section 4.7's Search & Discovery surface — `GET /search` and
`GET /trending`, both genuinely public.

`GET /search` (`sprint-4/search-module`) resolves Decision Log #139's
parked need: no people-search endpoint existed anywhere in
`services/api`, so `apps/web`'s `NewConversationPage.tsx` currently fakes
person-search via a client-side filter over the caller's own
`GET /users/:id/following` page (its own header comment discloses this).
Wiring the frontend to the real endpoint below is a separate, later PR —
this one is backend-only.

`GET /trending` (`sprint-4/trending-topics-backend`) is a later, separate
addition to this same module — see the dedicated "Trending topics"
section below. Unlike `GET /search`, it carries a genuine schema
addition (`Hashtag`/`PostHashtag`, which did not exist anywhere in this
codebase before that PR).

## Endpoint

```
GET /search?q=&scope=&cursor=&limit=
```

Genuinely public — no guard at all on `SearchController`, the same
no-guard-at-all precedent `ArticlesController`/`CategoriesController`
(`blog.module.ts`) and the Sports Hub routes (`sports.module.ts`) already
use, mirroring `GET /sports/fixtures`'s own "no login gate for a basic
query" line.

- `q` — **required**, 2–100 chars, trimmed. Validated on the raw string
  at the DTO layer (`SearchQueryDto`); `SearchService.normalizeQuery`
  trims it and re-checks the *trimmed* length is still ≥ 2 (covers a
  string like `"  a"`, whose raw length passes `MinLength(2)` but trims
  to one character).
- `scope` — optional, one of `users` | `clubs` | `posts`. Omitted means
  all three, grouped in the response.
- `cursor` / `limit` — the same keyset-pagination shape as every other
  list endpoint in this codebase (`feed/dto/feed-query.dto.ts`,
  `leaderboard/dto/leaderboard-query.dto.ts`,
  `clubs/dto/list-clubs-query.dto.ts`). Default page size 20, max 50.
  `cursor` is only meaningful when `scope` is also given — see
  "Response shape" below.

### Response shape

With `scope` given, the response is a single flat page:

```json
{ "items": [ ... ], "nextCursor": "..." | null }
```

With `scope` omitted, the response is all three, each independently
paginated:

```json
{
  "users": { "items": [ ... ], "nextCursor": "..." | null },
  "clubs": { "items": [ ... ], "nextCursor": "..." | null },
  "posts": { "items": [ ... ], "nextCursor": "..." | null }
}
```

A single opaque cursor cannot disambiguate "continue paging which of the
three differently-ordered lists" — so `GET /search?cursor=...` with no
`scope` is a `400`, not a silent ignore. To page further into one group,
switch to a scoped request using that group's own `nextCursor`
(`GET /search?q=...&scope=users&cursor=<users' own nextCursor>`).

Each entity type is ordered differently, on purpose (see
`cursor.util.ts`'s own header comment for the full reasoning):

| Scope | Order | Why |
|---|---|---|
| `users` | `displayName asc, id asc` | Browsable-by-name, no good recency field exposed anywhere for `User` (mirrors `ClubPage`/`BanterRoom`'s own alphabetical convention). |
| `clubs` | `name asc, id asc` | Matches `GET /clubs`'s own ordering exactly, so the same club sorts identically found either way. |
| `posts` | `createdAt desc, id desc` | Activity-feed content, not a browsable catalog — matches `GET /posts/feed` / `GET /clubs/:id/feed`'s own direction. |

## v1 simplification — ILIKE substring matching, not full-text search

Matching is Postgres **ILIKE-equivalent substring matching** — Prisma's
`contains` + `mode: 'insensitive'`, the exact mechanism
`GET /banter-rooms/search?q=` already uses (see
`banter/dto/list-banter-rooms-query.dto.ts`'s own comment) — **not**
full-text search. No `tsvector`/GIN full-text index and no `unaccent`
extension exist anywhere in this codebase's migration history. Building
that infrastructure (a real schema migration, a ranking strategy,
accent-folding for names like "José") is a genuinely separate, larger
piece of work and is explicitly **out of scope for this PR** — disclosed
directly in `search.service.ts`'s own header comment, the same "v1
simplification" disclosure style `feed.service.ts` already uses for its
own denormalized-cache comments.

Consequence, stated plainly: a search does a sequential `LIKE` scan over
whichever table it targets — the same disclosed cost profile every other
`contains` filter in this codebase already carries
(`GET /banter-rooms?q=`, `GET /community-groups`'s
city/positionPlayed/careerTrack filters, `GrassrootsPage`'s own
server-side city filter). If/when this needs to scale past that, the
natural next step is a `pg_trgm` GIN index per searched column
(`User.displayName`, `ClubPage.name`, `Post.contentText`), not a rewrite
of this module's own query shape — **flagged as a Decision Log candidate,
not built here.**

There is also no `username`/handle column anywhere on `User` (Decision
Log #58, still parked) to search on or return — `displayName` is the
only name field this module can match against or expose for a user.

## Exclusion rules — what "other modules already treat as non-public"

`GET /search` carries **no auth**, so unlike `GET /posts/feed` there is
no calling user to compute a per-caller viewer-state boolean against
(`isLiked`/`joined`/etc. are never attached to a search result). What it
*does* do is make sure a search never surfaces something another,
already-shipped part of this codebase treats as not publicly findable.

### Users (`searchUsers`)

`VISIBLE_SEARCH_USER_FILTER` — a local copy of the exact same two
conditions `users.service.ts`'s `ACTIVE_FOLLOW_ENTRY_FILTER` and
`clubs.service.ts`'s `VISIBLE_CLUB_MEMBER_FILTER` already apply (neither
constant is exported from its own module, so this is a small, intentional
duplicate per this codebase's established "small duplicate over
cross-module import" convention — see `blog/cursor.util.ts`'s own header
comment on the same pattern):

```ts
const VISIBLE_SEARCH_USER_FILTER: Prisma.UserWhereInput = {
  accountStatus: 'active',
  OR: [{ isMinor: false }, { guardian: { consentStatus: 'confirmed' } }],
};
```

- **`accountStatus: 'active'` only** — a deactivated, `pending_deletion`,
  `suspended`, *or anonymized* (`'deleted'`) account never surfaces by
  name. This is deliberately **narrower** than the post-author filter
  below (which allows `'deleted'` through) — an anonymized `User` row has
  nothing left worth finding by name at all (`displayName` is scrubbed to
  `"[deleted user]"` per Decision Log #341), so there's no reason to ever
  match it against a query.
- **Restricted-pending minors excluded** — a minor with no *confirmed*
  guardian consent is invisible here, the identical "hide via absence,
  never a distinct signal" treatment `users.service.ts`'s own
  `assertFollowGraphVisible` and `clubs.service.ts`'s
  `VISIBLE_CLUB_MEMBER_FILTER` already give this exact case.

**No user-to-user "block" feature exists anywhere in this schema** —
confirmed by grep before writing this filter: the only "block"-adjacent
surfaces in this codebase are the under-16 total messaging restriction
(Decision Log #346), the adult-cannot-message-a-minor rule (Decision Log
#347, enforced in `MessagingService.startConversation`), and
admin-imposed account suspension (`AdminUsersController`). None of those
is a per-pair block a list filter could apply. Those safeguarding rules
are enforced **at the point of action** (starting a conversation —
`MessagingService.assertRecipientMessageable`), not at the point of
discovery — the same split `GET /users/:id/followers` already draws
between "can this profile be found/listed at all" (this filter's job)
and "am I specifically allowed to message this person" (a separate,
later check the messaging module already owns and this module does not
duplicate).

### Clubs (`searchClubs`)

No exclusion — `ClubPage` carries no `accountStatus` concept of its own
and nothing else in this codebase treats a club as non-public once it
exists. A plain `contains` filter on `name`.

### Posts (`searchPosts`)

`ACTIVE_AUTHOR_SEARCH_FILTER` — a local copy of `feed.service.ts`'s own
`ACTIVE_AUTHOR_POST_FILTER` (not exported, same duplication convention as
above):

```ts
const ACTIVE_AUTHOR_SEARCH_FILTER: Prisma.PostWhereInput = {
  author: { accountStatus: { in: ['active', 'deleted'] } },
};
```

`'active'` **and** `'deleted'` (anonymized) authors' posts are
searchable — an anonymized author's own content is deliberately *kept*
per Decision Log #341 (only their attribution is gone); a match against
one of those rows returns an embedded `author.displayName` that already
reads `"[deleted user]"`, exactly as it does in the real feed.
`deactivated` / `pending_deletion` / `suspended` authors' posts are
excluded, matching every other post-reading surface in this codebase
(`GET /posts/feed`, `GET /clubs/:id/feed`, `GET /banter-rooms/:id/posts`).

Field set returned per post: `id`, `contentText`, an embedded `author`
(`id` + `displayName` only — never `isMinor`), `createdAt`, `likeCount`,
`commentCount`. No `isLiked`/`isSaved`/`author.isFollowing` — those are
per-caller viewer-state fields (Decision Log #153) and this endpoint has
no caller.

## Trending topics

```
GET /trending?limit=
```

`sprint-4/trending-topics-backend`. Build Plan Section 4.7's other
Search & Discovery endpoint. **No hashtag/topic model existed anywhere in
this codebase before this PR** (confirmed: `schema.prisma` had no
`Hashtag`/`Topic` model at all) — this is genuinely new, both the schema
and the extraction/ranking logic.

Genuinely public, no guard at all — the same "no login gate for a basic
query" precedent as `GET /search` itself and `GET /sports/fixtures`.

### Extraction — where hashtags come from

Hashtags are extracted from `Post.contentText` **at post-creation time**,
inside `FeedService.createPost`'s own `$transaction` — the single place a
`Post` is ever created in this codebase (`feed.service.ts`). The actual
write primitive is `recordPostHashtags()` in `search/hashtag.util.ts`, a
plain function (not a NestJS service) called directly from that
transaction — the exact same "shared util, no cross-module service
import" shape `points/points.util.ts`'s `awardPoints()` already
established for the identical reason: a real `TrendingService`/
`SearchModule` import would force `FeedModule` to import this whole
module for a one-line write.

**v1 simplification, disclosed rather than silently shipped:** extraction
is a simple `#(\w+)` regex scan (`extractHashtags()`), not a real
tokenizer/parser:

- `\w` matches `[A-Za-z0-9_]` only — no Unicode word characters. A
  non-Latin hashtag like `#日本` is not extracted at all; an accented one
  like `#café` is truncated at the first non-ASCII character (`#café`
  extracts `caf`, not `café`). The same ASCII-only limitation this
  module's own ILIKE matching already carries (see the "v1
  simplification" section above).
- Every extracted tag is **lowercased** before storage, so `#EPL` and
  `#epl` are the same `Hashtag` row. There is no case-preserving "display
  form" kept anywhere — this module is backend-only (no frontend consumes
  it yet), so there's nothing to render the original casing to.
- Tags are **de-duplicated within one post** before any Prisma call (a
  post repeating `#epl` twice writes exactly one `PostHashtag` row) —
  this is what `PostHashtag.@@unique([postId, hashtagId])` would
  otherwise reject with a P2002 on the second occurrence; dedupe happens
  once, up front, rather than wrapping every insert in a try/catch for
  this one case.
- A tag longer than `HASHTAG_MAX_TAG_LENGTH` (50, an arbitrary but
  generous ceiling — a crude spam/abuse guard, not a researched limit) is
  silently dropped rather than ever recorded.

### Storage — `Hashtag` / `PostHashtag`

Two new models (migration `20260922120000_add_hashtag_and_post_hashtag`,
zero change to `User`/`Guardian` safeguarding fields):

- **`Hashtag`** — one row per distinct normalized tag. `postCount` is a
  denormalized **all-time** cache, the exact same convention
  `Post.likeCount` / `Post.commentCount` / `ClubPage.memberCount` /
  `BanterRoom.memberCount` already establish (schema.prisma's own
  comment on `Post.likeCount`): incremented transactionally alongside
  every `PostHashtag` row this tag gets, never trusted in isolation, and
  always recomputable via `PostHashtag.count({ where: { hashtagId } })`
  if it ever drifts.
- **`PostHashtag`** — the explicit Post↔Hashtag join (never an implicit
  Prisma m2m — see `ClubPage.members`'s own real silent-relation-merge
  bug this schema's history already carries), a surrogate `id` +
  `@@unique([postId, hashtagId])`, matching `Like`/`Follow`/`SavedPost`/
  `BanterRoomMember`/`CommunityGroupMember`'s own established shape
  (no model anywhere in this schema uses a composite primary key).
  `createdAt` is a **denormalized copy of the owning Post's own
  `createdAt`**, not this row's write time — see the model's own schema
  comment for why that distinction is what makes the trending decay
  computed from it mean "how old is the post," not "how long ago this
  join row happened to be written."

Neither FK carries `onDelete: Cascade` — matching `Like.post` /
`Comment.post` / `SavedPost.post`'s own current shape exactly. There is
no `DELETE /posts/:id` endpoint anywhere in this codebase today, so the
implicit `RESTRICT` default is inert in practice, not a real constraint
on anything.

### Ranking — time-decayed, not all-time

**Trending is a time-decayed score over a rolling window, not an
all-time count** — an all-time count would mean nothing new could ever
displace an early, heavily-used hashtag. `Hashtag.postCount` (the
denormalized all-time cache above) is explicitly **not** what
`GET /trending` reads from for exactly this reason; the query aggregates
`PostHashtag.createdAt` directly instead.

The decay function (`trending.constants.ts` / `trending.service.ts`) is
**exponential with a half-life** — deliberately simple, not
"sophisticated," per this task's own brief:

- Each `PostHashtag` row inside the window contributes
  `2^(-ageInHours / TRENDING_HALF_LIFE_HOURS)` to its hashtag's score —
  a post `ageInHours` old counts for HALF as much as a post from right
  now once `ageInHours` reaches the half-life, a QUARTER at 2x the
  half-life, and so on. The same decay family Hacker News's own ranking
  algorithm uses.
- `TRENDING_WINDOW_HOURS = 48` bounds the SQL query itself — rows older
  than this are never read at all, not merely decayed toward zero. This
  both caps the worst-case scan and matches "trending" meaning "recently
  active," not "ever active."
- `TRENDING_HALF_LIFE_HOURS = 6` — chosen so the two constants work
  together rather than fighting each other: at the window's own 48h
  edge, a post has already decayed to `2^(-48/6) ≈ 0.4%` of its
  original weight, functionally negligible well before the window would
  have cut it off outright.

The aggregation is one raw, parameterized `$queryRaw` — the same
established precedent `LeaderboardRollupService.rollupPeriod` and
`ClubsService`'s own raw SQL already set in this codebase for "the ORM
cannot express this": Prisma's query builder has no `GROUP BY` +
arbitrary-SQL-expression `SUM`, which the exponential decay weight
needs. `POWER(2::DOUBLE PRECISION, ...)` and an outer
`CAST(... AS DOUBLE PRECISION)` are both load-bearing, not decorative —
confirmed by a real e2e failure during development
(`test/trending.e2e-spec.ts`): without them, Postgres resolves
`POWER(2, ...)` to its `NUMERIC` overload, and node-postgres returns a
Postgres `numeric` as a JS **string** (e.g. `"0.890897..."`, to avoid
silent precision loss) rather than a plain `number` — breaking every
`score` comparison and the response's own numeric shape.

### Response shape — no pagination

```json
{ "items": [ { "tag": "epl", "postCount": 12, "score": 9.4 }, ... ] }
```

`postCount` here is the **raw, undecayed** count of posts using the tag
*within the window* (not the all-time cache above) — returned purely for
transparency; `score` is always the sort key. `GET /trending?limit=` (no
`cursor`) is a deliberate departure from every other list endpoint in
this codebase: a keyset cursor identifies a stable position in a stable
ordering, and this endpoint's ordering is a **snapshot** score that
reorders between one call and the next as new posts land and old ones
decay out of the window — "continue from where I left off" has no
coherent meaning here. `limit` alone (default 10, max 50) is the right
and sufficient shape.

## Not built, flagged (Decision Log candidates)

- **Full-text search / `pg_trgm` indexing** — see the "v1 simplification"
  section above.
- **A fourth scope for Banter Rooms / Community Groups / Grassroots
  Teams** — each already has its own dedicated name-filter endpoint
  (`GET /banter-rooms/search?q=`, `GET /community-groups?...`,
  `GET /teams?city=`); this module was scoped to exactly the three types
  Decision Log #139's frontend need and this task's own brief named.
- **Ranking/relevance** — results are ordered deterministically (see the
  table above), never by match quality. ILIKE substring matching has no
  natural relevance signal to rank by; a real ranking strategy is part of
  the same future full-text-search work above, not a separate concern.
- **A frontend for trending topics** — now built for desktop only:
  `apps/web`'s `/search` page has a "Trends for you" card consuming
  `GET /trending` (`figma/trends-sidebar`, `pages/search/TrendsForYou.tsx`).
  Still not built: tapping a trend to search it (`/search` has no `?q=`
  deep link) and any per-hashtag action (see the moderation note below).
- **No admin/moderation surface for hashtags** — an abusive or spammy
  hashtag cannot be hidden, blocked, or removed from trending short of a
  direct database edit. No report/moderation route references `Hashtag`
  at all.
- **No per-day/per-user rate limit on hashtag creation** — the
  `HASHTAG_MAX_TAG_LENGTH` guard is a length cap, not a volume cap; a
  single user could still post many distinct or repeated hashtags in
  quick succession (each individual `POST /posts` call is unaffected by
  this module, since it goes through the ordinary post-creation path and
  whatever platform-wide throttling already applies there).
- **Tuning the decay/window constants** — `TRENDING_WINDOW_HOURS` /
  `TRENDING_HALF_LIFE_HOURS` are reasoned, documented defaults
  (`trending.constants.ts`), not values validated against real usage
  data (none exists yet pre-launch). Revisit once real trending traffic
  exists.
