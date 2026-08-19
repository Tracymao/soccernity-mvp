import { BadRequestException, ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
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
});
