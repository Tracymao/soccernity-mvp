import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { TokenService } from '../src/modules/auth/token/token.service';
import { AccountDeletionSweepService } from '../src/modules/account-deletion/account-deletion-sweep.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { seedDob } from './dob-seed';

// Read receipts (Decision Log #472; founder decision 2026-11-08), against real Postgres. New work only: the
// nullable User.readReceipts column, the settings endpoints' effective value, and the disclosure rule on every
// real message read path. Message.readAt is still RECORDED whatever the settings say (checked in raw rows).
describe('Read receipts e2e', () => {
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

  const server = () => app.getHttpServer();
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  let counter = 0;

  async function mint(userId: string, role: string) {
    const { accessToken } = await app.get(TokenService).issueTokenPair(userId, role);
    return accessToken.token;
  }

  type Person = { userId: string; accessToken: string };

  async function adult(label: string, extra: Record<string, unknown> = {}): Promise<Person> {
    counter += 1;
    const name = `rr${label}${counter}`;
    const user = await getTestPrismaClient().user.create({
      data: {
        email: `${name}@example.com`,
        passwordHash: 'unused',
        displayName: name,
        username: name,
        verificationStatus: 'verified',
        dateOfBirth: seedDob('1993-03-03'),
        isMinor: false,
        ...extra,
      },
    });
    return { userId: user.id, accessToken: await mint(user.id, user.role) };
  }

  // A minor with CONFIRMED guardian consent (so messaging is open to them), aged 16 (not under 16).
  async function teen(label: string, extra: Record<string, unknown> = {}): Promise<Person> {
    counter += 1;
    const name = `rrteen${label}${counter}`;
    const user = await getTestPrismaClient().user.create({
      data: {
        email: `${name}@example.com`,
        passwordHash: 'unused',
        displayName: name,
        username: name,
        verificationStatus: 'verified',
        dateOfBirth: seedDob('2010-01-01'),
        isMinor: true,
        guardian: {
          create: {
            name: 'Guardian Name',
            email: `guardian-${name}@example.com`,
            relationship: 'Parent',
            consentStatus: 'confirmed',
            consentToken: `tok-${name}-${Math.random().toString(36).slice(2)}`,
            consentTokenExpiresAt: new Date(Date.now() + 72 * 3600 * 1000),
            consentTimestamp: new Date(),
          },
        },
        ...extra,
      },
    });
    return { userId: user.id, accessToken: await mint(user.id, user.role) };
  }

  const setReceipts = (userId: string, value: boolean | null) =>
    getTestPrismaClient().user.update({ where: { id: userId }, data: { readReceipts: value } });

  // Starts a conversation (the sender must be allowed to), sends one message from `from`, and has `to` open the
  // chat. Returns the conversation id and the id of the message.
  async function sentAndRead(from: Person, to: Person) {
    const start = await request(server()).post('/conversations').set(auth(from.accessToken)).send({ recipientId: to.userId });
    expect([200, 201]).toContain(start.status);
    const conversationId = start.body.id as string;
    const sent = await request(server())
      .post(`/conversations/${conversationId}/messages`)
      .set(auth(from.accessToken))
      .send({ contentText: 'hello there' })
      .expect(201);
    await request(server()).patch(`/conversations/${conversationId}/read`).set(auth(to.accessToken)).expect(200);
    return { conversationId, messageId: sent.body.id as string };
  }

  const messagesAs = async (p: Person, conversationId: string) => {
    const res = await request(server()).get(`/conversations/${conversationId}/messages`).set(auth(p.accessToken)).expect(200);
    return res.body.items as { id: string; senderId: string; readAt?: string | null }[];
  };
  const readAtOf = async (p: Person, conversationId: string, messageId: string) => {
    const items = await messagesAs(p, conversationId);
    const found = items.find((m) => m.id === messageId);
    expect(found).toBeDefined();
    return found!.readAt ?? null;
  };
  const storedReadAt = async (messageId: string) =>
    (await getTestPrismaClient().message.findUniqueOrThrow({ where: { id: messageId }, select: { readAt: true } })).readAt;

  // ---------------------------------------------------------------- the setting

  describe('GET / PATCH /users/me/settings: readReceipts', () => {
    const get = (p: Person) => request(server()).get('/users/me/settings').set(auth(p.accessToken));
    const patch = (p: Person, body: Record<string, unknown>) =>
      request(server()).patch('/users/me/settings').set(auth(p.accessToken)).send(body);

    it('defaults by age with no stored value: ON for an adult, OFF for an under-18 account', async () => {
      const a = await adult('def');
      const t = await teen('def');
      expect((await get(a).expect(200)).body.readReceipts).toBe(true);
      expect((await get(t).expect(200)).body.readReceipts).toBe(false);
      const rows = await getTestPrismaClient().user.findMany({
        where: { id: { in: [a.userId, t.userId] } },
        select: { readReceipts: true },
      });
      expect(rows.map((r) => r.readReceipts)).toEqual([null, null]);
    });

    it('an explicit value is stored and wins over the age default, both ways', async () => {
      const a = await adult('exp');
      const t = await teen('exp');
      expect((await patch(a, { readReceipts: false }).expect(200)).body.readReceipts).toBe(false);
      expect((await patch(t, { readReceipts: true }).expect(200)).body.readReceipts).toBe(true);
      const rows = await getTestPrismaClient().user.findMany({
        where: { id: { in: [a.userId, t.userId] } },
        select: { id: true, readReceipts: true },
      });
      expect(rows.find((r) => r.id === a.userId)!.readReceipts).toBe(false);
      expect(rows.find((r) => r.id === t.userId)!.readReceipts).toBe(true);
    });

    it('is partial: changing it leaves the other two settings alone', async () => {
      const a = await adult('part');
      await patch(a, { dmPermission: 'following', mediaSensitive: true }).expect(200);
      const res = await patch(a, { readReceipts: false }).expect(200);
      expect(res.body).toEqual({ dmPermission: 'following', mediaSensitive: true, readReceipts: false, isProfilePublic: true });
    });

    it('turning 18 flips the default with no backfill: the same NULL reads ON once isMinor is false', async () => {
      const t = await teen('age');
      expect((await get(t).expect(200)).body.readReceipts).toBe(false);
      await getTestPrismaClient().user.update({ where: { id: t.userId }, data: { isMinor: false } });
      expect((await get(t).expect(200)).body.readReceipts).toBe(true);
    });

    it('refuses a non-boolean or null value', async () => {
      const a = await adult('bad');
      await patch(a, { readReceipts: 'yes' }).expect(400);
      await patch(a, { readReceipts: null }).expect(400);
      await patch(a, { readReceipts: 1 }).expect(400);
    });

    it("IDOR: it is always the caller's own setting; an id in the body is refused and nobody else changes", async () => {
      const a = await adult('idor-a');
      const b = await adult('idor-b');
      await patch(a, { readReceipts: false, id: b.userId }).expect(400);
      await patch(a, { readReceipts: false, userId: b.userId }).expect(400);
      expect((await getTestPrismaClient().user.findUniqueOrThrow({ where: { id: b.userId }, select: { readReceipts: true } })).readReceipts).toBeNull();
      await patch(a, { readReceipts: false }).expect(200);
      expect((await get(b).expect(200)).body.readReceipts).toBe(true);
      await request(server()).get('/users/me/settings').expect(401);
    });
  });

  // ---------------------------------------------------------------- the disclosure rule

  describe('who sees a read time', () => {
    it('adult to adult on the defaults: the sender sees it, the reader never sees one on the message they received', async () => {
      const a = await adult('aa-a');
      const b = await adult('aa-b');
      const { conversationId, messageId } = await sentAndRead(a, b);
      expect(await readAtOf(a, conversationId, messageId)).not.toBeNull();
      expect(await readAtOf(b, conversationId, messageId)).toBeNull();
    });

    it('the sender having it off, or the reader having it off, hides it; recording is unaffected', async () => {
      const a = await adult('off-a');
      const b = await adult('off-b');
      const { conversationId, messageId } = await sentAndRead(a, b);
      expect(await readAtOf(a, conversationId, messageId)).not.toBeNull();

      await setReceipts(a.userId, false);
      expect(await readAtOf(a, conversationId, messageId)).toBeNull();
      await setReceipts(a.userId, null);
      expect(await readAtOf(a, conversationId, messageId)).not.toBeNull();

      await setReceipts(b.userId, false);
      expect(await readAtOf(a, conversationId, messageId)).toBeNull();
      expect(await storedReadAt(messageId)).not.toBeNull();
    });

    it('turning receipts off later hides the seen state of EARLIER messages, and on shows it again', async () => {
      const a = await adult('rev-a');
      const b = await adult('rev-b');
      const { conversationId, messageId } = await sentAndRead(a, b);
      await request(server()).patch('/users/me/settings').set(auth(b.accessToken)).send({ readReceipts: false }).expect(200);
      expect(await readAtOf(a, conversationId, messageId)).toBeNull();
      await request(server()).patch('/users/me/settings').set(auth(b.accessToken)).send({ readReceipts: true }).expect(200);
      expect(await readAtOf(a, conversationId, messageId)).not.toBeNull();
    });

    it('two under-18 accounts: hidden on the defaults, shown only once BOTH turn it on', async () => {
      const t1 = await teen('mm-1');
      const t2 = await teen('mm-2');
      const { conversationId, messageId } = await sentAndRead(t1, t2);
      expect(await readAtOf(t1, conversationId, messageId)).toBeNull();
      await setReceipts(t1.userId, true);
      expect(await readAtOf(t1, conversationId, messageId)).toBeNull();
      await setReceipts(t2.userId, true);
      expect(await readAtOf(t1, conversationId, messageId)).not.toBeNull();
    });

    it('across age classes nothing is disclosed, even with both explicitly on (under 18 sender, adult reader)', async () => {
      const t = await teen('x-t');
      const a = await adult('x-a');
      await setReceipts(t.userId, true);
      await setReceipts(a.userId, true);
      const { conversationId, messageId } = await sentAndRead(t, a);
      expect(await readAtOf(t, conversationId, messageId)).toBeNull();
      expect(await storedReadAt(messageId)).not.toBeNull();
    });

    it('across age classes the other way (adult sender, under 18 reader) is hidden too', async () => {
      const t = await teen('y-t');
      const a = await adult('y-a');
      await setReceipts(t.userId, true);
      await setReceipts(a.userId, true);
      // An adult cannot START a conversation with a minor (Decision Log #347): the minor opens it, then the
      // adult replies in the existing thread.
      const start = await request(server()).post('/conversations').set(auth(t.accessToken)).send({ recipientId: a.userId }).expect(201);
      const conversationId = start.body.id as string;
      const sent = await request(server())
        .post(`/conversations/${conversationId}/messages`)
        .set(auth(a.accessToken))
        .send({ contentText: 'reply from the adult' })
        .expect(201);
      await request(server()).patch(`/conversations/${conversationId}/read`).set(auth(t.accessToken)).expect(200);
      expect(await readAtOf(a, conversationId, sent.body.id)).toBeNull();
    });

    it('the send response never carries a read time, and an edited message follows the same rule', async () => {
      const a = await adult('ed-a');
      const b = await adult('ed-b');
      const start = await request(server()).post('/conversations').set(auth(a.accessToken)).send({ recipientId: b.userId });
      const conversationId = start.body.id as string;
      const sent = await request(server())
        .post(`/conversations/${conversationId}/messages`)
        .set(auth(a.accessToken))
        .send({ contentText: 'first' })
        .expect(201);
      expect(sent.body.readAt).toBeNull();
      await request(server()).patch(`/conversations/${conversationId}/read`).set(auth(b.accessToken)).expect(200);

      const edited = await request(server())
        .patch(`/conversations/${conversationId}/messages/${sent.body.id}`)
        .set(auth(a.accessToken))
        .send({ contentText: 'second' })
        .expect(200);
      expect(edited.body.readAt).not.toBeNull();

      await setReceipts(a.userId, false);
      const hidden = await request(server())
        .patch(`/conversations/${conversationId}/messages/${sent.body.id}`)
        .set(auth(a.accessToken))
        .send({ contentText: 'third' })
        .expect(200);
      expect(hidden.body.readAt).toBeNull();
    });

    it('unread counts and the inbox badge still use the recorded read time, whatever the settings', async () => {
      const a = await adult('cnt-a');
      const b = await adult('cnt-b');
      await setReceipts(a.userId, false);
      await setReceipts(b.userId, false);
      const start = await request(server()).post('/conversations').set(auth(a.accessToken)).send({ recipientId: b.userId });
      const conversationId = start.body.id as string;
      await request(server()).post(`/conversations/${conversationId}/messages`).set(auth(a.accessToken)).send({ contentText: 'one' }).expect(201);
      await request(server()).post(`/conversations/${conversationId}/messages`).set(auth(a.accessToken)).send({ contentText: 'two' }).expect(201);

      const unread = async () =>
        (await request(server()).get('/conversations').set(auth(b.accessToken)).expect(200)).body.items.find(
          (c: { id: string }) => c.id === conversationId,
        ).unreadCount;
      expect(await unread()).toBe(2);
      await request(server()).patch(`/conversations/${conversationId}/read`).set(auth(b.accessToken)).expect(200);
      expect(await unread()).toBe(0);
      const rows = await getTestPrismaClient().message.findMany({ where: { conversationId }, select: { readAt: true } });
      expect(rows.every((r) => r.readAt !== null)).toBe(true);
    });

    it('the conversation list does not carry a read time on the last message', async () => {
      const a = await adult('lst-a');
      const b = await adult('lst-b');
      const { conversationId } = await sentAndRead(a, b);
      const list = await request(server()).get('/conversations').set(auth(a.accessToken)).expect(200);
      const row = list.body.items.find((c: { id: string }) => c.id === conversationId);
      expect(row.lastMessage).not.toHaveProperty('readAt');
    });
  });

  // ---------------------------------------------------------------- anonymisation

  it('anonymising an account resets readReceipts to NULL', async () => {
    const a = await adult('anon');
    await setReceipts(a.userId, false);
    await app.get(AccountDeletionSweepService).anonymizeUser(a.userId, false, new Date());
    const row = await getTestPrismaClient().user.findUniqueOrThrow({ where: { id: a.userId }, select: { readReceipts: true } });
    expect(row.readReceipts).toBeNull();
  });
});
