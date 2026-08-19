import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthFoundationModule } from '../auth-foundation.module';
import { RegistrationEmailService } from '../registration/email/registration-email.service';
import { GuardianConsentController } from './guardian-consent.controller';
import { GuardianConsentService } from './guardian-consent.service';

// Sprint 1 / PR B5 (Build Plan Section 4.1): POST /auth/guardian-consent.
// Self-contained, like AuthRegistrationModule/AuthModule/
// PasswordResetModule before it.
//
// DPIA finding R5 (docs/sprint-1-dpia-outline-draft.md) added
// POST /auth/guardian-consent/resend, which needs AuthFoundationModule
// for AuthThrottlerGuard's DI graph (@AuthRateLimit(), same as
// password-reset's forgotPassword()) -- the resend path also reuses
// RegistrationEmailService.sendGuardianConsentEmail (PR B2 / PR #33's
// Postmark wiring) rather than duplicating email-sending logic, so it's
// declared here as its own provider too. AuthRegistrationModule doesn't
// export RegistrationEmailService, but every module in this codebase
// already declares its own local PrismaService instance rather than
// importing one via cross-module export (see registration.module.ts,
// password-reset.module.ts, users.module.ts) -- this follows the same
// established convention rather than introducing a new cross-module
// coupling.
@Module({
  imports: [ConfigModule, AuthFoundationModule],
  controllers: [GuardianConsentController],
  providers: [GuardianConsentService, PrismaService, RegistrationEmailService],
})
export class GuardianConsentModule {}
