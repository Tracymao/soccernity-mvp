import * as fs from 'fs';
import * as path from 'path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { APP_CLOCK } from '../src/clock/clock';
import { DobEncryptionService } from '../src/crypto/dob-encryption.service';
import { AccountDeletionSweepService } from '../src/modules/account-deletion/account-deletion-sweep.service';
import { AdminAuthService } from '../src/modules/admin/admin-auth.service';
import { AdminTokenService } from '../src/modules/admin/token/admin-token.service';
import { PasswordService } from '../src/modules/auth/password/password.service';
import { TokenService } from '../src/modules/auth/token/token.service';
import { generateTotpCode } from '../src/modules/two-factor/totp.util';
import { TwoFactorService } from '../src/modules/two-factor/two-factor.service';
import { RedisService } from '../src/redis/redis.service';
import { seedDob } from './dob-seed';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';

// ---------------------------------------------------------------------------------------------------------------
// B-086 / B-270 (Decision Log #446): authenticator-app two-factor for users (optional) and admins (mandatory behind
// ADMIN_2FA_ENFORCED), against REAL Postgres and REAL Redis, the real AppModule and real argon2. Authenticator codes
// are generated here with the same library the app uses, at a time this file controls (APP_CLOCK is overridden), so
// the 30-second steps are deterministic.
//
// WHAT IS PROVEN HERE THAT A MOCK CANNOT SHOW
//   - the secret column is CIPHERTEXT in Postgres (raw SQL), the backup codes are argon2id HASHES, never plaintext
//   - a spent backup code stays spent when two requests race for it (updateMany guarded on usedAt IS NULL)
//   - a replayed TOTP step is refused, and a wrong code and a used code get the same answer
//   - 5 wrong codes lock the account for 15 minutes (a real Redis TTL), the right code included
//   - a peer reset clears the target, writes the audit row, and kills the target's old session
//   - the database recovery SQL in docs/admin-two-factor-recovery.md really works (that file's block is executed)
//   - anonymising (or minimising) an account removes the encrypted secret and every backup code
//
// RATE-LIMIT BUDGET. The admin login is limited to 5 per 15 minutes per IP (#190) and the admin code endpoints to 10
// per handler, in memory for the life of the app. This file uses ONE app, so it counts: real admin HTTP logins = 4
// (A1, A2, A3, reset); the admin challenges and enrolment tokens for every other test are minted straight from
// TwoFactorService (the password step is not what those tests are about).
// ---------------------------------------------------------------------------------------------------------------

jest.setTimeout(180_000);

const WEB = 'https://app.2fa-test.soccernity.com';
const ADMIN_ORIGIN = 'https://admin.2fa-test.soccernity.com';
const PASSWORD = 'the-real-password-123';
// A fixed instant aligned to a 30-second step, so "the next step" is exactly +30 s.
const BASE = Math.floor(Date.UTC(2030, 0, 1) / 30_000) * 30_000 + 5_000;
const STEP_MS = 30_000;
const INVALID_CODE = 'That code did not work. Check it and try again.';

const clock = { current: BASE, now: () => new Date(clock.current) };

describe('Two-factor e2e (B-086, B-270)', () => {
  let app: INestApplication;
  let twoFactor: TwoFactorService;
  let dob: DobEncryptionService;
  let redis: RedisService;
  const saved: Record<string, string | undefined> = {};
  const prisma = () => getTestPrismaClient();
  const http = () => request(app.getHttpServer());
  const rand = () => Math.random().toString(36).slice(2);

  beforeAll(async () => {
    for (const k of ['WEB_APP_BASE_URL', 'ADMIN_APP_BASE_URL', 'ADMIN_2FA_ENFORCED']) saved[k] = process.env[k];
    process.env.WEB_APP_BASE_URL = WEB;
    process.env.ADMIN_APP_BASE_URL = ADMIN_ORIGIN;
    delete process.env.ADMIN_2FA_ENFORCED;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_CLOCK)
      .useValue(clock)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    // Listen once up front: supertest binds a not-yet-listening server per request, so two concurrent requests
    // (the backup-code race) would otherwise collide on listen().
    await app.listen(0);
    twoFactor = app.get(TwoFactorService);
    dob = app.get(DobEncryptionService);
    redis = app.get(RedisService);
  });

  beforeEach(async () => {
    await resetDatabase();
    const keys = await redis.keys('2fa:*');
    if (keys.length > 0) await redis.del(...keys);
    clock.current = BASE;
    delete process.env.ADMIN_2FA_ENFORCED;
  });

  afterAll(async () => {
    await app.close();
    await disconnectTestPrismaClient();
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  // ---------------------------------------------------------------- helpers

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const totp = (secret: string, offsetSteps = 0) => generateTotpCode(secret, clock.current + offsetSteps * STEP_MS);
  const advanceStep = (steps = 1) => {
    clock.current += steps * STEP_MS;
  };
  // A six-digit code that is NOT valid in the current window.
  const wrongCode = (secret: string) => {
    const valid = new Set([-1, 0, 1].map((o) => totp(secret, o)));
    for (let n = 0; n < 1_000_000; n += 7919) {
      const candidate = String(n).padStart(6, '0');
      if (!valid.has(candidate)) return candidate;
    }
    throw new Error('unreachable');
  };

  async function seedUser(over: { isMinor?: boolean; accountStatus?: string; guardian?: 'pending' } = {}) {
    const email = `tf-${rand()}@example.com`;
    const user = await prisma().user.create({
      data: {
        email,
        passwordHash: await app.get(PasswordService).hash(PASSWORD),
        displayName: 'Two Factor User',
        dateOfBirth: seedDob(over.isMinor ? '2012-06-01' : '1990-01-01'),
        isMinor: over.isMinor ?? false,
        accountStatus: over.accountStatus ?? 'active',
      },
    });
    if (over.guardian) {
      await prisma().guardian.create({
        data: {
          minorUserId: user.id,
          name: 'Guardian Person',
          email: `guardian-${rand()}@example.com`,
          relationship: 'Parent',
          consentToken: `consent-${rand()}`,
          consentTokenExpiresAt: new Date(Date.now() + 48 * 3600 * 1000),
          consentStatus: over.guardian,
        },
      });
    }
    const pair = await app.get(TokenService).issueTokenPair(user.id, user.role);
    return { id: user.id, email, auth: bearer(pair.accessToken.token) };
  }

  // A user who has turned two-factor on over HTTP, at BASE (step S). Returns the secret and the 10 backup codes.
  async function enrolledUser() {
    const user = await seedUser();
    const start = await http().post('/auth/two-factor/enrol/start').set(user.auth).expect(200);
    const confirm = await http()
      .post('/auth/two-factor/enrol/confirm')
      .set(user.auth)
      .send({ code: totp(start.body.secret) })
      .expect(200);
    return { ...user, secret: start.body.secret as string, backupCodes: confirm.body.backupCodes as string[] };
  }

  async function seedAdmin(role: 'superadmin' | 'moderator' | 'editor' = 'editor') {
    const email = `tf-admin-${rand()}@example.com`;
    const admin = await prisma().adminUser.create({
      data: { email, passwordHash: await app.get(PasswordService).hash(PASSWORD), fullName: 'Ada Admin', role },
    });
    const pair = await app.get(AdminTokenService).issueTokenPair(admin.id, admin.role);
    return { id: admin.id, email, role, auth: bearer(pair.accessToken.token), refreshToken: pair.refreshToken.token };
  }

  // An admin who has enrolled, through the settings routes (no password step involved).
  async function enrolledAdmin(role: 'superadmin' | 'moderator' | 'editor' = 'editor') {
    const admin = await seedAdmin(role);
    const start = await http().post('/admin/auth/two-factor/enrol/start').set(admin.auth).expect(200);
    const confirm = await http()
      .post('/admin/auth/two-factor/enrol/confirm')
      .set(admin.auth)
      .send({ code: totp(start.body.secret) })
      .expect(200);
    return { ...admin, secret: start.body.secret as string, backupCodes: confirm.body.backupCodes as string[] };
  }

  const userColumns = async (id: string) =>
    (
      await prisma().$queryRaw<
        Array<{ totpSecretEncrypted: string | null; totpEnabledAt: Date | null; totpLastUsedStep: number | null }>
      >`SELECT "totpSecretEncrypted", "totpEnabledAt", "totpLastUsedStep" FROM "User" WHERE "id" = ${id}`
    )[0];
  const adminColumns = async (id: string) =>
    (
      await prisma().$queryRaw<
        Array<{ totpSecretEncrypted: string | null; totpEnabledAt: Date | null; totpLastUsedStep: number | null }>
      >`SELECT "totpSecretEncrypted", "totpEnabledAt", "totpLastUsedStep" FROM "AdminUser" WHERE "id" = ${id}`
    )[0];
  const userCodeRows = (id: string) =>
    prisma().$queryRaw<Array<{ codeHash: string; usedAt: Date | null }>>`SELECT "codeHash", "usedAt" FROM "UserBackupCode" WHERE "userId" = ${id}`;
  const adminCodeRows = (id: string) =>
    prisma().$queryRaw<Array<{ codeHash: string; usedAt: Date | null }>>`SELECT "codeHash", "usedAt" FROM "AdminBackupCode" WHERE "adminId" = ${id}`;

  // ================================================================== USERS

  describe('user: enrolment', () => {
    it('the secret is CIPHERTEXT in Postgres, the backup codes are argon2id HASHES, and nothing is stored before confirmation', async () => {
      const user = await seedUser();
      const start = await http().post('/auth/two-factor/enrol/start').set(user.auth).expect(200);
      expect(start.body.secret).toMatch(/^[A-Z2-7]{32}$/);
      expect(start.body.otpauthUri).toContain('otpauth://totp/Soccernity:');
      expect(start.body.otpauthUri).toContain(`secret=${start.body.secret}`);

      // Nothing on the account yet; the pending secret sits in Redis as ciphertext only.
      expect(await userColumns(user.id)).toEqual({ totpSecretEncrypted: null, totpEnabledAt: null, totpLastUsedStep: null });
      const parked = (await redis.get(`2fa:pending:user:${user.id}`)) as string;
      expect(parked.startsWith('v1:')).toBe(true);
      expect(parked).not.toContain(start.body.secret);

      // A wrong code turns nothing on.
      await http()
        .post('/auth/two-factor/enrol/confirm')
        .set(user.auth)
        .send({ code: wrongCode(start.body.secret) })
        .expect(401)
        .expect((r) => expect(r.body.message).toBe(INVALID_CODE));
      expect((await userColumns(user.id)).totpEnabledAt).toBeNull();

      const confirm = await http()
        .post('/auth/two-factor/enrol/confirm')
        .set(user.auth)
        .send({ code: totp(start.body.secret) })
        .expect(200);
      const codes = confirm.body.backupCodes as string[];
      expect(codes).toHaveLength(10);
      expect(new Set(codes).size).toBe(10);
      codes.forEach((c) => expect(c).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ2-9]{10}$/));

      const row = await userColumns(user.id);
      expect(row.totpEnabledAt).toBeInstanceOf(Date);
      expect(row.totpLastUsedStep).toBe(Math.floor(clock.current / STEP_MS));
      expect(row.totpSecretEncrypted).toMatch(/^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
      expect(row.totpSecretEncrypted).not.toContain(start.body.secret);
      expect(dob.decryptString(row.totpSecretEncrypted as string)).toBe(start.body.secret); // the same key as the date of birth

      const stored = await userCodeRows(user.id);
      expect(stored).toHaveLength(10);
      for (const s of stored) {
        expect(s.codeHash.startsWith('$argon2id$')).toBe(true);
        expect(s.usedAt).toBeNull();
        for (const c of codes) expect(s.codeHash).not.toContain(c);
      }
      expect(await redis.get(`2fa:pending:user:${user.id}`)).toBeNull();

      const status = await http().get('/auth/two-factor/status').set(user.auth).expect(200);
      expect(status.body).toEqual({ enabled: true, backupCodesRemaining: 10 });
      await http().post('/auth/two-factor/enrol/start').set(user.auth).expect(409);
    });

    it('is open to a restricted-pending minor (JwtAuthGuard only, not GuardianConsentGuard)', async () => {
      const minor = await seedUser({ isMinor: true, guardian: 'pending' });
      await http().post('/auth/two-factor/enrol/start').set(minor.auth).expect(200);
    });

    it('needs a signed-in user, and an ADMIN token is not one', async () => {
      await http().get('/auth/two-factor/status').expect(401);
      const admin = await seedAdmin('superadmin');
      await http().get('/auth/two-factor/status').set(admin.auth).expect(401);
      await http().get('/admin/auth/two-factor/status').expect(401);
      const user = await seedUser();
      await http().get('/admin/auth/two-factor/status').set(user.auth).expect(401);
    });
  });

  describe('user: signing in with the second factor', () => {
    it('the password step ends in a CHALLENGE, not a session; the code finishes it; the challenge is single-use', async () => {
      const user = await enrolledUser();
      advanceStep(); // the confirming code's step is spent

      const login = await http().post('/auth/login').send({ email: user.email, password: PASSWORD }).expect(200);
      expect(login.body).toMatchObject({ twoFactorRequired: true, challengeExpiresInSeconds: 300 });
      expect(login.body.challengeToken).toEqual(expect.any(String));
      expect(login.body).not.toHaveProperty('accessToken');
      expect(login.body).not.toHaveProperty('refreshToken');
      // The challenge is not an access token.
      await http().get('/auth/two-factor/status').set(bearer(login.body.challengeToken)).expect(401);

      const done = await http()
        .post('/auth/login/two-factor')
        .send({ challengeToken: login.body.challengeToken, code: totp(user.secret) })
        .expect(200);
      expect(done.body.accessToken).toEqual(expect.any(String));
      expect(done.body.refreshToken).toEqual(expect.any(String)); // no Origin: a native client gets body tokens
      expect(done.body.user.email).toBe(user.email);
      await http().get('/auth/two-factor/status').set(bearer(done.body.accessToken)).expect(200);

      // single-use
      advanceStep();
      await http()
        .post('/auth/login/two-factor')
        .send({ challengeToken: login.body.challengeToken, code: totp(user.secret) })
        .expect(401);
    });

    it('a wrong code does not burn the challenge, and answers exactly what a replayed code answers', async () => {
      const user = await enrolledUser();
      advanceStep();
      const login = await http().post('/auth/login').send({ email: user.email, password: PASSWORD }).expect(200);
      const wrong = await http()
        .post('/auth/login/two-factor')
        .send({ challengeToken: login.body.challengeToken, code: wrongCode(user.secret) })
        .expect(401);

      const good = totp(user.secret);
      await http().post('/auth/login/two-factor').send({ challengeToken: login.body.challengeToken, code: good }).expect(200);

      // REPLAY: the same, now-spent step on a fresh challenge.
      const again = await http().post('/auth/login').send({ email: user.email, password: PASSWORD }).expect(200);
      const replay = await http()
        .post('/auth/login/two-factor')
        .send({ challengeToken: again.body.challengeToken, code: good })
        .expect(401);
      expect(replay.body).toEqual(wrong.body); // byte-identical answer: wrong and used cannot be told apart
      expect(replay.body.message).toBe(INVALID_CODE);
    });

    it('a backup code works ONCE (DB: usedAt set on exactly one row), typed in lower case with a hyphen', async () => {
      const user = await enrolledUser();
      const typed = `${user.backupCodes[0].slice(0, 5)}-${user.backupCodes[0].slice(5)}`.toLowerCase();
      const a = await http().post('/auth/login').send({ email: user.email, password: PASSWORD }).expect(200);
      await http().post('/auth/login/two-factor').send({ challengeToken: a.body.challengeToken, code: typed }).expect(200);

      const rows = await userCodeRows(user.id);
      expect(rows.filter((r) => r.usedAt !== null)).toHaveLength(1);
      expect(rows.filter((r) => r.usedAt === null)).toHaveLength(9);
      expect((await http().get('/auth/two-factor/status').set(user.auth).expect(200)).body.backupCodesRemaining).toBe(9);

      const b = await http().post('/auth/login').send({ email: user.email, password: PASSWORD }).expect(200);
      const spent = await http()
        .post('/auth/login/two-factor')
        .send({ challengeToken: b.body.challengeToken, code: user.backupCodes[0] })
        .expect(401);
      const wrong = await http()
        .post('/auth/login/two-factor')
        .send({ challengeToken: b.body.challengeToken, code: 'ZZZZZZZZZZ' })
        .expect(401);
      expect(spent.body).toEqual(wrong.body);
    });

    it('RACE: two simultaneous sign-ins with the same unused backup code -> exactly one succeeds', async () => {
      const user = await enrolledUser();
      const c1 = await twoFactor.issueChallenge('user', user.id, false);
      const c2 = await twoFactor.issueChallenge('user', user.id, false);
      const [r1, r2] = await Promise.all([
        http().post('/auth/login/two-factor').send({ challengeToken: c1.challengeToken, code: user.backupCodes[3] }),
        http().post('/auth/login/two-factor').send({ challengeToken: c2.challengeToken, code: user.backupCodes[3] }),
      ]);
      expect([r1.status, r2.status].sort()).toEqual([200, 401]);
      expect((await userCodeRows(user.id)).filter((r) => r.usedAt !== null)).toHaveLength(1);
    });

    it('FIVE wrong codes lock the account for 15 minutes (a real Redis TTL): the right code is refused with a 429 and Retry-After', async () => {
      const user = await enrolledUser();
      advanceStep();
      const challenge = await twoFactor.issueChallenge('user', user.id, false);
      for (let i = 0; i < 5; i++) {
        await http()
          .post('/auth/login/two-factor')
          .send({ challengeToken: challenge.challengeToken, code: wrongCode(user.secret) })
          .expect(401);
      }
      const locked = await http()
        .post('/auth/login/two-factor')
        .send({ challengeToken: challenge.challengeToken, code: totp(user.secret) })
        .expect(429);
      expect(Number(locked.headers['retry-after'])).toBeGreaterThan(890);
      expect(Number(locked.headers['retry-after'])).toBeLessThanOrEqual(900);
      expect(locked.body).toMatchObject({ statusCode: 429, code: 'two_factor_code_locked' });
      const ttl = await redis.ttl(`2fa:attempts:user:${user.id}`);
      expect(ttl).toBeGreaterThan(890);
      expect(ttl).toBeLessThanOrEqual(900);

      // A different account is not affected.
      const other = await enrolledUser();
      advanceStep();
      const otherChallenge = await twoFactor.issueChallenge('user', other.id, false);
      await http()
        .post('/auth/login/two-factor')
        .send({ challengeToken: otherChallenge.challengeToken, code: totp(other.secret) })
        .expect(200);

      // Past the lock, the right code works (the Redis key is removed instead of waiting 15 real minutes).
      await redis.del(`2fa:attempts:user:${user.id}`);
      await http()
        .post('/auth/login/two-factor')
        .send({ challengeToken: challenge.challengeToken, code: totp(user.secret) })
        .expect(200);
    });

    it('a challenge for an account that was deactivated or suspended in between is the generic 401', async () => {
      for (const status of ['deactivated', 'suspended']) {
        const user = await enrolledUser();
        advanceStep();
        const challenge = await twoFactor.issueChallenge('user', user.id, false);
        await prisma().user.update({ where: { id: user.id }, data: { accountStatus: status } });
        await http()
          .post('/auth/login/two-factor')
          .send({ challengeToken: challenge.challengeToken, code: totp(user.secret) })
          .expect(401);
        await prisma().user.update({ where: { id: user.id }, data: { accountStatus: 'active' } });
      }
    });

    it('a deactivated account never gets a challenge from the password step', async () => {
      const user = await enrolledUser();
      await prisma().user.update({ where: { id: user.id }, data: { accountStatus: 'deactivated' } });
      const res = await http().post('/auth/login').send({ email: user.email, password: PASSWORD }).expect(401);
      expect(res.body).not.toHaveProperty('challengeToken');
    });

    it('REACTIVATION cannot be used to skip the second factor: a challenge, no session, still deactivated until the code', async () => {
      const user = await enrolledUser();
      await prisma().user.update({ where: { id: user.id }, data: { accountStatus: 'deactivated' } });
      advanceStep();

      const res = await http().post('/auth/reactivate-account').send({ email: user.email, password: PASSWORD }).expect(200);
      expect(res.body).toMatchObject({ twoFactorRequired: true });
      expect(res.body).not.toHaveProperty('accessToken');
      expect((await prisma().user.findUnique({ where: { id: user.id } }))?.accountStatus).toBe('deactivated');

      const done = await http()
        .post('/auth/login/two-factor')
        .send({ challengeToken: res.body.challengeToken, code: totp(user.secret) })
        .expect(200);
      expect(done.body.accessToken).toEqual(expect.any(String));
      expect((await prisma().user.findUnique({ where: { id: user.id } }))?.accountStatus).toBe('active');
    });

    it('cookie mode: a challenge sets NO cookie; finishing the sign-in sets the refresh cookie and keeps the token out of the body', async () => {
      const user = await enrolledUser();
      advanceStep();
      const cookieMode = { 'X-Auth-Mode': 'cookie', Origin: WEB };
      const login = await http().post('/auth/login').set(cookieMode).send({ email: user.email, password: PASSWORD }).expect(200);
      expect(login.body.twoFactorRequired).toBe(true);
      expect(login.headers['set-cookie']).toBeUndefined();

      const done = await http()
        .post('/auth/login/two-factor')
        .set(cookieMode)
        .send({ challengeToken: login.body.challengeToken, code: totp(user.secret) })
        .expect(200);
      expect(String(done.headers['set-cookie'])).toMatch(/^sn_rt=.+HttpOnly/i);
      expect(done.body).not.toHaveProperty('refreshToken');
      expect(done.body.accessToken).toEqual(expect.any(String));
    });

    it('a challenge of the USER kind does not work on the admin endpoints, and an admin challenge does not work here', async () => {
      const user = await enrolledUser();
      const admin = await enrolledAdmin();
      advanceStep();
      const userChallenge = await twoFactor.issueChallenge('user', user.id, false);
      const adminChallenge = await twoFactor.issueChallenge('admin', admin.id, false);
      await http().post('/admin/auth/login/two-factor').send({ challengeToken: userChallenge.challengeToken, code: totp(admin.secret) }).expect(401);
      await http().post('/auth/login/two-factor').send({ challengeToken: adminChallenge.challengeToken, code: totp(user.secret) }).expect(401);
      // the right door, right code: both still work (the refusals above burned nothing)
      await http().post('/auth/login/two-factor').send({ challengeToken: userChallenge.challengeToken, code: totp(user.secret) }).expect(200);
      await http().post('/admin/auth/login/two-factor').send({ challengeToken: adminChallenge.challengeToken, code: totp(admin.secret) }).expect(200);
    });
  });

  describe('user: backup codes and turning it off', () => {
    it('regenerate needs the password, replaces all ten, and the old ones are dead', async () => {
      const user = await enrolledUser();
      await http().post('/auth/two-factor/backup-codes/regenerate').set(user.auth).send({ password: 'wrong-password' }).expect(401);
      expect(await userCodeRows(user.id)).toHaveLength(10);

      const fresh = await http().post('/auth/two-factor/backup-codes/regenerate').set(user.auth).send({ password: PASSWORD }).expect(200);
      const newCodes = fresh.body.backupCodes as string[];
      expect(newCodes).toHaveLength(10);
      expect(newCodes.some((c) => user.backupCodes.includes(c))).toBe(false);
      expect(await userCodeRows(user.id)).toHaveLength(10);

      const oldCodeLogin = await twoFactor.issueChallenge('user', user.id, false);
      await http().post('/auth/login/two-factor').send({ challengeToken: oldCodeLogin.challengeToken, code: user.backupCodes[0] }).expect(401);
      await http().post('/auth/login/two-factor').send({ challengeToken: oldCodeLogin.challengeToken, code: newCodes[0] }).expect(200);
    });

    it('turning it off needs the password; it clears the secret fields, deletes every code, and sign-in is password-only again', async () => {
      const user = await enrolledUser();
      await http().post('/auth/two-factor/disable').set(user.auth).send({ password: 'wrong-password' }).expect(401);
      expect((await userColumns(user.id)).totpEnabledAt).not.toBeNull();

      await http().post('/auth/two-factor/disable').set(user.auth).send({ password: PASSWORD }).expect(204);
      expect(await userColumns(user.id)).toEqual({ totpSecretEncrypted: null, totpEnabledAt: null, totpLastUsedStep: null });
      expect(await userCodeRows(user.id)).toHaveLength(0);

      const login = await http().post('/auth/login').send({ email: user.email, password: PASSWORD }).expect(200);
      expect(login.body.accessToken).toEqual(expect.any(String));
      await http().post('/auth/two-factor/disable').set(user.auth).send({ password: PASSWORD }).expect(409);
    });
  });

  // ================================================================== ADMINS

  describe('admin: mandatory enrolment at sign-in (ADMIN_2FA_ENFORCED = "true")', () => {
    it('A1: the password step returns an ENROLMENT token and no session; the first valid code enrols AND signs in, with the backup codes once', async () => {
      process.env.ADMIN_2FA_ENFORCED = 'true';
      const admin = await seedAdmin('moderator');

      const login = await http().post('/admin/auth/login').set({ 'X-Auth-Mode': 'cookie', Origin: ADMIN_ORIGIN }).send({ email: admin.email, password: PASSWORD }).expect(200);
      expect(login.body).toMatchObject({ twoFactorEnrolmentRequired: true, expiresInSeconds: 600 });
      expect(login.body).not.toHaveProperty('accessToken');
      expect(login.headers['set-cookie']).toBeUndefined();
      const token = login.body.enrolmentToken as string;
      // An enrolment token is not an access token.
      await http().get('/admin/auth/two-factor/status').set(bearer(token)).expect(401);
      expect(await adminColumns(admin.id)).toEqual({ totpSecretEncrypted: null, totpEnabledAt: null, totpLastUsedStep: null });

      const start = await http().post('/admin/auth/login/two-factor/enrol/start').send({ enrolmentToken: token }).expect(200);
      expect(start.body.secret).toMatch(/^[A-Z2-7]{32}$/);
      const parked = (await redis.get(`2fa:pending:admin:${admin.id}`)) as string;
      expect(parked.startsWith('v1:')).toBe(true);
      expect(parked).not.toContain(start.body.secret);

      await http()
        .post('/admin/auth/login/two-factor/enrol/confirm')
        .send({ enrolmentToken: token, code: wrongCode(start.body.secret) })
        .expect(401);
      const done = await http()
        .post('/admin/auth/login/two-factor/enrol/confirm')
        .set({ 'X-Auth-Mode': 'cookie', Origin: ADMIN_ORIGIN })
        .send({ enrolmentToken: token, code: totp(start.body.secret) })
        .expect(200);

      expect(done.body.backupCodes).toHaveLength(10);
      expect(done.body.accessToken).toEqual(expect.any(String));
      expect(done.body.admin.id).toBe(admin.id);
      expect(done.body).not.toHaveProperty('refreshToken'); // cookie mode
      expect(String(done.headers['set-cookie'])).toMatch(/^sn_admin_rt=.+HttpOnly/i);
      expect(String(done.headers['set-cookie'])).not.toMatch(/Max-Age/i); // non-persistent (the founder's decision of 2026-10-29)

      const row = await adminColumns(admin.id);
      expect(row.totpEnabledAt).toBeInstanceOf(Date);
      expect(row.totpSecretEncrypted).toMatch(/^v1:/);
      expect(row.totpSecretEncrypted).not.toContain(start.body.secret);
      expect(dob.decryptString(row.totpSecretEncrypted as string)).toBe(start.body.secret);
      const codes = await adminCodeRows(admin.id);
      expect(codes).toHaveLength(10);
      codes.forEach((c) => expect(c.codeHash.startsWith('$argon2id$')).toBe(true));

      // The new session works, and the token is spent.
      const status = await http().get('/admin/auth/two-factor/status').set(bearer(done.body.accessToken)).expect(200);
      expect(status.body).toEqual({ enabled: true, backupCodesRemaining: 10 });
      await http().post('/admin/auth/login/two-factor/enrol/start').send({ enrolmentToken: token }).expect(401);
    });

    it('A2: with enforcement OFF (the default) an admin without two-factor signs in with a password alone, as before', async () => {
      const admin = await seedAdmin('editor');
      const login = await http().post('/admin/auth/login').send({ email: admin.email, password: PASSWORD }).expect(200);
      expect(login.body.accessToken).toEqual(expect.any(String));
      expect(login.body).not.toHaveProperty('twoFactorEnrolmentRequired');
    });

    it('token kinds: an enrolment token is not a login challenge, and a login challenge is not an enrolment token', async () => {
      process.env.ADMIN_2FA_ENFORCED = 'true';
      const fresh = await seedAdmin('moderator');
      const enrolled = await enrolledAdmin('moderator');
      advanceStep();
      const enrolment = await twoFactor.issueAdminEnrolmentToken(fresh.id, false);
      const challenge = await twoFactor.issueChallenge('admin', enrolled.id, false);

      await http().post('/admin/auth/login/two-factor').send({ challengeToken: enrolment.enrolmentToken, code: totp(enrolled.secret) }).expect(401);
      await http().post('/admin/auth/login/two-factor/enrol/start').send({ enrolmentToken: challenge.challengeToken }).expect(401);
      await http()
        .post('/admin/auth/login/two-factor/enrol/confirm')
        .send({ enrolmentToken: challenge.challengeToken, code: totp(enrolled.secret) })
        .expect(401);
    });
  });

  describe('admin: signing in with the second factor', () => {
    it('A3: password -> challenge -> TOTP -> session (real HTTP login); backup code works once; a wrong code and a spent code answer alike', async () => {
      process.env.ADMIN_2FA_ENFORCED = 'true';
      const admin = await enrolledAdmin('moderator');
      advanceStep();

      const login = await http().post('/admin/auth/login').send({ email: admin.email, password: PASSWORD }).expect(200);
      expect(login.body).toMatchObject({ twoFactorRequired: true });
      expect(login.body).not.toHaveProperty('accessToken');
      const session = await http()
        .post('/admin/auth/login/two-factor')
        .send({ challengeToken: login.body.challengeToken, code: totp(admin.secret) })
        .expect(200);
      expect(session.body.accessToken).toEqual(expect.any(String));
      expect(session.body.admin.role).toBe('moderator');

      const c1 = await twoFactor.issueChallenge('admin', admin.id, false);
      await http().post('/admin/auth/login/two-factor').send({ challengeToken: c1.challengeToken, code: admin.backupCodes[0] }).expect(200);
      expect((await adminCodeRows(admin.id)).filter((r) => r.usedAt !== null)).toHaveLength(1);

      const c2 = await twoFactor.issueChallenge('admin', admin.id, false);
      const spent = await http().post('/admin/auth/login/two-factor').send({ challengeToken: c2.challengeToken, code: admin.backupCodes[0] }).expect(401);
      const wrong = await http().post('/admin/auth/login/two-factor').send({ challengeToken: c2.challengeToken, code: 'ZZZZZZZZZZ' }).expect(401);
      expect(spent.body).toEqual(wrong.body);
    });

    it('an admin cannot turn off their own two-factor while enforcement is on, and can (with the password) when it is off', async () => {
      const admin = await enrolledAdmin('moderator');
      process.env.ADMIN_2FA_ENFORCED = 'true';
      const refused = await http().post('/admin/auth/two-factor/disable').set(admin.auth).send({ password: PASSWORD }).expect(403);
      expect(refused.body.code).toBe('admin_two_factor_required');
      expect((await adminColumns(admin.id)).totpEnabledAt).not.toBeNull();

      delete process.env.ADMIN_2FA_ENFORCED;
      await http().post('/admin/auth/two-factor/disable').set(admin.auth).send({ password: 'wrong-password' }).expect(401);
      await http().post('/admin/auth/two-factor/disable').set(admin.auth).send({ password: PASSWORD }).expect(204);
      expect(await adminColumns(admin.id)).toEqual({ totpSecretEncrypted: null, totpEnabledAt: null, totpLastUsedStep: null });
      expect(await adminCodeRows(admin.id)).toHaveLength(0);
    });

    it('an admin can regenerate their backup codes with the password (the old ones die)', async () => {
      const admin = await enrolledAdmin('editor');
      await http().post('/admin/auth/two-factor/backup-codes/regenerate').set(admin.auth).send({ password: 'wrong-password' }).expect(401);
      const fresh = await http().post('/admin/auth/two-factor/backup-codes/regenerate').set(admin.auth).send({ password: PASSWORD }).expect(200);
      expect(fresh.body.backupCodes).toHaveLength(10);
      const c = await twoFactor.issueChallenge('admin', admin.id, false);
      await http().post('/admin/auth/login/two-factor').send({ challengeToken: c.challengeToken, code: admin.backupCodes[0] }).expect(401);
    });
  });

  // backend/b086-two-factor-followups (founder decision 2026-10-31: block at next refresh). Sessions are seeded through
  // the real AdminTokenService and Prisma, and refreshed over real HTTP, so this spends none of the 5-per-15-minutes
  // admin login budget (#190).
  describe('admin: the refresh gate (ADMIN_2FA_ENFORCED = "true")', () => {
    const COOKIE_REFRESH = { 'X-Auth-Mode': 'cookie', Origin: ADMIN_ORIGIN };
    const adminRefreshKeys = () => redis.keys('admin:refresh:token:*');
    const tokenId = (raw: string) => `admin:refresh:token:${raw.split('.')[0]}`;
    const issue = (adminId: string, role = 'editor') => app.get(AdminTokenService).issueTokenPair(adminId, role);
    // Enrolled through the service, not over HTTP: the admin enrol/confirm route is limited to 10 per IP for the life of
    // this app (ADMIN_CODE_IP_LIMIT), a budget the rest of this file already uses.
    const enrolDirectly = async (role: 'editor' | 'moderator') => {
      const admin = await seedAdmin(role);
      const { secret } = await twoFactor.startEnrolment('admin', admin.id);
      await twoFactor.confirmEnrolment('admin', admin.id, totp(secret));
      return admin;
    };

    it('an UNENROLLED admin with an existing session is refused at its next refresh (body mode): coded 401, every session of that admin dead, nothing usable left behind', async () => {
      const gated = await seedAdmin('editor'); // no two-factor
      const bystander = await enrolDirectly('moderator'); // another admin, enrolled
      const sessionA = await issue(gated.id);
      const sessionB = await issue(gated.id);
      const bystanderSession = await issue(bystander.id, 'moderator');
      process.env.ADMIN_2FA_ENFORCED = 'true';

      const keysBefore = new Set(await adminRefreshKeys());
      expect(keysBefore.has(tokenId(sessionA.refreshToken.token))).toBe(true);

      const res = await http().post('/admin/auth/refresh').send({ refreshToken: sessionA.refreshToken.token }).expect(401);
      expect(res.body).toMatchObject({
        statusCode: 401,
        code: 'admin_two_factor_enrolment_required',
        message: 'Two-factor enrolment is required.',
      });
      expect(res.body).not.toHaveProperty('accessToken');
      expect(res.body).not.toHaveProperty('refreshToken');

      // Both of the admin's sessions are gone from Redis, and the replacement the rotation issued is not left over.
      const keysAfter = new Set(await adminRefreshKeys());
      expect(keysAfter.has(tokenId(sessionA.refreshToken.token))).toBe(false);
      expect(keysAfter.has(tokenId(sessionB.refreshToken.token))).toBe(false);
      for (const key of keysAfter) expect(keysBefore.has(key)).toBe(true); // nothing NEW remains
      expect(await redis.smembers(`admin:refresh:admin:${gated.id}`)).toEqual([]);

      // The second session cannot be refreshed either (an ordinary 401, no pair).
      const second = await http().post('/admin/auth/refresh').send({ refreshToken: sessionB.refreshToken.token }).expect(401);
      expect(second.body).not.toHaveProperty('accessToken');

      // The bystander is untouched.
      expect(keysAfter.has(tokenId(bystanderSession.refreshToken.token))).toBe(true);
      await http().post('/admin/auth/refresh').send({ refreshToken: bystanderSession.refreshToken.token }).expect(200);
    });

    it('cookie mode: the same coded 401, and the sn_admin_rt cookie is cleared', async () => {
      const gated = await seedAdmin('editor');
      const session = await issue(gated.id);
      process.env.ADMIN_2FA_ENFORCED = 'true';

      const res = await http()
        .post('/admin/auth/refresh')
        .set({ ...COOKIE_REFRESH, Cookie: `sn_admin_rt=${session.refreshToken.token}` })
        .send({})
        .expect(401);
      expect(res.body).toMatchObject({ code: 'admin_two_factor_enrolment_required' });
      expect(res.body).not.toHaveProperty('accessToken');
      const cookie = String(res.headers['set-cookie']);
      expect(cookie).toContain('sn_admin_rt=;');
      expect(cookie).toContain('Path=/admin/auth');
      expect(cookie).toMatch(/Expires=Thu, 01 Jan 1970|Max-Age=0/);
      expect(await redis.smembers(`admin:refresh:admin:${gated.id}`)).toEqual([]);
    });

    it('an ENROLLED admin refreshes normally under enforcement, in both modes, and the rotated token keeps working', async () => {
      const admin = await enrolDirectly('moderator');
      process.env.ADMIN_2FA_ENFORCED = 'true';

      const first = await issue(admin.id, 'moderator');
      const body = await http().post('/admin/auth/refresh').send({ refreshToken: first.refreshToken.token }).expect(200);
      expect(body.body.accessToken).toEqual(expect.any(String));
      expect(body.body.refreshToken).toEqual(expect.any(String));

      const cookieRes = await http()
        .post('/admin/auth/refresh')
        .set({ ...COOKIE_REFRESH, Cookie: `sn_admin_rt=${body.body.refreshToken}` })
        .send({})
        .expect(200);
      expect(cookieRes.body.accessToken).toEqual(expect.any(String));
      expect(cookieRes.body).not.toHaveProperty('refreshToken'); // cookie mode
      expect(String(cookieRes.headers['set-cookie'])).toMatch(/^sn_admin_rt=.+HttpOnly/i);
    });

    it('enforcement OFF (unset): an unenrolled admin refreshes as before; so does one when the value is anything but the literal "true"', async () => {
      const admin = await seedAdmin('editor');
      for (const value of [undefined, 'TRUE', '1', 'false', '']) {
        if (value === undefined) delete process.env.ADMIN_2FA_ENFORCED;
        else process.env.ADMIN_2FA_ENFORCED = value;
        const session = await issue(admin.id);
        const res = await http().post('/admin/auth/refresh').send({ refreshToken: session.refreshToken.token }).expect(200);
        expect(res.body.accessToken).toEqual(expect.any(String));
      }
    });

    it('USERS are unaffected: a user with no two-factor still refreshes with enforcement on (theirs is optional)', async () => {
      process.env.ADMIN_2FA_ENFORCED = 'true';
      const user = await seedUser();
      const pair = await app.get(TokenService).issueTokenPair(user.id, 'user');
      const res = await http().post('/auth/refresh').send({ refreshToken: pair.refreshToken.token }).expect(200);
      expect(res.body.accessToken).toEqual(expect.any(String));
    });

    it('access tokens already issued stay valid until they expire (no per-request check): an unenrolled admin access token still works after the refresh was refused', async () => {
      const gated = await seedAdmin('editor');
      const session = await issue(gated.id);
      process.env.ADMIN_2FA_ENFORCED = 'true';
      await http().post('/admin/auth/refresh').send({ refreshToken: session.refreshToken.token }).expect(401);
      await http().get('/admin/auth/two-factor/status').set(bearer(session.accessToken.token)).expect(200);
    });
  });

  describe('admin: peer reset (POST /admin/staff/:id/two-factor/reset)', () => {
    it('a peer superadmin clears the target, writes the audit row, and kills the target\'s old session; the target must enrol again', async () => {
      const peer = await seedAdmin('superadmin');
      const target = await enrolledAdmin('editor');
      // Two sessions for the target: one proves refresh works in this setup, the other must die with the reset.
      const pairs = await Promise.all([
        app.get(AdminTokenService).issueTokenPair(target.id, 'editor'),
        app.get(AdminTokenService).issueTokenPair(target.id, 'editor'),
      ]);
      const probe = await http().post('/admin/auth/refresh').send({ refreshToken: pairs[0].refreshToken.token }).expect(200);
      expect(probe.body.accessToken).toEqual(expect.any(String));

      const res = await http().post(`/admin/staff/${target.id}/two-factor/reset`).set(peer.auth).expect(200);
      expect(res.body).toEqual({ id: target.id, twoFactorEnabled: false });

      expect(await adminColumns(target.id)).toEqual({ totpSecretEncrypted: null, totpEnabledAt: null, totpLastUsedStep: null });
      expect(await adminCodeRows(target.id)).toHaveLength(0);

      const log = await prisma().adminActionLog.findMany({ where: { action: 'admin_user.two_factor_reset' } });
      expect(log).toHaveLength(1);
      expect(log[0]).toMatchObject({ adminId: peer.id, targetType: 'admin_user', targetId: target.id, notes: 'sessions_ended' });
      expect(JSON.stringify(log[0])).not.toContain(target.secret);

      // The OLD session is dead: its refresh token no longer works.
      await http().post('/admin/auth/refresh').send({ refreshToken: pairs[1].refreshToken.token }).expect(401);

      // With enforcement on, the reset admin now faces the enrolment gate at their next sign-in (real HTTP login #4).
      process.env.ADMIN_2FA_ENFORCED = 'true';
      const login = await http().post('/admin/auth/login').send({ email: target.email, password: PASSWORD }).expect(200);
      expect(login.body).toMatchObject({ twoFactorEnrolmentRequired: true });
    });

    it('nobody can reset their OWN (403), only a superadmin can reset anyone, and there must be something to reset (409)', async () => {
      const peer = await seedAdmin('superadmin');
      const mod = await enrolledAdmin('moderator');
      const plain = await seedAdmin('editor');

      const own = await http().post(`/admin/staff/${peer.id}/two-factor/reset`).set(peer.auth).expect(403);
      expect(own.body.code).toBe('cannot_reset_own_two_factor');
      await http().post(`/admin/staff/${mod.id}/two-factor/reset`).set(mod.auth).expect(403);
      await http().post(`/admin/staff/${mod.id}/two-factor/reset`).set(plain.auth).expect(403);
      expect((await adminColumns(mod.id)).totpEnabledAt).not.toBeNull(); // nothing was reset by any of the above

      await http().post(`/admin/staff/${plain.id}/two-factor/reset`).set(peer.auth).expect(409); // plain has no two-factor
      await http().post('/admin/staff/00000000-0000-0000-0000-000000000000/two-factor/reset').set(peer.auth).expect(404);
      await http().post(`/admin/staff/${mod.id}/two-factor/reset`).set(bearer('not-a-token')).expect(401);
      expect(await prisma().adminActionLog.count({ where: { action: 'admin_user.two_factor_reset' } })).toBe(0);
    });

    it('a USER token cannot reach the reset', async () => {
      const user = await seedUser();
      const target = await seedAdmin('editor');
      await http().post(`/admin/staff/${target.id}/two-factor/reset`).set(user.auth).expect(401);
    });
  });

  describe('admin: the last-superadmin database recovery (docs/admin-two-factor-recovery.md)', () => {
    it('the SQL in that document, as written, clears an enrolled superadmin so they enrol again at next sign-in', async () => {
      const doc = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'docs', 'admin-two-factor-recovery.md'), 'utf8');
      const block = /-- RECOVERY-SQL-BEGIN\r?\n([\s\S]*?)-- RECOVERY-SQL-END/.exec(doc);
      expect(block).not.toBeNull();

      const sole = await enrolledAdmin('superadmin');
      const bystander = await enrolledAdmin('moderator'); // another admin: must be untouched
      await prisma().adminActionLog.deleteMany();

      const sql = (block as RegExpExecArray)[1].split('REPLACE-WITH-THE-SUPERADMIN-EMAIL').join(sole.email);
      const statements = sql
        .split(/;\s*\r?\n/)
        .map((s) =>
          s
            .split(/\r?\n/)
            .filter((l) => !l.trim().startsWith('--'))
            .join('\n')
            .trim()
            .replace(/;$/, ''),
        )
        .filter((s) => s !== '' && !/^(BEGIN|COMMIT)$/i.test(s));
      expect(statements.length).toBeGreaterThanOrEqual(3);
      await prisma().$transaction(async (tx) => {
        for (const statement of statements) await tx.$executeRawUnsafe(statement);
      });

      expect(await adminColumns(sole.id)).toEqual({ totpSecretEncrypted: null, totpEnabledAt: null, totpLastUsedStep: null });
      expect(await adminCodeRows(sole.id)).toHaveLength(0);
      expect((await adminColumns(bystander.id)).totpEnabledAt).not.toBeNull();
      expect(await adminCodeRows(bystander.id)).toHaveLength(10);
      const audit = await prisma().adminActionLog.findMany({ where: { action: 'admin_user.two_factor_reset' } });
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ adminId: sole.id, targetId: sole.id, notes: 'database_recovery' });

      // At the next sign-in, with enforcement on, the recovered superadmin must enrol again (checked on the service,
      // not over HTTP: the admin login limit is spent deliberately sparingly in this file).
      process.env.ADMIN_2FA_ENFORCED = 'true';
      const next = await app.get(AdminAuthService).login(sole.email, PASSWORD);
      expect(next).toMatchObject({ twoFactorEnrolmentRequired: true });
    });
  });

  // ================================================================== ACCOUNT DELETION

  describe('account deletion removes the credential material', () => {
    it('anonymizeUser and minimiseHeldUser both clear the encrypted secret and delete every backup code', async () => {
      const sweep = app.get(AccountDeletionSweepService);
      const a = await enrolledUser();
      const b = await enrolledUser();
      expect((await userColumns(a.id)).totpSecretEncrypted).not.toBeNull();
      expect(await userCodeRows(a.id)).toHaveLength(10);

      await sweep.anonymizeUser(a.id, false);
      await sweep.minimiseHeldUser(b.id);

      for (const id of [a.id, b.id]) {
        expect(await userColumns(id)).toEqual({ totpSecretEncrypted: null, totpEnabledAt: null, totpLastUsedStep: null });
        expect(await userCodeRows(id)).toHaveLength(0);
      }
    });
  });
});
