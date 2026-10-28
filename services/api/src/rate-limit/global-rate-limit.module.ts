import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthFoundationModule } from '../modules/auth/auth-foundation.module';
import { TokenService } from '../modules/auth/token/token.service';
import {
  buildGlobalThrottlerOptions,
  createIdentityResolver,
  readGlobalRateLimitNumbers,
} from './global-rate-limit.config';
import { GlobalThrottlerGuard } from './global-throttler.guard';

// Global API rate limit. Storage is the throttler's default IN-MEMORY store, one per API process.
// MOVE TO REDIS WHEN RUNNING MORE THAN ONE API INSTANCE: with N instances behind a load balancer each
// keeps its own counters, so every limit is effectively N times looser. (Not done now: the platform
// runs a single instance per environment, and a Redis store would add a dependency on the hot path.)
//
// This module owns a ThrottlerModule of its own. Nest scopes that module's options and storage to
// this module, so the 'auth' throttler registered by AuthRateLimitModule never leaks into this guard.
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule, AuthFoundationModule],
      inject: [ConfigService, TokenService],
      useFactory: (config: ConfigService, tokens: TokenService) =>
        buildGlobalThrottlerOptions(
          readGlobalRateLimitNumbers({ get: (k) => config.get<string>(k) }),
          createIdentityResolver((t) => tokens.verifyAccessToken(t)),
        ),
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: GlobalThrottlerGuard }],
})
export class GlobalRateLimitModule {}
