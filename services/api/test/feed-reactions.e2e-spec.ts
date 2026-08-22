import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { TokenService } from '../src/modules/auth/token/token.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';

// Real-Postgres coverage for the transactional counter/notification logic
// documented directly on FeedService.likePost/unlikePost/addComment/
// savePost/unsavePost (see feed.service.ts's own comments) — this is
// exactly category (2) from test/README.md's guiding principle
// ("transaction/isolation-level reasoning"): whether the interactive
// $transaction callbacks in that file genuinely behave the way their
// comments say they do (Like row + likeCount increment landing together,
// P2002-on-duplicate treated as idempotent without a double-increment,
// the `updateMany`-with-`likeCount: { gt: 0 }` race guard, and — the part
// a mock's own bookkeeping can least be trusted to prove — which side of
// a Notification row is the actor and which is the recipient) can only be
// proven against a real database, not a mock that would report success by
// construction.
describe('Feed reactions e2e: like/unlike, comment, save/unsave against real Postgres', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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

  function uniqueEmail(label: string): string {
    return `e2e-feed-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  }

  // GAP FOUND WHILE BUILDING THIS SPEC (flagged, not silently worked
  // around — see PR #63's report): this file's brief called for the same
  // register -> login createUser() pattern auth.e2e-spec.ts and
  // clubs.e2e-spec.ts already use. That pattern hits real POST
  // /auth/register, which is real-rate-limited (AuthThrottlerGuard,
  // Build Plan Section 5.7) at 5 requests/60s PER IP — and, as this spec
  // file's own first run against real Postgres discovered, that limit
  // was NOT actually configurable via AUTH_RATE_LIMIT_MAX/AUTH_RATE_
  // LIMIT_WINDOW_MS (rate-limit.module.ts reads those into the
  // module-level throttler config, but every current caller of the
  // @AuthRateLimit() decorator — register, login, forgot-password,
  // guardian-consent/resend — invoked it with NO arguments, so
  // `Throttle({ auth: { limit: DEFAULT_AUTH_RATE_LIMIT, ttl:
  // DEFAULT_AUTH_RATE_LIMIT_WINDOW_MS } })`'s own hardcoded imported
  // constants won at the route level regardless of what the module-level,
  // env-driven config said). This file's coverage genuinely needs many
  // more than 5 distinct users across a single spec file's real HTTP
  // traffic (like/unlike/comment/save notification-direction assertions
  // each want their own author+actor pair), so reusing createUser() as-is
  // would hit real 429s well before this file's own tests finish —
  // confirmed directly: it did, on the first run.
  //
  // RESOLVED (branch sprint-2/fix-auth-rate-limit-config-wiring):
  // AuthRateLimit() no longer applies its own hardcoded default
  // parameters unconditionally — a bare @AuthRateLimit() now applies
  // ONLY the guard, so AUTH_RATE_LIMIT_MAX/AUTH_RATE_LIMIT_WINDOW_MS
  // genuinely control every real call site now (see
  // rate-limit/auth-rate-limit.decorator.ts and its own spec for the
  // behavioral proof). That fix does NOT, by itself, make switching this
  // file (and follow.e2e-spec.ts / counters.e2e-spec.ts, which point back
  // to this comment) over to real HTTP registration free — .env.test still
  // has no AUTH_RATE_LIMIT_MAX override, so the default stays 5/60s, and
  // this file alone calls createUser() 21 times. Doing this properly would
  // mean adding a test-specific rate-limit override plus converting every
  // createUser() call site across three files (21 + 13 + 3 = 37 total) to
  // real register/login HTTP calls, each paying real argon2id hashing
  // cost — judged a larger, separate change than this bug-fix PR's scope;
  // deliberately left as a documented follow-up rather than done here. The
  // workaround immediately below remains correct and intentional, not a
  // symptom of the (now-fixed) bug: seed the User row directly via Prisma
  // (same "seed directly via Prisma" precedent clubs.e2e-spec.ts already
  // set for ClubPage) and mint a real access token via the REAL, unmocked
  // TokenService pulled straight from this test's own NestJS DI container
  // (`app.get(TokenService)`) — not a hand-built JWT, not a mocked
  // TokenService/JwtAuthGuard override (this file still uses the exact
  // same "real AppModule, no provider overrides" pattern as every other
  // spec here). TokenService.issueTokenPair signs with the same real
  // JWT_SECRET and the same code path POST /auth/login itself calls, so
  // every downstream request in this file still exercises the real
  // JwtAuthGuard -> TokenService.verifyAccessToken chain end to end —
  // only the register/argon2id/rate-limiter path itself is bypassed,
  // which is already covered by auth.e2e-spec.ts and isn't what this
  // file's own coverage is about.
  async function createUser(label: string): Promise<{ userId: string; accessToken: string }> {
    const prisma = getTestPrismaClient();
    const user = await prisma.user.create({
      data: {
        email: uniqueEmail(label),
        // Never used to log in via HTTP in this file — a placeholder is
        // fine; a real argon2id hash is already proven end to end by
        // auth.e2e-spec.ts.
        passwordHash: 'unused-in-this-e2e-spec-file',
        displayName: `E2E Feed User ${label}`,
        dateOfBirth: new Date('1998-07-04'), // adult, no guardian-consent branch
        isMinor: false,
      },
    });

    const tokenService = app.get(TokenService);
    const { accessToken } = await tokenService.issueTokenPair(user.id, user.role);

    return { userId: user.id, accessToken: accessToken.token };
  }

  // No POST /clubs or a "seed a post via the API" requirement here — Post
  // rows are seeded directly via Prisma (same precedent clubs.e2e-spec.ts
  // set for ClubPage), since this file is about the reaction endpoints'
  // own transactional behavior, not about proving POST /posts works (that
  // is slice one's own, already-covered scope per Sprint 2's history).
  async function seedPost(authorId: string) {
    const prisma = getTestPrismaClient();
    return prisma.post.create({
      data: { authorId, contentText: 'A real seeded post for e2e reactions', mediaUrls: [] },
    });
  }

  describe('like / unlike', () => {
    it('creates a Like row and increments Post.likeCount together, and is idempotent on a double-like', async () => {
      const author = await createUser('author');
      const liker = await createUser('liker');
      const post = await seedPost(author.userId);

      const firstLike = await request(app.getHttpServer())
        .post(`/posts/${post.id}/like`)
        .set('Authorization', `Bearer ${liker.accessToken}`)
        .expect(200);
      expect(firstLike.body).toEqual({ postId: post.id, liked: true, likeCount: 1 });

      const secondLike = await request(app.getHttpServer())
        .post(`/posts/${post.id}/like`)
        .set('Authorization', `Bearer ${liker.accessToken}`)
        .expect(200);
      // The bug this guards against: a naive/incorrectly-mocked
      // implementation double-incrementing likeCount to 2 on the repeat
      // call instead of staying at 1.
      expect(secondLike.body).toEqual({ postId: post.id, liked: true, likeCount: 1 });

      const prisma = getTestPrismaClient();
      const likeRows = await prisma.like.findMany({ where: { userId: liker.userId, postId: post.id } });
      expect(likeRows).toHaveLength(1);

      const postRow = await prisma.post.findUniqueOrThrow({ where: { id: post.id } });
      expect(postRow.likeCount).toBe(1);
    });

    it('unlike is idempotent — unliking an already-unliked post is a no-op and likeCount never goes negative', async () => {
      const author = await createUser('author');
      const liker = await createUser('liker');
      const post = await seedPost(author.userId);

      // Never liked at all — unlike straight away.
      const firstUnlike = await request(app.getHttpServer())
        .delete(`/posts/${post.id}/like`)
        .set('Authorization', `Bearer ${liker.accessToken}`)
        .expect(200);
      expect(firstUnlike.body).toEqual({ postId: post.id, liked: false, likeCount: 0 });

      // Like once, then unlike twice — the second unlike is the "already
      // unliked" boundary case.
      await request(app.getHttpServer())
        .post(`/posts/${post.id}/like`)
        .set('Authorization', `Bearer ${liker.accessToken}`)
        .expect(200);

      const secondUnlike = await request(app.getHttpServer())
        .delete(`/posts/${post.id}/like`)
        .set('Authorization', `Bearer ${liker.accessToken}`)
        .expect(200);
      expect(secondUnlike.body).toEqual({ postId: post.id, liked: false, likeCount: 0 });

      const thirdUnlike = await request(app.getHttpServer())
        .delete(`/posts/${post.id}/like`)
        .set('Authorization', `Bearer ${liker.accessToken}`)
        .expect(200);
      expect(thirdUnlike.body).toEqual({ postId: post.id, liked: false, likeCount: 0 });

      const prisma = getTestPrismaClient();
      const postRow = await prisma.post.findUniqueOrThrow({ where: { id: post.id } });
      expect(postRow.likeCount).toBe(0);
      const likeRows = await prisma.like.findMany({ where: { userId: liker.userId, postId: post.id } });
      expect(likeRows).toHaveLength(0);
    });
  });

  describe('comments', () => {
    it('creates a Comment row and increments Post.commentCount together, and two comments from the same user produce two distinct rows', async () => {
      const author = await createUser('author');
      const commenter = await createUser('commenter');
      const post = await seedPost(author.userId);

      const first = await request(app.getHttpServer())
        .post(`/posts/${post.id}/comments`)
        .set('Authorization', `Bearer ${commenter.accessToken}`)
        .send({ contentText: 'First comment' })
        .expect(201);

      const second = await request(app.getHttpServer())
        .post(`/posts/${post.id}/comments`)
        .set('Authorization', `Bearer ${commenter.accessToken}`)
        .send({ contentText: 'Second comment' })
        .expect(201);

      expect(first.body.id).not.toBe(second.body.id);

      const prisma = getTestPrismaClient();
      const commentRows = await prisma.comment.findMany({ where: { postId: post.id } });
      expect(commentRows).toHaveLength(2);

      const postRow = await prisma.post.findUniqueOrThrow({ where: { id: post.id } });
      expect(postRow.commentCount).toBe(2);
    });
  });

  describe('comment deletion (DELETE /posts/:id/comments/:commentId)', () => {
    async function postComment(post: { id: string }, actor: { accessToken: string }, contentText: string) {
      const response = await request(app.getHttpServer())
        .post(`/posts/${post.id}/comments`)
        .set('Authorization', `Bearer ${actor.accessToken}`)
        .send({ contentText })
        .expect(201);
      return response.body as { id: string };
    }

    it('the comment author can delete their own comment: the row is genuinely gone and commentCount decrements by exactly 1', async () => {
      const author = await createUser('author');
      const commenter = await createUser('commenter');
      const post = await seedPost(author.userId);
      const comment = await postComment(post, commenter, 'Delete me');

      await request(app.getHttpServer())
        .delete(`/posts/${post.id}/comments/${comment.id}`)
        .set('Authorization', `Bearer ${commenter.accessToken}`)
        .expect(204);

      const prisma = getTestPrismaClient();
      const commentRow = await prisma.comment.findUnique({ where: { id: comment.id } });
      expect(commentRow).toBeNull();

      const postRow = await prisma.post.findUniqueOrThrow({ where: { id: post.id } });
      expect(postRow.commentCount).toBe(0);
    });

    it('the POST AUTHOR can delete someone else\'s comment on their own post — same outcome, proving the "OR post author" half works', async () => {
      const author = await createUser('author');
      const commenter = await createUser('commenter');
      const post = await seedPost(author.userId);
      const comment = await postComment(post, commenter, 'Moderate me');

      await request(app.getHttpServer())
        .delete(`/posts/${post.id}/comments/${comment.id}`)
        .set('Authorization', `Bearer ${author.accessToken}`)
        .expect(204);

      const prisma = getTestPrismaClient();
      const commentRow = await prisma.comment.findUnique({ where: { id: comment.id } });
      expect(commentRow).toBeNull();

      const postRow = await prisma.post.findUniqueOrThrow({ where: { id: post.id } });
      expect(postRow.commentCount).toBe(0);
    });

    it('a third user (neither comment author nor post author) is rejected with 403 and has zero effect', async () => {
      const author = await createUser('author');
      const commenter = await createUser('commenter');
      const stranger = await createUser('stranger');
      const post = await seedPost(author.userId);
      const comment = await postComment(post, commenter, 'Not yours to delete');

      await request(app.getHttpServer())
        .delete(`/posts/${post.id}/comments/${comment.id}`)
        .set('Authorization', `Bearer ${stranger.accessToken}`)
        .expect(403);

      const prisma = getTestPrismaClient();
      const commentRow = await prisma.comment.findUnique({ where: { id: comment.id } });
      expect(commentRow).not.toBeNull();

      const postRow = await prisma.post.findUniqueOrThrow({ where: { id: post.id } });
      expect(postRow.commentCount).toBe(1);
    });

    it('deleting a commentId that does not exist is a 404', async () => {
      const author = await createUser('author');
      const post = await seedPost(author.userId);

      await request(app.getHttpServer())
        .delete(`/posts/${post.id}/comments/00000000-0000-0000-0000-000000000000`)
        .set('Authorization', `Bearer ${author.accessToken}`)
        .expect(404);
    });

    it('deleting a commentId that exists but belongs to a DIFFERENT post than the URL is a 404, not a 403', async () => {
      const author = await createUser('author');
      const commenter = await createUser('commenter');
      const postA = await seedPost(author.userId);
      const postB = await seedPost(author.userId);
      const comment = await postComment(postA, commenter, 'I belong to postA, not postB');

      // commenter genuinely authored this comment, so if the mismatch were
      // (incorrectly) treated as an authorization question rather than a
      // resource-identity one, this would come back 200/204, not 404.
      await request(app.getHttpServer())
        .delete(`/posts/${postB.id}/comments/${comment.id}`)
        .set('Authorization', `Bearer ${commenter.accessToken}`)
        .expect(404);

      const prisma = getTestPrismaClient();
      const commentRow = await prisma.comment.findUnique({ where: { id: comment.id } });
      expect(commentRow).not.toBeNull();
    });

    it('deleting the same real comment twice: 204 the first time, 404 the second — NOT the idempotent-200 pattern like/save/follow/join use', async () => {
      const author = await createUser('author');
      const commenter = await createUser('commenter');
      const post = await seedPost(author.userId);
      const comment = await postComment(post, commenter, 'Only deletable once');

      await request(app.getHttpServer())
        .delete(`/posts/${post.id}/comments/${comment.id}`)
        .set('Authorization', `Bearer ${commenter.accessToken}`)
        .expect(204);

      await request(app.getHttpServer())
        .delete(`/posts/${post.id}/comments/${comment.id}`)
        .set('Authorization', `Bearer ${commenter.accessToken}`)
        .expect(404);
    });

    it('a comment/comment/delete/comment sequence lands commentCount at exactly 2, matching Comment.count() at each step', async () => {
      const author = await createUser('author');
      const commenter = await createUser('commenter');
      const post = await seedPost(author.userId);
      const prisma = getTestPrismaClient();

      async function assertCommentCountMatches(expected: number) {
        const postRow = await prisma.post.findUniqueOrThrow({ where: { id: post.id } });
        const realCount = await prisma.comment.count({ where: { postId: post.id } });
        expect(postRow.commentCount).toBe(expected);
        expect(realCount).toBe(expected);
      }

      const first = await postComment(post, commenter, 'First');
      await assertCommentCountMatches(1);

      const second = await postComment(post, commenter, 'Second');
      await assertCommentCountMatches(2);

      await request(app.getHttpServer())
        .delete(`/posts/${post.id}/comments/${first.id}`)
        .set('Authorization', `Bearer ${commenter.accessToken}`)
        .expect(204);
      await assertCommentCountMatches(1);

      const third = await postComment(post, commenter, 'Third');
      await assertCommentCountMatches(2);

      // Pin the exact final numbers, not just "they match each other" —
      // the surviving rows are the second and third comments; the first
      // (deleted) comment is genuinely gone.
      const finalCount = await prisma.comment.count({ where: { postId: post.id } });
      expect(finalCount).toBe(2);
      const remaining = await prisma.comment.findMany({ where: { postId: post.id } });
      expect(remaining.map((c) => c.id).sort()).toEqual([second.id, third.id].sort());
    });
  });

  describe('save / unsave', () => {
    it('save creates a SavedPost row and is idempotent on a double-save', async () => {
      const author = await createUser('author');
      const saver = await createUser('saver');
      const post = await seedPost(author.userId);

      await request(app.getHttpServer())
        .post(`/posts/${post.id}/save`)
        .set('Authorization', `Bearer ${saver.accessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/posts/${post.id}/save`)
        .set('Authorization', `Bearer ${saver.accessToken}`)
        .expect(200);

      const prisma = getTestPrismaClient();
      const savedRows = await prisma.savedPost.findMany({ where: { userId: saver.userId, postId: post.id } });
      expect(savedRows).toHaveLength(1);
    });

    it('unsave removes the SavedPost row and is idempotent on a double-unsave', async () => {
      const author = await createUser('author');
      const saver = await createUser('saver');
      const post = await seedPost(author.userId);

      await request(app.getHttpServer())
        .post(`/posts/${post.id}/save`)
        .set('Authorization', `Bearer ${saver.accessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/posts/${post.id}/save`)
        .set('Authorization', `Bearer ${saver.accessToken}`)
        .expect(200);

      // Already unsaved — second unsave is a no-op, not an error.
      await request(app.getHttpServer())
        .delete(`/posts/${post.id}/save`)
        .set('Authorization', `Bearer ${saver.accessToken}`)
        .expect(200);

      const prisma = getTestPrismaClient();
      const savedRows = await prisma.savedPost.findMany({ where: { userId: saver.userId, postId: post.id } });
      expect(savedRows).toHaveLength(0);
    });
  });

  describe('Notification wiring — recipient direction and no-self-notification, verified by querying Notification directly', () => {
    it('liking someone else\'s post creates exactly one Notification row addressed to the POST AUTHOR, not the liker', async () => {
      const author = await createUser('author');
      const liker = await createUser('liker');
      const post = await seedPost(author.userId);

      await request(app.getHttpServer())
        .post(`/posts/${post.id}/like`)
        .set('Authorization', `Bearer ${liker.accessToken}`)
        .expect(200);

      const prisma = getTestPrismaClient();
      const notifications = await prisma.notification.findMany({ where: { payloadRefId: post.id, type: 'like' } });
      expect(notifications).toHaveLength(1);
      expect(notifications[0]!.userId).toBe(author.userId);
      expect(notifications[0]!.userId).not.toBe(liker.userId);
    });

    it('double-liking the same post produces exactly ONE Notification row, not two', async () => {
      const author = await createUser('author');
      const liker = await createUser('liker');
      const post = await seedPost(author.userId);

      await request(app.getHttpServer())
        .post(`/posts/${post.id}/like`)
        .set('Authorization', `Bearer ${liker.accessToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .post(`/posts/${post.id}/like`)
        .set('Authorization', `Bearer ${liker.accessToken}`)
        .expect(200);

      const prisma = getTestPrismaClient();
      const notifications = await prisma.notification.findMany({ where: { payloadRefId: post.id, type: 'like' } });
      expect(notifications).toHaveLength(1);
    });

    it('an author liking their OWN post produces ZERO Notification rows', async () => {
      const author = await createUser('author');
      const post = await seedPost(author.userId);

      await request(app.getHttpServer())
        .post(`/posts/${post.id}/like`)
        .set('Authorization', `Bearer ${author.accessToken}`)
        .expect(200);

      const prisma = getTestPrismaClient();
      const notifications = await prisma.notification.findMany({ where: { payloadRefId: post.id, type: 'like' } });
      expect(notifications).toHaveLength(0);
    });

    it('commenting on someone else\'s post creates a Notification row addressed to the POST AUTHOR, not the commenter', async () => {
      const author = await createUser('author');
      const commenter = await createUser('commenter');
      const post = await seedPost(author.userId);

      await request(app.getHttpServer())
        .post(`/posts/${post.id}/comments`)
        .set('Authorization', `Bearer ${commenter.accessToken}`)
        .send({ contentText: 'Nice post!' })
        .expect(201);

      const prisma = getTestPrismaClient();
      const notifications = await prisma.notification.findMany({ where: { payloadRefId: post.id, type: 'comment' } });
      expect(notifications).toHaveLength(1);
      expect(notifications[0]!.userId).toBe(author.userId);
      expect(notifications[0]!.userId).not.toBe(commenter.userId);
    });

    it('an author commenting on their OWN post produces ZERO Notification rows', async () => {
      const author = await createUser('author');
      const post = await seedPost(author.userId);

      await request(app.getHttpServer())
        .post(`/posts/${post.id}/comments`)
        .set('Authorization', `Bearer ${author.accessToken}`)
        .send({ contentText: 'Talking to myself' })
        .expect(201);

      const prisma = getTestPrismaClient();
      const notifications = await prisma.notification.findMany({ where: { payloadRefId: post.id, type: 'comment' } });
      expect(notifications).toHaveLength(0);
    });
  });
});
