import { Injectable, NotFoundException } from '@nestjs/common';
import { AccountHold, Report } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { HOLD_ERROR_CODES, HoldService } from '../account-hold/hold.service';
import { ModerationService } from './moderation.service';

// backend/w6-hold-admin-endpoints (B-045; Decision Log #376, #398 D1, #403 item 8).
//
// HTTP-facing wrapper around B-044's HoldService. It adds NO rule: the rules, the reason bounds, the audit rows
// (AdminActionLog, written in the same transaction as the hold) and the "nobody is notified" behaviour all
// live in HoldService, and this class never creates a Notification or sends an email. What it adds is the
// access shape of the moderation module:
//   * 404 (the report / the hold does not exist) is settled FIRST;
//   * then the child-safety-vetting gate, ModerationService.assertVettedToActOn (a fresh read of
//     AdminUser.childSafetyVetted, any role) -- the same 403 code actionReport and decideAppeal give. Since B-302
//     (Decision Log #498) that is the B-297 rule: a concernsMinor report, or a MESSAGE report whose sender or any
//     participant is under 18 (fail closed), needs a vetted admin. A hold whose report was purged (reportId NULL)
//     has nothing to vet against and any moderator may lift it (Decision Log #499);
//   * only then is the hold touched.
// Appeal Review reuses these routes as they are (#398 D1): they take a report id whatever its appeal state.

export interface HoldView {
  id: string;
  userId: string;
  type: string;
  reportId: string | null;
  placedBy: string;
  placedAt: Date;
  expiresAt: Date | null;
  liftedAt: Date | null;
}

export function toHoldView(
  h: Pick<AccountHold, 'id' | 'userId' | 'type' | 'reportId' | 'placedByAdminId' | 'placedAt' | 'expiresAt' | 'liftedAt'>,
): HoldView {
  return {
    id: h.id,
    userId: h.userId,
    type: h.type,
    reportId: h.reportId,
    placedBy: h.placedByAdminId,
    placedAt: h.placedAt,
    expiresAt: h.expiresAt,
    liftedAt: h.liftedAt,
  };
}

@Injectable()
export class ModerationHoldsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly holdService: HoldService,
    // B-302: the one implementation of the "vetted to act" rule (no second copy here).
    private readonly moderationService: ModerationService,
  ) {}

  private async loadReportForGate(reportId: string): Promise<Pick<Report, 'concernsMinor' | 'targetType' | 'targetId'>> {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      select: { concernsMinor: true, targetType: true, targetId: true },
    });
    if (!report) throw new NotFoundException('Report not found');
    return report;
  }

  /** POST /admin/moderation/reports/:id/holds/bad-faith -- hold the REPORTER's account for the bad-faith period. */
  async placeBadFaith(reportId: string, adminId: string, reason: string): Promise<{ holds: HoldView[] }> {
    const report = await this.loadReportForGate(reportId);
    await this.moderationService.assertVettedToActOn(report, adminId);
    const hold = await this.holdService.placeBadFaith(reportId, adminId, reason);
    return { holds: [toHoldView(hold)] };
  }

  /** POST /admin/moderation/reports/:id/holds/legal -- hold every party of the report that has an account. */
  async placeLegal(reportId: string, adminId: string, reason: string): Promise<{ holds: HoldView[] }> {
    const report = await this.loadReportForGate(reportId);
    await this.moderationService.assertVettedToActOn(report, adminId);
    const holds = await this.holdService.placeLegalHold(reportId, adminId, reason);
    return { holds: holds.map(toHoldView) };
  }

  /** PATCH /admin/moderation/holds/:holdId/lift -- lift either type of hold. */
  async lift(holdId: string, adminId: string, reason: string): Promise<{ hold: HoldView }> {
    const existing = await this.prisma.accountHold.findUnique({
      where: { id: holdId },
      select: { id: true, report: { select: { concernsMinor: true, targetType: true, targetId: true } } },
    });
    if (!existing) {
      throw new NotFoundException({ statusCode: 404, code: HOLD_ERROR_CODES.HOLD_NOT_FOUND, message: 'Hold not found' });
    }
    // Decision Log #499: a hold whose report has been purged has no report to vet against, so the check is skipped.
    if (existing.report) await this.moderationService.assertVettedToActOn(existing.report, adminId);
    const lifted = await this.holdService.liftHold(holdId, adminId, reason);
    return { hold: toHoldView(lifted) };
  }

  /**
   * The ACTIVE holds attached to one report (not lifted, and not past their expiry), oldest first. Used by the
   * Report detail response so the screen can show a hold-active state and a Lift control. The caller has
   * already passed the report's 404 and vetting gate.
   */
  async listActiveHoldsForReport(reportId: string, now: Date = new Date()): Promise<HoldView[]> {
    const rows = await this.prisma.accountHold.findMany({
      where: { reportId, liftedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      orderBy: [{ placedAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        userId: true,
        type: true,
        reportId: true,
        placedByAdminId: true,
        placedAt: true,
        expiresAt: true,
        liftedAt: true,
      },
    });
    return rows.map(toHoldView);
  }
}
