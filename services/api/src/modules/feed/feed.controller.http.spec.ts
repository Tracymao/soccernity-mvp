import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { PrismaService } from '../../prisma/prisma.service';
import { GuardianConsentGuard } from '../auth/guards/guardian-consent.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FeedController } from './feed.controller';
import { FeedService } from './feed.service';

// Exercises the real HTTP layer: routing, DTO validation, and — unlike
// registration.controller.spec.ts / users.controller.http.spec.ts, which
// override every guard away — the REAL GuardianConsentGuard, wired
// exactly as FeedController declares it (@UseGuards(JwtAuthGuard,
// GuardianConsentGuard) on POST /posts only). JwtAuthGuard is still
// overridden (bypassing real token verification, same pattern as
// elsewhere) since token signature/expiry isn't this suite's concern —
// but GuardianConsentGuard is left as a real, DI-resolved instance
// backed by a mocked PrismaService, so this suite is the actual proof
// that the guard is correctly applied to POST /posts and correctly
// absent from GET /posts/feed, not just documented as such in a comment.
describe('FeedController (HTTP layer)', () => {
  let app: INestApplication;
  const feedService = {
    createPost: jest.fn(),
    getFeed: jest.fn(),
    getPostById: jest.fn(),
    likePost: jest.fn(),
    unlikePost: jest.fn(),
    addComment: jest.fn(),
    getComments: jest.fn(),
    deleteComment: jest.fn(),
    savePost: jest.fn(),
    unsavePost: jest.fn(),
  };
  const prisma = {
    user: { findUnique: jest.fn() },
    guardian: { findUnique: jest.fn() },
  };

  const ADULT = { sub: 'adult-1', role: 'fan' };
  const PENDING_MINOR = { sub: 'minor-1', role: 'fan' };
  const CONFIRMED_MINOR = { sub: 'minor-2', role: 'fan' };

  let currentUser: { sub: string; role: string } = ADULT;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [FeedController],
      providers: [
        { provide: FeedService, useValue: feedService },
        GuardianConsentGuard,
        { provide: PrismaService, useValue: prisma },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          req.user = currentUser;
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.clearAllMocks();
    currentUser = ADULT;
  });

  describe('POST /posts', () => {
    it('succeeds for a non-minor account (GuardianConsentGuard passes through without querying Guardian)', async () => {
      currentUser = ADULT;
      prisma.user.findUnique.mockResolvedValue({ isMinor: false });
      feedService.createPost.mockResolvedValue({ id: 'post-1', contentText: 'Hello' });

      const response = await request(app.getHttpServer())
        .post('/posts')
        .send({ contentText: 'Hello' })
        .expect(201);

      expect(response.body.id).toBe('post-1');
      expect(feedService.createPost).toHaveBeenCalledWith('adult-1', { contentText: 'Hello' });
      expect(prisma.guardian.findUnique).not.toHaveBeenCalled();
    });

    it('succeeds for a minor with confirmed guardian consent', async () => {
      currentUser = CONFIRMED_MINOR;
      prisma.user.findUnique.mockResolvedValue({ isMinor: true });
      prisma.guardian.findUnique.mockResolvedValue({ consentStatus: 'confirmed' });
      feedService.createPost.mockResolvedValue({ id: 'post-2', contentText: 'Hi' });

      await request(app.getHttpServer()).post('/posts').send({ contentText: 'Hi' }).expect(201);

      expect(feedService.createPost).toHaveBeenCalledWith('minor-2', { contentText: 'Hi' });
    });

    it('blocks a minor with outstanding (pending) guardian consent with 403 + guardian_consent_pending, never reaching FeedService', async () => {
      currentUser = PENDING_MINOR;
      prisma.user.findUnique.mockResolvedValue({ isMinor: true });
      prisma.guardian.findUnique.mockResolvedValue({ consentStatus: 'pending' });

      const response = await request(app.getHttpServer())
        .post('/posts')
        .send({ contentText: 'Should not post' })
        .expect(403);

      expect(response.body.code).toBe('guardian_consent_pending');
      expect(feedService.createPost).not.toHaveBeenCalled();
    });

    it('rejects a missing contentText with 400', async () => {
      currentUser = ADULT;
      prisma.user.findUnique.mockResolvedValue({ isMinor: false });

      await request(app.getHttpServer()).post('/posts').send({}).expect(400);
      expect(feedService.createPost).not.toHaveBeenCalled();
    });

    it('rejects contentText over the max length with 400', async () => {
      currentUser = ADULT;
      prisma.user.findUnique.mockResolvedValue({ isMinor: false });

      await request(app.getHttpServer())
        .post('/posts')
        .send({ contentText: 'x'.repeat(3001) })
        .expect(400);
    });

    it('rejects a non-URL entry in mediaUrls with 400', async () => {
      currentUser = ADULT;
      prisma.user.findUnique.mockResolvedValue({ isMinor: false });

      await request(app.getHttpServer())
        .post('/posts')
        .send({ contentText: 'x', mediaUrls: ['not-a-url'] })
        .expect(400);
    });

    it('rejects an authorId supplied on the request body (whitelist enforcement — authorId only ever comes from the JWT)', async () => {
      currentUser = ADULT;
      prisma.user.findUnique.mockResolvedValue({ isMinor: false });

      await request(app.getHttpServer())
        .post('/posts')
        .send({ contentText: 'x', authorId: 'someone-else' })
        .expect(400);
      expect(feedService.createPost).not.toHaveBeenCalled();
    });

    it('maps a mutual-exclusivity BadRequestException from FeedService to 400', async () => {
      currentUser = ADULT;
      prisma.user.findUnique.mockResolvedValue({ isMinor: false });
      feedService.createPost.mockImplementation(() => {
        throw new BadRequestException('A post cannot belong to both a club page and a Banter Room');
      });

      await request(app.getHttpServer())
        .post('/posts')
        .send({ contentText: 'x', clubPageId: 'club-1', banterRoomId: 'room-1' })
        .expect(400);
    });
  });

  describe('GET /posts/feed', () => {
    it('succeeds for a minor with outstanding guardian consent — reading a feed is not gated by GuardianConsentGuard', async () => {
      currentUser = PENDING_MINOR;
      feedService.getFeed.mockResolvedValue({ items: [], nextCursor: null });

      await request(app.getHttpServer()).get('/posts/feed').expect(200);

      // GuardianConsentGuard is only wired on POST /posts — confirm this
      // request never even queried Guardian/User for a consent check.
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(prisma.guardian.findUnique).not.toHaveBeenCalled();
    });

    it('passes cursor and limit query params through to FeedService', async () => {
      currentUser = ADULT;
      feedService.getFeed.mockResolvedValue({ items: [], nextCursor: null });

      await request(app.getHttpServer()).get('/posts/feed?cursor=abc123&limit=5').expect(200);

      expect(feedService.getFeed).toHaveBeenCalledWith('adult-1', { cursor: 'abc123', limit: 5 });
    });

    it('rejects a limit above the max page size with 400', async () => {
      currentUser = ADULT;

      await request(app.getHttpServer()).get('/posts/feed?limit=999').expect(400);
      expect(feedService.getFeed).not.toHaveBeenCalled();
    });

    it('rejects a non-integer limit with 400', async () => {
      currentUser = ADULT;

      await request(app.getHttpServer()).get('/posts/feed?limit=abc').expect(400);
      expect(feedService.getFeed).not.toHaveBeenCalled();
    });

    it('returns the paginated shape (items + nextCursor) from FeedService untouched', async () => {
      currentUser = ADULT;
      feedService.getFeed.mockResolvedValue({
        items: [{ id: 'post-1' }],
        nextCursor: 'opaque-cursor-value',
      });

      const response = await request(app.getHttpServer()).get('/posts/feed').expect(200);

      expect(response.body).toEqual({ items: [{ id: 'post-1' }], nextCursor: 'opaque-cursor-value' });
    });
  });

  describe('GET /posts/:id', () => {
    it('returns the post (JwtAuthGuard only, GuardianConsentGuard never queried)', async () => {
      currentUser = PENDING_MINOR;
      feedService.getPostById.mockResolvedValue({ id: 'post-1', contentText: 'Hello' });

      const response = await request(app.getHttpServer()).get('/posts/post-1').expect(200);

      expect(response.body.id).toBe('post-1');
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('propagates a 404 from FeedService for a non-existent post', async () => {
      currentUser = ADULT;
      feedService.getPostById.mockRejectedValue(new NotFoundException('Post not found'));

      await request(app.getHttpServer()).get('/posts/does-not-exist').expect(404);
    });

    it('does not shadow GET /posts/feed (route-ordering regression check)', async () => {
      currentUser = ADULT;
      feedService.getFeed.mockResolvedValue({ items: [], nextCursor: null });

      await request(app.getHttpServer()).get('/posts/feed').expect(200);

      expect(feedService.getFeed).toHaveBeenCalled();
      expect(feedService.getPostById).not.toHaveBeenCalled();
    });
  });

  describe('POST/DELETE /posts/:id/like', () => {
    it('POST likes a post with 200 (not 201 — an idempotent toggle, not always a fresh creation), JwtAuthGuard only', async () => {
      currentUser = PENDING_MINOR;
      feedService.likePost.mockResolvedValue({ postId: 'post-1', liked: true, likeCount: 1 });

      const response = await request(app.getHttpServer()).post('/posts/post-1/like').expect(200);

      expect(response.body).toEqual({ postId: 'post-1', liked: true, likeCount: 1 });
      expect(feedService.likePost).toHaveBeenCalledWith('minor-1', 'post-1');
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('POST /like is idempotent on a double-like (still 200, FeedService owns the no-op)', async () => {
      currentUser = ADULT;
      feedService.likePost.mockResolvedValue({ postId: 'post-1', liked: true, likeCount: 1 });

      await request(app.getHttpServer()).post('/posts/post-1/like').expect(200);
      await request(app.getHttpServer()).post('/posts/post-1/like').expect(200);

      expect(feedService.likePost).toHaveBeenCalledTimes(2);
    });

    it('propagates a 404 from FeedService when postId does not reference a real post', async () => {
      currentUser = ADULT;
      feedService.likePost.mockRejectedValue(new NotFoundException('Post not found'));

      await request(app.getHttpServer()).post('/posts/missing/like').expect(404);
    });

    it('DELETE unlikes a post, JwtAuthGuard only', async () => {
      currentUser = ADULT;
      feedService.unlikePost.mockResolvedValue({ postId: 'post-1', liked: false, likeCount: 0 });

      const response = await request(app.getHttpServer()).delete('/posts/post-1/like').expect(200);

      expect(response.body).toEqual({ postId: 'post-1', liked: false, likeCount: 0 });
      expect(feedService.unlikePost).toHaveBeenCalledWith('adult-1', 'post-1');
    });

    it('DELETE /like is idempotent on unlike-when-not-liked (still 200, not 404)', async () => {
      currentUser = ADULT;
      feedService.unlikePost.mockResolvedValue({ postId: 'post-1', liked: false, likeCount: 0 });

      await request(app.getHttpServer()).delete('/posts/post-1/like').expect(200);

      expect(feedService.unlikePost).toHaveBeenCalled();
    });
  });

  describe('POST/GET /posts/:id/comments', () => {
    it('POST creates a comment, gated by JwtAuthGuard AND GuardianConsentGuard (unlike liking)', async () => {
      currentUser = ADULT;
      prisma.user.findUnique.mockResolvedValue({ isMinor: false });
      feedService.addComment.mockResolvedValue({ id: 'comment-1', contentText: 'Nice goal' });

      const response = await request(app.getHttpServer())
        .post('/posts/post-1/comments')
        .send({ contentText: 'Nice goal' })
        .expect(201);

      expect(response.body.id).toBe('comment-1');
      expect(feedService.addComment).toHaveBeenCalledWith('post-1', 'adult-1', { contentText: 'Nice goal' });
    });

    it('blocks a minor with outstanding guardian consent from commenting, 403 guardian_consent_pending, never reaching FeedService', async () => {
      currentUser = PENDING_MINOR;
      prisma.user.findUnique.mockResolvedValue({ isMinor: true });
      prisma.guardian.findUnique.mockResolvedValue({ consentStatus: 'pending' });

      const response = await request(app.getHttpServer())
        .post('/posts/post-1/comments')
        .send({ contentText: 'Should not post' })
        .expect(403);

      expect(response.body.code).toBe('guardian_consent_pending');
      expect(feedService.addComment).not.toHaveBeenCalled();
    });

    it('rejects a missing contentText with 400', async () => {
      currentUser = ADULT;
      prisma.user.findUnique.mockResolvedValue({ isMinor: false });

      await request(app.getHttpServer()).post('/posts/post-1/comments').send({}).expect(400);
      expect(feedService.addComment).not.toHaveBeenCalled();
    });

    it('rejects contentText over the max length with 400', async () => {
      currentUser = ADULT;
      prisma.user.findUnique.mockResolvedValue({ isMinor: false });

      await request(app.getHttpServer())
        .post('/posts/post-1/comments')
        .send({ contentText: 'x'.repeat(3001) })
        .expect(400);
    });

    it('rejects an authorId supplied on the request body (whitelist enforcement)', async () => {
      currentUser = ADULT;
      prisma.user.findUnique.mockResolvedValue({ isMinor: false });

      await request(app.getHttpServer())
        .post('/posts/post-1/comments')
        .send({ contentText: 'x', authorId: 'someone-else' })
        .expect(400);
      expect(feedService.addComment).not.toHaveBeenCalled();
    });

    it('propagates a 404 from FeedService when postId does not reference a real post', async () => {
      currentUser = ADULT;
      prisma.user.findUnique.mockResolvedValue({ isMinor: false });
      feedService.addComment.mockRejectedValue(new NotFoundException('Post not found'));

      await request(app.getHttpServer())
        .post('/posts/missing/comments')
        .send({ contentText: 'x' })
        .expect(404);
    });

    it('GET lists comments, JwtAuthGuard only (reading is not posting)', async () => {
      currentUser = PENDING_MINOR;
      feedService.getComments.mockResolvedValue({ items: [{ id: 'comment-1' }], nextCursor: null });

      const response = await request(app.getHttpServer()).get('/posts/post-1/comments').expect(200);

      expect(response.body).toEqual({ items: [{ id: 'comment-1' }], nextCursor: null });
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('GET passes cursor/limit query params through, same as GET /posts/feed', async () => {
      currentUser = ADULT;
      feedService.getComments.mockResolvedValue({ items: [], nextCursor: null });

      await request(app.getHttpServer()).get('/posts/post-1/comments?cursor=abc&limit=5').expect(200);

      expect(feedService.getComments).toHaveBeenCalledWith('post-1', { cursor: 'abc', limit: 5 });
    });

    it('GET propagates a 404 from FeedService when postId does not reference a real post', async () => {
      currentUser = ADULT;
      feedService.getComments.mockRejectedValue(new NotFoundException('Post not found'));

      await request(app.getHttpServer()).get('/posts/missing/comments').expect(404);
    });
  });

  describe('DELETE /posts/:id/comments/:commentId', () => {
    it('deletes a comment with 204 (no body), JwtAuthGuard only — GuardianConsentGuard never queried', async () => {
      currentUser = PENDING_MINOR;
      feedService.deleteComment.mockResolvedValue(undefined);

      const response = await request(app.getHttpServer())
        .delete('/posts/post-1/comments/comment-1')
        .expect(204);

      expect(response.body).toEqual({});
      expect(feedService.deleteComment).toHaveBeenCalledWith('post-1', 'comment-1', 'minor-1');
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('propagates a 404 from FeedService when commentId does not reference a real comment', async () => {
      currentUser = ADULT;
      feedService.deleteComment.mockRejectedValue(new NotFoundException('Comment not found'));

      await request(app.getHttpServer()).delete('/posts/post-1/comments/missing').expect(404);
    });

    it('propagates a 404 from FeedService when the comment exists but belongs to a different post than the URL', async () => {
      currentUser = ADULT;
      feedService.deleteComment.mockRejectedValue(new NotFoundException('Comment not found'));

      await request(app.getHttpServer()).delete('/posts/wrong-post/comments/comment-1').expect(404);
    });

    it('propagates a 403 from FeedService when the requester is neither the comment author nor the post author', async () => {
      currentUser = ADULT;
      feedService.deleteComment.mockRejectedValue(
        new ForbiddenException('You may only delete your own comments, or comments on your own post'),
      );

      await request(app.getHttpServer()).delete('/posts/post-1/comments/comment-1').expect(403);
    });

    it('is NOT idempotent at the HTTP layer either — a second delete call surfaces FeedService\'s 404, not a synthesized 204', async () => {
      currentUser = ADULT;
      feedService.deleteComment
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new NotFoundException('Comment not found'));

      await request(app.getHttpServer()).delete('/posts/post-1/comments/comment-1').expect(204);
      await request(app.getHttpServer()).delete('/posts/post-1/comments/comment-1').expect(404);

      expect(feedService.deleteComment).toHaveBeenCalledTimes(2);
    });
  });

  describe('POST/DELETE /posts/:id/save', () => {
    it('POST saves a post with 200, JwtAuthGuard only', async () => {
      currentUser = PENDING_MINOR;
      feedService.savePost.mockResolvedValue({ postId: 'post-1', saved: true });

      const response = await request(app.getHttpServer()).post('/posts/post-1/save').expect(200);

      expect(response.body).toEqual({ postId: 'post-1', saved: true });
      expect(feedService.savePost).toHaveBeenCalledWith('minor-1', 'post-1');
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('POST /save is idempotent on a double-save (still 200)', async () => {
      currentUser = ADULT;
      feedService.savePost.mockResolvedValue({ postId: 'post-1', saved: true });

      await request(app.getHttpServer()).post('/posts/post-1/save').expect(200);
      await request(app.getHttpServer()).post('/posts/post-1/save').expect(200);

      expect(feedService.savePost).toHaveBeenCalledTimes(2);
    });

    it('propagates a 404 from FeedService when postId does not reference a real post', async () => {
      currentUser = ADULT;
      feedService.savePost.mockRejectedValue(new NotFoundException('Post not found'));

      await request(app.getHttpServer()).post('/posts/missing/save').expect(404);
    });

    it('DELETE unsaves a post, JwtAuthGuard only', async () => {
      currentUser = ADULT;
      feedService.unsavePost.mockResolvedValue({ postId: 'post-1', saved: false });

      const response = await request(app.getHttpServer()).delete('/posts/post-1/save').expect(200);

      expect(response.body).toEqual({ postId: 'post-1', saved: false });
      expect(feedService.unsavePost).toHaveBeenCalledWith('adult-1', 'post-1');
    });

    it('DELETE /save is idempotent on unsave-when-not-saved (still 200, not 404)', async () => {
      currentUser = ADULT;
      feedService.unsavePost.mockResolvedValue({ postId: 'post-1', saved: false });

      await request(app.getHttpServer()).delete('/posts/post-1/save').expect(200);

      expect(feedService.unsavePost).toHaveBeenCalled();
    });
  });
});
