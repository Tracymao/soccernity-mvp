import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
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
import { MessagingQueryDto } from './dto/messaging-query.dto';

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

// Every field on Message is safe to return to a participant — there is
// nothing sensitive on the row. Selected explicitly (not a bare model
// return) so a future column addition is a deliberate choice to expose,
// same discipline as POST_SELECT / ROOM_SELECT elsewhere.
const MESSAGE_SELECT = {
  id: true,
  conversationId: true,
  senderId: true,
  contentText: true,
  mediaUrl: true,
  sentAt: true,
  readAt: true,
} as const;

export type MessageView = Prisma.MessageGetPayload<{ select: typeof MESSAGE_SELECT }>;

// The other person in a 2-party conversation. `displayName` is nullable
// only for the ghost case: a participant hard-deleted by the account-
// deletion sweep (Message.senderId cascades, but Conversation.participantIds
// still holds the id). The surviving participant then sees a conversation
// whose other party has no name and no messages — acceptable for MVP,
// flagged in messaging/README.md.
export interface OtherParticipant {
  id: string;
  displayName: string | null;
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
  constructor(private readonly prisma: PrismaService) {}

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
    await this.assertRecipientMessageable(recipientId, callerId);

    const ids = [callerId, recipientId].sort();
    const key = participantKey(ids);

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

    const base: Prisma.ConversationWhereInput = { participantIds: { has: callerId } };
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

    const items = await this.toConversationViews(trimmed, callerId);
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
    await this.assertParticipant(conversationId, callerId);

    const limit = Math.min(query.limit ?? MESSAGING_DEFAULT_PAGE_SIZE, MESSAGING_MAX_PAGE_SIZE);

    const base: Prisma.MessageWhereInput = { conversationId };
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
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];
    const nextCursor =
      hasMore && last ? encodeMessageCursor({ sentAt: last.sentAt, id: last.id }) : null;

    return { items, nextCursor };
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
  // Section 5.7). Note this guard can never actually block anyone here in
  // practice: a conversation can only have been created between two
  // non-restricted users (startConversation's checks guarantee it), and
  // isMinor / Guardian.consentStatus never move backward — so no
  // restricted-pending minor can be a participant in an existing
  // conversation. It's kept for defence-in-depth and consistency with
  // every other content-creation route, and documented as such in
  // messaging/README.md.
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
  // Nothing currently marks these read when the conversation itself is
  // read (markConversationRead only touches Message.readAt) -- a real,
  // flagged gap, not fixed here; see messaging/README.md.
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

    return this.prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: {
          conversationId,
          senderId,
          contentText: dto.contentText,
          mediaUrl: dto.mediaUrl,
        },
        select: MESSAGE_SELECT,
      });
      await tx.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: message.sentAt },
      });
      if (recipientId !== null && recipientId !== senderId) {
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
  }

  // PATCH /conversations/:id/read — marks every message in the
  // conversation NOT sent by the caller and currently unread as read.
  // The UX operation is "I opened the thread"; per-message read isn't
  // needed for MVP and Message.readAt is a single timestamp (only
  // coherent for 2 parties). Mirrors PATCH /notifications/read-all
  // (Section 4.7). Idempotent — a second call marks 0. One statement, no
  // transaction needed. Not content creation, so JwtAuthGuard only.
  async markConversationRead(
    conversationId: string,
    callerId: string,
  ): Promise<MarkReadResult> {
    await this.assertParticipant(conversationId, callerId);

    const result = await this.prisma.message.updateMany({
      where: { conversationId, senderId: { not: callerId }, readAt: null },
      data: { readAt: new Date() },
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
  private async assertRecipientMessageable(
    recipientId: string,
    callerId: string,
  ): Promise<void> {
    if (recipientId === callerId) {
      throw new BadRequestException('You cannot start a conversation with yourself');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: recipientId },
      select: { id: true, isMinor: true, accountStatus: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    // Decision Log #221: cannot start a conversation with a deactivated /
    // pending_deletion account — same 404-not-403 treatment
    // assertFollowGraphVisible gives a non-active target. Checked before
    // the minor branch because it applies regardless of age.
    if (user.accountStatus !== 'active') {
      throw new NotFoundException('User not found');
    }
    if (!user.isMinor) {
      return;
    }

    // Guardian.minorUserId is @unique — at most one Guardian row per minor.
    const guardian = await this.prisma.guardian.findUnique({
      where: { minorUserId: recipientId },
      select: { consentStatus: true },
    });
    if (guardian?.consentStatus === 'confirmed') {
      return;
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
  ): Promise<ConversationView[]> {
    if (conversations.length === 0) {
      return [];
    }

    const conversationIds = conversations.map((c) => c.id);
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
            select: { id: true, displayName: true },
          })
        : Promise.resolve([] as { id: string; displayName: string }[]),
      this.prisma.message.groupBy({
        by: ['conversationId'],
        where: { conversationId: { in: conversationIds }, senderId: { not: callerId }, readAt: null },
        _count: { _all: true },
      }),
      // Latest message per conversation in one query: `distinct` on
      // conversationId returns the FIRST row per group in the given
      // order, so ordering by (conversationId, sentAt desc, id desc)
      // yields each conversation's newest message.
      this.prisma.message.findMany({
        where: { conversationId: { in: conversationIds } },
        orderBy: [{ conversationId: 'asc' }, { sentAt: 'desc' }, { id: 'desc' }],
        distinct: ['conversationId'],
        select: { conversationId: true, contentText: true, senderId: true, sentAt: true },
      }),
    ]);

    const nameById = new Map(others.map((u) => [u.id, u.displayName]));
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
          ? { id: otherId, displayName: nameById.get(otherId) ?? null }
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

  private otherParticipantId(participantIds: string[], callerId: string): string | null {
    return participantIds.find((id) => id !== callerId) ?? null;
  }
}
