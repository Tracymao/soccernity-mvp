import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { PageViewService } from './page-view.service';
import { PageViewInterceptor } from './page-view.interceptor';

// feat/admin-dashboard-page-views — Decision Log #306. Genuinely
// cross-cutting infra (like SentryModule/ScheduleModule in app.module.ts),
// not a feature tied to one sprint's endpoint list, so it is registered
// globally via the APP_INTERCEPTOR token rather than attached per
// controller — importing this module into AppModule is enough for
// PageViewInterceptor to run on every route in the app; no per-controller
// wiring is needed or possible to forget. See page-view.interceptor.ts
// and README.md for exactly what gets counted.
//
// PageViewService is also exported so AdminDashboardModule can inject it
// directly for GET /admin/dashboard/stats' real `totalVisits`/
// `visitsByMonth` fields — see admin-dashboard.module.ts.
@Module({
  providers: [
    PageViewService,
    PrismaService,
    { provide: APP_INTERCEPTOR, useClass: PageViewInterceptor },
  ],
  exports: [PageViewService],
})
export class PageViewModule {}
