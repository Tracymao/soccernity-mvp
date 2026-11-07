import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { SportsDataClient } from '../../sports-data/sports-data-client';
import { SportsRefreshLock } from '../../sports-data/sports-refresh-lock';
import { SportsService } from './sports.service';

// B-070 (Decision Log #472): the per-caller `kickoffAlert` flag on the three match reads.
function buildPrisma(subscribedRefs: string[], rows: Array<Record<string, unknown>>) {
  const matchSubscription = {
    findMany: jest.fn().mockImplementation(async ({ where }: { where: { userId: string; externalRef: { in: string[] } } }) =>
      subscribedRefs.filter((r) => where.externalRef.in.includes(r)).map((externalRef) => ({ externalRef })),
    ),
  };
  return {
    prisma: {
      matchData: {
        findUnique: jest.fn().mockImplementation(async ({ where }: { where: { externalRef: string } }) =>
          rows.find((r) => r.externalRef === where.externalRef) ?? null,
        ),
        findMany: jest.fn().mockResolvedValue(rows),
        upsert: jest.fn(),
      },
      matchSubscription,
    } as unknown as PrismaService,
    matchSubscription,
  };
}

function row(externalRef: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `row-${externalRef}`,
    externalRef,
    competition: 'Premier League',
    teams: ['A', 'B'],
    score: null,
    status: 'scheduled',
    statusDetail: null,
    kickoffTime: new Date('2026-09-16T15:00:00.000Z'),
    leagueId: '133',
    leagueName: 'Premier League',
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
    updatedAt: new Date(),
    ...overrides,
  };
}

function build(subscribedRefs: string[], rows: Array<Record<string, unknown>>) {
  const { prisma, matchSubscription } = buildPrisma(subscribedRefs, rows);
  const client = { getMatches: jest.fn().mockResolvedValue({ items: [], totalCount: 0 }), getMatchById: jest.fn() } as unknown as SportsDataClient;
  const lock = { tryAcquire: jest.fn().mockResolvedValue(false) } as unknown as SportsRefreshLock;
  const config = { get: () => undefined } as unknown as ConfigService;
  return { service: new SportsService(prisma, client, lock, config), matchSubscription };
}

const ROWS = [row('m1'), row('m2'), row('m3', { status: 'live' })];

describe('SportsService kickoffAlert flag', () => {
  describe.each([
    ['listFixtures', (s: SportsService, viewer?: string) => s.listFixtures({ date: '2026-09-16' } as never, viewer)],
    ['listLiveScores', (s: SportsService, viewer?: string) => s.listLiveScores({} as never, viewer)],
  ])('%s', (_name, call) => {
    it('is true for the matches the signed-in caller subscribed to and false for the rest', async () => {
      const { service } = build(['m1', 'm3'], ROWS);
      const page = await call(service, 'user-1');
      expect(page.items.map((i) => [i.id, i.kickoffAlert])).toEqual([
        ['m1', true],
        ['m2', false],
        ['m3', true],
      ]);
    });

    it('is false on every item for a signed-in caller with no subscription, via ONE batched lookup', async () => {
      const { service, matchSubscription } = build([], ROWS);
      const page = await call(service, 'user-1');
      expect(page.items.every((i) => i.kickoffAlert === false)).toBe(true);
      expect(matchSubscription.findMany).toHaveBeenCalledTimes(1);
      expect(matchSubscription.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', externalRef: { in: ['m1', 'm2', 'm3'] } },
        select: { externalRef: true },
      });
    });

    it('is false on every item for a logged-out caller and never queries subscriptions', async () => {
      const { service, matchSubscription } = build(['m1'], ROWS);
      const page = await call(service, undefined);
      expect(page.items.every((i) => i.kickoffAlert === false)).toBe(true);
      expect(matchSubscription.findMany).not.toHaveBeenCalled();
    });

    it('scopes the lookup to the caller, so another person subscription never shows', async () => {
      const { service, matchSubscription } = build(['m1'], ROWS);
      await call(service, 'user-2');
      expect(matchSubscription.findMany.mock.calls[0][0].where.userId).toBe('user-2');
    });
  });

  it('an empty page needs no lookup', async () => {
    const { service, matchSubscription } = build(['m1'], []);
    const page = await service.listFixtures({ date: '2026-09-16' } as never, 'user-1');
    expect(page.items).toEqual([]);
    expect(matchSubscription.findMany).not.toHaveBeenCalled();
  });

  describe('getMatchById', () => {
    it('is true for a subscribed caller, false for a caller without one', async () => {
      const { service } = build(['m1'], ROWS);
      expect((await service.getMatchById('m1', 'user-1')).kickoffAlert).toBe(true);
      expect((await service.getMatchById('m2', 'user-1')).kickoffAlert).toBe(false);
    });

    it('is false for a logged-out caller and never queries subscriptions', async () => {
      const { service, matchSubscription } = build(['m1'], ROWS);
      expect((await service.getMatchById('m1')).kickoffAlert).toBe(false);
      expect(matchSubscription.findMany).not.toHaveBeenCalled();
    });
  });

  it('two callers on the same page get their own flags (nothing is shared between requests)', async () => {
    const { service } = build(['m1'], ROWS);
    const a = await service.listFixtures({ date: '2026-09-16' } as never, 'user-1');
    const b = await service.listFixtures({ date: '2026-09-16' } as never, undefined);
    expect(a.items[0].kickoffAlert).toBe(true);
    expect(b.items[0].kickoffAlert).toBe(false);
  });
});
