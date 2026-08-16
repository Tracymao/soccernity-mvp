import { applyDecorators, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthThrottlerGuard } from './auth-throttler.guard';
import {
  AUTH_THROTTLER_NAME,
  DEFAULT_AUTH_RATE_LIMIT,
  DEFAULT_AUTH_RATE_LIMIT_WINDOW_MS,
} from './rate-limit.constants';

// Apply directly to the /auth/login and /auth/register handlers once they
// exist (B2/B3):
//
//   @AuthRateLimit()
//   @Post('login')
//   login(@Body() dto: LoginDto) { ... }
//
// Requires AuthRateLimitModule (or its exported ThrottlerModule) to be in
// the importing module's graph so AuthThrottlerGuard's dependencies
// resolve — see auth-foundation.module.ts.
export function AuthRateLimit(
  limit: number = DEFAULT_AUTH_RATE_LIMIT,
  windowMs: number = DEFAULT_AUTH_RATE_LIMIT_WINDOW_MS,
) {
  return applyDecorators(
    UseGuards(AuthThrottlerGuard),
    Throttle({ [AUTH_THROTTLER_NAME]: { limit, ttl: windowMs } }),
  );
}
