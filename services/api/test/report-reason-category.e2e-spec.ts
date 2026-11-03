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

  // POST /reports/public carries the shared @AuthRateLimit() (5 per 60 s per IP by default). This file makes more
  // public submissions than that (Decision Log #466 tests every flag/category combination), so the limit is raised
  // for this file only; the module reads it when the app is built. Restored in afterAll.
  const previousAuthRateLimit = process.env.AUTH_RATE_LIMIT_MAX;

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_MAX = '1000';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    if (previousAuthRateLimit === undefined) delete process.env.AUTH_RATE_LIMIT_MAX;
    else process.env.AUTH_RATE_LIMIT_MAX = previousAuthRateLimit;
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

  async function createAdmin(label: string, role = 'moderator', childSafetyVetted = true): Promise<{ adminId: string; accessToken: string }> {
    const admin = await prisma().adminUser.create({
      data: {
        email: `e2e-rrc-admin-${label}-${Date.now()}-${rand()}@example.com`,
        passwordHash: 'unused',
        fullName: `E2E RRC Admin ${label}`,
        role,
        childSafetyVetted,
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

    // Decision Log #466: child_safety_concern ALWAYS stores concernsMinor = true; severity is not touched.
    it('child_safety_concern stores concernsMinor true and leaves severity at medium', async () => {
      const reporter = await createUser('reporter-csc');
      const postId = await seedPost((await createUser('author-csc')).userId);
      const res = await request(server())
        .post('/reports')
        .set(auth(reporter.accessToken))
        .send({ targetType: 'post', targetId: postId, reasonCategory: 'child_safety_concern' })
        .expect(201);
      const row = await prisma().report.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(row).toMatchObject({ concernsMinor: true, severity: 'medium', reasonCategory: 'child_safety_concern' });
    });

    it('POST /reports has no concernsMinor field: sending one (true or false) is a 400 and creates nothing', async () => {
      const reporter = await createUser('reporter-csc-field');
      const postId = await seedPost((await createUser('author-csc-field')).userId);
      for (const concernsMinor of [true, false]) {
        await request(server())
          .post('/reports')
          .set(auth(reporter.accessToken))
          .send({ targetType: 'post', targetId: postId, reasonCategory: 'child_safety_concern', concernsMinor })
          .expect(400);
      }
      expect(await prisma().report.count()).toBe(0);
    });

    it('every other category stores concernsMinor false on this route', async () => {
      const reporter = await createUser('reporter-others');
      const postId = await seedPost((await createUser('author-others')).userId);
      const others = [
        'harassment_or_bullying',
        'hate_or_abusive_language',
        'threats_or_violence',
        'sexual_or_inappropriate_content',
        'impersonation_or_fake_account',
        'spam_or_scam',
        'privacy_or_image_misuse',
        'other',
      ];
      for (const reasonCategory of others) {
        const res = await request(server())
          .post('/reports')
          .set(auth(reporter.accessToken))
          .send({ targetType: 'post', targetId: postId, reasonCategory, reason: 'details' })
          .expect(201);
        const row = await prisma().report.findUniqueOrThrow({ where: { id: res.body.id } });
        expect(row.concernsMinor).toBe(false);
      }
    });
  });

  // Decision Log #466 on the public route, where concernsMinor IS a (required) field.
  describe('POST /reports/public and the child_safety_concern flag', () => {
    it('child_safety_concern is stored true when the flag is sent false and when it is sent true; severity unchanged', async () => {
      const postId = await seedPost((await createUser('author-pub-csc')).userId);
      const base = { reporterContactEmail: 'parent@example.com', targetType: 'post', targetId: postId, reasonCategory: 'child_safety_concern' };
      for (const sent of [false, true]) {
        const res = await request(server()).post('/reports/public').send({ ...base, concernsMinor: sent }).expect(201);
        const row = await prisma().report.findUniqueOrThrow({ where: { id: res.body.id } });
        expect(row).toMatchObject({ concernsMinor: true, severity: 'medium', reporterId: null });
      }
    });

    it('omitting concernsMinor is still the required-field 400 on this route, even with the category, and creates nothing', async () => {
      const postId = await seedPost((await createUser('author-pub-omit')).userId);
      await request(server())
        .post('/reports/public')
        .send({ reporterContactEmail: 'parent@example.com', targetType: 'post', targetId: postId, reasonCategory: 'child_safety_concern' })
        .expect(400);
      expect(await prisma().report.count()).toBe(0);
    });

    it('every other category leaves the flag as the reporter sent it', async () => {
      const postId = await seedPost((await createUser('author-pub-others')).userId);
      const base = { reporterContactEmail: 'parent@example.com', targetType: 'post', targetId: postId, reason: 'details' };
      for (const reasonCategory of ['spam_or_scam', 'harassment_or_bullying', 'other']) {
        for (const sent of [false, true]) {
          const res = await request(server()).post('/reports/public').send({ ...base, reasonCategory, concernsMinor: sent }).expect(201);
          const row = await prisma().report.findUniqueOrThrow({ where: { id: res.body.id } });
          expect(row.concernsMinor).toBe(sent);
        }
      }
    });
  });

  // Decision Log #466 consequences, through the real routes: a report created via POST /reports with the category
  // is limited to child-safety-vetted admins everywhere the concernsMinor gate applies.
  describe('a child_safety_concern report and the child-safety-vetting gate', () => {
    async function makeCategorisedReport() {
      const reporter = await createUser('gate-reporter');
      const author = await createUser('gate-author');
      const postId = await seedPost(author.userId);
      const res = await request(server())
        .post('/reports')
        .set(auth(reporter.accessToken))
        .send({ targetType: 'post', targetId: postId, reasonCategory: 'child_safety_concern' })
        .expect(201);
      return { reportId: res.body.id as string, reporter, author, postId };
    }

    it('an UNVETTED admin cannot list, open, action or find it; a VETTED admin can', async () => {
      const { reportId } = await makeCategorisedReport();
      const unvetted = await createAdmin('unvetted', 'moderator', false);
      const vetted = await createAdmin('vetted', 'moderator', true);

      const unvettedList = await request(server()).get('/admin/moderation/reports').set(auth(unvetted.accessToken)).expect(200);
      expect(unvettedList.body.items.map((r: { id: string }) => r.id)).not.toContain(reportId);
      const unvettedOpen = await request(server()).get(`/admin/moderation/reports/${reportId}`).set(auth(unvetted.accessToken)).expect(403);
      expect(unvettedOpen.body.code).toBe('child_safety_vetting_required');
      const unvettedAction = await request(server())
        .patch(`/admin/moderation/reports/${reportId}`)
        .set(auth(unvetted.accessToken))
        .send({ action: 'dismissed' })
        .expect(403);
      expect(unvettedAction.body.code).toBe('child_safety_vetting_required');
      // Searching by the category label finds nothing for the unvetted admin.
      const unvettedSearch = await request(server()).get('/admin/search').query({ q: 'child safety' }).set(auth(unvetted.accessToken)).expect(200);
      expect(unvettedSearch.body.groups.reports.items).toHaveLength(0);
      // And the report is untouched.
      expect((await prisma().report.findUniqueOrThrow({ where: { id: reportId } })).status).toBe('open');

      const vettedList = await request(server()).get('/admin/moderation/reports').set(auth(vetted.accessToken)).expect(200);
      const listed = vettedList.body.items.find((r: { id: string }) => r.id === reportId);
      expect(listed).toMatchObject({ concernsMinor: true, reasonCategory: 'child_safety_concern' });
      await request(server()).get(`/admin/moderation/reports/${reportId}`).set(auth(vetted.accessToken)).expect(200);
      const vettedSearch = await request(server()).get('/admin/search').query({ q: 'child safety' }).set(auth(vetted.accessToken)).expect(200);
      expect(vettedSearch.body.groups.reports.items.map((r: { id: string }) => r.id)).toEqual([reportId]);
      expect(vettedSearch.body.groups.reports.items[0]).toMatchObject({ matchedOn: 'reason_category' });
    });

    it('an UNVETTED admin cannot review an appeal on it, and cannot escalate it; a vetted admin reviews it', async () => {
      const { reportId, author } = await makeCategorisedReport();
      const actioner = await createAdmin('actioner', 'moderator', true);
      const second = await createAdmin('second', 'moderator', true);
      const unvetted = await createAdmin('unvetted-appeal', 'moderator', false);
      await request(server())
        .patch(`/admin/moderation/reports/${reportId}`)
        .set(auth(actioner.accessToken))
        .send({ action: 'warning_issued' })
        .expect(200);
      // The reported user (the post's author) appeals.
      await request(server()).post(`/reports/${reportId}/appeal`).set(auth(author.accessToken)).send({ reason: 'This was a mistake.' }).expect(201);

      const unvettedDecision = await request(server())
        .patch(`/admin/moderation/reports/${reportId}/appeal`)
        .set(auth(unvetted.accessToken))
        .send({ decision: 'upheld' })
        .expect(403);
      expect(unvettedDecision.body.code).toBe('child_safety_vetting_required');
      const unvettedEscalate = await request(server())
        .patch(`/admin/moderation/reports/${reportId}/escalate`)
        .set(auth(unvetted.accessToken))
        .send({ escalationNotes: 'Escalating this report.', escalatedToAuthority: false })
        .expect(403);
      expect(unvettedEscalate.body.code).toBe('child_safety_vetting_required');

      await request(server())
        .patch(`/admin/moderation/reports/${reportId}/appeal`)
        .set(auth(second.accessToken))
        .send({ decision: 'upheld' })
        .expect(200);
    });

    it('the signed-in reporter still gets their normal moderation_decision notification when it is actioned', async () => {
      const { reportId, reporter } = await makeCategorisedReport();
      const vetted = await createAdmin('vetted-outcome', 'moderator', true);
      await request(server())
        .patch(`/admin/moderation/reports/${reportId}`)
        .set(auth(vetted.accessToken))
        .send({ action: 'warning_issued' })
        .expect(200);
      const notifications = await prisma().notification.findMany({ where: { userId: reporter.userId, type: 'moderation_decision' } });
      expect(notifications).toHaveLength(1);
      expect(notifications[0].payloadRefId).toBe(reportId);
    });

    it('an older uncategorised report is unchanged: concernsMinor false, visible to an unvetted admin', async () => {
      const reporter = await createUser('legacy-reporter');
      const postId = await seedPost((await createUser('legacy-author')).userId);
      const legacy = await prisma().report.create({
        data: { reporterId: reporter.userId, targetType: 'post', targetId: postId, reason: 'old free text' },
      });
      const unvetted = await createAdmin('unvetted-legacy', 'moderator', false);
      const row = await prisma().report.findUniqueOrThrow({ where: { id: legacy.id } });
      expect(row).toMatchObject({ concernsMinor: false, reasonCategory: null });
      const list = await request(server()).get('/admin/moderation/reports').set(auth(unvetted.accessToken)).expect(200);
      expect(list.body.items.map((r: { id: string }) => r.id)).toContain(legacy.id);
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
