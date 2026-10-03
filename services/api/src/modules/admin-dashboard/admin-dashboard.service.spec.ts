import { PrismaService } from '../../prisma/prisma.service';
import { PageViewService } from '../page-views/page-view.service';
import { AdminDashboardService } from './admin-dashboard.service';

function buildPrismaMock() {
  return {
    user: { count: jest.fn() },
    article: { count: jest.fn() },
  } as unknown as PrismaService;
}

function buildPageViewServiceMock() {
  return {
    getTotalViewCount: jest.fn().mockResolvedValue(0),
    getMonthlyViewCounts: jest.fn().mockResolvedValue([]),
  } as unknown as PageViewService;
}

describe('AdminDashboardService', () => {
  it('computes New Users (this calendar month) via a createdAt >= month-start filter', async () => {
    const prisma = buildPrismaMock();
    (prisma.user.count as jest.Mock).mockImplementation(({ where }: { where?: unknown } = {}) =>
      Promise.resolve(where ? 4 : 100),
    );
    (prisma.article.count as jest.Mock).mockResolvedValue(12);
    const service = new AdminDashboardService(prisma, buildPageViewServiceMock());

    const stats = await service.getStats(new Date('2026-09-15T12:00:00.000Z'));

    expect(prisma.user.count).toHaveBeenCalledWith({
      where: { createdAt: { gte: new Date('2026-09-01T00:00:00.000Z') } },
    });
    expect(stats.newUsersThisMonth).toBe(4);
  });

  it('computes Total Articles Published via status = published', async () => {
    const prisma = buildPrismaMock();
    (prisma.user.count as jest.Mock).mockResolvedValue(0);
    (prisma.article.count as jest.Mock).mockResolvedValue(7);
    const service = new AdminDashboardService(prisma, buildPageViewServiceMock());

    const stats = await service.getStats();

    expect(prisma.article.count).toHaveBeenCalledWith({ where: { status: 'published' } });
    expect(stats.totalArticlesPublished).toBe(7);
  });

  it('computes Community Users as an unfiltered total User count', async () => {
    const prisma = buildPrismaMock();
    (prisma.user.count as jest.Mock).mockImplementation(({ where }: { where?: unknown } = {}) =>
      Promise.resolve(where ? 4 : 250),
    );
    (prisma.article.count as jest.Mock).mockResolvedValue(0);
    const service = new AdminDashboardService(prisma, buildPageViewServiceMock());

    const stats = await service.getStats();

    expect(prisma.user.count).toHaveBeenCalledWith();
    expect(stats.communityUsersTotal).toBe(250);
  });

  // Decision Log #306, resolved by feat/admin-dashboard-page-views:
  // totalVisits/visitsByMonth are now real, sourced from PageViewService
  // — no longer an explicit null. A genuine 0 is now an honest reading
  // (no page views recorded yet), not the old ambiguous "we don't track
  // this."
  it('sources totalVisits/visitsByMonth from PageViewService, passing `now` through to the monthly breakdown', async () => {
    const prisma = buildPrismaMock();
    (prisma.user.count as jest.Mock).mockResolvedValue(0);
    (prisma.article.count as jest.Mock).mockResolvedValue(0);
    const pageViewService = buildPageViewServiceMock();
    (pageViewService.getTotalViewCount as jest.Mock).mockResolvedValue(42);
    (pageViewService.getMonthlyViewCounts as jest.Mock).mockResolvedValue([
      { month: '2026-08', count: 10 },
      { month: '2026-09', count: 32 },
    ]);
    const service = new AdminDashboardService(prisma, pageViewService);
    const now = new Date('2026-09-15T12:00:00.000Z');

    const stats = await service.getStats(now);

    expect(pageViewService.getTotalViewCount).toHaveBeenCalledWith();
    expect(pageViewService.getMonthlyViewCounts).toHaveBeenCalledWith(undefined, now);
    expect(stats.totalVisits).toBe(42);
    expect(stats.visitsByMonth).toEqual([
      { month: '2026-08', count: 10 },
      { month: '2026-09', count: 32 },
    ]);
  });

  it('reports totalVisits as a genuine 0 (not null) when no page views exist yet', async () => {
    const prisma = buildPrismaMock();
    (prisma.user.count as jest.Mock).mockResolvedValue(0);
    (prisma.article.count as jest.Mock).mockResolvedValue(0);
    const service = new AdminDashboardService(prisma, buildPageViewServiceMock());

    const stats = await service.getStats();

    expect(stats.totalVisits).toBe(0);
    expect(stats.totalVisits).not.toBeNull();
  });
});
