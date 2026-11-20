import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { TokenService } from '../src/modules/auth/token/token.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { seedDob } from './dob-seed';

// Real-Postgres coverage for the keyset-pagination tiebreaker bug fixed
// directly on Post.sequence / Comment.sequence / SavedPost.sequence /
// Follow.sequence (see each column's own comment in schema.prisma, and
// feed.service.ts / users.service.ts / cursor.util.ts's matching
// comments): a mocked Prisma client can't prove anything about SQL
// ORDER BY behavior — it just returns whatever array a test hands it —
// so this is exactly category (2)/(3) from test/README.md's own guiding
// principle (a real relation/constraint-adjacent ordering question that
// only a genuine database engine can answer).
//
// Before the fix, all three of feed.service.ts's keyset-pagination call
// sites (and, as of fix/follow-pagination-tiebreaker,
// users.service.ts's getFollowers/getFollowing too) tiebroke
// same-millisecond ties on a random UUID (Post.id / Comment.id /
// Follow.id, or — for saved posts — SavedPost's foreign key to Post.id)
// that has zero relation to which row was actually created (or saved,
// or followed) first. Each test below deliberately crafts two rows that
// share an EXACT `createdAt`/`savedAt` timestamp, with ids chosen so the
// OLD id-based tiebreaker would have reported them in the WRONG (i.e.
// not-actually-most-recent-first / not-actually-oldest-first) order —
// proving the fix, not just that pagination "works" for some order.
describe('Feed pagination ordering e2e: same-millisecond ties tiebreak on sequence, not a random id', () => {
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
    return `e2e-pagination-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  }

  // Same seed-directly-via-Prisma / mint-a-real-token-via-TokenService
  // pattern feed-reactions.e2e-spec.ts's own header comment documents in
  // full (register's own real HTTP/rate-limiter/argon2id path is already
  // covered by auth.e2e-spec.ts and isn't what this file is about) —
  // every downstream request here still exercises the real JwtAuthGuard
  // -> TokenService.verifyAccessToken chain end to end.
  async function createUser(label: string): Promise<{ userId: string; accessToken: string }> {
    const prisma = getTestPrismaClient();
    const user = await prisma.user.create({
      data: {
        email: uniqueEmail(label),
        passwordHash: 'unused-in-this-e2e-spec-file',
        displayName: `E2E Pagination User ${label}`,
        dateOfBirth: seedDob('1998-07-04'), // adult, no guardian-consent branch
        isMinor: false,
      },
    });

    const tokenService = app.get(TokenService);
    const { accessToken } = await tokenService.issueTokenPair(user.id, user.role);

    return { userId: user.id, accessToken: accessToken.token };
  }

  describe('GET /posts/feed', () => {
    it('orders same-createdAt posts by true creation order (sequence), not by a random id', async () => {
      const author = await createUser('author');
      const tiedAt = new Date('2026-09-20T12:00:00.000Z');
      const prisma = getTestPrismaClient();

      // postOlder is created FIRST (so Postgres assigns it the LOWER
      // `sequence`), but is deliberately given an id that sorts AFTER
      // postNewer's id under a plain string `desc` comparison — the
      // exact trap the old `id desc` tiebreaker fell into.
      const postOlder = await prisma.post.create({
        data: {
          id: 'zzzzzzzz-older-post-created-first',
          authorId: author.userId,
          contentText: 'Created first, but has a lexically-larger id',
          mediaUrls: [],
          createdAt: tiedAt,
        },
      });
      const postNewer = await prisma.post.create({
        data: {
          id: '00000000-newer-post-created-second',
          authorId: author.userId,
          contentText: 'Created second, but has a lexically-smaller id',
          mediaUrls: [],
          createdAt: tiedAt,
        },
      });

      // Sanity-check the trap is real: if this ever stopped holding (a
      // future change to how ids are generated/compared), the rest of
      // this test would pass trivially for the wrong reason.
      expect(postOlder.id > postNewer.id).toBe(true);

      const firstPage = await request(app.getHttpServer())
        .get('/posts/feed?limit=1')
        .set('Authorization', `Bearer ${author.accessToken}`)
        .expect(200);

      // The genuinely most-recently-created post (postNewer) must come
      // first — under the old id-desc tiebreak, postOlder's larger id
      // would have incorrectly sorted first instead.
      expect(firstPage.body.items).toHaveLength(1);
      expect(firstPage.body.items[0].id).toBe(postNewer.id);
      expect(firstPage.body.nextCursor).not.toBeNull();

      const secondPage = await request(app.getHttpServer())
        .get(`/posts/feed?limit=1&cursor=${encodeURIComponent(firstPage.body.nextCursor)}`)
        .set('Authorization', `Bearer ${author.accessToken}`)
        .expect(200);

      expect(secondPage.body.items).toHaveLength(1);
      expect(secondPage.body.items[0].id).toBe(postOlder.id);
      expect(secondPage.body.nextCursor).toBeNull();
    });
  });

  describe('GET /posts/:id/comments', () => {
    it('orders same-createdAt comments by true creation order (sequence), not by a random id — oldest-first', async () => {
      const author = await createUser('comment-author');
      const commenter = await createUser('commenter');
      const prisma = getTestPrismaClient();

      const post = await prisma.post.create({
        data: { authorId: author.userId, contentText: 'A post to comment on', mediaUrls: [] },
      });

      const tiedAt = new Date('2026-09-20T12:00:00.000Z');

      // commentFirst is created FIRST (lower `sequence`), but given an
      // id that sorts AFTER commentSecond's under a plain string `asc`
      // comparison — the trap the old `id asc` tiebreak (getComments is
      // oldest-first) fell into.
      const commentFirst = await prisma.comment.create({
        data: {
          id: 'zzzzzzzz-comment-created-first',
          postId: post.id,
          authorId: commenter.userId,
          contentText: 'Written first, but has a lexically-larger id',
          createdAt: tiedAt,
        },
      });
      const commentSecond = await prisma.comment.create({
        data: {
          id: '00000000-comment-created-second',
          postId: post.id,
          authorId: commenter.userId,
          contentText: 'Written second, but has a lexically-smaller id',
          createdAt: tiedAt,
        },
      });

      expect(commentFirst.id > commentSecond.id).toBe(true);

      const firstPage = await request(app.getHttpServer())
        .get(`/posts/${post.id}/comments?limit=1`)
        .set('Authorization', `Bearer ${author.accessToken}`)
        .expect(200);

      // The genuinely first-written comment must come first — under the
      // old id-asc tiebreak, commentSecond's smaller id would have
      // incorrectly sorted first instead.
      expect(firstPage.body.items).toHaveLength(1);
      expect(firstPage.body.items[0].id).toBe(commentFirst.id);
      expect(firstPage.body.nextCursor).not.toBeNull();

      const secondPage = await request(app.getHttpServer())
        .get(`/posts/${post.id}/comments?limit=1&cursor=${encodeURIComponent(firstPage.body.nextCursor)}`)
        .set('Authorization', `Bearer ${author.accessToken}`)
        .expect(200);

      expect(secondPage.body.items).toHaveLength(1);
      expect(secondPage.body.items[0].id).toBe(commentSecond.id);
      expect(secondPage.body.nextCursor).toBeNull();
    });
  });

  describe('GET /users/:id/saved-posts', () => {
    it('orders same-savedAt saves by true save order (sequence), not by the saved post\'s own random id', async () => {
      const saver = await createUser('saver');
      const author = await createUser('saved-posts-author');
      const prisma = getTestPrismaClient();

      // The two POSTS being saved get deliberately mismatched ids — the
      // old tiebreaker was `postId` (the FOREIGN KEY on SavedPost, i.e.
      // these posts' own ids), which has zero relation to which
      // SavedPost ROW was actually created first.
      const postSavedFirst = await prisma.post.create({
        data: {
          id: 'zzzzzzzz-post-saved-first',
          authorId: author.userId,
          contentText: 'Saved first, but referenced by a lexically-larger postId',
          mediaUrls: [],
        },
      });
      const postSavedSecond = await prisma.post.create({
        data: {
          id: '00000000-post-saved-second',
          authorId: author.userId,
          contentText: 'Saved second, but referenced by a lexically-smaller postId',
          mediaUrls: [],
        },
      });

      const tiedAt = new Date('2026-09-20T12:00:00.000Z');
      await prisma.savedPost.create({
        data: { userId: saver.userId, postId: postSavedFirst.id, savedAt: tiedAt },
      });
      await prisma.savedPost.create({
        data: { userId: saver.userId, postId: postSavedSecond.id, savedAt: tiedAt },
      });

      expect(postSavedFirst.id > postSavedSecond.id).toBe(true);

      const firstPage = await request(app.getHttpServer())
        .get(`/users/${saver.userId}/saved-posts?limit=1`)
        .set('Authorization', `Bearer ${saver.accessToken}`)
        .expect(200);

      // The genuinely most-recently-saved post (postSavedSecond) must
      // come first — under the old postId-desc tiebreak, postSavedFirst
      // (the earlier save, but with a larger post id) would have
      // incorrectly sorted first instead.
      expect(firstPage.body.items).toHaveLength(1);
      expect(firstPage.body.items[0].postId).toBe(postSavedSecond.id);
      expect(firstPage.body.nextCursor).not.toBeNull();

      const secondPage = await request(app.getHttpServer())
        .get(
          `/users/${saver.userId}/saved-posts?limit=1&cursor=${encodeURIComponent(firstPage.body.nextCursor)}`,
        )
        .set('Authorization', `Bearer ${saver.accessToken}`)
        .expect(200);

      expect(secondPage.body.items).toHaveLength(1);
      expect(secondPage.body.items[0].postId).toBe(postSavedFirst.id);
      expect(secondPage.body.nextCursor).toBeNull();
    });
  });

  // fix/follow-pagination-tiebreaker: the same class of bug, in
  // users.service.ts's getFollowers/getFollowing — those two tiebroke
  // same-`createdAt` Follow rows on Follow.id (a random UUID with no
  // relation to insertion order), left out of scope by the three blocks
  // above since users.service.ts imported the plain, non-sequence
  // FeedCursor pair directly rather than feed.service.ts's
  // FeedSequenceCursor pair. Follow.sequence (see its own comment in
  // schema.prisma) closes the same gap, reusing FeedSequenceCursor/
  // encodeFeedSequenceCursor/decodeFeedSequenceCursor as-is — no third
  // cursor shape was needed.
  describe('GET /users/:id/followers', () => {
    it('orders same-createdAt follows by true follow order (sequence), not by a random id', async () => {
      const target = await createUser('followers-target');
      const followerA = await createUser('followers-a');
      const followerB = await createUser('followers-b');
      const prisma = getTestPrismaClient();

      const tiedAt = new Date('2026-09-20T12:00:00.000Z');

      // followA follows target FIRST (so Postgres assigns it the LOWER
      // `sequence`), but the Follow row is deliberately given an id that
      // sorts AFTER followB's under a plain string `desc` comparison —
      // the exact trap the old `id desc` tiebreaker fell into.
      const followA = await prisma.follow.create({
        data: {
          id: 'zzzzzzzz-follow-created-first',
          followerId: followerA.userId,
          followeeId: target.userId,
          createdAt: tiedAt,
        },
      });
      const followB = await prisma.follow.create({
        data: {
          id: '00000000-follow-created-second',
          followerId: followerB.userId,
          followeeId: target.userId,
          createdAt: tiedAt,
        },
      });

      // Sanity-check the trap is real: if this ever stopped holding, the
      // rest of this test would pass trivially for the wrong reason.
      expect(followA.id > followB.id).toBe(true);

      const firstPage = await request(app.getHttpServer())
        .get(`/users/${target.userId}/followers?limit=1`)
        .set('Authorization', `Bearer ${target.accessToken}`)
        .expect(200);

      // The genuinely most-recently-followed follower (followerB) must
      // come first — under the old id-desc tiebreak, followA's larger id
      // would have incorrectly sorted first instead.
      expect(firstPage.body.items).toHaveLength(1);
      expect(firstPage.body.items[0].id).toBe(followerB.userId);
      expect(firstPage.body.nextCursor).not.toBeNull();

      const secondPage = await request(app.getHttpServer())
        .get(
          `/users/${target.userId}/followers?limit=1&cursor=${encodeURIComponent(firstPage.body.nextCursor)}`,
        )
        .set('Authorization', `Bearer ${target.accessToken}`)
        .expect(200);

      expect(secondPage.body.items).toHaveLength(1);
      expect(secondPage.body.items[0].id).toBe(followerA.userId);
      expect(secondPage.body.nextCursor).toBeNull();
    });
  });

  describe('GET /users/:id/following', () => {
    it('orders same-createdAt follows by true follow order (sequence), not by a random id', async () => {
      const source = await createUser('following-source');
      const followeeA = await createUser('following-a');
      const followeeB = await createUser('following-b');
      const prisma = getTestPrismaClient();

      const tiedAt = new Date('2026-09-20T12:00:00.000Z');

      // source follows followeeA FIRST (lower `sequence`), but that Follow
      // row is deliberately given an id that sorts AFTER the one for
      // followeeB under a plain string `desc` comparison.
      const followA = await prisma.follow.create({
        data: {
          id: 'zzzzzzzz-following-created-first',
          followerId: source.userId,
          followeeId: followeeA.userId,
          createdAt: tiedAt,
        },
      });
      const followB = await prisma.follow.create({
        data: {
          id: '00000000-following-created-second',
          followerId: source.userId,
          followeeId: followeeB.userId,
          createdAt: tiedAt,
        },
      });

      expect(followA.id > followB.id).toBe(true);

      const firstPage = await request(app.getHttpServer())
        .get(`/users/${source.userId}/following?limit=1`)
        .set('Authorization', `Bearer ${source.accessToken}`)
        .expect(200);

      // The genuinely most-recently-followed followee (followeeB) must
      // come first — under the old id-desc tiebreak, followA's larger id
      // would have incorrectly sorted first instead.
      expect(firstPage.body.items).toHaveLength(1);
      expect(firstPage.body.items[0].id).toBe(followeeB.userId);
      expect(firstPage.body.nextCursor).not.toBeNull();

      const secondPage = await request(app.getHttpServer())
        .get(
          `/users/${source.userId}/following?limit=1&cursor=${encodeURIComponent(firstPage.body.nextCursor)}`,
        )
        .set('Authorization', `Bearer ${source.accessToken}`)
        .expect(200);

      expect(secondPage.body.items).toHaveLength(1);
      expect(secondPage.body.items[0].id).toBe(followeeA.userId);
      expect(secondPage.body.nextCursor).toBeNull();
    });
  });
});
