import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AdminAuthController } from '../src/modules/admin/admin-auth.controller';
import { PasswordService } from '../src/modules/auth/password/password.service';
import { applyRealAuthLimits, clearAuthLimitCounters } from './auth-limits';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';

// Decision Log #190 — POST /admin/auth/login has its own stricter limit
// (5 attempts per 15 minutes) via a per-handler @Throttle() override.
//
// Each test builds its own app instance: @nestjs/throttler keeps buckets
// in memory for the lifetime of one app, so a shared app would let one
// test's real HTTP calls leak into another test's budget.

const ADMIN_PASSWORD = 'a-real-admin-password-123';
const WRONG_PASSWORD = 'definitely-not-the-password';
const ADMIN_LIMIT = 5;

describe('Admin login rate limit (Decision Log #190)', () => {
  let app: INestApplication;
  let adminEmail: string;
  let restoreAuthLimits: () => void;
  let userLoginEmail: string;

  // /auth/login is no longer behind the shared 5-per-60s throttler (B-256): its limit is a per-account failed-attempt
  // budget kept in Redis, relaxed for the whole Jest layer in test/env.ts. This spec drives that user-facing route
  // into its own 429, so it runs with the real numbers.
  beforeAll(() => {
    restoreAuthLimits = applyRealAuthLimits();
  });

  beforeEach(async () => {
    await resetDatabase();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    await clearAuthLimitCounters(app);

    // A fresh address per test: the failed-attempt counter lives in Redis and outlives the app instance.
    userLoginEmail = `nobody-here-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    adminEmail = `rate-limit-admin-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    await getTestPrismaClient().adminUser.create({
      data: {
        email: adminEmail,
        passwordHash: await app.get(PasswordService).hash(ADMIN_PASSWORD),
        fullName: 'Rate Limit Admin',
        role: 'moderator',
      },
    });
  });

  afterEach(async () => {
    await app.close();
  });

  afterAll(async () => {
    restoreAuthLimits();
    await disconnectTestPrismaClient();
  });

  function postAdminLogin(password: string) {
    return request(app.getHttpServer())
      .post('/admin/auth/login')
      .send({ email: adminEmail, password });
  }

  function postUserLogin() {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: userLoginEmail, password: WRONG_PASSWORD });
  }

  it('locks the admin login route out on the 6th attempt within the window, even with the correct password', async () => {
    for (let i = 0; i < ADMIN_LIMIT; i++) {
      await postAdminLogin(WRONG_PASSWORD).expect(401);
    }
    await postAdminLogin(ADMIN_PASSWORD).expect(429);
  });

  it('is unaffected by exhausting the user-facing /auth/login budget', async () => {
    // Drive the User-facing route into its own 429 first.
    let userLockedOut = false;
    for (let i = 0; i < 30 && !userLockedOut; i++) {
      const res = await postUserLogin();
      userLockedOut = res.status === 429;
    }
    expect(userLockedOut).toBe(true);

    // The admin route still gets its full, untouched budget.
    for (let i = 0; i < ADMIN_LIMIT; i++) {
      await postAdminLogin(WRONG_PASSWORD).expect(401);
    }
    await postAdminLogin(WRONG_PASSWORD).expect(429);
  });

  it('does not let admin login attempts consume the user-facing /auth/login budget', async () => {
    for (let i = 0; i < ADMIN_LIMIT; i++) {
      await postAdminLogin(WRONG_PASSWORD).expect(401);
    }
    await postAdminLogin(WRONG_PASSWORD).expect(429);

    // The User-facing route's first attempt is nowhere near its limit.
    await postUserLogin().expect(401);
  });

  it('declares a 5-attempt / 15-minute throttle on the admin login handler', () => {
    const handler = AdminAuthController.prototype.login;
    expect(Reflect.getMetadata('THROTTLER:LIMITauth', handler)).toBe(ADMIN_LIMIT);
    expect(Reflect.getMetadata('THROTTLER:TTLauth', handler)).toBe(15 * 60 * 1000);
  });
});
