import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthFoundationModule } from '../auth/auth-foundation.module';
import { RegistrationEmailService } from '../auth/registration/email/registration-email.service';
import { GuardianSecurityNoticeModule } from '../guardian-security-notice/guardian-security-notice.module';
import { AccountSuspensionService } from './account-suspension.service';

// backend/b291-suspension-on-report (B-291, Decision Log #485). The one suspend / reinstate path, imported by both
// AdminUsersModule (the user page) and ModerationModule (a report's user_suspended action and the overturn of its
// appeal). Sits below both so neither imports the other. RegistrationEmailService is provided directly, the same way
// the other modules outside auth/registration do it.
@Module({
  imports: [PrismaModule, ConfigModule, AuthFoundationModule, GuardianSecurityNoticeModule],
  providers: [AccountSuspensionService, RegistrationEmailService],
  exports: [AccountSuspensionService],
})
export class AccountSuspensionModule {}
