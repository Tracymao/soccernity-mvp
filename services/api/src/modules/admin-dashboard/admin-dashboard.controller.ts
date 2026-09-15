import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminJwtAuthGuard } from '../admin/guards/admin-jwt-auth.guard';
import { AdminDashboardService } from './admin-dashboard.service';

// Build Plan Section 4.8 (Admin Service) — the Dashboard's literal
// contract line.
//
// AdminJwtAuthGuard ONLY — deliberately NOT role-gated with
// AdminRolesGuard, a real divergence from every other Section 4.8
// controller this codebase has (Moderation: moderator/superadmin only;
// Articles/Categories: editor/superadmin only; Users: moderator/
// superadmin only). The Dashboard is the Admin Console's own landing
// screen — every admin role lands here after logging in — and its three
// real stats straddle both jobs (New Users/Community Users are
// User-table reads, the same data AdminUsersModule's own
// moderator/superadmin-gated routes touch; Total Articles Published is
// an Article-table read, AdminContentModule's editor/superadmin
// territory). Restricting it to either job's roles would lock the OTHER
// job out of their own overview screen for no product reason — nothing
// in Section 4.8, the Figma design, or the task brief that dispatched
// this module calls for per-role dashboard content. A stated decision,
// not a silent default.
@Controller('admin/dashboard')
@UseGuards(AdminJwtAuthGuard)
export class AdminDashboardController {
  constructor(private readonly adminDashboardService: AdminDashboardService) {}

  @Get('stats')
  async stats() {
    return this.adminDashboardService.getStats();
  }
}
