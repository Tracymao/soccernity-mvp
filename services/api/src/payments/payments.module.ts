import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CardVerificationGateway } from './card-verification.gateway';
import { StripeCardVerificationGateway } from './stripe-card-verification.gateway';

// Thin infra module (StorageModule's shape). Stripe is the proposed default
// processor; swapping it means providing a different CardVerificationGateway.
@Module({
  imports: [ConfigModule],
  providers: [{ provide: CardVerificationGateway, useClass: StripeCardVerificationGateway }],
  exports: [CardVerificationGateway],
})
export class PaymentsModule {}
