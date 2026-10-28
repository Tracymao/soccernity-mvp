import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerException } from '@nestjs/throttler';
import { AuthLimitNumbers, readAuthLimitNumbers } from './auth-limits.config';
import { AuthLimitsStore, limitKey, normaliseEmail } from './auth-limits.store';
import { LoginLockoutNotifier } from './login-lockout.notifier';

// Thrown when a budget is spent. Same status and body as every other throttled route
// ({ statusCode: 429, message: 'ThrottlerException: Too Many Requests' }); the interceptor adds Retry-After.
export class AuthLimitExceeded extends ThrottlerException {
  constructor(readonly retryAfterSeconds: number) {
    super();
  }
}

// What login must give back once the handler has run: the slots it reserved on the (account, IP) pair's
// failed-attempt counter and on the account-wide ceiling, or null for a slot that was not taken (no usable
// email in the body, or the store was unavailable). `pairCount` is the pair counter's value after this
// attempt's own increment; it tells endLogin whether this failed attempt spent the pair's budget.
export interface LoginTicket {
  email: string | null;
  pairKey: string | null;
  pairCount: number;
  accountKey: string | null;
}

export type LoginOutcome = 'failed-credentials' | 'success' | 'other';

const seconds = (ms: number) => Math.max(1, Math.ceil(ms / 1000));

// The login keys. Both are derived from the request alone, never from whether the account exists.
const pairKeyFor = (email: string, ip: string) => limitKey('login-failed', `${email}
${ip}`);
export const accountCeilingKeyFor = (email: string) => limitKey('login-account', email);

// The rules, in one place. Nothing here looks at whether an account EXISTS: every key is derived from the
// request alone (IP, submitted email), so an unknown address burns the same budget and gets the same
// response as a real one -- a 429 cannot be used to tell registered addresses from unregistered ones.
@Injectable()
export class AuthLimitsService {
  private readonly numbers: AuthLimitNumbers;

  constructor(
    private readonly store: AuthLimitsStore,
    private readonly notifier: LoginLockoutNotifier,
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

  // POST /auth/login, before the handler: the per-IP ceiling (every attempt), then a slot on the (account, IP)
  // pair's failed-attempt counter, then a slot on the account-wide ceiling. Slots are RESERVED up front (INCR)
  // rather than checked-then-counted-later, so N parallel guesses cannot all slip under a limit before the first
  // one has failed; endLogin() gives them back unless the attempt really was a failed credential check.
  //
  // The pair is checked first, so an attempt already refused for its own address never touches the
  // account-wide ceiling. A refused attempt gives back the slot it just took: it was never evaluated, so it
  // must not spend a budget (the TTL keeps the window fixed either way).
  async beginLogin(ip: string, rawEmail: string | undefined): Promise<LoginTicket> {
    const n = this.numbers;
    await this.charge(limitKey('login-ip', ip), seconds(n.ipCeilingWindowMs), n.ipCeilingMax);
    if (rawEmail === undefined) return { email: null, pairKey: null, pairCount: 0, accountKey: null };
    const email = normaliseEmail(rawEmail);

    const pairKey = pairKeyFor(email, ip);
    const pair = await this.store.hit(pairKey, seconds(n.loginFailedWindowMs));
    if (pair !== null && pair.count > n.loginFailedMax) {
      const retry = await this.store.retryAfterSeconds(pairKey, pair.windowSeconds);
      await this.store.release(pairKey);
      throw new AuthLimitExceeded(retry);
    }

    const accountKey = accountCeilingKeyFor(email);
    const account = await this.store.hit(accountKey, seconds(n.accountCeilingWindowMs));
    if (account !== null && account.count > n.accountCeilingMax) {
      const retry = await this.store.retryAfterSeconds(accountKey, account.windowSeconds);
      await this.store.release(accountKey);
      if (pair !== null) await this.store.release(pairKey);
      throw new AuthLimitExceeded(retry);
    }

    return {
      email,
      pairKey: pair === null ? null : pairKey,
      pairCount: pair?.count ?? 0,
      accountKey: account === null ? null : accountKey,
    };
  }

  // After the handler. A wrong password/unknown email (401) keeps both slots; a success, a validation error or
  // anything else gives them back, so only FAILED attempts consume either budget. The failed attempt that
  // takes the pair counter to its maximum is the one that spends the pair's budget, and triggers the
  // lockout notice (once per account per 24 hours, fire-and-forget; see LoginLockoutNotifier).
  async endLogin(ticket: LoginTicket, outcome: LoginOutcome): Promise<void> {
    if (outcome === 'failed-credentials') {
      if (ticket.email !== null && ticket.pairKey !== null && ticket.pairCount === this.numbers.loginFailedMax) {
        this.notifier.notifyInBackground(ticket.email);
      }
      return;
    }
    if (ticket.pairKey !== null) await this.store.release(ticket.pairKey);
    if (ticket.accountKey !== null) await this.store.release(ticket.accountKey);
  }

  // A completed password reset clears the account-wide ceiling for that address, so an owner who has reset is
  // not stuck behind failed guesses made by someone else. The per-pair counters expire on their own. Never
  // throws: the reset itself has already succeeded.
  async clearAccountCeiling(rawEmail: string): Promise<void> {
    await this.store.clear(accountCeilingKeyFor(normaliseEmail(rawEmail)));
  }

  private async charge(key: string, windowSeconds: number, max: number): Promise<void> {
    const hit = await this.store.hit(key, windowSeconds);
    if (hit !== null && hit.count > max) {
      throw new AuthLimitExceeded(await this.store.retryAfterSeconds(key, windowSeconds));
    }
  }
}
