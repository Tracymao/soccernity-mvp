import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { RedisModule } from '../../redis/redis.module';
import { AuthFoundationModule } from '../auth/auth-foundation.module';
import { RegistrationEmailService } from '../auth/registration/email/registration-email.service';
import { GuardianSecurityNoticeModule } from '../guardian-security-notice/guardian-security-notice.module';
import { TwoFactorRecoveryController } from './recovery/two-factor-recovery.controller';
import { TwoFactorRecoverySweepService } from './recovery/two-factor-recovery-sweep.service';
import { TwoFactorRecoveryService } from './recovery/two-factor-recovery.service';
import { TwoFactorAttemptLimiter } from './two-factor-attempt.limiter';
import { TwoFactorLockInterceptor } from './two-factor-lock.interceptor';
import { TwoFactorPendingStore } from './two-factor-pending.store';
import { TwoFactorTokenStore } from './two-factor-token.store';
import { AdminTwoFactorRepository, UserTwoFactorRepository } from './two-factor.repository';
import { TwoFactorService } from './two-factor.service';
import { UserTwoFactorController } from './user-two-factor.controller';

// backend/b086-two-factor (B-086, B-270; Decision Log #446). The authenticator-app (TOTP) two-factor core, shared by
// the user and admin auth domains: the service, the Redis stores (sign-in challenges, pending secrets, the wrong-code
// limiter) and the two repositories. Only the USER settings controller lives here; the admin settings controller
// lives in AdminModule (it needs AdminJwtAuthGuard, and this module must not import the admin auth domain).
//
// Dependencies point one way: AuthModule, AdminModule and AdminStaffRolesModule import THIS module; it imports
// AuthFoundationModule (JwtAuthGuard, PasswordService, AuthRateLimitModule) and nothing that imports it back.
// CryptoModule (DobEncryptionService) is global.
//
// B-276 adds the USER recovery flow (./recovery/): its controller (no sign-in guard: the person cannot sign in),
// service and hourly sweep. AuthService imports TwoFactorRecoveryService from here for the two sign-in hooks; the
// recovery service itself imports nothing from AuthService, so there is no cycle.
@Module({
  imports: [PrismaModule, ConfigModule, RedisModule, AuthFoundationModule, GuardianSecurityNoticeModule],
  controllers: [UserTwoFactorController, TwoFactorRecoveryController],
  providers: [
    UserTwoFactorRepository,
    AdminTwoFactorRepository,
    TwoFactorTokenStore,
    TwoFactorPendingStore,
    TwoFactorAttemptLimiter,
    TwoFactorLockInterceptor,
    TwoFactorService,
    // B-276 (recovery): RegistrationEmailService is provided directly, the way every module outside
    // auth/registration does it.
    RegistrationEmailService,
    TwoFactorRecoveryService,
    TwoFactorRecoverySweepService,
  ],
  exports: [TwoFactorService, TwoFactorLockInterceptor, TwoFactorRecoveryService],
})
export class TwoFactorModule {}
