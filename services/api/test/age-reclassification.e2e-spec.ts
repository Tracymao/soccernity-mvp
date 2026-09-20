import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AgeReclassificationSweepService } from '../src/modules/age-reclassification/age-reclassification-sweep.service';
import { GuardianConsentExpirySweepService } from '../src/modules/auth/guardian-consent/guardian-consent-expiry-sweep.service';
import { TokenService } from '../src/modules/auth/token/token.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';

// sprint-1/age-reclassification-sweep (Decision Log #349), against real
// Postgres. Proves the daily sweep flips isMinor / isUnder16 when a date of
// birth crosses 16 or 18, writes the audit rows, and -- the point of the
// test -- that the three dependent guards observe the new classification on
// the VERY NEXT request using the SAME access token minted before the sweep
// (i.e. not "next login").
describe('Age reclassification sweep e2e', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });
  beforeEach(async () => {
    await resetDatabase();
  });
  afterAll(async () => {
    await app.close();
    await disconnectTestPrismaClient();
  });

  const server = () => app.getHttpServer();
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  let n = 0;

  // A date of birth whose Nth birthday was exactly `daysAgo` days ago.
  function dobTurned(years: number, daysAgo: number): Date {
    const d = new Date();
    d.setFullYear(d.getFullYear() - years);
    d.setDate(d.getDate() - daysAgo);
    return d;
  }

  async function seed(opts: {
    dob: Date;
    isMinor: boolean;
    isUnder16: boolean;
    consent?: 'confirmed' | 'pending';
  }) {
    const prisma = getTestPrismaClient();
    n += 1;
    const user = await prisma.user.create({
      data: {
        email: `e2e-age-${n}-${Date.now()}@example.com`,
        passwordHash: 'unused',
        displayName: `Age ${n}`,
        dateOfBirth: opts.dob,
        isMinor: opts.isMinor,
        isUnder16: opts.isUnder16,
        ...(opts.consent && {
          guardian: {
            create: {
              name: 'Guardian',
              email: `guardian-age-${n}@example.com`,
              relationship: 'Parent',
              consentStatus: opts.consent,
              consentToken: `tok-age-${n}-${Date.now()}`,
              consentTokenExpiresAt: new Date(Date.now() + 86_400_000),
              ...(opts.consent === 'confirmed' && { consentTimestamp: new Date() }),
            },
          },
        }),
      },
    });
    // Minted BEFORE the sweep and reused after it.
    const { accessToken } = await app.get(TokenService).issueTokenPair(user.id, user.role);
    return { id: user.id, token: accessToken.token };
  }

  const sweep = () => app.get(AgeReclassificationSweepService).sweepReclassifications();

  it('turning 16: under-16 restriction (messaging, Community Group create) lifts on the very next request', async () => {
    const adult = await seed({ dob: new Date('1990-01-01'), isMinor: false, isUnder16: false });
    const teen = await seed({
      dob: dobTurned(16, 1), // turned 16 yesterday
      isMinor: true,
      isUnder16: true,
      consent: 'confirmed',
    });

    const dmBefore = await request(server())
      .post('/conversations')
      .set(auth(teen.token))
      .send({ recipientId: adult.id });
    expect(dmBefore.status).toBe(403);
    expect(dmBefore.body.code).toBe('under_16_restricted');
    const groupBefore = await request(server())
      .post('/community-groups')
      .set(auth(teen.token))
      .send({ name: 'Lagos Wingers', city: 'Lagos' });
    expect(groupBefore.status).toBe(403);
    expect(groupBefore.body.code).toBe('under_16_restricted');

    const result = await sweep();
    expect(result.reclassifiedUserIds).toEqual([teen.id]);

    const row = await getTestPrismaClient().user.findUnique({ where: { id: teen.id } });
    expect(row).toMatchObject({ isMinor: true, isUnder16: false }); // still a minor

    // Same token, next request.
    const dmAfter = await request(server())
      .post('/conversations')
      .set(auth(teen.token))
      .send({ recipientId: adult.id });
    expect([200, 201]).toContain(dmAfter.status);
    const groupAfter = await request(server())
      .post('/community-groups')
      .set(auth(teen.token))
      .send({ name: 'Lagos Wingers', city: 'Lagos' });
    expect(groupAfter.status).toBe(201);

    const logs = await getTestPrismaClient().ageReclassificationLog.findMany({
      where: { userId: teen.id },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      field: 'isUnder16',
      fromValue: true,
      toValue: false,
      ageAtChange: 16,
    });
  });

  it('turning 18: the adult->minor DM block stops protecting them, on the next request', async () => {
    const adult = await seed({ dob: new Date('1990-01-01'), isMinor: false, isUnder16: false });
    const nowAdult = await seed({
      dob: dobTurned(18, 1),
      isMinor: true,
      isUnder16: false,
      consent: 'confirmed',
    });

    const before = await request(server())
      .post('/conversations')
      .set(auth(adult.token))
      .send({ recipientId: nowAdult.id });
    expect(before.status).toBe(403);
    expect(before.body.code).toBe('adult_to_minor_dm_blocked');

    await sweep();

    const after = await request(server())
      .post('/conversations')
      .set(auth(adult.token))
      .send({ recipientId: nowAdult.id });
    expect([200, 201]).toContain(after.status);

    const row = await getTestPrismaClient().user.findUnique({ where: { id: nowAdult.id } });
    expect(row).toMatchObject({ isMinor: false, isUnder16: false });
    // The confirmed Guardian row is consent history: kept, not deleted.
    expect(
      await getTestPrismaClient().guardian.count({ where: { minorUserId: nowAdult.id } }),
    ).toBe(1);
  });

  it('turning 18 with consent still PENDING: GuardianConsentGuard lifts, and the stale request can never auto-decline the adult', async () => {
    const prisma = getTestPrismaClient();
    const person = await seed({
      dob: dobTurned(18, 1),
      isMinor: true,
      isUnder16: false,
      consent: 'pending',
    });
    // The pending request has long since lapsed AND had its one auto-resend.
    await prisma.guardian.update({
      where: { minorUserId: person.id },
      data: {
        consentTokenExpiresAt: new Date(Date.now() - 3_600_000),
        consentAutoResentAt: new Date(Date.now() - 86_400_000),
      },
    });

    const postBefore = await request(server())
      .post('/posts')
      .set(auth(person.token))
      .send({ contentText: 'hello' });
    expect(postBefore.status).toBe(403);
    expect(postBefore.body.code).toBe('guardian_consent_pending');

    await sweep();

    const postAfter = await request(server())
      .post('/posts')
      .set(auth(person.token))
      .send({ contentText: 'hello' });
    expect(postAfter.status).toBe(201);

    // The second-expiry branch would previously have implicitly declined
    // them into pending_deletion. Now it must skip a non-minor.
    const consentSweep = await app
      .get(GuardianConsentExpirySweepService)
      .sweepExpiredConsentRequests();
    expect(consentSweep.implicitlyDeclinedGuardianIds).toEqual([]);
    expect(consentSweep.autoResentGuardianIds).toEqual([]);
    const user = await prisma.user.findUnique({ where: { id: person.id } });
    expect(user?.accountStatus).toBe('active');
    const guardian = await prisma.guardian.findUnique({ where: { minorUserId: person.id } });
    expect(guardian?.consentStatus).toBe('pending');
  });

  it('a user who crosses 16 and 18 at once logs both fields; is idempotent; leaves not-yet-eligible and dob-less accounts alone', async () => {
    const prisma = getTestPrismaClient();
    const both = await seed({
      dob: dobTurned(18, 1),
      isMinor: true,
      isUnder16: true, // stale on both fields
      consent: 'confirmed',
    });
    const notYet = await seed({
      dob: dobTurned(17, 1),
      isMinor: true,
      isUnder16: false,
      consent: 'confirmed',
    });
    const anonymized = await prisma.user.create({
      data: {
        email: 'deleted-x@deleted.soccernity.internal',
        passwordHash: 'unused',
        displayName: '[deleted user]',
        dateOfBirth: null,
        isMinor: true,
        isUnder16: true,
        accountStatus: 'deleted',
      },
    });

    const first = await sweep();
    expect(first.reclassifiedUserIds).toEqual([both.id]);
    const logs = await prisma.ageReclassificationLog.findMany({ where: { userId: both.id } });
    expect(logs.map((l) => `${l.field}:${l.fromValue}->${l.toValue}`).sort()).toEqual([
      'isMinor:true->false',
      'isUnder16:true->false',
    ]);

    const second = await sweep();
    expect(second.reclassifiedUserIds).toEqual([]);
    expect(await prisma.ageReclassificationLog.count()).toBe(2);

    expect(await prisma.user.findUnique({ where: { id: notYet.id } })).toMatchObject({
      isMinor: true,
      isUnder16: false,
    });
    expect(await prisma.user.findUnique({ where: { id: anonymized.id } })).toMatchObject({
      isMinor: true,
      isUnder16: true,
    });
  });

  it('corrects the reverse direction too (an adult wrongly stored as a minor is the same path; a minor wrongly stored as adult becomes a minor)', async () => {
    const prisma = getTestPrismaClient();
    const mis = await seed({ dob: dobTurned(10, 30), isMinor: false, isUnder16: false });
    await sweep();
    expect(await prisma.user.findUnique({ where: { id: mis.id } })).toMatchObject({
      isMinor: true,
      isUnder16: true,
    });
    const logs = await prisma.ageReclassificationLog.findMany({ where: { userId: mis.id } });
    expect(logs).toHaveLength(2);
  });
});
