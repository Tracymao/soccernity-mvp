import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { encodeLeaderboardCursor } from './cursor.util';
import { LeaderboardService } from './leaderboard.service';

// backend/b053-leaderboard-periods (B-053, Decision Log #472): the all-time period, the club per row and
// the 7-day rank change. The older behaviour is covered, unchanged, in leaderboard.service.spec.ts.
function buildMock() {
  return {
    leaderboardEntry: { findMany: jest.fn() },
    user: { findUnique: jest.fn() },
  } as unknown as PrismaService;
}

const CLUB_A = { id: 'club-a', name: 'Lagos Rovers' };

function richRow(over: {
  userId?: string;
  rank?: number | null;
  rankSevenDaysAgo?: number | null;
  isMinor?: boolean;
  representedClub?: { id: string; name: string } | null;
}) {
  return {
    userId: over.userId ?? 'u-1',
    quarterPoints: 400,
    rank: over.rank === undefined ? 1 : over.rank,
    rankSevenDaysAgo: over.rankSevenDaysAgo === undefined ? null : over.rankSevenDaysAgo,
    period: 'all-time',
    user: {
      username: 'player_one',
      displayName: 'Player One',
      isMinor: over.isMinor ?? false,
      representedClub: over.representedClub === undefined ? null : over.representedClub,
    },
  };
}

describe('LeaderboardService all-time, club and 7-day change (B-053)', () => {
  describe('period "all-time"', () => {
    it('accepts it, skips the ISO-week validation and queries the Overall board with period "all-time"', async () => {
      const prisma = buildMock();
      (prisma.leaderboardEntry.findMany as jest.Mock).mockResolvedValue([]);

      const result = await new LeaderboardService(prisma).getLeaderboard('caller-1', { period: 'all-time' });

      const call = (prisma.leaderboardEntry.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where.period).toBe('all-time');
      expect(call.where.clubId).toBe('');
      expect(result).toEqual({ items: [], nextCursor: null });
    });

    it('still rejects any other non-weekly period ("All-Time" is not "all-time")', async () => {
      const prisma = buildMock();
      await expect(new LeaderboardService(prisma).getLeaderboard('caller-1', { period: 'All-Time' })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.leaderboardEntry.findMany).not.toHaveBeenCalled();
    });

    it('pages the all-time board with the same (rank, userId) keyset as a weekly board', async () => {
      const prisma = buildMock();
      (prisma.leaderboardEntry.findMany as jest.Mock).mockResolvedValue([
        richRow({ userId: 'u-1', rank: 1 }),
        richRow({ userId: 'u-2', rank: 2 }),
        richRow({ userId: 'u-3', rank: 3 }),
      ]);

      const result = await new LeaderboardService(prisma).getLeaderboard('caller-1', { period: 'all-time', limit: 2 });

      expect(result.items.map((i) => i.userId)).toEqual(['u-1', 'u-2']);
      expect(result.nextCursor).toBe(encodeLeaderboardCursor({ rank: 2, userId: 'u-2' }));
    });
  });

  describe('club per row', () => {
    it("returns the person's represented club on the Overall board", async () => {
      const prisma = buildMock();
      (prisma.leaderboardEntry.findMany as jest.Mock).mockResolvedValue([richRow({ representedClub: CLUB_A })]);

      const result = await new LeaderboardService(prisma).getLeaderboard('caller-1', { period: '2026-W33' });

      expect(result.items[0].club).toEqual(CLUB_A);
    });

    it('is null when the person represents no club', async () => {
      const prisma = buildMock();
      (prisma.leaderboardEntry.findMany as jest.Mock).mockResolvedValue([richRow({ representedClub: null })]);

      const result = await new LeaderboardService(prisma).getLeaderboard('caller-1', { period: '2026-W33' });

      expect(result.items[0].club).toBeNull();
    });

    it('is null for a minor, even when the minor represents a club (adopted default, same as B-234)', async () => {
      const prisma = buildMock();
      (prisma.leaderboardEntry.findMany as jest.Mock).mockResolvedValue([
        richRow({ userId: 'minor', isMinor: true, representedClub: CLUB_A }),
        richRow({ userId: 'adult', rank: 2, isMinor: false, representedClub: CLUB_A }),
      ]);

      const result = await new LeaderboardService(prisma).getLeaderboard('caller-1', { period: 'all-time' });

      expect(result.items.map((i) => i.club)).toEqual([null, CLUB_A]);
    });

    it("on a club board every adult row carries that board's club, and a minor's is still null", async () => {
      const prisma = buildMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ representedClubId: CLUB_A.id, representedClub: CLUB_A });
      (prisma.leaderboardEntry.findMany as jest.Mock).mockResolvedValue([
        // The person has since switched to another club: the row still belongs to this board's club.
        richRow({ userId: 'adult', representedClub: { id: 'club-b', name: 'Other FC' } }),
        richRow({ userId: 'minor', rank: 2, isMinor: true, representedClub: CLUB_A }),
      ]);

      const result = await new LeaderboardService(prisma).getLeaderboard('caller-1', {
        period: '2026-W33',
        clubId: CLUB_A.id,
      });

      expect(result.items.map((i) => i.club)).toEqual([CLUB_A, null]);
    });

    it('selects only the club id and name, never anything else about the club', async () => {
      const prisma = buildMock();
      (prisma.leaderboardEntry.findMany as jest.Mock).mockResolvedValue([]);

      await new LeaderboardService(prisma).getLeaderboard('caller-1', { period: '2026-W33' });

      const call = (prisma.leaderboardEntry.findMany as jest.Mock).mock.calls[0][0];
      expect(call.include.user.select.representedClub).toEqual({ select: { id: true, name: true } });
      expect(call.include.user.select.isMinor).toBe(true);
    });
  });

  describe('7-day rank change', () => {
    it('is rank now minus rank seven days earlier: negative when the person moved up', async () => {
      const prisma = buildMock();
      (prisma.leaderboardEntry.findMany as jest.Mock).mockResolvedValue([
        richRow({ userId: 'up', rank: 2, rankSevenDaysAgo: 5 }),
        richRow({ userId: 'down', rank: 4, rankSevenDaysAgo: 3 }),
        richRow({ userId: 'same', rank: 6, rankSevenDaysAgo: 6 }),
      ]);

      const result = await new LeaderboardService(prisma).getLeaderboard('caller-1', { period: 'all-time' });

      expect(result.items.map((i) => i.rankChange7d)).toEqual([-3, 1, 0]);
    });

    it('is null, never 0, when the person was not on the board seven days earlier', async () => {
      const prisma = buildMock();
      (prisma.leaderboardEntry.findMany as jest.Mock).mockResolvedValue([
        richRow({ userId: 'new', rank: 1, rankSevenDaysAgo: null }),
      ]);

      const result = await new LeaderboardService(prisma).getLeaderboard('caller-1', { period: 'all-time' });

      expect(result.items[0].rankChange7d).toBeNull();
    });
  });
});
