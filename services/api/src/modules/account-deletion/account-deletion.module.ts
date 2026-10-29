import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageModule } from '../../storage/storage.module';
import { AccountDeletionSweepService } from './account-deletion-sweep.service';
import { AnonymizedRowPurgeService } from './anonymized-row-purge.service';

// sprint-2/account-deletion-sweep — Build Plan Section 9, Decision Log
// #42. No controller: this module exists purely to register the
// scheduled sweep (see account-deletion-sweep.service.ts's own comment
// on why this is deliberately not also a manually-triggered endpoint).
// ScheduleModule.forRoot() itself is registered once, globally, in
// app.module.ts — @Cron() decorators anywhere in the app need it, so it
// doesn't belong to this module specifically.
@Module({
  // StorageModule: lets anonymizeUser remove the user's avatar object (B-035).
  imports: [StorageModule],
  providers: [AccountDeletionSweepService, AnonymizedRowPurgeService, PrismaService],
  exports: [AccountDeletionSweepService, AnonymizedRowPurgeService],
})
export class AccountDeletionModule {}
