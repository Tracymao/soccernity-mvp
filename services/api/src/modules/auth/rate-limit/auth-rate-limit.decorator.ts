import { applyDecorators, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthThrottlerGuard } from './auth-throttler.guard';
import { AUTH_THROTTLER_NAME } from './rate-limit.constants';

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
//
// Bare @AuthRateLimit() applies ONLY the guard, with no @Throttle()
// override — that's deliberate, not an oversight. Every real call site
// (register, login, forgot-password, guardian-consent/resend) wants the
// module-level, env-driven config that AuthRateLimitModule's
// ThrottlerModule.forRootAsync() reads from AUTH_RATE_LIMIT_MAX /
// AUTH_RATE_LIMIT_WINDOW_MS (rate-limit.module.ts). A previous version
// of this decorator applied DEFAULT_AUTH_RATE_LIMIT /
// DEFAULT_AUTH_RATE_LIMIT_WINDOW_MS as its own default parameters and
// always emitted a per-route @Throttle() override — since NestJS's
// Throttler gives a route-level @Throttle() override priority over the
// module-level named-throttler config, that meant every real call site
// silently ignored AUTH_RATE_LIMIT_MAX / AUTH_RATE_LIMIT_WINDOW_MS
// regardless of what was configured, always enforcing the hardcoded
// defaults instead. An explicit override is now opt-in via the
// `override` param, not the default path — pass one only if a specific
// route genuinely needs a limit different from the shared auth default.
export function AuthRateLimit(override?: { limit: number; windowMs: number }) {
  return override
    ? applyDecorators(
        UseGuards(AuthThrottlerGuard),
        Throttle({ [AUTH_THROTTLER_NAME]: { limit: override.limit, ttl: override.windowMs } }),
      )
    : UseGuards(AuthThrottlerGuard);
}
