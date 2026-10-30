import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AccountDeletionSweepService } from '../src/modules/account-deletion/account-deletion-sweep.service';
import { AnonymizedRowPurgeService } from '../src/modules/account-deletion/anonymized-row-purge.service';
import { TokenService } from '../src/modules/auth/token/token.service';
import { RegistrationEmailService } from '../src/modules/auth/registration/email/registration-email.service';
import { ContactEnquiryRetentionService } from '../src/modules/contact/contact-enquiry-retention.service';
import { CONTACT_RETENTION_MAX_PER_RUN } from '../src/modules/contact/contact.constants';
import { clearAuthLimitCounters } from './auth-limits';
import { seedDob } from './dob-seed';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';

// backend/w7-contact-us-enquiry (B-046; Decision Log #440, #444, founder decisions 2026-10-30).
//
// Real Postgres and real Redis, no mocked provider: the database CHECK constraints, the per-email counter in
// Redis, the real @AuthRateLimit() per-IP throttle, the retention job against real rows, and the interplay
// with anonymisation and the 30-day purge (the foreign key from ContactEnquiry to User is RESTRICT, so a
// careless delete would fail, and an escalated enquiry must block the purge exactly like a report).
//
// One IP is many by sending X-Forwarded-For with `trust proxy` on (the same thing a production proxy does),
// so every test gets its own per-IP throttle bucket, and every test uses fresh email addresses so the
// per-email counter (3 per hour, real numbers) starts clean.
describe('Contact Us e2e: POST /contact, retention and account deletion, against real Postgres + Redis', () => {
  const DAY = 24 * 60 * 60 * 1000;
  let app: INestApplication;
  let sweep: AccountDeletionSweepService;
  let purge: AnonymizedRowPurgeService;
  let retention: ContactEnquiryRetentionService;
  let notify: jest.SpyInstance;
  let ipCounter = 0;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    (app.getHttpAdapter().getInstance() as { set(k: string, v: unknown): void }).set('trust proxy', true);
    await app.init();
    sweep = app.get(AccountDeletionSweepService);
    purge = app.get(AnonymizedRowPurgeService);
    retention = app.get(ContactEnquiryRetentionService);
  });

  beforeEach(async () => {
    await resetDatabase();
    await clearAuthLimitCounters(app);
    // Every instance of the email service (several modules provide their own) goes through the prototype.
    notify = jest.spyOn(RegistrationEmailService.prototype, 'sendContactEnquiryNotificationEmail').mockResolvedValue(undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  afterAll(async () => {
    await clearAuthLimitCounters(app);
    await app.close();
    await disconnectTestPrismaClient();
  });

  const prisma = () => getTestPrismaClient();
  const freshEmail = (label: string) => `e2e-contact-${label}-${randomUUID()}@example.com`;
  const nextIp = () => `203.0.113.${(ipCounter = (ipCounter % 250) + 1)}`;

  const body = (over: Record<string, unknown> = {}) => ({
    name: 'Ada Obi',
    email: freshEmail('guest'),
    category: 'technical_issues',
    subject: 'The match page will not load',
    message: 'E2E-SECRET-MESSAGE it spins forever on my phone',
    ...over,
  });

  const submit = (b: Record<string, unknown>, opts: { ip?: string; token?: string } = {}) => {
    let r = request(app.getHttpServer())
      .post('/contact')
      .set('X-Forwarded-For', opts.ip ?? nextIp());
    if (opts.token) r = r.set('Authorization', `Bearer ${opts.token}`);
    return r.send(b);
  };

  async function createUser(status = 'active') {
    const user = await prisma().user.create({
      data: {
        email: freshEmail('user'),
        passwordHash: 'unused',
        displayName: 'Contact Tester',
        dateOfBirth: seedDob('1994-05-05'),
        isMinor: false,
        accountStatus: status,
      },
    });
    const { accessToken } = await app.get(TokenService).issueTokenPair(user.id, user.role);
    return { id: user.id, token: accessToken.token };
  }

  describe('POST /contact', () => {
    it('stores a guest enquiry exactly as typed (trimmed), userId null, status new, lastMessageAt = createdAt', async () => {
      const email = freshEmail('guest');
      const res = await submit(body({ name: '  Ada Obi ', email: ` ${email} `, message: ' line one\nline two ' })).expect(201);
      expect(res.body).toEqual({ received: true });
      expect(JSON.stringify(res.body)).not.toContain('E2E-SECRET');

      const rows = await prisma().contactEnquiry.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        name: 'Ada Obi',
        email,
        category: 'technical_issues',
        subject: 'The match page will not load',
        message: 'line one\nline two',
        userId: null,
        status: 'new',
        handledAt: null,
        handledByAdminId: null,
        escalatedReportId: null,
      });
      expect(rows[0].lastMessageAt).toEqual(rows[0].createdAt);
    });

    it('a signed-in sender\'s enquiry is linked to their account; a token whose account is not active is stored as a guest\'s', async () => {
      const active = await createUser();
      await submit(body(), { token: active.token }).expect(201);
      const deactivated = await createUser('deactivated');
      await submit(body(), { token: deactivated.token }).expect(201);
      // an invalid token degrades to a guest (OptionalJwtAuthGuard never rejects)
      await submit(body(), { token: 'not-a-real-token' }).expect(201);

      const rows = await prisma().contactEnquiry.findMany({ orderBy: { createdAt: 'asc' } });
      expect(rows.map((r) => r.userId)).toEqual([active.id, null, null]);
    });

    it.each(['technical_issues', 'editorial_complaints', 'data', 'suggestions', 'enquiries', 'feedback'])(
      'accepts the category %s, and refuses anything else with nothing stored',
      async (category) => {
        await submit(body({ category })).expect(201);
        expect(await prisma().contactEnquiry.count({ where: { category } })).toBe(1);
      },
    );

    it('refuses an unknown category, a control character and an over-long message, storing nothing', async () => {
      await submit(body({ category: 'billing' })).expect(400);
      await submit(body({ category: 'livescores_issues' })).expect(400);
      await submit(body({ category: 'enquiries_feedback' })).expect(400);
      await submit(body({ name: 'bad\u0000name' })).expect(400);
      await submit(body({ message: 'a'.repeat(3001) })).expect(400);
      expect(await prisma().contactEnquiry.count()).toBe(0);
    });

    it('migration 20261104090000 remaps the retired keys before it replaces the CHECK (rolled back afterwards)', async () => {
      const sql = fs
        .readFileSync(path.join(__dirname, '../prisma/migrations/20261104090000_contact_enquiry_categories/migration.sql'), 'utf8')
        .split(String.fromCharCode(10))
        .filter((l) => !l.trim().startsWith('--'))
        .join(' ');
      const statements = sql.split(';').map((x) => x.trim()).filter(Boolean);
      const rollback = new Error('rollback');
      const seen: Record<string, string> = {};
      await prisma()
        .$transaction(async (tx) => {
          // put the schema back to the pre-migration state inside this transaction, then seed old keys
          await tx.$executeRawUnsafe('ALTER TABLE "ContactEnquiry" DROP CONSTRAINT "ContactEnquiry_category_check"');
          await tx.$executeRawUnsafe(
            `ALTER TABLE "ContactEnquiry" ADD CONSTRAINT "ContactEnquiry_category_check" CHECK ("category" IN ('technical_issues', 'editorial_complaints', 'data', 'livescores_issues', 'suggestions', 'enquiries_feedback'))`,
          );
          for (const [id, category] of [
            ['mig-1', 'livescores_issues'],
            ['mig-2', 'enquiries_feedback'],
            ['mig-3', 'technical_issues'],
          ]) {
            await tx.$executeRawUnsafe(
              `INSERT INTO "ContactEnquiry" ("id","name","email","category","subject","message") VALUES ('${id}','n','e@example.com','${category}','s','m')`,
            );
          }
          for (const statement of statements) await tx.$executeRawUnsafe(statement);
          const rows = await tx.contactEnquiry.findMany({ where: { id: { in: ['mig-1', 'mig-2', 'mig-3'] } } });
          for (const r of rows) seen[r.id] = r.category;
          throw rollback;
        })
        .catch((e) => {
          if (e !== rollback) throw e;
        });
      expect(seen).toEqual({ 'mig-1': 'data', 'mig-2': 'enquiries', 'mig-3': 'technical_issues' });
    });

    it('stores a message of exactly 3000 characters whole, line breaks kept (the column has no length limit)', async () => {
      const message = `${'a'.repeat(1499)}
${'b'.repeat(1500)}`;
      const email = `limit-${Date.now()}@example.com`;
      await submit(body({ email, message })).expect(201);
      const row = await prisma().contactEnquiry.findFirstOrThrow({ where: { email } });
      expect(row.message).toBe(message);
      expect(row.message).toHaveLength(3000);
    });

    it('the database itself refuses an unknown category, an unknown status and a half-handled enquiry (CHECKs)', async () => {
      const base = { name: 'n', email: 'e@example.com', category: 'data', subject: 's', message: 'm' };
      await expect(prisma().contactEnquiry.create({ data: { ...base, category: 'billing' } })).rejects.toThrow(/category_check/);
      // the two retired keys are refused by the CHECK as well
      await expect(prisma().contactEnquiry.create({ data: { ...base, category: 'livescores_issues' } })).rejects.toThrow(/category_check/);
      await expect(prisma().contactEnquiry.create({ data: { ...base, category: 'enquiries_feedback' } })).rejects.toThrow(/category_check/);
      await expect(prisma().contactEnquiry.create({ data: { ...base, status: 'closed' } })).rejects.toThrow(/status_check/);
      await expect(prisma().contactEnquiry.create({ data: { ...base, handledAt: new Date() } })).rejects.toThrow(/handled_together_check/);
    });
  });

  describe('per-email limit (3 per hour, real Redis)', () => {
    it('allows 3, refuses the 4th with 429 contact_email_rate_limited, and the same address in other casing or with spaces shares the budget', async () => {
      const email = freshEmail('limited');
      await submit(body({ email })).expect(201);
      await submit(body({ email: email.toUpperCase() })).expect(201);
      await submit(body({ email: `  ${email}  ` })).expect(201);

      const res = await submit(body({ email })).expect(429);
      expect(res.body).toMatchObject({ statusCode: 429, code: 'contact_email_rate_limited' });
      expect(res.body.message).not.toMatch(/\d/);
      expect(await prisma().contactEnquiry.count()).toBe(3);
      // the refused one sent no notification
      expect(notify).toHaveBeenCalledTimes(3);
    });

    it('a different address is unaffected, even from the same IP', async () => {
      const ip = nextIp();
      const email = freshEmail('a');
      for (let i = 0; i < 3; i++) await submit(body({ email }), { ip }).expect(201);
      await submit(body({ email }), { ip }).expect(429);
      await submit(body({ email: freshEmail('b') }), { ip }).expect(201);
    });

    it('the counter holds the HASH of the address: no raw email in any auth-limit key, and it has a TTL', async () => {
      const email = freshEmail('hashed');
      await submit(body({ email })).expect(201);
      const { RedisService } = await import('../src/redis/redis.service');
      const redis = app.get(RedisService);
      const keys = (await redis.keys('auth-limit:contact-email:*')) as string[];
      expect(keys.length).toBeGreaterThan(0);
      for (const k of keys) {
        expect(k).not.toContain(email.split('@')[0]);
        expect(await redis.ttl(k)).toBeGreaterThan(0);
      }
    });
  });

  describe('per-IP limit (the shared @AuthRateLimit())', () => {
    it('refuses with 429 once one IP has sent more than the shared limit inside its window, regardless of email', async () => {
      const ip = nextIp();
      const statuses: number[] = [];
      for (let i = 0; i < 12; i++) statuses.push((await submit(body({ email: freshEmail(`ip${i}`) }), { ip })).status);
      expect(statuses.filter((s) => s === 201).length).toBeGreaterThan(0);
      expect(statuses).toContain(429);
      // every 201 stored exactly one row; every 429 stored nothing
      expect(await prisma().contactEnquiry.count()).toBe(statuses.filter((s) => s === 201).length);
      // another IP is not affected
      await submit(body(), { ip: nextIp() }).expect(201);
    });
  });

  describe('support notification', () => {
    it('sends ONE email per enquiry, to support@soccernity.com, with the category label and NEVER the sender\'s text', async () => {
      const b = body({ category: 'editorial_complaints', subject: 'E2E-SECRET-SUBJECT' });
      await submit(b).expect(201);

      expect(notify).toHaveBeenCalledTimes(1);
      const [to, label, link] = notify.mock.calls[0];
      expect(to).toBe('support@soccernity.com');
      expect(label).toBe('Editorial Complaints');
      const serialised = JSON.stringify([to, label, link]);
      for (const secret of [b.name as string, b.email as string, 'E2E-SECRET-SUBJECT', 'E2E-SECRET-MESSAGE']) {
        expect(serialised).not.toContain(secret);
      }
      // no acknowledgement to the enquirer: the only call is the one above
      expect(notify.mock.calls.every((c) => c[0] !== b.email)).toBe(true);
    });

    it('an email failure does not fail the submission and the enquiry is still stored', async () => {
      notify.mockRejectedValue(new Error('postmark down'));
      await submit(body()).expect(201);
      expect(await prisma().contactEnquiry.count()).toBe(1);
    });
  });

  describe('retention job (12 months from the LAST message, escalated enquiries never deleted)', () => {
    const NOW = new Date('2026-10-30T12:00:00.000Z');
    const CUTOFF = new Date('2025-10-30T12:00:00.000Z');

    async function seedEnquiry(lastMessageAt: Date, extra: Record<string, unknown> = {}) {
      return prisma().contactEnquiry.create({
        data: {
          name: 'n',
          email: freshEmail('ret'),
          category: 'data',
          subject: 's',
          message: 'm',
          createdAt: lastMessageAt,
          lastMessageAt,
          ...extra,
        },
      });
    }

    async function seedReport() {
      const reporter = await createUser();
      return prisma().report.create({ data: { reporterId: reporter.id, targetType: 'post', targetId: randomUUID(), reason: 'r' } });
    }

    const ids = async () => (await prisma().contactEnquiry.findMany({ select: { id: true } })).map((r) => r.id);

    it('deletes one older than 12 months, keeps one exactly at the cutoff and one a millisecond newer (boundary)', async () => {
      const old = await seedEnquiry(new Date(CUTOFF.getTime() - 1));
      const atCutoff = await seedEnquiry(CUTOFF);
      const newer = await seedEnquiry(new Date(CUTOFF.getTime() + 1));

      const r = await retention.purgeExpired(NOW);

      expect(r).toEqual({ deletedCount: 1, capped: false });
      expect((await ids()).sort()).toEqual([atCutoff.id, newer.id].sort());
      expect(await ids()).not.toContain(old.id);
    });

    it('is measured from the LAST message, not from createdAt: an old enquiry with a recent last message is kept', async () => {
      const longRunning = await seedEnquiry(new Date('2026-09-01T00:00:00.000Z'), { createdAt: new Date('2024-01-01T00:00:00.000Z') });
      await retention.purgeExpired(NOW);
      expect(await ids()).toEqual([longRunning.id]);
    });

    it('NEVER deletes an escalated enquiry, however old; an un-escalated one of the same age goes', async () => {
      const report = await seedReport();
      const escalated = await seedEnquiry(new Date('2020-01-01T00:00:00.000Z'), { escalatedReportId: report.id });
      const plain = await seedEnquiry(new Date('2020-01-01T00:00:00.000Z'));

      const r = await retention.purgeExpired(NOW);

      expect(r.deletedCount).toBe(1);
      expect(await ids()).toEqual([escalated.id]);
      expect(await ids()).not.toContain(plain.id);
    });

    it('a second run is a no-op', async () => {
      await seedEnquiry(new Date('2020-01-01T00:00:00.000Z'));
      await retention.purgeExpired(NOW);
      expect(await retention.purgeExpired(NOW)).toEqual({ deletedCount: 0, capped: false });
    });

    it('is capped per run: more than the cap are due, the oldest are deleted, the rest wait', async () => {
      const total = CONTACT_RETENTION_MAX_PER_RUN + 5;
      const base = new Date('2020-01-01T00:00:00.000Z').getTime();
      await prisma().contactEnquiry.createMany({
        data: Array.from({ length: total }, (_, i) => ({
          name: 'n',
          email: `cap-${i}@example.com`,
          category: 'data',
          subject: 's',
          message: 'm',
          createdAt: new Date(base + i * 1000),
          lastMessageAt: new Date(base + i * 1000),
        })),
      });

      const first = await retention.purgeExpired(NOW);
      expect(first).toEqual({ deletedCount: CONTACT_RETENTION_MAX_PER_RUN, capped: true });
      expect(await prisma().contactEnquiry.count()).toBe(5);
      // the survivors are the NEWEST five
      const left = await prisma().contactEnquiry.findMany({ orderBy: { lastMessageAt: 'asc' }, select: { email: true } });
      expect(left.map((l) => l.email)).toEqual(Array.from({ length: 5 }, (_, i) => `cap-${CONTACT_RETENTION_MAX_PER_RUN + i}@example.com`));

      expect(await retention.purgeExpired(NOW)).toEqual({ deletedCount: 5, capped: false });
    });
  });

  describe('account deletion and the 30-day purge', () => {
    const T0 = new Date('2026-12-01T03:00:00.000Z');
    const daysAfter = (n: number) => new Date(T0.getTime() + n * DAY);

    async function pendingDeletionUser(label: string) {
      return prisma().user.create({
        data: {
          email: freshEmail(label),
          passwordHash: 'unused',
          displayName: `Del ${label}`,
          dateOfBirth: seedDob('1998-07-04'),
          isMinor: false,
          accountStatus: 'pending_deletion',
          pendingDeletionAt: new Date(T0.getTime() - 31 * DAY),
        },
      });
    }

    const enquiryFor = (userId: string | null, extra: Record<string, unknown> = {}) =>
      prisma().contactEnquiry.create({
        data: { name: 'n', email: freshEmail('enq'), category: 'data', subject: 's', message: 'm', userId, ...extra },
      });

    it('anonymising deletes the user\'s enquiries, leaves other people\'s and guests\' alone, and the user row can then be purged (no FK failure)', async () => {
      const user = await pendingDeletionUser('plain');
      const other = await createUser();
      await enquiryFor(user.id);
      await enquiryFor(user.id);
      const othersEnquiry = await enquiryFor(other.id);
      const guestEnquiry = await enquiryFor(null);

      const r = await sweep.sweepPendingDeletions(T0);
      expect(r.anonymizedUserIds).toContain(user.id);

      expect(await prisma().contactEnquiry.count({ where: { userId: user.id } })).toBe(0);
      expect((await prisma().contactEnquiry.findMany({ select: { id: true } })).map((e) => e.id).sort()).toEqual(
        [othersEnquiry.id, guestEnquiry.id].sort(),
      );

      const p = await purge.purgeAnonymizedRows(daysAfter(30));
      expect(p.purgedUserIds).toContain(user.id);
      expect(await prisma().user.findUnique({ where: { id: user.id } })).toBeNull();
    });

    it('an ESCALATED enquiry survives anonymisation, still pointing at the (anonymised) user, and BLOCKS the purge of that row, like a report', async () => {
      const user = await pendingDeletionUser('escalated');
      const reporter = await createUser();
      const report = await prisma().report.create({
        data: { reporterId: reporter.id, targetType: 'post', targetId: randomUUID(), reason: 'safeguarding concern from the form' },
      });
      const plain = await enquiryFor(user.id);
      const escalated = await enquiryFor(user.id, { escalatedReportId: report.id });

      await sweep.sweepPendingDeletions(T0);

      const rows = await prisma().contactEnquiry.findMany({ where: { userId: user.id } });
      expect(rows.map((x) => x.id)).toEqual([escalated.id]);
      expect(await prisma().contactEnquiry.findUnique({ where: { id: plain.id } })).toBeNull();

      const p = await purge.purgeAnonymizedRows(daysAfter(31));
      expect(p.purgedUserIds).not.toContain(user.id);
      expect(p.keptUserIds).toEqual([{ userId: user.id, blocker: 'ContactEnquiry.user', kind: 'content' }]);
      expect(await prisma().user.findUnique({ where: { id: user.id } })).not.toBeNull();

      // the foreign key is RESTRICT: even a direct DELETE of the user row is refused by Postgres
      await expect(prisma().user.delete({ where: { id: user.id } })).rejects.toThrow();
    });

    it('once the escalated enquiry itself is gone (its record\'s retention ended), the account row can be purged', async () => {
      const user = await pendingDeletionUser('later');
      const reporter = await createUser();
      const report = await prisma().report.create({
        data: { reporterId: reporter.id, targetType: 'post', targetId: randomUUID(), reason: 'r' },
      });
      const escalated = await enquiryFor(user.id, { escalatedReportId: report.id });
      await sweep.sweepPendingDeletions(T0);
      expect((await purge.purgeAnonymizedRows(daysAfter(31))).purgedUserIds).not.toContain(user.id);

      await prisma().contactEnquiry.delete({ where: { id: escalated.id } });
      expect((await purge.purgeAnonymizedRows(daysAfter(32))).purgedUserIds).toContain(user.id);
    });
  });
});
