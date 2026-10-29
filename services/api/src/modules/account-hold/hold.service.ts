import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AccountHold } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ADMIN_ACTION_LOG_ACTIONS, ADMIN_ACTION_LOG_TARGET_TYPES } from '../admin-action-log/admin-action-log.constants';
import { resolveReportedUserId } from '../moderation/report-target.util';
import { addUtcMonths, resolveBadFaithHoldMonths } from './account-hold.config';

// backend/w6-hold-rule-extension (B-044; Decision Log #376, extends #341 / #345; #398 D1; #403 item 8).
//
// The two ADMIN-placed account holds. SERVICE ONLY: the HTTP endpoints are B-045. Every action:
//   * is written in ONE transaction with its AdminActionLog row (so a hold with no audit row, or an audit row
//     for a hold that never happened, cannot exist);
//   * notifies NOBODY (#403 item 8: the held user is not told, and neither is the other party);
//   * needs a reason of 10 to 500 characters (the same bound as the username-revoke reason).
//
// What a hold DOES is in AccountDeletionSweepService: an account with an active legal_hold or bad_faith hold
// is skipped in full by the sweep (nothing is cleared), and the admin immediate delete refuses it (409).
// What makes the report-based holds (open report, appeal window, six months after closure) is derived from
// Report, not stored here; see account-hold.rules.ts.

export const HOLD_REASON_MIN_LENGTH = 10;
export const HOLD_REASON_MAX_LENGTH = 500;

// Machine-readable codes (HTTP mapping is B-045; the service throws Nest exceptions carrying them).
export const HOLD_ERROR_CODES = {
  REASON_INVALID: 'hold_reason_invalid',
  REPORTER_HAS_NO_ACCOUNT: 'reporter_has_no_account',
  ACCOUNT_ALREADY_DELETED: 'account_already_deleted',
  HOLD_ALREADY_ACTIVE: 'hold_already_active',
  NO_PARTY_TO_HOLD: 'no_party_to_hold',
  HOLD_ALREADY_LIFTED: 'hold_already_lifted',
  HOLD_EXPIRED: 'hold_expired',
  HOLD_NOT_FOUND: 'hold_not_found',
} as const;

function coded(code: string, message: string): { statusCode: number; code: string; message: string } {
  return { statusCode: 409, code, message };
}

@Injectable()
export class HoldService {
  private readonly logger = new Logger(HoldService.name);

  constructor(private readonly prisma: PrismaService) {}

  private normaliseReason(reason: string): string {
    const trimmed = typeof reason === 'string' ? reason.trim() : '';
    if (trimmed.length < HOLD_REASON_MIN_LENGTH || trimmed.length > HOLD_REASON_MAX_LENGTH) {
      throw new BadRequestException({
        statusCode: 400,
        code: HOLD_ERROR_CODES.REASON_INVALID,
        message: `A reason of ${HOLD_REASON_MIN_LENGTH} to ${HOLD_REASON_MAX_LENGTH} characters is required.`,
      });
    }
    return trimmed;
  }

  private async loadReport(reportId: string) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      select: { id: true, reporterId: true, targetType: true, targetId: true },
    });
    if (!report) throw new NotFoundException('Report not found');
    return report;
  }

  /**
   * The REPORTER of a report was found to have acted in bad faith: hold THEIR account in full for
   * BAD_FAITH_HOLD_MONTHS (calendar months from `now`). Refused with a coded 409 when the report has no
   * reporter account (a public, unauthenticated report), when that account is already anonymised, or when an
   * active bad-faith hold for this reporter and report already exists.
   */
  async placeBadFaith(reportId: string, adminId: string, reason: string, now: Date = new Date()): Promise<AccountHold> {
    const cleanReason = this.normaliseReason(reason);
    const report = await this.loadReport(reportId);
    if (!report.reporterId) {
      throw new ConflictException(
        coded(HOLD_ERROR_CODES.REPORTER_HAS_NO_ACCOUNT, 'This report was not made by a signed-in account, so there is no account to hold.'),
      );
    }
    const reporterId = report.reporterId;
    const expiresAt = addUtcMonths(now, resolveBadFaithHoldMonths());

    const hold = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: reporterId }, select: { id: true, accountStatus: true } });
      if (!user) throw new NotFoundException('Reporter account not found');
      if (user.accountStatus === 'deleted') {
        throw new ConflictException(coded(HOLD_ERROR_CODES.ACCOUNT_ALREADY_DELETED, 'This account has already been deleted and anonymised.'));
      }
      const existing = await tx.accountHold.findFirst({
        where: {
          userId: reporterId,
          reportId,
          type: 'bad_faith',
          liftedAt: null,
          expiresAt: { gt: now },
        },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException(coded(HOLD_ERROR_CODES.HOLD_ALREADY_ACTIVE, 'A bad-faith hold is already active for this report.'));
      }
      const created = await tx.accountHold.create({
        data: { userId: reporterId, type: 'bad_faith', reportId, placedByAdminId: adminId, placeReason: cleanReason, placedAt: now, expiresAt },
      });
      await tx.adminActionLog.create({
        data: {
          adminId,
          action: ADMIN_ACTION_LOG_ACTIONS.ACCOUNT_HOLD_BAD_FAITH_PLACED,
          targetType: ADMIN_ACTION_LOG_TARGET_TYPES.USER,
          targetId: reporterId,
          notes: `hold=${created.id}; report=${reportId}; expires=${expiresAt.toISOString()}; reason=${cleanReason}`,
        },
      });
      return created;
    });

    this.logger.log(`Admin ${adminId} placed a bad-faith hold ${hold.id} on user ${reporterId} (report ${reportId}).`);
    return hold;
  }

  /**
   * Hold, in full and until an admin lifts it, every party of the report that has an account: the reporter
   * (if any) and the reported user (resolved by report-target.util). One AccountHold row per party. A party
   * that is already anonymised is skipped (nothing personal left to protect), and so is one that already has
   * an active legal hold for this report. Returns the holds CREATED by this call; refused with a coded 409
   * if that is none.
   */
  async placeLegalHold(reportId: string, adminId: string, reason: string, now: Date = new Date()): Promise<AccountHold[]> {
    const cleanReason = this.normaliseReason(reason);
    const report = await this.loadReport(reportId);

    const reportedUserId = await resolveReportedUserId(this.prisma, report.targetType, report.targetId);
    const partyIds = [...new Set([report.reporterId, reportedUserId].filter((id): id is string => !!id))];

    const created = await this.prisma.$transaction(async (tx) => {
      const holds: AccountHold[] = [];
      for (const userId of partyIds) {
        const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, accountStatus: true } });
        if (!user || user.accountStatus === 'deleted') continue;
        const existing = await tx.accountHold.findFirst({
          where: { userId, reportId, type: 'legal_hold', liftedAt: null },
          select: { id: true },
        });
        if (existing) continue;
        const hold = await tx.accountHold.create({
          data: { userId, type: 'legal_hold', reportId, placedByAdminId: adminId, placeReason: cleanReason, placedAt: now, expiresAt: null },
        });
        await tx.adminActionLog.create({
          data: {
            adminId,
            action: ADMIN_ACTION_LOG_ACTIONS.ACCOUNT_HOLD_LEGAL_PLACED,
            targetType: ADMIN_ACTION_LOG_TARGET_TYPES.USER,
            targetId: userId,
            notes: `hold=${hold.id}; report=${reportId}; reason=${cleanReason}`,
          },
        });
        holds.push(hold);
      }
      return holds;
    });

    if (created.length === 0) {
      throw new ConflictException(
        coded(
          partyIds.length === 0 ? HOLD_ERROR_CODES.NO_PARTY_TO_HOLD : HOLD_ERROR_CODES.HOLD_ALREADY_ACTIVE,
          partyIds.length === 0
            ? 'No party of this report has an account that can be held.'
            : 'Every party of this report is already under a legal hold or has no account left to hold.',
        ),
      );
    }
    this.logger.log(`Admin ${adminId} placed legal hold(s) ${created.map((h) => h.id).join(', ')} for report ${reportId}.`);
    return created;
  }

  /**
   * Lift a hold. Works for BOTH types (legal_hold and the six-month bad_faith hold). A reason is required.
   * The held user is not notified. Refused with a coded 409 for a hold that is already lifted, or a
   * bad-faith hold that has already run out (it is no longer holding anything). Optimistic: two admins
   * lifting at once leaves one winner and one 409.
   */
  async liftHold(holdId: string, adminId: string, reason: string, now: Date = new Date()): Promise<AccountHold> {
    const cleanReason = this.normaliseReason(reason);

    const lifted = await this.prisma.$transaction(async (tx) => {
      const hold = await tx.accountHold.findUnique({ where: { id: holdId } });
      if (!hold) throw new NotFoundException({ statusCode: 404, code: HOLD_ERROR_CODES.HOLD_NOT_FOUND, message: 'Hold not found' });
      if (hold.liftedAt) {
        throw new ConflictException(coded(HOLD_ERROR_CODES.HOLD_ALREADY_LIFTED, 'This hold has already been lifted.'));
      }
      if (hold.expiresAt && hold.expiresAt.getTime() <= now.getTime()) {
        throw new ConflictException(coded(HOLD_ERROR_CODES.HOLD_EXPIRED, 'This hold has already run its course.'));
      }
      const changed = await tx.accountHold.updateMany({
        where: { id: holdId, liftedAt: null },
        data: { liftedAt: now, liftedByAdminId: adminId, liftReason: cleanReason },
      });
      if (changed.count === 0) {
        throw new ConflictException(coded(HOLD_ERROR_CODES.HOLD_ALREADY_LIFTED, 'This hold has already been lifted.'));
      }
      await tx.adminActionLog.create({
        data: {
          adminId,
          action: ADMIN_ACTION_LOG_ACTIONS.ACCOUNT_HOLD_LIFTED,
          targetType: ADMIN_ACTION_LOG_TARGET_TYPES.USER,
          targetId: hold.userId,
          notes: `hold=${hold.id}; type=${hold.type}; report=${hold.reportId ?? 'none'}; reason=${cleanReason}`,
        },
      });
      return { ...hold, liftedAt: now, liftedByAdminId: adminId, liftReason: cleanReason };
    });

    this.logger.log(`Admin ${adminId} lifted hold ${holdId}.`);
    return lifted;
  }
}
