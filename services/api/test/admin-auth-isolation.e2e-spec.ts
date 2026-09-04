import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PasswordService } from '../src/modules/auth/password/password.service';
import { TokenService } from '../src/modules/auth/token/token.service';
import { AdminTokenService } from '../src/modules/admin/token/admin-token.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';

// ---------------------------------------------------------------------
// Decision Log #54 (Build Plan Section 9) — sprint-2/admin-console-account-entity.
//
// WHY THIS FILE EXISTS AS A REAL E2E SPEC, not just mocked unit tests:
// this PR's brief explicitly required PROVING, not just arguing, that a
// User access/refresh token can never authenticate as an admin and vice
// versa. That's a genuine property of the whole, really-bootstrapped DI
// graph — two independently-configured JwtService instances (one per
// ADMIN_JWT_SECRET/JWT_SECRET, both wired via AppModule) and two
// independently-namespaced Redis-backed refresh-token stores actually
// being unable to validate/consume each other's tokens end to end
// through the real HTTP -> guard -> service chain. The
// AdminTokenService/AdminJwtAuthGuard/AdminRefreshTokenStore *.spec.ts
// files already prove this at the unit layer (constructing both a
// User-secret and an admin-secret JwtService side by side); this file
// proves it against the actual, single, really-bootstrapped AppModule —
// the only place a real accidental collision between the two
// registrations could hide. This also incidentally exercises AdminUser's
// real unique-email constraint and real argon2id hashing against a live
// Postgres row for the first time.
//
// No AdminUser self-registration endpoint exists (by design — see
// admin/README.md), so this file seeds AdminUser rows directly via
// Prisma, the same precedent clubs.e2e-spec.ts already set for ClubPage.
//
// THREE describe blocks, each with its OWN app instance — mirroring
// account-lifecycle.e2e-spec.ts's own established precedent exactly (see
// that file's header comment): POST /admin/auth/login is
// @AuthRateLimit()-decorated, sharing @nestjs/throttler's in-memory
// storage for the lifetime of one app instance, so a shared app across
// this whole file would accumulate real HTTP login calls across every
// test and risk hitting the default 5-requests/60s limit well before
// this file's own coverage goal is met. Giving each block its own app
// instance resets that in-memory bucket. Within each block, real HTTP
// calls to /admin/auth/login (or /auth/register, /auth/login for the
// User side) are spent ONLY on tests that are actually about login
// itself; every other test mints a real token directly via
// app.get(AdminTokenService) / app.get(TokenService) — the exact same
// "don't spend rate-limit budget on setup, only on what's under test"
// principle account-lifecycle.e2e-spec.ts's own createUser() helper
// documents.
// ---------------------------------------------------------------------

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

describe('Admin Console e2e: login round trip, profile, and change-password revocation', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
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

  async function seedAdmin(overrides: {
    password: string;
    fullName?: string;
    role?: string;
    accountStatus?: string;
  }) {
    const prisma = getTestPrismaClient();
    const passwordService = app.get(PasswordService);
    const email = uniqueEmail('e2e-admin');
    const admin = await prisma.adminUser.create({
      data: {
        email,
        passwordHash: await passwordService.hash(overrides.password),
        fullName: overrides.fullName ?? 'E2E Test Admin',
        role: overrides.role ?? 'moderator',
        accountStatus: overrides.accountStatus ?? 'active',
      },
    });
    return { admin, email };
  }

  it('logs an admin in via real HTTP, views/edits their own profile, and change-password revokes every other real session', async () => {
    const password = 'a-real-admin-password-123';
    const { admin, email } = await seedAdmin({ password, fullName: 'Original Admin Name', role: 'superadmin' });

    // Real HTTP login call #1 — proves login itself, end to end.
    const loginResponse = await request(app.getHttpServer())
      .post('/admin/auth/login')
      .send({ email, password })
      .expect(200);

    expect(loginResponse.body.admin.id).toBe(admin.id);
    expect(loginResponse.body.admin.email).toBe(email.toLowerCase());
    expect(loginResponse.body.admin.role).toBe('superadmin');
    expect(loginResponse.body.admin).not.toHaveProperty('passwordHash');
    const accessToken = loginResponse.body.accessToken as string;

    // The real, end-to-end proof the admin-console audience claim exists
    // on a genuinely issued token (unit-tested separately too, but this
    // is the real HTTP response, not a hand-built payload).
    const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64').toString('utf8'));
    expect(payload.aud).toBe('admin-console');

    // A second, independent live session — minted directly via the app's
    // own real AdminTokenService (not a second real HTTP login call), so
    // this test's real-HTTP budget for the rate-limited login route stays
    // spent only on what's actually under test.
    const adminTokenService = app.get(AdminTokenService);
    const secondSession = await adminTokenService.issueTokenPair(admin.id, admin.role);

    // GET/PATCH /admin/profile — neither is rate-limited.
    const profileResponse = await request(app.getHttpServer())
      .get('/admin/profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(profileResponse.body.fullName).toBe('Original Admin Name');

    await request(app.getHttpServer()).get('/admin/profile').expect(401);

    const updateResponse = await request(app.getHttpServer())
      .patch('/admin/profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ fullName: 'Updated Admin Name', phone: '+2348012345678' })
      .expect(200);
    expect(updateResponse.body.fullName).toBe('Updated Admin Name');
    expect(updateResponse.body.phone).toBe('+2348012345678');
    expect(updateResponse.body.role).toBe('superadmin');

    // A self-promotion attempt via role/email/accountStatus is rejected
    // outright by the global ValidationPipe, never reaching Prisma.
    await request(app.getHttpServer())
      .patch('/admin/profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ role: 'editor' })
      .expect(400);

    const prisma = getTestPrismaClient();
    const stillSuperadmin = await prisma.adminUser.findUniqueOrThrow({ where: { id: admin.id } });
    expect(stillSuperadmin.role).toBe('superadmin');

    // change-password (not rate-limited) — then two more real HTTP login
    // calls (#2, #3) to prove the old password now fails and the new one
    // works. Total real /admin/auth/login calls in this test: 3, well
    // under the default 5/60s limit.
    await request(app.getHttpServer())
      .post('/admin/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: password, newPassword: 'a-brand-new-admin-password-456' })
      .expect(204);

    await request(app.getHttpServer())
      .post('/admin/auth/login')
      .send({ email, password })
      .expect(401);
    await request(app.getHttpServer())
      .post('/admin/auth/login')
      .send({ email, password: 'a-brand-new-admin-password-456' })
      .expect(200);

    // The independent second session, alive before the password change,
    // is now dead — real proof against the real, Redis-backed
    // AdminRefreshTokenStore, not a mock.
    await request(app.getHttpServer())
      .post('/admin/auth/refresh')
      .send({ refreshToken: secondSession.refreshToken.token })
      .expect(401);
  });
});

describe('Admin Console e2e: login rejects invalid/deactivated credentials generically', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
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

  async function seedAdmin(overrides: { password: string; accountStatus?: string }) {
    const prisma = getTestPrismaClient();
    const passwordService = app.get(PasswordService);
    const email = uniqueEmail('e2e-admin-invalid');
    await prisma.adminUser.create({
      data: {
        email,
        passwordHash: await passwordService.hash(overrides.password),
        fullName: 'E2E Test Admin',
        role: 'moderator',
        accountStatus: overrides.accountStatus ?? 'active',
      },
    });
    return { email };
  }

  it('rejects an unknown email and a wrong password with the identical generic message (no enumeration)', async () => {
    const { email } = await seedAdmin({ password: 'the-real-password-123' });

    const unknownResponse = await request(app.getHttpServer())
      .post('/admin/auth/login')
      .send({ email: uniqueEmail('nobody'), password: 'whatever' })
      .expect(401);
    const wrongPasswordResponse = await request(app.getHttpServer())
      .post('/admin/auth/login')
      .send({ email, password: 'totally-wrong' })
      .expect(401);

    expect(unknownResponse.body.message).toBe('Invalid credentials');
    expect(wrongPasswordResponse.body.message).toBe('Invalid credentials');
  });

  it('rejects login for a deactivated admin account', async () => {
    const { email } = await seedAdmin({ password: 'the-real-password-123', accountStatus: 'deactivated' });

    await request(app.getHttpServer())
      .post('/admin/auth/login')
      .send({ email, password: 'the-real-password-123' })
      .expect(401);
  });

  it('rejects a duplicate admin email at the real database constraint level', async () => {
    const prisma = getTestPrismaClient();
    const passwordService = app.get(PasswordService);
    const email = uniqueEmail('e2e-admin-dup');
    await prisma.adminUser.create({
      data: {
        email,
        passwordHash: await passwordService.hash('pw'),
        fullName: 'First',
        role: 'editor',
      },
    });

    await expect(
      prisma.adminUser.create({
        data: {
          email,
          passwordHash: await passwordService.hash('pw2'),
          fullName: 'Duplicate',
          role: 'editor',
        },
      }),
    ).rejects.toThrow();
  });
});

describe('Admin Console e2e: cross-authentication is impossible in both directions', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
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

  // Every test in this block mints its tokens directly via the app's own
  // real TokenService/AdminTokenService rather than real HTTP
  // login/register calls — the thing under test here is guard behavior
  // (does AdminJwtAuthGuard/JwtAuthGuard accept or reject a given real
  // token), not login/register themselves (already covered by this
  // file's other describe blocks and by auth.e2e-spec.ts). This also
  // means zero real HTTP calls to any @AuthRateLimit()-decorated route
  // anywhere in this block, so there is no rate-limit budget to manage
  // here at all.
  async function seedUser(): Promise<{ userId: string }> {
    const prisma = getTestPrismaClient();
    const passwordService = app.get(PasswordService);
    const user = await prisma.user.create({
      data: {
        email: uniqueEmail('e2e-cross-user'),
        passwordHash: await passwordService.hash('irrelevant-for-this-block'),
        displayName: 'Cross Auth Test User',
        dateOfBirth: new Date('1995-01-01'),
        isMinor: false,
      },
    });
    return { userId: user.id };
  }

  async function seedAdmin(): Promise<{ adminId: string; role: string }> {
    const prisma = getTestPrismaClient();
    const passwordService = app.get(PasswordService);
    const admin = await prisma.adminUser.create({
      data: {
        email: uniqueEmail('e2e-cross-admin'),
        passwordHash: await passwordService.hash('irrelevant-for-this-block'),
        fullName: 'Cross Auth Test Admin',
        role: 'superadmin',
      },
    });
    return { adminId: admin.id, role: admin.role };
  }

  it('a real User access token is rejected by every AdminJwtAuthGuard-protected route', async () => {
    const { userId } = await seedUser();
    const tokenService = app.get(TokenService);
    const userTokenPair = await tokenService.issueTokenPair(userId, 'fan');
    const userAccessToken = userTokenPair.accessToken.token;

    await request(app.getHttpServer())
      .get('/admin/profile')
      .set('Authorization', `Bearer ${userAccessToken}`)
      .expect(401);
    await request(app.getHttpServer())
      .patch('/admin/profile')
      .set('Authorization', `Bearer ${userAccessToken}`)
      .send({ fullName: 'Should Not Work' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/admin/auth/change-password')
      .set('Authorization', `Bearer ${userAccessToken}`)
      .send({ currentPassword: 'x', newPassword: 'a-new-password-456' })
      .expect(401);
  });

  it('a real admin access token is rejected by JwtAuthGuard-protected User routes', async () => {
    const { adminId, role } = await seedAdmin();
    const adminTokenService = app.get(AdminTokenService);
    const adminTokenPair = await adminTokenService.issueTokenPair(adminId, role);
    const adminAccessToken = adminTokenPair.accessToken.token;

    // Using the admin's own id as the :id path param proves this isn't
    // merely "wrong user," it's "not a User token at all" — a User token
    // for a real, existing id would still 200 on GET /users/:id, so this
    // is only meaningful because JwtAuthGuard itself rejects the token
    // before UsersController ever runs.
    await request(app.getHttpServer())
      .get(`/users/${adminId}`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(401);
  });

  // The refresh-token-layer proof: the two stores are backed by disjoint
  // Redis key namespaces (admin:refresh:* vs auth:refresh:*), so there is
  // no way for one store to even recognize the other's opaque token id —
  // proven end to end through the real HTTP refresh endpoints, not just
  // at the AdminRefreshTokenStore unit-test layer.
  it('a real User refresh token is rejected at /admin/auth/refresh, and a real admin refresh token is rejected at /auth/refresh', async () => {
    const { userId } = await seedUser();
    const userTokenPair = await app.get(TokenService).issueTokenPair(userId, 'fan');

    await request(app.getHttpServer())
      .post('/admin/auth/refresh')
      .send({ refreshToken: userTokenPair.refreshToken.token })
      .expect(401);

    const { adminId, role } = await seedAdmin();
    const adminTokenPair = await app.get(AdminTokenService).issueTokenPair(adminId, role);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: adminTokenPair.refreshToken.token })
      .expect(401);
  });
});
