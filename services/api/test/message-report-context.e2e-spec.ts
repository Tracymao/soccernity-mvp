import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AdminTokenService } from '../src/modules/admin/token/admin-token.service';
import { TokenService } from '../src/modules/auth/token/token.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { seedDob } from './dob-seed';

// backend/b286-message-report-context (B-286, Decision Log #477), against REAL Postgres: the 10-before / 10-after
// window in (sentAt, id) order, the visibility rules, the same-404 sameness, the repeat-report merge up to 20, the
// ReportContextMessage foreign keys (messageId RESTRICT, reportId CASCADE), and the admin read. The mocked unit suite
// covers the branching; this proves the SQL and the migration.
describe('Message report context e2e (b286-message-report-context)', () => {
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
    const user = await getTestPrismaClient().user.create({
      data: {
        email: `e2e-msgctx-${label}-${Date.now()}-${rand()}@example.com`,
        passwordHash: 'unused-in-this-e2e-spec-file',
        displayName: `Real Name ${label}`,
        username: `mc_${label}_${rand().slice(0, 5)}`,
        verificationStatus: 'verified',
        dateOfBirth: seedDob('1993-03-03'),
        isMinor: false,
      },
    });
    const { accessToken } = await app.get(TokenService).issueTokenPair(user.id, user.role);
    return { userId: user.id, accessToken: accessToken.token };
  }

  async function createAdmin(childSafetyVetted = true) {
    const admin = await getTestPrismaClient().adminUser.create({
      data: {
        email: `e2e-msgctx-admin-${Date.now()}-${rand()}@example.com`,
        passwordHash: 'unused',
        fullName: 'E2E Admin',
        role: 'moderator',
        childSafetyVetted,
      },
    });
    const { accessToken } = await app.get(AdminTokenService).issueTokenPair(admin.id, admin.role);
    return { adminId: admin.id, accessToken: accessToken.token };
  }

  // A conversation of N messages, one per minute from a fixed start, alternating sender / recipient (index 0 = sender).
  // `messages[i]` is the i-th message in time order.
  async function setup(count = 30) {
    const prisma = getTestPrismaClient();
    const sender = await createUser('sender');
    const recipient = await createUser('recipient');
    const ids = [sender.userId, recipient.userId].sort();
    const conversation = await prisma.conversation.create({
      data: { participantIds: ids, participantKey: ids.join(':'), lastMessageAt: new Date('2026-02-01T10:00:00Z') },
    });
    const start = new Date('2026-02-01T10:00:00Z').getTime();
    const messages = [];
    for (let i = 0; i < count; i++) {
      messages.push(
        await prisma.message.create({
          data: {
            conversationId: conversation.id,
            senderId: i % 2 === 0 ? sender.userId : recipient.userId,
            contentText: `message ${i}`,
            sentAt: new Date(start + i * 60_000),
          },
        }),
      );
    }
    return { prisma, sender, recipient, conversation, messages };
  }

  const report = (token: string, targetId: string, over: Record<string, unknown> = {}) =>
    request(server())
      .post('/reports')
      .set(auth(token))
      .send({ targetType: 'message', targetId, reasonCategory: 'harassment_or_bullying', ...over });

  describe('the window', () => {
    it('10 before and 10 after are accepted (inclusive edges); 11 before and 11 after are the 404', async () => {
      const { prisma, recipient, messages } = await setup(40);
      const target = messages[20];
      // messages[10..19] are the 10 before, messages[21..30] the 10 after
      const edge = [messages[10], messages[30], messages[19], messages[21]].map((m) => m.id);
      const res = await report(recipient.accessToken, target.id, { contextMessageIds: edge }).expect(201);
      expect((await prisma.reportContextMessage.findMany({ where: { reportId: res.body.id } })).map((r) => r.messageId).sort()).toEqual([...edge].sort());

      // (the reporter is the recipient, who may report the sender's messages: the EVEN indexes)
      const tooFarBefore = await report(recipient.accessToken, messages[26].id, { contextMessageIds: [messages[15].id] });
      expect(tooFarBefore.status).toBe(404); // 11 before messages[26] (16..25 are the ten)
      const tooFarAfter = await report(recipient.accessToken, messages[14].id, { contextMessageIds: [messages[25].id] });
      expect(tooFarAfter.status).toBe(404); // 11 after messages[14] (15..24 are the ten)
    });

    it('messages that share the same sentAt are ordered by id, so the window is deterministic', async () => {
      const prisma = getTestPrismaClient();
      const { recipient, conversation, sender } = await setup(0);
      const sameTime = new Date('2026-03-01T12:00:00Z');
      const rows = [];
      for (let i = 0; i < 25; i++) {
        rows.push(
          await prisma.message.create({
            data: { conversationId: conversation.id, senderId: sender.userId, contentText: `tie ${i}`, sentAt: sameTime },
          }),
        );
      }
      const ordered = [...rows].sort((a, b) => (a.id < b.id ? -1 : 1));
      const target = ordered[12];
      await report(recipient.accessToken, target.id, { contextMessageIds: [ordered[2].id, ordered[22].id] }).expect(201);
      const far = await report(recipient.accessToken, ordered[13].id, { contextMessageIds: [ordered[2].id] });
      expect(far.status).toBe(404); // 11 before ordered[13]
    });

    it('the reporter\'s OWN messages are allowed', async () => {
      const { recipient, messages } = await setup(10);
      // messages[1] was sent by the recipient (the reporter), messages[0] and [2] by the sender
      await report(recipient.accessToken, messages[2].id, { contextMessageIds: [messages[1].id, messages[3].id] }).expect(201);
    });

    it('the reported message itself is not a valid context id', async () => {
      const { recipient, messages } = await setup(6);
      await report(recipient.accessToken, messages[2].id, { contextMessageIds: [messages[2].id] }).expect(404);
    });
  });

  describe('every failure is the same 404 and writes nothing', () => {
    it('another conversation, a missing id, a hidden message, a deleted-for-everyone message, before the chat cutoff', async () => {
      const { prisma, recipient, sender, messages } = await setup(12);
      // a message of ANOTHER conversation that sits in the same time window
      const third = await createUser('third');
      const otherIds = [recipient.userId, third.userId].sort();
      const otherConv = await prisma.conversation.create({
        data: { participantIds: otherIds, participantKey: otherIds.join(':'), lastMessageAt: new Date('2026-02-01T10:05:00Z') },
      });
      const foreign = await prisma.message.create({
        data: { conversationId: otherConv.id, senderId: third.userId, contentText: 'elsewhere', sentAt: new Date('2026-02-01T10:05:30Z') },
      });
      await prisma.messageHide.create({ data: { userId: recipient.userId, messageId: messages[4].id } });
      await prisma.message.update({ where: { id: messages[7].id }, data: { deletedForEveryoneAt: new Date() } });
      // the reporter deleted the chat after messages[0..2]; the reported message and the rest are newer
      await prisma.conversationHide.create({ data: { userId: recipient.userId, conversationId: messages[0].conversationId, hiddenAt: new Date('2026-02-01T10:02:30Z') } });

      const target = messages[6];
      const bodies: unknown[] = [];
      for (const id of [foreign.id, '99999999-9999-4999-8999-999999999999', messages[4].id, messages[7].id, messages[1].id, messages[2].id]) {
        const res = await report(recipient.accessToken, target.id, { contextMessageIds: [id] });
        expect(res.status).toBe(404);
        bodies.push(res.body);
      }
      // byte-identical to the refusal for a message that does not exist at all
      const missing = await report(recipient.accessToken, '99999999-9999-4999-8999-999999999998');
      for (const b of bodies) expect(b).toEqual(missing.body);
      expect(await prisma.report.count()).toBe(0);
      expect(await prisma.reportContextMessage.count()).toBe(0);
      // and one after the cutoff is accepted
      await report(recipient.accessToken, target.id, { contextMessageIds: [messages[3].id] }).expect(201);
      void sender;
    });

    it('the field with any other target type is a 400', async () => {
      const { recipient, messages } = await setup(4);
      const res = await request(server())
        .post('/reports')
        .set(auth(recipient.accessToken))
        .send({ targetType: 'user', targetId: recipient.userId, reasonCategory: 'spam_or_scam', contextMessageIds: [messages[1].id] })
        .expect(400);
      expect(res.body.code).toBe('report_context_not_allowed');
    });

    it('21 ids are a 400 and the public route refuses the field', async () => {
      const { recipient, messages } = await setup(4);
      const ids = Array.from({ length: 21 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);
      await report(recipient.accessToken, messages[1].id, { contextMessageIds: ids }).expect(400);
      await request(server())
        .post('/reports/public')
        .send({
          reporterContactEmail: 'a@example.com',
          targetType: 'post',
          targetId: messages[1].id,
          reasonCategory: 'spam_or_scam',
          concernsMinor: false,
          contextMessageIds: [messages[0].id],
        })
        .expect(400);
    });
  });

  describe('repeat reports', () => {
    it('merge new valid ids into the existing open report, skip attached ones, and stop at 20 in total', async () => {
      const { prisma, recipient, messages } = await setup(40);
      const target = messages[20];
      const first = await report(recipient.accessToken, target.id, { contextMessageIds: [messages[19].id, messages[18].id] }).expect(201);
      const second = await report(recipient.accessToken, target.id, { contextMessageIds: [messages[18].id, messages[17].id] }).expect(201);
      expect(second.body.id).toBe(first.body.id);
      expect(await prisma.report.count()).toBe(1);
      expect(await prisma.reportContextMessage.count({ where: { reportId: first.body.id } })).toBe(3);

      // fill to 20: window messages 10..19 and 21..30 are 20 candidates, 3 already attached
      const rest = [...messages.slice(10, 20), ...messages.slice(21, 31)].map((m) => m.id);
      await report(recipient.accessToken, target.id, { contextMessageIds: rest }).expect(201);
      expect(await prisma.reportContextMessage.count({ where: { reportId: first.body.id } })).toBe(20);
      await report(recipient.accessToken, target.id, { contextMessageIds: [messages[10].id] }).expect(201);
      expect(await prisma.reportContextMessage.count({ where: { reportId: first.body.id } })).toBe(20);
    });

    it('a failing id on a repeat is the 404 and the existing report is unchanged', async () => {
      const { prisma, recipient, messages } = await setup(40);
      const first = await report(recipient.accessToken, messages[20].id, { contextMessageIds: [messages[19].id] }).expect(201);
      await report(recipient.accessToken, messages[20].id, { contextMessageIds: [messages[2].id] }).expect(404);
      expect(await prisma.reportContextMessage.count({ where: { reportId: first.body.id } })).toBe(1);
    });

    it('simultaneous identical reports create one row and one set of context', async () => {
      const { prisma, recipient, messages } = await setup(10);
      const ids = [messages[1].id, messages[2].id];
      const results = await Promise.all(Array.from({ length: 5 }, () => report(recipient.accessToken, messages[4].id, { contextMessageIds: ids })));
      expect(results.every((r) => r.status === 201)).toBe(true);
      expect(await prisma.report.count()).toBe(1);
      expect(await prisma.reportContextMessage.count()).toBe(2);
    });
  });

  describe('the foreign keys', () => {
    it('a context message cannot be deleted while the report exists (RESTRICT); deleting the report removes its rows (CASCADE)', async () => {
      const { prisma, recipient, messages } = await setup(8);
      const res = await report(recipient.accessToken, messages[4].id, { contextMessageIds: [messages[2].id] }).expect(201);
      await expect(prisma.message.delete({ where: { id: messages[2].id } })).rejects.toThrow();
      expect(await prisma.message.count({ where: { id: messages[2].id } })).toBe(1);
      await prisma.report.delete({ where: { id: res.body.id } });
      expect(await prisma.reportContextMessage.count()).toBe(0);
      await prisma.message.delete({ where: { id: messages[2].id } }); // now allowed
    });
  });

  describe('the admin read', () => {
    it('returns contextMessages oldest first with sentByReporter, edited/deleted text kept, and nothing else of the thread', async () => {
      const { prisma, recipient, sender, messages, conversation } = await setup(12);
      const target = messages[6];
      await prisma.message.update({
        where: { id: messages[5].id },
        data: { contentText: 'edited now', originalContentText: 'as first sent', editedAt: new Date('2026-02-01T10:05:30Z') },
      });
      await prisma.message.update({ where: { id: messages[3].id }, data: { deletedForEveryoneAt: new Date() } });
      // attach out of time order on purpose; also a deleted-for-everyone one is attached BEFORE it was deleted
      const created = await report(recipient.accessToken, target.id, { contextMessageIds: [messages[5].id, messages[8].id, messages[7].id] }).expect(201);
      await prisma.reportContextMessage.create({ data: { reportId: created.body.id, messageId: messages[3].id } });
      const admin = await createAdmin(true);

      const res = await request(server()).get(`/admin/moderation/reports/${created.body.id}`).set(auth(admin.accessToken)).expect(200);
      const ctx = res.body.contextMessages as Array<Record<string, unknown>>;
      expect(ctx.map((m) => m.id)).toEqual([messages[3].id, messages[5].id, messages[7].id, messages[8].id]);
      // odd indexes were sent by the recipient (the reporter), even ones by the sender
      expect(ctx[0]).toMatchObject({ deletedForEveryone: true, contentText: 'message 3', sentByReporter: true });
      expect(ctx[1]).toMatchObject({ contentText: 'edited now', originalContentText: 'as first sent', sentByReporter: true });
      expect(ctx[2]).toMatchObject({ sentByReporter: true });
      expect(ctx[3]).toMatchObject({ sentByReporter: false });
      expect(ctx.every((m) => ['id', 'sentAt', 'sender', 'sentByReporter', 'contentText', 'originalContentText', 'editedAt', 'deletedForEveryone', 'removedByModerationAt'].sort().join() === Object.keys(m).sort().join())).toBe(true);
      const json = JSON.stringify(res.body.contextMessages);
      expect(json).not.toContain(conversation.id);
      expect(json).not.toContain(sender.userId);
      expect(json).not.toContain('Real Name');
      expect(res.body.reportedMessage).toMatchObject({ id: target.id });
    });

    it('is an empty array with no context, and the vetting gate still applies first', async () => {
      const { recipient, messages } = await setup(6);
      const plain = await report(recipient.accessToken, messages[2].id).expect(201);
      const vetted = await createAdmin(true);
      const res = await request(server()).get(`/admin/moderation/reports/${plain.body.id}`).set(auth(vetted.accessToken)).expect(200);
      expect(res.body.contextMessages).toEqual([]);

      const minor = await report(recipient.accessToken, messages[4].id, { reasonCategory: 'child_safety_concern', contextMessageIds: [messages[3].id] }).expect(201);
      const unvetted = await createAdmin(false);
      await request(server()).get(`/admin/moderation/reports/${minor.body.id}`).set(auth(unvetted.accessToken)).expect(403);
    });
  });

  it('filing a report with context notifies nobody', async () => {
    const { prisma, recipient, messages } = await setup(6);
    await report(recipient.accessToken, messages[4].id, { contextMessageIds: [messages[2].id] }).expect(201);
    expect(await prisma.notification.count()).toBe(0);
  });
});
