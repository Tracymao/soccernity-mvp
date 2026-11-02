import { INestApplication, ValidationPipe } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { APP_CLOCK } from '../src/clock/clock';
import { AccountDeletionSweepService } from '../src/modules/account-deletion/account-deletion-sweep.service';
import { AdminTokenService } from '../src/modules/admin/token/admin-token.service';
import { PasswordService } from '../src/modules/auth/password/password.service';
import { RegistrationEmailService } from '../src/modules/auth/registration/email/registration-email.service';
import { TokenService } from '../src/modules/auth/token/token.service';
import { generateTotpCode } from '../src/modules/two-factor/totp.util';
import { RedisService } from '../src/redis/redis.service';
import { seedDob } from './dob-seed';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';

// ---------------------------------------------------------------------------------------------------------------
// B-280 (Decision Log #458): the "withhold guardian notices" flag, against the REAL app, real Postgres and real Redis.
// The only fakes are the email sender (a recorder) and the app clock (TOTP and the 30-day review marker).
//
// WHAT IS PROVEN HERE THAT A MOCK CANNOT SHOW
//   - the unvetted-admin answer is byte-identical for every account, including one that does not exist
//   - the row, its audit entries and the recovery cancellation really are one unit in Postgres
//   - while the flag is on the REAL routes that would email a guardian (a password change, an admin suspension) send
//     nothing and take no throttle slot, and after a clear they send again (skipped notices are not replayed)
//   - guardian-assisted two-factor recovery really is off, and an old guardian link stays dead after a clear
//   - nothing a minor, a guardian or an unvetted admin can call carries the flag or its reason
//   - the anonymiser (and the admin immediate delete, which uses it) deletes the row
// ---------------------------------------------------------------------------------------------------------------

jest.setTimeout(240_000);

const PASSWORD = 'the-real-password-123';
const REASON = 'Safeguarding concern about the home. Staff are supporting the child directly.';
const BASE = Math.floor(Date.UTC(2030, 0, 1) / 30_000) * 30_000 + 5_000;
const DAY = 24 * 60 * 60 * 1000;
const clock = { current: BASE, now: () => new Date(clock.current) };

type SentCall = { method: string; args: unknown[] };

describe('Withhold guardian notices (B-280) -- real Postgres + real Redis', () => {
  let app: INestApplication;
  let redis: RedisService;
  const sent: SentCall[] = [];
  const prisma = () => getTestPrismaClient();
  let ipCounter = 0;
  let ip = '198.51.100.1';
  const http = () => request.agent(app.getHttpServer()).set('X-Forwarded-For', ip);
  const rand = () => Math.random().toString(36).slice(2, 10);
  const calls = (method: string) => sent.filter((c) => c.method === method);
  const lastArgs = (method: string) => calls(method)[calls(method).length - 1].args as string[];
  const settle = () => new Promise((r) => setTimeout(r, 400));
  const flagUrl = (userId: string, suffix = '') => `/admin/users/${userId}/guardian-notices${suffix}`;

  const emailRecorder = new Proxy(
    {},
    {
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
    for (const job of app.get(SchedulerRegistry).getCronJobs().values()) job.stop();
    redis = app.get(RedisService);
  });

  beforeEach(async () => {
    await resetDatabase();
    for (const pattern of ['2fa:*', 'guardian-security-notice:*', 'auth-limit:*']) {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) await redis.del(...keys);
    }
    sent.length = 0;
    clock.current = BASE;
    ipCounter += 1;
    ip = `198.51.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`;
  });

  afterAll(async () => {
    await app.close();
    await disconnectTestPrismaClient();
  });

  // ---------------------------------------------------------------- helpers

  async function seedUser(opts: { isMinor?: boolean; consent?: string | null; username?: string | null } = {}) {
    const isMinor = opts.isMinor ?? true;
    const email = `wh-${rand()}@example.com`;
    const user = await prisma().user.create({
      data: {
        email,
        passwordHash: await app.get(PasswordService).hash(PASSWORD),
        displayName: 'Real Person',
        username: opts.username === undefined ? `u_${rand()}` : opts.username,
        dateOfBirth: seedDob(isMinor ? '2012-06-01' : '1990-01-01'),
        isMinor,
        verificationStatus: 'verified',
        accountStatus: 'active',
      },
    });
    const consent = opts.consent === undefined ? 'confirmed' : opts.consent;
    const guardianEmail = `guardian-${rand()}@example.com`;
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
      guardianEmail: isMinor && consent !== null ? guardianEmail : null,
      auth: { Authorization: `Bearer ${pair.accessToken.token}` },
    };
  }

  async function seedAdmin(role: string, vetted: boolean) {
    const admin = await prisma().adminUser.create({
      data: { email: `wh-admin-${rand()}@example.com`, passwordHash: 'unused', fullName: `Admin ${rand()}`, role, childSafetyVetted: vetted },
    });
    const pair = await app.get(AdminTokenService).issueTokenPair(admin.id, admin.role);
    return { id: admin.id, fullName: admin.fullName, auth: { Authorization: `Bearer ${pair.accessToken.token}` } };
  }

  const totp = (secret: string) => generateTotpCode(secret, clock.current);

  // A minor/adult with two-factor on, enrolled over HTTP.
  async function enrolled(opts: Parameters<typeof seedUser>[0] = {}) {
    const user = await seedUser(opts);
    const start = await http().post('/auth/two-factor/enrol/start').set(user.auth).expect(200);
    await http().post('/auth/two-factor/enrol/confirm').set(user.auth).send({ code: totp(start.body.secret) }).expect(200);
    await settle();
    sent.length = 0; // the B-275 "two-factor turned on" notice is not part of this test
    return user;
  }

  const rowCount = async (userId: string) => prisma().guardianNoticeWithhold.count({ where: { userId } });
  const logsFor = async (userId: string) =>
    prisma().adminActionLog.findMany({ where: { targetType: 'user', targetId: userId, action: { startsWith: 'user.guardian_notices_' } }, orderBy: { createdAt: 'asc' } });
  async function withhold(userId: string, admin: { auth: { Authorization: string } }, reason = REASON) {
    return http().post(flagUrl(userId, '/withhold')).set(admin.auth).send({ reason }).expect(200);
  }

  // ================================================================== access

  describe('who may use it', () => {
    it.each([
      ['an unvetted moderator', 'moderator'],
      ['an unvetted SUPERADMIN', 'superadmin'],
    ])('%s gets the same coded 403 for a real minor, an adult and an id that does not exist', async (_n, role) => {
      const minor = await seedUser();
      const adult = await seedUser({ isMinor: false });
      const admin = await seedAdmin(role, false);

      const bodies: unknown[] = [];
      for (const id of [minor.id, adult.id, 'no-such-user']) {
        const res = await http().get(flagUrl(id)).set(admin.auth).expect(403);
        bodies.push(res.body);
        for (const suffix of ['/withhold', '/clear', '/review']) {
          const post = await http().post(flagUrl(id, suffix)).set(admin.auth).send({}).expect(403);
          bodies.push(post.body);
        }
      }
      expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1);
      expect(bodies[0]).toMatchObject({ code: 'child_safety_vetting_required' });
      expect(await rowCount(minor.id)).toBe(0);
    });

    it('an editor is refused even when vetted; a user token and no token are 401', async () => {
      const minor = await seedUser();
      const editor = await seedAdmin('editor', true);
      await http().get(flagUrl(minor.id)).set(editor.auth).expect(403);
      await http().get(flagUrl(minor.id)).set(minor.auth).expect(401);
      await http().post(flagUrl(minor.id, '/withhold')).set(minor.auth).send({ reason: REASON }).expect(401);
      await http().get(flagUrl(minor.id)).expect(401);
    });

    it('vetting is read fresh: an admin who loses it is refused on the very next request with the same token', async () => {
      const minor = await seedUser();
      const admin = await seedAdmin('moderator', true);
      await http().get(flagUrl(minor.id)).set(admin.auth).expect(200);
      await prisma().adminUser.update({ where: { id: admin.id }, data: { childSafetyVetted: false } });
      await http().get(flagUrl(minor.id)).set(admin.auth).expect(403);
    });

    it('the admin sees their OWN vetting state on GET /admin/profile (and login), so the console knows whether to show the section', async () => {
      const vetted = await seedAdmin('moderator', true);
      const unvetted = await seedAdmin('moderator', false);
      expect((await http().get('/admin/profile').set(vetted.auth).expect(200)).body.childSafetyVetted).toBe(true);
      expect((await http().get('/admin/profile').set(unvetted.auth).expect(200)).body.childSafetyVetted).toBe(false);
    });
  });

  // ================================================================== the routes

  describe('withhold, state, review, clear', () => {
    it('the full cycle with exact responses, one audit row per change, and the row deleted on clear', async () => {
      const minor = await seedUser();
      const admin = await seedAdmin('moderator', true);

      expect((await http().get(flagUrl(minor.id)).set(admin.auth).expect(200)).body).toEqual({ withheld: false });

      const set = await withhold(minor.id, admin, `  ${REASON}  `);
      expect(set.body).toEqual({
        withheld: true,
        setAt: new Date(BASE).toISOString(),
        setBy: { id: admin.id, displayName: admin.fullName },
        reason: REASON,
        lastReviewedAt: null,
        lastReviewNote: null,
        reviewDueAt: new Date(BASE + 30 * DAY).toISOString(),
        reviewDue: false,
      });
      expect(await rowCount(minor.id)).toBe(1);
      expect((await http().get(flagUrl(minor.id)).set(admin.auth).expect(200)).body).toEqual(set.body);

      // 31 days on: review is due, nothing has happened by itself.
      clock.current = BASE + 31 * DAY;
      expect((await http().get(flagUrl(minor.id)).set(admin.auth).expect(200)).body).toMatchObject({ withheld: true, reviewDue: true });

      const other = await seedAdmin('superadmin', true);
      const reviewed = await http().post(flagUrl(minor.id, '/review')).set(other.auth).send({ note: 'Still needed after review.' }).expect(200);
      expect(reviewed.body).toMatchObject({
        withheld: true,
        lastReviewedAt: new Date(clock.current).toISOString(),
        lastReviewNote: 'Still needed after review.',
        reviewDueAt: new Date(clock.current + 30 * DAY).toISOString(),
        reviewDue: false,
        // who SET it does not change when someone else reviews
        setBy: { id: admin.id, displayName: admin.fullName },
      });

      const cleared = await http().post(flagUrl(minor.id, '/clear')).set(other.auth).send({ reason: 'The plan has ended.' }).expect(200);
      expect(cleared.body).toEqual({ withheld: false });
      expect(await rowCount(minor.id)).toBe(0);
      expect((await http().get(flagUrl(minor.id)).set(admin.auth).expect(200)).body).toEqual({ withheld: false });

      const logs = await logsFor(minor.id);
      expect(logs.map((l) => [l.action, l.adminId])).toEqual([
        ['user.guardian_notices_withheld', admin.id],
        ['user.guardian_notices_reviewed', other.id],
        ['user.guardian_notices_cleared', other.id],
      ]);
      expect(logs[0].notes).toContain(REASON);
      expect(logs[1].notes).toContain('Still needed after review.');
      expect(logs[2].notes).toContain('The plan has ended.');
    });

    it('the errors: 404, 409 not applicable / already / not withheld, and 400 for a bad reason or note', async () => {
      const minor = await seedUser();
      const adult = await seedUser({ isMinor: false });
      const admin = await seedAdmin('moderator', true);

      await http().get(flagUrl('no-such-user')).set(admin.auth).expect(404);
      await http().post(flagUrl('no-such-user', '/withhold')).set(admin.auth).send({ reason: REASON }).expect(404);

      const notApplicable = await http().post(flagUrl(adult.id, '/withhold')).set(admin.auth).send({ reason: REASON }).expect(409);
      expect(notApplicable.body.code).toBe('guardian_notices_not_applicable');
      expect(await rowCount(adult.id)).toBe(0);

      for (const [suffix, body] of [['/clear', { reason: REASON }], ['/review', { note: REASON }]] as const) {
        const res = await http().post(flagUrl(minor.id, suffix)).set(admin.auth).send(body).expect(409);
        expect(res.body.code).toBe('guardian_notices_not_withheld');
      }

      await http().post(flagUrl(minor.id, '/withhold')).set(admin.auth).send({ reason: 'too short' }).expect(400);
      await http().post(flagUrl(minor.id, '/withhold')).set(admin.auth).send({ reason: ' '.repeat(30) }).expect(400);
      await http().post(flagUrl(minor.id, '/withhold')).set(admin.auth).send({ reason: 'x'.repeat(1001) }).expect(400);
      await http().post(flagUrl(minor.id, '/withhold')).set(admin.auth).send({}).expect(400);
      expect(await rowCount(minor.id)).toBe(0);
      expect(await logsFor(minor.id)).toHaveLength(0);

      await withhold(minor.id, admin);
      const again = await http().post(flagUrl(minor.id, '/withhold')).set(admin.auth).send({ reason: REASON }).expect(409);
      expect(again.body.code).toBe('guardian_notices_already_withheld');
      await http().post(flagUrl(minor.id, '/review')).set(admin.auth).send({ note: 'short' }).expect(400);
      await http().post(flagUrl(minor.id, '/clear')).set(admin.auth).send({ reason: 'short' }).expect(400);
      expect(await rowCount(minor.id)).toBe(1);
      expect(await logsFor(minor.id)).toHaveLength(1);
    });

    it('two admins withholding at once: exactly one wins, one row, one audit entry', async () => {
      const minor = await seedUser();
      const a = await seedAdmin('moderator', true);
      const b = await seedAdmin('superadmin', true);

      const results = await Promise.all([
        http().post(flagUrl(minor.id, '/withhold')).set(a.auth).send({ reason: REASON }),
        http().post(flagUrl(minor.id, '/withhold')).set(b.auth).send({ reason: REASON }),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(await rowCount(minor.id)).toBe(1);
      expect(await logsFor(minor.id)).toHaveLength(1);
    });

    it('can be set on a minor with no confirmed guardian, and cleared after the account is no longer a minor', async () => {
      const noGuardian = await seedUser({ consent: null });
      const pending = await seedUser({ consent: 'pending' });
      const admin = await seedAdmin('moderator', true);
      await withhold(noGuardian.id, admin);
      await withhold(pending.id, admin);

      // The account turns 18 (the age sweep flips isMinor): the flag is inert but still clearable.
      await prisma().user.update({ where: { id: pending.id }, data: { isMinor: false } });
      expect((await http().get(flagUrl(pending.id)).set(admin.auth).expect(200)).body).toMatchObject({ withheld: true });
      await http().post(flagUrl(pending.id, '/clear')).set(admin.auth).send({ reason: 'Account is now an adult.' }).expect(200);
      expect(await rowCount(pending.id)).toBe(0);
    });
  });

  // ================================================================== the gate

  describe('while it is on, guardian notices are skipped silently', () => {
    it('a password change sends the guardian nothing, takes no throttle slot, and sends again after a clear (skipped ones are not replayed)', async () => {
      const minor = await seedUser();
      const admin = await seedAdmin('moderator', true);

      // Control: before the flag, a password change DOES notify the guardian.
      await http().post('/auth/change-password').set(minor.auth).send({ currentPassword: PASSWORD, newPassword: 'another-password-123' }).expect(204);
      await settle();
      expect(calls('sendGuardianSecurityNoticeEmail')).toHaveLength(1);
      expect(lastArgs('sendGuardianSecurityNoticeEmail')[0]).toBe(minor.guardianEmail);
      sent.length = 0;

      await withhold(minor.id, admin);
      // change-password revoked this user's other sessions; sign in again with the new password for a fresh token
      const login = await http().post('/auth/login').send({ email: minor.email, password: 'another-password-123' }).expect(200);
      const auth = { Authorization: `Bearer ${login.body.accessToken}` };
      await http().post('/auth/change-password').set(auth).send({ currentPassword: 'another-password-123', newPassword: 'third-password-12345' }).expect(204);
      await settle();

      expect(sent.filter((c) => c.method.startsWith('sendGuardian'))).toHaveLength(0);
      // No throttle claim was taken for a notice that was skipped.
      expect(await redis.keys('guardian-security-notice:*')).toEqual([]);

      await http().post(flagUrl(minor.id, '/clear')).set(admin.auth).send({ reason: 'The plan has ended.' }).expect(200);
      await settle();
      // Clearing sends nothing for what was skipped.
      expect(sent.filter((c) => c.method.startsWith('sendGuardian'))).toHaveLength(0);

      const login2 = await http().post('/auth/login').send({ email: minor.email, password: 'third-password-12345' }).expect(200);
      await http()
        .post('/auth/change-password')
        .set({ Authorization: `Bearer ${login2.body.accessToken}` })
        .send({ currentPassword: 'third-password-12345', newPassword: 'fourth-password-12345' })
        .expect(204);
      await settle();
      expect(calls('sendGuardianSecurityNoticeEmail')).toHaveLength(1);
    });

    it('a safety action (an admin suspending the account) sends the guardian nothing either; after a clear, reinstating does', async () => {
      const minor = await seedUser();
      const admin = await seedAdmin('moderator', true);
      await withhold(minor.id, admin);

      await http().patch(`/admin/users/${minor.id}`).set(admin.auth).send({ status: 'suspended' }).expect(200);
      await settle();
      expect(calls('sendGuardianSafetyNoticeEmail')).toHaveLength(0);

      await http().post(flagUrl(minor.id, '/clear')).set(admin.auth).send({ reason: 'The plan has ended.' }).expect(200);
      await http().patch(`/admin/users/${minor.id}`).set(admin.auth).send({ status: 'active' }).expect(200);
      await settle();
      expect(calls('sendGuardianSafetyNoticeEmail')).toHaveLength(1);
      expect(lastArgs('sendGuardianSafetyNoticeEmail')[0]).toBe(minor.guardianEmail);
    });

    it('the consent mechanics are NOT gated: a withheld minor with a pending request still gets the guardian consent email re-sent', async () => {
      const minor = await seedUser({ consent: 'pending' });
      const admin = await seedAdmin('moderator', true);
      await withhold(minor.id, admin);

      await http().post('/auth/guardian-consent/resend').send({ email: minor.email }).expect(200);

      expect(calls('sendGuardianConsentEmail')).toHaveLength(1);
      expect(lastArgs('sendGuardianConsentEmail')[0]).toBe(minor.guardianEmail);
      expect(await rowCount(minor.id)).toBe(1);
    });
  });

  // ================================================================== recovery

  describe('guardian-assisted two-factor recovery', () => {
    it('a withheld minor gets the same answer as a minor with no confirmed guardian: nothing created, nothing sent', async () => {
      const withheld = await enrolled();
      const noGuardian = await enrolled({ consent: null });
      const admin = await seedAdmin('moderator', true);
      await withhold(withheld.id, admin);

      const a = await http().post('/auth/two-factor/recovery/request').send({ email: withheld.email, password: PASSWORD }).expect(202);
      const b = await http().post('/auth/two-factor/recovery/request').send({ email: noGuardian.email, password: PASSWORD }).expect(202);

      expect(a.body).toEqual({ audience: 'no_guardian' });
      expect(a.body).toEqual(b.body);
      expect(await prisma().twoFactorRecoveryRequest.count({ where: { userId: withheld.id } })).toBe(0);
      expect(sent.filter((c) => c.method.startsWith('sendTwoFactorRecovery'))).toHaveLength(0);
    });

    it('a WRONG password on a withheld minor is still the generic answer (the audience is shown only after a correct password)', async () => {
      const withheld = await enrolled();
      const admin = await seedAdmin('moderator', true);
      await withhold(withheld.id, admin);
      const res = await http().post('/auth/two-factor/recovery/request').send({ email: withheld.email, password: 'wrong-password-123' }).expect(202);
      expect(res.body).toEqual({ audience: 'account' });
    });

    it('setting the flag cancels an active guardian request in the same step; the old link stays dead after a clear', async () => {
      const minor = await enrolled();
      const admin = await seedAdmin('moderator', true);
      await http().post('/auth/two-factor/recovery/request').send({ email: minor.email, password: PASSWORD }).expect(202);
      const [, token] = lastArgs('sendTwoFactorRecoveryGuardianLinkEmail');
      expect((await http().get(`/auth/two-factor/recovery/link/${token}`).expect(200)).body.state).toBe('valid');

      await withhold(minor.id, admin);

      const [row] = await prisma().twoFactorRecoveryRequest.findMany({ where: { userId: minor.id } });
      expect(row).toMatchObject({ kind: 'guardian', state: 'cancelled' });
      expect(row.doneAt).not.toBeNull();
      expect((await logsFor(minor.id))[0].notes).toContain('cancelled_guardian_recovery_requests=1');
      // the link is dead, and approving it removes nothing
      expect((await http().get(`/auth/two-factor/recovery/link/${token}`).expect(200)).body.state).not.toBe('valid');
      await http().post('/auth/two-factor/recovery/guardian/approve').send({ token }).expect(400);
      expect((await prisma().user.findUniqueOrThrow({ where: { id: minor.id } })).totpEnabledAt).not.toBeNull();

      await http().post(flagUrl(minor.id, '/clear')).set(admin.auth).send({ reason: 'The plan has ended.' }).expect(200);
      // still dead after the clear
      expect((await http().get(`/auth/two-factor/recovery/link/${token}`).expect(200)).body.state).not.toBe('valid');
      await http().post('/auth/two-factor/recovery/guardian/approve').send({ token }).expect(400);
      await http().post('/auth/two-factor/recovery/guardian/decline').send({ token }).expect(400);
      expect((await prisma().user.findUniqueOrThrow({ where: { id: minor.id } })).totpEnabledAt).not.toBeNull();
    });

    it('after a clear, a NEW guardian-assisted request works again', async () => {
      const minor = await enrolled();
      const admin = await seedAdmin('moderator', true);
      await withhold(minor.id, admin);
      await http().post(flagUrl(minor.id, '/clear')).set(admin.auth).send({ reason: 'The plan has ended.' }).expect(200);

      const res = await http().post('/auth/two-factor/recovery/request').send({ email: minor.email, password: PASSWORD }).expect(202);
      expect(res.body).toEqual({ audience: 'guardian' });
      expect(calls('sendTwoFactorRecoveryGuardianLinkEmail')).toHaveLength(1);
    });

    it('an ADULT\'s recovery is untouched by the flag', async () => {
      const adult = await enrolled({ isMinor: false });
      // The flag cannot be set on an adult through the API; seed the row directly to prove the adult flow ignores it.
      const admin = await seedAdmin('moderator', true);
      await prisma().guardianNoticeWithhold.create({ data: { userId: adult.id, setByAdminId: admin.id, reason: REASON } });
      const res = await http().post('/auth/two-factor/recovery/request').send({ email: adult.email, password: PASSWORD }).expect(202);
      expect(res.body).toEqual({ audience: 'account' });
      expect(calls('sendTwoFactorRecoveryLinkEmail')).toHaveLength(1);
    });
  });

  // ================================================================== visibility

  describe('nothing the minor, the guardian or an unvetted admin can call carries the flag or its reason', () => {
    it('user routes, the admin user list / detail / summary, the admin login payload: no reason, no key, no mention', async () => {
      const minor = await seedUser();
      const other = await seedUser({ isMinor: false });
      const vetted = await seedAdmin('moderator', true);
      const unvetted = await seedAdmin('superadmin', false);
      await withhold(minor.id, vetted);

      const bodies: Array<[string, unknown]> = [
        ['GET /users/:id (the minor)', (await http().get(`/users/${minor.id}`).set(minor.auth).expect(200)).body],
        ['GET /users/:id/public-profile (another user)', (await http().get(`/users/${minor.id}/public-profile`).set(other.auth)).body],
        ['GET /admin/users (unvetted)', (await http().get('/admin/users').set(unvetted.auth).expect(200)).body],
        ['GET /admin/users/:id (unvetted)', (await http().get(`/admin/users/${minor.id}`).set(unvetted.auth).expect(200)).body],
        ['GET /admin/users/:id/summary (unvetted)', (await http().get(`/admin/users/${minor.id}/summary`).set(unvetted.auth).expect(200)).body],
        ['GET /admin/users/:id/summary (vetted)', (await http().get(`/admin/users/${minor.id}/summary`).set(vetted.auth).expect(200)).body],
        ['GET /admin/profile', (await http().get('/admin/profile').set(unvetted.auth).expect(200)).body],
      ];
      const login = await http().post('/auth/login').send({ email: minor.email, password: PASSWORD });
      bodies.push(['POST /auth/login (the minor)', login.body]);

      for (const [name, body] of bodies) {
        const text = JSON.stringify(body).toLowerCase();
        for (const forbidden of [REASON.toLowerCase(), 'guardiannoticewithhold', 'withhold', 'guardian notices']) {
          expect([name, text.includes(forbidden)]).toEqual([name, false]);
        }
      }
    });

    it('the flag is not in any email that goes to a user or a guardian (the recorder saw none for the set itself)', async () => {
      const minor = await seedUser();
      const admin = await seedAdmin('moderator', true);
      await withhold(minor.id, admin);
      await http().post(flagUrl(minor.id, '/review')).set(admin.auth).send({ note: 'Reviewed, still needed.' }).expect(200);
      await http().post(flagUrl(minor.id, '/clear')).set(admin.auth).send({ reason: 'The plan has ended.' }).expect(200);
      await settle();
      expect(sent).toHaveLength(0);
    });
  });

  // ================================================================== lifecycle

  describe('lifecycle', () => {
    it('the anonymiser deletes the row in the same transaction; the audit history survives in the log', async () => {
      const minor = await seedUser();
      const admin = await seedAdmin('moderator', true);
      await withhold(minor.id, admin);
      await prisma().user.update({ where: { id: minor.id }, data: { accountStatus: 'pending_deletion', pendingDeletionAt: new Date(Date.now() - 40 * DAY) } });

      await app.get(AccountDeletionSweepService).anonymizeUser(minor.id, true);

      expect(await rowCount(minor.id)).toBe(0);
      expect(await logsFor(minor.id)).toHaveLength(1);
    });

    it('the admin immediate delete (it uses the same anonymiser) deletes the row too', async () => {
      const minor = await seedUser();
      const admin = await seedAdmin('moderator', true);
      await withhold(minor.id, admin);

      await http().patch(`/admin/users/${minor.id}`).set(admin.auth).send({ status: 'deleted' }).expect(200);

      expect(await rowCount(minor.id)).toBe(0);
    });

    it('a held-only-by-report account is minimised, not anonymised, and KEEPS its flag', async () => {
      const minor = await seedUser();
      const admin = await seedAdmin('moderator', true);
      await withhold(minor.id, admin);
      await app.get(AccountDeletionSweepService).minimiseHeldUser(minor.id);
      expect(await rowCount(minor.id)).toBe(1);
    });

    it('the database holds the shape: one row per account, review time and note together', async () => {
      const minor = await seedUser();
      const admin = await seedAdmin('moderator', true);
      await prisma().guardianNoticeWithhold.create({ data: { userId: minor.id, setByAdminId: admin.id, reason: REASON } });
      await expect(
        prisma().guardianNoticeWithhold.create({ data: { userId: minor.id, setByAdminId: admin.id, reason: REASON } }),
      ).rejects.toMatchObject({ code: 'P2002' });
      await expect(
        prisma().$executeRaw`UPDATE "GuardianNoticeWithhold" SET "lastReviewedAt" = now() WHERE "userId" = ${minor.id}`,
      ).rejects.toBeDefined();
    });
  });
});
