import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { TokenService } from '../src/modules/auth/token/token.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { seedDob } from './dob-seed';

// B-061 (Decision Log #472 (d) and (i)): the 'Who can message me' setting and the sensitive-media toggle,
// against real Postgres. New work only: the CHECK constraint on User.dmPermission, the nested
// `following` relation select inside MessagingService's single user read, the DM rule layered on top of
// the age / consent / Block rules, and mediaSensitive taken from the author's CURRENT value at read time
// (so a change also applies to posts already published).
describe('DM permission + sensitive media settings (B-061) e2e', () => {
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

  async function createUser(label: string, extra: Record<string, unknown> = {}) {
    counter += 1;
    const prisma = getTestPrismaClient();
    const name = `dmset${label}${counter}`;
    const user = await prisma.user.create({
      data: {
        email: `${name}@example.com`,
        passwordHash: 'unused-in-this-e2e-spec-file',
        displayName: name,
        username: name,
        verificationStatus: 'verified',
        dateOfBirth: seedDob('1993-03-03'),
        isMinor: false,
        ...extra,
      },
    });
    return { userId: user.id, accessToken: await mint(user.id, user.role), name };
  }

  async function createMinor(label: string, consentStatus: 'pending' | 'confirmed', extra: Record<string, unknown> = {}) {
    counter += 1;
    const prisma = getTestPrismaClient();
    const name = `dmsetminor${label}${counter}`;
    const user = await prisma.user.create({
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
            consentStatus,
            consentToken: `tok-${name}-${Math.random().toString(36).slice(2)}`,
            consentTokenExpiresAt: new Date(Date.now() + 72 * 3600 * 1000),
            consentTimestamp: consentStatus === 'confirmed' ? new Date() : null,
          },
        },
        ...extra,
      },
    });
    return { userId: user.id, accessToken: await mint(user.id, user.role), name };
  }

  const follow = (followerId: string, followeeId: string) =>
    getTestPrismaClient().follow.create({ data: { followerId, followeeId } });
  const setPermission = (userId: string, dmPermission: string) =>
    getTestPrismaClient().user.update({ where: { id: userId }, data: { dmPermission } });
  const startConversation = (token: string, recipientId: string) =>
    request(server()).post('/conversations').set(auth(token)).send({ recipientId });

  // ---------------------------------------------------------------- settings endpoints

  describe('GET / PATCH /users/me/settings', () => {
    it('GET returns the defaults and is not swallowed by GET /users/:id', async () => {
      const u = await createUser('get');
      const res = await request(server()).get('/users/me/settings').set(auth(u.accessToken)).expect(200);
      expect(res.body).toEqual({ dmPermission: 'everyone', mediaSensitive: false });
    });

    it('PATCH is partial: one field leaves the other as it was, and the change is stored', async () => {
      const u = await createUser('patch');
      const prisma = getTestPrismaClient();

      const first = await request(server()).patch('/users/me/settings').set(auth(u.accessToken)).send({ dmPermission: 'following' }).expect(200);
      expect(first.body).toEqual({ dmPermission: 'following', mediaSensitive: false });

      const second = await request(server()).patch('/users/me/settings').set(auth(u.accessToken)).send({ mediaSensitive: true }).expect(200);
      expect(second.body).toEqual({ dmPermission: 'following', mediaSensitive: true });

      const row = await prisma.user.findUniqueOrThrow({ where: { id: u.userId }, select: { dmPermission: true, mediaSensitive: true } });
      expect(row).toEqual({ dmPermission: 'following', mediaSensitive: true });

      const both = await request(server())
        .patch('/users/me/settings')
        .set(auth(u.accessToken))
        .send({ dmPermission: 'none', mediaSensitive: false })
        .expect(200);
      expect(both.body).toEqual({ dmPermission: 'none', mediaSensitive: false });

      const empty = await request(server()).patch('/users/me/settings').set(auth(u.accessToken)).send({}).expect(200);
      expect(empty.body).toEqual({ dmPermission: 'none', mediaSensitive: false });
    });

    it('PATCH rejects invalid values with a 400 and writes nothing', async () => {
      const u = await createUser('bad');
      const prisma = getTestPrismaClient();
      for (const body of [{ dmPermission: 'nobody' }, { dmPermission: null }, { mediaSensitive: 'yes' }, { readReceipts: true }]) {
        await request(server()).patch('/users/me/settings').set(auth(u.accessToken)).send(body).expect(400);
      }
      const row = await prisma.user.findUniqueOrThrow({ where: { id: u.userId }, select: { dmPermission: true, mediaSensitive: true } });
      expect(row).toEqual({ dmPermission: 'everyone', mediaSensitive: false });
    });

    it('the database itself refuses a value outside everyone / following / none (CHECK constraint)', async () => {
      const u = await createUser('check');
      await expect(setPermission(u.userId, 'friends')).rejects.toThrow();
    });

    it('needs a sign-in', async () => {
      await request(server()).get('/users/me/settings').expect(401);
      await request(server()).patch('/users/me/settings').send({ dmPermission: 'none' }).expect(401);
    });

    it('a restricted-pending minor can still change both (they only tighten or soften presentation)', async () => {
      const m = await createMinor('rp', 'pending');
      const res = await request(server())
        .patch('/users/me/settings')
        .set(auth(m.accessToken))
        .send({ dmPermission: 'none', mediaSensitive: true })
        .expect(200);
      expect(res.body).toEqual({ dmPermission: 'none', mediaSensitive: true });
    });

    it('one user\'s change never touches another user', async () => {
      const a = await createUser('iso-a');
      const b = await createUser('iso-b');
      await request(server()).patch('/users/me/settings').set(auth(a.accessToken)).send({ dmPermission: 'none', mediaSensitive: true }).expect(200);
      const res = await request(server()).get('/users/me/settings').set(auth(b.accessToken)).expect(200);
      expect(res.body).toEqual({ dmPermission: 'everyone', mediaSensitive: false });
    });
  });

  // ---------------------------------------------------------------- DM rule

  describe('POST /conversations with the recipient\'s dmPermission', () => {
    it('everyone (the default): a stranger can start a conversation', async () => {
      const sender = await createUser('ev-s');
      const recipient = await createUser('ev-r');
      await startConversation(sender.accessToken, recipient.userId).expect(201);
    });

    it('following: refused unless the RECIPIENT follows the sender, with the same 404 body as a missing user', async () => {
      const sender = await createUser('fo-s');
      const recipient = await createUser('fo-r');
      await setPermission(recipient.userId, 'following');

      const refused = await startConversation(sender.accessToken, recipient.userId).expect(404);
      const missing = await startConversation(sender.accessToken, '00000000-0000-4000-8000-000000000000').expect(404);
      expect(refused.body).toEqual(missing.body);

      // The SENDER following the recipient is not enough (direction matters).
      await follow(sender.userId, recipient.userId);
      await startConversation(sender.accessToken, recipient.userId).expect(404);

      // The RECIPIENT following the sender is.
      await follow(recipient.userId, sender.userId);
      await startConversation(sender.accessToken, recipient.userId).expect(201);
    });

    it('none: refused for everyone, even someone the recipient follows', async () => {
      const sender = await createUser('no-s');
      const recipient = await createUser('no-r');
      await setPermission(recipient.userId, 'none');
      await follow(recipient.userId, sender.userId);
      const refused = await startConversation(sender.accessToken, recipient.userId).expect(404);
      expect(refused.body.message).toBe('User not found');
    });

    it('an existing thread keeps working after the recipient tightens the setting (only STARTING is governed)', async () => {
      const sender = await createUser('ex-s');
      const recipient = await createUser('ex-r');
      const created = await startConversation(sender.accessToken, recipient.userId).expect(201);
      await setPermission(recipient.userId, 'none');

      const again = await startConversation(sender.accessToken, recipient.userId).expect(200);
      expect(again.body.id).toBe(created.body.id);
      await request(server())
        .post(`/conversations/${created.body.id}/messages`)
        .set(auth(sender.accessToken))
        .send({ contentText: 'still here' })
        .expect(201);
    });

    it('can only TIGHTEN: an adult is still refused a minor under every setting (#347)', async () => {
      const adult = await createUser('adult-m');
      const minor = await createMinor('adult-m', 'confirmed');
      for (const perm of ['everyone', 'following']) {
        await setPermission(minor.userId, perm);
        await follow(minor.userId, adult.userId).catch(() => undefined); // already-following is fine
        await startConversation(adult.accessToken, minor.userId).expect(404);
      }
    });

    it('can only TIGHTEN: a restricted-pending minor is unreachable even with following + a follow (#12)', async () => {
      const sender = await createUser('rp-s');
      const minor = await createMinor('rp-r', 'pending');
      await setPermission(minor.userId, 'following');
      await follow(minor.userId, sender.userId);
      await startConversation(sender.accessToken, minor.userId).expect(404);
    });

    it('can only TIGHTEN: an under-16 recipient stays unreachable under everyone (#346)', async () => {
      const sender = await createUser('u16-s');
      const kid = await createMinor('u16-r', 'confirmed', { isUnder16: true });
      await startConversation(sender.accessToken, kid.userId).expect(404);
    });

    it('can only TIGHTEN: a Block still wins (the blocker gets the 403, the blocked sender the 404) with following + a follow', async () => {
      const sender = await createUser('bl-s');
      const recipient = await createUser('bl-r');
      await setPermission(recipient.userId, 'following');
      await follow(recipient.userId, sender.userId);
      const prisma = getTestPrismaClient();

      // Recipient blocks sender: sender sees the plain 404.
      await prisma.block.create({ data: { blockerId: recipient.userId, blockedId: sender.userId } });
      await startConversation(sender.accessToken, recipient.userId).expect(404);
      await prisma.block.deleteMany({});

      // Sender blocks recipient: the blocker gets the explicit 403.
      await prisma.block.create({ data: { blockerId: sender.userId, blockedId: recipient.userId } });
      const res = await startConversation(sender.accessToken, recipient.userId).expect(403);
      expect(res.body.code).toBe('you_blocked_this_user');
    });

    it('minor -> adult is still allowed, and an adult recipient can still tighten against a minor sender', async () => {
      const minor = await createMinor('ma-s', 'confirmed');
      const adult = await createUser('ma-r');
      await startConversation(minor.accessToken, adult.userId).expect(201);

      const adult2 = await createUser('ma-r2');
      await setPermission(adult2.userId, 'none');
      await startConversation(minor.accessToken, adult2.userId).expect(404);
    });
  });

  // ---------------------------------------------------------------- sensitive media

  describe('mediaSensitive on every read that returns post media', () => {
    async function publishedPost(authorId: string, withMedia = true) {
      return getTestPrismaClient().post.create({
        data: {
          authorId,
          contentText: 'a post',
          mediaUrls: withMedia ? ['https://cdn.example.test/post-media/x.jpg'] : [],
        },
      });
    }

    it('GET /posts/:id: follows the author\'s toggle at read time, for the viewer AND the author, and a post with no media is always false', async () => {
      const author = await createUser('ms-author');
      const viewer = await createUser('ms-viewer');
      const withMedia = await publishedPost(author.userId);
      const textOnly = await publishedPost(author.userId, false);

      const read = async (token: string, id: string) =>
        (await request(server()).get(`/posts/${id}`).set(auth(token)).expect(200)).body.mediaSensitive;

      // Off by default.
      expect(await read(viewer.accessToken, withMedia.id)).toBe(false);

      // The author turns it on AFTER the post was published: the already-published post follows.
      await request(server()).patch('/users/me/settings').set(auth(author.accessToken)).send({ mediaSensitive: true }).expect(200);
      expect(await read(viewer.accessToken, withMedia.id)).toBe(true);
      expect(await read(author.accessToken, withMedia.id)).toBe(true);
      expect(await read(viewer.accessToken, textOnly.id)).toBe(false);

      // And back off.
      await request(server()).patch('/users/me/settings').set(auth(author.accessToken)).send({ mediaSensitive: false }).expect(200);
      expect(await read(viewer.accessToken, withMedia.id)).toBe(false);
    });

    it('GET /posts/feed and GET /users/:id/saved-posts carry it, per author', async () => {
      const on = await createUser('ms-on');
      const off = await createUser('ms-off');
      const viewer = await createUser('ms-feed');
      await getTestPrismaClient().user.update({ where: { id: on.userId }, data: { mediaSensitive: true } });
      const onPost = await publishedPost(on.userId);
      const offPost = await publishedPost(off.userId);
      await follow(viewer.userId, on.userId);
      await follow(viewer.userId, off.userId);

      const feed = await request(server()).get('/posts/feed').set(auth(viewer.accessToken)).expect(200);
      const byId = Object.fromEntries(feed.body.items.map((p: { id: string; mediaSensitive: boolean }) => [p.id, p.mediaSensitive]));
      expect(byId[onPost.id]).toBe(true);
      expect(byId[offPost.id]).toBe(false);

      await request(server()).post(`/posts/${onPost.id}/save`).set(auth(viewer.accessToken)).expect(200);
      const saved = await request(server()).get(`/users/${viewer.userId}/saved-posts`).set(auth(viewer.accessToken)).expect(200);
      expect(saved.body.items[0].post.id).toBe(onPost.id);
      expect(saved.body.items[0].post.mediaSensitive).toBe(true);
    });

    it('never exposes the raw toggle on the author object', async () => {
      const author = await createUser('ms-raw');
      const viewer = await createUser('ms-rawv');
      await getTestPrismaClient().user.update({ where: { id: author.userId }, data: { mediaSensitive: true } });
      const post = await publishedPost(author.userId);
      const res = await request(server()).get(`/posts/${post.id}`).set(auth(viewer.accessToken)).expect(200);
      expect(res.body.author).toEqual({ id: author.userId, publicName: author.name, isFollowing: false });
    });
  });
});
