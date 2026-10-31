import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisModule } from '../../redis/redis.module';
import { AuthFoundationModule } from '../auth/auth-foundation.module';
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
@Module({
  imports: [ConfigModule, RedisModule, AuthFoundationModule],
  controllers: [UserTwoFactorController],
  providers: [
    PrismaService,
    UserTwoFactorRepository,
    AdminTwoFactorRepository,
    TwoFactorTokenStore,
    TwoFactorPendingStore,
    TwoFactorAttemptLimiter,
    TwoFactorLockInterceptor,
    TwoFactorService,
  ],
  exports: [TwoFactorService, TwoFactorLockInterceptor],
})
export class TwoFactorModule {}
