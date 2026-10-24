import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// backend/w3c-contest-notifications (B-122), filled in by backend/w7-contest (B-091). The one
// contest fact the notification layer needs that is not already on the cycle graph the planner loads:
// "which finalists have already uploaded their final entry?" (the finalist upload reminder, event h,
// goes only to finalists who have not).
//
// W3c shipped this as an empty set because nothing could be uploaded yet. B-091 stores final entries
// (a ContestEntry in the cycle's week-4 round), so the answer is now real. The sweep, the planner and
// their tests are unchanged -- exactly the seam W3c left.
@Injectable()
export class ContestNotificationFacts {
  constructor(private readonly prisma: PrismaService) {}

  async getFinalEntryUserIds(cycleId: string): Promise<Set<string>> {
    const entries = await this.prisma.contestEntry.findMany({
      where: { cycleId, round: { weekNumber: 4 } },
      select: { userId: true },
    });
    return new Set(entries.map((e) => e.userId));
  }
}
