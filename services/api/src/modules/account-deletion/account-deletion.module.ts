import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { StorageModule } from '../../storage/storage.module';
import { RejectedMediaModule } from '../post-media/rejected-media.module';
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
  // RejectedMediaModule (B-283): the purge removes a purged user's leftover media objects, and registers the daily
  // deferred-deletion retry / stray sweep.
  imports: [PrismaModule, StorageModule, RejectedMediaModule],
  providers: [AccountDeletionSweepService, AnonymizedRowPurgeService],
  exports: [AccountDeletionSweepService, AnonymizedRowPurgeService],
})
export class AccountDeletionModule {}
