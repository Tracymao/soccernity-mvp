import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { AdminProfileService } from './admin-profile.service';
import { AdminSummary } from './admin-response.mapper';
import { UpdateAdminProfileDto } from './dto/update-admin-profile.dto';
import { AdminJwtAuthGuard } from './guards/admin-jwt-auth.guard';
import { CurrentAdmin } from './guards/current-admin.decorator';
import { AdminAccessTokenPayload } from './token/admin-token.types';

// GET/PATCH /admin/profile — backs the Admin Profile Figma screen
// (Decision Log #54). Deliberately `/admin/profile`, not
// `/admin/profile/:id` — unlike UsersController's `GET/PATCH /users/:id`
// (which the User Service spec, Build Plan Section 4.2, explicitly
// defines with an `:id` param), Section 4.8's Admin Service has no
// pre-existing spec line for this at all (it's a genuine addition, see
// admin/README.md), and there is exactly one legitimate caller per
// request — the admin themselves, identified from their own verified
// token (AdminJwtAuthGuard + @CurrentAdmin()), never a path param. There
// is no "view another admin's profile" concept anywhere in this PR's
// scope, so no :id-based ownership check (mirroring
// UsersController.assertSelf) is needed here at all.
@Controller('admin/profile')
@UseGuards(AdminJwtAuthGuard)
export class AdminProfileController {
  constructor(private readonly adminProfileService: AdminProfileService) {}

  @Get()
  async getOwnProfile(@CurrentAdmin() admin: AdminAccessTokenPayload): Promise<AdminSummary> {
    return this.adminProfileService.getOwnProfile(admin.sub);
  }

  @Patch()
  async updateOwnProfile(
    @CurrentAdmin() admin: AdminAccessTokenPayload,
    @Body() dto: UpdateAdminProfileDto,
  ): Promise<AdminSummary> {
    return this.adminProfileService.updateOwnProfile(admin.sub, dto);
  }
}
