import { applyDecorators, ExecutionContext, Injectable, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerException } from '@nestjs/throttler';
import { AuthThrottlerGuard } from '../rate-limit/auth-throttler.guard';
import { AUTH_THROTTLER_NAME } from '../rate-limit/rate-limit.constants';

// B-112 / B-225 (Decision Log #414 item 1, #403 item 15, #395 B3). The two
// guardian-withdrawal routes -- POST /auth/guardian-consent/withdraw/request and
// POST /auth/guardian-consent/withdraw -- get their own throttle instead of the
// module-wide 'auth' one (5 per 60 s): 5 attempts per 15 minutes, per client IP,
// with both numbers held in configuration.
//
// Both routes are credential-adjacent and one of them is destructive (it closes a
// child's account), so they should not be guessable or spammable. The limit is
// applied per route and per IP (the throttler's own key is class + handler +
// tracker), so a guardian who requests a link and then confirms it spends one
// attempt on each route, not two on one.
export const GUARDIAN_WITHDRAWAL_RATE_LIMIT_DEFAULT = 5;
export const GUARDIAN_WITHDRAWAL_RATE_LIMIT_WINDOW_MS_DEFAULT = 15 * 60 * 1000;

// The only text a throttled caller gets. Deliberately fixed and bare: no number
// of attempts, no window, no "try again in N minutes".
export const GUARDIAN_WITHDRAWAL_THROTTLE_MESSAGE = 'Too many attempts';

// Positive whole number from the environment, else the default. Read on every
// request (not once at import) so the value follows whatever ConfigModule loaded
// into process.env and a test can change it; a missing, zero, negative or
// non-numeric value falls back to the default instead of disabling the limit.
function positiveIntFromEnv(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export function guardianWithdrawalRateLimit(): number {
  return positiveIntFromEnv(process.env.GUARDIAN_WITHDRAWAL_RATE_LIMIT_MAX, GUARDIAN_WITHDRAWAL_RATE_LIMIT_DEFAULT);
}

export function guardianWithdrawalRateLimitWindowMs(): number {
  return positiveIntFromEnv(
    process.env.GUARDIAN_WITHDRAWAL_RATE_LIMIT_WINDOW_MS,
    GUARDIAN_WITHDRAWAL_RATE_LIMIT_WINDOW_MS_DEFAULT,
  );
}

// "Too many attempts" with no countdown. @nestjs/throttler would otherwise (a)
// say "ThrottlerException: Too Many Requests" and (b) send Retry-After and
// X-RateLimit-Reset headers, both of which tell the caller how long to wait.
// Overridden, not configured, because the header switch is per throttler name
// ('auth') and would change every other auth route too.
@Injectable()
export class GuardianWithdrawalThrottlerGuard extends AuthThrottlerGuard {
  protected getRequestResponse(context: ExecutionContext): { req: Record<string, any>; res: Record<string, any> } {
    const { req } = super.getRequestResponse(context);
    // handleRequest only ever calls res.header(...) on the response; give it one
    // that does nothing so no rate-limit header is written.
    return { req, res: { header: () => undefined } };
  }

  protected async throwThrottlingException(): Promise<void> {
    throw new ThrottlerException(GUARDIAN_WITHDRAWAL_THROTTLE_MESSAGE);
  }
}

// Replaces @AuthRateLimit() on the two withdrawal handlers (do not stack both:
// they would count each request twice). Limit and window are functions so they
// are resolved per request from configuration.
export function GuardianWithdrawalRateLimit() {
  return applyDecorators(
    UseGuards(GuardianWithdrawalThrottlerGuard),
    Throttle({
      [AUTH_THROTTLER_NAME]: {
        limit: () => guardianWithdrawalRateLimit(),
        ttl: () => guardianWithdrawalRateLimitWindowMs(),
      },
    }),
  );
}
