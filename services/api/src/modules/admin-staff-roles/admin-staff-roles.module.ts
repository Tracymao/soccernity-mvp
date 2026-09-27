import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminActionLogModule } from '../admin-action-log/admin-action-log.module';
import { AdminAuthFoundationModule } from '../admin/admin-auth-foundation.module';
import { AdminStaffRolesController } from './admin-staff-roles.controller';
import { AdminStaffRolesService } from './admin-staff-roles.service';

// feat/admin-role-management — Build Plan Section 4.8 (Admin Service),
// the AdminUser role-management slice `admin_user.role_changed`
// (admin-action-log.constants.ts) was reserved for but never wired to a
// real call site (see modules/admin-action-log/README.md's own
// "Admin-user 'block' vs. 'role-change'" section — confirmed by grep and
// by checking for a remote branch/PR at the time that entry was written;
// neither turned anything up). This module is that endpoint.
//
// A dedicated top-level module, deliberately NOT folded into AdminModule
// (Decision Log #54 scopes that to Admin Console account/auth/profile
// only), AdminUsersModule (a different resource — platform User
// management), or AdminStaffVettingModule (same resource, AdminUser, but
// a distinct concern — vetting vs. role assignment — kept as separate
// modules the same way this codebase already keeps
// Moderation/AdminContent/AdminUsers as three separate Section 4.8
// surfaces despite all three being admin-console modules). Only needs
// AdminAuthFoundationModule for AdminJwtAuthGuard/AdminRolesGuard, and
// AdminActionLogModule so updateAdminRole can record an audit-log row
// after each write (modules/admin-action-log/README.md).
@Module({
  imports: [AdminAuthFoundationModule, AdminActionLogModule],
  controllers: [AdminStaffRolesController],
  providers: [AdminStaffRolesService, PrismaService],
})
export class AdminStaffRolesModule {}
