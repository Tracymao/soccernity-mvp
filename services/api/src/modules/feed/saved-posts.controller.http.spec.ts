import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FeedService } from './feed.service';
import { SavedPostsController } from './saved-posts.controller';

// GET /users/:id/saved-posts (Build Plan Section 4.3), self-scoped only
// per the conservative-default judgment call documented on
// saved-posts.controller.ts and feed/README.md. JwtAuthGuard only — no
// GuardianConsentGuard involved on this route at all (reading one's own
// saved posts isn't a safety-sensitive action any more than reading
// one's own feed is), so unlike feed.controller.http.spec.ts there's no
// real GuardianConsentGuard to leave wired here.
describe('SavedPostsController (HTTP layer)', () => {
  let app: INestApplication;
  const feedService = { getSavedPosts: jest.fn() };

  const SELF = { sub: 'user-1', role: 'fan' };
  let currentUser: { sub: string; role: string } = SELF;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SavedPostsController],
      providers: [{ provide: FeedService, useValue: feedService }],
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
    currentUser = SELF;
  });

  it("returns the caller's own saved posts when :id matches the token", async () => {
    currentUser = SELF;
    feedService.getSavedPosts.mockResolvedValue({ items: [{ postId: 'post-1' }], nextCursor: null });

    const response = await request(app.getHttpServer()).get('/users/user-1/saved-posts').expect(200);

    expect(response.body).toEqual({ items: [{ postId: 'post-1' }], nextCursor: null });
    expect(feedService.getSavedPosts).toHaveBeenCalledWith('user-1', {});
  });

  it('rejects with 403 when :id does not match the caller (conservative self-only default)', async () => {
    currentUser = SELF;

    await request(app.getHttpServer()).get('/users/someone-else/saved-posts').expect(403);
    expect(feedService.getSavedPosts).not.toHaveBeenCalled();
  });

  it('passes cursor/limit query params through, same pagination pattern as everywhere else', async () => {
    currentUser = SELF;
    feedService.getSavedPosts.mockResolvedValue({ items: [], nextCursor: null });

    await request(app.getHttpServer()).get('/users/user-1/saved-posts?cursor=abc&limit=5').expect(200);

    expect(feedService.getSavedPosts).toHaveBeenCalledWith('user-1', { cursor: 'abc', limit: 5 });
  });

  it('rejects a limit above the max page size with 400', async () => {
    currentUser = SELF;

    await request(app.getHttpServer()).get('/users/user-1/saved-posts?limit=999').expect(400);
    expect(feedService.getSavedPosts).not.toHaveBeenCalled();
  });
});
