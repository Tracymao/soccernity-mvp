import { Module } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { GuardianConsentController } from './guardian-consent.controller';
import { GuardianConsentService } from './guardian-consent.service';

// Sprint 1 / PR B5 (Build Plan Section 4.1): POST /auth/guardian-consent.
// Self-contained, like AuthRegistrationModule/AuthModule/
// PasswordResetModule before it — no AuthFoundationModule import needed
// since this endpoint issues no tokens and touches no password/JWT
// machinery, just the Guardian row itself.
@Module({
  controllers: [GuardianConsentController],
  providers: [GuardianConsentService, PrismaService],
})
export class GuardianConsentModule {}
