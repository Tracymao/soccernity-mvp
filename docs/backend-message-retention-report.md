# Message retention sweep (B-287, Decision Log #478)

Branch `backend/b287-message-retention`. `services/api`, `render.yaml`, `.env.example` and docs only. No schema change, no
migration, no `apps/*`, no Figma, no `.docx`, no `docs/build-register.md`.

## What was built

`MessageRetentionService` (`services/api/src/modules/messaging/message-retention.service.ts`), registered in
`MessagingModule` (which now also imports `ConfigModule`). It deletes direct messages **12 months after `sentAt`**.

| Item | Decision |
|---|---|
| Schedule | `@Cron('0 0 4 * * *')`, 04:00 daily, after the 03:45 Contact Us job |
| Pattern | copied from `contact/contact-enquiry-retention.service.ts`: per-run cap, oldest first, counts-only log, injectable `now` |
| Figure | `MESSAGE_RETENTION_MONTHS`, default 12 (`DEFAULT_MESSAGE_RETENTION_MONTHS`), read by `messaging.config.ts` exactly like `CONTACT_ENQUIRY_RETENTION_MONTHS`; blank, zero, negative or non-numeric falls back to 12 |
| Env | `.env.example` and BOTH services in `render.yaml`; `env-completeness.spec.ts` gained a block that checks it is read, declared in both services, documented, and carries the same value as the code default |
| Boundary | strictly older: `sentAt < NOW - 12 calendar months` (`setUTCMonth`); a message sent exactly at the cutoff is kept |
| Cap | **500 per run** (`MESSAGE_RETENTION_MAX_PER_RUN`), a default I chose; Contact Us uses 200 but messages are far more numerous. Veto-able. |
| Who | minors and adults alike; no filter on `isMinor`, sender, edit state or deletion state |
| Edited originals | `originalContentText` is a column of the row, so it goes with it |
| Deleted for everyone | deleted like any other message once old |

### The two report guards

A message is NEVER deleted when a `Report` with `targetType = 'message'` has it as `targetId` (a bare string, no FK), or
when a `ReportContextMessage` row attached it. Both tests are in the SELECT and repeated in full in the DELETE statement
(raw SQL, because `Report.targetId` has no relation). The real-Postgres spec proves the DELETE repeat by inserting a
report between the two statements (inside the job's own transaction) and checking the message survives.

### What goes with a message

- `MessageHide`: `ON DELETE CASCADE`, so removed with the message (explicit delete would risk dropping hides of a message
  that survives a guard).
- **Stored media: none exists.** `Message.mediaUrl` is a leftover column; the send DTO refuses `mediaUrl` since B-259, the
  messaging module has no storage code, and no route writes it. There is no object to delete. If DM media is ever added,
  this sweep must delete the object too (written in the code comment and the README).

### Empty conversations

How the inbox lists conversations: `listConversations` returns every conversation the caller is a participant in
(minus hidden ones), with no "has at least one message" filter. A conversation left with no messages would therefore
show as an empty thread. So the sweep deletes a conversation that **lost messages in this run and now has none**
(`ConversationHide` rows cascade). Details:

- Only conversations touched by the run's own DELETE are examined. A thread that was just started with nothing sent
  (`startConversation` creates the row before any message) is never a candidate.
- The "no messages left" test (`messages: { none: {} }`) is in the conversation DELETE itself, so a message sent in
  between keeps the conversation. All of it runs in one transaction.
- Side effect: `participantKey` is freed, so the two people can start a new thread.

## Account-hold rule (B-044): is an exemption needed?

Read `account-hold.rules.ts`, `hold.service.ts` and `account-deletion/README.md`. **I added no exemption and invented
none.** Findings for the founder:

1. The hold governs *anonymisation / erasure of a `pending_deletion` account*. It has never touched `Message` rows:
   anonymisation leaves messages untouched ("Post, Comment, Message, Result: untouched"). So there was no existing rule to
   extend to messages.
2. A **report-derived** hold (open report, appeal window, post-closure) involves a message only when the report names
   it; that message is already protected by the report guard above. The rest of the held user's messages are not
   evidence and are deleted on schedule.
3. A **legal hold** (`AccountHold`, "the whole account is kept in full") does **not** currently stop this job from deleting
   that user's old messages, because the hold is about the account row. If the intent of a legal hold is "keep all of this
   person's data", this job contradicts it. That is a founder / counsel decision (the same question as the rejected-media
   evidence handling, B-206); it would be one more `NOT EXISTS` on `AccountHold` joined through `senderId` and the
   conversation's other participant.

## Other things the reviewer should know

- **Adult-to-minor DM rule (#347):** an adult cannot start a conversation with a minor, but an existing thread is returned.
  Once the thread is deleted at 12 months of silence, that exemption is gone and the adult cannot start a new one. Rule
  unchanged, consequence noted.
- **Notifications:** a collapsed `message` notification for a deleted thread degrades to `data: null` (existing rule).
- **Anonymised-row purge:** `Message.sender` and `Conversation.participantIds` block the 30-day purge of an anonymised
  user row. After this job removes old DMs, an anonymised account whose only blockers were old DMs becomes purgeable.
- **Race:** a report filed in the instant between the DELETE statement and the transaction commit cannot protect a
  message the statement already removed. `createReport` checks the message exists, so the window is a single transaction.
- **No counsel position.** 12 months for minors' messages is the founder's decision (#478); the legal draft carries 12
  months as a `[PROPOSAL]` starting figure (line ~981). No user-facing wording was written, so nothing is tagged
  `[COPY PENDING LEGAL REVIEW]`.
- No retention exists yet for a *report* itself, so a reported message is kept until that is built.

## Files

New: `message-retention.service.ts`, `message-retention.service.spec.ts`, `messaging.config.ts`,
`test/message-retention.e2e-spec.ts`. Changed: `messaging.constants.ts`, `messaging.module.ts`, `messaging/README.md`
(the "kept, no new period" wording is superseded; new "Retention" section), `account-deletion/README.md` (one note),
`schema.prisma` (Message comments only), `env-completeness.spec.ts`, `.env.example`, `render.yaml`, `CLAUDE.md`.

## Verification

See the PR description for the measured counts. Run: the two new/changed unit specs, `tsc --noEmit`, and the new e2e on a
private database. NOT run: the full mocked suite, the full e2e suite, the other messaging/moderation/account-deletion
e2e files, Playwright, `apps/*`.

## Forward-pointer notes for the next docs PR (nothing edited here)

- `docs/build-register.md`: B-287 status line (BUILT, this branch); note on B-286 that its "retention sweep must skip
  these messages" requirement is met; B-018 note that `MESSAGE_RETENTION_MONTHS` is in `render.yaml`.
- Decision Log #478: dated pointer "built by `backend/b287-message-retention`; no account-hold exemption (legal hold
  question open)". Also a pointer on #347 (the adult-to-minor consequence above) and on #419/#341 if wanted.
- Part C of the legal draft, messages row (~line 981): the 12-month figure is now enforced in code.
