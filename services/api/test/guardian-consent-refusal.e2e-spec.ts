import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AccountDeletionSweepService } from '../src/modules/account-deletion/account-deletion-sweep.service';
import { GuardianConsentExpirySweepService } from '../src/modules/auth/guardian-consent/guardian-consent-expiry-sweep.service';
import { PasswordService } from '../src/modules/auth/password/password.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';

// Real-Postgres coverage for sprint-1/guardian-consent-decline-withdraw-expiry.
//
// Why this needs a real database rather than only the mocked unit suites
// (per test/README.md's own guiding principle — this hits reasons 3 and 4):
//
//  3. Genuinely new constraints: Guardian.withdrawalToken's @unique and
//     the new @@index([consentStatus, consentTokenExpiresAt]) the sweep
//     query relies on have never run against a live schema. A mock also
//     cannot tell you that a NULLed withdrawalToken stops matching a
//     lookup — the thing that actually makes a withdrawal link
//     single-use — because that is Postgres's NULL semantics, not
//     application logic.
//
//  4. A property spanning the whole, really-bootstrapped app: each of
//     the three refusal routes has to leave the minor's account in a
//     state the SEPARATE, pre-existing AccountDeletionSweepService then
//     picks up and hard-deletes on its own 30-day schedule, with the
//     Guardian row snapshotted into ConsentAuditRecord on the way out.
//     That hand-off is the entire point of reusing startPendingDeletion()
//     instead of inventing a new state, and nothing short of running both
//     services against one real database proves it.
//
// Rate limiting: the three new routes carry @AuthRateLimit() (the shared
// 'auth' named throttler, 5 requests / 60s). Each describe block below
// gets its OWN app instance and therefore its own in-memory throttler
// bucket, and each stays at or under 4 rate-limited calls — the same
// budgeting discipline account-deactivation.e2e-spec.ts documents. Users
// and guardians are seeded directly via Prisma rather than through POST
// /auth/register, the established workaround in this suite for exactly
// this reason.

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

interface SeededMinor {
  userId: string;
  minorEmail: string;
  guardianId: string;
  consentToken: string;
}

async function createApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  await app.init();
  return app;
}

async function seedMinorWithGuardian(
  app: INestApplication,
  label: string,
  guardianOverrides: {
    consentStatus?: string;
    consentTimestamp?: Date | null;
    consentTokenExpiresAt?: Date;
    consentAutoResentAt?: Date | null;
  } = {},
): Promise<SeededMinor> {
  const prisma = getTestPrismaClient();
  const passwordService = app.get(PasswordService);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const minorEmail = `e2e-consent-${label}-${suffix}@example.com`;
  const consentToken = `consent-${label}-${suffix}`;

  const user = await prisma.user.create({
    data: {
      email: minorEmail,
      passwordHash: await passwordService.hash('Sup3rSecret!'),
      displayName: `E2E Minor ${label}`,
      // A real minor — isMinor is what makes the guardian-consent flow
      // apply at all.
      dateOfBirth: new Date('2014-05-02'),
      isMinor: true,
    },
  });

  const guardian = await prisma.guardian.create({
    data: {
      minorUserId: user.id,
      name: `Guardian ${label}`,
      email: `e2e-guardian-${label}-${suffix}@example.com`,
      relationship: 'Parent',
      consentStatus: guardianOverrides.consentStatus ?? 'pending',
      consentToken,
      consentTokenExpiresAt: guardianOverrides.consentTokenExpiresAt ?? new Date(Date.now() + 48 * HOUR),
      consentTimestamp: guardianOverrides.consentTimestamp ?? null,
      consentAutoResentAt: guardianOverrides.consentAutoResentAt ?? null,
    },
  });

  return { userId: user.id, minorEmail, guardianId: guardian.id, consentToken };
}

describe('Guardian consent refusal e2e: explicit decline -> pending_deletion -> 30-day sweep (real Postgres)', () => {
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

  it('declines, closes the account, and the existing deletion sweep then hard-deletes it normally', async () => {
    const prisma = getTestPrismaClient();
    const seeded = await seedMinorWithGuardian(app, 'decline');

    await request(app.getHttpServer())
      .post('/auth/guardian-consent/decline')
      .send({ consentToken: seeded.consentToken })
      .expect(200);

    const guardian = await prisma.guardian.findUnique({ where: { id: seeded.guardianId } });
    expect(guardian?.consentStatus).toBe('declined');
    // A decline never sets consentTimestamp — that field means "consent
    // was given at", and this is the value ConsentAuditRecord snapshots.
    expect(guardian?.consentTimestamp).toBeNull();

    const user = await prisma.user.findUnique({ where: { id: seeded.userId } });
    expect(user?.accountStatus).toBe('pending_deletion');
    expect(user?.pendingDeletionAt).toBeInstanceOf(Date);

    // Nothing special happens on the deletion side: the pre-existing
    // sweep picks this account up on exactly the same 30-day terms as a
    // self-requested deletion, because both went through the one shared
    // startPendingDeletion() primitive.
    const sweep = app.get(AccountDeletionSweepService);
    const tooEarly = await sweep.sweepPendingDeletions(new Date(Date.now() + 29 * DAY));
    expect(tooEarly.anonymizedUserIds).not.toContain(seeded.userId);
    expect(await prisma.user.findUnique({ where: { id: seeded.userId } })).not.toBeNull();

    const due = await sweep.sweepPendingDeletions(new Date(Date.now() + 31 * DAY));
    expect(due.anonymizedUserIds).toContain(seeded.userId);
    expect(due.heldUserIds).toEqual([]);

    expect((await prisma.user.findUnique({ where: { id: seeded.userId } }))?.accountStatus).toBe('deleted');
    expect(await prisma.guardian.findUnique({ where: { id: seeded.guardianId } })).toBeNull();

    // Decision Log #42: the consent record outlives the User row, and
    // carries the refusal itself as the preserved proof.
    const audit = await prisma.consentAuditRecord.findMany({
      where: { minorUserId: seeded.userId },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0].consentStatus).toBe('declined');
    expect(audit[0].consentConfirmedAt).toBeNull();
  });

  it('cannot be reversed by re-clicking the original consent link', async () => {
    const prisma = getTestPrismaClient();
    const seeded = await seedMinorWithGuardian(app, 'noreverse');

    await request(app.getHttpServer())
      .post('/auth/guardian-consent/decline')
      .send({ consentToken: seeded.consentToken })
      .expect(200);

    // Guardian.consentToken is NOT NULL and @unique, so it keeps
    // resolving after a decline. Confirming must not silently undo a
    // refusal on an account already scheduled for deletion.
    await request(app.getHttpServer())
      .post('/auth/guardian-consent')
      .send({ consentToken: seeded.consentToken })
      .expect(400);

    const guardian = await prisma.guardian.findUnique({ where: { id: seeded.guardianId } });
    expect(guardian?.consentStatus).toBe('declined');
    expect(guardian?.consentTimestamp).toBeNull();
  });

  it('refuses to decline an already-confirmed request', async () => {
    const prisma = getTestPrismaClient();
    const seeded = await seedMinorWithGuardian(app, 'alreadyok', {
      consentStatus: 'confirmed',
      consentTimestamp: new Date(),
    });

    await request(app.getHttpServer())
      .post('/auth/guardian-consent/decline')
      .send({ consentToken: seeded.consentToken })
      .expect(400);

    const user = await prisma.user.findUnique({ where: { id: seeded.userId } });
    expect(user?.accountStatus).toBe('active');
  });
});

describe('Guardian consent refusal e2e: withdrawal -> pending_deletion -> 30-day sweep (real Postgres)', () => {
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

  it('issues a withdrawal token, consumes it once, and hands off to the deletion sweep', async () => {
    const prisma = getTestPrismaClient();
    const seeded = await seedMinorWithGuardian(app, 'withdraw', {
      consentStatus: 'confirmed',
      consentTimestamp: new Date('2026-02-03T09:30:00Z'),
    });

    // Step 1 — takes the MINOR's email; the link goes to the guardian.
    await request(app.getHttpServer())
      .post('/auth/guardian-consent/withdraw/request')
      .send({ email: seeded.minorEmail })
      .expect(200);

    const issued = await prisma.guardian.findUnique({ where: { id: seeded.guardianId } });
    expect(issued?.withdrawalToken).toEqual(expect.any(String));
    expect(issued?.withdrawalTokenExpiresAt).toBeInstanceOf(Date);
    // Issuing a withdrawal link must not, by itself, change consent.
    expect(issued?.consentStatus).toBe('confirmed');

    // Step 2 — consume it.
    await request(app.getHttpServer())
      .post('/auth/guardian-consent/withdraw')
      .send({ withdrawalToken: issued!.withdrawalToken })
      .expect(200);

    const withdrawn = await prisma.guardian.findUnique({ where: { id: seeded.guardianId } });
    expect(withdrawn?.consentStatus).toBe('declined');
    expect(withdrawn?.withdrawalToken).toBeNull();
    // Preserved: this is what lets ConsentAuditRecord distinguish a
    // withdrawal ('declined' + a real timestamp) from a plain decline
    // ('declined' + null).
    expect(withdrawn?.consentTimestamp).toEqual(new Date('2026-02-03T09:30:00Z'));

    const user = await prisma.user.findUnique({ where: { id: seeded.userId } });
    expect(user?.accountStatus).toBe('pending_deletion');

    // Replay: the same link is genuinely spent. Proven against real
    // Postgres specifically because it depends on `WHERE
    // "withdrawalToken" = $1` not matching a NULL row.
    await request(app.getHttpServer())
      .post('/auth/guardian-consent/withdraw')
      .send({ withdrawalToken: issued!.withdrawalToken })
      .expect(400);

    const sweep = app.get(AccountDeletionSweepService);
    const due = await sweep.sweepPendingDeletions(new Date(Date.now() + 31 * DAY));
    expect(due.anonymizedUserIds).toContain(seeded.userId);
    expect((await prisma.user.findUnique({ where: { id: seeded.userId } }))?.accountStatus).toBe('deleted');

    const audit = await prisma.consentAuditRecord.findMany({
      where: { minorUserId: seeded.userId },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0].consentStatus).toBe('declined');
    // The withdrawal is distinguishable from a decline here.
    expect(audit[0].consentConfirmedAt).toEqual(new Date('2026-02-03T09:30:00Z'));
  });

  it('is a silent, stateless no-op when consent was only ever pending', async () => {
    const prisma = getTestPrismaClient();
    const seeded = await seedMinorWithGuardian(app, 'pendingwd');

    // Same generic 200 as the matched case — non-enumeration.
    await request(app.getHttpServer())
      .post('/auth/guardian-consent/withdraw/request')
      .send({ email: seeded.minorEmail })
      .expect(200);

    const guardian = await prisma.guardian.findUnique({ where: { id: seeded.guardianId } });
    expect(guardian?.withdrawalToken).toBeNull();
    expect(guardian?.consentStatus).toBe('pending');
  });
});

describe('Guardian consent refusal e2e: two lapsed requests -> implicit decline (real Postgres)', () => {
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

  // No HTTP calls at all in this block — the sweep is deliberately not
  // exposed as an endpoint (see its own comment), so it is driven
  // directly with an explicit `now`, exactly as
  // account-deletion-sweep.e2e-spec.ts drives its own @Cron() job.
  it('re-sends once on the first expiry, then treats the second as a decline, then deletes', async () => {
    const prisma = getTestPrismaClient();
    const consentSweep = app.get(GuardianConsentExpirySweepService);

    const seeded = await seedMinorWithGuardian(app, 'expiry', {
      // Already lapsed.
      consentTokenExpiresAt: new Date(Date.now() - HOUR),
    });

    // --- First expiry: one automatic chase, account untouched.
    const first = await consentSweep.sweepExpiredConsentRequests();
    expect(first.autoResentGuardianIds).toContain(seeded.guardianId);
    expect(first.implicitlyDeclinedGuardianIds).toEqual([]);

    const chased = await prisma.guardian.findUnique({ where: { id: seeded.guardianId } });
    expect(chased?.consentStatus).toBe('pending');
    expect(chased?.consentAutoResentAt).toBeInstanceOf(Date);
    // A genuinely fresh token, with a fresh window — the old one no
    // longer resolves.
    expect(chased?.consentToken).not.toEqual(seeded.consentToken);
    expect(chased!.consentTokenExpiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(
      await prisma.user.findUnique({ where: { id: seeded.userId } }),
    ).toMatchObject({ accountStatus: 'active' });

    // An immediate re-run must NOT chase again — the new token has not
    // lapsed, so the row is out of scope entirely.
    const immediateRerun = await consentSweep.sweepExpiredConsentRequests();
    expect(immediateRerun.autoResentGuardianIds).toEqual([]);
    expect(immediateRerun.implicitlyDeclinedGuardianIds).toEqual([]);

    // --- Second expiry: the re-sent request lapses too.
    await prisma.guardian.update({
      where: { id: seeded.guardianId },
      data: { consentTokenExpiresAt: new Date(Date.now() - HOUR) },
    });

    const second = await consentSweep.sweepExpiredConsentRequests();
    expect(second.implicitlyDeclinedGuardianIds).toContain(seeded.guardianId);
    expect(second.autoResentGuardianIds).toEqual([]);

    const refused = await prisma.guardian.findUnique({ where: { id: seeded.guardianId } });
    expect(refused?.consentStatus).toBe('declined');

    const user = await prisma.user.findUnique({ where: { id: seeded.userId } });
    expect(user?.accountStatus).toBe('pending_deletion');
    expect(user?.pendingDeletionAt).toBeInstanceOf(Date);

    // A third tick must be a complete no-op: the row is no longer
    // 'pending', so it is out of the query's scope, and the minor's
    // 30-day clock is never restarted.
    const beforeThird = user!.pendingDeletionAt!.getTime();
    const third = await consentSweep.sweepExpiredConsentRequests();
    expect(third.autoResentGuardianIds).toEqual([]);
    expect(third.implicitlyDeclinedGuardianIds).toEqual([]);
    const afterThird = await prisma.user.findUnique({ where: { id: seeded.userId } });
    expect(afterThird!.pendingDeletionAt!.getTime()).toBe(beforeThird);

    // --- And the ordinary deletion sweep finishes the job.
    const deletionSweep = app.get(AccountDeletionSweepService);
    const due = await deletionSweep.sweepPendingDeletions(new Date(Date.now() + 31 * DAY));
    expect(due.anonymizedUserIds).toContain(seeded.userId);
    expect((await prisma.user.findUnique({ where: { id: seeded.userId } }))?.accountStatus).toBe('deleted');
  });

  it('leaves a confirmed guardian alone even once its consent token has lapsed', async () => {
    const prisma = getTestPrismaClient();
    const consentSweep = app.get(GuardianConsentExpirySweepService);

    const seeded = await seedMinorWithGuardian(app, 'confirmedexp', {
      consentStatus: 'confirmed',
      consentTimestamp: new Date(),
      consentTokenExpiresAt: new Date(Date.now() - 10 * DAY),
    });

    const result = await consentSweep.sweepExpiredConsentRequests();

    expect(result.autoResentGuardianIds).toEqual([]);
    expect(result.implicitlyDeclinedGuardianIds).toEqual([]);
    const guardian = await prisma.guardian.findUnique({ where: { id: seeded.guardianId } });
    expect(guardian?.consentStatus).toBe('confirmed');
    expect(
      await prisma.user.findUnique({ where: { id: seeded.userId } }),
    ).toMatchObject({ accountStatus: 'active' });
  });

  it('does not chase a request that has not lapsed yet', async () => {
    const prisma = getTestPrismaClient();
    const consentSweep = app.get(GuardianConsentExpirySweepService);

    const seeded = await seedMinorWithGuardian(app, 'fresh', {
      consentTokenExpiresAt: new Date(Date.now() + 48 * HOUR),
    });

    const result = await consentSweep.sweepExpiredConsentRequests();

    expect(result.autoResentGuardianIds).toEqual([]);
    const guardian = await prisma.guardian.findUnique({ where: { id: seeded.guardianId } });
    expect(guardian?.consentAutoResentAt).toBeNull();
    expect(guardian?.consentToken).toEqual(seeded.consentToken);
  });
});
