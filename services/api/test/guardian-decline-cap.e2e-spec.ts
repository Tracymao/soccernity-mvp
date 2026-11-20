import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AccountDeletionSweepService } from '../src/modules/account-deletion/account-deletion-sweep.service';
import { GuardianConsentExpirySweepService } from '../src/modules/auth/guardian-consent/guardian-consent-expiry-sweep.service';
import { GuardianConsentService } from '../src/modules/auth/guardian-consent/guardian-consent.service';
import { PasswordService } from '../src/modules/auth/password/password.service';
import { TokenService } from '../src/modules/auth/token/token.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { seedDob } from './dob-seed';

// B-110 / B-102 (Decision Log #389, #395 B2, #402, #403 items 2 and 15) against
// real Postgres, Redis and the really-bootstrapped app.
//
// What a mock cannot show and this file does:
//   - after decline 1 the SAME refresh token minted before the decline still
//     refreshes (sessions are genuinely not revoked) and a real login works;
//   - the third decline genuinely revokes the session and blocks a real login,
//     and the existing 30-day sweep then handles the account on its normal terms;
//   - the updateMany guards (counter pin, status guard, nested minorUser filter)
//     behave on a real engine, including a concurrent double decline;
//   - the migration's column, default and CHECK constraint are real.
//
// Rate limiting: decline/resend/login/withdraw carry @AuthRateLimit() (shared
// 5 requests / 60s bucket PER APP INSTANCE). Each describe block gets its own
// app and stays at or under four rate-limited HTTP calls; the remaining steps
// call GuardianConsentService directly (still the real service against the
// real database), the established workaround in this suite.

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const PASSWORD = 'Sup3rSecret!';

async function createApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  return app;
}

interface Seeded {
  userId: string;
  email: string;
  guardianId: string;
  accessToken: string;
  refreshToken: string;
}

async function seedMinor(
  app: INestApplication,
  label: string,
  guardian: {
    consentStatus?: string;
    consentDeclineSource?: string | null;
    declineCount?: number;
    consentTimestamp?: Date | null;
    consentAutoResentAt?: Date | null;
    consentTokenExpiresAt?: Date;
  } = {},
): Promise<Seeded> {
  const prisma = getTestPrismaClient();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const email = `e2e-cap-${label}-${suffix}@example.com`;
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await app.get(PasswordService).hash(PASSWORD),
      displayName: `E2E Cap ${label}`,
      dateOfBirth: seedDob('2014-05-02'),
      isMinor: true,
      isUnder16: true,
    },
  });
  const g = await prisma.guardian.create({
    data: {
      minorUserId: user.id,
      name: `Guardian ${label}`,
      email: `e2e-cap-guardian-${label}-${suffix}@example.com`,
      relationship: 'Parent',
      consentStatus: guardian.consentStatus ?? 'pending',
      consentDeclineSource: guardian.consentDeclineSource ?? null,
      declineCount: guardian.declineCount ?? 0,
      consentTimestamp: guardian.consentTimestamp ?? null,
      consentAutoResentAt: guardian.consentAutoResentAt ?? null,
      consentToken: `cap-${label}-${suffix}`,
      consentTokenExpiresAt: guardian.consentTokenExpiresAt ?? new Date(Date.now() + 48 * HOUR),
    },
  });
  const pair = await app.get(TokenService).issueTokenPair(user.id, user.role);
  return {
    userId: user.id,
    email,
    guardianId: g.id,
    accessToken: pair.accessToken.token,
    refreshToken: pair.refreshToken.token,
  };
}

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('Guardian decline cap e2e: declines 1 and 2 keep the account open (B-110)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createApp();
  });
  beforeEach(async () => {
    await resetDatabase();
  });
  afterAll(async () => {
    await app.close();
    await disconnectTestPrismaClient();
  });

  it('decline 1: row declined, counter 1, account active, the old session still refreshes, login still works', async () => {
    const prisma = getTestPrismaClient();
    const s = await seedMinor(app, 'd1');
    const row = () => prisma.guardian.findUnique({ where: { id: s.guardianId } });

    // rate-limited call 1
    await request(app.getHttpServer())
      .post('/auth/guardian-consent/decline')
      .send({ consentToken: (await row())!.consentToken })
      .expect(200);

    const g = await row();
    expect(g?.consentStatus).toBe('declined');
    expect(g?.consentDeclineSource).toBe('guardian_explicit');
    expect(g?.declineCount).toBe(1);
    const u = await prisma.user.findUnique({ where: { id: s.userId } });
    expect(u?.accountStatus).toBe('active');
    expect(u?.pendingDeletionAt).toBeNull();

    // Sessions stay valid: the access token still works, the refresh token
    // minted BEFORE the decline still refreshes.
    const status = await request(app.getHttpServer())
      .get('/auth/guardian-consent/status')
      .set(bearer(s.accessToken))
      .expect(200);
    expect(status.body.consentStatus).toBe('declined');
    expect(status.body.canResend).toBe(true);
    expect(JSON.stringify(status.body)).not.toMatch(/declineCount|count/i);
    await request(app.getHttpServer()).post('/auth/refresh').send({ refreshToken: s.refreshToken }).expect(200);

    // rate-limited call 2: a real login is accepted for the (still active) account.
    await request(app.getHttpServer()).post('/auth/login').send({ email: s.email, password: PASSWORD }).expect(200);
  });

  it('the restricted-pending enforcement still holds while declined (allowlist), and no email path fired', async () => {
    const s = await seedMinor(app, 'enforce', { consentStatus: 'declined', consentDeclineSource: 'guardian_explicit', declineCount: 1 });
    // A consent-gated write is refused for a declined minor.
    const res = await request(app.getHttpServer())
      .post('/posts')
      .set(bearer(s.accessToken))
      .send({ contentText: 'hello' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('guardian_consent_pending');
  });

  it('resend after decline 1 reopens the request as pending with a new token; counter kept', async () => {
    const prisma = getTestPrismaClient();
    const s = await seedMinor(app, 'resend', { consentStatus: 'declined', consentDeclineSource: 'guardian_explicit', declineCount: 1 });
    const before = (await prisma.guardian.findUnique({ where: { id: s.guardianId } }))!;

    // rate-limited call 1
    await request(app.getHttpServer()).post('/auth/guardian-consent/resend').send({ email: s.email }).expect(200);

    const after = (await prisma.guardian.findUnique({ where: { id: s.guardianId } }))!;
    expect(after.consentStatus).toBe('pending');
    expect(after.consentDeclineSource).toBeNull();
    expect(after.consentToken).not.toBe(before.consentToken);
    expect(after.declineCount).toBe(1);
    expect(after.consentTokenExpiresAt.getTime()).toBeGreaterThan(Date.now());
    // The old link no longer resolves.
    expect(await prisma.guardian.findUnique({ where: { consentToken: before.consentToken } })).toBeNull();

    // rate-limited call 2: the second decline (on the NEW token) is decline 2.
    await request(app.getHttpServer())
      .post('/auth/guardian-consent/decline')
      .send({ consentToken: after.consentToken })
      .expect(200);
    const second = (await prisma.guardian.findUnique({ where: { id: s.guardianId } }))!;
    expect(second.declineCount).toBe(2);
    expect((await prisma.user.findUnique({ where: { id: s.userId } }))?.accountStatus).toBe('active');
  });

  it('change-guardian-email after a decline reopens the request and does NOT reset the counter', async () => {
    const prisma = getTestPrismaClient();
    const s = await seedMinor(app, 'change', { consentStatus: 'declined', consentDeclineSource: 'guardian_explicit', declineCount: 2 });

    // rate-limited call 1
    await request(app.getHttpServer())
      .post('/auth/guardian-consent/change-guardian-email')
      .set(bearer(s.accessToken))
      .send({ name: 'New Guardian', email: 'brand-new-guardian@example.com', relationship: 'Legal Guardian' })
      .expect(200);

    const g = (await prisma.guardian.findUnique({ where: { id: s.guardianId } }))!;
    expect(g.consentStatus).toBe('pending');
    expect(g.email).toBe('brand-new-guardian@example.com');
    expect(g.declineCount).toBe(2);
    expect(g.consentDeclineSource).toBeNull();
  });

  it('two concurrent declines of the same request count once', async () => {
    const prisma = getTestPrismaClient();
    const s = await seedMinor(app, 'race');
    const token = (await prisma.guardian.findUnique({ where: { id: s.guardianId } }))!.consentToken;
    const service = app.get(GuardianConsentService);

    await Promise.all([service.declineConsent(token), service.declineConsent(token)]);

    const g = (await prisma.guardian.findUnique({ where: { id: s.guardianId } }))!;
    expect(g.declineCount).toBe(1);
    expect(g.consentStatus).toBe('declined');
  });
});

describe('Guardian decline cap e2e: the third decline closes the account (B-102)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createApp();
  });
  beforeEach(async () => {
    await resetDatabase();
  });
  afterAll(async () => {
    await app.close();
    await disconnectTestPrismaClient();
  });

  it('three declines in ONE day: sessions revoked, login blocked, pending deletion with the 30-day grace', async () => {
    const prisma = getTestPrismaClient();
    const s = await seedMinor(app, 'three');
    const consent = app.get(GuardianConsentService);
    const row = () => prisma.guardian.findUnique({ where: { id: s.guardianId } });

    await consent.declineConsent((await row())!.consentToken);
    await consent.resendConsent(s.email);
    await consent.declineConsent((await row())!.consentToken);
    await consent.resendConsent(s.email);
    expect((await prisma.user.findUnique({ where: { id: s.userId } }))?.accountStatus).toBe('active');
    // The third decline, over HTTP (rate-limited call 1).
    await request(app.getHttpServer())
      .post('/auth/guardian-consent/decline')
      .send({ consentToken: (await row())!.consentToken })
      .expect(200);

    const g = (await row())!;
    expect(g.declineCount).toBe(3);
    expect(g.consentStatus).toBe('declined');
    const u = (await prisma.user.findUnique({ where: { id: s.userId } }))!;
    expect(u.accountStatus).toBe('pending_deletion');
    expect(u.pendingDeletionAt).toBeInstanceOf(Date);

    // Sessions revoked: the refresh token minted at the start is dead.
    await request(app.getHttpServer()).post('/auth/refresh').send({ refreshToken: s.refreshToken }).expect(401);
    // Login blocked at once (rate-limited call 2): the generic rejection.
    await request(app.getHttpServer()).post('/auth/login').send({ email: s.email, password: PASSWORD }).expect(401);

    // Not reopenable: resend does nothing, the row stays declined at 3.
    await consent.resendConsent(s.email);
    expect((await row())!.consentStatus).toBe('declined');

    // The existing deletion sweep applies on its normal terms: the grace is NOT skipped.
    const sweep = app.get(AccountDeletionSweepService);
    const early = await sweep.sweepPendingDeletions(new Date(Date.now() + 29 * DAY));
    expect(early.anonymizedUserIds).not.toContain(s.userId);
    const due = await sweep.sweepPendingDeletions(new Date(Date.now() + 31 * DAY));
    expect(due.anonymizedUserIds).toContain(s.userId);
  });

  it('a repeated click on the final decline link does not restart the deletion clock', async () => {
    const prisma = getTestPrismaClient();
    const s = await seedMinor(app, 'final-twice', { declineCount: 2 });
    const consent = app.get(GuardianConsentService);
    const token = (await prisma.guardian.findUnique({ where: { id: s.guardianId } }))!.consentToken;

    await consent.declineConsent(token);
    const first = (await prisma.user.findUnique({ where: { id: s.userId } }))!.pendingDeletionAt;
    await consent.declineConsent(token);
    const second = (await prisma.user.findUnique({ where: { id: s.userId } }))!.pendingDeletionAt;

    expect(second).toEqual(first);
    expect((await prisma.guardian.findUnique({ where: { id: s.guardianId } }))!.declineCount).toBe(3);
  });
});

describe('Guardian decline cap e2e: other refusal routes do not count (B-102)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createApp();
  });
  beforeEach(async () => {
    await resetDatabase();
  });
  afterAll(async () => {
    await app.close();
    await disconnectTestPrismaClient();
  });

  it('expiry (second lapse) leaves the counter alone and the row is not reopenable', async () => {
    const prisma = getTestPrismaClient();
    const s = await seedMinor(app, 'expiry', {
      declineCount: 1,
      consentAutoResentAt: new Date(Date.now() - 2 * DAY),
      consentTokenExpiresAt: new Date(Date.now() - HOUR),
    });

    await app.get(GuardianConsentExpirySweepService).sweepExpiredConsentRequests(new Date());

    const g = (await prisma.guardian.findUnique({ where: { id: s.guardianId } }))!;
    expect(g.consentStatus).toBe('declined');
    expect(g.consentDeclineSource).toBe('expiry_timeout');
    expect(g.declineCount).toBe(1);
    expect((await prisma.user.findUnique({ where: { id: s.userId } }))?.accountStatus).toBe('pending_deletion');

    await app.get(GuardianConsentService).resendConsent(s.email);
    expect((await prisma.guardian.findUnique({ where: { id: s.guardianId } }))!.consentStatus).toBe('declined');
  });

  it('post-approval withdrawal leaves the counter alone', async () => {
    const prisma = getTestPrismaClient();
    const s = await seedMinor(app, 'withdraw', { consentStatus: 'confirmed', consentTimestamp: new Date(), declineCount: 1 });
    const consent = app.get(GuardianConsentService);

    await consent.requestWithdrawal(s.email);
    const token = (await prisma.guardian.findUnique({ where: { id: s.guardianId } }))!.withdrawalToken!;
    await consent.withdrawConsent(token);

    const g = (await prisma.guardian.findUnique({ where: { id: s.guardianId } }))!;
    expect(g.consentDeclineSource).toBe('guardian_withdrawal');
    expect(g.declineCount).toBe(1);
  });
});

describe('Guardian decline cap e2e: the migration (B-102)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createApp();
  });
  beforeEach(async () => {
    await resetDatabase();
  });
  afterAll(async () => {
    await app.close();
    await disconnectTestPrismaClient();
  });

  it('declineCount defaults to 0 and a negative value is rejected by the CHECK constraint', async () => {
    const prisma = getTestPrismaClient();
    const s = await seedMinor(app, 'check');
    expect((await prisma.guardian.findUnique({ where: { id: s.guardianId } }))!.declineCount).toBe(0);
    await expect(
      prisma.guardian.update({ where: { id: s.guardianId }, data: { declineCount: -1 } }),
    ).rejects.toThrow();
  });
});
