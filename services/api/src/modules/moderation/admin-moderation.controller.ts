import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AdminJwtAuthGuard } from '../admin/guards/admin-jwt-auth.guard';
import { AdminRoles } from '../admin/guards/admin-roles.decorator';
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard';
import { CurrentAdmin } from '../admin/guards/current-admin.decorator';
import { AdminAccessTokenPayload } from '../admin/token/admin-token.types';
import { ActionReportDto } from './dto/action-report.dto';
import { AppealDecisionDto } from './dto/appeal-decision.dto';
import { EscalateReportDto } from './dto/escalate-report.dto';
import { HoldReasonDto } from './dto/hold-reason.dto';
import { ListReportsQueryDto } from './dto/list-reports-query.dto';
import { ModerationHoldsService } from './moderation-holds.service';
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
  constructor(
    private readonly moderationService: ModerationService,
    private readonly holdsService: ModerationHoldsService,
  ) {}

  @Get('reports')
  async list(@Query() query: ListReportsQueryDto, @CurrentAdmin() admin: AdminAccessTokenPayload) {
    return this.moderationService.listReports(query, admin.sub);
  }

  // The single-resource fetch ReportDetailPage.tsx/AppealReviewPage.tsx
  // previously had no backend route for — see
  // ModerationService.getReportById's own header comment for the full
  // 404-then-child-safety-vetting-gate reasoning (same guard shape as
  // PATCH reports/:id below).
  @Get('reports/:id')
  async getOne(@Param('id') id: string, @CurrentAdmin() admin: AdminAccessTokenPayload) {
    const report = await this.moderationService.getReportById(id, admin.sub);
    // B-045: every existing field is kept; `holds` is the report's ACTIVE admin holds (legal_hold, bad_faith)
    // so the screen can show a hold-active state and a Lift control. The 404 and the child-safety-vetting gate
    // were already settled by getReportById above.
    const holds = await this.holdsService.listActiveHoldsForReport(report.id);
    return { ...report, holds };
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

  // Restricted to child-safety-vetted admins — see
  // ModerationService.escalateReport's own header comment. Still behind
  // this controller's class-level AdminRolesGuard('moderator',
  // 'superadmin') too; the vetting check is an ADDITIONAL, orthogonal
  // gate, not a replacement for the role check.
  @Patch('reports/:id/escalate')
  async escalate(
    @Param('id') id: string,
    @CurrentAdmin() admin: AdminAccessTokenPayload,
    @Body() dto: EscalateReportDto,
  ) {
    return this.moderationService.escalateReport(id, admin.sub, dto);
  }

  // backend/w6-hold-admin-endpoints (B-045; Decision Log #376, #398 D1, #403 item 8). The two admin actions and
  // the lift control of B-044's HoldService. Each needs a reason of 10 to 500 characters, notifies nobody
  // (no Notification row, no email) and writes an AdminActionLog row. They take a REPORT id whatever its
  // appeal state, so Appeal Review uses the same routes as Report Detail. A report that concerns a minor is
  // behind the same child-safety-vetting gate as PATCH reports/:id (403, code
  // child_safety_vetting_required); a hold id is gated through the report it belongs to.
  @Post('reports/:id/holds/bad-faith')
  async placeBadFaith(
    @Param('id') id: string,
    @CurrentAdmin() admin: AdminAccessTokenPayload,
    @Body() dto: HoldReasonDto,
  ) {
    return this.holdsService.placeBadFaith(id, admin.sub, dto.reason);
  }

  @Post('reports/:id/holds/legal')
  async placeLegal(
    @Param('id') id: string,
    @CurrentAdmin() admin: AdminAccessTokenPayload,
    @Body() dto: HoldReasonDto,
  ) {
    return this.holdsService.placeLegal(id, admin.sub, dto.reason);
  }

  @Patch('holds/:holdId/lift')
  async liftHold(
    @Param('holdId') holdId: string,
    @CurrentAdmin() admin: AdminAccessTokenPayload,
    @Body() dto: HoldReasonDto,
  ) {
    return this.holdsService.lift(holdId, admin.sub, dto.reason);
  }
}
