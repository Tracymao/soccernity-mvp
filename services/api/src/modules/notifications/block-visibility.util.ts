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
// like / comment rows (payloadRefId is the POST, actor never stored, #290) CANNOT
// be attributed to a person, so they are NOT hidden -- OPEN in
// docs/backend-w6-report.md (the fix is an `actorId` column, not decided). They
// show "Someone" and name no one, so no identity is exposed.
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

  const hidden: Prisma.NotificationWhereInput[] = [{ type: 'follow', payloadRefId: { in: otherIds } }];
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
