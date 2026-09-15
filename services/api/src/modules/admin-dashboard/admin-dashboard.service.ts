import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { startOfCurrentMonthUtc } from './month.util';

// GET /admin/dashboard/stats' response shape. Every field here is
// directly computable from data this codebase already has — see
// README.md's Decision Log candidate for `totalVisits`, the one field
// that is NOT: it is always `null`, explicit and typed, never omitted
// and never faked as `0` (a real "no visits" reading is
// indistinguishable from "we don't track this" if it were silently 0 —
// see that same README section for why explicit `null` was chosen over
// dropping the key entirely).
export interface AdminDashboardStats {
  newUsersThisMonth: number;
  totalArticlesPublished: number;
  communityUsersTotal: number;
  totalVisits: null;
}

// Build Plan Section 4.8 (Admin Service) — the Dashboard's literal
// contract line. See README.md for the full reasoning, including why
// this is its own module rather than folded into AdminUsersModule (they
// shipped in the same PR, sequenced together specifically because two of
// these three real stats are User-table reads, but "manage a user" and
// "aggregate-report across models" are a different job).
@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(now: Date = new Date()): Promise<AdminDashboardStats> {
    const monthStart = startOfCurrentMonthUtc(now);

    const [newUsersThisMonth, totalArticlesPublished, communityUsersTotal] = await Promise.all([
      this.prisma.user.count({ where: { createdAt: { gte: monthStart } } }),
      this.prisma.article.count({ where: { status: 'published' } }),
      this.prisma.user.count(),
    ]);

    return { newUsersThisMonth, totalArticlesPublished, communityUsersTotal, totalVisits: null };
  }
}
