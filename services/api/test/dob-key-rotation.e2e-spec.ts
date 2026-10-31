import { randomBytes } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DobKeyRing, decryptDobString, encryptDobString, parseDobKey } from '../src/crypto/dob-crypto';
import { TokenService } from '../src/modules/auth/token/token.service';
import { RotationColumn, prismaRotationColumns, rotateDobKey, formatReport } from '../src/scripts/rotate-dob-encryption-key';
import { runBackfill } from '../src/scripts/backfill-dob-encryption';
import { generateTotpCode } from '../src/modules/two-factor/totp.util';
import { DobEncryptionService } from '../src/crypto/dob-encryption.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';

// ---------------------------------------------------------------------------------------------------------------
// DOB_ENCRYPTION_KEY rotation (docs/dob-encryption-rollback.md), against REAL Postgres. Every assertion that matters
// reads the columns with RAW SQL, so it proves what is physically stored, not what Prisma hands back.
//
// OLD = the e2e DOB key already in the environment (version 1). NEW = a fresh key (version 2).
//
// Proven here that a mock cannot show:
//   - all THREE columns (User.dateOfBirth, User.totpSecretEncrypted, AdminUser.totpSecretEncrypted) go v1 -> v2 and
//     decrypt to the same plaintext, and a TOTP code still validates against the rotated secret
//   - a mid-rotation mix of v1 and v2 reads correctly THROUGH THE REAL APP (previous key configured), and after the
//     previous key is removed the rotated data still reads
//   - a re-run changes nothing (byte-identical rows); a dry run writes nothing
//   - with the previous key missing, or wrong, the script writes NOTHING, not even the readable rows
//   - a value the application changed between the script's read and its write is skipped, not overwritten
//   - the pre-deploy backfill leaves v2 values alone, in Postgres
// ---------------------------------------------------------------------------------------------------------------

jest.setTimeout(180_000);

const OLD = parseDobKey(process.env.DOB_ENCRYPTION_KEY);
const NEW = randomBytes(32);
const V1: DobKeyRing = { current: { version: 1, key: OLD } };
const ROTATING: DobKeyRing = { current: { version: 2, key: NEW }, previous: { version: 1, key: OLD } };
const NO_PREVIOUS: DobKeyRing = { current: { version: 2, key: NEW } };
const WRONG_PREVIOUS: DobKeyRing = { current: { version: 2, key: NEW }, previous: { version: 1, key: randomBytes(32) } };

const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const OTHER_SECRET = 'KRSXG5CTMVRXEZLUKRSXG5CTMVRXEZLU';
const DOB_A = '2010-03-14T00:00:00.000Z';
const DOB_B = '1999-01-02T00:00:00.000Z';

const prisma = () => getTestPrismaClient();

async function rawUser(id: string) {
  const rows = await prisma().$queryRaw<{ dateOfBirth: string | null; totpSecretEncrypted: string | null }[]>`
    SELECT "dateOfBirth", "totpSecretEncrypted" FROM "User" WHERE "id" = ${id}`;
  return rows[0];
}
async function rawAdminSecret(id: string): Promise<string | null> {
  const rows = await prisma().$queryRaw<{ totpSecretEncrypted: string | null }[]>`
    SELECT "totpSecretEncrypted" FROM "AdminUser" WHERE "id" = ${id}`;
  return rows[0].totpSecretEncrypted;
}
async function snapshotAll(): Promise<string> {
  const users = await prisma().$queryRaw<unknown[]>`SELECT "id", "dateOfBirth", "totpSecretEncrypted" FROM "User" ORDER BY "id"`;
  const admins = await prisma().$queryRaw<unknown[]>`SELECT "id", "totpSecretEncrypted" FROM "AdminUser" ORDER BY "id"`;
  return JSON.stringify([users, admins]);
}

async function seedUser(email: string, fields: { dob?: string; secret?: string; ring?: DobKeyRing }) {
  const ring = fields.ring ?? V1;
  return prisma().user.create({
    data: {
      email,
      passwordHash: 'x',
      displayName: email.split('@')[0],
      ...(fields.dob ? { dateOfBirth: encryptDobString(fields.dob, ring) } : {}),
      ...(fields.secret ? { totpSecretEncrypted: encryptDobString(fields.secret, ring), totpEnabledAt: new Date() } : {}),
    },
  });
}
async function seedAdmin(email: string, secret: string, ring: DobKeyRing = V1) {
  return prisma().adminUser.create({
    data: {
      email,
      passwordHash: 'x',
      fullName: 'Admin',
      role: 'editor',
      totpSecretEncrypted: encryptDobString(secret, ring),
      totpEnabledAt: new Date(),
    },
  });
}

describe('DOB_ENCRYPTION_KEY rotation e2e', () => {
  beforeEach(async () => {
    await resetDatabase();
  });
  afterAll(async () => {
    await disconnectTestPrismaClient();
  });

  describe('the script against Postgres', () => {
    it('rotates all three columns v1 -> v2; every value decrypts to the same plaintext; a TOTP code still validates; a re-run changes nothing', async () => {
      const a = await seedUser('a@example.com', { dob: DOB_A, secret: SECRET });
      const b = await seedUser('b@example.com', { dob: DOB_B });
      const c = await seedUser('c@example.com', { dob: '2001-05-05T00:00:00.000Z', ring: ROTATING }); // already v2
      const admin = await seedAdmin('admin@example.com', OTHER_SECRET);
      await prisma().user.create({ data: { email: 'nodob@example.com', passwordHash: 'x', displayName: 'N' } }); // all null: ignored

      const report = await rotateDobKey(prismaRotationColumns(prisma()), ROTATING);

      expect(report.ok).toBe(true);
      expect(report.blocked).toBe(false);
      expect(report.rewritten).toBe(4); // a.dob, a.secret, b.dob, admin.secret
      expect(report.skippedConcurrent).toBe(0);

      const ra = await rawUser(a.id);
      expect(ra.dateOfBirth).toMatch(/^v2:/);
      expect(ra.totpSecretEncrypted).toMatch(/^v2:/);
      expect(decryptDobString(ra.dateOfBirth as string, NO_PREVIOUS)).toBe(DOB_A); // readable with the NEW key alone
      expect(decryptDobString(ra.totpSecretEncrypted as string, NO_PREVIOUS)).toBe(SECRET);
      expect(decryptDobString((await rawUser(b.id)).dateOfBirth as string, NO_PREVIOUS)).toBe(DOB_B);
      expect(decryptDobString((await rawUser(c.id)).dateOfBirth as string, NO_PREVIOUS)).toBe('2001-05-05T00:00:00.000Z');
      const adminRaw = (await rawAdminSecret(admin.id)) as string;
      expect(adminRaw).toMatch(/^v2:/);
      expect(decryptDobString(adminRaw, NO_PREVIOUS)).toBe(OTHER_SECRET);
      // No plaintext anywhere.
      expect(ra.dateOfBirth).not.toContain('2010');
      expect(ra.totpSecretEncrypted).not.toContain(SECRET);

      // The rotated secret is still a working authenticator secret.
      const now = Date.now();
      const code = generateTotpCode(decryptDobString(ra.totpSecretEncrypted as string, NO_PREVIOUS), now);
      expect(code).toMatch(/^\d{6}$/);
      expect(code).toBe(generateTotpCode(SECRET, now));

      // Re-run: byte-identical rows, nothing rewritten.
      const before = await snapshotAll();
      const again = await rotateDobKey(prismaRotationColumns(prisma()), ROTATING);
      expect(again.ok).toBe(true);
      expect(again.rewritten).toBe(0);
      expect(await snapshotAll()).toBe(before);
    });

    it('--dry-run reports the counts per column per version and writes nothing', async () => {
      await seedUser('a@example.com', { dob: DOB_A, secret: SECRET });
      await seedUser('c@example.com', { dob: DOB_B, ring: ROTATING });
      await seedAdmin('admin@example.com', OTHER_SECRET);
      const before = await snapshotAll();

      const report = await rotateDobKey(prismaRotationColumns(prisma()), ROTATING, { dryRun: true });

      expect(report.ok).toBe(true);
      expect(report.rewritten).toBe(0);
      expect(await snapshotAll()).toBe(before);
      const by = Object.fromEntries(report.before.map((c) => [c.label, c.byVersion]));
      expect(by['User.dateOfBirth']).toEqual({ 1: 1, 2: 1 });
      expect(by['User.totpSecretEncrypted']).toEqual({ 1: 1 });
      expect(by['AdminUser.totpSecretEncrypted']).toEqual({ 1: 1 });
      expect(formatReport(report).join('\n')).toContain('Dry run: 3 value(s) would be re-encrypted. Nothing was written.');
    });

    it('with the previous key MISSING it is blocked and writes nothing, not even the readable rows', async () => {
      await seedUser('a@example.com', { dob: DOB_A, secret: SECRET });
      await seedUser('c@example.com', { dob: DOB_B, ring: ROTATING }); // v2: readable
      await seedAdmin('admin@example.com', OTHER_SECRET);
      const before = await snapshotAll();

      const report = await rotateDobKey(prismaRotationColumns(prisma()), NO_PREVIOUS);

      expect(report.blocked).toBe(true);
      expect(report.ok).toBe(false); // the command exits non-zero on !ok
      expect(report.rewritten).toBe(0);
      expect(await snapshotAll()).toBe(before);
      expect(formatReport(report).join('\n')).toContain('BLOCKED');
    });

    it('with the WRONG previous key (right shape, wrong bytes) it is blocked and writes nothing', async () => {
      await seedUser('a@example.com', { dob: DOB_A });
      const before = await snapshotAll();
      const report = await rotateDobKey(prismaRotationColumns(prisma()), WRONG_PREVIOUS);
      expect(report.blocked).toBe(true);
      expect(report.before[0].undecryptable).toBe(1);
      expect(await snapshotAll()).toBe(before);
    });

    it('a leftover plaintext date of birth blocks the rotation with no writes', async () => {
      await seedUser('a@example.com', { dob: DOB_A });
      await prisma().user.create({ data: { email: 'plain@example.com', passwordHash: 'x', displayName: 'P', dateOfBirth: DOB_B } });
      const before = await snapshotAll();
      const report = await rotateDobKey(prismaRotationColumns(prisma()), ROTATING);
      expect(report.blocked).toBe(true);
      expect(report.before[0].unrecognised).toBe(1);
      expect(await snapshotAll()).toBe(before);
    });

    it('a value the application changes between the script\'s read and its write is skipped, never overwritten', async () => {
      const u = await seedUser('a@example.com', { dob: DOB_A });
      const appWrote = encryptDobString('2020-02-02T00:00:00.000Z', ROTATING); // written by the app with the current key
      const columns: RotationColumn[] = prismaRotationColumns(prisma()).map((col) => ({
        ...col,
        replace: async (id, expected, next) => {
          if (col.label === 'User.dateOfBirth') {
            await prisma().$executeRaw`UPDATE "User" SET "dateOfBirth" = ${appWrote} WHERE "id" = ${id}`;
          }
          return col.replace(id, expected, next);
        },
      }));

      const report = await rotateDobKey(columns, ROTATING);

      expect(report.skippedConcurrent).toBe(1);
      expect((await rawUser(u.id)).dateOfBirth).toBe(appWrote);
      expect(report.ok).toBe(true); // the app's value is already at the current version
    });

    it('works across many batches (batch size 2, 7 rows)', async () => {
      for (let i = 0; i < 7; i++) await seedUser(`u${i}@example.com`, { dob: DOB_A });
      const report = await rotateDobKey(prismaRotationColumns(prisma()), ROTATING, { batchSize: 2 });
      expect(report.ok).toBe(true);
      expect(report.rewritten).toBe(7);
      const rows = await prisma().$queryRaw<{ dateOfBirth: string }[]>`SELECT "dateOfBirth" FROM "User"`;
      expect(rows.every((r) => r.dateOfBirth.startsWith('v2:'))).toBe(true);
    });

    it('the pre-deploy backfill leaves v2 (and v1) values untouched, and encrypts stray plaintext with the CURRENT key', async () => {
      const v1 = await seedUser('v1@example.com', { dob: DOB_A });
      const v2 = await seedUser('v2@example.com', { dob: DOB_B, ring: ROTATING });
      const plain = await prisma().user.create({ data: { email: 'plain@example.com', passwordHash: 'x', displayName: 'P', dateOfBirth: '1985-02-03T00:00:00.000Z' } });
      const beforeV1 = (await rawUser(v1.id)).dateOfBirth;
      const beforeV2 = (await rawUser(v2.id)).dateOfBirth;

      const result = await runBackfill(prisma(), ROTATING);

      expect(result).toEqual({ scanned: 3, changed: 1, unreadable: 0 });
      expect((await rawUser(v1.id)).dateOfBirth).toBe(beforeV1);
      expect((await rawUser(v2.id)).dateOfBirth).toBe(beforeV2); // not encrypted a second time
      const stored = (await rawUser(plain.id)).dateOfBirth as string;
      expect(stored).toMatch(/^v2:/);
      expect(decryptDobString(stored, NO_PREVIOUS)).toBe('1985-02-03T00:00:00.000Z');
      expect((await runBackfill(prisma(), ROTATING)).changed).toBe(0);
    });
  });

  describe('through the real app, mid-rotation and after', () => {
    const KEYS = ['DOB_ENCRYPTION_KEY', 'DOB_ENCRYPTION_KEY_VERSION', 'DOB_ENCRYPTION_KEY_PREVIOUS'] as const;
    const saved: Record<string, string | undefined> = {};
    const apps: INestApplication[] = [];

    async function bootApp(env: Partial<Record<(typeof KEYS)[number], string | undefined>>): Promise<INestApplication> {
      for (const k of KEYS) {
        if (env[k] === undefined) delete process.env[k];
        else process.env[k] = env[k];
      }
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
      const app = moduleRef.createNestApplication();
      app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
      await app.init();
      apps.push(app);
      return app;
    }

    beforeAll(() => {
      for (const k of KEYS) saved[k] = process.env[k];
    });
    // Each app opens its own Prisma pool (about 2 x CPU-count connections); closing it after every test keeps the
    // whole file well under Postgres's connection limit even on a busy machine.
    afterEach(async () => {
      while (apps.length > 0) await (apps.pop() as INestApplication).close();
    });
    afterAll(async () => {
      for (const k of KEYS) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    });

    it('reads v1 AND v2 values mid-rotation, writes v2, and after the previous key is removed the rotated data still reads', async () => {
      const oldVersionUser = await seedUser('old@example.com', { dob: DOB_A, secret: SECRET }); // v1, made by OLD
      const newVersionUser = await seedUser('new@example.com', { dob: DOB_B, ring: ROTATING }); // v2, made by NEW

      // 1. Mid-rotation: NEW is current (v2), OLD is the previous key.
      const during = await bootApp({
        DOB_ENCRYPTION_KEY: NEW.toString('base64'),
        DOB_ENCRYPTION_KEY_VERSION: '2',
        DOB_ENCRYPTION_KEY_PREVIOUS: OLD.toString('base64'),
      });
      const tokens = during.get(TokenService);
      const asUser = async (id: string) => `Bearer ${(await tokens.issueTokenPair(id, 'user')).accessToken.token}`;

      const profileOld = await request(during.getHttpServer()).get(`/users/${oldVersionUser.id}`).set('Authorization', await asUser(oldVersionUser.id)).expect(200);
      expect(new Date(profileOld.body.dateOfBirth).toISOString()).toBe(DOB_A);
      const profileNew = await request(during.getHttpServer()).get(`/users/${newVersionUser.id}`).set('Authorization', await asUser(newVersionUser.id)).expect(200);
      expect(new Date(profileNew.body.dateOfBirth).toISOString()).toBe(DOB_B);

      // A fresh registration is written under the NEW key.
      const email = `fresh-${Date.now()}@example.com`;
      const reg = await request(during.getHttpServer())
        .post('/auth/register')
        .send({ countryCode: 'GB', email, password: 'a-real-password-123', displayName: 'Fresh', dateOfBirth: '1990-06-15' })
        .expect(201);
      const freshRaw = (await prisma().$queryRaw<{ dateOfBirth: string }[]>`SELECT "dateOfBirth" FROM "User" WHERE "email" = ${email}`)[0].dateOfBirth;
      expect(freshRaw).toMatch(/^v2:/);
      expect(new Date(reg.body.user.dateOfBirth).toISOString()).toBe('1990-06-15T00:00:00.000Z');

      // The service decrypts a v1 two-factor secret mid-rotation.
      const dobService = during.get(DobEncryptionService);
      expect(dobService.decryptString((await rawUser(oldVersionUser.id)).totpSecretEncrypted as string)).toBe(SECRET);

      // 2. Run the script (the previous key is still configured).
      const report = await rotateDobKey(prismaRotationColumns(prisma()), ROTATING);
      expect(report.ok).toBe(true);

      // 3. Previous key REMOVED: a new app with only the NEW key still reads everything, including the rotated rows.
      const after = await bootApp({ DOB_ENCRYPTION_KEY: NEW.toString('base64'), DOB_ENCRYPTION_KEY_VERSION: '2' });
      const afterTokens = after.get(TokenService);
      const bearerAfter = async (id: string) => `Bearer ${(await afterTokens.issueTokenPair(id, 'user')).accessToken.token}`;
      const reread = await request(after.getHttpServer()).get(`/users/${oldVersionUser.id}`).set('Authorization', await bearerAfter(oldVersionUser.id)).expect(200);
      expect(new Date(reread.body.dateOfBirth).toISOString()).toBe(DOB_A);
      expect(after.get(DobEncryptionService).decryptString((await rawUser(oldVersionUser.id)).totpSecretEncrypted as string)).toBe(SECRET);
    });

    it('if the previous key is removed BEFORE the script has run, the old value fails loudly (a 500 on that read, not a wrong date)', async () => {
      const u = await seedUser('old@example.com', { dob: DOB_A });
      const app = await bootApp({ DOB_ENCRYPTION_KEY: NEW.toString('base64'), DOB_ENCRYPTION_KEY_VERSION: '2' });
      const token = (await app.get(TokenService).issueTokenPair(u.id, 'user')).accessToken.token;
      const res = await request(app.getHttpServer()).get(`/users/${u.id}`).set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(500);
      expect(JSON.stringify(res.body)).not.toContain('2010');
    });
  });
});
