import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { TokenService } from '../src/modules/auth/token/token.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';

// sprint-3/messaging-direct-messaging — Build Plan Section 4.7 (Messaging
// slice). Hits test/README.md's e2e triggers:
//   - a genuinely NEW constraint: Conversation.participantKey @unique,
//     never exercised against real Postgres before this PR — it's what
//     makes POST /conversations's find-or-create race-safe.
//   - transaction reasoning: POST /conversations/:id/messages bumps
//     Conversation.lastMessageAt in the same interactive transaction as
//     the Message insert, proven to never drift; and two concurrent
//     "start a conversation with the same person" requests proven to
//     create exactly one row.
//   - a novel Prisma query: the `participantIds: { has: callerId }`
//     Postgres array-containment filter behind GET /conversations.
// The mocked unit suite (src/modules/messaging/*.spec.ts) covers DTO
// validation, guard wiring, the branching logic and the P2002 path a
// mock can prove.
//
// Users are seeded directly via Prisma + a real TokenService-minted
// access token (createUser), not POST /auth/register — the same pattern
// banter.e2e-spec.ts / clubs.e2e-spec.ts / grassroots.e2e-spec.ts use.
// None of the messaging endpoints carry @AuthRateLimit(), so this is a
// speed choice, not a rate-limit workaround: every downstream request
// still exercises the real JwtAuthGuard -> TokenService.verifyAccessToken
// and (for writes) the real GuardianConsentGuard chain.
describe('Messaging e2e (Section 4.7, DM slice)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await app.close();
    await disconnectTestPrismaClient();
  });

  function server() {
    return app.getHttpServer();
  }

  async function createUser(label: string): Promise<{ userId: string; accessToken: string; displayName: string }> {
    const prisma = getTestPrismaClient();
    const displayName = `E2E Msg ${label}`;
    const user = await prisma.user.create({
      data: {
        email: `e2e-msg-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
        passwordHash: 'unused-in-this-e2e-spec-file',
        displayName,
        dateOfBirth: new Date('1993-03-03'), // adult — GuardianConsentGuard passes
        isMinor: false,
      },
    });
    const tokenService = app.get(TokenService);
    const { accessToken } = await tokenService.issueTokenPair(user.id, user.role);
    return { userId: user.id, accessToken: accessToken.token, displayName };
  }

  async function createMinor(
    label: string,
    consentStatus: 'pending' | 'confirmed',
  ): Promise<{ userId: string; accessToken: string }> {
    const prisma = getTestPrismaClient();
    const user = await prisma.user.create({
      data: {
        email: `e2e-msg-minor-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
        passwordHash: 'unused',
        displayName: `E2E Msg Minor ${label}`,
        dateOfBirth: new Date('2014-01-01'),
        isMinor: true,
        guardian: {
          create: {
            name: 'Guardian Name',
            email: `guardian-${label}-${Date.now()}@example.com`,
            relationship: 'Parent',
            consentStatus,
            consentToken: `tok-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            consentTokenExpiresAt: new Date(Date.now() + 72 * 3600 * 1000),
            consentTimestamp: consentStatus === 'confirmed' ? new Date() : null,
          },
        },
      },
    });
    const tokenService = app.get(TokenService);
    const { accessToken } = await tokenService.issueTokenPair(user.id, user.role);
    return { userId: user.id, accessToken: accessToken.token };
  }

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  // ---------- POST /conversations: find-or-create ----------

  describe('POST /conversations', () => {
    it('creates on first call (201, sorted participant set, real row + participantKey), and RETURNS THE SAME ONE on the second call (200) — from either direction', async () => {
      const alice = await createUser('foc-alice');
      const bob = await createUser('foc-bob');
      const prisma = getTestPrismaClient();

      const first = await request(server())
        .post('/conversations')
        .set(auth(alice.accessToken))
        .send({ recipientId: bob.userId })
        .expect(201);

      expect(first.body).toMatchObject({
        id: expect.any(String),
        otherParticipant: { id: bob.userId, displayName: bob.displayName },
        lastMessage: null,
        unreadCount: 0,
      });

      const row = await prisma.conversation.findUniqueOrThrow({ where: { id: first.body.id } });
      expect([...row.participantIds].sort()).toEqual([alice.userId, bob.userId].sort());
      expect(row.participantKey).toBe([alice.userId, bob.userId].sort().join(':'));

      // Alice asks again -> 200, same conversation.
      const again = await request(server())
        .post('/conversations')
        .set(auth(alice.accessToken))
        .send({ recipientId: bob.userId })
        .expect(200);
      expect(again.body.id).toBe(first.body.id);

      // Bob starts a conversation with Alice -> still the same one (200).
      const fromBob = await request(server())
        .post('/conversations')
        .set(auth(bob.accessToken))
        .send({ recipientId: alice.userId })
        .expect(200);
      expect(fromBob.body.id).toBe(first.body.id);

      expect(await prisma.conversation.count()).toBe(1);
    });

    it('two concurrent starts for the same pair create exactly ONE Conversation row', async () => {
      const alice = await createUser('race-alice');
      const bob = await createUser('race-bob');
      const prisma = getTestPrismaClient();

      const fire = () =>
        request(server()).post('/conversations').set(auth(alice.accessToken)).send({ recipientId: bob.userId });

      const [r1, r2] = await Promise.all([fire(), fire()]);
      expect([r1.status, r2.status].sort()).toEqual([200, 201]);
      expect(r1.body.id).toBe(r2.body.id);
      expect(await prisma.conversation.count()).toBe(1);
    });

    it('rejects starting a conversation with yourself (400)', async () => {
      const alice = await createUser('self');
      await request(server())
        .post('/conversations')
        .set(auth(alice.accessToken))
        .send({ recipientId: alice.userId })
        .expect(400);
    });

    it('404s for a non-existent recipient, and requires auth (401)', async () => {
      const alice = await createUser('missing');
      await request(server())
        .post('/conversations')
        .set(auth(alice.accessToken))
        .send({ recipientId: '11111111-1111-4111-8111-111111111111' })
        .expect(404);
      await request(server())
        .post('/conversations')
        .send({ recipientId: alice.userId })
        .expect(401);
    });
  });

  // ---------- Decision Log #12: restricted-pending minors, both directions ----------

  describe('restricted-pending minor (Decision Log #12)', () => {
    it('cannot be the RECIPIENT of a new conversation (404, treated like a non-existent user)', async () => {
      const adult = await createUser('recv-adult');
      const pendingMinor = await createMinor('recv', 'pending');
      const confirmedMinor = await createMinor('recv-ok', 'confirmed');

      await request(server())
        .post('/conversations')
        .set(auth(adult.accessToken))
        .send({ recipientId: pendingMinor.userId })
        .expect(404);

      // A minor WITH confirmed consent is messageable.
      await request(server())
        .post('/conversations')
        .set(auth(adult.accessToken))
        .send({ recipientId: confirmedMinor.userId })
        .expect(201);

      const prisma = getTestPrismaClient();
      expect(await prisma.conversation.count()).toBe(1);
    });

    it('cannot SEND — POST /conversations and POST .../messages are 403 guardian_consent_pending — but CAN read GET /conversations', async () => {
      const adult = await createUser('send-adult');
      const pendingMinor = await createMinor('send', 'pending');

      const blocked = await request(server())
        .post('/conversations')
        .set(auth(pendingMinor.accessToken))
        .send({ recipientId: adult.userId })
        .expect(403);
      expect(blocked.body.code).toBe('guardian_consent_pending');

      // Reading their (empty) inbox is fine — no guard on GET /conversations.
      const inbox = await request(server())
        .get('/conversations')
        .set(auth(pendingMinor.accessToken))
        .expect(200);
      expect(inbox.body.items).toEqual([]);

      const prisma = getTestPrismaClient();
      expect(await prisma.conversation.count()).toBe(0);
    });
  });

  // ---------- Deactivated recipient (Decision Log #221) ----------

  it('cannot start a conversation with a deactivated account (404)', async () => {
    const alice = await createUser('deact-alice');
    const bob = await createUser('deact-bob');
    const prisma = getTestPrismaClient();
    await prisma.user.update({ where: { id: bob.userId }, data: { accountStatus: 'deactivated' } });

    await request(server())
      .post('/conversations')
      .set(auth(alice.accessToken))
      .send({ recipientId: bob.userId })
      .expect(404);
  });

  // ---------- Send + the transactional lastMessageAt bump ----------

  describe('POST /conversations/:id/messages', () => {
    it('creates the message and bumps Conversation.lastMessageAt to the message sentAt, atomically', async () => {
      const alice = await createUser('send-a');
      const bob = await createUser('send-b');
      const prisma = getTestPrismaClient();

      const convo = (
        await request(server())
          .post('/conversations')
          .set(auth(alice.accessToken))
          .send({ recipientId: bob.userId })
          .expect(201)
      ).body;

      const before = await prisma.conversation.findUniqueOrThrow({ where: { id: convo.id } });
      expect(before.lastMessageAt.getTime()).toBe(before.createdAt.getTime());

      const sent = await request(server())
        .post(`/conversations/${convo.id}/messages`)
        .set(auth(alice.accessToken))
        .send({ contentText: 'first message' })
        .expect(201);

      expect(sent.body).toMatchObject({
        conversationId: convo.id,
        senderId: alice.userId,
        contentText: 'first message',
        readAt: null,
      });

      const after = await prisma.conversation.findUniqueOrThrow({ where: { id: convo.id } });
      expect(after.lastMessageAt.getTime()).toBe(new Date(sent.body.sentAt).getTime());
      expect(after.lastMessageAt.getTime()).toBeGreaterThan(before.lastMessageAt.getTime());
    });

    it('a non-participant cannot post into the conversation (404, not 403)', async () => {
      const alice = await createUser('np-a');
      const bob = await createUser('np-b');
      const stranger = await createUser('np-stranger');
      const convo = (
        await request(server())
          .post('/conversations')
          .set(auth(alice.accessToken))
          .send({ recipientId: bob.userId })
          .expect(201)
      ).body;

      await request(server())
        .post(`/conversations/${convo.id}/messages`)
        .set(auth(stranger.accessToken))
        .send({ contentText: 'let me in' })
        .expect(404);
    });
  });

  // ---------- Inbox: ordering, unread count, last-message preview ----------

  describe('GET /conversations', () => {
    it('orders by most recent activity, and shows the recipient an unread count + last-message preview that PATCH .../read then clears', async () => {
      const alice = await createUser('inbox-a');
      const bob = await createUser('inbox-b');
      const carol = await createUser('inbox-c');

      // Alice starts two conversations: with Bob first, then Carol.
      const withBob = (
        await request(server()).post('/conversations').set(auth(alice.accessToken)).send({ recipientId: bob.userId }).expect(201)
      ).body;
      const withCarol = (
        await request(server()).post('/conversations').set(auth(alice.accessToken)).send({ recipientId: carol.userId }).expect(201)
      ).body;

      // Then messages the OLDER conversation (Bob) — it should jump to the top.
      await request(server())
        .post(`/conversations/${withBob.id}/messages`)
        .set(auth(alice.accessToken))
        .send({ contentText: 'yo bob' })
        .expect(201);
      await request(server())
        .post(`/conversations/${withBob.id}/messages`)
        .set(auth(alice.accessToken))
        .send({ contentText: 'you there?' })
        .expect(201);

      // Bob's inbox: the Bob<->Alice conversation is first, unread 2, preview = latest.
      const bobInbox = await request(server()).get('/conversations').set(auth(bob.accessToken)).expect(200);
      expect(bobInbox.body.items).toHaveLength(1);
      expect(bobInbox.body.items[0]).toMatchObject({
        id: withBob.id,
        otherParticipant: { id: alice.userId, displayName: alice.displayName },
        unreadCount: 2,
        lastMessage: { contentText: 'you there?', senderId: alice.userId },
      });

      // Alice's inbox: two conversations, the Bob one first (more recent activity),
      // and unreadCount 0 for both (she sent everything).
      const aliceInbox = await request(server()).get('/conversations').set(auth(alice.accessToken)).expect(200);
      expect(aliceInbox.body.items.map((c: { id: string }) => c.id)).toEqual([withBob.id, withCarol.id]);
      expect(aliceInbox.body.items.every((c: { unreadCount: number }) => c.unreadCount === 0)).toBe(true);

      // Bob opens the thread.
      const read = await request(server())
        .patch(`/conversations/${withBob.id}/read`)
        .set(auth(bob.accessToken))
        .expect(200);
      expect(read.body).toEqual({ conversationId: withBob.id, markedRead: 2 });

      // Idempotent — second call marks 0.
      const readAgain = await request(server())
        .patch(`/conversations/${withBob.id}/read`)
        .set(auth(bob.accessToken))
        .expect(200);
      expect(readAgain.body.markedRead).toBe(0);

      const bobInbox2 = await request(server()).get('/conversations').set(auth(bob.accessToken)).expect(200);
      expect(bobInbox2.body.items[0].unreadCount).toBe(0);
    });

    it('keyset-paginates newest-activity-first', async () => {
      const alice = await createUser('page-a');
      const others = await Promise.all([createUser('page-o1'), createUser('page-o2'), createUser('page-o3')]);
      const prisma = getTestPrismaClient();
      // Create three conversations, then assign explicit strictly-
      // increasing lastMessageAt values so the ordering assertion can't
      // depend on same-millisecond now() resolution (the flake class
      // Decision Log #226 documents).
      const ids: string[] = [];
      for (const o of others) {
        const c = (
          await request(server()).post('/conversations').set(auth(alice.accessToken)).send({ recipientId: o.userId }).expect(201)
        ).body;
        ids.push(c.id);
      }
      for (let i = 0; i < ids.length; i++) {
        await prisma.conversation.update({
          where: { id: ids[i] },
          data: { lastMessageAt: new Date(Date.UTC(2026, 8, 9, 10, 0, i * 5)) },
        });
      }

      const p1 = await request(server()).get('/conversations?limit=2').set(auth(alice.accessToken)).expect(200);
      expect(p1.body.items.map((c: { id: string }) => c.id)).toEqual([ids[2], ids[1]]);
      expect(p1.body.nextCursor).toEqual(expect.any(String));

      const p2 = await request(server())
        .get(`/conversations?limit=2&cursor=${encodeURIComponent(p1.body.nextCursor)}`)
        .set(auth(alice.accessToken))
        .expect(200);
      expect(p2.body.items.map((c: { id: string }) => c.id)).toEqual([ids[0]]);
      expect(p2.body.nextCursor).toBeNull();
    });
  });

  // ---------- Messages: newest-first, keyset, participant-gated ----------

  describe('GET /conversations/:id/messages', () => {
    it('returns messages newest-first and keyset-paginates into history', async () => {
      const alice = await createUser('msgs-a');
      const bob = await createUser('msgs-b');
      const prisma = getTestPrismaClient();
      const convo = (
        await request(server()).post('/conversations').set(auth(alice.accessToken)).send({ recipientId: bob.userId }).expect(201)
      ).body;

      // Seeded directly with explicit strictly-increasing sentAt so the
      // ordering assertion doesn't depend on same-millisecond now()
      // resolution (Decision Log #226). The POST path itself is exercised
      // in the "bumps lastMessageAt" test above.
      for (let i = 0; i < 4; i++) {
        await prisma.message.create({
          data: {
            conversationId: convo.id,
            senderId: alice.userId,
            contentText: `m${i + 1}`,
            sentAt: new Date(Date.UTC(2026, 8, 9, 12, 0, i * 10)),
          },
        });
      }

      const p1 = await request(server())
        .get(`/conversations/${convo.id}/messages?limit=3`)
        .set(auth(bob.accessToken))
        .expect(200);
      expect(p1.body.items.map((m: { contentText: string }) => m.contentText)).toEqual(['m4', 'm3', 'm2']);
      expect(p1.body.nextCursor).toEqual(expect.any(String));

      const p2 = await request(server())
        .get(`/conversations/${convo.id}/messages?limit=3&cursor=${encodeURIComponent(p1.body.nextCursor)}`)
        .set(auth(bob.accessToken))
        .expect(200);
      expect(p2.body.items.map((m: { contentText: string }) => m.contentText)).toEqual(['m1']);
      expect(p2.body.nextCursor).toBeNull();
    });

    it('a non-participant gets 404 on the message list and on mark-read', async () => {
      const alice = await createUser('gate-a');
      const bob = await createUser('gate-b');
      const stranger = await createUser('gate-s');
      const convo = (
        await request(server()).post('/conversations').set(auth(alice.accessToken)).send({ recipientId: bob.userId }).expect(201)
      ).body;

      await request(server())
        .get(`/conversations/${convo.id}/messages`)
        .set(auth(stranger.accessToken))
        .expect(404);
      await request(server())
        .patch(`/conversations/${convo.id}/read`)
        .set(auth(stranger.accessToken))
        .expect(404);
      await request(server()).get('/conversations/does-not-exist/messages').set(auth(alice.accessToken)).expect(404);
    });
  });

  // ---------- Account deletion cascade (Decision Log #44) ----------

  it('hard-deleting a User cascades their Message rows away; the Conversation row survives', async () => {
    const alice = await createUser('cascade-a');
    const bob = await createUser('cascade-b');
    const prisma = getTestPrismaClient();
    const convo = (
      await request(server()).post('/conversations').set(auth(alice.accessToken)).send({ recipientId: bob.userId }).expect(201)
    ).body;
    await request(server())
      .post(`/conversations/${convo.id}/messages`)
      .set(auth(alice.accessToken))
      .send({ contentText: 'bye' })
      .expect(201);

    await prisma.user.delete({ where: { id: alice.userId } });

    expect(await prisma.message.count({ where: { senderId: alice.userId } })).toBe(0);
    // The conversation row persists (participantIds still holds alice's id —
    // a "ghost" conversation, flagged in messaging/README.md).
    await prisma.conversation.findUniqueOrThrow({ where: { id: convo.id } });
  });
});
