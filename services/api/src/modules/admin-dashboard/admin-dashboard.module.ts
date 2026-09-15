import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminAuthFoundationModule } from '../admin/admin-auth-foundation.module';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminDashboardService } from './admin-dashboard.service';

// sprint-5/admin-users-dashboard-backend — Build Plan Section 4.8
// (Admin Service), the Dashboard half. A dedicated top-level module,
// deliberately NOT folded into AdminUsersModule even though both shipped
// in the same PR — see admin-dashboard.controller.ts's own comment for
// why the Dashboard is open to every admin role rather than
// moderator/superadmin-only like Users. Read-only, no user-facing
// routes, so — like AdminContentModule — only AdminAuthFoundationModule
// is imported.
@Module({
  imports: [AdminAuthFoundationModule],
  controllers: [AdminDashboardController],
  providers: [AdminDashboardService, PrismaService],
})
export class AdminDashboardModule {}
