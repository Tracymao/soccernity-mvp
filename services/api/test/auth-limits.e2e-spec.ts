import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { ResetTokenStore } from '../src/modules/auth/password-reset/reset-token.store';
import { RedisService } from '../src/redis/redis.service';
import { applyRealAuthLimits, authLimitKeys, clearAuthLimitCounters } from './auth-limits';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';

// B-256: auth limits that work on shared school and club networks, against the REAL app, real Postgres and
// real Redis (no mocked provider anywhere), with the real production numbers (applyRealAuthLimits). One IP is
// many by sending X-Forwarded-For with trust proxy on, the same thing a production proxy hop does.
//
// What this proves that the HTTP spec (src/modules/auth/rate-limit/auth-limits/auth-limits.http.spec.ts)
// cannot: the Redis commands themselves (INCR / EXPIRE / DECR / TTL) behave as the limiter assumes, the
// counters really expire, and the real login/register/forgot-password handlers sit behind the interceptor.

const PASSWORD = 'a-real-password-123';
const WRONG = 'definitely-not-the-password';

describe('Auth limits for shared networks (B-256) -- real Postgres + real Redis', () => {
  let app: INestApplication;
  let restoreEnv: () => void;
  let counter = 0;

  beforeAll(async () => {
    restoreEnv = applyRealAuthLimits();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    (app.getHttpAdapter().getInstance() as { set(k: string, v: unknown): void }).set('trust proxy', true);
    await app.init();
  });

  beforeEach(async () => {
    await resetDatabase();
    await clearAuthLimitCounters(app);
  });

  afterAll(async () => {
    await clearAuthLimitCounters(app);
    await app.close();
    restoreEnv();
    await disconnectTestPrismaClient();
  });

  const email = (tag: string) => `limits-${tag}-${Date.now()}-${++counter}@example.com`;

  const register = (ip: string, addr: string) =>
    request(app.getHttpServer())
      .post('/auth/register')
      .set('X-Forwarded-For', ip)
      .send({ countryCode: 'GB', email: addr, password: PASSWORD, displayName: 'Class Member', dateOfBirth: '2000-01-01' });

  const login = (ip: string, addr: string, password: string) =>
    request(app.getHttpServer()).post('/auth/login').set('X-Forwarded-For', ip).send({ email: addr, password });

  const forgot = (ip: string, addr: string) =>
    request(app.getHttpServer()).post('/auth/forgot-password').set('X-Forwarded-For', ip).send({ email: addr });

  it('30 distinct sign-ups from one IP inside 10 minutes all pass; the 31st is limited; another IP is not', async () => {
    for (let i = 0; i < 30; i++) {
      await register('198.51.100.10', email(`signup${i}`)).expect(201);
    }
    const res = await register('198.51.100.10', email('signup30')).expect(429);
    expect(res.body).toEqual({ statusCode: 429, message: 'ThrottlerException: Too Many Requests' });
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(res.headers['retry-after'])).toBeLessThanOrEqual(600);
    await register('198.51.100.11', email('signup-other')).expect(201);
  }, 120_000);

  it('five wrong passwords from IP A lock only IP A out of the account; the owner on IP B still signs in', async () => {
    const addr = email('victim');
    await register('198.51.100.20', addr).expect(201);
    for (let i = 0; i < 5; i++) {
      await login('198.51.100.30', addr, WRONG).expect(401);
    }
    await login('198.51.100.30', addr, WRONG).expect(429);
    await login('198.51.100.30', addr.toUpperCase(), PASSWORD).expect(429);
    await login('198.51.100.31', addr, PASSWORD).expect(200);
  });

  it('the 21st failure for one account across many IPs is limited, for every IP, even with the right password', async () => {
    const addr = email('ceiling');
    await register('198.51.100.21', addr).expect(201);
    for (let i = 1; i <= 20; i++) await login(`198.51.102.${i}`, addr, WRONG).expect(401);
    const res = await login('198.51.102.21', addr, WRONG).expect(429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(res.headers['retry-after'])).toBeLessThanOrEqual(86_400);
    await login('198.51.102.250', addr, PASSWORD).expect(429);
    await login('198.51.102.1', addr, PASSWORD).expect(429);
  }, 120_000);

  it('a completed password reset clears the account ceiling, so the owner can sign in again', async () => {
    const addr = email('reset');
    await register('198.51.100.22', addr).expect(201);
    for (let i = 1; i <= 20; i++) await login(`198.51.103.${i}`, addr, WRONG).expect(401);
    await login('198.51.103.250', addr, PASSWORD).expect(429);

    const user = await getTestPrismaClient().user.findUniqueOrThrow({ where: { email: addr.toLowerCase() } });
    const issued = await app.get(ResetTokenStore, { strict: false }).issue(user.id, 60);
    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .set('X-Forwarded-For', '198.51.103.251')
      .send({ token: issued.token, newPassword: 'a-brand-new-password-456' })
      .expect(200);

    await login('198.51.103.252', addr, 'a-brand-new-password-456').expect(200);
  }, 120_000);

  it('records the once-per-24h lockout-notice claim for a real account and never for an unknown address', async () => {
    const real = email('notice-real');
    const ghost = email('notice-ghost');
    await register('198.51.100.23', real).expect(201);
    for (let i = 0; i < 5; i++) await login('198.51.104.1', real, WRONG).expect(401);
    for (let i = 0; i < 5; i++) await login('198.51.104.2', ghost, WRONG).expect(401);
    // The notifier runs in the background; give it a moment.
    await new Promise((r) => setTimeout(r, 500));
    const client = app.get(RedisService);
    const claims = await client.keys('auth-limit:login-lockout-notice:*');
    expect(claims).toHaveLength(1);
    expect(await client.ttl(claims[0])).toBeGreaterThan(86_000);
    // A second spent pair (another IP) does not make a second claim and cannot reset it.
    for (let i = 0; i < 5; i++) await login('198.51.104.3', real, WRONG).expect(401);
    await new Promise((r) => setTimeout(r, 300));
    expect(await client.keys('auth-limit:login-lockout-notice:*')).toHaveLength(1);
  }, 60_000);

  it('answers an email with no account exactly as it answers a real one (same statuses, same bodies)', async () => {
    const real = email('real');
    const ghost = email('ghost');
    await register('198.51.100.40', real).expect(201);
    const run = async (addr: string) => {
      const out: Array<{ status: number; body: unknown }> = [];
      for (let i = 0; i < 7; i++) {
        const r = await login('198.51.100.41', addr, WRONG);
        out.push({ status: r.status, body: r.body });
      }
      return out;
    };
    const a = await run(real);
    const b = await run(ghost);
    expect(a.map((x) => x.status)).toEqual([401, 401, 401, 401, 401, 429, 429]);
    expect(b).toEqual(a);
  });

  it('10 different emails failing from one IP are not limited', async () => {
    for (let i = 0; i < 10; i++) {
      await login('198.51.100.50', email(`kid${i}`), WRONG).expect(401);
    }
  });

  it('a successful login does not consume the failed-attempt budget', async () => {
    const addr = email('mixed');
    await register('198.51.100.60', addr).expect(201);
    for (let i = 0; i < 4; i++) await login('198.51.100.61', addr, WRONG).expect(401);
    for (let i = 0; i < 12; i++) await login('198.51.100.62', addr, PASSWORD).expect(200);
    // The pair (this email from .61) has had 4 failures: its 5th is allowed, the 6th is limited.
    await login('198.51.100.61', addr, WRONG).expect(401);
    await login('198.51.100.61', addr, WRONG).expect(429);
  });

  it('a per-IP ceiling of 60 logins stops one address spraying many accounts', async () => {
    for (let i = 0; i < 60; i++) {
      await login('198.51.100.70', email(`spray${i}`), WRONG).expect(401);
    }
    await login('198.51.100.70', email('spray60'), WRONG).expect(429);
    await login('198.51.100.71', email('spray61'), WRONG).expect(401);
  }, 120_000);

  it('forgot-password: 3 per hour per email, the same for a real and an unknown address, then 429 for both', async () => {
    const real = email('forgot-real');
    const ghost = email('forgot-ghost');
    await register('198.51.100.80', real).expect(201);
    const run = async (addr: string, ip: string) => {
      const out: Array<{ status: number; body: unknown }> = [];
      for (let i = 0; i < 4; i++) {
        const r = await forgot(`${ip}${i}`, addr);
        out.push({ status: r.status, body: r.body });
      }
      return out;
    };
    const a = await run(real, '198.51.100.9');
    const b = await run(ghost, '198.51.101.9');
    expect(a.map((x) => x.status)).toEqual([200, 200, 200, 429]);
    expect(b).toEqual(a);
  });

  it('counters expire: the keys carry a TTL inside the configured window', async () => {
    await register('198.51.100.90', email('ttl')).expect(201);
    await login('198.51.100.90', email('ttl-login'), WRONG).expect(401);
    const client = app.get(RedisService);
    const keys = await authLimitKeys(app);
    expect(keys.length).toBeGreaterThanOrEqual(3);
    for (const k of keys) {
      const ttl = await client.ttl(k);
      expect(ttl).toBeGreaterThan(0);
      // The longest window is the account-wide login ceiling (24 hours); the pair counter is 15 minutes.
      expect(ttl).toBeLessThanOrEqual(k.includes('login-account') || k.includes('lockout-notice') ? 86_400 : 900);
    }
  });

  it('never stores a raw email or a raw IP in Redis', async () => {
    const addr = email('raw-check');
    await register('203.0.113.55', addr).expect(201);
    await login('203.0.113.55', addr, WRONG).expect(401);
    await forgot('203.0.113.55', addr).expect(200);
    const keys = await authLimitKeys(app);
    expect(keys.length).toBeGreaterThanOrEqual(5);
    for (const k of keys) {
      expect(k).not.toContain(addr.split('@')[0]);
      expect(k).not.toContain('example.com');
      expect(k).not.toContain('203.0.113.55');
    }
  });

  it('leaves the other @AuthRateLimit() routes on the shared limit (reactivate-account: 5 per minute per IP)', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) {
      const r = await request(app.getHttpServer())
        .post('/auth/reactivate-account')
        .set('X-Forwarded-For', '198.51.100.95')
        .send({ email: email('react'), password: WRONG });
      statuses.push(r.status);
    }
    // The shared 'auth' throttler is untouched by test/env.ts in the Jest layer: its default is 5 per 60 s, so
    // the sixth call from one IP is a 429.
    expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(5).every((s) => s === 429)).toBe(true);
  });
});
