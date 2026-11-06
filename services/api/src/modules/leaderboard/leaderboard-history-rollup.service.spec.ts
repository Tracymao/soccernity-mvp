import { PrismaService } from '../../prisma/prisma.service';
import { LeaderboardHistoryRollupService } from './leaderboard-history-rollup.service';
import { LeaderboardRollupService } from './leaderboard-rollup.service';

function buildMocks() {
  const prisma = { $executeRaw: jest.fn().mockResolvedValue(0) } as unknown as PrismaService;
  const boards = {
    rollupPeriod: jest.fn().mockResolvedValue({ period: 'all-time', upserted: 0 }),
  } as unknown as LeaderboardRollupService;
  return { prisma, boards };
}

describe('LeaderboardHistoryRollupService (B-053)', () => {
  describe('runHistoryRollup', () => {
    it('builds the all-time board first, then sets the 7-day baseline for this week, last week and all-time', async () => {
      const { prisma, boards } = buildMocks();
      const service = new LeaderboardHistoryRollupService(prisma, boards);
      const spy = jest.spyOn(service, 'updateSevenDayBaseline');

      // 2026-08-12 is in 2026-W33.
      await service.runHistoryRollup(new Date(Date.UTC(2026, 7, 12)));

      expect(boards.rollupPeriod).toHaveBeenCalledWith('all-time');
      expect(spy.mock.calls.map((c) => c[0])).toEqual(['2026-W33', '2026-W32', 'all-time']);
    });

    it('reads "now" from the injected app clock when called with no arguments', async () => {
      const { prisma, boards } = buildMocks();
      const clock = { now: () => new Date(Date.UTC(2026, 7, 12)) };
      const service = new LeaderboardHistoryRollupService(prisma, boards, clock);
      const spy = jest.spyOn(service, 'updateSevenDayBaseline');

      await service.runHistoryRollup();

      expect(spy).toHaveBeenCalledWith('2026-W33', new Date(Date.UTC(2026, 7, 12)));
    });
  });

  describe('updateSevenDayBaseline', () => {
    it('passes the earlier moment, the earlier window and the period into ONE raw statement', async () => {
      const { prisma, boards } = buildMocks();
      (prisma.$executeRaw as jest.Mock).mockResolvedValue(3);

      const result = await new LeaderboardHistoryRollupService(prisma, boards).updateSevenDayBaseline(
        '2026-W33',
        new Date('2026-08-12T12:00:00.000Z'),
      );

      expect(result).toEqual({ period: '2026-W33', rowsUpdated: 3 });
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
      const [, ...values] = (prisma.$executeRaw as jest.Mock).mock.calls[0];
      expect(values).toContainEqual(new Date('2026-08-03T00:00:00.000Z')); // windowStart
      expect(values).toContainEqual(new Date('2026-08-05T12:00:00.000Z')); // asOf
      expect(values).toContain('2026-W33');
    });

    it('counts a ledger row only if awarded by then and not yet revoked by then, active accounts, ranked like the live board', async () => {
      const { prisma, boards } = buildMocks();

      await new LeaderboardHistoryRollupService(prisma, boards).updateSevenDayBaseline(
        'all-time',
        new Date('2026-08-12T12:00:00.000Z'),
      );

      const [strings] = (prisma.$executeRaw as jest.Mock).mock.calls[0];
      const sql = (strings as readonly string[]).join('?');
      expect(sql).toContain('ple."occurredAt" <=');
      expect(sql).toContain('(ple."revokedAt" IS NULL OR ple."revokedAt" >');
      expect(sql).toContain(`u."accountStatus" = 'active'`);
      expect(sql).toContain('PARTITION BY "clubId"');
      expect(sql).toContain('RANK() OVER');
      expect(sql).toContain('"totalQuarterPoints" > 0');
      // Club boards use the snapshot clubId on the ledger row, like the live rollup.
      expect(sql).toContain('ple."clubId" IS NOT NULL');
      // A person not on the earlier board gets NULL (the scalar subquery finds nothing), never 0.
      expect(sql).toContain('SET "rankSevenDaysAgo" = (');
      expect(sql).not.toContain('COALESCE(r."rank"');
    });
  });
});
