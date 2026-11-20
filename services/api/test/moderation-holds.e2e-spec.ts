import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { ADMIN_ACTION_LOG_ACTIONS } from '../src/modules/admin-action-log/admin-action-log.constants';
import { AdminTokenService } from '../src/modules/admin/token/admin-token.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { seedDob } from './dob-seed';

// backend/w6-hold-admin-endpoints (B-045; Decision Log #376, #398 D1, #403 item 8). The HTTP surface of B-044's
// holds against real Postgres and the real guards: place -> the Report detail and the held-investigations list
// show it -> lift. What a mocked Prisma cannot show: the real AccountHold CHECK constraints and FKs, the
// transaction that writes the hold together with its audit row, the real child-safety-vetting read, and that
// no Notification row is created for either party.
describe('Admin hold endpoints e2e (real Postgres)', () => {
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

  const REASON = 'Evidence preserved for the regulator.';
  const prisma = () => getTestPrismaClient();
  const server = () => app.getHttpServer();
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  let seq = 0;
  const tag = () => `${Date.now()}-${++seq}-${Math.random().toString(36).slice(2, 7)}`;

  async function createAdmin(label: string, role: string, childSafetyVetted = false) {
    const admin = await prisma().adminUser.create({
      data: { email: `e2e-hold-admin-${label}-${tag()}@example.com`, passwordHash: 'unused', fullName: `Hold Admin ${label}`, role, childSafetyVetted },
    });
    const { accessToken } = await app.get(AdminTokenService).issueTokenPair(admin.id, admin.role);
    return { adminId: admin.id, token: accessToken.token };
  }

  async function createUser(label: string, extra: Record<string, unknown> = {}) {
    return prisma().user.create({
      data: {
        email: `e2e-hold-user-${label}-${tag()}@example.com`,
        passwordHash: 'unused-hash',
        displayName: `Hold ${label}`,
        dateOfBirth: seedDob('1998-07-04'),
        ...extra,
      },
    });
  }

  // A stalled-held account: pending_deletion since long ago, so the held-investigations list considers it.
  const stalled = { accountStatus: 'pending_deletion', pendingDeletionAt: new Date('2020-01-01T00:00:00.000Z') };

  async function createReport(over: Record<string, unknown> = {}) {
    return prisma().report.create({
      data: { targetType: 'user', targetId: 'unset', reason: 'e2e hold', status: 'open', ...over } as never,
    });
  }

  async function setup(extraReport: Record<string, unknown> = {}) {
    const reporter = await createUser('reporter', stalled);
    const subject = await createUser('subject', stalled);
    const report = await createReport({ reporterId: reporter.id, targetType: 'user', targetId: subject.id, ...extraReport });
    return { reporter, subject, report };
  }

  it('place a legal hold -> Report detail lists it -> held-investigations flags it -> lift (twice: second is 409)', async () => {
    const moderator = await createAdmin('mod', 'moderator');
    const { reporter, subject, report } = await setup();

    const placed = await request(server())
      .post(`/admin/moderation/reports/${report.id}/holds/legal`)
      .set(auth(moderator.token))
      .send({ reason: REASON })
      .expect(201);
    expect(placed.body.holds.map((h: { userId: string }) => h.userId).sort()).toEqual([reporter.id, subject.id].sort());

    // Report detail: every existing field kept, plus the active holds.
    const detail = await request(server()).get(`/admin/moderation/reports/${report.id}`).set(auth(moderator.token)).expect(200);
    expect(detail.body).toMatchObject({ id: report.id, status: 'open', reason: 'e2e hold', concernsMinor: false });
    expect(detail.body.holds).toHaveLength(2);
    expect(detail.body.holds[0]).toEqual({
      id: expect.any(String),
      userId: expect.any(String),
      type: 'legal_hold',
      reportId: report.id,
      placedBy: moderator.adminId,
      placedAt: expect.any(String),
      expiresAt: null,
      liftedAt: null,
    });

    // held-investigations: the strongest hold is the admin one, with the marker.
    const list = await request(server()).get('/admin/users/held-investigations?olderThanDays=1').set(auth(moderator.token)).expect(200);
    const mine = list.body.items.filter((i: { userId: string }) => [reporter.id, subject.id].includes(i.userId));
    expect(mine).toHaveLength(2);
    for (const i of mine) {
      expect(i).toMatchObject({ holdType: 'legal_hold', isAdminHold: true });
      expect(Object.keys(i)).toEqual(expect.arrayContaining(['userId', 'displayName', 'email', 'heldSince', 'daysHeld']));
    }
    expect(list.body.thresholdDays).toBe(1);

    // lift one
    const holdId = detail.body.holds.find((h: { userId: string }) => h.userId === subject.id).id;
    const lifted = await request(server())
      .patch(`/admin/moderation/holds/${holdId}/lift`)
      .set(auth(moderator.token))
      .send({ reason: 'No longer needed for the case.' })
      .expect(200);
    expect(lifted.body.hold).toMatchObject({ id: holdId, liftedAt: expect.any(String) });

    const after = await request(server()).get(`/admin/moderation/reports/${report.id}`).set(auth(moderator.token)).expect(200);
    expect(after.body.holds.map((h: { userId: string }) => h.userId)).toEqual([reporter.id]);

    const again = await request(server())
      .patch(`/admin/moderation/holds/${holdId}/lift`)
      .set(auth(moderator.token))
      .send({ reason: 'Trying to lift it again.' })
      .expect(409);
    expect(again.body.code).toBe('hold_already_lifted');

    // The subject is no longer admin-held; the reporter still is.
    const list2 = await request(server()).get('/admin/users/held-investigations?olderThanDays=1').set(auth(moderator.token)).expect(200);
    const subjectRow = list2.body.items.find((i: { userId: string }) => i.userId === subject.id);
    expect(subjectRow === undefined || subjectRow.isAdminHold === false).toBe(true);
    expect(list2.body.items.find((i: { userId: string }) => i.userId === reporter.id)).toMatchObject({ isAdminHold: true });

    // Audit: 2 placements + 1 lift, written with the real admin FK. Nobody was notified.
    const logs = await prisma().adminActionLog.findMany({ where: { adminId: moderator.adminId } });
    expect(logs.filter((l) => l.action === ADMIN_ACTION_LOG_ACTIONS.ACCOUNT_HOLD_LEGAL_PLACED)).toHaveLength(2);
    expect(logs.filter((l) => l.action === ADMIN_ACTION_LOG_ACTIONS.ACCOUNT_HOLD_LIFTED)).toHaveLength(1);
    expect(await prisma().notification.count()).toBe(0);
  });

  it('place a bad-faith hold on the reporter: 6 months, shown on the report, duplicate refused, lift works', async () => {
    const moderator = await createAdmin('mod-bf', 'moderator');
    const { reporter, report } = await setup();

    const placed = await request(server())
      .post(`/admin/moderation/reports/${report.id}/holds/bad-faith`)
      .set(auth(moderator.token))
      .send({ reason: REASON })
      .expect(201);
    expect(placed.body.holds).toHaveLength(1);
    const hold = placed.body.holds[0];
    expect(hold).toMatchObject({ userId: reporter.id, type: 'bad_faith', reportId: report.id, placedBy: moderator.adminId, liftedAt: null });
    const months = (new Date(hold.expiresAt).getTime() - new Date(hold.placedAt).getTime()) / (30 * 24 * 60 * 60 * 1000);
    expect(months).toBeGreaterThan(5.5);
    expect(months).toBeLessThan(6.5);

    const dup = await request(server())
      .post(`/admin/moderation/reports/${report.id}/holds/bad-faith`)
      .set(auth(moderator.token))
      .send({ reason: REASON })
      .expect(409);
    expect(dup.body.code).toBe('hold_already_active');

    const detail = await request(server()).get(`/admin/moderation/reports/${report.id}`).set(auth(moderator.token)).expect(200);
    expect(detail.body.holds).toHaveLength(1);

    await request(server()).patch(`/admin/moderation/holds/${hold.id}/lift`).set(auth(moderator.token)).send({ reason: REASON }).expect(200);
    const afterLift = await request(server()).get(`/admin/moderation/reports/${report.id}`).set(auth(moderator.token)).expect(200);
    expect(afterLift.body.holds).toEqual([]);
    expect(await prisma().notification.count()).toBe(0);
  });

  it('works while an appeal is pending: Appeal Review uses the same routes', async () => {
    const moderator = await createAdmin('mod-appeal', 'moderator');
    const { report } = await setup({ status: 'actioned', actionTaken: 'warned', appealStatus: 'pending', appealReason: 'wrong person' });
    await request(server())
      .post(`/admin/moderation/reports/${report.id}/holds/legal`)
      .set(auth(moderator.token))
      .send({ reason: REASON })
      .expect(201);
  });

  it('refuses a bad-faith hold on a public report (no reporter account) with a coded 409', async () => {
    const moderator = await createAdmin('mod-public', 'moderator');
    const subject = await createUser('subject-public');
    const report = await createReport({ reporterId: null, reporterContactEmail: 'someone@example.com', targetType: 'user', targetId: subject.id });
    const res = await request(server())
      .post(`/admin/moderation/reports/${report.id}/holds/bad-faith`)
      .set(auth(moderator.token))
      .send({ reason: REASON })
      .expect(409);
    expect(res.body.code).toBe('reporter_has_no_account');
    expect(await prisma().accountHold.count()).toBe(0);
  });

  it('refuses a hold on an anonymised reporter with account_already_deleted', async () => {
    const moderator = await createAdmin('mod-del', 'moderator');
    const reporter = await createUser('reporter-del', { accountStatus: 'deleted' });
    const subject = await createUser('subject-del');
    const report = await createReport({ reporterId: reporter.id, targetType: 'user', targetId: subject.id });
    const res = await request(server())
      .post(`/admin/moderation/reports/${report.id}/holds/bad-faith`)
      .set(auth(moderator.token))
      .send({ reason: REASON })
      .expect(409);
    expect(res.body.code).toBe('account_already_deleted');
  });

  it('404s for an unknown report and an unknown hold (coded), and writes nothing', async () => {
    const moderator = await createAdmin('mod-404', 'moderator');
    const missing = '00000000-0000-4000-8000-000000000000';
    await request(server()).post(`/admin/moderation/reports/${missing}/holds/legal`).set(auth(moderator.token)).send({ reason: REASON }).expect(404);
    await request(server()).post(`/admin/moderation/reports/${missing}/holds/bad-faith`).set(auth(moderator.token)).send({ reason: REASON }).expect(404);
    const res = await request(server()).patch(`/admin/moderation/holds/${missing}/lift`).set(auth(moderator.token)).send({ reason: REASON }).expect(404);
    expect(res.body.code).toBe('hold_not_found');
    expect(await prisma().accountHold.count()).toBe(0);
    expect(await prisma().adminActionLog.count()).toBe(0);
  });

  it('enforces the guards with real tokens: no token 401, editor 403', async () => {
    const editor = await createAdmin('editor', 'editor');
    const { report } = await setup();
    await request(server()).post(`/admin/moderation/reports/${report.id}/holds/legal`).send({ reason: REASON }).expect(401);
    await request(server()).post(`/admin/moderation/reports/${report.id}/holds/legal`).set(auth(editor.token)).send({ reason: REASON }).expect(403);
    await request(server()).patch('/admin/moderation/holds/x/lift').send({ reason: REASON }).expect(401);
    expect(await prisma().accountHold.count()).toBe(0);
  });

  it('rejects a bad reason with 400 and writes nothing', async () => {
    const moderator = await createAdmin('mod-reason', 'moderator');
    const { report } = await setup();
    for (const reason of ['too short', 'x'.repeat(501), '           ']) {
      await request(server()).post(`/admin/moderation/reports/${report.id}/holds/legal`).set(auth(moderator.token)).send({ reason }).expect(400);
    }
    expect(await prisma().accountHold.count()).toBe(0);
    expect(await prisma().adminActionLog.count()).toBe(0);
  });

  describe('a report that concerns a minor (child-safety vetting)', () => {
    it('an unvetted admin gets 403 on place, lift and the detail read; a vetted admin can do all three', async () => {
      const unvetted = await createAdmin('unvetted', 'superadmin', false);
      const vetted = await createAdmin('vetted', 'moderator', true);
      const { report } = await setup({ concernsMinor: true });

      for (const url of [`/admin/moderation/reports/${report.id}/holds/legal`, `/admin/moderation/reports/${report.id}/holds/bad-faith`]) {
        const res = await request(server()).post(url).set(auth(unvetted.token)).send({ reason: REASON }).expect(403);
        expect(res.body.code).toBe('child_safety_vetting_required');
      }
      await request(server()).get(`/admin/moderation/reports/${report.id}`).set(auth(unvetted.token)).expect(403);
      expect(await prisma().accountHold.count()).toBe(0);

      const placed = await request(server())
        .post(`/admin/moderation/reports/${report.id}/holds/legal`)
        .set(auth(vetted.token))
        .send({ reason: REASON })
        .expect(201);
      const holdId = placed.body.holds[0].id;

      // lift: unvetted blocked, vetted allowed
      const blocked = await request(server()).patch(`/admin/moderation/holds/${holdId}/lift`).set(auth(unvetted.token)).send({ reason: REASON }).expect(403);
      expect(blocked.body.code).toBe('child_safety_vetting_required');
      expect((await prisma().accountHold.findUniqueOrThrow({ where: { id: holdId } })).liftedAt).toBeNull();
      await request(server()).patch(`/admin/moderation/holds/${holdId}/lift`).set(auth(vetted.token)).send({ reason: REASON }).expect(200);
    });
  });
});
