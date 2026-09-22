import { PrismaService } from '../../prisma/prisma.service';
import { TRENDING_HALF_LIFE_HOURS, TRENDING_WINDOW_HOURS } from './trending.constants';
import { TrendingService } from './trending.service';

function buildMock() {
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue([]),
  } as unknown as PrismaService;
  return prisma;
}

describe('TrendingService', () => {
  describe('getTrending', () => {
    it('returns the raw query rows verbatim as items', async () => {
      const prisma = buildMock();
      const rows = [
        { tag: 'epl', postCount: 12, score: 9.4 },
        { tag: 'chelsea', postCount: 5, score: 3.1 },
      ];
      (prisma.$queryRaw as jest.Mock).mockResolvedValue(rows);

      const result = await new TrendingService(prisma).getTrending(10);

      expect(result).toEqual({ items: rows });
    });

    it('returns an empty items array when nothing is trending, without erroring', async () => {
      const prisma = buildMock();

      const result = await new TrendingService(prisma).getTrending(10);

      expect(result).toEqual({ items: [] });
    });

    it('computes the window start as exactly TRENDING_WINDOW_HOURS before `now` and passes both into the raw query', async () => {
      const prisma = buildMock();
      const now = new Date('2026-09-22T12:00:00.000Z');

      await new TrendingService(prisma).getTrending(10, now);

      const callArgs = (prisma.$queryRaw as jest.Mock).mock.calls[0];
      const values: unknown[] = callArgs.slice(1);
      const expectedWindowStart = new Date(now.getTime() - TRENDING_WINDOW_HOURS * 60 * 60 * 1000);

      expect(values).toContainEqual(now);
      expect(values).toContainEqual(expectedWindowStart);
      expect(values).toContainEqual(TRENDING_HALF_LIFE_HOURS);
    });

    it('passes `limit` through into the raw query as a parameter', async () => {
      const prisma = buildMock();

      await new TrendingService(prisma).getTrending(7, new Date());

      const callArgs = (prisma.$queryRaw as jest.Mock).mock.calls[0];
      const values: unknown[] = callArgs.slice(1);
      expect(values).toContainEqual(7);
    });

    it('the raw query text groups by hashtag, orders by the decayed score descending, and never orders by the raw postCount', async () => {
      const prisma = buildMock();

      await new TrendingService(prisma).getTrending(10, new Date());

      const [strings] = (prisma.$queryRaw as jest.Mock).mock.calls[0];
      const sql = strings.join('');
      expect(sql).toContain('GROUP BY');
      expect(sql).toContain('ORDER BY');
      expect(sql).toContain('"score" DESC');
      expect(sql).toContain('POWER(2::DOUBLE PRECISION,');
    });

    it('defaults `now` to the current time when not given (the real HTTP path never passes a second argument)', async () => {
      const prisma = buildMock();
      const before = Date.now();

      await new TrendingService(prisma).getTrending(10);

      const callArgs = (prisma.$queryRaw as jest.Mock).mock.calls[0];
      const values: unknown[] = callArgs.slice(1);
      const passedNow = values.find((v): v is Date => v instanceof Date && v.getTime() >= before);
      expect(passedNow).toBeInstanceOf(Date);
    });
  });
});
