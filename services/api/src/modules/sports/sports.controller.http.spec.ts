import { INestApplication, NotFoundException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
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
    getHeadToHead: jest.fn(),
    getMatchMomentum: jest.fn(),
    getMatchEvents: jest.fn(),
    getHighlights: jest.fn(),
    getStandings: jest.fn(),
  };

  async function buildApp() {
    const moduleRef = await Test.createTestingModule({
      controllers: [SportsMatchesController, SportsStandingsController],
      providers: [{ provide: SportsService, useValue: sportsService }],
    }).compile();

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
      expect(sportsService.listLiveScores).toHaveBeenCalledWith({});
    });

    it('passes league/cursor/limit through to the service', async () => {
      sportsService.listLiveScores.mockResolvedValue({ items: [], nextCursor: null });
      await request(app.getHttpServer()).get('/sports/live-scores').query({ league: '133', cursor: 'abc', limit: '10' }).expect(200);
      expect(sportsService.listLiveScores).toHaveBeenCalledWith({ league: '133', cursor: 'abc', limit: 10 });
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
      expect(sportsService.listFixtures).toHaveBeenCalledWith({ date: '2026-09-16' });
    });
  });

  describe('GET /sports/matches/:id', () => {
    it('reaches the service with no Authorization header at all', async () => {
      sportsService.getMatchById.mockResolvedValue({ id: 'match-1' });
      await request(app.getHttpServer()).get('/sports/matches/match-1').expect(200);
      expect(sportsService.getMatchById).toHaveBeenCalledWith('match-1');
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
});
