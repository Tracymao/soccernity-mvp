import { Body, Controller, HttpCode, INestApplication, Post, UnauthorizedException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { RedisService } from '../../../../redis/redis.service';
import { AuthLimit } from './auth-limits.interceptor';
import { AuthLimitsModule } from './auth-limits.module';
import { AuthLimitsStore } from './auth-limits.store';

// The REAL AuthLimitsModule (interceptor, service, store) driven over HTTP against an in-memory stand-in for
// Redis, in front of three stub handlers. The handlers know nothing about accounts: login "succeeds" for the
// password 'right', and forgot-password answers the same for every address -- which is exactly the point, the
// limiter's answer must not depend on the account.
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
}

async function buildApp(redis: FakeRedis, env: Record<string, string> = {}): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => ({ ...env })] }), AuthLimitsModule],
    controllers: [StubAuthController],
  })
    .overrideProvider(RedisService)
    .useValue(redis)
    .compile();
  const app = moduleRef.createNestApplication();
  // Take the client address from X-Forwarded-For so one test process can play many IPs.
  (app.getHttpAdapter().getInstance() as { set(k: string, v: unknown): void }).set('trust proxy', true);
  await app.init();
  return app;
}

const post = (app: INestApplication, path: string, ip: string, body: object) =>
  request(app.getHttpServer()).post(`/t/${path}`).set('X-Forwarded-For', ip).send(body);

describe('auth limits for shared networks (B-256)', () => {
  let app: INestApplication;
  let redis: FakeRedis;

  beforeEach(async () => {
    redis = new FakeRedis();
    app = await buildApp(redis);
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

  describe('login', () => {
    it('limits the sixth FAILED login for one email, even when the guesses come from different IPs', async () => {
      for (let i = 0; i < 5; i++) {
        await post(app, 'login', `10.1.0.${i + 1}`, { email: 'Victim@x.com', password: 'wrong' }).expect(401);
      }
      // Normalised: different casing/whitespace is the same account budget. Even the right password is refused.
      await post(app, 'login', '10.1.0.99', { email: ' victim@X.com ', password: 'right' }).expect(429);
    });

    it('does the same for an email that has no account (no way to tell registered addresses apart)', async () => {
      const outcomes = async (email: string) => {
        const seen: number[] = [];
        for (let i = 0; i < 7; i++) seen.push((await post(app, 'login', '10.2.0.1', { email, password: 'wrong' })).status);
        return seen;
      };
      // The stub has no accounts at all; both addresses behave identically.
      expect(await outcomes('real@x.com')).toEqual([401, 401, 401, 401, 401, 429, 429]);
      expect(await outcomes('ghost@x.com')).toEqual([401, 401, 401, 401, 401, 429, 429]);
    });

    it('does not limit 10 different emails failing from one IP', async () => {
      for (let i = 0; i < 10; i++) {
        await post(app, 'login', '10.3.0.1', { email: `kid${i}@school.example`, password: 'wrong' }).expect(401);
      }
    });

    it('does not let successful logins consume the failed-attempt budget', async () => {
      for (let i = 0; i < 4; i++) await post(app, 'login', '10.4.0.1', { email: 'a@x.com', password: 'wrong' }).expect(401);
      for (let i = 0; i < 20; i++) await post(app, 'login', '10.4.0.2', { email: 'a@x.com', password: 'right' }).expect(200);
      // 4 failures so far: the 5th is still allowed, the 6th is limited.
      await post(app, 'login', '10.4.0.3', { email: 'a@x.com', password: 'wrong' }).expect(401);
      await post(app, 'login', '10.4.0.3', { email: 'a@x.com', password: 'wrong' }).expect(429);
    });

    it('does not let 20 parallel guesses at one account slip under the limit', async () => {
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

    it('ignores a non-string email for the account key (validation rejects it later)', async () => {
      await post(app, 'login', '10.7.0.1', { email: { $ne: 1 }, password: 'right' }).expect(200);
      expect([...redis.counts.keys()].some((k) => k.includes('login-failed'))).toBe(false);
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
    await post(app, 'login', '203.0.113.77', { email: 'secret.person@school.example', password: 'wrong' }).expect(401);
    await post(app, 'forgot', '203.0.113.77', { email: 'secret.person@school.example' }).expect(200);
    await post(app, 'register', '203.0.113.77', { email: 'secret.person@school.example' }).expect(201);
    const keys = [...redis.counts.keys()];
    expect(keys.length).toBeGreaterThanOrEqual(5);
    for (const k of keys) {
      expect(k.startsWith('auth-limit:')).toBe(true);
      expect(k).not.toContain('secret.person');
      expect(k).not.toContain('school.example');
      expect(k).not.toContain('203.0.113.77');
    }
  });

  it('FAILS OPEN when Redis is unavailable: requests proceed unlimited and the failure is reported once', async () => {
    redis.failing = true;
    const store = app.get(AuthLimitsStore);
    const logSpy = jest.spyOn((store as unknown as { logger: { error(m: string): void } }).logger, 'error').mockImplementation(() => undefined);
    for (let i = 0; i < 12; i++) {
      await post(app, 'login', '10.10.0.1', { email: 'x@x.com', password: 'wrong' }).expect(401);
      await post(app, 'register', '10.10.0.1', {}).expect(201);
      await post(app, 'forgot', '10.10.0.1', { email: 'x@x.com' }).expect(200);
    }
    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it('heals a counter that has no expiry so nobody is locked out forever', async () => {
    redis.counts.set(`auth-limit:signup-ip:${require('crypto').createHash('sha256').update('10.11.0.1').digest('hex')}`, 29);
    await post(app, 'register', '10.11.0.1', {}).expect(201);
    expect([...redis.ttls.values()]).toEqual([600]);
  });

  it('reads its numbers from the environment', async () => {
    await app.close();
    app = await buildApp(redis, { AUTH_SIGNUP_RATE_LIMIT_MAX: '2', AUTH_SIGNUP_RATE_LIMIT_WINDOW_MS: '30000' });
    await post(app, 'register', '10.12.0.1', {}).expect(201);
    await post(app, 'register', '10.12.0.1', {}).expect(201);
    const res = await post(app, 'register', '10.12.0.1', {}).expect(429);
    expect(Number(res.headers['retry-after'])).toBe(30);
  });
});
