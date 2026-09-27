import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminActionLogModule } from '../admin-action-log/admin-action-log.module';
import { AdminAuthFoundationModule } from '../admin/admin-auth-foundation.module';
import { AdminStaffVettingController } from './admin-staff-vetting.controller';
import { AdminStaffVettingService } from './admin-staff-vetting.service';

// schema/report-severity-escalation-admin-vetting laid the groundwork
// (AdminUser.childSafetyVetted/vettedAt/vettedByAdminId), flagged there as
// "no application code reads or writes any of these three fields yet —
// no vetting endpoint, no gate on Report review keyed to this flag." This
// module is that vetting endpoint; the gate on Report review lives in
// ModerationModule (see ModerationService.assertChildSafetyVetted).
//
// A dedicated top-level module, deliberately NOT folded into AdminModule
// (Decision Log #54 scopes that module to Admin Console
// account/auth/profile only) or into AdminUsersModule (a different
// resource — platform User management — that happens to share the
// `admin/users` URL prefix; see admin-staff-vetting.controller.ts's own
// header comment for the disclosed naming overlap). Only needs
// AdminAuthFoundationModule for AdminJwtAuthGuard/AdminRolesGuard — no
// session-revocation or cross-module reuse the way AdminUsersModule
// needs for its own, unrelated suspend/delete actions.
//
// feat/admin-action-log — AdminActionLogModule imported so
// setChildSafetyVetting can record an audit-log row after each write. See
// modules/admin-action-log/README.md.
@Module({
  imports: [AdminAuthFoundationModule, AdminActionLogModule],
  controllers: [AdminStaffVettingController],
  providers: [AdminStaffVettingService, PrismaService],
})
export class AdminStaffVettingModule {}
