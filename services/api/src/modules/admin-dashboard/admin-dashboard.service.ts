import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PageViewService, type MonthlyPageViewCount } from '../page-views/page-view.service';
import { startOfCurrentMonthUtc } from './month.util';

// GET /admin/dashboard/stats' response shape. Every field here is
// directly computable from data this codebase already has.
//
// `totalVisits`/`visitsByMonth` were formerly `totalVisits: null` with no
// second field at all — see this module's own README.md's Decision Log
// #306 entry for the full history. feat/admin-dashboard-page-views
// resolves that: both are now real, backed by the new, strictly
// anonymous PageView model (modules/page-views/). `totalVisits` can
// genuinely be `0` now (no page views recorded yet) — that is an honest
// reading, not the old ambiguous "we don't track this" null.
export interface AdminDashboardStats {
  newUsersThisMonth: number;
  totalArticlesPublished: number;
  communityUsersTotal: number;
  totalVisits: number;
  visitsByMonth: MonthlyPageViewCount[];
}

// Build Plan Section 4.8 (Admin Service) — the Dashboard's literal
// contract line. See README.md for the full reasoning, including why
// this is its own module rather than folded into AdminUsersModule (they
// shipped in the same PR, sequenced together specifically because two of
// these three real stats are User-table reads, but "manage a user" and
// "aggregate-report across models" are a different job).
@Injectable()
export class AdminDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pageViewService: PageViewService,
  ) {}

  async getStats(now: Date = new Date()): Promise<AdminDashboardStats> {
    const monthStart = startOfCurrentMonthUtc(now);

    const [newUsersThisMonth, totalArticlesPublished, communityUsersTotal, totalVisits, visitsByMonth] =
      await Promise.all([
        this.prisma.user.count({ where: { createdAt: { gte: monthStart } } }),
        this.prisma.article.count({ where: { status: 'published' } }),
        this.prisma.user.count(),
        this.pageViewService.getTotalViewCount(),
        this.pageViewService.getMonthlyViewCounts(undefined, now),
      ]);

    return { newUsersThisMonth, totalArticlesPublished, communityUsersTotal, totalVisits, visitsByMonth };
  }
}
