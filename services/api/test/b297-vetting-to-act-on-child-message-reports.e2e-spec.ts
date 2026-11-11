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
});
