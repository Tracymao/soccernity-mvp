import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ContestNotificationFacts } from './contest-notification-facts.service';
import { ContestNotificationSweepService } from './contest-notification-sweep.service';

// backend/w3c-contest-notifications (B-122). No controller: it exists to register the @Cron job
// (ScheduleModule.forRoot() is registered once, globally, in app.module.ts), the same shape as
// AccountDeletionModule / AgeReclassificationModule. See README.md.
@Module({
  providers: [ContestNotificationSweepService, ContestNotificationFacts, PrismaService],
  exports: [ContestNotificationSweepService],
})
export class ContestNotificationsModule {}
