import { PrismaService } from '../../prisma/prisma.service';
import { PageViewService } from './page-view.service';

function buildPrismaMock() {
  return {
    pageView: {
      create: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(0),
    },
  } as unknown as PrismaService;
}

// Flushes the microtask queue so a fire-and-forget `.catch()` chain (never
// awaited by the caller) has a chance to settle before an assertion runs.
async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('PageViewService', () => {
  describe('recordView', () => {
    it('creates a PageView row with only the given route — no user/session/ip field of any kind', () => {
      const prisma = buildPrismaMock();
      const service = new PageViewService(prisma);

      service.recordView('/community');

      expect(prisma.pageView.create).toHaveBeenCalledWith({ data: { route: '/community' } });
      expect((prisma.pageView.create as jest.Mock).mock.calls[0][0].data).toEqual({ route: '/community' });
    });

    it('is fire-and-forget — a rejected create() is caught and logged, never thrown back at the caller', async () => {
      const prisma = buildPrismaMock();
      (prisma.pageView.create as jest.Mock).mockRejectedValue(new Error('connection lost'));
      const service = new PageViewService(prisma);
      const warnSpy = jest.spyOn((service as unknown as { logger: { warn: (msg: string) => void } }).logger, 'warn');

      expect(() => service.recordView('/clubs')).not.toThrow();

      await flushMicrotasks();

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('/clubs'));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('connection lost'));
    });

    it('does not return a Promise the caller is expected to await (a truly fire-and-forget signature)', () => {
      const prisma = buildPrismaMock();
      const service = new PageViewService(prisma);

      const result = service.recordView('/blog');

      expect(result).toBeUndefined();
    });
  });

  describe('getTotalViewCount', () => {
    it('returns an unfiltered PageView.count()', async () => {
      const prisma = buildPrismaMock();
      (prisma.pageView.count as jest.Mock).mockResolvedValue(1234);
      const service = new PageViewService(prisma);

      const total = await service.getTotalViewCount();

      expect(prisma.pageView.count).toHaveBeenCalledWith();
      expect(total).toBe(1234);
    });

    it('returns a genuine 0, not null, when no page views have ever been recorded', async () => {
      const prisma = buildPrismaMock();
      (prisma.pageView.count as jest.Mock).mockResolvedValue(0);
      const service = new PageViewService(prisma);

      const total = await service.getTotalViewCount();

      expect(total).toBe(0);
    });
  });

  describe('getMonthlyViewCounts', () => {
    it('returns the default 6-month window, oldest month first, ending with the current UTC calendar month', async () => {
      const prisma = buildPrismaMock();
      (prisma.pageView.count as jest.Mock).mockResolvedValue(5);
      const service = new PageViewService(prisma);

      const result = await service.getMonthlyViewCounts(undefined, new Date('2026-09-15T12:00:00.000Z'));

      expect(result.map((r) => r.month)).toEqual([
        '2026-04',
        '2026-05',
        '2026-06',
        '2026-07',
        '2026-08',
        '2026-09',
      ]);
      expect(result.every((r) => r.count === 5)).toBe(true);
    });

    it('computes each month boundary as [UTC month start, next UTC month start)', async () => {
      const prisma = buildPrismaMock();
      (prisma.pageView.count as jest.Mock).mockResolvedValue(0);
      const service = new PageViewService(prisma);

      await service.getMonthlyViewCounts(3, new Date('2026-01-15T12:00:00.000Z'));

      const calls = (prisma.pageView.count as jest.Mock).mock.calls;
      expect(calls).toHaveLength(3);
      // Oldest first: Nov 2025, Dec 2025, Jan 2026 — proves the ISO-year
      // rollback (getUTCMonth() - offset going negative) is handled
      // correctly, the same class of boundary Date.UTC normalizes for
      // free.
      expect(calls[0][0]).toEqual({
        where: { occurredAt: { gte: new Date('2025-11-01T00:00:00.000Z'), lt: new Date('2025-12-01T00:00:00.000Z') } },
      });
      expect(calls[1][0]).toEqual({
        where: { occurredAt: { gte: new Date('2025-12-01T00:00:00.000Z'), lt: new Date('2026-01-01T00:00:00.000Z') } },
      });
      expect(calls[2][0]).toEqual({
        where: { occurredAt: { gte: new Date('2026-01-01T00:00:00.000Z'), lt: new Date('2026-02-01T00:00:00.000Z') } },
      });
    });

    it('honours a custom `months` window', async () => {
      const prisma = buildPrismaMock();
      (prisma.pageView.count as jest.Mock).mockResolvedValue(0);
      const service = new PageViewService(prisma);

      const result = await service.getMonthlyViewCounts(1, new Date('2026-09-15T12:00:00.000Z'));

      expect(result).toHaveLength(1);
      expect(result[0].month).toBe('2026-09');
    });

    it('sums per-month counts independently — a heavy month does not bleed into its neighbours', async () => {
      const prisma = buildPrismaMock();
      (prisma.pageView.count as jest.Mock)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(999)
        .mockResolvedValueOnce(2);
      const service = new PageViewService(prisma);

      const result = await service.getMonthlyViewCounts(3, new Date('2026-03-15T12:00:00.000Z'));

      expect(result).toEqual([
        { month: '2026-01', count: 1 },
        { month: '2026-02', count: 999 },
        { month: '2026-03', count: 2 },
      ]);
    });
  });
});
