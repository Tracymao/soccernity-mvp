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

## Under-16 restriction (sprint-1/under-16-restrictions, Decision Log #346)

Accounts with `User.isUnder16` can neither send nor receive DMs, from
anyone (other minors included). Sender side: `Under16RestrictionGuard`
+ `@RestrictUnder16('messaging')` at class level on `ConversationsController`
(so inbox reads are blocked too). Recipient side:
`MessagingService.assertRecipientMessageable` throws the same 404
(`User not found`) as a non-existent, deactivated, restricted-pending, or
adult->minor recipient. **Decision Log #351 reversed #346 here**: the
recipient side used to be a distinct `under_16_restricted` 403, which let
anyone learn in a single request that an account exists and is under 16.
Trade-off: senders no longer get a specific reason (less UX clarity) in
exchange for closing a direct enumeration signal on minor accounts. The
*sender* side is unchanged (an under-16 caller still gets the clear 403
from `Under16RestrictionGuard`; that reveals only the caller's own status).
Layered on, never replacing, `GuardianConsentGuard`.

## Edit, delete for me, delete for everyone, delete chat (B-067, Decision Log #472 (b))

`backend/b067-message-edit-delete-hide`. Adopted default (b) of #472, DECIDED and now built on the backend; the web
PR is written from this section. Migration `20261115090000_add_message_edit_delete_hide` (additive, rollback in its
header): `Message.editedAt`, `Message.originalContentText`, `Message.deletedForEveryoneAt`, and two new tables,
`MessageHide` and `ConversationHide` (composite primary keys on user + message / user + conversation).

### Endpoints

| Method & path | Guards | Result |
|---|---|---|
| `PATCH /conversations/:id/messages/:messageId` `{ contentText }` | `JwtAuthGuard` + `GuardianConsentGuard` + `EmailVerifiedGuard` + `ProfileCompleteGuard` (the guard set of a send) | **200**, the message. |
| `DELETE /conversations/:id/messages/:messageId?scope=me` | `JwtAuthGuard` + `GuardianConsentGuard` | **204**. Hides one message for the caller. |
| `DELETE /conversations/:id/messages/:messageId?scope=everyone` | same | **204**. Sender only. |
| `DELETE /conversations/:id` | same | **204**. "Delete chat", for the caller only. |

`scope` is required on the message delete (`me` or `everyone`); missing or any other value is a 400.

**Edit rules.** Sender only; text only; not deleted for everyone; within 15 minutes of `sentAt` measured on the server
clock (`MESSAGE_EDIT_WINDOW_MINUTES`; exactly 15:00.000 is allowed, one millisecond later is refused). It passes exactly
the checks a send passes: conversation participant (404), Block in both directions with the same split (the blocked
sender gets the 404 `Conversation not found` a send gets, the blocker gets the 403 `you_blocked_this_user`), the same
DTO bounds (1 to 3000 characters, no extra fields). The first edit stores the text as first sent in
`originalContentText`; later edits never overwrite it. An edit creates no Notification and does not change
`lastMessageAt`. Errors:

| Status | `code` | When |
|---|---|---|
| 404 | none | conversation not found or caller not in it; message not in this conversation; the blocked sender |
| 403 | `you_blocked_this_user` | the caller blocked the other person |
| 403 | `message_edit_not_sender` | the caller did not send the message |
| 409 | `message_not_editable` | deleted for everyone, or not a text message (a legacy row with `mediaUrl`) |
| 409 | `message_edit_window_closed` | more than 15 minutes after `sentAt` |

**Delete rules.** `me`: any message in a conversation the caller is in, including the other person's. Inserts a
`MessageHide` row; idempotent (a second call is a no-op 204). `everyone`: the sender only (403
`message_delete_not_sender` otherwise), at any time, idempotent (the first timestamp is kept). **The row, the text and
any original STAY in the database until the 12-month retention job removes them (see "Retention" below); nothing else
purges them.** Deleting never checks Block (a person can always delete) and
has no time limit. `DELETE /conversations/:id` upserts `ConversationHide` at the server time for the caller; calling it
again moves the cutoff forward.

### Read paths

`GET /conversations/:id/messages` (newest first, unchanged ordering and cursor):

* leaves out messages the caller hid with `scope=me`, and everything with `sentAt` at or before the caller's
  `ConversationHide.hiddenAt`;
* a message deleted for everyone comes back, for BOTH people, as
  `{ id, conversationId, senderId, sentAt, deletedForEveryone: true, contentText: null, editedAt: null }`;
* every other message is `{ id, conversationId, senderId, contentText, sentAt, readAt, editedAt, deletedForEveryone:
  false }`. `readAt` is `null` unless the read-receipt rule below allows it. `editedAt` is `null` until an edit, then the time of the latest edit. A message the caller just sent
  (`POST .../messages`) has the same shape;
* the original text is never returned to a user, and is not even selected.

`GET /conversations`:

* a conversation the caller deleted is left out unless a message newer than their `hiddenAt` exists (the rule is
  `lastMessageAt > hiddenAt`: `lastMessageAt` is bumped by every send), in which case it returns and shows only the
  newer messages;
* `lastMessage` and `unreadCount` ignore messages the caller hid, messages deleted for everyone, and anything at or
  before the caller's `hiddenAt`. `PATCH /conversations/:id/read` is unchanged.

Account anonymisation deletes the user's `MessageHide` and `ConversationHide` rows (their own view settings); every
`Message` stays.

### Read receipts (Decision Log #472; founder decision 2026-11-08)

`Message.readAt` is still RECORDED whenever the recipient opens the chat (`PATCH /conversations/:id/read`), whatever
anyone's settings are: the unread counts, the inbox badge and the collapsed `message` Notification all use it. What
changed is what is DISCLOSED. The rule lives in ONE place, `read-receipt-disclosure.util.ts` (`canDiscloseReadAt`),
and is applied in `MessagingService` wherever a message is turned into a response (`toMessageView`). A message's read
time is returned to its SENDER only when ALL of these hold; otherwise `readAt` is `null`:

1. the message has been read;
2. the sender's EFFECTIVE read-receipts setting is on;
3. the reader's (the other participant's) EFFECTIVE setting is on;
4. sender and reader are in the same age class (both adult, or both under 18, by the stored `User.isMinor` flag).

The reader never sees a read time on a message they received. A participant with no row (hard-deleted) discloses
nothing. The settings are read with one extra `user.findMany`, and only when the page holds a message the caller sent
that has been read, so an ordinary page costs no extra query. Places that return `readAt`: `GET
/conversations/:id/messages`, the response of `PATCH .../messages/:id` (an edit), and `POST .../messages` (a fresh
message is never read, so it is always `null` there). `GET /conversations` carries no `readAt` (the last-message
preview never did). The data export (`data-export`) selects no `readAt` and never has: it contains nothing about read
times.

The setting is `User.readReceipts` (nullable; see the users README, "Read receipts"). Because the rule is evaluated
at READ time, turning receipts off later also hides the seen state of earlier messages, and turning them on shows it
again (DEFAULT, founder-veto-able). The age default (ON adult, OFF under 18) is also DEFAULT, founder-veto-able, as
is rule 4.

### DEFAULTS, founder-veto-able

* **15 minutes** is a figure borrowed from other messaging apps (`MESSAGE_EDIT_WINDOW_MINUTES`, one constant).
* **"Delete for me" is built per message AND as "delete chat"**: the Figma frames draw both (B2 and B3 per message, C1
  for the chat) while build-register B-067 read it as conversation hiding only.
* **No user can ever read an original.** There is no admin read of originals in this PR; one needs its own decision
  (who may read it, audited how) and is a follow-up.
* **Retention: SUPERSEDED by B-287 (Decision Log #478).** This PR added no retention period and said the original is
  "kept". A message, its edited original and a message deleted for everyone are now removed 12 months after they
  were sent, see "Retention" below. Until then "delete for everyone" is still NOT erasure (the text stays in the row).
* The hidden-conversation rule compares `lastMessageAt` with `hiddenAt`, so a newer message the caller hid
  individually or that was deleted for everyone still brings the conversation back, as an empty-looking thread.
* A legacy message that carries `mediaUrl` (the column still exists) cannot be edited.
* Reporting a message is NOT built and NOT decided (`REPORT_TARGET_TYPES` has no message type).

## Reporting a message (`backend/b067-message-report`)

A person can report a message in a chat through `POST /reports` with `targetType: 'message'` (see the moderation
README, "Reporting a message in a chat"). The rules live in `ModerationService.assertMessageReportable`, not here,
but they read this module's state, so they are listed:

- Only the OTHER participant (the recipient) can report. The sender cannot report their own message; a stranger
  cannot report anything in a private conversation. Both get the same 404 as a missing message.
- The message must be currently visible to the reporter: not hidden by them (`MessageHide`), not sent at or before
  their `ConversationHide.hiddenAt`, not deleted for everyone.
- The report keeps working after the sender edits the message or deletes it for everyone: the Message row, its
  `contentText` and `originalContentText` are never removed, and the admin report detail returns that ONE message
  (current text, original text if edited, `editedAt`, `deletedForEveryone`) to a moderator. No user-facing read ever
  returns `originalContentText`; only the admin report detail does, and only for a reported message.
- Nothing purges a message while a report against it exists. The anonymiser deletes only `MessageHide`/`ConversationHide`
  rows (`Message.sender` is RESTRICT), and the 12-month retention job (B-287) skips any message a `Report` with
  `targetType: 'message'` points at, in the SELECT and again in the DELETE (see "Retention").
- Moderators can record `content_removed` against a message report but cannot delete a message (known gap).

## Retention (`backend/b287-message-retention`, B-287, Decision Log #478)

`MessageRetentionService` (`message-retention.service.ts`) deletes direct messages **12 months after they were sent**,
for everyone, minors and adults alike. This replaces the earlier "kept, no new period" wording of the B-067 section.

- **Schedule and size.** Daily at 04:00 (`@Cron('0 0 4 * * *')`, after the 03:45 Contact Us job), oldest first, at most
  `MESSAGE_RETENTION_MAX_PER_RUN` = 500 messages per run (a backlog drains over several nights), `purgeExpired(now)` takes
  an injectable clock. The log carries counts only, never an id, name or text.
- **The figure.** `MESSAGE_RETENTION_MONTHS`, default 12 (`DEFAULT_MESSAGE_RETENTION_MONTHS`), in `.env.example` and both
  `render.yaml` services, guarded by `env-completeness.spec.ts`. A blank, zero, negative or non-numeric value falls back
  to 12. Calendar months in UTC (`setUTCMonth`); a message is due only when `sentAt` is **strictly** older than the cutoff.
- **What counts as old.** `sentAt`, not `editedAt`, not read time. An edit does not restart the clock. The edited original
  (`originalContentText`) is part of the row and goes with it; a message deleted for everyone is deleted like any other.
- **Never deleted: a message that is evidence.** A message is skipped when a `Report` with `targetType: 'message'` has it
  as `targetId` (a bare string, no foreign key), or when a `ReportContextMessage` row attached it to a report. Both tests
  are in the SELECT and repeated in the DELETE statement, so a report filed between the two still protects the message.
  The message then stays for as long as the report does; removing a report (its own retention) is not built, so a
  reported message is kept until that exists. `ReportContextMessage.messageId` is a RESTRICT foreign key, so the database
  would refuse the delete anyway.
- **What goes with a message.** `MessageHide` rows (ON DELETE CASCADE). There is no stored media object to delete: a DM has
  carried no media since B-259 (the send DTO refuses `mediaUrl`), this module has no storage, and no route has ever
  written `Message.mediaUrl`. If DM media is ever added, the sweep must delete the object too.
- **Empty conversations.** A conversation that lost messages in a run and now has none is deleted (its `ConversationHide`
  rows cascade); the inbox would list it as an empty thread otherwise. Only conversations touched by the run's own DELETE
  are examined, so a thread just started with nothing sent is never removed, and the "no messages left" test sits in the
  conversation DELETE, so a message sent meanwhile keeps it. The participant key is then free: the two people can start a
  new thread.
- **Held accounts: no exemption.** The account hold (B-044) pauses *anonymisation/erasure of a `pending_deletion` account*.
  It never touched messages, which stay after an account is anonymised, so there was nothing to extend. A report-derived
  hold on an account is covered by the evidence rule above only for the specific message(s) a report names; a *legal hold*
  (`AccountHold`, "the whole account is kept") does not currently stop this job from deleting that account's old messages.
  Whether it should is a founder / counsel call, not decided here (see `docs/backend-message-retention-report.md`).
- **Side effects worth knowing.** A `message` Notification for a deleted thread degrades to `data: null` (the existing
  stale-reference rule). An adult can start a conversation with a minor only if no thread exists; after the old thread is
  deleted that exemption is gone (rule #347 unchanged). `Message.sender` and `Conversation.participantIds` are classed as
  content that blocks the anonymised-row purge, so an anonymised account whose only blockers were old DMs becomes
  purgeable after this job runs.
- **Not done:** counsel has not signed off the 12 months for minors' messages (the legal draft carries it as a
  `[PROPOSAL]` starting figure); no user-facing wording was written.
