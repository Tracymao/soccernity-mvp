import { POST_MEDIA_ALL_APPROVED } from '../post-media/post-media-visibility.util';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CONTEST_ELIGIBLE_USER } from './contest-eligibility';
import { CONTEST_EXPOSURE_NOT_LIVE_CODE, ContestExposureService } from './contest-exposure.service';

// B-092. The contest month is November 2026 (GMT): reveal 2026-11-25T00:00Z, month end 2026-12-01T00:00Z.
const LIVE = new Date('2026-11-26T12:00:00Z');
const BEFORE_REVEAL = new Date('2026-11-24T23:59:59.999Z');
const AT_REVEAL = new Date('2026-11-25T00:00:00.000Z');
const LAST_LIVE_INSTANT = new Date('2026-11-30T23:59:59.999Z');
const MONTH_END = new Date('2026-12-01T00:00:00.000Z');

const VIEWER = 'viewer-1';
const EVENT = { eventId: '22222222-2222-4222-8222-222222222222', visibleRatio: 0.5, visibleMs: 1000 };

const entry = (id: string, userId: string, name = id) => ({
  id,
  postId: `post-${id}`,
  userId,
  user: { username: name, displayName: `Real ${name}` },
  post: { id: `post-${id}`, contentText: `text ${id}`, mediaUrls: [`https://cdn.example.com/${id}.mp4`], createdAt: new Date('2026-11-23T10:00:00Z') },
});

function build(overrides: { cycle?: object | null; viewer?: object | null } = {}) {
  const tx: Record<string, unknown> = {};
  const prisma = {
    contestCycle: {
      findUnique: jest.fn().mockResolvedValue(
        overrides.cycle === undefined
          ? { id: 'cycle-1', exposureTolerancePercent: 10, exposureViewerDailyCap: 3, rounds: [{ id: 'round-4' }] }
          : overrides.cycle,
      ),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue(overrides.viewer === undefined ? { isMinor: false, guardian: null } : overrides.viewer),
      findMany: jest.fn().mockResolvedValue([]),
    },
    contestEntry: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
    contestImpression: {
      groupBy: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({}),
    },
    block: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
    $executeRaw: jest.fn().mockResolvedValue(1),
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (cb: (t: unknown) => unknown) => cb(prisma));
  void tx;
  const service = new ContestExposureService(prisma as unknown as PrismaService, { now: () => LIVE });
  return { service, prisma };
}

describe('ContestExposureService.getCarousel', () => {
  it('is not live before the reveal, at the reveal it is, and on the last instant it is, at the month end it is not', async () => {
    for (const [at, expectedLive] of [
      [BEFORE_REVEAL, false],
      [AT_REVEAL, true],
      [LAST_LIVE_INSTANT, true],
      [MONTH_END, false],
    ] as const) {
      const { service, prisma } = build();
      prisma.contestEntry.findMany.mockResolvedValue([entry('e1', 'u1')]);
      const res = await service.getCarousel(VIEWER, 6, at);
      expect(res.live).toBe(expectedLive);
      if (!expectedLive) expect(res.items).toEqual([]);
    }
  });

  it('does not touch the entries at all outside the window', async () => {
    const { service, prisma } = build();
    await service.getCarousel(VIEWER, 6, BEFORE_REVEAL);
    expect(prisma.contestEntry.findMany).not.toHaveBeenCalled();
    expect(prisma.contestCycle.findUnique).not.toHaveBeenCalled();
  });

  it('is not live when there is no cycle for the month or no week-4 round', async () => {
    expect((await build({ cycle: null }).service.getCarousel(VIEWER, 6, LIVE)).live).toBe(false);
    const noRound = { id: 'c', exposureTolerancePercent: 10, exposureViewerDailyCap: 3, rounds: [] };
    expect((await build({ cycle: noRound }).service.getCarousel(VIEWER, 6, LIVE)).live).toBe(false);
  });

  it('gives a restricted viewer no module (live: false) and reads no entries', async () => {
    const { service, prisma } = build({ viewer: { isMinor: true, guardian: { consentStatus: 'pending' } } });
    expect(await service.getCarousel(VIEWER, 6, LIVE)).toEqual({ live: false, items: [] });
    expect(prisma.contestEntry.findMany).not.toHaveBeenCalled();
  });

  it('serves a confirmed minor and an adult', async () => {
    const { service, prisma } = build({ viewer: { isMinor: true, guardian: { consentStatus: 'confirmed' } } });
    prisma.contestEntry.findMany.mockResolvedValue([entry('e1', 'u1')]);
    expect((await service.getCarousel(VIEWER, 6, LIVE)).items).toHaveLength(1);
  });

  it('reads only revealed week-4 videos of eligible authors, from the cycle in the current month', async () => {
    const { service, prisma } = build();
    prisma.contestEntry.findMany.mockResolvedValue([entry('e1', 'u1')]);
    await service.getCarousel(VIEWER, 6, LIVE);
    expect(prisma.contestCycle.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { monthKey: '2026-11' } }));
    const where = prisma.contestEntry.findMany.mock.calls[0][0].where;
    expect(where.roundId).toBe('round-4');
    expect(where.user).toEqual({ is: CONTEST_ELIGIBLE_USER });
    // Revealed AND every uploaded file approved (Decision Log #419).
    expect(where.post.is.AND[0].OR).toEqual([{ visibleFrom: null }, { visibleFrom: { lte: LIVE } }]);
    expect(where.post.is.AND[1]).toEqual(POST_MEDIA_ALL_APPROVED);
  });

  it('never returns the viewer’s own entry and never a blocked pair’s entry (either direction)', async () => {
    const { service, prisma } = build();
    prisma.contestEntry.findMany.mockResolvedValue([
      entry('own', VIEWER),
      entry('blocked-by-me', 'u2'),
      entry('blocked-me', 'u3'),
      entry('ok', 'u4'),
    ]);
    prisma.block.findMany.mockResolvedValue([
      { blockerId: VIEWER, blockedId: 'u2' },
      { blockerId: 'u3', blockedId: VIEWER },
    ]);
    const res = await service.getCarousel(VIEWER, 9, LIVE);
    expect(res.items.map((i) => i.entryId)).toEqual(['ok']);
  });

  it('drops a video this viewer has already seen the cap (3) times today, and enforces the cycle’s own cap', async () => {
    const { service, prisma } = build();
    prisma.contestEntry.findMany.mockResolvedValue([entry('a', 'u1'), entry('b', 'u2')]);
    // total impressions: empty; today: a x3 (cap reached), b x2 (still below)
    prisma.contestImpression.groupBy.mockImplementation(async (args: { where: { viewerId?: string } }) =>
      args.where.viewerId ? [{ entryId: 'a', _count: { _all: 3 } }, { entryId: 'b', _count: { _all: 2 } }] : [],
    );
    expect((await service.getCarousel(VIEWER, 9, LIVE)).items.map((i) => i.entryId)).toEqual(['b']);

    const strict = build({ cycle: { id: 'cycle-1', exposureTolerancePercent: 10, exposureViewerDailyCap: 2, rounds: [{ id: 'round-4' }] } });
    strict.prisma.contestEntry.findMany.mockResolvedValue([entry('a', 'u1'), entry('b', 'u2')]);
    strict.prisma.contestImpression.groupBy.mockImplementation(async (args: { where: { viewerId?: string } }) =>
      args.where.viewerId ? [{ entryId: 'a', _count: { _all: 3 } }, { entryId: 'b', _count: { _all: 2 } }] : [],
    );
    expect((await strict.service.getCarousel(VIEWER, 9, LIVE)).items).toEqual([]);
  });

  it('counts the cap for the viewer and the London day only', async () => {
    const { service, prisma } = build();
    prisma.contestEntry.findMany.mockResolvedValue([entry('a', 'u1')]);
    await service.getCarousel(VIEWER, 6, new Date('2026-11-26T12:00:00Z'));
    const perViewerCall = prisma.contestImpression.groupBy.mock.calls.find((c) => c[0].where.viewerId)!;
    expect(perViewerCall[0].where).toMatchObject({ viewerId: VIEWER, dayKey: '2026-11-26' });
  });

  it('serves the least-seen video first, the furthest ahead last, whatever the input order', async () => {
    const { service, prisma } = build();
    prisma.contestEntry.findMany.mockResolvedValue([entry('hi', 'u1'), entry('mid', 'u2'), entry('lo', 'u3')]);
    prisma.contestImpression.groupBy.mockImplementation(async (args: { where: { viewerId?: string } }) =>
      args.where.viewerId
        ? []
        : [
            { entryId: 'hi', _count: { _all: 30 } },
            { entryId: 'mid', _count: { _all: 10 } },
            { entryId: 'lo', _count: { _all: 2 } },
          ],
    );
    // mean 14, width 1.4: three separate bands
    const res = await service.getCarousel(VIEWER, 9, LIVE);
    expect(res.items.map((i) => i.entryId)).toEqual(['lo', 'mid', 'hi']);
  });

  it('the mean is taken over ALL live finalists, not only this viewer’s candidates', async () => {
    const { service, prisma } = build();
    // own entry has a huge count; if it were left out of the mean, mid and lo (4, 5) would be one band
    prisma.contestEntry.findMany.mockResolvedValue([entry('own', VIEWER), entry('lo', 'u1'), entry('mid', 'u2')]);
    prisma.contestImpression.groupBy.mockImplementation(async (args: { where: { viewerId?: string } }) =>
      args.where.viewerId
        ? []
        : [
            { entryId: 'own', _count: { _all: 100 } },
            { entryId: 'lo', _count: { _all: 4 } },
            { entryId: 'mid', _count: { _all: 5 } },
          ],
    );
    // mean = 109/3 = 36.33, width 3.63: 4 and 5 are within it, so BOTH orders must occur across viewers
    const firsts = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const res = await service.getCarousel(`viewer-${i}`, 9, LIVE);
      firsts.add(res.items[0].entryId);
    }
    expect(firsts).toEqual(new Set(['lo', 'mid']));
  });

  it('is stable for one viewer on one day and varies between viewers', async () => {
    const mk = async (viewer: string, at: Date) => {
      const { service, prisma } = build();
      prisma.contestEntry.findMany.mockResolvedValue(['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) => entry(id, `u${i}`)));
      return (await service.getCarousel(viewer, 9, at)).items.map((i) => i.entryId).join('');
    };
    expect(await mk('viewer-1', LIVE)).toBe(await mk('viewer-1', new Date('2026-11-26T20:00:00Z')));
    const across = new Set<string>();
    for (let i = 0; i < 12; i++) across.add(await mk(`viewer-${i}`, LIVE));
    expect(across.size).toBeGreaterThan(5);
  });

  it('honours the limit', async () => {
    const { service, prisma } = build();
    prisma.contestEntry.findMany.mockResolvedValue(['a', 'b', 'c', 'd', 'e'].map((id, i) => entry(id, `u${i}`)));
    expect((await service.getCarousel(VIEWER, 3, LIVE)).items).toHaveLength(3);
  });

  it('a tile carries no count of any kind and no real name', async () => {
    const { service, prisma } = build();
    prisma.contestEntry.findMany.mockResolvedValue([entry('e1', 'u1', 'nelson')]);
    prisma.contestImpression.groupBy.mockImplementation(async (args: { where: { viewerId?: string } }) =>
      args.where.viewerId ? [] : [{ entryId: 'e1', _count: { _all: 7 } }],
    );
    const res = await service.getCarousel(VIEWER, 6, LIVE);
    expect(Object.keys(res.items[0]).sort()).toEqual(['entryId', 'finalist', 'post', 'postId']);
    expect(Object.keys(res.items[0].post).sort()).toEqual(['contentText', 'createdAt', 'id', 'mediaUrls']);
    expect(res.items[0].finalist).toEqual({ userId: 'u1', publicName: 'nelson' });
    expect(JSON.stringify(res)).not.toMatch(/Real nelson|impression|\b7\b/);
  });

  it('an empty field is live with no items', async () => {
    const { service } = build();
    expect(await service.getCarousel(VIEWER, 6, LIVE)).toEqual({ live: true, items: [] });
  });
});

describe('ContestExposureService.recordImpression', () => {
  const eligibleEntry = { id: 'e1', userId: 'finalist-1' };

  it('refuses with the not-live 409 outside the window (before the reveal and at the month end)', async () => {
    for (const at of [BEFORE_REVEAL, MONTH_END]) {
      const { service, prisma } = build();
      await expect(service.recordImpression(VIEWER, 'e1', EVENT, at)).rejects.toMatchObject({
        response: { code: CONTEST_EXPOSURE_NOT_LIVE_CODE },
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    }
    await expect(build().service.recordImpression(VIEWER, 'e1', EVENT, BEFORE_REVEAL)).rejects.toBeInstanceOf(ConflictException);
  });

  it('a hidden, unknown, non-final or ineligible entry is a 404 and writes nothing', async () => {
    const { service, prisma } = build();
    prisma.contestEntry.findFirst.mockResolvedValue(null);
    await expect(service.recordImpression(VIEWER, 'e1', EVENT, LIVE)).rejects.toBeInstanceOf(NotFoundException);
    const where = prisma.contestEntry.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ id: 'e1', roundId: 'round-4', user: { is: CONTEST_ELIGIBLE_USER } });
    // Revealed AND every uploaded file approved (Decision Log #419).
    expect(where.post.is.AND[0].OR).toEqual([{ visibleFrom: null }, { visibleFrom: { lte: LIVE } }]);
    expect(where.post.is.AND[1]).toEqual(POST_MEDIA_ALL_APPROVED);
    expect(prisma.contestImpression.create).not.toHaveBeenCalled();
  });

  it('a blocked pair gets the SAME 404 as an unknown entry (nothing reveals the entry exists)', async () => {
    const unknown = build();
    unknown.prisma.contestEntry.findFirst.mockResolvedValue(null);
    const blocked = build();
    blocked.prisma.contestEntry.findFirst.mockResolvedValue(eligibleEntry);
    blocked.prisma.block.findFirst.mockResolvedValue({ id: 'b1' });
    const a = await unknown.service.recordImpression(VIEWER, 'e1', EVENT, LIVE).catch((e) => e);
    const b = await blocked.service.recordImpression(VIEWER, 'e1', EVENT, LIVE).catch((e) => e);
    expect(b).toBeInstanceOf(NotFoundException);
    expect(b.getResponse()).toEqual(a.getResponse());
    expect(blocked.prisma.contestImpression.create).not.toHaveBeenCalled();
  });

  it('the finalist looking at their own video is not an impression', async () => {
    const { service, prisma } = build();
    prisma.contestEntry.findFirst.mockResolvedValue({ id: 'e1', userId: VIEWER });
    expect(await service.recordImpression(VIEWER, 'e1', EVENT, LIVE)).toEqual({ counted: false });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.block.findFirst).not.toHaveBeenCalled();
  });

  it('counts a qualifying event: takes the advisory lock first, then stores exactly the narrow row', async () => {
    const { service, prisma } = build();
    prisma.contestEntry.findFirst.mockResolvedValue(eligibleEntry);
    expect(await service.recordImpression(VIEWER, 'e1', EVENT, LIVE)).toEqual({ counted: true });
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(prisma.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(prisma.contestImpression.create.mock.invocationCallOrder[0]);
    // the stored row: viewer, entry, event, London day, instant -- and nothing else (no ratio, no ms)
    expect(prisma.contestImpression.create).toHaveBeenCalledWith({
      data: { entryId: 'e1', viewerId: VIEWER, eventId: EVENT.eventId, dayKey: '2026-11-26', occurredAt: LIVE },
    });
  });

  it('is idempotent per (viewer, entry, event): a replay counts true without a second row', async () => {
    const { service, prisma } = build();
    prisma.contestEntry.findFirst.mockResolvedValue(eligibleEntry);
    prisma.contestImpression.findUnique.mockResolvedValue({ id: 'i1' });
    expect(await service.recordImpression(VIEWER, 'e1', EVENT, LIVE)).toEqual({ counted: true });
    expect(prisma.contestImpression.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { viewerId_entryId_eventId: { viewerId: VIEWER, entryId: 'e1', eventId: EVENT.eventId } } }),
    );
    expect(prisma.contestImpression.create).not.toHaveBeenCalled();
    expect(prisma.contestImpression.count).not.toHaveBeenCalled();
  });

  it('a replay is idempotent even after the cap is reached (the existing row wins over the cap check)', async () => {
    const { service, prisma } = build();
    prisma.contestEntry.findFirst.mockResolvedValue(eligibleEntry);
    prisma.contestImpression.findUnique.mockResolvedValue({ id: 'i1' });
    prisma.contestImpression.count.mockResolvedValue(3);
    expect(await service.recordImpression(VIEWER, 'e1', EVENT, LIVE)).toEqual({ counted: true });
  });

  it('enforces the per-viewer daily cap from the cycle: at the cap a new event is not counted', async () => {
    const { service, prisma } = build();
    prisma.contestEntry.findFirst.mockResolvedValue(eligibleEntry);
    prisma.contestImpression.count.mockResolvedValue(3);
    expect(await service.recordImpression(VIEWER, 'e1', EVENT, LIVE)).toEqual({ counted: false });
    expect(prisma.contestImpression.count).toHaveBeenCalledWith({ where: { viewerId: VIEWER, entryId: 'e1', dayKey: '2026-11-26' } });
    expect(prisma.contestImpression.create).not.toHaveBeenCalled();

    prisma.contestImpression.count.mockResolvedValue(2);
    expect(await service.recordImpression(VIEWER, 'e1', EVENT, LIVE)).toEqual({ counted: true });
  });

  it('uses the cycle’s own cap, not a hardcoded 3', async () => {
    const { service, prisma } = build({
      cycle: { id: 'cycle-1', exposureTolerancePercent: 10, exposureViewerDailyCap: 1, rounds: [{ id: 'round-4' }] },
    });
    prisma.contestEntry.findFirst.mockResolvedValue(eligibleEntry);
    prisma.contestImpression.count.mockResolvedValue(1);
    expect(await service.recordImpression(VIEWER, 'e1', EVENT, LIVE)).toEqual({ counted: false });
  });

  it('the cap resets on the next London day (the cap window is the London calendar day)', async () => {
    const { service, prisma } = build();
    prisma.contestEntry.findFirst.mockResolvedValue(eligibleEntry);
    prisma.contestImpression.count.mockResolvedValue(0);
    await service.recordImpression(VIEWER, 'e1', EVENT, new Date('2026-11-27T00:00:01Z'));
    expect(prisma.contestImpression.count).toHaveBeenCalledWith({ where: { viewerId: VIEWER, entryId: 'e1', dayKey: '2026-11-27' } });
  });

  it('a unique violation on the idempotency key still means "counted"', async () => {
    const { service, prisma } = build();
    prisma.contestEntry.findFirst.mockResolvedValue(eligibleEntry);
    prisma.contestImpression.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
    );
    expect(await service.recordImpression(VIEWER, 'e1', EVENT, LIVE)).toEqual({ counted: true });
  });

  it('rethrows any other database error', async () => {
    const { service, prisma } = build();
    prisma.contestEntry.findFirst.mockResolvedValue(eligibleEntry);
    prisma.contestImpression.create.mockRejectedValue(new Error('boom'));
    await expect(service.recordImpression(VIEWER, 'e1', EVENT, LIVE)).rejects.toThrow('boom');
  });
});

describe('ContestExposureService.getAdminExposure', () => {
  const cycleRow = (over: object = {}) => ({
    id: 'cycle-1',
    title: 'November Challenge',
    monthKey: '2026-11',
    status: 'final',
    exposureTolerancePercent: 10,
    exposureViewerDailyCap: 3,
    ...over,
  });
  const entryRow = (id: string, userId: string, impressionTotal: number | null = null) => ({
    id,
    userId,
    impressionTotal,
    user: { username: id, displayName: `Real ${id}` },
  });

  it('404s an unknown cycle', async () => {
    const { service, prisma } = build();
    (prisma.contestCycle as unknown as { findUnique: jest.Mock }).findUnique.mockResolvedValue(null);
    await expect(service.getAdminExposure('nope', LIVE)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns the aggregate per finalist, the mean, the band and the flags', async () => {
    const { service, prisma } = build();
    prisma.contestCycle.findUnique.mockResolvedValue(cycleRow());
    prisma.contestEntry.findMany.mockResolvedValue([entryRow('a', 'ua'), entryRow('b', 'ub'), entryRow('c', 'uc')]);
    prisma.user.findMany.mockResolvedValue([{ id: 'ua' }, { id: 'ub' }, { id: 'uc' }]);
    prisma.contestImpression.groupBy.mockResolvedValue([
      { entryId: 'a', _count: { _all: 8 } },
      { entryId: 'b', _count: { _all: 10 } },
      { entryId: 'c', _count: { _all: 12 } },
    ]);
    const res = await service.getAdminExposure('cycle-1', LIVE);
    expect(res).toMatchObject({
      cycleId: 'cycle-1',
      live: true,
      revealed: true,
      source: 'live',
      finalistCount: 3,
      mean: 10,
      lowerBound: 9,
      upperBound: 11,
      min: 8,
      max: 12,
      outsideTolerance: 2,
      settings: { tolerancePercent: 10, viewerDailyCap: 3 },
    });
    expect(res.entries.map((e) => [e.entryId, e.impressions, e.status])).toEqual([
      ['a', 8, 'below'],
      ['b', 10, 'within'],
      ['c', 12, 'above'],
    ]);
  });

  it('contains NO per-viewer data: the query never groups or selects by viewer and no field can carry one', async () => {
    const { service, prisma } = build();
    prisma.contestCycle.findUnique.mockResolvedValue(cycleRow());
    prisma.contestEntry.findMany.mockResolvedValue([entryRow('a', 'ua')]);
    prisma.user.findMany.mockResolvedValue([{ id: 'ua' }]);
    prisma.contestImpression.groupBy.mockResolvedValue([{ entryId: 'a', _count: { _all: 4 } }]);
    const res = await service.getAdminExposure('cycle-1', LIVE);
    expect(prisma.contestImpression.groupBy).toHaveBeenCalledWith(expect.objectContaining({ by: ['entryId'] }));
    expect(JSON.stringify(res)).not.toMatch(/viewer(?!DailyCap)|eventId|dayKey|Real a/i);
  });

  it('after the crown reads the folded totals, not the (deleted) per-viewer rows', async () => {
    const { service, prisma } = build();
    prisma.contestCycle.findUnique.mockResolvedValue(cycleRow({ status: 'completed' }));
    prisma.contestEntry.findMany.mockResolvedValue([entryRow('a', 'ua', 5), entryRow('b', 'ub', 5)]);
    prisma.user.findMany.mockResolvedValue([{ id: 'ua' }, { id: 'ub' }]);
    const res = await service.getAdminExposure('cycle-1', new Date('2026-12-02T10:00:00Z'));
    expect(res.source).toBe('final_totals');
    expect(res.live).toBe(false);
    expect(res.mean).toBe(5);
    expect(prisma.contestImpression.groupBy).not.toHaveBeenCalled();
  });

  it('is not live and shows zero before the reveal', async () => {
    const { service, prisma } = build();
    prisma.contestCycle.findUnique.mockResolvedValue(cycleRow({ status: 'active' }));
    prisma.contestEntry.findMany.mockResolvedValue([entryRow('a', 'ua')]);
    prisma.user.findMany.mockResolvedValue([{ id: 'ua' }]);
    const res = await service.getAdminExposure('cycle-1', new Date('2026-11-24T10:00:00Z'));
    expect(res).toMatchObject({ live: false, revealed: false, mean: 0, outsideTolerance: 0 });
  });

  it('lists an ineligible finalist as out of the rotation and out of the mean', async () => {
    const { service, prisma } = build();
    prisma.contestCycle.findUnique.mockResolvedValue(cycleRow());
    prisma.contestEntry.findMany.mockResolvedValue([entryRow('a', 'ua'), entryRow('gone', 'ug')]);
    prisma.user.findMany.mockResolvedValue([{ id: 'ua' }]);
    prisma.contestImpression.groupBy.mockResolvedValue([
      { entryId: 'a', _count: { _all: 6 } },
      { entryId: 'gone', _count: { _all: 40 } },
    ]);
    const res = await service.getAdminExposure('cycle-1', LIVE);
    expect(res.mean).toBe(6);
    const gone = res.entries.find((e) => e.entryId === 'gone')!;
    expect(gone).toMatchObject({ inRotation: false, status: null, deviationPercent: null, impressions: 40 });
  });

  it('a legacy cycle without a monthKey has no live window and no rows', async () => {
    const { service, prisma } = build();
    prisma.contestCycle.findUnique.mockResolvedValue(cycleRow({ monthKey: null, status: 'completed' }));
    prisma.contestEntry.findMany.mockResolvedValue([]);
    const res = await service.getAdminExposure('cycle-1', LIVE);
    expect(res).toMatchObject({ live: false, revealed: false, finalistCount: 0, entries: [] });
  });
});
