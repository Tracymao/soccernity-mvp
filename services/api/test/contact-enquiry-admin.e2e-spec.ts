import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { ADMIN_ACTION_LOG_ACTIONS } from '../src/modules/admin-action-log/admin-action-log.constants';
import { AdminTokenService } from '../src/modules/admin/token/admin-token.service';
import { TokenService } from '../src/modules/auth/token/token.service';
import { RegistrationEmailService } from '../src/modules/auth/registration/email/registration-email.service';
import { seedDob } from './dob-seed';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';

// backend/w7-contact-enquiry-admin-escalate (B-046 part B; Decision Log #444, #445). The admin inbox against
// real Postgres and the real guards: list filters and keyset pagination, handled / reopen, escalation into a
// Report (the RESTRICT FKs, the CHECK constraints, the one transaction, the race), the report in the moderation
// queue and detail, the child-safety-vetting gate, and - the safeguarding point - that an enquiry report NEVER
// creates an account hold for anyone, even when the enquirer is a signed-in account that is itself held up for
// deletion and shares the contact email.
describe('Contact enquiry admin e2e (real Postgres)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  beforeEach(async () => {
    await resetDatabase();
    // The outcome email goes out when a report is actioned; nothing here should reach a real provider.
    jest.spyOn(RegistrationEmailService.prototype, 'sendReportActionedEmail').mockResolvedValue(undefined);
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    await app.close();
    await disconnectTestPrismaClient();
  });

  const REASON = 'Reads like a safeguarding concern about a child.';
  const prisma = () => getTestPrismaClient();
  const server = () => app.getHttpServer();
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  let seq = 0;
  const tag = () => `${Date.now()}-${++seq}-${randomUUID().slice(0, 6)}`;

  async function createAdmin(label: string, role: string, childSafetyVetted = false) {
    const admin = await prisma().adminUser.create({
      data: { email: `e2e-ce-admin-${label}-${tag()}@example.com`, passwordHash: 'unused', fullName: `CE Admin ${label}`, role, childSafetyVetted },
    });
    const { accessToken } = await app.get(AdminTokenService).issueTokenPair(admin.id, admin.role);
    return { adminId: admin.id, token: accessToken.token };
  }

  async function createUser(label: string, extra: Record<string, unknown> = {}) {
    return prisma().user.create({
      data: {
        email: `e2e-ce-user-${label}-${tag()}@example.com`,
        passwordHash: 'unused-hash',
        displayName: `CE ${label}`,
        dateOfBirth: seedDob('1998-07-04'),
        ...extra,
      },
    });
  }

  let enquirySeq = 0;
  async function seedEnquiry(over: Record<string, unknown> = {}) {
    const n = ++enquirySeq;
    const createdAt = new Date(Date.UTC(2026, 9, 1, 10, 0, n));
    return prisma().contactEnquiry.create({
      data: {
        name: `Sender ${n}`,
        email: `e2e-ce-sender-${n}-${tag()}@example.com`,
        category: 'enquiries',
        subject: `Subject ${n}`,
        message: `Message ${n}`,
        createdAt,
        lastMessageAt: createdAt,
        ...over,
      } as never,
    });
  }

  const escalateBody = (over: Record<string, unknown> = {}) => ({ severity: 'high', concernsMinor: false, reason: REASON, ...over });

  describe('access', () => {
    it('401 for a User token and for no token, 403 for an editor, 200 for moderator and superadmin', async () => {
      const user = await createUser('plain');
      const { accessToken } = await app.get(TokenService).issueTokenPair(user.id, user.role);
      const editor = await createAdmin('editor', 'editor');
      const moderator = await createAdmin('mod', 'moderator');
      const superadmin = await createAdmin('super', 'superadmin');

      await request(server()).get('/admin/contact-enquiries').expect(401);
      await request(server()).get('/admin/contact-enquiries').set(auth(accessToken.token)).expect(401);
      await request(server()).get('/admin/contact-enquiries').set(auth(editor.token)).expect(403);
      await request(server()).get('/admin/contact-enquiries').set(auth(moderator.token)).expect(200);
      await request(server()).get('/admin/contact-enquiries').set(auth(superadmin.token)).expect(200);
    });

    it('the write routes are gated the same way', async () => {
      const editor = await createAdmin('editor', 'editor');
      const enquiry = await seedEnquiry();
      await request(server()).patch(`/admin/contact-enquiries/${enquiry.id}/handled`).set(auth(editor.token)).send({ handled: true }).expect(403);
      await request(server()).post(`/admin/contact-enquiries/${enquiry.id}/escalate`).set(auth(editor.token)).send(escalateBody()).expect(403);
      expect(await prisma().report.count()).toBe(0);
      expect((await prisma().contactEnquiry.findUnique({ where: { id: enquiry.id } }))?.status).toBe('new');
    });
  });

  describe('list and detail', () => {
    it('pages newest first with a keyset cursor: no gaps, no duplicates', async () => {
      const mod = await createAdmin('mod', 'moderator');
      const made = [];
      for (let i = 0; i < 5; i += 1) made.push(await seedEnquiry());

      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const res: request.Response = await request(server())
          .get(`/admin/contact-enquiries?limit=2${cursor ? `&cursor=${cursor}` : ''}`)
          .set(auth(mod.token))
          .expect(200);
        seen.push(...res.body.items.map((i: { id: string }) => i.id));
        cursor = res.body.nextCursor;
        pages += 1;
      } while (cursor);

      expect(pages).toBe(3);
      expect(seen).toEqual(made.map((m) => m.id).reverse());
    });

    it('filters by status and by category, and the two combine', async () => {
      const mod = await createAdmin('mod', 'moderator');
      const a = await seedEnquiry({ category: 'data' });
      const b = await seedEnquiry({ category: 'data', status: 'handled', handledAt: new Date(), handledByAdminId: mod.adminId });
      const c = await seedEnquiry({ category: 'suggestions' });

      const ids = async (qs: string) =>
        (await request(server()).get(`/admin/contact-enquiries?${qs}`).set(auth(mod.token)).expect(200)).body.items.map((i: { id: string }) => i.id).sort();

      expect(await ids('status=new')).toEqual([a.id, c.id].sort());
      expect(await ids('status=handled')).toEqual([b.id]);
      expect(await ids('category=data')).toEqual([a.id, b.id].sort());
      expect(await ids('category=data&status=new')).toEqual([a.id]);
      await request(server()).get('/admin/contact-enquiries?status=archived').set(auth(mod.token)).expect(400);
      await request(server()).get('/admin/contact-enquiries?category=nope').set(auth(mod.token)).expect(400);
      // the two retired keys are no longer accepted as filters
      await request(server()).get('/admin/contact-enquiries?category=livescores_issues').set(auth(mod.token)).expect(400);
      await request(server()).get('/admin/contact-enquiries?category=enquiries_feedback').set(auth(mod.token)).expect(400);
    });

    it('list items carry hasEscalation and the submitter kind but not the message; the detail carries the message', async () => {
      const mod = await createAdmin('mod', 'moderator');
      const user = await createUser('signedin');
      const guest = await seedEnquiry();
      const signedIn = await seedEnquiry({ userId: user.id });

      const list = await request(server()).get('/admin/contact-enquiries').set(auth(mod.token)).expect(200);
      const byId = new Map<string, Record<string, unknown>>(list.body.items.map((i: { id: string }) => [i.id, i as Record<string, unknown>]));
      expect(byId.get(guest.id)).toMatchObject({ submitter: 'guest', hasEscalation: false });
      expect(byId.get(signedIn.id)).toMatchObject({ submitter: 'signed_in', hasEscalation: false });
      expect(byId.get(guest.id)).not.toHaveProperty('message');

      const detail = await request(server()).get(`/admin/contact-enquiries/${guest.id}`).set(auth(mod.token)).expect(200);
      expect(detail.body).toMatchObject({ id: guest.id, message: guest.message, userId: null, escalatedReportId: null });
      await request(server()).get(`/admin/contact-enquiries/${randomUUID()}`).set(auth(mod.token)).expect(404);
    });
  });

  describe('handled and reopen', () => {
    it('marks handled (status, handledAt, handledByAdminId), reopens, and audits each real change once', async () => {
      const mod = await createAdmin('mod', 'moderator');
      const enquiry = await seedEnquiry();
      const url = `/admin/contact-enquiries/${enquiry.id}/handled`;

      const handled = await request(server()).patch(url).set(auth(mod.token)).send({ handled: true }).expect(200);
      expect(handled.body).toMatchObject({ status: 'handled', handledByAdminId: mod.adminId, handledAt: expect.any(String) });
      const row = await prisma().contactEnquiry.findUnique({ where: { id: enquiry.id } });
      expect(row).toMatchObject({ status: 'handled', handledByAdminId: mod.adminId });
      expect(row?.handledAt).toBeInstanceOf(Date);

      // Idempotent: again is 200, writes nothing, audits nothing.
      await request(server()).patch(url).set(auth(mod.token)).send({ handled: true }).expect(200);

      const reopened = await request(server()).patch(url).set(auth(mod.token)).send({ handled: false }).expect(200);
      expect(reopened.body).toMatchObject({ status: 'new', handledAt: null, handledByAdminId: null });
      await request(server()).patch(url).set(auth(mod.token)).send({ handled: false }).expect(200);

      const logs = await prisma().adminActionLog.findMany({ where: { targetId: enquiry.id }, orderBy: { createdAt: 'asc' } });
      expect(logs.map((l) => l.action)).toEqual([ADMIN_ACTION_LOG_ACTIONS.CONTACT_ENQUIRY_HANDLED, ADMIN_ACTION_LOG_ACTIONS.CONTACT_ENQUIRY_REOPENED]);
      expect(logs.every((l) => l.targetType === 'contact_enquiry' && l.adminId === mod.adminId)).toBe(true);
    });

    it('400s on a non-boolean body and 404s for an unknown enquiry', async () => {
      const mod = await createAdmin('mod', 'moderator');
      const enquiry = await seedEnquiry();
      await request(server()).patch(`/admin/contact-enquiries/${enquiry.id}/handled`).set(auth(mod.token)).send({ handled: 'yes' }).expect(400);
      await request(server()).patch(`/admin/contact-enquiries/${randomUUID()}/handled`).set(auth(mod.token)).send({ handled: true }).expect(404);
    });
  });

  describe('escalate', () => {
    it('creates an open enquiry Report with no reporter account, links the enquiry, audits it, and refuses a second escalation', async () => {
      const mod = await createAdmin('mod', 'moderator');
      const enquiry = await seedEnquiry({ category: 'editorial_complaints', subject: 'A subject', message: 'The full message.' });

      const res = await request(server()).post(`/admin/contact-enquiries/${enquiry.id}/escalate`).set(auth(mod.token)).send(escalateBody({ severity: 'critical' })).expect(201);
      expect(res.body.report).toMatchObject({ status: 'open', severity: 'critical', concernsMinor: false });
      expect(res.body.enquiry).toMatchObject({ id: enquiry.id, hasEscalation: true, escalatedReportId: res.body.report.id });

      const report = await prisma().report.findUniqueOrThrow({ where: { id: res.body.report.id } });
      expect(report).toMatchObject({
        reporterId: null,
        reporterContactName: enquiry.name,
        reporterContactEmail: enquiry.email,
        targetType: 'enquiry',
        targetId: enquiry.id,
        reason: 'Contact enquiry (Editorial Complaints) - A subject: The full message.',
        severity: 'critical',
        concernsMinor: false,
        status: 'open',
        // The escalation-trail fields mean escalation to a child-safety lead or authority: untouched.
        escalatedAt: null,
        escalatedByAdminId: null,
        escalatedToAuthority: false,
      });
      expect((await prisma().contactEnquiry.findUniqueOrThrow({ where: { id: enquiry.id } })).escalatedReportId).toBe(report.id);

      const log = await prisma().adminActionLog.findFirstOrThrow({ where: { action: ADMIN_ACTION_LOG_ACTIONS.CONTACT_ENQUIRY_ESCALATED } });
      expect(log).toMatchObject({ adminId: mod.adminId, targetType: 'contact_enquiry', targetId: enquiry.id });
      expect(log.notes).toContain(`report=${report.id}`);
      expect(log.notes).toContain(REASON);
      expect(log.notes).not.toContain('The full message.');

      const again = await request(server()).post(`/admin/contact-enquiries/${enquiry.id}/escalate`).set(auth(mod.token)).send(escalateBody()).expect(409);
      expect(again.body.code).toBe('contact_enquiry_already_escalated');
      expect(await prisma().report.count()).toBe(1);
    });

    it('two simultaneous escalations produce exactly one Report: one 201, one 409', async () => {
      const mod = await createAdmin('mod', 'moderator');
      const enquiry = await seedEnquiry();
      const send = () => request(server()).post(`/admin/contact-enquiries/${enquiry.id}/escalate`).set(auth(mod.token)).send(escalateBody());

      const results = await Promise.all([send(), send()]);

      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(await prisma().report.count({ where: { targetType: 'enquiry' } })).toBe(1);
      expect(await prisma().adminActionLog.count({ where: { action: ADMIN_ACTION_LOG_ACTIONS.CONTACT_ENQUIRY_ESCALATED } })).toBe(1);
    });

    it('caps the Report reason at 500 characters for a long enquiry (the full 3000-character message stays on the enquiry)', async () => {
      const mod = await createAdmin('mod', 'moderator');
      const enquiry = await seedEnquiry({ subject: 'S'.repeat(200), message: 'M'.repeat(3000) });
      const res = await request(server()).post(`/admin/contact-enquiries/${enquiry.id}/escalate`).set(auth(mod.token)).send(escalateBody()).expect(201);
      const report = await prisma().report.findUniqueOrThrow({ where: { id: res.body.report.id } });
      expect(report.reason).toHaveLength(500);
      const stored = await prisma().contactEnquiry.findUniqueOrThrow({ where: { id: enquiry.id } });
      expect(stored.message).toHaveLength(3000);
    });

    it('400s on invalid input and creates nothing; 404s for an unknown enquiry', async () => {
      const mod = await createAdmin('mod', 'moderator');
      const enquiry = await seedEnquiry();
      const url = `/admin/contact-enquiries/${enquiry.id}/escalate`;
      for (const bad of [
        escalateBody({ reason: 'short' }),
        escalateBody({ reason: 'x'.repeat(501) }),
        escalateBody({ reason: ' '.repeat(20) }),
        escalateBody({ severity: 'urgent' }),
        escalateBody({ concernsMinor: 'no' }),
        { severity: 'low', concernsMinor: false },
        { ...escalateBody(), targetType: 'user' },
      ]) {
        await request(server()).post(url).set(auth(mod.token)).send(bad).expect(400);
      }
      await request(server()).post(`/admin/contact-enquiries/${randomUUID()}/escalate`).set(auth(mod.token)).send(escalateBody()).expect(404);
      expect(await prisma().report.count()).toBe(0);
    });

    it("'enquiry' is not a target type the public or user report routes accept", async () => {
      const enquiry = await seedEnquiry();
      const user = await createUser('reporter');
      const { accessToken } = await app.get(TokenService).issueTokenPair(user.id, user.role);

      await request(server())
        .post('/reports/public')
        .send({ targetType: 'enquiry', targetId: enquiry.id, reason: 'x', reporterContactEmail: 'a@example.com', concernsMinor: false })
        .expect(400);
      await request(server()).post('/reports').set(auth(accessToken.token)).send({ targetType: 'enquiry', targetId: enquiry.id, reason: 'x' }).expect(400);
      expect(await prisma().report.count()).toBe(0);
    });
  });

  describe('child-safety vetting (concernsMinor)', () => {
    it('a non-vetted admin cannot escalate a minor-concerning enquiry (coded 403, nothing created); a vetted one can', async () => {
      const unvetted = await createAdmin('unvetted', 'moderator', false);
      const vetted = await createAdmin('vetted', 'moderator', true);
      const enquiry = await seedEnquiry();
      const url = `/admin/contact-enquiries/${enquiry.id}/escalate`;

      const denied = await request(server()).post(url).set(auth(unvetted.token)).send(escalateBody({ concernsMinor: true })).expect(403);
      expect(denied.body.code).toBe('child_safety_vetting_required');
      expect(await prisma().report.count()).toBe(0);
      expect((await prisma().contactEnquiry.findUniqueOrThrow({ where: { id: enquiry.id } })).escalatedReportId).toBeNull();

      // The same non-vetted admin may escalate when the enquiry does NOT concern a minor.
      const other = await seedEnquiry();
      await request(server()).post(`/admin/contact-enquiries/${other.id}/escalate`).set(auth(unvetted.token)).send(escalateBody()).expect(201);

      await request(server()).post(url).set(auth(vetted.token)).send(escalateBody({ concernsMinor: true })).expect(201);
    });

    it('the resulting minor-concerning report is hidden from a non-vetted admin in the queue and 403s on direct access', async () => {
      const unvetted = await createAdmin('unvetted', 'moderator', false);
      const vetted = await createAdmin('vetted', 'moderator', true);
      const enquiry = await seedEnquiry();
      const res = await request(server()).post(`/admin/contact-enquiries/${enquiry.id}/escalate`).set(auth(vetted.token)).send(escalateBody({ concernsMinor: true })).expect(201);
      const reportId = res.body.report.id;

      const hidden = await request(server()).get('/admin/moderation/reports').set(auth(unvetted.token)).expect(200);
      expect(hidden.body.items.map((r: { id: string }) => r.id)).not.toContain(reportId);
      await request(server()).get(`/admin/moderation/reports/${reportId}`).set(auth(unvetted.token)).expect(403);
      await request(server()).patch(`/admin/moderation/reports/${reportId}`).set(auth(unvetted.token)).send({ action: 'dismissed' }).expect(403);

      const shown = await request(server()).get('/admin/moderation/reports').set(auth(vetted.token)).expect(200);
      expect(shown.body.items.map((r: { id: string }) => r.id)).toContain(reportId);
    });
  });

  describe('the report in the moderation queue and detail', () => {
    it('appears in the queue with source contact_enquiry and loads in detail with the enquiry, with no reported user and no holds', async () => {
      const mod = await createAdmin('mod', 'moderator');
      const enquiry = await seedEnquiry({ subject: 'Queue subject', message: 'Queue message' });
      const esc = await request(server()).post(`/admin/contact-enquiries/${enquiry.id}/escalate`).set(auth(mod.token)).send(escalateBody()).expect(201);
      const reportId = esc.body.report.id;

      const queue = await request(server()).get('/admin/moderation/reports?status=open').set(auth(mod.token)).expect(200);
      const item = queue.body.items.find((r: { id: string }) => r.id === reportId);
      expect(item).toMatchObject({ targetType: 'enquiry', targetId: enquiry.id, source: 'contact_enquiry', reporterId: null });

      const detail = await request(server()).get(`/admin/moderation/reports/${reportId}`).set(auth(mod.token)).expect(200);
      expect(detail.body).toMatchObject({
        id: reportId,
        source: 'contact_enquiry',
        holds: [],
        contactEnquiry: { id: enquiry.id, name: enquiry.name, email: enquiry.email, subject: 'Queue subject', message: 'Queue message', status: 'new' },
      });
    });

    it('other reports are untouched: no source key', async () => {
      const mod = await createAdmin('mod', 'moderator');
      const reporter = await createUser('r');
      const subject = await createUser('s');
      const plain = await prisma().report.create({ data: { reporterId: reporter.id, targetType: 'user', targetId: subject.id, reason: 'plain' } });
      const detail = await request(server()).get(`/admin/moderation/reports/${plain.id}`).set(auth(mod.token)).expect(200);
      expect(detail.body).not.toHaveProperty('source');
      expect(detail.body).not.toHaveProperty('contactEnquiry');
    });

    it('closes normally: dismissed gives reviewed, a real action gives actioned; no notification row, no hold', async () => {
      const mod = await createAdmin('mod', 'moderator');
      const second = await createAdmin('mod2', 'moderator');
      const a = await seedEnquiry();
      const b = await seedEnquiry();
      const ra = (await request(server()).post(`/admin/contact-enquiries/${a.id}/escalate`).set(auth(mod.token)).send(escalateBody()).expect(201)).body.report.id;
      const rb = (await request(server()).post(`/admin/contact-enquiries/${b.id}/escalate`).set(auth(mod.token)).send(escalateBody()).expect(201)).body.report.id;

      const dismissed = await request(server()).patch(`/admin/moderation/reports/${ra}`).set(auth(mod.token)).send({ action: 'dismissed' }).expect(200);
      expect(dismissed.body).toMatchObject({ status: 'reviewed', actionTaken: 'dismissed', reviewedByAdminId: mod.adminId });
      const actioned = await request(server()).patch(`/admin/moderation/reports/${rb}`).set(auth(second.token)).send({ action: 'warning_issued' }).expect(200);
      expect(actioned.body).toMatchObject({ status: 'actioned', actionTaken: 'warning_issued' });

      expect(await prisma().notification.count()).toBe(0);
      expect(await prisma().accountHold.count()).toBe(0);
    });

    it('sends NO outcome email to the enquirer, for any action (Decision Log #445, build note 1)', async () => {
      const mod = await createAdmin('mod', 'moderator');
      const a = await seedEnquiry();
      const b = await seedEnquiry();
      const ra = (await request(server()).post(`/admin/contact-enquiries/${a.id}/escalate`).set(auth(mod.token)).send(escalateBody()).expect(201)).body.report.id;
      const rb = (await request(server()).post(`/admin/contact-enquiries/${b.id}/escalate`).set(auth(mod.token)).send(escalateBody()).expect(201)).body.report.id;

      await request(server()).patch(`/admin/moderation/reports/${ra}`).set(auth(mod.token)).send({ action: 'dismissed' }).expect(200);
      await request(server()).patch(`/admin/moderation/reports/${rb}`).set(auth(mod.token)).send({ action: 'warning_issued' }).expect(200);
      // The outcome notification is fire-and-forget after the response; give it time to (not) run.
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(RegistrationEmailService.prototype.sendReportActionedEmail).not.toHaveBeenCalled();
    });
  });

  describe('an enquiry report never creates an account hold', () => {
    it('even for a signed-in enquirer whose account is itself held up for deletion and shares the contact email', async () => {
      const mod = await createAdmin('mod', 'moderator');
      // A pending_deletion account long past its grace period: the held-investigations list would show it if ANY
      // hold rule matched it.
      const user = await createUser('enquirer', { accountStatus: 'pending_deletion', pendingDeletionAt: new Date('2020-01-01T00:00:00.000Z') });
      const enquiry = await seedEnquiry({ userId: user.id, email: user.email, name: user.displayName });

      const before = await request(server()).get('/admin/users/held-investigations?olderThanDays=0').set(auth(mod.token)).expect(200);
      expect(before.body.items.map((i: { userId: string }) => i.userId)).not.toContain(user.id);

      const esc = await request(server()).post(`/admin/contact-enquiries/${enquiry.id}/escalate`).set(auth(mod.token)).send(escalateBody()).expect(201);
      const reportId = esc.body.report.id;

      // Both admin hold routes are refused with their own code.
      const bad = await request(server()).post(`/admin/moderation/reports/${reportId}/holds/bad-faith`).set(auth(mod.token)).send({ reason: REASON }).expect(409);
      expect(bad.body.code).toBe('hold_not_applicable');
      const legal = await request(server()).post(`/admin/moderation/reports/${reportId}/holds/legal`).set(auth(mod.token)).send({ reason: REASON }).expect(409);
      expect(legal.body.code).toBe('hold_not_applicable');
      expect(await prisma().accountHold.count()).toBe(0);

      // While the report is open, and after it is closed, no report-based hold arises either.
      const open = await request(server()).get('/admin/users/held-investigations?olderThanDays=0').set(auth(mod.token)).expect(200);
      expect(open.body.items.map((i: { userId: string }) => i.userId)).not.toContain(user.id);

      await request(server()).patch(`/admin/moderation/reports/${reportId}`).set(auth(mod.token)).send({ action: 'warning_issued' }).expect(200);
      const closed = await request(server()).get('/admin/users/held-investigations?olderThanDays=0').set(auth(mod.token)).expect(200);
      expect(closed.body.items.map((i: { userId: string }) => i.userId)).not.toContain(user.id);
      expect(await prisma().accountHold.count()).toBe(0);
    });
  });
});
