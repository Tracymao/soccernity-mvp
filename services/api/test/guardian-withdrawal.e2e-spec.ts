import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { RegistrationEmailService } from '../src/modules/auth/registration/email/registration-email.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { seedDob } from './dob-seed';

// B-112 / B-225 (Decision Log #414 item 1, #403 item 15, #395 B3).
//
// Real Postgres, the real throttler and the real RegistrationEmailService
// (only the final dispatch step is observed, so nothing is sent). Why this
// needs the whole app rather than the mocked suites:
//   - the throttle is a property of how the guard, the per-route override
//     and the configuration compose inside a really-bootstrapped app, and the
//     "no countdown" claim is about real response headers;
//   - "identical response whether or not an account matched" has to hold
//     across real rows (no user, a user with no guardian, a pending guardian,
//     a confirmed guardian), not mocks that return what the test tells them to;
//   - the emailed links are built from the real WEB_APP_BASE_URL and the token
//     the database actually holds.
//
// Users and guardians are seeded directly via Prisma, the suite's established
// workaround for the shared 'auth' bucket on POST /auth/register.

async function createApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  return app;
}

function setEnv(values: Record<string, string>): () => void {
  const prior: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(values)) {
    prior[k] = process.env[k];
    process.env[k] = v;
  }
  return () => {
    for (const [k, v] of Object.entries(prior)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
}

let seq = 0;
async function seedUser(opts: { minor: boolean; guardianStatus?: 'pending' | 'confirmed' }) {
  const prisma = getTestPrismaClient();
  const suffix = `${Date.now()}-${++seq}`;
  const email = `e2e-wd-${suffix}@example.com`;
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: 'unused',
      displayName: 'E2E Withdrawal',
      dateOfBirth: seedDob(opts.minor ? '2014-05-02' : '1990-05-02'),
      isMinor: opts.minor,
    },
  });
  let guardianId: string | undefined;
  if (opts.guardianStatus) {
    const g = await prisma.guardian.create({
      data: {
        minorUserId: user.id,
        name: 'E2E Guardian',
        email: `e2e-wd-guardian-${suffix}@example.com`,
        relationship: 'Parent',
        consentStatus: opts.guardianStatus,
        consentToken: `wd-consent-${suffix}`,
        consentTokenExpiresAt: new Date(Date.now() + 48 * 3600 * 1000),
        consentTimestamp: opts.guardianStatus === 'confirmed' ? new Date() : null,
      },
    });
    guardianId = g.id;
  }
  return { userId: user.id, email, guardianId };
}

describe('Guardian withdrawal e2e: identical responses and emailed links (real Postgres)', () => {
  let app: INestApplication;
  let restoreEnv: () => void;
  let withdrawalEmailSpy: jest.SpyInstance;
  let dispatchSpy: jest.SpyInstance;

  beforeAll(async () => {
    // High limits: this block is about responses and links, not the throttle
    // (that is the next block, on its own app and its own counters).
    restoreEnv = setEnv({
      GUARDIAN_WITHDRAWAL_RATE_LIMIT_MAX: '1000',
      AUTH_RATE_LIMIT_MAX: '1000',
      WEB_APP_BASE_URL: 'http://localhost:5173',
    });
    app = await createApp();
  });
  beforeEach(async () => {
    await resetDatabase();
    // The real method runs (it stores/reads nothing itself); only the private
    // dispatch step is replaced so no email leaves and its payload can be read.
    dispatchSpy = jest.spyOn(RegistrationEmailService.prototype as any, 'dispatch').mockResolvedValue(undefined);
    withdrawalEmailSpy = jest.spyOn(RegistrationEmailService.prototype, 'sendGuardianWithdrawalRequestEmail');
  });
  afterEach(() => {
    dispatchSpy.mockRestore();
    withdrawalEmailSpy.mockRestore();
  });
  afterAll(async () => {
    await app.close();
    restoreEnv();
    await disconnectTestPrismaClient();
  });

  it('answers /withdraw/request identically for an unknown address, a user with no guardian, a pending request and a confirmed one', async () => {
    const noGuardian = await seedUser({ minor: false });
    const pending = await seedUser({ minor: true, guardianStatus: 'pending' });
    const confirmed = await seedUser({ minor: true, guardianStatus: 'confirmed' });

    const emails = ['nobody-at-all@example.com', noGuardian.email, pending.email, confirmed.email];
    const responses = [];
    for (const email of emails) {
      const res = await request(app.getHttpServer()).post('/auth/guardian-consent/withdraw/request').send({ email });
      responses.push({ status: res.status, body: res.body, contentType: res.headers['content-type'] });
    }

    expect(responses[0].status).toBe(200);
    for (const r of responses) expect(r).toEqual(responses[0]);
    expect(responses[0].body).toEqual({
      message: 'If that account has confirmed guardian consent, a withdrawal link has been sent to the guardian.',
    });

    // The only observable difference is the email to the real guardian: the
    // response itself carries no trace of which case this was.
    expect(withdrawalEmailSpy).toHaveBeenCalledTimes(1);
    const prisma = getTestPrismaClient();
    expect((await prisma.guardian.findUnique({ where: { id: confirmed.guardianId } }))?.withdrawalToken).toEqual(expect.any(String));
    expect((await prisma.guardian.findUnique({ where: { id: pending.guardianId } }))?.withdrawalToken).toBeNull();
  });

  it('rejects any malformed email with the same 400, before any account lookup', async () => {
    const a = await request(app.getHttpServer()).post('/auth/guardian-consent/withdraw/request').send({ email: 'not-an-email' });
    const b = await request(app.getHttpServer()).post('/auth/guardian-consent/withdraw/request').send({ email: 'also bad' });
    expect(a.status).toBe(400);
    expect(a.body.statusCode).toBe(b.body.statusCode);
  });

  it('emails the guardian a link with the single-use token as ?token= and keeps the code in the body', async () => {
    const confirmed = await seedUser({ minor: true, guardianStatus: 'confirmed' });

    await request(app.getHttpServer()).post('/auth/guardian-consent/withdraw/request').send({ email: confirmed.email }).expect(200);

    const prisma = getTestPrismaClient();
    const token = (await prisma.guardian.findUnique({ where: { id: confirmed.guardianId } }))!.withdrawalToken!;
    const sent = dispatchSpy.mock.calls.map((c) => c[0]).find((e) => e.template === 'guardian-consent-withdrawal-request');
    expect(sent).toBeDefined();
    expect(sent.data.link).toBe(`http://localhost:5173/guardian-consent/withdraw?token=${token}`);
    expect(sent.data.withdrawalToken).toBe(token);

    // And that token really is the credential the second route accepts.
    await request(app.getHttpServer()).post('/auth/guardian-consent/withdraw').send({ withdrawalToken: token }).expect(200);
    expect((await prisma.user.findUnique({ where: { id: confirmed.userId } }))?.accountStatus).toBe('pending_deletion');
  });

  it('the guardian consent email links the withdrawal request page without a token', async () => {
    const pending = await seedUser({ minor: true, guardianStatus: 'pending' });

    // The real resend path sends the real consent email.
    await request(app.getHttpServer()).post('/auth/guardian-consent/resend').send({ email: pending.email }).expect(200);

    const sent = dispatchSpy.mock.calls.map((c) => c[0]).find((e) => e.template === 'guardian-consent');
    expect(sent).toBeDefined();
    expect(sent.data.link).toMatch(/^http:\/\/localhost:5173\/guardian-consent\/confirm\?token=/);
    expect(sent.data.withdrawalPageLink).toBe('http://localhost:5173/guardian-consent/withdraw');
  });
});

describe('Guardian withdrawal e2e: throttle (real throttler, real HTTP)', () => {
  let app: INestApplication;
  let restoreEnv: () => void;
  let dispatchSpy: jest.SpyInstance;

  beforeAll(async () => {
    // 3 attempts per 2 seconds. The window is short only so the test can prove
    // it reopens; the production default (5 per 15 minutes) is in the unit spec.
    restoreEnv = setEnv({
      GUARDIAN_WITHDRAWAL_RATE_LIMIT_MAX: '3',
      GUARDIAN_WITHDRAWAL_RATE_LIMIT_WINDOW_MS: '2000',
      // Far above the withdrawal limit: proves the withdrawal routes are not
      // governed by the shared 'auth' bucket any more.
      AUTH_RATE_LIMIT_MAX: '1000',
    });
    app = await createApp();
    await resetDatabase();
    dispatchSpy = jest.spyOn(RegistrationEmailService.prototype as any, 'dispatch').mockResolvedValue(undefined);
  });
  afterAll(async () => {
    dispatchSpy.mockRestore();
    await app.close();
    restoreEnv();
    await disconnectTestPrismaClient();
  });

  it('blocks the request route on the configured attempt, with "Too many attempts" and no countdown, then reopens after the window', async () => {
    const server = app.getHttpServer();
    for (let i = 0; i < 3; i++) {
      await request(server).post('/auth/guardian-consent/withdraw/request').send({ email: 'someone@example.com' }).expect(200);
    }

    const blocked = await request(server).post('/auth/guardian-consent/withdraw/request').send({ email: 'someone@example.com' });
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ statusCode: 429, message: 'Too many attempts' });
    const names = Object.keys(blocked.headers).map((h) => h.toLowerCase());
    expect(names.filter((h) => h.startsWith('retry-after') || h.startsWith('x-ratelimit'))).toEqual([]);

    await new Promise((r) => setTimeout(r, 2200));
    await request(server).post('/auth/guardian-consent/withdraw/request').send({ email: 'someone@example.com' }).expect(200);
  });

  it('throttles the confirm route on its own counter, the same way, and a blocked attempt cannot withdraw anything', async () => {
    const server = app.getHttpServer();
    // Counted per route: the request route being spent above does not matter.
    const first = await request(server).post('/auth/guardian-consent/withdraw').send({ withdrawalToken: 'nope' });
    expect(first.status).toBe(400);
    expect(Object.keys(first.headers).map((h) => h.toLowerCase()).filter((h) => h.startsWith('x-ratelimit') || h.startsWith('retry-after'))).toEqual([]);
    for (let i = 0; i < 2; i++) {
      await request(server).post('/auth/guardian-consent/withdraw').send({ withdrawalToken: 'nope' }).expect(400);
    }

    const blocked = await request(server).post('/auth/guardian-consent/withdraw').send({ withdrawalToken: 'nope' });
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ statusCode: 429, message: 'Too many attempts' });
  });

  it('does not touch other auth routes: they keep the shared auth limit', async () => {
    const server = app.getHttpServer();
    // /resend is still on the shared 'auth' bucket (limit 1000 here), so more
    // than the withdrawal limit of 3 goes straight through.
    for (let i = 0; i < 5; i++) {
      await request(server).post('/auth/guardian-consent/resend').send({ email: 'someone@example.com' }).expect(200);
    }
  });
});
