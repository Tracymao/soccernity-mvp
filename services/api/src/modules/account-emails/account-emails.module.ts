import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { RegistrationEmailService } from '../auth/registration/email/registration-email.service';
import { AccountEmailService } from './account-email.service';

// backend/b069-transactional-emails. Deliberately imports no auth module: AuthModule, PasswordResetModule,
// RegistrationModule and GuardianConsentModule all import THIS, so it sits below them (the same placement
// GuardianSecurityNoticeModule has). PrismaService and RegistrationEmailService are provided directly, the way
// every module outside auth/registration does it.
@Module({
  imports: [PrismaModule, ConfigModule],
  providers: [AccountEmailService, RegistrationEmailService],
  exports: [AccountEmailService],
})
export class AccountEmailsModule {}
