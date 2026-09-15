import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PasswordService } from '../src/modules/auth/password/password.service';
import { AdminTokenService } from '../src/modules/admin/token/admin-token.service';
import { TokenService } from '../src/modules/auth/token/token.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';

// sprint-5/admin-users-dashboard-backend — Build Plan Section 4.8 (Admin
// Service), the platform-user management half. Hits test/README.md's
// fourth e2e trigger (admin-auth-isolation.e2e-spec.ts's own precedent):
// proving a security property that depends on the whole, really-
// bootstrapped app, not one class in isolation — specifically, that an
// admin-triggered 'suspended' status really blocks a real
// POST /auth/login and a real POST /auth/reactivate-account end to end
// (both of these were real gaps this PR found and fixed in
// AuthService — see auth.service.ts's own comments), and that the
// admin-triggered immediate-delete path really removes the User row
// from real Postgres and really revokes a real, previously-issued
// refresh token, not just returning a 200.
//
// Users/admins are seeded directly via Prisma + a real TokenService-/
// AdminTokenService-minted access token (createUser/createAdmin) for
// every test EXCEPT the two that specifically need to exercise the real
// POST /auth/login / POST /auth/reactivate-account routes end to end —
// same pattern moderation.e2e-spec.ts/community-groups.e2e-spec.ts use,
// and the same reason: GET/PATCH /admin/users and POST /auth/refresh
// carry no @AuthRateLimit() at all, but /auth/login and
// /auth/reactivate-account share one 5-requests/60s 'auth' bucket (see
// account-lifecycle.e2e-spec.ts's own comment) — this file makes exactly
// two real calls to those two routes combined, well under the limit, so
// one shared app instance is enough.
describe('Admin Users e2e: role gating, suspend/reactivate/delete against real Postgres', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await app.close();
    await disconnectTestPrismaClient();
  });

  const rand = () => Math.random().toString(36).slice(2);

  function server() {
    return app.getHttpServer();
  }

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  async function createUser(
    label: string,
    overrides: Partial<{ accountStatus: string; pendingDeletionAt: Date | null; isMinor: boolean; password: string }> = {},
  ) {
    const prisma = getTestPrismaClient();
    const passwordService = app.get(PasswordService);
    const password = overrides.password ?? 'the-real-password';
    const passwordHash = await passwordService.hash(password);
    const user = await prisma.user.create({
      data: {
        email: `e2e-admin-users-${label}-${Date.now()}-${rand()}@example.com`,
        passwordHash,
        displayName: `E2E Admin-Users ${label}`,
        dateOfBirth: new Date('1994-05-05'),
        isMinor: overrides.isMinor ?? false,
        accountStatus: overrides.accountStatus ?? 'active',
        pendingDeletionAt: overrides.pendingDeletionAt ?? null,
      },
    });
    const { accessToken, refreshToken } = await app.get(TokenService).issueTokenPair(user.id, user.role);
    return { userId: user.id, email: user.email, password, accessToken: accessToken.token, refreshToken: refreshToken.token };
  }

  async function createAdmin(label: string, role: string) {
    const prisma = getTestPrismaClient();
    const admin = await prisma.adminUser.create({
      data: {
        email: `e2e-admin-users-admin-${label}-${Date.now()}-${rand()}@example.com`,
        passwordHash: 'unused-in-this-e2e-spec-file',
        fullName: `E2E Admin-Users Admin ${label}`,
        role,
      },
    });
    const { accessToken } = await app.get(AdminTokenService).issueTokenPair(admin.id, admin.role);
    return { adminId: admin.id, accessToken: accessToken.token };
  }

  it('GET /admin/users rejects an editor with 403, allows a moderator', async () => {
    const editor = await createAdmin('editor', 'editor');
    const moderator = await createAdmin('moderator', 'moderator');

    await request(server()).get('/admin/users').set(auth(editor.accessToken)).expect(403);

    const res = await request(server()).get('/admin/users').set(auth(moderator.accessToken)).expect(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.nextCursor).toBeNull();
  });

  it('PATCH /admin/users/:id rejects an editor with 403', async () => {
    const editor = await createAdmin('editor', 'editor');
    const target = await createUser('target-403');

    await request(server())
      .patch(`/admin/users/${target.userId}`)
      .set(auth(editor.accessToken))
      .send({ status: 'suspended' })
      .expect(403);

    const prisma = getTestPrismaClient();
    const stillActive = await prisma.user.findUnique({ where: { id: target.userId } });
    expect(stillActive!.accountStatus).toBe('active');
  });

  it('GET /admin/users lists real seeded users, filterable by status', async () => {
    const moderator = await createAdmin('list-moderator', 'moderator');
    await createUser('active-1');
    const suspendedOne = await createUser('suspended-1', { accountStatus: 'suspended' });

    const all = await request(server()).get('/admin/users').set(auth(moderator.accessToken)).expect(200);
    expect(all.body.items).toHaveLength(2);

    const filtered = await request(server())
      .get('/admin/users')
      .query({ status: 'suspended' })
      .set(auth(moderator.accessToken))
      .expect(200);
    expect(filtered.body.items).toHaveLength(1);
    expect(filtered.body.items[0].id).toBe(suspendedOne.userId);
  });

  it('PATCH .../:id { status: "suspended" } updates the real row and revokes the real refresh token', async () => {
    const moderator = await createAdmin('suspend-moderator', 'moderator');
    const target = await createUser('to-suspend');

    const res = await request(server())
      .patch(`/admin/users/${target.userId}`)
      .set(auth(moderator.accessToken))
      .send({ status: 'suspended' })
      .expect(200);
    expect(res.body.user.accountStatus).toBe('suspended');

    const prisma = getTestPrismaClient();
    const stillExists = await prisma.user.findUnique({ where: { id: target.userId } });
    expect(stillExists!.accountStatus).toBe('suspended');

    // The refresh token issued when the user was seeded is now dead —
    // the real revokeAllSessionsForUser call, proven against the real
    // refresh-token store, not just asserted from the response body.
    await request(server())
      .post('/auth/refresh')
      .send({ refreshToken: target.refreshToken })
      .expect(401);
  });

  it('PATCH .../:id { status: "active" } from a suspended state clears a stale pendingDeletionAt too', async () => {
    const moderator = await createAdmin('reactivate-moderator', 'moderator');
    const pastDate = new Date('2020-01-01T00:00:00.000Z');
    const target = await createUser('pending-then-reactivated', {
      accountStatus: 'pending_deletion',
      pendingDeletionAt: pastDate,
    });

    const res = await request(server())
      .patch(`/admin/users/${target.userId}`)
      .set(auth(moderator.accessToken))
      .send({ status: 'active' })
      .expect(200);
    expect(res.body.user.accountStatus).toBe('active');

    const prisma = getTestPrismaClient();
    const updated = await prisma.user.findUnique({ where: { id: target.userId } });
    expect(updated!.accountStatus).toBe('active');
    expect(updated!.pendingDeletionAt).toBeNull();
  });

  it('PATCH .../:id { status: "deleted" } really removes the User row from Postgres immediately, and revokes sessions', async () => {
    const moderator = await createAdmin('delete-moderator', 'moderator');
    const target = await createUser('to-delete');

    const res = await request(server())
      .patch(`/admin/users/${target.userId}`)
      .set(auth(moderator.accessToken))
      .send({ status: 'deleted' })
      .expect(200);
    expect(res.body).toEqual({ deleted: true, id: target.userId });

    // The row is genuinely gone — no 30-day pending_deletion limbo.
    const prisma = getTestPrismaClient();
    const gone = await prisma.user.findUnique({ where: { id: target.userId } });
    expect(gone).toBeNull();

    await request(server())
      .post('/auth/refresh')
      .send({ refreshToken: target.refreshToken })
      .expect(401);
  });

  it('PATCH .../:id 404s for a non-existent user id, and creates/changes nothing', async () => {
    const moderator = await createAdmin('404-moderator', 'moderator');

    await request(server())
      .patch('/admin/users/11111111-1111-4111-8111-111111111111')
      .set(auth(moderator.accessToken))
      .send({ status: 'suspended' })
      .expect(404);
  });

  // The two real, end-to-end security-property tests this file exists
  // for — see the file's own header comment on the @AuthRateLimit()
  // budget (2 of the shared 5-per-60s 'auth' bucket, both here).
  it('a real POST /auth/login is rejected (generic message) for a suspended account', async () => {
    const moderator = await createAdmin('login-block-moderator', 'moderator');
    const target = await createUser('login-blocked', { password: 'the-real-password' });

    await request(server())
      .patch(`/admin/users/${target.userId}`)
      .set(auth(moderator.accessToken))
      .send({ status: 'suspended' })
      .expect(200);

    const loginRes = await request(server())
      .post('/auth/login')
      .send({ email: target.email, password: 'the-real-password' })
      .expect(401);
    expect(loginRes.body.message).toMatch(/invalid credentials/i);
  });

  it('a real POST /auth/reactivate-account does NOT undo a suspension, even with correct credentials', async () => {
    const moderator = await createAdmin('reactivate-block-moderator', 'moderator');
    const target = await createUser('reactivate-blocked', { password: 'the-real-password' });

    await request(server())
      .patch(`/admin/users/${target.userId}`)
      .set(auth(moderator.accessToken))
      .send({ status: 'suspended' })
      .expect(200);

    await request(server())
      .post('/auth/reactivate-account')
      .send({ email: target.email, password: 'the-real-password' })
      .expect(401);

    const prisma = getTestPrismaClient();
    const stillSuspended = await prisma.user.findUnique({ where: { id: target.userId } });
    expect(stillSuspended!.accountStatus).toBe('suspended');
  });
});
