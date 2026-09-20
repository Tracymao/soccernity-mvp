import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RegistrationEmailService } from '../auth/registration/email/registration-email.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AgeReclassificationSweepService } from './age-reclassification-sweep.service';

// sprint-1/age-reclassification-sweep (Decision Log #349). No controller,
// same shape as AccountDeletionModule: it exists to register the @Cron job.
@Module({
  imports: [ConfigModule],
  providers: [AgeReclassificationSweepService, PrismaService, RegistrationEmailService],
  exports: [AgeReclassificationSweepService],
})
export class AgeReclassificationModule {}
