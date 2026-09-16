import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SportsDataClient, SportsDataNotFoundError } from '../../sports-data/sports-data-client';
import { SportsDataUpstreamError } from '../../sports-data/sports-data.errors';
import { SportsRefreshLock } from '../../sports-data/sports-refresh-lock';
import { SportsService } from './sports.service';

function buildPrismaMock() {
  return {
    matchData: { findUnique: jest.fn(), findMany: jest.fn(), upsert: jest.fn(), update: jest.fn() },
    standing: { findUnique: jest.fn(), findFirst: jest.fn(), upsert: jest.fn() },
  } as unknown as PrismaService;
}

function buildClientMock() {
  return {
    getMatches: jest.fn().mockResolvedValue({ items: [], totalCount: 0 }),
    getMatchById: jest.fn(),
    getMatchStatistics: jest.fn(),
    getMatchLineups: jest.fn(),
    getMatchEvents: jest.fn().mockResolvedValue([]),
    getHeadToHead: jest.fn(),
    getStandings: jest.fn(),
    getHighlights: jest.fn(),
  } as unknown as SportsDataClient;
}

// Real (non-Redis) lock fake — acquires by default, can be forced to reject the next N attempts.
function buildLockMock(acquires = true) {
  return { tryAcquire: jest.fn().mockResolvedValue(acquires) } as unknown as SportsRefreshLock;
}

function buildConfig(overrides: Record<string, unknown> = {}): ConfigService {
  return { get: (key: string) => overrides[key] } as unknown as ConfigService;
}

function matchRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'row-1',
    externalRef: 'match-1',
    competition: 'Premier League',
    teams: ['Liverpool', 'Chelsea'],
    score: '3 - 1',
    status: 'live',
    statusDetail: 'Second half',
    kickoffTime: new Date('2026-09-16T15:00:00.000Z'),
    leagueId: '133',
    leagueName: 'Premier League',
    season: '2026',
    round: 'Matchday 5',
    venue: 'Anfield',
    homeTeamId: 'home-1',
    homeTeamName: 'Liverpool',
    homeTeamLogo: null,
    awayTeamId: 'away-1',
    awayTeamName: 'Chelsea',
    awayTeamLogo: null,
    homeScore: 3,
    awayScore: 1,
    statistics: null,
    statisticsUpdatedAt: null,
    lineups: null,
    lineupsUpdatedAt: null,
    events: null,
    eventsUpdatedAt: null,
    h2h: null,
    h2hUpdatedAt: null,
    highlights: null,
    highlightsUpdatedAt: null,
    createdAt: new Date('2026-09-16T14:00:00.000Z'),
    updatedAt: new Date(), // "now" — fresh by default
    ...overrides,
  };
}

describe('SportsService', () => {
  describe('listFixtures', () => {
    it('refreshes matches for the given date then reads the matching DB rows', async () => {
      const prisma = buildPrismaMock();
      const client = buildClientMock();
      const lock = buildLockMock(true);
      (client.getMatches as jest.Mock).mockResolvedValue({
        items: [{ id: 1, date: '2026-09-16T15:00:00.000Z', homeTeam: { id: 1, name: 'Liverpool' }, awayTeam: { id: 2, name: 'Chelsea' }, state: { description: 'Not started' } }],
        totalCount: 1,
      });
      (prisma.matchData.upsert as jest.Mock).mockResolvedValue(matchRow());
      (prisma.matchData.findMany as jest.Mock).mockResolvedValue([matchRow()]);

      const service = new SportsService(prisma, client, lock, buildConfig());
      const page = await service.listFixtures({ date: '2026-09-16' } as never);

      expect(client.getMatches).toHaveBeenCalledWith(expect.objectContaining({ date: '2026-09-16' }));
      expect(prisma.matchData.upsert).toHaveBeenCalled();
      expect(page.items).toHaveLength(1);
      expect(page.items[0].id).toBe('match-1');
    });

    it('skips the upstream refresh entirely when the refresh lock is not acquired (another request already refreshed)', async () => {
      const prisma = buildPrismaMock();
      const client = buildClientMock();
      const lock = buildLockMock(false);
      (prisma.matchData.findMany as jest.Mock).mockResolvedValue([]);

      const service = new SportsService(prisma, client, lock, buildConfig());
      await service.listFixtures({ date: '2026-09-16' } as never);

      expect(client.getMatches).not.toHaveBeenCalled();
    });

    it('caps the number of /matches pages fetched at SPORTS_DATA_MAX_REFRESH_PAGES', async () => {
      const prisma = buildPrismaMock();
      const client = buildClientMock();
      const lock = buildLockMock(true);
      (client.getMatches as jest.Mock).mockResolvedValue({
        items: [{ id: 1, date: '2026-09-16T15:00:00.000Z', homeTeam: { id: 1, name: 'A' }, awayTeam: { id: 2, name: 'B' }, state: { description: 'Not started' } }],
        totalCount: 500, // far more than one page could ever cover
      });
      (prisma.matchData.upsert as jest.Mock).mockResolvedValue(matchRow());
      (prisma.matchData.findMany as jest.Mock).mockResolvedValue([]);

      const service = new SportsService(prisma, client, lock, buildConfig({ SPORTS_DATA_MAX_REFRESH_PAGES: 2 }));
      await service.listFixtures({ date: '2026-09-16' } as never);

      expect(client.getMatches).toHaveBeenCalledTimes(2);
    });
  });

  describe('listLiveScores', () => {
    it('reads only status=live rows and triggers the SAME today-date refresh listFixtures would', async () => {
      const prisma = buildPrismaMock();
      const client = buildClientMock();
      const lock = buildLockMock(true);
      (prisma.matchData.findMany as jest.Mock).mockResolvedValue([matchRow({ status: 'live' })]);

      const service = new SportsService(prisma, client, lock, buildConfig());
      const page = await service.listLiveScores({} as never);

      expect(client.getMatches).toHaveBeenCalled();
      const whereArg = (prisma.matchData.findMany as jest.Mock).mock.calls[0][0];
      expect(JSON.stringify(whereArg)).toContain('"status":"live"');
      expect(page.items).toHaveLength(1);
    });
  });

  describe('getMatchById', () => {
    it('serves the cached row without calling the client when it is still fresh', async () => {
      const prisma = buildPrismaMock();
      const client = buildClientMock();
      const lock = buildLockMock(true);
      (prisma.matchData.findUnique as jest.Mock).mockResolvedValue(matchRow({ updatedAt: new Date() }));

      const service = new SportsService(prisma, client, lock, buildConfig());
      const result = await service.getMatchById('match-1');

      expect(client.getMatchById).not.toHaveBeenCalled();
      expect(result.id).toBe('match-1');
    });

    it('refreshes a stale row from the client and upserts the result', async () => {
      const prisma = buildPrismaMock();
      const client = buildClientMock();
      const lock = buildLockMock(true);
      const staleRow = matchRow({ status: 'live', updatedAt: new Date(Date.now() - 10 * 60 * 1000) });
      (prisma.matchData.findUnique as jest.Mock).mockResolvedValue(staleRow);
      (client.getMatchById as jest.Mock).mockResolvedValue({
        id: 'match-1',
        date: '2026-09-16T15:00:00.000Z',
        homeTeam: { id: 'home-1', name: 'Liverpool' },
        awayTeam: { id: 'away-1', name: 'Chelsea' },
        state: { description: 'Second half', score: { current: '3 - 1' } },
      });
      (prisma.matchData.upsert as jest.Mock).mockResolvedValue(matchRow());

      const service = new SportsService(prisma, client, lock, buildConfig());
      await service.getMatchById('match-1');

      expect(client.getMatchById).toHaveBeenCalledWith('match-1');
      expect(prisma.matchData.upsert).toHaveBeenCalled();
    });

    it('falls back to the stale cached row when the upstream refresh fails and a row already exists', async () => {
      const prisma = buildPrismaMock();
      const client = buildClientMock();
      const lock = buildLockMock(true);
      const staleRow = matchRow({ updatedAt: new Date(Date.now() - 10 * 60 * 1000) });
      (prisma.matchData.findUnique as jest.Mock).mockResolvedValue(staleRow);
      (client.getMatchById as jest.Mock).mockRejectedValue(new SportsDataUpstreamError('network down'));

      const service = new SportsService(prisma, client, lock, buildConfig());
      const result = await service.getMatchById('match-1');

      expect(result.id).toBe('match-1'); // degraded to the stale row, not thrown
    });

    it('throws NotFoundException when no row exists and Highlightly genuinely says 404', async () => {
      const prisma = buildPrismaMock();
      const client = buildClientMock();
      const lock = buildLockMock(true);
      (prisma.matchData.findUnique as jest.Mock).mockResolvedValue(null);
      (client.getMatchById as jest.Mock).mockRejectedValue(new SportsDataNotFoundError());

      const service = new SportsService(prisma, client, lock, buildConfig());
      await expect(service.getMatchById('missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('propagates a genuine upstream failure when there is no row to fall back on at all', async () => {
      const prisma = buildPrismaMock();
      const client = buildClientMock();
      const lock = buildLockMock(true);
      (prisma.matchData.findUnique as jest.Mock).mockResolvedValue(null);
      (client.getMatchById as jest.Mock).mockRejectedValue(new SportsDataUpstreamError('network down'));

      const service = new SportsService(prisma, client, lock, buildConfig());
      await expect(service.getMatchById('match-1')).rejects.toBeInstanceOf(SportsDataUpstreamError);
    });
  });

  describe('getMatchStatistics', () => {
    it('throws NotFoundException for an unknown match id, without ever calling the client', async () => {
      const prisma = buildPrismaMock();
      const client = buildClientMock();
      const lock = buildLockMock(true);
      (prisma.matchData.findUnique as jest.Mock).mockResolvedValue(null);

      const service = new SportsService(prisma, client, lock, buildConfig());
      await expect(service.getMatchStatistics('missing')).rejects.toBeInstanceOf(NotFoundException);
      expect(client.getMatchStatistics).not.toHaveBeenCalled();
    });

    it('correctly assigns home/away statistics by matching team id against the match row, not array order', async () => {
      const prisma = buildPrismaMock();
      const client = buildClientMock();
      const lock = buildLockMock(true);
      const cachedStats = [
        { team: { id: 'away-1', name: 'Chelsea' }, statistics: [{ displayName: 'Shots', value: 5 }] },
        { team: { id: 'home-1', name: 'Liverpool' }, statistics: [{ displayName: 'Shots', value: 9 }] },
      ];
      (prisma.matchData.findUnique as jest.Mock).mockResolvedValue(matchRow({ statistics: cachedStats, statisticsUpdatedAt: new Date() }));

      const service = new SportsService(prisma, client, lock, buildConfig());
      const result = await service.getMatchStatistics('match-1');

      expect(result.home?.team.id).toBe('home-1');
      expect(result.away?.team.id).toBe('away-1');
      expect(client.getMatchStatistics).not.toHaveBeenCalled(); // already fresh
    });

    it('never fabricates a player box score — statistics response has no player field at all', async () => {
      const prisma = buildPrismaMock();
      const client = buildClientMock();
      const lock = buildLockMock(true);
      const cachedStats = [
        { team: { id: 'home-1', name: 'Liverpool' }, statistics: [{ displayName: 'Shots', value: 9 }] },
        { team: { id: 'away-1', name: 'Chelsea' }, statistics: [{ displayName: 'Shots', value: 5 }] },
      ];
      (prisma.matchData.findUnique as jest.Mock).mockResolvedValue(matchRow({ statistics: cachedStats, statisticsUpdatedAt: new Date() }));

      const service = new SportsService(prisma, client, lock, buildConfig());
      const result = await service.getMatchStatistics('match-1');

      expect(result).not.toHaveProperty('players');
      expect(result.home).not.toHaveProperty('players');
    });
  });

  describe('getMatchLineups', () => {
    it('derives substitutions from the already-cached events column, without fetching events itself', async () => {
      const prisma = buildPrismaMock();
      const client = buildClientMock();
      const lock = buildLockMock(true);
      const events = [{ team: { id: 'away-1' }, time: '62', type: 'Substitution', substituted: 'Sterling', player: 'Palmer' }];
      const lineups = {
        homeTeam: { id: 'home-1', name: 'Liverpool', formation: '4-3-3', initialLineup: [[{ name: 'Alisson' }]], substitutes: [] },
        awayTeam: { id: 'away-1', name: 'Chelsea', formation: '4-2-3-1', initialLineup: [[{ name: 'Sánchez' }]], substitutes: [] },
      };
      (prisma.matchData.findUnique as jest.Mock).mockResolvedValue(
        matchRow({ lineups, lineupsUpdatedAt: new Date(), events, eventsUpdatedAt: new Date() }),
      );

      const service = new SportsService(prisma, client, lock, buildConfig());
      const result = await service.getMatchLineups('match-1');

      expect(client.getMatchLineups).not.toHaveBeenCalled();
      expect(result.substitutions).toEqual([{ minute: 62, side: 'away', playerOff: 'Sterling', playerOn: 'Palmer' }]);
      expect(result.home.startingXI).toHaveLength(1);
    });
  });

  describe('getHeadToHead', () => {
    it('computes the aggregate from the CURRENT match perspective, regardless of which side was home in each historical meeting', async () => {
      const prisma = buildPrismaMock();
      const client = buildClientMock();
      const lock = buildLockMock(true);
      // Meeting 1: current home team (home-1) played AWAY and lost 1-2.
      // Meeting 2: current home team (home-1) played HOME and won 3-0.
      const meetings = [
        { id: 100, date: '2025-01-01T00:00:00.000Z', homeTeam: { id: 'away-1', name: 'Chelsea' }, awayTeam: { id: 'home-1', name: 'Liverpool' }, state: { description: 'Finished', score: { current: '2 - 1' } } },
        { id: 101, date: '2024-06-01T00:00:00.000Z', homeTeam: { id: 'home-1', name: 'Liverpool' }, awayTeam: { id: 'away-1', name: 'Chelsea' }, state: { description: 'Finished', score: { current: '3 - 0' } } },
      ];
      (prisma.matchData.findUnique as jest.Mock).mockResolvedValue(matchRow({ h2h: meetings, h2hUpdatedAt: new Date() }));

      const service = new SportsService(prisma, client, lock, buildConfig());
      const result = await service.getHeadToHead('match-1');

      expect(result.aggregate.played).toBe(2);
      expect(result.aggregate.homeTeamWins).toBe(1); // meeting 2
      expect(result.aggregate.awayTeamWins).toBe(1); // meeting 1 (home-1 lost as the away side)
      expect(result.aggregate.homeTeamGoals).toBe(4); // 1 (meeting 1) + 3 (meeting 2)
      expect(result.aggregate.awayTeamGoals).toBe(2); // 2 (meeting 1) + 0 (meeting 2)
    });
  });

  describe('getStandings', () => {
    it('defaults season to whatever is already cached for the league when none is requested', async () => {
      const prisma = buildPrismaMock();
      const client = buildClientMock();
      const lock = buildLockMock(true);
      (prisma.standing.findFirst as jest.Mock).mockResolvedValue({ leagueId: '133', season: '2025', table: [], updatedAt: new Date() });
      (prisma.standing.findUnique as jest.Mock).mockResolvedValue({ leagueId: '133', season: '2025', table: [], updatedAt: new Date() });

      const service = new SportsService(prisma, client, lock, buildConfig());
      const result = await service.getStandings({ league: '133' } as never);

      expect(result.season).toBe('2025');
    });

    it('never returns a "form" field — Highlightly\'s own standings row has none (a real, disclosed data gap)', async () => {
      const prisma = buildPrismaMock();
      const client = buildClientMock();
      const lock = buildLockMock(true);
      const table = [{ name: 'Premier League', standings: [{ position: 1, points: 63, team: { id: 't1', name: 'Arsenal' }, total: { games: 17, wins: 11, draws: 4, loses: 5, scoredGoals: 28, receivedGoals: 27 } }] }];
      (prisma.standing.findUnique as jest.Mock).mockResolvedValue({ leagueId: '133', season: '2026', table, updatedAt: new Date() });

      const service = new SportsService(prisma, client, lock, buildConfig());
      const result = await service.getStandings({ league: '133', season: '2026' } as never);

      expect(result.groups[0].rows[0]).not.toHaveProperty('form');
      expect(result.groups[0].rows[0].goalDifference).toBe(1);
    });
  });

  describe('getHighlights', () => {
    it('throws NotFoundException for an unknown match id', async () => {
      const prisma = buildPrismaMock();
      const client = buildClientMock();
      const lock = buildLockMock(true);
      (prisma.matchData.findUnique as jest.Mock).mockResolvedValue(null);

      const service = new SportsService(prisma, client, lock, buildConfig());
      await expect(service.getHighlights('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getMatchEvents', () => {
    it('orders events newest-first (Decision Log #316 — Live Commentary reads newest-first)', async () => {
      const prisma = buildPrismaMock();
      const client = buildClientMock();
      const lock = buildLockMock(true);
      const events = [
        { time: '23', type: 'Goal', player: 'Salah', team: { id: 'home-1' } },
        { time: '71', type: 'Goal', player: 'Jackson', team: { id: 'away-1' } },
      ];
      (prisma.matchData.findUnique as jest.Mock).mockResolvedValue(matchRow({ events, eventsUpdatedAt: new Date(), status: 'finished' }));

      const service = new SportsService(prisma, client, lock, buildConfig());
      const result = await service.getMatchEvents('match-1');

      const goalMinutes = result.items.filter((e) => e.type === 'Goal').map((e) => e.minute);
      expect(goalMinutes).toEqual([71, 23]);
    });

    it('includes synthetic Kick Off / Half Time / Full Time markers for a finished match', async () => {
      const prisma = buildPrismaMock();
      const client = buildClientMock();
      const lock = buildLockMock(true);
      (prisma.matchData.findUnique as jest.Mock).mockResolvedValue(matchRow({ events: [], eventsUpdatedAt: new Date(), status: 'finished' }));

      const service = new SportsService(prisma, client, lock, buildConfig());
      const result = await service.getMatchEvents('match-1');

      expect(result.items.map((e) => e.type)).toEqual(expect.arrayContaining(['Kick Off', 'Half Time', 'Full Time']));
    });
  });
});
