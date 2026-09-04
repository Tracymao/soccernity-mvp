import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthRateLimitModule } from '../auth/rate-limit/rate-limit.module';
import { AdminAuthFoundationModule } from './admin-auth-foundation.module';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { AdminProfileController } from './admin-profile.controller';
import { AdminProfileService } from './admin-profile.service';

// Sprint 2 / sprint-2/admin-console-account-entity (Decision Log #54) —
// Admin Console account/auth/profile slice only. See README.md in this
// directory for what this covers vs. what's still Sprint 5 (Build Plan
// Section 4.8's moderation-queue endpoints).
//
// AuthRateLimitModule is imported here so AdminAuthController's login
// handler can reuse @AuthRateLimit() (see that controller's own comment).
// This is the exact same "import the shared, generic rate-limit module a
// second time" pattern RedisModule already has three precedents for in
// this codebase (auth-foundation.module.ts, password-reset.module.ts,
// registration.module.ts) — AuthRateLimitModule is a static (non-dynamic)
// module class, so Nest deduplicates it to the one shared registration
// already wired into AuthFoundationModule, rather than re-registering
// @nestjs/throttler's own @Global() ThrottlerModule a second time.
//
// PrismaService is provided directly here (not from a shared
// PrismaModule) because no such shared module exists yet — every other
// top-level module in this codebase (AuthModule, FeedModule, etc.) does
// the same thing today.
@Module({
  imports: [AdminAuthFoundationModule, AuthRateLimitModule],
  controllers: [AdminAuthController, AdminProfileController],
  providers: [AdminAuthService, AdminProfileService, PrismaService],
})
export class AdminModule {}
