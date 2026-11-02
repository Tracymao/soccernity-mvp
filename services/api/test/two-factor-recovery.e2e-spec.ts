import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { APP_CLOCK } from '../src/clock/clock';
import { PasswordService } from '../src/modules/auth/password/password.service';
import { RegistrationEmailService } from '../src/modules/auth/registration/email/registration-email.service';
import { TokenService } from '../src/modules/auth/token/token.service';
import { TwoFactorRecoverySweepService } from '../src/modules/two-factor/recovery/two-factor-recovery-sweep.service';
import { generateTotpCode } from '../src/modules/two-factor/totp.util';
import { RedisService } from '../src/redis/redis.service';
import { applyRealAuthLimits, clearAuthLimitCounters } from './auth-limits';
import { seedDob } from './dob-seed';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';

// ---------------------------------------------------------------------------------------------------------------
// B-276 (Decision Log #455, #456): USER two-factor recovery (lost device AND backup codes), against the REAL app, real
// Postgres and real Redis. The fakes are the email sender (a recorder, so the test reads exactly what would have been
// sent and to whom) and the app clock (so the 24-hour wait and the 72-hour link are stepped through, not waited for).
//
// WHAT IS PROVEN HERE THAT A MOCK CANNOT SHOW
//   - the database: tokens are stored only as hashes, the CHECK constraints and the partial unique index (one active
//     request per account) really hold, and the claim on a request is atomic under a real race
//   - the removal primitive: after the 24 hours the secret column is NULL, every backup code row is gone, every refresh
//     token is dead, and a sign-in is password-only; the claim and the clearing really are one transaction
//   - the real login limiter is shared: a wrong password spends the same failed-attempt budget as at sign-in
//   - the recovery budget (3 an hour, 60-second gap) in real Redis, with Retry-After
//   - the four failure cases give byte-identical HTTP answers
// ---------------------------------------------------------------------------------------------------------------

jest.setTimeout(240_000);

const PASSWORD = 'the-real-password-123';
const WRONG = 'definitely-not-the-password';
// Aligned to a 30-second TOTP step so the next step is exactly +30 s.
const BASE = Math.floor(Date.UTC(2030, 0, 1) / 30_000) * 30_000 + 5_000;
const STEP_MS = 30_000;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const clock = { current: BASE, now: () => new Date(clock.current) };
const REQUEST = '/auth/two-factor/recovery/request';

type SentCall = { method: string; args: unknown[] };

describe('User two-factor recovery (B-276) -- real Postgres + real Redis', () => {
  let app: INestApplication;
  let restoreAuthLimits: () => void;
  let redis: RedisService;
  const sent: SentCall[] = [];
  const prisma = () => getTestPrismaClient();
  // Every test is a different client address (X-Forwarded-For; trust proxy is on), because the per-IP limit on the
  // request route is an in-memory throttler that lives as long as the app, and this file makes more than 20 requests
  // across its tests. Within one test the address is constant, which the shared-login-budget test relies on.
  let testIp = '198.51.100.1';
  let testCounter = 0;
  const http = () => request.agent(app.getHttpServer()).set('X-Forwarded-For', testIp);
  const rand = () => Math.random().toString(36).slice(2);
  const calls = (method: string) => sent.filter((c) => c.method === method);
  const lastArgs = (method: string) => {
    const all = calls(method);
    return all[all.length - 1].args as string[];
  };

  const emailRecorder = new Proxy(
    {},
    {
      // Only send* methods exist (answering every property would look like a thenable and hang Nest).
      get: (_t, name: string | symbol) => {
        if (typeof name !== 'string' || !name.startsWith('send')) return undefined;
        return (...args: unknown[]) => {
          sent.push({ method: name, args });
          return Promise.resolve(name === 'sendLoginLockoutNoticeEmail' ? true : undefined);
        };
      },
    },
  );

  beforeAll(async () => {
    restoreAuthLimits = applyRealAuthLimits();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RegistrationEmailService)
      .useValue(emailRecorder)
      .overrideProvider(APP_CLOCK)
      .useValue(clock)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    (app.getHttpAdapter().getInstance() as { set(k: string, v: unknown): void }).set('trust proxy', true);
    await app.init();
    redis = app.get(RedisService);
  });

  beforeEach(async () => {
    await resetDatabase();
    await clearAuthLimitCounters(app);
    for (const pattern of ['2fa:*', 'guardian-security-notice:*']) {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) await redis.del(...keys);
    }
    sent.length = 0;
    clock.current = BASE;
    testCounter += 1;
    testIp = `198.51.${Math.floor(testCounter / 250)}.${(testCounter % 250) + 1}`;
  });

  afterAll(async () => {
    await clearAuthLimitCounters(app);
    await app.close();
    restoreAuthLimits();
    await disconnectTestPrismaClient();
  });

  // ---------------------------------------------------------------- helpers

  const totp = (secret: string, offsetSteps = 0) => generateTotpCode(secret, clock.current + offsetSteps * STEP_MS);

  type SeedOpts = {
    isMinor?: boolean;
    guardian?: { consentStatus: string; email?: string } | null;
    accountStatus?: string;
    username?: string | null;
  };

  async function seedUser(opts: SeedOpts = {}) {
    const isMinor = opts.isMinor ?? false;
    const email = `rec-${rand()}@example.com`;
    const user = await prisma().user.create({
      data: {
        email,
        passwordHash: await app.get(PasswordService).hash(PASSWORD),
        displayName: 'Real Person',
        username: opts.username === undefined ? null : opts.username,
        dateOfBirth: seedDob(isMinor ? '2012-06-01' : '1990-01-01'),
        isMinor,
        accountStatus: opts.accountStatus ?? 'active',
      },
    });
    let guardianEmail: string | null = null;
    if (isMinor && opts.guardian !== null) {
      const g = opts.guardian ?? { consentStatus: 'confirmed' };
      guardianEmail = g.email ?? `guardian-${rand()}@example.com`;
      await prisma().guardian.create({
        data: {
          minorUserId: user.id,
          name: 'Guardian Person',
          email: guardianEmail,
          relationship: 'Parent',
          consentToken: `consent-${rand()}`,
          consentTokenExpiresAt: new Date(Date.now() + 48 * 3600 * 1000),
          consentStatus: g.consentStatus,
        },
      });
    }
    const pair = await app.get(TokenService).issueTokenPair(user.id, user.role);
    return {
      id: user.id,
      email,
      guardianEmail,
      auth: { Authorization: `Bearer ${pair.accessToken.token}` },
      refreshToken: pair.refreshToken.token,
    };
  }

  // A user with two-factor on, enrolled over HTTP at BASE. Returns the secret and the 10 backup codes.
  async function enrolledUser(opts: SeedOpts = {}) {
    const user = await seedUser(opts);
    const start = await http().post('/auth/two-factor/enrol/start').set(user.auth).expect(200);
    const confirm = await http()
      .post('/auth/two-factor/enrol/confirm')
      .set(user.auth)
      .send({ code: totp(start.body.secret) })
      .expect(200);
    if (opts.isMinor) {
      // Turning two-factor on emails a minor's confirmed guardian in the background (B-275). That notice is not part
      // of the recovery flow under test, so let it land and forget it.
      await new Promise((r) => setTimeout(r, 400));
      sent.length = 0;
    }
    return { ...user, secret: start.body.secret as string, backupCodes: confirm.body.backupCodes as string[] };
  }

  // The recovery budget (3 an hour, 60-second gap) is real Redis time, which the test clock cannot move, so a test
  // that makes more than one request for the same account clears it between requests.
  async function clearRecoveryBudget() {
    const keys = await redis.keys('auth-limit:recovery-*');
    if (keys.length > 0) await redis.del(...keys);
  }

  // Not async: it returns the supertest request, so callers can chain .expect(...) or just await it.
  const requestRecovery = (email: string, password = PASSWORD) => http().post(REQUEST).send({ email, password });

  const rows = (userId: string) =>
    prisma().$queryRaw<
      Array<{ id: string; kind: string; state: string; linkTokenHash: string; cancelTokenHash: string | null; doneAt: Date | null; executeAt: Date | null; expiresAt: Date; createdAt: Date }>
    >`SELECT "id", "kind", "state", "linkTokenHash", "cancelTokenHash", "doneAt", "executeAt", "expiresAt", "createdAt" FROM "TwoFactorRecoveryRequest" WHERE "userId" = ${userId} ORDER BY "createdAt", "id"`;
  const userColumns = async (id: string) =>
    (
      await prisma().$queryRaw<Array<{ totpSecretEncrypted: string | null; totpEnabledAt: Date | null; totpLastUsedStep: number | null }>>`
        SELECT "totpSecretEncrypted", "totpEnabledAt", "totpLastUsedStep" FROM "User" WHERE "id" = ${id}`
    )[0];
  const backupCodeCount = async (id: string) =>
    Number((await prisma().$queryRaw<Array<{ n: bigint }>>`SELECT COUNT(*) AS n FROM "UserBackupCode" WHERE "userId" = ${id}`)[0].n);
  const sweep = () => app.get(TwoFactorRecoverySweepService).sweep(clock.now());

  // ================================================================== the failure cases

  describe('request: failures are indistinguishable', () => {
    it('an unknown email, a wrong password, two-factor off and an inactive account give byte-identical HTTP answers, and send nothing', async () => {
      const real = await enrolledUser();
      const off = await seedUser();
      const gone = await enrolledUser();
      await prisma().user.update({ where: { id: gone.id }, data: { accountStatus: 'deactivated' } });

      const responses = [
        await requestRecovery(`nobody-${rand()}@example.com`),
        await requestRecovery(real.email, WRONG),
        await requestRecovery(off.email),
        await requestRecovery(gone.email),
      ];

      for (const r of responses) {
        expect(r.status).toBe(202);
        expect(r.text).toBe('{"audience":"account"}');
        expect(r.headers['content-type']).toBe(responses[0].headers['content-type']);
      }
      expect(sent).toHaveLength(0);
      expect((await rows(real.id)).length + (await rows(off.id)).length + (await rows(gone.id)).length).toBe(0);
    });

    it('a wrong password here spends the SAME failed-attempt budget as a wrong password at sign-in', async () => {
      const user = await enrolledUser();
      // Three wrong passwords through recovery (the per-email budget is real Redis time, so it is cleared between)...
      for (let i = 0; i < 3; i++) {
        await clearRecoveryBudget();
        await requestRecovery(user.email, WRONG).expect(202);
      }
      // ...and two at sign-in make five failed attempts for this account and address: the next sign-in is refused,
      // even with the right password.
      for (let i = 0; i < 2; i++) await http().post('/auth/login').send({ email: user.email, password: WRONG }).expect(401);
      await http().post('/auth/login').send({ email: user.email, password: PASSWORD }).expect(429);
      // And recovery itself is refused the same way.
      await clearRecoveryBudget();
      await requestRecovery(user.email).expect(429);
    });
  });

  // ================================================================== the adult path

  describe('adult: request -> confirm -> 24 hours -> two-factor removed', () => {
    it('the whole path against the database', async () => {
      const user = await enrolledUser();
      expect((await userColumns(user.id)).totpEnabledAt).not.toBeNull();
      expect(await backupCodeCount(user.id)).toBe(10);

      // request
      const answer = await requestRecovery(user.email).expect(202);
      expect(answer.body).toEqual({ audience: 'account' });
      expect(calls('sendTwoFactorRecoveryLinkEmail')).toHaveLength(1);
      const [to, linkToken] = lastArgs('sendTwoFactorRecoveryLinkEmail');
      expect(to).toBe(user.email);
      const [req1] = await rows(user.id);
      expect(req1).toMatchObject({ kind: 'adult', state: 'pending' });
      // Only a hash is stored: 64 hex characters, and the secret part of the emailed token is nowhere in the row.
      expect(req1.linkTokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(req1)).not.toContain(linkToken.split('.')[1]);
      expect(req1.expiresAt.getTime() - req1.createdAt.getTime()).toBe(DAY);

      // the link preview changes nothing
      const preview = await http().get(`/auth/two-factor/recovery/link/${linkToken}`).expect(200);
      expect(preview.body).toEqual({ state: 'valid', kind: 'adult' });
      expect((await rows(user.id))[0].state).toBe('pending');

      // confirm: the wait starts
      clock.current += 10 * 60 * 1000;
      const confirmedAt = clock.current;
      const confirmed = await http().post('/auth/two-factor/recovery/confirm').send({ token: linkToken }).expect(200);
      expect(confirmed.body.state).toBe('waiting');
      expect(new Date(confirmed.body.executeAt).getTime()).toBe(confirmedAt + DAY);
      const [req2] = await rows(user.id);
      expect(req2).toMatchObject({ state: 'waiting' });
      expect(req2.cancelTokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(req2.cancelTokenHash).not.toBe(req2.linkTokenHash);
      const [, cancelToken, whenText] = lastArgs('sendTwoFactorRecoveryWaitingEmail');
      expect(cancelToken).toBe(confirmed.body.cancelToken);
      expect(whenText).toMatch(/UTC$/);
      // a second click on the same link is "used"
      await http()
        .post('/auth/two-factor/recovery/confirm')
        .send({ token: linkToken })
        .expect(400)
        .expect((r) => expect(r.body).toMatchObject({ state: 'used', code: 'two_factor_recovery_link_used' }));

      // the sign-in prompt warns that a request is waiting (only after the right password)
      const challenge = await http().post('/auth/login').send({ email: user.email, password: PASSWORD }).expect(200);
      expect(challenge.body).toMatchObject({
        twoFactorRequired: true,
        recoveryPending: true,
        recoveryExecuteAt: new Date(confirmedAt + DAY).toISOString(),
      });
      await http().post('/auth/login').send({ email: user.email, password: WRONG }).expect(401);

      // 23 hours 59 minutes: nothing happens
      clock.current = confirmedAt + DAY - 60 * 1000;
      expect(await sweep()).toMatchObject({ completed: [] });
      expect((await userColumns(user.id)).totpEnabledAt).not.toBeNull();
      expect(await backupCodeCount(user.id)).toBe(10);

      // 24 hours: removed, in one go
      clock.current = confirmedAt + DAY;
      const swept = await sweep();
      expect(swept.completed).toEqual([req1.id]);
      expect(await userColumns(user.id)).toEqual({ totpSecretEncrypted: null, totpEnabledAt: null, totpLastUsedStep: null });
      expect(await backupCodeCount(user.id)).toBe(0);
      const [done] = await rows(user.id);
      expect(done.state).toBe('done');
      expect(done.doneAt!.getTime()).toBe(confirmedAt + DAY);
      expect(lastArgs('sendTwoFactorRecoveryCompletedEmail')[0]).toBe(user.email);
      // every session is dead
      await http().post('/auth/refresh').send({ refreshToken: user.refreshToken }).expect(401);
      // and sign-in is password only now
      const session = await http().post('/auth/login').send({ email: user.email, password: PASSWORD }).expect(200);
      expect(session.body.accessToken).toBeDefined();
      expect(session.body.twoFactorRequired).toBeUndefined();
      // a second sweep finds nothing
      expect(await sweep()).toMatchObject({ completed: [] });
      expect(calls('sendTwoFactorRecoveryCompletedEmail')).toHaveLength(1);
    });

    it('cancel by the cancel link: the wait is stopped, a second cancel is "used", and the sweep removes nothing', async () => {
      const user = await enrolledUser();
      await requestRecovery(user.email).expect(202);
      const [, linkToken] = lastArgs('sendTwoFactorRecoveryLinkEmail');
      const confirmed = await http().post('/auth/two-factor/recovery/confirm').send({ token: linkToken }).expect(200);

      await http().post('/auth/two-factor/recovery/cancel').send({ cancelToken: confirmed.body.cancelToken }).expect(200, { state: 'cancelled' });
      expect((await rows(user.id))[0].state).toBe('cancelled');
      await http()
        .post('/auth/two-factor/recovery/cancel')
        .send({ cancelToken: confirmed.body.cancelToken })
        .expect(400)
        .expect((r) => expect(r.body.state).toBe('used'));
      // the LINK token is not a cancel token
      await http().post('/auth/two-factor/recovery/cancel').send({ cancelToken: linkToken }).expect(400);

      clock.current += DAY + HOUR;
      expect(await sweep()).toMatchObject({ completed: [] });
      expect((await userColumns(user.id)).totpEnabledAt).not.toBeNull();
      expect(await backupCodeCount(user.id)).toBe(10);
    });

    it('a successful two-factor sign-in (device code) cancels a waiting request; so does a backup code', async () => {
      for (const way of ['device', 'backup'] as const) {
        await resetDatabase();
        await clearAuthLimitCounters(app);
        sent.length = 0;
        clock.current = BASE;
        const user = await enrolledUser();
        await requestRecovery(user.email).expect(202);
        const [, linkToken] = lastArgs('sendTwoFactorRecoveryLinkEmail');
        await http().post('/auth/two-factor/recovery/confirm').send({ token: linkToken }).expect(200);

        const challenge = await http().post('/auth/login').send({ email: user.email, password: PASSWORD }).expect(200);
        expect(challenge.body.recoveryPending).toBe(true);
        clock.current += STEP_MS;
        const code = way === 'device' ? totp(user.secret) : user.backupCodes[0];
        await http()
          .post('/auth/login/two-factor')
          .send({ challengeToken: challenge.body.challengeToken, code })
          .expect(200);

        expect((await rows(user.id))[0].state).toBe('cancelled');
        clock.current += DAY + HOUR;
        expect(await sweep()).toMatchObject({ completed: [] });
        expect((await userColumns(user.id)).totpEnabledAt).not.toBeNull();
        // and the next sign-in prompt no longer warns
        const next = await http().post('/auth/login').send({ email: user.email, password: PASSWORD }).expect(200);
        expect(next.body.recoveryPending).toBe(false);
        expect(next.body.recoveryExecuteAt).toBeUndefined();
      }
    });

    it('a wrong code at sign-in does NOT cancel the waiting request', async () => {
      const user = await enrolledUser();
      await requestRecovery(user.email).expect(202);
      await http().post('/auth/two-factor/recovery/confirm').send({ token: lastArgs('sendTwoFactorRecoveryLinkEmail')[1] }).expect(200);
      const challenge = await http().post('/auth/login').send({ email: user.email, password: PASSWORD }).expect(200);

      await http().post('/auth/login/two-factor').send({ challengeToken: challenge.body.challengeToken, code: '000000' }).expect(401);

      expect((await rows(user.id))[0].state).toBe('waiting');
    });

    it('the 24-hour link expires: confirm answers "expired" and the row stays pending', async () => {
      const user = await enrolledUser();
      await requestRecovery(user.email).expect(202);
      const [, linkToken] = lastArgs('sendTwoFactorRecoveryLinkEmail');
      clock.current += DAY + 1000;

      await http()
        .post('/auth/two-factor/recovery/confirm')
        .send({ token: linkToken })
        .expect(400)
        .expect((r) => expect(r.body).toMatchObject({ state: 'expired', code: 'two_factor_recovery_link_expired' }));
      expect((await http().get(`/auth/two-factor/recovery/link/${linkToken}`).expect(200)).body).toEqual({ state: 'expired', kind: 'adult' });
      expect((await rows(user.id))[0].state).toBe('pending');
    });

    it('two simultaneous clicks on the confirm link: exactly one wins (an atomic claim in Postgres)', async () => {
      const user = await enrolledUser();
      await requestRecovery(user.email).expect(202);
      const [, linkToken] = lastArgs('sendTwoFactorRecoveryLinkEmail');
      await app.listen(0);

      const results = await Promise.all([
        http().post('/auth/two-factor/recovery/confirm').send({ token: linkToken }),
        http().post('/auth/two-factor/recovery/confirm').send({ token: linkToken }),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
      expect(calls('sendTwoFactorRecoveryWaitingEmail')).toHaveLength(1);
      expect((await rows(user.id))[0].state).toBe('waiting');
    });

    it('a new request supersedes an unused one: one active row, the old link is "expired"', async () => {
      const user = await enrolledUser();
      await requestRecovery(user.email).expect(202);
      const [, firstToken] = lastArgs('sendTwoFactorRecoveryLinkEmail');
      await clearRecoveryBudget();
      await requestRecovery(user.email).expect(202);
      const [, secondToken] = lastArgs('sendTwoFactorRecoveryLinkEmail');

      const all = await rows(user.id);
      expect(all.map((r) => r.state).sort()).toEqual(['pending', 'superseded']);
      expect(all.find((r) => r.state === 'superseded')!.doneAt).not.toBeNull();
      expect((await http().get(`/auth/two-factor/recovery/link/${firstToken}`).expect(200)).body.state).toBe('expired');
      expect((await http().get(`/auth/two-factor/recovery/link/${secondToken}`).expect(200)).body.state).toBe('valid');
    });
  });

  // ================================================================== limits

  describe('request: the recovery budget', () => {
    it('a second request within 60 seconds is a 429 with Retry-After (the same for an email with no account)', async () => {
      const user = await enrolledUser();
      await requestRecovery(user.email).expect(202);
      const res = await requestRecovery(user.email).expect(429);
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
      expect(Number(res.headers['retry-after'])).toBeLessThanOrEqual(60);
      expect(res.body).toEqual({ statusCode: 429, message: 'ThrottlerException: Too Many Requests' });

      const ghost = `ghost-${rand()}@example.com`;
      await requestRecovery(ghost).expect(202);
      const ghostRes = await requestRecovery(ghost).expect(429);
      expect(ghostRes.body).toEqual(res.body);
      expect(Number(ghostRes.headers['retry-after'])).toBeGreaterThan(0);
    });

    it('at most three requests an hour per account: the fourth is a 429', async () => {
      const user = await enrolledUser();
      for (let i = 0; i < 3; i++) {
        // Only the 60-second gap key is dropped, so the hourly count keeps building.
        const gapKeys = await redis.keys('auth-limit:recovery-gap:*');
        if (gapKeys.length > 0) await redis.del(...gapKeys);
        await requestRecovery(user.email).expect(202);
      }
      const gapKeys = await redis.keys('auth-limit:recovery-gap:*');
      if (gapKeys.length > 0) await redis.del(...gapKeys);
      await requestRecovery(user.email).expect(429);
      // the refused request made no row
      expect((await rows(user.id)).length).toBe(3);
    });
  });

  // ================================================================== the minor path

  describe('minor with a confirmed guardian', () => {
    it('the guardian approves: two-factor is removed at once, every session is dead, the minor\'s OWN address is told', async () => {
      const minor = await enrolledUser({ isMinor: true, username: 'young_one' });
      const answer = await requestRecovery(minor.email).expect(202);
      expect(answer.body).toEqual({ audience: 'guardian' });

      const [guardianTo, token, name] = lastArgs('sendTwoFactorRecoveryGuardianLinkEmail');
      expect(guardianTo).toBe(minor.guardianEmail);
      expect(name).toBe('Real Person');
      expect(lastArgs('sendTwoFactorRecoveryMinorNoticeEmail')[0]).toBe(minor.email);
      expect(calls('sendTwoFactorRecoveryLinkEmail')).toHaveLength(0);
      const [row] = await rows(minor.id);
      expect(row).toMatchObject({ kind: 'guardian', state: 'pending' });
      expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBe(72 * HOUR);

      const preview = await http().get(`/auth/two-factor/recovery/link/${token}`).expect(200);
      expect(preview.body).toEqual({
        state: 'valid',
        kind: 'guardian',
        minor: { publicName: 'young_one' },
        requestedAt: new Date(BASE).toISOString(),
      });
      expect(JSON.stringify(preview.body)).not.toContain('Real Person');

      await http().post('/auth/two-factor/recovery/guardian/approve').send({ token }).expect(200, { state: 'done' });

      expect(await userColumns(minor.id)).toEqual({ totpSecretEncrypted: null, totpEnabledAt: null, totpLastUsedStep: null });
      expect(await backupCodeCount(minor.id)).toBe(0);
      expect((await rows(minor.id))[0].state).toBe('done');
      await http().post('/auth/refresh').send({ refreshToken: minor.refreshToken }).expect(401);
      expect(lastArgs('sendTwoFactorRecoveryApprovedEmail')[0]).toBe(minor.email);
      // Exactly ONE email went to the guardian for the whole flow, and no B-275 notice for the step they performed.
      expect(calls('sendTwoFactorRecoveryGuardianLinkEmail')).toHaveLength(1);
      expect(calls('sendGuardianSecurityNoticeEmail')).toHaveLength(0);
      // a second approve, or a decline now, is "used"
      await http().post('/auth/two-factor/recovery/guardian/approve').send({ token }).expect(400).expect((r) => expect(r.body.state).toBe('used'));
      await http().post('/auth/two-factor/recovery/guardian/decline').send({ token }).expect(400);
    });

    it('the guardian declines: two-factor stays, nothing is revoked, the minor is told to change their password', async () => {
      const minor = await enrolledUser({ isMinor: true });
      await requestRecovery(minor.email).expect(202);
      const [, token] = lastArgs('sendTwoFactorRecoveryGuardianLinkEmail');

      await http().post('/auth/two-factor/recovery/guardian/decline').send({ token }).expect(200, { state: 'declined' });

      expect((await rows(minor.id))[0].state).toBe('declined');
      expect((await userColumns(minor.id)).totpEnabledAt).not.toBeNull();
      expect(await backupCodeCount(minor.id)).toBe(10);
      await http().post('/auth/refresh').send({ refreshToken: minor.refreshToken }).expect(200);
      expect(lastArgs('sendTwoFactorRecoveryDeclinedEmail')[0]).toBe(minor.email);
      await http().post('/auth/two-factor/recovery/guardian/approve').send({ token }).expect(400);
    });

    it('the 72-hour link expires: both answers are "expired" and two-factor stays on', async () => {
      const minor = await enrolledUser({ isMinor: true });
      await requestRecovery(minor.email).expect(202);
      const [, token] = lastArgs('sendTwoFactorRecoveryGuardianLinkEmail');
      clock.current += 71 * HOUR;
      expect((await http().get(`/auth/two-factor/recovery/link/${token}`).expect(200)).body.state).toBe('valid');
      clock.current += 2 * HOUR;

      await http().post('/auth/two-factor/recovery/guardian/approve').send({ token }).expect(400).expect((r) => expect(r.body.state).toBe('expired'));
      await http().post('/auth/two-factor/recovery/guardian/decline').send({ token }).expect(400).expect((r) => expect(r.body.state).toBe('expired'));
      expect((await userColumns(minor.id)).totpEnabledAt).not.toBeNull();
    });

    it('an ADULT link does nothing on the guardian routes, and a guardian link does nothing on the adult confirm route', async () => {
      const grownUp = await enrolledUser();
      await requestRecovery(grownUp.email).expect(202);
      const [, adultToken] = lastArgs('sendTwoFactorRecoveryLinkEmail');
      await http().post('/auth/two-factor/recovery/guardian/approve').send({ token: adultToken }).expect(400).expect((r) => expect(r.body.state).toBe('invalid'));

      const minor = await enrolledUser({ isMinor: true });
      await requestRecovery(minor.email).expect(202);
      const [, guardianToken] = lastArgs('sendTwoFactorRecoveryGuardianLinkEmail');
      await http().post('/auth/two-factor/recovery/confirm').send({ token: guardianToken }).expect(400).expect((r) => expect(r.body.state).toBe('invalid'));
      expect((await userColumns(grownUp.id)).totpEnabledAt).not.toBeNull();
      expect((await userColumns(minor.id)).totpEnabledAt).not.toBeNull();
    });

    it.each([
      ['no guardian row', null],
      ['consent pending', { consentStatus: 'pending' }],
      ['consent declined', { consentStatus: 'declined' }],
    ])('a minor with no confirmed guardian (%s): { audience: "no_guardian" }, nothing created, nothing sent', async (_n, guardian) => {
      const minor = await enrolledUser({ isMinor: true, guardian: guardian as SeedOpts['guardian'] });

      const res = await requestRecovery(minor.email).expect(202);

      expect(res.body).toEqual({ audience: 'no_guardian' });
      expect(await rows(minor.id)).toHaveLength(0);
      expect(sent).toHaveLength(0);
    });
  });

  // ================================================================== the 30-day cleanup and the schema

  describe('sweep cleanup and schema guarantees', () => {
    it('deletes ended rows 30 days after they ended and never-used links 30 days after they expired, and keeps the rest', async () => {
      const user = await seedUser();
      const mk = (id: string, state: string, doneAt: Date | null, expiresAt: Date) =>
        prisma().twoFactorRecoveryRequest.create({
          data: { id, userId: user.id, kind: 'adult', state, linkTokenHash: 'a'.repeat(64), doneAt, expiresAt, ...(state === 'waiting' ? { confirmedAt: new Date(BASE), executeAt: new Date(BASE + 10 * DAY) } : {}) },
        });
      const old = new Date(BASE - 31 * DAY);
      const young = new Date(BASE - 29 * DAY);
      // One active row at a time (the partial unique index), so only one of pending/waiting is live here.
      await mk('11111111-0000-0000-0000-000000000001', 'done', old, old);
      await mk('11111111-0000-0000-0000-000000000002', 'cancelled', old, old);
      await mk('11111111-0000-0000-0000-000000000003', 'declined', young, young);
      await mk('11111111-0000-0000-0000-000000000004', 'superseded', old, old);
      await mk('11111111-0000-0000-0000-000000000005', 'pending', null, old);

      const swept = await sweep();

      expect(swept.deleted).toBe(4);
      expect((await rows(user.id)).map((r) => r.id)).toEqual(['11111111-0000-0000-0000-000000000003']);
    });

    it('the database refuses a second ACTIVE request for one account, an unknown state and an unknown kind', async () => {
      const user = await seedUser();
      const base = { userId: user.id, linkTokenHash: 'b'.repeat(64), expiresAt: new Date(BASE + DAY) };
      await prisma().twoFactorRecoveryRequest.create({ data: { ...base, kind: 'adult', state: 'pending' } });

      await expect(prisma().twoFactorRecoveryRequest.create({ data: { ...base, kind: 'adult', state: 'pending' } })).rejects.toThrow();
      await expect(
        prisma().twoFactorRecoveryRequest.create({ data: { ...base, kind: 'adult', state: 'waiting', confirmedAt: new Date(BASE), executeAt: new Date(BASE + DAY) } }),
      ).rejects.toThrow();
      await expect(prisma().twoFactorRecoveryRequest.create({ data: { ...base, kind: 'adult', state: 'bogus' } })).rejects.toThrow();
      await expect(prisma().twoFactorRecoveryRequest.create({ data: { ...base, kind: 'stranger', state: 'done', doneAt: new Date(BASE) } })).rejects.toThrow();
      // An ended row needs its end time, and a waiting row its two times.
      await expect(prisma().twoFactorRecoveryRequest.create({ data: { ...base, kind: 'adult', state: 'done' } })).rejects.toThrow();
      // Ended rows do not count as active: any number of them is fine.
      await prisma().twoFactorRecoveryRequest.create({ data: { ...base, kind: 'adult', state: 'cancelled', doneAt: new Date(BASE) } });
      await prisma().twoFactorRecoveryRequest.create({ data: { ...base, kind: 'adult', state: 'cancelled', doneAt: new Date(BASE) } });
      expect(await rows(user.id)).toHaveLength(3);
    });

    it('deleting the account row deletes its recovery requests (cascade)', async () => {
      const user = await seedUser();
      await prisma().twoFactorRecoveryRequest.create({
        data: { userId: user.id, kind: 'adult', state: 'pending', linkTokenHash: 'c'.repeat(64), expiresAt: new Date(BASE + DAY) },
      });
      await prisma().$executeRaw`DELETE FROM "User" WHERE "id" = ${user.id}`;
      expect(await rows(user.id)).toHaveLength(0);
    });
  });
});
