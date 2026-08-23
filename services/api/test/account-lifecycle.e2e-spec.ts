import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PasswordService } from '../src/modules/auth/password/password.service';
import { TokenService } from '../src/modules/auth/token/token.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';

// Real-Postgres coverage for sprint-1/f5-f6-missing-endpoints's
// change-password / deactivate-account / delete-account /
// reactivate-account endpoints -- specifically the round trip the task
// brief calls out as the required minimum: deactivate -> login fails ->
// reactivate -> login succeeds. AuthService.login/deactivateAccount/
// reactivateAccount/deleteAccount are all plain Prisma reads/updates (no
// raw SQL, no transaction/isolation-level reasoning, no novel relation),
// so per test/README.md's guiding principle this wouldn't normally
// need its own e2e file -- it exists specifically because the brief for
// this PR asked for real-Postgres coverage of this exact round trip, not
// because a mocked unit test (already present in auth.service.spec.ts)
// was found insufficient.
//
// Both describe blocks below get their OWN app instance (own beforeAll),
// not a single shared one -- deliberately, so each gets its own fresh,
// in-memory AuthThrottlerGuard bucket. login/reactivate-account both
// carry @AuthRateLimit() (a single shared 'auth' named-throttler bucket,
// 5 requests/60s by default -- see rate-limit.constants.ts and
// auth/README.md's config-wiring-fix entry), so this file is careful to
// budget how many real HTTP calls to those two routes each block makes,
// the same real, already-documented constraint
// feed-reactions.e2e-spec.ts/follow.e2e-spec.ts/clubs.e2e-spec.ts hit
// for POST /auth/register specifically. change-password/
// deactivate-account/delete-account carry no @AuthRateLimit() at all
// (JwtAuthGuard only), so calls to those three are unlimited within a
// test.
describe('Account lifecycle e2e: deactivate -> login fails -> reactivate -> login succeeds (real Postgres)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await app.close();
    await disconnectTestPrismaClient();
  });

  function uniqueEmail(label: string): string {
    return `e2e-account-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  }

  // Seeds a User row directly via Prisma with a REAL argon2id hash (via
  // the app's own PasswordService, not a placeholder string) -- unlike
  // follow.e2e-spec.ts/feed-reactions.e2e-spec.ts's createUser() helpers,
  // this file's tests genuinely verify password correctness through
  // login/reactivate-account, so a real, verifiable hash is required, not
  // an "unused-in-this-e2e-spec-file" stand-in. Bypasses POST
  // /auth/register's own real HTTP path (already fully covered by
  // auth.e2e-spec.ts) so this file's own real HTTP budget is spent
  // entirely on the login/deactivate/reactivate round trip under test.
  async function createUser(label: string, password: string): Promise<{ userId: string; email: string }> {
    const prisma = getTestPrismaClient();
    const passwordService = app.get(PasswordService);
    const email = uniqueEmail(label);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await passwordService.hash(password),
        displayName: `E2E Account Lifecycle User ${label}`,
        dateOfBirth: new Date('1998-07-04'), // adult, no guardian-consent branch
        isMinor: false,
      },
    });
    return { userId: user.id, email };
  }

  it('deactivates on password re-entry, blocks login, reactivates, and lets login succeed again -- with a real change-password round trip on top', async () => {
    const password = 'the-real-password-123';
    const { userId, email } = await createUser('round-trip', password);

    // Baseline: accountStatus really is "active" by default (the
    // migration's own column default, not assumed).
    const prisma = getTestPrismaClient();
    const initial = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(initial.accountStatus).toBe('active');

    // Need a real access/refresh token pair to call the
    // JwtAuthGuard-protected deactivate-account endpoint and to prove
    // deactivation revokes it -- minted directly via the app's own real
    // TokenService (not a real HTTP /auth/login call) so this doesn't
    // spend any of this test's limited @AuthRateLimit() budget (the
    // 'auth' named-throttler bucket is shared across login/
    // reactivate-account below, 5 requests/60s by default -- see this
    // file's header comment). Still the real, unmocked TokenService the
    // app itself would use for a real login.
    const tokenService = app.get(TokenService);
    const initialTokenPair = await tokenService.issueTokenPair(userId, 'fan');
    const initialAccessToken = initialTokenPair.accessToken.token;

    // --- deactivate ---
    await request(app.getHttpServer())
      .post('/auth/deactivate-account')
      .set('Authorization', `Bearer ${initialAccessToken}`)
      .send({ password })
      .expect(204);

    const afterDeactivate = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(afterDeactivate.accountStatus).toBe('deactivated');

    // Deactivation must revoke existing sessions, not just block future
    // logins -- the just-issued refresh token must no longer be usable.
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: initialTokenPair.refreshToken.token })
      .expect(401);

    // --- login fails, with a distinct message (not the generic one) ---
    const failedLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(401);
    expect(failedLogin.body.message).toMatch(/deactivated/i);

    // --- reactivate ---
    const reactivateResponse = await request(app.getHttpServer())
      .post('/auth/reactivate-account')
      .send({ email, password })
      .expect(200);
    expect(reactivateResponse.body.accessToken).toEqual(expect.any(String));
    expect(reactivateResponse.body.user.id).toBe(userId);

    const afterReactivate = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(afterReactivate.accountStatus).toBe('active');

    // --- login succeeds again ---
    const secondLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    const secondAccessToken = secondLogin.body.accessToken as string;

    // --- change-password, real argon2id round trip against real Postgres ---
    const newPassword = 'a-brand-new-password-456';
    await request(app.getHttpServer())
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${secondAccessToken}`)
      .send({ currentPassword: password, newPassword })
      .expect(204);

    const afterPasswordChange = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(afterPasswordChange.passwordHash).not.toBe(afterReactivate.passwordHash);
    expect(afterPasswordChange.passwordHash.startsWith('$argon2id$')).toBe(true);

    // The new password genuinely works against the real, freshly-hashed
    // value stored in Postgres.
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: newPassword })
      .expect(200);
  });
});

describe('Account lifecycle e2e: delete-account (pending_deletion) is not undone by reactivate-account (real Postgres)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await app.close();
    await disconnectTestPrismaClient();
  });

  function uniqueEmail(label: string): string {
    return `e2e-account-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  }

  async function createUser(label: string, password: string): Promise<{ userId: string; email: string }> {
    const prisma = getTestPrismaClient();
    const passwordService = app.get(PasswordService);
    const email = uniqueEmail(label);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await passwordService.hash(password),
        displayName: `E2E Account Lifecycle User ${label}`,
        dateOfBirth: new Date('1998-07-04'),
        isMinor: false,
      },
    });
    return { userId: user.id, email };
  }

  it('deleting an account sets pending_deletion (never removes the row), and reactivate-account genuinely refuses to undo it', async () => {
    const password = 'the-real-password-789';
    const { userId, email } = await createUser('delete', password);

    const prisma = getTestPrismaClient();
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    const accessToken = login.body.accessToken as string;

    await request(app.getHttpServer())
      .post('/auth/delete-account')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ password })
      .expect(204);

    // Hard requirement from this PR's brief: no hard delete. The row is
    // still there, still findable, only its accountStatus changed --
    // proven directly against Postgres, not inferred from the 204.
    const afterDelete = await prisma.user.findUnique({ where: { id: userId } });
    expect(afterDelete).not.toBeNull();
    expect(afterDelete!.accountStatus).toBe('pending_deletion');
    expect(afterDelete!.email).toBe(email.toLowerCase());

    // reactivate-account must NOT flip a pending_deletion account back to
    // active -- rejected with the same generic message an unknown
    // email/wrong password gets.
    const reactivateAttempt = await request(app.getHttpServer())
      .post('/auth/reactivate-account')
      .send({ email, password })
      .expect(401);
    expect(reactivateAttempt.body.message).toBe('Invalid credentials');

    // Still pending_deletion -- the rejected reactivate attempt above had
    // zero side effects on accountStatus.
    const stillPendingDeletion = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(stillPendingDeletion.accountStatus).toBe('pending_deletion');

    // A normal login is also still rejected.
    await request(app.getHttpServer()).post('/auth/login').send({ email, password }).expect(401);
  });
});
