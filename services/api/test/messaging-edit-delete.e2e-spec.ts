import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { APP_CLOCK } from '../src/clock/clock';
import { TokenService } from '../src/modules/auth/token/token.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { seedDob } from './dob-seed';

// backend/b067-message-edit-delete-hide (B-067, Decision Log #472 (b)). The new message edit, delete-for-me,
// delete-for-everyone and delete-chat behaviour against REAL Postgres: the composite primary keys, the relation
// filters on the read paths (hides: none, the chat cutoff), idempotency, and that nothing is ever purged.
// The mocked suite (src/modules/messaging/*.edit-delete.spec.ts) covers the branching; this proves the SQL.
//
// The edit window is measured on the server clock, so APP_CLOCK is overridden with a clock that follows real
// time unless a test freezes it. Messages that need a chosen age are seeded through Prisma with an explicit
// sentAt; messages sent through the API get the database's real now().
const BASE = new Date('2026-01-10T10:00:00.000Z');
const WINDOW_MS = 15 * 60 * 1000;

describe('Messaging e2e: edit, delete for me / everyone, delete chat (B-067)', () => {
  let app: INestApplication;
  let frozen: Date | null = null;
  const clock = { now: () => frozen ?? new Date() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_CLOCK)
      .useValue(clock)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  beforeEach(async () => {
    frozen = null;
    await resetDatabase();
  });

  afterAll(async () => {
    await app.close();
    await disconnectTestPrismaClient();
  });

  const server = () => app.getHttpServer();
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function createUser(label: string): Promise<{ userId: string; accessToken: string }> {
    const prisma = getTestPrismaClient();
    const user = await prisma.user.create({
      data: {
        email: `e2e-b067-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
        passwordHash: 'unused-in-this-e2e-spec-file',
        displayName: `B067 ${label}`,
        verificationStatus: 'verified',
        username: `b067_${label}_${Math.random().toString(36).slice(2, 7)}`,
        dateOfBirth: seedDob('1993-03-03'),
        isMinor: false,
      },
    });
    const { accessToken } = await app.get(TokenService).issueTokenPair(user.id, user.role);
    return { userId: user.id, accessToken: accessToken.token };
  }

  // A conversation between two users with a message seeded at an explicit time.
  async function setup(opts: { sentAt?: Date } = {}) {
    const prisma = getTestPrismaClient();
    const alice = await createUser('alice');
    const bob = await createUser('bob');
    const ids = [alice.userId, bob.userId].sort();
    const sentAt = opts.sentAt ?? BASE;
    const conversation = await prisma.conversation.create({
      data: { participantIds: ids, participantKey: ids.join(':'), lastMessageAt: sentAt },
    });
    const message = await prisma.message.create({
      data: { conversationId: conversation.id, senderId: alice.userId, contentText: 'first text', sentAt },
    });
    return { prisma, alice, bob, conversation, message };
  }

  const messagesOf = (token: string, conversationId: string) =>
    request(server()).get(`/conversations/${conversationId}/messages`).set(auth(token));
  const inboxOf = (token: string) => request(server()).get('/conversations').set(auth(token));

  // ---------- PATCH: edit ----------

  describe('PATCH /conversations/:id/messages/:messageId', () => {
    it('edits within the window: sets editedAt, keeps the FIRST original in the database across several edits, never returns it, no Notification, lastMessageAt unchanged', async () => {
      const { prisma, alice, bob, conversation, message } = await setup();
      frozen = new Date(BASE.getTime() + 60_000);

      const first = await request(server())
        .patch(`/conversations/${conversation.id}/messages/${message.id}`)
        .set(auth(alice.accessToken))
        .send({ contentText: 'second text' })
        .expect(200);
      expect(first.body).toMatchObject({
        id: message.id,
        contentText: 'second text',
        deletedForEveryone: false,
        editedAt: frozen.toISOString(),
      });
      expect('originalContentText' in first.body).toBe(false);

      frozen = new Date(BASE.getTime() + 120_000);
      await request(server())
        .patch(`/conversations/${conversation.id}/messages/${message.id}`)
        .set(auth(alice.accessToken))
        .send({ contentText: 'third text' })
        .expect(200);

      const row = await prisma.message.findUniqueOrThrow({ where: { id: message.id } });
      expect(row.contentText).toBe('third text');
      expect(row.originalContentText).toBe('first text'); // the first one, not the second
      expect(row.editedAt?.toISOString()).toBe(frozen.toISOString());
      expect(await prisma.notification.count()).toBe(0);
      const convo = await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } });
      expect(convo.lastMessageAt.toISOString()).toBe(BASE.toISOString());

      // Both people read the edited text with editedAt; the original is in neither response.
      for (const token of [alice.accessToken, bob.accessToken]) {
        const page = await messagesOf(token, conversation.id).expect(200);
        expect(page.body.items[0]).toMatchObject({ contentText: 'third text', editedAt: frozen.toISOString() });
        expect(JSON.stringify(page.body)).not.toContain('first text');
        expect(JSON.stringify(page.body)).not.toContain('originalContentText');
      }
    });

    it('the window is exactly 15 minutes: 15:00.000 is allowed, one millisecond later is refused (message_edit_window_closed)', async () => {
      const { prisma, alice, conversation, message } = await setup();
      const patch = () =>
        request(server())
          .patch(`/conversations/${conversation.id}/messages/${message.id}`)
          .set(auth(alice.accessToken))
          .send({ contentText: 'edge' });

      frozen = new Date(BASE.getTime() + WINDOW_MS + 1);
      const late = await patch().expect(409);
      expect(late.body.code).toBe('message_edit_window_closed');
      expect((await prisma.message.findUniqueOrThrow({ where: { id: message.id } })).contentText).toBe('first text');

      frozen = new Date(BASE.getTime() + WINDOW_MS);
      await patch().expect(200);
      expect((await prisma.message.findUniqueOrThrow({ where: { id: message.id } })).contentText).toBe('edge');

      frozen = new Date(BASE.getTime() + WINDOW_MS + 1000);
      const secondsLate = await patch().expect(409);
      expect(secondsLate.body.code).toBe('message_edit_window_closed');
    });

    it('403s the other participant; 404s an unknown message and an outsider; refuses a message deleted for everyone (message_not_editable)', async () => {
      const { prisma, alice, bob, conversation, message } = await setup();
      const carol = await createUser('carol');
      frozen = new Date(BASE.getTime() + 60_000);
      const url = `/conversations/${conversation.id}/messages/${message.id}`;

      const notSender = await request(server()).patch(url).set(auth(bob.accessToken)).send({ contentText: 'x' }).expect(403);
      expect(notSender.body.code).toBe('message_edit_not_sender');
      await request(server())
        .patch(`/conversations/${conversation.id}/messages/11111111-1111-4111-8111-111111111111`)
        .set(auth(alice.accessToken))
        .send({ contentText: 'x' })
        .expect(404);
      await request(server()).patch(url).set(auth(carol.accessToken)).send({ contentText: 'x' }).expect(404);

      await request(server())
        .delete(`${url}?scope=everyone`)
        .set(auth(alice.accessToken))
        .expect(204);
      const deleted = await request(server()).patch(url).set(auth(alice.accessToken)).send({ contentText: 'x' }).expect(409);
      expect(deleted.body.code).toBe('message_not_editable');
      expect((await prisma.message.findUniqueOrThrow({ where: { id: message.id } })).contentText).toBe('first text');
    });

    it('passes the same Block checks as a send: the blocked sender gets the 404 a send gets, the blocker gets 403 you_blocked_this_user', async () => {
      const { prisma, alice, bob, conversation, message } = await setup();
      frozen = new Date(BASE.getTime() + 60_000);
      const url = `/conversations/${conversation.id}/messages/${message.id}`;

      // Alice (the sender) is blocked BY Bob.
      await prisma.block.create({ data: { blockerId: bob.userId, blockedId: alice.userId } });
      const editBlocked = await request(server()).patch(url).set(auth(alice.accessToken)).send({ contentText: 'x' }).expect(404);
      const sendBlocked = await request(server())
        .post(`/conversations/${conversation.id}/messages`)
        .set(auth(alice.accessToken))
        .send({ contentText: 'x' })
        .expect(404);
      expect(editBlocked.body).toEqual(sendBlocked.body);

      // Alice blocks Bob instead.
      await prisma.block.deleteMany({});
      await prisma.block.create({ data: { blockerId: alice.userId, blockedId: bob.userId } });
      const editBlocker = await request(server()).patch(url).set(auth(alice.accessToken)).send({ contentText: 'x' }).expect(403);
      expect(editBlocker.body.code).toBe('you_blocked_this_user');
      expect((await prisma.message.findUniqueOrThrow({ where: { id: message.id } })).contentText).toBe('first text');
    });

    it('applies the send validation: empty, over 3000 characters and extra fields are 400s; 401 without a token', async () => {
      const { alice, conversation, message } = await setup();
      frozen = new Date(BASE.getTime() + 60_000);
      const url = `/conversations/${conversation.id}/messages/${message.id}`;
      await request(server()).patch(url).set(auth(alice.accessToken)).send({ contentText: '' }).expect(400);
      await request(server()).patch(url).set(auth(alice.accessToken)).send({ contentText: 'x'.repeat(3001) }).expect(400);
      await request(server()).patch(url).set(auth(alice.accessToken)).send({ contentText: 'x', originalContentText: 'y' }).expect(400);
      await request(server()).patch(url).send({ contentText: 'x' }).expect(401);
    });
  });

  // ---------- DELETE a message ----------

  describe('DELETE /conversations/:id/messages/:messageId', () => {
    it('scope=me hides it for the caller only, is idempotent (one MessageHide row), and keeps the row and the other person\'s view', async () => {
      const { prisma, alice, bob, conversation, message } = await setup();
      const del = () =>
        request(server())
          .delete(`/conversations/${conversation.id}/messages/${message.id}?scope=me`)
          .set(auth(bob.accessToken));

      await del().expect(204);
      await del().expect(204);
      expect(await prisma.messageHide.count()).toBe(1);
      expect((await prisma.message.findUniqueOrThrow({ where: { id: message.id } })).deletedForEveryoneAt).toBeNull();

      expect((await messagesOf(bob.accessToken, conversation.id).expect(200)).body.items).toHaveLength(0);
      const forAlice = await messagesOf(alice.accessToken, conversation.id).expect(200);
      expect(forAlice.body.items).toHaveLength(1);
      expect(forAlice.body.items[0].contentText).toBe('first text');
    });

    it('scope=me works on a message the OTHER person sent and on one in a conversation with a Block', async () => {
      const { prisma, alice, bob, conversation, message } = await setup();
      await prisma.block.create({ data: { blockerId: alice.userId, blockedId: bob.userId } });
      await request(server())
        .delete(`/conversations/${conversation.id}/messages/${message.id}?scope=me`)
        .set(auth(bob.accessToken))
        .expect(204);
      expect(await prisma.messageHide.count({ where: { userId: bob.userId } })).toBe(1);
    });

    it('scope=everyone by the sender: both people get the placeholder, the row, the text and the original STAY in the database, idempotent, allowed at any age and with a Block', async () => {
      const { prisma, alice, bob, conversation, message } = await setup({ sentAt: new Date('2025-06-01T10:00:00Z') });
      await prisma.message.update({ where: { id: message.id }, data: { originalContentText: 'the very first text' } });
      await prisma.block.create({ data: { blockerId: bob.userId, blockedId: alice.userId } });
      const url = `/conversations/${conversation.id}/messages/${message.id}?scope=everyone`;

      await request(server()).delete(url).set(auth(alice.accessToken)).expect(204);
      const stamp = (await prisma.message.findUniqueOrThrow({ where: { id: message.id } })).deletedForEveryoneAt;
      expect(stamp).not.toBeNull();
      await request(server()).delete(url).set(auth(alice.accessToken)).expect(204);
      expect((await prisma.message.findUniqueOrThrow({ where: { id: message.id } })).deletedForEveryoneAt?.toISOString()).toBe(
        stamp?.toISOString(),
      );

      const row = await prisma.message.findUniqueOrThrow({ where: { id: message.id } });
      expect(row.contentText).toBe('first text');
      expect(row.originalContentText).toBe('the very first text');
      expect(await prisma.message.count()).toBe(1);

      for (const token of [alice.accessToken, bob.accessToken]) {
        const page = await messagesOf(token, conversation.id).expect(200);
        expect(page.body.items).toEqual([
          {
            id: message.id,
            conversationId: conversation.id,
            senderId: alice.userId,
            sentAt: '2025-06-01T10:00:00.000Z',
            deletedForEveryone: true,
            contentText: null,
            editedAt: null,
          },
        ]);
        expect(JSON.stringify(page.body)).not.toContain('first text');
      }
    });

    it('scope=everyone by the other participant is 403 message_delete_not_sender and changes nothing', async () => {
      const { prisma, bob, conversation, message } = await setup();
      const res = await request(server())
        .delete(`/conversations/${conversation.id}/messages/${message.id}?scope=everyone`)
        .set(auth(bob.accessToken))
        .expect(403);
      expect(res.body.code).toBe('message_delete_not_sender');
      expect((await prisma.message.findUniqueOrThrow({ where: { id: message.id } })).deletedForEveryoneAt).toBeNull();
    });

    it('requires a scope (400), 404s an unknown message and an outsider, 401 without a token', async () => {
      const { alice, conversation, message } = await setup();
      const carol = await createUser('carol');
      const url = `/conversations/${conversation.id}/messages/${message.id}`;
      await request(server()).delete(url).set(auth(alice.accessToken)).expect(400);
      await request(server()).delete(`${url}?scope=all`).set(auth(alice.accessToken)).expect(400);
      await request(server())
        .delete(`/conversations/${conversation.id}/messages/11111111-1111-4111-8111-111111111111?scope=me`)
        .set(auth(alice.accessToken))
        .expect(404);
      await request(server()).delete(`${url}?scope=me`).set(auth(carol.accessToken)).expect(404);
      await request(server()).delete(`${url}?scope=me`).expect(401);
    });

    it('pages correctly with hidden messages in the middle (the keyset page is still full)', async () => {
      const { prisma, alice, bob, conversation } = await setup();
      const t = (min: number) => new Date(BASE.getTime() + min * 60_000);
      const ids: string[] = [];
      for (let i = 1; i <= 6; i += 1) {
        const m = await prisma.message.create({
          data: { conversationId: conversation.id, senderId: alice.userId, contentText: `m${i}`, sentAt: t(i) },
        });
        ids.push(m.id);
      }
      // Bob hides m2 and m4.
      for (const id of [ids[1], ids[3]]) {
        await request(server())
          .delete(`/conversations/${conversation.id}/messages/${id}?scope=me`)
          .set(auth(bob.accessToken))
          .expect(204);
      }
      const page1 = await request(server())
        .get(`/conversations/${conversation.id}/messages?limit=3`)
        .set(auth(bob.accessToken))
        .expect(200);
      expect(page1.body.items.map((m: { contentText: string }) => m.contentText)).toEqual(['m6', 'm5', 'm3']);
      const page2 = await request(server())
        .get(`/conversations/${conversation.id}/messages?limit=3&cursor=${page1.body.nextCursor}`)
        .set(auth(bob.accessToken))
        .expect(200);
      expect(page2.body.items.map((m: { contentText: string }) => m.contentText)).toEqual(['m1', 'first text']);
      expect(page2.body.nextCursor).toBeNull();
    });
  });

  // ---------- DELETE the chat ----------

  describe('DELETE /conversations/:id (delete chat, for me only)', () => {
    it('hides the conversation and its messages for the caller, leaves the other person untouched, and upserts one row', async () => {
      const { prisma, alice, bob, conversation } = await setup();
      frozen = new Date(BASE.getTime() + 60 * 60_000);

      await request(server()).delete(`/conversations/${conversation.id}`).set(auth(bob.accessToken)).expect(204);
      await request(server()).delete(`/conversations/${conversation.id}`).set(auth(bob.accessToken)).expect(204);
      expect(await prisma.conversationHide.count()).toBe(1);
      const hide = await prisma.conversationHide.findFirstOrThrow({});
      expect(hide.userId).toBe(bob.userId);
      expect(hide.hiddenAt.toISOString()).toBe(frozen.toISOString());

      expect((await inboxOf(bob.accessToken).expect(200)).body.items).toHaveLength(0);
      expect((await messagesOf(bob.accessToken, conversation.id).expect(200)).body.items).toHaveLength(0);

      const aliceInbox = await inboxOf(alice.accessToken).expect(200);
      expect(aliceInbox.body.items).toHaveLength(1);
      expect((await messagesOf(alice.accessToken, conversation.id).expect(200)).body.items).toHaveLength(1);

      // Nothing was deleted from the database.
      expect(await prisma.message.count()).toBe(1);
      expect(await prisma.conversation.count()).toBe(1);
    });

    it('a message sent AFTER the delete brings the conversation back, showing only the newer messages', async () => {
      const { prisma, alice, bob, conversation } = await setup();
      frozen = new Date(BASE.getTime() + 60 * 60_000);
      await request(server()).delete(`/conversations/${conversation.id}`).set(auth(bob.accessToken)).expect(204);
      expect((await inboxOf(bob.accessToken).expect(200)).body.items).toHaveLength(0);

      // A new message from Alice, sent through the API: sentAt is the database's real now(), after the frozen hide.
      frozen = null;
      await request(server())
        .post(`/conversations/${conversation.id}/messages`)
        .set(auth(alice.accessToken))
        .send({ contentText: 'back again' })
        .expect(201);

      const inbox = await inboxOf(bob.accessToken).expect(200);
      expect(inbox.body.items).toHaveLength(1);
      expect(inbox.body.items[0]).toMatchObject({
        id: conversation.id,
        unreadCount: 1,
        lastMessage: { contentText: 'back again' },
      });
      const page = await messagesOf(bob.accessToken, conversation.id).expect(200);
      expect(page.body.items.map((m: { contentText: string }) => m.contentText)).toEqual(['back again']);

      // The older message is still there for Alice, and in the database.
      const forAlice = await messagesOf(alice.accessToken, conversation.id).expect(200);
      expect(forAlice.body.items.map((m: { contentText: string }) => m.contentText)).toEqual(['back again', 'first text']);
      expect(await prisma.message.count()).toBe(2);
    });

    it('deleting the chat a second time moves the cutoff forward (older "newer" messages disappear again)', async () => {
      const { alice, bob, conversation } = await setup();
      frozen = new Date(BASE.getTime() + 60 * 60_000);
      await request(server()).delete(`/conversations/${conversation.id}`).set(auth(bob.accessToken)).expect(204);
      frozen = null;
      await request(server())
        .post(`/conversations/${conversation.id}/messages`)
        .set(auth(alice.accessToken))
        .send({ contentText: 'newer' })
        .expect(201);
      expect((await inboxOf(bob.accessToken).expect(200)).body.items).toHaveLength(1);

      await request(server()).delete(`/conversations/${conversation.id}`).set(auth(bob.accessToken)).expect(204);
      expect((await inboxOf(bob.accessToken).expect(200)).body.items).toHaveLength(0);
      expect((await messagesOf(bob.accessToken, conversation.id).expect(200)).body.items).toHaveLength(0);
    });

    it('404s an outsider and a missing conversation; 401 without a token', async () => {
      const { conversation } = await setup();
      const carol = await createUser('carol');
      await request(server()).delete(`/conversations/${conversation.id}`).set(auth(carol.accessToken)).expect(404);
      await request(server())
        .delete('/conversations/11111111-1111-4111-8111-111111111111')
        .set(auth(carol.accessToken))
        .expect(404);
      await request(server()).delete(`/conversations/${conversation.id}`).expect(401);
    });
  });

  // ---------- inbox preview and unread count ----------

  describe('GET /conversations: last-message preview and unread count', () => {
    it('ignore a message deleted for everyone and a message the caller hid for themselves', async () => {
      const { prisma, alice, bob, conversation } = await setup();
      const newer = await prisma.message.create({
        data: { conversationId: conversation.id, senderId: alice.userId, contentText: 'newest', sentAt: new Date(BASE.getTime() + 60_000) },
      });
      await prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: newer.sentAt } });

      const before = await inboxOf(bob.accessToken).expect(200);
      expect(before.body.items[0]).toMatchObject({ unreadCount: 2, lastMessage: { contentText: 'newest' } });

      // Alice deletes 'newest' for everyone: Bob's preview falls back to the older message, unread drops to 1.
      await request(server())
        .delete(`/conversations/${conversation.id}/messages/${newer.id}?scope=everyone`)
        .set(auth(alice.accessToken))
        .expect(204);
      const afterDelete = await inboxOf(bob.accessToken).expect(200);
      expect(afterDelete.body.items[0]).toMatchObject({ unreadCount: 1, lastMessage: { contentText: 'first text' } });

      // Bob hides the remaining message for himself: nothing visible, unread 0, no preview.
      const [first] = await prisma.message.findMany({ where: { contentText: 'first text' } });
      await request(server())
        .delete(`/conversations/${conversation.id}/messages/${first.id}?scope=me`)
        .set(auth(bob.accessToken))
        .expect(204);
      const afterHide = await inboxOf(bob.accessToken).expect(200);
      expect(afterHide.body.items[0]).toMatchObject({ unreadCount: 0, lastMessage: null });

      // Alice still sees the older message as her preview? She sent both: 'newest' is deleted for everyone.
      const forAlice = await inboxOf(alice.accessToken).expect(200);
      expect(forAlice.body.items[0].lastMessage).toMatchObject({ contentText: 'first text' });
    });
  });

  // ---------- account anonymisation ----------

  describe('hide rows and the anonymiser', () => {
    it('anonymising a user deletes their MessageHide and ConversationHide rows and leaves every Message', async () => {
      const { prisma, alice, bob, conversation, message } = await setup();
      await request(server())
        .delete(`/conversations/${conversation.id}/messages/${message.id}?scope=me`)
        .set(auth(bob.accessToken))
        .expect(204);
      await request(server()).delete(`/conversations/${conversation.id}`).set(auth(bob.accessToken)).expect(204);
      expect(await prisma.messageHide.count()).toBe(1);
      expect(await prisma.conversationHide.count()).toBe(1);

      const { AccountDeletionSweepService } = await import(
        '../src/modules/account-deletion/account-deletion-sweep.service'
      );
      await app.get(AccountDeletionSweepService).anonymizeUser(bob.userId, false);

      expect(await prisma.messageHide.count()).toBe(0);
      expect(await prisma.conversationHide.count()).toBe(0);
      expect(await prisma.message.count()).toBe(1);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: alice.userId } })).accountStatus).toBe('active');
    });
  });
});
