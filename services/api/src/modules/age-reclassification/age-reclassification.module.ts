import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AgeReclassificationSweepService } from './age-reclassification-sweep.service';

// sprint-1/age-reclassification-sweep (Decision Log #349). No controller,
// same shape as AccountDeletionModule: it exists to register the @Cron job.
@Module({
  providers: [AgeReclassificationSweepService, PrismaService],
  exports: [AgeReclassificationSweepService],
})
export class AgeReclassificationModule {}
