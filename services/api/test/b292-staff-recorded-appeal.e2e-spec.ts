import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AdminTokenService } from '../src/modules/admin/token/admin-token.service';
import { PasswordService } from '../src/modules/auth/password/password.service';
import { TokenService } from '../src/modules/auth/token/token.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { seedDob } from './dob-seed';

// backend/b292-staff-recorded-appeal (B-292, Decision Log #485 (f), #492), against REAL Postgres. A suspended person
// cannot sign in, so staff record the appeal on their behalf; the recorder and the original actioner may not decide
// it; a third admin can, and overturning reinstates the account (B-291). Setup copied from
// b291-suspension-on-report.e2e-spec.ts.
describe('Staff-recorded appeal e2e (b292-staff-recorded-appeal)', () => {
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
  const PASSWORD = 'the-real-password';
  const DAY = 24 * 60 * 60 * 1000;

  async function createUser(label: string, over: { isMinor?: boolean; accountStatus?: string } = {}) {
    const prisma = getTestPrismaClient();
    const passwordHash = await app.get(PasswordService).hash(PASSWORD);
    const user = await prisma.user.create({
      data: {
        email: `e2e-b292-${label}-${Date.now()}-${rand()}@example.com`,
        passwordHash,
        displayName: `Real Name ${label}`,
        username: `a_${label}_${rand().slice(0, 5)}`,
        verificationStatus: 'verified',
        dateOfBirth: seedDob(over.isMinor ? '2012-03-03' : '1993-03-03'),
        isMinor: over.isMinor ?? false,
        accountStatus: over.accountStatus ?? 'active',
      },
    });
    const { accessToken } = await app.get(TokenService).issueTokenPair(user.id, user.role);
    return { userId: user.id, email: user.email, accessToken: accessToken.token };
  }

  async function createAdmin(label: string, vetted = true) {
    const prisma = getTestPrismaClient();
    const admin = await prisma.adminUser.create({
      data: {
        email: `e2e-b292-admin-${label}-${Date.now()}-${rand()}@example.com`,
        passwordHash: 'unused',
        fullName: `E2E Appeal Admin ${label}`,
        role: 'moderator',
        childSafetyVetted: vetted,
      },
    });
    const { accessToken } = await app.get(AdminTokenService).issueTokenPair(admin.id, admin.role);
    return { adminId: admin.id, accessToken: accessToken.token };
  }

  const record = (adminToken: string, reportId: string, reason = 'They emailed support to appeal the suspension.') =>
    request(server()).post(`/admin/moderation/reports/${reportId}/appeal`).set(auth(adminToken)).send({ reason });

  const decide = (adminToken: string, reportId: string, decision: string) =>
    request(server()).patch(`/admin/moderation/reports/${reportId}/appeal`).set(auth(adminToken)).send({ decision });

  // An actioned report seeded straight into Postgres (the rules under test start after the action).
  async function seedActioned(over: {
    targetType?: string;
    targetId: string;
    actionTaken?: string;
    reviewedByAdminId: string;
    reviewedAt?: Date;
    concernsMinor?: boolean;
  }) {
    return getTestPrismaClient().report.create({
      data: {
        reporterId: null,
        reporterContactEmail: 'someone@example.com',
        targetType: over.targetType ?? 'user',
        targetId: over.targetId,
        reason: '',
        reasonCategory: 'spam_or_scam',
        status: 'actioned',
        actionTaken: over.actionTaken ?? 'user_suspended',
        reviewedByAdminId: over.reviewedByAdminId,
        reviewedAt: over.reviewedAt ?? new Date(),
        concernsMinor: over.concernsMinor ?? false,
      },
    });
  }

  it('records the appeal for a suspended person; recorder and actioner cannot decide; a third admin overturns and the account is reinstated', async () => {
    const prisma = getTestPrismaClient();
    const reporter = await createUser('reporter');
    const target = await createUser('target');
    const actioner = await createAdmin('actioner');
    const recorder = await createAdmin('recorder');
    const third = await createAdmin('third');

    const report = (
      await request(server())
        .post('/reports')
        .set(auth(reporter.accessToken))
        .send({ targetType: 'user', targetId: target.userId, reasonCategory: 'spam_or_scam' })
        .expect(201)
    ).body;
    await request(server())
      .patch(`/admin/moderation/reports/${report.id}`)
      .set(auth(actioner.accessToken))
      .send({ action: 'user_suspended' })
      .expect(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.userId } })).accountStatus).toBe('suspended');
    const notificationsBefore = await prisma.notification.count({ where: { userId: target.userId } });

    const reason = 'They emailed support to appeal the suspension.';
    const res = await record(recorder.accessToken, report.id, reason).expect(201);
    expect(res.body).toMatchObject({ appealStatus: 'pending', appealRecordedByAdminId: recorder.adminId, appealRecordedByStaff: true });

    const row = await prisma.report.findUniqueOrThrow({ where: { id: report.id } });
    expect(row.appealStatus).toBe('pending');
    expect(row.appealReason).toBe(reason);
    expect(row.appealedAt).not.toBeNull();
    expect(row.appealRecordedByAdminId).toBe(recorder.adminId);

    // audited, without the reason; the reported person is told nothing
    const logs = await prisma.adminActionLog.findMany({ where: { action: 'report.appeal_recorded', targetId: report.id } });
    expect(logs).toHaveLength(1);
    expect(logs[0].adminId).toBe(recorder.adminId);
    expect(JSON.stringify(logs[0])).not.toContain(reason);
    expect(await prisma.notification.count({ where: { userId: target.userId } })).toBe(notificationsBefore);

    // detail and queue row say it was recorded by staff
    const detail = (await request(server()).get(`/admin/moderation/reports/${report.id}`).set(auth(third.accessToken)).expect(200)).body;
    expect(detail.appealRecordedByStaff).toBe(true);
    expect(detail.appealRecordedBy).toEqual({ id: recorder.adminId, fullName: 'E2E Appeal Admin recorder' });
    const queue = (await request(server()).get('/admin/moderation/reports').set(auth(third.accessToken)).expect(200)).body;
    expect(queue.items.find((i: { id: string }) => i.id === report.id).appealRecordedByStaff).toBe(true);

    // a second record is a 409
    await record(recorder.accessToken, report.id).expect(409);

    // recorder cannot decide; the original actioner cannot decide
    const byRecorder = await decide(recorder.accessToken, report.id, 'overturned').expect(403);
    expect(byRecorder.body.code).toBe('appeal_recorder_cannot_decide');
    const byActioner = await decide(actioner.accessToken, report.id, 'overturned').expect(403);
    expect(byActioner.body.message).toMatch(/actioned this report/);

    // a third admin overturns: the account is active again and the link cleared
    await decide(third.accessToken, report.id, 'overturned').expect(200);
    const restored = await prisma.user.findUniqueOrThrow({ where: { id: target.userId } });
    expect(restored.accountStatus).toBe('active');
    expect(restored.suspendedByReportId).toBeNull();
    await request(server()).post('/auth/login').send({ email: target.email, password: PASSWORD }).expect(200);
  });

  it('a self-filed appeal shows appealRecordedByStaff false and a null recorder', async () => {
    const target = await createUser('self');
    const actioner = await createAdmin('a2');
    const reader = await createAdmin('r2');
    const report = await seedActioned({ targetId: target.userId, reviewedByAdminId: actioner.adminId, actionTaken: 'warning_issued' });
    await request(server()).post(`/reports/${report.id}/appeal`).set(auth(target.accessToken)).send({ reason: 'mine' }).expect(201);
    const detail = (await request(server()).get(`/admin/moderation/reports/${report.id}`).set(auth(reader.accessToken)).expect(200)).body;
    expect(detail.appealRecordedByStaff).toBe(false);
    expect(detail.appealRecordedBy).toBeNull();
  });

  it('refuses a closed window with the same code and message as a self-filed appeal', async () => {
    const target = await createUser('late', { accountStatus: 'suspended' });
    const actioner = await createAdmin('a3');
    const recorder = await createAdmin('r3');
    const report = await seedActioned({
      targetId: target.userId,
      reviewedByAdminId: actioner.adminId,
      reviewedAt: new Date(Date.now() - 400 * DAY),
    });
    const res = await record(recorder.accessToken, report.id).expect(403);
    expect(res.body).toMatchObject({ code: 'appeal_window_closed', message: 'The time allowed for appealing this report has passed.' });
    expect((await getTestPrismaClient().report.findUniqueOrThrow({ where: { id: report.id } })).appealStatus).toBeNull();
  });

  it('refuses a non-suspension action with 400 staff_appeal_not_applicable', async () => {
    const target = await createUser('warned');
    const actioner = await createAdmin('a4');
    const recorder = await createAdmin('r4');
    const report = await seedActioned({ targetId: target.userId, reviewedByAdminId: actioner.adminId, actionTaken: 'warning_issued' });
    const res = await record(recorder.accessToken, report.id).expect(400);
    expect(res.body.code).toBe('staff_appeal_not_applicable');
  });

  it('a deleted (anonymised) account gives 409 reported_account_unavailable', async () => {
    const target = await createUser('gone', { accountStatus: 'deleted' });
    const actioner = await createAdmin('a5');
    const recorder = await createAdmin('r5');
    const report = await seedActioned({ targetId: target.userId, reviewedByAdminId: actioner.adminId });
    const res = await record(recorder.accessToken, report.id).expect(409);
    expect(res.body.code).toBe('reported_account_unavailable');
  });

  it('a concernsMinor report needs a vetted admin to record', async () => {
    const target = await createUser('cm', { accountStatus: 'suspended' });
    const actioner = await createAdmin('a6');
    const unvetted = await createAdmin('u6', false);
    const vetted = await createAdmin('v6');
    const report = await seedActioned({ targetId: target.userId, reviewedByAdminId: actioner.adminId, concernsMinor: true });
    const res = await record(unvetted.accessToken, report.id).expect(403);
    expect(res.body.code).toBe('child_safety_vetting_required');
    await record(vetted.accessToken, report.id).expect(201);
  });

  it('a message report whose thread involves a child needs a vetted admin to record', async () => {
    const prisma = getTestPrismaClient();
    const sender = await createUser('sender', { accountStatus: 'suspended' });
    const child = await createUser('child', { isMinor: true });
    const actioner = await createAdmin('a7');
    const unvetted = await createAdmin('u7', false);
    const vetted = await createAdmin('v7');
    const ids = [sender.userId, child.userId].sort();
    const conversation = await prisma.conversation.create({
      data: { participantIds: ids, participantKey: ids.join(':') },
    });
    const message = await prisma.message.create({
      data: { conversationId: conversation.id, senderId: sender.userId, contentText: 'b292 message' },
    });
    const report = await seedActioned({ targetType: 'message', targetId: message.id, reviewedByAdminId: actioner.adminId });
    const res = await record(unvetted.accessToken, report.id).expect(403);
    expect(res.body.code).toBe('child_safety_vetting_required');
    await record(vetted.accessToken, report.id).expect(201);
  });
});
