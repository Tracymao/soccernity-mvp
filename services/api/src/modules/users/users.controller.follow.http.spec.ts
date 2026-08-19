import { BadRequestException, ExecutionContext, INestApplication, NotFoundException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

// HTTP-layer coverage for the four follow/follower endpoints added by
// sprint-2/follow-and-notifications — see users.controller.http.spec.ts
// for the sibling suite covering GET/PATCH /users/:id's guardian-consent
// guard exclusion (a separate, older regression concern this file
// doesn't duplicate). JwtAuthGuard is overridden here (bypassing real
// token verification), same pattern as every other controller HTTP spec
// in this codebase — these routes only ever apply JwtAuthGuard (no
// GuardianConsentGuard, see users/README.md), so there's no
// real-guard-wiring regression to prove the way feed.controller.http.spec.ts
// proves GuardianConsentGuard's placement.
describe('UsersController (HTTP layer) — follow/follower routes', () => {
  let app: INestApplication;
  const usersService = {
    getOwnProfile: jest.fn(),
    updateOwnProfile: jest.fn(),
    followUser: jest.fn(),
    unfollowUser: jest.fn(),
    getFollowers: jest.fn(),
    getFollowing: jest.fn(),
  };

  const CALLER = { sub: 'caller-1', role: 'fan' };

  let currentUser: { sub: string; role: string } = CALLER;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: usersService }],
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
    currentUser = CALLER;
  });

  describe('POST/DELETE /users/:id/follow', () => {
    it('POST follows with 200 (not 201 — an idempotent toggle, not always a fresh creation)', async () => {
      usersService.followUser.mockResolvedValue({ following: true });

      const response = await request(app.getHttpServer()).post('/users/target-1/follow').expect(200);

      expect(response.body).toEqual({ following: true });
      expect(usersService.followUser).toHaveBeenCalledWith('caller-1', 'target-1');
    });

    it('POST /follow is idempotent on a double-follow (still 200, UsersService owns the no-op)', async () => {
      usersService.followUser.mockResolvedValue({ following: true });

      await request(app.getHttpServer()).post('/users/target-1/follow').expect(200);
      await request(app.getHttpServer()).post('/users/target-1/follow').expect(200);

      expect(usersService.followUser).toHaveBeenCalledTimes(2);
    });

    it('propagates a 400 from UsersService for a self-follow attempt', async () => {
      currentUser = { sub: 'user-1', role: 'fan' };
      usersService.followUser.mockRejectedValue(new BadRequestException('You cannot follow yourself'));

      await request(app.getHttpServer()).post('/users/user-1/follow').expect(400);
    });

    it('propagates a 404 from UsersService when :id does not reference a real user', async () => {
      usersService.followUser.mockRejectedValue(new NotFoundException('User not found'));

      await request(app.getHttpServer()).post('/users/ghost/follow').expect(404);
    });

    it('DELETE unfollows, JwtAuthGuard only', async () => {
      usersService.unfollowUser.mockResolvedValue({ following: false });

      const response = await request(app.getHttpServer()).delete('/users/target-1/follow').expect(200);

      expect(response.body).toEqual({ following: false });
      expect(usersService.unfollowUser).toHaveBeenCalledWith('caller-1', 'target-1');
    });

    it('DELETE /follow is idempotent on unfollow-when-not-following (still 200, not 404)', async () => {
      usersService.unfollowUser.mockResolvedValue({ following: false });

      await request(app.getHttpServer()).delete('/users/target-1/follow').expect(200);

      expect(usersService.unfollowUser).toHaveBeenCalled();
    });

    it('propagates a 400 from UsersService for a self-unfollow attempt', async () => {
      currentUser = { sub: 'user-1', role: 'fan' };
      usersService.unfollowUser.mockRejectedValue(new BadRequestException('You cannot unfollow yourself'));

      await request(app.getHttpServer()).delete('/users/user-1/follow').expect(400);
    });
  });

  describe('GET /users/:id/followers, GET /users/:id/following', () => {
    it('GET /followers succeeds for :id that is NOT the caller — not self-scoped', async () => {
      usersService.getFollowers.mockResolvedValue({ items: [{ id: 'follower-1', displayName: 'A Follower' }], nextCursor: null });

      const response = await request(app.getHttpServer()).get('/users/someone-else/followers').expect(200);

      expect(response.body).toEqual({ items: [{ id: 'follower-1', displayName: 'A Follower' }], nextCursor: null });
      expect(usersService.getFollowers).toHaveBeenCalledWith('someone-else', {});
    });

    it('GET /followers passes cursor and limit query params through', async () => {
      usersService.getFollowers.mockResolvedValue({ items: [], nextCursor: null });

      await request(app.getHttpServer()).get('/users/someone-else/followers?cursor=abc123&limit=5').expect(200);

      expect(usersService.getFollowers).toHaveBeenCalledWith('someone-else', { cursor: 'abc123', limit: 5 });
    });

    it('GET /followers rejects a limit above the max page size with 400', async () => {
      await request(app.getHttpServer()).get('/users/someone-else/followers?limit=999').expect(400);
      expect(usersService.getFollowers).not.toHaveBeenCalled();
    });

    it('GET /followers propagates a 404 from UsersService when :id does not reference a real user', async () => {
      usersService.getFollowers.mockRejectedValue(new NotFoundException('User not found'));

      await request(app.getHttpServer()).get('/users/ghost/followers').expect(404);
    });

    it('GET /following succeeds for :id that is NOT the caller — not self-scoped', async () => {
      usersService.getFollowing.mockResolvedValue({ items: [{ id: 'followee-1', displayName: 'A Followee' }], nextCursor: null });

      const response = await request(app.getHttpServer()).get('/users/someone-else/following').expect(200);

      expect(response.body).toEqual({ items: [{ id: 'followee-1', displayName: 'A Followee' }], nextCursor: null });
      expect(usersService.getFollowing).toHaveBeenCalledWith('someone-else', {});
    });

    it('GET /following propagates a 404 from UsersService when :id does not reference a real user', async () => {
      usersService.getFollowing.mockRejectedValue(new NotFoundException('User not found'));

      await request(app.getHttpServer()).get('/users/ghost/following').expect(404);
    });
  });
});
