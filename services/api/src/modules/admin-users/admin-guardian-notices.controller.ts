import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { AdminJwtAuthGuard } from '../admin/guards/admin-jwt-auth.guard';
import { AdminRoles } from '../admin/guards/admin-roles.decorator';
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard';
import { CurrentAdmin } from '../admin/guards/current-admin.decorator';
import { AdminAccessTokenPayload } from '../admin/token/admin-token.types';
import { AdminChildSafetyVettedGuard } from './admin-child-safety-vetted.guard';
import { AdminGuardianNoticesService } from './admin-guardian-notices.service';
import { GuardianNoticesReasonDto, GuardianNoticesReviewDto } from './dto/guardian-notices.dto';

// backend/b280-withhold-guardian-notices (B-280; Decision Log #458). The "withhold guardian notices" flag on a
// minor's account. Same class-level guards and role set as AdminUsersController (moderator / superadmin), PLUS
// AdminChildSafetyVettedGuard LAST: a fresh-read child-safety-vetting check whatever the role, running before the
// validation pipe and before any account is looked up, so an unvetted admin gets the same coded 403 for every
// account and learns nothing about any of them. See admin-guardian-notices.service.ts.
//
// Nothing here is reachable by the minor, the guardian or any user token (AdminJwtAuthGuard accepts admin tokens
// only). The state is returned only to a vetted admin; no other endpoint carries the flag or its reason.
@Controller('admin/users/:id/guardian-notices')
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard, AdminChildSafetyVettedGuard)
@AdminRoles('moderator', 'superadmin')
export class AdminGuardianNoticesController {
  constructor(private readonly service: AdminGuardianNoticesService) {}

  @Get()
  async state(@Param('id') id: string) {
    return this.service.getState(id);
  }

  @Post('withhold')
  @HttpCode(200)
  async withhold(
    @Param('id') id: string,
    @CurrentAdmin() admin: AdminAccessTokenPayload,
    @Body() dto: GuardianNoticesReasonDto,
  ) {
    return this.service.withhold(id, admin.sub, dto.reason);
  }

  @Post('clear')
  @HttpCode(200)
  async clear(
    @Param('id') id: string,
    @CurrentAdmin() admin: AdminAccessTokenPayload,
    @Body() dto: GuardianNoticesReasonDto,
  ) {
    return this.service.clear(id, admin.sub, dto.reason);
  }

  @Post('review')
  @HttpCode(200)
  async review(
    @Param('id') id: string,
    @CurrentAdmin() admin: AdminAccessTokenPayload,
    @Body() dto: GuardianNoticesReviewDto,
  ) {
    return this.service.review(id, admin.sub, dto.note);
  }
}
