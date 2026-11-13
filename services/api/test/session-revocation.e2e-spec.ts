import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AdminTokenService } from '../src/modules/admin/token/admin-token.service';
import { PasswordService } from '../src/modules/auth/password/password.service';
import { TokenService } from '../src/modules/auth/token/token.service';
import { RedisService } from '../src/redis/redis.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { seedDob } from './dob-seed';

// B-305 (Decision Log #500): revoking a user's or an admin's sessions also stops an access token that was
// ALREADY issued -- the Redis "sessions revoked at" marker, compared with the token's `iat` by the guards.
// Real Postgres, real Redis, the real app.
//
// TIMING: `iat` and the marker are whole seconds, and a token issued in the same second as (just before) a
// revocation is NOT refused -- the documented one-second edge. So every test that revokes and then expects a 401
// first waits until the next whole second after the token was issued (`nextSecond()`), and any "works again"
// check uses a token issued after the revocation.
describe('Session revocation marker e2e (B-305)', () => {
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
  const server = () => app.getHttpServer();
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  // Resolves just after the next whole-second boundary, so anything issued before this call has an `iat` strictly
  // earlier than anything revoked after it.
  async function nextSecond() {
    await new Promise((r) => setTimeout(r, 1000 - (Date.now() % 1000) + 40));
  }

  async function createUser(label: string, password = 'the-real-password') {
    const prisma = getTestPrismaClient();
    const user = await prisma.user.create({
      data: {
        email: `e2e-revoke-${label}-${Date.now()}-${rand()}@example.com`,
        passwordHash: await app.get(PasswordService).hash(password),
        displayName: `E2E Revoke ${label}`,
        dateOfBirth: seedDob('1994-05-05'),
        isMinor: false,
        accountStatus: 'active',
      },
    });
    const { accessToken } = await app.get(TokenService).issueTokenPair(user.id, user.role);
    return { userId: user.id, role: user.role, email: user.email, password, accessToken: accessToken.token };
  }

  async function createAdmin(label: string, role: string, password?: string, totpEnabledAt?: Date) {
    const prisma = getTestPrismaClient();
    const admin = await prisma.adminUser.create({
      data: {
        email: `e2e-revoke-admin-${label}-${Date.now()}-${rand()}@example.com`,
        passwordHash: password ? await app.get(PasswordService).hash(password) : 'unused-in-this-e2e-spec-file',
        fullName: `E2E Revoke Admin ${label}`,
        role,
        ...(totpEnabledAt ? { totpEnabledAt } : {}),
      },
    });
    const { accessToken } = await app.get(AdminTokenService).issueTokenPair(admin.id, admin.role);
    return { adminId: admin.id, email: admin.email, accessToken: accessToken.token };
  }

  const ownProfile = (userId: string, token: string) =>
    request(server()).get(`/users/${userId}`).set(auth(token));

  it('suspending a user through the admin route makes their earlier access token a 401 at once; reinstating and logging in again works', async () => {
    const moderator = await createAdmin('suspend-moderator', 'moderator');
    const user = await createUser('suspend');
    await ownProfile(user.userId, user.accessToken).expect(200);

    await nextSecond();
    await request(server())
      .patch(`/admin/users/${user.userId}`)
      .set(auth(moderator.accessToken))
      .send({ status: 'suspended', reasonCategory: 'other' })
      .expect(200);

    // The token has not expired and its signature is fine: only the marker stops it.
    await ownProfile(user.userId, user.accessToken).expect(401);

    await request(server())
      .patch(`/admin/users/${user.userId}`)
      .set(auth(moderator.accessToken))
      .send({ status: 'active' })
      .expect(200);

    // The old token stays dead after reinstatement (its sessions were revoked)...
    await ownProfile(user.userId, user.accessToken).expect(401);
    // ...and a new login issues a token that works.
    const login = await request(server())
      .post('/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(200);
    await ownProfile(user.userId, login.body.accessToken).expect(200);
  });

  // B-310: a password change still revokes EVERY session of the account, the caller's own included, but the API
  // now answers 200 with a FRESH session for the caller, issued after the revoke (so it passes the marker check).
  it('changing the password: the old access token is a 401 afterwards, the response carries a FRESH working session, and a login with the new password works', async () => {
    const user = await createUser('pw-change', 'old-password-1');
    await ownProfile(user.userId, user.accessToken).expect(200);

    await nextSecond();
    const change = await request(server())
      .post('/auth/change-password')
      .set(auth(user.accessToken))
      .send({ currentPassword: 'old-password-1', newPassword: 'new-password-2' })
      .expect(200);

    // The token used for the change is dead...
    await ownProfile(user.userId, user.accessToken).expect(401);
    // ...and the fresh one in the response works at once (it was issued after the marker was written).
    expect(change.body.user).toBeUndefined();
    await ownProfile(user.userId, change.body.accessToken).expect(200);

    await request(server()).post('/auth/login').send({ email: user.email, password: 'old-password-1' }).expect(401);
    const login = await request(server())
      .post('/auth/login')
      .send({ email: user.email, password: 'new-password-2' })
      .expect(200);
    await ownProfile(user.userId, login.body.accessToken).expect(200);
  });

  it('changing the password: the fresh refresh token rotates, the old one and a SECOND session are dead (user)', async () => {
    const user = await createUser('pw-change-refresh', 'old-password-1');
    const first = await request(server()).post('/auth/login').send({ email: user.email, password: 'old-password-1' }).expect(200);
    const second = await request(server()).post('/auth/login').send({ email: user.email, password: 'old-password-1' }).expect(200);

    await nextSecond();
    const change = await request(server())
      .post('/auth/change-password')
      .set(auth(first.body.accessToken))
      .send({ currentPassword: 'old-password-1', newPassword: 'new-password-2' })
      .expect(200);

    // Everything else is gone: the caller's OLD refresh token, the other session's refresh token and access token.
    await request(server()).post('/auth/refresh').send({ refreshToken: first.body.refreshToken }).expect(401);
    await request(server()).post('/auth/refresh').send({ refreshToken: second.body.refreshToken }).expect(401);
    await ownProfile(user.userId, second.body.accessToken).expect(401);

    // The fresh pair is real: its refresh token rotates and the new access token works.
    expect(typeof change.body.refreshToken).toBe('string');
    const rotated = await request(server()).post('/auth/refresh').send({ refreshToken: change.body.refreshToken }).expect(200);
    await ownProfile(user.userId, rotated.body.accessToken).expect(200);
  });

  it('changing the password with the WRONG current password: 401, nothing revoked, nothing issued (user)', async () => {
    const user = await createUser('pw-change-wrong', 'old-password-1');
    await nextSecond();
    const res = await request(server())
      .post('/auth/change-password')
      .set(auth(user.accessToken))
      .send({ currentPassword: 'not-the-password', newPassword: 'new-password-2' })
      .expect(401);
    expect(res.body.accessToken).toBeUndefined();
    await ownProfile(user.userId, user.accessToken).expect(200);
  });

  it("admin: changing the password issues the caller a FRESH session; the old access token, the old refresh token and another admin session are dead", async () => {
    const admin = await createAdmin('pw-change', 'editor', 'old-admin-password-1');
    const first = await request(server()).post('/admin/auth/login').send({ email: admin.email, password: 'old-admin-password-1' }).expect(200);
    const second = await request(server()).post('/admin/auth/login').send({ email: admin.email, password: 'old-admin-password-1' }).expect(200);
    await request(server()).get('/admin/profile').set(auth(first.body.accessToken)).expect(200);

    await nextSecond();
    const change = await request(server())
      .post('/admin/auth/change-password')
      .set(auth(first.body.accessToken))
      .send({ currentPassword: 'old-admin-password-1', newPassword: 'new-admin-password-2' })
      .expect(200);

    // No admin summary in the answer: just the pair.
    expect(change.body.admin).toBeUndefined();
    await request(server()).get('/admin/profile').set(auth(first.body.accessToken)).expect(401);
    await request(server()).get('/admin/profile').set(auth(second.body.accessToken)).expect(401);
    await request(server()).post('/admin/auth/refresh').send({ refreshToken: first.body.refreshToken }).expect(401);
    await request(server()).post('/admin/auth/refresh').send({ refreshToken: second.body.refreshToken }).expect(401);

    await request(server()).get('/admin/profile').set(auth(change.body.accessToken)).expect(200);
    const rotated = await request(server()).post('/admin/auth/refresh').send({ refreshToken: change.body.refreshToken }).expect(200);
    await request(server()).get('/admin/profile').set(auth(rotated.body.accessToken)).expect(200);
  });

  it('admin: a WRONG current password is a 401 and revokes nothing', async () => {
    const admin = await createAdmin('pw-change-wrong', 'editor', 'old-admin-password-1');
    await nextSecond();
    await request(server())
      .post('/admin/auth/change-password')
      .set(auth(admin.accessToken))
      .send({ currentPassword: 'not-the-password', newPassword: 'new-admin-password-2' })
      .expect(401);
    await request(server()).get('/admin/profile').set(auth(admin.accessToken)).expect(200);
  });

  // The decided exception: with ADMIN_2FA_ENFORCED on, an admin without two-factor must not be handed a session by a
  // password change (the refresh gate would otherwise be sidestepped). Password saved, everything revoked, 204 no body.
  describe('admin: ADMIN_2FA_ENFORCED on and no two-factor', () => {
    const previous = process.env.ADMIN_2FA_ENFORCED;
    beforeEach(() => {
      process.env.ADMIN_2FA_ENFORCED = 'true';
    });
    afterEach(() => {
      if (previous === undefined) delete process.env.ADMIN_2FA_ENFORCED;
      else process.env.ADMIN_2FA_ENFORCED = previous;
    });

    it('204 with no body: password saved, all sessions revoked, NO session issued', async () => {
      const admin = await createAdmin('pw-change-enforced', 'editor', 'old-admin-password-1');
      await nextSecond();
      const res = await request(server())
        .post('/admin/auth/change-password')
        .set(auth(admin.accessToken))
        .send({ currentPassword: 'old-admin-password-1', newPassword: 'new-admin-password-2' })
        .expect(204);
      expect(res.text).toBe('');

      await request(server()).get('/admin/profile').set(auth(admin.accessToken)).expect(401);
      const stored = await getTestPrismaClient().adminUser.findUniqueOrThrow({ where: { id: admin.adminId } });
      expect(await app.get(PasswordService).verify(stored.passwordHash, 'new-admin-password-2')).toBe(true);
    });

    it('with two-factor ON the same change issues a fresh session as usual', async () => {
      const admin = await createAdmin('pw-change-enforced-2fa', 'editor', 'old-admin-password-1', new Date('2026-10-01T00:00:00Z'));
      await nextSecond();
      const res = await request(server())
        .post('/admin/auth/change-password')
        .set(auth(admin.accessToken))
        .send({ currentPassword: 'old-admin-password-1', newPassword: 'new-admin-password-2' })
        .expect(200);
      await request(server()).get('/admin/profile').set(auth(res.body.accessToken)).expect(200);
    });
  });

  it("removing an admin account (deactivating it) makes that admin's earlier access token a 401; other admins are unaffected", async () => {
    const superadmin = await createAdmin('remove-super', 'superadmin');
    const target = await createAdmin('remove-target', 'editor');
    const bystander = await createAdmin('remove-bystander', 'editor');
    await request(server()).get('/admin/profile').set(auth(target.accessToken)).expect(200);

    await nextSecond();
    await request(server())
      .patch(`/admin/staff/${target.adminId}/status`)
      .set(auth(superadmin.accessToken))
      .send({ status: 'deactivated' })
      .expect(200);

    await request(server()).get('/admin/profile').set(auth(target.accessToken)).expect(401);
    await request(server()).get('/admin/profile').set(auth(bystander.accessToken)).expect(200);
    await request(server()).get('/admin/profile').set(auth(superadmin.accessToken)).expect(200);
  });

  it('a revoked USER does not affect an admin with the same id string, and the marker has the expected key and lifetime in real Redis', async () => {
    const user = await createUser('redis-key');
    const redis = app.get(RedisService);

    await nextSecond();
    const before = Math.floor(Date.now() / 1000);
    await app.get(TokenService).revokeAllSessionsForUser(user.userId);

    const key = `auth:revoked-at:user:${user.userId}`;
    const value = Number(await redis.get(key));
    expect(value).toBeGreaterThanOrEqual(before);
    expect(value).toBeLessThanOrEqual(before + 2);
    const ttlMs = await redis.pttl(key);
    // default access lifetime 900 s + 60 s margin
    expect(ttlMs).toBeGreaterThan(900_000);
    expect(ttlMs).toBeLessThanOrEqual(960_000);
    expect(await redis.get(`admin:revoked-at:admin:${user.userId}`)).toBeNull();
  });

  it('a token issued AFTER the revocation works even in the same second, and a token with a marker for another user is untouched', async () => {
    const a = await createUser('after-a');
    const b = await createUser('after-b');
    await nextSecond();

    await app.get(TokenService).revokeAllSessionsForUser(a.userId);
    const { accessToken } = await app.get(TokenService).issueTokenPair(a.userId, a.role);

    await ownProfile(a.userId, accessToken.token).expect(200);
    await ownProfile(b.userId, b.accessToken).expect(200);
  });
});
