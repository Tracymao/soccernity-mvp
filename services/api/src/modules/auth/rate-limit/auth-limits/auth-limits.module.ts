import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '../../../../prisma/prisma.service';
import { RedisModule } from '../../../../redis/redis.module';
import { RegistrationEmailService } from '../../registration/email/registration-email.service';
import { AuthLimitsInterceptor } from './auth-limits.interceptor';
import { AuthLimitsService } from './auth-limits.service';
import { AuthLimitsStore } from './auth-limits.store';
import { LoginLockoutNotifier } from './login-lockout.notifier';

// Re-exported by AuthFoundationModule so every module that hosts one of the three @AuthLimit() routes
// (auth, registration, password-reset) can resolve the interceptor without importing this directly.
@Module({
  imports: [ConfigModule, RedisModule],
  // PrismaService and RegistrationEmailService are provided here directly, the same way every other module
  // outside auth/registration does it (age-reclassification, moderation), for the lockout notice.
  providers: [AuthLimitsStore, AuthLimitsService, AuthLimitsInterceptor, LoginLockoutNotifier, PrismaService, RegistrationEmailService],
  exports: [AuthLimitsStore, AuthLimitsService, AuthLimitsInterceptor],
})
export class AuthLimitsModule {}
