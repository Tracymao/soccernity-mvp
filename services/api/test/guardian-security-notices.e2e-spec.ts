import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { APP_CLOCK } from '../src/clock/clock';
import { PasswordService } from '../src/modules/auth/password/password.service';
import { ResetTokenStore } from '../src/modules/auth/password-reset/reset-token.store';
import { RegistrationEmailService } from '../src/modules/auth/registration/email/registration-email.service';
import { TokenService } from '../src/modules/auth/token/token.service';
import { generateTotpCode } from '../src/modules/two-factor/totp.util';
import { RedisService } from '../src/redis/redis.service';
import { applyRealAuthLimits, clearAuthLimitCounters } from './auth-limits';
import { seedDob } from './dob-seed';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';

// ---------------------------------------------------------------------------------------------------------------
// B-275 (Decision Log #456): guardian security-event notices, against the REAL app, real Postgres and real Redis.
// The only fake is the email sender: a recorder that stands in for every RegistrationEmailService instance, so the
// test can read exactly what would have been sent and to whom.
//
// WHAT IS PROVEN HERE THAT A MOCK CANNOT SHOW
//   - each real route (two-factor enrol/regenerate/disable, change-password, reset-password, the login lock)
//     really leads to ONE notice to the minor's confirmed guardian, and the routes' answers are unchanged
//   - an adult, and a minor whose guardian consent is pending, declined or expired, get nothing
//   - the sign-in lock notice is throttled by a real Redis key with a 24-hour TTL (one per account per day, across IPs)
//   - the email data carries only the sentence and the time (no IP address, device, location or account id)
// ---------------------------------------------------------------------------------------------------------------

jest.setTimeout(180_000);

const PASSWORD = 'the-real-password-123';
const NEW_PASSWORD = 'a-brand-new-password-456';
const WRONG = 'definitely-not-the-password';
// Aligned to a 30-second TOTP step so the next step is exactly +30 s.
const BASE = Math.floor(Date.UTC(2030, 0, 1) / 30_000) * 30_000 + 5_000;
const STEP_MS = 30_000;
const clock = { current: BASE, now: () => new Date(clock.current) };

type SentCall = { method: string; args: unknown[] };

describe('Guardian security notices (B-275) -- real Postgres + real Redis', () => {
  let app: INestApplication;
  let restoreAuthLimits: () => void;
  let redis: RedisService;
  const sent: SentCall[] = [];
  const prisma = () => getTestPrismaClient();
  const http = () => request(app.getHttpServer());
  const rand = () => Math.random().toString(36).slice(2);
  const guardianNotices = () => sent.filter((c) => c.method === 'sendGuardianSecurityNoticeEmail');

  // One recorder for every RegistrationEmailService instance in the app: any method records its call and resolves
  // (the lockout-notice method resolves true, as the real one does when it sent something).
  const emailRecorder = new Proxy(
    {},
    {
      // Only send* methods exist. Answering EVERY property would make this look like a thenable (`then`) and like it
      // has lifecycle hooks (`onModuleInit`...), and Nest would hang awaiting it.
      get: (_target, name: string | symbol) => {
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
    const keys = await redis.keys('guardian-security-notice:*');
    if (keys.length > 0) await redis.del(...keys);
    const tf = await redis.keys('2fa:*');
    if (tf.length > 0) await redis.del(...tf);
    sent.length = 0;
    clock.current = BASE;
  });

  afterAll(async () => {
    await clearAuthLimitCounters(app);
    await app.close();
    restoreAuthLimits();
    await disconnectTestPrismaClient();
  });

  // ---------------------------------------------------------------- helpers

  type SeedOpts = {
    isMinor?: boolean;
    consent?: string | null;
    guardianEmail?: string | null;
    displayName?: string;
    tokenExpired?: boolean;
  };

  async function seedUser(opts: SeedOpts = {}) {
    const isMinor = opts.isMinor ?? true;
    const email = `sec-${rand()}@example.com`;
    const user = await prisma().user.create({
      data: {
        email,
        passwordHash: await app.get(PasswordService).hash(PASSWORD),
        displayName: opts.displayName ?? 'Sam Minor',
        dateOfBirth: seedDob(isMinor ? '2012-06-01' : '1990-01-01'),
        isMinor,
        accountStatus: 'active',
      },
    });
    const consent = opts.consent === undefined ? 'confirmed' : opts.consent;
    const guardianEmail = opts.guardianEmail === undefined ? `guardian-${rand()}@example.com` : opts.guardianEmail;
    if (consent !== null && isMinor) {
      await prisma().guardian.create({
        data: {
          minorUserId: user.id,
          name: 'Guardian Person',
          email: guardianEmail ?? '',
          relationship: 'Parent',
          consentToken: `consent-${rand()}`,
          consentTokenExpiresAt: new Date(Date.now() + (opts.tokenExpired ? -48 : 48) * 3600 * 1000),
          consentStatus: consent,
        },
      });
    }
    const pair = await app.get(TokenService).issueTokenPair(user.id, user.role);
    return { id: user.id, email, guardianEmail, auth: { Authorization: `Bearer ${pair.accessToken.token}` } };
  }

  // Background notices: wait until the recorder holds `count` guardian notices, or give up and let the assertion fail.
  async function waitForNotices(count: number) {
    const deadline = Date.now() + 5_000;
    while (guardianNotices().length < count && Date.now() < deadline) await new Promise((r) => setTimeout(r, 25));
  }
  // For "nothing was sent": give any background work time to (not) happen.
  const settle = () => new Promise((r) => setTimeout(r, 400));

  const totp = (secret: string) => generateTotpCode(secret, clock.current);
  const noticeArgs = (call: SentCall) => call.args as [string, string, string, string]; // to, subject, summary, when

  // ================================================================== two-factor

  describe('two-factor changes on a minor with a confirmed guardian', () => {
    it('turning on, regenerating backup codes and turning off each email the guardian ONCE, and the routes answer as before', async () => {
      const minor = await seedUser();
      const start = await http().post('/auth/two-factor/enrol/start').set(minor.auth).expect(200);
      await settle();
      expect(guardianNotices()).toHaveLength(0); // starting is not a security change yet

      const confirm = await http()
        .post('/auth/two-factor/enrol/confirm')
        .set(minor.auth)
        .send({ code: totp(start.body.secret) })
        .expect(200);
      expect(Object.keys(confirm.body)).toEqual(['backupCodes']);
      await waitForNotices(1);
      expect(guardianNotices()).toHaveLength(1);
      const [to, subject, summary, when] = noticeArgs(guardianNotices()[0]);
      expect(to).toBe(minor.guardianEmail);
      expect(subject).toBe("Security change on Sam Minor's Soccernity account");
      expect(summary).toBe("Two-factor authentication was turned on for Sam Minor's Soccernity account.");
      expect(when).toMatch(/^\d{1,2} [A-Z][a-z]+ \d{4}, \d{2}:\d{2} UTC$/);

      const regen = await http()
        .post('/auth/two-factor/backup-codes/regenerate')
        .set(minor.auth)
        .send({ password: PASSWORD })
        .expect(200);
      expect(Object.keys(regen.body)).toEqual(['backupCodes']);
      await waitForNotices(2);

      const off = await http().post('/auth/two-factor/disable').set(minor.auth).send({ password: PASSWORD }).expect(204);
      expect(off.text).toBe('');
      await waitForNotices(3);

      expect(guardianNotices()).toHaveLength(3);
      expect(guardianNotices().map((c) => noticeArgs(c)[2])).toEqual([
        "Two-factor authentication was turned on for Sam Minor's Soccernity account.",
        "New two-factor backup codes were created for Sam Minor's Soccernity account. The old backup codes no longer work.",
        "Two-factor authentication was turned off for Sam Minor's Soccernity account.",
      ]);
      expect(guardianNotices().every((c) => noticeArgs(c)[0] === minor.guardianEmail)).toBe(true);
    });

    it('a failed action (wrong code, wrong password) sends nothing; only the real change is reported', async () => {
      const minor = await seedUser();
      const start = await http().post('/auth/two-factor/enrol/start').set(minor.auth).expect(200);
      await http().post('/auth/two-factor/enrol/confirm').set(minor.auth).send({ code: '000000' }).expect(401);
      await settle();
      expect(guardianNotices()).toHaveLength(0); // the wrong code changed nothing

      await http()
        .post('/auth/two-factor/enrol/confirm')
        .set(minor.auth)
        .send({ code: totp(start.body.secret) })
        .expect(200);
      await waitForNotices(1);

      // Two-factor is now on: a wrong password cannot turn it off or replace the codes.
      await http().post('/auth/two-factor/disable').set(minor.auth).send({ password: WRONG }).expect(401);
      await http().post('/auth/two-factor/backup-codes/regenerate').set(minor.auth).send({ password: WRONG }).expect(401);
      await settle();
      expect(guardianNotices()).toHaveLength(1); // still only the one real change (turning it on)
    });
  });

  // ================================================================== passwords

  describe('password changes', () => {
    it('change-password (signed in) emails the guardian once; the answer is still a bare 204', async () => {
      const minor = await seedUser();

      const res = await http()
        .post('/auth/change-password')
        .set(minor.auth)
        .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
        .expect(204);
      expect(res.text).toBe('');

      await waitForNotices(1);
      await settle();
      expect(guardianNotices()).toHaveLength(1);
      expect(noticeArgs(guardianNotices()[0])[2]).toBe("The password on Sam Minor's Soccernity account was changed.");
      expect(noticeArgs(guardianNotices()[0])[0]).toBe(minor.guardianEmail);
    });

    it('change-password with the wrong current password sends nothing', async () => {
      const minor = await seedUser();
      await http().post('/auth/change-password').set(minor.auth).send({ currentPassword: WRONG, newPassword: NEW_PASSWORD }).expect(401);
      await settle();
      expect(guardianNotices()).toHaveLength(0);
    });

    it('a completed password reset (forgot-password link) emails the guardian once; reusing the link sends nothing more', async () => {
      const minor = await seedUser();
      const issued = await app.get(ResetTokenStore).issue(minor.id, 60);

      const res = await http().post('/auth/reset-password').send({ token: issued.token, newPassword: NEW_PASSWORD }).expect(200);
      expect(res.body).toEqual({ message: 'Password has been reset successfully.' });
      await waitForNotices(1);
      await http().post('/auth/reset-password').send({ token: issued.token, newPassword: NEW_PASSWORD }).expect(401);
      await settle();

      expect(guardianNotices()).toHaveLength(1);
      expect(noticeArgs(guardianNotices()[0])[2]).toBe(
        'The password on Sam Minor\'s Soccernity account was reset using the "forgot password" link.',
      );
    });

    it('asking for a reset link (forgot-password) is not a change: nothing is sent to the guardian', async () => {
      const minor = await seedUser();
      await http().post('/auth/forgot-password').send({ email: minor.email }).expect(200);
      await settle();
      expect(guardianNotices()).toHaveLength(0);
    });
  });

  // ================================================================== sign-in lock

  describe('sign-in lock', () => {
    const login = (ip: string, email: string, password: string) =>
      http().post('/auth/login').set('X-Forwarded-For', ip).send({ email, password });

    it('the lock emails the guardian once; a lock from another address in the same day is throttled by a real 24-hour Redis key', async () => {
      const minor = await seedUser();

      for (let i = 0; i < 5; i++) await login('198.51.100.40', minor.email, WRONG).expect(401);
      await login('198.51.100.40', minor.email, WRONG).expect(429); // the lock itself is unchanged
      await waitForNotices(1);
      expect(guardianNotices()).toHaveLength(1);
      expect(noticeArgs(guardianNotices()[0])[2]).toBe(
        "Sign-in to Sam Minor's Soccernity account was temporarily locked after several incorrect password attempts.",
      );

      const key = `guardian-security-notice:login_locked:${minor.id}`;
      expect(await redis.exists(key)).toBe(1);
      const ttl = await redis.ttl(key);
      expect(ttl).toBeGreaterThan(86_400 - 60);
      expect(ttl).toBeLessThanOrEqual(86_400);

      // A second lock (a different address spends its own budget): the account's own notice is not repeated either,
      // and the guardian is NOT emailed again today.
      for (let i = 0; i < 5; i++) await login('198.51.100.41', minor.email, WRONG).expect(401);
      await settle();
      expect(guardianNotices()).toHaveLength(1);
    });

    it('an adult\'s lock sends no guardian notice (the account\'s own notice is unaffected)', async () => {
      const adult = await seedUser({ isMinor: false });
      for (let i = 0; i < 5; i++) await login('198.51.100.42', adult.email, WRONG).expect(401);
      await settle();
      expect(guardianNotices()).toHaveLength(0);
      expect(sent.filter((c) => c.method === 'sendLoginLockoutNoticeEmail')).toHaveLength(1);
      expect(await redis.keys('guardian-security-notice:*')).toEqual([]);
    });

    it('an address with no account sends nothing and stores no key', async () => {
      for (let i = 0; i < 5; i++) await login('198.51.100.43', `ghost-${rand()}@example.com`, WRONG).expect(401);
      await settle();
      expect(guardianNotices()).toHaveLength(0);
      expect(await redis.keys('guardian-security-notice:*')).toEqual([]);
    });
  });

  // ================================================================== who is NOT notified

  describe('who is not notified', () => {
    it.each([
      ['an adult', { isMinor: false }],
      ['a minor whose guardian consent is pending', { consent: 'pending' }],
      ['a minor whose guardian consent was declined', { consent: 'declined' }],
      // There is no 'expired' status: an expired request is a pending row whose token has passed its expiry.
      ['a minor whose consent request has expired (pending, token past expiry)', { consent: 'pending', tokenExpired: true }],
      ['a minor with no guardian record at all', { consent: null }],
    ] as Array<[string, SeedOpts]>)('%s: a password change sends no guardian notice', async (_label, opts) => {
      const user = await seedUser(opts);
      await http()
        .post('/auth/change-password')
        .set(user.auth)
        .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
        .expect(204);
      await settle();
      expect(guardianNotices()).toHaveLength(0);
    });

    it('a confirmed guardian row WITHOUT an address sends nothing', async () => {
      const user = await seedUser({ guardianEmail: '' });
      await http().post('/auth/change-password').set(user.auth).send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD }).expect(204);
      await settle();
      expect(guardianNotices()).toHaveLength(0);
    });
  });

  // ================================================================== content

  it('the email data carries only the address, subject, sentence and time: no IP address, device, location or account id', async () => {
    const minor = await seedUser();
    await http()
      .post('/auth/change-password')
      .set(minor.auth)
      .set('X-Forwarded-For', '203.0.113.77')
      .set('User-Agent', 'SecretBrowser/9.9')
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
      .expect(204);
    await waitForNotices(1);

    const call = guardianNotices()[0];
    expect(call.args).toHaveLength(4);
    const everything = JSON.stringify(call.args);
    for (const forbidden of ['203.0.113.77', 'SecretBrowser', minor.id, minor.email, 'x-forwarded']) {
      expect(everything).not.toContain(forbidden);
    }
  });
});
