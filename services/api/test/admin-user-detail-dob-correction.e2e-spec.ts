import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AdminTokenService } from '../src/modules/admin/token/admin-token.service';
import { AgeReclassificationSweepService } from '../src/modules/age-reclassification/age-reclassification-sweep.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { decryptDob, parseDobKey } from '../src/crypto/dob-crypto';
import { seedDob } from './dob-seed';

// B-109 (GET /admin/users/:id) and B-103 (POST /admin/users/:id/dob-correction),
// Decision Log #390, #395 B4, #398, #403 item 15, against real Postgres.
//
// What needs a real database rather than only the mocked specs:
//   - the DOB really is stored as ciphertext and the endpoint decrypts it
//     server-side; the audit row is a real AdminActionLog FK row;
//   - the correction runs in ONE transaction: a refused correction leaves the
//     user, the guardian and the audit log all untouched;
//   - the optimistic lock on the stored ciphertext;
//   - after a correction the age-reclassification sweep finds nothing to fix,
//     because the flags were re-derived in the same write.

const DAY = 24 * 60 * 60 * 1000;

function dobForAge(age: number): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear() - age, now.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
}

describe('Admin user detail + DOB correction e2e (real Postgres)', () => {
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
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function createAdmin(label: string, role: string) {
    const prisma = getTestPrismaClient();
    const admin = await prisma.adminUser.create({
      data: {
        email: `e2e-dob-admin-${label}-${Date.now()}-${rand()}@example.com`,
        passwordHash: 'unused',
        fullName: `E2E DOB Admin ${label}`,
        role,
      },
    });
    const { accessToken } = await app.get(AdminTokenService).issueTokenPair(admin.id, admin.role);
    return { adminId: admin.id, token: accessToken.token };
  }

  async function createUser(
    label: string,
    age: number,
    opts: {
      guardian?: Record<string, unknown> | null;
      accountStatus?: string;
      derivedCountry?: string | null;
    } = {},
  ) {
    const prisma = getTestPrismaClient();
    const suffix = `${Date.now()}-${rand()}`;
    const user = await prisma.user.create({
      data: {
        email: `e2e-dob-user-${label}-${suffix}@example.com`,
        passwordHash: 'unused-hash-value',
        displayName: `E2E DOB ${label}`,
        dateOfBirth: seedDob(dobForAge(age)),
        isMinor: age < 18,
        isUnder16: age < 16,
        accountStatus: opts.accountStatus ?? 'active',
        // User_country_derivation_coherent_check: the three derivation columns
        // move together (resolved = method + code + time; unresolved = method +
        // time, no code).
        ...(() => {
          const code = opts.derivedCountry === undefined ? 'GB' : opts.derivedCountry;
          return {
            derivedCountry: code,
            countryDerivationMethod: code ? 'geolite2_local' : 'unresolved',
            countryDerivedAt: new Date(),
          };
        })(),
      },
    });
    let guardianId: string | null = null;
    if (opts.guardian !== null && age < 18) {
      const g = await prisma.guardian.create({
        data: {
          minorUserId: user.id,
          name: 'Pat Guardian',
          email: `guardian-${suffix}@example.com`,
          relationship: 'Parent',
          consentToken: `dob-${label}-${suffix}`,
          consentTokenExpiresAt: new Date(Date.now() + 2 * DAY),
          ...(opts.guardian ?? {}),
        },
      });
      guardianId = g.id;
    }
    return { userId: user.id, email: user.email, guardianId };
  }

  const guardianOf = (userId: string) => getTestPrismaClient().guardian.findUnique({ where: { minorUserId: userId } });
  const auditFor = (userId: string, action: string) =>
    getTestPrismaClient().adminActionLog.findMany({ where: { targetId: userId, action }, orderBy: { createdAt: 'asc' } });

  describe('GET /admin/users/:id (B-109)', () => {
    it('rejects an editor and writes no audit row', async () => {
      const editor = await createAdmin('editor', 'editor');
      const u = await createUser('editor-blocked', 12);
      await request(server()).get(`/admin/users/${u.userId}`).set(auth(editor.token)).expect(403);
      expect(await auditFor(u.userId, 'user.dob_viewed')).toHaveLength(0);
    });

    it('returns the DECRYPTED DOB to a moderator and writes one audit row per response', async () => {
      const moderator = await createAdmin('mod', 'moderator');
      const u = await createUser('view', 12);

      const first = await request(server()).get(`/admin/users/${u.userId}`).set(auth(moderator.token)).expect(200);
      expect(first.body.dateOfBirth).toBe(dobForAge(12));
      expect(first.body.ageTier).toBe('under_13');
      expect(first.body.guardian.consentStatus).toBe('pending');

      let rows = await auditFor(u.userId, 'user.dob_viewed');
      expect(rows).toHaveLength(1);
      expect(rows[0].adminId).toBe(moderator.adminId);
      expect(rows[0].targetType).toBe('user');
      expect(rows[0].notes).toBeNull();

      // A repeat read by the same admin writes ANOTHER row.
      await request(server()).get(`/admin/users/${u.userId}`).set(auth(moderator.token)).expect(200);
      rows = await auditFor(u.userId, 'user.dob_viewed');
      expect(rows).toHaveLength(2);
    });

    it('the stored value is ciphertext, and the response carries no secrets, tokens or counter', async () => {
      const superadmin = await createAdmin('super', 'superadmin');
      const u = await createUser('secrets', 12, { guardian: { declineCount: 2, withdrawalToken: 'w-secret-token' } });

      const stored = await getTestPrismaClient().user.findUnique({ where: { id: u.userId } });
      expect(stored?.dateOfBirth).toMatch(/^v1:/);
      expect(decryptDob(stored!.dateOfBirth!, parseDobKey(process.env.DOB_ENCRYPTION_KEY)).toISOString().slice(0, 10)).toBe(
        dobForAge(12),
      );

      const res = await request(server()).get(`/admin/users/${u.userId}`).set(auth(superadmin.token)).expect(200);
      const text = JSON.stringify(res.body);
      expect(text).not.toContain(stored!.dateOfBirth as string);
      expect(text).not.toContain('w-secret-token');
      expect(text).not.toMatch(/passwordHash|declineCount|stripePaymentIntentId|"consentToken"|"withdrawalToken"/);
      expect(text).not.toContain((await guardianOf(u.userId))!.consentToken);
    });

    it('404s for an unknown id and writes no audit row', async () => {
      const moderator = await createAdmin('mod404', 'moderator');
      await request(server())
        .get('/admin/users/00000000-0000-4000-8000-000000000000')
        .set(auth(moderator.token))
        .expect(404);
      expect(await getTestPrismaClient().adminActionLog.count({ where: { action: 'user.dob_viewed' } })).toBe(0);
    });

    it('does not shadow the literal GET routes', async () => {
      const moderator = await createAdmin('mod-lit', 'moderator');
      await request(server()).get('/admin/users/incorrect-details-reports').set(auth(moderator.token)).expect(200);
      await request(server()).get('/admin/users/held-investigations').set(auth(moderator.token)).expect(200);
    });
  });

  describe('POST /admin/users/:id/dob-correction (B-103)', () => {
    const REASON = 'Birth certificate verified by support';

    it('rejects an editor and changes nothing', async () => {
      const editor = await createAdmin('editor-c', 'editor');
      const u = await createUser('c-editor', 12);
      await request(server())
        .post(`/admin/users/${u.userId}/dob-correction`)
        .set(auth(editor.token))
        .send({ dateOfBirth: dobForAge(15), reason: REASON })
        .expect(403);
      expect(await auditFor(u.userId, 'user.dob_corrected')).toHaveLength(0);
    });

    it('under 13 -> under 16: DOB and flags move at once, the request restarts, the counter resets, audit has no DOB', async () => {
      const moderator = await createAdmin('mod-c1', 'moderator');
      const u = await createUser('c1', 12, {
        guardian: { declineCount: 2, consentStatus: 'declined', consentDeclineSource: 'guardian_explicit', incorrectDetailsReportedAt: new Date() },
      });
      const oldToken = (await guardianOf(u.userId))!.consentToken;

      const res = await request(server())
        .post(`/admin/users/${u.userId}/dob-correction`)
        .set(auth(moderator.token))
        .send({ dateOfBirth: dobForAge(15), reason: REASON })
        .expect(200);

      expect(res.body).toEqual({
        userId: u.userId,
        ageTierBefore: 'under_13',
        ageTierAfter: 'under_16',
        guardianRequest: 'restarted',
        declineCounterReset: true,
        incorrectDetailsFlagCleared: true,
      });
      expect(JSON.stringify(res.body)).not.toMatch(/\d{4}-\d{2}-\d{2}/);

      const user = (await getTestPrismaClient().user.findUnique({ where: { id: u.userId } }))!;
      expect(decryptDob(user.dateOfBirth!, parseDobKey(process.env.DOB_ENCRYPTION_KEY)).toISOString().slice(0, 10)).toBe(
        dobForAge(15),
      );
      expect(user.isMinor).toBe(true);
      expect(user.isUnder16).toBe(true);

      const g = (await guardianOf(u.userId))!;
      expect(g.consentStatus).toBe('pending');
      expect(g.consentDeclineSource).toBeNull();
      expect(g.declineCount).toBe(0);
      expect(g.incorrectDetailsReportedAt).toBeNull();
      expect(g.consentToken).not.toBe(oldToken);
      expect(await getTestPrismaClient().guardian.findUnique({ where: { consentToken: oldToken } })).toBeNull();

      const rows = await auditFor(u.userId, 'user.dob_corrected');
      expect(rows).toHaveLength(1);
      expect(rows[0].adminId).toBe(moderator.adminId);
      expect(rows[0].notes).toContain('under_13 -> under_16');
      expect(rows[0].notes).toContain(REASON);
      for (const forbidden of [dobForAge(12), dobForAge(15), dobForAge(12).slice(0, 7), dobForAge(15).slice(0, 7)]) {
        expect(rows[0].notes).not.toContain(forbidden);
      }
    });

    it('the age-reclassification sweep has nothing to fix afterwards (flags were re-derived in the same write)', async () => {
      const moderator = await createAdmin('mod-c2', 'moderator');
      const u = await createUser('c2', 12);
      await request(server())
        .post(`/admin/users/${u.userId}/dob-correction`)
        .set(auth(moderator.token))
        .send({ dateOfBirth: dobForAge(17), reason: REASON })
        .expect(200);

      const result = await app.get(AgeReclassificationSweepService).sweepReclassifications();
      const touched = JSON.stringify(result);
      expect(touched).not.toContain(u.userId);
    });

    it('minor -> adult: the open request is cancelled (old link dead), isMinor false, history kept', async () => {
      const moderator = await createAdmin('mod-c3', 'moderator');
      const u = await createUser('c3', 15, { guardian: { declineCount: 1 } });
      const oldToken = (await guardianOf(u.userId))!.consentToken;

      const res = await request(server())
        .post(`/admin/users/${u.userId}/dob-correction`)
        .set(auth(moderator.token))
        .send({ dateOfBirth: dobForAge(30), reason: REASON })
        .expect(200);
      expect(res.body.guardianRequest).toBe('cancelled');

      const user = (await getTestPrismaClient().user.findUnique({ where: { id: u.userId } }))!;
      expect(user.isMinor).toBe(false);
      expect(user.isUnder16).toBe(false);
      const g = (await guardianOf(u.userId))!;
      expect(g.consentToken).not.toBe(oldToken);
      expect(g.consentTokenExpiresAt.getTime()).toBeLessThanOrEqual(Date.now());
      expect(g.declineCount).toBe(1);

      // The old consent link can no longer be used.
      await request(server()).post('/auth/guardian-consent').send({ consentToken: oldToken }).expect(400);
    });

    it('adult -> minor with no guardian on file: 400 and NOTHING changes; with details, a Guardian row is created', async () => {
      const moderator = await createAdmin('mod-c4', 'moderator');
      const u = await createUser('c4', 25, { guardian: null });
      const before = (await getTestPrismaClient().user.findUnique({ where: { id: u.userId } }))!;

      await request(server())
        .post(`/admin/users/${u.userId}/dob-correction`)
        .set(auth(moderator.token))
        .send({ dateOfBirth: dobForAge(14), reason: REASON })
        .expect(400);
      const unchanged = (await getTestPrismaClient().user.findUnique({ where: { id: u.userId } }))!;
      expect(unchanged.dateOfBirth).toBe(before.dateOfBirth);
      expect(unchanged.isMinor).toBe(false);
      expect(await auditFor(u.userId, 'user.dob_corrected')).toHaveLength(0);

      await request(server())
        .post(`/admin/users/${u.userId}/dob-correction`)
        .set(auth(moderator.token))
        .send({
          dateOfBirth: dobForAge(14),
          reason: REASON,
          guardian: { name: 'New Parent', email: 'new-parent@example.com', relationship: 'Parent' },
        })
        .expect(200);
      const after = (await getTestPrismaClient().user.findUnique({ where: { id: u.userId } }))!;
      expect(after.isMinor).toBe(true);
      const g = (await guardianOf(u.userId))!;
      expect(g.email).toBe('new-parent@example.com');
      expect(g.consentStatus).toBe('pending');
    });

    it('is atomic: a refused restart (card charge still settling) leaves user, guardian and audit log untouched', async () => {
      const moderator = await createAdmin('mod-c5', 'moderator');
      const u = await createUser('c5', 15, {
        derivedCountry: 'US',
        guardian: { cardVerifiedAt: new Date(), cardRefundedAt: null, stripePaymentIntentId: 'pi_x', cardVerificationRequired: false },
      });
      const userBefore = (await getTestPrismaClient().user.findUnique({ where: { id: u.userId } }))!;
      const guardianBefore = (await guardianOf(u.userId))!;

      await request(server())
        .post(`/admin/users/${u.userId}/dob-correction`)
        .set(auth(moderator.token))
        .send({ dateOfBirth: dobForAge(9), reason: REASON })
        .expect(409);

      const userAfter = (await getTestPrismaClient().user.findUnique({ where: { id: u.userId } }))!;
      expect(userAfter.dateOfBirth).toBe(userBefore.dateOfBirth);
      expect(userAfter.isUnder16).toBe(userBefore.isUnder16);
      expect(await guardianOf(u.userId)).toEqual(guardianBefore);
      expect(await auditFor(u.userId, 'user.dob_corrected')).toHaveLength(0);
    });

    it('re-runs the card-verification policy against the DERIVED country', async () => {
      const moderator = await createAdmin('mod-c6', 'moderator');
      const u = await createUser('c6', 15, { derivedCountry: 'US' });
      await request(server())
        .post(`/admin/users/${u.userId}/dob-correction`)
        .set(auth(moderator.token))
        .send({ dateOfBirth: dobForAge(9), reason: REASON })
        .expect(200);
      expect((await guardianOf(u.userId))!.cardVerificationRequired).toBe(true);
    });

    it('rejects a future date and a missing reason with 400, before touching anything', async () => {
      const moderator = await createAdmin('mod-c7', 'moderator');
      const u = await createUser('c7', 12);
      const future = new Date(Date.now() + 30 * DAY).toISOString().slice(0, 10);
      await request(server())
        .post(`/admin/users/${u.userId}/dob-correction`)
        .set(auth(moderator.token))
        .send({ dateOfBirth: future, reason: REASON })
        .expect(400);
      await request(server())
        .post(`/admin/users/${u.userId}/dob-correction`)
        .set(auth(moderator.token))
        .send({ dateOfBirth: dobForAge(15) })
        .expect(400);
      expect(await auditFor(u.userId, 'user.dob_corrected')).toHaveLength(0);
    });

    it('409s for an anonymized account', async () => {
      const moderator = await createAdmin('mod-c8', 'moderator');
      const prisma = getTestPrismaClient();
      const u = await createUser('c8', 30, { guardian: null });
      await prisma.user.update({ where: { id: u.userId }, data: { accountStatus: 'deleted', dateOfBirth: null } });
      await request(server())
        .post(`/admin/users/${u.userId}/dob-correction`)
        .set(auth(moderator.token))
        .send({ dateOfBirth: dobForAge(20), reason: REASON })
        .expect(409);
    });
  });
});
