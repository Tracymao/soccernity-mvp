import { INestApplication, ServiceUnavailableException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AccountDeletionSweepService } from '../src/modules/account-deletion/account-deletion-sweep.service';
import { AdminTokenService } from '../src/modules/admin/token/admin-token.service';
import { TokenService } from '../src/modules/auth/token/token.service';
import { StorageService } from '../src/storage/storage.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { seedDob } from './dob-seed';

// backend/w5-profile-block (B-035, B-038, B-039, B-082 backend leg, B-081), against the
// real app and real Postgres. Two describes with their OWN app instance:
//   1. Block + profile content, with the REAL (unconfigured) StorageService,
//   2. the avatar lifecycle, with a FAKE StorageService (no object store exists in CI).

const rand = () => Math.random().toString(36).slice(2, 10);
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);

async function bootApp(configure?: (b: ReturnType<typeof Test.createTestingModule>) => void): Promise<INestApplication> {
  const builder = Test.createTestingModule({ imports: [AppModule] });
  configure?.(builder);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  return app;
}

interface SeedOptions {
  label: string;
  username?: string | null;
  minor?: 'confirmed' | 'pending';
  declaredCountry?: string;
  profileCountry?: string | null;
  bio?: string | null;
  preferredClub?: string | null;
  unverified?: boolean;
}

async function seedUser(app: INestApplication, o: SeedOptions) {
  const prisma = getTestPrismaClient();
  const suffix = `${Date.now()}-${rand()}`;
  const user = await prisma.user.create({
    data: {
      email: `e2e-w5-${o.label}-${suffix}@example.com`,
      passwordHash: 'unused-in-this-spec',
      displayName: `Real Name ${o.label}`,
      username: o.username === undefined ? `${o.label}_${rand()}`.slice(0, 24).toLowerCase() : o.username,
      dateOfBirth: seedDob(o.minor ? '2012-03-03' : '1994-05-05'),
      isMinor: Boolean(o.minor),
      verificationStatus: o.unverified ? 'unverified' : 'verified',
      declaredCountry: o.declaredCountry ?? null,
      profileCountry: o.profileCountry ?? null,
      bio: o.bio ?? null,
      preferredClub: o.preferredClub ?? null,
    },
  });
  if (o.minor) {
    await prisma.guardian.create({
      data: {
        minorUserId: user.id,
        name: 'Guardian Person',
        email: `guardian-${suffix}@example.com`,
        relationship: 'Parent',
        consentToken: `consent-${suffix}`,
        consentTokenExpiresAt: new Date(Date.now() + 48 * 3600 * 1000),
        consentStatus: o.minor,
      },
    });
  }
  const { accessToken } = await app.get(TokenService).issueTokenPair(user.id, user.role);
  return { id: user.id, username: user.username as string, auth: bearer(accessToken.token) };
}

type U = Awaited<ReturnType<typeof seedUser>>;

// ---------------------------------------------------------------------------
describe('Block + profile content e2e (real Postgres)', () => {
  let app: INestApplication;
  const http = () => app.getHttpServer();

  beforeAll(async () => {
    app = await bootApp();
  });
  beforeEach(async () => resetDatabase());
  afterAll(async () => {
    await app.close();
    await disconnectTestPrismaClient();
  });

  const block = (by: U, target: U, body: Record<string, unknown> = {}) =>
    request(http()).post(`/users/${target.id}/block`).set(by.auth).send(body);

  describe('the Block model and endpoints (B-039)', () => {
    it('creates the row, removes follows in BOTH directions, and an unblock does NOT restore them', async () => {
      const a = await seedUser(app, { label: 'a' });
      const b = await seedUser(app, { label: 'b' });
      await request(http()).post(`/users/${b.id}/follow`).set(a.auth).expect(200);
      await request(http()).post(`/users/${a.id}/follow`).set(b.auth).expect(200);
      const prisma = getTestPrismaClient();
      expect(await prisma.follow.count()).toBe(2);

      const res = await block(a, b, { reason: 'abusive' }).expect(200);
      expect(res.body).toEqual({ userId: b.id, blocked: true });
      expect(await prisma.block.count({ where: { blockerId: a.id, blockedId: b.id } })).toBe(1);
      expect(await prisma.follow.count()).toBe(0);

      await request(http()).delete(`/users/${b.id}/block`).set(a.auth).expect(200);
      expect(await prisma.block.count()).toBe(0);
      expect(await prisma.follow.count()).toBe(0); // NOT restored
    });

    it('is idempotent and the FIRST reason stands (the reason is not editable: unblock and re-block to change it)', async () => {
      const a = await seedUser(app, { label: 'a' });
      const b = await seedUser(app, { label: 'b' });
      await block(a, b, { reason: 'first' }).expect(200);
      await block(a, b, { reason: 'second' }).expect(200);
      const rows = await getTestPrismaClient().block.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0].reason).toBe('first');

      await request(http()).delete(`/users/${b.id}/block`).set(a.auth).expect(200);
      await block(a, b, { reason: 'second' }).expect(200);
      expect((await getTestPrismaClient().block.findMany())[0].reason).toBe('second');
    });

    it('rejects self-block (400), and the DB CHECK refuses a self-block row from any other writer', async () => {
      const a = await seedUser(app, { label: 'a' });
      await block(a, a).expect(400);
      await expect(getTestPrismaClient().block.create({ data: { blockerId: a.id, blockedId: a.id } })).rejects.toThrow();
    });

    it('blocking a missing, deactivated or restricted-pending user is a 404 and creates nothing', async () => {
      const a = await seedUser(app, { label: 'a' });
      const gone = await seedUser(app, { label: 'gone' });
      await getTestPrismaClient().user.update({ where: { id: gone.id }, data: { accountStatus: 'deactivated' } });
      const minor = await seedUser(app, { label: 'minor', minor: 'pending' });
      await request(http()).post('/users/00000000-0000-0000-0000-000000000000/block').set(a.auth).expect(404);
      await block(a, gone).expect(404);
      await block(a, minor).expect(404);
      expect(await getTestPrismaClient().block.count()).toBe(0);
    });

    it('the blocker list: own only, newest first, public name + reason, NO date, no real name; paginated by sequence', async () => {
      const a = await seedUser(app, { label: 'a' });
      const names: U[] = [];
      for (const label of ['b1', 'b2', 'b3']) {
        const t = await seedUser(app, { label });
        names.push(t);
        await block(a, t, label === 'b2' ? { reason: 'rude' } : {}).expect(200);
      }
      const page1 = await request(http()).get(`/users/${a.id}/blocks?limit=2`).set(a.auth).expect(200);
      expect(page1.body.items.map((i: { id: string }) => i.id)).toEqual([names[2].id, names[1].id]);
      expect(page1.body.items[1]).toEqual({ id: names[1].id, publicName: names[1].username, reason: 'rude' });
      expect(JSON.stringify(page1.body)).not.toMatch(/Real Name|createdAt|blockedAt/);
      expect(JSON.parse(Buffer.from(page1.body.nextCursor, 'base64url').toString())).toEqual({ sequence: expect.any(Number) });

      const page2 = await request(http()).get(`/users/${a.id}/blocks?limit=2&cursor=${page1.body.nextCursor}`).set(a.auth).expect(200);
      expect(page2.body.items.map((i: { id: string }) => i.id)).toEqual([names[0].id]);
      expect(page2.body.nextCursor).toBeNull();

      await request(http()).get(`/users/${a.id}/blocks`).set(names[0].auth).expect(403);
      // The blocked user's own list does not show the blocker.
      const theirs = await request(http()).get(`/users/${names[0].id}/blocks`).set(names[0].auth).expect(200);
      expect(theirs.body.items).toEqual([]);
    });
  });

  describe('a blocked user sees the blocker profile as NOT FOUND, identical to a profile that does not exist', () => {
    it('same status and body; the blocker still reaches the profile (viewerHasBlocked) and no response tells the blocked user', async () => {
      const a = await seedUser(app, { label: 'a', bio: 'Hello' });
      const b = await seedUser(app, { label: 'b' });
      await block(a, b).expect(200);

      const asBlocked = await request(http()).get(`/users/${a.id}/public-profile`).set(b.auth);
      const missing = await request(http()).get('/users/00000000-0000-0000-0000-000000000000/public-profile').set(b.auth);
      expect(asBlocked.status).toBe(404);
      expect(asBlocked.status).toBe(missing.status);
      expect(asBlocked.body).toEqual(missing.body);

      const asBlocker = await request(http()).get(`/users/${b.id}/public-profile`).set(a.auth).expect(200);
      expect(asBlocker.body.viewerHasBlocked).toBe(true);

      // follower / following lists of the blocker are the same 404 for the blocked user
      await request(http()).get(`/users/${a.id}/followers`).set(b.auth).expect(404);
      await request(http()).get(`/users/${a.id}/following`).set(b.auth).expect(404);
    });

    it('unblocking restores the profile to the formerly blocked user', async () => {
      const a = await seedUser(app, { label: 'a' });
      const b = await seedUser(app, { label: 'b' });
      await block(a, b).expect(200);
      await request(http()).delete(`/users/${b.id}/block`).set(a.auth).expect(200);
      await request(http()).get(`/users/${a.id}/public-profile`).set(b.auth).expect(200);
    });
  });

  describe('content is hidden in BOTH directions, counts unchanged', () => {
    async function setup() {
      const prisma = getTestPrismaClient();
      const a = await seedUser(app, { label: 'a' });
      const b = await seedUser(app, { label: 'b' });
      const c = await seedUser(app, { label: 'c' });
      const club = await prisma.clubPage.create({ data: { name: `Club ${rand()}`, memberCount: 3 } });
      const postA = await prisma.post.create({ data: { authorId: a.id, contentText: 'post by A', clubPageId: club.id } });
      const postB = await prisma.post.create({ data: { authorId: b.id, contentText: 'post by B', clubPageId: club.id } });
      const postC = await prisma.post.create({ data: { authorId: c.id, contentText: 'post by C', clubPageId: club.id } });
      return { a, b, c, club, postA, postB, postC };
    }
    const ids = (body: { items: Array<{ id: string }> }) => body.items.map((i) => i.id).sort();

    it('posts: the club feed hides the blocked author from the blocker AND the blocker from the blocked; a third user sees all', async () => {
      const { a, b, c, club, postA, postB, postC } = await setup();
      await block(a, b).expect(200);
      const feed = (u: U) => request(http()).get(`/clubs/${club.id}/feed`).set(u.auth).expect(200);
      expect(ids((await feed(a)).body)).toEqual([postA.id, postC.id].sort());
      expect(ids((await feed(b)).body)).toEqual([postB.id, postC.id].sort());
      expect(ids((await feed(c)).body)).toEqual([postA.id, postB.id, postC.id].sort());
    });

    it('a single post, like, comment, save and view by a blocked pair are the plain 404; counts are untouched', async () => {
      const { a, b, postA, postB } = await setup();
      await block(a, b).expect(200);
      const prisma = getTestPrismaClient();
      const likesBefore = (await prisma.post.findUnique({ where: { id: postA.id } }))?.likeCount;

      for (const [viewer, post] of [[b, postA], [a, postB]] as Array<[U, typeof postA]>) {
        await request(http()).get(`/posts/${post.id}`).set(viewer.auth).expect(404);
        await request(http()).post(`/posts/${post.id}/like`).set(viewer.auth).expect(404);
        await request(http()).post(`/posts/${post.id}/comments`).set(viewer.auth).send({ contentText: 'hi' }).expect(404);
        await request(http()).post(`/posts/${post.id}/save`).set(viewer.auth).expect(404);
        await request(http()).get(`/posts/${post.id}/comments`).set(viewer.auth).expect(404);
      }
      expect(await prisma.like.count()).toBe(0);
      expect(await prisma.comment.count()).toBe(0);
      expect(await prisma.savedPost.count()).toBe(0);
      expect(await prisma.notification.count()).toBe(0);
      expect((await prisma.post.findUnique({ where: { id: postA.id } }))?.likeCount).toBe(likesBefore);
    });

    it('comments: a blocked pair cannot see each other comments on a third post, and commentCount is NOT adjusted', async () => {
      const { a, b, c, postC } = await setup();
      await request(http()).post(`/posts/${postC.id}/comments`).set(a.auth).send({ contentText: 'from A' }).expect(201);
      await request(http()).post(`/posts/${postC.id}/comments`).set(b.auth).send({ contentText: 'from B' }).expect(201);
      await block(a, b).expect(200);

      const texts = async (u: U) =>
        (await request(http()).get(`/posts/${postC.id}/comments`).set(u.auth).expect(200)).body.items.map((i: { contentText: string }) => i.contentText);
      expect(await texts(a)).toEqual(['from A']);
      expect(await texts(b)).toEqual(['from B']);
      expect((await texts(c)).sort()).toEqual(['from A', 'from B']);
      expect((await getTestPrismaClient().post.findUnique({ where: { id: postC.id } }))?.commentCount).toBe(2);
    });

    it('saved posts: a saved post whose author becomes blocked disappears from the list, and returns on unblock', async () => {
      const { a, b, postB } = await setup();
      await request(http()).post(`/posts/${postB.id}/save`).set(a.auth).expect(200);
      const list = async () =>
        (await request(http()).get(`/users/${a.id}/saved-posts`).set(a.auth).expect(200)).body.items.length;
      expect(await list()).toBe(1);
      await block(a, b).expect(200);
      expect(await list()).toBe(0);
      expect(await getTestPrismaClient().savedPost.count()).toBe(1); // row kept
      await request(http()).delete(`/users/${b.id}/block`).set(a.auth).expect(200);
      expect(await list()).toBe(1);
    });

    it('rosters: the club roster and the follower lists hide a blocked pair; the member count is unchanged', async () => {
      const { a, b, c, club } = await setup();
      const prisma = getTestPrismaClient();
      await prisma.clubPage.update({ where: { id: club.id }, data: { members: { connect: [{ id: a.id }, { id: b.id }, { id: c.id }] } } });
      await request(http()).post(`/users/${c.id}/follow`).set(a.auth).expect(200);
      await request(http()).post(`/users/${c.id}/follow`).set(b.auth).expect(200);
      await block(a, b).expect(200);

      const roster = async (u: U) =>
        (await request(http()).get(`/clubs/${club.id}/members`).set(u.auth).expect(200)).body.items.map((i: { id: string }) => i.id).sort();
      expect(await roster(a)).toEqual([a.id, c.id].sort());
      expect(await roster(b)).toEqual([b.id, c.id].sort());
      expect(await roster(c)).toEqual([a.id, b.id, c.id].sort());
      expect((await prisma.clubPage.findUnique({ where: { id: club.id } }))?.memberCount).toBe(3);

      const followers = async (u: U) =>
        (await request(http()).get(`/users/${c.id}/followers`).set(u.auth).expect(200)).body.items.map((i: { id: string }) => i.id).sort();
      expect(await followers(a)).toEqual([a.id]);
      expect(await followers(b)).toEqual([b.id]);
      expect(await followers(c)).toEqual([a.id, b.id].sort());
    });

    it('suggested users never include a blocked pair', async () => {
      const { a, b } = await setup();
      await block(a, b).expect(200);
      const suggested = (await request(http()).get('/users/suggested').set(a.auth).expect(200)).body.items.map((i: { id: string }) => i.id);
      expect(suggested).not.toContain(b.id);
      const reverse = (await request(http()).get('/users/suggested').set(b.auth).expect(200)).body.items.map((i: { id: string }) => i.id);
      expect(reverse).not.toContain(a.id);
    });

    it('search hides a blocked pair for a logged-in caller (users and posts), and still works anonymously', async () => {
      const prisma = getTestPrismaClient();
      const tag = `zq${rand()}`;
      const a = await seedUser(app, { label: 'a', username: `${tag}_aa` });
      const b = await seedUser(app, { label: 'b', username: `${tag}_bb` });
      await prisma.post.create({ data: { authorId: b.id, contentText: `${tag} from b` } });
      await block(a, b).expect(200);

      const asA = await request(http()).get('/search').query({ q: tag }).set(a.auth).expect(200);
      expect(asA.body.users.items.map((u: { id: string }) => u.id)).toEqual([a.id]);
      expect(asA.body.posts.items).toHaveLength(0);
      const asB = await request(http()).get('/search').query({ q: tag }).set(b.auth).expect(200);
      expect(asB.body.users.items.map((u: { id: string }) => u.id)).toEqual([b.id]);
      expect(asB.body.posts.items).toHaveLength(1);
      const anon = await request(http()).get('/search').query({ q: tag }).expect(200);
      expect(anon.body.users.items).toHaveLength(2);
      expect(anon.body.posts.items).toHaveLength(1);
    });

    it('the leaderboard is unaffected by a block', async () => {
      const a = await seedUser(app, { label: 'a' });
      const b = await seedUser(app, { label: 'b' });
      await block(a, b).expect(200);
      await request(http()).get('/leaderboard').set(a.auth).expect(200);
      await request(http()).get('/leaderboard').set(b.auth).expect(200);
    });
  });

  describe('follow and messages stop in both directions; a block never reveals itself', () => {
    it('the blocked user following the blocker is the plain 404, the blocker following gets an explicit coded 403, nothing is created', async () => {
      const a = await seedUser(app, { label: 'a' });
      const b = await seedUser(app, { label: 'b' });
      await block(a, b).expect(200);

      const blocked = await request(http()).post(`/users/${a.id}/follow`).set(b.auth);
      const missing = await request(http()).post('/users/00000000-0000-0000-0000-000000000000/follow').set(b.auth);
      expect(blocked.status).toBe(404);
      expect(blocked.body).toEqual(missing.body);

      const byBlocker = await request(http()).post(`/users/${b.id}/follow`).set(a.auth).expect(403);
      expect(byBlocker.body.code).toBe('you_blocked_this_user');
      expect(await getTestPrismaClient().follow.count()).toBe(0);
      expect(await getTestPrismaClient().notification.count()).toBe(0);
    });

    it('starting a conversation: blocked caller gets the same 404 as a missing recipient, the blocker gets the coded 403', async () => {
      const a = await seedUser(app, { label: 'a' });
      const b = await seedUser(app, { label: 'b' });
      await block(a, b).expect(200);

      const blocked = await request(http()).post('/conversations').set(b.auth).send({ recipientId: a.id });
      const missing = await request(http()).post('/conversations').set(b.auth).send({ recipientId: '00000000-0000-0000-0000-000000000000' });
      expect(blocked.status).toBe(404);
      expect(blocked.body).toEqual(missing.body);
      const byBlocker = await request(http()).post('/conversations').set(a.auth).send({ recipientId: b.id }).expect(403);
      expect(byBlocker.body.code).toBe('you_blocked_this_user');
      expect(await getTestPrismaClient().conversation.count()).toBe(0);
    });

    it('an EXISTING thread: sending stops in both directions (404 for the blocked sender, coded 403 for the blocker); history stays', async () => {
      const a = await seedUser(app, { label: 'a' });
      const b = await seedUser(app, { label: 'b' });
      const convo = (await request(http()).post('/conversations').set(a.auth).send({ recipientId: b.id }).expect(201)).body;
      await request(http()).post(`/conversations/${convo.id}/messages`).set(a.auth).send({ contentText: 'before' }).expect(201);
      await block(a, b).expect(200);

      const blockedSend = await request(http()).post(`/conversations/${convo.id}/messages`).set(b.auth).send({ contentText: 'after' }).expect(404);
      expect(blockedSend.body.message).toBe('Conversation not found');
      const blockerSend = await request(http()).post(`/conversations/${convo.id}/messages`).set(a.auth).send({ contentText: 'after' }).expect(403);
      expect(blockerSend.body.code).toBe('you_blocked_this_user');
      expect(await getTestPrismaClient().message.count()).toBe(1);
      const history = await request(http()).get(`/conversations/${convo.id}/messages`).set(a.auth).expect(200);
      expect(history.body.items).toHaveLength(1);
    });

    it('applies on top of the age rules: an under-16 recipient is still the plain 404 for a blocker who would otherwise get the 403', async () => {
      const a = await seedUser(app, { label: 'a' });
      const kid = await seedUser(app, { label: 'kid', minor: 'confirmed' });
      await getTestPrismaClient().user.update({ where: { id: kid.id }, data: { isUnder16: true } });
      await block(a, kid).expect(200);
      const res = await request(http()).post('/conversations').set(a.auth).send({ recipientId: kid.id });
      expect(res.status).toBe(404);
      expect(res.body.code).toBeUndefined();
    });
  });

  // B-197 (Decision Log #411 item 5): Block, unblock and the blocked list need
  // authentication only. This REPLACES the W5 test that pinned the opposite.
  describe('Block is exempt from the consent and email-verification guards (B-197)', () => {
    it('a restricted-pending minor can block, list and unblock', async () => {
      const minor = await seedUser(app, { label: 'minor', minor: 'pending' });
      const other = await seedUser(app, { label: 'other' });
      await block(minor, other, { reason: 'bothering me' }).expect(200);
      expect(await getTestPrismaClient().block.count({ where: { blockerId: minor.id, blockedId: other.id } })).toBe(1);
      const list = await request(http()).get(`/users/${minor.id}/blocks`).set(minor.auth).expect(200);
      expect(list.body.items).toHaveLength(1);
      await request(http()).delete(`/users/${other.id}/block`).set(minor.auth).expect(200);
      expect(await getTestPrismaClient().block.count()).toBe(0);
    });

    it('an account whose e-mail is not verified can block, list and unblock', async () => {
      const unverified = await seedUser(app, { label: 'unv', unverified: true });
      const other = await seedUser(app, { label: 'other' });
      await block(unverified, other).expect(200);
      await request(http()).get(`/users/${unverified.id}/blocks`).set(unverified.auth).expect(200);
      await request(http()).delete(`/users/${other.id}/block`).set(unverified.auth).expect(200);
      expect(await getTestPrismaClient().block.count()).toBe(0);
    });

    it('authentication is still required on all three routes', async () => {
      const other = await seedUser(app, { label: 'other' });
      await request(http()).post(`/users/${other.id}/block`).send({}).expect(401);
      await request(http()).delete(`/users/${other.id}/block`).expect(401);
      await request(http()).get(`/users/${other.id}/blocks`).expect(401);
    });

    it('the exemption is only from the guards: the target rules still apply (a restricted-pending TARGET is the plain 404)', async () => {
      const minor = await seedUser(app, { label: 'minor', minor: 'pending' });
      const pendingTarget = await seedUser(app, { label: 'target', minor: 'pending' });
      await block(minor, pendingTarget).expect(404);
      expect(await getTestPrismaClient().block.count()).toBe(0);
    });
  });

  // B-197: no new Notification rows between a blocked pair; existing ones hidden both ways.
  describe('notifications between a blocked pair (B-197)', () => {
    const listFor = async (u: U) => (await request(http()).get('/notifications').set(u.auth).expect(200)).body;
    const unreadFor = async (u: U) => (await request(http()).get('/notifications/unread-count').set(u.auth).expect(200)).body.unreadCount;

    it('existing follow rows are hidden from BOTH sides, leave the unread count, survive read-all untouched, and reappear after unblock', async () => {
      const a = await seedUser(app, { label: 'a' });
      const b = await seedUser(app, { label: 'b' });
      const c = await seedUser(app, { label: 'c' });
      // a follows b, b follows a, c follows a: a has two follow notifications, b has one.
      await request(http()).post(`/users/${b.id}/follow`).set(a.auth).expect(200);
      await request(http()).post(`/users/${a.id}/follow`).set(b.auth).expect(200);
      await request(http()).post(`/users/${a.id}/follow`).set(c.auth).expect(200);
      expect(await unreadFor(a)).toBe(2);
      expect(await unreadFor(b)).toBe(1);

      await block(a, b).expect(200);

      // a sees only c's follow; b sees nothing.
      const aList = await listFor(a);
      expect(aList.items).toHaveLength(1);
      expect(aList.items[0].data.actor.id).toBe(c.id);
      expect(aList.unreadCount).toBe(1);
      expect(await unreadFor(a)).toBe(1);
      expect((await listFor(b)).items).toHaveLength(0);
      expect(await unreadFor(b)).toBe(0);

      // read-all marks only the visible row; the hidden row stays unread in the database.
      const prisma = getTestPrismaClient();
      const hiddenRow = await prisma.notification.findFirstOrThrow({ where: { userId: a.id, type: 'follow', payloadRefId: b.id } });
      const readAll = await request(http()).patch('/notifications/read-all').set(a.auth).expect(200);
      expect(readAll.body.markedRead).toBe(1);
      expect((await prisma.notification.findUniqueOrThrow({ where: { id: hiddenRow.id } })).read).toBe(false);
      // and it cannot be marked read by id: it is the same 404 as a missing row
      await request(http()).patch(`/notifications/${hiddenRow.id}/read`).set(a.auth).expect(404);

      // hidden at read time, never deleted: unblock brings it back (still unread).
      expect(await prisma.notification.count({ where: { userId: a.id, type: 'follow', payloadRefId: b.id } })).toBe(1);
      await request(http()).delete(`/users/${b.id}/block`).set(a.auth).expect(200);
      const back = await listFor(a);
      expect(back.items.map((i: { data: { actor: { id: string } } }) => i.data.actor.id).sort()).toEqual([b.id, c.id].sort());
      expect(await unreadFor(a)).toBe(1);
    });

    it('a message notification for a thread with the blocked user is hidden, a thread with someone else is not', async () => {
      const a = await seedUser(app, { label: 'a' });
      const b = await seedUser(app, { label: 'b' });
      const c = await seedUser(app, { label: 'c' });
      const withB = (await request(http()).post('/conversations').set(b.auth).send({ recipientId: a.id }).expect(201)).body;
      const withC = (await request(http()).post('/conversations').set(c.auth).send({ recipientId: a.id }).expect(201)).body;
      await request(http()).post(`/conversations/${withB.id}/messages`).set(b.auth).send({ contentText: 'hi' }).expect(201);
      await request(http()).post(`/conversations/${withC.id}/messages`).set(c.auth).send({ contentText: 'hi' }).expect(201);
      expect(await unreadFor(a)).toBe(2);

      await block(a, b).expect(200);

      const list = await listFor(a);
      expect(list.items).toHaveLength(1);
      expect(list.items[0].data.conversationId).toBe(withC.id);
      expect(await unreadFor(a)).toBe(1);
      // the blocked sender's own inbox: nothing of theirs is hidden by this rule beyond the pair
      expect(await unreadFor(b)).toBe(0);
    });

    it('scheduling a fixture or logging a result between two blocked organisers still works but creates NO notification; an unblocked pair still does', async () => {
      const prisma = getTestPrismaClient();
      const a = await seedUser(app, { label: 'a' });
      const b = await seedUser(app, { label: 'b' });
      const c = await seedUser(app, { label: 'c' });
      const mk = (name: string, owner: U) =>
        prisma.grassrootsTeam.create({ data: { name, city: 'Lagos', leagueType: 'informal', createdById: owner.id } });
      const teamA = await mk('Alpha FC', a);
      const teamB = await mk('Beta FC', b);
      const teamC = await mk('Gamma FC', c);
      const when = new Date(Date.now() + 86_400_000).toISOString();

      await block(a, b).expect(200);

      // blocked pair: allowed (a Block does not stop Grassroots), but silent.
      const f1 = await request(http()).post('/fixtures').set(a.auth).send({ teamAId: teamA.id, teamBId: teamB.id, scheduledAt: when }).expect(201);
      expect(await prisma.notification.count({ where: { userId: b.id, type: 'fixture_scheduled' } })).toBe(0);
      await request(http()).post(`/fixtures/${f1.body.id}/result`).set(a.auth).send({ scoreA: 2, scoreB: 1 }).expect(200);
      expect(await prisma.notification.count({ where: { userId: b.id, type: 'result_logged' } })).toBe(0);

      // control: an unblocked pair still gets both.
      const f2 = await request(http()).post('/fixtures').set(a.auth).send({ teamAId: teamA.id, teamBId: teamC.id, scheduledAt: when }).expect(201);
      expect(await prisma.notification.count({ where: { userId: c.id, type: 'fixture_scheduled', payloadRefId: f2.body.id } })).toBe(1);
      await request(http()).post(`/fixtures/${f2.body.id}/result`).set(a.auth).send({ scoreA: 0, scoreB: 0 }).expect(200);
      expect(await prisma.notification.count({ where: { userId: c.id, type: 'result_logged', payloadRefId: f2.body.id } })).toBe(1);
    });

    it('a Block elsewhere in the system leaves an unrelated user\'s notifications and unread count unchanged', async () => {
      const a = await seedUser(app, { label: 'a' });
      const b = await seedUser(app, { label: 'b' });
      const x = await seedUser(app, { label: 'x' });
      const y = await seedUser(app, { label: 'y' });
      await request(http()).post(`/users/${a.id}/follow`).set(x.auth).expect(200);
      await block(b, y).expect(200);
      expect(await unreadFor(a)).toBe(1);
      expect((await listFor(a)).items).toHaveLength(1);
    });
  });

  describe('anonymization removes Block rows (both directions) and the new profile columns', () => {
    it('clears bio, preferred club, profile country and the avatar reference, and deletes every Block the user is part of', async () => {
      const prisma = getTestPrismaClient();
      const a = await seedUser(app, { label: 'a', bio: 'Hello', preferredClub: 'Ikoyi', profileCountry: 'NG' });
      const b = await seedUser(app, { label: 'b' });
      const c = await seedUser(app, { label: 'c' });
      await prisma.user.update({
        where: { id: a.id },
        data: {
          avatarUrl: 'https://x/a.jpg', avatarKey: 'avatars/a/a.jpg', avatarStatus: 'approved',
          coverUrl: 'https://x/c.jpg', coverKey: 'covers/a/c.jpg', coverStatus: 'pending',
        },
      });
      await block(a, b).expect(200);
      await block(c, a).expect(200);
      await block(b, c).expect(200);

      await app.get(AccountDeletionSweepService).anonymizeUser(a.id, false);

      const row = await prisma.user.findUniqueOrThrow({ where: { id: a.id } });
      expect(row).toMatchObject({ bio: null, preferredClub: null, profileCountry: null, avatarUrl: null, avatarKey: null, avatarStatus: null, coverUrl: null, coverKey: null, coverStatus: null, accountStatus: 'deleted' });
      const left = await prisma.block.findMany();
      expect(left).toHaveLength(1);
      expect(left[0]).toMatchObject({ blockerId: b.id, blockedId: c.id });
    });
  });

  describe('profile content (B-038, B-081): bio, preferred club, the OPTIONAL profile country', () => {
    it('PATCH writes them, GET /users/:id returns them, null clears them', async () => {
      const u = await seedUser(app, { label: 'u' });
      const patched = await request(http())
        .patch(`/users/${u.id}`)
        .set(u.auth)
        .send({ bio: '  Left back from Lagos  ', preferredClub: 'Ikoyi Rovers', profileCountry: 'ng' })
        .expect(200);
      expect(patched.body).toMatchObject({ bio: 'Left back from Lagos', preferredClub: 'Ikoyi Rovers', profileCountry: 'NG', avatar: null });
      const got = await request(http()).get(`/users/${u.id}`).set(u.auth).expect(200);
      expect(got.body).toMatchObject({ bio: 'Left back from Lagos', preferredClub: 'Ikoyi Rovers', profileCountry: 'NG' });

      const cleared = await request(http()).patch(`/users/${u.id}`).set(u.auth).send({ bio: null, preferredClub: '', profileCountry: null }).expect(200);
      expect(cleared.body).toMatchObject({ bio: null, preferredClub: null, profileCountry: null });
    });

    it('validation: country must be a real ISO code (400), bio over 160 / club over 80 are 400, nothing is stored', async () => {
      const u = await seedUser(app, { label: 'u' });
      for (const body of [{ profileCountry: 'ZZ' }, { profileCountry: 'XX' }, { profileCountry: 'NGA' }, { bio: 'x'.repeat(161) }, { preferredClub: 'x'.repeat(81) }]) {
        await request(http()).patch(`/users/${u.id}`).set(u.auth).send(body).expect(400);
      }
      const row = await getTestPrismaClient().user.findUniqueOrThrow({ where: { id: u.id } });
      expect(row).toMatchObject({ bio: null, preferredClub: null, profileCountry: null });
    });

    it('the DB CHECK constraints refuse malformed values from any other writer', async () => {
      const u = await seedUser(app, { label: 'u' });
      const prisma = getTestPrismaClient();
      await expect(prisma.user.update({ where: { id: u.id }, data: { profileCountry: 'ng' } })).rejects.toThrow();
      await expect(prisma.user.update({ where: { id: u.id }, data: { bio: 'x'.repeat(161) } })).rejects.toThrow();
      await expect(prisma.user.update({ where: { id: u.id }, data: { avatarUrl: 'https://x/a.jpg' } })).rejects.toThrow(); // avatar columns move together
      await expect(prisma.user.update({ where: { id: u.id }, data: { avatarUrl: 'u', avatarKey: 'k', avatarStatus: 'live' } })).rejects.toThrow();
      await expect(prisma.user.update({ where: { id: u.id }, data: { coverUrl: 'https://x/c.jpg' } })).rejects.toThrow(); // cover columns move together
      await expect(prisma.user.update({ where: { id: u.id }, data: { coverUrl: 'u', coverKey: 'k', coverStatus: 'live' } })).rejects.toThrow();
    });

    it('sensitive-content screen: a flagged bio or preferred club is a coded 422 "please rephrase", nothing saved, text never echoed', async () => {
      const u = await seedUser(app, { label: 'u', bio: 'original' });
      const res = await request(http()).patch(`/users/${u.id}`).set(u.auth).send({ displayName: 'New Name', bio: 'I have cancer' }).expect(422);
      expect(res.body.code).toBe('sensitive_content_rephrase_required');
      expect(res.body.flaggedFields.map((f: { field: string }) => f.field)).toEqual(['bio']);
      expect(JSON.stringify(res.body)).not.toContain('cancer');
      const row = await getTestPrismaClient().user.findUniqueOrThrow({ where: { id: u.id } });
      expect(row.bio).toBe('original');
      expect(row.displayName).not.toBe('New Name');
      await request(http()).patch(`/users/${u.id}`).set(u.auth).send({ preferredClub: 'Gay Pride FC' }).expect(422);
      expect(await getTestPrismaClient().report.count()).toBe(0); // no moderation report, no override
    });

    it('PATCH can never write the safeguarding country or the avatar columns (400, forbidNonWhitelisted)', async () => {
      const u = await seedUser(app, { label: 'u', declaredCountry: 'US' });
      for (const body of [{ declaredCountry: 'GB' }, { derivedCountry: 'GB' }, { avatarUrl: 'x' }, { avatarStatus: 'approved' }, { coverUrl: 'x' }, { coverStatus: 'approved' }]) {
        await request(http()).patch(`/users/${u.id}`).set(u.auth).send(body).expect(400);
      }
      expect((await getTestPrismaClient().user.findUniqueOrThrow({ where: { id: u.id } })).declaredCountry).toBe('US');
    });
  });

  describe('the other-user public profile (B-082 backend leg)', () => {
    it('shows bio and the profile country, never the preferred club, real name or safeguarding country', async () => {
      const viewer = await seedUser(app, { label: 'viewer' });
      const t = await seedUser(app, { label: 'target', bio: 'Winger', preferredClub: 'Secret FC', profileCountry: 'GB', declaredCountry: 'US' });
      const res = await request(http()).get(`/users/${t.id}/public-profile`).set(viewer.auth).expect(200);
      expect(res.body).toMatchObject({ id: t.id, publicName: t.username, bio: 'Winger', country: 'GB', avatarUrl: null, isFollowing: false, viewerHasBlocked: false });
      const text = JSON.stringify(res.body);
      for (const leaked of ['Secret FC', 'Real Name', 'US', 'declaredCountry', 'derivedCountry', 'preferredClub']) {
        // 'US' alone may legitimately appear inside other words; check the quoted code
        expect(text).not.toContain(leaked === 'US' ? '"US"' : leaked);
      }
    });

    it("a minor's country is visible only if the minor entered it: the declared country is never a fallback", async () => {
      const viewer = await seedUser(app, { label: 'viewer' });
      const silent = await seedUser(app, { label: 'silent', minor: 'confirmed', declaredCountry: 'US' });
      const shared = await seedUser(app, { label: 'shared', minor: 'confirmed', declaredCountry: 'US', profileCountry: 'NG' });
      expect((await request(http()).get(`/users/${silent.id}/public-profile`).set(viewer.auth).expect(200)).body.country).toBeNull();
      expect((await request(http()).get(`/users/${shared.id}/public-profile`).set(viewer.auth).expect(200)).body.country).toBe('NG');
    });

    it('a restricted-pending minor is the plain 404; isFollowing reflects the viewer', async () => {
      const viewer = await seedUser(app, { label: 'viewer' });
      const pending = await seedUser(app, { label: 'pending', minor: 'pending' });
      await request(http()).get(`/users/${pending.id}/public-profile`).set(viewer.auth).expect(404);
      const t = await seedUser(app, { label: 'target' });
      await request(http()).post(`/users/${t.id}/follow`).set(viewer.auth).expect(200);
      expect((await request(http()).get(`/users/${t.id}/public-profile`).set(viewer.auth).expect(200)).body.isFollowing).toBe(true);
    });
  });

  describe('cover photo upload without an object store (B-196)', () => {
    it('answers 503 EXACTLY as the admin upload and the avatar do, and writes nothing', async () => {
      const u = await seedUser(app, { label: 'u' });
      const admin = await getTestPrismaClient().adminUser.create({
        data: { email: `e2e-w6-admin-${rand()}@example.com`, passwordHash: 'unused', fullName: 'W6 editor', role: 'editor' },
      });
      const adminToken = (await app.get(AdminTokenService).issueTokenPair(admin.id, admin.role)).accessToken.token;

      const cover = await request(http()).post(`/users/${u.id}/cover`).set(u.auth).attach('file', JPEG, { filename: 'c.jpg', contentType: 'image/jpeg' });
      const avatar = await request(http()).post(`/users/${u.id}/avatar`).set(u.auth).attach('file', JPEG, { filename: 'a.jpg', contentType: 'image/jpeg' });
      const adminRes = await request(http()).post('/admin/media/upload').set(bearer(adminToken)).attach('file', JPEG, { filename: 'a.jpg', contentType: 'image/jpeg' });

      expect(adminRes.status).toBe(503);
      expect(cover.status).toBe(503);
      expect(cover.body).toEqual(adminRes.body);
      expect(cover.body).toEqual(avatar.body);
      const row = await getTestPrismaClient().user.findUniqueOrThrow({ where: { id: u.id } });
      expect(row).toMatchObject({ coverUrl: null, coverKey: null, coverStatus: null });
    });
  });

  describe('avatar upload without an object store (B-035)', () => {
    it('answers 503 EXACTLY as POST /admin/media/upload does, and writes nothing', async () => {
      const u = await seedUser(app, { label: 'u' });
      const admin = await getTestPrismaClient().adminUser.create({
        data: { email: `e2e-w5-admin-${rand()}@example.com`, passwordHash: 'unused', fullName: 'W5 editor', role: 'editor' },
      });
      const adminToken = (await app.get(AdminTokenService).issueTokenPair(admin.id, admin.role)).accessToken.token;

      const user = await request(http()).post(`/users/${u.id}/avatar`).set(u.auth).attach('file', JPEG, { filename: 'a.jpg', contentType: 'image/jpeg' });
      const adminRes = await request(http()).post('/admin/media/upload').set(bearer(adminToken)).attach('file', JPEG, { filename: 'a.jpg', contentType: 'image/jpeg' });

      expect(adminRes.status).toBe(503);
      expect(user.status).toBe(503);
      expect(user.body).toEqual(adminRes.body);
      const row = await getTestPrismaClient().user.findUniqueOrThrow({ where: { id: u.id } });
      expect(row).toMatchObject({ avatarUrl: null, avatarKey: null, avatarStatus: null });
    });
  });
});

// ---------------------------------------------------------------------------
describe('Avatar lifecycle e2e (fake object store)', () => {
  let app: INestApplication;
  const http = () => app.getHttpServer();
  const store = new Map<string, Buffer>();
  const fake = {
    upload: jest.fn(async (buffer: Buffer, key: string) => {
      store.set(key, buffer);
      return `https://cdn.test/${key}`;
    }),
    delete: jest.fn(async (key: string) => {
      store.delete(key);
    }),
    failNext: false,
  };

  beforeAll(async () => {
    app = await bootApp((b) => b.overrideProvider(StorageService).useValue(fake));
  });
  beforeEach(async () => {
    await resetDatabase();
    store.clear();
    jest.clearAllMocks();
  });
  afterAll(async () => {
    await app.close();
    await disconnectTestPrismaClient();
  });

  const upload = (u: U, buf: Buffer, type: string) =>
    request(http()).post(`/users/${u.id}/avatar`).set(u.auth).attach('file', buf, { filename: 'p', contentType: type });

  it('a new upload is PENDING: the owner sees it, no other user ever does, and only an approved avatar is served', async () => {
    const owner = await seedUser(app, { label: 'owner' });
    const viewer = await seedUser(app, { label: 'viewer' });
    const res = await upload(owner, JPEG, 'image/jpeg').expect(201);
    expect(res.body.avatar.status).toBe('pending');
    expect(res.body.avatar.url).toMatch(new RegExp(`^https://cdn.test/avatars/${owner.id}/[0-9a-f-]{36}\\.jpg$`));
    expect(store.size).toBe(1);

    const mine = await request(http()).get(`/users/${owner.id}`).set(owner.auth).expect(200);
    expect(mine.body.avatar).toEqual(res.body.avatar);
    expect(JSON.stringify(mine.body)).not.toContain('"avatarKey"');
    expect((await request(http()).get(`/users/${owner.id}/public-profile`).set(viewer.auth).expect(200)).body.avatarUrl).toBeNull();

    // The status flip belongs to the (unbuilt) image check, B-036; simulate it directly.
    await getTestPrismaClient().user.update({ where: { id: owner.id }, data: { avatarStatus: 'approved' } });
    expect((await request(http()).get(`/users/${owner.id}/public-profile`).set(viewer.auth).expect(200)).body.avatarUrl).toBe(res.body.avatar.url);
    await getTestPrismaClient().user.update({ where: { id: owner.id }, data: { avatarStatus: 'rejected' } });
    expect((await request(http()).get(`/users/${owner.id}/public-profile`).set(viewer.auth).expect(200)).body.avatarUrl).toBeNull();
  });

  it('replacing removes the previous object and re-enters review (pending again)', async () => {
    const owner = await seedUser(app, { label: 'owner' });
    const first = await upload(owner, JPEG, 'image/jpeg').expect(201);
    await getTestPrismaClient().user.update({ where: { id: owner.id }, data: { avatarStatus: 'approved' } });
    const second = await upload(owner, JPEG, 'image/jpeg').expect(201);
    expect(second.body.avatar.url).not.toBe(first.body.avatar.url);
    expect(store.size).toBe(1);
    expect((await getTestPrismaClient().user.findUniqueOrThrow({ where: { id: owner.id } })).avatarStatus).toBe('pending');
  });

  it('refuses a wrong type, a mislabelled file, an empty body and an oversize file; nothing reaches storage', async () => {
    const owner = await seedUser(app, { label: 'owner' });
    await upload(owner, Buffer.from('GIF89a......'), 'image/gif').expect(400);
    await upload(owner, Buffer.from('<html></html>'), 'image/png').expect(400);
    await request(http()).post(`/users/${owner.id}/avatar`).set(owner.auth).expect(400);
    await upload(owner, Buffer.alloc(5 * 1024 * 1024 + 1024), 'image/jpeg').expect(413);
    expect(fake.upload).not.toHaveBeenCalled();
  });

  it("only your own avatar: another user's id is 403; a restricted-pending minor and a missing token are refused", async () => {
    const owner = await seedUser(app, { label: 'owner' });
    const other = await seedUser(app, { label: 'other' });
    const minor = await seedUser(app, { label: 'minor', minor: 'pending' });
    await request(http()).post(`/users/${other.id}/avatar`).set(owner.auth).attach('file', JPEG, { filename: 'p', contentType: 'image/jpeg' }).expect(403);
    const m = await upload(minor, JPEG, 'image/jpeg').expect(403);
    expect(m.body.code).toBe('guardian_consent_pending');
    await request(http()).post(`/users/${owner.id}/avatar`).attach('file', JPEG, { filename: 'p', contentType: 'image/jpeg' }).expect(401);
    expect(fake.upload).not.toHaveBeenCalled();
  });

  it('is allowed BEFORE the username exists (the avatar is chosen at Create Profile)', async () => {
    const fresh = await seedUser(app, { label: 'fresh', username: null });
    await upload(fresh, JPEG, 'image/jpeg').expect(201);
  });

  it('DELETE clears the reference and the object; a second DELETE is a 200 no-op', async () => {
    const owner = await seedUser(app, { label: 'owner' });
    await upload(owner, JPEG, 'image/jpeg').expect(201);
    await request(http()).delete(`/users/${owner.id}/avatar`).set(owner.auth).expect(200);
    expect(store.size).toBe(0);
    expect(await getTestPrismaClient().user.findUniqueOrThrow({ where: { id: owner.id } })).toMatchObject({ avatarUrl: null, avatarKey: null, avatarStatus: null });
    await request(http()).delete(`/users/${owner.id}/avatar`).set(owner.auth).expect(200);
  });

  it('a storage outage is a 503 and leaves the previous avatar untouched', async () => {
    const owner = await seedUser(app, { label: 'owner' });
    const first = await upload(owner, JPEG, 'image/jpeg').expect(201);
    fake.upload.mockRejectedValueOnce(new ServiceUnavailableException('down'));
    await upload(owner, JPEG, 'image/jpeg').expect(503);
    const row = await getTestPrismaClient().user.findUniqueOrThrow({ where: { id: owner.id } });
    expect(row.avatarUrl).toBe(first.body.avatar.url);
  });
});

// ---------------------------------------------------------------------------
describe('Cover photo lifecycle e2e (fake object store, B-196)', () => {
  let app: INestApplication;
  const http = () => app.getHttpServer();
  const store = new Map<string, Buffer>();
  const fake = {
    upload: jest.fn(async (buffer: Buffer, key: string) => {
      store.set(key, buffer);
      return `https://cdn.test/${key}`;
    }),
    delete: jest.fn(async (key: string) => {
      store.delete(key);
    }),
  };

  beforeAll(async () => {
    app = await bootApp((b) => b.overrideProvider(StorageService).useValue(fake));
  });
  beforeEach(async () => {
    await resetDatabase();
    store.clear();
    jest.clearAllMocks();
  });
  afterAll(async () => {
    await app.close();
    await disconnectTestPrismaClient();
  });

  const upload = (u: U, buf: Buffer, type: string) =>
    request(http()).post(`/users/${u.id}/cover`).set(u.auth).attach('file', buf, { filename: 'p', contentType: type });

  it('a new upload is PENDING: the owner sees it, no other user does, and only an approved cover is served', async () => {
    const owner = await seedUser(app, { label: 'owner' });
    const viewer = await seedUser(app, { label: 'viewer' });
    const res = await upload(owner, JPEG, 'image/jpeg').expect(201);
    expect(res.body.cover.status).toBe('pending');
    expect(res.body.cover.url).toMatch(new RegExp(`^https://cdn.test/covers/${owner.id}/[0-9a-f-]{36}\\.jpg$`));
    expect(store.size).toBe(1);

    const mine = await request(http()).get(`/users/${owner.id}`).set(owner.auth).expect(200);
    expect(mine.body.cover).toEqual(res.body.cover);
    expect(mine.body.avatar).toBeNull(); // the two pictures are independent
    expect(JSON.stringify(mine.body)).not.toContain('"coverKey"');
    expect((await request(http()).get(`/users/${owner.id}/public-profile`).set(viewer.auth).expect(200)).body.coverUrl).toBeNull();

    // The status flip belongs to the (unbuilt) image check, B-036; simulate it directly.
    await getTestPrismaClient().user.update({ where: { id: owner.id }, data: { coverStatus: 'approved' } });
    expect((await request(http()).get(`/users/${owner.id}/public-profile`).set(viewer.auth).expect(200)).body.coverUrl).toBe(res.body.cover.url);
    await getTestPrismaClient().user.update({ where: { id: owner.id }, data: { coverStatus: 'rejected' } });
    expect((await request(http()).get(`/users/${owner.id}/public-profile`).set(viewer.auth).expect(200)).body.coverUrl).toBeNull();
  });

  it('the cover and the avatar are independent: uploading one never touches the other', async () => {
    const owner = await seedUser(app, { label: 'owner' });
    await request(http()).post(`/users/${owner.id}/avatar`).set(owner.auth).attach('file', JPEG, { filename: 'p', contentType: 'image/jpeg' }).expect(201);
    await upload(owner, JPEG, 'image/jpeg').expect(201);
    expect(store.size).toBe(2);
    await request(http()).delete(`/users/${owner.id}/cover`).set(owner.auth).expect(200);
    const row = await getTestPrismaClient().user.findUniqueOrThrow({ where: { id: owner.id } });
    expect(row.avatarUrl).not.toBeNull();
    expect(row).toMatchObject({ coverUrl: null, coverKey: null, coverStatus: null });
    expect(store.size).toBe(1);
  });

  it('replacing removes the previous object and re-enters review (pending again)', async () => {
    const owner = await seedUser(app, { label: 'owner' });
    const first = await upload(owner, JPEG, 'image/jpeg').expect(201);
    await getTestPrismaClient().user.update({ where: { id: owner.id }, data: { coverStatus: 'approved' } });
    const second = await upload(owner, JPEG, 'image/jpeg').expect(201);
    expect(second.body.cover.url).not.toBe(first.body.cover.url);
    expect(store.size).toBe(1);
    expect((await getTestPrismaClient().user.findUniqueOrThrow({ where: { id: owner.id } })).coverStatus).toBe('pending');
  });

  it('refuses a wrong type, a mislabelled file, an empty body and an oversize file; nothing reaches storage', async () => {
    const owner = await seedUser(app, { label: 'owner' });
    await upload(owner, Buffer.from('GIF89a......'), 'image/gif').expect(400);
    await upload(owner, Buffer.from('<html></html>'), 'image/png').expect(400);
    await request(http()).post(`/users/${owner.id}/cover`).set(owner.auth).expect(400);
    await upload(owner, Buffer.alloc(5 * 1024 * 1024 + 1024), 'image/jpeg').expect(413);
    expect(fake.upload).not.toHaveBeenCalled();
  });

  it("only your own cover: another user's id is 403; a restricted-pending minor, an unverified account and a missing token are refused", async () => {
    const owner = await seedUser(app, { label: 'owner' });
    const other = await seedUser(app, { label: 'other' });
    const minor = await seedUser(app, { label: 'minor', minor: 'pending' });
    const unverified = await seedUser(app, { label: 'unv', unverified: true });
    await request(http()).post(`/users/${other.id}/cover`).set(owner.auth).attach('file', JPEG, { filename: 'p', contentType: 'image/jpeg' }).expect(403);
    const m = await upload(minor, JPEG, 'image/jpeg').expect(403);
    expect(m.body.code).toBe('guardian_consent_pending');
    const e = await upload(unverified, JPEG, 'image/jpeg').expect(403);
    expect(e.body.code).toBe('email_verification_required');
    await request(http()).post(`/users/${owner.id}/cover`).attach('file', JPEG, { filename: 'p', contentType: 'image/jpeg' }).expect(401);
    expect(fake.upload).not.toHaveBeenCalled();
  });

  it('is allowed BEFORE the username exists (optional at Create Profile)', async () => {
    const fresh = await seedUser(app, { label: 'fresh', username: null });
    await upload(fresh, JPEG, 'image/jpeg').expect(201);
  });

  it('DELETE clears the reference and the object; a second DELETE is a 200 no-op', async () => {
    const owner = await seedUser(app, { label: 'owner' });
    await upload(owner, JPEG, 'image/jpeg').expect(201);
    await request(http()).delete(`/users/${owner.id}/cover`).set(owner.auth).expect(200);
    expect(store.size).toBe(0);
    expect(await getTestPrismaClient().user.findUniqueOrThrow({ where: { id: owner.id } })).toMatchObject({ coverUrl: null, coverKey: null, coverStatus: null });
    await request(http()).delete(`/users/${owner.id}/cover`).set(owner.auth).expect(200);
  });

  it('a storage outage is a 503 and leaves the previous cover untouched', async () => {
    const owner = await seedUser(app, { label: 'owner' });
    const first = await upload(owner, JPEG, 'image/jpeg').expect(201);
    fake.upload.mockRejectedValueOnce(new ServiceUnavailableException('down'));
    await upload(owner, JPEG, 'image/jpeg').expect(503);
    const row = await getTestPrismaClient().user.findUniqueOrThrow({ where: { id: owner.id } });
    expect(row.coverUrl).toBe(first.body.cover.url);
  });

  it('anonymization clears the cover reference AND removes the cover object from the store', async () => {
    const owner = await seedUser(app, { label: 'owner' });
    await request(http()).post(`/users/${owner.id}/avatar`).set(owner.auth).attach('file', JPEG, { filename: 'p', contentType: 'image/jpeg' }).expect(201);
    await upload(owner, JPEG, 'image/jpeg').expect(201);
    expect(store.size).toBe(2);

    await app.get(AccountDeletionSweepService).anonymizeUser(owner.id, false);

    expect(store.size).toBe(0);
    expect(await getTestPrismaClient().user.findUniqueOrThrow({ where: { id: owner.id } })).toMatchObject({
      avatarUrl: null, coverUrl: null, coverKey: null, coverStatus: null, accountStatus: 'deleted',
    });
  });
});
