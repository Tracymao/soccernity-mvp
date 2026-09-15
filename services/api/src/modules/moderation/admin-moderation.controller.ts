import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { AdminJwtAuthGuard } from '../admin/guards/admin-jwt-auth.guard';
import { AdminRoles } from '../admin/guards/admin-roles.decorator';
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard';
import { CurrentAdmin } from '../admin/guards/current-admin.decorator';
import { AdminAccessTokenPayload } from '../admin/token/admin-token.types';
import { ActionReportDto } from './dto/action-report.dto';
import { AppealDecisionDto } from './dto/appeal-decision.dto';
import { ListReportsQueryDto } from './dto/list-reports-query.dto';
import { ModerationService } from './moderation.service';

// Admin-facing half of Build Plan Section 4.8 (Admin Service) / Section
// 8.4 (Moderation & appeals workflow) — see README.md for the full
// guard/permission reasoning.
//
// AdminJwtAuthGuard + AdminRolesGuard('moderator', 'superadmin') on every
// route in this controller: an editor authors Articles, a
// moderator/superadmin actions Reports — see AdminUser's own schema
// comment, which already describes these as two different jobs. This is
// the first role-gated admin surface in this codebase; see
// admin/guards/admin-roles.guard.ts's own header comment for the trust
// model (role is read from the already-verified access-token payload,
// not re-read from Postgres per request).
@Controller('admin/moderation')
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@AdminRoles('moderator', 'superadmin')
export class AdminModerationController {
  constructor(private readonly moderationService: ModerationService) {}

  @Get('reports')
  async list(@Query() query: ListReportsQueryDto) {
    return this.moderationService.listReports(query);
  }

  @Patch('reports/:id')
  async action(
    @Param('id') id: string,
    @CurrentAdmin() admin: AdminAccessTokenPayload,
    @Body() dto: ActionReportDto,
  ) {
    return this.moderationService.actionReport(id, admin.sub, dto);
  }

  @Patch('reports/:id/appeal')
  async decideAppeal(
    @Param('id') id: string,
    @CurrentAdmin() admin: AdminAccessTokenPayload,
    @Body() dto: AppealDecisionDto,
  ) {
    return this.moderationService.decideAppeal(id, admin.sub, dto);
  }
}
