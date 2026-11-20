import { INestApplication } from '@nestjs/common';
import { AUTH_LIMIT_DEFAULTS as D } from '../src/modules/auth/rate-limit/auth-limits/auth-limits.constants';
import { RedisService } from '../src/redis/redis.service';

// B-256 (auth limits for shared school and club networks). test/env.ts relaxes every one of these for the whole
// Jest e2e layer, because the counters live in Redis, which every spec file shares and which outlives a run. A
// spec that exists to PROVE a limit calls applyRealAuthLimits() in beforeAll (before it builds the app: the
// numbers are read when the app is constructed) and the returned function in afterAll.
const REAL: Record<string, string> = {
  AUTH_SIGNUP_RATE_LIMIT_MAX: String(D.signupMax),
  AUTH_SIGNUP_RATE_LIMIT_WINDOW_MS: String(D.signupWindowMs),
  AUTH_LOGIN_FAILED_ATTEMPTS_MAX: String(D.loginFailedMax),
  AUTH_LOGIN_FAILED_ATTEMPTS_WINDOW_MS: String(D.loginFailedWindowMs),
  AUTH_LOGIN_ACCOUNT_CEILING_MAX: String(D.accountCeilingMax),
  AUTH_LOGIN_ACCOUNT_CEILING_WINDOW_MS: String(D.accountCeilingWindowMs),
  AUTH_IP_CEILING_MAX: String(D.ipCeilingMax),
  AUTH_IP_CEILING_WINDOW_MS: String(D.ipCeilingWindowMs),
  AUTH_FORGOT_PASSWORD_EMAIL_MAX: String(D.forgotEmailMax),
  AUTH_FORGOT_PASSWORD_EMAIL_WINDOW_MS: String(D.forgotEmailWindowMs),
};

export function applyRealAuthLimits(): () => void {
  const before: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(REAL)) {
    before[k] = process.env[k];
    process.env[k] = v;
  }
  return () => {
    for (const [k, v] of Object.entries(before)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
}

// Removes every auth-limit counter, so a spec starts from a clean budget even if an earlier run left some
// behind (they live 10-60 minutes).
export async function clearAuthLimitCounters(app: INestApplication): Promise<string[]> {
  const redis = app.get(RedisService);
  const keys = await redis.keys('auth-limit:*');
  if (keys.length > 0) await redis.del(...keys);
  return keys;
}

export async function authLimitKeys(app: INestApplication): Promise<string[]> {
  return app.get(RedisService).keys('auth-limit:*');
}
