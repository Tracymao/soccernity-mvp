import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AdminTokenService } from '../src/modules/admin/token/admin-token.service';
import { TokenService } from '../src/modules/auth/token/token.service';
import { CHILD_SAFETY_VETTING_REQUIRED_CODE } from '../src/modules/moderation/moderation.constants';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { seedDob } from './dob-seed';

// backend/b297-vetting-to-act-on-child-message-reports (B-297, Decision Log #491), against REAL Postgres. Where the
// reported sender or any participant of the conversation is under 18, only a child-safety-vetted admin may ACT on a
// message report, even when the report itself is not flagged concernsMinor.
// B-302 (#498, #499) extends it to the three hold routes (place bad-faith, place legal, lift): see the last describe.
describe('Vetting to act on a child-involved message report e2e (B-297)', () => {
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

  async function createUser(label: string) {
    const prisma = getTestPrismaClient();
    const user = await prisma.user.create({
      data: {
        email: `e2e-b297-${label}-${Date.now()}-${rand()}@example.com`,
        passwordHash: 'unused-in-this-e2e-spec-file',
        displayName: `Real Name ${label}`,
        username: `v_${label}_${rand().slice(0, 5)}`,
        verificationStatus: 'verified',
        dateOfBirth: seedDob('1993-03-03'),
        isMinor: false,
      },
    });
    const { accessToken } = await app.get(TokenService).issueTokenPair(user.id, user.role);
    return { userId: user.id, accessToken: accessToken.token };
  }

  async function createAdmin(childSafetyVetted: boolean) {
    const prisma = getTestPrismaClient();
    const admin = await prisma.adminUser.create({
      data: {
        email: `e2e-b297-admin-${Date.now()}-${rand()}@example.com`,
        passwordHash: 'unused',
        fullName: 'E2E B297 Admin',
        role: 'moderator',
        childSafetyVetted,
      },
    });
    const { accessToken } = await app.get(AdminTokenService).issueTokenPair(admin.id, admin.role);
    return { adminId: admin.id, accessToken: accessToken.token };
  }

  // The recipient reports the sender's message (spam, so concernsMinor stays false). With `minorSender` the sender
  // is then marked under 18, as the age reclassification sweep would; the rule reads isMinor at action time.
  async function setup(minorSender: boolean) {
    const prisma = getTestPrismaClient();
    const sender = await createUser('sender');
    const recipient = await createUser('recipient');
    const ids = [sender.userId, recipient.userId].sort();
    const conversation = await prisma.conversation.create({
      data: { participantIds: ids, participantKey: ids.join(':'), lastMessageAt: new Date('2026-02-01T10:00:00Z') },
    });
    const message = await prisma.message.create({
      data: { conversationId: conversation.id, senderId: sender.userId, contentText: 'reported', sentAt: new Date('2026-02-01T10:00:00Z') },
    });
    const report = (
      await request(server())
        .post('/reports')
        .set(auth(recipient.accessToken))
        .send({ targetType: 'message', targetId: message.id, reasonCategory: 'spam_or_scam' })
        .expect(201)
    ).body;
    expect(report.concernsMinor).toBe(false);
    if (minorSender) await prisma.user.update({ where: { id: sender.userId }, data: { isMinor: true } });
    return { prisma, report };
  }

  const act = (token: string, id: string) =>
    request(server()).patch(`/admin/moderation/reports/${id}`).set(auth(token)).send({ action: 'warning_issued' });

  it('an unvetted admin acting on a child-involved message report gets 403 and the report is unchanged', async () => {
    const { prisma, report } = await setup(true);
    const before = await prisma.report.findUniqueOrThrow({ where: { id: report.id } });
    const unvetted = await createAdmin(false);
    const res = await act(unvetted.accessToken, report.id).expect(403);
    expect(res.body.code).toBe(CHILD_SAFETY_VETTING_REQUIRED_CODE);
    const after = await prisma.report.findUniqueOrThrow({ where: { id: report.id } });
    expect(after).toEqual(before);
    expect(after.status).toBe('open');
    expect(after.reviewedByAdminId).toBeNull();

    // viewing stays open, with the context hidden (B-293)
    const detail = await request(server()).get(`/admin/moderation/reports/${report.id}`).set(auth(unvetted.accessToken)).expect(200);
    expect(detail.body.contextHidden).toBe(true);
  });

  it('a vetted admin acting on the same kind of report succeeds', async () => {
    const { prisma, report } = await setup(true);
    const vetted = await createAdmin(true);
    await act(vetted.accessToken, report.id).expect(200);
    const after = await prisma.report.findUniqueOrThrow({ where: { id: report.id } });
    expect(after.status).toBe('actioned');
    expect(after.actionTaken).toBe('warning_issued');
    expect(after.reviewedByAdminId).toBe(vetted.adminId);
  });

  it('an unvetted admin acting on an adult-only thread succeeds', async () => {
    const { prisma, report } = await setup(false);
    const unvetted = await createAdmin(false);
    await act(unvetted.accessToken, report.id).expect(200);
    expect((await prisma.report.findUniqueOrThrow({ where: { id: report.id } })).status).toBe('actioned');
  });

  // B-302 (Decision Log #498, #499): the same rule on the three hold routes (place bad-faith, place legal, lift).
  // A refusal must write nothing: no AccountHold row created or lifted, no admin action log row.
  describe('the hold routes (B-302)', () => {
    const REASON = 'Evidence preserved for the regulator.';
    const placeBadFaith = (token: string, reportId: string) =>
      request(server()).post(`/admin/moderation/reports/${reportId}/holds/bad-faith`).set(auth(token)).send({ reason: REASON });
    const placeLegal = (token: string, reportId: string) =>
      request(server()).post(`/admin/moderation/reports/${reportId}/holds/legal`).set(auth(token)).send({ reason: REASON });
    const lift = (token: string, holdId: string) =>
      request(server()).patch(`/admin/moderation/holds/${holdId}/lift`).set(auth(token)).send({ reason: 'No longer needed for the case.' });
    const counts = async () => {
      const prisma = getTestPrismaClient();
      return { holds: await prisma.accountHold.count(), lifted: await prisma.accountHold.count({ where: { liftedAt: { not: null } } }), audit: await prisma.adminActionLog.count() };
    };

    it('an unvetted admin placing a bad-faith or legal hold on a child-involved message report gets 403 and nothing is written', async () => {
      const { report } = await setup(true);
      const unvetted = await createAdmin(false);
      const before = await counts();

      for (const place of [placeBadFaith, placeLegal]) {
        const res = await place(unvetted.accessToken, report.id).expect(403);
        expect(res.body.code).toBe(CHILD_SAFETY_VETTING_REQUIRED_CODE);
        expect(res.body.message).toBe('This action requires a child-safety-vetted admin.');
      }
      expect(await counts()).toEqual(before);
    });

    it('an unvetted admin lifting a hold on a child-involved message report gets 403; the hold stays and nothing is logged', async () => {
      const { prisma, report } = await setup(true);
      const vetted = await createAdmin(true);
      const placed = await placeLegal(vetted.accessToken, report.id).expect(201);
      const holdId = placed.body.holds[0].id;
      const unvetted = await createAdmin(false);
      const before = await counts();

      const res = await lift(unvetted.accessToken, holdId).expect(403);
      expect(res.body.code).toBe(CHILD_SAFETY_VETTING_REQUIRED_CODE);
      expect(await counts()).toEqual(before);
      expect((await prisma.accountHold.findUniqueOrThrow({ where: { id: holdId } })).liftedAt).toBeNull();
    });

    it('a vetted admin may place and lift holds on a child-involved message report', async () => {
      const { prisma, report } = await setup(true);
      const vetted = await createAdmin(true);
      const before = await counts();

      const placed = await placeLegal(vetted.accessToken, report.id).expect(201);
      expect(placed.body.holds).toHaveLength(2);
      const bad = await placeBadFaith(vetted.accessToken, report.id).expect(201);
      expect(bad.body.holds).toHaveLength(1);
      const lifted = await lift(vetted.accessToken, placed.body.holds[0].id).expect(200);
      expect(lifted.body.hold.liftedAt).toEqual(expect.any(String));

      const after = await counts();
      expect(after.holds).toBe(before.holds + 3);
      expect(after.lifted).toBe(before.lifted + 1);
      expect(after.audit).toBe(before.audit + 4);
      expect((await prisma.accountHold.findUniqueOrThrow({ where: { id: placed.body.holds[0].id } })).liftedByAdminId).toBe(vetted.adminId);
    });

    it('an unvetted admin may place and lift holds when everyone in the thread is an adult', async () => {
      const { prisma, report } = await setup(false);
      const unvetted = await createAdmin(false);
      const before = await counts();

      const placed = await placeBadFaith(unvetted.accessToken, report.id).expect(201);
      const holdId = placed.body.holds[0].id;
      expect(await prisma.accountHold.findUnique({ where: { id: holdId } })).not.toBeNull();
      await lift(unvetted.accessToken, holdId).expect(200);

      const after = await counts();
      expect(after).toEqual({ holds: before.holds + 1, lifted: before.lifted + 1, audit: before.audit + 2 });
    });

    it('a concernsMinor report still needs a vetted admin, thread or no thread (unchanged)', async () => {
      const { prisma, report } = await setup(false);
      await prisma.report.update({ where: { id: report.id }, data: { concernsMinor: true } });
      const unvetted = await createAdmin(false);
      const before = await counts();
      await placeBadFaith(unvetted.accessToken, report.id).expect(403);
      expect(await counts()).toEqual(before);
    });

    it('a user report about a minor that is not concernsMinor is unchanged: an unvetted admin may place a hold', async () => {
      const { prisma, report } = await setup(true);
      const message = await prisma.message.findFirstOrThrow({ where: { id: report.targetId } });
      const userReport = await prisma.report.create({
        data: { reporterId: report.reporterId, targetType: 'user', targetId: message.senderId, reason: 'e2e', status: 'open' },
      });
      const unvetted = await createAdmin(false);
      await placeBadFaith(unvetted.accessToken, userReport.id).expect(201);
    });

    it('fails closed when the message row has been removed: an unvetted admin is refused and nothing is written', async () => {
      const { prisma, report } = await setup(false);
      await prisma.message.delete({ where: { id: report.targetId } });
      const unvetted = await createAdmin(false);
      const before = await counts();
      const res = await placeBadFaith(unvetted.accessToken, report.id).expect(403);
      expect(res.body.code).toBe(CHILD_SAFETY_VETTING_REQUIRED_CODE);
      expect(await counts()).toEqual(before);
    });

    it('a hold whose report was purged (reportId NULL) may be lifted by an unvetted admin (Decision Log #499)', async () => {
      const { prisma, report } = await setup(true);
      const vetted = await createAdmin(true);
      const message = await prisma.message.findFirstOrThrow({ where: { id: report.targetId } });
      const hold = await prisma.accountHold.create({
        data: { userId: message.senderId, type: 'legal_hold', reportId: null, placedByAdminId: vetted.adminId, placeReason: 'kept after the report was purged' },
      });
      const unvetted = await createAdmin(false);
      await lift(unvetted.accessToken, hold.id).expect(200);
      expect((await prisma.accountHold.findUniqueOrThrow({ where: { id: hold.id } })).liftedAt).not.toBeNull();
    });

    it('404 is settled before the gate: a missing report or hold is 404 for an unvetted admin', async () => {
      const unvetted = await createAdmin(false);
      await placeBadFaith(unvetted.accessToken, '00000000-0000-4000-8000-000000000000').expect(404);
      await placeLegal(unvetted.accessToken, '00000000-0000-4000-8000-000000000000').expect(404);
      await lift(unvetted.accessToken, '00000000-0000-4000-8000-000000000000').expect(404);
    });

    it('viewing is unchanged: an unvetted admin still opens a child-involved message report, with the context hidden', async () => {
      const { report } = await setup(true);
      const unvetted = await createAdmin(false);
      const detail = await request(server()).get(`/admin/moderation/reports/${report.id}`).set(auth(unvetted.accessToken)).expect(200);
      expect(detail.body.contextHidden).toBe(true);
    });
  });
});
