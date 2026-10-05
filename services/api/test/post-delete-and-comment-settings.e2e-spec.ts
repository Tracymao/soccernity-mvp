import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { TokenService } from '../src/modules/auth/token/token.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { seedDob } from './dob-seed';

// Real-Postgres coverage for DELETE /posts/:id (hard-delete cascade, Decision
// Log #361) and the post author's comment controls (commentPermission, hide).
// The cascade is the whole point of the first half and can only be proven
// against real FK behaviour: a mock reports success by construction.
describe('Post deletion + comment settings e2e (real Postgres)', () => {
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

  // Same seed-via-Prisma + real TokenService pattern as feed-reactions.e2e-spec.ts
  // (sidesteps the 5/60s register rate limit; every request still goes through
  // the real JwtAuthGuard).
  async function createUser(label: string): Promise<{ userId: string; accessToken: string }> {
    const prisma = getTestPrismaClient();
    const user = await prisma.user.create({
      data: {
        email: `e2e-pd-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
        passwordHash: 'unused-in-this-e2e-spec-file',
        displayName: `E2E PD ${label}`,
        dateOfBirth: seedDob('1998-07-04'),
        isMinor: false,
      },
    });
    const { accessToken } = await app.get(TokenService).issueTokenPair(user.id, user.role);
    return { userId: user.id, accessToken: accessToken.token };
  }

  const auth = (u: { accessToken: string }) => ({ Authorization: `Bearer ${u.accessToken}` });

  async function createPostViaApi(author: { accessToken: string }, contentText = 'Matchday #cascadetest') {
    const res = await request(app.getHttpServer())
      .post('/posts')
      .set(auth(author))
      .send({ contentText })
      .expect(201);
    return res.body.id as string;
  }

  describe('DELETE /posts/:id', () => {
    it('removes the post and EVERY row hanging off it, including other users\' engagement', async () => {
      const prisma = getTestPrismaClient();
      const a = await createUser('a');
      const b = await createUser('b');
      const postId = await createPostViaApi(a);

      // User B's engagement + a view + a contest entry
      await request(app.getHttpServer()).post(`/posts/${postId}/comments`).set(auth(b)).send({ contentText: 'b says hi' }).expect(201);
      await request(app.getHttpServer()).post(`/posts/${postId}/like`).set(auth(b)).expect(200);
      await request(app.getHttpServer()).post(`/posts/${postId}/save`).set(auth(b)).expect(200);
      await request(app.getHttpServer()).post(`/posts/${postId}/view`).set(auth(b)).expect(200);
      const cycle = await prisma.contestCycle.create({
        data: { title: 'c', startsAt: new Date(), endsAt: new Date(Date.now() + 1e9) },
      });
      const round = await prisma.contestRound.create({
        data: { cycleId: cycle.id, weekNumber: 1, opensAt: new Date(), closesAt: new Date(Date.now() + 1e8) },
      });
      await prisma.contestEntry.create({
        data: { cycleId: cycle.id, roundId: round.id, postId, userId: a.userId },
      });

      // Sanity: everything exists first
      expect(await prisma.comment.count({ where: { postId } })).toBe(1);
      expect(await prisma.like.count({ where: { postId } })).toBe(1);
      expect(await prisma.savedPost.count({ where: { postId } })).toBe(1);
      expect(await prisma.postView.count({ where: { postId } })).toBe(1);
      expect(await prisma.postHashtag.count({ where: { postId } })).toBe(1);
      expect(await prisma.contestEntry.count({ where: { postId } })).toBe(1);
      const tag = await prisma.hashtag.findUnique({ where: { tag: 'cascadetest' } });
      expect(tag?.postCount).toBe(1);

      await request(app.getHttpServer()).delete(`/posts/${postId}`).set(auth(a)).expect(204);

      expect(await prisma.post.count({ where: { id: postId } })).toBe(0);
      expect(await prisma.comment.count({ where: { postId } })).toBe(0);
      expect(await prisma.like.count({ where: { postId } })).toBe(0);
      expect(await prisma.savedPost.count({ where: { postId } })).toBe(0);
      expect(await prisma.postView.count({ where: { postId } })).toBe(0);
      expect(await prisma.postHashtag.count({ where: { postId } })).toBe(0);
      expect(await prisma.contestEntry.count({ where: { postId } })).toBe(0);
      // B's own account is untouched; the hashtag cache was decremented.
      expect(await prisma.user.count({ where: { id: b.userId } })).toBe(1);
      expect((await prisma.hashtag.findUnique({ where: { tag: 'cascadetest' } }))?.postCount).toBe(0);
      await request(app.getHttpServer()).get(`/posts/${postId}`).set(auth(b)).expect(404);
    });

    it('403 for a non-author (post survives), 404 for a missing post', async () => {
      const prisma = getTestPrismaClient();
      const a = await createUser('a');
      const b = await createUser('b');
      const postId = await createPostViaApi(a);
      await request(app.getHttpServer()).delete(`/posts/${postId}`).set(auth(b)).expect(403);
      expect(await prisma.post.count({ where: { id: postId } })).toBe(1);
      await request(app.getHttpServer())
        .delete('/posts/00000000-0000-0000-0000-000000000000')
        .set(auth(a))
        .expect(404);
    });

    it('a dangling Notification.payloadRefId does not break GET /notifications', async () => {
      const a = await createUser('a');
      const b = await createUser('b');
      const postId = await createPostViaApi(a);
      await request(app.getHttpServer()).post(`/posts/${postId}/like`).set(auth(b)).expect(200);
      await request(app.getHttpServer()).delete(`/posts/${postId}`).set(auth(a)).expect(204);

      const prisma = getTestPrismaClient();
      expect(await prisma.notification.count({ where: { userId: a.userId, payloadRefId: postId } })).toBe(1);
      const res = await request(app.getHttpServer()).get('/notifications').set(auth(a)).expect(200);
      const row = res.body.items.find((n: { payloadRefId: string }) => n.payloadRefId === postId);
      expect(row).toBeDefined();
      expect(row.data).toBeNull();
    });
  });

  describe('commentPermission', () => {
    it('off: blocks everyone but the author; followers: needs a follow; everyone: open; existing comments untouched', async () => {
      const prisma = getTestPrismaClient();
      const a = await createUser('a');
      const b = await createUser('b');
      const postId = await createPostViaApi(a, 'plain post');
      const comment = (u: { accessToken: string }) =>
        request(app.getHttpServer()).post(`/posts/${postId}/comments`).set(auth(u)).send({ contentText: 'x' });

      await comment(b).expect(201); // default everyone
      const setPerm = (u: { accessToken: string }, p: string) =>
        request(app.getHttpServer()).patch(`/posts/${postId}/comment-settings`).set(auth(u)).send({ commentPermission: p });

      await setPerm(b, 'off').expect(403); // non-author cannot change settings
      await setPerm(a, 'off').expect(200);
      await comment(b).expect(403);
      await comment(a).expect(201); // author always can
      // Existing comment from before the change is still there
      expect(await prisma.comment.count({ where: { postId } })).toBe(2);

      await setPerm(a, 'followers').expect(200);
      await comment(b).expect(403);
      // B follows A (Follow.followerId = B, followeeId = A)
      await request(app.getHttpServer()).post(`/users/${a.userId}/follow`).set(auth(b)).expect(200);
      await comment(b).expect(201);
      // A following B does NOT help B comment: direction matters
      const c = await createUser('c');
      await request(app.getHttpServer()).post(`/users/${c.userId}/follow`).set(auth(a)).expect(200);
      await comment(c).expect(403);

      await setPerm(a, 'everyone').expect(200);
      await comment(c).expect(201);
    });

    it('rejects an invalid value (400) and a missing post (404)', async () => {
      const a = await createUser('a');
      const postId = await createPostViaApi(a, 'plain post');
      await request(app.getHttpServer()).patch(`/posts/${postId}/comment-settings`).set(auth(a)).send({ commentPermission: 'nope' }).expect(400);
      await request(app.getHttpServer())
        .patch('/posts/00000000-0000-0000-0000-000000000000/comment-settings')
        .set(auth(a))
        .send({ commentPermission: 'off' })
        .expect(404);
    });
  });

  describe('hiding comments', () => {
    it('hides for others, shows (flagged) to the post author and the comment author; commentCount excludes hidden; only post author may hide', async () => {
      const prisma = getTestPrismaClient();
      const a = await createUser('a');
      const b = await createUser('b');
      const c = await createUser('c');
      const postId = await createPostViaApi(a, 'plain post');
      const cm = await request(app.getHttpServer()).post(`/posts/${postId}/comments`).set(auth(b)).send({ contentText: 'hide me' }).expect(201);
      await request(app.getHttpServer()).post(`/posts/${postId}/comments`).set(auth(c)).send({ contentText: 'keep me' }).expect(201);
      const commentId = cm.body.id as string;
      const count = async () => (await prisma.post.findUniqueOrThrow({ where: { id: postId } })).commentCount;
      expect(await count()).toBe(2);

      // Non-post-author (even the comment's own author) cannot hide
      await request(app.getHttpServer()).patch(`/posts/${postId}/comments/${commentId}/hide`).set(auth(b)).expect(403);
      await request(app.getHttpServer()).patch(`/posts/${postId}/comments/${commentId}/hide`).set(auth(c)).expect(403);
      await request(app.getHttpServer()).patch(`/posts/${postId}/comments/${commentId}/unhide`).set(auth(c)).expect(403);
      // Comment belonging to another post -> 404
      await request(app.getHttpServer()).patch(`/posts/${postId}/comments/00000000-0000-0000-0000-000000000000/hide`).set(auth(a)).expect(404);

      await request(app.getHttpServer()).patch(`/posts/${postId}/comments/${commentId}/hide`).set(auth(a)).expect(200);
      await request(app.getHttpServer()).patch(`/posts/${postId}/comments/${commentId}/hide`).set(auth(a)).expect(200); // idempotent
      expect(await count()).toBe(1);

      const list = async (u: { accessToken: string }) =>
        (await request(app.getHttpServer()).get(`/posts/${postId}/comments`).set(auth(u)).expect(200)).body.items as Array<{
          id: string;
          hidden: boolean;
        }>;
      expect((await list(c)).map((i) => i.id)).not.toContain(commentId); // other viewer: gone
      const asPostAuthor = await list(a);
      expect(asPostAuthor).toHaveLength(2);
      expect(asPostAuthor.find((i) => i.id === commentId)?.hidden).toBe(true);
      const asCommenter = await list(b);
      expect(asCommenter.find((i) => i.id === commentId)?.hidden).toBe(true); // own hidden comment still visible, flagged

      await request(app.getHttpServer()).patch(`/posts/${postId}/comments/${commentId}/unhide`).set(auth(a)).expect(200);
      expect(await count()).toBe(2);
      expect((await list(c)).map((i) => i.id)).toContain(commentId);

      // Deleting a hidden comment must not decrement a second time
      await request(app.getHttpServer()).patch(`/posts/${postId}/comments/${commentId}/hide`).set(auth(a)).expect(200);
      expect(await count()).toBe(1);
      await request(app.getHttpServer()).delete(`/posts/${postId}/comments/${commentId}`).set(auth(b)).expect(204);
      expect(await count()).toBe(1);
    });
  });
});
