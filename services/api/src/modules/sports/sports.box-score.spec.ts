import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { SportsDataClient } from '../../sports-data/sports-data-client';
import { SportsDataUpstreamError } from '../../sports-data/sports-data.errors';
import { SportsRefreshLock } from '../../sports-data/sports-refresh-lock';
import { SportsService } from './sports.service';

function buildPrismaMock() {
  return {
    matchData: { findUnique: jest.fn(), update: jest.fn() },
  } as unknown as PrismaService;
}

function buildClientMock() {
  return { getMatchBoxScore: jest.fn() } as unknown as SportsDataClient;
}

function buildLockMock(acquires = true) {
  return { tryAcquire: jest.fn().mockResolvedValue(acquires) } as unknown as SportsRefreshLock;
}

function buildConfig(overrides: Record<string, unknown> = {}): ConfigService {
  return { get: (key: string) => overrides[key] } as unknown as ConfigService;
}

function matchRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    externalRef: 'match-1',
    status: 'finished',
    homeTeamId: 'home-1',
    awayTeamId: 'away-1',
    boxScore: null,
    boxScoreUpdatedAt: new Date(),
    ...overrides,
  };
}

const MINUTES_AGO = (n: number) => new Date(Date.now() - n * 60 * 1000);

function rawBoxScore() {
  return [
    {
      team: { id: 'home-1', name: 'Liverpool', logo: 'home.png' },
      players: [
        {
          id: 10,
          name: 'Salah',
          shirtNumber: '11',
          position: 'Forward',
          isSubstitute: false,
          minutesPlayed: 90,
          matchRating: '8.2',
          statistics: { expectedGoals: 0.89, expectedAssists: '0.10', goals: 1 },
        },
        {
          id: 11,
          name: 'Bench',
          shirtNumber: 30,
          position: 'Goalkeeper',
          isSubstitute: true,
          minutesPlayed: 0,
          matchRating: '',
          statistics: { expectedGoals: null },
        },
      ],
    },
    {
      team: { id: 'away-1', name: 'Chelsea', logo: null },
      players: [
        {
          id: 20,
          name: 'Palmer',
          shirtNumber: 10,
          position: 'Midfield',
          isSubstitute: false,
          minutesPlayed: 90,
          matchRating: '6.4',
          statistics: { expectedGoals: '0.25' },
        },
      ],
    },
  ];
}

describe('SportsService.getMatchBoxScore', () => {
  it('projects per-player rating and xG, with team xG as the sum of the players that carry one', async () => {
    const prisma = buildPrismaMock();
    (prisma.matchData.findUnique as jest.Mock).mockResolvedValue(matchRow({ boxScore: rawBoxScore() }));
    const service = new SportsService(prisma, buildClientMock(), buildLockMock(true), buildConfig());

    const result = await service.getMatchBoxScore('match-1');

    expect(result.home?.team).toEqual({ id: 'home-1', name: 'Liverpool', logo: 'home.png' });
    expect(result.home?.expectedGoals).toBeCloseTo(0.89);
    expect(result.home?.players[0]).toEqual({
      id: '10',
      name: 'Salah',
      shirtNumber: 11,
      position: 'Forward',
      isSubstitute: false,
      minutesPlayed: 90,
      rating: 8.2,
      expectedGoals: 0.89,
      expectedAssists: 0.1,
    });
    expect(result.away?.expectedGoals).toBeCloseTo(0.25);
  });

  it('keeps a missing rating or xG as null, never 0, and treats an empty rating string as null', async () => {
    const prisma = buildPrismaMock();
    (prisma.matchData.findUnique as jest.Mock).mockResolvedValue(matchRow({ boxScore: rawBoxScore() }));
    const service = new SportsService(prisma, buildClientMock(), buildLockMock(true), buildConfig());

    const bench = (await service.getMatchBoxScore('match-1')).home?.players[1];

    expect(bench?.rating).toBeNull();
    expect(bench?.expectedGoals).toBeNull();
    expect(bench?.expectedAssists).toBeNull();
  });

  it('reports team xG as null when no player on that side carries an xG value', async () => {
    const prisma = buildPrismaMock();
    const raw = rawBoxScore();
    raw[1].players[0].statistics = { expectedGoals: null };
    (prisma.matchData.findUnique as jest.Mock).mockResolvedValue(matchRow({ boxScore: raw }));
    const service = new SportsService(prisma, buildClientMock(), buildLockMock(true), buildConfig());

    expect((await service.getMatchBoxScore('match-1')).away?.expectedGoals).toBeNull();
  });

  it('marks playerRatings and expectedGoals available once cached players carry them, and no_data when the cached box score is empty', async () => {
    const withPrisma = buildPrismaMock();
    (withPrisma.matchData.findUnique as jest.Mock).mockResolvedValue(matchRow({ boxScore: rawBoxScore() }));
    const withData = await new SportsService(withPrisma, buildClientMock(), buildLockMock(true), buildConfig()).getMatchBoxScore('match-1');
    expect(withData.availability).toEqual({ playerRatings: 'available', expectedGoals: 'available' });

    const emptyPrisma = buildPrismaMock();
    (emptyPrisma.matchData.findUnique as jest.Mock).mockResolvedValue(matchRow({ boxScore: [] }));
    const empty = await new SportsService(emptyPrisma, buildClientMock(), buildLockMock(true), buildConfig()).getMatchBoxScore('match-1');
    expect(empty.availability).toEqual({ playerRatings: 'no_data', expectedGoals: 'no_data' });
    expect(empty.home).toBeNull();
    expect(empty.away).toBeNull();
  });

  it('serves the cached box score without a vendor call while fresh', async () => {
    const prisma = buildPrismaMock();
    (prisma.matchData.findUnique as jest.Mock).mockResolvedValue(matchRow({ boxScore: rawBoxScore() }));
    const client = buildClientMock();
    const lock = buildLockMock(true);
    const service = new SportsService(prisma, client, lock, buildConfig());

    await service.getMatchBoxScore('match-1');

    expect(lock.tryAcquire).not.toHaveBeenCalled();
    expect(client.getMatchBoxScore).not.toHaveBeenCalled();
  });

  it('refreshes a live match after the 5-minute live box-score TTL, persisting the raw document', async () => {
    const prisma = buildPrismaMock();
    (prisma.matchData.findUnique as jest.Mock).mockResolvedValue(matchRow({ status: 'live', boxScore: [], boxScoreUpdatedAt: MINUTES_AGO(6) }));
    (prisma.matchData.update as jest.Mock).mockResolvedValue(matchRow({ status: 'live', boxScore: rawBoxScore() }));
    const client = buildClientMock();
    (client.getMatchBoxScore as jest.Mock).mockResolvedValue(rawBoxScore());
    const lock = buildLockMock(true);
    const service = new SportsService(prisma, client, lock, buildConfig());

    await service.getMatchBoxScore('match-1');

    expect(lock.tryAcquire).toHaveBeenCalledWith('sports:refresh:match:match-1:boxscore', 300);
    expect(client.getMatchBoxScore).toHaveBeenCalledWith('match-1');
    expect(prisma.matchData.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ boxScore: rawBoxScore() }) }));
  });

  it('honours SPORTS_BOX_SCORE_LIVE_CACHE_TTL_SECONDS over the default live TTL', async () => {
    const prisma = buildPrismaMock();
    (prisma.matchData.findUnique as jest.Mock).mockResolvedValue(matchRow({ status: 'live', boxScore: [], boxScoreUpdatedAt: MINUTES_AGO(6) }));
    const lock = buildLockMock(true);
    const client = buildClientMock();
    (client.getMatchBoxScore as jest.Mock).mockResolvedValue([]);
    const service = new SportsService(prisma, client, lock, buildConfig({ SPORTS_BOX_SCORE_LIVE_CACHE_TTL_SECONDS: 600 }));

    await service.getMatchBoxScore('match-1');

    // 6 minutes old is past the 5-minute default but inside a configured 10-minute TTL, so no refresh.
    expect(lock.tryAcquire).not.toHaveBeenCalled();
    expect(client.getMatchBoxScore).not.toHaveBeenCalled();
  });

  it('does not refresh when another request already holds the lock, and serves the stored row', async () => {
    const prisma = buildPrismaMock();
    (prisma.matchData.findUnique as jest.Mock).mockResolvedValue(matchRow({ status: 'live', boxScore: rawBoxScore(), boxScoreUpdatedAt: MINUTES_AGO(6) }));
    const client = buildClientMock();
    const service = new SportsService(prisma, client, buildLockMock(false), buildConfig());

    const result = await service.getMatchBoxScore('match-1');

    expect(client.getMatchBoxScore).not.toHaveBeenCalled();
    expect(result.home?.players).toHaveLength(2);
  });

  it('serves the stored box score when the upstream refresh fails, rather than failing the request', async () => {
    const prisma = buildPrismaMock();
    (prisma.matchData.findUnique as jest.Mock).mockResolvedValue(matchRow({ status: 'live', boxScore: rawBoxScore(), boxScoreUpdatedAt: MINUTES_AGO(6) }));
    const client = buildClientMock();
    (client.getMatchBoxScore as jest.Mock).mockRejectedValue(new SportsDataUpstreamError('budget exhausted'));
    const service = new SportsService(prisma, client, buildLockMock(true), buildConfig());

    const result = await service.getMatchBoxScore('match-1');

    expect(result.home?.players[0].rating).toBe(8.2);
  });

  it('no longer reports ratings or xG on the match statistics availability signal', async () => {
    const prisma = buildPrismaMock();
    (prisma.matchData.findUnique as jest.Mock).mockResolvedValue(matchRow({ statistics: [], statisticsUpdatedAt: new Date() }));
    const service = new SportsService(prisma, buildClientMock(), buildLockMock(true), buildConfig());

    const { availability } = await service.getMatchStatistics('match-1');

    expect(availability).not.toHaveProperty('playerRatings');
    expect(availability).not.toHaveProperty('expectedGoals');
  });
});
