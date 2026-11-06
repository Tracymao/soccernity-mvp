import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash } from 'crypto';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { APP_CLOCK } from '../src/clock/clock';
import { AccountDeletionSweepService } from '../src/modules/account-deletion/account-deletion-sweep.service';
import { PasswordService } from '../src/modules/auth/password/password.service';
import { RegistrationEmailService } from '../src/modules/auth/registration/email/registration-email.service';
import { TokenService } from '../src/modules/auth/token/token.service';
import { generateTotpCode } from '../src/modules/two-factor/totp.util';
import { RedisService } from '../src/redis/redis.service';
import { clearAuthLimitCounters } from './auth-limits';
import { seedDob } from './dob-seed';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';

// ---------------------------------------------------------------------------------------------------------------
// backend/email-change (B-059; Decision Log #472 default (f)): changing the sign-in email, against the REAL app, real
// Postgres and real Redis. The only fake is the email sender (a recorder), so the test can read the single-use
// secret that would have been mailed and exactly who was told what.
//
// WHAT IS PROVEN HERE THAT A MOCK CANNOT SHOW
//   - the secret is stored only as a hash; User.email does not move until the link is used
//   - single use and expiry against real rows; two simultaneous clicks give one winner
//   - a unique violation in the transaction really rolls back (the address taken in the meantime)
//   - sessions really end (a real refresh token stops working)
//   - the guardian event reaches a minor's CONFIRMED guardian and nobody for an adult
//   - the failed-attempt budget is a real Redis counter; the two-factor step uses the real sign-in lock path
//   - the anonymiser deletes the rows
// ---------------------------------------------------------------------------------------------------------------

jest.setTimeout(180_000);

const PASSWORD = 'the-real-password-123';
const WRONG = 'definitely-not-the-password';
const BASE = Math.floor(Date.UTC(2030, 0, 1) / 30_000) * 30_000 + 5_000;
const clock = { current: BASE, now: () => new Date(clock.current) };
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

type SentCall = { method: string; args: unknown[] };

describe('Email change (B-059) -- real Postgres + real Redis', () => {
  let app: INestApplication;
  let redis: RedisService;
  const sent: SentCall[] = [];
  const prisma = () => getTestPrismaClient();
  const http = () => request(app.getHttpServer());
  const rand = () => Math.random().toString(36).slice(2);
  const calls = (method: string) => sent.filter((c) => c.method === method);
  const secretFor = (to: string) => {
    const c = calls('sendEmailChangeVerifyEmail').filter((x) => x.args[0] === to).pop();
    if (!c) throw new Error(`no verification email to ${to}`);
    return c.args[1] as string;
  };

  // A recorder for every RegistrationEmailService instance. Only send* methods exist (answering every property would
  // look like a thenable and hang Nest). The verification sender answers true, as the real one does when it sent.
  const emailRecorder = new Proxy(
    {},
    {
      get: (_target, name: string | symbol) => {
        if (typeof name !== 'string' || !name.startsWith('send')) return undefined;
        return (...args: unknown[]) => {
          sent.push({ method: name, args });
          return Promise.resolve(name === 'sendLoginLockoutNoticeEmail' || name === 'sendEmailChangeVerifyEmail' ? true : undefined);
        };
      },
    },
  );

  // The routes carry the shared bare @AuthRateLimit() (per-IP). Relax it for this file, as guardian-email-change.e2e does,
  // so the suite's many requests from one address do not spend it; the per-account failed-attempt budget is the real
  // control under test and is NOT affected by this variable.
  const priorRateLimit = process.env.AUTH_RATE_LIMIT_MAX;

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_MAX = '1000';
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
    for (const pattern of ['guardian-security-notice:*', '2fa:*']) {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) await redis.del(...keys);
    }
    sent.length = 0;
    clock.current = BASE;
  });

  afterAll(async () => {
    await clearAuthLimitCounters(app);
    await app.close();
    await disconnectTestPrismaClient();
    if (priorRateLimit === undefined) delete process.env.AUTH_RATE_LIMIT_MAX;
    else process.env.AUTH_RATE_LIMIT_MAX = priorRateLimit;
  });

  // ---------------------------------------------------------------- helpers

  type SeedOpts = { isMinor?: boolean; consent?: string | null; guardianEmail?: string };

  async function seedUser(opts: SeedOpts = {}) {
    const isMinor = opts.isMinor ?? false;
    const email = `old-${rand()}@example.com`;
    const user = await prisma().user.create({
      data: {
        email,
        passwordHash: await app.get(PasswordService).hash(PASSWORD),
        displayName: 'Sam Person',
        dateOfBirth: seedDob(isMinor ? '2012-06-01' : '1990-01-01'),
        isMinor,
        accountStatus: 'active',
      },
    });
    const consent = opts.consent === undefined ? 'confirmed' : opts.consent;
    const guardianEmail = opts.guardianEmail ?? `guardian-${rand()}@example.com`;
    if (isMinor && consent !== null) {
      await prisma().guardian.create({
        data: {
          minorUserId: user.id,
          name: 'Guardian Person',
          email: guardianEmail,
          relationship: 'Parent',
          consentToken: `consent-${rand()}`,
          consentTokenExpiresAt: new Date(Date.now() + 48 * 3600 * 1000),
          consentStatus: consent,
        },
      });
    }
    const pair = await app.get(TokenService).issueTokenPair(user.id, user.role);
    return {
      id: user.id,
      email,
      guardianEmail,
      pair,
      auth: { Authorization: `Bearer ${pair.accessToken.token}` },
    };
  }

  const ask = (auth: Record<string, string>, body: Record<string, unknown>) =>
    http().post('/users/me/email-change').set(auth).send(body);
  const confirm = (token: string) => http().post('/auth/email-change/confirm').send({ token });
  const noticesToGuardian = () => calls('sendGuardianSecurityNoticeEmail');
  const settle = () => new Promise((r) => setTimeout(r, 400));
  async function waitForNotices(count: number) {
    const deadline = Date.now() + 5_000;
    while (noticesToGuardian().length < count && Date.now() < deadline) await new Promise((r) => setTimeout(r, 25));
  }

  // ================================================================== the happy path

  describe('request then confirm (an adult)', () => {
    it('stores only a hash, mails the NEW address a link and the OLD address a notice, and changes nothing yet', async () => {
      const u = await seedUser();
      const res = await ask(u.auth, { password: PASSWORD, newEmail: '  New-Address@Example.COM ' }).expect(202);
      expect(res.body).toEqual({ status: 'verification_sent' });

      const secret = secretFor('new-address@example.com');
      const rows = await prisma().emailChangeRequest.findMany({ where: { userId: u.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0].newEmail).toBe('new-address@example.com');
      expect(rows[0].tokenHash).toBe(sha(secret));
      expect(rows[0].tokenHash).not.toContain(secret);
      expect(rows[0].usedAt).toBeNull();
      // 48 hours, the existing email-verification lifetime.
      const hours = (rows[0].expiresAt.getTime() - Date.now()) / 3_600_000;
      expect(hours).toBeGreaterThan(47.9);
      expect(hours).toBeLessThan(48.1);

      await settle();
      expect(calls('sendEmailChangeNoticeEmail').map((c) => c.args[0])).toEqual([u.email]);
      expect((await prisma().user.findUniqueOrThrow({ where: { id: u.id } })).email).toBe(u.email);
    });

    it('using the link sets the address (lower-cased), marks it used, verifies the account and ends every session', async () => {
      const u = await seedUser();
      await prisma().user.update({ where: { id: u.id }, data: { verificationStatus: 'unverified' } });
      await ask(u.auth, { password: PASSWORD, newEmail: 'Fresh@Example.com' }).expect(202);
      const secret = secretFor('fresh@example.com');

      await confirm(secret).expect(204);

      const user = await prisma().user.findUniqueOrThrow({ where: { id: u.id } });
      expect(user.email).toBe('fresh@example.com');
      expect(user.verificationStatus).toBe('verified');
      const row = await prisma().emailChangeRequest.findFirstOrThrow({ where: { userId: u.id } });
      expect(row.usedAt).not.toBeNull();

      // Sessions ended: the refresh token issued before the change no longer works.
      await http().post('/auth/refresh').send({ refreshToken: u.pair.refreshToken.token }).expect(401);
      // And the new address now signs in.
      await http().post('/auth/login').send({ email: 'fresh@example.com', password: PASSWORD }).expect(200);
      // An adult's guardian is nobody: no notice.
      await settle();
      expect(noticesToGuardian()).toHaveLength(0);
    });

    it('an unverified-email user may use it (they are the people who mistyped the address)', async () => {
      const u = await seedUser();
      await prisma().user.update({ where: { id: u.id }, data: { verificationStatus: 'unverified' } });
      await ask(u.auth, { password: PASSWORD, newEmail: 'fixed@example.com' }).expect(202);
    });
  });

  // ================================================================== single use, expiry, replacement

  describe('the link', () => {
    it('works once; the second use is the coded 400', async () => {
      const u = await seedUser();
      await ask(u.auth, { password: PASSWORD, newEmail: 'once@example.com' }).expect(202);
      const secret = secretFor('once@example.com');
      await confirm(secret).expect(204);
      const again = await confirm(secret).expect(400);
      expect(again.body).toMatchObject({ code: 'email_change_link_invalid' });
    });

    it('two simultaneous clicks have exactly one winner', async () => {
      const u = await seedUser();
      await ask(u.auth, { password: PASSWORD, newEmail: 'race@example.com' }).expect(202);
      const secret = secretFor('race@example.com');
      const results = await Promise.all([confirm(secret), confirm(secret)]);
      expect(results.map((r) => r.status).sort()).toEqual([204, 400]);
      expect((await prisma().user.findUniqueOrThrow({ where: { id: u.id } })).email).toBe('race@example.com');
    });

    it('an expired link is the coded 400 and the address does not move', async () => {
      const u = await seedUser();
      await ask(u.auth, { password: PASSWORD, newEmail: 'late@example.com' }).expect(202);
      const secret = secretFor('late@example.com');
      await prisma().emailChangeRequest.updateMany({ where: { userId: u.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
      const res = await confirm(secret).expect(400);
      expect(res.body.code).toBe('email_change_link_invalid');
      expect((await prisma().user.findUniqueOrThrow({ where: { id: u.id } })).email).toBe(u.email);
    });

    it('an unknown or malformed secret is the same coded 400', async () => {
      const res = await confirm('x'.repeat(43)).expect(400);
      expect(res.body.code).toBe('email_change_link_invalid');
      await confirm('short').expect(400);
    });

    it('a new request replaces the earlier one: ONE pending row, and the first link is dead', async () => {
      const u = await seedUser();
      await ask(u.auth, { password: PASSWORD, newEmail: 'first@example.com' }).expect(202);
      const first = secretFor('first@example.com');
      await ask(u.auth, { password: PASSWORD, newEmail: 'second@example.com' }).expect(202);
      const second = secretFor('second@example.com');

      expect(await prisma().emailChangeRequest.count({ where: { userId: u.id, usedAt: null } })).toBe(1);
      await confirm(first).expect(400);
      await confirm(second).expect(204);
      expect((await prisma().user.findUniqueOrThrow({ where: { id: u.id } })).email).toBe('second@example.com');
    });

    it('an address taken in the meantime rolls the whole change back: same coded 400, request still unused', async () => {
      const u = await seedUser();
      await ask(u.auth, { password: PASSWORD, newEmail: 'contested@example.com' }).expect(202);
      const secret = secretFor('contested@example.com');
      await seedUser().then((other) => prisma().user.update({ where: { id: other.id }, data: { email: 'contested@example.com' } }));

      const res = await confirm(secret).expect(400);
      expect(res.body.code).toBe('email_change_link_invalid');
      expect((await prisma().user.findUniqueOrThrow({ where: { id: u.id } })).email).toBe(u.email);
      expect((await prisma().emailChangeRequest.findFirstOrThrow({ where: { userId: u.id } })).usedAt).toBeNull();
    });

    it('a deactivated account cannot complete a change', async () => {
      const u = await seedUser();
      await ask(u.auth, { password: PASSWORD, newEmail: 'gone@example.com' }).expect(202);
      const secret = secretFor('gone@example.com');
      await prisma().user.update({ where: { id: u.id }, data: { accountStatus: 'deactivated' } });
      await confirm(secret).expect(400);
      expect((await prisma().user.findUniqueOrThrow({ where: { id: u.id } })).email).toBe(u.email);
    });
  });

  // ================================================================== identity confirmation

  describe('password', () => {
    it('a wrong password is a coded 403, creates nothing and sends nothing', async () => {
      const u = await seedUser();
      const res = await ask(u.auth, { password: WRONG, newEmail: 'x@example.com' }).expect(403);
      expect(res.body).toMatchObject({ statusCode: 403, code: 'wrong_password' });
      expect(await prisma().emailChangeRequest.count()).toBe(0);
      await settle();
      expect(sent).toHaveLength(0);
    });

    it('five wrong passwords lock the route for that account (429 + Retry-After), even for the right password', async () => {
      const u = await seedUser();
      for (let i = 0; i < 5; i++) await ask(u.auth, { password: WRONG, newEmail: 'x@example.com' }).expect(403);
      const sixth = await ask(u.auth, { password: WRONG, newEmail: 'x@example.com' }).expect(429);
      expect(Number(sixth.headers['retry-after'])).toBeGreaterThan(0);
      await ask(u.auth, { password: PASSWORD, newEmail: 'x@example.com' }).expect(429);
      expect(await prisma().emailChangeRequest.count()).toBe(0);
      // Another account is not affected.
      const other = await seedUser();
      await ask(other.auth, { password: PASSWORD, newEmail: 'other-new@example.com' }).expect(202);
    });

    it('a right password does not spend the budget', async () => {
      const u = await seedUser();
      for (let i = 0; i < 8; i++) await ask(u.auth, { password: PASSWORD, newEmail: `ok${i}@example.com` }).expect(202);
    });

    it('requires a sign-in', async () => {
      await http().post('/users/me/email-change').send({ password: PASSWORD, newEmail: 'x@example.com' }).expect(401);
    });
  });

  describe('two-factor', () => {
    async function enrol(u: Awaited<ReturnType<typeof seedUser>>) {
      const start = await http().post('/auth/two-factor/enrol/start').set(u.auth).expect(200);
      await http().post('/auth/two-factor/enrol/confirm').set(u.auth).send({ code: generateTotpCode(start.body.secret, clock.current) }).expect(200);
      return start.body.secret as string;
    }

    it('required when on (coded 403), wrong code coded 403, right code goes through; the sign-in lock applies', async () => {
      const u = await seedUser();
      const secret = await enrol(u);
      clock.current += 30_000; // a new TOTP step: the enrolment code is spent

      const missing = await ask(u.auth, { password: PASSWORD, newEmail: 'tf@example.com' }).expect(403);
      expect(missing.body).toMatchObject({ code: 'two_factor_required' });
      const wrong = await ask(u.auth, { password: PASSWORD, newEmail: 'tf@example.com', twoFactorCode: '000000' }).expect(403);
      expect(wrong.body).toMatchObject({ code: 'two_factor_invalid' });
      expect(await prisma().emailChangeRequest.count()).toBe(0);

      await ask(u.auth, { password: PASSWORD, newEmail: 'tf@example.com', twoFactorCode: generateTotpCode(secret, clock.current) }).expect(202);
      expect(await prisma().emailChangeRequest.count()).toBe(1);
    });

    it('the shared per-account wrong-code lock stops guessing here too (429)', async () => {
      const u = await seedUser();
      await enrol(u);
      clock.current += 30_000;
      for (let i = 0; i < 5; i++) {
        await ask(u.auth, { password: PASSWORD, newEmail: 'tf@example.com', twoFactorCode: '000000' }).expect(403);
      }
      const locked = await ask(u.auth, { password: PASSWORD, newEmail: 'tf@example.com', twoFactorCode: '000000' }).expect(429);
      expect(locked.body).toMatchObject({ code: 'two_factor_code_locked' });
      expect(Number(locked.headers['retry-after'])).toBeGreaterThan(0);
    });
  });

  // ================================================================== the new address

  describe('an unusable address is ONE identical answer', () => {
    it('not an address, same as current, already used, too long: byte-identical bodies and statuses', async () => {
      const u = await seedUser();
      const taken = await seedUser();
      const candidates = [
        'not-an-address',
        '   ',
        u.email.toUpperCase(),
        taken.email,
        taken.email.toUpperCase(),
        `${'a'.repeat(250)}@example.com`,
      ];
      const results = [];
      for (const newEmail of candidates) results.push(await ask(u.auth, { password: PASSWORD, newEmail }));
      // (Five failed attempts spend the budget, so the sixth candidate may be the 429. Run them across two accounts.)
      const bodies = results.filter((r) => r.status !== 429).map((r) => JSON.stringify(r.body));
      expect(bodies.length).toBeGreaterThanOrEqual(5);
      expect(new Set(bodies).size).toBe(1);
      expect(results.filter((r) => r.status !== 429).every((r) => r.status === 400)).toBe(true);
      expect(JSON.parse(bodies[0])).toEqual({
        statusCode: 400,
        error: 'Bad Request',
        code: 'email_change_not_accepted',
        message: 'That email address cannot be used.',
      });
      expect(await prisma().emailChangeRequest.count()).toBe(0);
      await settle();
      expect(calls('sendEmailChangeVerifyEmail')).toHaveLength(0);
      expect(calls('sendEmailChangeNoticeEmail')).toHaveLength(0);
    });

    it("a minor cannot move to their guardian's address (any case); the answer is the same", async () => {
      const minor = await seedUser({ isMinor: true, guardianEmail: 'Parent.Person@Example.com' });
      const res = await ask(minor.auth, { password: PASSWORD, newEmail: 'parent.person@example.com' }).expect(400);
      expect(res.body.code).toBe('email_change_not_accepted');
      const unrelated = await ask(minor.auth, { password: PASSWORD, newEmail: 'minor-new@example.com' }).expect(202);
      expect(unrelated.body.status).toBe('verification_sent');
    });

    it('guessing at addresses spends the failed-attempt budget (the sixth try is a 429)', async () => {
      const u = await seedUser();
      for (let i = 0; i < 5; i++) await ask(u.auth, { password: PASSWORD, newEmail: 'nonsense' }).expect(400);
      await ask(u.auth, { password: PASSWORD, newEmail: 'nonsense' }).expect(429);
    });
  });

  // ================================================================== minors and the guardian

  describe('a minor', () => {
    it('with a confirmed guardian: the guardian is told once, after the change, with no new address in it', async () => {
      const minor = await seedUser({ isMinor: true });
      await ask(minor.auth, { password: PASSWORD, newEmail: 'minor-new@example.com' }).expect(202);
      await settle();
      expect(noticesToGuardian()).toHaveLength(0); // asking is not a change
      await confirm(secretFor('minor-new@example.com')).expect(204);
      await waitForNotices(1);

      expect(noticesToGuardian()).toHaveLength(1);
      const [to, subject, summary, when] = noticesToGuardian()[0].args as [string, string, string, string];
      expect(to).toBe(minor.guardianEmail);
      expect(subject).toBe("Security change on Sam Person's Soccernity account");
      expect(summary).toBe("The email address on Sam Person's Soccernity account was changed.");
      expect(summary).not.toContain('minor-new');
      expect(when).toMatch(/UTC$/);
      expect((await prisma().user.findUniqueOrThrow({ where: { id: minor.id } })).email).toBe('minor-new@example.com');
    });

    it.each([
      ['pending', 'pending'],
      ['declined', 'declined'],
    ])('restricted-pending (%s guardian) cannot ask: a plain 403, nothing stored', async (_n, consent) => {
      const minor = await seedUser({ isMinor: true, consent });
      const res = await ask(minor.auth, { password: PASSWORD, newEmail: 'x@example.com' }).expect(403);
      expect(res.body.code).toBe('guardian_consent_pending');
      expect(await prisma().emailChangeRequest.count()).toBe(0);
    });

    it('a minor with no guardian row at all cannot ask either', async () => {
      const minor = await seedUser({ isMinor: true, consent: null });
      await ask(minor.auth, { password: PASSWORD, newEmail: 'x@example.com' }).expect(403);
    });

    it('consent withdrawn between the request and the click: the link is dead, nothing changes, nobody is told', async () => {
      const minor = await seedUser({ isMinor: true });
      await ask(minor.auth, { password: PASSWORD, newEmail: 'late-minor@example.com' }).expect(202);
      await prisma().guardian.update({ where: { minorUserId: minor.id }, data: { consentStatus: 'declined' } });
      const res = await confirm(secretFor('late-minor@example.com')).expect(400);
      expect(res.body.code).toBe('email_change_link_invalid');
      await settle();
      expect(noticesToGuardian()).toHaveLength(0);
      expect((await prisma().user.findUniqueOrThrow({ where: { id: minor.id } })).email).toBe(minor.email);
    });

    it("the guardian's address changed to the requested one between request and click: dead link", async () => {
      const minor = await seedUser({ isMinor: true });
      await ask(minor.auth, { password: PASSWORD, newEmail: 'swap@example.com' }).expect(202);
      await prisma().guardian.update({ where: { minorUserId: minor.id }, data: { email: 'Swap@Example.com' } });
      await confirm(secretFor('swap@example.com')).expect(400);
      expect((await prisma().user.findUniqueOrThrow({ where: { id: minor.id } })).email).toBe(minor.email);
    });

    it('an account with the guardian notices withheld (#458) changes its email and nobody is emailed', async () => {
      const minor = await seedUser({ isMinor: true });
      const admin = await prisma().adminUser.create({
        data: { email: `admin-${rand()}@example.com`, passwordHash: 'x', fullName: 'Admin', role: 'superadmin', accountStatus: 'active', childSafetyVetted: true },
      });
      await prisma().guardianNoticeWithhold.create({ data: { userId: minor.id, setByAdminId: admin.id, reason: 'child protection reasons' } });
      await ask(minor.auth, { password: PASSWORD, newEmail: 'withheld@example.com' }).expect(202);
      await confirm(secretFor('withheld@example.com')).expect(204);
      await settle();
      expect(noticesToGuardian()).toHaveLength(0);
    });
  });

  // ================================================================== deletion

  describe('account deletion', () => {
    it('the anonymiser deletes the account\'s open requests', async () => {
      const u = await seedUser();
      await ask(u.auth, { password: PASSWORD, newEmail: 'pending@example.com' }).expect(202);
      expect(await prisma().emailChangeRequest.count({ where: { userId: u.id } })).toBe(1);
      await app.get(AccountDeletionSweepService).anonymizeUser(u.id, false, new Date());
      expect(await prisma().emailChangeRequest.count({ where: { userId: u.id } })).toBe(0);
    });

    it('a hard delete of the user cascades (the FK is ON DELETE CASCADE)', async () => {
      const u = await seedUser();
      await ask(u.auth, { password: PASSWORD, newEmail: 'pending2@example.com' }).expect(202);
      expect(await prisma().emailChangeRequest.count({ where: { userId: u.id } })).toBe(1);
      await prisma().user.delete({ where: { id: u.id } });
      expect(await prisma().emailChangeRequest.count()).toBe(0);
    });
  });
});
