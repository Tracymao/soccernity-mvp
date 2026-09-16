import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';

// sprint-4/sports-hub-highlightly-backend — Build Plan Section 4.6. Hits test/README.md's e2e
// triggers: a genuinely NEW schema (the MatchData redesign — migration
// 20260916083019_add_sports_hub_highlightly_data_redesign — and the new Standing model), never
// exercised against a real Postgres before this PR.
//
// NO real Highlightly credentials exist in this environment (see modules/sports/README.md's own
// "Verification" section) — SPORTS_DATA_API_KEY in .env.test is the same placeholder every other
// env file uses, so HighlightlyClient is genuinely "wired but inactive" here too. This file
// therefore proves two real things a mocked unit test cannot: (1) every route genuinely boots
// through the real, fully-wired AppModule and returns a well-formed response even when the upstream
// vendor is unconfigured — graceful degradation to an empty/stale result, never a crash — and (2) a
// MatchData/Standing row written directly (simulating what a real Highlightly refresh would persist)
// round-trips correctly through the real Postgres schema and the real HTTP response shape. Every
// other real Highlightly-specific concern (the wrapper-envelope unwrapping, the budget guard, the
// refresh-lock stampede behavior, phase derivation, momentum/h2h computation) is already covered by
// the mocked unit suite (sports.service.spec.ts, highlightly-client.service.spec.ts,
// sports-data-budget.service.spec.ts, momentum.util.spec.ts) — this file does not repeat that.
describe('Sports Hub e2e (Build Plan Section 4.6)', () => {
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

  function server() {
    return app.getHttpServer();
  }

  async function seedMatch(overrides: Partial<Record<string, unknown>> = {}) {
    const prisma = getTestPrismaClient();
    return prisma.matchData.create({
      data: {
        externalRef: `e2e-match-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        competition: 'Premier League',
        teams: ['Liverpool', 'Chelsea'],
        score: '3 - 1',
        status: 'live',
        statusDetail: 'Second half',
        kickoffTime: new Date('2026-09-16T15:00:00.000Z'),
        leagueId: '133',
        leagueName: 'Premier League',
        season: '2026',
        homeTeamId: 'home-1',
        homeTeamName: 'Liverpool',
        awayTeamId: 'away-1',
        awayTeamName: 'Chelsea',
        homeScore: 3,
        awayScore: 1,
        ...overrides,
      },
    });
  }

  describe('graceful degradation when Highlightly is unconfigured (no real account in this environment)', () => {
    it('GET /sports/fixtures?date= returns 200 with an empty page, never a crash, when no cached data exists', async () => {
      const res = await request(server()).get('/sports/fixtures').query({ date: '2020-01-01' }).expect(200);
      expect(res.body).toEqual({ items: [], nextCursor: null });
    });

    it('GET /sports/live-scores returns 200 with an empty page when nothing is cached', async () => {
      const res = await request(server()).get('/sports/live-scores').expect(200);
      expect(res.body).toEqual({ items: [], nextCursor: null });
    });

    it('GET /sports/matches/:id returns a 5xx (never a silent 200) for a genuinely unknown id with no cache and no upstream available', async () => {
      const res = await request(server()).get('/sports/matches/genuinely-unknown-id');
      expect(res.status).toBeGreaterThanOrEqual(500);
    });

    it('GET /sports/standings?league= returns 200 with an empty groups array when nothing is cached', async () => {
      const res = await request(server()).get('/sports/standings').query({ league: '133' }).expect(200);
      expect(res.body.groups).toEqual([]);
      expect(res.body.leagueId).toBe('133');
    });

    it('GET /sports/highlights/:matchId returns 404 for an unknown match id — unlike GET /sports/matches/:id, this route does not bootstrap an unseen match, it requires an existing MatchData row', async () => {
      await request(server()).get('/sports/highlights/genuinely-unknown-id').expect(404);
    });
  });

  describe('a real MatchData row round-trips through the real Postgres schema', () => {
    it('GET /sports/matches/:id serves an already-fresh cached row without needing any upstream call', async () => {
      const row = await seedMatch();

      const res = await request(server()).get(`/sports/matches/${row.externalRef}`).expect(200);

      expect(res.body).toMatchObject({
        id: row.externalRef,
        competition: 'Premier League',
        status: 'live',
        homeTeam: { id: 'home-1', name: 'Liverpool' },
        awayTeam: { id: 'away-1', name: 'Chelsea' },
        homeScore: 3,
        awayScore: 1,
        score: '3 - 1',
      });
    });

    it('GET /sports/live-scores returns a seeded status=live row for today, and excludes a finished one', async () => {
      const today = new Date().toISOString().slice(0, 10);
      const live = await seedMatch({ status: 'live', kickoffTime: new Date(`${today}T12:00:00.000Z`) });
      await seedMatch({ status: 'finished', kickoffTime: new Date(`${today}T09:00:00.000Z`) });

      const res = await request(server()).get('/sports/live-scores').expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].id).toBe(live.externalRef);
    });

    it('GET /sports/fixtures?date= returns every match kicking off that UTC calendar day, regardless of status', async () => {
      const scheduled = await seedMatch({ status: 'scheduled', kickoffTime: new Date('2026-09-16T10:00:00.000Z') });
      const finished = await seedMatch({ status: 'finished', kickoffTime: new Date('2026-09-16T18:00:00.000Z') });
      await seedMatch({ status: 'scheduled', kickoffTime: new Date('2026-09-17T10:00:00.000Z') }); // a different day — excluded

      const res = await request(server()).get('/sports/fixtures').query({ date: '2026-09-16' }).expect(200);

      const ids = res.body.items.map((m: { id: string }) => m.id);
      expect(ids).toEqual([scheduled.externalRef, finished.externalRef]); // ordered kickoffTime asc
    });

    it('GET /sports/matches/:id/stats correctly assigns home/away by team id, never by array order, against a real Postgres JSON column', async () => {
      const row = await seedMatch({
        statistics: [
          { team: { id: 'away-1', name: 'Chelsea' }, statistics: [{ displayName: 'Shots', value: 5 }] },
          { team: { id: 'home-1', name: 'Liverpool' }, statistics: [{ displayName: 'Shots', value: 9 }] },
        ],
        statisticsUpdatedAt: new Date(),
      });

      const res = await request(server()).get(`/sports/matches/${row.externalRef}/stats`).expect(200);

      expect(res.body.home.team.id).toBe('home-1');
      expect(res.body.away.team.id).toBe('away-1');
    });

    it('GET /sports/matches/:id/events orders newest-first, reading real JSON data back from Postgres', async () => {
      const row = await seedMatch({
        status: 'finished',
        events: [
          { time: '23', type: 'Goal', player: 'Salah', team: { id: 'home-1' } },
          { time: '71', type: 'Goal', player: 'Jackson', team: { id: 'away-1' } },
        ],
        eventsUpdatedAt: new Date(),
      });

      const res = await request(server()).get(`/sports/matches/${row.externalRef}/events`).expect(200);

      const goalMinutes = res.body.items.filter((e: { type: string }) => e.type === 'Goal').map((e: { minute: number }) => e.minute);
      expect(goalMinutes).toEqual([71, 23]);
    });

    it('GET /sports/matches/:id/momentum computes real bars from the cached events column via a real HTTP round trip', async () => {
      const row = await seedMatch({
        status: 'finished',
        events: [{ time: '23', type: 'Goal', player: 'Salah', team: { id: 'home-1' } }],
        eventsUpdatedAt: new Date(),
      });

      const res = await request(server()).get(`/sports/matches/${row.externalRef}/momentum`).expect(200);

      expect(res.body.bars).toHaveLength(90);
      expect(res.body.bars.find((b: { minute: number }) => b.minute === 23).home).toBeGreaterThan(0);
    });

    it('GET /sports/matches/:id/lineups derives a real substitutions timeline from the cached events column', async () => {
      const row = await seedMatch({
        lineups: {
          homeTeam: { id: 'home-1', name: 'Liverpool', formation: '4-3-3', initialLineup: [[{ name: 'Alisson' }]], substitutes: [] },
          awayTeam: { id: 'away-1', name: 'Chelsea', formation: '4-2-3-1', initialLineup: [[{ name: 'Sánchez' }]], substitutes: [] },
        },
        lineupsUpdatedAt: new Date(),
        events: [{ time: '62', type: 'Substitution', team: { id: 'away-1' }, substituted: 'Sterling', player: 'Palmer' }],
        eventsUpdatedAt: new Date(),
      });

      const res = await request(server()).get(`/sports/matches/${row.externalRef}/lineups`).expect(200);

      expect(res.body.substitutions).toEqual([{ minute: 62, side: 'away', playerOff: 'Sterling', playerOn: 'Palmer' }]);
    });

    it('a seeded Standing row round-trips with NO "form" field on any row — the real, disclosed Highlightly data gap', async () => {
      const prisma = getTestPrismaClient();
      await prisma.standing.create({
        data: {
          leagueId: '133',
          season: '2026',
          table: [
            {
              name: 'Premier League',
              standings: [
                { position: 1, points: 63, team: { id: 't1', name: 'Arsenal' }, total: { games: 17, wins: 11, draws: 4, loses: 5, scoredGoals: 28, receivedGoals: 27 } },
              ],
            },
          ],
        },
      });

      const res = await request(server()).get('/sports/standings').query({ league: '133', season: '2026' }).expect(200);

      expect(res.body.groups[0].rows[0]).not.toHaveProperty('form');
      expect(res.body.groups[0].rows[0]).toMatchObject({ position: 1, points: 63, goalDifference: 1 });
    });
  });
});
