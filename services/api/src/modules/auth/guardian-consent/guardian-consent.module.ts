import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { PaymentsModule } from '../../../payments/payments.module';
import { AuthFoundationModule } from '../auth-foundation.module';
import { AuthModule } from '../auth.module';
import { RegistrationEmailService } from '../registration/email/registration-email.service';
import { CardRefundRetrySweepService } from './card-refund-retry-sweep.service';
import { GuardianCardVerificationService } from './guardian-card-verification.service';
import { GuardianConsentExpirySweepService } from './guardian-consent-expiry-sweep.service';
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
//
// sprint-1/f5-f6-missing-endpoints's GET /auth/guardian-consent/status
// also needs AuthFoundationModule -- for JwtAuthGuard's DI graph this
// time. Already imported here (for AuthThrottlerGuard above), so no new
// import was required.
//
// GuardianConsentService is exported (sprint-2/verify-email-consent-status-field,
// Decision Log #38) so AuthRegistrationModule can inject it and reuse
// getConsentStatusForUser() from POST /auth/verify-email, rather than
// RegistrationService re-querying Guardian and re-deriving consentStatus
// itself. This is the one deliberate exception to this module's own
// stated convention (above) of declaring a local PrismaService instead of
// cross-module DI -- that convention is about not duplicating
// PrismaService instances, not a rule against ever sharing a genuinely
// shared piece of business logic; duplicating the actual
// consent-status-computation logic a second time is exactly what Decision
// Log #38 asked this PR not to do. No circularity risk: this module does
// not import AuthRegistrationModule (or any module that does) -- it only
// reaches directly into registration/email/registration-email.service.ts
// for a single class, the same "own instance, no module import" pattern
// used elsewhere in this file.
//
// sprint-1/guardian-consent-decline-withdraw-expiry added two things:
//
//  - AuthModule is imported so GuardianConsentService can inject
//    AuthService and call startPendingDeletion() when consent is declined,
//    withdrawn, or lapses twice unanswered. This reuses the ONE primitive
//    that flips accountStatus to "pending_deletion" rather than writing a
//    parallel one, so AccountDeletionSweepService's existing 30-day
//    grace/hard-delete/cascade behaviour (Decision Log #42/#44) applies
//    unchanged. No circularity, verified against the real import graph
//    rather than assumed: AuthModule imports ONLY AuthFoundationModule,
//    and neither imports this module. AuthRegistrationModule -> this
//    module -> AuthModule -> AuthFoundationModule stays acyclic too.
//
//  - GuardianConsentExpirySweepService, the @Cron()-driven job that acts
//    on Guardian.consentTokenExpiresAt (which, before that PR, nothing
//    anywhere read). ScheduleModule.forRoot() is registered once globally
//    in app.module.ts — same as AccountDeletionModule's and
//    LeaderboardModule's own @Cron() jobs — so it is deliberately not
//    imported here. The sweep is intentionally NOT also exposed as an
//    HTTP endpoint, matching AccountDeletionSweepService's precedent: a
//    job whose end state is closing children's accounts has no business
//    being triggerable on demand. It stays directly callable in-process,
//    with an explicit `now`, for tests.
@Module({
  imports: [ConfigModule, AuthFoundationModule, AuthModule, PaymentsModule],
  controllers: [GuardianConsentController],
  providers: [
    GuardianConsentService,
    GuardianConsentExpirySweepService,
    GuardianCardVerificationService,
    CardRefundRetrySweepService,
    PrismaService,
    RegistrationEmailService,
  ],
  exports: [GuardianConsentService, GuardianConsentExpirySweepService],
})
export class GuardianConsentModule {}
