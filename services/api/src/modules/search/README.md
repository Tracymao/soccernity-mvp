# search module

Build Plan Section 4.7 — `GET /search`. Resolves Decision Log #139's
parked need: no people-search endpoint existed anywhere in
`services/api`, so `apps/web`'s `NewConversationPage.tsx` currently fakes
person-search via a client-side filter over the caller's own
`GET /users/:id/following` page (its own header comment discloses this).
Wiring the frontend to the real endpoint below is a separate, later PR —
this one is backend-only.

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
