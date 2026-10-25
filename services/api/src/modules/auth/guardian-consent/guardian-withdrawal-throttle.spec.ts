import { BadRequestException, ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { AuthRateLimitModule } from '../rate-limit/rate-limit.module';
import { GuardianCardVerificationService } from './guardian-card-verification.service';
import { GuardianConsentController } from './guardian-consent.controller';
import { GuardianConsentService } from './guardian-consent.service';
import { GuardianEmailChangeLimiter } from './guardian-email-change.limiter';
import {
  GUARDIAN_WITHDRAWAL_RATE_LIMIT_DEFAULT,
  GUARDIAN_WITHDRAWAL_RATE_LIMIT_WINDOW_MS_DEFAULT,
  GUARDIAN_WITHDRAWAL_THROTTLE_MESSAGE,
  GuardianWithdrawalThrottlerGuard,
  guardianWithdrawalRateLimit,
  guardianWithdrawalRateLimitWindowMs,
} from './guardian-withdrawal-throttle';

// B-112 / B-225 (Decision Log #414 item 1, #403 item 15): the two withdrawal
// routes are limited to 5 attempts per 15 minutes, both numbers held in
// configuration, and a throttled caller gets 'Too many attempts' with no
// countdown. The real HTTP behaviour against a real database is in
// test/guardian-withdrawal.e2e-spec.ts; this file covers the configuration
// reading and the guard in isolation.
describe('guardian withdrawal throttle configuration', () => {
  const keys = ['GUARDIAN_WITHDRAWAL_RATE_LIMIT_MAX', 'GUARDIAN_WITHDRAWAL_RATE_LIMIT_WINDOW_MS'] as const;
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => keys.forEach((k) => { saved[k] = process.env[k]; delete process.env[k]; }));
  afterEach(() => keys.forEach((k) => { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }));

  it('defaults to 5 attempts per 15 minutes', () => {
    expect(guardianWithdrawalRateLimit()).toBe(5);
    expect(guardianWithdrawalRateLimitWindowMs()).toBe(15 * 60 * 1000);
    expect(GUARDIAN_WITHDRAWAL_RATE_LIMIT_DEFAULT).toBe(5);
    expect(GUARDIAN_WITHDRAWAL_RATE_LIMIT_WINDOW_MS_DEFAULT).toBe(900_000);
  });

  it('reads both numbers from configuration on every call', () => {
    process.env.GUARDIAN_WITHDRAWAL_RATE_LIMIT_MAX = '3';
    process.env.GUARDIAN_WITHDRAWAL_RATE_LIMIT_WINDOW_MS = '60000';
    expect(guardianWithdrawalRateLimit()).toBe(3);
    expect(guardianWithdrawalRateLimitWindowMs()).toBe(60_000);
    process.env.GUARDIAN_WITHDRAWAL_RATE_LIMIT_MAX = '9';
    expect(guardianWithdrawalRateLimit()).toBe(9);
  });

  it.each(['', '0', '-1', '2.5', 'abc'])('falls back to the default (never disables the limit) for %p', (bad) => {
    process.env.GUARDIAN_WITHDRAWAL_RATE_LIMIT_MAX = bad;
    process.env.GUARDIAN_WITHDRAWAL_RATE_LIMIT_WINDOW_MS = bad;
    expect(guardianWithdrawalRateLimit()).toBe(5);
    expect(guardianWithdrawalRateLimitWindowMs()).toBe(900_000);
  });
});

describe('GuardianWithdrawalThrottlerGuard', () => {
  // The guard's two protected hooks, reached through a cast: this is the whole
  // surface the countdown-free behaviour depends on.
  type Hooks = {
    getRequestResponse(ctx: ExecutionContext): { req: unknown; res: { header: (...a: unknown[]) => unknown } };
    throwThrottlingException(): Promise<void>;
  };
  const guard = Object.create(GuardianWithdrawalThrottlerGuard.prototype) as Hooks;

  it('throws exactly "Too many attempts" with a 429 and no numbers', async () => {
    const err = await guard.throwThrottlingException().catch((e: Error & { getStatus(): number; getResponse(): unknown }) => e);
    expect((err as { getStatus(): number }).getStatus()).toBe(429);
    // Nest turns a string response into { statusCode: 429, message } on the wire
    // (asserted over HTTP in the real-rate-limiting block below).
    expect((err as { getResponse(): unknown }).getResponse()).toBe('Too many attempts');
    expect(GUARDIAN_WITHDRAWAL_THROTTLE_MESSAGE).toBe('Too many attempts');
    expect(JSON.stringify((err as { getResponse(): unknown }).getResponse())).not.toMatch(/\d{2,}|minute|second|retry/i);
  });

  it('hands the throttler a response that writes no rate-limit header (no Retry-After, no X-RateLimit-Reset)', () => {
    const realRes = { header: jest.fn() };
    const req = { ip: '1.2.3.4' };
    const ctx = { switchToHttp: () => ({ getRequest: () => req, getResponse: () => realRes }) } as unknown as ExecutionContext;

    const out = guard.getRequestResponse(ctx);
    out.res.header('Retry-After-auth', 900);
    out.res.header('X-RateLimit-Reset-auth', 900);

    expect(out.req).toBe(req);
    expect(realRes.header).not.toHaveBeenCalled();
  });
});

describe('withdrawal routes (real rate limiting)', () => {
  let app: INestApplication;
  const service = {
    requestWithdrawal: jest.fn().mockResolvedValue(undefined),
    withdrawConsent: jest.fn().mockRejectedValue(new BadRequestException('Invalid or expired withdrawal token')),
  };
  const saved = {
    max: process.env.GUARDIAN_WITHDRAWAL_RATE_LIMIT_MAX,
    win: process.env.GUARDIAN_WITHDRAWAL_RATE_LIMIT_WINDOW_MS,
  };

  beforeAll(async () => {
    process.env.GUARDIAN_WITHDRAWAL_RATE_LIMIT_MAX = '3';
    process.env.GUARDIAN_WITHDRAWAL_RATE_LIMIT_WINDOW_MS = '900000';
    const moduleRef = await Test.createTestingModule({
      imports: [AuthRateLimitModule],
      controllers: [GuardianConsentController],
      providers: [
        { provide: GuardianConsentService, useValue: service },
        { provide: GuardianCardVerificationService, useValue: {} },
        { provide: GuardianEmailChangeLimiter, useValue: { run: jest.fn() } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: (c: ExecutionContext) => { c.switchToHttp().getRequest().user = { sub: 'm', role: 'fan' }; return true; } })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    if (saved.max === undefined) delete process.env.GUARDIAN_WITHDRAWAL_RATE_LIMIT_MAX;
    else process.env.GUARDIAN_WITHDRAWAL_RATE_LIMIT_MAX = saved.max;
    if (saved.win === undefined) delete process.env.GUARDIAN_WITHDRAWAL_RATE_LIMIT_WINDOW_MS;
    else process.env.GUARDIAN_WITHDRAWAL_RATE_LIMIT_WINDOW_MS = saved.win;
  });

  it('uses the configured limit (3), not the shared auth limit (5), and answers "Too many attempts" with no countdown', async () => {
    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer()).post('/auth/guardian-consent/withdraw/request').send({ email: 'm@example.com' }).expect(200);
    }
    const blocked = await request(app.getHttpServer())
      .post('/auth/guardian-consent/withdraw/request')
      .send({ email: 'm@example.com' })
      .expect(429);

    expect(blocked.body).toEqual({ statusCode: 429, message: 'Too many attempts' });
    const headers = Object.keys(blocked.headers).map((h) => h.toLowerCase());
    expect(headers.filter((h) => h.startsWith('retry-after') || h.startsWith('x-ratelimit'))).toEqual([]);
    // The service was not reached by the blocked call.
    expect(service.requestWithdrawal).toHaveBeenCalledTimes(3);
  });

  it('counts the confirm route separately, with the same limit and the same bare message', async () => {
    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer()).post('/auth/guardian-consent/withdraw').send({ withdrawalToken: 'tok' }).expect(400);
    }
    const blocked = await request(app.getHttpServer())
      .post('/auth/guardian-consent/withdraw')
      .send({ withdrawalToken: 'tok' })
      .expect(429);
    expect(blocked.body).toEqual({ statusCode: 429, message: 'Too many attempts' });
    expect(blocked.headers['retry-after']).toBeUndefined();
  });
});
