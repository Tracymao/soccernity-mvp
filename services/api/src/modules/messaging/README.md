# messaging module

Build target: **Sprint 3** — Section 4.7 of the MVP Build Plan (Content,
Messaging, Notification & Search Services), the **Messaging** slice only.
Built by `sprint-3/messaging-direct-messaging` (backend-api, 2026-09-09),
alongside the Banter Rooms backend (`sprint-3/banter-rooms-backend`, DL
#275/#276) as the Sprint 3 backend wave — ahead of the rest of Sprint 3,
the same call `admin` (DL #54), the Contest data model (DL #218) and
`grassroots` (DL #259) got.

Backs the Message pillar Figma (desktop + mobile conversation screens, the
Conversation Actions Menu `5706:8270`, PR #116) and the recipient-picker
screen (Decision Log #139). Nothing in `apps/web` consumes these endpoints
yet — a later `figma-to-code` pass wires both the recipient picker and the
conversation views.

## Schema — two additive columns on `Conversation` (Decision Log #277)

Migration `20260909090000_add_conversation_participant_key_and_last_message_at`
— a single `ALTER TABLE` adding two columns plus three indexes. Both
columns are **founder-approved additions beyond Section 3's literal
`Conversation` field list**, flagged per CLAUDE.md's "the data model is a
fixed spec" rule. `Message` is unchanged except for one added btree index.
`User` / `Guardian` safeguarding fields are untouched (comment-only schema
diff on those models).

| Column | Why |
|---|---|
| `Conversation.participantKey String @unique` | The participant ids **sorted and `:`-joined** — a deterministic key for the participant *set*, so `(A, B)` and `(B, A)` collide. `@unique` makes `POST /conversations`'s find-or-create **race-safe**: two concurrent "message the same person" requests can't create two rows, because the loser's `create` hits a `P2002` and is caught, then re-reads the winner's row. The exact idempotency mechanism `Like.@@unique([userId, postId])` gives `FeedService.likePost`. Set once at creation, never mutated (participants don't change in MVP). |
| `Conversation.lastMessageAt DateTime @default(now())` | `GET /conversations` orders the caller's inbox by most recent activity; `Conversation` had only `createdAt`, so a chatty old thread would sink below a newer idle one. Seeded to `createdAt` on creation, bumped to the new message's `sentAt` on every send **inside the same interactive transaction as the `Message` insert** — so the ordering can never drift from the real last message. Keyset-paginated `lastMessageAt desc, id desc`. Same denormalized-field precedent as `Follow.createdAt` / `BanterRoomMember.joinedAt`. |

Indexes added: `Conversation_participantKey_key` (the unique),
`Conversation_lastMessageAt_idx`, `Message_conversationId_sentAt_idx`
(Postgres does not auto-index foreign keys; the message-list read and
mark-read both filter by `conversationId`).

**Not added: a GIN index on `Conversation.participantIds`.** `GET
/conversations` filters `participantIds: { has: callerId }`, which is a
Postgres array-containment scan. No GIN index anywhere in this codebase
today, and at MVP scale a scan on `Conversation` is fine — every other
list endpoint here is btree-only. A GIN index on `participantIds` is the
natural first optimization if this table ever grows.

## Endpoints

| Method & path | Guards | Purpose |
|---|---|---|
| `POST /conversations` `{ recipientId }` | `JwtAuthGuard` + `GuardianConsentGuard` + `assertRecipientMessageable` | Find-or-create the DM thread between the caller and one other user. **201** on create, **200** when an existing thread is returned. |
| `GET /conversations` | `JwtAuthGuard` | The caller's inbox, keyset-paginated most-recent-activity-first. Each item: `id`, `otherParticipant {id, displayName}`, `lastMessageAt`, `createdAt`, `lastMessage {contentText, senderId, sentAt} \| null`, `unreadCount`. |
| `GET /conversations/:id/messages` | `JwtAuthGuard` + participant check | One thread's messages, keyset-paginated **newest-first** (`sentAt desc, id desc`, matching `GET /clubs/:id/feed`). |
| `POST /conversations/:id/messages` `{ contentText, mediaUrl? }` | `JwtAuthGuard` + `GuardianConsentGuard` + participant check | Send a message; bumps `Conversation.lastMessageAt` in the same transaction. **201**. |
| `PATCH /conversations/:id/read` | `JwtAuthGuard` + participant check | Mark every message in the thread **not sent by the caller** and currently unread as read. Idempotent. **200**, `{ conversationId, markedRead }`. |

`GET /conversations` and `GET /conversations/:id/messages` share one query
DTO (`MessagingQueryDto` — `cursor` + `limit`, default 20 / max 50); only
the cursor codec differs (`cursor.util.ts`).

### `PATCH /conversations/:id/read` is an addition beyond Section 4.7's literal list

Section 4.7 lists `GET`/`POST /conversations` and `GET`/`POST
/conversations/:id/messages` — no mark-read. It's added here the same way
`BanterController` added `POST`/`DELETE /banter-rooms/:id/join`, modelled
on the `PATCH /notifications/read-all` pattern from the same Section 4.7.
Conversation-level (not per-message): the UX operation is "I opened the
thread", and `Message.readAt` is a single timestamp — only coherent for
two parties. **Decision Log #277(d).**

## DMs are strictly 2-party — group conversations are out of scope

`Conversation.participantIds` is a `String[]` in Section 3, but this is
**not** a mandate for group chat:

- Build Plan Section 6, Sprint 3: "send and receive **a DM**"; "sprint done
  when: a user can … **send and receive a DM**".
- The Message pillar Figma and the recipient picker (DL #139) are 1:1.
- `Message.readAt` is a single nullable timestamp — "when the other person
  read it" only has coherent semantics between two people.

`StartConversationDto` takes **one `recipientId`**, and the service
enforces exactly 2 distinct participants. The array shape is Section 3's
forward-compat choice and is what makes `participantKey` a set key. Group
conversations are a real **Decision Log candidate** if wanted later
(they'd need a per-recipient read model, a different `participantKey`
story, and design that doesn't exist). **Decision Log #277(b).**

## `POST /conversations` is find-or-create — one canonical thread per pair

Given `{ recipientId }`, the service computes `participantKey` and:

1. tries to `create` the conversation → **201**, `created: true`;
2. on `P2002` (a thread with this exact pair already exists, **or** a
   concurrent request just created it), re-reads by `participantKey` →
   **200**, `created: false`.

One thread per person is universal DM UX, matches the Conversation Actions
Menu / recipient-picker design, and avoids fragmenting history / breaking
mark-read. The **201 vs 200** split is a clean signal for the frontend
("did I just start this, or resume it"). **Decision Log #277(c).**

## Restricted-pending enforcement — Decision Log #12, both directions

DL #12 (founder resolution) settles the ambiguity B7 flagged in Section
8.3 step 5's "DMs from unverified accounts" wording:

- **Direction: both.** A minor awaiting guardian consent is blocked from
  **sending AND receiving** DMs.
- **Scope: guardian consent only** — `User.isMinor` + `Guardian.consentStatus`,
  the exact fields `GuardianConsentGuard` reads. **Not** email
  `verificationStatus` — DL #12 is explicit those are distinct signals
  behind distinct mechanisms; a general "unverified accounts can't message
  anyone" rule is a separate future decision.

How it's enforced here — **no new guard, both existing mechanisms reused**:

| Direction | Mechanism |
|---|---|
| **Sending** (`POST /conversations`, `POST /conversations/:id/messages`) | `GuardianConsentGuard` on the controller — identical to Feed / Banter / Grassroots writes. Section 5.7 names "messaging" as safety-sensitive by name. |
| **Receiving** (being the `recipientId` on `POST /conversations`) | `MessagingService.assertRecipientMessageable` — a service-level check on the **target**, structurally identical to `UsersService.assertFollowGraphVisible` (a guard can only inspect the caller). A restricted-pending minor recipient → **404**, indistinguishable from a non-existent user (the "hide via 404" convention). |

**`POST /conversations/:id/messages` into an existing conversation needs
only the sender's `GuardianConsentGuard`** — and in practice that guard
can never fire there: a conversation can only have been created between
two non-restricted users (`startConversation`'s checks guarantee it), and
`isMinor` / `Guardian.consentStatus` never move backward, so no
restricted-pending minor can be a participant in an existing thread. The
guard stays for defence-in-depth and consistency with every other
content-creation route.

## Deactivated accounts

- **`POST /conversations` with a deactivated / `pending_deletion`
  recipient → 404** (`assertRecipientMessageable`, same `accountStatus !=
  'active'` check `assertFollowGraphVisible` uses — Decision Log #221).
- **An *existing* conversation whose other party later deactivated is NOT
  filtered.** A DM thread is a private 1:1 record, not public content like
  a feed post or a follower list — the surviving participant retains a
  legitimate record of a real exchange. This is a deliberate scope
  decision, not an oversight; if a stricter reading is wanted (anonymise
  the other party, hide the thread) it's a follow-up. Flagged in **Decision
  Log #277(e)**.

## The "ghost conversation" edge case

When a `User` is hard-deleted by `AccountDeletionSweepService` (30-day
grace, DL #42/#44), their `Message` rows cascade away but the
`Conversation` row persists with the dead id still in `participantIds`.
The surviving participant then sees a conversation whose `otherParticipant`
has `displayName: null` and `lastMessage: null`. Acceptable for MVP; a
cleanup pass over orphaned `Conversation` rows is a possible follow-up.
`GET /conversations` handles it gracefully (never throws).

## `Notification` on message send — wired, and now cleared on read

**Updated by `sprint-3/notification-triggers-message-fixture-contest`
(DL #278) and `sprint-3/banter-messaging-to-code` (this PR) — the two
paragraphs this section used to have are both stale, corrected in
place.** `sendMessage` (above) now writes a `type: 'message'`
`Notification` for the other participant, collapsed to one unread row
per conversation rather than one per message. `markConversationRead`
(above) now also clears that same Notification when the recipient opens
the thread — the frontend has no dedicated notifications endpoint to do
this itself (`notifications/README.md` is still a placeholder), so this
is the only place in the whole codebase that can mark a `message`
Notification read. A DM thread's own unread mechanism (`unreadCount` /
`readAt`) is unaffected — the two are independent facts about the same
action, not one derived from the other. No engagement points on message
send (DMs are private and rewarding them would be trivially gameable).

## Not built (flagged)

- **`GET /conversations/:id`** (single-conversation metadata) — not in
  Section 4.7; the client gets conversation metadata from the list or the
  `POST` response. Trivial to add if a screen needs it.
- **Group conversations** (DL #277(b)).
- **Orphaned-`Conversation` cleanup** on user hard-delete.

## Tests

- **Mocked unit** (`src/modules/messaging/*.spec.ts`, **34** tests, up
  from the 30 recorded when this file was first written — `sprint-3/
  notification-triggers-message-fixture-contest` added 3 for the
  message-Notification-creation branch and never updated this count;
  `sprint-3/banter-messaging-to-code` adds 1 more for the read-clearing
  fix and corrects the number here rather than letting it drift again)
  — DTO validation, guard wiring (consent guard on exactly the two write
  routes), the 201/200 split, the `P2002` find-or-create path, cursor
  filters, `toConversationViews` batching, all four
  restricted-pending/deactivated recipient branches, the message
  Notification create/collapse/no-self-notify branches, and
  `markConversationRead` clearing that same Notification.
- **Real Postgres e2e** (`test/messaging.e2e-spec.ts`, 14 tests) — the
  `participantKey @unique` constraint (find-or-create returns the same
  row from either direction; two concurrent starts → exactly one row);
  the transactional `lastMessageAt` bump; the `participantIds: { has }`
  inbox filter + ordering + unread count + preview + `PATCH .../read`
  clearing it; keyset pagination on both list endpoints; DL #12 both
  directions against real `Guardian` rows; DL #221 deactivated recipient;
  the account-deletion cascade (Message rows gone, Conversation survives).
