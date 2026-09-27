import { Body, Controller, Param, Patch, UseGuards } from '@nestjs/common';
import { AdminJwtAuthGuard } from '../admin/guards/admin-jwt-auth.guard';
import { AdminRoles } from '../admin/guards/admin-roles.decorator';
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard';
import { CurrentAdmin } from '../admin/guards/current-admin.decorator';
import { AdminAccessTokenPayload } from '../admin/token/admin-token.types';
import { AdminStaffVettingService } from './admin-staff-vetting.service';
import { SetChildSafetyVettingDto } from './dto/set-child-safety-vetting.dto';

// PATCH /admin/users/:id/child-safety-vetting — superadmin-only.
//
// DISCLOSED NAMING OVERLAP, not an accident: this controller shares the
// `admin/users` URL prefix with AdminUsersController
// (../admin-users/admin-users.controller.ts), but the two operate on
// COMPLETELY DIFFERENT resources — AdminUsersController's `:id` is a
// platform User id (GET/PATCH /admin/users, /admin/users/:id); this
// controller's `:id` is an AdminUser id (an editor/moderator/superadmin
// staff account). No route literally collides (`:id` vs.
// `:id/child-safety-vetting` are different path shapes to Nest's router),
// but a future reader should not assume both routes act on the same
// model. See this module's own README for the full reasoning on why this
// is a deliberate, disclosed judgment call rather than a renamed prefix.
//
// AdminRolesGuard('superadmin') only — NOT moderator, unlike every other
// role-gated route in this codebase so far. Deciding who is trusted with
// child-safety vetting is a step above ordinary report-moderation access
// (ModerationModule/AdminUsersModule's own 'moderator', 'superadmin'
// split); only a superadmin may record it.
@Controller('admin/users')
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@AdminRoles('superadmin')
export class AdminStaffVettingController {
  constructor(private readonly adminStaffVettingService: AdminStaffVettingService) {}

  @Patch(':id/child-safety-vetting')
  async setVetting(
    @Param('id') id: string,
    @CurrentAdmin() admin: AdminAccessTokenPayload,
    @Body() dto: SetChildSafetyVettingDto,
  ) {
    return this.adminStaffVettingService.setChildSafetyVetting(id, admin.sub, dto);
  }
}
