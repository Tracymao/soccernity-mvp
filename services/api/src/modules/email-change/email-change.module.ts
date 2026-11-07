import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthFoundationModule } from '../auth/auth-foundation.module';
import { RegistrationEmailService } from '../auth/registration/email/registration-email.service';
import { GuardianSecurityNoticeModule } from '../guardian-security-notice/guardian-security-notice.module';
import { TwoFactorModule } from '../two-factor/two-factor.module';
import { EmailChangeController } from './email-change.controller';
import { EmailChangeLimiter } from './email-change.limiter';
import { EmailChangeService } from './email-change.service';

// backend/email-change (B-059; Decision Log #472 adopted default (f)). Dependencies point one way: this module
// imports AuthFoundationModule (guards, PasswordService, TokenService, the shared limiter store), TwoFactorModule
// (the sign-in code check) and GuardianSecurityNoticeModule; nothing imports it back.
@Module({
  imports: [PrismaModule, ConfigModule, AuthFoundationModule, TwoFactorModule, GuardianSecurityNoticeModule],
  controllers: [EmailChangeController],
  // PrismaService and RegistrationEmailService are provided directly, the way every module outside
  // auth/registration does it.
  providers: [RegistrationEmailService, EmailChangeLimiter, EmailChangeService],
})
export class EmailChangeModule {}
