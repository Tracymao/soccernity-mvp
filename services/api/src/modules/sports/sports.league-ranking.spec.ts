import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { SportsDataClient } from '../../sports-data/sports-data-client';
import { SportsRefreshLock } from '../../sports-data/sports-refresh-lock';
import { ListFixturesQueryDto } from './dto/list-fixtures-query.dto';
import { ListRecentResultsQueryDto } from './dto/list-recent-results-query.dto';
import { SportsService } from './sports.service';

function prismaMock() {
  return {
    matchData: { findUnique: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), upsert: jest.fn() },
    sportsLeague: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn() },
    matchSubscription: { findMany: jest.fn().mockResolvedValue([]) },
  } as unknown as PrismaService;
}

function clientMock() {
  return {
    getMatches: jest.fn().mockResolvedValue({ items: [], totalCount: 0 }),
    getLeagues: jest.fn().mockResolvedValue({ items: [], totalCount: 0 }),
  } as unknown as SportsDataClient;
}

const lock = (acquires: boolean) => ({ tryAcquire: jest.fn().mockResolvedValue(acquires) }) as unknown as SportsRefreshLock;
const config = (o: Record<string, unknown> = {}) => ({ get: (k: string) => o[k] }) as unknown as ConfigService;

let seq = 0;
function row(o: Record<string, unknown> = {}) {
  seq += 1;
  return {
    id: `row-${seq}`,
    externalRef: `m-${seq}`,
    competition: 'x',
    teams: ['A', 'B'],
    score: null,
    status: 'scheduled',
    statusDetail: null,
    kickoffTime: new Date('2026-09-16T15:00:00.000Z'),
    leagueId: '1',
    leagueName: 'Some Local League',
    season: '2026',
    round: null,
    venue: null,
    homeTeamId: 'h',
    homeTeamName: 'A',
    homeTeamLogo: null,
    awayTeamId: 'a',
    awayTeamName: 'B',
    awayTeamLogo: null,
    homeScore: null,
    awayScore: null,
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
    createdAt: new Date(),
    updatedAt: new Date(),
    ...o,
  };
}

function build(rows: unknown[], meta: unknown[] = [], acquires = false) {
  const prisma = prismaMock();
  (prisma.matchData.findMany as jest.Mock).mockResolvedValue(rows);
  (prisma.sportsLeague.findMany as jest.Mock).mockResolvedValue(meta);
  const client = clientMock();
  const service = new SportsService(prisma, client, lock(acquires), config());
  return { prisma, client, service };
}

describe('league ranking on the sports endpoints', () => {
  it('orders by league priority, then country A-Z for unranked leagues (null last)', async () => {
    const rows = [
      row({ leagueId: '10', leagueName: 'Zeta League' }),
      row({ leagueId: '11', leagueName: 'Beta League' }),
      row({ leagueId: '12', leagueName: 'Premier League' }),
      row({ leagueId: '13', leagueName: 'FIFA World Cup' }),
      row({ leagueId: '14', leagueName: 'Alpha League' }),
    ];
    const meta = [
      { leagueId: '10', name: 'Zeta League', countryName: null },
      { leagueId: '11', name: 'Beta League', countryName: 'Zambia' },
      { leagueId: '12', name: 'Premier League', countryName: 'England' },
      { leagueId: '13', name: 'FIFA World Cup', countryName: 'World' },
      { leagueId: '14', name: 'Alpha League', countryName: 'Albania' },
    ];
    const { service } = build(rows, meta);
    const page = await service.listFixtures({ date: '2026-09-16' } as never);
    expect(page.items.map((i) => i.league.name)).toEqual([
      'FIFA World Cup',
      'Premier League',
      'Alpha League',
      'Beta League',
      'Zeta League',
    ]);
    expect(page.items[0].league.rank).toBe(1);
    expect(page.items[1].league.country).toBe('England');
    expect(page.items[2].league.rank).toBeNull();
  });

  it('orders inside a league: live first, then scheduled by kickoff, then finished newest first', async () => {
    const rows = [
      row({ id: 'f1', externalRef: 'f1', status: 'finished', kickoffTime: new Date('2026-09-16T10:00:00Z') }),
      row({ id: 'f2', externalRef: 'f2', status: 'finished', kickoffTime: new Date('2026-09-16T12:00:00Z') }),
      row({ id: 's2', externalRef: 's2', status: 'scheduled', kickoffTime: new Date('2026-09-16T20:00:00Z') }),
      row({ id: 's1', externalRef: 's1', status: 'scheduled', kickoffTime: new Date('2026-09-16T18:00:00Z') }),
      row({ id: 'l1', externalRef: 'l1', status: 'live', kickoffTime: new Date('2026-09-16T17:00:00Z') }),
    ];
    const { service } = build(rows);
    const page = await service.listFixtures({ date: '2026-09-16' } as never);
    expect(page.items.map((i) => i.id)).toEqual(['l1', 's1', 's2', 'f2', 'f1']);
  });

  it('passes the status filter to the database query', async () => {
    const { service, prisma } = build([]);
    await service.listFixtures({ date: '2026-09-16', status: 'finished' } as never);
    const where = (prisma.matchData.findMany as jest.Mock).mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain('"status":"finished"');
  });

  it('works without a status (existing callers)', async () => {
    const { service, prisma } = build([row()]);
    const page = await service.listFixtures({ date: '2026-09-16' } as never);
    expect(page.items).toHaveLength(1);
    const where = (prisma.matchData.findMany as jest.Mock).mock.calls[0][0].where;
    expect(JSON.stringify(where)).not.toContain('"status"');
  });

  it('pages the ranked list stably with the cursor (no gaps, no repeats)', async () => {
    const rows = Array.from({ length: 7 }, (_, i) =>
      row({
        id: `p${i}`,
        externalRef: `p${i}`,
        leagueId: String(100 + (i % 2)),
        leagueName: i % 2 ? 'Beta League' : 'Alpha League',
        kickoffTime: new Date(`2026-09-16T1${i}:00:00Z`),
      }),
    );
    const { service } = build(rows);
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < 10; guard += 1) {
      const page = await service.listFixtures({ date: '2026-09-16', limit: 3, cursor } as never);
      seen.push(...page.items.map((i) => i.id));
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    expect(seen).toHaveLength(7);
    expect(new Set(seen).size).toBe(7);
    const full = (await service.listFixtures({ date: '2026-09-16', limit: 50 } as never)).items.map((i) => i.id);
    expect(seen).toEqual(full);
  });

  it('rejects a malformed cursor with a 400', async () => {
    const { service } = build([row()]);
    await expect(service.listFixtures({ date: '2026-09-16', cursor: '%%%' } as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('live scores use the same league ordering', async () => {
    const rows = [
      row({ status: 'live', leagueId: '20', leagueName: 'Other League' }),
      row({ status: 'live', leagueId: '21', leagueName: 'UEFA Champions League' }),
    ];
    const { service } = build(rows);
    const page = await service.listLiveScores({} as never);
    expect(page.items.map((i) => i.league.name)).toEqual(['UEFA Champions League', 'Other League']);
  });

  it('an unknown country does not break anything (country null, ranked by name only when country-free)', async () => {
    const { service } = build([row({ leagueId: '30', leagueName: 'UEFA Champions League' })], []);
    const page = await service.listFixtures({ date: '2026-09-16' } as never);
    expect(page.items[0].league.country).toBeNull();
    expect(page.items[0].league.rank).not.toBeNull();
  });

  it('fixtures still load when the metadata read and refresh both fail', async () => {
    const { service, prisma, client } = build([row()], [], true);
    (prisma.sportsLeague.findMany as jest.Mock).mockRejectedValue(new Error('db down'));
    (client.getLeagues as jest.Mock).mockRejectedValue(new Error('upstream down'));
    const page = await service.listFixtures({ date: '2026-09-16' } as never);
    expect(page.items).toHaveLength(1);
    expect(page.items[0].league.country).toBeNull();
  });

  it('fixtures still load when only the league refresh call fails', async () => {
    const { service, client } = build([row()], [], true);
    (client.getLeagues as jest.Mock).mockRejectedValue(new Error('upstream down'));
    const page = await service.listFixtures({ date: '2026-09-16' } as never);
    expect(page.items).toHaveLength(1);
  });

  it('refreshes league metadata at most once a day and caps the number of calls', async () => {
    const prisma = prismaMock();
    (prisma.matchData.findMany as jest.Mock).mockResolvedValue([row()]);
    (prisma.sportsLeague.findMany as jest.Mock).mockResolvedValue([]);
    const client = clientMock();
    (client.getLeagues as jest.Mock).mockResolvedValue({
      items: [{ id: 1, name: 'Some Local League', country: { name: 'Albania', code: 'AL' }, logo: 'l.png' }],
      totalCount: 100000,
    });
    const lk = lock(true);
    const service = new SportsService(prisma, client, lk, config({ SPORTS_DATA_MAX_LEAGUE_META_PAGES: 3 }));
    await service.listFixtures({ date: '2026-09-16' } as never);
    expect(client.getLeagues).toHaveBeenCalledTimes(3);
    expect(prisma.sportsLeague.upsert).toHaveBeenCalled();
    const keys = (lk.tryAcquire as jest.Mock).mock.calls.map((c) => c[0] as string);
    expect(keys.some((k) => k.startsWith('sports:refresh:leagues:'))).toBe(true);
  });

  describe('listRecentResults', () => {
    it('returns an empty result when no finished match exists in the look-back window', async () => {
      const { service, prisma } = build([]);
      (prisma.matchData.findFirst as jest.Mock).mockResolvedValue(null);
      expect(await service.listRecentResults({} as never)).toEqual({ date: null, items: [] });
      expect(prisma.matchData.findMany).not.toHaveBeenCalled();
    });

    it('uses the most recent day with finished matches, ordered by league then newest first, DB only', async () => {
      const day = new Date('2026-09-14T18:00:00Z');
      const rows = [
        row({ status: 'finished', kickoffTime: new Date('2026-09-14T12:00:00Z'), leagueId: '40', leagueName: 'Other League' }),
        row({ id: 'a', externalRef: 'a', status: 'finished', kickoffTime: new Date('2026-09-14T13:00:00Z'), leagueId: '41', leagueName: 'La Liga' }),
        row({ id: 'b', externalRef: 'b', status: 'finished', kickoffTime: new Date('2026-09-14T17:00:00Z'), leagueId: '41', leagueName: 'La Liga' }),
      ];
      const meta = [{ leagueId: '41', name: 'La Liga', countryName: 'Spain' }];
      const { service, prisma, client } = build(rows, meta);
      (prisma.matchData.findFirst as jest.Mock).mockResolvedValue({ kickoffTime: day });
      const res = await service.listRecentResults({} as never);
      expect(res.date).toBe('2026-09-14');
      expect(res.items.map((i) => i.id)).toEqual(['b', 'a', rows[0].externalRef]);
      expect(client.getMatches).not.toHaveBeenCalled();
      expect(client.getLeagues).not.toHaveBeenCalled();
      const findFirst = (prisma.matchData.findFirst as jest.Mock).mock.calls[0][0];
      expect(findFirst.where.status).toBe('finished');
      const span = findFirst.where.kickoffTime.lt.getTime() - findFirst.where.kickoffTime.gte.getTime();
      expect(span).toBe(8 * 24 * 60 * 60 * 1000);
    });

    it('applies the limit', async () => {
      const rows = [row({ status: 'finished' }), row({ status: 'finished' }), row({ status: 'finished' })];
      const { service, prisma } = build(rows);
      (prisma.matchData.findFirst as jest.Mock).mockResolvedValue({ kickoffTime: new Date('2026-09-14T10:00:00Z') });
      expect((await service.listRecentResults({ limit: 2 } as never)).items).toHaveLength(2);
    });
  });

  describe('listLeagues', () => {
    it('joins distinct leagues with metadata and orders them like the match lists', async () => {
      const { service, prisma } = build(
        [],
        [
          { leagueId: '1', name: 'Zeta', countryName: 'Zambia', logo: null },
          { leagueId: '2', name: 'Serie A', countryName: 'Italy', logo: 's.png' },
        ],
      );
      (prisma.matchData.findMany as jest.Mock).mockResolvedValue([
        { leagueId: '1', leagueName: 'Zeta' },
        { leagueId: '2', leagueName: 'Serie A' },
        { leagueId: '3', leagueName: 'No Meta League' },
      ]);
      const res = await service.listLeagues();
      expect(res.items.map((l) => l.id)).toEqual(['2', '1', '3']);
      expect(res.items[0]).toEqual({ id: '2', name: 'Serie A', country: 'Italy', logo: 's.png', rank: expect.any(Number) });
      expect(res.items[2].country).toBeNull();
    });
  });
});

describe('query DTO validation', () => {
  it('accepts the three status values and rejects others', async () => {
    for (const status of ['scheduled', 'live', 'finished']) {
      const dto = plainToInstance(ListFixturesQueryDto, { date: '2026-09-16', status });
      expect(await validate(dto)).toHaveLength(0);
    }
    const bad = plainToInstance(ListFixturesQueryDto, { date: '2026-09-16', status: 'postponed' });
    expect((await validate(bad)).length).toBeGreaterThan(0);
  });

  it('recent results limit is an integer between 1 and the max page size', async () => {
    expect(await validate(plainToInstance(ListRecentResultsQueryDto, { limit: '10' }))).toHaveLength(0);
    expect((await validate(plainToInstance(ListRecentResultsQueryDto, { limit: '0' }))).length).toBeGreaterThan(0);
    expect((await validate(plainToInstance(ListRecentResultsQueryDto, { limit: '500' }))).length).toBeGreaterThan(0);
    expect((await validate(plainToInstance(ListRecentResultsQueryDto, { limit: 'abc' }))).length).toBeGreaterThan(0);
  });
});
