import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  NOTIFICATIONS_DEFAULT_PAGE_SIZE,
  NOTIFICATIONS_MAX_PAGE_SIZE,
} from './notifications.constants';
import { decodeNotificationCursor, encodeNotificationCursor } from './cursor.util';
import { NotificationsQueryDto } from './dto/notifications-query.dto';

// The seven real MVP notification types — see schema.prisma's own comment
// on Notification.type for the authoritative list and where each is
// written (sprint-3/notification-triggers-message-fixture-contest,
// Decision Log #87/#278). `payloadRefId` is a bare, untyped string with no
// FK — a referenced row can be gone by the time this reads it (hard
// account deletion, Decision Log #44's cascade), which is why every
// resolved `data` field below is nullable.
const NOTIFICATION_ROW_SELECT = {
  id: true,
  userId: true,
  type: true,
  payloadRefId: true,
  read: true,
  createdAt: true,
} as const;

type NotificationRow = Prisma.NotificationGetPayload<{ select: typeof NOTIFICATION_ROW_SELECT }>;

// ---------------------------------------------------------------------
// Resolved `data` shapes. Deliberately structured data, not pre-rendered
// English — copy/templating is a frontend concern; DL #279 already
// finalized the exact per-type wording in Figma, and baking strings into
// this API would fight that. The frontend switches on the notification's
// own `type` field to know which of these shapes to expect.
// ---------------------------------------------------------------------

// follow — payloadRefId IS the actor's own userId (see users.service.ts),
// so this is the one type where the actor is directly resolvable.
export interface NotificationActor {
  id: string;
  displayName: string;
}

// like / comment — payloadRefId is the POST, not an actor. A real,
// disclosed limitation, not an oversight: neither Like nor Comment stores
// who performed the action anywhere Notification can reach without
// touching the trigger call sites (out of this PR's scope) — so a
// like/comment notification can resolve WHAT was liked/commented on, but
// never WHO did it. See notifications/README.md for the open Decision Log
// candidate (a future `actorId` column).
export interface NotificationPost {
  id: string;
  contentText: string;
  authorId: string;
}

// message — payloadRefId is the conversationId (one collapsed unread row
// per thread, not per message). The caller of GET /notifications is
// always the notification's own recipient, and a Conversation is always
// exactly 2 participants, so "the other participant" is unambiguous and
// doubles as the sender. `null` only for the ghost case (Decision Log
// #44's cascade hard-deleted them) — same as messaging's own
// OtherParticipant.
export interface NotificationOtherParticipant {
  id: string;
  displayName: string | null;
}

// fixture_scheduled / result_logged — payloadRefId is the fixtureId.
// `teamBName` is null when the away side is a free-text opponent
// (Decision Log #256) rather than a registered team — the API returns
// the raw value, same "Opponent TBC" fallback stays a frontend concern
// precedent FIXTURE_SELECT itself already established.
export interface NotificationFixture {
  id: string;
  teamAName: string;
  teamBName: string | null;
  scheduledAt: Date;
  status: string;
  result: { scoreA: number; scoreB: number } | null;
}

// contest_win — payloadRefId is the cycleId, deliberately not
// roundId/entryId (contest.service.ts's own comment: "the one
// single-resource read endpoint that exists today"). This resolves the
// cycle's title only — which week or position was won is not
// recoverable from this reference without a correlated query the
// upstream design deliberately avoided storing a pointer for; not
// reproduced here either, for the same reason.
export interface NotificationContestCycle {
  id: string;
  title: string;
}

export type NotificationData =
  | { actor: NotificationActor }
  | { post: NotificationPost }
  | { conversationId: string; otherParticipant: NotificationOtherParticipant | null }
  | { fixture: NotificationFixture }
  | { cycle: NotificationContestCycle }
  // age_milestone: payloadRefId is the milestone key (e.g. 'under_16_lifted').
  | { milestone: string };

export interface NotificationView {
  id: string;
  type: string;
  read: boolean;
  createdAt: Date;
  payloadRefId: string | null;
  // null when payloadRefId is missing, or the referenced row is gone.
  data: NotificationData | null;
}

export interface NotificationPage {
  items: NotificationView[];
  nextCursor: string | null;
  unreadCount: number;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  // GET /notifications — the caller's own inbox, keyset-paginated
  // newest-first (Notification.createdAt desc, id desc — the same
  // direction feed/clubs/banter/messaging's own list endpoints page in).
  // Implicitly self-scoped: no :id param, always `userId` from the
  // caller's own access token, same as GET /contest/current.
  //
  // unreadCount is computed alongside the page (one extra COUNT query,
  // in parallel) so the Notification Centre page itself doesn't need a
  // second round-trip to GET /notifications/unread-count just to render
  // its own header — that endpoint exists for callers (the Navbar badge,
  // rendered on every page) that need the count WITHOUT paying for a
  // full resolved page.
  async listNotifications(
    userId: string,
    query: NotificationsQueryDto,
  ): Promise<NotificationPage> {
    const limit = Math.min(query.limit ?? NOTIFICATIONS_DEFAULT_PAGE_SIZE, NOTIFICATIONS_MAX_PAGE_SIZE);

    const base: Prisma.NotificationWhereInput = { userId };
    const where: Prisma.NotificationWhereInput = query.cursor
      ? { AND: [base, this.buildCursorFilter(query.cursor)] }
      : base;

    const [rows, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        select: NOTIFICATION_ROW_SELECT,
      }),
      this.getUnreadCount(userId),
    ]);

    const hasMore = rows.length > limit;
    const trimmed = hasMore ? rows.slice(0, limit) : rows;
    const last = trimmed[trimmed.length - 1];
    const nextCursor =
      hasMore && last ? encodeNotificationCursor({ createdAt: last.createdAt, id: last.id }) : null;

    const items = await this.resolveNotifications(trimmed);
    return { items, nextCursor, unreadCount };
  }

  // GET /notifications/unread-count — a dedicated, lightweight endpoint
  // (a single COUNT query, no resolution work) rather than folding this
  // into GET /notifications alone. The Navbar avatar/badge renders on
  // EVERY page (Header.tsx), so it needs the count without paying for a
  // resolved 20-item page it will never render.
  async getUnreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, read: false } });
  }

  // PATCH /notifications/:id/read — marks one notification read.
  // Not-found-or-not-owned -> 404, never 403 (the same "don't leak
  // resource existence to a non-owner" convention as
  // UsersService.assertFollowGraphVisible / MessagingService.assertParticipant
  // — a notification id is only ever legitimately referenced by its own
  // owner). Idempotent: marking an already-read row read again is a
  // no-op 200, matching this codebase's "repeat action is not an error"
  // philosophy for like/save/follow, applied here to a boolean flip
  // rather than a toggle relationship.
  async markRead(userId: string, notificationId: string): Promise<NotificationView> {
    const row = await this.prisma.notification.findUnique({
      where: { id: notificationId },
      select: NOTIFICATION_ROW_SELECT,
    });
    if (!row || row.userId !== userId) {
      throw new NotFoundException('Notification not found');
    }

    if (!row.read) {
      await this.prisma.notification.update({
        where: { id: notificationId },
        data: { read: true },
      });
    }

    const [resolved] = await this.resolveNotifications([{ ...row, read: true }]);
    return resolved;
  }

  // PATCH /notifications/read-all — marks every unread row read for the
  // caller. Mirrors MessagingService.markConversationRead's own
  // `{ markedRead }` shape.
  async markAllRead(userId: string): Promise<{ markedRead: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
    return { markedRead: result.count };
  }

  private buildCursorFilter(raw: string): Prisma.NotificationWhereInput {
    const cursor = decodeNotificationCursor(raw);
    return {
      OR: [
        { createdAt: { lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { lt: cursor.id } },
      ],
    };
  }

  // Batched row -> NotificationView resolution. At most FIVE extra
  // queries for a whole page, never one per row (no N+1): one for the
  // referenced Posts (like/comment), one for the referenced
  // Conversations (message) plus the "other participant" lookups those
  // conversations imply, one combined User lookup covering BOTH the
  // follow actors and the message other-participants (both need only
  // { id, displayName }), one for the referenced Fixtures
  // (fixture_scheduled/result_logged), and one for the referenced
  // ContestCycles (contest_win). Each query only runs if the page
  // actually contains that type — an empty page, or a page of a single
  // type, costs fewer than five.
  private async resolveNotifications(rows: NotificationRow[]): Promise<NotificationView[]> {
    if (rows.length === 0) {
      return [];
    }

    const refIdsFor = (types: string[]) =>
      [...new Set(rows.filter((r) => types.includes(r.type) && r.payloadRefId).map((r) => r.payloadRefId as string))];

    const followRefIds = refIdsFor(['follow']);
    const postRefIds = refIdsFor(['like', 'comment']);
    const conversationRefIds = refIdsFor(['message']);
    const fixtureRefIds = refIdsFor(['fixture_scheduled', 'result_logged']);
    const cycleRefIds = refIdsFor(['contest_win']);

    const [posts, conversations, fixtures, cycles] = await Promise.all([
      postRefIds.length > 0
        ? this.prisma.post.findMany({
            where: { id: { in: postRefIds } },
            select: { id: true, contentText: true, authorId: true },
          })
        : Promise.resolve([] as { id: string; contentText: string; authorId: string }[]),
      conversationRefIds.length > 0
        ? this.prisma.conversation.findMany({
            where: { id: { in: conversationRefIds } },
            select: { id: true, participantIds: true },
          })
        : Promise.resolve([] as { id: string; participantIds: string[] }[]),
      fixtureRefIds.length > 0
        ? this.prisma.fixture.findMany({
            where: { id: { in: fixtureRefIds } },
            select: {
              id: true,
              scheduledAt: true,
              status: true,
              teamA: { select: { name: true } },
              teamB: { select: { name: true } },
              opponentName: true,
              result: { select: { scoreA: true, scoreB: true } },
            },
          })
        : Promise.resolve(
            [] as {
              id: string;
              scheduledAt: Date;
              status: string;
              teamA: { name: string };
              teamB: { name: string } | null;
              opponentName: string | null;
              result: { scoreA: number; scoreB: number } | null;
            }[],
          ),
      cycleRefIds.length > 0
        ? this.prisma.contestCycle.findMany({
            where: { id: { in: cycleRefIds } },
            select: { id: true, title: true },
          })
        : Promise.resolve([] as { id: string; title: string }[]),
    ]);

    // "Other participant" ids, derived from the conversations above —
    // needs the conversations fetched first (this mirrors
    // MessagingService.toConversationViews's own two-step batching).
    // Every row in one GET /notifications page belongs to the SAME
    // caller (it's implicitly self-scoped), so the caller's own userId
    // — the notification's own `userId` — is always the "self" side of
    // the 2-party conversation.
    const conversationById = new Map(conversations.map((c) => [c.id, c]));
    const otherParticipantIdByConversationId = new Map<string, string | null>();
    for (const row of rows) {
      if (row.type !== 'message' || !row.payloadRefId) continue;
      const conversation = conversationById.get(row.payloadRefId);
      const otherId = conversation
        ? (conversation.participantIds.find((id) => id !== row.userId) ?? null)
        : null;
      otherParticipantIdByConversationId.set(row.payloadRefId, otherId);
    }

    // One combined User lookup for both follow actors AND message
    // other-participants — both need only { id, displayName }, so this
    // is a single extra query rather than two.
    const userIds = [
      ...new Set(
        [
          ...followRefIds,
          ...[...otherParticipantIdByConversationId.values()].filter((id): id is string => id !== null),
        ],
      ),
    ];
    const users =
      userIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, displayName: true },
          })
        : [];
    const userById = new Map(users.map((u) => [u.id, u]));

    const postById = new Map(posts.map((p) => [p.id, p]));
    const fixtureById = new Map(fixtures.map((f) => [f.id, f]));
    const cycleById = new Map(cycles.map((c) => [c.id, c]));

    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      read: row.read,
      createdAt: row.createdAt,
      payloadRefId: row.payloadRefId,
      data: this.resolveOne(row, {
        postById,
        userById,
        otherParticipantIdByConversationId,
        fixtureById,
        cycleById,
      }),
    }));
  }

  private resolveOne(
    row: NotificationRow,
    lookups: {
      postById: Map<string, { id: string; contentText: string; authorId: string }>;
      userById: Map<string, { id: string; displayName: string }>;
      otherParticipantIdByConversationId: Map<string, string | null>;
      fixtureById: Map<
        string,
        {
          id: string;
          scheduledAt: Date;
          status: string;
          teamA: { name: string };
          teamB: { name: string } | null;
          opponentName: string | null;
          result: { scoreA: number; scoreB: number } | null;
        }
      >;
      cycleById: Map<string, { id: string; title: string }>;
    },
  ): NotificationData | null {
    if (!row.payloadRefId) {
      return null;
    }

    switch (row.type) {
      case 'follow': {
        const actor = lookups.userById.get(row.payloadRefId);
        return actor ? { actor } : null;
      }
      case 'like':
      case 'comment': {
        const post = lookups.postById.get(row.payloadRefId);
        return post ? { post } : null;
      }
      case 'message': {
        const otherId = lookups.otherParticipantIdByConversationId.get(row.payloadRefId) ?? null;
        const other = otherId ? (lookups.userById.get(otherId) ?? { id: otherId, displayName: null }) : null;
        return { conversationId: row.payloadRefId, otherParticipant: other };
      }
      case 'fixture_scheduled':
      case 'result_logged': {
        const fixture = lookups.fixtureById.get(row.payloadRefId);
        if (!fixture) return null;
        return {
          fixture: {
            id: fixture.id,
            teamAName: fixture.teamA.name,
            teamBName: fixture.teamB?.name ?? fixture.opponentName,
            scheduledAt: fixture.scheduledAt,
            status: fixture.status,
            result: fixture.result,
          },
        };
      }
      case 'contest_win': {
        const cycle = lookups.cycleById.get(row.payloadRefId);
        return cycle ? { cycle } : null;
      }
      case 'age_milestone':
        return { milestone: row.payloadRefId };
      default:
        return null;
    }
  }
}
