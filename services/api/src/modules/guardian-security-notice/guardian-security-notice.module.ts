import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { RedisModule } from '../../redis/redis.module';
import { RegistrationEmailService } from '../auth/registration/email/registration-email.service';
import { GuardianSecurityNoticeService } from './guardian-security-notice.service';

// backend/b275-guardian-security-notices. Deliberately imports no auth module: the auth limits module, the
// password-reset module, the auth controller and the two-factor module all import THIS, so it must sit below them.
// PrismaService and RegistrationEmailService are provided directly, the same way AuthLimitsModule and the other
// modules outside auth/registration do it.
@Module({
  imports: [PrismaModule, ConfigModule, RedisModule],
  providers: [GuardianSecurityNoticeService, RegistrationEmailService],
  exports: [GuardianSecurityNoticeService],
})
export class GuardianSecurityNoticeModule {}
