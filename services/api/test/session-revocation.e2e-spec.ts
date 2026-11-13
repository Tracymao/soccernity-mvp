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

  async function createAdmin(label: string, role: string) {
    const prisma = getTestPrismaClient();
    const admin = await prisma.adminUser.create({
      data: {
        email: `e2e-revoke-admin-${label}-${Date.now()}-${rand()}@example.com`,
        passwordHash: 'unused-in-this-e2e-spec-file',
        fullName: `E2E Revoke Admin ${label}`,
        role,
      },
    });
    const { accessToken } = await app.get(AdminTokenService).issueTokenPair(admin.id, admin.role);
    return { adminId: admin.id, accessToken: accessToken.token };
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

  it('changing the password: the access token used for the change is a 401 afterwards, and a new login with the new password works', async () => {
    const user = await createUser('pw-change', 'old-password-1');
    await ownProfile(user.userId, user.accessToken).expect(200);

    await nextSecond();
    await request(server())
      .post('/auth/change-password')
      .set(auth(user.accessToken))
      .send({ currentPassword: 'old-password-1', newPassword: 'new-password-2' })
      .expect(204);

    await ownProfile(user.userId, user.accessToken).expect(401);

    // POST /auth/change-password answers 204 with NO new token pair, so the client signs in again.
    await request(server()).post('/auth/login').send({ email: user.email, password: 'old-password-1' }).expect(401);
    const login = await request(server())
      .post('/auth/login')
      .send({ email: user.email, password: 'new-password-2' })
      .expect(200);
    await ownProfile(user.userId, login.body.accessToken).expect(200);
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
