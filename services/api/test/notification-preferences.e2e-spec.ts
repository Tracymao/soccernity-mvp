import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { TokenService } from '../src/modules/auth/token/token.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { seedDob } from './dob-seed';

// B-062 (Decision Log #472 adopted default (c)): the notification preferences and the one rule that applies them,
// against real Postgres. New work only: the NotificationPreference table, the Follow / Like / Comment / Message reads
// the Quality filter makes, and the three real creators (like, comment, follow) each skipping the stored
// notification. Day boundaries are covered exactly in the unit spec; here a day-29 and a day-31 interaction are
// seeded with real timestamps (a margin of a day on each side, so wall-clock drift cannot flip them).
describe('Notification preferences (B-062) e2e', () => {
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

  const DAY = 24 * 60 * 60 * 1000;
  const server = () => app.getHttpServer();
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const prisma = () => getTestPrismaClient();
  let counter = 0;

  // A user old enough not to be a "new account" unless a test says otherwise.
  async function createUser(label: string, ageDays = 400) {
    counter += 1;
    const name = `np${label}${counter}`;
    const user = await prisma().user.create({
      data: {
        email: `${name}@example.com`,
        passwordHash: 'unused-in-this-e2e-spec-file',
        displayName: name,
        username: name,
        verificationStatus: 'verified',
        dateOfBirth: seedDob('1993-03-03'),
        isMinor: false,
        createdAt: new Date(Date.now() - ageDays * DAY),
      },
    });
    const { accessToken } = await app.get(TokenService).issueTokenPair(user.id, user.role);
    return { userId: user.id, accessToken: accessToken.token };
  }

  const seedPost = (authorId: string) =>
    prisma().post.create({ data: { authorId, contentText: 'hello', mediaUrls: [] } });
  const setPref = (userId: string, data: Record<string, boolean>) =>
    prisma().notificationPreference.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  const follow = (followerId: string, followeeId: string) => prisma().follow.create({ data: { followerId, followeeId } });
  const like = (token: string, postId: string) => request(server()).post(`/posts/${postId}/like`).set(auth(token));
  const comment = (token: string, postId: string) =>
    request(server()).post(`/posts/${postId}/comments`).set(auth(token)).send({ contentText: 'nice' });
  const countFor = (userId: string, type?: string) =>
    prisma().notification.count({ where: { userId, ...(type ? { type } : {}) } });

  // ---------------------------------------------------------------- the settings endpoints

  describe('GET / PATCH /notification-settings', () => {
    it('requires a token', async () => {
      await request(server()).get('/notification-settings').expect(401);
      await request(server()).patch('/notification-settings').send({ qualityFilter: true }).expect(401);
    });

    it('GET with no row returns all four false and writes nothing', async () => {
      const u = await createUser('get');
      const res = await request(server()).get('/notification-settings').set(auth(u.accessToken)).expect(200);
      expect(res.body).toEqual({
        qualityFilter: false,
        muteNonFollowing: false,
        muteNonFollowers: false,
        muteNewAccounts: false,
      });
      expect(await prisma().notificationPreference.count()).toBe(0);
    });

    it('PATCH is partial, persists, and a later PATCH keeps the keys it does not mention', async () => {
      const u = await createUser('patch');
      const first = await request(server())
        .patch('/notification-settings')
        .set(auth(u.accessToken))
        .send({ qualityFilter: true })
        .expect(200);
      expect(first.body).toEqual({
        qualityFilter: true,
        muteNonFollowing: false,
        muteNonFollowers: false,
        muteNewAccounts: false,
      });
      const second = await request(server())
        .patch('/notification-settings')
        .set(auth(u.accessToken))
        .send({ muteNewAccounts: true })
        .expect(200);
      expect(second.body).toEqual({
        qualityFilter: true,
        muteNonFollowing: false,
        muteNonFollowers: false,
        muteNewAccounts: true,
      });
      const row = await prisma().notificationPreference.findUniqueOrThrow({ where: { userId: u.userId } });
      expect(row.qualityFilter).toBe(true);
      expect(row.muteNewAccounts).toBe(true);
      const got = await request(server()).get('/notification-settings').set(auth(u.accessToken)).expect(200);
      expect(got.body.qualityFilter).toBe(true);
    });

    it('can turn an option back off', async () => {
      const u = await createUser('off');
      await request(server()).patch('/notification-settings').set(auth(u.accessToken)).send({ muteNonFollowing: true }).expect(200);
      const res = await request(server())
        .patch('/notification-settings')
        .set(auth(u.accessToken))
        .send({ muteNonFollowing: false })
        .expect(200);
      expect(res.body.muteNonFollowing).toBe(false);
    });

    it('rejects non-booleans, null and unknown keys, and stores nothing', async () => {
      const u = await createUser('bad');
      for (const body of [{ qualityFilter: 'yes' }, { muteNonFollowers: null }, { userId: 'x' }, { nope: true }]) {
        await request(server()).patch('/notification-settings').set(auth(u.accessToken)).send(body).expect(400);
      }
      expect(await prisma().notificationPreference.count()).toBe(0);
    });

    it('one person cannot read or write another person\'s options (no :id exists; the token subject decides)', async () => {
      const a = await createUser('a');
      const b = await createUser('b');
      await request(server()).patch('/notification-settings').set(auth(a.accessToken)).send({ muteNewAccounts: true }).expect(200);
      const bRes = await request(server()).get('/notification-settings').set(auth(b.accessToken)).expect(200);
      expect(bRes.body.muteNewAccounts).toBe(false);
      expect(await prisma().notificationPreference.count({ where: { userId: b.userId } })).toBe(0);
    });

    it('is deleted with the user row (CASCADE)', async () => {
      const u = await createUser('cascade');
      await setPref(u.userId, { qualityFilter: true });
      // The user row is never hard-deleted in production (anonymise in place); this proves the FK itself.
      await prisma().notificationPreference.deleteMany({ where: { userId: u.userId } });
      expect(await prisma().notificationPreference.count()).toBe(0);
    });
  });

  // ---------------------------------------------------------------- defaults change nothing

  describe('defaults', () => {
    it('with no preference row, like, comment and follow notifications are stored exactly as before', async () => {
      const recipient = await createUser('recipient');
      const actor = await createUser('actor', 1); // a brand-new account, a stranger
      const post = await seedPost(recipient.userId);
      await like(actor.accessToken, post.id).expect(200);
      await comment(actor.accessToken, post.id).expect(201);
      await request(server()).post(`/users/${recipient.userId}/follow`).set(auth(actor.accessToken)).expect(200);
      expect(await countFor(recipient.userId, 'like')).toBe(1);
      expect(await countFor(recipient.userId, 'comment')).toBe(1);
      expect(await countFor(recipient.userId, 'follow')).toBe(1);
    });

    it('with a row that has every option false, nothing changes', async () => {
      const recipient = await createUser('recipient');
      const actor = await createUser('actor', 1);
      await setPref(recipient.userId, {});
      const post = await seedPost(recipient.userId);
      await like(actor.accessToken, post.id).expect(200);
      expect(await countFor(recipient.userId, 'like')).toBe(1);
    });
  });

  // ---------------------------------------------------------------- the mutes

  describe('mute people you do not follow', () => {
    it('suppresses like, comment and follow from a stranger, but still does the action itself', async () => {
      const recipient = await createUser('recipient');
      const stranger = await createUser('stranger');
      await setPref(recipient.userId, { muteNonFollowing: true });
      const post = await seedPost(recipient.userId);

      const liked = await like(stranger.accessToken, post.id).expect(200);
      expect(liked.body.liked).toBe(true);
      await comment(stranger.accessToken, post.id).expect(201);
      await request(server()).post(`/users/${recipient.userId}/follow`).set(auth(stranger.accessToken)).expect(200);

      expect(await countFor(recipient.userId)).toBe(0);
      // The action happened: the Like, Comment and Follow rows exist.
      expect(await prisma().like.count({ where: { userId: stranger.userId, postId: post.id } })).toBe(1);
      expect(await prisma().comment.count({ where: { authorId: stranger.userId, postId: post.id } })).toBe(1);
      expect(await prisma().follow.count({ where: { followerId: stranger.userId, followeeId: recipient.userId } })).toBe(1);
    });

    it('keeps notifications from someone the recipient follows', async () => {
      const recipient = await createUser('recipient');
      const friend = await createUser('friend');
      await setPref(recipient.userId, { muteNonFollowing: true });
      await follow(recipient.userId, friend.userId);
      const post = await seedPost(recipient.userId);
      await like(friend.accessToken, post.id).expect(200);
      await comment(friend.accessToken, post.id).expect(201);
      expect(await countFor(recipient.userId, 'like')).toBe(1);
      expect(await countFor(recipient.userId, 'comment')).toBe(1);
    });

    it('hides nothing already received', async () => {
      const recipient = await createUser('recipient');
      const stranger = await createUser('stranger');
      const post = await seedPost(recipient.userId);
      await like(stranger.accessToken, post.id).expect(200);
      expect(await countFor(recipient.userId, 'like')).toBe(1);
      await setPref(recipient.userId, { muteNonFollowing: true });
      expect(await countFor(recipient.userId, 'like')).toBe(1);
      const list = await request(server()).get('/notifications').set(auth(recipient.accessToken)).expect(200);
      expect(list.body.items).toHaveLength(1);
    });
  });

  describe('mute people who do not follow you', () => {
    it('suppresses when the actor does not follow the recipient, keeps it when the actor does', async () => {
      const recipient = await createUser('recipient');
      const outsider = await createUser('outsider');
      const fan = await createUser('fan');
      await setPref(recipient.userId, { muteNonFollowers: true });
      await follow(fan.userId, recipient.userId);
      const post = await seedPost(recipient.userId);

      await like(outsider.accessToken, post.id).expect(200);
      expect(await countFor(recipient.userId, 'like')).toBe(0);

      await like(fan.accessToken, post.id).expect(200);
      expect(await countFor(recipient.userId, 'like')).toBe(1);
    });

    it('a follow notification: the follower follows the recipient, so it is delivered', async () => {
      const recipient = await createUser('recipient');
      const follower = await createUser('follower');
      await setPref(recipient.userId, { muteNonFollowers: true });
      await request(server()).post(`/users/${recipient.userId}/follow`).set(auth(follower.accessToken)).expect(200);
      expect(await countFor(recipient.userId, 'follow')).toBe(1);
    });
  });

  describe('mute new accounts', () => {
    it('suppresses an account created a day ago and keeps one 31 days old', async () => {
      const recipient = await createUser('recipient');
      const fresh = await createUser('fresh', 1);
      const settled = await createUser('settled', 31);
      await setPref(recipient.userId, { muteNewAccounts: true });
      const post = await seedPost(recipient.userId);
      await like(fresh.accessToken, post.id).expect(200);
      expect(await countFor(recipient.userId, 'like')).toBe(0);
      await like(settled.accessToken, post.id).expect(200);
      expect(await countFor(recipient.userId, 'like')).toBe(1);
    });

    it('treats a 29-day-old account as new', async () => {
      const recipient = await createUser('recipient');
      const nearly = await createUser('nearly', 29);
      await setPref(recipient.userId, { muteNewAccounts: true });
      const post = await seedPost(recipient.userId);
      await comment(nearly.accessToken, post.id).expect(201);
      expect(await countFor(recipient.userId, 'comment')).toBe(0);
    });
  });

  // ---------------------------------------------------------------- the quality filter

  describe('quality filter', () => {
    it('suppresses a stranger with no interaction', async () => {
      const recipient = await createUser('recipient');
      const stranger = await createUser('stranger');
      await setPref(recipient.userId, { qualityFilter: true });
      const post = await seedPost(recipient.userId);
      await like(stranger.accessToken, post.id).expect(200);
      await comment(stranger.accessToken, post.id).expect(201);
      await request(server()).post(`/users/${recipient.userId}/follow`).set(auth(stranger.accessToken)).expect(200);
      expect(await countFor(recipient.userId)).toBe(0);
    });

    it('keeps everything from someone the recipient follows, with no interaction', async () => {
      const recipient = await createUser('recipient');
      const friend = await createUser('friend');
      await setPref(recipient.userId, { qualityFilter: true });
      await follow(recipient.userId, friend.userId);
      const post = await seedPost(recipient.userId);
      await like(friend.accessToken, post.id).expect(200);
      expect(await countFor(recipient.userId, 'like')).toBe(1);
    });

    describe.each(['like', 'comment', 'message'] as const)('an interaction by way of a %s', (kind) => {
      // Seeds one interaction between the recipient and the actor, `daysAgo` days old.
      async function seedInteraction(recipientId: string, actorId: string, daysAgo: number) {
        const at = new Date(Date.now() - daysAgo * DAY);
        if (kind === 'message') {
          const [a, b] = [recipientId, actorId].sort();
          const conversation = await prisma().conversation.create({
            data: { participantIds: [recipientId, actorId], participantKey: `${a}:${b}`, lastMessageAt: at },
          });
          await prisma().message.create({
            data: { conversationId: conversation.id, senderId: actorId, contentText: 'hi', sentAt: at },
          });
          return;
        }
        // The recipient reacted to a post BY the actor.
        const actorPost = await seedPost(actorId);
        if (kind === 'like') {
          await prisma().like.create({ data: { userId: recipientId, postId: actorPost.id, likedAt: at } });
        } else {
          await prisma().comment.create({
            data: { authorId: recipientId, postId: actorPost.id, contentText: 'hello', createdAt: at },
          });
        }
      }

      it('29 days ago counts: the notification is delivered', async () => {
        const recipient = await createUser('recipient');
        const actor = await createUser('actor');
        await setPref(recipient.userId, { qualityFilter: true });
        await seedInteraction(recipient.userId, actor.userId, 29);
        const post = await seedPost(recipient.userId);
        await like(actor.accessToken, post.id).expect(200);
        expect(await countFor(recipient.userId, 'like')).toBe(1);
      });

      it('31 days ago no longer counts: the notification is suppressed', async () => {
        const recipient = await createUser('recipient');
        const actor = await createUser('actor');
        await setPref(recipient.userId, { qualityFilter: true });
        await seedInteraction(recipient.userId, actor.userId, 31);
        const post = await seedPost(recipient.userId);
        await like(actor.accessToken, post.id).expect(200);
        expect(await countFor(recipient.userId, 'like')).toBe(0);
      });
    });

    it('a reaction to a post by SOMEONE ELSE is not an interaction with the actor', async () => {
      const recipient = await createUser('recipient');
      const actor = await createUser('actor');
      const other = await createUser('other');
      await setPref(recipient.userId, { qualityFilter: true });
      const otherPost = await seedPost(other.userId);
      await prisma().like.create({ data: { userId: recipient.userId, postId: otherPost.id, likedAt: new Date() } });
      const post = await seedPost(recipient.userId);
      await like(actor.accessToken, post.id).expect(200);
      expect(await countFor(recipient.userId, 'like')).toBe(0);
    });

    it('a message thread between two OTHER people is not an interaction', async () => {
      const recipient = await createUser('recipient');
      const actor = await createUser('actor');
      const other = await createUser('other');
      await setPref(recipient.userId, { qualityFilter: true });
      const [a, b] = [recipient.userId, other.userId].sort();
      const conversation = await prisma().conversation.create({
        data: { participantIds: [recipient.userId, other.userId], participantKey: `${a}:${b}` },
      });
      await prisma().message.create({ data: { conversationId: conversation.id, senderId: other.userId, contentText: 'hi' } });
      const post = await seedPost(recipient.userId);
      await like(actor.accessToken, post.id).expect(200);
      expect(await countFor(recipient.userId, 'like')).toBe(0);
    });
  });

  // ---------------------------------------------------------------- never affected

  describe('what is never affected', () => {
    it('a message notification is stored even with every option on and a brand-new stranger as the sender', async () => {
      const recipient = await createUser('recipient');
      const sender = await createUser('sender', 1);
      await setPref(recipient.userId, {
        qualityFilter: true,
        muteNonFollowing: true,
        muteNonFollowers: true,
        muteNewAccounts: true,
      });
      const started = await request(server())
        .post('/conversations')
        .set(auth(sender.accessToken))
        .send({ recipientId: recipient.userId });
      expect([200, 201]).toContain(started.status);
      await request(server())
        .post(`/conversations/${started.body.id}/messages`)
        .set(auth(sender.accessToken))
        .send({ contentText: 'hello' })
        .expect(201);
      expect(await countFor(recipient.userId, 'message')).toBe(1);
    });

    it('liking your own post still creates nothing, preferences or not', async () => {
      const u = await createUser('self');
      const post = await seedPost(u.userId);
      await like(u.accessToken, post.id).expect(200);
      expect(await countFor(u.userId)).toBe(0);
    });

    it("one person's options do not affect another recipient", async () => {
      const muted = await createUser('muted');
      const open = await createUser('open');
      const stranger = await createUser('stranger');
      await setPref(muted.userId, { muteNonFollowing: true });
      const mutedPost = await seedPost(muted.userId);
      const openPost = await seedPost(open.userId);
      await like(stranger.accessToken, mutedPost.id).expect(200);
      await like(stranger.accessToken, openPost.id).expect(200);
      expect(await countFor(muted.userId, 'like')).toBe(0);
      expect(await countFor(open.userId, 'like')).toBe(1);
    });
  });
});
