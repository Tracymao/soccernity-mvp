import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AdminTokenService } from '../src/modules/admin/token/admin-token.service';
import { PasswordService } from '../src/modules/auth/password/password.service';
import { ResetTokenStore } from '../src/modules/auth/password-reset/reset-token.store';
import { EmailVerificationTokenStore } from '../src/modules/auth/registration/email-verification/email-verification-token.store';
import { RegistrationEmailService } from '../src/modules/auth/registration/email/registration-email.service';
import { TokenService } from '../src/modules/auth/token/token.service';
import { seedDob } from './dob-seed';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';

// ---------------------------------------------------------------------------------------------------------------
// B-069 (Decision Log #472, adopted default (a)): the plain account emails, against the REAL app and real Postgres.
// The only fake is the email sender: a recorder standing in for every RegistrationEmailService instance, so the
// test reads exactly what would have been sent.
//
// WHAT IS PROVEN HERE THAT A MOCK CANNOT SHOW
//   - each real route leads to ONE email, after the action, to the right address and with the person's first name
//   - the WELCOME email is sent only when the account is fully active, whichever order the two events come in
//     (a minor: email verified and guardian approved), and never twice
//   - a guardian-driven deletion sends no "you asked to delete" email; a self-service one does
//   - a failing sender never fails the request
//   - the whole module graph still boots with the new module wired into four modules
// ---------------------------------------------------------------------------------------------------------------

jest.setTimeout(180_000);

const PASSWORD = 'the-real-password-123';
const NEW_PASSWORD = 'a-brand-new-password-456';

type SentCall = { method: string; args: unknown[] };

describe('Transactional account emails (B-069) -- real Postgres', () => {
  let app: INestApplication;
  const sent: SentCall[] = [];
  let failSends = false;
  const prisma = () => getTestPrismaClient();
  const http = () => request(app.getHttpServer());
  const rand = () => Math.random().toString(36).slice(2);
  const calls = (method: string) => sent.filter((c) => c.method === method);

  const emailRecorder = new Proxy(
    {},
    {
      // Only send* methods exist (answering every property would look like a thenable to Nest).
      get: (_target, name: string | symbol) => {
        if (typeof name !== 'string' || !name.startsWith('send')) return undefined;
        return (...args: unknown[]) => {
          sent.push({ method: name, args });
          if (failSends) return Promise.reject(new Error('postmark down'));
          // The methods that return a boolean in the real service resolve true.
          return Promise.resolve(
            ['sendWelcomeEmail', 'sendPasswordResetCompletedEmail', 'sendLoginLockoutNoticeEmail'].includes(name) ? true : undefined,
          );
        };
      },
    },
  );

  // The sends are fire-and-forget, so poll briefly instead of assuming they have landed.
  async function settle(): Promise<void> {
    await new Promise((r) => setTimeout(r, 400));
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RegistrationEmailService)
      .useValue(emailRecorder)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  beforeEach(async () => {
    await resetDatabase();
    sent.length = 0;
    failSends = false;
  });

  afterAll(async () => {
    await app.close();
    await disconnectTestPrismaClient();
  });

  type SeedOpts = { isMinor?: boolean; verified?: boolean; consent?: string | null; displayName?: string };

  async function seedUser(opts: SeedOpts = {}) {
    const isMinor = opts.isMinor ?? false;
    const email = `b069-${rand()}@example.com`;
    const user = await prisma().user.create({
      data: {
        email,
        passwordHash: await app.get(PasswordService).hash(PASSWORD),
        displayName: opts.displayName ?? 'Ada Lovelace',
        dateOfBirth: seedDob(isMinor ? '2012-06-01' : '1990-01-01'),
        isMinor,
        verificationStatus: opts.verified === false ? 'unverified' : 'verified',
        accountStatus: 'active',
      },
    });
    let consentToken: string | null = null;
    if (isMinor && opts.consent !== null) {
      consentToken = `consent-${rand()}`;
      await prisma().guardian.create({
        data: {
          minorUserId: user.id,
          name: 'Guardian Person',
          email: `guardian-${rand()}@example.com`,
          relationship: 'Parent',
          consentToken,
          consentTokenExpiresAt: new Date(Date.now() + 48 * 3600 * 1000),
          consentStatus: opts.consent ?? 'pending',
        },
      });
    }
    const pair = await app.get(TokenService).issueTokenPair(user.id, user.role);
    return { id: user.id, email, consentToken, auth: { Authorization: `Bearer ${pair.accessToken.token}` } };
  }

  async function verifyEmailFor(userId: string) {
    const token = await app.get(EmailVerificationTokenStore).issue(userId);
    return http().post('/auth/verify-email').send({ token });
  }

  // ------------------------------------------------------------ password changed / reset

  it('POST /auth/change-password: ONE "password changed" email, to the account, with the first name', async () => {
    const u = await seedUser();
    await http().post('/auth/change-password').set(u.auth).send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD }).expect(204);
    await settle();
    expect(calls('sendPasswordChangedEmail')).toHaveLength(1);
    expect(calls('sendPasswordChangedEmail')[0].args).toEqual([u.email, 'Ada']);
    expect(calls('sendPasswordResetCompletedEmail')).toHaveLength(0);
  });

  it('a wrong current password sends nothing', async () => {
    const u = await seedUser();
    await http().post('/auth/change-password').set(u.auth).send({ currentPassword: 'wrong-wrong-wrong', newPassword: NEW_PASSWORD }).expect(401);
    await settle();
    expect(calls('sendPasswordChangedEmail')).toHaveLength(0);
  });

  it('POST /auth/reset-password: ONE "password reset" email and NOT the signed-in one', async () => {
    const u = await seedUser();
    const issued = await app.get(ResetTokenStore).issue(u.id, 60);
    await http().post('/auth/reset-password').send({ token: issued.token, newPassword: NEW_PASSWORD }).expect(200);
    await settle();
    expect(calls('sendPasswordResetCompletedEmail')).toHaveLength(1);
    expect(calls('sendPasswordResetCompletedEmail')[0].args).toEqual([u.email, 'Ada']);
    expect(calls('sendPasswordChangedEmail')).toHaveLength(0);
  });

  it('a used reset token sends nothing the second time', async () => {
    const u = await seedUser();
    const issued = await app.get(ResetTokenStore).issue(u.id, 60);
    await http().post('/auth/reset-password').send({ token: issued.token, newPassword: NEW_PASSWORD }).expect(200);
    await http().post('/auth/reset-password').send({ token: issued.token, newPassword: NEW_PASSWORD }).expect(401);
    await settle();
    expect(calls('sendPasswordResetCompletedEmail')).toHaveLength(1);
  });

  it('a failing sender does not fail the password change', async () => {
    failSends = true;
    const u = await seedUser();
    await http().post('/auth/change-password').set(u.auth).send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD }).expect(204);
    await settle();
    expect(calls('sendPasswordChangedEmail')).toHaveLength(1);
    const row = await prisma().user.findUnique({ where: { id: u.id }, select: { passwordHash: true } });
    expect(await app.get(PasswordService).verify(row!.passwordHash, NEW_PASSWORD)).toBe(true);
  });

  // ------------------------------------------------------------ welcome

  it('ADULT: the welcome is sent when the email is verified, once, and not before', async () => {
    const u = await seedUser({ verified: false });
    await settle();
    expect(calls('sendWelcomeEmail')).toHaveLength(0);

    await verifyEmailFor(u.id).then((r) => expect(r.status).toBe(200));
    await settle();
    expect(calls('sendWelcomeEmail')).toHaveLength(1);
    expect(calls('sendWelcomeEmail')[0].args).toEqual([u.email, 'Ada']);
  });

  it('MINOR, email first: verifying alone sends nothing; the guardian\'s approval then sends the welcome once', async () => {
    const m = await seedUser({ isMinor: true, verified: false, consent: 'pending' });
    await verifyEmailFor(m.id).then((r) => expect(r.status).toBe(200));
    await settle();
    expect(calls('sendWelcomeEmail')).toHaveLength(0);

    await http().post('/auth/guardian-consent').send({ consentToken: m.consentToken }).expect(200);
    await settle();
    expect(calls('sendWelcomeEmail')).toHaveLength(1);
    expect(calls('sendWelcomeEmail')[0].args).toEqual([m.email, 'Ada']);
    // The existing "your guardian approved" email is separate and still sent.
    expect(calls('sendGuardianApprovedMinorEmail')).toHaveLength(1);

    // A guardian re-clicking the link changes nothing.
    await http().post('/auth/guardian-consent').send({ consentToken: m.consentToken }).expect(200);
    await settle();
    expect(calls('sendWelcomeEmail')).toHaveLength(1);
  });

  it('MINOR, guardian first: approval alone sends nothing; verifying the email then sends the welcome once', async () => {
    const m = await seedUser({ isMinor: true, verified: false, consent: 'pending' });
    await http().post('/auth/guardian-consent').send({ consentToken: m.consentToken }).expect(200);
    await settle();
    expect(calls('sendWelcomeEmail')).toHaveLength(0);

    await verifyEmailFor(m.id).then((r) => expect(r.status).toBe(200));
    await settle();
    expect(calls('sendWelcomeEmail')).toHaveLength(1);
  });

  it('a minor whose guardian has not approved never gets a welcome, even with a verified email', async () => {
    const m = await seedUser({ isMinor: true, verified: false, consent: 'pending' });
    await verifyEmailFor(m.id);
    await settle();
    expect(calls('sendWelcomeEmail')).toHaveLength(0);
  });

  // ------------------------------------------------------------ deletion requested

  it('POST /auth/delete-account: ONE "deletion requested" email with the grace period, and the account is closed', async () => {
    const u = await seedUser();
    await http().post('/auth/delete-account').set(u.auth).send({ password: PASSWORD }).expect(204);
    await settle();
    expect(calls('sendAccountDeletionRequestedEmail')).toHaveLength(1);
    expect(calls('sendAccountDeletionRequestedEmail')[0].args).toEqual([u.email, 'Ada', 30]);
    const row = await prisma().user.findUnique({ where: { id: u.id }, select: { accountStatus: true } });
    expect(row?.accountStatus).toBe('pending_deletion');
  });

  it('a wrong password sends nothing and deletes nothing', async () => {
    const u = await seedUser();
    await http().post('/auth/delete-account').set(u.auth).send({ password: 'wrong-wrong-wrong' }).expect(401);
    await settle();
    expect(calls('sendAccountDeletionRequestedEmail')).toHaveLength(0);
  });

  it('POST /auth/delete-inactive-account (from a deactivated account) sends the same email once', async () => {
    const u = await seedUser();
    await prisma().user.update({ where: { id: u.id }, data: { accountStatus: 'deactivated' } });
    await http().post('/auth/delete-inactive-account').send({ email: u.email, password: PASSWORD }).expect(204);
    await settle();
    expect(calls('sendAccountDeletionRequestedEmail')).toHaveLength(1);
  });

  it('a deletion that starts because a guardian DECLINED sends no "you asked to delete" email', async () => {
    // Decline 3 of 3 closes the account through the same startPendingDeletion primitive; use the withdrawal-free
    // route: three declines on one pending request.
    const m = await seedUser({ isMinor: true, consent: 'pending' });
    for (let i = 0; i < 3; i++) {
      await http().post('/auth/guardian-consent/decline').send({ consentToken: m.consentToken });
      // Re-open the row between declines the way the minor's resend does, so the cap is reached.
      await prisma().guardian.updateMany({ where: { minorUserId: m.id, consentStatus: 'declined' }, data: i < 2 ? { consentStatus: 'pending' } : {} });
    }
    await settle();
    const row = await prisma().user.findUnique({ where: { id: m.id }, select: { accountStatus: true } });
    expect(row?.accountStatus).toBe('pending_deletion');
    expect(calls('sendAccountDeletionRequestedEmail')).toHaveLength(0);
  });

  // ------------------------------------------------------------ staff account created

  async function seedAdmin(role: string) {
    const admin = await prisma().adminUser.create({
      data: { email: `b069-admin-${rand()}@example.com`, passwordHash: 'unused', fullName: 'Boss Person', role },
    });
    const { accessToken } = await app.get(AdminTokenService).issueTokenPair(admin.id, admin.role);
    return { id: admin.id, auth: { Authorization: `Bearer ${accessToken.token}` } };
  }

  it.each(['editor', 'moderator', 'superadmin'])('POST /admin/staff (%s): ONE "account created" email, with no password in it', async (role) => {
    const boss = await seedAdmin('superadmin');
    const email = `new-${rand()}@soccernity.com`;
    const res = await http().post('/admin/staff').set(boss.auth).send({ email, fullName: 'Sam Newadmin', role }).expect(201);
    await settle();
    expect(res.body.temporaryPassword).toEqual(expect.any(String));
    const c = calls('sendStaffAccountCreatedEmail');
    expect(c).toHaveLength(1);
    const [to, first, label, sentence] = c[0].args as string[];
    expect(to).toBe(email);
    expect(first).toBe('Sam');
    expect(label).toBe(role === 'superadmin' ? 'super admin' : role);
    expect(sentence.length).toBeGreaterThan(20);
    expect(JSON.stringify(c[0].args)).not.toContain(res.body.temporaryPassword);
  });

  it('a duplicate admin email (409) sends nothing, and a failing sender does not fail the creation', async () => {
    const boss = await seedAdmin('superadmin');
    const email = `dup-${rand()}@soccernity.com`;
    await http().post('/admin/staff').set(boss.auth).send({ email, fullName: 'Sam One', role: 'editor' }).expect(201);
    await settle();
    sent.length = 0;
    await http().post('/admin/staff').set(boss.auth).send({ email, fullName: 'Sam Two', role: 'editor' }).expect(409);
    await settle();
    expect(calls('sendStaffAccountCreatedEmail')).toHaveLength(0);

    failSends = true;
    await http().post('/admin/staff').set(boss.auth).send({ email: `ok-${rand()}@soccernity.com`, fullName: 'Sam Three', role: 'editor' }).expect(201);
  });
});
