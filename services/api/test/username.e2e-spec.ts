import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AccountDeletionSweepService } from '../src/modules/account-deletion/account-deletion-sweep.service';
import { TokenService } from '../src/modules/auth/token/token.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { seedDob } from './dob-seed';

// Real-Postgres coverage for profile/username-column-and-display-convention
// (Decision Log #364; legal-copy Part C row 33): the nullable-unique
// User.username column, the "username first, displayName fallback" public
// name on other-facing payloads, and the rule that the real displayName is
// never sent to other users once a username exists. The unique-where-set
// behaviour (many NULLs allowed, one holder per name, case-insensitive via
// lowercase storage) is a Postgres property, so a mock could not prove it.
describe('Username e2e: unique-where-set column + public name convention against real Postgres', () => {
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

  // Seeds directly via Prisma and mints a real token (same
  // AuthThrottlerGuard-avoidance workaround the other e2e specs document).
  async function createUser(displayName: string, username?: string): Promise<{ userId: string; accessToken: string }> {
    const prisma = getTestPrismaClient();
    const user = await prisma.user.create({
      data: {
        email: `e2e-username-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
        passwordHash: 'unused-in-this-e2e-spec-file',
        displayName,
        username,
        dateOfBirth: seedDob('1998-07-04'),
        isMinor: false,
      },
    });
    const { accessToken } = await app.get(TokenService).issueTokenPair(user.id, user.role);
    return { userId: user.id, accessToken: accessToken.token };
  }

  const auth = (u: { accessToken: string }) => ({ Authorization: `Bearer ${u.accessToken}` });

  describe('the column', () => {
    it('allows any number of users with no username (unique only where set)', async () => {
      await createUser('No Handle One');
      await createUser('No Handle Two');
      await createUser('No Handle Three');
      const prisma = getTestPrismaClient();
      expect(await prisma.user.count({ where: { username: null } })).toBe(3);
    });

    it('rejects a duplicate username at the database level', async () => {
      await createUser('Ada', 'goalie_9');
      await expect(createUser('Ben', 'goalie_9')).rejects.toMatchObject({ code: 'P2002' });
    });
  });

  describe('PATCH /users/:id with username', () => {
    it('sets the username (stored lowercase) and GET /users/:id reports it plus the resolved publicName', async () => {
      const ada = await createUser('Ada Obi');

      const patch = await request(app.getHttpServer())
        .patch(`/users/${ada.userId}`)
        .set(auth(ada))
        .send({ username: 'Goalie_9' })
        .expect(200);
      expect(patch.body.username).toBe('goalie_9');
      expect(patch.body.publicName).toBe('goalie_9');
      expect(patch.body.displayName).toBe('Ada Obi');

      const row = await getTestPrismaClient().user.findUnique({ where: { id: ada.userId } });
      expect(row!.username).toBe('goalie_9');

      const get = await request(app.getHttpServer()).get(`/users/${ada.userId}`).set(auth(ada)).expect(200);
      expect(get.body.username).toBe('goalie_9');
      expect(get.body.publicName).toBe('goalie_9');
    });

    it('a user with no username has publicName equal to their displayName (fallback path)', async () => {
      const ben = await createUser('Ben Cole');
      const get = await request(app.getHttpServer()).get(`/users/${ben.userId}`).set(auth(ben)).expect(200);
      expect(get.body.username).toBeNull();
      expect(get.body.publicName).toBe('Ben Cole');
    });

    it('a second user claiming the same name in a different case gets 409, and the first holder is unaffected', async () => {
      const ada = await createUser('Ada Obi');
      const ben = await createUser('Ben Cole');
      await request(app.getHttpServer()).patch(`/users/${ada.userId}`).set(auth(ada)).send({ username: 'goalie_9' }).expect(200);

      await request(app.getHttpServer()).patch(`/users/${ben.userId}`).set(auth(ben)).send({ username: 'GOALIE_9' }).expect(409);

      const prisma = getTestPrismaClient();
      expect((await prisma.user.findUnique({ where: { id: ada.userId } }))!.username).toBe('goalie_9');
      expect((await prisma.user.findUnique({ where: { id: ben.userId } }))!.username).toBeNull();
    });

    it('re-saving your own current username is not a conflict', async () => {
      const ada = await createUser('Ada Obi');
      await request(app.getHttpServer()).patch(`/users/${ada.userId}`).set(auth(ada)).send({ username: 'goalie_9' }).expect(200);
      await request(app.getHttpServer()).patch(`/users/${ada.userId}`).set(auth(ada)).send({ username: 'Goalie_9' }).expect(200);
    });

    it('rejects an invalid username with 400 and stores nothing', async () => {
      const ada = await createUser('Ada Obi');
      for (const bad of ['ab', 'has space', 'a'.repeat(31), '@goalie']) {
        await request(app.getHttpServer()).patch(`/users/${ada.userId}`).set(auth(ada)).send({ username: bad }).expect(400);
      }
      expect((await getTestPrismaClient().user.findUnique({ where: { id: ada.userId } }))!.username).toBeNull();
    });

    it('null clears the username, restoring the displayName and freeing the name for someone else', async () => {
      const ada = await createUser('Ada Obi', 'goalie_9');
      const ben = await createUser('Ben Cole');

      const cleared = await request(app.getHttpServer()).patch(`/users/${ada.userId}`).set(auth(ada)).send({ username: null }).expect(200);
      expect(cleared.body.username).toBeNull();
      expect(cleared.body.publicName).toBe('Ada Obi');

      await request(app.getHttpServer()).patch(`/users/${ben.userId}`).set(auth(ben)).send({ username: 'goalie_9' }).expect(200);
    });
  });

  describe('what OTHER users see', () => {
    it('a post by a username-holder shows the username as author.publicName and never the real displayName', async () => {
      const ada = await createUser('Ada Obi', 'goalie_9');
      const viewer = await createUser('Viewer Vee');
      const created = await request(app.getHttpServer()).post('/posts').set(auth(ada)).send({ contentText: 'Great match' }).expect(201);
      expect(created.body.author).toEqual({ id: ada.userId, publicName: 'goalie_9' });

      const seen = await request(app.getHttpServer()).get(`/posts/${created.body.id}`).set(auth(viewer)).expect(200);
      expect(seen.body.author.publicName).toBe('goalie_9');
      expect(JSON.stringify(seen.body)).not.toContain('Ada Obi');
    });

    it('a post by a user with no username shows the displayName (fallback path)', async () => {
      const ben = await createUser('Ben Cole');
      const viewer = await createUser('Viewer Vee');
      const created = await request(app.getHttpServer()).post('/posts').set(auth(ben)).send({ contentText: 'Hello' }).expect(201);
      const seen = await request(app.getHttpServer()).get(`/posts/${created.body.id}`).set(auth(viewer)).expect(200);
      expect(seen.body.author).toMatchObject({ id: ben.userId, publicName: 'Ben Cole' });
    });

    it('comments show the commenter public name', async () => {
      const ada = await createUser('Ada Obi', 'goalie_9');
      const ben = await createUser('Ben Cole');
      const post = await request(app.getHttpServer()).post('/posts').set(auth(ben)).send({ contentText: 'Hello' }).expect(201);
      await request(app.getHttpServer()).post(`/posts/${post.body.id}/comments`).set(auth(ada)).send({ contentText: 'Nice' }).expect(201);
      const comments = await request(app.getHttpServer()).get(`/posts/${post.body.id}/comments`).set(auth(ben)).expect(200);
      expect(comments.body.items[0].author).toEqual({ id: ada.userId, publicName: 'goalie_9' });
    });

    it('follower lists and the public profile use the public name', async () => {
      const ada = await createUser('Ada Obi', 'goalie_9');
      const ben = await createUser('Ben Cole');
      await request(app.getHttpServer()).post(`/users/${ben.userId}/follow`).set(auth(ada)).expect(200);

      const followers = await request(app.getHttpServer()).get(`/users/${ben.userId}/followers`).set(auth(ben)).expect(200);
      expect(followers.body.items).toEqual([{ id: ada.userId, publicName: 'goalie_9' }]);

      const profile = await request(app.getHttpServer()).get(`/users/${ada.userId}/public-profile`).set(auth(ben)).expect(200);
      expect(profile.body.publicName).toBe('goalie_9');
      expect(JSON.stringify(profile.body)).not.toContain('Ada Obi');
    });

    it('leaderboard rows use the public name', async () => {
      const ada = await createUser('Ada Obi', 'goalie_9');
      await request(app.getHttpServer()).post('/posts').set(auth(ada)).send({ contentText: 'Points please' }).expect(201);
      const { LeaderboardRollupService } = await import('../src/modules/leaderboard/leaderboard-rollup.service');
      const { getIsoWeekPeriod } = await import('../src/modules/leaderboard/iso-week.util');
      const period = getIsoWeekPeriod(new Date());
      await app.get(LeaderboardRollupService).rollupPeriod(period);

      const board = await request(app.getHttpServer()).get(`/leaderboard?period=${period}`).set(auth(ada)).expect(200);
      expect(board.body.items[0].publicName).toBe('goalie_9');
      expect(JSON.stringify(board.body)).not.toContain('Ada Obi');
    });
  });

  describe('GET /search (people)', () => {
    it('finds a username-holder by username, and NOT by their real displayName (no de-anonymising search)', async () => {
      await createUser('Ada Obi', 'goalie_9');

      const byHandle = await request(app.getHttpServer()).get('/search').query({ q: 'goalie', scope: 'users' }).expect(200);
      expect(byHandle.body.items.map((i: { publicName: string }) => i.publicName)).toEqual(['goalie_9']);

      const byRealName = await request(app.getHttpServer()).get('/search').query({ q: 'Ada Obi', scope: 'users' }).expect(200);
      expect(byRealName.body.items).toEqual([]);
    });

    it('finds a user with no username by displayName (fallback path)', async () => {
      await createUser('Ben Cole');
      const found = await request(app.getHttpServer()).get('/search').query({ q: 'ben', scope: 'users' }).expect(200);
      expect(found.body.items.map((i: { publicName: string }) => i.publicName)).toEqual(['Ben Cole']);
    });
  });

  describe('account anonymization', () => {
    it('releases the username when a pending_deletion account is anonymized, so the name can be re-claimed', async () => {
      const ada = await createUser('Ada Obi', 'goalie_9');
      const prisma = getTestPrismaClient();
      await prisma.user.update({
        where: { id: ada.userId },
        data: { accountStatus: 'pending_deletion', pendingDeletionAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) },
      });

      await app.get(AccountDeletionSweepService).sweepPendingDeletions();

      const row = await prisma.user.findUnique({ where: { id: ada.userId } });
      expect(row!.accountStatus).toBe('deleted');
      expect(row!.username).toBeNull();

      const ben = await createUser('Ben Cole');
      await request(app.getHttpServer()).patch(`/users/${ben.userId}`).set(auth(ben)).send({ username: 'goalie_9' }).expect(200);
    });
  });
});
