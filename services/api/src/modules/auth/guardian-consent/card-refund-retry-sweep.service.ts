import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import { GuardianCardVerificationService } from './guardian-card-verification.service';

export interface CardRefundRetrySweepResult {
  refundedGuardianIds: string[];
  failedGuardianIds: string[];
}

// sprint-1/card-refund-retry-sweep -- closes the gap
// sprint-1/coppa-card-verification's report flagged.
//
// GuardianCardVerificationService.complete() records cardVerifiedAt BEFORE
// it attempts the refund, and a failed refund only gets retried if the
// guardian happens to call complete() again. A guardian who closes the tab
// leaves Soccernity holding a charge it never meant to keep, against the
// "no funds are retained" design goal. This sweep finds every row where the
// charge succeeded but the refund was never recorded and retries it through
// the SAME refund path complete() uses (refundAndRecord), not a copy.
//
// Deliberately NOT filtered on consentStatus or token expiry: the money is
// owed back whether the guardian went on to confirm, decline, or lapse.
//
// Hourly, matching GuardianConsentExpirySweepService: a cheap query over a
// tiny set (only under-13 US guardians who were charged and not refunded),
// and a stranded charge should not sit for a day.
//
// No retry cap for v1 (founder-approved tradeoff): a fixed small charge that
// needs a few cycles is acceptable. A row that keeps failing (e.g. the
// guardian's card was closed) is logged at error level with its id every
// hour, so it is visible in logs rather than silent; there is no alerting.
@Injectable()
export class CardRefundRetrySweepService {
  private readonly logger = new Logger(CardRefundRetrySweepService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cardVerification: GuardianCardVerificationService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async runHourlySweep(): Promise<void> {
    const result = await this.sweepUnrefundedCharges();
    // Logged unconditionally, like the other sweeps, so "ran, found none"
    // is distinguishable from "never ran".
    this.logger.log(
      `Card refund retry sweep complete: refunded=${result.refundedGuardianIds.length} ` +
        `failed=${result.failedGuardianIds.length}`,
    );
  }

  async sweepUnrefundedCharges(): Promise<CardRefundRetrySweepResult> {
    const rows = await this.prisma.guardian.findMany({
      where: {
        cardVerifiedAt: { not: null },
        cardRefundedAt: null,
        // Always set once cardVerifiedAt is (complete() reads it), but the
        // column is nullable and a refund is impossible without it.
        stripePaymentIntentId: { not: null },
      },
      select: { id: true, stripePaymentIntentId: true },
    });

    const refundedGuardianIds: string[] = [];
    const failedGuardianIds: string[] = [];

    for (const row of rows) {
      const intentId = row.stripePaymentIntentId as string;
      try {
        await this.cardVerification.retryRefund(row.id, intentId);
        refundedGuardianIds.push(row.id);
        this.logger.log(`Card refund retry: refunded stranded charge for guardian ${row.id} (intent ${intentId})`);
      } catch (err) {
        // One guardian's failure must not block the rest.
        failedGuardianIds.push(row.id);
        this.logger.error(
          `Card refund retry: FAILED for guardian ${row.id} (intent ${intentId}): ` +
            `${(err as Error).message}. Will retry next run.`,
        );
      }
    }

    return { refundedGuardianIds, failedGuardianIds };
  }
}
