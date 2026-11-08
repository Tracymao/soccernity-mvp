import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { findInvolvedReports } from '../src/modules/account-hold/account-hold.rules';
import { AdminTokenService } from '../src/modules/admin/token/admin-token.service';
import { TokenService } from '../src/modules/auth/token/token.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { seedDob } from './dob-seed';

// backend/b067-message-report (founder decision 2026-11-08). Reporting a message in a chat, against REAL Postgres:
// the participant/visibility rules (every refusal is the same 404, IDOR checks), the one-open-report-per-message
// rule under real concurrency (the advisory lock), the admin read of the reported message (edited, deleted for
// everyone, only THAT message), POST /reports/public refusing the type, and the sender being resolved as the
// reported user (outcome notification, report hold). The mocked unit suite covers the branching; this proves the
// SQL.
describe('Message reports e2e (b067-message-report)', () => {
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

  async function createUser(label: string): Promise<{ userId: string; accessToken: string }> {
    const prisma = getTestPrismaClient();
    const user = await prisma.user.create({
      data: {
        email: `e2e-msgrep-${label}-${Date.now()}-${rand()}@example.com`,
        passwordHash: 'unused-in-this-e2e-spec-file',
        displayName: `Real Name ${label}`,
        username: `mr_${label}_${rand().slice(0, 5)}`,
        verificationStatus: 'verified',
        dateOfBirth: seedDob('1993-03-03'),
        isMinor: false,
      },
    });
    const { accessToken } = await app.get(TokenService).issueTokenPair(user.id, user.role);
    return { userId: user.id, accessToken: accessToken.token };
  }

  async function createAdmin(role = 'moderator', childSafetyVetted = true) {
    const prisma = getTestPrismaClient();
    const admin = await prisma.adminUser.create({
      data: {
        email: `e2e-msgrep-admin-${Date.now()}-${rand()}@example.com`,
        passwordHash: 'unused',
        fullName: 'E2E Msgrep Admin',
        role,
        childSafetyVetted,
      },
    });
    const { accessToken } = await app.get(AdminTokenService).issueTokenPair(admin.id, admin.role);
    return { adminId: admin.id, accessToken: accessToken.token };
  }

  // A two-person conversation with two messages from `sender`, so "only THAT message" can be told apart from
  // "the whole thread".
  async function setup() {
    const prisma = getTestPrismaClient();
    const sender = await createUser('sender');
    const recipient = await createUser('recipient');
    const stranger = await createUser('stranger');
    const ids = [sender.userId, recipient.userId].sort();
    const conversation = await prisma.conversation.create({
      data: { participantIds: ids, participantKey: ids.join(':'), lastMessageAt: new Date('2026-02-01T10:00:00Z') },
    });
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: sender.userId,
        contentText: 'the reported text',
        sentAt: new Date('2026-02-01T10:00:00Z'),
      },
    });
    const other = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: recipient.userId,
        contentText: 'THE RECIPIENTS OWN REPLY',
        sentAt: new Date('2026-02-01T10:01:00Z'),
      },
    });
    return { prisma, sender, recipient, stranger, conversation, message, other };
  }

  const report = (token: string, messageId: string, over: Record<string, unknown> = {}) =>
    request(server())
      .post('/reports')
      .set(auth(token))
      .send({ targetType: 'message', targetId: messageId, reasonCategory: 'harassment_or_bullying', ...over });

  // ---------- who may report ----------

  describe('POST /reports with targetType message', () => {
    it('the recipient reports: 201, a real Report row with the message as the target and the recipient as reporter', async () => {
      const { prisma, recipient, message } = await setup();
      const res = await report(recipient.accessToken, message.id, { reason: 'rude', severity: 'high' }).expect(201);
      expect(res.body).toMatchObject({ targetType: 'message', targetId: message.id, reporterId: recipient.userId, status: 'open' });
      const row = await prisma.report.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(row).toMatchObject({
        reporterId: recipient.userId,
        targetType: 'message',
        targetId: message.id,
        reason: 'rude',
        reasonCategory: 'harassment_or_bullying',
        severity: 'high',
        concernsMinor: false,
        status: 'open',
      });
    });

    it('child_safety_concern raises the minor flag exactly as for any other target (Decision Log #466)', async () => {
      const { prisma, recipient, message } = await setup();
      const res = await report(recipient.accessToken, message.id, { reasonCategory: 'child_safety_concern' }).expect(201);
      expect((await prisma.report.findUniqueOrThrow({ where: { id: res.body.id } })).concernsMinor).toBe(true);
    });

    it('IDOR: the SENDER gets 404, and no row is created', async () => {
      const { prisma, sender, message } = await setup();
      await report(sender.accessToken, message.id).expect(404);
      expect(await prisma.report.count()).toBe(0);
    });

    it('IDOR: a stranger who is not in the conversation gets the SAME 404 a missing message gives (body identical)', async () => {
      const { prisma, stranger, message } = await setup();
      const forStranger = await report(stranger.accessToken, message.id).expect(404);
      const forMissing = await report(stranger.accessToken, '22222222-2222-4222-8222-222222222222').expect(404);
      expect(forStranger.body).toEqual(forMissing.body);
      expect(await prisma.report.count()).toBe(0);
    });

    it('IDOR: a participant of a DIFFERENT conversation cannot report this message', async () => {
      const { prisma, message, stranger } = await setup();
      const third = await createUser('third');
      const ids = [stranger.userId, third.userId].sort();
      await prisma.conversation.create({ data: { participantIds: ids, participantKey: ids.join(':') } });
      await report(third.accessToken, message.id).expect(404);
      expect(await prisma.report.count()).toBe(0);
    });

    it('a signed-out caller is 401', async () => {
      const { message } = await setup();
      await request(server()).post('/reports').send({ targetType: 'message', targetId: message.id, reasonCategory: 'spam_or_scam' }).expect(401);
    });

    it('a message the recipient hid for themselves (delete for me) is 404; the SENDER hiding it does not matter', async () => {
      const { prisma, sender, recipient, message } = await setup();
      await prisma.messageHide.create({ data: { userId: sender.userId, messageId: message.id } });
      await report(recipient.accessToken, message.id).expect(201); // the sender hiding it changes nothing for the recipient

      await resetDatabase();
      const s2 = await setup();
      await s2.prisma.messageHide.create({ data: { userId: s2.recipient.userId, messageId: s2.message.id } });
      await report(s2.recipient.accessToken, s2.message.id).expect(404);
      expect(await s2.prisma.report.count()).toBe(0);
    });

    it('a message deleted for everyone is 404 (it is not visible to the recipient any more)', async () => {
      const { prisma, recipient, message } = await setup();
      await prisma.message.update({ where: { id: message.id }, data: { deletedForEveryoneAt: new Date() } });
      await report(recipient.accessToken, message.id).expect(404);
      expect(await prisma.report.count()).toBe(0);
    });

    it('a message sent at or before the moment the recipient deleted the chat is 404; one sent after is reportable', async () => {
      const { prisma, recipient, conversation, message } = await setup();
      await prisma.conversationHide.create({
        data: { userId: recipient.userId, conversationId: conversation.id, hiddenAt: message.sentAt },
      });
      await report(recipient.accessToken, message.id).expect(404);

      const newer = await prisma.message.create({
        data: { conversationId: conversation.id, senderId: message.senderId, contentText: 'after the chat was deleted', sentAt: new Date('2026-02-02T10:00:00Z') },
      });
      await report(recipient.accessToken, newer.id).expect(201);
      expect(await prisma.report.count()).toBe(1);
    });

    it('a block does not stop the recipient reporting what the blocked person wrote', async () => {
      const { prisma, recipient, sender, message } = await setup();
      await prisma.block.create({ data: { blockerId: recipient.userId, blockedId: sender.userId } });
      await report(recipient.accessToken, message.id).expect(201);
    });

    it('a restricted-pending minor can still report (JwtAuthGuard only, like every report)', async () => {
      const { prisma, recipient, message } = await setup();
      await prisma.user.update({ where: { id: recipient.userId }, data: { isMinor: true } });
      await prisma.guardian.create({
        data: {
          minorUserId: recipient.userId,
          name: 'G',
          email: `g-${rand()}@example.com`,
          relationship: 'Parent',
          consentToken: `t-${rand()}`,
          consentStatus: 'pending',
          consentTokenExpiresAt: new Date(Date.now() + 72 * 3600 * 1000),
        },
      });
      await report(recipient.accessToken, message.id).expect(201);
    });

    it('a malformed id is a validation 400 (as for every report target)', async () => {
      const { recipient } = await setup();
      await report(recipient.accessToken, 'not-a-uuid').expect(400);
    });
  });

  // ---------- the public route ----------

  describe('POST /reports/public', () => {
    it('never accepts a message target: 400 from the DTO, whether or not the message exists, and no row', async () => {
      const { prisma, message } = await setup();
      const body = (targetId: string) => ({
        reporterContactEmail: 'someone@example.com',
        targetType: 'message',
        targetId,
        reasonCategory: 'spam_or_scam',
        concernsMinor: false,
      });
      const real = await request(server()).post('/reports/public').send(body(message.id)).expect(400);
      const missing = await request(server()).post('/reports/public').send(body('22222222-2222-4222-8222-222222222222')).expect(400);
      expect(real.body).toEqual(missing.body); // reveals nothing about whether the message exists
      expect(await prisma.report.count()).toBe(0);
    });
  });

  // ---------- one open report per reporter per message ----------

  describe('one open report per reporter per message', () => {
    it('a repeat returns the existing report and creates no second row', async () => {
      const { prisma, recipient, message } = await setup();
      const first = await report(recipient.accessToken, message.id).expect(201);
      const second = await report(recipient.accessToken, message.id, { reasonCategory: 'spam_or_scam' }).expect(201);
      expect(second.body.id).toBe(first.body.id);
      expect(second.body.reasonCategory).toBe('harassment_or_bullying'); // the original, unchanged
      expect(await prisma.report.count({ where: { targetType: 'message' } })).toBe(1);
    });

    it('two simultaneous reports from the same person create exactly one row (advisory lock, real Postgres)', async () => {
      const { prisma, recipient, message } = await setup();
      const results = await Promise.all(
        Array.from({ length: 6 }, () => report(recipient.accessToken, message.id)),
      );
      expect(results.every((r) => r.status === 201)).toBe(true);
      expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
      expect(await prisma.report.count({ where: { targetType: 'message' } })).toBe(1);
    });

    it('once the earlier report is closed, the recipient can report the message again', async () => {
      const { prisma, recipient, message } = await setup();
      const first = await report(recipient.accessToken, message.id).expect(201);
      await prisma.report.update({ where: { id: first.body.id }, data: { status: 'reviewed' } });
      const again = await report(recipient.accessToken, message.id).expect(201);
      expect(again.body.id).not.toBe(first.body.id);
      expect(await prisma.report.count({ where: { targetType: 'message' } })).toBe(2);
    });
  });

  // ---------- the admin read ----------

  describe('GET /admin/moderation/reports/:id', () => {
    async function reported(over: (ctx: Awaited<ReturnType<typeof setup>>) => Promise<void> = async () => undefined) {
      const ctx = await setup();
      await over(ctx);
      const res = await report(ctx.recipient.accessToken, ctx.message.id).expect(201);
      const admin = await createAdmin();
      return { ...ctx, reportId: res.body.id as string, admin };
    }
    const detail = (token: string, id: string) => request(server()).get(`/admin/moderation/reports/${id}`).set(auth(token));

    it('returns the report with ONLY the reported message: sender public name, sentAt, current text, no original, not edited, not deleted', async () => {
      const { admin, reportId, message, sender } = await reported();
      const res = await detail(admin.accessToken, reportId).expect(200);
      expect(res.body.reportedMessage).toEqual({
        id: message.id,
        sentAt: '2026-02-01T10:00:00.000Z',
        sender: { publicName: expect.stringMatching(/^mr_sender_/) },
        contentText: 'the reported text',
        originalContentText: null,
        editedAt: null,
        deletedForEveryone: false,
      });
      // Nothing about the rest of the conversation or either person's real identity.
      const raw = JSON.stringify(res.body);
      expect(raw).not.toContain('THE RECIPIENTS OWN REPLY');
      expect(raw).not.toContain('Real Name sender');
      expect(raw).not.toContain('Real Name recipient');
      expect(raw).not.toContain(sender.userId); // the sender's id is not in the message view
      expect(raw).not.toContain('participantIds');
      expect(raw).not.toContain('conversationId');
    });

    it('after the sender EDITS the message: the moderator sees the new text, the ORIGINAL and editedAt', async () => {
      const edited = new Date('2026-02-01T10:05:00Z');
      const { admin, reportId } = await reported(async ({ prisma, message }) => {
        await prisma.message.update({
          where: { id: message.id },
          data: { contentText: 'sanitised text', originalContentText: 'the abusive original', editedAt: edited },
        });
      });
      const res = await detail(admin.accessToken, reportId).expect(200);
      expect(res.body.reportedMessage).toMatchObject({
        contentText: 'sanitised text',
        originalContentText: 'the abusive original',
        editedAt: edited.toISOString(),
        deletedForEveryone: false,
      });
    });

    it('after the sender DELETES it for everyone: the moderator still sees the text, flagged deletedForEveryone', async () => {
      const { admin, reportId, prisma, message } = await reported();
      await prisma.message.update({ where: { id: message.id }, data: { deletedForEveryoneAt: new Date() } });
      const res = await detail(admin.accessToken, reportId).expect(200);
      expect(res.body.reportedMessage).toMatchObject({ contentText: 'the reported text', deletedForEveryone: true });
    });

    it('a report on a post or comment target is unchanged: no reportedMessage key', async () => {
      const { prisma, recipient, sender } = await setup();
      const post = await prisma.post.create({ data: { authorId: sender.userId, contentText: 'a post', mediaUrls: [] } });
      const res = await request(server())
        .post('/reports')
        .set(auth(recipient.accessToken))
        .send({ targetType: 'post', targetId: post.id, reasonCategory: 'spam_or_scam' })
        .expect(201);
      const admin = await createAdmin();
      const body = (await detail(admin.accessToken, res.body.id).expect(200)).body;
      expect('reportedMessage' in body).toBe(false);
    });

    it('a user token (not an admin) cannot read it; an editor admin is refused; the vetting gate applies to a minor-flagged report', async () => {
      const { recipient, message, prisma } = await setup();
      const res = await report(recipient.accessToken, message.id, { reasonCategory: 'child_safety_concern' }).expect(201);
      await detail(recipient.accessToken, res.body.id).expect(401);
      const editor = await createAdmin('editor', true);
      await detail(editor.accessToken, res.body.id).expect(403);
      const unvetted = await createAdmin('moderator', false);
      const refused = await detail(unvetted.accessToken, res.body.id).expect(403);
      expect(refused.body.code).toBe('child_safety_vetting_required');
      expect(JSON.stringify(refused.body)).not.toContain('the reported text');
      const vetted = await createAdmin('moderator', true);
      await detail(vetted.accessToken, res.body.id).expect(200);
      expect(await prisma.report.count()).toBe(1);
    });
  });

  // ---------- the sender is the reported user ----------

  describe('moderation actions on a message report', () => {
    it('content_removed records the action only: the message row and its text are unchanged and still readable', async () => {
      const { prisma, recipient, sender, message } = await setup();
      const res = await report(recipient.accessToken, message.id).expect(201);
      const admin = await createAdmin();
      await request(server())
        .patch(`/admin/moderation/reports/${res.body.id}`)
        .set(auth(admin.accessToken))
        .send({ action: 'content_removed' })
        .expect(200);

      const row = await prisma.message.findUniqueOrThrow({ where: { id: message.id } });
      expect(row.contentText).toBe('the reported text');
      expect(row.deletedForEveryoneAt).toBeNull();
      expect((await prisma.report.findUniqueOrThrow({ where: { id: res.body.id } })).actionTaken).toBe('content_removed');

      // The SENDER (resolved as the reported user) and the reporter each get one moderation_decision notification,
      // both pointing at the report id and nothing else.
      const forSender = await prisma.notification.findMany({ where: { userId: sender.userId } });
      const forReporter = await prisma.notification.findMany({ where: { userId: recipient.userId } });
      expect(forSender).toHaveLength(1);
      expect(forSender[0]).toMatchObject({ type: 'moderation_decision', payloadRefId: res.body.id });
      expect(forReporter).toHaveLength(1);
      expect(forReporter[0]).toMatchObject({ type: 'moderation_decision', payloadRefId: res.body.id });
    });

    it('the sender is never told WHO reported them or that a message was reported (the notification carries only the report id; the user routes never return the report)', async () => {
      const { prisma, recipient, sender, message } = await setup();
      const res = await report(recipient.accessToken, message.id).expect(201);
      // Nothing is sent to the sender when the report is merely FILED.
      expect(await prisma.notification.count({ where: { userId: sender.userId } })).toBe(0);
      const admin = await createAdmin();
      await request(server()).patch(`/admin/moderation/reports/${res.body.id}`).set(auth(admin.accessToken)).send({ action: 'dismissed' }).expect(200);
      const note = await prisma.notification.findFirstOrThrow({ where: { userId: sender.userId } });
      expect(JSON.stringify(note)).not.toContain(recipient.userId);
      expect(JSON.stringify(note)).not.toContain(message.id);
      // The sender cannot read the report row (user token on the admin route is rejected).
      await request(server()).get(`/admin/moderation/reports/${res.body.id}`).set(auth(sender.accessToken)).expect(401);
    });

    it('the sender of a reported message is "involved" in the account-hold rules, like a comment author; the reporter is not the subject', async () => {
      const { prisma, recipient, sender, message } = await setup();
      await report(recipient.accessToken, message.id).expect(201);
      const db = app.get(PrismaService);
      const asSender = await findInvolvedReports(db, sender.userId);
      expect(asSender).toHaveLength(1);
      expect(asSender[0]).toMatchObject({ isSubject: true, isReporter: false, status: 'open' });
      const asReporter = await findInvolvedReports(db, recipient.userId);
      expect(asReporter).toHaveLength(1);
      expect(asReporter[0]).toMatchObject({ isSubject: false, isReporter: true });
      expect(await findInvolvedReports(db, (await createUser('bystander')).userId)).toHaveLength(0);
      void prisma;
    });
  });
});
