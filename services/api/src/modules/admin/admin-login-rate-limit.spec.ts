import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AuthRateLimit } from '../auth/rate-limit/auth-rate-limit.decorator';
import { AuthThrottlerGuard } from '../auth/rate-limit/auth-throttler.guard';
import { AuthRateLimitModule } from '../auth/rate-limit/rate-limit.module';
import { AdminAuthController } from './admin-auth.controller';
import {
  ADMIN_LOGIN_RATE_LIMIT,
  ADMIN_LOGIN_RATE_LIMIT_DEFAULT,
  ADMIN_LOGIN_RATE_LIMIT_ENV,
  ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS,
  readAdminLoginRateLimitMax,
} from './admin-login-rate-limit';

// POST /admin/auth/login: 5 attempts per 15 minutes per IP in production (Decision Log #190). The only knob is the
// QA-only ADMIN_LOGIN_RATE_LIMIT_MAX, resolved per request. The first describe pins the resolver and the real
// handler's metadata; the second drives the REAL AuthThrottlerGuard through a throwaway controller that uses the
// SAME ADMIN_LOGIN_RATE_LIMIT object the real handler uses (the AuthRateLimit decorator spec's pattern).

@Controller('test-admin-login-limit')
class TestAdminLoginLimitController {
  @Get()
  @AuthRateLimit(ADMIN_LOGIN_RATE_LIMIT)
  ping() {
    return { ok: true };
  }
}

describe('admin login rate limit: the resolver', () => {
  it('defaults to 5 when unset, blank, non-numeric, zero, negative or fractional', () => {
    expect(ADMIN_LOGIN_RATE_LIMIT_DEFAULT).toBe(5);
    for (const raw of [undefined, '', '   ', 'abc', '0', '-3', '2.5', '1e1x']) {
      expect(readAdminLoginRateLimitMax(raw)).toBe(5);
    }
  });

  it('reads a positive whole number', () => {
    expect(readAdminLoginRateLimitMax('3')).toBe(3);
    expect(readAdminLoginRateLimitMax('1000000')).toBe(1_000_000);
  });

  it('keeps the window at 15 minutes', () => {
    expect(ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS).toBe(15 * 60 * 1000);
    expect(ADMIN_LOGIN_RATE_LIMIT.windowMs).toBe(15 * 60 * 1000);
  });

  describe('as the real POST /admin/auth/login handler declares it', () => {
    const saved = process.env[ADMIN_LOGIN_RATE_LIMIT_ENV];
    afterEach(() => {
      if (saved === undefined) delete process.env[ADMIN_LOGIN_RATE_LIMIT_ENV];
      else process.env[ADMIN_LOGIN_RATE_LIMIT_ENV] = saved;
    });

    const handler = AdminAuthController.prototype.login;

    it('declares a per-request function limit and a 15 minute ttl on the auth throttler', () => {
      expect(typeof Reflect.getMetadata('THROTTLER:LIMITauth', handler)).toBe('function');
      expect(Reflect.getMetadata('THROTTLER:TTLauth', handler)).toBe(15 * 60 * 1000);
    });

    it('resolves to 5 with the variable unset or invalid, and picks the variable up at request time', () => {
      const limit = Reflect.getMetadata('THROTTLER:LIMITauth', handler) as () => number;
      delete process.env[ADMIN_LOGIN_RATE_LIMIT_ENV];
      expect(limit()).toBe(5);
      process.env[ADMIN_LOGIN_RATE_LIMIT_ENV] = '3';
      expect(limit()).toBe(3);
      process.env[ADMIN_LOGIN_RATE_LIMIT_ENV] = 'not-a-number';
      expect(limit()).toBe(5);
      process.env[ADMIN_LOGIN_RATE_LIMIT_ENV] = '';
      expect(limit()).toBe(5);
    });
  });
});

describe('admin login rate limit: the real guard', () => {
  const saved = process.env[ADMIN_LOGIN_RATE_LIMIT_ENV];

  afterEach(() => {
    if (saved === undefined) delete process.env[ADMIN_LOGIN_RATE_LIMIT_ENV];
    else process.env[ADMIN_LOGIN_RATE_LIMIT_ENV] = saved;
  });

  async function buildApp(): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({
      imports: [AuthRateLimitModule],
      controllers: [TestAdminLoginLimitController],
      providers: [AuthThrottlerGuard],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    return app;
  }

  async function statuses(app: INestApplication, n: number): Promise<number[]> {
    const out: number[] = [];
    for (let i = 0; i < n; i++) out.push((await request(app.getHttpServer()).get('/test-admin-login-limit')).status);
    return out;
  }

  it('with the variable unset: the 6th attempt in the window is a 429', async () => {
    delete process.env[ADMIN_LOGIN_RATE_LIMIT_ENV];
    const app = await buildApp();
    try {
      expect(await statuses(app, 6)).toEqual([200, 200, 200, 200, 200, 429]);
    } finally {
      await app.close();
    }
  });

  it('with the variable set to 3: the 4th attempt is a 429', async () => {
    process.env[ADMIN_LOGIN_RATE_LIMIT_ENV] = '3';
    const app = await buildApp();
    try {
      expect(await statuses(app, 4)).toEqual([200, 200, 200, 429]);
    } finally {
      await app.close();
    }
  });

  it('with an invalid value: falls back to 5, so the 6th attempt is a 429', async () => {
    process.env[ADMIN_LOGIN_RATE_LIMIT_ENV] = 'lots';
    const app = await buildApp();
    try {
      expect(await statuses(app, 6)).toEqual([200, 200, 200, 200, 200, 429]);
    } finally {
      await app.close();
    }
  });

  it('with a large value: well over 5 attempts pass', async () => {
    process.env[ADMIN_LOGIN_RATE_LIMIT_ENV] = '1000000';
    const app = await buildApp();
    try {
      expect(await statuses(app, 8)).toEqual([200, 200, 200, 200, 200, 200, 200, 200]);
    } finally {
      await app.close();
    }
  });
});
