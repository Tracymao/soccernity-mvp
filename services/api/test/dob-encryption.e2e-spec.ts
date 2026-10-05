import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { decryptDob, parseDobKey } from '../src/crypto/dob-crypto';
import { runBackfill } from '../src/scripts/backfill-dob-encryption';
import { AgeReclassificationSweepService } from '../src/modules/age-reclassification/age-reclassification-sweep.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { seedDob } from './dob-seed';

// security/dob-field-encryption, against real Postgres. The assertions that
// matter read the column with RAW SQL (bypassing Prisma entirely) so they
// prove what is physically stored, not what the application layer returns.
describe('DOB encryption e2e', () => {
  let app: INestApplication;
  const key = () => parseDobKey(process.env.DOB_ENCRYPTION_KEY);

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

  async function rawDob(email: string): Promise<string | null> {
    const rows = await getTestPrismaClient().$queryRaw<{ dateOfBirth: string | null }[]>`
      SELECT "dateOfBirth" FROM "User" WHERE "email" = ${email}`;
    return rows[0].dateOfBirth;
  }

  it('registration stores NO plaintext DOB (raw SQL) and the API still returns the real DOB', async () => {
    const email = `dob-enc-${Date.now()}@example.com`;
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'a-real-password-123', displayName: 'Enc Test', dateOfBirth: '1990-06-15' })
      .expect(201);

    const stored = await rawDob(email);
    expect(stored).toMatch(/^v1:/);
    expect(stored).not.toContain('1990');
    expect(stored).not.toContain('06-15');
    expect(decryptDob(stored!, key()).toISOString()).toBe('1990-06-15T00:00:00.000Z');

    // Register response, own-profile read and login all decrypt transparently.
    expect(new Date(res.body.user.dateOfBirth).toISOString()).toBe('1990-06-15T00:00:00.000Z');
    const profile = await request(app.getHttpServer())
      .get(`/users/${res.body.user.id}`)
      .set('Authorization', `Bearer ${res.body.accessToken}`)
      .expect(200);
    expect(new Date(profile.body.dateOfBirth).toISOString()).toBe('1990-06-15T00:00:00.000Z');
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'a-real-password-123' })
      .expect(200);
    expect(new Date(login.body.user.dateOfBirth).toISOString()).toBe('1990-06-15T00:00:00.000Z');
  });

  it('a minor registers: classification + guardian record still correct with the encrypted DOB', async () => {
    const email = `dob-minor-${Date.now()}@example.com`;
    const y = new Date().getFullYear() - 12;
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email,
        password: 'a-real-password-123',
        displayName: 'Minor Enc',
        dateOfBirth: `${y}-01-01`,
        guardian: { name: 'G', email: `g-${Date.now()}@example.com`, relationship: 'Parent' },
        countryCode: 'GB',
      })
      .expect(201);
    expect(res.body.user.isMinor).toBe(true);
    expect(res.body.guardian).toBeTruthy();
    expect(await rawDob(email)).toMatch(/^v1:/);
  });

  it('age sweep reads the encrypted DOB correctly (turns 18 -> isMinor false)', async () => {
    const prisma = getTestPrismaClient();
    const d = new Date();
    d.setFullYear(d.getFullYear() - 18);
    d.setDate(d.getDate() - 3);
    const email = `dob-sweep-${Date.now()}@example.com`;
    await prisma.user.create({
      data: { email, passwordHash: 'x', displayName: 'S', dateOfBirth: seedDob(d), isMinor: true, isUnder16: false },
    });
    const result = await app.get(AgeReclassificationSweepService).sweepReclassifications();
    expect(result.reclassifiedUserIds).toHaveLength(1);
    expect((await prisma.user.findUnique({ where: { email } }))!.isMinor).toBe(false);
  });

  it('backfill encrypts legacy plaintext rows, is idempotent, and rolls back', async () => {
    const prisma = getTestPrismaClient();
    // Legacy plaintext, as left by the column-type migration.
    await prisma.user.create({
      data: { email: 'legacy1@example.com', passwordHash: 'x', displayName: 'L1', dateOfBirth: '1985-02-03T00:00:00.000Z' },
    });
    await prisma.user.create({
      data: { email: 'legacy2@example.com', passwordHash: 'x', displayName: 'L2', dateOfBirth: '2001-12-31T00:00:00.000Z' },
    });
    await prisma.user.create({ data: { email: 'nodob@example.com', passwordHash: 'x', displayName: 'N' } });

    const first = await runBackfill(prisma, key());
    expect(first.changed).toBe(2);
    for (const e of ['legacy1@example.com', 'legacy2@example.com']) {
      const v = (await rawDob(e))!;
      expect(v).toMatch(/^v1:/);
      expect(v).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    }
    expect(decryptDob((await rawDob('legacy1@example.com'))!, key()).toISOString()).toBe('1985-02-03T00:00:00.000Z');

    const before = await rawDob('legacy1@example.com');
    const second = await runBackfill(prisma, key());
    expect(second.changed).toBe(0); // idempotent
    expect(await rawDob('legacy1@example.com')).toBe(before); // not re-encrypted
    expect(await rawDob('nodob@example.com')).toBeNull();

    const rb = await runBackfill(prisma, key(), true);
    expect(rb.changed).toBe(2);
    expect(await rawDob('legacy1@example.com')).toBe('1985-02-03T00:00:00.000Z');
    expect((await runBackfill(prisma, key(), true)).changed).toBe(0);
  });
});
