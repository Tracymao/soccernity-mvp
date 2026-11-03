import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as fs from 'fs';
import * as path from 'path';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AdminTokenService } from '../src/modules/admin/token/admin-token.service';
import { TokenService } from '../src/modules/auth/token/token.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { seedDob } from './dob-seed';

// backend/b284-report-reason-categories (Decision Log #465, B-284). Real Postgres: the new nullable
// Report.reasonCategory column, both submission routes, the admin readers, the admin search matcher, the report
// raised from a contact enquiry (no category), and the migration replayed over a database that already holds reports.
describe('Report reason category e2e', () => {
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
  const prisma = () => getTestPrismaClient();
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function createUser(label: string): Promise<{ userId: string; accessToken: string }> {
    const user = await prisma().user.create({
      data: {
        email: `e2e-rrc-${label}-${Date.now()}-${rand()}@example.com`,
        passwordHash: 'unused',
        displayName: `E2E RRC ${label}`,
        dateOfBirth: seedDob('1994-05-05'),
        isMinor: false,
      },
    });
    const { accessToken } = await app.get(TokenService).issueTokenPair(user.id, user.role);
    return { userId: user.id, accessToken: accessToken.token };
  }

  async function createAdmin(label: string, role = 'moderator'): Promise<{ adminId: string; accessToken: string }> {
    const admin = await prisma().adminUser.create({
      data: {
        email: `e2e-rrc-admin-${label}-${Date.now()}-${rand()}@example.com`,
        passwordHash: 'unused',
        fullName: `E2E RRC Admin ${label}`,
        role,
        childSafetyVetted: true,
      },
    });
    const { accessToken } = await app.get(AdminTokenService).issueTokenPair(admin.id, admin.role);
    return { adminId: admin.id, accessToken: accessToken.token };
  }

  async function seedPost(authorId: string): Promise<string> {
    const post = await prisma().post.create({ data: { authorId, contentText: `post ${rand()}`, mediaUrls: [] } });
    return post.id;
  }

  describe('POST /reports', () => {
    it('stores the category and the description, and reads both back from Postgres', async () => {
      const reporter = await createUser('reporter');
      const postId = await seedPost((await createUser('author')).userId);

      const res = await request(server())
        .post('/reports')
        .set(auth(reporter.accessToken))
        .send({ targetType: 'post', targetId: postId, reasonCategory: 'spam_or_scam', reason: 'link farm' })
        .expect(201);

      expect(res.body).toMatchObject({ reasonCategory: 'spam_or_scam', reason: 'link farm', severity: 'medium', concernsMinor: false });
      const row = await prisma().report.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(row.reasonCategory).toBe('spam_or_scam');
      expect(row.reason).toBe('link farm');
    });

    it('accepts a non-other category with no description and stores the empty string (never null)', async () => {
      const reporter = await createUser('reporter-nodesc');
      const postId = await seedPost((await createUser('author-nodesc')).userId);

      const res = await request(server())
        .post('/reports')
        .set(auth(reporter.accessToken))
        .send({ targetType: 'post', targetId: postId, reasonCategory: 'harassment_or_bullying' })
        .expect(201);

      const row = await prisma().report.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(row.reason).toBe('');
      expect(row.reasonCategory).toBe('harassment_or_bullying');
    });

    it("'other' needs a description: absent or blank is the coded 400 and creates nothing; with one it is accepted", async () => {
      const reporter = await createUser('reporter-other');
      const postId = await seedPost((await createUser('author-other')).userId);

      const absent = await request(server())
        .post('/reports')
        .set(auth(reporter.accessToken))
        .send({ targetType: 'post', targetId: postId, reasonCategory: 'other' })
        .expect(400);
      expect(absent.body.code).toBe('report_reason_required');
      const blank = await request(server())
        .post('/reports')
        .set(auth(reporter.accessToken))
        .send({ targetType: 'post', targetId: postId, reasonCategory: 'other', reason: '   ' })
        .expect(400);
      expect(blank.body.code).toBe('report_reason_required');
      expect(await prisma().report.count()).toBe(0);

      await request(server())
        .post('/reports')
        .set(auth(reporter.accessToken))
        .send({ targetType: 'post', targetId: postId, reasonCategory: 'other', reason: 'something else' })
        .expect(201);
      expect(await prisma().report.count()).toBe(1);
    });

    it('rejects a missing and an unknown category and creates nothing', async () => {
      const reporter = await createUser('reporter-bad');
      const postId = await seedPost((await createUser('author-bad')).userId);

      await request(server()).post('/reports').set(auth(reporter.accessToken)).send({ targetType: 'post', targetId: postId, reason: 'x' }).expect(400);
      await request(server())
        .post('/reports')
        .set(auth(reporter.accessToken))
        .send({ targetType: 'post', targetId: postId, reasonCategory: 'rudeness', reason: 'x' })
        .expect(400);
      expect(await prisma().report.count()).toBe(0);
    });

    it('a category sets neither concernsMinor nor severity (child_safety_concern included)', async () => {
      const reporter = await createUser('reporter-csc');
      const postId = await seedPost((await createUser('author-csc')).userId);
      const res = await request(server())
        .post('/reports')
        .set(auth(reporter.accessToken))
        .send({ targetType: 'post', targetId: postId, reasonCategory: 'child_safety_concern' })
        .expect(201);
      const row = await prisma().report.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(row).toMatchObject({ concernsMinor: false, severity: 'medium' });
    });
  });

  describe('POST /reports/public', () => {
    it('stores the category and requires it; the description is optional except for other', async () => {
      const postId = await seedPost((await createUser('author-public')).userId);
      const base = { reporterContactEmail: 'parent@example.com', targetType: 'post', targetId: postId, concernsMinor: true };

      await request(server()).post('/reports/public').send({ ...base, reason: 'x' }).expect(400);
      const noDesc = await request(server())
        .post('/reports/public')
        .send({ ...base, reasonCategory: 'privacy_or_image_misuse' })
        .expect(201);
      const row = await prisma().report.findUniqueOrThrow({ where: { id: noDesc.body.id } });
      expect(row).toMatchObject({ reasonCategory: 'privacy_or_image_misuse', reason: '', concernsMinor: true, reporterId: null });

      const other = await request(server()).post('/reports/public').send({ ...base, reasonCategory: 'other' }).expect(400);
      expect(other.body.code).toBe('report_reason_required');
      await request(server()).post('/reports/public').send({ ...base, reasonCategory: 'other', reason: 'details' }).expect(201);
    });
  });

  describe('the admin readers and search', () => {
    it('list, detail and the action response carry reasonCategory (null for a report that was never categorised)', async () => {
      const reporter = await createUser('reporter-read');
      const postId = await seedPost((await createUser('author-read')).userId);
      const admin = await createAdmin('reader');
      const categorised = await request(server())
        .post('/reports')
        .set(auth(reporter.accessToken))
        .send({ targetType: 'post', targetId: postId, reasonCategory: 'threats_or_violence', reason: 'he threatened me' })
        .expect(201);
      // A report made before the column existed: created straight in the table, as an old row would be.
      const legacy = await prisma().report.create({
        data: { reporterId: reporter.userId, targetType: 'post', targetId: postId, reason: 'old free text' },
      });

      const list = await request(server()).get('/admin/moderation/reports').set(auth(admin.accessToken)).expect(200);
      const byId = new Map<string, { reasonCategory: string | null; reason: string }>(
        list.body.items.map((r: { id: string; reasonCategory: string | null; reason: string }) => [r.id, r]),
      );
      expect(byId.get(categorised.body.id)).toMatchObject({ reasonCategory: 'threats_or_violence', reason: 'he threatened me' });
      expect(byId.get(legacy.id)).toMatchObject({ reasonCategory: null, reason: 'old free text' });

      const detail = await request(server()).get(`/admin/moderation/reports/${categorised.body.id}`).set(auth(admin.accessToken)).expect(200);
      expect(detail.body).toMatchObject({ reasonCategory: 'threats_or_violence', reason: 'he threatened me' });

      const actioned = await request(server())
        .patch(`/admin/moderation/reports/${categorised.body.id}`)
        .set(auth(admin.accessToken))
        .send({ action: 'dismissed' })
        .expect(200);
      expect(actioned.body.reasonCategory).toBe('threats_or_violence');
    });

    it('admin search finds a report by the label prefix (case-insensitive), shows the category, and never returns the description', async () => {
      const reporter = await createUser('reporter-search');
      const postId = await seedPost((await createUser('author-search')).userId);
      const admin = await createAdmin('searcher');
      await request(server())
        .post('/reports')
        .set(auth(reporter.accessToken))
        .send({ targetType: 'post', targetId: postId, reasonCategory: 'harassment_or_bullying', reason: 'UNIQUE-DESCRIPTION-TEXT' })
        .expect(201);
      await request(server())
        .post('/reports')
        .set(auth(reporter.accessToken))
        .send({ targetType: 'post', targetId: postId, reasonCategory: 'spam_or_scam' })
        .expect(201);

      const hit = await request(server()).get('/admin/search').query({ q: 'HARASS' }).set(auth(admin.accessToken)).expect(200);
      expect(hit.body.groups.reports.items).toHaveLength(1);
      expect(hit.body.groups.reports.items[0]).toMatchObject({ reasonCategory: 'harassment_or_bullying', matchedOn: 'reason_category' });
      expect(JSON.stringify(hit.body)).not.toContain('UNIQUE-DESCRIPTION-TEXT');
      expect(Object.keys(hit.body.groups.reports.items[0])).not.toContain('reason');

      // The description text is never searched: a query equal to it finds nothing.
      const byDescription = await request(server()).get('/admin/search').query({ q: 'UNIQUE-DESCRIPTION-TEXT' }).set(auth(admin.accessToken)).expect(200);
      expect(byDescription.body.groups.reports.items).toHaveLength(0);

      // A phrase with spaces finds its category; a word from the middle of a label does not.
      const phrase = await request(server()).get('/admin/search').query({ q: 'spam or' }).set(auth(admin.accessToken)).expect(200);
      expect(phrase.body.groups.reports.items.map((r: { reasonCategory: string }) => r.reasonCategory)).toEqual(['spam_or_scam']);
      const middle = await request(server()).get('/admin/search').query({ q: 'bullying' }).set(auth(admin.accessToken)).expect(200);
      expect(middle.body.groups.reports.items).toHaveLength(0);
    });

    it('a report raised by escalating a contact enquiry carries no category', async () => {
      const admin = await createAdmin('escalator');
      const enquiry = await prisma().contactEnquiry.create({
        data: { name: 'Sender', email: 'sender@example.com', category: 'enquiries', subject: 'Hello there', message: 'A message' },
      });
      const res = await request(server())
        .post(`/admin/contact-enquiries/${enquiry.id}/escalate`)
        .set(auth(admin.accessToken))
        .send({ severity: 'high', concernsMinor: false, reason: 'This needs a safeguarding review.' })
        .expect(201);
      const reportId = res.body.report.id as string;
      const row = await prisma().report.findUniqueOrThrow({ where: { id: reportId } });
      expect(row.targetType).toBe('enquiry');
      expect(row.reasonCategory).toBeNull();
    });
  });

  describe('the migration', () => {
    it('20261109090000 adds the column to a database that already holds reports, leaving them NULL (rolled back afterwards)', async () => {
      const sql = fs
        .readFileSync(path.join(__dirname, '../prisma/migrations/20261109090000_add_report_reason_category/migration.sql'), 'utf8')
        .split(String.fromCharCode(10))
        .filter((l) => !l.trim().startsWith('--'))
        .join(' ');
      const statements = sql.split(';').map((x) => x.trim()).filter(Boolean);
      expect(statements.length).toBeGreaterThan(0);
      const reporter = await createUser('reporter-migration');
      const postId = await seedPost((await createUser('author-migration')).userId);
      const rollback = new Error('rollback');
      const seen: { before: number; after: Array<{ id: string; reasonCategory: string | null }> } = { before: 0, after: [] };
      await prisma()
        .$transaction(async (tx) => {
          // Put the table back to its pre-migration shape, seed reports the way they existed then, replay the migration.
          await tx.$executeRawUnsafe('ALTER TABLE "Report" DROP COLUMN "reasonCategory"');
          for (const id of ['mig-old-1', 'mig-old-2']) {
            await tx.$executeRawUnsafe(
              `INSERT INTO "Report" ("id","reporterId","targetType","targetId","reason") VALUES ('${id}','${reporter.userId}','post','${postId}','old free text')`,
            );
          }
          seen.before = await tx.report.count();
          for (const statement of statements) await tx.$executeRawUnsafe(statement);
          seen.after = await tx.report.findMany({
            where: { id: { in: ['mig-old-1', 'mig-old-2'] } },
            select: { id: true, reasonCategory: true },
            orderBy: { id: 'asc' },
          });
          // The new column accepts a value afterwards.
          await tx.report.update({ where: { id: 'mig-old-1' }, data: { reasonCategory: 'other' } });
          throw rollback;
        })
        .catch((e) => {
          if (e !== rollback) throw e;
        });
      expect(seen.before).toBe(2);
      expect(seen.after).toEqual([
        { id: 'mig-old-1', reasonCategory: null },
        { id: 'mig-old-2', reasonCategory: null },
      ]);
      // Rolled back: the column exists again for the rest of the suite.
      const cols = await prisma().$queryRawUnsafe<Array<{ column_name: string }>>(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'Report' AND column_name = 'reasonCategory'`,
      );
      expect(cols).toHaveLength(1);
    });
  });
});
