import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { APP_CLOCK, Clock, systemClock } from '../../clock/clock';
import { PrismaService } from '../../prisma/prisma.service';
import {
  blockedPairWhere,
  hasBlockBetween,
  relationFromRows,
  YOU_BLOCKED_THIS_USER_CODE,
  YOU_BLOCKED_THIS_USER_MESSAGE,
} from '../block/block.util';
import {
  MESSAGE_EDIT_WINDOW_MS,
  MESSAGE_NOT_EDITABLE_CODE,
  MESSAGE_EDIT_WINDOW_CLOSED_CODE,
  MESSAGE_EDIT_NOT_SENDER_CODE,
  MESSAGE_DELETE_NOT_SENDER_CODE,
  MESSAGING_DEFAULT_PAGE_SIZE,
  MESSAGING_MAX_PAGE_SIZE,
} from './messaging.constants';
import {
  decodeConversationCursor,
  decodeMessageCursor,
  encodeConversationCursor,
  encodeMessageCursor,
  participantKey,
} from './cursor.util';
import { SendMessageDto } from './dto/send-message.dto';
import { EditMessageDto } from './dto/edit-message.dto';
import { DeleteMessageScope } from './dto/delete-message-query.dto';
import { MessagingQueryDto } from './dto/messaging-query.dto';
import { canDiscloseReadAt } from './read-receipt-disclosure.util';
import { PUBLIC_NAME_SELECT, resolvePublicName } from '../users/public-name.util';

// The lean row every conversation-returning path selects — never the
// nested messages (a conversation with thousands of messages returned
// inline is exactly the unbounded payload Section 5.5 exists to
// prevent). `participantIds` IS selected: the service needs it to derive
// the "other participant" and to check membership.
const CONVERSATION_SELECT = {
  id: true,
  participantIds: true,
  lastMessageAt: true,
  createdAt: true,
} as const;

type ConversationRow = Prisma.ConversationGetPayload<{ select: typeof CONVERSATION_SELECT }>;

// Every field selected here is safe to return to a participant. Selected explicitly (not a bare model
// return) so a future column addition is a deliberate choice to expose, same discipline as POST_SELECT /
// ROOM_SELECT elsewhere. B-067: `originalContentText` is DELIBERATELY NOT here -- the text as first sent is
// kept in the database after an edit, and no user-facing read ever returns it. `deletedForEveryoneAt` is
// selected only so the row can be turned into the placeholder below; it is not itself returned.
const MESSAGE_SELECT = {
  id: true,
  conversationId: true,
  senderId: true,
  contentText: true,
  sentAt: true,
  readAt: true,
  editedAt: true,
  deletedForEveryoneAt: true,
} as const;

type MessageRow = Prisma.MessageGetPayload<{ select: typeof MESSAGE_SELECT }>;

// What a message looks like to a participant (B-067). A message deleted for everyone comes back as the
// placeholder to BOTH people: the text is gone from the response (the row and the text stay in the database).
export interface LiveMessageView {
  id: string;
  conversationId: string;
  senderId: string;
  contentText: string;
  sentAt: Date;
  readAt: Date | null;
  editedAt: Date | null;
  deletedForEveryone: false;
}
export interface DeletedMessageView {
  id: string;
  conversationId: string;
  senderId: string;
  sentAt: Date;
  editedAt: null;
  deletedForEveryone: true;
  contentText: null;
}
export type MessageView = LiveMessageView | DeletedMessageView;

// `viewerId` is the caller and `discloseReadAt` the result of canDiscloseReadAt for the pair (see
// read-receipt-disclosure.util.ts). A read time is returned ONLY on a message the viewer SENT and only when the
// rule allows it; on a message the viewer received it is always null.
function toMessageView(row: MessageRow, viewerId: string, discloseReadAt: boolean): MessageView {
  if (row.deletedForEveryoneAt) {
    return {
      id: row.id,
      conversationId: row.conversationId,
      senderId: row.senderId,
      sentAt: row.sentAt,
      deletedForEveryone: true,
      contentText: null,
      editedAt: null,
    };
  }
  return {
    id: row.id,
    conversationId: row.conversationId,
    senderId: row.senderId,
    contentText: row.contentText,
    sentAt: row.sentAt,
    readAt: row.senderId === viewerId && discloseReadAt ? row.readAt : null,
    editedAt: row.editedAt ?? null,
    deletedForEveryone: false,
  };
}

// The other person in a 2-party conversation. `publicName` (username if set,
// else displayName) is nullable
// only for the ghost case: a participant hard-deleted by the account-
// deletion sweep (Message.senderId cascades, but Conversation.participantIds
// still holds the id). The surviving participant then sees a conversation
// whose other party has no name and no messages — acceptable for MVP,
// flagged in messaging/README.md.
export interface OtherParticipant {
  id: string;
  publicName: string | null;
}

export interface MessagePreview {
  contentText: string;
  senderId: string;
  sentAt: Date;
}

// What GET /conversations returns per row, and what POST /conversations
// returns for the single conversation it found-or-created. `unreadCount`
// and `lastMessage` are per-caller derived values (Section 4.7 doesn't
// specify the shape; the Figma conversation-list rows show a snippet + an
// unread indicator) — computed batched, no N+1. Flagged as a judgment
// call in messaging/README.md, same as `joined` on Banter/Clubs.
export interface ConversationView {
  id: string;
  otherParticipant: OtherParticipant | null;
  lastMessageAt: Date;
  createdAt: Date;
  lastMessage: MessagePreview | null;
  unreadCount: number;
}

export interface ConversationPage {
  items: ConversationView[];
  nextCursor: string | null;
}

export interface MessagePage {
  items: MessageView[];
  nextCursor: string | null;
}

export interface MarkReadResult {
  conversationId: string;
  markedRead: number;
}

@Injectable()
export class MessagingService {
  constructor(
    private readonly prisma: PrismaService,
    // B-067: the 15-minute edit window is measured on the SERVER clock (APP_CLOCK falls back to the system clock;
    // the e2e overrides it). Last and optional so a spec that builds the service by hand keeps its shape.
    @Optional() @Inject(APP_CLOCK) private readonly clock: Clock = systemClock,
  ) {}

  // POST /conversations — find-or-create between the caller and ONE
  // recipient. Returns `created` so the controller can send 201 (a new
  // conversation) vs 200 (an existing one was returned).
  //
  // Race-safe without a transaction: Conversation.participantKey is
  // @unique (schema.prisma), so two concurrent "message the same person"
  // requests can't both create — the loser's create throws P2002 and is
  // caught, then re-reads the winner's row. Exactly
  // FeedService.likePost's idempotency mechanism.
  //
  // Guards on the controller: JwtAuthGuard + GuardianConsentGuard —
  // starting a conversation is "messaging", named as a safety-sensitive
  // action in Section 5.7, so a restricted-pending minor cannot initiate
  // one (the "sending" half of Decision Log #12). The "receiving" half —
  // a restricted-pending minor cannot be the RECIPIENT — is
  // assertRecipientMessageable below, because a guard can only inspect
  // the caller, not the target.
  async startConversation(
    callerId: string,
    recipientId: string,
  ): Promise<{ view: ConversationView; created: boolean }> {
    if (recipientId === callerId) {
      throw new BadRequestException('You cannot start a conversation with yourself');
    }

    const ids = [callerId, recipientId].sort();
    const key = participantKey(ids);

    // sprint-1/dm-enumeration-timing-parity: EVERY new-conversation
    // attempt does exactly the same two reads, in the same order,
    // regardless of outcome -- (1) one user.findMany covering caller AND
    // recipient (with the recipient's guardian consent status joined in),
    // (2) one conversation.findUnique on the participant key. The
    // decisions (not found / restricted-pending / deactivated / under-16 /
    // adult->minor block) are then made purely in memory. Before this, a
    // missing recipient did 1 query, a restricted-pending minor 2, and an
    // adult->confirmed-minor 4, a latency difference a patient prober could
    // use to rebuild the enumeration signal the 404 body fix closed. Do not
    // reintroduce an early return before both reads, or a conditional
    // extra read on any one outcome.
    const users = await this.prisma.user.findMany({
      where: { id: { in: [callerId, recipientId] } },
      select: {
        id: true,
        isMinor: true,
        isUnder16: true,
        accountStatus: true,
        guardian: { select: { consentStatus: true } },
        // B-061 (Decision Log #472 (i)): the recipient's DM permission and whether THE RECIPIENT
        // follows the caller, both folded into this ONE existing read (a nested relation select,
        // not a new query), so the fixed set of reads that keeps every not-messageable outcome
        // indistinguishable in timing (#350) is unchanged. On the caller's own row the follow
        // filter is meaningless (nobody follows themselves) and is ignored.
        dmPermission: true,
        following: { where: { followeeId: callerId }, select: { id: true }, take: 1 },
      },
    });
    const existing = await this.prisma.conversation.findUnique({
      where: { participantKey: key },
      select: CONVERSATION_SELECT,
    });
    // B-039: the Block read is part of the same fixed set of reads, done for
    // EVERY attempt whatever the outcome, so a blocked attempt costs the same as
    // a missing/restricted one (timing parity, #350's reasoning).
    const blockRows = await this.prisma.block.findMany({
      where: blockedPairWhere(callerId, recipientId),
      select: { blockerId: true, blockedId: true },
    });

    const recipient = users.find((u) => u.id === recipientId);
    const caller = users.find((u) => u.id === callerId);
    const recipientIsMinor = this.assertRecipientMessageable(recipient);

    // B-039 (Decision Log #396, #404 item 11): a Block applies ON TOP of the age
    // and consent rules above, which are decided first. Messages stop in both
    // directions, and a block never reveals itself: if the RECIPIENT blocked the
    // caller the answer is the same 404 'User not found' every other
    // not-messageable recipient gets; only the BLOCKER (who knows) gets the 403.
    const blockRelation = relationFromRows(blockRows, callerId, recipientId);
    if (blockRelation === 'other_blocked_viewer') {
      throw new NotFoundException('User not found');
    }
    if (blockRelation === 'viewer_blocked_other') {
      throw new ForbiddenException({ message: YOU_BLOCKED_THIS_USER_MESSAGE, code: YOU_BLOCKED_THIS_USER_CODE });
    }

    // sprint-1/adult-to-minor-dm-block (Decision Log #347): an adult
    // cannot CREATE a new conversation with a minor (answered with the
    // indistinguishable 404 below, not a distinct 403). Only creation is
    // blocked: if the thread already exists (necessarily minor-initiated,
    // or predating this rule) it is simply returned, and sending into it
    // is unaffected. Minor->adult and minor->minor are allowed; the
    // under-16 total block and guardian-consent gating apply separately.
    if (existing) {
      const [view] = await this.toConversationViews([existing], callerId);
      return { view, created: false };
    }
    if (recipientIsMinor && caller && !caller.isMinor) {
      // Enumeration prevention: the SAME 404 (same class, same message,
      // hence same body) a non-existent / restricted-pending /
      // deactivated recipient gets.
      throw new NotFoundException('User not found');
    }
    // B-061 (Decision Log #472 (i), the 'Who can message me' setting): applied AFTER every rule above
    // has decided, so it can only TIGHTEN them, never loosen one. It governs STARTING a new conversation
    // only (an existing thread was returned above and keeps working; DEFAULT, founder-veto-able).
    // 'following' = the RECIPIENT follows the caller. A refusal is the SAME 404 'User not found' every
    // other not-messageable recipient gets, decided in memory from the reads above.
    if (!this.recipientAcceptsNewConversation(recipient)) {
      throw new NotFoundException('User not found');
    }

    let conversation: ConversationRow;
    let created = false;
    try {
      conversation = await this.prisma.conversation.create({
        data: { participantIds: ids, participantKey: key },
        select: CONVERSATION_SELECT,
      });
      created = true;
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) {
        throw err;
      }
      // A conversation with this exact participant set already exists
      // (or a concurrent request just created it) — find-or-create
      // returns it.
      conversation = await this.prisma.conversation.findUniqueOrThrow({
        where: { participantKey: key },
        select: CONVERSATION_SELECT,
      });
    }

    const [view] = await this.toConversationViews([conversation], callerId);
    return { view, created };
  }

  // GET /conversations — the caller's inbox, most-recent-activity first
  // (Conversation.lastMessageAt desc, id desc tiebreaker). Keyset
  // pagination (Section 5.5), opaque base64 cursor. `participantIds: {
  // has: callerId }` is the Postgres array-containment filter — see
  // messaging/README.md on the GIN-index option if this table ever grows.
  async listConversations(
    callerId: string,
    query: MessagingQueryDto,
  ): Promise<ConversationPage> {
    const limit = Math.min(query.limit ?? MESSAGING_DEFAULT_PAGE_SIZE, MESSAGING_MAX_PAGE_SIZE);

    // B-067: a conversation the caller deleted ("delete chat", for them only) is left out unless a message
    // newer than the moment they hid it exists (lastMessageAt is bumped by every send). The hide rows are read
    // first (a Prisma where cannot compare two columns), and the exclusion is added only when there are any.
    const cutoffs = await this.conversationHideCutoffs(callerId);
    const base: Prisma.ConversationWhereInput = { participantIds: { has: callerId } };
    if (cutoffs.size > 0) {
      base.NOT = {
        OR: [...cutoffs].map(([id, hiddenAt]) => ({ id, lastMessageAt: { lte: hiddenAt } })),
      };
    }
    const where: Prisma.ConversationWhereInput = query.cursor
      ? { AND: [base, this.buildConversationCursorFilter(query.cursor)] }
      : base;

    const rows = await this.prisma.conversation.findMany({
      where,
      orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: CONVERSATION_SELECT,
    });

    const hasMore = rows.length > limit;
    const trimmed = hasMore ? rows.slice(0, limit) : rows;
    const last = trimmed[trimmed.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeConversationCursor({ lastMessageAt: last.lastMessageAt, id: last.id })
        : null;

    const items = await this.toConversationViews(trimmed, callerId, cutoffs);
    return { items, nextCursor };
  }

  private buildConversationCursorFilter(raw: string): Prisma.ConversationWhereInput {
    const cursor = decodeConversationCursor(raw);
    return {
      OR: [
        { lastMessageAt: { lt: cursor.lastMessageAt } },
        { lastMessageAt: cursor.lastMessageAt, id: { lt: cursor.id } },
      ],
    };
  }

  // GET /conversations/:id/messages — newest message first (sentAt desc,
  // id desc), matching GET /clubs/:id/feed / GET /posts/feed's direction
  // (the convention this task was told to match). A chat UI shows the
  // newest at the bottom and pages backward into history, which is
  // exactly what newest-first keyset paging gives.
  //
  // Not found OR caller-not-a-participant -> 404 (assertParticipant): a
  // private conversation's existence is never disclosed to an outsider.
  async getMessages(
    conversationId: string,
    callerId: string,
    query: MessagingQueryDto,
  ): Promise<MessagePage> {
    const conversation = await this.assertParticipant(conversationId, callerId);

    const limit = Math.min(query.limit ?? MESSAGING_DEFAULT_PAGE_SIZE, MESSAGING_MAX_PAGE_SIZE);

    // B-067: leave out what the caller deleted for themselves -- everything sent at or before the moment they
    // deleted the chat, and any single message they hid. The clauses are added only when the caller has such a
    // row, so an ordinary thread reads exactly as before. A message deleted for EVERYONE is NOT left out: it
    // comes back as the placeholder to both people (toMessageView).
    const thread = await this.readThreadHides(callerId, conversationId);
    const base: Prisma.MessageWhereInput = { conversationId };
    if (thread.hiddenAt) base.sentAt = { gt: thread.hiddenAt };
    if (thread.hasHiddenMessages) base.hides = { none: { userId: callerId } };
    const where: Prisma.MessageWhereInput = query.cursor
      ? { AND: [base, this.buildMessageCursorFilter(query.cursor)] }
      : base;

    const rows = await this.prisma.message.findMany({
      where,
      orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: MESSAGE_SELECT,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last ? encodeMessageCursor({ sentAt: last.sentAt, id: last.id }) : null;

    // Read receipts: the two settings are read only when the page holds a message the caller SENT that has been
    // read (an ordinary page costs no extra query).
    const discloseReadAt = await this.shouldDiscloseReadAt(
      callerId,
      this.otherParticipantId(conversation.participantIds, callerId),
      page,
    );
    return { items: page.map((row) => toMessageView(row, callerId, discloseReadAt)), nextCursor };
  }

  private buildMessageCursorFilter(raw: string): Prisma.MessageWhereInput {
    const cursor = decodeMessageCursor(raw);
    return {
      OR: [
        { sentAt: { lt: cursor.sentAt } },
        { sentAt: cursor.sentAt, id: { lt: cursor.id } },
      ],
    };
  }

  // POST /conversations/:id/messages. The Message row and the
  // Conversation.lastMessageAt bump land in one interactive transaction
  // so the inbox ordering can never drift from the actual last message —
  // the same "write the denormalized field in the same tx as the thing
  // it summarizes" discipline FeedService uses for likeCount/commentCount.
  //
  // Guards: JwtAuthGuard + GuardianConsentGuard (sending = "messaging",
  // Section 5.7).
  //
  // CORRECTED by sprint-1/guardian-consent-decline-withdraw-expiry: this
  // comment previously said the guard "can never actually block anyone
  // here in practice", on the premise that isMinor / Guardian.
  // consentStatus never move backward. consentStatus CAN now move
  // backward — a guardian may withdraw consent on a confirmed account, or
  // two consent requests may lapse unanswered — so a participant in an
  // existing conversation can genuinely become restricted after the fact,
  // and this guard will genuinely fire for them. No behaviour change was
  // needed: blocking them is exactly the right outcome, and the guard was
  // already written as an allowlist (consentStatus === 'confirmed'), so it
  // handles the new 'declined' value correctly without modification. In
  // practice such a user is doubly blocked, since refusing consent also
  // revokes every session they hold.
  //
  // message Notification (Decision Log #87's audit,
  // sprint-3/notification-triggers-message-fixture-contest): recipient is
  // the OTHER participant in this strictly-2-party conversation
  // (Conversation.participantIds always has exactly 2 distinct entries --
  // self-recipient is 400'd at startConversation). Guarded defensively
  // against self-notification anyway (`recipientId !== senderId`), for
  // consistency with every other trigger in this codebase.
  //
  // Collapsed, not one row per message: a busy back-and-forth thread
  // would otherwise flood the recipient's Notification Centre with one
  // row per message, duplicating GET /conversations's own live
  // unreadCount/lastMessage preview. A new row is only created if the
  // recipient doesn't already have an UNREAD Notification for
  // type: 'message' + payloadRefId: conversationId -- i.e. one "you have
  // unread messages here" entry per conversation, not per message.
  // markConversationRead (below) now clears this same Notification when
  // the recipient opens the thread -- see its own comment for why this
  // was fixed there rather than via a dedicated notifications endpoint
  // (sprint-3/banter-messaging-to-code, closing the gap this comment used
  // to flag; see messaging/README.md).
  //
  // No engagement points (private, and rewarding private messages would
  // be trivially gameable).
  async sendMessage(
    conversationId: string,
    senderId: string,
    dto: SendMessageDto,
  ): Promise<MessageView> {
    const conversation = await this.assertParticipant(conversationId, senderId);
    const recipientId = conversation.participantIds.find((id) => id !== senderId) ?? null;

    await this.assertNoBlock(senderId, recipientId);

    const created = await this.prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: {
          conversationId,
          senderId,
          contentText: dto.contentText,
        },
        select: MESSAGE_SELECT,
      });
      await tx.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: message.sentAt },
      });
      // B-197: no new Notification where sender and recipient have a Block between
      // them (sending itself is refused earlier; this covers a Block landing in
      // between and keeps the rule in one place).
      if (recipientId !== null && recipientId !== senderId && !(await hasBlockBetween(tx, senderId, recipientId))) {
        const existingUnread = await tx.notification.findFirst({
          where: {
            userId: recipientId,
            type: 'message',
            payloadRefId: conversationId,
            read: false,
          },
          select: { id: true },
        });
        if (!existingUnread) {
          await tx.notification.create({
            data: { userId: recipientId, type: 'message', payloadRefId: conversationId },
          });
        }
      }
      return message;
    });
    // A message that was just created cannot have been read, so there is nothing to disclose.
    return toMessageView(created, senderId, false);
  }

  // B-039: messages stop in both directions once either side has blocked the
  // other. The blocked SENDER gets the 404 an unreachable conversation gets
  // (never a message saying they are blocked, #404 item 11); the blocker gets
  // the explicit 403. The existing thread and its history stay readable and
  // listed -- whether a blocked pair's thread should disappear from either
  // inbox is NOT decided (docs/backend-w5-report.md, OPEN).
  // B-067: shared by sendMessage and editMessage so an edit passes exactly the checks a send does. Deleting
  // (either scope) deliberately does NOT call this: a person can always delete, even with a Block between them.
  private async assertNoBlock(senderId: string, recipientId: string | null): Promise<void> {
    if (recipientId === null) return;
    const blockRows = await this.prisma.block.findMany({
      where: blockedPairWhere(senderId, recipientId),
      select: { blockerId: true, blockedId: true },
    });
    const relation = relationFromRows(blockRows, senderId, recipientId);
    if (relation === 'other_blocked_viewer') {
      throw new NotFoundException('Conversation not found');
    }
    if (relation === 'viewer_blocked_other') {
      throw new ForbiddenException({ message: YOU_BLOCKED_THIS_USER_MESSAGE, code: YOU_BLOCKED_THIS_USER_CODE });
    }
  }

  // PATCH /conversations/:id/messages/:messageId { contentText } (B-067, Decision Log #472 (b)).
  // The SENDER may edit their own text message within MESSAGE_EDIT_WINDOW_MINUTES of sentAt (server clock).
  // Passes exactly what sendMessage passes: participant (404), Block in both directions (the same 404 / 403
  // split), the same DTO bounds -- and the controller carries the same guard set. No new Notification, and
  // lastMessageAt is not touched (an edit is not new activity).
  // The first edit stores the text as first sent in originalContentText; later edits never overwrite it. No read
  // path returns it.
  // Order of refusals: 404 (conversation, Block, message) -> 403 (not the sender) -> 409 message_not_editable
  // (deleted for everyone, or not a text message) -> 409 message_edit_window_closed.
  async editMessage(
    conversationId: string,
    messageId: string,
    senderId: string,
    dto: EditMessageDto,
  ): Promise<MessageView> {
    const conversation = await this.assertParticipant(conversationId, senderId);
    const recipientId = conversation.participantIds.find((id) => id !== senderId) ?? null;
    await this.assertNoBlock(senderId, recipientId);

    const message = await this.prisma.message.findFirst({
      where: { id: messageId, conversationId },
      select: {
        id: true,
        senderId: true,
        contentText: true,
        mediaUrl: true,
        sentAt: true,
        originalContentText: true,
        deletedForEveryoneAt: true,
      },
    });
    if (!message) {
      throw new NotFoundException('Message not found');
    }
    if (message.senderId !== senderId) {
      throw new ForbiddenException({
        message: 'You can only edit your own messages',
        code: MESSAGE_EDIT_NOT_SENDER_CODE,
      });
    }
    if (message.deletedForEveryoneAt || message.mediaUrl) {
      throw new ConflictException({
        message: 'This message can no longer be edited',
        code: MESSAGE_NOT_EDITABLE_CODE,
      });
    }

    const now = this.clock.now();
    const earliestSentAt = new Date(now.getTime() - MESSAGE_EDIT_WINDOW_MS);
    // sentAt exactly MESSAGE_EDIT_WINDOW_MS ago is still inside the window; one millisecond older is not.
    if (message.sentAt.getTime() < earliestSentAt.getTime()) {
      throw new ConflictException({
        message: 'The time for editing this message has passed',
        code: MESSAGE_EDIT_WINDOW_CLOSED_CODE,
      });
    }

    // The conditions are repeated in the write, so a delete that lands between the read and the write wins.
    const result = await this.prisma.message.updateMany({
      where: {
        id: messageId,
        conversationId,
        senderId,
        deletedForEveryoneAt: null,
        sentAt: { gte: earliestSentAt },
      },
      data: {
        contentText: dto.contentText,
        editedAt: now,
        originalContentText: message.originalContentText ?? message.contentText,
      },
    });
    if (result.count === 0) {
      throw new ConflictException({
        message: 'This message can no longer be edited',
        code: MESSAGE_NOT_EDITABLE_CODE,
      });
    }

    const updated = await this.prisma.message.findUniqueOrThrow({
      where: { id: messageId },
      select: MESSAGE_SELECT,
    });
    const discloseReadAt = await this.shouldDiscloseReadAt(senderId, recipientId, [updated]);
    return toMessageView(updated, senderId, discloseReadAt);
  }

  // DELETE /conversations/:id/messages/:messageId?scope=me|everyone (B-067).
  //  - me: any message in a conversation the caller is in. A MessageHide row (idempotent); the other person and
  //    the database are untouched.
  //  - everyone: the SENDER only, at any time. Sets deletedForEveryoneAt (idempotent). The row, the text and any
  //    original STAY in the database; nothing is purged, and both people then see the placeholder.
  // Participant check only: no Block check (a person can always delete) and no edit window.
  async deleteMessage(
    conversationId: string,
    messageId: string,
    callerId: string,
    scope: DeleteMessageScope,
  ): Promise<void> {
    await this.assertParticipant(conversationId, callerId);

    const message = await this.prisma.message.findFirst({
      where: { id: messageId, conversationId },
      select: { id: true, senderId: true },
    });
    if (!message) {
      throw new NotFoundException('Message not found');
    }

    if (scope === 'me') {
      await this.prisma.messageHide.createMany({
        data: [{ userId: callerId, messageId, hiddenAt: this.clock.now() }],
        skipDuplicates: true,
      });
      return;
    }

    if (message.senderId !== callerId) {
      throw new ForbiddenException({
        message: 'You can only delete your own messages for everyone',
        code: MESSAGE_DELETE_NOT_SENDER_CODE,
      });
    }
    await this.prisma.message.updateMany({
      where: { id: messageId, deletedForEveryoneAt: null },
      data: { deletedForEveryoneAt: this.clock.now() },
    });
  }

  // DELETE /conversations/:id (B-067): "delete chat" for the CALLER only. Upserts ConversationHide at now: the
  // caller's reads then leave out everything sent up to that moment, and the other person's view is unchanged.
  // A message sent afterwards brings the conversation back with only the newer messages. Nothing is deleted.
  async deleteConversation(conversationId: string, callerId: string): Promise<void> {
    await this.assertParticipant(conversationId, callerId);
    const hiddenAt = this.clock.now();
    await this.prisma.conversationHide.upsert({
      where: { userId_conversationId: { userId: callerId, conversationId } },
      create: { userId: callerId, conversationId, hiddenAt },
      update: { hiddenAt },
    });
  }

  // B-067: the caller's "delete chat" moments, conversationId -> hiddenAt. One primary-key read of the caller
  // with the relation selected (their own per-user view settings), optionally limited to a page's conversations.
  private async conversationHideCutoffs(
    callerId: string,
    conversationIds?: string[],
  ): Promise<Map<string, Date>> {
    const me = await this.prisma.user.findUnique({
      where: { id: callerId },
      select: {
        conversationHides: {
          where: conversationIds ? { conversationId: { in: conversationIds } } : undefined,
          select: { conversationId: true, hiddenAt: true },
        },
      },
    });
    return new Map((me?.conversationHides ?? []).map((h) => [h.conversationId, h.hiddenAt]));
  }

  // B-067: what the caller hid inside ONE thread -- the moment they deleted the chat (or null), and whether they
  // hid any single message there (take: 1, only the existence matters).
  private async readThreadHides(
    callerId: string,
    conversationId: string,
  ): Promise<{ hiddenAt: Date | null; hasHiddenMessages: boolean }> {
    const me = await this.prisma.user.findUnique({
      where: { id: callerId },
      select: {
        conversationHides: { where: { conversationId }, select: { hiddenAt: true }, take: 1 },
        messageHides: { where: { message: { conversationId } }, select: { messageId: true }, take: 1 },
      },
    });
    return {
      hiddenAt: me?.conversationHides[0]?.hiddenAt ?? null,
      hasHiddenMessages: (me?.messageHides.length ?? 0) > 0,
    };
  }

  // PATCH /conversations/:id/read — marks every message in the
  // conversation NOT sent by the caller and currently unread as read.
  // The UX operation is "I opened the thread"; per-message read isn't
  // needed for MVP and Message.readAt is a single timestamp (only
  // coherent for 2 parties). Mirrors PATCH /notifications/read-all
  // (Section 4.7). Idempotent — a second call marks 0. Not content
  // creation, so JwtAuthGuard only.
  //
  // ALSO clears the collapsed 'message' Notification (sprint-3/
  // banter-messaging-to-code, closing the gap sendMessage's own comment
  // above flagged): the frontend has no notifications endpoint to call
  // at all (notifications/README.md is still a bare placeholder), so
  // this is the only real place that can ever mark that Notification
  // read — there is no separate PATCH /notifications/:id/read a client
  // could hit instead. Scoped to `userId: callerId` (never the other
  // participant's own unrelated Notification row) + the exact
  // type/payloadRefId sendMessage writes. Two independent updateMany
  // calls, not one $transaction: unlike likeCount/commentCount this
  // isn't a cache that can drift out of sync with a source-of-truth row
  // — Message.readAt and Notification.read are two separate,
  // independently-idempotent facts about the same real-world action, and
  // either succeeding without the other is harmless (the reader can
  // reopen the thread, or the Notification is stale-but-inert).
  async markConversationRead(
    conversationId: string,
    callerId: string,
  ): Promise<MarkReadResult> {
    await this.assertParticipant(conversationId, callerId);

    const result = await this.prisma.message.updateMany({
      where: { conversationId, senderId: { not: callerId }, readAt: null },
      data: { readAt: new Date() },
    });

    await this.prisma.notification.updateMany({
      where: {
        userId: callerId,
        type: 'message',
        payloadRefId: conversationId,
        read: false,
      },
      data: { read: true },
    });

    return { conversationId, markedRead: result.count };
  }

  // Existence + membership check for every /:id route. 404 (not 403) for
  // both "no such conversation" and "you're not in it" — a DM thread is
  // private, and confirming one exists to a non-participant would leak
  // that two specific users are talking. Same "hide via 404" convention
  // as UsersService.assertFollowGraphVisible / GuardianConsentController.
  private async assertParticipant(
    conversationId: string,
    callerId: string,
  ): Promise<ConversationRow> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: CONVERSATION_SELECT,
    });
    if (!conversation || !conversation.participantIds.includes(callerId)) {
      throw new NotFoundException('Conversation not found');
    }
    return conversation;
  }

  // The "receiving" half of Decision Log #12: a minor awaiting guardian
  // consent is blocked from RECEIVING DMs, not just sending them.
  // GuardianConsentGuard on the controller can only inspect the caller,
  // so this service-level check reads the RECIPIENT's status instead —
  // structurally identical to UsersService.assertFollowGraphVisible
  // (which does the same for a follow-graph target).
  //
  // Scope is guardian consent ONLY — User.isMinor + Guardian.consentStatus,
  // the exact fields GuardianConsentGuard reads. NOT email
  // verificationStatus: Decision Log #12 is explicit that email-
  // verification and guardian-consent are distinct signals kept behind
  // distinct mechanisms, and a general "unverified accounts can't
  // message anyone" rule is a separate future decision, not this one.
  //
  // A restricted-pending (or non-existent, or deactivated) recipient is
  // all treated identically: 404, never a distinct 403 that would
  // confirm the account exists.
  // Pure and synchronous on purpose (no DB access): the recipient row,
  // including its guardian consent status, is fetched by startConversation
  // in the same query as the caller's, so every outcome costs the same.
  // B-061: pure, in-memory. Missing/undefined values (rows read before the setting existed, or test
  // doubles) behave as the default 'everyone'; an unrecognised value fails CLOSED (treated as 'none').
  private recipientAcceptsNewConversation(
    recipient: { dmPermission?: string; following?: unknown[] } | undefined,
  ): boolean {
    const permission = recipient?.dmPermission ?? 'everyone';
    if (permission === 'everyone') return true;
    if (permission === 'following') return (recipient?.following?.length ?? 0) > 0;
    return false;
  }

  private assertRecipientMessageable(
    user:
      | {
          isMinor: boolean;
          isUnder16: boolean;
          accountStatus: string;
          guardian: { consentStatus: string } | null;
        }
      | undefined,
  ): boolean {
    if (!user) {
      throw new NotFoundException('User not found');
    }
    // Decision Log #221: cannot start a conversation with a deactivated /
    // pending_deletion account -- same 404-not-403 treatment
    // assertFollowGraphVisible gives a non-active target. Checked before
    // the minor branch because it applies regardless of age.
    if (user.accountStatus !== 'active') {
      throw new NotFoundException('User not found');
    }
    // sprint-1/under-16-restrictions: an under-16 cannot RECEIVE a DM from
    // anyone, including other minors. Decision Log #351 reversed Decision
    // Log #346's distinct 403 here: it is now the same indistinguishable
    // 404 as every other blocked path, because a distinct 403 let anyone
    // learn in one request that an account exists and is under 16. Trade-off
    // (less UX clarity for senders) documented in messaging/README.md.
    if (user.isUnder16) {
      throw new NotFoundException('User not found');
    }
    if (!user.isMinor) {
      return false;
    }
    // Guardian.minorUserId is @unique -- at most one Guardian row per minor.
    if (user.guardian?.consentStatus === 'confirmed') {
      return true;
    }
    throw new NotFoundException('User not found');
  }

  // Batched conversation -> ConversationView. THREE queries total for a
  // whole page, never one-per-conversation (no N+1): the other
  // participants' names, the per-conversation unread count
  // (message.groupBy), and the latest message per conversation
  // (findMany + distinct). Empty input -> empty output, no queries.
  private async toConversationViews(
    conversations: ConversationRow[],
    callerId: string,
    knownCutoffs?: Map<string, Date>,
  ): Promise<ConversationView[]> {
    if (conversations.length === 0) {
      return [];
    }

    const conversationIds = conversations.map((c) => c.id);
    // B-067: the unread count and the last-message preview ignore messages the caller deleted for themselves
    // (one message, or everything up to a "delete chat") and messages deleted for everyone.
    const cutoffs = knownCutoffs ?? (await this.conversationHideCutoffs(callerId, conversationIds));
    const visibleMessages: Prisma.MessageWhereInput = {
      ...(cutoffs.size > 0
        ? {
            OR: conversationIds.map((id) => {
              const hiddenAt = cutoffs.get(id);
              return hiddenAt ? { conversationId: id, sentAt: { gt: hiddenAt } } : { conversationId: id };
            }),
          }
        : { conversationId: { in: conversationIds } }),
      deletedForEveryoneAt: null,
      hides: { none: { userId: callerId } },
    };
    const otherIds = [
      ...new Set(
        conversations
          .map((c) => this.otherParticipantId(c.participantIds, callerId))
          .filter((id): id is string => id !== null),
      ),
    ];

    const [others, unreadGroups, lastMessages] = await Promise.all([
      otherIds.length > 0
        ? this.prisma.user.findMany({
            where: { id: { in: otherIds } },
            select: { id: true, ...PUBLIC_NAME_SELECT },
          })
        : Promise.resolve([] as { id: string; username: string | null; displayName: string }[]),
      this.prisma.message.groupBy({
        by: ['conversationId'],
        where: { AND: [visibleMessages, { senderId: { not: callerId }, readAt: null }] },
        _count: { _all: true },
      }),
      // Latest message per conversation in one query: `distinct` on
      // conversationId returns the FIRST row per group in the given
      // order, so ordering by (conversationId, sentAt desc, id desc)
      // yields each conversation's newest message.
      this.prisma.message.findMany({
        where: visibleMessages,
        orderBy: [{ conversationId: 'asc' }, { sentAt: 'desc' }, { id: 'desc' }],
        distinct: ['conversationId'],
        select: { conversationId: true, contentText: true, senderId: true, sentAt: true },
      }),
    ]);

    const nameById = new Map(others.map((u) => [u.id, resolvePublicName(u)]));
    const unreadByConversation = new Map(
      unreadGroups.map((g) => [g.conversationId, g._count._all]),
    );
    const lastByConversation = new Map(lastMessages.map((m) => [m.conversationId, m]));

    return conversations.map((c) => {
      const otherId = this.otherParticipantId(c.participantIds, callerId);
      const last = lastByConversation.get(c.id) ?? null;
      return {
        id: c.id,
        otherParticipant: otherId
          ? { id: otherId, publicName: nameById.get(otherId) ?? null }
          : null,
        lastMessageAt: c.lastMessageAt,
        createdAt: c.createdAt,
        lastMessage: last
          ? { contentText: last.contentText, senderId: last.senderId, sentAt: last.sentAt }
          : null,
        unreadCount: unreadByConversation.get(c.id) ?? 0,
      };
    });
  }

  // Read receipts (see read-receipt-disclosure.util.ts). True only when the pair's settings and age classes allow
  // the caller's own read messages to show a read time. Skipped (false, no query) when nothing in `rows` could use
  // it: no row the caller sent that has been read, or no other participant.
  private async shouldDiscloseReadAt(
    callerId: string,
    otherId: string | null,
    rows: { senderId: string; readAt: Date | null; deletedForEveryoneAt: Date | null }[],
  ): Promise<boolean> {
    // A message deleted for everyone is returned as the placeholder (no readAt at all), so it needs no check.
    if (
      otherId === null ||
      !rows.some((r) => r.senderId === callerId && r.readAt !== null && r.deletedForEveryoneAt === null)
    ) {
      return false;
    }
    const people = await this.prisma.user.findMany({
      where: { id: { in: [callerId, otherId] } },
      select: { id: true, isMinor: true, readReceipts: true },
    });
    return canDiscloseReadAt(
      people.find((u) => u.id === callerId),
      people.find((u) => u.id === otherId),
    );
  }

  private otherParticipantId(participantIds: string[], callerId: string): string | null {
    return participantIds.find((id) => id !== callerId) ?? null;
  }
}
