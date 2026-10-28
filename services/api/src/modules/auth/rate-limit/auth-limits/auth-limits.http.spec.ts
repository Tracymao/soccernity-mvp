import { Body, Controller, HttpCode, INestApplication, Post, UnauthorizedException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import * as Sentry from '@sentry/nestjs';
import * as request from 'supertest';
import { PrismaService } from '../../../../prisma/prisma.service';
import { RedisService } from '../../../../redis/redis.service';
import { RegistrationEmailService } from '../../registration/email/registration-email.service';
import { AuthLimit } from './auth-limits.interceptor';
import { AuthLimitsModule } from './auth-limits.module';
import { AuthLimitsService } from './auth-limits.service';
import { AuthLimitsStore } from './auth-limits.store';

jest.mock('@sentry/nestjs', () => ({ captureException: jest.fn() }));

// The REAL AuthLimitsModule (interceptor, service, store, notifier) driven over HTTP against an in-memory
// stand-in for Redis, in front of three stub handlers. The handlers know nothing about accounts: login
// "succeeds" for the password 'right', and forgot-password answers the same for every address -- which is exactly
// the point, the limiter's answer must not depend on the account. Only the lockout NOTICE looks at accounts, and
// it does so in the background, through a fake Prisma and a fake email service.
@Controller('t')
class StubAuthController {
  @Post('register')
  @AuthLimit('signup')
  @HttpCode(201)
  register() {
    return { ok: true };
  }

  @Post('login')
  @AuthLimit('login')
  @HttpCode(200)
  login(@Body() body: { email?: string; password?: string }) {
    if (body.password !== 'right') throw new UnauthorizedException('Invalid credentials');
    return { ok: true };
  }

  @Post('forgot')
  @AuthLimit('forgot-password')
  @HttpCode(200)
  forgot() {
    return { message: 'generic' };
  }
}

class FakeRedis {
  readonly counts = new Map<string, number>();
  readonly ttls = new Map<string, number>();
  failing = false;
  private guard() {
    if (this.failing) throw new Error('redis down');
  }
  async incr(k: string) {
    this.guard();
    const n = (this.counts.get(k) ?? 0) + 1;
    this.counts.set(k, n);
    return n;
  }
  async decr(k: string) {
    this.guard();
    const n = (this.counts.get(k) ?? 0) - 1;
    this.counts.set(k, n);
    return n;
  }
  async expire(k: string, s: number) {
    this.guard();
    this.ttls.set(k, s);
    return 1;
  }
  async ttl(k: string) {
    this.guard();
    return this.ttls.get(k) ?? -1;
  }
  async del(k: string) {
    this.guard();
    this.counts.delete(k);
    this.ttls.delete(k);
    return 1;
  }
  async set(k: string, _v: string, _mode: 'EX', seconds: number, _flag: 'NX'): Promise<'OK' | null> {
    this.guard();
    if (this.counts.has(k)) return null;
    this.counts.set(k, 1);
    this.ttls.set(k, seconds);
    return 'OK';
  }
}

const REAL_ACCOUNTS = new Set(['victim@x.com', 'real@x.com', 'p@x.com', 'secret.person@school.example']);

function makeFakes() {
  const prisma = {
    user: {
      findUnique: jest.fn(async ({ where }: { where: { email: string } }) =>
        REAL_ACCOUNTS.has(where.email) ? { email: where.email, accountStatus: 'active' } : null,
      ),
    },
  };
  const email = { sendLoginLockoutNoticeEmail: jest.fn(async (_to: string) => true) };
  return { prisma, email };
}

async function buildApp(
  redis: FakeRedis,
  fakes: ReturnType<typeof makeFakes>,
  env: Record<string, string> = {},
): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => ({ ...env })] }), AuthLimitsModule],
    controllers: [StubAuthController],
  })
    .overrideProvider(RedisService)
    .useValue(redis)
    .overrideProvider(PrismaService)
    .useValue(fakes.prisma)
    .overrideProvider(RegistrationEmailService)
    .useValue(fakes.email)
    .compile();
  const app = moduleRef.createNestApplication();
  // Take the client address from X-Forwarded-For so one test process can play many IPs.
  (app.getHttpAdapter().getInstance() as { set(k: string, v: unknown): void }).set('trust proxy', true);
  await app.init();
  // Listen once up front. supertest binds a not-yet-listening server per request, so a burst of concurrent
  // requests (the parallel-guess test) would race to listen() on the same server and get ECONNRESET.
  await app.listen(0);
  return app;
}

const post = (app: INestApplication, path: string, ip: string, body: object) =>
  request(app.getHttpServer()).post(`/t/${path}`).set('X-Forwarded-For', ip).send(body);

const flush = () => new Promise((resolve) => setTimeout(resolve, 40));

describe('auth limits for shared networks (B-256) and per-account-and-IP lockout', () => {
  let app: INestApplication;
  let redis: FakeRedis;
  let fakes: ReturnType<typeof makeFakes>;

  beforeEach(async () => {
    jest.clearAllMocks();
    redis = new FakeRedis();
    fakes = makeFakes();
    app = await buildApp(redis, fakes);
  });
  afterEach(async () => {
    await app.close();
  });

  describe('signup', () => {
    it('lets 30 distinct sign-ups from one IP through in the window and limits the 31st', async () => {
      for (let i = 0; i < 30; i++) {
        await post(app, 'register', '10.0.0.1', { email: `child${i}@school.example` }).expect(201);
      }
      const res = await post(app, 'register', '10.0.0.1', { email: 'child30@school.example' }).expect(429);
      expect(res.body).toEqual({ statusCode: 429, message: 'ThrottlerException: Too Many Requests' });
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
      // A different school is untouched.
      await post(app, 'register', '10.0.0.2', { email: 'other@school.example' }).expect(201);
    });
  });

  describe('login: lockout per account AND IP', () => {
    it('locks only the guesser: five wrong passwords from IP A refuse A, while the owner on IP B still signs in', async () => {
      for (let i = 0; i < 5; i++) {
        await post(app, 'login', '10.1.0.1', { email: 'Victim@x.com', password: 'wrong' }).expect(401);
      }
      // Normalised: different casing/whitespace is the same pair budget. Even the right password is refused from A.
      const refused = await post(app, 'login', '10.1.0.1', { email: ' victim@X.com ', password: 'right' }).expect(429);
      expect(refused.body).toEqual({ statusCode: 429, message: 'ThrottlerException: Too Many Requests' });
      expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);
      // The real owner, on another address, is not locked out.
      await post(app, 'login', '10.1.0.2', { email: 'victim@x.com', password: 'right' }).expect(200);
    });

    it('refuses every IP once the account-wide ceiling of 20 failures is spent, even with the right password', async () => {
      for (let i = 1; i <= 20; i++) {
        await post(app, 'login', `10.20.0.${i}`, { email: 'victim@x.com', password: 'wrong' }).expect(401);
      }
      // The 21st failure, from yet another IP, is refused ...
      const res = await post(app, 'login', '10.20.0.21', { email: 'victim@x.com', password: 'wrong' }).expect(429);
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
      // ... and so is every other address, a fresh one and one that had already failed once.
      await post(app, 'login', '10.20.0.200', { email: 'victim@x.com', password: 'right' }).expect(429);
      await post(app, 'login', '10.20.0.1', { email: 'victim@x.com', password: 'right' }).expect(429);
      // Other accounts are untouched.
      await post(app, 'login', '10.20.0.200', { email: 'other@x.com', password: 'right' }).expect(200);
    });

    it('does not let an attempt refused by its own pair spend the account ceiling', async () => {
      // Five failures from one IP spend that pair. Fifty more refused attempts from it must not count toward
      // the account's 20.
      for (let i = 0; i < 5; i++) await post(app, 'login', '10.21.0.1', { email: 'victim@x.com', password: 'wrong' }).expect(401);
      for (let i = 0; i < 50; i++) await post(app, 'login', '10.21.0.1', { email: 'victim@x.com', password: 'wrong' }).expect(429);
      // 5 of 20 are used, so fifteen other addresses can still each fail once before the ceiling.
      for (let i = 2; i <= 16; i++) await post(app, 'login', `10.21.0.${i}`, { email: 'victim@x.com', password: 'wrong' }).expect(401);
      await post(app, 'login', '10.21.0.17', { email: 'victim@x.com', password: 'wrong' }).expect(429);
    });

    it('does the same for an email that has no account (no way to tell registered addresses apart)', async () => {
      const outcomes = async (email: string, ip: string) => {
        const seen: number[] = [];
        for (let i = 0; i < 7; i++) seen.push((await post(app, 'login', ip, { email, password: 'wrong' })).status);
        return seen;
      };
      const real = await outcomes('real@x.com', '10.2.0.1');
      const ghost = await outcomes('ghost@x.com', '10.2.0.2');
      expect(real).toEqual([401, 401, 401, 401, 401, 429, 429]);
      expect(ghost).toEqual(real);

      // The ceiling too: the 21st failure across many IPs is refused for a real and an unknown address alike.
      const ceiling = async (email: string, base: number) => {
        const seen: number[] = [];
        for (let i = 0; i < 22; i++) seen.push((await post(app, 'login', `10.${base}.0.${i + 1}`, { email, password: 'wrong' })).status);
        return seen;
      };
      expect(await ceiling('real@x.com', 30)).toEqual(await ceiling('ghost@x.com', 31));
    });

    it('does not limit 10 different emails failing from one IP', async () => {
      for (let i = 0; i < 10; i++) {
        await post(app, 'login', '10.3.0.1', { email: `kid${i}@school.example`, password: 'wrong' }).expect(401);
      }
    });

    it('does not let successful logins consume either budget', async () => {
      for (let i = 0; i < 4; i++) await post(app, 'login', '10.4.0.1', { email: 'a@x.com', password: 'wrong' }).expect(401);
      for (let i = 0; i < 20; i++) await post(app, 'login', '10.4.0.1', { email: 'a@x.com', password: 'right' }).expect(200);
      for (let i = 0; i < 20; i++) await post(app, 'login', '10.4.0.2', { email: 'a@x.com', password: 'right' }).expect(200);
      // The pair has had 4 failures: its 5th is still allowed, the 6th is limited.
      await post(app, 'login', '10.4.0.1', { email: 'a@x.com', password: 'wrong' }).expect(401);
      await post(app, 'login', '10.4.0.1', { email: 'a@x.com', password: 'wrong' }).expect(429);
      // The account ceiling has seen exactly 5 failures, none of the 40 successes: 15 more failures from other
      // IPs reach 20, the 21st is refused.
      for (let i = 10; i < 25; i++) await post(app, 'login', `10.4.1.${i}`, { email: 'a@x.com', password: 'wrong' }).expect(401);
      await post(app, 'login', '10.4.1.99', { email: 'a@x.com', password: 'wrong' }).expect(429);
    });

    it('does not let 20 parallel guesses at one account from one IP slip under the limit', async () => {
      const results = await Promise.all(
        Array.from({ length: 20 }, () => post(app, 'login', '10.5.0.1', { email: 'p@x.com', password: 'wrong' })),
      );
      expect(results.filter((r) => r.status === 401)).toHaveLength(5);
      expect(results.filter((r) => r.status === 429)).toHaveLength(15);
    });

    it('applies a per-IP ceiling of 60 per window across different emails', async () => {
      for (let i = 0; i < 60; i++) {
        await post(app, 'login', '10.6.0.1', { email: `u${i}@x.com`, password: 'right' }).expect(200);
      }
      await post(app, 'login', '10.6.0.1', { email: 'u60@x.com', password: 'right' }).expect(429);
      await post(app, 'login', '10.6.0.2', { email: 'u60@x.com', password: 'right' }).expect(200);
    });

    it('ignores a non-string email for the account keys (validation rejects it later)', async () => {
      await post(app, 'login', '10.7.0.1', { email: { $ne: 1 }, password: 'right' }).expect(200);
      expect([...redis.counts.keys()].some((k) => k.includes('login-failed') || k.includes('login-account'))).toBe(false);
    });

    it('clears the account-wide ceiling when a password reset completes, so the owner is not stuck', async () => {
      for (let i = 1; i <= 20; i++) {
        await post(app, 'login', `10.22.0.${i}`, { email: 'victim@x.com', password: 'wrong' }).expect(401);
      }
      await post(app, 'login', '10.22.0.100', { email: 'victim@x.com', password: 'right' }).expect(429);

      await app.get(AuthLimitsService).clearAccountCeiling(' Victim@X.com ');

      await post(app, 'login', '10.22.0.100', { email: 'victim@x.com', password: 'right' }).expect(200);
    });
  });

  describe('lockout notice email', () => {
    it('sends exactly one notice to the registered address when the pair budget is first spent', async () => {
      for (let i = 0; i < 5; i++) await post(app, 'login', '10.40.0.1', { email: 'Victim@x.com', password: 'wrong' }).expect(401);
      await flush();
      expect(fakes.email.sendLoginLockoutNoticeEmail).toHaveBeenCalledTimes(1);
      // The address the account is registered under, normalised; nothing else is passed (no IP, no times).
      expect(fakes.email.sendLoginLockoutNoticeEmail).toHaveBeenCalledWith('victim@x.com');
    });

    it('does not send before the budget is spent, nor for refused attempts, nor on a success', async () => {
      for (let i = 0; i < 4; i++) await post(app, 'login', '10.41.0.1', { email: 'victim@x.com', password: 'wrong' }).expect(401);
      await post(app, 'login', '10.41.0.2', { email: 'victim@x.com', password: 'right' }).expect(200);
      await flush();
      expect(fakes.email.sendLoginLockoutNoticeEmail).not.toHaveBeenCalled();
      for (let i = 0; i < 5; i++) await post(app, 'login', '10.41.0.1', { email: 'victim@x.com', password: 'wrong' });
      await flush();
      expect(fakes.email.sendLoginLockoutNoticeEmail).toHaveBeenCalledTimes(1);
    });

    it('sends at most one notice per account per 24 hours, however many pairs are spent', async () => {
      for (const ip of ['10.42.0.1', '10.42.0.2', '10.42.0.3']) {
        for (let i = 0; i < 5; i++) await post(app, 'login', ip, { email: 'victim@x.com', password: 'wrong' }).expect(401);
      }
      await flush();
      expect(fakes.email.sendLoginLockoutNoticeEmail).toHaveBeenCalledTimes(1);
      const noticeKeys = [...redis.counts.keys()].filter((k) => k.includes('login-lockout-notice'));
      expect(noticeKeys).toHaveLength(1);
      expect(redis.ttls.get(noticeKeys[0])).toBe(24 * 60 * 60);
    });

    it('sends nothing, and stores no claim, for an address with no account', async () => {
      for (let i = 0; i < 5; i++) await post(app, 'login', '10.43.0.1', { email: 'ghost@x.com', password: 'wrong' }).expect(401);
      await flush();
      expect(fakes.email.sendLoginLockoutNoticeEmail).not.toHaveBeenCalled();
      expect([...redis.counts.keys()].some((k) => k.includes('login-lockout-notice'))).toBe(false);
    });

    it('gives the claim back when nothing could be sent, so a later lockout can try again', async () => {
      fakes.email.sendLoginLockoutNoticeEmail.mockResolvedValueOnce(false);
      for (let i = 0; i < 5; i++) await post(app, 'login', '10.44.0.1', { email: 'victim@x.com', password: 'wrong' }).expect(401);
      await flush();
      expect([...redis.counts.keys()].some((k) => k.includes('login-lockout-notice'))).toBe(false);
      for (let i = 0; i < 5; i++) await post(app, 'login', '10.44.0.2', { email: 'victim@x.com', password: 'wrong' }).expect(401);
      await flush();
      expect(fakes.email.sendLoginLockoutNoticeEmail).toHaveBeenCalledTimes(2);
    });

    it('never changes the login response when the email send fails', async () => {
      fakes.email.sendLoginLockoutNoticeEmail.mockRejectedValue(new Error('postmark down'));
      const statuses: number[] = [];
      for (let i = 0; i < 6; i++) statuses.push((await post(app, 'login', '10.45.0.1', { email: 'victim@x.com', password: 'wrong' })).status);
      expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
      await flush();
      expect(fakes.email.sendLoginLockoutNoticeEmail).toHaveBeenCalledTimes(1);
    });

    it('never waits for a slow email send: the response arrives while the send is still pending', async () => {
      fakes.email.sendLoginLockoutNoticeEmail.mockImplementation(() => new Promise<boolean>(() => undefined));
      for (let i = 0; i < 4; i++) await post(app, 'login', '10.46.0.1', { email: 'victim@x.com', password: 'wrong' }).expect(401);
      const started = Date.now();
      // The 5th failure triggers the (never-finishing) send; supertest would hang until the Jest timeout if the
      // response waited for it.
      await post(app, 'login', '10.46.0.1', { email: 'victim@x.com', password: 'wrong' }).expect(401);
      expect(Date.now() - started).toBeLessThan(2000);
      await flush();
      expect(fakes.email.sendLoginLockoutNoticeEmail).toHaveBeenCalledTimes(1);
    });
  });

  describe('forgot-password', () => {
    it('allows 3 per hour per email, then limits the 4th with the same shape for any address', async () => {
      for (let i = 0; i < 3; i++) await post(app, 'forgot', `10.8.0.${i + 1}`, { email: 'Mum@x.com' }).expect(200);
      const res = await post(app, 'forgot', '10.8.0.9', { email: 'mum@x.com' }).expect(429);
      expect(res.body).toEqual({ statusCode: 429, message: 'ThrottlerException: Too Many Requests' });
      await post(app, 'forgot', '10.8.0.9', { email: 'someone-else@x.com' }).expect(200);
    });

    it('has its own per-IP ceiling, separate from login', async () => {
      for (let i = 0; i < 60; i++) await post(app, 'forgot', '10.9.0.1', { email: `f${i}@x.com` }).expect(200);
      await post(app, 'forgot', '10.9.0.1', { email: 'f60@x.com' }).expect(429);
      await post(app, 'login', '10.9.0.1', { email: 'f60@x.com', password: 'right' }).expect(200);
    });
  });

  it('never puts a raw email or a raw IP in a Redis key', async () => {
    // Five failures spend the pair, create the account ceiling and the notice claim.
    for (let i = 0; i < 5; i++) {
      await post(app, 'login', '203.0.113.77', { email: 'secret.person@school.example', password: 'wrong' }).expect(401);
    }
    await post(app, 'forgot', '203.0.113.77', { email: 'secret.person@school.example' }).expect(200);
    await post(app, 'register', '203.0.113.77', { email: 'secret.person@school.example' }).expect(201);
    await flush();
    const keys = [...redis.counts.keys()];
    for (const scope of ['login-ip', 'login-failed', 'login-account', 'login-lockout-notice', 'forgot-email', 'signup-ip']) {
      expect(keys.some((k) => k.startsWith(`auth-limit:${scope}:`))).toBe(true);
    }
    for (const k of keys) {
      expect(k.startsWith('auth-limit:')).toBe(true);
      expect(k).not.toContain('secret.person');
      expect(k).not.toContain('school.example');
      expect(k).not.toContain('203.0.113.77');
    }
  });

  it('keys the pair counter on the email AND the IP together, and the account ceiling on the email alone', async () => {
    await post(app, 'login', '10.50.0.1', { email: 'victim@x.com', password: 'wrong' }).expect(401);
    await post(app, 'login', '10.50.0.2', { email: 'victim@x.com', password: 'wrong' }).expect(401);
    const pairKeys = [...redis.counts.keys()].filter((k) => k.startsWith('auth-limit:login-failed:'));
    const accountKeys = [...redis.counts.keys()].filter((k) => k.startsWith('auth-limit:login-account:'));
    expect(pairKeys).toHaveLength(2);
    expect(accountKeys).toHaveLength(1);
    expect(redis.counts.get(accountKeys[0])).toBe(2);
    expect(redis.ttls.get(accountKeys[0])).toBe(24 * 60 * 60);
    expect(redis.ttls.get(pairKeys[0])).toBe(15 * 60);
  });

  describe('when Redis is unavailable', () => {
    it('keeps enforcing the pair and account limits per instance from the in-memory fallback, reporting once', async () => {
      redis.failing = true;
      const store = app.get(AuthLimitsStore);
      const logSpy = jest.spyOn((store as unknown as { logger: { error(m: string): void } }).logger, 'error').mockImplementation(() => undefined);

      // Pair: five wrong passwords from one IP, the sixth is refused, another IP is not.
      for (let i = 0; i < 5; i++) await post(app, 'login', '10.10.0.1', { email: 'x@x.com', password: 'wrong' }).expect(401);
      await post(app, 'login', '10.10.0.1', { email: 'x@x.com', password: 'right' }).expect(429);
      await post(app, 'login', '10.10.0.2', { email: 'x@x.com', password: 'right' }).expect(200);

      // Account ceiling: 20 failures across IPs, then every IP is refused.
      for (let i = 1; i <= 20; i++) await post(app, 'login', `10.11.0.${i}`, { email: 'y@x.com', password: 'wrong' }).expect(401);
      await post(app, 'login', '10.11.0.99', { email: 'y@x.com', password: 'right' }).expect(429);

      // Sign-up and forgot-password also still limit.
      for (let i = 0; i < 30; i++) await post(app, 'register', '10.12.0.1', {}).expect(201);
      await post(app, 'register', '10.12.0.1', {}).expect(429);
      for (let i = 0; i < 3; i++) await post(app, 'forgot', `10.13.0.${i + 1}`, { email: 'm@x.com' }).expect(200);
      await post(app, 'forgot', '10.13.0.9', { email: 'm@x.com' }).expect(429);

      // Reported once (log and Sentry), not once per request, and tagged.
      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
      expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error), { tags: { rate_limiter: 'auth' } });
      expect(store.fallbackSize).toBeGreaterThan(0);
      expect(store.fallbackSize).toBeLessThanOrEqual(10_000);
    });

    it('still sends at most one notice per account and clears the account ceiling from the fallback', async () => {
      redis.failing = true;
      jest.spyOn((app.get(AuthLimitsStore) as unknown as { logger: { error(m: string): void } }).logger, 'error').mockImplementation(() => undefined);
      for (const ip of ['10.14.0.1', '10.14.0.2']) {
        for (let i = 0; i < 5; i++) await post(app, 'login', ip, { email: 'victim@x.com', password: 'wrong' }).expect(401);
      }
      await flush();
      expect(fakes.email.sendLoginLockoutNoticeEmail).toHaveBeenCalledTimes(1);

      for (let i = 1; i <= 10; i++) await post(app, 'login', `10.15.0.${i}`, { email: 'victim@x.com', password: 'wrong' });
      await post(app, 'login', '10.15.0.99', { email: 'victim@x.com', password: 'right' }).expect(429);
      await app.get(AuthLimitsService).clearAccountCeiling('victim@x.com');
      await post(app, 'login', '10.15.0.99', { email: 'victim@x.com', password: 'right' }).expect(200);
    });

    it('starts the counters empty again when Redis returns', async () => {
      redis.failing = true;
      jest.spyOn((app.get(AuthLimitsStore) as unknown as { logger: { error(m: string): void } }).logger, 'error').mockImplementation(() => undefined);
      for (let i = 0; i < 5; i++) await post(app, 'login', '10.16.0.1', { email: 'x@x.com', password: 'wrong' }).expect(401);
      await post(app, 'login', '10.16.0.1', { email: 'x@x.com', password: 'wrong' }).expect(429);
      redis.failing = false;
      // Redis has no memory of those attempts: the pair is allowed its five again.
      await post(app, 'login', '10.16.0.1', { email: 'x@x.com', password: 'wrong' }).expect(401);
    });
  });

  it('heals a counter that has no expiry so nobody is locked out forever', async () => {
    redis.counts.set(`auth-limit:signup-ip:${require('crypto').createHash('sha256').update('10.11.0.1').digest('hex')}`, 29);
    await post(app, 'register', '10.11.0.1', {}).expect(201);
    expect([...redis.ttls.values()]).toEqual([600]);
  });

  it('reads its numbers from the environment', async () => {
    await app.close();
    app = await buildApp(redis, fakes, {
      AUTH_SIGNUP_RATE_LIMIT_MAX: '2',
      AUTH_SIGNUP_RATE_LIMIT_WINDOW_MS: '30000',
      AUTH_LOGIN_ACCOUNT_CEILING_MAX: '2',
      AUTH_LOGIN_ACCOUNT_CEILING_WINDOW_MS: '120000',
    });
    await post(app, 'register', '10.12.0.1', {}).expect(201);
    await post(app, 'register', '10.12.0.1', {}).expect(201);
    const res = await post(app, 'register', '10.12.0.1', {}).expect(429);
    expect(Number(res.headers['retry-after'])).toBe(30);

    await post(app, 'login', '10.17.0.1', { email: 'victim@x.com', password: 'wrong' }).expect(401);
    await post(app, 'login', '10.17.0.2', { email: 'victim@x.com', password: 'wrong' }).expect(401);
    const locked = await post(app, 'login', '10.17.0.3', { email: 'victim@x.com', password: 'right' }).expect(429);
    expect(Number(locked.headers['retry-after'])).toBe(120);
  });
});
