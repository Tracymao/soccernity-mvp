import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Report } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { decodeModerationCursor, encodeModerationCursor } from './cursor.util';
import { ActionReportDto } from './dto/action-report.dto';
import { AppealDecisionDto } from './dto/appeal-decision.dto';
import { AppealReportDto } from './dto/appeal-report.dto';
import { CreateReportDto } from './dto/create-report.dto';
import { ListReportsQueryDto } from './dto/list-reports-query.dto';
import { MODERATION_DEFAULT_PAGE_SIZE, MODERATION_MAX_PAGE_SIZE } from './moderation.constants';

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
  constructor(private readonly prisma: PrismaService) {}

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
      },
    });
  }

  // A well-formed but non-existent target must 404, never a raw FK-less
  // silent accept — Report.targetId is a bare string, not an FK (by
  // design: it has to point at three different tables depending on
  // targetType, which Prisma relations can't express), so nothing at the
  // database layer would otherwise catch a typo'd or already-deleted id.
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
  // POST /reports/:id/appeal (user-facing, JwtAuthGuard only). Only the
  // REPORTED user (never the reporter) may appeal, and only once a
  // report has actually been actioned — a dismissed report (status
  // 'reviewed') took no action against anyone, so there is nothing to
  // appeal.
  // -------------------------------------------------------------------
  async appealReport(reportId: string, callerId: string, dto: AppealReportDto): Promise<Report> {
    const report = await this.assertReportExists(reportId);

    // Checked BEFORE the reported-user identity check on purpose: a
    // report that has never been actioned (still 'open') or was
    // dismissed ('reviewed') has nothing to appeal, regardless of who is
    // asking — this is a state question, not an authorization one, so it
    // comes first (mirrors this codebase's own 404-before-403 ordering
    // discipline for "settle existence/state before authorization").
    if (report.status !== 'actioned') {
      throw new ForbiddenException('Only an actioned report may be appealed');
    }

    // One appeal per actioning-cycle. A report that already has a
    // pending/upheld/overturned appeal on its CURRENT action cannot be
    // appealed again — actionReport() clears these back to null whenever
    // a report is re-actioned after a prior overturned appeal (see that
    // method's own comment), so this can never incorrectly block a
    // legitimate fresh appeal on a genuinely NEW action.
    if (report.appealStatus) {
      throw new ConflictException('This report has already been appealed');
    }

    const reportedUserId = await this.resolveReportedUserId(report.targetType, report.targetId);
    if (!reportedUserId || reportedUserId !== callerId) {
      // Deliberately the same generic ForbiddenException regardless of
      // WHY the caller isn't eligible (they're the reporter, an
      // unrelated third party, or the target no longer resolves at
      // all) — never distinguishes those cases in the response, the
      // same "don't leak which specific reason applied" posture this
      // codebase already uses elsewhere (e.g. FeedService.deleteComment).
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
  // -------------------------------------------------------------------
  async listReports(query: ListReportsQueryDto): Promise<ReportListPage> {
    const limit = Math.min(query.limit ?? MODERATION_DEFAULT_PAGE_SIZE, MODERATION_MAX_PAGE_SIZE);

    const conditions: Prisma.ReportWhereInput[] = [];
    if (query.status) {
      conditions.push({ status: query.status });
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
  //
  // Only reachable on an 'open' report — a report that is already
  // 'actioned' or 'reviewed' cannot be actioned a second time this way
  // (a stale second PATCH call, or trying to re-action a dismissed
  // report). The ONLY path back to 'open' after an initial action is an
  // OVERTURNED appeal (decideAppeal below), which is exactly the
  // scenario this re-actioning re-opens for: a fresh action + a fresh,
  // once-per-cycle appeal window. That is also why this clears any
  // stale appeal fields below — they belong to the PREVIOUS action
  // cycle, and appealReport()'s own "already appealed" guard would
  // otherwise incorrectly block a legitimate new appeal on this new
  // action, since it reads report.appealStatus off the same row.
  // -------------------------------------------------------------------
  async actionReport(reportId: string, adminId: string, dto: ActionReportDto): Promise<Report> {
    const report = await this.assertReportExists(reportId);

    if (report.status !== 'open') {
      throw new ConflictException('This report has already been reviewed');
    }

    const newStatus = dto.action === 'dismissed' ? 'reviewed' : 'actioned';
    const reportedUserId = await this.resolveReportedUserId(report.targetType, report.targetId);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.report.update({
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

      // Section 8.4: notify BOTH the reporting user and the reported
      // user of the outcome. One shared Notification.type
      // ('moderation_decision') covers both this event and the appeal
      // decision below — a comment-only addition to Notification.type's
      // schema comment, no migration needed (the column is a plain
      // String, same as every other type value). No self-notification
      // guard is needed for the ADMIN's own identity (a completely
      // separate AdminUser auth domain, Decision Log #189-193, mirroring
      // contest.service.ts's own contest_win trigger reasoning) — but a
      // real Report CAN have the same real User as both reporter and
      // reported (a self-report), so that coincidence is guarded here to
      // avoid a duplicate notification to the same recipient.
      await tx.notification.create({
        data: { userId: report.reporterId, type: 'moderation_decision', payloadRefId: reportId },
      });
      if (reportedUserId && reportedUserId !== report.reporterId) {
        await tx.notification.create({
          data: { userId: reportedUserId, type: 'moderation_decision', payloadRefId: reportId },
        });
      }

      return updated;
    });
  }

  // -------------------------------------------------------------------
  // PATCH /admin/moderation/reports/:id/appeal (AdminJwtAuthGuard +
  // AdminRolesGuard, moderator/superadmin only). The second-reviewer
  // decision — Decision Log #138, hard-enforced: the reviewing admin
  // must NOT be the same admin who actioned the original report.
  // -------------------------------------------------------------------
  async decideAppeal(reportId: string, adminId: string, dto: AppealDecisionDto): Promise<Report> {
    const report = await this.assertReportExists(reportId);

    if (report.appealStatus !== 'pending') {
      throw new ConflictException('This report has no pending appeal to review');
    }

    // Decision Log #138. Checked after the state check above (an appeal
    // that isn't pending is a state problem regardless of who's asking),
    // and before anything is written.
    if (report.reviewedByAdminId === adminId) {
      throw new ForbiddenException('The admin who actioned this report may not also review its appeal');
    }

    const reportedUserId = await this.resolveReportedUserId(report.targetType, report.targetId);

    return this.prisma.$transaction(async (tx) => {
      const data: Prisma.ReportUpdateInput = {
        appealStatus: dto.decision,
        appealReviewedByAdmin: { connect: { id: adminId } },
        appealReviewedAt: new Date(),
      };

      if (dto.decision === 'overturned') {
        // Reverse the report back to a non-actioned state — the exact
        // instruction this endpoint was briefed against. appealStatus
        // itself is deliberately LEFT as 'overturned' (not reset to
        // null) as the historical record of this appeal round; only the
        // ACTION-side fields revert, so the report re-enters the open
        // queue as if never actioned.
        data.status = 'open';
        data.reviewedByAdmin = { disconnect: true };
        data.reviewedAt = null;
        data.actionTaken = null;
      }

      const updated = await tx.report.update({ where: { id: reportId }, data });

      // Section 8.4: notify the reported user of the appeal outcome.
      // Deliberately NOT the reporter too — unlike actionReport()'s own
      // notification step above, an appeal is a dispute between the
      // reported user and the platform's original decision; the
      // reporter was already notified once, when the report was first
      // actioned.
      if (reportedUserId) {
        await tx.notification.create({
          data: { userId: reportedUserId, type: 'moderation_decision', payloadRefId: reportId },
        });
      }

      return updated;
    });
  }
}
