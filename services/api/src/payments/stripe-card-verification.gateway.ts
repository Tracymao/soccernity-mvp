import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import StripeSdk = require('stripe');
import {
  CardVerificationGateway,
  VerificationIntent,
  VerificationIntentState,
} from './card-verification.gateway';

// Real gateway. "Wired but inactive" like S3StorageService/Postmark: with
// no real STRIPE_SECRET_KEY every call is a clear 503, so an in-scope
// guardian fails CLOSED (cannot complete consent) rather than being waved
// through. Only ever handles PaymentIntent/Refund REFERENCE ids -- log
// lines below carry ids and status strings only.
@Injectable()
export class StripeCardVerificationGateway extends CardVerificationGateway {
  private readonly logger = new Logger(StripeCardVerificationGateway.name);
  private readonly client?: StripeSdk.Stripe;
  private readonly publishable?: string;

  constructor(config: ConfigService) {
    super();
    const secret = config.get<string>('STRIPE_SECRET_KEY')?.trim();
    const publishable = config.get<string>('STRIPE_PUBLISHABLE_KEY')?.trim();
    const real = (v?: string) => Boolean(v) && v !== 'replace-me';
    if (!real(secret) || !real(publishable)) {
      this.logger.warn(
        '[payments] STRIPE_SECRET_KEY/STRIPE_PUBLISHABLE_KEY not set -- wired but inactive. ' +
          'Under-13 US guardian card verification will fail closed with a 503.',
      );
      return;
    }
    this.client = new StripeSdk(secret!);
    this.publishable = publishable;
  }

  private require(): StripeSdk.Stripe {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'Card verification is not available right now. Please try again later.',
      );
    }
    return this.client;
  }

  publishableKey(): string {
    this.require();
    return this.publishable!;
  }

  async createVerificationIntent(params: {
    amountCents: number;
    currency: string;
    receiptEmail: string;
    idempotencyKey: string;
    guardianId: string;
  }): Promise<VerificationIntent> {
    const stripe = this.require();
    const intent = await stripe.paymentIntents.create(
      {
        amount: params.amountCents,
        currency: params.currency,
        // Stripe emails the receipt to the account holder: this is the
        // "notification of each discrete transaction" the FTC-listed
        // method relies on.
        receipt_email: params.receiptEmail,
        automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
        description: 'Soccernity guardian verification (refunded immediately)',
        metadata: { purpose: 'guardian_verification', guardianId: params.guardianId },
      },
      { idempotencyKey: params.idempotencyKey },
    );
    if (!intent.client_secret) {
      throw new ServiceUnavailableException('Card verification is not available right now.');
    }
    return { id: intent.id, clientSecret: intent.client_secret };
  }

  async retrieveIntent(intentId: string): Promise<VerificationIntentState> {
    const stripe = this.require();
    const intent = await stripe.paymentIntents.retrieve(intentId, { expand: ['latest_charge'] });
    const charge = typeof intent.latest_charge === 'object' ? intent.latest_charge : null;
    return {
      id: intent.id,
      status: intent.status,
      amount: intent.amount,
      currency: intent.currency,
      refunded: Boolean(charge && charge.refunded),
    };
  }

  async refundIntent(intentId: string): Promise<void> {
    const stripe = this.require();
    await stripe.refunds.create({ payment_intent: intentId }, { idempotencyKey: `refund:${intentId}` });
    this.logger.log(`Refunded verification intent ${intentId}`);
  }
}
