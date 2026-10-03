import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DEFAULT_VISITS_BY_MONTH_WINDOW } from './page-view.constants';

export interface MonthlyPageViewCount {
  // "YYYY-MM", the UTC calendar month — a plain, chart-library-agnostic
  // key. See README.md's "visitsByMonth response shape" section: this is
  // a genuinely NEW shape (the existing DashboardPage.tsx chart is 100%
  // hardcoded sample bars with no real props to match), not a literal
  // match of anything that already exists on the frontend — a follow-up
  // figma-to-code-style PR formats this into whatever labels the chart
  // component ends up wanting (e.g. "Jan"/"Feb").
  month: string;
  count: number;
}

// Backs GET /admin/dashboard/stats' `totalVisits`/`visitsByMonth` — see
// modules/page-views/README.md for the full design and Decision Log #306.
@Injectable()
export class PageViewService {
  private readonly logger = new Logger(PageViewService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Fire-and-forget BY DESIGN, not an oversight — see
  // PageViewInterceptor's own comment for why recording a page view must
  // never add latency to, or ever fail, the real response it is
  // piggybacking on. A failed insert is logged and silently dropped; an
  // undercount here is a far smaller problem than adding a new failure
  // mode to every GET request in the app.
  recordView(route: string): void {
    this.prisma.pageView.create({ data: { route } }).catch((error: unknown) => {
      this.logger.warn(
        `Failed to record page view for route "${route}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
  }

  // All-time total — GET /admin/dashboard/stats' `totalVisits`. Unlike
  // the pre-existing `totalVisits: null` this replaces, a genuine `0` is
  // now a real, honest reading (no page views have been recorded yet),
  // not an ambiguous "we don't track this" — see admin-dashboard/README.md.
  async getTotalViewCount(): Promise<number> {
    return this.prisma.pageView.count();
  }

  // A monthly time series, oldest month first, ending with the CURRENT
  // UTC calendar month — `months` UTC calendar months total (the current
  // month counts as one of them, not an extra). Deliberately UTC-based
  // (Date.UTC/getUTC*), matching admin-dashboard/month.util.ts's own
  // startOfCurrentMonthUtc and account-deletion-sweep.service.ts's own
  // documented DST-safety discipline — a month boundary computed in local
  // time would give a different UTC instant depending on the server's
  // timezone.
  //
  // Implemented as N independent `count()` calls (Promise.all), not a
  // single raw SQL GROUP BY — `months` is always small (the default is 6),
  // and this codebase's own precedent (admin-dashboard.service.ts's three
  // Promise.all aggregates) already treats "a handful of independent count()
  // calls" as the right shape for a small, bounded aggregate, and doing so
  // keeps this method testable at the mocked-Prisma layer with no raw SQL
  // to separately verify against a real Postgres — see README.md's Testing
  // section.
  async getMonthlyViewCounts(
    months: number = DEFAULT_VISITS_BY_MONTH_WINDOW,
    now: Date = new Date(),
  ): Promise<MonthlyPageViewCount[]> {
    const boundaries = buildMonthBoundaries(months, now);

    const counts = await Promise.all(
      boundaries.map(({ start, end }) =>
        this.prisma.pageView.count({ where: { occurredAt: { gte: start, lt: end } } }),
      ),
    );

    return boundaries.map(({ label }, index) => ({ month: label, count: counts[index] }));
  }
}

interface MonthBoundary {
  label: string;
  start: Date;
  end: Date;
}

// Oldest-first: index 0 is `months - 1` months ago, the last entry is the
// current UTC calendar month.
function buildMonthBoundaries(months: number, now: Date): MonthBoundary[] {
  const boundaries: MonthBoundary[] = [];

  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() - offset;

    const start = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0));

    boundaries.push({ label: formatMonthLabel(start), start, end });
  }

  return boundaries;
}

function formatMonthLabel(monthStart: Date): string {
  const year = monthStart.getUTCFullYear();
  const month = String(monthStart.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}
