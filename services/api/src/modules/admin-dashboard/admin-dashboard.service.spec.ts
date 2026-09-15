import { PrismaService } from '../../prisma/prisma.service';
import { AdminDashboardService } from './admin-dashboard.service';

function buildPrismaMock() {
  return {
    user: { count: jest.fn() },
    article: { count: jest.fn() },
  } as unknown as PrismaService;
}

describe('AdminDashboardService', () => {
  it('computes New Users (this calendar month) via a createdAt >= month-start filter', async () => {
    const prisma = buildPrismaMock();
    (prisma.user.count as jest.Mock).mockImplementation(({ where }: { where?: unknown } = {}) =>
      Promise.resolve(where ? 4 : 100),
    );
    (prisma.article.count as jest.Mock).mockResolvedValue(12);
    const service = new AdminDashboardService(prisma);

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
    const service = new AdminDashboardService(prisma);

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
    const service = new AdminDashboardService(prisma);

    const stats = await service.getStats();

    expect(prisma.user.count).toHaveBeenCalledWith();
    expect(stats.communityUsersTotal).toBe(250);
  });

  // The Decision Log candidate this module's own README documents: no
  // page-view tracking exists anywhere in this codebase. Explicitly
  // null, never a faked 0 and never a dropped key.
  it('always returns totalVisits as an explicit null', async () => {
    const prisma = buildPrismaMock();
    (prisma.user.count as jest.Mock).mockResolvedValue(0);
    (prisma.article.count as jest.Mock).mockResolvedValue(0);
    const service = new AdminDashboardService(prisma);

    const stats = await service.getStats();

    expect(stats).toHaveProperty('totalVisits', null);
  });
});
