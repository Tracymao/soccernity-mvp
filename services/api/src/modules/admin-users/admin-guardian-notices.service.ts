import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { APP_CLOCK, Clock, systemClock } from '../../clock/clock';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ADMIN_ACTION_LOG_ACTIONS,
  ADMIN_ACTION_LOG_TARGET_TYPES,
} from '../admin-action-log/admin-action-log.constants';
import {
  GUARDIAN_NOTICES_ALREADY_WITHHELD_CODE,
  GUARDIAN_NOTICES_NOT_APPLICABLE_CODE,
  GUARDIAN_NOTICES_NOT_WITHHELD_CODE,
  GUARDIAN_NOTICES_TEXT_INVALID_CODE,
  WITHHOLD_REVIEW_DUE_DAYS,
  WITHHOLD_TEXT_MAX_LENGTH,
  WITHHOLD_TEXT_MIN_LENGTH,
} from '../guardian-security-notice/guardian-notice-withhold.constants';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface GuardianNoticesNotWithheld {
  withheld: false;
}

export interface GuardianNoticesWithheld {
  withheld: true;
  setAt: string;
  setBy: { id: string; displayName: string };
  reason: string;
  lastReviewedAt: string | null;
  lastReviewNote: string | null;
  // 30 days after the LATER of setAt and lastReviewedAt. Nothing happens automatically when it passes.
  reviewDueAt: string;
  reviewDue: boolean;
}

export type GuardianNoticesState = GuardianNoticesNotWithheld | GuardianNoticesWithheld;

const ROW_SELECT = {
  userId: true,
  reason: true,
  setAt: true,
  lastReviewedAt: true,
  lastReviewNote: true,
  setByAdmin: { select: { id: true, fullName: true } },
} satisfies Prisma.GuardianNoticeWithholdSelect;

type Row = Prisma.GuardianNoticeWithholdGetPayload<{ select: typeof ROW_SELECT }>;

// backend/b280-withhold-guardian-notices (B-280; Decision Log #458, on #455 / #456). The admin routes of the "withhold
// guardian notices" flag on a MINOR's account.
//
// WHO: child-safety-vetted admins only, checked FIRST by AdminChildSafetyVettedGuard (before this service, before the
// body and the user are looked at), so everyone else gets one identical coded 403 for every account.
//
// WHAT IT DOES TO THE REST OF THE SYSTEM is in the gates, not here: GuardianSecurityNoticeService.decide() skips every
// B-275 / B-279 guardian notice, and TwoFactorRecoveryService treats the account as having no confirmed guardian.
// This service only owns the row and its audit trail. Setting the flag also cancels, in the SAME transaction, any
// active guardian-kind two-factor recovery request, so clearing the flag later cannot bring an old link back to life.
//
// EVERY change writes its AdminActionLog row inside the same transaction (the username revoke / two-factor staff
// reset pattern: AdminActionLogService.record() is not transactional, so tx.adminActionLog.create is used directly).
// The row stores only the latest review; history is the log. The flag is NEVER visible to the minor or the guardian:
// no user-facing endpoint selects this model.
@Injectable()
export class AdminGuardianNoticesService {
  private readonly logger = new Logger(AdminGuardianNoticesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(APP_CLOCK) private readonly clock: Clock = systemClock,
  ) {}

  async getState(userId: string): Promise<GuardianNoticesState> {
    await this.assertUserExists(userId);
    const row = await this.prisma.guardianNoticeWithhold.findUnique({ where: { userId }, select: ROW_SELECT });
    return this.toState(row);
  }

  async withhold(userId: string, adminId: string, rawReason: string): Promise<GuardianNoticesState> {
    const reason = this.cleanText(rawReason, 'A reason');
    const now = this.clock.now();
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { id: true, isMinor: true, accountStatus: true },
        });
        if (!user) throw new NotFoundException('User not found');
        // The flag only means something for a minor's account. An anonymised account has nobody to notify.
        if (!user.isMinor || user.accountStatus === 'deleted') {
          throw new ConflictException({
            statusCode: 409,
            error: 'Conflict',
            code: GUARDIAN_NOTICES_NOT_APPLICABLE_CODE,
            message: 'Guardian notices only apply to a minor’s account.',
          });
        }
        if (await tx.guardianNoticeWithhold.findUnique({ where: { userId }, select: { id: true } })) {
          throw this.alreadyWithheld();
        }

        const created = await tx.guardianNoticeWithhold.create({
          data: { userId, setByAdminId: adminId, reason, setAt: now },
          select: ROW_SELECT,
        });

        // Any ACTIVE guardian-kind recovery request is cancelled now, so a link already in the guardian's inbox
        // stops working and clearing the flag later cannot revive it. (A guardian request is only ever pending.)
        const cancelled = await tx.twoFactorRecoveryRequest.updateMany({
          where: { userId, kind: 'guardian', state: { in: ['pending', 'waiting'] } },
          data: { state: 'cancelled', doneAt: now },
        });

        await tx.adminActionLog.create({
          data: {
            adminId,
            action: ADMIN_ACTION_LOG_ACTIONS.USER_GUARDIAN_NOTICES_WITHHELD,
            targetType: ADMIN_ACTION_LOG_TARGET_TYPES.USER,
            targetId: userId,
            notes: `cancelled_guardian_recovery_requests=${cancelled.count}; reason=${reason}`,
          },
        });
        return created;
      });
      this.logger.log(`Admin ${adminId} withheld guardian notices for user ${userId}.`);
      return this.toState(row);
    } catch (err) {
      // The unique index on userId: another admin set the flag in the same instant.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw this.alreadyWithheld();
      throw err;
    }
  }

  async clear(userId: string, adminId: string, rawReason: string): Promise<GuardianNoticesNotWithheld> {
    const reason = this.cleanText(rawReason, 'A reason');
    await this.prisma.$transaction(async (tx) => {
      await this.assertUserExists(userId, tx);
      const existing = await tx.guardianNoticeWithhold.findUnique({ where: { userId }, select: ROW_SELECT });
      if (!existing) throw this.notWithheld();

      // Guarded delete: of two simultaneous clears exactly one removes the row.
      const { count } = await tx.guardianNoticeWithhold.deleteMany({ where: { userId } });
      if (count !== 1) throw this.notWithheld();

      await tx.adminActionLog.create({
        data: {
          adminId,
          action: ADMIN_ACTION_LOG_ACTIONS.USER_GUARDIAN_NOTICES_CLEARED,
          targetType: ADMIN_ACTION_LOG_TARGET_TYPES.USER,
          targetId: userId,
          notes: `was_set_by=${existing.setByAdmin.id}; was_set_at=${existing.setAt.toISOString()}; reason=${reason}`,
        },
      });
    });
    this.logger.log(`Admin ${adminId} cleared the guardian-notice withholding for user ${userId}.`);
    return { withheld: false };
  }

  async review(userId: string, adminId: string, rawNote: string): Promise<GuardianNoticesWithheld> {
    const note = this.cleanText(rawNote, 'A note');
    const now = this.clock.now();
    const row = await this.prisma.$transaction(async (tx) => {
      await this.assertUserExists(userId, tx);
      const { count } = await tx.guardianNoticeWithhold.updateMany({
        where: { userId },
        data: { lastReviewedAt: now, lastReviewNote: note },
      });
      if (count !== 1) throw this.notWithheld();
      const updated = await tx.guardianNoticeWithhold.findUniqueOrThrow({ where: { userId }, select: ROW_SELECT });

      await tx.adminActionLog.create({
        data: {
          adminId,
          action: ADMIN_ACTION_LOG_ACTIONS.USER_GUARDIAN_NOTICES_REVIEWED,
          targetType: ADMIN_ACTION_LOG_TARGET_TYPES.USER,
          targetId: userId,
          notes: `note=${note}`,
        },
      });
      return updated;
    });
    return this.toState(row) as GuardianNoticesWithheld;
  }

  // ---- helpers ----

  private toState(row: Row | null): GuardianNoticesState {
    if (!row) return { withheld: false };
    // Review basis (the Figma report's assumption, founder to confirm): the LATER of when the flag was set and when
    // it was last reviewed.
    const basis = row.lastReviewedAt && row.lastReviewedAt > row.setAt ? row.lastReviewedAt : row.setAt;
    const reviewDueAt = new Date(basis.getTime() + WITHHOLD_REVIEW_DUE_DAYS * DAY_MS);
    return {
      withheld: true,
      setAt: row.setAt.toISOString(),
      setBy: { id: row.setByAdmin.id, displayName: row.setByAdmin.fullName },
      reason: row.reason,
      lastReviewedAt: row.lastReviewedAt ? row.lastReviewedAt.toISOString() : null,
      lastReviewNote: row.lastReviewNote,
      reviewDueAt: reviewDueAt.toISOString(),
      reviewDue: reviewDueAt.getTime() <= this.clock.now().getTime(),
    };
  }

  // Trimmed, 10 to 1000 characters. The 400 carries a stable code.
  private cleanText(raw: string, what: string): string {
    const text = (typeof raw === 'string' ? raw : '').trim();
    if (text.length < WITHHOLD_TEXT_MIN_LENGTH || text.length > WITHHOLD_TEXT_MAX_LENGTH) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        code: GUARDIAN_NOTICES_TEXT_INVALID_CODE,
        message: `${what} of ${WITHHOLD_TEXT_MIN_LENGTH} to ${WITHHOLD_TEXT_MAX_LENGTH} characters is required.`,
      });
    }
    return text;
  }

  private async assertUserExists(userId: string, db: Pick<PrismaService, 'user'> = this.prisma): Promise<void> {
    const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException('User not found');
  }

  private alreadyWithheld(): ConflictException {
    return new ConflictException({
      statusCode: 409,
      error: 'Conflict',
      code: GUARDIAN_NOTICES_ALREADY_WITHHELD_CODE,
      message: 'Guardian notices are already withheld for this account.',
    });
  }

  private notWithheld(): ConflictException {
    return new ConflictException({
      statusCode: 409,
      error: 'Conflict',
      code: GUARDIAN_NOTICES_NOT_WITHHELD_CODE,
      message: 'Guardian notices are not withheld for this account.',
    });
  }
}
