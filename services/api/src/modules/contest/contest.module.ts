import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminActionLogModule } from '../admin-action-log/admin-action-log.module';
import { AdminAuthFoundationModule } from '../admin/admin-auth-foundation.module';
import { AuthFoundationModule } from '../auth/auth-foundation.module';
import { FeedModule } from '../feed/feed.module';
import { ContestAdminController } from './contest-admin.controller';
import { ContestAdminService } from './contest-admin.service';
import { ContestExposureService } from './contest-exposure.service';
import { ContestLifecycleService } from './contest-lifecycle.service';
import { ContestReadModel } from './contest-read-model.service';
import { ContestVotingService } from './contest-voting.service';
import { ContestController } from './contest.controller';
import { ContestService } from './contest.service';

// backend/w7-contest (B-091) -- the self-running Contest. Decision Log #218/#219 built the first,
// admin-judged version; #381-#406 replaced its design. See README.md.
//
// Imports BOTH auth foundations (JwtAuthGuard / GuardianConsentGuard for the user routes,
// AdminJwtAuthGuard for the admin routes), FeedModule (the final entry's post is created through
// FeedService so it gets the same hashtag / points / validation path as any post) and
// AdminActionLogModule (create / edit are audited). The Europe/London calendar helper lives in
// contest-notifications/contest-calendar.util.ts and is reused as a plain import.
//
// ContestLifecycleService carries the @Cron job (ScheduleModule.forRoot() is registered once,
// globally, in app.module.ts). The clock comes from the global ClockModule.
@Module({
  imports: [AuthFoundationModule, AdminAuthFoundationModule, FeedModule, AdminActionLogModule],
  controllers: [ContestController, ContestAdminController],
  providers: [
    ContestService,
    ContestAdminService,
    ContestVotingService,
    ContestExposureService,
    ContestLifecycleService,
    ContestReadModel,
    PrismaService,
  ],
  exports: [ContestLifecycleService],
})
export class ContestModule {}
