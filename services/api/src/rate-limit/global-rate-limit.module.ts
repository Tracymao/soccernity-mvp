import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModuleOptions, ThrottlerStorageService } from '@nestjs/throttler';
import { AuthFoundationModule } from '../modules/auth/auth-foundation.module';
import { TokenService } from '../modules/auth/token/token.service';
import {
  buildGlobalThrottlerOptions,
  createIdentityResolver,
  readGlobalRateLimitNumbers,
} from './global-rate-limit.config';
import { GLOBAL_THROTTLER_OPTIONS, GLOBAL_THROTTLER_STORAGE, GlobalThrottlerGuard } from './global-throttler.guard';

// Global API rate limit. Storage is an IN-MEMORY store, one per API process.
// MOVE TO REDIS WHEN RUNNING MORE THAN ONE API INSTANCE: with N instances behind a load balancer each
// keeps its own counters, so every limit is effectively N times looser. (Not done now: the platform
// runs a single instance per environment, and a Redis store would add a dependency on the hot path.)
//
// This module does NOT use ThrottlerModule. That module is @Global(), so its options and storage tokens
// are shared across the whole app: registering a second one here made the 'auth' guards pick up THESE
// options (found by the e2e suite: with the e2e limits at 1,000,000 the 5-per-60 s auth routes stopped
// limiting). The guard gets its options and its storage under private tokens instead, so the named 'auth'
// throttler of AuthRateLimitModule and this one never see each other.
@Module({
  imports: [ConfigModule, AuthFoundationModule],
  providers: [
    {
      provide: GLOBAL_THROTTLER_OPTIONS,
      inject: [ConfigService, TokenService],
      useFactory: (config: ConfigService, tokens: TokenService): ThrottlerModuleOptions =>
        buildGlobalThrottlerOptions(
          readGlobalRateLimitNumbers({ get: (k) => config.get<string>(k) }),
          createIdentityResolver((t) => tokens.verifyAccessToken(t)),
        ),
    },
    // Own in-memory store; Nest runs its shutdown hook, which clears its timers.
    { provide: GLOBAL_THROTTLER_STORAGE, useClass: ThrottlerStorageService },
    { provide: APP_GUARD, useClass: GlobalThrottlerGuard },
  ],
})
export class GlobalRateLimitModule {}
