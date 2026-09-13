# notifications module

Build target: Sprint 3 — Section 4.7 of the MVP Build Plan
(`sprint-3/notifications-read-api`).

**Scope: the READ side only.** Every Notification row is already being
written by 7 trigger call sites elsewhere in this codebase
(`users.service.ts` for `follow`, `feed.service.ts` for `like`/`comment`,
`messaging.service.ts` for `message`, `grassroots.service.ts` for
`fixture_scheduled`/`result_logged`, `contest.service.ts` for
`contest_win` — see Decision Log #87/#278 and `schema.prisma`'s own
comment on `Notification.type`). This module builds `GET /notifications`,
`GET /notifications/unread-count`, `PATCH /notifications/:id/read`, and
`PATCH /notifications/read-all` — the endpoints needed to actually read,
acknowledge, and count that data. None of the 7 trigger sites are touched
by this PR.

## The design problem this module solves

`Notification.payloadRefId` is a bare, type-dependent string with **no
FK** and no stored actor or display text. A client cannot render "X liked
your post" from a `Notification` row alone — it needs to know what
`payloadRefId` actually refers to for that `type`, which varies:

| `type` | `payloadRefId` refers to | Actor resolvable from this alone? |
|---|---|---|
| `follow` | the **follower's own** `userId` | Yes — `payloadRefId` *is* the actor |
| `like` | the `Post` that was liked | **No** — nothing stores who liked it |
| `comment` | the `Post` that was commented on | **No** — nothing stores who commented, or which comment |
| `message` | the `Conversation` (collapsed: one unread row per thread, not per message) | Yes, indirectly — a `Conversation` is always exactly 2 participants, so "the other one" is the sender |
| `fixture_scheduled` | the `Fixture` | Yes, via the fixture's other team |
| `result_logged` | the `Fixture` | Yes, via the fixture's other team |
| `contest_win` | the `ContestCycle` (deliberately not `roundId`/`entryId` — `contest.service.ts`'s own comment says this is "the one single-resource read endpoint that exists today") | N/A — the recipient is already the actor |

## Decision: option (a) — server-side resolution, denormalized

`GET /notifications` resolves and denormalizes each row server-side into
a `data` field, **batched by type** (one `findMany({ where: { id: { in:
[...] } } })` per referenced type per page, never one query per row —
the exact discipline `FeedService.attachViewerState` /
`MessagingService.toConversationViews` already use). At most **five**
extra queries per page regardless of page size (Posts, Conversations +
one combined User lookup covering both follow-actors and
message-other-participants, Fixtures, ContestCycles), and fewer if a page
doesn't contain every type.

This was chosen over option (b) (return raw `type` + `payloadRefId`, let
the frontend resolve per-type against `GET /users/:id`, `GET
/fixtures/:id`, etc.) because a 20-item page under option (b) could mean
up to 20 follow-up calls against 5 different endpoints with 5 different
auth/shape contracts, on every single page load of the Notification
Centre — exactly the kind of N+1-shaped cost this codebase has
consistently batched away everywhere else (feed viewer-state, club
membership, conversation previews).

**One refinement**: the backend resolves *referenced entities into
structured data*, not pre-rendered English strings. `data` is a
type-specific object (`{ actor }`, `{ post }`, `{ conversationId,
otherParticipant }`, `{ fixture }`, `{ cycle }`) — copy/templating
("X liked your post") stays a frontend concern, since DL #279 already
finalized exact per-type wording in Figma and baking English into this
API would fight that design, not help it.

**A real, disclosed limitation, not fixed here**: `like` and `comment`
notifications have **no actor anywhere** — `payloadRefId` is the post,
not the liker/commenter. No amount of server-side resolution can produce
"Jane liked your post" from current data; the best this endpoint can do
is resolve the *post* (`{ post: { id, contentText, authorId } }`), so the
frontend can render something like "New like on your post: '...'" with
no name attached. Adding an `actorId` column to `Notification` would fix
this, but requires editing the `like`/`comment` trigger call sites
(`feed.service.ts`), which is explicitly out of this PR's scope. **Open
Decision Log candidate, not resolved here**: add `actorId String?` to
`Notification`, written by the `like`/`comment` (and arguably `follow`,
for symmetry) trigger sites.

**`payloadRefId` is not an FK, so a referenced row can be gone by the
time this reads it** (a hard account-deletion, Decision Log #44's
cascade, removes the `User`/`Post`/etc. row the notification points at,
but never the `Notification` row itself — there is no FK to cascade
through). Every resolved `data` field is nullable for exactly this
reason; a stale/orphaned notification degrades to `data: null` rather
than erroring. The `message` type additionally has its own narrower ghost
case (`otherParticipant: { id, displayName: null }`), mirroring
`MessagingService.OtherParticipant`'s own precedent.

**Deliberately not filtered**: a notification whose actor/other-
participant has since deactivated (not hard-deleted) is still shown —
consistent with Decision Log #221's existing precedent that an existing
DM thread with a deactivated participant isn't hidden either (a private
record, not public content). Same reasoning applies to a private
notification inbox.

## Endpoints

- **`GET /notifications`** — `JwtAuthGuard` only, implicitly self-scoped
  (no `:id`, always the caller — same shape as `GET /contest/current`).
  Keyset pagination, `(createdAt desc, id desc)` — the identical shape
  `feed/cursor.util.ts` uses, re-declared as this module's own copy per
  the established per-module-cursor convention (see `cursor.util.ts`'s
  own comment on why: `clubs`/`grassroots`/`banter`/`messaging` each
  carry their own copy of whichever cursor shape they need, even when
  it's byte-identical to another module's — modules don't couple their
  pagination contracts together just because two orderings happen to
  coincide). Default 20 / max 50 (Section 5.5). Response also carries
  `unreadCount` (see below).
- **`GET /notifications/unread-count`** — `JwtAuthGuard` only, a
  dedicated lightweight endpoint (`{ unreadCount }`, one `COUNT` query).
  Kept separate from the list endpoint specifically because the Navbar
  avatar/badge (Decision Log #87/#279's Figma work — the `Avatar`
  component's `Has Unread` boolean state, the account dropdown's numeric
  badge) renders on **every page** via `Header.tsx`, not just the
  Notification Centre. Fetching and resolving a full 20-item page just to
  paint a badge on every page load would be wasteful; this is a single
  `COUNT` query instead. `GET /notifications` *also* returns
  `unreadCount` (computed the same way, in parallel with the page query)
  so the Notification Centre page itself doesn't need a second
  round-trip when it's actually opened.
- **`PATCH /notifications/:id/read`** — marks one notification read.
  Not-found-or-not-owned → **404**, never 403 — the same "don't leak
  resource existence to a non-owner" convention as
  `UsersService.assertFollowGraphVisible` / `MessagingService.assertParticipant`
  (a notification id is only ever legitimately referenced by its own
  owner, so there's no "authenticated but not authorized" case distinct
  from "doesn't exist for you"). Idempotent — marking an already-read row
  read again is a 200 no-op, matching this codebase's "repeat action is
  not an error" philosophy for like/save/follow, applied here to a
  boolean flip rather than a toggle relationship. Returns the resolved
  item.
- **`PATCH /notifications/read-all`** — marks every unread row read for
  the caller. Returns `{ markedRead: number }`, mirroring
  `MessagingService.markConversationRead`'s own shape.

No route-ordering conflict: `read-all` (1 segment) and `unread-count`
(1 segment) are distinct static paths, and `:id/read` (2 segments) never
collides with either regardless of declaration order — declared
static-before-parameterized anyway, matching this codebase's convention
elsewhere (`GET /banter-rooms/mine` before `GET /banter-rooms/:id`).

## What this PR does NOT do

- Does not touch any of the 7 trigger call sites that write `Notification`
  rows.
- Does not touch Figma or `apps/web` — a `figma-to-code` pass converts the
  already-finalized Notification Centre design (Decision Log #279) against
  these endpoints as its own follow-up.
- Does not add an `actorId` column for `like`/`comment` (see above — a
  real, flagged gap, not silently worked around).
- Does not build `GET /notifications/:id` (a single-notification read) —
  nothing in Section 4.7 or the Figma design calls for one, and
  `PATCH /notifications/:id/read`'s own response already returns the
  resolved item.
