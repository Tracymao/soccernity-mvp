import { PrismaService } from '../../prisma/prisma.service';
import { getIsoWeekBoundaries } from './iso-week.util';
import { LeaderboardRollupService } from './leaderboard-rollup.service';

function buildMock() {
  const prisma = {
    $queryRaw: jest.fn(),
    leaderboardEntry: { upsert: jest.fn() },
  } as unknown as PrismaService;
  return prisma;
}

describe('LeaderboardRollupService', () => {
  describe('rollupPeriod', () => {
    it('upserts one LeaderboardEntry row per aggregated user, keyed on (userId, period)', async () => {
      const prisma = buildMock();
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([
        { userId: 'u-1', totalPoints: 250, rank: 1 },
        { userId: 'u-2', totalPoints: 180, rank: 2 },
      ]);

      const result = await new LeaderboardRollupService(prisma).rollupPeriod('2026-W33');

      expect(prisma.leaderboardEntry.upsert).toHaveBeenCalledTimes(2);
      expect(prisma.leaderboardEntry.upsert).toHaveBeenNthCalledWith(1, {
        where: { userId_period: { userId: 'u-1', period: '2026-W33' } },
        update: { points: 250, rank: 1 },
        create: { userId: 'u-1', period: '2026-W33', points: 250, rank: 1 },
      });
      expect(prisma.leaderboardEntry.upsert).toHaveBeenNthCalledWith(2, {
        where: { userId_period: { userId: 'u-2', period: '2026-W33' } },
        update: { points: 180, rank: 2 },
        create: { userId: 'u-2', period: '2026-W33', points: 180, rank: 2 },
      });
      expect(result).toEqual({ period: '2026-W33', upserted: 2 });
    });

    it('writes zero rows for a period with no ledger activity, without erroring', async () => {
      const prisma = buildMock();
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

      const result = await new LeaderboardRollupService(prisma).rollupPeriod('2026-W01');

      expect(prisma.leaderboardEntry.upsert).not.toHaveBeenCalled();
      expect(result).toEqual({ period: '2026-W01', upserted: 0 });
    });

    it('passes the period\'s exact [start, end) UTC boundary into the raw query as parameters', async () => {
      const prisma = buildMock();
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

      await new LeaderboardRollupService(prisma).rollupPeriod('2026-W33');

      const { start, end } = getIsoWeekBoundaries('2026-W33');
      // $queryRaw is called as a tagged template: (strings, ...values).
      // The Date params (start/end) are interpolated values, not part of
      // the strings array — assert they were passed through untouched.
      const callArgs = (prisma.$queryRaw as jest.Mock).mock.calls[0];
      const values = callArgs.slice(1);
      expect(values).toContainEqual(start);
      expect(values).toContainEqual(end);
    });

    it('the raw query text references the active-account exclusion and the engagement sources', async () => {
      const prisma = buildMock();
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

      await new LeaderboardRollupService(prisma).rollupPeriod('2026-W33');

      const [strings] = (prisma.$queryRaw as jest.Mock).mock.calls[0];
      const sql = strings.join('?');
      expect(sql).toContain(`u."accountStatus" = 'active'`);
      expect(sql).toContain('LEAST(');
      expect(sql).toContain('RANK() OVER');
      expect(sql).toContain('"totalPoints" > 0');
    });
  });

  describe('runRollup', () => {
    it('rolls up both the current period and the immediately-preceding period', async () => {
      const prisma = buildMock();
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);
      const service = new LeaderboardRollupService(prisma);
      const spy = jest.spyOn(service, 'rollupPeriod');

      // 2026-08-12 is within ISO week 2026-W33 (see iso-week.util.spec.ts).
      const now = new Date(Date.UTC(2026, 7, 12));
      await service.runRollup(now);

      expect(spy).toHaveBeenCalledWith('2026-W33');
      expect(spy).toHaveBeenCalledWith('2026-W32');
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it('handles the ISO-year boundary correctly (current=2009-W01, previous=2008-W52, not "2009-W00")', async () => {
      const prisma = buildMock();
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);
      const service = new LeaderboardRollupService(prisma);
      const spy = jest.spyOn(service, 'rollupPeriod');

      // 2008-12-29 is the classic year-boundary Monday belonging to 2009-W01.
      const now = new Date(Date.UTC(2008, 11, 29));
      await service.runRollup(now);

      expect(spy).toHaveBeenCalledWith('2009-W01');
      expect(spy).toHaveBeenCalledWith('2008-W52');
    });

    it('defaults to the real clock when called with no arguments (the actual @Cron() call shape)', async () => {
      const prisma = buildMock();
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);
      const service = new LeaderboardRollupService(prisma);

      await expect(service.runRollup()).resolves.toBeUndefined();
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    });
  });
});
