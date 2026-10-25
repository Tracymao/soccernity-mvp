import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

// B-197 (Decision Log #411 item 5, #396, #403 item 16): existing Notification
// rows between a blocked pair are HIDDEN from both sides' notification reads
// (list, unread count, read-all, mark-one-read), at read time -- never deleted,
// so they reappear if the Block is removed (adopted default; whether to delete
// instead is NOT decided).
//
// A Notification stores no actor, so "between the pair" is derived per type from
// what payloadRefId points at:
//   follow            payloadRefId IS the follower's userId
//   message           the Conversation between the viewer and a blocked user
//   fixture_scheduled / result_logged
//                     a Fixture whose two teams are managed by the viewer and a
//                     blocked user (the other team's organiser is the actor)
//   like / comment   Notification.actorId (Decision Log #412 item 1; payloadRefId is
//                     the POST, so the actor needed its own column). Rows written
//                     before that column existed have a NULL actorId and stay visible.
// System notifications (moderation_decision, contest_*, age_milestone, match_kickoff)
// have no user actor and are never filtered (#412 item 1).
//
// Cost: one Block read per call. A user with no Block on either side (almost
// everyone) pays nothing more and gets back an empty fragment.
export async function notificationBlockHiddenFilter(
  prisma: PrismaService,
  userId: string,
): Promise<Prisma.NotificationWhereInput> {
  const rows = await prisma.block.findMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    select: { blockerId: true, blockedId: true },
  });
  if (rows.length === 0) return {};

  const otherIds = [...new Set(rows.map((r) => (r.blockerId === userId ? r.blockedId : r.blockerId)))];

  const [conversations, fixtures] = await Promise.all([
    prisma.conversation.findMany({
      where: { AND: [{ participantIds: { has: userId } }, { participantIds: { hasSome: otherIds } }] },
      select: { id: true },
    }),
    prisma.fixture.findMany({
      where: {
        OR: [
          { teamA: { createdById: userId }, teamB: { createdById: { in: otherIds } } },
          { teamB: { createdById: userId }, teamA: { createdById: { in: otherIds } } },
        ],
      },
      select: { id: true },
    }),
  ]);

  const hidden: Prisma.NotificationWhereInput[] = [
    { type: 'follow', payloadRefId: { in: otherIds } },
    // `not: null` is load-bearing: the filter is wrapped in NOT(...), and in SQL
    // `NOT (type IN (...) AND actorId IN (...))` is NULL, not true, for a row whose actorId
    // is NULL -- which would silently hide every pre-column like/comment row. Requiring a
    // non-null actor makes the clause plainly false for those rows, so they stay visible.
    { type: { in: ['like', 'comment'] }, actorId: { not: null, in: otherIds } },
  ];
  if (conversations.length > 0) {
    hidden.push({ type: 'message', payloadRefId: { in: conversations.map((c) => c.id) } });
  }
  if (fixtures.length > 0) {
    hidden.push({
      type: { in: ['fixture_scheduled', 'result_logged'] },
      payloadRefId: { in: fixtures.map((f) => f.id) },
    });
  }
  return { NOT: { OR: hidden } };
}
