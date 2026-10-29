import { ExecutionContext, Inject, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as Sentry from '@sentry/nestjs';
import {
  ThrottlerException,
  ThrottlerGuard,
  ThrottlerLimitDetail,
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from '@nestjs/throttler';
import { SKIP_GLOBAL_RATE_LIMIT_KEY } from './global-rate-limit.constants';

// Registered once as APP_GUARD (global-rate-limit.module.ts). Its options and storage are injected
// under PRIVATE tokens (not the @Global ThrottlerModule's), so the named 'auth' throttler (5 per 60 s)
// of AuthRateLimitModule is never in its option list and never applies here.
//
// Differences from the stock ThrottlerGuard:
//   - FAILS OPEN: any error that is not the 429 itself (storage, tracker, token handling) is logged
//     and the request proceeds. A broken limiter must never take the site down.
//   - 429 carries a plain `Retry-After` header (seconds). The stock guard would send
//     `Retry-After-<throttler name>` because several named throttlers are configured.
//   - Honours @SkipGlobalRateLimit() on a handler or controller.
export const GLOBAL_THROTTLER_OPTIONS = Symbol('GLOBAL_THROTTLER_OPTIONS');
export const GLOBAL_THROTTLER_STORAGE = Symbol('GLOBAL_THROTTLER_STORAGE');

@Injectable()
export class GlobalThrottlerGuard extends ThrottlerGuard {
  constructor(
    @Inject(GLOBAL_THROTTLER_OPTIONS) options: ThrottlerModuleOptions,
    @Inject(GLOBAL_THROTTLER_STORAGE) storageService: ThrottlerStorage,
    reflector: Reflector,
  ) {
    super(options, storageService, reflector);
  }

  private readonly failOpenLogger = new Logger(GlobalThrottlerGuard.name);
  private lastFailOpenLogAt = 0;

  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    return (
      this.reflector.getAllAndOverride<boolean>(SKIP_GLOBAL_RATE_LIMIT_KEY, [context.getHandler(), context.getClass()]) === true
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      return await super.canActivate(context);
    } catch (err) {
      if (err instanceof ThrottlerException) throw err;
      this.logFailOpen(err);
      return true;
    }
  }

  protected async throwThrottlingException(context: ExecutionContext, detail: ThrottlerLimitDetail): Promise<void> {
    const { res } = this.getRequestResponse(context);
    // timeToBlockExpire is whole seconds until the caller may try again; never below 1.
    res?.header?.('Retry-After', String(Math.max(1, Math.ceil(detail.timeToBlockExpire))));
    // Same body shape as every other throttled route: { statusCode: 429, message: 'ThrottlerException: Too Many Requests' }.
    throw new ThrottlerException(await this.getErrorMessage(context, detail));
  }

  // At most one log line AND one Sentry report a minute: a limiter that is down would otherwise do both on
  // every request. The Sentry event is tagged rate_limiter=global so it is easy to alert on; it is a no-op
  // while SENTRY_DSN is a placeholder. Reporting must never break a request.
  private logFailOpen(err: unknown): void {
    const now = Date.now();
    if (now - this.lastFailOpenLogAt < 60_000) return;
    this.lastFailOpenLogAt = now;
    this.failOpenLogger.error(
      `Global rate limiter failed; letting the request through (fail open): ${err instanceof Error ? err.message : String(err)}`,
    );
    try {
      Sentry.captureException(err, { tags: { rate_limiter: 'global' } });
    } catch {
      // ignore
    }
  }
}
