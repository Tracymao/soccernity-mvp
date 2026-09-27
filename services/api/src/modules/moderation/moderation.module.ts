import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminAuthFoundationModule } from '../admin/admin-auth-foundation.module';
import { AuthFoundationModule } from '../auth/auth-foundation.module';
import { RegistrationEmailService } from '../auth/registration/email/registration-email.service';
import { AuthRateLimitModule } from '../auth/rate-limit/rate-limit.module';
import { AdminModerationController } from './admin-moderation.controller';
import { ModerationService } from './moderation.service';
import { PublicReportsController } from './public-reports.controller';
import { ReportsController } from './reports.controller';

// sprint-5/admin-moderation-queue-backend — Build Plan Section 4.8
// (Admin Service) + Section 8.4 (Moderation & appeals workflow). A
// dedicated top-level module, deliberately NOT folded into AdminModule
// (which stays scoped to Admin Console account/auth/profile — see
// admin/README.md) — this module's two user-facing routes
// (POST /reports, POST /reports/:id/appeal) are JwtAuthGuard-gated, a
// completely different auth domain than the admin-facing
// GET/PATCH /admin/moderation/reports* routes this same module also
// serves. One ModerationService, one Report model, two controllers on
// two different guard domains — the exact "a module needs guards from
// more than one auth domain" shape ContestModule already established
// (see contest.module.ts's own comment); imports BOTH foundation
// modules the same way.
// feat/public-report-submission added PublicReportsController
// (POST /reports/public) — AuthRateLimitModule is imported for its
// @AuthRateLimit() decorator (same "import the shared, generic
// rate-limit module a third time" pattern admin.module.ts's own comment
// already describes), and RegistrationEmailService/ConfigModule are
// added so ModerationService can send the public reporter an
// acknowledgment email via the same abstraction the registration/
// guardian-consent flows already use (see
// age-reclassification.module.ts for the identical shape — a module
// outside auth/registration providing RegistrationEmailService directly
// rather than a dedicated email module, since none exists).
@Module({
  imports: [AuthFoundationModule, AdminAuthFoundationModule, AuthRateLimitModule, ConfigModule],
  controllers: [ReportsController, PublicReportsController, AdminModerationController],
  providers: [ModerationService, PrismaService, RegistrationEmailService],
})
export class ModerationModule {}
