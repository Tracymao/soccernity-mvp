import { ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { ThrottlerException, ThrottlerGuard, ThrottlerLimitDetail } from '@nestjs/throttler';
import { SKIP_GLOBAL_RATE_LIMIT_KEY } from './global-rate-limit.constants';

// Registered once as APP_GUARD (global-rate-limit.module.ts). Its options come ONLY from that
// module's own ThrottlerModule, so the named 'auth' throttler (5 per 60 s) of AuthRateLimitModule
// is never in its option list and never applies here.
//
// Differences from the stock ThrottlerGuard:
//   - FAILS OPEN: any error that is not the 429 itself (storage, tracker, token handling) is logged
//     and the request proceeds. A broken limiter must never take the site down.
//   - 429 carries a plain `Retry-After` header (seconds). The stock guard would send
//     `Retry-After-<throttler name>` because several named throttlers are configured.
//   - Honours @SkipGlobalRateLimit() on a handler or controller.
@Injectable()
export class GlobalThrottlerGuard extends ThrottlerGuard {
  private readonly logger = new Logger(GlobalThrottlerGuard.name);
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

  // At most one log line a minute: a limiter that is down would otherwise log on every request.
  private logFailOpen(err: unknown): void {
    const now = Date.now();
    if (now - this.lastFailOpenLogAt < 60_000) return;
    this.lastFailOpenLogAt = now;
    this.logger.error(
      `Global rate limiter failed; letting the request through (fail open): ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
