import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Guardian } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { CardVerificationGateway } from '../../../payments/card-verification.gateway';

// sprint-1/coppa-card-verification.
//
// A technical control, NOT a legal conclusion: it does not make Soccernity
// "COPPA compliant" and Decision Log #4 stays open. It adds the FTC-listed
// "monetary transaction" verification step (a small card charge that
// notifies the account holder) for the guardian of a child who is under 13
// and US/undeclared -- on top of, never instead of, the emailed link.
//
// Stripe pattern: a real PaymentIntent for a small amount (default 50
// cents, Stripe's USD minimum) + receipt_email to the guardian, refunded
// as soon as it succeeds. A SetupIntent / $0 authorisation was rejected:
// it produces no discrete transaction and no receipt, which is the very
// thing the FTC method leans on; the charge-then-refund still leaves a
// transaction and a receipt for the account holder. No funds are retained.
//
// Card data: the guardian types the card into Stripe's own Elements iframe;
// only a PaymentIntent REFERENCE id ever reaches or is stored here. This
// class has no parameter that could carry card data, and nothing it logs or
// writes is anything but ids, statuses and timestamps.
export const DEFAULT_VERIFICATION_AMOUNT_CENTS = 50;
const VERIFICATION_CURRENCY = 'usd';

export interface CardVerificationRequirements {
  cardRequired: boolean;
  cardVerified: boolean;
}

@Injectable()
export class GuardianCardVerificationService {
  private readonly logger = new Logger(GuardianCardVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly gateway: CardVerificationGateway,
  ) {}

  private amountCents(): number {
    const n = Number(this.config.get<string>('COPPA_VERIFICATION_AMOUNT_CENTS'));
    return Number.isInteger(n) && n >= DEFAULT_VERIFICATION_AMOUNT_CENTS ? n : DEFAULT_VERIFICATION_AMOUNT_CENTS;
  }

  // Same generic rejection confirmConsent uses: unknown / rotated / expired
  // tokens are indistinguishable to the caller.
  private async loadPendingGuardian(consentToken: string): Promise<Guardian> {
    const guardian = await this.prisma.guardian.findUnique({ where: { consentToken } });
    if (!guardian || guardian.consentTokenExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Invalid or expired consent token');
    }
    if (guardian.consentStatus !== 'pending') {
      throw new BadRequestException('This consent request is no longer awaiting verification.');
    }
    return guardian;
  }

  async getRequirements(consentToken: string): Promise<CardVerificationRequirements> {
    const guardian = await this.loadPendingGuardian(consentToken);
    return {
      cardRequired: guardian.cardVerificationRequired,
      cardVerified: guardian.cardVerifiedAt !== null,
    };
  }

  async createIntent(consentToken: string): Promise<{ clientSecret: string; publishableKey: string }> {
    const guardian = await this.loadPendingGuardian(consentToken);
    if (!guardian.cardVerificationRequired) {
      throw new BadRequestException('Card verification is not required for this account.');
    }
    if (guardian.cardVerifiedAt) {
      throw new BadRequestException('Card verification has already been completed.');
    }

    // Idempotent per guardian + token generation: a retry after a declined
    // card returns the SAME intent (still requires_payment_method), so the
    // guardian can try another card without spawning intents.
    const intent = await this.gateway.createVerificationIntent({
      amountCents: this.amountCents(),
      currency: VERIFICATION_CURRENCY,
      receiptEmail: guardian.email,
      idempotencyKey: `guardian-verification:${guardian.id}:${guardian.consentTokenExpiresAt.getTime()}`,
      guardianId: guardian.id,
    });
    if (guardian.stripePaymentIntentId !== intent.id) {
      await this.prisma.guardian.update({
        where: { id: guardian.id },
        data: { stripePaymentIntentId: intent.id },
      });
    }
    return { clientSecret: intent.clientSecret, publishableKey: this.gateway.publishableKey() };
  }

  // Called by the browser after Stripe.js confirms the payment. The server
  // never trusts the client's say-so: it re-reads the intent from Stripe.
  // Safe to call repeatedly -- if the charge succeeded but the refund failed
  // last time, a retry re-attempts only the refund.
  async complete(consentToken: string): Promise<CardVerificationRequirements> {
    const guardian = await this.loadPendingGuardian(consentToken);
    if (!guardian.cardVerificationRequired || !guardian.stripePaymentIntentId) {
      throw new BadRequestException('No card verification is in progress for this account.');
    }

    const intent = await this.gateway.retrieveIntent(guardian.stripePaymentIntentId);
    if (
      intent.status !== 'succeeded' ||
      intent.amount !== this.amountCents() ||
      intent.currency !== VERIFICATION_CURRENCY
    ) {
      throw new BadRequestException('Card verification was not completed. Please try again.');
    }

    if (!guardian.cardVerifiedAt) {
      await this.prisma.guardian.update({ where: { id: guardian.id }, data: { cardVerifiedAt: new Date() } });
    }

    if (!guardian.cardRefundedAt) {
      if (!intent.refunded) {
        // A failure here propagates so the guardian's retry re-attempts the
        // refund; verification itself is already recorded above.
        await this.gateway.refundIntent(intent.id);
      }
      await this.prisma.guardian.update({ where: { id: guardian.id }, data: { cardRefundedAt: new Date() } });
    }

    this.logger.log(`Card verification completed for guardian ${guardian.id} (intent ${intent.id})`);
    return { cardRequired: true, cardVerified: true };
  }
}
