import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminAuthFoundationModule } from '../admin/admin-auth-foundation.module';
import { AuthFoundationModule } from '../auth/auth-foundation.module';
import { AdminModerationController } from './admin-moderation.controller';
import { ModerationService } from './moderation.service';
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
@Module({
  imports: [AuthFoundationModule, AdminAuthFoundationModule],
  controllers: [ReportsController, AdminModerationController],
  providers: [ModerationService, PrismaService],
})
export class ModerationModule {}
