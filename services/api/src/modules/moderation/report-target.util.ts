import { PrismaService } from '../../prisma/prisma.service';

// Shared "who is the reported user" resolution -- used by ModerationService (appeal eligibility and both
// parties' outcome notifications) and, since backend/w6-hold-rule-extension (B-044), by HoldService to find
// the second party of a legal hold. Report has no denormalized reportedUserId column (a deliberate choice,
// see moderation/README.md), so this always resolves dynamically:
//   - 'user'            -> targetId IS the reported user, if they still exist.
//   - 'post' / 'comment'-> the post's / comment's own authorId, if it still exists.
//   - 'banter_room'     -> the room's creator, if that account still exists (BanterRoom.createdBy is a bare
//                          String, not an FK, so it can dangle).
//   - 'grassroots_team' / 'fixture' -> the team's / teamA's organiser, if the team still has one.
//   - 'enquiry'         -> always null: a report made from a Contact Us enquiry (B-046 part B) has no reported
//                          user, so it can never create a hold or a notification for anyone but its (absent)
//                          reporter. Stated as an explicit case so the intent is not an accident of `default`.
// Returns null if the target has since been deleted or targetType is unrecognised. Every caller treats null
// as "cannot determine the reported user", never as an error to surface.
export async function resolveReportedUserId(
  prisma: PrismaService,
  targetType: string,
  targetId: string,
): Promise<string | null> {
  switch (targetType) {
    case 'user': {
      const user = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
      return user?.id ?? null;
    }
    case 'post': {
      const post = await prisma.post.findUnique({ where: { id: targetId }, select: { authorId: true } });
      return post?.authorId ?? null;
    }
    case 'comment': {
      const comment = await prisma.comment.findUnique({ where: { id: targetId }, select: { authorId: true } });
      return comment?.authorId ?? null;
    }
    case 'banter_room': {
      const room = await prisma.banterRoom.findUnique({ where: { id: targetId }, select: { createdBy: true } });
      if (!room) return null;
      const creator = await prisma.user.findUnique({ where: { id: room.createdBy }, select: { id: true } });
      return creator?.id ?? null;
    }
    case 'grassroots_team': {
      // createdById is nullable (a dormant team after its organiser's anonymisation, Decision Log #341).
      const team = await prisma.grassrootsTeam.findUnique({ where: { id: targetId }, select: { createdById: true } });
      return team?.createdById ?? null;
    }
    case 'fixture': {
      // The fixture's author is the organiser of teamA (only teamA's organiser may create one, #255).
      const fixture = await prisma.fixture.findUnique({
        where: { id: targetId },
        select: { teamA: { select: { createdById: true } } },
      });
      return fixture?.teamA.createdById ?? null;
    }
    case 'enquiry':
      return null;
    default:
      return null;
  }
}
