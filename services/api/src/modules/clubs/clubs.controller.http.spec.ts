import { ExecutionContext, INestApplication, NotFoundException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { FeedService } from '../feed/feed.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClubsController } from './clubs.controller';
import { ClubsService } from './clubs.service';

// Exercises the real HTTP layer: routing, DTO validation, and guard
// wiring — following feed.controller.http.spec.ts's own precedent.
// JwtAuthGuard is overridden (bypassing real token verification, same
// pattern as elsewhere) since token signature/expiry isn't this suite's
// concern.
describe('ClubsController (HTTP layer)', () => {
  let app: INestApplication;
  const clubsService = {
    listClubs: jest.fn(),
    getClubById: jest.fn(),
    getClubMembers: jest.fn(),
    assertClubExists: jest.fn(),
    joinClub: jest.fn(),
    leaveClub: jest.fn(),
  };
  const feedService = {
    getClubFeed: jest.fn(),
  };

  const CALLER = { sub: 'user-1', role: 'fan' };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ClubsController],
      providers: [
        { provide: ClubsService, useValue: clubsService },
        { provide: FeedService, useValue: feedService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          req.user = CALLER;
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
  });

  describe('GET /clubs', () => {
    it('requires authentication (JwtAuthGuard wired)', async () => {
      clubsService.listClubs.mockResolvedValue({ items: [], nextCursor: null });

      await request(app.getHttpServer()).get('/clubs').expect(200);
      expect(clubsService.listClubs).toHaveBeenCalled();
    });

    it('passes cursor/limit/league/country query params through to ClubsService', async () => {
      clubsService.listClubs.mockResolvedValue({ items: [], nextCursor: null });

      await request(app.getHttpServer())
        .get('/clubs?cursor=abc123&limit=5&league=Sunday+League&country=England')
        .expect(200);

      expect(clubsService.listClubs).toHaveBeenCalledWith(
        {
          cursor: 'abc123',
          limit: 5,
          league: 'Sunday League',
          country: 'England',
        },
        // @CurrentUser() is now injected so the service can compute the
        // per-caller `joined` flag (Decision Log #154).
        CALLER.sub,
      );
    });

    it('rejects a limit above the max page size with 400', async () => {
      await request(app.getHttpServer()).get('/clubs?limit=999').expect(400);
      expect(clubsService.listClubs).not.toHaveBeenCalled();
    });

    it('rejects a non-integer limit with 400', async () => {
      await request(app.getHttpServer()).get('/clubs?limit=abc').expect(400);
      expect(clubsService.listClubs).not.toHaveBeenCalled();
    });

    it('returns the paginated shape (items + nextCursor) from ClubsService untouched', async () => {
      clubsService.listClubs.mockResolvedValue({
        items: [{ id: 'club-1', name: 'Alpha FC', league: null, country: null, logoUrl: null, memberCount: 3 }],
        nextCursor: 'opaque-cursor-value',
      });

      const response = await request(app.getHttpServer()).get('/clubs').expect(200);

      expect(response.body.nextCursor).toBe('opaque-cursor-value');
      expect(response.body.items[0]).not.toHaveProperty('members');
    });
  });

  describe('GET /clubs/:id', () => {
    it('returns the club (JwtAuthGuard only)', async () => {
      clubsService.getClubById.mockResolvedValue({
        id: 'club-1',
        name: 'Alpha FC',
        league: 'Sunday League',
        country: 'England',
        logoUrl: null,
        memberCount: 3,
      });

      const response = await request(app.getHttpServer()).get('/clubs/club-1').expect(200);
      expect(response.body.id).toBe('club-1');
      expect(response.body).not.toHaveProperty('members');
      // @CurrentUser() passed through (Decision Log #154).
      expect(clubsService.getClubById).toHaveBeenCalledWith('club-1', CALLER.sub);
    });

    it('propagates a 404 from ClubsService for a non-existent club', async () => {
      clubsService.getClubById.mockRejectedValue(new NotFoundException('Club not found'));

      await request(app.getHttpServer()).get('/clubs/does-not-exist').expect(404);
    });

    it('does not shadow the POST /clubs/:id/join route (route-ordering regression check)', async () => {
      clubsService.joinClub.mockResolvedValue({ clubId: 'club-1', joined: true, memberCount: 1 });

      await request(app.getHttpServer()).post('/clubs/club-1/join').expect(200);

      expect(clubsService.joinClub).toHaveBeenCalledWith('user-1', 'club-1');
      expect(clubsService.getClubById).not.toHaveBeenCalled();
    });
  });

  describe('GET /clubs/:id/feed', () => {
    it('asserts the club exists, then delegates to FeedService.getClubFeed with the caller id + query', async () => {
      clubsService.assertClubExists.mockResolvedValue(undefined);
      feedService.getClubFeed.mockResolvedValue({ items: [], nextCursor: null });

      await request(app.getHttpServer()).get('/clubs/club-1/feed?limit=5&cursor=abc').expect(200);

      expect(clubsService.assertClubExists).toHaveBeenCalledWith('club-1');
      expect(feedService.getClubFeed).toHaveBeenCalledWith('club-1', CALLER.sub, { limit: 5, cursor: 'abc' });
    });

    it('propagates a 404 from assertClubExists and never calls FeedService', async () => {
      clubsService.assertClubExists.mockRejectedValue(new NotFoundException('Club not found'));

      await request(app.getHttpServer()).get('/clubs/missing/feed').expect(404);
      expect(feedService.getClubFeed).not.toHaveBeenCalled();
    });

    it('rejects a limit above the max page size with 400 before any service call', async () => {
      await request(app.getHttpServer()).get('/clubs/club-1/feed?limit=999').expect(400);
      expect(clubsService.assertClubExists).not.toHaveBeenCalled();
      expect(feedService.getClubFeed).not.toHaveBeenCalled();
    });

    it('does not collide with GET /clubs/:id (the club-1 detail route)', async () => {
      clubsService.assertClubExists.mockResolvedValue(undefined);
      feedService.getClubFeed.mockResolvedValue({ items: [], nextCursor: null });

      await request(app.getHttpServer()).get('/clubs/club-1/feed').expect(200);
      expect(clubsService.getClubById).not.toHaveBeenCalled();
    });
  });

  describe('GET /clubs/:id/members', () => {
    it('delegates to ClubsService.getClubMembers with the id + query (no @CurrentUser)', async () => {
      clubsService.getClubMembers.mockResolvedValue({ items: [], nextCursor: null });

      await request(app.getHttpServer()).get('/clubs/club-1/members?limit=3').expect(200);

      expect(clubsService.getClubMembers).toHaveBeenCalledWith('club-1', { limit: 3 });
    });

    it('propagates a 404 from ClubsService for a non-existent club', async () => {
      clubsService.getClubMembers.mockRejectedValue(new NotFoundException('Club not found'));

      await request(app.getHttpServer()).get('/clubs/missing/members').expect(404);
    });

    it('rejects a non-integer limit with 400', async () => {
      await request(app.getHttpServer()).get('/clubs/club-1/members?limit=abc').expect(400);
      expect(clubsService.getClubMembers).not.toHaveBeenCalled();
    });
  });

  describe('POST /clubs/:id/join', () => {
    it('joins a club with 200 (not 201 — an idempotent action, not always a fresh join), JwtAuthGuard only', async () => {
      clubsService.joinClub.mockResolvedValue({ clubId: 'club-1', joined: true, memberCount: 1 });

      const response = await request(app.getHttpServer()).post('/clubs/club-1/join').expect(200);

      expect(response.body).toEqual({ clubId: 'club-1', joined: true, memberCount: 1 });
      expect(clubsService.joinClub).toHaveBeenCalledWith('user-1', 'club-1');
    });

    it('is idempotent on a double-join (still 200, ClubsService owns the no-op)', async () => {
      clubsService.joinClub.mockResolvedValue({ clubId: 'club-1', joined: true, memberCount: 1 });

      await request(app.getHttpServer()).post('/clubs/club-1/join').expect(200);
      await request(app.getHttpServer()).post('/clubs/club-1/join').expect(200);

      expect(clubsService.joinClub).toHaveBeenCalledTimes(2);
    });

    it('propagates a 404 from ClubsService when :id does not reference a real club', async () => {
      clubsService.joinClub.mockRejectedValue(new NotFoundException('Club not found'));

      await request(app.getHttpServer()).post('/clubs/missing/join').expect(404);
    });
  });

  describe('DELETE /clubs/:id/join', () => {
    it('leaves a club with 200 (not 204 — same idempotent-toggle reasoning as POST :id/join), JwtAuthGuard only', async () => {
      clubsService.leaveClub.mockResolvedValue({ clubId: 'club-1', joined: false, memberCount: 0 });

      const response = await request(app.getHttpServer()).delete('/clubs/club-1/join').expect(200);

      expect(response.body).toEqual({ clubId: 'club-1', joined: false, memberCount: 0 });
      expect(clubsService.leaveClub).toHaveBeenCalledWith('user-1', 'club-1');
    });

    it('is idempotent on a double-leave (still 200, ClubsService owns the no-op)', async () => {
      clubsService.leaveClub.mockResolvedValue({ clubId: 'club-1', joined: false, memberCount: 0 });

      await request(app.getHttpServer()).delete('/clubs/club-1/join').expect(200);
      await request(app.getHttpServer()).delete('/clubs/club-1/join').expect(200);

      expect(clubsService.leaveClub).toHaveBeenCalledTimes(2);
    });

    it('propagates a 404 from ClubsService when :id does not reference a real club', async () => {
      clubsService.leaveClub.mockRejectedValue(new NotFoundException('Club not found'));

      await request(app.getHttpServer()).delete('/clubs/missing/join').expect(404);
    });
  });
});
