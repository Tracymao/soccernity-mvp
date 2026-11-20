import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { EmailVerificationTokenStore } from '../src/modules/auth/registration/email-verification/email-verification-token.store';
import { RESEND_VERIFICATION_GENERIC_MESSAGE } from '../src/modules/auth/registration/email-verification/resend-verification.service';
import { RESEND_VERIFICATION_MAX_PER_WINDOW } from '../src/modules/auth/registration/email-verification/resend-verification.limiter';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { seedDob } from './dob-seed';

// B-128 (Decision Log #406 item 3) against real Postgres and Redis and the
// really-bootstrapped app: POST /auth/resend-verification-email.
//
// Rate limiting: the route carries @AuthRateLimit() (shared 5 requests / 60 s
// per app instance), so each describe block gets its own app and stays at or
// under five rate-limited calls.

async function createApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  return app;
}

async function createUser(label: string, over: { verificationStatus?: string; accountStatus?: string } = {}) {
  const user = await getTestPrismaClient().user.create({
    data: {
      email: `e2e-resend-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      passwordHash: 'unused-hash-value',
      displayName: `E2E Resend ${label}`,
      dateOfBirth: seedDob('1995-05-05'),
      isMinor: false,
      verificationStatus: over.verificationStatus ?? 'unverified',
      accountStatus: over.accountStatus ?? 'active',
    },
  });
  return { id: user.id, email: user.email };
}

// Records the tokens the real store issues, without replacing it.
function spyOnIssue(app: INestApplication) {
  const store = app.get(EmailVerificationTokenStore, { strict: false });
  const issued: string[] = [];
  const original = store.issue.bind(store);
  const spy = jest.spyOn(store, 'issue').mockImplementation(async (...args) => {
    const token = await original(...args);
    issued.push(token);
    return token;
  });
  return { issued, spy };
}

describe('Resend verification email e2e: the working path and the cap (B-128)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createApp();
  });
  beforeEach(async () => {
    await resetDatabase();
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    await app.close();
    await disconnectTestPrismaClient();
  });

  it('issues a REAL single-use link that verifies the account (rate-limited call 1)', async () => {
    const u = await createUser('works');
    const { issued } = spyOnIssue(app);

    const res = await request(app.getHttpServer())
      .post('/auth/resend-verification-email')
      .send({ email: u.email.toUpperCase() })
      .expect(200);
    expect(res.body).toEqual({ message: RESEND_VERIFICATION_GENERIC_MESSAGE });
    expect(issued).toHaveLength(1);

    // The token really verifies the account.
    await request(app.getHttpServer()).post('/auth/verify-email').send({ token: issued[0] }).expect(200);
    const after = await getTestPrismaClient().user.findUniqueOrThrow({ where: { id: u.id } });
    expect(after.verificationStatus).toBe('verified');

    // Single-use.
    await request(app.getHttpServer()).post('/auth/verify-email').send({ token: issued[0] }).expect(400);
  });

  it('sends at most 3 per hour per account, then stays silent with the SAME response (rate-limited calls 2-5)', async () => {
    const u = await createUser('cap');
    const { issued } = spyOnIssue(app);

    const bodies: unknown[] = [];
    for (let i = 0; i < RESEND_VERIFICATION_MAX_PER_WINDOW + 1; i++) {
      const res = await request(app.getHttpServer())
        .post('/auth/resend-verification-email')
        .send({ email: u.email })
        .expect(200);
      bodies.push(res.body);
    }

    expect(issued).toHaveLength(RESEND_VERIFICATION_MAX_PER_WINDOW);
    // The over-cap call is indistinguishable from the others.
    expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1);
  });
});

describe('Resend verification email e2e: non-enumeration (B-128)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createApp();
  });
  beforeEach(async () => {
    await resetDatabase();
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    await app.close();
    await disconnectTestPrismaClient();
  });

  it('answers identically for an unverified account, an unknown address, a verified account and a closed account; sends only for the first', async () => {
    const unverified = await createUser('unverified');
    const verified = await createUser('verified', { verificationStatus: 'verified' });
    const closing = await createUser('closing', { accountStatus: 'pending_deletion' });
    const { issued } = spyOnIssue(app);

    // 4 rate-limited calls.
    const answers = [];
    for (const email of [unverified.email, 'nobody-at-all@example.com', verified.email, closing.email]) {
      const res = await request(app.getHttpServer()).post('/auth/resend-verification-email').send({ email });
      answers.push({ status: res.status, body: res.body });
    }

    expect(answers.map((a) => a.status)).toEqual([200, 200, 200, 200]);
    expect(new Set(answers.map((a) => JSON.stringify(a.body))).size).toBe(1);
    // Only the genuinely unverified, active account was sent a link.
    expect(issued).toHaveLength(1);
  });
});
