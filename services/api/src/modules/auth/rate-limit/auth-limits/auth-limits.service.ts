import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerException } from '@nestjs/throttler';
import { AuthLimitNumbers, readAuthLimitNumbers } from './auth-limits.config';
import { AuthLimitsStore, limitKey, normaliseEmail } from './auth-limits.store';

// Thrown when a budget is spent. Same status and body as every other throttled route
// ({ statusCode: 429, message: 'ThrottlerException: Too Many Requests' }); the interceptor adds Retry-After.
export class AuthLimitExceeded extends ThrottlerException {
  constructor(readonly retryAfterSeconds: number) {
    super();
  }
}

// What login must give back once the handler has run: the slot it reserved on the account's failed-attempt
// counter, or null if there was none (no usable email in the body, or the store was unavailable).
export interface LoginTicket {
  accountKey: string | null;
}

export type LoginOutcome = 'failed-credentials' | 'success' | 'other';

const seconds = (ms: number) => Math.max(1, Math.ceil(ms / 1000));

// The rules, in one place. Nothing here looks at whether an account EXISTS: every key is derived from the
// request alone (IP, submitted email), so an unknown address burns the same budget and gets the same
// response as a real one -- a 429 cannot be used to tell registered addresses from unregistered ones.
@Injectable()
export class AuthLimitsService {
  private readonly numbers: AuthLimitNumbers;

  constructor(
    private readonly store: AuthLimitsStore,
    @Inject(ConfigService) config: ConfigService,
  ) {
    this.numbers = readAuthLimitNumbers({ get: (k) => config.get<string>(k) });
  }

  // POST /auth/register: N attempts per window per client IP. Every attempt counts (a rejected sign-up is
  // still work: argon2, an email send).
  async enforceSignup(ip: string): Promise<void> {
    const n = this.numbers;
    await this.charge(limitKey('signup-ip', ip), seconds(n.signupWindowMs), n.signupMax);
  }

  // POST /auth/forgot-password: a per-IP ceiling, then N requests per window per EMAIL. Every request counts
  // against the email, existing account or not, so the answer never depends on the account.
  async enforceForgotPassword(ip: string, email: string | undefined): Promise<void> {
    const n = this.numbers;
    await this.charge(limitKey('forgot-ip', ip), seconds(n.ipCeilingWindowMs), n.ipCeilingMax);
    if (email === undefined) return;
    await this.charge(limitKey('forgot-email', normaliseEmail(email)), seconds(n.forgotEmailWindowMs), n.forgotEmailMax);
  }

  // POST /auth/login, before the handler: the per-IP ceiling (every attempt), then a slot on the account's
  // failed-attempt counter. The slot is RESERVED up front (INCR) rather than checked-then-counted-later, so
  // N parallel guesses cannot all slip under the limit before the first one has failed; endLogin() gives the
  // slot back unless the attempt really was a failed credential check.
  async beginLogin(ip: string, email: string | undefined): Promise<LoginTicket> {
    const n = this.numbers;
    await this.charge(limitKey('login-ip', ip), seconds(n.ipCeilingWindowMs), n.ipCeilingMax);
    if (email === undefined) return { accountKey: null };

    const accountKey = limitKey('login-failed', normaliseEmail(email));
    const hit = await this.store.hit(accountKey, seconds(n.loginFailedWindowMs));
    if (hit === null) return { accountKey: null };
    if (hit.count > n.loginFailedMax) {
      throw new AuthLimitExceeded(await this.store.retryAfterSeconds(accountKey, hit.windowSeconds));
    }
    return { accountKey };
  }

  // After the handler. A wrong password/unknown email (401) keeps its slot; a success, a validation error or
  // anything else gives it back, so only FAILED attempts consume the budget.
  async endLogin(ticket: LoginTicket, outcome: LoginOutcome): Promise<void> {
    if (ticket.accountKey !== null && outcome !== 'failed-credentials') {
      await this.store.release(ticket.accountKey);
    }
  }

  private async charge(key: string, windowSeconds: number, max: number): Promise<void> {
    const hit = await this.store.hit(key, windowSeconds);
    if (hit !== null && hit.count > max) {
      throw new AuthLimitExceeded(await this.store.retryAfterSeconds(key, windowSeconds));
    }
  }
}
