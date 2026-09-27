import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Report } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminActionLogService } from '../admin-action-log/admin-action-log.service';
import { ADMIN_ACTION_LOG_ACTIONS, ADMIN_ACTION_LOG_TARGET_TYPES } from '../admin-action-log/admin-action-log.constants';
import { RegistrationEmailService } from '../auth/registration/email/registration-email.service';
import { decodeModerationCursor, encodeModerationCursor } from './cursor.util';
import { ActionReportDto } from './dto/action-report.dto';
import { AppealDecisionDto } from './dto/appeal-decision.dto';
import { AppealReportDto } from './dto/appeal-report.dto';
import { CreatePublicReportDto } from './dto/create-public-report.dto';
import { CreateReportDto } from './dto/create-report.dto';
import { EscalateReportDto } from './dto/escalate-report.dto';
import { ListReportsQueryDto } from './dto/list-reports-query.dto';
import {
  CHILD_SAFETY_VETTING_REQUIRED_CODE,
  DEFAULT_REPORT_SEVERITY,
  MODERATION_DEFAULT_PAGE_SIZE,
  MODERATION_MAX_PAGE_SIZE,
} from './moderation.constants';

export interface ReportListPage {
  items: Report[];
  nextCursor: string | null;
}

// Build Plan Section 4.8 (Admin Service) + Section 8.4 (Moderation &
// appeals workflow). See README.md for the full guard/permission
// reasoning and the two Decision Log candidates this module's own two
// user-facing endpoints (POST /reports, POST /reports/:id/appeal)
// surface — Section 4 never defines either route.
@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: RegistrationEmailService,
    // feat/admin-action-log — see AdminActionLogService's own header
    // comment for why this is a separate audit trail from Report's own
    // reviewed/action/appeal fields, and why record() is called after
    // (not inside) each method's own $transaction/update.
    private readonly adminActionLogService: AdminActionLogService,
  ) {}

  // -------------------------------------------------------------------
  // POST /reports (user-facing, JwtAuthGuard only — see README.md for why
  // this is deliberately NOT GuardianConsentGuard-gated).
  // -------------------------------------------------------------------
  async createReport(reporterId: string, dto: CreateReportDto): Promise<Report> {
    await this.assertReportTargetExists(dto.targetType, dto.targetId);

    return this.prisma.report.create({
      data: {
        reporterId,
        targetType: dto.targetType,
        targetId: dto.targetId,
        reason: dto.reason,
        // Defaults to 'medium' when omitted — matched explicitly here
        // rather than left to Report.severity's own DB-level default, so
        // the API's documented behaviour doesn't depend on a Prisma
        // undefined-vs-omitted nuance.
        severity: dto.severity ?? DEFAULT_REPORT_SEVERITY,
      },
    });
  }

  // -------------------------------------------------------------------
  // POST /reports/public (no guard at all — see PublicReportsController's
  // own header comment). For a non-authenticated party (a parent, a
  // school, a member of the public) to flag content that depicts them or
  // their child without first having to register. reporterId is left
  // null on the created row — see Report's own schema comment on why
  // reporterId/reporter became optional, and README.md for this route's
  // Decision Log candidate.
  // -------------------------------------------------------------------
  async createPublicReport(dto: CreatePublicReportDto): Promise<Report> {
    await this.assertReportTargetExists(dto.targetType, dto.targetId);

    const report = await this.prisma.report.create({
      data: {
        reporterId: null,
        reporterContactEmail: dto.reporterContactEmail,
        targetType: dto.targetType,
        targetId: dto.targetId,
        reason: dto.reason,
        concernsMinor: dto.concernsMinor,
        // Defaults to 'medium' when omitted — see createReport's own
        // comment on why this is matched explicitly rather than left to
        // Report.severity's DB-level default.
        severity: dto.severity ?? DEFAULT_REPORT_SEVERITY,
      },
    });

    // Same "must never block on / fail because of email delivery"
    // discipline as RegistrationService's own fire-and-forget sends — a
    // failed acknowledgment must not fail the report submission itself,
    // and the caller here has no session to retry against anyway.
    void this.emailService.sendPublicReportAcknowledgementEmail(dto.reporterContactEmail).catch((err: Error) => {
      this.logger.warn(
        `Failed to queue public-report acknowledgement email for report ${report.id}: ${err.message}`,
      );
    });

    return report;
  }

  // A well-formed but non-existent target must 404, never a raw FK-less
  // silent accept — Report.targetId is a bare string, not an FK (by
  // design: it has to point at three different tables depending on
  // targetType, so Prisma relations can't express this), so nothing
  // at the database layer would otherwise catch a typo'd or already-deleted id.
  private async assertReportTargetExists(targetType: string, targetId: string): Promise<void> {
    switch (targetType) {
      case 'post': {
        const post = await this.prisma.post.findUnique({ where: { id: targetId }, select: { id: true } });
        if (!post) throw new NotFoundException('Post not found');
        return;
      }
      case 'comment': {
        const comment = await this.prisma.comment.findUnique({
          where: { id: targetId },
          select: { id: true },
        });
        if (!comment) throw new NotFoundException('Comment not found');
        return;
      }
      case 'user': {
        const user = await this.prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
        if (!user) throw new NotFoundException('User not found');
        return;
      }
    }
  }

  // Shared "who is the reported user" resolution — used by both
  // appealReport's eligibility check (only the reported user may appeal)
  // and the admin-side notification steps below (Section 8.4: both the
  // reporter and the reported user are notified of the outcome). Report
  // has no denormalized reportedUserId column (a deliberate choice, not
  // an oversight — see README.md), so this always resolves dynamically:
  //   - targetType 'user'   -> targetId IS the reported user, if they
  //                            still exist.
  //   - targetType 'post'   -> the post's own authorId, if the post
  //                            still exists.
  //   - targetType 'comment'-> the comment's own authorId, if the
  //                            comment still exists.
  // Returns null if the target has since been deleted (e.g. the reported
  // post/comment was removed, or — Decision Log #44's cascade — the
  // reported user's own account was hard-deleted) or targetType is
  // somehow unrecognised. Every caller treats null as "cannot determine
  // the reported user," never as an error to surface to a report's own
  // reporter/admin actions.
  private async resolveReportedUserId(targetType: string, targetId: string): Promise<string | null> {
    switch (targetType) {
      case 'user': {
        const user = await this.prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
        return user?.id ?? null;
      }
      case 'post': {
        const post = await this.prisma.post.findUnique({
          where: { id: targetId },
          select: { authorId: true },
        });
        return post?.authorId ?? null;
      }
      case 'comment': {
        const comment = await this.prisma.comment.findUnique({
          where: { id: targetId },
          select: { authorId: true },
        });
        return comment?.authorId ?? null;
      }
      default:
        return null;
    }
  }

  private async assertReportExists(id: string): Promise<Report> {
    const report = await this.prisma.report.findUnique({ where: { id } });
    if (!report) {
      throw new NotFoundException('Report not found');
    }
    return report;
  }

  // -------------------------------------------------------------------
  // Child-safety-vetting gate. AdminAccessTokenPayload structurally
  // carries only { sub, role, aud } (admin-token.types.ts) — the same
  // "no safety-sensitive state in the token, always re-read Postgres"
  // discipline GuardianConsentGuard already applies for the User side
  // (Section 5.7). childSafetyVetted is exactly that kind of state, so
  // it is read fresh here on every call this gates, never trusted from a
  // cached/stale value. Applies REGARDLESS of AdminRolesGuard's own
  // moderator/superadmin role check — a superadmin who is not
  // child-safety-vetted is blocked exactly the same as a moderator who
  // isn't; vetting is an orthogonal axis to role.
  // -------------------------------------------------------------------
  private async isChildSafetyVetted(adminId: string): Promise<boolean> {
    const admin = await this.prisma.adminUser.findUnique({
      where: { id: adminId },
      select: { childSafetyVetted: true },
    });
    return admin?.childSafetyVetted ?? false;
  }

  private async assertChildSafetyVetted(adminId: string): Promise<void> {
    if (await this.isChildSafetyVetted(adminId)) {
      return;
    }
    throw new ForbiddenException({
      statusCode: 403,
      error: 'Forbidden',
      code: CHILD_SAFETY_VETTING_REQUIRED_CODE,
      message: 'This action requires a child-safety-vetted admin.',
    });
  }

  // -------------------------------------------------------------------
  // POST /reports/:id/appeal (user-facing, JwtAuthGuard only). Only the
  // REPORTED user (never the reporter) may appeal, and only once a
  // report has actually been actioned — a dismissed report (status
  // 'reviewed') took no action against anyone, so there is nothing to
  // appeal.
  // -------------------------------------------------------------------
  async appealReport(reportId: string, callerId: string, dto: AppealReportDto): Promise<Report> {
    const report = await this.assertReportExists(reportId);

    if (report.status !== 'actioned') {
      throw new ForbiddenException('Only an actioned report may be appealed');
    }

    if (report.appealStatus) {
      throw new ConflictException('This report has already been appealed');
    }

    const reportedUserId = await this.resolveReportedUserId(report.targetType, report.targetId);
    if (!reportedUserId || reportedUserId !== callerId) {
      throw new ForbiddenException('You may only appeal a report made against you');
    }

    return this.prisma.report.update({
      where: { id: reportId },
      data: {
        appealStatus: 'pending',
        appealReason: dto.reason,
        appealedAt: new Date(),
      },
    });
  }

  // -------------------------------------------------------------------
  // GET /admin/moderation/reports (AdminJwtAuthGuard + AdminRolesGuard,
  // moderator/superadmin only). Keyset-paginated, newest-first, optional
  // exact-match `status` filter.
  //
  // `adminId` is the CALLER's id, freshly checked against
  // AdminUser.childSafetyVetted (see assertChildSafetyVetted's own
  // comment). A non-vetted admin — regardless of role — never sees a
  // Report where concernsMinor is true at all; it is filtered out of the
  // list rather than returned and then hidden, so no partial/redacted
  // row shape is needed.
  // -------------------------------------------------------------------
  async listReports(query: ListReportsQueryDto, adminId: string): Promise<ReportListPage> {
    const limit = Math.min(query.limit ?? MODERATION_DEFAULT_PAGE_SIZE, MODERATION_MAX_PAGE_SIZE);

    const conditions: Prisma.ReportWhereInput[] = [];
    if (query.status) {
      conditions.push({ status: query.status });
    }
    if (!(await this.isChildSafetyVetted(adminId))) {
      conditions.push({ concernsMinor: false });
    }
    if (query.cursor) {
      const cursor = decodeModerationCursor(query.cursor);
      conditions.push({
        OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }],
      });
    }

    const where: Prisma.ReportWhereInput = conditions.length > 0 ? { AND: conditions } : {};

    const rows = await this.prisma.report.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];
    const nextCursor = hasMore && last ? encodeModerationCursor({ createdAt: last.createdAt, id: last.id }) : null;

    return { items, nextCursor };
  }

  // -------------------------------------------------------------------
  // PATCH /admin/moderation/reports/:id (AdminJwtAuthGuard +
  // AdminRolesGuard, moderator/superadmin only). Admin actions a report:
  // content removal, a warning, a suspension, or dismissed. Maps onto
  // Report.status's own pre-existing enum (dismissed -> 'reviewed',
  // anything else -> 'actioned'), never a fourth status value.
  // -------------------------------------------------------------------
  async actionReport(reportId: string, adminId: string, dto: ActionReportDto): Promise<Report> {
    const report = await this.assertReportExists(reportId);

    // 404 (existence) is already settled above; this is the "403 on
    // direct access" half of the concernsMinor gate (listReports is the
    // filtering half) — a non-vetted admin may not act on a report
    // concerning a minor, regardless of role.
    if (report.concernsMinor) {
      await this.assertChildSafetyVetted(adminId);
    }

    if (report.status !== 'open') {
      throw new ConflictException('This report has already been reviewed');
    }

    const newStatus = dto.action === 'dismissed' ? 'reviewed' : 'actioned';
    const reportedUserId = await this.resolveReportedUserId(report.targetType, report.targetId);

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedReport = await tx.report.update({
        where: { id: reportId },
        data: {
          status: newStatus,
          actionTaken: dto.action,
          reviewedByAdminId: adminId,
          reviewedAt: new Date(),
          appealStatus: null,
          appealReason: null,
          appealedAt: null,
          appealReviewedByAdminId: null,
          appealReviewedAt: null,
        },
      });

      // A reporter may be an unauthenticated contact and therefore have no
      // User row. Do not attempt to create a notification with a null userId.
      if (report.reporterId) {
        await tx.notification.create({
          data: { userId: report.reporterId, type: 'moderation_decision', payloadRefId: reportId },
        });
      }
      if (reportedUserId && reportedUserId !== report.reporterId) {
        await tx.notification.create({
          data: { userId: reportedUserId, type: 'moderation_decision', payloadRefId: reportId },
        });
      }

      return updatedReport;
    });

    // See AdminActionLogService's own comment on why this runs after (not
    // inside) the transaction above.
    await this.adminActionLogService.record(
      adminId,
      ADMIN_ACTION_LOG_ACTIONS.REPORT_ACTIONED,
      ADMIN_ACTION_LOG_TARGET_TYPES.REPORT,
      reportId,
      dto.action,
    );

    return updated;
  }

  // -------------------------------------------------------------------
  // PATCH /admin/moderation/reports/:id/appeal (AdminJwtAuthGuard +
  // AdminRolesGuard, moderator/superadmin only). The second-reviewer
  // decision — Decision Log #138, hard-enforced: the reviewing admin
  // must NOT be the same admin who actioned the original report.
  // -------------------------------------------------------------------
  async decideAppeal(reportId: string, adminId: string, dto: AppealDecisionDto): Promise<Report> {
    const report = await this.assertReportExists(reportId);

    // Same "403 on direct access" gate actionReport applies — reviewing
    // an appeal on a report concerning a minor requires the SAME
    // child-safety vetting, on top of (not instead of) Decision Log
    // #138's separate same-admin-may-not-review-their-own-action rule
    // checked below.
    if (report.concernsMinor) {
      await this.assertChildSafetyVetted(adminId);
    }

    if (report.appealStatus !== 'pending') {
      throw new ConflictException('This report has no pending appeal to review');
    }

    if (report.reviewedByAdminId === adminId) {
      throw new ForbiddenException('The admin who actioned this report may not also review its appeal');
    }

    const reportedUserId = await this.resolveReportedUserId(report.targetType, report.targetId);

    const updated = await this.prisma.$transaction(async (tx) => {
      const data: Prisma.ReportUpdateInput = {
        appealStatus: dto.decision,
        appealReviewedByAdmin: { connect: { id: adminId } },
        appealReviewedAt: new Date(),
      };

      if (dto.decision === 'overturned') {
        data.status = 'open';
        data.reviewedByAdmin = { disconnect: true };
        data.reviewedAt = null;
        data.actionTaken = null;
      }

      const updatedReport = await tx.report.update({ where: { id: reportId }, data });

      if (reportedUserId) {
        await tx.notification.create({
          data: { userId: reportedUserId, type: 'moderation_decision', payloadRefId: reportId },
        });
      }

      return updatedReport;
    });

    // See AdminActionLogService's own comment on why this runs after (not
    // inside) the transaction above.
    await this.adminActionLogService.record(
      adminId,
      ADMIN_ACTION_LOG_ACTIONS.REPORT_APPEAL_DECIDED,
      ADMIN_ACTION_LOG_TARGET_TYPES.REPORT,
      reportId,
      dto.decision,
    );

    return updated;
  }

  // -------------------------------------------------------------------
  // PATCH /admin/moderation/reports/:id/escalate (AdminJwtAuthGuard +
  // AdminRolesGuard('moderator', 'superadmin') from the controller, PLUS
  // the child-safety-vetting gate below) — restricted to vetted admins
  // regardless of the target report's own concernsMinor value (a report
  // may need escalating precisely because it wasn't flagged as
  // concerning a minor at submission time but turns out, on review, to
  // be one). Sets the escalation trail Report's own schema comment
  // describes: escalatedAt/escalatedByAdminId/escalationNotes/
  // escalatedToAuthority. This endpoint records that a human has done
  // something outside Soccernity (or is flagging it for someone who
  // will) — it does not itself contact anyone. Deliberately independent
  // of reviewedByAdminId/appealReviewedByAdminId/Report.status —
  // escalating is not the same act as actioning or appeal-reviewing, and
  // this may be called on a report in any status.
  // -------------------------------------------------------------------
  async escalateReport(reportId: string, adminId: string, dto: EscalateReportDto): Promise<Report> {
    await this.assertReportExists(reportId);
    await this.assertChildSafetyVetted(adminId);

    const updated = await this.prisma.report.update({
      where: { id: reportId },
      data: {
        escalatedAt: new Date(),
        escalatedByAdminId: adminId,
        escalationNotes: dto.escalationNotes,
        escalatedToAuthority: dto.escalatedToAuthority,
      },
    });

    await this.adminActionLogService.record(
      adminId,
      ADMIN_ACTION_LOG_ACTIONS.REPORT_ESCALATED,
      ADMIN_ACTION_LOG_TARGET_TYPES.REPORT,
      reportId,
      `escalatedToAuthority=${dto.escalatedToAuthority}: ${dto.escalationNotes}`,
    );

    return updated;
  }
}
