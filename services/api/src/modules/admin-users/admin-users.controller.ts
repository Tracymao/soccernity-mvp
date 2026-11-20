import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AdminJwtAuthGuard } from '../admin/guards/admin-jwt-auth.guard';
import { AdminRoles } from '../admin/guards/admin-roles.decorator';
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard';
import { CurrentAdmin } from '../admin/guards/current-admin.decorator';
import { AdminAccessTokenPayload } from '../admin/token/admin-token.types';
import { AdminUserDetailService } from './admin-user-detail.service';
import { AdminUserDobCorrectionService } from './admin-user-dob-correction.service';
import { AdminUserUsernameRevokeService } from './admin-user-username-revoke.service';
import { AdminUsersService } from './admin-users.service';
import { CorrectDobDto } from './dto/correct-dob.dto';
import { HeldInvestigationsQueryDto } from './dto/held-investigations-query.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { RevokeUsernameDto } from './dto/revoke-username.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';

// Build Plan Section 4.8 (Admin Service) — platform-user management.
//
// AdminJwtAuthGuard + AdminRolesGuard('moderator', 'superadmin') on the
// WHOLE controller, including GET — mirrors AdminModerationController's
// shape (class-level, no view-vs-mutate split), NOT
// AdminArticlesController/AdminCategoriesController's ('editor',
// 'superadmin'). Blocking/suspending/deleting a platform user is
// moderation-adjacent work, the same job AdminUser's own schema comment
// already assigns to moderator/superadmin, not to an editor — see
// README.md's "who may view" section for the full reasoning.
@Controller('admin/users')
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@AdminRoles('moderator', 'superadmin')
export class AdminUsersController {
  constructor(
    private readonly adminUsersService: AdminUsersService,
    private readonly adminUserDetailService: AdminUserDetailService,
    private readonly adminUserDobCorrectionService: AdminUserDobCorrectionService,
    private readonly adminUserUsernameRevokeService: AdminUserUsernameRevokeService,
  ) {}

  @Get()
  async list(@Query() query: ListUsersQueryDto) {
    return this.adminUsersService.listUsers(query);
  }

  // Registered before ':id' routes; GET only, so no clash regardless.
  // Each item carries holdType, isAdminHold and (backend/b045-held-list-hold-ids) holdId + reportId: the ids of
  // the strongest admin hold, which PATCH /admin/moderation/holds/:holdId/lift needs; both null for a hold
  // derived from a report (nothing to lift).
  @Get('held-investigations')
  async heldInvestigations(@Query() query: HeldInvestigationsQueryDto) {
    return this.adminUsersService.listStalledHolds(query.olderThanDays);
  }

  // B-029 (Decision Log #372): guardians' "report incorrect details" flags that
  // are still open, oldest first -- the support queue for them. Registered
  // before ':id' routes; GET only, so no clash regardless. Carries no date of
  // birth (B-109's single-user read is where support sees that).
  @Get('incorrect-details-reports')
  async incorrectDetailsReports() {
    return this.adminUsersService.listIncorrectDetailsReports();
  }

  // B-109 (Decision Log #398 D4): the single-user read, including the
  // decrypted date of birth. Every response that contains a DOB writes an
  // audit row first. Registered AFTER the literal-path GETs above so it cannot
  // shadow them.
  @Get(':id')
  async detail(@Param('id') id: string, @CurrentAdmin() admin: AdminAccessTokenPayload) {
    return this.adminUserDetailService.getUserDetail(id, admin.sub);
  }

  // B-129 (Decision Log #406 item 4): User Detail WITHOUT the date of birth.
  // Neither selects nor decrypts a DOB, so it writes no user.dob_viewed audit
  // row. The screen uses this; GET /admin/users/:id above stays for the
  // correction form only.
  @Get(':id/summary')
  async summary(@Param('id') id: string) {
    return this.adminUserDetailService.getUserSummary(id);
  }

  // B-103 (Decision Log #390, #395 B4): audited DOB correction. Moderator /
  // superadmin, the same class-level gate as the rest of this controller.
  @Post(':id/dob-correction')
  @HttpCode(200)
  async correctDateOfBirth(
    @Param('id') id: string,
    @CurrentAdmin() admin: AdminAccessTokenPayload,
    @Body() dto: CorrectDobDto,
  ) {
    return this.adminUserDobCorrectionService.correctDateOfBirth(id, admin.sub, dto);
  }

  // B-033 (Decision Log #398 D3, #402 item 3): audited username revoke.
  // Moderator / superadmin, the same class-level gate as the rest of this
  // controller. A REASON is required and goes to the audit record.
  @Post(':id/username-revoke')
  @HttpCode(200)
  async revokeUsername(
    @Param('id') id: string,
    @CurrentAdmin() admin: AdminAccessTokenPayload,
    @Body() dto: RevokeUsernameDto,
  ) {
    return this.adminUserUsernameRevokeService.revokeUsername(id, admin.sub, dto);
  }

  // B-029: support has dealt with the report; releases the hold on approval.
  // 204-style empty success would hide whether anything changed, so it
  // returns { resolved: true }. 404 when the user has no open report.
  @Post(':id/incorrect-details-report/resolve')
  @HttpCode(200)
  async resolveIncorrectDetailsReport(@Param('id') id: string, @CurrentAdmin() admin: AdminAccessTokenPayload) {
    return this.adminUsersService.resolveIncorrectDetailsReport(id, admin.sub);
  }

  @Patch(':id')
  async updateStatus(
    @Param('id') id: string,
    @CurrentAdmin() admin: AdminAccessTokenPayload,
    @Body() dto: UpdateUserStatusDto,
  ) {
    return this.adminUsersService.updateUserStatus(id, admin.sub, dto);
  }
}
