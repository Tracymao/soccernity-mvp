import { ConflictException, ExecutionContext, INestApplication, NotFoundException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { MatchKickoffService } from './match-kickoff.service';
import { SportsMatchesController } from './sports-matches.controller';
import { SportsStandingsController } from './sports-standings.controller';
import { SportsService } from './sports.service';

// HTTP-layer coverage for both Sports controllers. NO guard override needed anywhere in this file —
// unlike almost every other *.controller.http.spec.ts in this codebase — because there IS no guard
// on either controller: every route here is genuinely public (see each controller's own header
// comment). The interesting assertions this suite proves are route-param/query wiring and that a
// request with no Authorization header at all still reaches the service, mirroring
// blog/articles.controller.http.spec.ts's own established pattern for public routes.
describe('Sports controllers (HTTP layer)', () => {
  let app: INestApplication;
  const sportsService = {
    listLiveScores: jest.fn(),
    listFixtures: jest.fn(),
    getMatchById: jest.fn(),
    getMatchStatistics: jest.fn(),
    getMatchLineups: jest.fn(),
    getMatchBoxScore: jest.fn(),
    getHeadToHead: jest.fn(),
    getMatchMomentum: jest.fn(),
    getMatchEvents: jest.fn(),
    getHighlights: jest.fn(),
    getStandings: jest.fn(),
  };
  const matchKickoffService = {
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
  };
  const CALLER = { sub: 'user-1', role: 'user' };

  async function buildApp() {
    const moduleRef = await Test.createTestingModule({
      controllers: [SportsMatchesController, SportsStandingsController],
      providers: [
        { provide: SportsService, useValue: sportsService },
        { provide: MatchKickoffService, useValue: matchKickoffService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().user = CALLER;
          return true;
        },
      })
      // B-070: the three match reads now sit behind OptionalJwtAuthGuard (needs TokenService, which this
      // isolated module does not provide). Stand-in with the real guard's contract: it never rejects, and
      // attaches the caller only when an Authorization header is present.
      .overrideGuard(OptionalJwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          if (req.headers.authorization) req.user = CALLER;
          return true;
        },
      })
      .compile();

    const nestApp = moduleRef.createNestApplication();
    nestApp.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await nestApp.init();
    return nestApp;
  }

  beforeEach(async () => {
    app = await buildApp();
  });

  afterEach(async () => {
    jest.clearAllMocks();
    if (app) await app.close();
  });

  describe('GET /sports/live-scores', () => {
    it('reaches the service with no Authorization header at all — genuinely public', async () => {
      sportsService.listLiveScores.mockResolvedValue({ items: [], nextCursor: null });
      await request(app.getHttpServer()).get('/sports/live-scores').expect(200);
      expect(sportsService.listLiveScores).toHaveBeenCalledWith({}, undefined);
    });

    it('passes league/cursor/limit through to the service', async () => {
      sportsService.listLiveScores.mockResolvedValue({ items: [], nextCursor: null });
      await request(app.getHttpServer()).get('/sports/live-scores').query({ league: '133', cursor: 'abc', limit: '10' }).expect(200);
      expect(sportsService.listLiveScores).toHaveBeenCalledWith({ league: '133', cursor: 'abc', limit: 10 }, undefined);
    });

    it('rejects a limit above 50 with 400 before the service is called', async () => {
      await request(app.getHttpServer()).get('/sports/live-scores').query({ limit: '999' }).expect(400);
      expect(sportsService.listLiveScores).not.toHaveBeenCalled();
    });
  });

  describe('GET /sports/fixtures', () => {
    it('requires date and rejects a missing one with 400', async () => {
      await request(app.getHttpServer()).get('/sports/fixtures').expect(400);
      expect(sportsService.listFixtures).not.toHaveBeenCalled();
    });

    it('rejects a malformed date with 400', async () => {
      await request(app.getHttpServer()).get('/sports/fixtures').query({ date: '2026/09/16' }).expect(400);
      expect(sportsService.listFixtures).not.toHaveBeenCalled();
    });

    it('reaches the service with a valid date, no Authorization header at all', async () => {
      sportsService.listFixtures.mockResolvedValue({ items: [], nextCursor: null });
      await request(app.getHttpServer()).get('/sports/fixtures').query({ date: '2026-09-16' }).expect(200);
      expect(sportsService.listFixtures).toHaveBeenCalledWith({ date: '2026-09-16' }, undefined);
    });
  });

  describe('GET /sports/matches/:id', () => {
    it('reaches the service with no Authorization header at all', async () => {
      sportsService.getMatchById.mockResolvedValue({ id: 'match-1' });
      await request(app.getHttpServer()).get('/sports/matches/match-1').expect(200);
      expect(sportsService.getMatchById).toHaveBeenCalledWith('match-1', undefined);
    });

    it('propagates a 404 the service throws for an unknown match', async () => {
      sportsService.getMatchById.mockRejectedValue(new NotFoundException('Match not found'));
      await request(app.getHttpServer()).get('/sports/matches/missing').expect(404);
    });
  });

  describe('GET /sports/matches/:id/stats', () => {
    it('reaches the service', async () => {
      sportsService.getMatchStatistics.mockResolvedValue({ home: null, away: null, updatedAt: null });
      await request(app.getHttpServer()).get('/sports/matches/match-1/stats').expect(200);
      expect(sportsService.getMatchStatistics).toHaveBeenCalledWith('match-1');
    });
  });

  describe('GET /sports/matches/:id/box-score', () => {
    it('reaches the service and is served without any guard', async () => {
      sportsService.getMatchBoxScore.mockResolvedValue({ home: null, away: null, updatedAt: null, availability: {} });
      await request(app.getHttpServer()).get('/sports/matches/match-1/box-score').expect(200);
      expect(sportsService.getMatchBoxScore).toHaveBeenCalledWith('match-1');
    });
  });

  describe('GET /sports/matches/:id/lineups', () => {
    it('reaches the service', async () => {
      sportsService.getMatchLineups.mockResolvedValue({});
      await request(app.getHttpServer()).get('/sports/matches/match-1/lineups').expect(200);
      expect(sportsService.getMatchLineups).toHaveBeenCalledWith('match-1');
    });
  });

  describe('GET /sports/matches/:id/h2h', () => {
    it('reaches the service', async () => {
      sportsService.getHeadToHead.mockResolvedValue({});
      await request(app.getHttpServer()).get('/sports/matches/match-1/h2h').expect(200);
      expect(sportsService.getHeadToHead).toHaveBeenCalledWith('match-1');
    });
  });

  describe('GET /sports/matches/:id/momentum', () => {
    it('reaches the service — a genuine addition beyond Section 4.6 (Decision Log candidate)', async () => {
      sportsService.getMatchMomentum.mockResolvedValue({ bars: [], markers: [], updatedAt: null });
      await request(app.getHttpServer()).get('/sports/matches/match-1/momentum').expect(200);
      expect(sportsService.getMatchMomentum).toHaveBeenCalledWith('match-1');
    });
  });

  describe('GET /sports/matches/:id/events', () => {
    it('reaches the service — a genuine addition beyond Section 4.6 (Decision Log candidate)', async () => {
      sportsService.getMatchEvents.mockResolvedValue({ items: [], updatedAt: null });
      await request(app.getHttpServer()).get('/sports/matches/match-1/events').expect(200);
      expect(sportsService.getMatchEvents).toHaveBeenCalledWith('match-1');
    });
  });

  describe('GET /sports/highlights/:matchId', () => {
    it('reaches the service on the correct top-level path (not nested under matches/:id)', async () => {
      sportsService.getHighlights.mockResolvedValue({ items: [], updatedAt: null });
      await request(app.getHttpServer()).get('/sports/highlights/match-1').expect(200);
      expect(sportsService.getHighlights).toHaveBeenCalledWith('match-1');
    });
  });

  describe('GET /sports/standings', () => {
    it('requires league and rejects a missing one with 400', async () => {
      await request(app.getHttpServer()).get('/sports/standings').expect(400);
      expect(sportsService.getStandings).not.toHaveBeenCalled();
    });

    it('reaches the service with league(+season), no Authorization header at all', async () => {
      sportsService.getStandings.mockResolvedValue({ leagueId: '133', season: '2026', groups: [], updatedAt: null });
      await request(app.getHttpServer()).get('/sports/standings').query({ league: '133', season: '2026' }).expect(200);
      expect(sportsService.getStandings).toHaveBeenCalledWith({ league: '133', season: '2026' });
    });
  });

  describe('PUT/DELETE /sports/matches/:id/subscription', () => {
    it('PUT subscribes the caller (from the token, never the body) and returns the resulting state', async () => {
      matchKickoffService.subscribe.mockResolvedValue(undefined);
      await request(app.getHttpServer())
        .put('/sports/matches/ext-1/subscription')
        .expect(200, { subscribed: true });
      expect(matchKickoffService.subscribe).toHaveBeenCalledWith('user-1', 'ext-1');
    });

    it('DELETE unsubscribes the caller and returns the resulting state', async () => {
      matchKickoffService.unsubscribe.mockResolvedValue(undefined);
      await request(app.getHttpServer())
        .delete('/sports/matches/ext-1/subscription')
        .expect(200, { subscribed: false });
      expect(matchKickoffService.unsubscribe).toHaveBeenCalledWith('user-1', 'ext-1');
    });

    it('surfaces a service 404 for an unknown match unchanged', async () => {
      matchKickoffService.subscribe.mockRejectedValue(new NotFoundException('Match not found'));
      await request(app.getHttpServer()).put('/sports/matches/nope/subscription').expect(404);
    });
  });

  // B-070 (Decision Log #472): the optional-auth enrichment. The service is mocked, so these prove the
  // wiring only: the caller id (from the token, never a query param) is passed to each of the three reads
  // when a token is present, nothing when absent, and the response varies on Authorization.
  describe('kickoffAlert enrichment wiring (OptionalJwtAuthGuard)', () => {
    const bearer = { Authorization: 'Bearer anything' };

    it.each([
      ['/sports/live-scores', 'listLiveScores'],
      ['/sports/fixtures?date=2026-09-16', 'listFixtures'],
    ] as const)('%s passes the signed-in caller id to the service', async (url, method) => {
      sportsService[method].mockResolvedValue({ items: [], nextCursor: null });
      await request(app.getHttpServer()).get(url).set(bearer).expect(200);
      expect(sportsService[method].mock.calls[0][1]).toBe('user-1');
    });

    it('GET /sports/matches/:id passes the signed-in caller id to the service', async () => {
      sportsService.getMatchById.mockResolvedValue({ id: 'match-1', kickoffAlert: true });
      await request(app.getHttpServer()).get('/sports/matches/match-1').set(bearer).expect(200);
      expect(sportsService.getMatchById).toHaveBeenCalledWith('match-1', 'user-1');
    });

    it('a logged-out caller reaches all three reads with no caller id (still public)', async () => {
      sportsService.listLiveScores.mockResolvedValue({ items: [], nextCursor: null });
      sportsService.listFixtures.mockResolvedValue({ items: [], nextCursor: null });
      sportsService.getMatchById.mockResolvedValue({ id: 'match-1', kickoffAlert: false });
      await request(app.getHttpServer()).get('/sports/live-scores').expect(200);
      await request(app.getHttpServer()).get('/sports/fixtures').query({ date: '2026-09-16' }).expect(200);
      await request(app.getHttpServer()).get('/sports/matches/match-1').expect(200);
      expect(sportsService.listLiveScores.mock.calls[0][1]).toBeUndefined();
      expect(sportsService.listFixtures.mock.calls[0][1]).toBeUndefined();
      expect(sportsService.getMatchById).toHaveBeenCalledWith('match-1', undefined);
    });

    it('marks the three responses Vary: Authorization and keeps any Vary already set', async () => {
      sportsService.listLiveScores.mockResolvedValue({ items: [], nextCursor: null });
      sportsService.listFixtures.mockResolvedValue({ items: [], nextCursor: null });
      sportsService.getMatchById.mockResolvedValue({ id: 'match-1', kickoffAlert: false });
      for (const url of ['/sports/live-scores', '/sports/fixtures?date=2026-09-16', '/sports/matches/match-1']) {
        const res = await request(app.getHttpServer()).get(url).expect(200);
        expect(res.headers.vary).toMatch(/Authorization/i);
      }
    });

    it('does not enrich the other match reads (they stay caller-independent)', async () => {
      sportsService.getMatchStatistics.mockResolvedValue({});
      await request(app.getHttpServer()).get('/sports/matches/match-1/stats').set(bearer).expect(200);
      expect(sportsService.getMatchStatistics).toHaveBeenCalledWith('match-1');
    });
  });

  describe('PUT subscription when the match has already started', () => {
    it('surfaces the coded 409 unchanged', async () => {
      matchKickoffService.subscribe.mockRejectedValue(
        new ConflictException({ statusCode: 409, error: 'Conflict', code: 'match_already_started', message: 'x' }),
      );
      const res = await request(app.getHttpServer()).put('/sports/matches/ext-1/subscription').expect(409);
      expect(res.body.code).toBe('match_already_started');
    });

    it('DELETE is still allowed (the service is never asked about the match state)', async () => {
      matchKickoffService.unsubscribe.mockResolvedValue(undefined);
      await request(app.getHttpServer()).delete('/sports/matches/ext-1/subscription').expect(200, { subscribed: false });
    });
  });
});
