import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { encodeLeaderboardCursor } from './cursor.util';
import { getCurrentIsoWeekPeriod } from './iso-week.util';
import { LeaderboardService } from './leaderboard.service';

function buildMock() {
  const prisma = {
    leaderboardEntry: { findMany: jest.fn() },
  } as unknown as PrismaService;
  return prisma;
}

function row(over: Partial<{ userId: string; points: number; rank: number | null; displayName: string }> = {}) {
  return {
    userId: over.userId ?? 'u-1',
    points: over.points ?? 100,
    rank: over.rank === undefined ? 1 : over.rank,
    period: '2026-W33',
    user: { displayName: over.displayName ?? 'Player One' },
  };
}

describe('LeaderboardService', () => {
  describe('getLeaderboard', () => {
    it('defaults to the current UTC ISO week when no period is supplied', async () => {
      const prisma = buildMock();
      (prisma.leaderboardEntry.findMany as jest.Mock).mockResolvedValue([]);

      await new LeaderboardService(prisma).getLeaderboard({});

      const call = (prisma.leaderboardEntry.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.period).toBe(getCurrentIsoWeekPeriod());
    });

    it('uses the explicit period when supplied', async () => {
      const prisma = buildMock();
      (prisma.leaderboardEntry.findMany as jest.Mock).mockResolvedValue([]);

      await new LeaderboardService(prisma).getLeaderboard({ period: '2026-W33' });

      const call = (prisma.leaderboardEntry.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.period).toBe('2026-W33');
    });

    it('rejects a malformed period with 400 before ever querying Postgres', async () => {
      const prisma = buildMock();

      await expect(new LeaderboardService(prisma).getLeaderboard({ period: 'not-a-period' })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.leaderboardEntry.findMany).not.toHaveBeenCalled();
    });

    it('rejects an out-of-range week with 400', async () => {
      const prisma = buildMock();
      await expect(new LeaderboardService(prisma).getLeaderboard({ period: '2025-W53' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('filters to active accounts only (Decision Log #221, defensive read-time filter)', async () => {
      const prisma = buildMock();
      (prisma.leaderboardEntry.findMany as jest.Mock).mockResolvedValue([]);

      await new LeaderboardService(prisma).getLeaderboard({ period: '2026-W33' });

      const call = (prisma.leaderboardEntry.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.user).toEqual({ accountStatus: 'active' });
    });

    it('orders by rank ascending then userId ascending', async () => {
      const prisma = buildMock();
      (prisma.leaderboardEntry.findMany as jest.Mock).mockResolvedValue([]);

      await new LeaderboardService(prisma).getLeaderboard({ period: '2026-W33' });

      const call = (prisma.leaderboardEntry.findMany as jest.Mock).mock.calls[0][0];
      expect(call.orderBy).toEqual([{ rank: 'asc' }, { userId: 'asc' }]);
    });

    it('maps rows to the response shape, no nextCursor when a page is not full', async () => {
      const prisma = buildMock();
      (prisma.leaderboardEntry.findMany as jest.Mock).mockResolvedValue([
        row({ userId: 'u-1', rank: 1, points: 250, displayName: 'Alice' }),
        row({ userId: 'u-2', rank: 2, points: 180, displayName: 'Bob' }),
      ]);

      const result = await new LeaderboardService(prisma).getLeaderboard({ period: '2026-W33', limit: 20 });

      expect(result).toEqual({
        items: [
          { userId: 'u-1', displayName: 'Alice', points: 250, rank: 1 },
          { userId: 'u-2', displayName: 'Bob', points: 180, rank: 2 },
        ],
        nextCursor: null,
      });
    });

    it('requests limit+1 rows and returns a real nextCursor when more rows exist', async () => {
      const prisma = buildMock();
      const rows = [
        row({ userId: 'u-1', rank: 1 }),
        row({ userId: 'u-2', rank: 2 }),
        row({ userId: 'u-3', rank: 3 }), // the "+1" lookahead row
      ];
      (prisma.leaderboardEntry.findMany as jest.Mock).mockResolvedValue(rows);

      const result = await new LeaderboardService(prisma).getLeaderboard({ period: '2026-W33', limit: 2 });

      const call = (prisma.leaderboardEntry.findMany as jest.Mock).mock.calls[0][0];
      expect(call.take).toBe(3);
      expect(result.items).toHaveLength(2);
      expect(result.items.map((i) => i.userId)).toEqual(['u-1', 'u-2']);
      expect(result.nextCursor).toBe(encodeLeaderboardCursor({ rank: 2, userId: 'u-2' }));
    });

    it('caps limit at LEADERBOARD_MAX_PAGE_SIZE (50) even if a larger value is requested', async () => {
      const prisma = buildMock();
      (prisma.leaderboardEntry.findMany as jest.Mock).mockResolvedValue([]);

      // The DTO itself would reject > 50 at the HTTP layer (class-validator
      // @Max), but the service is defensive too, matching the DTO's own
      // ceiling exactly rather than trusting the caller.
      await new LeaderboardService(prisma).getLeaderboard({ period: '2026-W33', limit: 999 });

      const call = (prisma.leaderboardEntry.findMany as jest.Mock).mock.calls[0][0];
      expect(call.take).toBe(51);
    });

    it('defaults to page size 20 when no limit is supplied', async () => {
      const prisma = buildMock();
      (prisma.leaderboardEntry.findMany as jest.Mock).mockResolvedValue([]);

      await new LeaderboardService(prisma).getLeaderboard({ period: '2026-W33' });

      const call = (prisma.leaderboardEntry.findMany as jest.Mock).mock.calls[0][0];
      expect(call.take).toBe(21);
    });

    it('decodes a cursor into a (rank, userId) keyset OR condition', async () => {
      const prisma = buildMock();
      (prisma.leaderboardEntry.findMany as jest.Mock).mockResolvedValue([]);
      const cursor = encodeLeaderboardCursor({ rank: 5, userId: 'u-5' });

      await new LeaderboardService(prisma).getLeaderboard({ period: '2026-W33', cursor });

      const call = (prisma.leaderboardEntry.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.OR).toEqual([
        { rank: { gt: 5 } },
        { rank: 5, userId: { gt: 'u-5' } },
      ]);
    });

    it('rejects an invalid cursor with 400', async () => {
      const prisma = buildMock();
      await expect(
        new LeaderboardService(prisma).getLeaderboard({ period: '2026-W33', cursor: 'not-base64-json' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns an empty page for a period with no LeaderboardEntry rows, not an error', async () => {
      const prisma = buildMock();
      (prisma.leaderboardEntry.findMany as jest.Mock).mockResolvedValue([]);

      const result = await new LeaderboardService(prisma).getLeaderboard({ period: '2026-W01' });

      expect(result).toEqual({ items: [], nextCursor: null });
    });
  });
});
