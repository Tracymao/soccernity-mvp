import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { AdminJwtAuthGuard } from '../admin/guards/admin-jwt-auth.guard';
import { AdminRoles } from '../admin/guards/admin-roles.decorator';
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard';
import { CurrentAdmin } from '../admin/guards/current-admin.decorator';
import { AdminAccessTokenPayload } from '../admin/token/admin-token.types';
import { AdminUsersService } from './admin-users.service';
import { HeldInvestigationsQueryDto } from './dto/held-investigations-query.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
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
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Get()
  async list(@Query() query: ListUsersQueryDto) {
    return this.adminUsersService.listUsers(query);
  }

  // Registered before ':id' routes; GET only, so no clash regardless.
  @Get('held-investigations')
  async heldInvestigations(@Query() query: HeldInvestigationsQueryDto) {
    return this.adminUsersService.listStalledHolds(query.olderThanDays);
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
